// SABLEPOINT — boot, input and the render loop. The simulation runs on a
// fixed 1/60 s step, apart from rendering: input is sampled into an intent,
// the match steps, then the camera and the HUD catch up. Staging scenes
// (?staging=cover|buy|plant|action|smoke) set up a real, running game for
// screenshots and the smoke test; nothing in them is faked.

import * as THREE from 'three';
import { CONFIG, TEAMS, WEAPONS, GRENADES, MAP_NAME } from './config.js';
import { buildTextures } from './textures.js';
import { buildMap } from './map.js';
import { Match } from './game.js';
import { Hud } from './hud.js';
import { Effects } from './effects.js';
import { SoundBank } from './audio.js';
import { ViewModel } from './viewmodel.js';
import { canFire, currentSpread } from './weapons.js';

const SIM_DT = 1 / 60;
const params = new URLSearchParams(location.search);
const STAGING = params.get('staging');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
camera.rotation.order = 'YXZ';
scene.add(camera);

const textures = buildTextures();
const map = buildMap(scene, textures);
const effects = new Effects(scene);
const sounds = new SoundBank();
const match = new Match(scene, map, effects, sounds);
const hud = new Hud(document.getElementById('hud'), {
  onBuy: (id) => buyItem(id),
  onStart: () => deploy(),
});
match.attachSpotting(hud.spotted);
const viewmodel = new ViewModel(camera);
viewmodel.build('pistol');

// --- input ------------------------------------------------------------------
const keys = new Set();
let firing = false;
let aiming = false;
let buyOpen = false;
let deployed = false;
let stepTimer = 0;

const canvas = renderer.domElement;
canvas.addEventListener('click', () => {
  sounds.ensure();
  if (deployed && document.pointerLockElement !== canvas) canvas.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas) firing = false;
});
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas || !deployed) return;
  const p = match.player;
  if (!p.alive) return;
  p.yaw -= e.movementX * 0.0022;
  p.pitch -= e.movementY * 0.0022;
  p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch));
});
document.addEventListener('mousedown', (e) => {
  if (!deployed || document.pointerLockElement !== canvas) return;
  if (e.button === 0) firing = true;
  if (e.button === 2) aiming = true;
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) firing = false;
  if (e.button === 2) aiming = false;
});
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'KeyB' && match.phase === 'buy') toggleBuy();
  if (e.code === 'KeyR' && match.reloadWeapon(match.player, match.time)) viewmodel.onReloadStart();
  if (e.code === 'KeyG') throwSelectedGrenade();
  if ((e.code === 'Digit1' || e.code === 'Digit2') && !buyOpen) {
    switchWeapon(e.code === 'Digit1' ? 'primary' : 'sidearm');
  }
  if (buyOpen) {
    const buyKeys = { Digit1: 'weapon:pistol', Digit2: 'weapon:smg', Digit3: 'weapon:rifle', Digit4: 'weapon:sniper', Digit5: 'weapon:shotgun', Digit6: 'weapon:lmg', Digit7: 'grenade:frag', Digit8: 'grenade:smoke', Digit9: 'grenade:flash', Digit0: 'armor' };
    if (buyKeys[e.code]) buyItem(buyKeys[e.code]);
  }
  if (e.code === 'KeyQ' && !buyOpen) {
    switchWeapon(match.player.current === 'primary' ? 'sidearm' : 'primary');
  }
});
document.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function toggleBuy() {
  buyOpen = !buyOpen;
  hud.showBuy(buyOpen, match.player.money);
  if (buyOpen) sounds.click();
}

function switchWeapon(slot) {
  const p = match.player;
  if (slot === 'primary' && !p.primary) { sounds.denied(); return; }
  if (p.current === slot) return;
  p.current = slot;
  viewmodel.build(p.weapon.id);
  sounds.click();
  syncWeaponHud();
}

