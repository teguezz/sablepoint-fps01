# SABLEPOINT — Round-Based Tactical FPS

A Counter-Strike-style tactical shooter, fully original, running in the
browser on three.js 0.187.0. Two teams of five fight over **Rustfall Yard**,
a dusk-lit industrial scrap yard with two plant sites — the **Foundry** and
the **Depot**. You play on the Vanguard attackers with four bot teammates
against five Warden defenders.

## How a match plays

- **Buy phase (15 s):** spend the money you earned on weapons, grenades
  and armour. The buy menu opens automatically; press **B** to toggle it.
- **Round (100 s):** eliminate the enemy team, or plant the Charge at a
  site and defend it until it detonates (40 s). The defenders win by
  defusing it or running the clock out. First to **7 rounds** takes the match.
- **Economy:** $800 to start, $300 per kill, $3,250 for a round win, and a
  loss bonus starting at $1,900 that grows with consecutive losses.

## Arsenal

| Weapon | Price | Notes |
| --- | --- | --- |
| VK-9 Sidearm | free | starter pistol |
| Rattler-9 SMG | $1,500 | fast, close range |
| VK-47 Longshot | $2,700 | the all-rounder rifle |
| Deadeye-50 | $4,750 | one-shot sniper, slow bolt |
| Breacher-12 | $1,700 | 8-pellet shotgun |
| Anvil-60 LMG | $5,200 | 60-round suppressive fire |

Plus Frag ($300), Smoke ($300) and Flash ($200) grenades and Kevlar armour
($650). Headshots deal 4× damage; recoil and spread punish firing on the
move, so stopping to aim pays. Weapons reload and run dry.

## Controls

- **WASD** move · **Mouse** aim (click to lock the pointer) · **Click** fire
- **R** reload · **C / Ctrl** crouch · **Right mouse** aim down sights
- **B** buy menu · **1 / 2** switch weapon · **Q** last weapon
- **E** (hold) plant the Charge · **G** throw grenade

## The bots

Bots navigate with A* over the yard's lanes, hold angles at the sites,
react to what they see and hear (gunfire pulls an investigation), fight in
bursts with human reaction times and aim error, plant when they carry the
Charge, and retake to defuse when it is planted.

## Playing it

```sh
node serve.ts        # serves game/ at http://localhost:8080
```

Open the page, click **CLICK TO DEPLOY**, and play. No build step, no
network requests: the game is static files under `game/`, with three.js
vendored in `game/vendor/three/`.

## Layout

- `game/index.html` — the page, import map, all HUD styling
- `game/src/main.js` — boot, input, fixed-step loop, staging scenes
- `game/src/game.js` — the match: phases, economy, charge, hit resolution
- `game/src/actors.js` — player and bot bodies: movement, collision, damage
- `game/src/bots.js` — bot brains: A* routes, vision, hearing, combat
- `game/src/map.js` — Rustfall Yard: geometry, colliders, sites, spawns
- `game/src/nav.js` — grid A* and line-of-sight tests
- `game/src/weapons.js` — weapon state, spread, damage falloff
- `game/src/textures.js` — procedural canvas textures (zero image assets)
- `game/src/effects.js` — pooled tracers, sparks, smoke, explosions
- `game/src/audio.js` — synthesized WebAudio sounds (zero audio assets)
- `game/src/viewmodel.js` — first-person weapon model
- `game/src/hud.js` — DOM HUD, buy menu, minimap
- `game/src/config.js` — every tuning number in one place
- `main.ts` — the make.fun entrypoint: copies the game and writes the dossier
- `serve.ts` — the local static server

## Screenshots

`?staging=cover|buy|plant|action` loads a live scene set up for capture;
`screenshots/` holds four real renders of the game's own code at 1280×720.

MIT licensed — see `LICENSE`.
