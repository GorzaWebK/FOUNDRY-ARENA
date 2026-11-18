// App bootstrap: menus, pointer lock, pause, multiplayer lobby, chat, main loop.

// fonts are bundled with the game (no outside font server to wait for)
import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-800.css';
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-700.css';
import '@fontsource/saira-stencil-one/latin-400.css';
import './style.css';
import { MAPS, getMap } from './maps/index.js';
import { MODES, getMode, makeRules, customSummary, TIME_OPTIONS, HARDCORE_HEALTH, TEAM_NAMES } from './modes.js';
import RANGE_MAP from './maps/range.js';
import { TRAINING } from './training.js';
import { WEAPON_BY_ID, PRIMARIES, TACTICALS, TACTICAL_BY_ID, WEAPONS as WEAPON_LIST } from './weapons.js';
import { loadSettings, saveSettings, buildSettingsUI } from './settings.js';
import { AudioSys } from './audio.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { Game } from './game.js';
import { Net, cleanName } from './net.js';
import { Party, PARTY_MAX, cleanPartyCode } from './party.js';
import { Lobby, boardId } from './lobby.js';
import { CloudLobby } from './lobby-cloud.js';
import { FIREBASE_CONFIG } from './online-config.js';
import { MAX_HUMANS } from './config.js';
import { cleanRoomCode } from './transport.js';
import { ACTIONS, keyName, bindLabel, defaultBinds } from './bindings.js';
import { BUILD, BUILD_TIME } from './version.js';
import { getAccount, exportCode, parseCode, importAccount } from './account.js';
import { SKINS, SKIN_KILLS, skinSwatchCss, skinUnlocked, skinLockText } from './skins.js';
import { SLOTS, ITEMS, itemOf, itemUnlocked, unlocksAt } from './cosmetics.js';
import { XP, levelFromXp, MAX_LEVEL } from './progress.js';
import { msToReset, msToWeekReset } from './challenges.js';

{
  // version stamp on the main menu, so players can compare before joining
  const el = document.getElementById('version-note');
  const day = BUILD_TIME ? BUILD_TIME.slice(0, 10) : '';
  if (el) el.textContent = 'Build ' + BUILD;
  if (el && day) el.title = `Built ${day}`;
}

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const NOLOCK = params.has('nolock'); // dev/testing: play without pointer lock

const canvas = $('game');
const settings = loadSettings();
const audio = new AudioSys();
audio.volume = settings.volume;
const hud = new Hud();
const input = new Input(canvas);
input.binds = settings.binds; // the same object: rebinding updates input immediately
const game = new Game({ canvas, settings, audio, hud, input, map: getMap(settings.map) });

// 'menu' (attract mode) | 'playing' | 'paused' | 'ended'
// In multiplayer the match never stops: 'paused' is just the menu overlay.
let state = 'menu';
let chatting = false;

const ui = { menu: $('menu'), pause: $('pause'), end: $('end') };

const net = new Net(game, {
  onRoster: () => updateRoomUi(),
  onLeft: (reason, retryCode) => {
    input.exitLock();
    startAttract();
    if (retryCode) rejoin(retryCode, reason);
    else { setMpStatus(reason, true); party.leftRoom(); }
  },
  onVotes: () => renderVote(),
  onMatchStart: () => {
    setState('playing');
    hud.setLockHint(!input.locked);
  },
  onChat: (name, color, text) => {
    hud.chatAdd(name, color, text);
    if (name) audio.play('chat');
  },
});

function setState(s) {
  if (chatting) closeChat(false);
  state = s;
  ui.menu.classList.toggle('hidden', s !== 'menu');
  ui.pause.classList.toggle('hidden', s !== 'paused');
  ui.end.classList.toggle('hidden', s !== 'ended');
  if (s === 'menu') { renderDaily(); renderLevelChip(); }
  hud.show(s === 'playing' || s === 'paused');
  input.active = s === 'playing';
  audio.muted = s === 'menu' || (s === 'paused' && !net.active);
  if (s !== 'playing') hud.setScoreboard(false, game);
  hud.setLockHint(false);
  updateRoomUi();
}

// ---------------------------------------------------------------- settings UI
const onSetting = (key) => { game.applySettings(key); syncAll(); };
const syncMenu = buildSettingsUI($('menu-settings'), settings, onSetting);
const syncPause = buildSettingsUI($('pause-settings'), settings, onSetting);
function syncAll() { syncMenu(); syncPause(); }

// match options
const bots = $('set-bots'), botsOut = $('out-bots'), botsOn = $('set-bots-on'), diff = $('set-diff');
// map + mode pickers exist twice: main menu, and "next match" in the pause menu
const mapSels = [$('set-map'), $('pause-map')], modeSels = [$('set-mode'), $('pause-mode')];
function fillSelect(sel, list) {
  for (const m of list) {
    const o = document.createElement('option');
    o.value = m.id;
    o.textContent = m.name;
    o.title = m.blurb || '';
    sel.append(o);
  }
}
mapSels.forEach((s) => fillSelect(s, MAPS));
modeSels.forEach((s) => fillSelect(s, MODES));
/** The custom rules picked for a mode (limits are remembered per mode). */
function customFor(id) {
  const r = settings.rules;
  return { limit: r.limits[id] || 0, time: r.time, ff: r.ff, pickups: r.pickups, hardcore: r.hardcore };
}
/** The rules the next match will use. */
function nextRules() { return makeRules(settings.mode, customFor(settings.mode)); }

const TEAM_PREF = { auto: -1, cobalt: 0, crimson: 1 };
function syncMatchPickers() {
  for (const s of mapSels) s.value = settings.map;
  for (const s of modeSels) s.value = settings.mode;
  const r = nextRules();
  // team choice only matters in team modes
  $('row-team').classList.toggle('hidden', !r.teams);
  $('set-team').value = settings.team;
  game.player.teamPref = TEAM_PREF[settings.team];
  const sum = customSummary(r);
  for (const id of ['mode-blurb', 'pause-mode-blurb']) {
    const el = $(id);
    el.textContent = r.blurb;
    if (sum) { const c = document.createElement('span'); c.className = 'custom'; c.textContent = sum; el.append(c); }
  }
}
syncMatchPickers();
for (const s of mapSels) {
  s.addEventListener('change', () => {
    settings.map = s.value;
    saveSettings(settings);
    syncMatchPickers();
    if (state === 'menu') startAttract(); // show the chosen map behind the menu
  });
}
for (const s of modeSels) {
  s.addEventListener('change', () => { settings.mode = s.value; saveSettings(settings); syncMatchPickers(); });
}
bots.value = settings.botCount;
botsOut.textContent = settings.botCount;
botsOn.checked = settings.bots;
diff.value = settings.difficulty;
function syncBotsUi() {
  botsOn.checked = settings.bots;
  $('row-botcount').style.opacity = settings.bots ? 1 : 0.4;
  bots.disabled = !settings.bots;
  $('btn-bots').textContent = `Bots: ${game.botsOn ? 'On' : 'Off'}`;
}
bots.addEventListener('input', () => {
  settings.botCount = parseInt(bots.value, 10);
  botsOut.textContent = settings.botCount;
  saveSettings(settings);
});
botsOn.addEventListener('change', () => { settings.bots = botsOn.checked; saveSettings(settings); syncBotsUi(); });
diff.addEventListener('change', () => { settings.difficulty = diff.value; saveSettings(settings); });
// host / solo: switch the bots on or off in the middle of a match
$('btn-bots').addEventListener('click', () => {
  if (net.role === 'client') return;
  settings.bots = !game.botsOn;
  saveSettings(settings);
  game.setBots(settings.bots);
  syncBotsUi();
  if (net.role === 'host') net.system(`Bots turned ${settings.bots ? 'on' : 'off'}`);
});

// loadout picker (main menu + pause menu share the same choice)
const loadoutButtons = [];
function buildLoadoutUI(container) {
  for (const id of PRIMARIES) {
    const def = WEAPON_BY_ID[id];
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = def.name;
    const small = document.createElement('small');
    small.textContent = def.blurb;
    b.append(small);
    b.addEventListener('click', () => {
      settings.primary = id;
      saveSettings(settings);
      syncLoadout();
      if (state === 'paused') $('pause-hint').textContent = `${def.name} is ready on your next spawn.`;
    });
    container.append(b);
    loadoutButtons.push([id, b]);
  }
}
const tacButtons = [];
function buildTacUI(container) {
  for (const id of TACTICALS) {
    const def = TACTICAL_BY_ID[id];
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = def.name;
    b.title = def.blurb;
    b.addEventListener('click', () => {
      settings.tactical = id;
      saveSettings(settings);
      syncLoadout();
      if (state === 'paused') $('pause-hint').textContent = `${def.name} is ready on your next spawn.`;
    });
    container.append(b);
    tacButtons.push([id, b]);
  }
}
function syncLoadout() {
  for (const [id, b] of loadoutButtons) b.classList.toggle('on', id === settings.primary);
  for (const [id, b] of tacButtons) b.classList.toggle('on', id === settings.tactical);
}
buildLoadoutUI($('menu-loadout'));
buildLoadoutUI($('pause-loadout'));
{
  // main menu: the flashbang / smoke pick sits in the spare grid cell beside the LMG
  const cell = document.createElement('div');
  cell.className = 'tac-cell';
  $('menu-loadout').append(cell);
  buildTacUI(cell);
}
buildTacUI($('pause-tac'));
syncLoadout();

