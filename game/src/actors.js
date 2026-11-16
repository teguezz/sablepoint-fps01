// SABLEPOINT — actors. One class for the player and every bot: movement
// with acceleration and friction, circle-vs-box collision, health and
// armour, weapons, and the visible body mesh. The brain (bots.js) and the
// input (main.js) only ever set intent; this class owns the body.

import * as THREE from 'three';
import { CONFIG, TEAM_INFO, WEAPONS } from './config.js';
import { makeWeaponState } from './weapons.js';

const _v = new THREE.Vector3();
const _wish = new THREE.Vector3();

function nameSprite(text, colorCss) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 8, 256, 48);
  ctx.fillStyle = colorCss;
  ctx.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: true, transparent: true }));
  sp.scale.set(1.7, 0.42, 1);
  return sp;
}

export class Actor {
  constructor(id, name, team, isPlayer) {
    this.id = id;
    this.name = name;
    this.team = team;
    this.isPlayer = isPlayer;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.hp = 100;
    this.armor = 0;
    this.alive = true;
    this.crouched = false;
    this.aiming = false;
    this.moving = false;
    this.money = CONFIG.START_MONEY;
    this.kills = 0;
    this.deaths = 0;
    this.primary = null; // weapon state, or null until bought
    this.sidearm = makeWeaponState('pistol');
    this.current = 'sidearm';
    this.grenades = { frag: 0, smoke: 0, flash: 0 };
    this.hasCharge = false;
    this.plantProgress = 0;
    this.defuseProgress = 0;
    this.frozen = false; // buy phase: no movement
    this.mesh = null;
    this.nameTag = null;
    this.deathTime = 0;
  }

  get weapon() {
    return this.current === 'primary' && this.primary ? this.primary : this.sidearm;
  }

  get eyeHeight() {
    return this.crouched ? CONFIG.EYE_CROUCH : CONFIG.EYE_STAND;
  }

  eyePosInto(out) {
    out.set(this.pos.x, this.pos.y + this.eyeHeight, this.pos.z);
    return out;
  }

  muzzlePosInto(out) {
    // Just ahead of the eyes, slightly down and to the right.
    const f = this.forwardInto(_v);
    out.set(this.pos.x + f.x * 0.5, this.pos.y + this.eyeHeight - 0.12, this.pos.z + f.z * 0.5);
    return out;
  }

  forwardInto(out) {
    out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    return out;
  }

  rightInto(out) {
    out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    return out;
  }

  speed2D() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  spawnAt(spawn) {
    this.pos.set(spawn.x, 0, spawn.z);
    this.vel.set(0, 0, 0);
    this.yaw = spawn.yaw;
    this.pitch = 0;
    this.hp = 100;
    this.alive = true;
    this.crouched = false;
    this.aiming = false;
    this.plantProgress = 0;
    this.defuseProgress = 0;
    this.frozen = false;
    this.hasCharge = false;
    if (this.mesh) {
      this.mesh.visible = !this.isPlayer;
      this.mesh.position.copy(this.pos);
      this.mesh.rotation.set(0, this.yaw, 0);
    }
  }

