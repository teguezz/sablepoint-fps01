// SABLEPOINT — procedural textures. Every surface is painted on a canvas at
// load time, so the game ships zero image assets and loads nothing over the
// network. One seeded helper keeps the look stable between runs.

import * as THREE from 'three';

// Tiny deterministic RNG so the yard looks the same every load.
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  return [c, c.getContext('2d')];
}

function finish(c, repeat = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function speckle(ctx, size, rng, colors, n, rMin, rMax, alpha = 0.5) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[(rng() * colors.length) | 0];
    ctx.globalAlpha = alpha * (0.4 + rng() * 0.6);
    const r = rMin + rng() * (rMax - rMin);
    ctx.beginPath();
    ctx.arc(rng() * size, rng() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function streaks(ctx, size, rng, color, n, vertical = false) {
  ctx.strokeStyle = color;
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = 0.08 + rng() * 0.22;
    ctx.lineWidth = 1 + rng() * 3;
    const x = rng() * size, y = rng() * size, len = 20 + rng() * 90;
    ctx.beginPath();
    ctx.moveTo(x, y);
    if (vertical) ctx.lineTo(x + (rng() - 0.5) * 6, y + len);
    else ctx.lineTo(x + len, y + (rng() - 0.5) * 6);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function concrete(rng) {
  const [c, ctx] = canvas(256);
  ctx.fillStyle = '#6f6a63'; ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, rng, ['#7d7870', '#5d5952', '#8a847c', '#4e4a44'], 900, 1, 5);
  streaks(ctx, 256, rng, '#3f3c37', 26);
  // expansion joints
  ctx.strokeStyle = '#45413b'; ctx.lineWidth = 3;
  ctx.strokeRect(1, 1, 254, 254);
  ctx.beginPath(); ctx.moveTo(128, 0); ctx.lineTo(128, 256); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, 128); ctx.lineTo(256, 128); ctx.stroke();
  return finish(c, 8);
}

function rustMetal(rng, base = '#7a4a28') {
  const [c, ctx] = canvas(256);
  ctx.fillStyle = base; ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, rng, ['#8f5a30', '#5e3418', '#a06a38', '#4a2a12', '#9c7a4a'], 1100, 1, 7);
  streaks(ctx, 256, rng, '#3d220e', 40, true);
  streaks(ctx, 256, rng, '#c98d4e', 18, true);
  // panel seams
  ctx.strokeStyle = 'rgba(30,16,6,0.7)'; ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(256, i * 64); ctx.stroke();
  }
  return finish(c, 2);
}

function hazard() {
  const [c, ctx] = canvas(256);
  ctx.fillStyle = '#d8a419'; ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#1c1a18';
  for (let x = -256; x < 512; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 256); ctx.lineTo(x + 32, 256); ctx.lineTo(x + 288, 0); ctx.lineTo(x + 256, 0);
    ctx.closePath(); ctx.fill();
  }
  return finish(c, 1);
}

function crateWood(rng) {
  const [c, ctx] = canvas(256);
  ctx.fillStyle = '#8a6b42'; ctx.fillRect(0, 0, 256, 256);
  for (let p = 0; p < 4; p++) {
    const y = p * 64;
    ctx.fillStyle = p % 2 ? '#84663e' : '#90744a';
    ctx.fillRect(0, y, 256, 62);
    ctx.strokeStyle = '#5d4526'; ctx.lineWidth = 2;
    ctx.strokeRect(0, y, 256, 62);
    for (let i = 0; i < 22; i++) {
      ctx.strokeStyle = 'rgba(70,50,25,0.35)'; ctx.lineWidth = 1;
      const yy = y + 4 + rng() * 54;
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(256, yy + (rng() - 0.5) * 8); ctx.stroke();
    }
  }
  ctx.strokeStyle = '#4a3419'; ctx.lineWidth = 8; ctx.strokeRect(4, 4, 248, 248);
  return finish(c, 1);
}

function floorPlate(rng) {
  const [c, ctx] = canvas(256);
  ctx.fillStyle = '#3c3a38'; ctx.fillRect(0, 0, 256, 256);
  speckle(ctx, 256, rng, ['#464442', '#2e2c2a', '#55524e'], 700, 1, 4);
  // checker plates
  ctx.strokeStyle = 'rgba(20,18,16,0.8)'; ctx.lineWidth = 2;
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) ctx.strokeRect(x * 64 + 1, y * 64 + 1, 62, 62);
  // rivets
  ctx.fillStyle = '#191817';
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    ctx.beginPath(); ctx.arc(x * 64 + 32, y * 64 + 32, 3, 0, Math.PI * 2); ctx.fill();
  }
  streaks(ctx, 256, rng, '#241f1a', 20);
  return finish(c, 10);
}

function containerSide(rng, base, stripe) {
  const [c, ctx] = canvas(256);
  ctx.fillStyle = base; ctx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 16) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(x, 0, 4, 256);
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(x + 8, 0, 3, 256);
  }
  speckle(ctx, 256, rng, [stripe, '#2a1c10', '#00000055'], 260, 1, 6);
  streaks(ctx, 256, rng, '#1d1208', 22, true);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, 256, 10);
  ctx.fillRect(0, 246, 256, 10);
  return finish(c, 1);
}

function skyDome() {
  const [c, ctx] = canvas(512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#1b2a4a');
  g.addColorStop(0.45, '#4a3a52');
  g.addColorStop(0.62, '#8a4a3a');
  g.addColorStop(0.72, '#d97a3a');
  g.addColorStop(0.8, '#2a2118');
  g.addColorStop(1, '#191512');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 512);
  // low sun glow
  const rg = ctx.createRadialGradient(256, 380, 8, 256, 380, 180);
  rg.addColorStop(0, 'rgba(255,190,110,0.9)');
  rg.addColorStop(0.4, 'rgba(255,140,70,0.35)');
  rg.addColorStop(1, 'rgba(255,140,70,0)');
  ctx.fillStyle = rg; ctx.fillRect(0, 0, 512, 512);
  const t = finish(c, 1);
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function sitePaint(color, letter) {
  const [c, ctx] = canvas(256);
  ctx.clearRect(0, 0, 256, 256);
  ctx.strokeStyle = color; ctx.lineWidth = 10;
  ctx.globalAlpha = 0.9;
  ctx.beginPath(); ctx.arc(128, 128, 104, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(128, 128, 78, 0, Math.PI * 2); ctx.stroke();
  ctx.font = 'bold 44px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(letter, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function buildTextures() {
  const rng = mulberry(1337);
  return {
    concrete: concrete(rng),
    rust: rustMetal(rng),
    rustDark: rustMetal(rng, '#5e3a20'),
    hazard: hazard(),
    crate: crateWood(rng),
    floor: floorPlate(rng),
    containerAmber: containerSide(rng, '#8a5a1e', '#b98a3e'),
    containerBlue: containerSide(rng, '#2e4a66', '#5a7a9e'),
    containerGreen: containerSide(rng, '#3d5a34', '#6a8a52'),
    sky: skyDome(),
    siteA: sitePaint('#e8a33d', 'A'),
    siteB: sitePaint('#5b9bd5', 'B'),
  };
}