// ---------------------------------------------------------------- multiplayer lobby UI
const nameInput = $('mp-name'), codeInput = $('mp-code');
nameInput.value = settings.name;
nameInput.addEventListener('input', () => { settings.name = cleanName(nameInput.value); saveSettings(settings); if (party.active) party.setName(settings.name || 'Player'); clearTimeout(nameBoardT); nameBoardT = setTimeout(() => { updateBoardEntry(); syncPublicRoom(); }, 1500); });
let nameBoardT = 0;
codeInput.addEventListener('input', () => { codeInput.value = cleanRoomCode(codeInput.value); });
codeInput.addEventListener('keydown', (e) => { if (e.code === 'Enter') joinGame(); });
if (params.get('join')) codeInput.value = cleanRoomCode(params.get('join'));

function setMpStatus(text, isError = false) {
  const el = $('mp-status');
  el.textContent = text || '';
  el.classList.toggle('err', !!isError);
}

function setMpBusy(busy) {
  for (const id of ['btn-host', 'btn-join', 'btn-play', 'btn-quick']) $(id).disabled = busy;
  // a party member goes where their leader goes
  if (!busy && party.active && !party.leader) $('btn-host').disabled = $('btn-join').disabled = $('btn-quick').disabled = true;
}

function inviteLink() {
  const q = new URLSearchParams();
  for (const k of ['net', 'nolock', 'peerhost', 'peerport', 'peerpath', 'peersecure']) if (params.has(k)) q.set(k, params.get(k));
  q.set('join', net.code);
  return `${location.origin}${location.pathname}?${q}`;
}

function updateRoomUi() {
  const on = net.active;
  const n = net.humanCount;
  const label = on ? `ROOM ${net.code}   ${n} PLAYER${n === 1 ? '' : 'S'}` : '';
  $('room').textContent = label;
  $('room').classList.toggle('hidden', !on);
  $('room-box').classList.toggle('hidden', !on);
  $('room-code').textContent = net.code;
  $('room-count').textContent = on ? `${n} player${n === 1 ? '' : 's'} connected${net.role === 'host' && net.password ? '. Password protected.' : ''}` : '';
  $('pause-title').textContent = on ? 'MENU' : 'PAUSED';
  $('btn-restart').classList.toggle('hidden', net.role === 'client');
  const training = !!game.rules.training && !game.attract;
  $('next-match').classList.toggle('hidden', net.role === 'client' || training);
  $('btn-bots').classList.toggle('hidden', net.role === 'client' || training);
  $('btn-range-reset').classList.toggle('hidden', !training);
  $('btn-restart').textContent = training ? 'Restart range' : 'Restart match';
  $('btn-quit').textContent = on ? (net.role === 'host' ? 'Close room' : 'Leave game') : 'Main menu';
  $('btn-again').classList.toggle('hidden', net.role === 'client');
  $('btn-again').textContent = net.role === 'host' ? 'START NEXT MATCH' : 'PLAY AGAIN';
  $('btn-menu').textContent = on ? (net.role === 'host' ? 'Close room' : 'Leave game') : 'Main menu';
  $('end-wait').classList.toggle('hidden', net.role !== 'client');
  hud.chatHint(on && state === 'playing' && !chatting);
  syncBotsUi();
  if (typeof lobby !== 'undefined') syncPublicRoom();
}

$('btn-copy').addEventListener('click', async () => {
  const link = inviteLink();
  let ok = false;
  try { await navigator.clipboard.writeText(link); ok = true; } catch (e) { /* fall through */ }
  $('copy-note').textContent = ok ? 'Invite link copied.' : link;
});

// ---------------------------------------------------------------- chat (multiplayer)
const chatInput = $('chat-input');

function openChat() {
  if (chatting || !net.active || state !== 'playing') return;
  chatting = true;
  input.active = false; // keys go to the text box, not the game
  chatInput.value = '';
  chatInput.classList.remove('hidden');
  chatInput.focus();
  hud.chatOpen(true);
  hud.chatHint(false);
}

function closeChat(send) {
  if (!chatting) return;
  chatting = false;
  const text = chatInput.value;
  chatInput.classList.add('hidden');
  chatInput.blur();
  hud.chatOpen(false);
  if (state === 'playing') { input.active = true; hud.chatHint(net.active); }
  if (send) net.sendChat(text);
}

chatInput.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.code === 'Enter' || e.code === 'NumpadEnter' || settings.binds.chat.includes(e.code) && e.code !== 'Space' && e.key.length !== 1) { e.preventDefault(); closeChat(true); }
  else if (e.code === 'Escape') closeChat(false);
});
chatInput.addEventListener('blur', () => closeChat(false));

// ---------------------------------------------------------------- flow
async function lock() {
  if (NOLOCK) { input.locked = true; return true; }
  return input.requestLock();
}

/** Solo practice on the training range. */
async function startTraining() {
  if (net.active) return;
  cancelRejoin();
  audio.resume();
  audio.setVolume(settings.volume);
  game.newMatch({ botCount: 1, bots: false, difficulty: settings.difficulty, map: RANGE_MAP, rules: TRAINING });
  setState('playing');
  hud.centerMessage('TRAINING RANGE', 'Stands swap your gun. The orange pad starts a 30 second run.', 4, '#ff6b1a');
  const ok = await lock();
  if (!ok && state === 'playing') hud.setLockHint(true);
}

/** Restart whatever is being played (a match, or the range). */
function restart() {
  if (game.rules.training) startTraining();
  else startMatch();
}

async function startMatch() {
  if (net.role === 'client') return; // only the host starts matches
  if (!net.active) cancelRejoin();
  audio.resume();
  audio.setVolume(settings.volume);
  game.newMatch({
    botCount: settings.botCount, bots: settings.bots, difficulty: settings.difficulty,
    map: getMap(settings.map), rules: nextRules(),
  });
  setState('playing');
  const ok = await lock();
  if (!ok && state === 'playing') hud.setLockHint(true);
}

/** Host a room. `opts.quick`: Quick Play's open public room (no password). */
async function hostGame(opts = {}) {
  cancelRejoin();
  audio.resume();
  setMpBusy(true);
  setMpStatus('Creating a room…');
  try {
    hostPublic = opts.quick ? true : $('mp-public').checked;
    await net.host(settings.name, opts.quick ? '' : $('mp-pass').value.trim());
  } catch (e) {
    setMpStatus(e.message, true);
    return;
  } finally {
    setMpBusy(false);
  }
  party.enteredRoom(net.code, net.password);
  setMpStatus('');
  hud.chatClear();
  await startMatch();
  hud.centerMessage(`ROOM ${net.code}`, 'Press Esc for the invite link', 5, '#4fc3f7');
}

async function joinGame() {
  const code = cleanRoomCode(codeInput.value);
  if (!code) { setMpStatus('Enter the room code from your host.', true); return; }
  await joinRoom(code, $('mp-pass').value.trim());
}

async function joinRoom(code, pw, viaParty = false) {
  cancelRejoin();
  audio.resume();
  setMpBusy(true);
  setMpStatus(viaParty ? `Following your party into room ${code}…` : `Connecting to room ${code}…`);
  hud.chatClear();
  try {
    await net.join(code, settings.name, pw);
  } catch (e) {
    setMpStatus(e.message, true);
    return;
  } finally {
    setMpBusy(false);
  }
  party.enteredRoom(code, pw);
  await enterRoom();
}

/** Joined (or rejoined) a room: into the match, or its end screen. */
async function enterRoom() {
  setMpStatus('');
  audio.setVolume(settings.volume);
  if (game.over) { game.onMatchEnd(game.ranking()[0], game.ranking()); return; }
  setState('playing');
  const ok = await lock();
  if (!ok && state === 'playing') hud.setLockHint(true);
}

// ---------------------------------------------------------------- rejoining after a drop
// The host keeps a dropped player's score for a few minutes (keyed by player ID),
// so try to get straight back in.
const REJOIN_TRIES = 5;
let rejoinToken = 0;
function cancelRejoin() { rejoinToken++; }

