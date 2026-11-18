# Foundry Arena

*Six crews. Six yards. Nobody clocks off until the whistle.*

An arena shooter with its own look: tempered steel and safety orange, stencil
type, a crew of bots named for the shop floor (Slag, Rivet, Cinder, Anvil, Flux…)
and two teams, **Cobalt** (blue) and **Crimson** (red).

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

The main menu keeps to the essentials: **Match** (mode, rules, map, bots,
difficulty), **Loadout** and **Play with friends**, with Play Solo and the
Training Range under them. **Settings**, **Controls**, **Career** and
**Account** are buttons along the bottom that open their own panels.
The pause menu's **Next match** section changes mode and map between matches.

| Mode                  | How it works                                                                  |
| --------------------- | ----------------------------------------------------------------------------- |
| **Deathmatch**        | free-for-all; first to 20 kills, or most kills after 10 minutes               |
| **King of the Hill**  | Cobalt vs Crimson over a zone that moves every minute; a team scores a point a second while it holds the zone with no enemies inside. First to 100. A light pillar marks the zone and a HUD marker points to it |
| **Team Deathmatch**   | Cobalt vs Crimson, no friendly fire; first team to 40 kills. Humans are spread across both teams and bots fill the rest |
| **Capture the Flag**  | Cobalt vs Crimson, a flag at each base. Touch the enemy flag to take it and carry it to your own base while your flag is at home to score; first to 3 captures. A carrier who dies drops the flag: their team can pick it back up, and yours sends it home with a touch (or it goes home by itself after 20 s). Markers show where both flags are; you spawn on your own side. Bots attack, defend, escort carriers and hunt anyone who has their flag |
| **Gun Game**          | every 2 kills hand you the next gun: LMG → rifle → SMG → shotgun → sniper → pistol. One pistol kill wins. Unlimited reserve ammo |
| **Last One Standing** | 5 lives each, no respawns after that; the last player alive wins. Once you're out you spectate the survivors over their shoulder (fire / aim to cycle, jump for the overhead view); players joining mid-round watch until the next one |
| **Snipers Only**      | free-for-all with sniper rifles and pistols; first to 15 kills                |

Every mode has a 10 minute clock; when it runs out the mode's best score wins.

In team modes, **Team** on the main menu picks Cobalt, Crimson or Auto, and the
pause menu's **Switch team** button moves you mid-match (you respawn on your new
side). Bots fill in around the players and move across to keep the teams even,
so you and a friend can both pick the same side and take on the bots together.

**Rules…** (next to the mode, on the main menu and in the pause menu's Next match
section) customises the next match: the score limit (kills, points or lives,
depending on the mode), the time limit (5–30 minutes), friendly fire in team
modes (team kills hurt but score nothing), pickups on or off, and **hardcore**:
50 HP, with no crosshair, health or ammo on screen. In multiplayer the host's
rules apply to everyone.

## End of a match

The end screen shows the final scores, **awards** (Sharpshooter for best
accuracy, Headhunter, Unstoppable for the longest streak, Long Shot, Demolitions,
Butcher, Hill Keeper, Flag Runner, Defender, and Punching Bag for the most deaths) and three choices for
the **next match**: the map and mode lined up in the menu, plus two others.
Solo, you pick one and press **Play again**. In multiplayer everyone votes; the
host can start whenever they like, and the next match starts by itself after
30 seconds. Most votes wins, and a tie goes to the host's pick.

## Tutorial

New players are offered a two-minute tutorial on their first visit (also under
**Controls → Play the tutorial**). It runs on the training range and walks
through twelve steps: look, move, sprint, jump, crouch, slide, aim, shoot,
reload, switch weapons, grenades, and knife and lean. Each step shows your own
key for it and ticks off once you've actually done it.

## Accessibility

- **Team colours** (Settings): standard blue / red, or palettes for red-green
  colour blindness (blue / orange), blue-yellow colour blindness (cyan / pink)
  and high contrast (blue / yellow). It changes only what you see: the teams are
  still Cobalt and Crimson, and it applies in rooms other people host too.
- **Gentler flashbangs** (Settings): a flash fades in to grey instead of a sudden
  white screen, with a much quieter ring. It blinds you just as long, so it
  isn't an advantage.
- **Field of view**, sensitivity, invert Y, toggle lean, crosshair style and
  every key binding are adjustable too.

