# Foundry Arena

A complete browser first-person shooter: you, your friends and AI bots in a
free-for-all deathmatch. Play solo, or host a room and share the code.
Three.js for rendering, Vite for tooling, plain JavaScript modules.
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

Open the printed URL (http://localhost:5173), pick a mode, a map and a loadout, press **PLAY SOLO**.

| Script              | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `npm run dev`       | dev server with hot reload                                |
| `npm run build`     | production build into `dist/`                             |
| `npm run preview`   | serve the production build                                |
| `npm run check:map` | validate every map + nav grid and print ASCII overviews   |

Every push to `main` is built and published to GitHub Pages by
`.github/workflows/deploy.yml`.

## Game modes

Pick one in the main menu for solo play, or as the host of a multiplayer room.
The pause menu's **Next match** section changes mode and map between matches.

| Mode                  | How it works                                                                  |
| --------------------- | ----------------------------------------------------------------------------- |
| **Deathmatch**        | free-for-all; first to 20 kills, or most kills after 10 minutes               |
| **Team Deathmatch**   | Blue vs Red, no friendly fire; first team to 40 kills. Humans are spread across both teams and bots fill the rest |
| **Gun Game**          | every 2 kills hand you the next gun: LMG → rifle → SMG → shotgun → sniper → pistol. One pistol kill wins. Unlimited reserve ammo |
| **Last One Standing** | 5 lives each, no respawns after that; the last player alive wins. You spectate from above once you are out, and players joining mid-round watch until the next one |
| **Snipers Only**      | free-for-all with sniper rifles and pistols; first to 15 kills                |

Every mode has a 10 minute clock; when it runs out the mode's best score wins.

## Killstreak announcer

Your multi-kills (Double, Triple, Quad, Mega Kill within 4 seconds of each other)
and streaks (Killing Spree at 3, Rampage 5, Dominating 7, Unstoppable 10, Godlike 15,
Legendary 20), plus First Blood and Shutdown (ending someone's streak), get a big
banner and a spoken call-out. Other players' big streaks show up in the kill feed.
The voice uses the browser's built-in speech synthesis, so no audio files are
needed; it can be switched off with **Announcer voice** in settings, and how it
sounds depends on the voices your browser and OS provide.

## Rules

- Bots fill the match (1–10, or switch them off entirely) and fight each other as
  well as you.
- 100 HP, no regeneration. Respawn after 3 s at a spawn point away from enemies,
  with 2 s of spawn protection (attacking ends it early).
- **Loadout:** you choose a primary weapon and always carry a pistol and 2 grenades
  (3 max). Change your primary any time from the pause menu; it applies on your
  next respawn.
- Pickups: health (+50), armour (+50, absorbs half of incoming damage), ammo boxes
  (primary ammo + 1 grenade) and supply crates (full ammo + grenades).
  Health, armour and crates return after 30 s, ammo boxes after 20 s.

## Controls

| Input                 | Action                                        |
| --------------------- | --------------------------------------------- |
| `W` `A` `S` `D`       | move                                          |
| Mouse                 | look (pointer lock)                           |
| Left click            | fire                                          |
| Right click           | aim down sights / scope                       |
| `Space`               | jump                                          |
| `Shift`               | sprint (firing or aiming pauses it)           |
| `C` or `Ctrl`         | crouch — press it **while sprinting to slide** |
| `Q` / `E`             | lean left / right                             |
| `F`                   | throw a grenade                               |
| `R`                   | reload                                        |
| `1` / `2` / wheel     | primary / pistol / swap                       |
| `Enter`               | chat (multiplayer)                            |
| `Tab`                 | scoreboard                                    |
| `Esc` or `P`          | pause menu                                    |

Prefer `C` for crouching: browsers reserve `Ctrl`+`W` for closing the tab (the game
asks for confirmation before the tab closes mid-match).

Leaning moves your head (and your shots) out sideways, so you can peek and shoot
around a corner while most of your body stays behind it. It won't push you into
a wall, and you can't lean while sprinting or sliding. A slide keeps your sprint
momentum for about a second with a low profile; jumping cancels it.

Sensitivity, field of view, volume, graphics quality, announcer voice, invert-Y,
mode, map, bots, difficulty, loadout and your multiplayer name are saved to
`localStorage`.
**Graphics: Low** turns off shadows and fill lights and renders at 75% resolution.

## Weapons

| Weapon        | Mag / reserve | Damage  | Notes                                               |
| ------------- | ------------- | ------- | --------------------------------------------------- |
| Assault rifle | 30 / 90       | 15      | full auto all-rounder; spread blooms as you hold fire |
| SMG           | 32 / 128      | 12      | fastest fire rate, accurate on the move, weak at range |
| Shotgun       | 6 / 24        | 8 × 10  | wide spread, falls off quickly with distance         |
| Sniper rifle  | 2 / 20        | 80      | bolt action; scoped shots are pinpoint, hip fire is not |
| LMG           | 60 / 120      | 17      | huge belt, heavy: slower movement, long reload       |
| Pistol        | 12 / ∞        | 25      | everyone's sidearm                                   |
| Grenade       | 2 (max 3)     | up to 130 | 2.3 s fuse, bounces, 7.5 m blast; walls block it; hurts you too |

All guns are hitscan, and reload by themselves when the magazine runs dry. Headshots deal 2×. Damage falls off with distance. Moving,
jumping and holding the trigger widen the cone; crouching and aiming tighten it.

## Maps

| Map          | Size      | Character                                                  |
| ------------ | --------- | ---------------------------------------------------------- |
| **Foundry**  | 80 × 80   | mixed arena: plaza, bunker, balcony, sniper walkway        |
| **Span**     | 100 × 48  | two raised bases joined by a long bridge; long sight lines |
| **Cloister** | 52 × 52   | tight courtyard with a covered walkway and catwalk ring    |

Each map is plain data in `src/maps/`: boxes, ramps and stairs, plus spawn
points, pickups, patrol points, materials, sky and lights. Collision, bullet
tests, rendering and the bot nav grid are all derived from that one file. To add
a map, copy one of the files, edit it and register it in `src/maps/index.js`.
Then run `npm run check:map` — it confirms that every spawn, pickup and patrol
point is reachable by the bots.

## Multiplayer

No server to set up — one player hosts the match in their browser and the others
connect to them directly.

1. **Host:** enter a name, choose the mode, the map and whether you want bots, press
   **Host game**. You are in the match straight away. Press `Esc` to see the room
   code and **Copy invite link**.
2. **Friends:** open the invite link (or type the code) and press **Join**. Joining
   mid-match is fine. Up to 8 humans, plus the host's bots.
3. Press `Enter` to chat.
4. The host can switch bots on or off mid-match from the pause menu, pick the
   next match's mode and map there, and restart or start the next match from the
   end screen. Closing the room (or the
   host's tab) ends the session for everyone.

How it works:

- Connections are WebRTC data channels set up with [PeerJS](https://peerjs.com/).
  Browsers find each other through PeerJS's free public signalling server; once
  connected, game traffic flows directly between the players' browsers.
- The host is the authority for health, kills, respawns, pickups, grenades, the
  clock and all bots. Each player simulates their own movement and reports their
  own hits, which the host sanity-checks (rate of fire, distance, line of sight).
  That keeps shooting responsive at any ping, and is the right trade-off for
  playing with friends; it is not hardened against a determined cheater.
- A hosted match keeps running while the host's tab is in the background.
- If a connection goes quiet for 10 seconds the player is dropped (or, for a
  client, returned to the menu).

Limits worth knowing: very strict corporate / school networks can block
peer-to-peer connections, and the experience is only as good as the host's
connection, since everything relays through them.

For development: `?net=local` swaps WebRTC for a same-browser channel so two tabs
can play together offline, and `?peerhost=…&peerport=…&peersecure=1` points the
game at your own [PeerServer](https://github.com/peers/peerjs-server).

## The bots

Each bot (`src/bot.js`) is a state machine layered on perception, navigation and
combat systems:

- **States** — Patrol, Chase, Attack, Retreat, Search, Collect.
- **Perception** — ~125° view cone plus line-of-sight raycasts; they hear gunshots,
  explosions and running footsteps, and remember where each enemy was last seen.
- **Navigation** — a multi-level nav grid is generated from the map at load
  (`src/navgrid.js`), searched with A*. Paths are string-pulled at runtime, bots
  steer around each other, drop off ledges where it is a shortcut, and recover
  if they ever get stuck.
- **Combat** — a reaction delay before the first shot, aim error that tightens the
  longer they track a target and grows when the target strafes, slight target
  leading, burst fire, stop-and-shoot footwork at range, ducking behind cover to
  reload, and running for a health pack when hurt.
- **Loadouts** — every bot has a favourite primary and plays to it: shotgunners
  close in, snipers hold still to shoot, and they draw the pistol when the
  primary runs dry at a bad moment.
- **Grenades** — they lob grenades at settled fights or to flush you out of
  cover, and run from grenades that land near them.
- **Personality** — every bot rolls its own aggression, aim and preferences, so
  they do not all behave alike.

Difficulty (Easy / Normal / Hard) changes reaction time, aim error, turn speed
and how much damage bots deal to you. Tune it in `src/config.js`.

## Project layout

```
index.html            HUD + menu markup
src/main.js           app flow: menus, pointer lock, pause, lobby, chat, main loop
src/game.js           match flow, hitscan, grenades, damage, spawning, pickups, streaks
src/modes.js          game modes: rules, scoring, ranking, HUD text, results
src/announcer.js      killstreak call-outs (banner + speech synthesis)
src/net.js            multiplayer session: host/client protocol
src/netChar.js        characters driven over the network (interpolated)
src/transport.js      PeerJS (WebRTC) and local-tab transports
src/config.js         gameplay tuning, difficulty presets, bot roster
src/maps/index.js     map registry
src/maps/*.js         the maps (data only)
src/world.js          collision world built from map data (boxes + ramp wedges)
src/physics.js        character controller (step-up, ground snap, sliding)
src/navgrid.js        nav grid generation + A*
src/character.js      shared state / weapon handling for player and bots
src/player.js         player movement (sprint, slide, lean), camera, input
src/bot.js            bot AI
src/weapons.js        weapon + grenade definitions, loadouts
src/viewmodel.js      first-person weapon models and animation
src/botModel.js       humanoid model + name tag
src/worldMesh.js      merged world meshes, sky shader, lights
src/effects.js        particles, decals, tracers, explosions
src/pickups.js        pickups
src/audio.js          synthesised sound
src/hud.js            HUD, chat log
src/settings.js       saved settings
tools/check-map.mjs   offline map validator
```

Append `?nolock` to the URL to run without pointer lock (handy for debugging);
`window.__game` exposes the running game in the console.