async function rejoin(code, reason) {
  const token = ++rejoinToken;
  codeInput.value = code;
  for (let i = 1; i <= REJOIN_TRIES; i++) {
    if (token !== rejoinToken || net.active) return;
    setMpStatus(`${reason} Rejoining room ${code}… (try ${i} of ${REJOIN_TRIES})`, true);
    try {
      await net.join(code, settings.name);
      if (token !== rejoinToken) { net.leave(); return; } // they went and did something else
      hud.chatAdd('', 0, 'Reconnected.');
      party.enteredRoom(code, net.lastPw);
      await enterRoom();
      return;
    } catch (e) {
      if (/newer version|older version|full/i.test(e.message)) { setMpStatus(e.message, true); return; }
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (token === rejoinToken && !net.active) {
    setMpStatus(`Couldn't get back into room ${code}. The host may have left. Press Join to retry. Your score holds for 3 minutes.`, true);
    party.leftRoom();
  }
}

function startAttract() {
  game.newMatch({ botCount: 6, bots: true, difficulty: 'normal', attract: true, map: getMap(settings.map) });
  hud.chatClear();
  setState('menu');
  // the party went into a room while we were in a solo match: catch up with them
  if (followWhenFree) { followWhenFree = false; setTimeout(goToPartyRoom, 300); }
}

// ---------------------------------------------------------------- party
// Friends grouped together: members follow the leader into rooms (see party.js).

let partyRoom = null; // member: the room our leader is in, { code, pw }
let followWhenFree = false; // member: they went in while we were busy in a solo match
const party = new Party({
  onChange: () => renderParty(),
  onNote: (text) => { setPartyStatus(text); if (state === 'playing' || state === 'paused') hud.chatAdd('', 0, text); },
  onGo: (code, pw) => {
    partyRoom = { code, pw };
    renderParty();
    if (net.active && net.code === code) return;
    if (!net.active && (state === 'playing' || state === 'paused')) {
      followWhenFree = true;
      hud.centerMessage('YOUR PARTY IS IN A ROOM', 'Leave this match to join them', 5, '#4fc3f7');
      return;
    }
    goToPartyRoom();
  },
  onOut: () => {
    const was = partyRoom;
    partyRoom = null;
    followWhenFree = false;
    renderParty();
    if (was && net.active && net.code === was.code) {
      input.exitLock();
      net.leave();
      startAttract();
      setMpStatus('Your party leader left the room, so your party did too.');
    }
  },
});

async function goToPartyRoom() {
  if (!partyRoom || party.leader || !party.active) return;
  const { code, pw } = partyRoom;
  if (net.active) {
    if (net.code === code) return;
    input.exitLock();
    net.leave();
    startAttract();
  }
  await joinRoom(code, pw, true);
}

function setPartyStatus(text, isError = false) {
  const el = $('party-status');
  el.textContent = text || '';
  el.classList.toggle('err', !!isError);
}

function partyLink() {
  const q = new URLSearchParams();
  for (const k of ['net', 'nolock', 'peerhost', 'peerport', 'peerpath', 'peersecure']) if (params.has(k)) q.set(k, params.get(k));
  q.set('party', party.code);
  return `${location.origin}${location.pathname}?${q}`;
}

function renderParty() {
  game.player.party = party.active ? party.code : null;
  const on = party.active, lead = party.leader;
  const btn = $('btn-party');
  btn.textContent = on ? `Party · ${party.members.length || 1}` : 'Party…';
  btn.classList.toggle('on', on);
  $('party-off').classList.toggle('hidden', on);
  $('party-on').classList.toggle('hidden', !on);
  $('party-code-show').textContent = party.code || '—';
  $('party-state').textContent = party.status === 'connecting' ? 'connecting…' : party.status === 'waiting' ? 'lost the leader, reconnecting…' : '';
  const list = $('party-list');
  list.textContent = '';
  for (const m of party.members) {
    const li = document.createElement('li');
    li.className = m.lead ? 'lead' : '';
    li.textContent = m.name;
    const tag = document.createElement('small');
    tag.textContent = m.lead ? 'Leader' : '';
    li.append(tag);
    list.append(li);
  }
  for (let i = party.members.length; on && lead && i < PARTY_MAX; i++) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Open slot. Send a friend the invite link.';
    list.append(li);
    break;
  }
  $('btn-party-leave').textContent = lead ? 'Close party' : 'Leave party';
  $('btn-party-room').classList.toggle('hidden', !(on && !lead && partyRoom && !(net.active && net.code === partyRoom.code)));
  $('party-help').textContent = !on ? '' : lead
    ? 'Host or join a room and your party follows you in, on your team.'
    : 'Your leader picks the room. When they host or join one, you go in with them, on their team.';
  setMpBusy(false);
  if (on && !lead && !$('mp-status').classList.contains('err') && !net.active) setMpStatus("You're in a party: you follow your leader into rooms.");
  else if (!on && /^You're in a party/.test($('mp-status').textContent)) setMpStatus('');
}

// ---------------------------------------------------------------- lobby: public rooms + leaderboard
// (see lobby.js: a serverless meeting point shared by everyone with the game open)

let hostPublic = false; // the room we're hosting is listed publicly
const lobbyHooks = {
  onRooms: () => { if (!$('rooms-ov').classList.contains('hidden')) renderRooms(); },
  onBoard: () => { if (!$('board-ov').classList.contains('hidden')) renderBoard(); },
  onStatus: () => {
    if (!$('rooms-ov').classList.contains('hidden')) renderRooms();
    if (!$('board-ov').classList.contains('hidden')) renderBoard();
  },
  // the cloud couldn't be reached: carry on with the peer-to-peer lobby
  onFail: () => {
    lobby = new Lobby(lobbyHooks);
    updateBoardEntry();
    syncPublicRoom();
    lobby.connect();
  },
};
// Firebase when a project is configured (or ?fbemu=<host> for the local emulator), else peer-to-peer
const FB_EMU = params.get('fbemu');
const cloudConfig = FB_EMU
  ? { apiKey: 'demo-key', projectId: 'demo-foundry', databaseURL: `http://${FB_EMU}:9000?ns=demo-foundry-default-rtdb` }
  : FIREBASE_CONFIG;
let lobby = cloudConfig ? new CloudLobby(lobbyHooks, cloudConfig, FB_EMU || '') : new Lobby(lobbyHooks);

/** Keep the lobby's listing of our room up to date (or take it down). */
function syncPublicRoom() {
  if (net.role === 'host' && hostPublic) {
    lobby.setRoom({
      code: net.code, host: settings.name || 'Player', mode: game.rules.name, map: game.map.name,
      n: net.humanCount, max: MAX_HUMANS, bots: game.botsOn !== false && game.bots.length > 0, locked: !!net.password,
    });
  } else lobby.setRoom(null);
}

/** Our row on the leaderboard: career stats, level and name. */
function updateBoardEntry() {
  const c = game.career.stats, pr = game.progress;
  lobby.setMe({
    id: boardId(getAccount().id), name: settings.name || 'Player',
    level: pr.level, prestige: pr.prestige, xp: pr.xp,
    matches: c.matches, wins: c.wins, kills: c.kills, deaths: c.deaths, heads: c.heads,
    bestStreak: c.bestStreak, longest: c.longest, knives: c.knives, nades: c.nades, caps: c.caps,
    shots: c.shots, hits: c.hits, time: Math.floor(c.time || 0),
  });
}

const lobbyStatus = () => (lobby.online ? (lobby instanceof CloudLobby ? 'Connected to the online service.' : 'Connected to the lobby.') : lobby.connecting ? 'Connecting…' : 'Looking for the lobby…');

function renderRooms() {
  $('rooms-status').textContent = lobbyStatus();
  const list = $('rooms-list');
  list.textContent = '';
  const rooms = lobby.joinable().sort((a, b) => (b.n < b.max) - (a.n < a.max) || b.n - a.n);
  const follower = party.active && !party.leader;
  if (!rooms.length) {
    const p = document.createElement('div');
    p.className = 'rooms-empty';
    p.textContent = lobby.online ? 'No public rooms right now. Host one and others can find it here.' : 'Waiting for the lobby. Rooms show up here as soon as it connects.';
    list.append(p);
  }
  for (const r of rooms) {
    const row = document.createElement('div');
    row.className = 'room-row';
    const info = document.createElement('div');
    const title = document.createElement('b');
    title.textContent = `${r.host}'s room${r.locked ? '  🔒' : ''}`;
    const sub = document.createElement('small');
    sub.textContent = `${r.mode} · ${r.map}${r.bots ? ' · bots on' : ''} · code ${r.code}`;
    info.append(title, sub);
    const n = document.createElement('span');
    const full = r.n >= r.max;
    n.className = 'rn' + (full ? ' full' : '');
    n.textContent = `${r.n}/${r.max}`;
    const act = document.createElement('div');
    act.className = 'pw-join';
    const btn = document.createElement('button');
    btn.textContent = full ? 'Full' : 'Join';
    btn.disabled = full || follower;
    if (follower) btn.title = 'Your party leader picks the room';
    let pw = null;
    btn.addEventListener('click', () => {
      if (r.locked && !pw) {
        pw = document.createElement('input');
        pw.type = 'password'; pw.placeholder = 'Password'; pw.maxLength = 32;
        pw.addEventListener('keydown', (e) => { if (e.code === 'Enter') btn.click(); e.stopPropagation(); });
        act.prepend(pw);
        pw.focus();
        return;
      }
      closeRooms();
      codeInput.value = r.code;
      joinRoom(r.code, pw ? pw.value.trim() : '');
    });
    act.append(btn);
    row.append(info, n, act);
    list.append(row);
  }
  $('rooms-msg').textContent = follower ? "You're in a party: your leader picks the room." : '';
  $('btn-rooms-host').disabled = follower || net.active;
}

/**
 * Quick Play: into the fullest open public room (same version, not full, no
 * password), or, if there isn't one, host an open public room for others to find.
 */
async function quickPlay() {
  if (net.active || (party.active && !party.leader)) return;
  cancelRejoin();
  audio.resume();
  setMpBusy(true);
  setMpStatus('Finding a match…');
  lobby.connect();
  lobby.refresh();
  // give the lobby a moment if we've only just opened the page
  for (let i = 0; i < 25 && !lobby.online; i++) await new Promise((r) => setTimeout(r, 200));
  if (lobby.online) await new Promise((r) => setTimeout(r, 600)); // a fresh room list
  const open = lobby.joinable().filter((r) => !r.locked && r.n < r.max).sort((a, b) => b.n - a.n);
  setMpBusy(false);
  for (const r of open.slice(0, 3)) {
    setMpStatus(`Joining ${r.host}'s room (${r.mode}, ${r.map})…`);
    codeInput.value = r.code;
    hud.chatClear();
    try {
      setMpBusy(true);
      await net.join(r.code, settings.name, '');
    } catch (e) {
      continue; // full or gone since the list was made: try the next one
    } finally {
      setMpBusy(false);
    }
    party.enteredRoom(r.code, '');
    await enterRoom();
    return;
  }
  setMpStatus(lobby.online ? 'No open rooms right now. Hosting a public one for others to find…' : "Couldn't reach the lobby. Hosting a public room…");
  await hostGame({ quick: true });
  if (net.role === 'host') hud.centerMessage('PUBLIC ROOM', 'Others can find it with Quick play or Browse rooms', 5, '#4fc3f7');
}

function openRooms() { lobby.refresh(); renderRooms(); $('rooms-ov').classList.remove('hidden'); }
function closeRooms() { $('rooms-ov').classList.add('hidden'); }
$('btn-rooms').addEventListener('click', openRooms);
$('btn-rooms-done').addEventListener('click', closeRooms);
$('btn-rooms-refresh').addEventListener('click', () => { lobby.refresh(); renderRooms(); });
$('btn-rooms-host').addEventListener('click', () => { closeRooms(); $('mp-public').checked = true; hostGame(); });

// leaderboard: one tab per stat
const BOARD_STATS = [
  { id: 'level', name: 'Level', col: 'XP', score: (e) => e.prestige * 1e9 + e.xp, show: (e) => fmt(e.xp) },
  { id: 'kills', name: 'Kills', score: (e) => e.kills },
  { id: 'wins', name: 'Wins', score: (e) => e.wins },
  { id: 'kd', name: 'K/D', col: 'K/D', min: (e) => e.kills >= 25, minText: '25 kills', score: (e) => e.kills / Math.max(1, e.deaths), show: (e) => (e.kills / Math.max(1, e.deaths)).toFixed(2) },
  { id: 'heads', name: 'Headshots', score: (e) => e.heads },
  { id: 'bestStreak', name: 'Best streak', col: 'Streak', score: (e) => e.bestStreak },
  { id: 'longest', name: 'Longest kill', col: 'Metres', score: (e) => e.longest, show: (e) => `${e.longest} m` },
  { id: 'caps', name: 'Captures', score: (e) => e.caps },
  { id: 'knives', name: 'Knife kills', col: 'Knife', score: (e) => e.knives },
  { id: 'nades', name: 'Grenade kills', col: 'Grenade', score: (e) => e.nades },
  { id: 'acc', name: 'Accuracy', col: 'Accuracy', min: (e) => e.shots >= 500, minText: '500 shots', score: (e) => e.hits / Math.max(1, e.shots), show: (e) => `${Math.round((100 * e.hits) / Math.max(1, e.shots))}%` },
  { id: 'matches', name: 'Matches', score: (e) => e.matches },
  { id: 'time', name: 'Time played', col: 'Time', score: (e) => e.time, show: (e) => fmtTime(e.time) },
];
let boardTab = 'level';
const tabs = $('board-tabs');
for (const s of BOARD_STATS) {
  const b = document.createElement('button');
  b.className = 'small-btn';
  b.dataset.id = s.id;
  b.textContent = s.name;
  b.addEventListener('click', () => { boardTab = s.id; renderBoard(); });
  tabs.append(b);
}

function renderBoard() {
  updateBoardEntry();
  const stat = BOARD_STATS.find((s) => s.id === boardTab);
  for (const b of tabs.children) b.classList.toggle('on', b.dataset.id === boardTab);
  $('board-col').textContent = stat.col || stat.name;
  const myId = lobby.myId || boardId(getAccount().id);
  // one row per account (a player on a second browser has a second sign-in): keep the one with the most play
  const byAccount = new Map();
  const myBid = boardId(getAccount().id);
  for (const e of lobby.board.values()) {
    const k = e.bid || e.id, cur = byAccount.get(k);
    if (!cur || e.time > cur.time || (e.time === cur.time && e.at > cur.at)) byAccount.set(k, e);
  }
  const mineRow = byAccount.get(myBid) || lobby.board.get(myId);
  const all = [...byAccount.values()].filter((e) => (!stat.min || stat.min(e)) && stat.score(e) > 0);
  all.sort((a, b) => stat.score(b) - stat.score(a) || a.at - b.at);
  const body = $('board-body');
  body.textContent = '';
  const top = all.slice(0, 100);
  top.forEach((e, i) => {
    const tr = document.createElement('tr');
    if (e === mineRow) tr.className = 'me';
    const cells = [String(i + 1), e.name, `${e.prestige ? '★' + e.prestige + ' ' : ''}${e.level}`, stat.show ? stat.show(e) : fmt(stat.score(e))];
    cells.forEach((t, k) => { const td = document.createElement('td'); if (k === 1) td.className = 'l'; td.textContent = t; tr.append(td); });
    body.append(tr);
  });
  if (!top.length) {
    const tr = document.createElement('tr'), td = document.createElement('td');
    td.colSpan = 4; td.className = 'l';
    td.textContent = stat.min ? `Nobody has ${stat.minText} yet.` : 'Nobody on the board yet. Play a match!';
    tr.append(td); body.append(tr);
  }
  const rank = all.findIndex((e) => e === mineRow);
  const me = mineRow;
  $('board-me').textContent = rank >= 0 ? `You're #${rank + 1} of ${all.length} for ${stat.name.toLowerCase()}${settings.name ? '' : '. Set your name on the main menu so people know who you are'}.`
    : stat.min && me && !stat.min(me) ? `You'll show up here after ${stat.minText}.`
    : lobby.refused ? "The server didn't accept your stats: they don't add up against your play time." : 'Play a match to get on the board.';
  $('board-status').textContent = `${byAccount.size} player${byAccount.size === 1 ? '' : 's'} · ${lobby.online ? 'live' : 'offline: showing the last copy you saw'}. ${lobby instanceof CloudLobby ? 'Checked against play time by the server.' : "Stats come from each player's own game."}`;
}

function openBoard() { lobby.refresh(); renderBoard(); $('board-ov').classList.remove('hidden'); }
$('btn-board').addEventListener('click', openBoard);
$('btn-board-done').addEventListener('click', () => $('board-ov').classList.add('hidden'));

function openParty() { setPartyStatus(''); renderParty(); $('party-ov').classList.remove('hidden'); }
function closeParty() { $('party-ov').classList.add('hidden'); }
$('btn-party').addEventListener('click', openParty);
$('btn-party-done').addEventListener('click', closeParty);
$('party-code').addEventListener('input', () => { $('party-code').value = cleanPartyCode($('party-code').value); });
$('party-code').addEventListener('keydown', (e) => { if (e.code === 'Enter') $('btn-party-join').click(); });
$('btn-party-start').addEventListener('click', async () => {
  setPartyStatus('Starting a party…');
  try { await party.start(settings.name || 'Player'); setPartyStatus('Party started. Copy the invite link and send it to your friends.'); if (net.active) party.enteredRoom(net.code, net.role === 'host' ? net.password : net.lastPw); }
  catch (e) { setPartyStatus(e.message, true); }
});
async function joinParty(code) {
  setPartyStatus(`Joining party ${cleanPartyCode(code)}…`);
  try { await party.join(code, settings.name || 'Player'); setPartyStatus("You're in. Your leader picks the room from here."); }
  catch (e) { setPartyStatus(e.message, true); }
}
$('btn-party-join').addEventListener('click', () => joinParty($('party-code').value));
$('btn-party-leave').addEventListener('click', () => {
  const lead = party.leader;
  party.leave();
  partyRoom = null;
  followWhenFree = false;
  setPartyStatus(lead ? 'Party closed.' : 'You left the party.');
});
$('btn-party-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(partyLink()); setPartyStatus('Invite link copied.'); }
  catch (e) { setPartyStatus(`Copy this link: ${partyLink()}`); }
});
$('btn-party-room').addEventListener('click', () => { closeParty(); goToPartyRoom(); });

function leaveToMenu() {
  input.exitLock();
  if (net.active) party.leftRoom();
  net.leave();
  startAttract();
}

function pause() {
  if (state !== 'playing') return;
  $('pause-hint').textContent = net.active ? 'The match keeps running while this menu is open.' : '';
  $('copy-note').textContent = '';
  const r = game.rules;
  $('loadout-note').textContent = r.gunGame ? 'Gun Game hands out the guns. Your pick waits for the next mode.'
    : r.forcePrimary ? 'Snipers Only: everyone carries a sniper rifle.' : '';
  syncMatchPickers();
  syncSwitchTeam();
  setState('paused');
}

/** Pause menu: "Switch to Crimson / Cobalt" in team modes. */
function syncSwitchTeam() {
  const r = game.rules, b = $('btn-switch-team');
  const show = !!r.teams && !r.training && !game.over && !game.attract;
  b.classList.toggle('hidden', !show);
  if (show) b.textContent = `Switch to ${TEAM_NAMES[1 - Math.max(0, game.player.team)]}`;
}
$('btn-switch-team').addEventListener('click', () => {
  const t = 1 - Math.max(0, game.player.team);
  settings.team = t === 0 ? 'cobalt' : 'crimson';
  saveSettings(settings);
  if (net.role === 'client') net.requestTeam(t);
  else if (net.role === 'host') net.requestTeam(t);
  else game.switchTeam(game.player, t);
  game.player.teamPref = t;
  syncMatchPickers();
  setTimeout(syncSwitchTeam, 400); // a client hears back from the host first
  resume();
});
$('set-team').addEventListener('change', () => {
  settings.team = $('set-team').value;
  saveSettings(settings);
  syncMatchPickers();
});

async function resume() {
  if (state !== 'paused') return;
  audio.resume();
  const ok = await lock();
  if (ok) setState('playing');
  else $('pause-hint').textContent = 'Mouse not captured yet. Click Resume again.';
}

// ---------------------------------------------------------------- controls (rebinding)
const label = (action) => bindLabel(settings.binds, action);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Main-menu summary of the current controls. */
function renderKeysList() {
  const k = (a) => `<kbd>${esc(label(a))}</kbd>`;
  const rows = [
    [`${k('forward')}${k('left')}${k('back')}${k('right')}`, 'Move'],
    ['<kbd>Mouse</kbd>', 'Look'],
    [k('fire'), 'Fire'], [k('aim'), 'Aim down sights'],
    [k('jump'), 'Jump'], [k('sprint'), 'Sprint'],
    [k('crouch'), 'Crouch, or slide while sprinting'],
    [`${k('leanLeft')}${k('leanRight')}`, 'Lean left / right'],
    [k('grenade'), 'Frag. Hold to cook'], [k('tactical'), 'Flash or smoke'],
    [k('knife'), 'Knife'], [k('reload'), 'Reload'], [k('inspect'), 'Inspect'],
    [`${k('primary')}${k('pistol')}<kbd>Wheel</kbd>`, 'Primary / pistol / swap'],
    [k('chat'), 'Chat'], [k('scoreboard'), 'Scoreboard'], [`<kbd>Esc</kbd>${k('pause')}`, 'Pause'],
  ];
  $('keys-list').innerHTML = rows.map(([keys, what]) => `<li><span class="kk">${keys}</span><span>${what}</span></li>`).join('');
}

let listening = null; // [action, slot] waiting for a key

function renderBinds() {
  const box = $('binds');
  box.innerHTML = '';
  for (const a of ACTIONS) {
    const name = document.createElement('span');
    name.textContent = a.label;
    box.append(name);
    for (let slot = 0; slot < 2; slot++) {
      const b = document.createElement('button');
      b.type = 'button';
      const code = settings.binds[a.id][slot];
      const on = listening && listening[0] === a.id && listening[1] === slot;
      b.textContent = on ? 'Press a key…' : keyName(code);
      b.classList.toggle('listening', !!on);
      b.classList.toggle('empty', !code && !on);
      b.addEventListener('click', () => startListening(a.id, slot));
      box.append(b);
    }
  }
}

function bindsChanged() {
  saveSettings(settings);
  renderBinds();
  renderKeysList();
  hud.setBindHints(label);
}

function startListening(action, slot) {
  listening = [action, slot];
  $('binds-note').textContent = '';
  renderBinds();
  // the click that started this is still bubbling: start capturing on the next tick
  setTimeout(() => {
    input.capture = (code) => {
      input.capture = null;
      const [act, sl] = listening;
      listening = null;
      if (code === 'Escape') { renderBinds(); return; }
      if (code === 'Backspace' || code === 'Delete') { settings.binds[act][sl] = ''; bindsChanged(); return; }
      // a key can only do one thing: take it away from whatever had it
      let moved = null;
      for (const other of ACTIONS) {
        const arr = settings.binds[other.id];
        for (let i = 0; i < 2; i++) {
          if (arr[i] === code && !(other.id === act && i === sl)) { arr[i] = ''; moved = other.label; }
        }
      }
      settings.binds[act][sl] = code;
      $('binds-note').textContent = moved ? `${keyName(code)} was taken from “${moved}”.` : '';
      bindsChanged();
    };
  }, 0);
}

let controlsReturn = null;
function openControls() {
  controlsReturn = state;
  listening = null;
  $('binds-note').textContent = '';
  renderBinds();
  $('controls').classList.remove('hidden');
}
function closeControls() {
  input.capture = null;
  listening = null;
  $('controls').classList.add('hidden');
}
// ---------------------------------------------------------------- account (ID + backup / import)
const account = getAccount();
$('acct-id-menu').textContent = account.id;
$('acct-id').textContent = account.id;
$('acct-since').textContent = account.created ? `since ${account.created}` : '';

function acctStatus(text, kind = '') {
  const el = $('acct-status');
  el.textContent = text;
  el.className = 'note' + (kind ? ' ' + kind : '');
}
function openAccount() {
  acctStatus('');
  $('acct-code').value = '';
  $('account').classList.remove('hidden');
}
function closeAccount() { $('account').classList.add('hidden'); }

// ---------------------------------------------------------------- XP, levels, customize
const fmt = (n) => n.toLocaleString('en-GB');
game.progress.onXp = (amount) => { if (state === 'playing') hud.xpPop(amount); };
game.progress.onChallenge = (c, weekly) => {
  if (state === 'playing') game.announcer.announce(weekly ? 'Weekly complete' : 'Challenge complete', `${c.text}  +${fmt(c.xp)} XP`);
  renderDaily();
};
game.progress.onWeekDone = (n) => {
  const card = n >= 5 ? 'Night Shift' : 'Overtime';
  setTimeout(() => game.announcer.announce('Full week!', n === 1 || n === 5 ? `Unlocked the ${card} calling card` : `${n} full weeks`), 2600);
};
let dailyTab = 'day';

/** The main menu's "Today" card. */
for (const t of document.querySelectorAll('.d-tab')) t.addEventListener('click', () => { dailyTab = t.dataset.tab; renderDaily(); });
function renderDaily() {
  const box = $('daily-list');
  if (!box) return;
  box.textContent = '';
  for (const t of document.querySelectorAll('.d-tab')) t.classList.toggle('on', t.dataset.tab === dailyTab);
  const week = dailyTab === 'week';
  for (const { c, n, done } of week ? game.progress.weeklies() : game.progress.dailies()) {
    const row = document.createElement('div');
    row.className = 'daily' + (done ? ' done' : '');
    const top = document.createElement('div'); top.className = 'd-top';
    const t = document.createElement('span'); t.textContent = c.text;
    const x = document.createElement('b'); x.textContent = done ? 'DONE' : `+${fmt(c.xp)}`;
    top.append(t, x);
    const line = document.createElement('div'); line.className = 'd-line';
    const bar = document.createElement('div'); bar.className = 'd-bar';
    const fill = document.createElement('i'); fill.style.width = `${Math.round((n / c.goal) * 100)}%`;
    bar.append(fill);
    const cnt = document.createElement('small'); cnt.textContent = `${n}/${c.goal}`;
    line.append(bar, cnt);
    row.append(top, line);
    box.append(row);
  }
  const ms = week ? msToWeekReset() : msToReset();
  const dd = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
  $('daily-reset').textContent = week ? `Resets in ${dd ? `${dd}d ` : ''}${h}h` : `New set in ${h}h ${m}m`;
  if (week) {
    const full = game.progress.weeksDone;
    const note = document.createElement('p');
    note.className = 'note d-note';
    note.textContent = full ? `Full weeks: ${full}. Next card at ${full < 5 ? 5 : '—'}.`.replace(' Next card at —.', '') : 'Finish all three for the Overtime calling card.';
    box.append(note);
  }
}
// your own-screen cosmetics: knife finish, weapon charm, crosshair shape
game.onCosmetics = (eq) => {
  game.viewmodel.setKnife(itemOf('knife', eq.knife));
  game.viewmodel.setCharm(eq.charm);
  for (const el of document.querySelectorAll('.xh')) {
    el.className = el.className.replace(/\bshape-\w+/g, '').trim() + (eq.xhShape !== 'cross' ? ` shape-${eq.xhShape}` : '');
  }
};
game.applyCosmetics();
game.progress.onLevelUp = (level) => {
  const unlocked = unlocksAt(level).map((u) => u.item.name);
  game.announcer.announce(`Level ${level}`, unlocked.length ? `Unlocked: ${unlocked.slice(0, 3).join(', ')}${unlocked.length > 3 ? '…' : ''}` : '');
  cosmeticsChanged();
};

/** Our look or level changed: our character and everyone in the room need to know. */
function cosmeticsChanged() {
  game.player.cos = game.ownCosmetics();
  if (net.active) net.cosmeticsChanged();
  renderLevelChip();
}

function renderLevelChip() {
  const pr = game.progress, info = pr.info;
  const pct = info.need ? Math.round((info.into / info.need) * 100) : 100;
  $('lvl-chip').innerHTML = `${pr.prestige ? `<span class="pr">★${pr.prestige}</span>` : ''}Level ${pr.level}`
    + `<span class="bar" title="${info.need ? `${fmt(info.into)} / ${fmt(info.need)} XP` : 'Max level'}"><i style="width:${pct}%"></i></span>`;
}
renderLevelChip();

function renderEndXp() {
  const pr = game.progress, el = $('end-xp');
  const total = pr.matchTotal();
  if (!total) { el.innerHTML = ''; return; }
  const before = levelFromXp(pr.startXp || 0).level;
  const info = pr.info;
  const pct = info.need ? Math.round((info.into / info.need) * 100) : 100;
  const up = pr.level > before ? `<span class="xp-up">Level ${before} → ${pr.level}!</span>` : `<span>Level ${pr.level}</span>`;
  el.innerHTML = `<div class="xp-line"><b>+${fmt(total)} XP</b>${up}<span class="bar"><i style="width:${pct}%"></i></span>`
    + `<small>${info.need ? `${fmt(info.into)} / ${fmt(info.need)}` : 'MAX'}</small></div>`
    + `<div class="xp-parts">${pr.match.map(([k, v]) => `<span>${k} <b>+${fmt(v)}</b></span>`).join('')}</div>`;
}

let customSlot = 'title';
function swatchFor(slot, item) {
  const sw = document.createElement('div');
  sw.className = 'sw';
  const hexc = (c) => '#' + c.toString(16).padStart(6, '0');
  if (item.css) sw.style.background = item.css;
  else if (item.color !== undefined) sw.style.background = hexc(item.color);
  else if (item.blade !== undefined) sw.style.background = `linear-gradient(100deg, ${hexc(item.handle)} 0 35%, ${hexc(item.blade)} 35%)`;
  else sw.style.background = 'rgba(255,255,255,0.05)';
  if (slot === 'title') sw.textContent = item.name;
  if (slot === 'tag') {
    const s = item.id;
    sw.textContent = settings.name || 'Player';
    sw.style.color = s === 'gold' ? '#ffe08a' : s === 'prestige' ? '#e6ccff' : s === 'plain' ? '#fff' : '#ff9a4a';
    if (s === 'glow') sw.style.textShadow = '0 0 8px #ff8a2a';
    if (s === 'frame' || s === 'gold' || s === 'prestige' || s === 'glow') sw.style.boxShadow = `inset 0 0 0 2px ${s === 'gold' ? '#ffd24d' : s === 'prestige' ? '#c77dff' : '#ff8a2a'}`;
    if (s === 'stripe') sw.style.background = 'repeating-linear-gradient(60deg, rgba(255,138,42,0.25) 0 6px, transparent 6px 14px), rgba(10,14,20,0.6)';
  }
  return sw;
}

function renderCustom() {
  const pr = game.progress, info = pr.info, eq = pr.equipped();
  const pct = info.need ? Math.round((info.into / info.need) * 100) : 100;
  $('custom-level').innerHTML = `<span class="big">${pr.prestige ? '<em>★' + pr.prestige + '</em>' : ''}${pr.level}</span>`
    + `<span class="bar"><i style="width:${pct}%"></i></span>`
    + `<small>${info.need ? `${fmt(info.into)} / ${fmt(info.need)} XP to level ${pr.level + 1}` : 'Max level'}</small>`;
  const slots = $('custom-slots');
  slots.textContent = '';
  for (const s of SLOTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = s.id === customSlot ? 'on' : '';
    b.textContent = s.name;
    const n = ITEMS[s.id].filter((i) => itemUnlocked(i, pr.level, pr.prestige, pr.weeksDone)).length;
    const sm = document.createElement('small'); sm.textContent = `${n}/${ITEMS[s.id].length}`;
    b.append(sm);
    b.addEventListener('click', () => { customSlot = s.id; renderCustom(); });
    slots.append(b);
  }
  const grid = $('custom-items');
  grid.textContent = '';
  for (const item of ITEMS[customSlot]) {
    const open = itemUnlocked(item, pr.level, pr.prestige, pr.weeksDone);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'citem' + (eq[customSlot] === item.id ? ' on' : '') + (open ? '' : ' locked');
    b.append(swatchFor(customSlot, item));
    const nm = document.createElement('div'); nm.className = 'nm';
    nm.textContent = customSlot === 'title' ? '' : item.name; // a title's swatch already says it
    const req = document.createElement('small');
    req.textContent = open ? (eq[customSlot] === item.id ? 'equipped' : '')
      : item.weekly ? (item.weekly === 1 ? 'Finish a week' : `${item.weekly} full weeks`) : item.prestige ? `Prestige ${item.prestige}` : `Level ${item.level}`;
    nm.append(req);
    b.append(nm);
    b.addEventListener('click', () => {
      if (!pr.equip(customSlot, item.id)) return;
      audio.play('ui');
      cosmeticsChanged();
      game.applyCosmetics();
      renderCustom();
    });
    grid.append(b);
  }
  $('btn-prestige').classList.toggle('hidden', !pr.canPrestige());
}
$('btn-custom').addEventListener('click', () => { renderCustom(); $('custom').classList.remove('hidden'); });
$('btn-custom-done').addEventListener('click', () => $('custom').classList.add('hidden'));
$('btn-prestige').addEventListener('click', () => {
  if (!window.confirm(`Prestige now? You go back to level 1 with a prestige badge (★${game.progress.prestige + 1}). Unlocks from levels come back as you level up again; prestige items, weapon skins and career stats stay.`)) return;
  if (game.progress.doPrestige()) { audio.play('win'); cosmeticsChanged(); game.applyCosmetics(); renderCustom(); }
});

// ---------------------------------------------------------------- match rules
function renderRules() {
  const mode = getMode(settings.mode), r = settings.rules;
  $('rules-mode').textContent = `For ${mode.name}${mode.limit ? '' : ''}`;
  const box = $('rules-rows');
  box.textContent = '';
  const row = (label, input, note) => {
    const l = document.createElement('label'); l.className = 'row';
    const s = document.createElement('span'); s.textContent = label;
    if (note) { const sm = document.createElement('small'); sm.className = 'hint'; sm.textContent = note; s.append(sm); }
    const o = document.createElement('output');
    l.append(s, input, o); box.append(l);
  };
  const select = (opts, value, onChange) => {
    const sel = document.createElement('select');
    for (const [v, text] of opts) { const o = document.createElement('option'); o.value = v; o.textContent = text; sel.append(o); }
    sel.value = String(value);
    sel.addEventListener('change', () => { onChange(Number(sel.value)); rulesChanged(); });
    return sel;
  };
  const check = (value, onChange) => {
    const c = document.createElement('input'); c.type = 'checkbox'; c.checked = value;
    c.addEventListener('change', () => { onChange(c.checked); rulesChanged(); });
    return c;
  };
  if (mode.limit) {
    const std = mode[mode.limit.key];
    row(mode.limit.label, select([[0, `Standard (${std})`], ...mode.limit.options.filter((v) => v !== std).map((v) => [v, String(v)])],
      r.limits[mode.id] || 0, (v) => { if (v) r.limits[mode.id] = v; else delete r.limits[mode.id]; }));
  }
  row('Time limit', select([[0, 'Standard (10 min)'], ...TIME_OPTIONS.filter((v) => v !== 10).map((v) => [v, `${v} min`])], r.time, (v) => { r.time = v; }));
  if (mode.teams) row('Friendly fire', check(r.ff, (v) => { r.ff = v; }), 'team modes');
  row('Pickups', check(r.pickups, (v) => { r.pickups = v; }), 'health, armour, ammo');
  row('Hardcore', check(r.hardcore, (v) => { r.hardcore = v; }), `${HARDCORE_HEALTH} HP, no HUD`);
}
function rulesChanged() {
  saveSettings(settings);
  syncMatchPickers();
}
function openRules() { renderRules(); $('rules').classList.remove('hidden'); }
$('btn-rules').addEventListener('click', openRules);
$('btn-rules-pause').addEventListener('click', openRules);
$('btn-rules-done').addEventListener('click', () => $('rules').classList.add('hidden'));
$('btn-rules-reset').addEventListener('click', () => {
  settings.rules = { limits: {}, time: 0, ff: false, pickups: true, hardcore: false };
  rulesChanged();
  renderRules();
});

// ---------------------------------------------------------------- career
const fmtTime = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m`; };
function renderCareer() {
  const c = game.career.stats;
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) + '%' : '—');
  const gunKills = c.kills - c.knives - c.nades;
  const cells = [
    ['Matches', c.matches, ''], ['Wins', c.wins, pct(c.wins, c.matches) + ' win rate'],
    ['Kills', c.kills, ''], ['Deaths', c.deaths, ''],
    ['K/D', c.deaths ? (c.kills / c.deaths).toFixed(2) : c.kills ? c.kills.toFixed(2) : '—', ''],
    ['Accuracy', pct(c.hits, c.shots), `${c.hits} / ${c.shots} shots`],
    ['Headshots', c.heads, pct(c.heads, gunKills) + ' of gun kills'],
    ['Best streak', c.bestStreak, ''],
    ['Longest kill', c.longest ? c.longest + ' m' : '—', ''],
    ['Knife kills', c.knives, ''], ['Grenade kills', c.nades, ''],
    ['Flag captures', c.caps, ''], ['Time played', fmtTime(c.time), ''],
  ];
  const grid = $('career-grid');
  grid.textContent = '';
  for (const [label, value, sub] of cells) {
    const d = document.createElement('div');
    d.className = 'cstat';
    const b = document.createElement('b'); b.textContent = value;
    const s = document.createElement('span'); s.textContent = label;
    d.append(b, s);
    if (sub) { const sm = document.createElement('small'); sm.textContent = sub; d.append(sm); }
    grid.append(d);
  }
  const body = $('career-weapons');
  body.textContent = '';
  const rows = [...WEAPON_LIST.map((w) => [w.id, w.name, true]), ['knife', 'Knife', false], ['grenade', 'Grenade', false]];
  for (const [id, name, gun] of rows) {
    const n = c.weapons[id] || 0;
    const tr = document.createElement('tr');
    const a = document.createElement('td'); a.className = 'l'; a.textContent = name;
    const b = document.createElement('td'); b.textContent = n;
    const p = document.createElement('td'); p.className = 'l';
    if (gun) {
      // skin swatches: click one to wear it (locked until SKIN_KILLS kills with this gun)
      const row = document.createElement('div'); row.className = 'swatches';
      const current = settings.skins[id] || 'none';
      const open = n >= SKIN_KILLS;
      for (const sk of SKINS) {
        const b = document.createElement('button');
        b.type = 'button';
        const ok = skinUnlocked(game.career, id, sk.id, game.progress);
        b.className = 'swatch' + (sk.id === current && ok ? ' on' : '') + (ok ? '' : ' locked') + (sk.special ? ' special' : '');
        b.style.background = skinSwatchCss(sk.id);
        b.title = ok ? sk.name : skinLockText(game.career, id, sk.id, game.progress, name);
        b.addEventListener('click', () => {
          if (!ok) return;
          if (sk.id === 'none') delete settings.skins[id]; else settings.skins[id] = sk.id;
          saveSettings(settings);
          game.applyOwnSkins();
          audio.play('ui');
          renderCareer();
        });
        row.append(b);
      }
      if (!open) {
        const prog = document.createElement('span');
        prog.className = 'prog';
        prog.textContent = `${n}/${SKIN_KILLS}`;
        row.append(prog);
      }
      p.append(row);
    }
    tr.append(a, b, p);
    body.append(tr);
  }
  $('career-id').textContent = account.id;
}
function openCareer() { renderCareer(); $('career').classList.remove('hidden'); }
$('btn-career').addEventListener('click', openCareer);
for (const id of ['btn-skins', 'btn-skins-pause']) $(id).addEventListener('click', openCareer);
$('btn-career-done').addEventListener('click', () => $('career').classList.add('hidden'));
$('btn-career-reset').addEventListener('click', () => {
  if (!window.confirm('Reset all your career stats to zero? This also re-locks weapon skins. It can\'t be undone (unless you have an account code from before).')) return;
  game.career.reset();
  renderCareer();
  updateBoardEntry();
});

$('btn-account').addEventListener('click', openAccount);
$('btn-acct-done').addEventListener('click', closeAccount);
$('btn-acct-copy').addEventListener('click', async () => {
  try {
    const code = await exportCode();
    let ok = false;
    try { await navigator.clipboard.writeText(code); ok = true; } catch (e) { /* show it instead */ }
    if (ok) acctStatus('Account code copied. Keep it somewhere safe.', 'ok');
    else { $('acct-code').value = code; $('acct-code').select(); acctStatus("Couldn't copy automatically. The code is in the box above: copy it from there.", 'err'); }
  } catch (e) { acctStatus("Couldn't make an account code: " + e.message, 'err'); }
});
$('btn-acct-download').addEventListener('click', async () => {
  try {
    const code = await exportCode();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([code + '\n'], { type: 'text/plain' }));
    a.download = `foundry-arena-${account.id}-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    acctStatus('Backup file downloaded.', 'ok');
  } catch (e) { acctStatus("Couldn't make a backup file: " + e.message, 'err'); }
});
async function doImport(text) {
  let obj;
  try { obj = await parseCode(text); } catch (e) { acctStatus(e.message || "That code couldn't be read.", 'err'); return; }
  const same = obj.id === account.id;
  const msg = same
    ? `Restore account ${obj.id} from this code (saved ${String(obj.saved || '').slice(0, 10)})? What's saved here now will be replaced.`
    : `Switch this browser to account ${obj.id}? Account ${account.id} here will be replaced. Back it up first if you want to keep it.`;
  if (!window.confirm(msg)) return;
  game.career.frozen = true; // don't let this page save over the imported stats
  game.progress.frozen = true;
  importAccount(obj);
  acctStatus(`Imported ${obj.id}. Reloading…`, 'ok');
  setTimeout(() => location.reload(), 400);
}
$('btn-acct-import').addEventListener('click', () => doImport($('acct-code').value));
$('btn-acct-file').addEventListener('click', () => $('acct-file').click());
$('acct-file').addEventListener('change', async () => {
  const f = $('acct-file').files[0];
  $('acct-file').value = '';
  if (!f) return;
  if (f.size > 500000) { acctStatus("That file is too big to be an account backup.", 'err'); return; }
  doImport(await f.text());
});