function buyItem(id) {
  const p = match.player;
  if (match.phase !== 'buy') { sounds.denied(); return; }
  const [kind, what] = id.split(':');
  let ok = false;
  if (kind === 'weapon') ok = p.buyWeapon(what);
  else if (kind === 'grenade') {
    const g = GRENADES[what];
    if (p.money >= g.price && p.grenades[what] < 2) { p.money -= g.price; p.grenades[what]++; ok = true; }
  } else if (kind === 'armor') {
    if (p.money >= CONFIG.ARMOR_PRICE && p.armor < 100) { p.money -= CONFIG.ARMOR_PRICE; p.armor = 100; ok = true; }
  }
  if (ok) {
    sounds.buy();
    if (kind === 'weapon') viewmodel.build(p.weapon.id);
    syncWeaponHud();
    hud.setMoney(p.money);
    hud.setNades(p.grenades);
    if (buyOpen) hud.showBuy(true, p.money);
  } else sounds.denied();
}

function throwSelectedGrenade() {
  const p = match.player;
  if (!p.alive || match.phase !== 'live') return;
  for (const type of ['frag', 'smoke', 'flash']) {
    if (p.grenades[type] > 0) {
      if (match.throwGrenade(p, type)) { hud.setNades(p.grenades); }
      return;
    }
  }
  sounds.denied();
}

function lookDirInto(out) {
  const p = match.player;
  const cp = Math.cos(p.pitch);
  out.set(-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp);
  return out;
}

const _look = new THREE.Vector3();
const _eye = new THREE.Vector3();

// --- player intent, one fixed step ------------------------------------------
function playerStep(dt) {
  const p = match.player;
  if (!deployed || !p.alive) return;
  const intent = {
    f: (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0),
    s: (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0),
    crouch: keys.has('KeyC') || keys.has('ControlLeft'),
    aim: aiming,
  };
  p.move(dt, intent, match.colliders);
  if (p.moving) {
    stepTimer -= dt;
    if (stepTimer <= 0) { stepTimer = 0.38; sounds.step(); }
  }
  // Firing (mouse held): the match resolves the shot.
  if (firing && match.phase === 'live' && !buyOpen && canFire(p.weapon, match.time)) {
    lookDirInto(_look);
    const res = match.fireWeapon(p, _look, match.time, 0);
    if (res) {
      p.pitch += p.weapon.def.recoil * (0.8 + Math.random() * 0.4);
      p.pitch = Math.min(1.5, p.pitch);
      viewmodel.onShot(p.weapon.def);
    }
  }
  // Planting: hold E inside a site while carrying the charge.
  if (keys.has('KeyE') && p.hasCharge && match.phase === 'live') {
    const siteKey = siteAt(p.pos.x, p.pos.z);
    if (siteKey) {
      p.plantProgress += dt;
      hud.objective('PLANTING CHARGE', p.plantProgress / CONFIG.PLANT_TIME);
      if (p.plantProgress >= CONFIG.PLANT_TIME) {
        match.plantCharge(p, siteKey);
        p.plantProgress = 0;
        hud.objective(null, 0);
      }
    } else {
      p.plantProgress = 0;
      hud.objective(null, 0);
    }
  } else if (p.plantProgress > 0) {
    p.plantProgress = 0;
    hud.objective(null, 0);
  }
}

function siteAt(x, z) {
  for (const key of Object.keys(match.sites)) {
    const s = match.sites[key];
    if (Math.hypot(x - s.x, z - s.z) < s.r) return key;
  }
  return null;
}

// --- deploy / events ----------------------------------------------------------
function deploy() {
  sounds.ensure();
  deployed = true;
  hud.showStart(false);
  canvas.requestPointerLock();
  if (match.phase === 'menu') match.startMatch();
}