  buildMesh() {
    const info = TEAM_INFO[this.team];
    const g = new THREE.Group();
    const suit = new THREE.MeshStandardMaterial({ color: info.color, roughness: 0.75, metalness: 0.15 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1e1c1a, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0x8a6a52, roughness: 0.8 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.62, 0.34), suit);
    torso.position.y = 0.98; torso.castShadow = true; g.add(torso);
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.3, 0.38), dark);
    vest.position.y = 1.05; g.add(vest);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 10), skin);
    head.position.y = 1.52; head.castShadow = true; g.add(head);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.23, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), suit);
    helmet.position.y = 1.54; g.add(helmet);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.06), dark);
    visor.position.set(0, 1.53, -0.19); g.add(visor);
    for (const sx of [-0.15, 0.15]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.22), dark);
      leg.position.set(sx, 0.31, 0); leg.castShadow = true; g.add(leg);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.15), suit);
      arm.position.set(sx * 1.9, 1.05, -0.12); arm.rotation.x = -0.7; g.add(arm);
    }
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.78), dark);
    gun.position.set(0.1, 1.22, -0.42); g.add(gun);
    this.gunMesh = gun;

    this.nameTag = nameSprite(this.name, info.css);
    this.nameTag.position.y = 1.98;
    g.add(this.nameTag);
    this.mesh = g;
    this.mesh.visible = !this.isPlayer;
    return g;
  }

  // intent: { f, s } in [-1,1], crouch, aim. dt in seconds.
  move(dt, intent, colliders) {
    if (!this.alive || this.frozen) {
      this.vel.x = 0; this.vel.z = 0;
      this.moving = false;
      return;
    }
    this.crouched = !!intent.crouch;
    this.aiming = !!intent.aim;
    const fwd = this.forwardInto(_v);
    const right = this.rightInto(new THREE.Vector3());
    _wish.set(0, 0, 0);
    _wish.addScaledVector(fwd, intent.f || 0);
    _wish.addScaledVector(right, intent.s || 0);
    const len = Math.hypot(_wish.x, _wish.z);
    if (len > 1) { _wish.x /= len; _wish.z /= len; }
    let speed = CONFIG.WALK_SPEED;
    if (this.crouched) speed = CONFIG.CROUCH_SPEED;
    else if (this.aiming) speed = CONFIG.AIM_SPEED;
    _wish.multiplyScalar(speed);
    // Accelerate toward the wish velocity; friction when no input.
    const rate = len > 0.01 ? CONFIG.ACCEL : CONFIG.FRICTION;
    this.vel.x += (_wish.x - this.vel.x) * Math.min(1, rate * dt);
    this.vel.z += (_wish.z - this.vel.z) * Math.min(1, rate * dt);
    this.moving = this.speed2D() > 0.4;

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.resolveCollisions(colliders);
    const hw = CONFIG.MAP_W / 2 - 0.6, hd = CONFIG.MAP_D / 2 - 0.6;
    this.pos.x = Math.max(-hw, Math.min(hw, this.pos.x));
    this.pos.z = Math.max(-hd, Math.min(hd, this.pos.z));
    if (this.mesh) {
      this.mesh.position.copy(this.pos);
      this.mesh.rotation.y = this.yaw;
    }
  }

  resolveCollisions(colliders) {
    const r = CONFIG.PLAYER_RADIUS;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < colliders.length; i++) {
        const b = colliders[i];
        const cx = Math.max(b.minX, Math.min(this.pos.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(this.pos.z, b.maxZ));
        let dx = this.pos.x - cx, dz = this.pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 < 1e-8) {
          // Inside the box: push out along the smallest penetration axis.
          const pl = this.pos.x - b.minX, pr = b.maxX - this.pos.x;
          const pt = this.pos.z - b.minZ, pb = b.maxZ - this.pos.z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) this.pos.x = b.minX - r;
          else if (m === pr) this.pos.x = b.maxX + r;
          else if (m === pt) this.pos.z = b.minZ - r;
          else this.pos.z = b.maxZ + r;
          continue;
        }
        const d = Math.sqrt(d2);
        const push = (r - d) / d;
        this.pos.x += dx * push;
        this.pos.z += dz * push;
      }
    }
  }

  // Damage after armour. Returns true when this actor died.
  takeDamage(amount, head) {
    if (!this.alive) return false;
    let remaining = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, remaining * CONFIG.ARMOR_ABSORB);
      this.armor -= absorbed;
      remaining -= absorbed;
    }
    this.hp -= remaining;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.deathTime = 0;
      if (this.mesh) {
        this.mesh.rotation.x = -Math.PI / 2 + 0.12;
        this.mesh.position.y = 0.25;
      }
      return true;
    }
    return false;
  }

  buyWeapon(id) {
    const def = WEAPONS[id];
    if (!def) return false;
    if (this.money < def.price) return false;
    if (def.slot === 'primary') {
      this.primary = makeWeaponState(id);
      this.current = 'primary';
    } else {
      this.sidearm = makeWeaponState(id);
    }
    this.money -= def.price;
    return true;
  }

  die() {
    this.alive = false;
    this.hp = 0;
  }
}