$('btn-controls').addEventListener('click', openControls);
// main menu toolbar: Settings and Controls each open a panel of their own
$('btn-open-settings').addEventListener('click', () => $('settings-ov').classList.remove('hidden'));
$('btn-settings-done').addEventListener('click', () => $('settings-ov').classList.add('hidden'));
$('btn-open-controls').addEventListener('click', () => $('keys-ov').classList.remove('hidden'));
$('btn-keys-done').addEventListener('click', () => $('keys-ov').classList.add('hidden'));
$('btn-controls-pause').addEventListener('click', openControls);
$('btn-binds-done').addEventListener('click', closeControls);
$('btn-binds-reset').addEventListener('click', () => {
  const d = defaultBinds();
  for (const k of Object.keys(d)) settings.binds[k] = d[k];
  $('binds-note').textContent = 'Controls reset to the defaults.';
  bindsChanged();
});
renderKeysList();
hud.setBindHints(label);

$('btn-play').addEventListener('click', startMatch);
$('btn-host').addEventListener('click', () => hostGame());
$('btn-quick').addEventListener('click', quickPlay);
$('btn-join').addEventListener('click', joinGame);
$('btn-again').addEventListener('click', startNext);
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', restart);
$('btn-train').addEventListener('click', startTraining);
$('btn-range-reset').addEventListener('click', () => { if (game.range) game.range.resetStats(); resume(); });
$('btn-quit').addEventListener('click', leaveToMenu);
$('btn-menu').addEventListener('click', leaveToMenu);

