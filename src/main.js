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
import { MODES, getMode, makeRules, customSummary, TIME_OPTIONS, HARDCORE_HEALTH, TEAM_NAMES, gunLevel } from './modes.js';
import RANGE_MAP from './maps/range.js';
import { TRAINING } from './training.js';
import { TUTORIAL } from './tutorial.js';
import { WEAPON_BY_ID, PRIMARIES, SECONDARIES, TACTICALS, TACTICAL_BY_ID, WEAPONS as WEAPON_LIST } from './weapons.js';
import { loadSettings, saveSettings, buildSettingsUI } from './settings.js';
import { AudioSys } from './audio.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { Game } from './game.js';
import { Net, cleanName } from './net.js';
import { Party, PARTY_MAX, cleanPartyCode } from './party.js';
import { Lobby, boardId } from './lobby.js';
import { MapEditor, loadMyMaps, saveMyMaps } from './editor.js';
import { previewFor, PREVIEW_SLOTS } from './previews.js';
import { buildMap, cleanSpec, registerMap, customMaps, fitMode, specToCode, codeToSpec, validateMap } from './mapspec.js';
import { CloudLobby } from './lobby-cloud.js';
import { FIREBASE_CONFIG } from './online-config.js';
import { MAX_HUMANS } from './config.js';
import { cleanRoomCode, migrateCode } from './transport.js';
import { ACTIONS, keyName, bindLabel, defaultBinds } from './bindings.js';
import { BUILD, BUILD_TIME, VERSION } from './version.js';
import { START_SR, RANKED_MODES, RANKED_MAPS, TIERS, tierIndex, tierName, tierColor, seasonId, seasonName, msToSeasonEnd, srChange } from './ranked.js';
import { getAccount, exportCode, parseCode, importAccount, friendCode, cleanFriendCode, showFriendCode } from './account.js';
import { SKINS, skinSwatchCss, skinUnlocked, skinLockText, nextCamo, camoKills } from './skins.js';
import { SLOTS, ITEMS, itemOf, unlocksAt, packCosmetics, unpackCosmetics } from './cosmetics.js';
import { MEDALS, MEDAL_BY_ID, ACHIEVEMENTS, ACH_BY_ID } from './medals.js';
import { ATT_SLOTS, ATTACHMENTS, fits, attUnlocked, attList, withAttachments } from './attachments.js';
import { PASS_TIERS, PASS_TIER_XP, THEMES, themeOf, track as passTrack } from './seasonpass.js';
import { XP, levelFromXp, MAX_LEVEL } from './progress.js';
import { msToReset, msToWeekReset } from './challenges.js';
import { Music } from './music.js';
import { filterChat } from './chatfilter.js';

{
  // version stamp on the main menu, so players can compare before joining
  const el = document.getElementById('version-note');
  const day = BUILD_TIME ? BUILD_TIME.slice(0, 10) : '';
  if (el) el.textContent = `v${VERSION} · build ${BUILD}`;
  if (el && day) el.title = `Built ${day}`;
}

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const NOLOCK = params.has('nolock'); // dev/testing: play without pointer lock

const canvas = $('game');
const settings = loadSettings();
const audio = new AudioSys();
audio.volume = settings.volume;
audio.musicVol = settings.musicVolume;
audio.sfxVol = settings.sfxVolume;
const music = new Music(audio);
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
  onMigrate: (info) => migrate(info),
  isPublic: () => hostPublic,
  uid: () => (typeof lobby !== 'undefined' && lobby && lobby.uid) || null,
  onMatchStart: () => {
    setState('playing');
    hud.setLockHint(!input.locked);
  },
  onChat: (name, color, text, id = -1) => {
    // muted players' lines don't show; the rest is filtered if you want it to be
    if (name && settings.muted.includes(name)) return;
    if (name && id >= 0) { const l = chatLog.get(id) || []; l.push(text); chatLog.set(id, l.slice(-6)); }
    hud.chatAdd(name, color, settings.chatFilter ? filterChat(text) : text);
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
  // into play: nothing on the page keeps the keyboard focus (a text box would eat keys, a button would take Space)
  if (s === 'playing' && document.activeElement && document.activeElement !== document.body && !chatting) document.activeElement.blur();
  audio.muted = s === 'menu' || (s === 'paused' && !net.active);
  syncMusic(s);
  if (s !== 'playing') hud.setScoreboard(false, game);
  hud.setLockHint(false);
  updateRoomUi();
}