function drainEvents() {
  for (const ev of match.events) {
    switch (ev.type) {
      case 'roundStart':
        hud.bannerShow(`ROUND ${ev.round}`, ev.carrierIsPlayer ? 'You carry the Charge — plant at A or B' : `${ev.carrier} carries the Charge`);
        hud.setScore(match.score[TEAMS.VANGUARD], match.score[TEAMS.WARDEN], match.round);
        // The buy menu opens only for a real buy phase; staging scenes
        // that skip ahead to live play keep it closed.
        buyOpen = match.phase === 'buy';
        hud.showBuy(buyOpen, match.player.money);
        syncWeaponHud();
        break;
      case 'roundLive':
        buyOpen = false;
        hud.showBuy(false, 0);
        hud.bannerShow('GO GO GO', 'Plant the Charge or eliminate the Wardens');
        break;
      case 'kill':
        hud.feedAdd(ev.killer, ev.victim, ev.head, ev.weaponName);
        if (ev.killer.isPlayer) hud.setMoney(match.player.money);
        if (ev.victim.isPlayer) { hud.damage(); hud.bannerShow('YOU WERE ELIMINATED', 'Your team fights on — you return next round'); }
        break;
      case 'hit':
        hud.hitmarker(ev.killed);
        if (ev.killed) hud.setMoney(match.player.money);
        break;
      case 'hurt':
        hud.damage();
        break;
      case 'flash':
        hud.flashBang(ev.strength);
        break;
      case 'chargeCarrier':
        if (ev.carrierIsPlayer) hud.bannerShow('YOU HAVE THE CHARGE', 'Plant it at the Foundry or the Depot');
        break;
      case 'planted':
        hud.bannerShow('CHARGE PLANTED', `${ev.site} — defend it until it detonates`);
        break;
      case 'defused':
        hud.bannerShow('CHARGE DEFUSED', `${ev.by} stopped the detonation`);
        break;
      case 'detonated':
        hud.bannerShow('CHARGE DETONATED', `${ev.site} is gone`);
        break;
      case 'roundEnd': {
        const won = ev.winner === TEAMS.VANGUARD;
        hud.bannerShow(won ? 'ROUND WON' : 'ROUND LOST', `${ev.reason} — ${match.score[TEAMS.VANGUARD]} : ${match.score[TEAMS.WARDEN]}`);
        hud.setScore(match.score[TEAMS.VANGUARD], match.score[TEAMS.WARDEN], match.round);
        hud.setMoney(match.player.money);
        break;
      }
      case 'matchEnd': {
        const won = ev.winner === TEAMS.VANGUARD;
        hud.showEnd(won ? 'VICTORY' : 'DEFEAT', `Vanguard ${ev.score[TEAMS.VANGUARD]} — ${ev.score[TEAMS.WARDEN]} Wardens · ${MAP_NAME}`);
        break;
      }
      default:
        break;
    }
  }
  match.events.length = 0;
}

function syncWeaponHud() {
  const p = match.player;
  hud.setAmmo(p.weapon.mag, p.weapon.reserve, p.weapon.def.name);
  hud.setNades(p.grenades);
  hud.setHealth(p.hp, p.armor);
}

// --- HUD per-frame -------------------------------------------------------------
function hudFrame(dt) {
  const p = match.player;
  hud.setHealth(p.hp, p.armor);
  hud.setAmmo(p.weapon.mag, p.weapon.reserve, p.weapon.def.name);
  hud.setMoney(p.money);
  hud.bannerTick(dt);
  const label = match.phaseLabel();
  const t = match.phase === 'buy' || match.phase === 'live' ? match.timer : 0;
  hud.setTimer(t, label);
  hud.setScore(match.score[TEAMS.VANGUARD], match.score[TEAMS.WARDEN], match.round);
  const spread = currentSpread(p.weapon, p.speed2D() > 0.6, p.crouched, aiming);
  hud.setCrosshairSpread(6 + spread * 900);
  hud.drawMinimap(map, match.actors, match.charge, p, match.time);
  // Camera follows the eyes.
  p.eyePosInto(_eye);
  camera.position.copy(_eye);
  camera.rotation.y = p.yaw;
  camera.rotation.x = p.pitch;
  viewmodel.update(dt, p.moving, aiming);
}