input.onLockChange = (locked) => {
  if (NOLOCK) return;
  if (locked) hud.setLockHint(false);
  else if (state === 'playing') pause(); // Esc releases the pointer -> pause menu
};
canvas.addEventListener('click', () => {
  if (state === 'playing' && !input.locked) lock().then((ok) => hud.setLockHint(!ok));
});
window.addEventListener('keydown', (e) => {
  const typing = (e.target instanceof HTMLInputElement && e.target.type === 'text') || e.target instanceof HTMLTextAreaElement;
  if (typing) return;
  if (!$('controls').classList.contains('hidden')) {
    if (e.code === 'Escape') closeControls();
    return;
  }
  if (!$('account').classList.contains('hidden')) {
    if (e.code === 'Escape') closeAccount();
    return;
  }
  if (!$('party-ov').classList.contains('hidden')) {
    if (e.code === 'Escape') closeParty();
    return;
  }
  for (const id of ['rooms-ov', 'board-ov']) {
    if (!$(id).classList.contains('hidden')) {
      if (e.code === 'Escape') $(id).classList.add('hidden');
      return;
    }
  }
  for (const id of ['settings-ov', 'keys-ov']) {
    if (!$(id).classList.contains('hidden')) {
      if (e.code === 'Escape') $(id).classList.add('hidden');
      return;
    }
  }
  if (!$('custom').classList.contains('hidden')) {
    if (e.code === 'Escape') $('custom').classList.add('hidden');
    return;
  }
  if (!$('rules').classList.contains('hidden')) {
    if (e.code === 'Escape') $('rules').classList.add('hidden');
    return;
  }
  if (!$('career').classList.contains('hidden')) {
    if (e.code === 'Escape') $('career').classList.add('hidden');
    return;
  }
  const binds = settings.binds;
  if (binds.chat.includes(e.code) && state === 'playing' && net.active) {
    e.preventDefault();
    openChat();
    return;
  }
  const pauseKey = binds.pause.includes(e.code);
  if (e.code === 'Escape' || pauseKey) {
    if (state === 'playing') {
      if (NOLOCK || !input.locked) pause();
      else input.exitLock();
    } else if (state === 'paused' && pauseKey && !e.repeat) {
      // (Esc can't resume: browsers don't let the unlock key re-capture the mouse)
      resume();
    }
  }
});
window.addEventListener('blur', () => { if (state === 'playing' && !NOLOCK) { input.exitLock(); pause(); } });
window.addEventListener('resize', () => game.resize());
// guard against accidental Ctrl+W / tab close mid-match
window.addEventListener('beforeunload', (e) => {
  if (state === 'playing' || state === 'paused') { e.preventDefault(); e.returnValue = ''; }
});
window.addEventListener('pagehide', () => { lobby.close(); party.suspend(); net.leave(false); game.career.flush(); game.progress.flush(); });

