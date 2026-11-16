// SABLEPOINT — the HUD. All DOM, no canvas except the minimap: health and
// armour, ammo and money, round timer and score, kill feed, buy menu,
// crosshair, hitmarker, plant/defuse bar and the overlays. The simulation
// never touches the DOM; game.js calls these setters on change, and the
// minimap redraws once a frame.

import { CONFIG, WEAPONS, WEAPON_ORDER, GRENADES, TEAM_INFO, TEAMS } from './config.js';

function el(tag, cls, parent, text = '') {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

export class Hud {
  constructor(root, callbacks) {
    this.cb = callbacks; // { onBuy(id), onStart() }
    this.root = root;
    this.spotted = new Map(); // actor id -> last seen time (seconds, sim clock)
    this.lastTimerText = '';

    // Crosshair: four ticks around a dot, spread driven by a CSS variable.
    this.cross = el('div', 'sp-cross', root);
    for (const c of ['t', 'b', 'l', 'r']) el('div', `sp-cross-${c}`, this.cross);
    el('div', 'sp-cross-dot', this.cross);
    this.hitmark = el('div', 'sp-hit', root);
    for (const c of ['a', 'b', 'c', 'd']) el('div', `sp-hit-${c}`, this.hitmark);

    // Top centre: timer + score.
    const top = el('div', 'sp-top', root);
    this.timerEl = el('div', 'sp-timer', top, '1:40');
    this.phaseEl = el('div', 'sp-phase', top, 'BUY PHASE');
    this.scoreEl = el('div', 'sp-score', top, '0 : 0');
    this.roundEl = el('div', 'sp-round', top, 'ROUND 1');

    // Kill feed, top left.
    this.feed = el('div', 'sp-feed', root);
    // Minimap, top right.
    this.mapCanvas = el('canvas', 'sp-map', root);
    this.mapCanvas.width = 188;
    this.mapCanvas.height = 142;
    this.mapCtx = this.mapCanvas.getContext('2d');

    // Bottom left: health / armour.
    const bl = el('div', 'sp-bl', root);
    this.hpEl = el('div', 'sp-hp', bl, '100');
    el('div', 'sp-hp-label', bl, 'HEALTH');
    this.armEl = el('div', 'sp-arm', bl, '');
    // Bottom right: ammo, money, grenades.
    const br = el('div', 'sp-br', root);
    this.ammoEl = el('div', 'sp-ammo', br, '12 / 36');
    this.wnameEl = el('div', 'sp-wname', br, 'VK-9 Sidearm');
    this.moneyEl = el('div', 'sp-money', br, '$800');
    this.nadeEl = el('div', 'sp-nades', br, '');

    // Centre banner and objective bar.
    this.banner = el('div', 'sp-banner', root);
    this.bannerTitle = el('div', 'sp-banner-title', this.banner);
    this.bannerSub = el('div', 'sp-banner-sub', this.banner);
    this.objBar = el('div', 'sp-obj', root);
    this.objLabel = el('div', 'sp-obj-label', this.objBar, '');
    this.objFill = el('div', 'sp-obj-fill', this.objBar);
    this.objBar.style.display = 'none';

    // Overlays: damage vignette, flash, buy menu, start, round end.
    this.vignette = el('div', 'sp-vignette', root);
    this.flashEl = el('div', 'sp-flash', root);
    this.buyMenu = el('div', 'sp-buy', root);
    el('div', 'sp-buy-title', this.buyMenu, 'BUY — press B to close');
    this.buyRows = el('div', 'sp-buy-rows', this.buyMenu);
    this.buyMenu.style.display = 'none';
    this.buyRowsBuilt = false;

    this.startOverlay = el('div', 'sp-start', root);
    el('div', 'sp-start-title', this.startOverlay, 'SABLEPOINT');
    el('div', 'sp-start-sub', this.startOverlay, 'Rustfall Yard — Vanguard vs Wardens — first to 7 rounds');
    el('div', 'sp-start-keys', this.startOverlay,
      'WASD move · Mouse aim · Click fire · R reload · C crouch · B buy · E plant / defuse · G grenade · 1/2 weapons');
    const btn = el('button', 'sp-start-btn', this.startOverlay, 'CLICK TO DEPLOY');
    btn.addEventListener('click', () => this.cb.onStart());

    this.endOverlay = el('div', 'sp-end', root);
    this.endTitle = el('div', 'sp-end-title', this.endOverlay, '');
    this.endSub = el('div', 'sp-end-sub', this.endOverlay, '');
    this.endOverlay.style.display = 'none';
    this.bannerTimer = 0;
  }

  // --- setters ------------------------------------------------------------
  setHealth(hp, armor) {
    this.hpEl.textContent = String(Math.ceil(hp));
    this.hpEl.classList.toggle('sp-low', hp <= 30);
    this.armEl.textContent = armor > 0 ? `ARMOUR ${Math.ceil(armor)}` : '';
  }

  setAmmo(mag, reserve, name) {
    this.ammoEl.textContent = `${mag} / ${reserve}`;
    this.ammoEl.classList.toggle('sp-low', mag === 0);
    this.wnameEl.textContent = name;
  }

  setMoney(n) {
    this.moneyEl.textContent = `$${n}`;
  }

  setNades(g) {
    this.nadeEl.textContent = `FRAG ${g.frag} · SMOKE ${g.smoke} · FLASH ${g.flash}`;
  }

  setTimer(seconds, phaseLabel) {
    const s = Math.max(0, Math.ceil(seconds));
    const text = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    if (text !== this.lastTimerText) {
      this.timerEl.textContent = text;
      this.lastTimerText = text;
    }
    this.phaseEl.textContent = phaseLabel;
  }

  setScore(v, w, round) {
    this.scoreEl.textContent = `${v} : ${w}`;
    this.roundEl.textContent = `ROUND ${round}`;
  }

  setCrosshairSpread(px) {
    this.cross.style.setProperty('--sp', `${px.toFixed(1)}px`);
  }

  hitmarker(kill) {
    this.hitmark.classList.remove('sp-show', 'sp-kill');
    void this.hitmark.offsetWidth;
    this.hitmark.classList.add('sp-show');
    if (kill) this.hitmark.classList.add('sp-kill');
    setTimeout(() => this.hitmark.classList.remove('sp-show', 'sp-kill'), 180);
  }

  damage() {
    this.vignette.classList.remove('sp-show');
    void this.vignette.offsetWidth;
    this.vignette.classList.add('sp-show');
    setTimeout(() => this.vignette.classList.remove('sp-show'), 350);
  }

  flashBang(strength) {
    this.flashEl.style.opacity = String(Math.min(1, strength));
    setTimeout(() => { this.flashEl.style.opacity = '0'; }, 60);
    this.flashEl.style.transition = 'opacity 1.2s';
    setTimeout(() => { this.flashEl.style.transition = 'opacity 0.15s'; }, 1300);
  }

  bannerShow(title, sub = '') {
    this.bannerTitle.textContent = title;
    this.bannerSub.textContent = sub;
    this.banner.classList.add('sp-show');
    this.bannerTimer = 2.6;
  }

  bannerTick(dt) {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.classList.remove('sp-show');
    }
  }

  feedAdd(killer, victim, head, weaponName) {
    const row = el('div', 'sp-feed-row', this.feed);
    const k = el('span', killer.team === TEAMS.VANGUARD ? 'sp-feed-v' : 'sp-feed-w', row, killer.name);
    el('span', 'sp-feed-wpn', row, ` ${head ? '⌖ ' : ''}${weaponName} `);
    el('span', victim.team === TEAMS.VANGUARD ? 'sp-feed-v' : 'sp-feed-w', row, victim.name);
    while (this.feed.children.length > 5) this.feed.removeChild(this.feed.firstChild);
    setTimeout(() => row.remove(), 6000);
  }

  objective(label, progress) {
    if (!label) { this.objBar.style.display = 'none'; return; }
    this.objBar.style.display = 'block';
    this.objLabel.textContent = label;
    this.objFill.style.width = `${Math.round(progress * 100)}%`;
  }

  showStart(show) { this.startOverlay.style.display = show ? 'flex' : 'none'; }

  showEnd(title, sub) {
    this.endTitle.textContent = title;
    this.endSub.textContent = sub;
    this.endOverlay.style.display = 'flex';
  }

  hideEnd() { this.endOverlay.style.display = 'none'; }

  // --- buy menu -------------------------------------------------------------
  buildBuyRows() {
    this.buyRows.innerHTML = '';
    const mk = (key, name, price, id, owned) => {
      const row = el('div', 'sp-buy-row', this.buyRows);
      el('span', 'sp-buy-key', row, key);
      el('span', 'sp-buy-name', row, name + (owned ? '  ✓' : ''));
      el('span', 'sp-buy-price', row, price === 0 ? 'FREE' : `$${price}`);
      row.addEventListener('click', () => this.cb.onBuy(id));
      return row;
    };
    WEAPON_ORDER.forEach((id, i) => {
      const w = WEAPONS[id];
      mk(String(i + 1), w.name, w.price, `weapon:${id}`, false);
    });
    mk('7', GRENADES.frag.name, GRENADES.frag.price, 'grenade:frag', false);
    mk('8', GRENADES.smoke.name, GRENADES.smoke.price, 'grenade:smoke', false);
    mk('9', GRENADES.flash.name, GRENADES.flash.price, 'grenade:flash', false);
    mk('0', 'Kevlar Armour', CONFIG.ARMOR_PRICE, 'armor', false);
    this.buyRowsBuilt = true;
  }

  showBuy(show, money) {
    if (show && !this.buyRowsBuilt) this.buildBuyRows();
    this.buyMenu.style.display = show ? 'block' : 'none';
    if (show) {
      // Grey out what the player cannot afford right now.
      const rows = this.buyRows.children;
      const prices = [...WEAPON_ORDER.map((id) => WEAPONS[id].price), 300, 300, 200, CONFIG.ARMOR_PRICE];
      for (let i = 0; i < rows.length; i++) {
        rows[i].classList.toggle('sp-cant', money < prices[i]);
      }
    }
  }

  // --- minimap ---------------------------------------------------------------
  drawMinimap(map, actors, charge, player, now) {
    const ctx = this.mapCtx;
    const W = this.mapCanvas.width, H = this.mapCanvas.height;
    const sx = W / (CONFIG.MAP_W + 4), sz = H / (CONFIG.MAP_D + 4);
    const toX = (x) => (x + CONFIG.MAP_W / 2 + 2) * sx;
    const toZ = (z) => (z + CONFIG.MAP_D / 2 + 2) * sz;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(12,10,8,0.72)';
    ctx.fillRect(0, 0, W, H);
    // Walls and cover.
    ctx.fillStyle = '#6a6258';
    for (const b of map.colliders) {
      ctx.fillRect(toX(b.minX), toZ(b.minZ), (b.maxX - b.minX) * sx, (b.maxZ - b.minZ) * sz);
    }
    // Sites.
    for (const key of Object.keys(map.sites)) {
      const s = map.sites[key];
      ctx.strokeStyle = key === 'foundry' ? '#e8a33d' : '#5b9bd5';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(toX(s.x), toZ(s.z), s.r * sx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(s.letter, toX(s.x), toZ(s.z));
    }
    // Charge.
    if (charge.planted) {
      ctx.fillStyle = '#ff4d2e';
      ctx.beginPath();
      ctx.arc(toX(charge.pos.x), toZ(charge.pos.z), 5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Actors: teammates always, enemies only while spotted.
    for (const a of actors) {
      if (!a.alive) continue;
      const isAlly = a.team === player.team;
      if (a.isPlayer) continue;
      if (!isAlly) {
        const seen = this.spotted.get(a.id);
        if (seen === undefined || now - seen > 3) continue;
      }
      ctx.fillStyle = isAlly ? TEAM_INFO[a.team].css : '#ff4d2e';
      ctx.beginPath();
      ctx.arc(toX(a.pos.x), toZ(a.pos.z), 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow.
    const px = toX(player.pos.x), pz = toZ(player.pos.z);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(-player.yaw);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(-5, 5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
