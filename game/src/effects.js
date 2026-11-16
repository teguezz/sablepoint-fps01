// SABLEPOINT — effects. Tracers, impact sparks, muzzle flash, smoke and
// explosions, all pooled and reused: the hot loops allocate nothing. Smoke
// clouds are gameplay, not decoration: they block bot line of sight.

import * as THREE from 'three';

const TRACERS = 24;
const SPARKS = 320;
const SMOKES = 6;

export class Effects {
  constructor(scene) {
    this.scene = scene;
    // --- tracers: one Line per slot, shown for 60 ms ----------------------
    this.tracers = [];
    for (let i = 0; i < TRACERS; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
      line.frustumCulled = false;
      scene.add(line);
      this.tracers.push({ line, life: 0 });
    }
    this.tracerIdx = 0;
    // --- sparks: one Points cloud, slots ringed --------------------------
    this.sparkPos = new Float32Array(SPARKS * 3);
    this.sparkVel = new Float32Array(SPARKS * 3);
    this.sparkLife = new Float32Array(SPARKS);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    this.sparkPoints = new THREE.Points(sg, new THREE.PointsMaterial({
      color: 0xffc46b, size: 0.09, transparent: true, opacity: 0.95, depthWrite: false,
    }));
    this.sparkPoints.frustumCulled = false;
    scene.add(this.sparkPoints);
    this.sparkIdx = 0;
    // --- muzzle flash: a sprite plus one shared light ----------------------
    const fc = document.createElement('canvas');
    fc.width = 64; fc.height = 64;
    const fctx = fc.getContext('2d');
    const grad = fctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,240,180,1)');
    grad.addColorStop(0.4, 'rgba(255,170,60,0.8)');
    grad.addColorStop(1, 'rgba(255,120,20,0)');
    fctx.fillStyle = grad; fctx.fillRect(0, 0, 64, 64);
    const ftex = new THREE.CanvasTexture(fc);
    this.flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: ftex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.flashSprite.scale.set(0.55, 0.55, 1);
    scene.add(this.flashSprite);
    this.flashLight = new THREE.PointLight(0xffb45e, 0, 9, 2);
    scene.add(this.flashLight);
    this.flashLife = 0;
    // --- smoke clouds ------------------------------------------------------
    const sc = document.createElement('canvas');
    sc.width = 128; sc.height = 128;
    const sctx = sc.getContext('2d');
    const sg2 = sctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    sg2.addColorStop(0, 'rgba(200,200,200,0.85)');
    sg2.addColorStop(0.7, 'rgba(170,170,170,0.5)');
    sg2.addColorStop(1, 'rgba(160,160,160,0)');
    sctx.fillStyle = sg2; sctx.fillRect(0, 0, 128, 128);
    this.smokeTex = new THREE.CanvasTexture(sc);
    this.smokes = [];
    for (let i = 0; i < SMOKES; i++) {
      const sprites = [];
      for (let j = 0; j < 7; j++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, transparent: true, opacity: 0, depthWrite: false }));
        sp.scale.set(3.2, 3.2, 1);
        scene.add(sp);
        sprites.push(sp);
      }
      this.smokes.push({ sprites, x: 0, z: 0, life: 0, maxLife: 12 });
    }
    this.smokeIdx = 0;
    // --- explosion light ---------------------------------------------------
    this.boomLight = new THREE.PointLight(0xff8a30, 0, 30, 1.6);
    scene.add(this.boomLight);
    this.boomLife = 0;
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
  }

  tracer(from, to, color = 0xffe9a8) {
    const t = this.tracers[this.tracerIdx];
    this.tracerIdx = (this.tracerIdx + 1) % TRACERS;
    const p = t.line.geometry.attributes.position.array;
    p[0] = from.x; p[1] = from.y; p[2] = from.z;
    p[3] = to.x; p[4] = to.y; p[5] = to.z;
    t.line.geometry.attributes.position.needsUpdate = true;
    t.line.material.color.setHex(color);
    t.line.material.opacity = 0.9;
    t.life = 0.06;
  }

  impact(point, normal, count = 10, color = 0xffc46b) {
    for (let n = 0; n < count; n++) {
      const i = this.sparkIdx;
      this.sparkIdx = (this.sparkIdx + 1) % SPARKS;
      this.sparkPos[i * 3] = point.x;
      this.sparkPos[i * 3 + 1] = point.y;
      this.sparkPos[i * 3 + 2] = point.z;
      // Spray along the surface normal with a random cone.
      this.sparkVel[i * 3] = normal.x * 2.4 + (Math.random() - 0.5) * 3.4;
      this.sparkVel[i * 3 + 1] = Math.abs(normal.y) * 2 + Math.random() * 2.6 + 0.8;
      this.sparkVel[i * 3 + 2] = normal.z * 2.4 + (Math.random() - 0.5) * 3.4;
      this.sparkLife[i] = 0.35 + Math.random() * 0.25;
    }
    this.sparkPoints.geometry.attributes.position.needsUpdate = true;
    this.sparkPoints.material.color.setHex(color);
  }

  blood(point) {
    this.impact(point, { x: 0, y: 1, z: 0 }, 8, 0xb02020);
  }

  muzzleFlash(muzzlePos, dir) {
    this.flashSprite.position.copy(muzzlePos).addScaledVector(dir, 0.25);
    this.flashSprite.material.opacity = 1;
    this.flashSprite.material.rotation = Math.random() * Math.PI;
    this.flashSprite.scale.set(0.5 + Math.random() * 0.25, 0.5 + Math.random() * 0.25, 1);
    this.flashLight.position.copy(muzzlePos);
    this.flashLight.intensity = 26;
    this.flashLife = 0.05;
  }

  smoke(x, z) {
    const s = this.smokes[this.smokeIdx];
    this.smokeIdx = (this.smokeIdx + 1) % SMOKES;
    s.x = x; s.z = z;
    s.life = 12; s.maxLife = 12;
    for (let j = 0; j < s.sprites.length; j++) {
      const sp = s.sprites[j];
      const a = (j / s.sprites.length) * Math.PI * 2;
      sp.position.set(x + Math.cos(a) * 1.6, 0.9 + Math.random() * 1.4, z + Math.sin(a) * 1.6);
      sp.material.opacity = 0.75;
    }
  }

  explosion(pos) {
    this.impact(pos, { x: 0, y: 1, z: 0 }, 60, 0xff9040);
    this.boomLight.position.set(pos.x, pos.y + 1, pos.z);
    this.boomLight.intensity = 120;
    this.boomLife = 0.35;
  }

  // Does any live smoke cloud block the segment (ax,az)->(bx,bz)?
  smokeBlocks(ax, az, bx, bz) {
    for (const s of this.smokes) {
      if (s.life <= 0) continue;
      // Distance from the cloud centre to the segment, in 2D.
      const dx = bx - ax, dz = bz - az;
      const len2 = dx * dx + dz * dz;
      let t = len2 > 0 ? ((s.x - ax) * dx + (s.z - az) * dz) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const px = ax + dx * t - s.x, pz = az + dz * t - s.z;
      if (px * px + pz * pz < 3.4 * 3.4) return true;
    }
    return false;
  }

  update(dt) {
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        if (t.life <= 0) t.line.material.opacity = 0;
      }
    }
    let anySpark = false;
    for (let i = 0; i < SPARKS; i++) {
      if (this.sparkLife[i] <= 0) continue;
      anySpark = true;
      this.sparkLife[i] -= dt;
      this.sparkPos[i * 3] += this.sparkVel[i * 3] * dt;
      this.sparkPos[i * 3 + 1] += this.sparkVel[i * 3 + 1] * dt;
      this.sparkPos[i * 3 + 2] += this.sparkVel[i * 3 + 2] * dt;
      this.sparkVel[i * 3 + 1] -= 9 * dt;
      if (this.sparkPos[i * 3 + 1] < 0.02) { this.sparkPos[i * 3 + 1] = 0.02; this.sparkVel[i * 3 + 1] *= -0.3; }
      if (this.sparkLife[i] <= 0) this.sparkPos[i * 3 + 1] = -100;
    }
    if (anySpark) this.sparkPoints.geometry.attributes.position.needsUpdate = true;
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      if (this.flashLife <= 0) {
        this.flashSprite.material.opacity = 0;
        this.flashLight.intensity = 0;
      }
    }
    if (this.boomLife > 0) {
      this.boomLife -= dt;
      this.boomLight.intensity = Math.max(0, this.boomLife / 0.35) * 120;
    }
    for (const s of this.smokes) {
      if (s.life <= 0) continue;
      s.life -= dt;
      const fade = Math.min(1, s.life / 2.5);
      for (const sp of s.sprites) {
        sp.material.opacity = 0.75 * fade;
        const sc = 3.2 + (1 - s.life / s.maxLife) * 1.6;
        sp.scale.set(sc, sc, 1);
      }
      if (s.life <= 0) for (const sp of s.sprites) sp.material.opacity = 0;
    }
  }
}
