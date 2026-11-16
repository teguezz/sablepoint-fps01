// SABLEPOINT — weapons. Data lives in config.js; this module owns the
// per-actor weapon state (magazine, reserve, timers) and the two pure
// functions gunplay is built on: spread and damage falloff.

import { WEAPONS, GRENADES } from './config.js';

export function makeWeaponState(id) {
  const def = WEAPONS[id];
  return {
    id,
    def,
    mag: def.mag,
    reserve: def.reserve,
    lastShotAt: -1e9,
    reloadingUntil: 0,
    bloom: 0, // per-shot spread growth, decays when not firing
  };
}

// Current cone half-angle (radians) for a shot.
export function currentSpread(ws, moving, crouched, aiming) {
  const d = ws.def;
  let s = d.spread + ws.bloom;
  if (moving) s += d.moveSpread;
  if (crouched) s *= 0.7;
  if (aiming) s *= 0.75;
  return s;
}

// Damage at a range, with the weapon's falloff curve.
export function damageAt(def, dist, head) {
  let dmg = def.damage;
  if (dist > def.rangeStart) {
    const t = Math.min(1, (dist - def.rangeStart) / Math.max(1, def.rangeEnd - def.rangeStart));
    dmg *= 1 - 0.55 * t;
  }
  if (head) dmg *= def.headMult;
  return dmg;
}

// Can this weapon fire right now? now is the sim clock in seconds.
export function canFire(ws, now) {
  return ws.mag > 0 && ws.reloadingUntil <= now && (now - ws.lastShotAt) * 1000 >= ws.def.intervalMs;
}

export function startReload(ws, now) {
  if (ws.reloadingUntil > now || ws.mag >= ws.def.mag || ws.reserve <= 0) return false;
  ws.reloadingUntil = now + ws.def.reloadMs / 1000;
  return true;
}

export function finishReload(ws) {
  const need = ws.def.mag - ws.mag;
  const take = Math.min(need, ws.reserve);
  ws.mag += take;
  ws.reserve -= take;
  ws.reloadingUntil = 0;
}

export function consumeShot(ws, now) {
  ws.mag -= 1;
  ws.lastShotAt = now;
  ws.bloom = Math.min(0.05, ws.bloom + ws.def.bloom);
}

export function decayBloom(ws, dt) {
  ws.bloom = Math.max(0, ws.bloom - dt * 0.09);
}

export function grenadeList() {
  return [GRENADES.frag, GRENADES.smoke, GRENADES.flash];
}