// --- staging scenes -------------------------------------------------------------
function applyStaging(mode) {
  deployed = true;
  hud.showStart(false);
  match.startMatch();
  const p = match.player;
  if (mode === 'buy') {
    // Buy phase, menu open: the default startRound state already does this.
    return;
  }
  // Skip the buy phase for action scenes.
  match.phase = 'live';
  match.timer = mode === 'smoke' ? 30 : 90;
  match.stagingFreeze = mode === 'cover' || mode === 'plant' || mode === 'action';
  for (const a of match.actors) a.frozen = false;
  p.money = 10000; // staging scenes arm the player outright
  if (mode === 'cover') {
    // Player on the south-west rise, looking north-east across mid: three
    // Wardens in the open ahead, allies out of the line of fire.
    p.pos.set(-14, 0, 10); p.yaw = -0.32; p.pitch = -0.05;
    p.buyWeapon('rifle');
    const enemies = match.actors.filter((a) => a.team === TEAMS.WARDEN);
    enemies[0].pos.set(-8, 0, 4); enemies[0].yaw = 2.4;
    enemies[1].pos.set(-5, 0, 8); enemies[1].yaw = 1.8;
    enemies[2].pos.set(-10, 0, 0); enemies[2].yaw = 2.8;
    const allies = match.actors.filter((a) => a.team === TEAMS.VANGUARD && !a.isPlayer);
    allies[0].pos.set(-18, 0, 13); allies[0].yaw = -0.3;
    allies[1].pos.set(-10, 0, 15); allies[1].yaw = -0.4;
  } else if (mode === 'plant') {
    p.pos.set(18, 0, 13); p.yaw = 2.6; p.pitch = 0.05;
    p.buyWeapon('rifle');
    match.plantCharge(p, 'depot');
    match.charge.timer = 32;
    // Step back south of the site so the planted Charge is in frame with
    // the lamp pole out of the centre line.
    p.pos.set(14, 0, 16); p.yaw = -0.93; p.pitch = -0.1;
  } else if (mode === 'action') {
    p.pos.set(2, 0, 10); p.yaw = -0.5; p.pitch = 0.02;
    p.buyWeapon('rifle');
    p.grenades.smoke = 1;
    match.throwGrenade(p, 'smoke');
    const enemies = match.actors.filter((a) => a.team === TEAMS.WARDEN);
    enemies[0].pos.set(8, 0, -4); enemies[0].yaw = 2.4;
    enemies[1].pos.set(12, 0, 2); enemies[1].yaw = 2.6;
  } else if (mode === 'smoke') {
    // Smoke test: both teams dropped into the mid-yard so the round resolves
    // by elimination within the short timer.
    p.pos.set(-4, 0, 0); p.yaw = -Math.PI / 2; p.pitch = 0;
    p.buyWeapon('rifle');
    const enemies = match.actors.filter((a) => a.team === TEAMS.WARDEN);
    enemies.forEach((e, i) => { e.pos.set(4 + (i % 2) * 3, 0, -4 + i * 2); e.yaw = Math.PI / 2; });
    const allies = match.actors.filter((a) => a.team === TEAMS.VANGUARD && !a.isPlayer);
    allies.forEach((a, i) => { a.pos.set(-7, 0, -3 + i * 2); a.yaw = -Math.PI / 2; });
  }
  for (const a of match.actors) {
    if (a.mesh) { a.mesh.position.copy(a.pos); a.mesh.rotation.y = a.yaw; }
  }
  syncWeaponHud();
}

// --- main loop -------------------------------------------------------------------
let last = performance.now();
let acc = 0;
let frames = 0;

function loop(now) {
  requestAnimationFrame(loop);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  acc += dt;
  let steps = 0;
  while (acc >= SIM_DT && steps < 5) {
    playerStep(SIM_DT);
    match.update(SIM_DT);
    drainEvents();
    acc -= SIM_DT;
    steps++;
  }
  if (steps === 5) acc = 0;
  effects.update(dt);
  hudFrame(dt);
  renderer.render(scene, camera);
  frames++;
  if (frames === 5) {
    window.__sp.ready = true;
  }
}

// --- test hooks (small, labelled; the smoke test drives the game through them)
window.__sp = {
  version: 'sablepoint-fps01',
  ready: false,
  match,
  player: match.player,
  deploy,
  state() {
    return {
      phase: match.phase,
      round: match.round,
      timer: Math.round(match.timer * 10) / 10,
      score: { ...match.score },
      vanguardAlive: match.actors.filter((a) => a.team === TEAMS.VANGUARD && a.alive).length,
      wardenAlive: match.actors.filter((a) => a.team === TEAMS.WARDEN && a.alive).length,
      playerHp: match.player.hp,
      playerAmmo: match.player.weapon.mag,
      chargePlanted: match.charge.planted,
    };
  },
  fire() {
    lookDirInto(_look);
    return match.fireWeapon(match.player, _look, match.time, 0);
  },
  teleport(x, z, yaw) {
    const p = match.player;
    p.pos.set(x, 0, z);
    if (yaw !== undefined) p.yaw = yaw;
  },
  setTimer(s) { match.timer = s; },
};

if (STAGING) applyStaging(STAGING);
requestAnimationFrame(loop);