/** Music and ambience for the screen we're on: the menu theme, the match music, quiet on the range. */
function syncMusic(s) {
  if (s === 'menu') { music.play('menu'); music.ambience(null); music.duck(false); return; }
  if (s === 'ended') { music.stop(0.6); music.ambience(null); return; }
  if (s === 'paused') { music.duck(true); return; }
  if (s === 'playing') {
    music.duck(false);
    if (game.rules.training || game.rules.tutorial) music.stop(1.5);
    else music.play('match');
    music.ambience(game.map.id, game.map.ambience || game.map.theme);
  }
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
// (objective modes fall back to Team Deathmatch on custom maps without flags / hills)
let rankedRoom = null; // host of a ranked room: { map, mode } for the next match
function nextRules() {
  if (rankedRoom) { const r = makeRules(rankedRoom.mode, null); r.ranked = true; return r; }
  return makeRules(fitMode(settings.mode, getMap(settings.map)), customFor(settings.mode));
}

const TEAM_PREF = { auto: -1, cobalt: 0, crimson: 1 };
function syncMatchPickers() {
  // custom maps registered this session get their own options
  for (const s of mapSels) {
    for (const m of customMaps()) {
      if (s.querySelector(`option[value="${m.id}"]`)) continue;
      const o = document.createElement('option');
      o.value = m.id; o.textContent = `${m.name} (custom)`; o.title = m.blurb;
      s.append(o);
    }
  }
  for (const s of mapSels) s.value = getMap(settings.map).id;
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
    b.textContent = def.short || def.name;
    b.title = def.blurb;
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
const tacButtons = [], sideButtons = [];
/** Sidearm (pistol / revolver) and tactical (flash / smoke) on one row. */
function buildTacUI(container) {
  for (const id of SECONDARIES) {
    const def = WEAPON_BY_ID[id];
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = def.name;
    b.title = def.blurb;
    b.addEventListener('click', () => {
      settings.secondary = id;
      saveSettings(settings);
      syncLoadout();
      if (state === 'paused') $('pause-hint').textContent = `${def.name} is ready on your next spawn.`;
    });
    container.append(b);
    sideButtons.push([id, b]);
  }
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
  for (const [id, b] of sideButtons) b.classList.toggle('on', id === settings.secondary);
  const d = WEAPON_BY_ID[settings.primary];
  if (d) $('loadout-blurb').innerHTML = `<b>${d.name}</b> ${d.blurb}`;
}
buildLoadoutUI($('menu-loadout'));
buildLoadoutUI($('pause-loadout'));
buildTacUI($('menu-kit'));
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

// ---------------------------------------------------------------- players in the room: mute, report, kick
const chatLog = new Map(); // player id -> their last few chat lines (sent with a report)
const REPORT_REASONS = ['Abusive chat', 'Cheating', 'Offensive name', 'Griefing / team killing', 'Other'];
let reporting = null; // the id of the player we're filling in a report for
function renderRoomPlayers() {
  const box = $('room-players');
  box.textContent = '';
  if (!net.active) return;
  const others = game.remotes.filter((r) => r.isHuman);
  if (!others.length) return;
  const h = document.createElement('h4'); h.textContent = 'Players';
  box.append(h);
  for (const c of others) {
    const row = document.createElement('div');
    row.className = 'rp-row';
    const nm = document.createElement('b'); nm.textContent = c.name;
    nm.style.color = '#' + (c.color >>> 0).toString(16).padStart(6, '0').slice(-6);
    const pg = document.createElement('small'); pg.textContent = c.ping > 0 ? `${c.ping} ms` : '';
    row.append(nm, pg);
    const muted = settings.muted.includes(c.name);
    const btn = (label, fn, cls = '') => { const b = document.createElement('button'); b.type = 'button'; b.className = 'small-btn ' + cls; b.textContent = label; b.addEventListener('click', fn); row.append(b); return b; };
    if (reporting === c.id) {
      const sel = document.createElement('select');
      for (const r of REPORT_REASONS) { const o = document.createElement('option'); o.textContent = r; sel.append(o); }
      row.append(sel);
      btn('Send report', async () => {
        reporting = null;
        try {
          if (!lobby.report) throw new Error('Reports need the online service.');
          await lobby.report({ name: c.name, reason: sel.value, lines: chatLog.get(c.id) || [], room: net.code });
          hud.chatAdd('', 0, `Report on ${c.name} sent. Thanks: it's looked at by a person.`);
        } catch (e) { hud.chatAdd('', 0, `Couldn't send the report: ${e.message}`); }
        renderRoomPlayers();
      }, 'accent');
      btn('Cancel', () => { reporting = null; renderRoomPlayers(); });
    } else {
      btn(muted ? 'Unmute' : 'Mute', () => {
        settings.muted = muted ? settings.muted.filter((n) => n !== c.name) : [...settings.muted, c.name];
        saveSettings(settings);
        hud.chatAdd('', 0, muted ? `${c.name} unmuted.` : `${c.name} muted: you won't see their chat.`);
        renderRoomPlayers();
      });
      btn('Report', () => { reporting = c.id; renderRoomPlayers(); });
      if (net.role === 'host') btn('Kick', () => { if (window.confirm(`Remove ${c.name} from the room? They won't be able to rejoin it.`)) net.kick(c); }, 'danger');
    }
    box.append(row);
  }
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
  const ranked = !!game.rules.ranked && !game.attract;
  $('next-match').classList.toggle('hidden', net.role === 'client' || training || ranked);
  $('btn-bots').classList.toggle('hidden', net.role === 'client' || training || ranked);
  if (ranked) $('btn-restart').classList.add('hidden');
  $('btn-range-reset').classList.toggle('hidden', !training);
  $('btn-restart').textContent = training ? 'Restart range' : 'Restart match';
  $('btn-quit').textContent = on ? (net.role === 'host' ? 'Leave room' : 'Leave game') : 'Main menu';
  renderRoomPlayers();
  if (typeof editorTesting !== 'undefined') $('btn-editor-back').classList.toggle('hidden', !(editorTesting && !on && game.map.custom));
  $('btn-again').classList.toggle('hidden', net.role === 'client');
  $('btn-again').textContent = net.role === 'host' ? 'START NEXT MATCH' : 'PLAY AGAIN';
  $('btn-menu').textContent = on ? (net.role === 'host' ? 'Leave room' : 'Leave game') : 'Main menu';
  $('end-wait').classList.toggle('hidden', net.role !== 'client');
  hud.chatHint(on && state === 'playing' && !chatting);
  syncBotsUi();
  if (typeof lobby !== 'undefined') { syncPublicRoom(); syncPresence(); }
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
  game.newMatch(rankedRoom
    // ranked: the same for everyone, whatever the host's own settings are
    ? { botCount: 5, bots: true, difficulty: 'normal', map: getMap(rankedRoom.map), rules: nextRules() }
    : { botCount: settings.botCount, bots: settings.bots, difficulty: settings.difficulty, map: getMap(settings.map), rules: nextRules() });
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

/**
 * Host migration: the host is gone, but we know who's next in line. Players
 * ahead of us in the line get a few seconds each to re-host (at a room code
 * everyone can work out, see transport.js migrateCode); if none of them does, we
 * host it ourselves and carry the match on: same map, mode, clock and scores.
 */
async function migrate(info) {
  const token = ++rejoinToken;
  const me = info.o.indexOf(net.pid);
  const pw = net.lastPw || '';
  hud.centerMessage('HOST LEFT', 'Moving the match to a new host…', 4, '#ffd24d');
  hud.chatAdd('', 0, `${info.reason} Moving the match to a new host…`);
  for (let k = 0; k < me; k++) {
    const code = migrateCode(info.code, k), until = performance.now() + 9000;
    while (performance.now() < until) {
      if (token !== rejoinToken) return;
      try {
        await net.join(code, settings.name, pw);
        if (token !== rejoinToken) { net.leave(); return; }
        party.enteredRoom(code, pw);
        hud.chatAdd('', 0, `The match carries on in room ${code}.`);
        await enterRoom();
        return;
      } catch (e) {
        if (/newer version|older version|full|password|private/i.test(e.message)) break;
      }
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
  if (token !== rejoinToken) return;
  // our turn: host it
  try {
    await net.host(settings.name, pw, migrateCode(info.code, me));
  } catch (e) {
    setMpStatus(`The host left and the match couldn't be moved (${e.message}).`, true);
    startAttract();
    return;
  }
  hostPublic = !!info.st.pub;
  party.enteredRoom(net.code, net.password);
  restoreMatch(info.st);
  hud.chatAdd('', 0, `You're the host now (room ${net.code}). The others are on their way.`);
  hud.centerMessage("YOU'RE THE HOST", `Room ${net.code}`, 4, '#4fc3f7');
}

/** New host after a migration: start the same match where it was. */
function restoreMatch(st) {
  const map = getMap(st.map);
  const rules = makeRules(fitMode(st.mode, map), st.rk ? null : st.cr);
  if (st.rk) { rules.ranked = true; rankedRoom = { map: map.id, mode: rules.id }; }
  game.clearRemotes(); // the old room's players: they reconnect to us as new connections
  game.newMatch({ botCount: st.bc, bots: st.bots, difficulty: st.df, map, rules });
  game.matchTime = st.mt;
  game.teamScore = st.ts.slice();
  const mine = st.p[net.pid];
  const p = game.player;
  if (mine) {
    p.kills = mine[0]; p.deaths = mine[1]; p.caps = mine[2]; p.hillTime = mine[5];
    if (rules.lives) p.lives = mine[4];
    if (rules.teams && (mine[3] === 0 || mine[3] === 1)) { p.team = mine[3]; game.paint(p); }
    p.applyGunLevel();
  }
  // everyone else gets their score back when they reconnect (the host's "parked" scores)
  const until = performance.now() + 3 * 60 * 1000;
  for (const [pid, r] of Object.entries(st.p)) {
    if (pid === net.pid) continue;
    net.parked.set(pid, { name: r[6], team: r[3], kills: r[0], deaths: r[1], lives: r[4], caps: r[2], hillTime: r[5], gunLevel: gunLevel(r[0]), st: undefined, until });
  }
  setState('playing');
  syncPublicRoom();
  lock().then((ok) => { if (!ok && state === 'playing') hud.setLockHint(true); });
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
    if (typeof syncPresence === 'function' && lobby.online) { syncPresence(); watchFriends(); refreshRank(); }
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
// ?p2plobby forces the peer-to-peer lobby (development / testing)
let lobby = cloudConfig && !params.has('p2plobby') ? new CloudLobby(lobbyHooks, cloudConfig, FB_EMU || '') : new Lobby(lobbyHooks);

/** Keep the lobby's listing of our room up to date (or take it down). */
function syncPublicRoom() {
  if (net.role === 'host' && hostPublic) {
    lobby.setRoom({
      code: net.code, host: settings.name || 'Player', mode: game.rules.name, map: game.map.name,
      n: net.humanCount, max: MAX_HUMANS, bots: game.botsOn !== false && game.bots.length > 0, locked: !!net.password, rk: !!game.rules.ranked,
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
    // profile extras: how you look, and your favourite gun
    cos: packCosmetics(pr.equipped(), pr.level, pr.prestige).join(','),
    ...favouriteGun(c),
  });
}

/** The gun you've killed most with: { fav, favK }. */
function favouriteGun(c) {
  let fav = 'none', favK = 0;
  for (const w of WEAPON_LIST) { const k = (c.weapons && c.weapons[w.id]) || 0; if (k > favK) { fav = w.id; favK = k; } }
  return { fav, favK };
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
  const open = lobby.joinable().filter((r) => !r.locked && !r.rk && r.n < r.max).sort((a, b) => b.n - a.n);
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
// the Ranked tab first: this season's skill ratings (from the online service)
{
  const b = document.createElement('button');
  b.className = 'small-btn';
  b.dataset.id = 'ranked';
  b.textContent = 'Ranked';
  b.addEventListener('click', () => { boardTab = 'ranked'; renderBoard(); });
  tabs.append(b);
}
for (const s of BOARD_STATS) {
  const b = document.createElement('button');
  b.className = 'small-btn';
  b.dataset.id = s.id;
  b.textContent = s.name;
  b.addEventListener('click', () => { boardTab = s.id; renderBoard(); });
  tabs.append(b);
}

async function renderRankedBoard() {
  for (const b of tabs.children) b.classList.toggle('on', b.dataset.id === 'ranked');
  $('board-col').textContent = 'SR';
  document.querySelector('.board-table thead th:nth-child(3)').textContent = 'Tier';
  const body = $('board-body');
  const msg = (t) => { body.textContent = ''; const tr = document.createElement('tr'), td = document.createElement('td'); td.colSpan = 4; td.className = 'l'; td.textContent = t; tr.append(td); body.append(tr); };
  const days = Math.ceil(msToSeasonEnd() / 86400000);
  $('board-status').textContent = `${seasonName()} · ends in ${days} day${days === 1 ? '' : 's'}. Ratings are checked by the server.`;
  if (!lobby.listRanked) { msg('Ranked needs the online service, which is unavailable right now.'); $('board-me').textContent = ''; return; }
  msg('Loading…');
  let rows;
  try { rows = await lobby.listRanked(); } catch (e) { msg("Couldn't load the ranked board."); return; }
  if (boardTab !== 'ranked') return;
  // one row per account (newest sign-in wins ties)
  const seen = new Set();
  rows = rows.filter((r) => { const k = r.bid || r.id; if (seen.has(k)) return false; seen.add(k); return true; });
  body.textContent = '';
  if (!rows.length) msg('No ranked matches yet this season. Press Ranked on the main menu to play one.');
  rows.slice(0, 100).forEach((r, i) => {
    const tr = document.createElement('tr');
    if (r.mine) tr.className = 'me';
    const placing = r.games < 5;
    const cells = [String(i + 1), r.name, placing ? `placement ${r.games}/5` : tierName(r.sr), String(r.sr)];
    cells.forEach((t, k) => { const td = document.createElement('td'); if (k === 1) td.className = 'l'; if (k === 2) { td.className = 'rk-tier'; td.style.color = placing ? '' : tierColor(r.sr); } td.textContent = t; tr.append(td); });
    body.append(tr);
  });
  const mine = rows.findIndex((r) => r.mine);
  $('board-me').textContent = mine >= 0 ? `You're #${mine + 1} of ${rows.length} this season (${rows[mine].wins} win${rows[mine].wins === 1 ? '' : 's'} in ${rows[mine].games} match${rows[mine].games === 1 ? '' : 'es'}).` : myRank ? `You haven't played ranked this season. You start at ${myRank.sr} SR.` : '';
}

function renderBoard() {
  if (boardTab === 'ranked') { renderRankedBoard(); return; }
  document.querySelector('.board-table thead th:nth-child(3)').textContent = 'Level';
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
  boardRanked = { all, byAccount };
  top.forEach((e, i) => {
    const tr = document.createElement('tr');
    tr.dataset.i = i;
    tr.title = 'View profile';
    tr.addEventListener('click', () => openProfile(e));
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

let boardRanked = null;

/** A player's profile: card, title, level, favourite gun, stats and where they rank. */
async function openProfile(e) {
  const token = (openProfile.token = (openProfile.token || 0) + 1);
  const show = (prof) => {
    const cos = unpackCosmetics(prof && prof.cos ? prof.cos.split(',').map(Number) : [e.level, e.prestige]);
    cos.level = e.level; cos.prestige = e.prestige; // the board row is the checked source for these
    $('pf-card').style.background = itemOf('card', cos.equipped.card).css;
    $('pf-name').textContent = e.name;
    $('pf-title').textContent = itemOf('title', cos.equipped.title).name;
    const lv = $('pf-level');
    lv.textContent = `${e.prestige ? '★' : ''}${e.level}`;
    lv.classList.toggle('pr', e.prestige > 0);
    lv.title = e.prestige ? `Prestige ${e.prestige}, level ${e.level}` : `Level ${e.level}`;
    const fav = prof && prof.fav && WEAPON_BY_ID[prof.fav];
    $('pf-fav').innerHTML = fav ? `Favourite gun: <b>${esc(fav.name)}</b> (${fmt(prof.favK)} kills)` : prof ? 'No favourite gun yet.' : '';
  };
  show(null);
  const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '—');
  const cells = [
    ['Kills', fmt(e.kills)], ['Deaths', fmt(e.deaths)], ['K/D', (e.kills / Math.max(1, e.deaths)).toFixed(2)],
    ['Wins', fmt(e.wins)], ['Matches', fmt(e.matches)], ['Win rate', pct(e.wins, e.matches)],
    ['Headshots', fmt(e.heads)], ['Headshot %', pct(e.heads, e.kills)], ['Accuracy', pct(e.hits, e.shots)],
    ['Best streak', fmt(e.bestStreak)], ['Longest kill', `${e.longest} m`], ['Flag captures', fmt(e.caps)],
    ['Knife kills', fmt(e.knives)], ['Grenade kills', fmt(e.nades)], ['Time played', fmtTime(e.time)],
  ];
  const grid = $('pf-grid');
  grid.textContent = '';
  for (const [k, v] of cells) {
    const d = document.createElement('div');
    d.className = 'cstat';
    const b = document.createElement('b'); b.textContent = v;
    const s = document.createElement('span'); s.textContent = k;
    d.append(b, s);
    grid.append(d);
  }
  // where they place on each board
  const ranks = [];
  if (boardRanked) {
    const rows = [...boardRanked.byAccount.values()];
    for (const st of BOARD_STATS) {
      if (st.min && !st.min(e)) continue;
      const list = rows.filter((x) => (!st.min || st.min(x)) && st.score(x) > 0).sort((a, b) => st.score(b) - st.score(a) || a.at - b.at);
      const i = list.indexOf(e);
      if (i >= 0 && i < 10) ranks.push(`#${i + 1} ${st.name.toLowerCase()}`);
    }
  }
  $('pf-ranks').textContent = ranks.length ? `Top 10 in: ${ranks.join(', ')}.` : '';
  $('profile-ov').classList.remove('hidden');
  const prof = await lobby.getProfile(e.id);
  if (token === openProfile.token) show(prof);
}
$('btn-pf-done').addEventListener('click', () => $('profile-ov').classList.add('hidden'));

function openBoard() { lobby.refresh(); renderBoard(); $('board-ov').classList.remove('hidden'); }
$('btn-board').addEventListener('click', openBoard);
$('btn-board-done').addEventListener('click', () => $('board-ov').classList.add('hidden'));

// ---------------------------------------------------------------- maps: editor, community, my maps
// (see editor.js and mapspec.js)

const matCache = new Map();
const matColor = (mat, themeId) => {
  if (!matCache.has(themeId)) matCache.set(themeId, buildMap(cleanSpec({ v: 1, theme: themeId, w: 40, d: 40 })).materials);
  const def = matCache.get(themeId)[mat];
  return def ? def.color : '#888';
};
let editorTesting = false; // a test match from the editor is running
const editor = new MapEditor($('editor'), {
  matColor,
  onClose: () => { editorTesting = false; $('menu').classList.remove('hidden'); if (state === 'menu') startAttract(); },
  onTest: (spec) => { editorTesting = true; playCustom(spec, 'solo'); },
  onPublish: async (spec, id) => {
    if (!lobby.publishMap) throw new Error('Publishing needs the online service, which is unavailable right now. Share the map code instead.');
    const named = { ...spec, author: settings.name || 'Player' };
    return lobby.publishMap(named, specToCode(named), id);
  },
});

function openEditor(spec = null, docId = null, pub = null) {
  $('maps-ov').classList.add('hidden');
  $('menu').classList.add('hidden');
  editor.open(spec, docId, pub);
}

/** Play a custom map: solo against bots, or host a room on it. */
async function playCustom(spec, how) {
  const map = registerMap(buildMap(cleanSpec(spec)));
  const check = validateMap(map);
  if (check.errors.length) { setMapsMsg(`Can't play that map: ${check.errors[0]}`, true); return; }
  settings.map = map.id; // (not saved: custom maps last for this session)
  syncMatchPickers();
  $('maps-ov').classList.add('hidden');
  if (how === 'host') { await hostGame(); return; }
  await startMatch();
  if (editorTesting) hud.centerMessage('TEST PLAY', 'Esc, then Back to editor when you\'re done', 4, '#ff6b1a');
}
$('btn-editor-back').addEventListener('click', () => {
  input.exitLock();
  net.leave();
  startAttract();
  $('menu').classList.add('hidden');
  editor.resume();
});

function setMapsMsg(t, err = false) { const e = $('maps-msg'); e.textContent = t || ''; e.classList.toggle('err', !!err); }
let mapsTab = 'community';
for (const b of document.querySelectorAll('.maps-tabs button')) b.addEventListener('click', () => { mapsTab = b.dataset.tab; renderMaps(); });

function mapRow(title, sub, buttons) {
  const row = document.createElement('div');
  row.className = 'room-row map-row';
  const info = document.createElement('div');
  const t = document.createElement('b'); t.textContent = title;
  const s = document.createElement('small'); s.textContent = sub;
  info.append(t, s);
  const act = document.createElement('div');
  act.className = 'pw-join';
  for (const [label, fn, cls] of buttons) {
    const b = document.createElement('button');
    b.textContent = label;
    if (cls) b.className = cls;
    b.addEventListener('click', fn);
    act.append(b);
  }
  row.append(info, act);
  return row;
}

async function renderMaps() {
  for (const b of document.querySelectorAll('.maps-tabs button')) b.classList.toggle('on', b.dataset.tab === mapsTab);
  const body = $('maps-body');
  body.textContent = '';
  setMapsMsg('');
  const follower = party.active && !party.leader;
  const themeName = (id) => (MAPS.find((m) => m.id === id) || {}).name || id;
  if (mapsTab === 'mine') {
    const list = loadMyMaps();
    if (!list.length) { const p = document.createElement('div'); p.className = 'rooms-empty'; p.textContent = "No saved maps yet. Open the map editor to make one."; body.append(p); }
    for (const m of list) {
      const s = m.spec;
      body.append(mapRow(s.name, `${s.w}×${s.d} m · ${themeName(s.theme)} look · ${s.s.length} blocks · ${s.sp.length} spawns${m.pub ? ' · published' : ''}`, [
        ['Edit', () => openEditor(s, m.id, m.pub || null)],
        ['Play', () => playCustom(s, 'solo')],
        ['Host', () => (follower ? setMapsMsg('Your party leader picks the room.') : playCustom(s, 'host'))],
        ['Delete', () => { if (window.confirm(`Delete "${s.name}" from My maps?`)) { saveMyMaps(loadMyMaps().filter((x) => x.id !== m.id)); renderMaps(); } }],
      ]));
    }
    return;
  }
  if (mapsTab === 'import') {
    const ta = document.createElement('textarea');
    ta.rows = 4; ta.placeholder = 'Paste a map code (it starts FAM1.)'; ta.spellcheck = false;
    ta.addEventListener('keydown', (e) => e.stopPropagation());
    const row = document.createElement('div'); row.className = 'btn-row';
    const go = (how) => { try { const spec = codeToSpec(ta.value); if (how === 'edit') openEditor(spec); else playCustom(spec, how); } catch (e) { setMapsMsg(e.message, true); } };
    for (const [label, how] of [['Play', 'solo'], ['Host a room', 'host'], ['Open in editor', 'edit']]) { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', () => go(how)); row.append(b); }
    body.append(ta, row);
    return;
  }
  // community
  if (!lobby.listMaps) { const p = document.createElement('div'); p.className = 'rooms-empty'; p.textContent = 'Community maps need the online service, which is unavailable right now. You can still share maps with codes.'; body.append(p); return; }
  const wait = document.createElement('div'); wait.className = 'rooms-empty'; wait.textContent = 'Loading community maps…'; body.append(wait);
  let maps;
  try { maps = await lobby.listMaps(); } catch (e) { wait.textContent = "Couldn't load community maps. " + (e.message || ''); return; }
  if (mapsTab !== 'community') return;
  body.textContent = '';
  if (!maps.length) { const p = document.createElement('div'); p.className = 'rooms-empty'; p.textContent = 'No community maps yet. Make one in the editor and press Publish.'; body.append(p); return; }
  maps.sort((a, b) => b.votes - a.votes || b.at - a.at);
  for (const m of maps) {
    const spec = () => codeToSpec(m.code);
    body.append(mapRow(`${m.name}`, `by ${m.author} · ${m.w}×${m.d} m · ${themeName(m.theme)} look · ▲ ${m.votes}`, [
      [m.voted ? '▲ Voted' : '▲ Vote', async () => { try { await lobby.voteMap(m.id, !m.voted); renderMaps(); } catch (e) { setMapsMsg("Couldn't vote: " + (e.message || ''), true); } }, m.voted ? 'on' : ''],
      ['Play', () => { try { playCustom(spec(), 'solo'); } catch (e) { setMapsMsg(e.message, true); } }],
      ['Host', () => { if (follower) { setMapsMsg('Your party leader picks the room.'); return; } try { playCustom(spec(), 'host'); } catch (e) { setMapsMsg(e.message, true); } }],
      ...(m.mine ? [['Delete', async () => { if (window.confirm(`Take "${m.name}" down from community maps?`)) { await lobby.deleteMap(m.id).catch(() => {}); renderMaps(); } }]] : []),
    ]));
  }
}
$('btn-maps').addEventListener('click', () => { renderMaps(); $('maps-ov').classList.remove('hidden'); });
$('btn-maps-done').addEventListener('click', () => $('maps-ov').classList.add('hidden'));
$('btn-open-editor').addEventListener('click', () => openEditor());

// ---------------------------------------------------------------- friends
// Friend codes, who's online (Firebase presence) and invites into your party.

const FRIENDS_KEY = 'foundry-arena-friends';
const myFriendCode = friendCode(getAccount().id);
const friendState = new Map(); // code -> presence row or null
const friendWatch = new Map(); // code -> unsubscribe
let pendingInvites = [];
function loadFriends() {
  try { const a = JSON.parse(localStorage.getItem(FRIENDS_KEY) || '[]'); return Array.isArray(a) ? a.filter((f) => f && /^[2-9A-HJ-NP-Z]{8}$/.test(f.code)).slice(0, 50) : []; } catch (e) { return []; }
}
function saveFriends(list) { try { localStorage.setItem(FRIENDS_KEY, JSON.stringify(list.slice(0, 50))); } catch (e) { /* full */ } }

/** Tell friends what we're doing (menu, solo, in a room). */
function syncPresence() {
  if (!lobby.setPresence || !lobby.online) return;
  const inRoom = net.active;
  lobby.setPresence({
    code: myFriendCode, name: settings.name || 'Player',
    st: state === 'menu' ? 'menu' : inRoom ? (game.rules.ranked ? 'ranked' : 'room') : 'solo',
    mode: state === 'menu' ? '' : game.rules.name, map: state === 'menu' ? '' : game.map.name,
    room: inRoom ? net.code : '', open: inRoom && !(net.role === 'host' ? net.password : net.lastPw) && !game.rules.ranked,
  });
}
setInterval(syncPresence, 30000); // a heartbeat (the write itself is skipped if nothing changed)

function watchFriends() {
  if (!lobby.watchFriend) return;
  const list = loadFriends();
  for (const f of list) {
    if (friendWatch.has(f.code)) continue;
    friendWatch.set(f.code, lobby.watchFriend(f.code, (row) => {
      friendState.set(f.code, row);
      if (row && row.name) { const l = loadFriends(); const it = l.find((x) => x.code === f.code); if (it && it.name !== row.name) { it.name = row.name; saveFriends(l); } }
      renderFriendsChip();
      if (!$('friends-ov').classList.contains('hidden')) renderFriends();
    }));
  }
}

function renderFriendsChip() {
  const on = loadFriends().filter((f) => friendState.get(f.code)).length;
  const b = $('btn-friends');
  b.textContent = on ? `Friends · ${on}` : 'Friends';
  b.classList.toggle('on', on > 0);
}

function friendStatus(row) {
  if (!row) return ['Offline', ''];
  if (row.st === 'menu') return ['Online, in the menu', 'on'];
  if (row.st === 'solo') return [`Playing solo · ${row.mode} on ${row.map}`, 'busy'];
  if (row.st === 'ranked') return [`Playing ranked · ${row.map}`, 'busy'];
  return [`In a room · ${row.mode} on ${row.map}${row.open ? '' : ' (private)'}`, 'busy'];
}

function setFrMsg(t, err = false) { const e = $('fr-msg'); e.textContent = t || ''; e.classList.toggle('err', !!err); }

function renderFriends() {
  $('fr-code').textContent = showFriendCode(myFriendCode);
  const inv = $('fr-invites');
  inv.textContent = '';
  for (const i of pendingInvites) inv.append(inviteRow(i));
  const list = $('fr-list');
  list.textContent = '';
  if (!lobby.canFriends) {
    const p = document.createElement('div'); p.className = 'rooms-empty';
    p.textContent = lobby.setPresence ? 'Connecting to the online service…' : 'Friends need the online service, which is unavailable right now.';
    list.append(p);
    return;
  }
  const friends = loadFriends();
  if (!friends.length) { const p = document.createElement('div'); p.className = 'rooms-empty'; p.textContent = 'No friends added yet. Swap friend codes with someone and add theirs above.'; list.append(p); }
  const follower = party.active && !party.leader;
  friends.sort((a, b) => !!friendState.get(b.code) - !!friendState.get(a.code));
  for (const f of friends) {
    const row = friendState.get(f.code);
    const [text, cls] = friendStatus(row);
    const r = document.createElement('div'); r.className = 'room-row fr-row';
    const dot = document.createElement('i'); dot.className = 'fr-dot ' + cls;
    const info = document.createElement('div');
    const n = document.createElement('b'); n.textContent = (row && row.name) || f.name || showFriendCode(f.code);
    const sub = document.createElement('small'); sub.textContent = `${text} · ${showFriendCode(f.code)}`;
    info.append(n, sub);
    const act = document.createElement('div'); act.className = 'pw-join';
    const btn = (label, fn, disabled = false, title = '') => { const b = document.createElement('button'); b.textContent = label; b.disabled = disabled; if (title) b.title = title; b.addEventListener('click', fn); act.append(b); };
    btn('Invite', () => inviteFriend(f.code), !row || follower, follower ? 'Your party leader does the inviting' : !row ? 'They\'re offline' : 'Invite them into your party');
    if (row && row.st === 'room' && row.room && row.open) btn('Join', () => { closeFriends(); codeInput.value = row.room; joinRoom(row.room, ''); }, follower || (net.active && net.code === row.room));
    btn('Remove', () => { if (!window.confirm(`Remove ${n.textContent} from your friends?`)) return; saveFriends(loadFriends().filter((x) => x.code !== f.code)); const off = friendWatch.get(f.code); if (off) off(); friendWatch.delete(f.code); friendState.delete(f.code); renderFriends(); renderFriendsChip(); });
    r.append(dot, info, act);
    list.append(r);
  }
}

/** Invite a friend into our party (starting one if we're not in one). */
async function inviteFriend(code) {
  try {
    if (!party.active) { await party.start(settings.name || 'Player'); if (net.active) party.enteredRoom(net.code, net.role === 'host' ? net.password : net.lastPw); }
    await lobby.sendInvite(code, myFriendCode, { name: settings.name || 'Player', kind: 'party', code: party.code });
    setFrMsg(`Invite sent. When they accept, they join your party${net.active ? ' and come into this room' : ''}.`);
  } catch (e) { setFrMsg("Couldn't send the invite: " + (e.message || 'try again'), true); }
}

function inviteRow(i) {
  const r = document.createElement('div'); r.className = 'fr-invite';
  const t = document.createElement('span'); t.textContent = `${i.name} invited you to their ${i.kind === 'party' ? 'party' : 'room'}.`;
  const yes = document.createElement('button'); yes.textContent = 'Join'; yes.className = 'primary';
  const no = document.createElement('button'); no.textContent = 'Decline';
  yes.addEventListener('click', () => acceptInvite(i));
  no.addEventListener('click', () => dropInvite(i));
  r.append(t, yes, no);
  return r;
}

function dropInvite(i) {
  pendingInvites = pendingInvites.filter((x) => x !== i);
  lobby.clearInvite(myFriendCode, i.from);
  renderInviteToast();
  if (!$('friends-ov').classList.contains('hidden')) renderFriends();
}

async function acceptInvite(i) {
  dropInvite(i);
  closeFriends();
  if (i.kind === 'party') {
    if (party.active && party.code === i.code) return;
    try { await party.join(i.code, settings.name || 'Player'); setMpStatus(`You joined ${i.name}'s party.`); } catch (e) { setMpStatus(e.message, true); }
  } else {
    codeInput.value = i.code;
    joinRoom(i.code, i.pw);
  }
}

function renderInviteToast() {
  const t = $('invite-toast');
  const i = pendingInvites[pendingInvites.length - 1];
  t.classList.toggle('hidden', !i);
  if (!i) return;
  t.textContent = '';
  const h = document.createElement('b'); h.textContent = `${i.name} invited you`;
  const p = document.createElement('p'); p.textContent = i.kind === 'party' ? "Join their party: you'll follow them into rooms and play on their team." : 'Join their room.';
  const row = document.createElement('div'); row.className = 'btn-row';
  const yes = document.createElement('button'); yes.className = 'primary'; yes.textContent = 'JOIN';
  const no = document.createElement('button'); no.textContent = 'Decline';
  yes.addEventListener('click', () => acceptInvite(i));
  no.addEventListener('click', () => dropInvite(i));
  row.append(no, yes);
  t.append(h, p, row);
}
lobbyHooks.onInvite = (i) => {
  if (!loadFriends().length && !i.name) return;
  pendingInvites = pendingInvites.filter((x) => x.from !== i.from).concat(i);
  renderInviteToast();
  audio.play('chat');
  if (state === 'playing') hud.chatAdd('', 0, `${i.name} invited you to their party. Press Esc to answer.`);
  if (!$('friends-ov').classList.contains('hidden')) renderFriends();
};

function openFriends() { setFrMsg(''); watchFriends(); renderFriends(); $('friends-ov').classList.remove('hidden'); }
function closeFriends() { $('friends-ov').classList.add('hidden'); }
$('btn-friends').addEventListener('click', openFriends);
$('btn-fr-done').addEventListener('click', closeFriends);
$('btn-fr-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(showFriendCode(myFriendCode)); setFrMsg('Friend code copied.'); } catch (e) { setFrMsg(`Your code: ${showFriendCode(myFriendCode)}`); }
});
$('fr-input').addEventListener('input', () => { const c = cleanFriendCode($('fr-input').value); $('fr-input').value = c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c; });
$('fr-input').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.code === 'Enter') $('btn-fr-add').click(); });
$('btn-fr-add').addEventListener('click', () => {
  const code = cleanFriendCode($('fr-input').value);
  if (code.length !== 8) { setFrMsg('Friend codes are 8 characters, like K7Q2-M9XD.', true); return; }
  if (code === myFriendCode) { setFrMsg("That's your own code.", true); return; }
  const list = loadFriends();
  if (list.some((f) => f.code === code)) { setFrMsg('Already on your list.'); return; }
  if (list.length >= 50) { setFrMsg('Your list is full (50 friends).', true); return; }
  list.push({ code, name: '' });
  saveFriends(list);
  $('fr-input').value = '';
  setFrMsg(`Added ${showFriendCode(code)}. They show as online once they're playing.`);
  watchFriends();
  renderFriends();
});

// ---------------------------------------------------------------- ranked
// (see ranked.js) SR lives in Firebase ranked/<uid>, checked by the rules.

let myRank = null; // { sr, peak, games, wins, season }
async function refreshRank() {
  if (!lobby.myRanked || !lobby.online) { renderRankChip(); return; }
  try { myRank = await lobby.myRanked(); game.player.sr = myRank.sr; if (myRank.peak) game.progress.setRankPeak(tierIndex(myRank.peak)); } catch (e) { /* offline */ }
  renderRankChip();
}
function renderRankChip() {
  const c = $('rank-chip');
  if (!lobby.myRanked) { c.textContent = ''; return; }
  c.textContent = !myRank ? '' : myRank.games < 5 ? `placement ${myRank.games}/5` : `${tierName(myRank.sr)} · ${myRank.sr}`;
  c.style.color = myRank && myRank.games >= 5 ? tierColor(myRank.sr) : '';
  $('btn-ranked').title = myRank ? `${seasonName(myRank.season)}: ${tierName(myRank.sr)}, ${myRank.sr} SR (${myRank.wins} wins in ${myRank.games} matches). Fixed rules; your skill rating goes up or down.` : 'Ranked: fixed rules, your skill rating goes up or down.';
}

/** Ranked: into the fullest open ranked room, or host one. */
async function rankedPlay() {
  if (net.active || (party.active && !party.leader)) return;
  if (!lobby.myRanked) { setMpStatus('Ranked needs the online service, which is unavailable right now.', true); return; }
  cancelRejoin();
  audio.resume();
  setMpBusy(true);
  setMpStatus('Finding a ranked match…');
  for (let i = 0; i < 25 && !lobby.online; i++) await new Promise((r) => setTimeout(r, 200));
  if (!lobby.online) { setMpBusy(false); setMpStatus("Couldn't reach the online service. Try again in a moment.", true); return; }
  await refreshRank();
  await new Promise((r) => setTimeout(r, 400));
  const rooms = lobby.joinable().filter((r) => r.rk && !r.locked && r.n < r.max).sort((a, b) => b.n - a.n);
  setMpBusy(false);
  for (const r of rooms.slice(0, 3)) {
    setMpStatus(`Joining ${r.host}'s ranked room (${r.mode}, ${r.map})…`);
    codeInput.value = r.code;
    try { setMpBusy(true); await net.join(r.code, settings.name, ''); } catch (e) { continue; } finally { setMpBusy(false); }
    party.enteredRoom(r.code, '');
    await enterRoom();
    return;
  }
  // nobody's hosting: host a ranked room for others to find
  rankedRoom = { map: RANKED_MAPS[(Math.random() * RANKED_MAPS.length) | 0], mode: RANKED_MODES[(Math.random() * RANKED_MODES.length) | 0] };
  setMpStatus('No ranked rooms open. Hosting one: others joining through Ranked will land here.');
  await hostGame({ quick: true });
  if (net.role === 'host') hud.centerMessage('RANKED ROOM', 'Your match counts once another player joins', 5, '#ff6b1a');
  else rankedRoom = null;
}
$('btn-ranked').addEventListener('click', rankedPlay);

/** After a ranked match: work out the SR change and send it. */
async function reportRanked(res) {
  const el = $('end-ranked');
  el.classList.add('hidden');
  if (!game.rules.ranked || !net.active || !lobby.reportRanked) return;
  const humans = game.chars.filter((c) => c.isHuman);
  const show = (html) => { el.innerHTML = html; el.classList.remove('hidden'); };
  if (humans.length < 2) { show('Ranked: not counted (you need at least one other player in the match).'); return; }
  if (game.time < 60 || game.matchPlayT < game.time * 0.5) { show('Ranked: not counted (you joined too late).'); return; }
  if (!myRank) await refreshRank();
  if (!myRank) return;
  // the host writes the match record everyone's result is checked against
  if (net.role === 'host' && game.rankedMid && lobby.recordRankedMatch) {
    const [b, r] = game.teamScore;
    const t = {};
    if (lobby.uid) t[lobby.uid] = game.player.team;
    for (const c of game.remotes) if (c.isHuman && c.uid && (c.team === 0 || c.team === 1)) t[c.uid] = c.team;
    try { await lobby.recordRankedMatch(game.rankedMid, b === r ? -1 : b > r ? 0 : 1, t); } catch (e) { show('Ranked: the match record could not be saved, so this match does not count.'); return; }
  }
  if (!game.rankedMid) { show('Ranked: not counted (no match record from the host).'); return; }
  const others = humans.filter((c) => c !== game.player && c.sr >= 0);
  const lobbySr = others.length ? others.reduce((a, c) => a + c.sr, 0) / others.length : START_SR;
  const result = res.draw ? 0.5 : res.won ? 1 : 0;
  // how you did on your own team: top scorer +1 .. bottom -1
  const team = game.ranking().filter((c) => c.team === game.player.team);
  const i = team.indexOf(game.player);
  const perf = team.length > 1 && i >= 0 ? 1 - (2 * i) / (team.length - 1) : 0;
  const delta = srChange(myRank, lobbySr, result, perf);
  const before = myRank.sr, tierBefore = tierIndex(before);
  try {
    const r = await lobby.reportRanked({ delta, won: result === 1, name: settings.name || 'Player', bid: boardId(getAccount().id), m: game.rankedMid });
    myRank = { ...myRank, sr: r.after, peak: r.row.peak, games: r.row.games, wins: r.row.wins };
    game.player.sr = r.after;
    const t = tierIndex(r.after);
    const unlocked = game.progress.setRankPeak(tierIndex(r.row.peak));
    const d = r.after - before;
    show(`Ranked <b class="${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${d} SR</b> · ${before} → ${r.after} · <span class="rk-tier" style="color:${tierColor(r.after)}">${myRank.games < 5 ? `placement ${myRank.games}/5` : tierName(r.after)}</span>`);
    if (t > tierBefore && myRank.games >= 5) hud.centerMessage('RANK UP', tierName(r.after), 4, tierColor(r.after));
    if (unlocked && ITEMS.card.some((c) => c.rank === tierIndex(r.row.peak))) setTimeout(() => game.announcer.announce('New calling card', `${tierName(r.row.peak)} reached`), 1500);
    renderRankChip();
  } catch (e) {
    show('Ranked: not counted this time (results count at most once every 3 minutes).');
  }
}

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
  rankedRoom = null;
  if (typeof editorTesting !== 'undefined') editorTesting = false;
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
  const show = !!r.teams && !r.noSwitch && !r.training && !game.over && !game.attract;
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
// achievements: a call-out mid-match (one at a time), a line on the end screen after one
const endAchs = [];
let achQueue = [], achBusy = false;
game.onAchievement = (a) => {
  if (state !== 'playing' || game.over) { endAchs.push(a); return; }
  achQueue.push(a);
  if (!achBusy) nextAch();
};
function nextAch() {
  const a = achQueue.shift();
  if (!a) { achBusy = false; return; }
  achBusy = true;
  if (a.pass) game.announcer.announce(`Season tier ${a.tier}`, a.sub);
  else {
    const card = a.card ? ITEMS.card.find((i) => i.id === a.card) : null;
    game.announcer.announce('Achievement', `${a.name}${a.xp ? `  +${fmt(a.xp)} XP` : ''}${card ? `  ·  ${card.name} card unlocked` : ''}`);
  }
  setTimeout(nextAch, 2600);
}
// season pass tiers: called out in a match (in the same queue), listed on the end screen
const endTiers = [];
game.progress.onPassTier = (tier, r) => {
  const item = r.id ? ITEMS[r.slot].find((i) => i.id === r.id) : null;
  const sub = item ? `Unlocked: ${item.name} (${SLOTS.find((s) => s.id === r.slot).name.toLowerCase()})` : `+${fmt(r.xp)} bonus XP`;
  renderSeasonChip();
  if (state !== 'playing' || game.over) { endTiers.push({ tier, sub }); return; }
  achQueue.push({ pass: true, tier, sub });
  if (!achBusy) nextAch();
};

function renderSeasonChip() {
  const pass = game.progress.pass;
  $('season-chip').textContent = `${pass.tier}/${PASS_TIERS}`;
}
renderSeasonChip();

function openSeason() {
  const pr = game.progress, pass = pr.pass, theme = themeOf(pass.season);
  $('sp-theme').textContent = theme.name;
  $('sp-theme').style.color = theme.color;
  $('sp-name').textContent = seasonName(pass.season);
  const ms = msToSeasonEnd(), d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000);
  $('sp-left').textContent = `ends in ${d ? `${d} day${d === 1 ? '' : 's'} ` : ''}${h}h`;
  const into = pass.tier >= PASS_TIERS ? PASS_TIER_XP : pass.xp - pass.tier * PASS_TIER_XP;
  $('sp-tier').textContent = `Tier ${pass.tier}`;
  $('sp-fill').style.width = `${Math.round((into / PASS_TIER_XP) * 100)}%`;
  $('sp-xp').textContent = pass.tier >= PASS_TIERS ? 'Complete!' : `${fmt(into)} / ${fmt(PASS_TIER_XP)} XP to tier ${pass.tier + 1}`;
  const box = $('sp-track');
  box.textContent = '';
  for (const r of passTrack(pass.season)) {
    const cell = document.createElement('div');
    const got = r.tier <= pass.tier;
    cell.className = 'sp-cell' + (got ? ' got' : '') + (r.tier === pass.tier + 1 ? ' next' : '') + (r.id ? ' item' : '');
    const n = document.createElement('b'); n.textContent = r.tier;
    cell.append(n);
    if (r.id) {
      const item = ITEMS[r.slot].find((i) => i.id === r.id);
      cell.append(swatchFor(r.slot, item));
      const nm = document.createElement('small'); nm.textContent = item.name;
      cell.title = `${SLOTS.find((s) => s.id === r.slot).name}: ${item.name}`;
      cell.append(nm);
    } else {
      const x = document.createElement('small'); x.className = 'xp'; x.textContent = `+${r.xp} XP`;
      cell.append(x);
    }
    box.append(cell);
  }
  $('season').classList.remove('hidden');
}
$('btn-season').addEventListener('click', openSeason);
$('btn-sp-done').addEventListener('click', () => $('season').classList.add('hidden'));
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
    + `<div class="xp-parts">${pr.match.map(([k, v]) => `<span>${k} <b>+${fmt(v)}</b></span>`).join('')}</div>`
    + endMedalsHtml();
}

/** This match's medals (and any achievements finished at the end) for the end screen. */
function endMedalsHtml() {
  const mm = Object.entries(game.progress.matchMedals || {}).filter(([id]) => MEDAL_BY_ID[id]);
  let html = '';
  if (mm.length) {
    html += `<div class="end-medals">${mm.map(([id, n]) => { const m = MEDAL_BY_ID[id]; return `<span class="em" title="${m.desc}"><i style="--mc:${m.col}">${m.g}</i>${m.name}${n > 1 ? ` <b>×${n}</b>` : ''}</span>`; }).join('')}</div>`;
  }
  if (endAchs.length) html += `<div class="end-achs">${endAchs.map((a) => `<span>Achievement: <b>${a.name}</b>${a.card ? ' (calling card unlocked)' : ''}</span>`).join('')}</div>`;
  if (endTiers.length) html += `<div class="end-achs end-tiers">${endTiers.map((t) => `<span>Season tier <b>${t.tier}</b>: ${t.sub}</span>`).join('')}</div>`;
  return html;
}

let customSlot = 'title';
function swatchFor(slot, item) {
  const sw = document.createElement('div');
  sw.className = 'sw';
  // a rendered picture of the real model (gear, charms, knives, grenades) or a drawing (tracers, effects, crosshairs)
  if (PREVIEW_SLOTS.has(slot)) {
    sw.classList.add('pic');
    const url = previewFor(slot, item.id, { color: game.player.baseColor, xhColor: settings.xhColor });
    if (url) { const img = document.createElement('img'); img.src = url; img.alt = item.name; img.draggable = false; sw.append(img); return sw; }
    sw.textContent = item.id === 'none' ? 'None' : item.name;
    return sw;
  }
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
    const n = ITEMS[s.id].filter((i) => pr.unlocked(i)).length;
    const sm = document.createElement('small'); sm.textContent = `${n}/${ITEMS[s.id].length}`;
    b.append(sm);
    b.addEventListener('click', () => { customSlot = s.id; renderCustom(); });
    slots.append(b);
  }
  const grid = $('custom-items');
  grid.textContent = '';
  for (const item of ITEMS[customSlot]) {
    const open = pr.unlocked(item);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'citem' + (eq[customSlot] === item.id ? ' on' : '') + (open ? '' : ' locked');
    b.append(swatchFor(customSlot, item));
    const nm = document.createElement('div'); nm.className = 'nm';
    nm.textContent = customSlot === 'title' ? '' : item.name; // a title's swatch already says it
    const req = document.createElement('small');
    req.textContent = open ? (eq[customSlot] === item.id ? 'equipped' : '')
      : item.pass ? `Season pass: ${(THEMES.find((t) => t.id === item.pass) || {}).name} tier ${item.tier}` : item.ach ? `Achievement: ${ACH_BY_ID[item.ach] ? ACH_BY_ID[item.ach].name : '?'}` : item.rank !== undefined ? `Reach ${TIERS[item.rank][0]}` : item.weekly ? (item.weekly === 1 ? 'Finish a week' : `${item.weekly} full weeks`) : item.prestige ? `Prestige ${item.prestige}` : `Level ${item.level}`;
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
      // skin swatches: click one to wear it (camos unlock one at a time: every 50 kills with this gun)
      const row = document.createElement('div'); row.className = 'swatches';
      const current = settings.skins[id] || 'none';
      const next = nextCamo(n);
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
      if (next) {
        const prog = document.createElement('span');
        prog.className = 'prog';
        prog.textContent = `${n}/${camoKills(next.id)}`;
        prog.title = `Next: ${next.name} at ${camoKills(next.id)} kills`;
        row.append(prog);
      }
      p.append(row);
    }
    tr.append(a, b, p);
    body.append(tr);
  }
  $('career-id').textContent = account.id;
  renderMedalsAchs();
}

// ---------------------------------------------------------------- gunsmith (attachments)
let gsGun = null;
const GS_GUNS = [...PRIMARIES, ...SECONDARIES];
function openGunsmith() {
  gsGun = gsGun || settings.primary;
  renderGunsmith();
  $('gunsmith').classList.remove('hidden');
}
function gsKills(id) { return (game.career.stats.weapons || {})[id] || 0; }
function renderGunsmith(hover = null) {
  const id = gsGun, base = WEAPON_BY_ID[id];
  const tabs = $('gs-guns');
  tabs.textContent = '';
  for (const g of GS_GUNS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gs-gun' + (g === id ? ' on' : '');
    const d = WEAPON_BY_ID[g];
    b.textContent = d.short || d.name;
    const n = attList(settings.attach[g] | 0, g).length;
    if (n) { const sm = document.createElement('small'); sm.textContent = '+' + n; b.append(sm); }
    b.addEventListener('click', () => { gsGun = g; audio.play('ui'); renderGunsmith(); });
    tabs.append(b);
  }
  const kills = gsKills(id);
  const code = settings.attach[id] | 0;
  const box = $('gs-slots');
  box.textContent = '';
  ATT_SLOTS.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'gs-row';
    const h = document.createElement('span'); h.className = 'gs-slot'; h.textContent = s.name;
    row.append(h);
    const cur = (code >> (i * 2)) & 3;
    ATTACHMENTS[s.id].forEach((a, k) => {
      const b = document.createElement('button');
      b.type = 'button';
      const fit = fits(a, id), open = attUnlocked(a, kills);
      b.className = 'gs-opt' + (k === cur ? ' on' : '') + (!fit ? ' nofit' : !open ? ' locked' : '');
      b.textContent = a.name;
      const sm = document.createElement('small');
      sm.textContent = !fit ? "doesn't fit" : !open ? `${a.kills} kills` : k === cur && k ? 'fitted' : '';
      b.append(sm);
      b.addEventListener('mouseenter', () => renderGsSide(a, i, k));
      b.addEventListener('mouseleave', () => renderGsSide(null));
      b.addEventListener('click', () => {
        if (!fit || !open) { audio.play('ui', null, 0.4); return; }
        const next = (code & ~(3 << (i * 2))) | (k << (i * 2));
        if (next) settings.attach[id] = next; else delete settings.attach[id];
        saveSettings(settings);
        game.applyOwnSkins();
        audio.play('ui');
        renderGunsmith();
        if (state === 'paused') $('pause-hint').textContent = 'Attachments change on your next spawn.';
      });
      row.append(b);
    });
    box.append(row);
  });
  renderGsSide(hover);
}
/** The description and stats panel: the fitted set, or what a hovered option would make it. */
function renderGsSide(a, slotI = -1, k = 0) {
  const id = gsGun, base = WEAPON_BY_ID[id];
  const code = settings.attach[id] | 0;
  const preview = a && slotI >= 0 ? (code & ~(3 << (slotI * 2))) | (k << (slotI * 2)) : code;
  const cur = withAttachments(base, code), next = withAttachments(base, preview);
  $('gs-desc').innerHTML = a ? `<b>${a.name}</b> ${a.desc || 'Nothing in this slot.'}${a.id !== 'none' && !attUnlocked(a, gsKills(id)) ? ` <i>Unlocks at ${a.kills} kills with the ${base.name} (you have ${gsKills(id)}).</i>` : ''}`
    : `<b>${base.name}</b> ${base.blurb} <i>${gsKills(id)} kills.</i>`;
  const rows = [
    ['Damage', (d) => d.damage * d.pellets, (v) => (base.pellets > 1 ? `${base.damage}×${base.pellets}` : Math.round(v)), 1],
    ['Fire rate', (d) => (d.burst ? (d.burst * 60) / (d.interval + d.burstGap * (d.burst - 1)) : 60 / d.interval), (v) => `${Math.round(v)} rpm`, 1],
    ['Range', (d) => d.falloffEnd, (v) => `${Math.round(v)} m`, 1],
    ['Hip spread', (d) => d.spreadMin * 1000, (v) => v.toFixed(1), -1],
    ['Aimed spread', (d) => d.spreadMin * d.adsSpread * 1000, (v) => v.toFixed(2), -1],
    ['Recoil', (d) => d.recoil * 1000, (v) => v.toFixed(1), -1],
    ['Bloom', (d) => d.heatPerShot * 100, (v) => v.toFixed(1), -1],
    ['Aim speed', (d) => d.adsRate || 14, (v) => `${Math.round(v / 14 * 100)}%`, 1],
    ['Move speed', (d) => d.speedMult * 100, (v) => `${Math.round(v)}%`, 1],
    ['Magazine', (d) => d.magSize, (v) => Math.round(v), 1],
    ['Reload', (d) => d.reload, (v) => `${v.toFixed(2)} s`, -1],
    ['Noise', (d) => d.noise, (v) => `${Math.round(v)} m`, -1],
  ];
  const body = $('gs-stats');
  body.textContent = '';
  for (const [label, f, show, good] of rows) {
    const b0 = f(base), v1 = f(cur), v2 = f(next);
    const tr = document.createElement('tr');
    const changed = Math.abs(v2 - b0) > 1e-6, previewing = Math.abs(v2 - v1) > 1e-6;
    const better = (v2 - b0) * good > 0;
    tr.className = changed ? (better ? 'up' : 'down') : '';
    if (previewing) tr.classList.add('pv');
    tr.innerHTML = `<td class="l">${label}</td><td>${show(b0)}</td><td>${changed ? `${better ? '▲' : '▼'} ${show(v2)}` : ''}</td>`;
    body.append(tr);
  }
}
$('btn-gunsmith').addEventListener('click', openGunsmith);
$('btn-gunsmith-pause').addEventListener('click', openGunsmith);
$('btn-gs-done').addEventListener('click', () => $('gunsmith').classList.add('hidden'));
$('btn-gs-clear').addEventListener('click', () => { delete settings.attach[gsGun]; saveSettings(settings); game.applyOwnSkins(); audio.play('ui'); renderGunsmith(); });

let careerTab = 'stats';
for (const t of document.querySelectorAll('.c-tab')) t.addEventListener('click', () => { careerTab = t.dataset.tab; showCareerTab(); audio.play('ui'); });
function showCareerTab() {
  for (const t of document.querySelectorAll('.c-tab')) t.classList.toggle('on', t.dataset.tab === careerTab);
  $('career-stats').classList.toggle('hidden', careerTab !== 'stats');
  $('career-medals').classList.toggle('hidden', careerTab !== 'medals');
  $('career-achs').classList.toggle('hidden', careerTab !== 'achs');
}

/** Career → Medals (lifetime counts) and Achievements (progress, rewards). */
function renderMedalsAchs() {
  const pr = game.progress, md = pr.medals;
  const mg = $('medal-grid');
  mg.textContent = '';
  for (const m of MEDALS) {
    const n = md[m.id] || 0;
    const d = document.createElement('div');
    d.className = 'mcell' + (n ? '' : ' none');
    d.title = m.desc + (m.xp ? ` (+${m.xp} XP)` : '');
    const i = document.createElement('i'); i.textContent = m.g; i.style.setProperty('--mc', m.col);
    const nm = document.createElement('span'); nm.textContent = m.name;
    const c = document.createElement('b'); c.textContent = n ? `×${fmt(n)}` : '—';
    d.append(i, nm, c);
    mg.append(d);
  }
  const s = pr.achState(game.career.stats, MODES.map((m) => m.id));
  const list = $('ach-list');
  list.textContent = '';
  let done = 0;
  for (const a of ACHIEVEMENTS) {
    const got = pr.achs[a.id];
    if (got) done++;
    const v = Math.min(a.goal, a.val(s));
    const row = document.createElement('div');
    row.className = 'ach' + (got ? ' done' : '');
    const top = document.createElement('div'); top.className = 'a-top';
    const nm = document.createElement('b'); nm.textContent = a.name;
    const rw = document.createElement('small');
    const card = a.card ? ITEMS.card.find((i) => i.id === a.card) : null;
    rw.textContent = [a.xp ? `+${fmt(a.xp)} XP` : '', card ? `${card.name} card` : ''].filter(Boolean).join(' · ');
    top.append(nm, rw);
    const ds = document.createElement('span'); ds.textContent = a.desc;
    const line = document.createElement('div'); line.className = 'd-line';
    const bar = document.createElement('div'); bar.className = 'd-bar';
    const fill = document.createElement('i'); fill.style.width = `${got ? 100 : Math.round((v / a.goal) * 100)}%`;
    bar.append(fill);
    const cnt = document.createElement('small');
    cnt.textContent = got ? `done ${typeof got === 'string' && got.length === 10 ? got : ''}`.trim() : a.prog ? a.prog(s) : `${fmt(Math.floor(v))}${a.unit ? ' ' + a.unit : ''}/${fmt(a.goal)}${a.unit ? ' ' + a.unit : ''}`;
    line.append(bar, cnt);
    row.append(top, ds, line);
    list.append(row);
  }
  $('ach-count').textContent = `${done}/${ACHIEVEMENTS.length}`;
  showCareerTab();
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

/** The guided tutorial (on the training range). */
async function startTutorial() {
  if (net.active) return;
  for (const id of ['keys-ov', 'welcome-ov']) $(id).classList.add('hidden');
  cancelRejoin();
  audio.resume();
  audio.setVolume(settings.volume);
  game.newMatch({ botCount: 1, bots: false, difficulty: settings.difficulty, map: RANGE_MAP, rules: TUTORIAL });
  setState('playing');
  const ok = await lock();
  if (!ok && state === 'playing') hud.setLockHint(true);
}
game.onTutorialDone = () => { settings.tutorialDone = true; saveSettings(settings); };
$('btn-tutorial').addEventListener('click', startTutorial);
$('btn-welcome-go').addEventListener('click', startTutorial);

// ---------------------------------------------------------------- first run
let benchFrames = null; // frame times while the welcome is up (menu background running)
function startWelcome() {
  $('welcome-ov').classList.remove('hidden');
  for (const [i, id] of ['wl-1', 'wl-2', 'wl-3'].entries()) $(id).classList.toggle('hidden', i !== 0);
  $('wl-name').value = settings.name || '';
  setTimeout(() => $('wl-name').focus(), 50);
  benchFrames = [];
}
/** Graphics for this computer, from how the menu background ran: frames per second at High. */
function suggestQuality() {
  const f = (benchFrames || []).slice(20); // skip the first frames (shaders compiling)
  benchFrames = null;
  if (f.length < 20) return settings.quality;
  f.sort((a, b) => a - b);
  const fps = 1 / f[Math.floor(f.length / 2)];
  return fps >= 55 ? 'high' : fps >= 40 ? 'medium' : 'low';
}
function welcomeName() {
  const n = cleanName($('wl-name').value);
  if (n) { settings.name = n; nameInput.value = n; saveSettings(settings); updateBoardEntry(); }
  $('wl-1').classList.add('hidden');
  $('wl-2').classList.remove('hidden');
  // give the measurement a moment if it's only just started
  const pick = () => {
    const q = suggestQuality();
    $('wl-gfx').value = q;
    $('wl-gfx-line').textContent = `We picked ${q[0].toUpperCase() + q.slice(1)} for this computer.`;
    settings.quality = q; saveSettings(settings); onSetting('quality');
  };
  if (benchFrames && benchFrames.length < 60) setTimeout(pick, 1200); else pick();
}
$('btn-wl-next').addEventListener('click', welcomeName);
$('wl-name').addEventListener('keydown', (e) => { if (e.code === 'Enter') welcomeName(); });
$('wl-gfx').addEventListener('change', () => { settings.quality = $('wl-gfx').value; saveSettings(settings); onSetting('quality'); });
$('btn-wl-next2').addEventListener('click', () => { $('wl-2').classList.add('hidden'); $('wl-3').classList.remove('hidden'); });

// ---------------------------------------------------------------- credits
$('btn-credits').addEventListener('click', () => {
  $('cr-ver').textContent = `Version ${VERSION} · build ${BUILD}${BUILD_TIME ? ` · ${BUILD_TIME.slice(0, 10)}` : ''}`;
  $('credits-ov').classList.remove('hidden');
});
$('btn-credits-done').addEventListener('click', () => $('credits-ov').classList.add('hidden'));
$('btn-welcome-no').addEventListener('click', () => { settings.tutorialDone = true; saveSettings(settings); $('welcome-ov').classList.add('hidden'); });
$('btn-range-reset').addEventListener('click', () => { if (game.range) game.range.resetStats(); resume(); });
$('btn-quit').addEventListener('click', leaveToMenu);
$('btn-menu').addEventListener('click', leaveToMenu);

/**
 * Belt and braces for the keyboard: while playing, keys must be live unless chat
 * is open; and the pause menu can't be used with the mouse captured, so a pause
 * that ends up with the pointer locked (a browser quirk) goes straight back to play.
 */
function inputWatchdog() {
  if (state === 'playing' && !chatting && !input.active) input.active = true;
}
setInterval(() => {
  if (state === 'paused' && !NOLOCK && input.locked && document.pointerLockElement === canvas) {
    pausedLockedT = (pausedLockedT || 0) + 1;
    if (pausedLockedT >= 2) { pausedLockedT = 0; setState('playing'); hud.setLockHint(false); }
  } else pausedLockedT = 0;
}, 250);
let pausedLockedT = 0;

// Ctrl+Shift+F9: a small readout of what the game sees from the keyboard and mouse (for bug reports)
let inputDebug = null;
window.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey && e.shiftKey && e.code === 'F9')) return;
  if (inputDebug) { clearInterval(inputDebug.t); inputDebug.el.remove(); inputDebug = null; return; }
  const el = document.createElement('pre');
  el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;margin:0;padding:8px 10px;background:rgba(0,0,0,.8);color:#7fdc9a;font:12px monospace;pointer-events:none';
  document.body.append(el);
  const t = setInterval(() => {
    const f = document.activeElement;
    el.textContent = `state ${state}  keys-on ${input.active}  mouse-locked ${input.locked}/${!!document.pointerLockElement}\n`
      + `chat ${chatting}  focus ${f ? f.tagName.toLowerCase() + (f.id ? '#' + f.id : '') : '-'}  page-focused ${document.hasFocus()}\n`
      + `held [${[...input.keys].join(' ')}]  last key ${input.lastKey || '-'} ${input.lastKeyT ? ((performance.now() - input.lastKeyT) / 1000).toFixed(1) + 's ago' : ''}  build ${BUILD}`;
  }, 100);
  inputDebug = { el, t };
}, true);

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
  if (!$('profile-ov').classList.contains('hidden')) { if (e.code === 'Escape') $('profile-ov').classList.add('hidden'); return; }
  for (const id of ['rooms-ov', 'board-ov', 'welcome-ov', 'maps-ov', 'friends-ov']) {
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
  endTiers.length = 0;
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
    // end-of-match medals
    const endMedal = (id) => { if (pr.medal(id) && MEDAL_BY_ID[id].xp) pr.add(MEDAL_BY_ID[id].xp, 'Medals'); };
    if (won && !res.draw) endMedal('win');
    const p = game.player, others = game.chars.filter((c) => c !== p);
    if (others.length && p.kills > 0 && others.every((c) => p.kills > c.kills)) endMedal('mvp');
    if (game.rules.objective === 'infected' && won && p.team === 0) endMedal('survive');
    pr.challenge('match', 1, { mode: game.rules.id });
    if (won) pr.challenge('win', 1, { mode: game.rules.id });
  }
  endAchs.length = 0;
  game.checkAchievements();
  renderSeasonChip();
  game.progress.save();
  updateBoardEntry();
  reportRanked(res);
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
  if (o && rankedRoom) rankedRoom = { map: o[0], mode: o[1] };
  else if (o) {
    settings.map = o[0];
    settings.mode = o[1];
    saveSettings(settings);
    syncMatchPickers();
  }
  startMatch();
}

