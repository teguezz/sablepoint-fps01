// SABLEPOINT — bot brains. Each bot is an Actor with a controller that
// picks a site, walks an A* route, holds angles, reacts to what it sees and
// hears, and fights in bursts. Attackers push a site and plant; defenders
// hold the sites and retake. Difficulty comes from reaction time and aim
// error, never from cheating: bots see through the same line-of-sight test
// the bullets use.

import * as THREE from 'three';
import { CONFIG, TEAMS, WEAPONS } from './config.js';
import { hasLineOfSight } from './nav.js';
import { canFire } from './weapons.js';

const _tmp = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _to = new THREE.Vector3();

function rand(a, b) { return a + Math.random() * (b - a); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

export class BotController {
  constructor(actor, match, role) {
    this.actor = actor;
    this.match = match;
    this.role = role; // 'attacker' | 'defender'
    this.site = null;
    this.mode = 'advance'; // advance | hold | plant | defuse | hunt | retake
    this.path = null;
    this.pathIndex = 0;
    this.repathTimer = 0;
    this.holdSpot = null;
    this.holdTimer = 0;
    this.target = null;
    this.targetSeenFor = 0;
    this.reaction = 0;
    this.burstLeft = 0;
    this.burstTimer = 0;
    this.aimError = 0.05;
    this.strafeDir = 1;
    this.strafeTimer = 0;
    this.investigate = null;
    this.investigateTimer = 0;
    this.stuckTimer = 0;
    this.lastPos = new THREE.Vector3();
    // Skill: 0..1. Reaction 0.9s..0.35s, aim error 0.05..0.018 rad.
    this.skill = rand(0.35, 0.85);
    this.reactTime = 0.95 - this.skill * 0.6;
    this.baseError = 0.055 - this.skill * 0.038;
  }

  resetRound(site, holdSpot) {
    this.site = site;
    this.holdSpot = holdSpot;
    this.mode = this.role === 'defender' ? 'advance' : 'advance';
    this.path = null;
    this.pathIndex = 0;
    this.target = null;
    this.targetSeenFor = 0;
    this.reaction = 0;
    this.burstLeft = 0;
    this.investigate = null;
    this.stuckTimer = 0;
    this.lastPos.copy(this.actor.pos);
    this.actor.plantProgress = 0;
    this.actor.defuseProgress = 0;
    this.buyGear();
  }

  buyGear() {
    const a = this.actor;
    // Simple economy: rifle when affordable, else SMG, armour when it fits.
    if (a.money >= 2700) a.buyWeapon('rifle');
    else if (a.money >= 1500) a.buyWeapon('smg');
    else if (a.money >= 1700) a.buyWeapon('shotgun');
    if (a.money >= 650) { a.armor = 100; a.money -= 650; }
    if (a.money >= 300 && Math.random() < 0.4) { a.grenades.frag++; a.money -= 300; }
  }

  // --- perception ---------------------------------------------------------
  canSee(enemy) {
    const a = this.actor;
    if (!enemy.alive || enemy.team === a.team) return false;
    _to.subVectors(enemy.pos, a.pos);
    const dist = _to.length();
    if (dist > 46) return false;
    // Vision cone, wider up close. Smoke blocks sight outright.
    a.forwardInto(_tmp);
    const facing = (_to.x * _tmp.x + _to.z * _tmp.z) / Math.max(0.001, Math.hypot(_to.x, _to.z));
    const halfFov = dist < 6 ? 1 : 0.85;
    if (facing < Math.cos(halfFov) && dist > 6) return false;
    if (this.match.smokeBlocks(a.pos.x, a.pos.z, enemy.pos.x, enemy.pos.z)) return false;
    if (!hasLineOfSight(a.pos.x, a.pos.z, enemy.pos.x, enemy.pos.z, this.match.colliders)) return false;
    return true;
  }

  scanForTarget() {
    const enemies = this.match.actors.filter((e) => e.team !== this.actor.team && e.alive);
    let best = null, bestD = Infinity;
    for (const e of enemies) {
      if (!this.canSee(e)) continue;
      const d = this.actor.pos.distanceTo(e.pos);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  hearNoises() {
    const a = this.actor;
    for (const n of this.match.noises) {
      const d = Math.hypot(n.x - a.pos.x, n.z - a.pos.z);
      if (d < n.radius) return { x: n.x, z: n.z };
    }
    return null;
  }

  // --- movement -----------------------------------------------------------
  moveToward(tx, tz, dt, intent) {
    const a = this.actor;
    _to.set(tx - a.pos.x, 0, tz - a.pos.z);
    const dist = Math.hypot(_to.x, _to.z);
    if (dist < 0.6) return true;
    _to.multiplyScalar(1 / dist);
    // Turn toward the waypoint first, then walk.
    const wantYaw = Math.atan2(-_to.x, -_to.z);
    let dyaw = wantYaw - a.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const turn = clamp(dyaw * 8, -3.2, 3.2);
    a.yaw += turn * dt;
    const f = Math.cos(dyaw);
    intent.f = clamp(f, 0, 1);
    intent.s = clamp(-dyaw * 1.2, -0.7, 0.7);
    return false;
  }

  followPath(dt, intent) {
    if (!this.path || this.pathIndex >= this.path.length) return true;
    const wp = this.path[this.pathIndex];
    if (this.moveToward(wp.x, wp.z, dt, intent)) this.pathIndex++;
    return this.pathIndex >= this.path.length;
  }

  repathTo(tx, tz) {
    const a = this.actor;
    const p = this.match.navGrid.findPath(a.pos.x, a.pos.z, tx, tz);
    if (p && p.length > 0) {
      this.path = p;
      this.pathIndex = 0;
      return true;
    }
    return false;
  }

  // --- combat --------------------------------------------------------------
  aimAt(enemy, dt) {
    const a = this.actor;
    // Aim at the chest, sometimes the head; error shrinks as tracking holds.
    const aimY = Math.random() < 0.14 ? 1.52 : 1.22;
    _to.set(enemy.pos.x - a.pos.x, aimY - a.eyeHeight, enemy.pos.z - a.pos.z);
    const dist = _to.length();
    _to.multiplyScalar(1 / Math.max(0.001, dist));
    const wantYaw = Math.atan2(-_to.x, -_to.z);
    const wantPitch = Math.asin(clamp(_to.y, -1, 1));
    let dyaw = wantYaw - a.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const track = 6 + this.skill * 6;
    a.yaw += clamp(dyaw * track, -4, 4) * dt;
    a.pitch += clamp(wantPitch - a.pitch, -2.5, 2.5) * Math.min(1, track * dt);
    this.aimError = this.baseError * (1 + dist / 30) * (1 - Math.min(1, this.targetSeenFor) * 0.55);
  }

  combatStep(dt, now, intent) {
    const a = this.actor;
    const enemy = this.target;
    if (!enemy || !enemy.alive) { this.target = null; return; }
    this.aimAt(enemy, dt);
    // Strafe while fighting.
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeTimer = rand(0.5, 1.3);
      this.strafeDir = Math.random() < 0.5 ? -1 : 1;
    }
    intent.s = this.strafeDir * 0.55;
    intent.f = 0;
    if (this.reaction > 0) { this.reaction -= dt; return; }
    // Burst fire: 3-5 shots, then a pause.
    if (this.burstLeft <= 0) {
      if (this.burstTimer > 0) { this.burstTimer -= dt; return; }
      this.burstLeft = 3 + ((Math.random() * 3) | 0);
      this.burstTimer = rand(0.5, 1.1);
    }
    if (canFire(a.weapon, now)) {
      // Aim direction with the bot's current error.
      a.forwardInto(_dir);
      const up = Math.sin(a.pitch);
      _dir.y = up / Math.max(0.001, Math.cos(a.pitch));
      _dir.normalize();
      this.match.fireWeapon(a, _dir, now, this.aimError);
      this.burstLeft--;
    }
  }

  // --- main update ---------------------------------------------------------
  update(dt, now) {
    const a = this.actor;
    if (!a.alive) return;
    const intent = { f: 0, s: 0, crouch: false, aim: false };
    const m = this.match;

    // Reload when the magazine is dry and nothing is in front of us.
    if (a.weapon.mag === 0 && a.weapon.reserve > 0 && a.weapon.reloadingUntil <= now) {
      m.reloadWeapon(a, now);
    }

    // Perception runs every tick; it is cheap (9 bots, few enemies).
    const seen = this.scanForTarget();
    if (seen) {
      if (this.target !== seen) { this.target = seen; this.targetSeenFor = 0; this.reaction = this.reactTime; this.burstLeft = 0; }
      this.targetSeenFor += dt;
    } else if (this.target) {
      this.target = null;
      this.targetSeenFor = 0;
    }

    if (this.target) {
      this.combatStep(dt, now, intent);
      // While fighting, planting and defusing stop.
      a.plantProgress = 0;
      a.defuseProgress = 0;
    } else if (m.phase === 'buy') {
      intent.f = 0;
    } else if (m.phase === 'live') {
      this.objectiveStep(dt, now, intent);
    }

    // Stuck detection: repath when barely moving with somewhere to go.
    if (this.path && this.pathIndex < this.path.length && (intent.f !== 0 || intent.s !== 0)) {
      if (a.pos.distanceToSquared(this.lastPos) < 0.04 * dt * 60) {
        this.stuckTimer += dt;
        if (this.stuckTimer > 2.2) {
          this.stuckTimer = 0;
          const wp = this.path[this.path.length - 1];
          this.repathTo(wp.x + rand(-2, 2), wp.z + rand(-2, 2));
        }
      } else this.stuckTimer = 0;
      this.lastPos.copy(a.pos);
    }

    a.move(dt, intent, m.colliders);
  }

  objectiveStep(dt, now, intent) {
    const a = this.actor;
    const m = this.match;

    // The charge is planted: defenders retake, attackers guard it.
    if (m.charge.planted) {
      if (a.team === TEAMS.WARDEN) {
        if (a.pos.distanceTo(m.charge.pos) < 1.6) {
          // Defuse: stand still on the charge for DEFUSE_TIME seconds.
          a.defuseProgress += dt;
          if (a.defuseProgress >= CONFIG.DEFUSE_TIME) m.defuseCharge(a);
          return;
        }
        this.mode = 'retake';
        this.repathTimer -= dt;
        if (!this.path || this.repathTimer <= 0) {
          this.repathTo(m.charge.pos.x, m.charge.pos.z);
          this.repathTimer = 2.5;
        }
        this.followPath(dt, intent);
        return;
      }
      // Attackers: hold near the planted charge.
      if (a.pos.distanceTo(m.charge.pos) < 7) { this.mode = 'hold'; intent.aim = true; return; }
      this.mode = 'retake';
      this.repathTimer -= dt;
      if (!this.path || this.repathTimer <= 0) {
        this.repathTo(m.charge.pos.x + rand(-3, 3), m.charge.pos.z + rand(-3, 3));
        this.repathTimer = 2.5;
      }
      this.followPath(dt, intent);
      return;
    }

    if (this.role === 'attacker') {
      const site = m.sites[this.site];
      // The carrier plants when the site is reached and looks clear.
      if (a.hasCharge && Math.hypot(site.x - a.pos.x, site.z - a.pos.z) < site.r - 1) {
        a.plantProgress += dt;
        intent.f = 0; intent.s = 0;
        if (a.plantProgress >= CONFIG.PLANT_TIME) m.plantCharge(a, this.site);
        return;
      }
      a.plantProgress = 0;
      this.repathTimer -= dt;
      if (!this.path || this.repathTimer <= 0) {
        const gx = site.x + rand(-3, 3), gz = site.z + rand(-3, 3);
        this.repathTo(gx, gz);
        this.repathTimer = 3;
      }
      if (this.followPath(dt, intent)) {
        // Arrived: hold the site and watch the approaches.
        this.mode = 'hold';
        intent.aim = true;
        const n = this.hearNoises();
        if (n) this.investigate = n;
      }
      return;
    }

    // Defender: go to the hold spot, then watch. A noise pulls a look.
    if (this.mode === 'advance') {
      this.repathTimer -= dt;
      if (!this.path || this.repathTimer <= 0) {
        this.repathTo(this.holdSpot.x, this.holdSpot.z);
        this.repathTimer = 3;
      }
      if (this.followPath(dt, intent)) this.mode = 'hold';
      return;
    }
    // Holding: slow scan, occasional reposition to another hold spot.
    intent.aim = true;
    this.holdTimer -= dt;
    a.yaw += Math.sin(now * 0.5 + this.actor.id * 1.7) * 0.12 * dt;
    const n = this.hearNoises();
    if (n && this.investigateTimer <= 0) {
      this.investigate = n;
      this.investigateTimer = 4;
      this.mode = 'hunt';
      this.repathTo(n.x, n.z);
    }
    if (this.mode === 'hunt') {
      this.investigateTimer -= dt;
      if (this.investigateTimer <= 0 || this.followPath(dt, intent)) {
        this.mode = 'hold';
        this.path = null;
      }
    }
  }
}
