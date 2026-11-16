// SABLEPOINT — Rustfall Yard. An original industrial map: a dusk-lit scrap
// yard with two plant sites, the Foundry (north-west) and the Depot
// (south-east), three lanes between the spawns, and container cover. Every
// solid is an axis-aligned box, which is also its collider and its nav-grid
// obstacle, so the map, the collision and the bot paths can never disagree.

import * as THREE from 'three';
import { CONFIG, SITE_NAMES } from './config.js';
import { NavGrid } from './nav.js';

function boxMat(tex, color = 0xffffff, rough = 0.9, metal = 0.05) {
  const m = new THREE.MeshStandardMaterial({ map: tex, color, roughness: rough, metalness: metal });
  return m;
}

export function buildMap(scene, T) {
  const colliders = [];
  const W = CONFIG.MAP_W, D = CONFIG.MAP_D, H = CONFIG.WALL_H;
  const hw = W / 2, hd = D / 2;

  const addBox = (mat, x, y, z, w, h, d, collide = true, shadow = true) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (collide) colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, height: y + h / 2 });
    return mesh;
  };

  // ---- sky, fog, light -------------------------------------------------
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(220, 24, 16),
    new THREE.MeshBasicMaterial({ map: T.sky, side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);
  scene.fog = new THREE.Fog(0x33241c, 45, 170);

  const hemi = new THREE.HemisphereLight(0x8a6a8a, 0x2a1e14, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xff9a4d, 1.9);
  sun.position.set(-40, 26, -30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -45; sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 45; sun.shadow.camera.bottom = -45;
  sun.shadow.camera.far = 140;
  scene.add(sun);
  scene.add(sun.target);

  // ---- ground ----------------------------------------------------------
  const groundMat = new THREE.MeshStandardMaterial({ map: T.floor, roughness: 0.95, metalness: 0.08 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W + 8, D + 8), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- perimeter walls -------------------------------------------------
  const wallMat = boxMat(T.concrete, 0x9a938a);
  addBox(wallMat, 0, H / 2, -hd - 0.5, W + 2, H, 1); // north
  addBox(wallMat, 0, H / 2, hd + 0.5, W + 2, H, 1); // south
  addBox(wallMat, -hw - 0.5, H / 2, 0, 1, H, D + 2); // west
  addBox(wallMat, hw + 0.5, H / 2, 0, 1, H, D + 2); // east
  // hazard stripe caps on the wall tops, north and south
  const hz = boxMat(T.hazard, 0xffffff, 0.85);
  addBox(hz, 0, H + 0.06, -hd - 0.5, W + 2, 0.12, 1.1, false, false);
  addBox(hz, 0, H + 0.06, hd + 0.5, W + 2, 0.12, 1.1, false, false);

  // ---- containers (the lane cover) --------------------------------------
  const cA = boxMat(T.containerAmber, 0xffffff, 0.85, 0.25);
  const cB = boxMat(T.containerBlue, 0xffffff, 0.85, 0.25);
  const cG = boxMat(T.containerGreen, 0xffffff, 0.85, 0.25);
  const cont = (mat, x, z, alongX) => {
    const w = alongX ? 6 : 2.6, d = alongX ? 2.6 : 6;
    return addBox(mat, x, 1.3, z, w, 2.6, d);
  };
  cont(cA, -8, -8, true);   // mid-north
  cont(cB, 8, 8, true);     // mid-south
  cont(cG, -2, 2, false);   // mid block
  cont(cB, 4, -4, false);   // mid-north pocket
  cont(cA, -20, -8, true);  // foundry approach
  cont(cG, 20, 8, true);    // depot approach
  cont(cB, -24, 10, false); // south-west
  cont(cA, 24, -10, false); // north-east
  // stacked pair at the Depot, and one at the Foundry
  cont(cB, 26, 18, true);
  addBox(cA, 26, 3.9, 18, 6, 2.6, 2.6); // stacked on top, same footprint
  cont(cG, -26, -18, true);
  addBox(cB, -26, 3.9, -18, 6, 2.6, 2.6);

  // ---- crates ------------------------------------------------------------
  const crateMat = boxMat(T.crate, 0xffffff, 0.95);
  const crate = (x, z, s = 1.2, h = 1.2) => addBox(crateMat, x, h / 2, z, s, h, s);
  crate(-12, 4); crate(12, -4); crate(-4, 14); crate(4, -14);
  crate(-26, -2); crate(26, 2); crate(0, -16); crate(0, 16);
  crate(-16, 16); crate(16, -16);
  crate(-6, -18, 2.4, 1.2); crate(6, 18, 2.4, 1.2);
  crate(-13, 5.2, 1.2, 1.2); // small stack beside (-12,4)
  addBox(crateMat, -13, 1.8, 5.2, 1.2, 1.2, 1.2);

  // ---- barrels -----------------------------------------------------------
  const barrelMat = boxMat(T.rust, 0xffffff, 0.8, 0.3);
  const barrel = (x, z) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 12), barrelMat);
    m.position.set(x, 0.55, z);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    colliders.push({ minX: x - 0.45, maxX: x + 0.45, minZ: z - 0.45, maxZ: z + 0.45, height: 1.1 });
  };
  barrel(-10, -14); barrel(-9, -13); barrel(10, 14); barrel(14, -12);
  barrel(-18, 18); barrel(18, -18);

  // ---- gantry crane over the north lane (pillars collide, beam does not) --
  const steel = boxMat(T.rustDark, 0xffffff, 0.7, 0.5);
  addBox(steel, -14, 3, -20, 0.9, 6, 0.9);
  addBox(steel, 14, 3, -20, 0.9, 6, 0.9);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(29.5, 0.8, 0.9), steel);
  beam.position.set(0, 6.2, -20);
  beam.castShadow = true;
  scene.add(beam);
  const hook = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.6, 0.5), steel);
  hook.position.set(2, 5.2, -20);
  scene.add(hook);

  // ---- site markers -------------------------------------------------------
  const sites = {
    foundry: { key: 'foundry', name: SITE_NAMES.foundry, x: -20, z: -15, r: 6, letter: 'A' },
    depot: { key: 'depot', name: SITE_NAMES.depot, x: 20, z: 15, r: 6, letter: 'B' },
  };
  const siteMeshes = {};
  for (const key of Object.keys(sites)) {
    const s = sites[key];
    const tex = key === 'foundry' ? T.siteA : T.siteB;
    const decal = new THREE.Mesh(
      new THREE.PlaneGeometry(s.r * 2.4, s.r * 2.4),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(s.x, 0.02, s.z);
    scene.add(decal);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(s.r - 0.25, s.r, 48),
      new THREE.MeshBasicMaterial({ color: key === 'foundry' ? 0xe8a33d : 0x5b9bd5, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.x, 0.03, s.z);
    scene.add(ring);
    siteMeshes[key] = { decal, ring };
  }

  // ---- furnace at the Foundry, press at the Depot -------------------------
  addBox(boxMat(T.rust, 0xffffff, 0.75, 0.4), -27.5, 2, -19.5, 4.5, 4, 4);
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 1.4),
    new THREE.MeshBasicMaterial({ color: 0xff7a22, transparent: true, opacity: 0.85 }),
  );
  glow.position.set(-25.2, 1.1, -19.5);
  glow.rotation.y = Math.PI / 2;
  scene.add(glow);
  const furnaceLight = new THREE.PointLight(0xff7a22, 14, 16, 1.8);
  furnaceLight.position.set(-24.5, 1.6, -19.5);
  scene.add(furnaceLight);

  // ---- lamp poles ---------------------------------------------------------
  const poleMat = boxMat(T.rustDark, 0xffffff, 0.7, 0.5);
  const lampPositions = [[-16, -12], [16, 12], [-16, 12], [16, -12]];
  const lampLights = [];
  lampPositions.forEach(([x, z], i) => {
    addBox(poleMat, x, 2.5, z, 0.25, 5, 0.25);
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd9a0 }),
    );
    lamp.position.set(x, 5.1, z);
    scene.add(lamp);
    if (i < 2) {
      const pl = new THREE.PointLight(0xffc27a, 20, 22, 1.8);
      pl.position.set(x, 4.8, z);
      scene.add(pl);
      lampLights.push(pl);
    }
  });

  // ---- spawns and holds ----------------------------------------------------
  const spawns = {
    vanguard: [
      { x: -29, z: -4, yaw: -Math.PI / 2 }, { x: -29, z: 0, yaw: -Math.PI / 2 },
      { x: -29, z: 4, yaw: -Math.PI / 2 }, { x: -27, z: -7, yaw: -Math.PI / 2 },
      { x: -27, z: 7, yaw: -Math.PI / 2 },
    ],
    warden: [
      { x: 29, z: -4, yaw: Math.PI / 2 }, { x: 29, z: 0, yaw: Math.PI / 2 },
      { x: 29, z: 4, yaw: Math.PI / 2 }, { x: 27, z: -7, yaw: Math.PI / 2 },
      { x: 27, z: 7, yaw: Math.PI / 2 },
    ],
  };
  // Defender hold spots: two per site plus one mid.
  const holds = {
    foundry: [{ x: -17, z: -12 }, { x: -24, z: -10 }, { x: -14, z: -19 }],
    depot: [{ x: 17, z: 12 }, { x: 24, z: 10 }, { x: 14, z: 19 }],
    mid: [{ x: 8, z: -8 }, { x: -8, z: 8 }, { x: 0, z: -2 }],
  };

  const navGrid = new NavGrid(colliders);
  return { colliders, sites, siteMeshes, spawns, holds, navGrid, furnaceLight };
}
