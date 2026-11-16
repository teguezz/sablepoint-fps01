// SABLEPOINT — the first-person weapon viewmodel. A box-built gun held in
// front of the camera, with recoil kick, reload dip and a muzzle flash
// anchor. One shape per weapon class, rebuilt only when the weapon changes.

import * as THREE from 'three';

const SHAPES = {
  pistol: { barrel: 0.16, body: 0.2, grip: 0.1, mag: 0.08, stock: 0 },
  smg: { barrel: 0.3, body: 0.3, grip: 0.12, mag: 0.12, stock: 0.1 },
  rifle: { barrel: 0.42, body: 0.38, grip: 0.12, mag: 0.14, stock: 0.16 },
  sniper: { barrel: 0.62, body: 0.42, grip: 0.12, mag: 0.1, stock: 0.22, scope: true },
  shotgun: { barrel: 0.46, body: 0.4, grip: 0.12, mag: 0.1, stock: 0.16, pump: true },
  lmg: { barrel: 0.44, body: 0.46, grip: 0.12, mag: 0.2, stock: 0.18, bipod: true },
};

export class ViewModel {
  constructor(camera) {
    this.camera = camera;
    this.group = new THREE.Group();
    this.group.position.set(0.26, -0.24, -0.5);
    this.basePos = this.group.position.clone();
    camera.add(this.group);
    // A small fill light on the camera so the gun reads in the dusk light
    // from every angle, instead of going black when turned from the sun.
    this.fill = new THREE.PointLight(0xffe0b8, 1.6, 3, 1.5);
    this.fill.position.set(0.15, 0.15, -0.2);
    camera.add(this.fill);
    this.kick = 0;
    this.reloadDip = 0;
    this.currentId = null;
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0.02, -0.6);
    this.group.add(this.muzzle);
    this.build('pistol');
  }

  build(id) {
    if (id === this.currentId) return;
    this.currentId = id;
    while (this.group.children.length > 1) {
      const child = this.group.children[1];
      this.group.remove(child);
    }
    const s = SHAPES[id] || SHAPES.rifle;
    const gunmetal = new THREE.MeshStandardMaterial({ color: 0x5a544c, roughness: 0.5, metalness: 0.55 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x35302a, roughness: 0.9, metalness: 0.1 });
    const accent = new THREE.MeshStandardMaterial({ color: 0xb08a3a, roughness: 0.5, metalness: 0.6 });
    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      this.group.add(m);
      return m;
    };
    // Receiver body, barrel, grip, magazine, stock, extras per class.
    add(new THREE.BoxGeometry(0.07, 0.1, s.body), gunmetal, 0, 0, -s.body / 2 + 0.08);
    add(new THREE.BoxGeometry(0.045, 0.045, s.barrel), gunmetal, 0, 0.015, -s.body - s.barrel / 2 + 0.08);
    add(new THREE.BoxGeometry(0.06, s.grip + 0.06, 0.08), grip, 0, -0.07 - s.grip / 2, 0.02);
    add(new THREE.BoxGeometry(0.05, s.mag, 0.09), grip, 0, -0.05 - s.mag / 2, -0.14);
    if (s.stock) add(new THREE.BoxGeometry(0.06, 0.09, s.stock), grip, 0, -0.01, 0.08 + s.stock / 2);
    if (s.scope) {
      add(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 10), gunmetal, 0, 0.08, -0.2).rotation.x = Math.PI / 2;
      add(new THREE.BoxGeometry(0.03, 0.03, 0.03), accent, 0, 0.055, -0.2);
    }
    if (s.pump) add(new THREE.BoxGeometry(0.06, 0.05, 0.2), grip, 0, -0.03, -s.body - 0.05);
    if (s.bipod) {
      const leg = add(new THREE.BoxGeometry(0.02, 0.16, 0.02), gunmetal, -0.04, -0.1, -s.body - 0.1);
      leg.rotation.z = 0.5;
      const leg2 = add(new THREE.BoxGeometry(0.02, 0.16, 0.02), gunmetal, 0.04, -0.1, -s.body - 0.1);
      leg2.rotation.z = -0.5;
    }
    add(new THREE.BoxGeometry(0.02, 0.02, 0.03), accent, 0, 0.06, -s.body - s.barrel + 0.06);
    this.muzzle.position.set(0, 0.015, -s.body - s.barrel + 0.02);
  }

  onShot(weapon) {
    this.kick = Math.min(1, this.kick + weapon.kick * 6);
  }

  onReloadStart() {
    this.reloadDip = 1;
  }

  update(dt, moving, aiming) {
    // Recoil kick decays; the gun settles back to its base pose.
    this.kick = Math.max(0, this.kick - dt * 5);
    this.reloadDip = Math.max(0, this.reloadDip - dt * 1.6);
    const t = performance.now() / 1000;
    const bob = moving ? Math.sin(t * 9) * 0.006 : 0;
    const sway = moving ? Math.cos(t * 7) * 0.004 : 0;
    const aimX = aiming ? -0.08 : 0;
    const aimY = aiming ? 0.05 : 0;
    this.group.position.set(
      this.basePos.x + aimX + sway,
      this.basePos.y + aimY + bob - this.reloadDip * 0.22,
      this.basePos.z + this.kick * 0.09,
    );
    this.group.rotation.x = this.kick * 0.16 + this.reloadDip * 0.7;
    this.group.rotation.z = this.reloadDip * 0.25;
  }

  muzzleWorld(out) {
    return this.muzzle.getWorldPosition(out);
  }
}
