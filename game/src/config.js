// SABLEPOINT — shared tuning and data. One place for every number the
// simulation, the bots and the HUD agree on. No three.js import here so the
// economy and weapon tables stay pure data.

export const CONFIG = {
  // Rustfall Yard, in metres. X runs west(-) to east(+), Z north(-) to south(+).
  MAP_W: 64,
  MAP_D: 48,
  WALL_H: 4.6,
  EYE_STAND: 1.62,
  EYE_CROUCH: 1.08,
  PLAYER_RADIUS: 0.42,
  GRAVITY: 0, // flat yard: no vertical physics, eye height is fixed

  // Round flow (seconds).
  BUY_TIME: 15,
  ROUND_TIME: 100,
  PLANT_TIME: 4,
  DEFUSE_TIME: 5,
  CHARGE_TIME: 40,
  ROUNDS_TO_WIN: 7,
  ROUND_END_PAUSE: 4,

  // Economy (dollars).
  START_MONEY: 800,
  KILL_REWARD: 300,
  WIN_REWARD: 3250,
  LOSS_BASE: 1900,
  LOSS_STREAK_STEP: 500,
  LOSS_MAX: 3400,
  ARMOR_PRICE: 650,

  // Movement (m/s and accel).
  WALK_SPEED: 5.4,
  CROUCH_SPEED: 2.7,
  AIM_SPEED: 3.6,
  ACCEL: 46,
  FRICTION: 11,

  // Combat.
  HEADSHOT_MULT: 4,
  ARMOR_ABSORB: 0.5, // half of a hit's damage goes to armour first
  BOT_COUNT_ALLY: 4,
  BOT_COUNT_ENEMY: 5,
};

export const TEAMS = {
  VANGUARD: 'vanguard', // attackers, the player's team
  WARDEN: 'warden', // defenders
};

export const TEAM_INFO = {
  [TEAMS.VANGUARD]: { name: 'Vanguard', color: 0xd98a2b, css: '#e8a33d', spawn: 'west' },
  [TEAMS.WARDEN]: { name: 'Wardens', color: 0x4a7fb5, css: '#5b9bd5', spawn: 'east' },
};

// Weapon table. damage = body damage at close range; falloff trims it past
// rangeStart. spread is radians of cone half-angle at rest.
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'VK-9 Sidearm', slot: 'sidearm', price: 0,
    damage: 34, headMult: 4, intervalMs: 150, auto: false,
    mag: 12, reserve: 36, reloadMs: 1400, spread: 0.011, moveSpread: 0.030,
    recoil: 0.011, bloom: 0.004, rangeStart: 18, rangeEnd: 45, pellets: 1,
    kick: 0.05, tracer: 0xffd27a, sound: 'pistol',
  },
  smg: {
    id: 'smg', name: 'Rattler-9 SMG', slot: 'primary', price: 1500,
    damage: 26, headMult: 4, intervalMs: 88, auto: true,
    mag: 30, reserve: 90, reloadMs: 2100, spread: 0.016, moveSpread: 0.042,
    recoil: 0.009, bloom: 0.005, rangeStart: 14, rangeEnd: 38, pellets: 1,
    kick: 0.04, tracer: 0xffd27a, sound: 'smg',
  },
  rifle: {
    id: 'rifle', name: 'VK-47 Longshot', slot: 'primary', price: 2700,
    damage: 33, headMult: 4, intervalMs: 108, auto: true,
    mag: 30, reserve: 90, reloadMs: 2400, spread: 0.009, moveSpread: 0.036,
    recoil: 0.014, bloom: 0.005, rangeStart: 20, rangeEnd: 60, pellets: 1,
    kick: 0.06, tracer: 0xffe9a8, sound: 'rifle',
  },
  sniper: {
    id: 'sniper', name: 'Deadeye-50', slot: 'primary', price: 4750,
    damage: 115, headMult: 2, intervalMs: 1450, auto: false,
    mag: 5, reserve: 15, reloadMs: 3300, spread: 0.002, moveSpread: 0.09,
    recoil: 0.05, bloom: 0.0, rangeStart: 30, rangeEnd: 90, pellets: 1,
    kick: 0.16, tracer: 0xfff2c0, sound: 'sniper',
  },
  shotgun: {
    id: 'shotgun', name: 'Breacher-12', slot: 'primary', price: 1700,
    damage: 22, headMult: 3, intervalMs: 850, auto: false,
    mag: 6, reserve: 24, reloadMs: 2600, spread: 0.05, moveSpread: 0.06,
    recoil: 0.035, bloom: 0.0, rangeStart: 6, rangeEnd: 20, pellets: 8,
    kick: 0.12, tracer: 0xffc46b, sound: 'shotgun',
  },
  lmg: {
    id: 'lmg', name: 'Anvil-60 LMG', slot: 'primary', price: 5200,
    damage: 30, headMult: 4, intervalMs: 118, auto: true,
    mag: 60, reserve: 120, reloadMs: 4300, spread: 0.02, moveSpread: 0.05,
    recoil: 0.012, bloom: 0.006, rangeStart: 18, rangeEnd: 55, pellets: 1,
    kick: 0.05, tracer: 0xffe9a8, sound: 'lmg',
  },
};

export const WEAPON_ORDER = ['pistol', 'smg', 'rifle', 'sniper', 'shotgun', 'lmg'];

export const GRENADES = {
  frag: { id: 'frag', name: 'Frag Grenade', price: 300, key: '7' },
  smoke: { id: 'smoke', name: 'Smoke Grenade', price: 300, key: '8' },
  flash: { id: 'flash', name: 'Flash Grenade', price: 200, key: '9' },
};

export const BOT_NAMES = {
  [TEAMS.VANGUARD]: ['Rook', 'Havoc', 'Juno', 'Marrow'],
  [TEAMS.WARDEN]: ['Bastion', 'Ferro', 'Kestrel', 'Vanta', 'Sable'],
};

export const MAP_NAME = 'Rustfall Yard';
export const SITE_NAMES = { foundry: 'Foundry', depot: 'Depot' };
