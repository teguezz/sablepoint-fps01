// SABLEPOINT — the match. The single place that owns game state: phases,
// the round timer, the economy, the charge, grenades, hit resolution and
// win conditions. Bots and the player only ever ask it to do things; it
// decides what happened and reports events for the HUD and the sounds.

import * as THREE from 'three';
import { CONFIG, TEAMS, WEAPONS, BOT_NAMES, SITE_NAMES } from './config.js';
import { Actor } from './actors.js';
import { BotController } from './bots.js';
import { hasLineOfSight, rayHitDistance } from './nav.js';
import { canFire, consumeShot, startReload, finishReload, currentSpread, damageAt, decayBloom, makeWeaponState } from './weapons.js';

const _muzzle = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _u = new THREE.Vector3();
const _v = new THREE.Vector3();
const _hit = new THREE.Vector3();

function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return Infinity;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return Infinity;
  const thc = Math.sqrt(r * r - d2);
  return tca - thc;
}

export class Match {
  constructor(scene, map, effects, sounds) {
    this.scene = scene;
    this.map = map;
    this.colliders = map.colliders;
    this.sites = map.sites;
    this.navGrid = map.navGrid;
    this.effects = effects;
    this.sounds = sounds;
    this.events = []; // drained by main.js: { type, ... }
    this.time = 0;
    this.phase = 'menu';
    this.round = 1;
    this.score = { [TEAMS.VANGUARD]: 0, [TEAMS.WARDEN]: 0 };
    this.lossStreak = { [TEAMS.VANGUARD]: 0, [TEAMS.WARDEN]: 0 };
    this.timer = 0;
    this.charge = { planted: false, site: null, pos: new THREE.Vector3(), timer: 0, beep: 0 };
    this.noises = [];
    this.grenades = [];
    this.stagingFreeze = false; // staging scenes hold the bots in place for capture
    this.actors = [];
    this.controllers = new Map();
    this.player = null;
    this.chargeCarrierId = null;
    this.roundKills = 0;
    // The planted Charge is a physical object: a dark case with a blinking
    // red lamp, so both teams can see what they are guarding or defusing.
    this.chargeMesh = new THREE.Group();
    const caseMat = new THREE.MeshStandardMaterial({ color: 0x1e1c1a, roughness: 0.6, metalness: 0.4 });
    const chargeCase = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.3), caseMat);
    chargeCase.position.y = 0.11;
    chargeCase.castShadow = true;
    this.chargeMesh.add(chargeCase);
    this.chargeLedMat = new THREE.MeshStandardMaterial({ color: 0xff2a18, emissive: 0xff2a18, emissiveIntensity: 1 });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), this.chargeLedMat);
    led.position.set(0.12, 0.26, 0);
    this.chargeMesh.add(led);
    this.chargeLight = new THREE.PointLight(0xff2a18, 0, 6, 2);
    this.chargeLight.position.y = 0.4;
    this.chargeMesh.add(this.chargeLight);
    this.chargeMesh.visible = false;
    scene.add(this.chargeMesh);

    // Build the ten actors: the player plus four Vanguard bots and five
    // Warden bots. Meshes are shared with the scene here, once.
    let id = 0;
    this.player = new Actor(id++, 'You', TEAMS.VANGUARD, true);
    this.player.buildMesh();
    scene.add(this.player.mesh);
    this.actors.push(this.player);
    for (const name of BOT_NAMES[TEAMS.VANGUARD]) {
      const a = new Actor(id++, name, TEAMS.VANGUARD, false);
      a.buildMesh();
      scene.add(a.mesh);
      this.actors.push(a);
      this.controllers.set(a.id, new BotController(a, this, 'attacker'));
    }
    for (const name of BOT_NAMES[TEAMS.WARDEN]) {
      const a = new Actor(id++, name, TEAMS.WARDEN, false);
      a.buildMesh();
      scene.add(a.mesh);
      this.actors.push(a);
      this.controllers.set(a.id, new BotController(a, this, 'defender'));
    }
  }

  // The HUD hands its spotted-enemy map here so the match can fill it.
  attachSpotting(spottedMap) {
    this._hudSpotted = spottedMap;
  }

  // --- round flow ---------------------------------------------------------
  startMatch() {
    this.score = { [TEAMS.VANGUARD]: 0, [TEAMS.WARDEN]: 0 };
    this.lossStreak = { [TEAMS.VANGUARD]: 0, [TEAMS.WARDEN]: 0 };
    this.round = 1;
    for (const a of this.actors) {
      a.money = CONFIG.START_MONEY;
      a.kills = 0; a.deaths = 0;
      a.primary = null;
      a.sidearm = makeWeaponState('pistol');
      a.current = 'sidearm';
      a.grenades = { frag: 0, smoke: 0, flash: 0 };
      a.armor = 0;
    }
    this.startRound();
  }

  startRound() {
    const vSpawns = this.map.spawns.vanguard;
    const wSpawns = this.map.spawns.warden;
    const vanguard = this.actors.filter((a) => a.team === TEAMS.VANGUARD);
    const wardens = this.actors.filter((a) => a.team === TEAMS.WARDEN);
    vanguard.forEach((a, i) => a.spawnAt(vSpawns[i % vSpawns.length]));
    wardens.forEach((a, i) => a.spawnAt(wSpawns[i % wSpawns.length]));
    for (const a of this.actors) {
      a.mesh.rotation.x = 0;
      a.mesh.position.y = 0;
    }
    // The charge goes to a random Vanguard member each round.
    const carrier = vanguard[(Math.random() * vanguard.length) | 0];
    for (const a of vanguard) a.hasCharge = false;
    carrier.hasCharge = true;
    this.chargeCarrierId = carrier.id;
    this.charge = { planted: false, site: null, pos: new THREE.Vector3(), timer: 0, beep: 0 };
    this.grenades = [];
    this.noises = [];
    this.roundKills = 0;
    // Bot assignments: carrier + one mate to the Foundry, two to the Depot;
    // defenders split two / two / one mid.
    const vBots = vanguard.filter((a) => !a.isPlayer);
    const sites = ['foundry', 'foundry', 'depot', 'depot'];
    vBots.forEach((a, i) => {
      const site = sites[i % sites.length];
      this.controllers.get(a.id).resetRound(site, null);
    });
    const wBots = wardens;
    const wHolds = [
      ['foundry', this.map.holds.foundry[0]], ['foundry', this.map.holds.foundry[1]],
      ['depot', this.map.holds.depot[0]], ['depot', this.map.holds.depot[1]],
      ['foundry', this.map.holds.mid[0]],
    ];
    wBots.forEach((a, i) => {
      const [site, hold] = wHolds[i % wHolds.length];
      this.controllers.get(a.id).resetRound(site, hold);
    });
    this.phase = 'buy';
    this.timer = CONFIG.BUY_TIME;
    for (const a of this.actors) a.frozen = true;
    this.events.push({ type: 'roundStart', round: this.round, carrier: carrier.name, carrierIsPlayer: carrier.isPlayer });
  }

  phaseLabel() {
    switch (this.phase) {
      case 'buy': return 'BUY PHASE';
      case 'live': return this.charge.planted ? 'CHARGE PLANTED' : 'ROUND LIVE';
      case 'roundEnd': return 'ROUND OVER';
      case 'matchEnd': return 'MATCH OVER';
      default: return 'SABLEPOINT';
    }
  }

  // --- combat ---------------------------------------------------------------
  fireWeapon(actor, baseDir, now, extraSpread = 0) {
    const ws = actor.weapon;
    if (!actor.alive || !canFire(ws, now)) return null;
    consumeShot(ws, now);
    actor.muzzlePosInto(_muzzle);
    const moving = actor.speed2D() > 0.6;
    const spread = currentSpread(ws, moving, actor.crouched, actor.aiming) + extraSpread;
    // Orthonormal basis around the aim direction for the spread cone.
    _dir.copy(baseDir).normalize();
    _u.set(0, 1, 0);
    if (Math.abs(_dir.y) > 0.95) _u.set(1, 0, 0);
    _u.crossVectors(_dir, _u).normalize();
    _v.crossVectors(_dir, _u);
    const result = { fired: true, hit: false, killed: false, head: false, victim: null, point: null, dist: 0 };
    for (let p = 0; p < ws.def.pellets; p++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = spread * Math.sqrt(Math.random());
      const dx = _dir.x + (_u.x * Math.cos(ang) + _v.x * Math.sin(ang)) * rad;
      const dy = _dir.y + (_u.y * Math.cos(ang) + _v.y * Math.sin(ang)) * rad;
      const dz = _dir.z + (_u.z * Math.cos(ang) + _v.z * Math.sin(ang)) * rad;
      const inv = 1 / Math.hypot(dx, dy, dz);
      const dir = { x: dx * inv, y: dy * inv, z: dz * inv };
      const wallDist = rayHitDistance(_muzzle.x, _muzzle.y, _muzzle.z, dir.x, dir.y, dir.z, this.colliders, 120);
      // Nearest actor hit: head sphere, then body sphere.
      let bestT = wallDist, bestVictim = null, bestHead = false;
      for (const other of this.actors) {
        if (other === actor || !other.alive) continue;
        const th = raySphere(_muzzle.x, _muzzle.y, _muzzle.z, dir.x, dir.y, dir.z, other.pos.x, other.pos.y + 1.52, other.pos.z, 0.24);
        if (th < bestT) { bestT = th; bestVictim = other; bestHead = true; continue; }
        const tb = raySphere(_muzzle.x, _muzzle.y, _muzzle.z, dir.x, dir.y, dir.z, other.pos.x, other.pos.y + 0.95, other.pos.z, 0.5);
        if (tb < bestT) { bestT = tb; bestVictim = other; bestHead = false; }
      }
      _hit.set(_muzzle.x + dir.x * bestT, _muzzle.y + dir.y * bestT, _muzzle.z + dir.z * bestT);
      this.effects.tracer(_muzzle, _hit, ws.def.tracer);
      if (bestVictim) {
        const dmg = damageAt(ws.def, bestT, bestHead);
        const died = bestVictim.takeDamage(dmg, bestHead);
        this.effects.blood(_hit);
        result.hit = true; result.head = result.head || bestHead; result.victim = bestVictim; result.point = _hit.clone(); result.dist = bestT;
        if (actor.isPlayer) this.events.push({ type: 'hit', head: bestHead, killed: died });
        if (died) this.handleKill(actor, bestVictim, bestHead, ws.def.name);
      } else if (wallDist < 120) {
        // Impact sparks, with a floor-ish normal fallback.
        this.effects.impact(_hit, { x: -dir.x, y: 0.4, z: -dir.z }, 8);
      }
    }
    this.effects.muzzleFlash(_muzzle, _dir);
    const distToPlayer = actor.isPlayer ? 0 : actor.pos.distanceTo(this.player.pos);
    this.sounds.shot(ws.def.sound, distToPlayer);
    this.noises.push({ x: actor.pos.x, z: actor.pos.z, radius: 26, until: this.time + 0.7 });
    return result;
  }

  handleKill(killer, victim, head, weaponName) {
    victim.deaths++;
    killer.kills++;
    killer.money += CONFIG.KILL_REWARD;
    this.roundKills++;
    if (killer.isPlayer) this.sounds.kill();
    this.events.push({ type: 'kill', killer, victim, head, weaponName });
    // The charge changes hands when its carrier falls.
    if (victim.hasCharge) {
      victim.hasCharge = false;
      const alive = this.actors.filter((a) => a.team === TEAMS.VANGUARD && a.alive);
      if (alive.length > 0) {
        const next = alive[(Math.random() * alive.length) | 0];
        next.hasCharge = true;
        this.chargeCarrierId = next.id;
        this.events.push({ type: 'chargeCarrier', carrier: next.name, carrierIsPlayer: next.isPlayer });
      }
    }
  }

  reloadWeapon(actor, now) {
    const ws = actor.weapon;
    if (startReload(ws, now)) {
      if (actor.isPlayer) this.sounds.reload();
      return true;
    }
    return false;
  }

  throwGrenade(actor, type) {
    if (!actor.alive || actor.grenades[type] <= 0) return false;
    actor.grenades[type]--;
    actor.muzzlePosInto(_muzzle);
    actor.forwardInto(_dir);
    _dir.y = Math.sin(actor.pitch) + 0.25;
    _dir.normalize();
    this.grenades.push({
      type,
      pos: _muzzle.clone(),
      vel: new THREE.Vector3(_dir.x * 15, _dir.y * 15 + 2, _dir.z * 15),
      fuse: type === 'frag' ? 1.4 : 1.1,
      owner: actor,
    });
    this.sounds.click();
    return true;
  }

  explodeGrenade(g) {
    const p = g.pos;
    if (g.type === 'frag') {
      this.effects.explosion(p);
      this.sounds.explosion();
      this.noises.push({ x: p.x, z: p.z, radius: 40, until: this.time + 1 });
      for (const a of this.actors) {
        if (!a.alive || a === g.owner) continue;
        const d = Math.hypot(a.pos.x - p.x, a.pos.z - p.z);
        if (d > 7) continue;
        if (!hasLineOfSight(p.x, p.z, a.pos.x, a.pos.z, this.colliders)) continue;
        const dmg = 115 * (1 - d / 7) + 15;
        const died = a.takeDamage(dmg, false);
        if (died) this.handleKill(g.owner, a, false, 'Frag Grenade');
        else if (a.isPlayer) this.events.push({ type: 'hurt' });
      }
    } else if (g.type === 'smoke') {
      this.effects.smoke(p.x, p.z);
      this.noises.push({ x: p.x, z: p.z, radius: 8, until: this.time + 0.5 });
    } else if (g.type === 'flash') {
      this.effects.explosion(p);
      this.flashFrom(p, g.owner);
    }
  }

  flashFrom(p, owner) {
    // The player is flashed when looking toward the pop; bots get a
    // reaction penalty instead of a white screen.
    const pl = this.player;
    if (pl.alive) {
      pl.eyePosInto(_v);
      const dx = p.x - _v.x, dy = p.y - _v.y, dz = p.z - _v.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < 26 && hasLineOfSight(_v.x, _v.z, p.x, p.z, this.colliders)) {
        pl.forwardInto(_u);
        const facing = (dx * _u.x + dz * _u.z) / Math.max(0.001, Math.hypot(dx, dz));
        const strength = Math.max(0, (1 - d / 26) * (facing > 0.3 ? 1 : 0.35));
        if (strength > 0.08) this.events.push({ type: 'flash', strength });
      }
    }
    for (const [id, c] of this.controllers) {
      const a = c.actor;
      if (!a.alive || a.team === owner.team) continue;
      const d = Math.hypot(a.pos.x - p.x, a.pos.z - p.z);
      if (d < 20 && hasLineOfSight(a.pos.x, a.pos.z, p.x, p.z, this.colliders)) {
        c.reaction = Math.max(c.reaction, 1.6);
        c.target = null;
      }
    }
  }

  // --- the charge ------------------------------------------------------------
  plantCharge(actor, siteKey) {
    const site = this.sites[siteKey];
    this.charge.planted = true;
    this.charge.site = siteKey;
    this.charge.pos.set(actor.pos.x, 0, actor.pos.z);
    this.charge.timer = CONFIG.CHARGE_TIME;
    this.charge.beep = 0;
    actor.hasCharge = false;
    this.events.push({ type: 'planted', site: site.name, by: actor.name });
    this.sounds.plantBeep();
  }

  defuseCharge(actor) {
    this.charge.planted = false;
    this.events.push({ type: 'defused', by: actor.name });
    this.endRound(TEAMS.WARDEN, 'defused');
  }

  // --- economy ----------------------------------------------------------------
  awardRound(winner) {
    const loser = winner === TEAMS.VANGUARD ? TEAMS.WARDEN : TEAMS.VANGUARD;
    for (const a of this.actors) {
      if (a.team === winner) a.money += CONFIG.WIN_REWARD;
      else {
        this.lossStreak[loser]++;
        a.money += Math.min(CONFIG.LOSS_MAX, CONFIG.LOSS_BASE + (this.lossStreak[loser] - 1) * CONFIG.LOSS_STREAK_STEP);
      }
    }
    this.lossStreak[winner] = 0;
  }

  endRound(winner, reason) {
    if (this.phase !== 'live') return;
    this.score[winner]++;
    this.awardRound(winner);
    this.phase = 'roundEnd';
    this.timer = CONFIG.ROUND_END_PAUSE;
    const label = reason === 'eliminated' ? 'ELIMINATION' : reason === 'detonated' ? 'CHARGE DETONATED' : reason === 'defused' ? 'CHARGE DEFUSED' : 'TIME EXPIRED';
    this.events.push({ type: 'roundEnd', winner, reason: label, score: { ...this.score } });
    if (winner === TEAMS.VANGUARD) this.sounds.roundWin(); else this.sounds.roundLose();
  }

  // --- per-tick update ----------------------------------------------------------
  update(dt) {
    this.time += dt;
    // Keep the charge mesh with the charge state.
    this.chargeMesh.visible = this.charge.planted;
    if (this.charge.planted) this.chargeMesh.position.copy(this.charge.pos);
    // Expire old noises.
    while (this.noises.length > 0 && this.noises[0].until < this.time) this.noises.shift();
    // Finish reloads.
    for (const a of this.actors) {
      const ws = a.weapon;
      if (ws.reloadingUntil > 0 && this.time >= ws.reloadingUntil) finishReload(ws);
      decayBloom(ws, dt);
    }
    // Grenade physics.
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      g.fuse -= dt;
      g.vel.y -= 12 * dt;
      g.pos.addScaledVector(g.vel, dt);
      if (g.pos.y < 0.05) {
        g.pos.y = 0.05;
        g.vel.y *= -0.35;
        g.vel.x *= 0.7; g.vel.z *= 0.7;
      }
      for (const b of this.colliders) {
        if (g.pos.y < b.height && g.pos.x > b.minX && g.pos.x < b.maxX && g.pos.z > b.minZ && g.pos.z < b.maxZ) {
          g.pos.x -= g.vel.x * dt; g.pos.z -= g.vel.z * dt;
          g.vel.x *= -0.4; g.vel.z *= -0.4;
        }
      }
      if (g.fuse <= 0) {
        this.explodeGrenade(g);
        this.grenades.splice(i, 1);
      }
    }
    // Charge countdown.
    if (this.charge.planted) {
      this.charge.timer -= dt;
      this.charge.beep -= dt;
      // Blink the charge lamp in step with its beeps.
      const on = Math.sin(this.time * 7) > 0;
      this.chargeLedMat.emissiveIntensity = on ? 2.2 : 0.15;
      this.chargeLight.intensity = on ? 5 : 0.5;
      if (this.charge.beep <= 0) {
        this.charge.beep = Math.max(0.35, this.charge.timer / CONFIG.CHARGE_TIME);
        this.sounds.chargeBeep();
      }
      if (this.charge.timer <= 0) {
        this.effects.explosion(this.charge.pos);
        this.sounds.explosion();
        this.charge.planted = false;
        this.events.push({ type: 'detonated', site: this.sites[this.charge.site].name });
        this.endRound(TEAMS.VANGUARD, 'detonated');
        return;
      }
    }

    if (this.phase === 'buy') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.phase = 'live';
        this.timer = CONFIG.ROUND_TIME;
        for (const a of this.actors) a.frozen = false;
        this.events.push({ type: 'roundLive' });
      }
      return;
    }
    if (this.phase === 'live') {
      this.timer -= dt;
      // Bots act; the player is driven by input in main.js. Staging
      // scenes freeze the bots so the composed shot holds still.
      if (!this.stagingFreeze) {
        for (const c of this.controllers.values()) c.update(dt, this.time);
      }
      this.updateSpotting();
      const vAlive = this.actors.some((a) => a.team === TEAMS.VANGUARD && a.alive);
      const wAlive = this.actors.some((a) => a.team === TEAMS.WARDEN && a.alive);
      if (!vAlive) { this.endRound(TEAMS.WARDEN, 'eliminated'); return; }
      if (!wAlive) { this.endRound(TEAMS.VANGUARD, 'eliminated'); return; }
      if (this.timer <= 0 && !this.charge.planted) {
        this.endRound(TEAMS.WARDEN, 'time');
        return;
      }
      return;
    }
    if (this.phase === 'roundEnd') {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.score[TEAMS.VANGUARD] >= CONFIG.ROUNDS_TO_WIN || this.score[TEAMS.WARDEN] >= CONFIG.ROUNDS_TO_WIN) {
          this.phase = 'matchEnd';
          const winner = this.score[TEAMS.VANGUARD] > this.score[TEAMS.WARDEN] ? TEAMS.VANGUARD : TEAMS.WARDEN;
          this.events.push({ type: 'matchEnd', winner, score: { ...this.score } });
        } else {
          this.round++;
          this.startRound();
        }
      }
    }
  }

  // Enemies the player's team can currently see, for the minimap.
  updateSpotting() {
    const hudSpotted = this._hudSpotted;
    if (!hudSpotted) return;
    for (const e of this.actors) {
      if (e.team !== TEAMS.WARDEN || !e.alive) continue;
      for (const ally of this.actors) {
        if (ally.team !== TEAMS.VANGUARD || !ally.alive) continue;
        const d = Math.hypot(e.pos.x - ally.pos.x, e.pos.z - ally.pos.z);
        if (d > 46) continue;
        if (this.effects.smokeBlocks(ally.pos.x, ally.pos.z, e.pos.x, e.pos.z)) continue;
        if (hasLineOfSight(ally.pos.x, ally.pos.z, e.pos.x, e.pos.z, this.colliders)) {
          hudSpotted.set(e.id, this.time);
          break;
        }
      }
    }
  }

  smokeBlocks(ax, az, bx, bz) {
    return this.effects.smokeBlocks(ax, az, bx, bz);
  }
}