game.onMatchEnd = () => {
  const res = game.rules.result(game);
  const won = res.won;
  // career: count the match if you actually played some of it
  if (game.forCareer && game.matchPlayT >= 20 && !game.careerCounted) {
    game.careerCounted = true;
    game.career.match(game.rules.id, won);
    // XP for finishing, winning and any awards you picked up
    const pr = game.progress;
    pr.add(XP.matchPlayed, 'Match played');
    if (won) pr.add(XP.matchWon, 'Victory');
    const mine = (game.awards || []).filter((a) => a[1] === game.player.name).length;
    if (mine) pr.add(XP.award * mine, 'Awards');
    pr.challenge('match', 1, { mode: game.rules.id });
    if (won) pr.challenge('win', 1, { mode: game.rules.id });
  }
  game.progress.save();
  updateBoardEntry();
  renderEndXp();
  $('end-title').textContent = res.draw ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT';
  $('end-title').style.color = res.draw ? '#e9e4da' : won ? '#ffb04a' : '#8e949b';
  $('end-sub').textContent = `${game.rules.name}: ${res.sub}`;
  hud.renderScores(game, $('end-body'));
  renderAwards();
  renderVote();
  setState('ended');
  audio.muted = false;
  audio.play(won && !res.draw ? 'sting-win' : 'sting-lose');
  input.exitLock();
};