// ---------------------------------------------------------------- main loop
function tick(dt, render) {
  music.update(dt);
  music.updateAmbience();
  if (state === 'playing' && !game.over) music.setIntensity(game.musicIntensity());
  if (state === 'playing') {
    hud.setScoreboard(input.act('scoreboard'), game);
    game.update(dt);
    if (game.forCareer && !game.over) { game.matchPlayT += dt; game.career.tick(dt); }
    inputWatchdog();
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
let dynSlow = 0, dynFast = 0;
function frame(now) {
  requestAnimationFrame(frame);
  // Settings → Frame rate cap: skip frames that come too soon
  const cap = settings.fpsCap;
  if (cap && now - last < 1000 / cap - 1) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (dt <= 0) return;
  tick(dt, true);
  dynamicResolution(dt);
  if (benchFrames && benchFrames.length < 400) benchFrames.push(dt);
}

/** Settings → Dynamic resolution: drop the resolution while frames run slow, raise it back when there's room. */
function dynamicResolution(dt) {
  if (!settings.dynRes || state !== 'playing') { if (game.dynScale && game.dynScale !== 1 && !settings.dynRes) game.setDynScale(1); return; }
  const target = 1 / Math.min(60, settings.fpsCap || 60);
  const s = game.dynScale || 1;
  if (dt > target * 1.2) { dynSlow += dt; dynFast = 0; } else if (dt < target * 1.05) { dynFast += dt; dynSlow = 0; }
  if (dynSlow > 0.75 && s > 0.6) { game.setDynScale(Math.max(0.6, s - 0.1)); dynSlow = 0; }
  if (dynFast > 4 && s < 1) { game.setDynScale(Math.min(1, s + 0.05)); dynFast = 0; }
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
// first visit: a name, graphics that suit this computer, and the tutorial (not when
// arriving through an invite, and not for people who've already played)
if (!settings.tutorialDone && !game.career.stats.matches && !params.get('join') && !params.get('party') && !params.has('notut')) startWelcome();
requestAnimationFrame(frame);
// the loading screen goes once the menu is up
{
  const boot = $('boot');
  if (boot) { clearInterval(window.__bootTips); boot.classList.add('done'); setTimeout(() => boot.remove(), 600); }
}

// handy for debugging / automated tests
window.__game = game;
window.__net = net;
window.__party = party;
window.__lobby = lobby;
window.__editor = editor;
window.__music = music;
window.__app = { get state() { return state; }, startMatch, hostGame, joinGame, pause, resume, setState, openChat, closeChat, input, settings };