## Training range

**TRAINING RANGE** on the main menu opens a practice map with no bots and
unlimited ammo: static targets at 10, 20, 30 and 40 m, moving targets, pop-ups,
and a close-quarters corner. Walk onto a weapon stand to switch guns. Hits show
damage numbers (yellow for headshots) and a panel tracks shots, accuracy,
headshots and targets down. Step on the orange pad for a 30-second challenge:
knock down as many targets as you can. Your best is saved.

## Kill cam

When you die, the game replays the last couple of seconds from your killer's
eyes while you wait to respawn. Every player's machine records a short rolling
history of what it sees, so it works in solo and multiplayer alike. It can be
switched off with **Kill cam** in settings.

## Killstreak announcer

Your multi-kills (Double, Triple, Quad, Mega Kill within 4 seconds of each other)
and streaks (Killing Spree at 3, Rampage 5, Dominating 7, Unstoppable 10, Godlike 15,
Legendary 20), plus First Blood and Shutdown (ending someone's streak), get a big
banner and a sting. Other players' big streaks show up in the kill feed. Call-outs
are on-screen text only (there's no spoken voice).

## Sound

Everything is synthesised in the browser (`src/audio.js`), no audio files:

- **Guns** are built in layers: a sharp crack, the body of the blast, a low thump,
  the gun's own mechanism (bolt, pump, belt) up close, and a tail. Each shot is
  detuned slightly so automatic fire doesn't loop.
- A shared **room reverb** (a generated impulse response) takes more of a sound the
  further away it is, so a distant fight sounds distant instead of silent.
- **Footsteps** change with what you're standing on: metal plating and sheet
  rings, wood knocks, concrete thuds, sand crunches. Maps can override a
  material's surface with `surface:` in their materials list.
- **Music stings** for the match starting, the last minute (with an on-screen
  call), and the end (victory or defeat).

## Rules

- Bots fill the match (1–10, or switch them off entirely) and fight each other as
  well as you.
- 100 HP, no regeneration. Respawn after 3 s at a spawn point away from enemies,
  with 2 s of spawn protection (attacking ends it early).
- **Loadout:** you choose a primary weapon and always carry a pistol and 2 grenades
  (3 max), plus your choice of 2 flashbangs or 2 smoke grenades. Change your primary any time from the pause menu; it applies on your
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
| `C` or `Ctrl`         | crouch — press it **while sprinting to slide**, again to cancel the slide |
| `Q` / `E`             | lean left / right (tap to toggle; hold if **Toggle lean** is off) |
| `F`                   | grenade: hold to cook, release to throw       |
| `G`                   | flashbang / smoke (whichever you picked)      |
| `V`                   | knife                                         |
| `T`                   | inspect your weapon                           |
| `R`                   | reload                                        |
| `1` / `2` / wheel     | primary / pistol / swap                       |
| `Enter`               | chat (multiplayer)                            |
| `Tab`                 | scoreboard                                    |
| `Esc` or `P`          | pause menu                                    |

These are the defaults. **Controls → Change controls…** (main menu toolbar) or
**Change controls…** (pause menu) lets you
rebind every action to any key or mouse button, with two slots per action; a key
can only do one thing, so binding it takes it away from whatever had it. `Esc`
always pauses and the mouse wheel always swaps weapons. Avoid `Ctrl` combos:
browsers reserve `Ctrl`+`W` for closing the tab (the game asks for confirmation
before the tab closes mid-match).

Leaning moves your head (and your shots) out sideways, so you can peek and shoot
around a corner while most of your body stays behind it. It won't push you into
a wall, and you can't lean while sprinting or sliding. A slide keeps your sprint
momentum for about a second with a low profile; jumping or pressing crouch
again cancels it.

Sensitivity, field of view, volume, graphics quality, announcer voice, kill cam,
invert-Y, crosshair, key bindings, mode, map, bots, difficulty, loadout, your
multiplayer name and your training-range best are saved to `localStorage`.
### Career stats

**Career** (in the main menu's toolbar) shows your totals across
every match you play, solo or multiplayer: matches, wins and win rate, kills,
deaths, K/D, accuracy, headshots, best streak, longest kill, knife and grenade
kills, time played, and kills with each weapon. The training range and the menu
background don't count, and a match only counts once you've played 20 seconds
of it. Career stats are part of your account, so they move with your account code.

### XP, levels and Customize

Matches earn XP (the training range doesn't): 100 a kill, plus bonuses for
headshots, knife and grenade kills, long shots (40 m+) and streaks, 75 for taking
a flag, 100 for returning one, 400 for a capture, 4 a second on the hill, 150 per
end-of-match award, 200 for finishing a match and 300 more for winning. XP pops up
by the crosshair, and the end screen shows the total, the breakdown and your
progress to the next level.

There are 50 levels, and every level unlocks something in **Customize** (main
menu toolbar). It's all looks, nothing that changes how the game plays: titles,
name-tag styles, calling cards (shown on the kill cam when you get someone),
helmets, armour colours, shoulder pads, tracer colours, kill effects, grenade and
knife finishes, weapon charms and crosshair shapes. Other players see your level,
title, name tag, calling card, gear, tracers, grenades and kill effects. Your
level and unlocks are saved with your account.

At level 50 you can **Prestige** (in Customize): back to level 1 with a prestige
star next to your level (★1, ★2… up to 10). Level unlocks come back as you level
up again; prestige-only items (the Reborn and Immortal titles, the Prestige name
tag, the Gilded calling card), weapon skins and career stats are kept.


Every item in Customize has a preview: helmets, armour and shoulder pads are shown on a crew member, and charms, knives and grenades are rendered from the in-game models; tracers, kill effects and crosshair shapes get a drawn sample.

### Daily challenges

The **Today** card on the main menu has three challenges, the same for everyone
on the same day and fresh at midnight: things like 15 kills with one gun, 8
headshot kills, a 5-kill streak, capturing 2 flags or winning a Team Deathmatch
match. Each is worth 500 to 900 XP, paid the moment you finish it (with a
call-out if you're mid-match). They count in any match except the training range.

### Weekly challenges

Switch the card to **This week** for three bigger goals (150 kills, 40 headshot
kills, 8 wins, 8 flag captures and so on), picked fresh every Monday. Each pays
2,500 XP. Finish all three in one week and it counts as a **full week**: your
first full week unlocks the **Overtime** calling card, and five full weeks
unlock **Night Shift**. Neither can be earned any other way.

### Ranked

Press **Ranked** (Play online card) to play for your **skill rating (SR)**. It
drops you into the fullest open ranked room, or hosts one others will land in.
Ranked rooms have fixed rules: Team Deathmatch, King of the Hill or Capture the
Flag on the built-in arena maps, standard settings, five normal bots, and the
host can't change any of it. A match counts when another player is in it and
you were there for most of it.

- Everyone starts a season at 1000 SR. Winning against higher-rated players
  earns more; losing to them costs less (an Elo-style rating against the other
  players' average), plus a little for where you finished on your team. The
  first 5 matches of a season are placement matches and move further.
- Tiers: Bronze, Silver, Gold, Platinum and Diamond (III, II, I each), then
  Foundry Master at 1900. Your tier shows under the Ranked button, on the end
  screen with your SR change, and as a badge on the scoreboard in ranked rooms.
- Seasons are calendar months. A new season resets everyone halfway back
  towards 1000.
- Reaching Gold, Diamond and Foundry Master unlocks ranked calling cards.
- **Leaderboard → Ranked** lists this season's ratings. Ratings are kept on the
  online service and its rules check every change (at most one result every 3
  minutes, at most 45 SR at a time, no skipping matches, no deleting your
  rating to dodge a bad season).

### Leaderboard

**Leaderboard** (bottom of the main menu) ranks everyone who has played, by
name: level, kills, wins, K/D (from 25 kills), headshots, best streak, longest
kill, flag captures, knife and grenade kills, accuracy (from 500 shots), matches
and time played. It comes through the lobby: your game sends your career stats
whenever they change, and every player keeps a copy of the board, so it's still
there when the player holding the lobby leaves, and it fills back in when people
come back online. Set your name on the main menu so people know who you are.
Click anyone on the board to open their **profile**: calling card, title, level,
favourite gun, 15 stats and every board they're in the top 10 of.
Stats come from each player's own game: values are sanity-checked, but there's
no server to make them cheat-proof.

### Weapon skins

Every gun has five camos: Woodland, Desert, Arctic, Crimson and Tiger. A gun's
camos unlock once you have **50 kills with that gun** (career stats count them).
Pick them under **Weapon skins…** (next to Loadout, or in Career): each gun
shows its swatches, your progress towards 50, and which one you're wearing.
Skins show on your gun in first person and on your character, other players
see them in multiplayer, and some bots run camos too.

Two mastery camos sit on top: **Gold** for a gun once you're level 20 (or have
prestiged) and have 150 kills with it, and **Diamond** (for any gun) once every
gun has Gold. Both cover the whole gun, metal included, and shine.

### Your account

Every player gets a random, unique **player ID** (like `FA-7K3M-Q9XD`), shown at
the bottom right of the main menu. Your account is everything this
browser has saved (name, settings, crosshair, loadout, key bindings, training-range
best). **Account…** lets you:

- **Copy account code**: one code (starting `FA1.`) holding your ID and all of that
  data. Paste it into **Import** in any browser to carry on there.
- **Download backup file**: the same code as a `.txt` file; **Import from file…**
  reads it back.

There's no server or sign-up: the code *is* the account, so keep it private, and
back up again after playing, since the code changes as your saved data does.
Importing asks first, replaces that browser's account, then reloads the page. A
checksum catches codes that were cut short or mistyped.

**Crosshair** (under Settings) sets its colour, line length (0 for a dot only),
thickness, extra gap, centre dot and outline, with a live preview. The lines
still spread apart to show your current accuracy.
**Graphics: Low** turns off shadows and fill lights and renders at 75% resolution.

## Weapons

| Weapon        | Mag / reserve | Damage  | Notes                                               |
| ------------- | ------------- | ------- | --------------------------------------------------- |
| Assault rifle | 30 / 90       | 15      | full auto all-rounder; spread blooms as you hold fire |
| SMG           | 32 / 128      | 12      | fastest fire rate, accurate on the move, weak at range |
| Shotgun       | 6 / 24        | 8 × 10  | wide spread, falls off quickly with distance         |
| Sniper rifle  | 3 / 21        | 80      | bolt action; scoped shots are pinpoint, hip fire is not |
| LMG           | 60 / 120      | 17      | huge belt, heavy: slower movement, long reload       |
| Pistol        | 12 / ∞        | 25      | everyone's sidearm                                   |
| Grenade       | 2 (max 3)     | up to 130 | 2.3 s fuse, bounces, 7.5 m blast; walls block it; hurts you too |
| Flashbang     | 2             | —       | 1.6 s fuse; whites out the game view (your HUD stays visible on top) and muffles sound for up to 3.6 s for anyone who can see it (much less if they're facing away). Bots lose track of you while blinded |
| Smoke         | 2             | —       | 1.2 s fuse; a 4.6 m cloud for 15 s that nobody (bots included) can see through. Bullets still go through it |

**Cooking:** pressing `F` or `G` pulls the pin and lowers your gun; the fuse burns
while you hold the key, shown by a ring under the crosshair, and the grenade is
thrown when you let go. A cooked frag goes off sooner after it lands. Hold it for
the whole fuse and it goes off in your hand; die holding one and it drops at your
feet.
| Knife (`V`)   | —             | 55 / 150 | quick melee with any gun in hand: two stabs from the front, one from behind; lunges at targets just out of reach |

Every gun is modelled in detail (rails, sights, scopes, moving slides, pumps and
bolts), with hand-animated reloads, ejected casings, barrel smoke after sustained
fire and a muzzle flash that lights up your hands. Other players carry the gun
they are actually using: the primary in their hands with the pistol holstered on
the hip, or the pistol out with the primary slung across their back.

All guns are hitscan, and reload by themselves when the magazine runs dry. Headshots deal 2×. Damage falls off with distance. Moving,
jumping and holding the trigger widen the cone; crouching and aiming tighten it.

## Maps

| Map          | Size      | Character                                                  |
| ------------ | --------- | ---------------------------------------------------------- |
| **Foundry**  | 80 × 80   | mixed arena: plaza, bunker, balcony, sniper walkway        |
| **Span**     | 100 × 48  | two raised bases joined by a long bridge; long sight lines |
| **Cloister** | 52 × 52   | tight courtyard with a covered walkway and catwalk ring    |
| **Depot**    | 72 × 48   | roofed three-storey warehouse (skylights): shelving aisles, a mezzanine ring at 4 m, a catwalk at 8 m |
| **Skyline**  | 80 × 60   | rooftops over a street: bridges, long stairs and short gaps you can jump |
| **Dockyard** | 88 × 56   | container yard: sheds with sniper roofs, stacks to climb, a crane walkway |
| **Steelworks** | 220 × 160 | the mega map: a blast furnace with a chimney landmark, conveyor bridges 5 m up, a container rail yard, a rolling-mill hall with a mezzanine, slag mounds, cooling towers, bases at each end |

Each map is plain data in `src/maps/`: boxes, ramps and stairs, plus spawn
points, pickups, patrol points, King of the Hill zones, flag bases, materials,
sky and lights. Collision, bullet
tests, rendering and the bot nav grid are all derived from that one file. To add
a map, copy one of the files, edit it and register it in `src/maps/index.js`.
Then run `npm run check:map` — it confirms that every spawn, pickup and patrol
point is reachable by the bots.

**Set dressing.** Each map has its own palette and a `decor` theme that
`src/decor.js` turns into detail on top of the block-out: dark baseboards and
caps on walls, a band of the map's accent colour, runs of pipe with brackets and
the odd valve wheel, sagging cable runs, signs (stencilled bay numbers, warning
signs, street plates, neon on Skyline) and hazard stripes along raised walkway
edges. It's placed automatically wherever there's room (never where someone
could stand inside it) and seeded by the map, so everyone sees the same thing.
The themes: Foundry is warm and molten orange, Span cold steel and teal,
Cloister old sandstone with verdigris trim, Depot safety yellow, Skyline red neon
over brick, Dockyard rust and crane yellow. Oil drums sit in open corners (solid
cover, placed by `src/world.js` so collision, bullets and the bot nav grid all
know about them); `npm run check:map` validates maps with them in.

## Map editor and community maps

**Maps** (bottom of the main menu) has three tabs, **Community**, **My maps** and
**Import code**, and the **Open map editor** button.

The editor is a top-down grid. Draw **blocks**, **ramps** and **stairs** by
dragging (presets for cover, walls, platforms and high decks, or set any base and
height), then place **spawns**, **pickups**, the two **flag bases** and **hills**.
Select to move things or drag a block's edge to resize it; every value can also
be typed in on the right. Pick the map's size (30–140 m) and which built-in map's
look it borrows (materials, sky, set dressing).

- **Live check:** the map is built with the real collision world and bot nav
  grid as you edit, and the panel on the right lists anything wrong: unreachable
  spawns, pickups or flags, ramps too steep, stairs too steep or too shallow.
- **Test play** drops you in with bots; **Back to editor** in the pause menu
  returns you.
- **Save** keeps it in My maps (part of your account code). **Share code** copies
  a `FAM1.` code anyone can paste into Import code. **Publish** puts it in
  Community maps for everyone, where players can vote it up, play it solo or
  host a room on it (everyone who joins gets the map automatically).
- Maps without flags or a hill play Team Deathmatch when Capture the Flag or King
  of the Hill is picked.
- Keys: `V` select, `B` block, `R` ramp, `T` stairs, `S` spawn, `P` pickup,
  `F` flag, `H` hill, `E` erase, `Del` delete, `Ctrl+Z` / `Ctrl+Y` undo / redo,
  `Ctrl+D` duplicate, arrows nudge, `[` `]` lower / raise, wheel to zoom,
  right-drag to pan.

## Multiplayer

No server to set up — one player hosts the match in their browser and the others
connect to them directly.

1. **Host:** enter a name, choose the mode, the map and whether you want bots, press
   **Host game**. You are in the match straight away. Press `Esc` to see the room
   code and **Copy invite link**.
2. **Friends:** open the invite link (or type the code) and press **Join**. Joining
   mid-match is fine. Up to 8 humans, plus the host's bots.
3. **Private rooms:** fill in **Password** before hosting and only players who
   type the same password can join (it's never put in the invite link, so send it
   separately).
4. **Public rooms:** tick **Public** next to the password before pressing **Host a
   room** and your room is listed under **Browse rooms** (top of the Play online
   card) for anyone to join, with its mode, map and player count. A public room
   can still have a password: it shows a lock and asks for it on Join.
   **Quick play** (next to Host a room) drops you into the fullest open public
   room on your version, or hosts an open public room if there isn't one.
5. **Friends** (top of the Play online card): everyone has a friend code
   (like `K7Q2-M9XD`, the same on any browser with your account). Add a friend's
   code to see when they're online and what they're doing (in the menu, playing
   solo, in a room). **Invite** puts them in your party (starting one if needed),
   so they follow you into rooms; they get a pop-up to accept. **Join** drops you
   into a friend's room when it has no password. Uses the online service.
5. **Party:** press **Party…** (top of the Play online card) and **Start a
   party**, then send friends the invite link or the 5-letter party code (up to 4
   players). Whoever started the party leads: when they host or join a room, the
   whole party is brought in with them (password and all), they stay together
   from match to match, and the host always puts a party on the same team, even
   when one of them switches sides. When the leader leaves a room, the party
   leaves too. Members' Host and Join buttons are off while they're in a party;
   if they're busy in a solo match, they follow as soon as they leave it. A
   reload keeps you in your party (that tab remembers it).
6. Press `Enter` to chat.
7. The host can switch bots on or off mid-match from the pause menu, pick the
   next match's mode and map there, and restart or start the next match from the
   end screen. Closing the room (or the
   host's tab) ends the session for everyone.
8. **Dropped?** If your connection drops (or you reload the tab by accident), the
   game tries to get you back into the room by itself. The host keeps your kills,
   deaths, team, lives and award stats for 3 minutes, matched by your player ID,
   and gives them back when you rejoin. Leaving with **Leave game** gives your
   place up, and when the host closes the room everyone is told rather than
   left retrying.
9. Everyone has to be on the same version of the game. It's shown in the
   main menu's bottom right corner. If someone has an old tab open, joining tells them who
   needs to refresh (`Ctrl+Shift+R`) instead of letting them in.

How it works:

- **The lobby** (`src/lobby.js`) is how public rooms and the leaderboard work
  without a server. The first player online takes a well-known address on the
  same PeerJS network and becomes the hub; everyone else connects to them. Hosts
  of public rooms announce them to the hub every few seconds. If the hub
  leaves, the others take over within a couple of seconds and the rooms
  reappear as hosts re-announce.

- Connections are WebRTC data channels set up with [PeerJS](https://peerjs.com/).
  Browsers find each other through PeerJS's free public signalling server; once
  connected, game traffic flows directly between the players' browsers.
- The host is the authority for health, kills, respawns, pickups, grenades, the
  clock and all bots. Each player simulates their own movement and reports their
  own hits, which the host sanity-checks (rate of fire, distance, line of sight).
  That keeps shooting responsive at any ping, and is the right trade-off for
  playing with friends; it is not hardened against a determined cheater.
- A hosted match keeps running while the host's tab is in the background.
- Each build is stamped with the git commit it was built from (`src/version.js`,
  set in `vite.config.js`). Host and joiner swap stamps on connect and refuse to
  play together if they differ, since the message format can change between versions.
- The scoreboard shows everyone's **ping** in multiplayer (amber over 120 ms, red
  over 200 ms), measured by the host every 2 seconds. Players see a warning when
  their ping is high or the host stops sending updates.
- If a connection goes quiet for 10 seconds the player is dropped (or, for a
  client, returned to the menu, where it retries the room up to 5 times).

### Online backend (Firebase), optional

Out of the box, public rooms and the leaderboard run on the peer-to-peer lobby
above: no setup, but the leaderboard only trusts players. Connect a free
Firebase project and both move to Firebase instead:

- **Leaderboard** rows are checked by server-side rules
  (`firebase/database.rules.json`), which a modified game can't skip. Each
  player can only write their own row, at most once every 15 seconds; a row only
  moves forward; play time can't grow faster than real time; kills, matches,
  captures and XP are capped against play time; a new row can bring at most 20
  hours of play. The board works even when nobody else is online. (With no game
  server watching the matches, a cheat could still invent plausible matches
  inside those limits; it can't post absurd numbers or touch anyone else's row.)
- **Public rooms** vanish the instant the host's tab closes.
- Players sign in anonymously in the background: no accounts, nothing to type.
- If Firebase can't be reached, the game falls back to the peer-to-peer lobby.

Setup (about 10 minutes, free Spark plan):

1. Go to [console.firebase.google.com](https://console.firebase.google.com),
   **Create a project** (Google Analytics can be off).
2. **Build → Authentication → Get started → Sign-in method → Anonymous →
   Enable → Save.**
3. **Build → Realtime Database → Create database**, pick a location, start in
   **locked mode**.
4. In the database's **Rules** tab, replace everything with the contents of
   `firebase/database.rules.json` and press **Publish**.
5. **Project settings** (the gear) → **Your apps** → the **</>** (Web) icon →
   register an app (no Hosting needed) and copy the `firebaseConfig` values.
6. Put them in `src/online-config.js` as `FIREBASE_CONFIG` (they're not secret:
   every Firebase web app ships them to the browser; the rules are what protect
   the data) and redeploy.

For development, `?fbemu=127.0.0.1` points the game at the Firebase emulators
(`firebase emulators:start --only database,auth --project demo-foundry`, with
`firebase.json` pointing at the rules file).

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
  cover, and run from grenades that land near them. Bots carrying flashbangs throw
  them ahead of a push (and look away); bots carrying smoke cover their retreat
  with it. A flashbanged bot can't see and stumbles; smoke blocks their sight.
- **Tactics** — they **flank**: when you break line of sight they may circle
  round to your side on a route that avoids your line of fire (more often while a
  teammate keeps you busy), flashbang the corner and push in. They make
  **call-outs**: a bot that spots you tells teammates nearby, who converge. They
  **peek** from low cover: stand to shoot, duck between bursts and to reload.
  They **pre-aim** where they last saw you while closing in, and a flag carrier
  smokes their run home.
- **Difficulty** — Easy, Normal, Hard and **Veteran** differ in tactics as well
  as aim: Easy bots don't flank, call out or peek and rarely throw grenades;
  Normal adds flanking and call-outs; Hard adds peeking; Veteran does all of it
  more often, reacts in about a tenth of a second and pre-aims from 20 m.
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
src/killcam.js        rolling recording + kill cam replay
src/ctf.js            Capture the Flag: flags, rules, flag models
src/career.js         career stats (local, part of the account)
src/skins.js          weapon camos: patterns, unlocks, colours
src/progress.js       XP, levels, prestige, equipped cosmetics
src/cosmetics.js      the unlock catalogue (what each level gives) + network form
src/challenges.js     daily and weekly challenge pools and each day's / week's pick
src/smoke.js          smoke grenade clouds (visuals + line-of-sight blocking)
src/account.js        player ID + account code export / import
src/training.js       training range: targets, stands, challenge, stats
src/bindings.js       rebindable controls
src/announcer.js      call-outs (on-screen banner + sting)
src/net.js            multiplayer session: host/client protocol
src/netChar.js        characters driven over the network (interpolated)
src/transport.js      PeerJS (WebRTC) and local-tab transports
src/party.js          parties: friends who follow their leader between rooms
src/lobby.js          serverless lobby: public room list and the leaderboard
src/lobby-cloud.js    the same on Firebase, when src/online-config.js has a project
firebase/             database security rules for the Firebase backend
src/config.js         gameplay tuning, difficulty presets, bot roster
src/maps/index.js     map registry
src/maps/*.js         the maps (data only); range.js is the training range
src/world.js          collision world built from map data (boxes + ramp wedges)
src/physics.js        character controller (step-up, ground snap, sliding)
src/navgrid.js        nav grid generation + A*
src/character.js      shared state / weapon handling for player and bots
src/player.js         player movement (sprint, slide, lean), camera, input
src/bot.js            bot AI
src/weapons.js        weapon + grenade definitions, loadouts
src/gunModels.js      procedural gun models (first-person and on characters)
src/viewmodel.js      first-person weapon view and animation
src/botModel.js       humanoid model + name tag
src/worldMesh.js      merged world meshes, sky shader, lights
src/effects.js        particles, decals, tracers, explosions
src/pickups.js        pickups
src/audio.js          synthesised sound
src/decor.js          set dressing: trims, pipes, cables, signs, hazard edges, drums
src/mapspec.js        custom map format, building, validation, share codes
src/editor.js         the map editor
src/tutorial.js       the first-time tutorial
src/hud.js            HUD, chat log
src/settings.js       saved settings
tools/check-map.mjs   offline map validator
```

Append `?nolock` to the URL to run without pointer lock (handy for debugging);
`window.__game` exposes the running game in the console.