// ---------------------------------------------------------------- awards + next-match vote
const hexCol = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0').slice(-6);

function renderAwards() {
  const box = $('end-awards');
  box.textContent = '';
  const list = game.awards || [];
  if (!list.length) {
    const p = document.createElement('div');
    p.className = 'none';
    p.textContent = 'No awards this time.';
    box.append(p);
    return;
  }
  for (const [title, name, color, detail] of list) {
    const d = document.createElement('div');
    d.className = 'award';
    const t = document.createElement('div'); t.className = 't'; t.textContent = title;
    const n = document.createElement('div'); n.className = 'n'; n.textContent = name; n.style.color = hexCol(color);
    const s = document.createElement('div'); s.className = 'd'; s.textContent = detail;
    d.append(t, n, s);
    box.append(d);
  }
}

function voteCounts() {
  return net.role === 'client' ? game.voteCounts || [] : game.voteTally();
}

function renderVote() {
  const box = $('vote-opts');
  const opts = game.voteOptions || [];
  box.textContent = '';
  const mine = game.votes.get(game.player.id);
  const counts = voteCounts();
  const top = Math.max(0, ...counts);
  opts.forEach(([mapId, modeId], i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = getMap(mapId).name;
    const sm = document.createElement('small');
    sm.textContent = getMode(modeId).name;
    b.append(sm);
    if (net.active) {
      const c = document.createElement('b');
      c.textContent = counts[i] || 0;
      b.append(c);
    }
    b.classList.toggle('mine', mine === i);
    b.classList.toggle('lead', top > 0 && counts[i] === top);
    b.title = getMode(modeId).blurb || '';
    b.addEventListener('click', () => {
      audio.play('ui');
      if (net.active) net.vote(i);
      else game.votes.set(game.player.id, i);
      renderVote();
    });
    box.append(b);
  });
  $('vote-title').textContent = net.active ? 'everyone votes' : 'pick one';
  updateVoteNote();
}

