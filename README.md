# Foundry Arena

A complete browser first-person shooter: you, your friends and AI bots in a
free-for-all deathmatch. Play solo, or host a room and share the code. Three.js for rendering, Vite for tooling, plain JavaScript modules.
Everything is procedural — geometry from primitives, textures drawn on canvases,
sound synthesised with the Web Audio API. No assets are downloaded.

**▶ Play in your browser:** https://gorzawebk.github.io/FOUNDRY-ARENA/

**Repository:** https://github.com/GorzaWebK/FOUNDRY-ARENA

To run it locally:

```bash
git clone https://github.com/GorzaWebK/FOUNDRY-ARENA.git
cd FOUNDRY-ARENA
npm install
npm run dev
```

Open the printed URL (http://localhost:5173), pick a bot count and difficulty, press **PLAY**.

| Script              | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `npm run dev`       | dev server with hot reload                                |
| `npm run build`     | production build into `dist/`                             |
| `npm run preview`   | serve the production build                                |
| `npm run check:map` | validate the map + nav grid and print an ASCII overview   |

Every push to `main` is built and published to GitHub Pages by
`.github/workflows/deploy.yml`.

## Rules

- Free-for-all: you and 5 bots (1–10, set in the menu). Bots fight each other too.
- First to **20 kills** wins, or the highest score when the **10 minute** clock runs out.
- 100 HP, no regeneration. Respawn after 3 s at a spawn point away from enemies,
  with 2 s of spawn protection (firing ends it early).
- Pickups: health (+50), armour (+50, absorbs half of incoming damage), ammo boxes,
  rifle and shotgun crates. Health/armour/crates return after 30 s, ammo boxes after 20 s.

## Multiplayer

No server to set up — one player hosts the match in their browser and the others
connect to them directly.

1. **Host:** enter a name, press **Host game**. You are in the match straight away
   (bots included). Press `Esc` to see the room code and **Copy invite link**.
2. **Friends:** open the invite link (or type the code) and press **Join**. Joining
   mid-match is fine. Up to 8 humans, plus the host's bots.
3. The host starts the next match from the end screen; closing the room (or the
   host's tab) ends the session for everyone.

How it works:

- Connections are WebRTC data channels set up with [PeerJS](https://peerjs.com/).
  Browsers find each other through PeerJS's free public signalling server; once
  connected, game traffic flows directly between the players' browsers.
- The host is the authority for health, kills, respawns, pickups, the clock and
  all bots. Each player simulates their own movement and reports their own hits,
  which the host sanity-checks (rate of fire, distance, line of sight). That keeps
  shooting responsive at any ping, and is the right trade-off for playing with
  friends; it is not hardened against a determined cheater.
- A hosted match keeps running while the host's tab is in the background.
- If a connection goes quiet for 10 seconds the player is dropped (or, for a
  client, returned to the menu).

Limits worth knowing: very strict corporate / school networks can block
peer-to-peer connections, and the experience is only as good as the host's
connection, since everything relays through them.

For development: `?net=local` swaps WebRTC for a same-browser channel so two tabs
can play together offline, and `?peerhost=…&peerport=…&peersecure=1` points the
game at your own [PeerServer](https://github.com/peers/peerjs-server).

## Controls

| Input                 | Action                              |
| --------------------- | ----------------------------------- |
| `W` `A` `S` `D`       | move                                |
| Mouse                 | look (pointer lock)                 |
| Left click            | fire                                |
| Right click           | aim down sights                     |
| `Space`               | jump                                |
| `Shift`               | sprint                              |
| `C` or `Ctrl`         | crouch                              |
| `R`                   | reload                              |
| `1` `2` `3` / wheel   | pistol / assault rifle / shotgun    |
| `Tab`                 | scoreboard                          |
| `Esc` or `P`          | pause menu                          |

Prefer `C` for crouching: browsers reserve `Ctrl`+`W` for closing the tab (the game
asks for confirmation before the tab closes mid-match).

Sensitivity, field of view, volume, shadows, invert-Y, bot count, difficulty and
your multiplayer name are saved to `localStorage`.

## Weapons

| Weapon        | Mag / reserve | Damage      | Notes                                              |
| ------------- | ------------- | ----------- | -------------------------------------------------- |
| Pistol        | 12 / ∞        | 25          | semi-auto, accurate                                |
| Assault rifle | 30 / 60       | 15          | full auto, spread blooms with sustained fire       |
| Shotgun       | 6 / 12        | 8 × 10      | wide spread, falls off quickly with distance       |

All hitscan. Headshots deal 2×. Damage falls off with distance. Moving, jumping
and holding the trigger widen the cone; crouching and aiming tighten it.

## The bots

Each bot (`src/bot.js`) is a state machine layered on perception, navigation and
combat systems:

- **States** — Patrol, Chase, Attack, Retreat, Search, Collect.
- **Perception** — ~125° view cone plus line-of-sight raycasts; they hear gunshots
  and running footsteps, and remember where each enemy was last seen.
- **Navigation** — a multi-level nav grid is generated from the map at load
  (`src/navgrid.js`), searched with A*. Paths are string-pulled at runtime, bots
  steer around each other, drop off ledges where it is a shortcut, and recover
  if they ever get stuck.
- **Combat** — a reaction delay before the first shot, aim error that tightens the
  longer they track a target and grows when the target strafes, slight target
  leading, burst fire, stop-and-shoot footwork at range, weapon choice by distance,
  ducking behind cover to reload, and running for a health pack when hurt.
- **Personality** — every bot rolls its own aggression, aim and preferences, so
  they do not all behave alike.

Difficulty (Easy / Normal / Hard) changes reaction time, aim error, turn speed
and how much damage bots deal to you. Tune it in `src/config.js`.

## Editing the map

The arena is plain data in `src/maps/arena.js`: boxes, ramps and stairs, plus
spawn points, pickups, patrol points, materials, sky and lights. Collision, bullet
tests, rendering and the bot nav grid are all derived from that one file, so
editing it (or copying it to make a new map and importing that in `src/main.js`)
is all that is needed. Run `npm run check:map` afterwards — it confirms that every
spawn, pickup and patrol point is reachable by the bots.

## Project layout

```
index.html            HUD + menu markup
src/main.js           app flow: menus, pointer lock, pause, main loop
src/game.js           match rules, hitscan, damage, spawning, pickups
src/net.js            multiplayer session: host/client protocol
src/netChar.js        characters driven over the network (interpolated)
src/transport.js      PeerJS (WebRTC) and local-tab transports
src/config.js         gameplay tuning, difficulty presets, bot roster
src/maps/arena.js     the map (data only)
src/world.js          collision world built from map data (boxes + ramp wedges)
src/physics.js        character controller (step-up, ground snap, sliding)
src/navgrid.js        nav grid generation + A*
src/character.js      shared state / weapon handling for player and bots
src/player.js         player movement, camera, input handling
src/bot.js            bot AI
src/weapons.js        weapon definitions
src/viewmodel.js      first-person weapon models and animation
src/botModel.js       bot humanoid + name tag
src/worldMesh.js      merged world meshes, sky shader, lights
src/effects.js        particles, decals, tracers
src/pickups.js        pickups
src/audio.js          synthesised sound
src/hud.js            HUD
src/settings.js       saved settings
tools/check-map.mjs   offline map validator
```

Append `?nolock` to the URL to run without pointer lock (handy for debugging);
`window.__game` exposes the running game in the console.