function updateVoteNote() {
  const el = $('vote-note');
  if (!game.voteOptions || !game.voteOptions.length) { el.textContent = ''; return; }
  if (net.active && game.voteDeadline) {
    const left = Math.max(0, Math.ceil((game.voteDeadline - performance.now()) / 1000));
    const txt = `Starts in ${left}s. Most votes wins.${net.role === 'host' ? ' Or start it now.' : ''}`;
    if (el.textContent !== txt) el.textContent = txt;
  } else if (!net.active) {
    el.textContent = '';
  }
}

/** Play again (solo) / start the next match (host), with whatever won the vote. */
function startNext() {
  if (net.role === 'client') return;
  const i = game.over ? game.voteWinner() : -1;
  const o = i >= 0 && game.voteOptions ? game.voteOptions[i] : null;
  if (o) {
    settings.map = o[0];
    settings.mode = o[1];
    saveSettings(settings);
    syncMatchPickers();
  }
  startMatch();
}

// ---------------------------------------------------------------- main loop
function tick(dt, render) {
  if (state === 'playing') {
    hud.setScoreboard(input.act('scoreboard'), game);
    game.update(dt);
    if (game.forCareer && !game.over) { game.matchPlayT += dt; game.career.tick(dt); }
  } else if (state === 'menu' || state === 'ended' || (state === 'paused' && net.active)) {
    game.update(dt);
  }
  net.update(dt);
  if (state === 'ended') {
    updateVoteNote();
    // multiplayer: when the vote timer runs out, the host starts the winner
    if (net.role === 'host' && game.voteDeadline && performance.now() >= game.voteDeadline) { game.voteDeadline = 0; startNext(); }
  }
  if (render) game.render();
  input.endFrame();
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (dt <= 0) return;
  tick(dt, true);
}

// Browsers stop animation frames in hidden tabs. A hosted match must keep
// running for everyone else, so tick from a worker timer (not throttled)
// whenever this tab is in the background during a multiplayer session.
try {
  const src = 'setInterval(() => postMessage(0), 33);';
  const worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
  let lastBg = performance.now();
  worker.onmessage = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastBg) / 1000);
    lastBg = now;
    if (document.hidden && net.active && dt > 0) tick(dt, false);
  };
} catch (e) { /* no worker: a hidden host tab will simply stall until it is visible again */ }

game.applySettings();
startAttract();
// name tags are drawn on canvases: redraw them once the bundled font has arrived
if (document.fonts && document.fonts.load) {
  document.fonts.load('700 34px "Barlow Condensed"').then(() => {
    for (const c of new Set([...game.chars, ...game.bots, ...game.remotes])) if (c.model) c.model.redrawTag();
  }).catch(() => {});
}
if (params.get('join')) setMpStatus(`Invited to room ${codeInput.value}. Pick a name and press Join.`);
// back into this tab's party after a reload, or into a friend's from an invite link
const invited = cleanPartyCode(params.get('party') || '');
const savedParty = party.saved();
if (invited.length === 5 && (!savedParty || savedParty.code !== invited)) { $('party-code').value = invited; openParty(); joinParty(invited); }
else party.restore(settings.name || 'Player');
renderParty();
updateBoardEntry();
if (!params.has('nolobby')) lobby.connect();
requestAnimationFrame(frame);

// handy for debugging / automated tests
window.__game = game;
window.__net = net;
window.__party = party;
window.__lobby = lobby;
window.__app = { get state() { return state; }, startMatch, hostGame, joinGame, pause, resume, setState, openChat, closeChat, input, settings };
