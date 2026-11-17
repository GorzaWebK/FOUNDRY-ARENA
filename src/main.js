// App bootstrap: menus, pointer lock, pause, multiplayer lobby, chat, main loop.

import './style.css';
import { MAPS, getMap } from './maps/index.js';
import { MODES, getMode, makeRules, customSummary, TIME_OPTIONS, HARDCORE_HEALTH } from './modes.js';
import RANGE_MAP from './maps/range.js';
import { TRAINING } from './training.js';
import { WEAPON_BY_ID, PRIMARIES, TACTICALS, TACTICAL_BY_ID, WEAPONS as WEAPON_LIST } from './weapons.js';
import { loadSettings, saveSettings, buildSettingsUI } from './settings.js';
import { AudioSys } from './audio.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { Game } from './game.js';
import { Net, cleanName } from './net.js';
import { cleanRoomCode } from './transport.js';
import { ACTIONS, keyName, bindLabel, defaultBinds } from './bindings.js';
import { BUILD, BUILD_TIME } from './version.js';
import { getAccount, exportCode, parseCode, importAccount } from './account.js';
import { SKINS, SKIN_KILLS, skinSwatchCss, skinUnlocked } from './skins.js';

{
  // version stamp on the main menu, so players can compare before joining
  const el = document.getElementById('version-note');
  const day = BUILD_TIME ? BUILD_TIME.slice(0, 10) : '';
  if (el) el.textContent = 'Version ' + BUILD + (day ? ' · ' + day : '');
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
    else setMpStatus(reason, true);
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

function syncMatchPickers() {
  for (const s of mapSels) s.value = settings.map;
  for (const s of modeSels) s.value = settings.mode;
  const r = nextRules();
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
      if (state === 'paused') $('pause-hint').textContent = `${def.name} selected — you'll have it when you next respawn.`;
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
      if (state === 'paused') $('pause-hint').textContent = `${def.name} selected — you'll have it when you next respawn.`;
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
nameInput.addEventListener('input', () => { settings.name = cleanName(nameInput.value); saveSettings(settings); });
codeInput.addEventListener('input', () => { codeInput.value = cleanRoomCode(codeInput.value); });
codeInput.addEventListener('keydown', (e) => { if (e.code === 'Enter') joinGame(); });
if (params.get('join')) codeInput.value = cleanRoomCode(params.get('join'));

function setMpStatus(text, isError = false) {
  const el = $('mp-status');
  el.textContent = text || '';
  el.classList.toggle('err', !!isError);
}

function setMpBusy(busy) {
  for (const id of ['btn-host', 'btn-join', 'btn-play']) $(id).disabled = busy;
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
  const label = on ? `ROOM ${net.code} · ${n} player${n === 1 ? '' : 's'}` : '';
  $('room').textContent = label;
  $('room').classList.toggle('hidden', !on);
  $('room-box').classList.toggle('hidden', !on);
  $('room-code').textContent = net.code;
  $('room-count').textContent = on ? `${n} player${n === 1 ? '' : 's'} connected` : '';
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
  hud.centerMessage('TRAINING RANGE', 'Walk onto a stand to swap guns · step on the orange pad for the 30s challenge', 4, '#ff8a2a');
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

async function hostGame() {
  cancelRejoin();
  audio.resume();
  setMpBusy(true);
  setMpStatus('Creating a room…');
  try {
    await net.host(settings.name);
  } catch (e) {
    setMpStatus(e.message, true);
    return;
  } finally {
    setMpBusy(false);
  }
  setMpStatus('');
  hud.chatClear();
  await startMatch();
  hud.centerMessage(`ROOM ${net.code}`, 'Press Esc for the invite link', 5, '#4fc3f7');
}

async function joinGame() {
  cancelRejoin();
  const code = cleanRoomCode(codeInput.value);
  if (!code) { setMpStatus('Enter the room code from your host.', true); return; }
  audio.resume();
  setMpBusy(true);
  setMpStatus(`Connecting to room ${code}…`);
  hud.chatClear();
  try {
    await net.join(code, settings.name);
  } catch (e) {
    setMpStatus(e.message, true);
    return;
  } finally {
    setMpBusy(false);
  }
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
      await enterRoom();
      return;
    } catch (e) {
      if (/newer version|older version|full/i.test(e.message)) { setMpStatus(e.message, true); return; }
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (token === rejoinToken && !net.active) {
    setMpStatus(`Couldn't get back into room ${code}. The host may have left. Press Join to try again — your score is kept for 3 minutes.`, true);
  }
}

function startAttract() {
  game.newMatch({ botCount: 6, bots: true, difficulty: 'normal', attract: true, map: getMap(settings.map) });
  hud.chatClear();
  setState('menu');
}

function leaveToMenu() {
  input.exitLock();
  net.leave();
  startAttract();
}

function pause() {
  if (state !== 'playing') return;
  $('pause-hint').textContent = net.active ? 'The match keeps running while this menu is open.' : '';
  $('copy-note').textContent = '';
  const r = game.rules;
  $('loadout-note').textContent = r.gunGame ? 'Gun Game hands out the weapons — your pick applies in other modes.'
    : r.forcePrimary ? 'Snipers Only: everyone has a sniper rifle — your pick applies in other modes.' : '';
  syncMatchPickers();
  setState('paused');
}

async function resume() {
  if (state !== 'paused') return;
  audio.resume();
  const ok = await lock();
  if (ok) setState('playing');
  else $('pause-hint').textContent = 'Could not capture the mouse yet — click Resume again.';
}

// ---------------------------------------------------------------- controls (rebinding)
const label = (action) => bindLabel(settings.binds, action);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Main-menu summary of the current controls. */
function renderKeysList() {
  const k = (a) => `<kbd>${esc(label(a))}</kbd>`;
  $('keys-list').innerHTML = [
    `${k('forward')}${k('left')}${k('back')}${k('right')} move`,
    `<kbd>Mouse</kbd> look · ${k('fire')} fire · ${k('aim')} aim`,
    `${k('jump')} jump · ${k('sprint')} sprint`,
    `${k('crouch')} crouch · while sprinting: slide`,
    `${k('leanLeft')} lean left · ${k('leanRight')} lean right`,
    `${k('grenade')} grenade (hold to cook) · ${k('tactical')} flash / smoke`,
    `${k('knife')} knife · ${k('reload')} reload · ${k('inspect')} inspect`,
    `${k('primary')} primary · ${k('pistol')} pistol · <kbd>Wheel</kbd> swap`,
    `${k('chat')} chat (multiplayer)`,
    `${k('scoreboard')} scoreboard · <kbd>Esc</kbd> / ${k('pause')} pause`,
  ].map((l) => `<li>${l}</li>`).join('');
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
        b.className = 'swatch' + (sk.id === current && skinUnlocked(game.career, id, sk.id) ? ' on' : '') + (skinUnlocked(game.career, id, sk.id) ? '' : ' locked');
        b.style.background = skinSwatchCss(sk.id);
        b.title = sk.id === 'none' || open ? sk.name : `${sk.name} — ${SKIN_KILLS - n} more ${name} kills to unlock`;
        b.addEventListener('click', () => {
          if (!skinUnlocked(game.career, id, sk.id)) return;
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
$('btn-host').addEventListener('click', hostGame);
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
  for (const id of ['settings-ov', 'keys-ov']) {
    if (!$(id).classList.contains('hidden')) {
      if (e.code === 'Escape') $(id).classList.add('hidden');
      return;
    }
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
window.addEventListener('pagehide', () => { net.leave(false); game.career.flush(); });

game.onMatchEnd = () => {
  const res = game.rules.result(game);
  const won = res.won;
  // career: count the match if you actually played some of it
  if (game.forCareer && game.matchPlayT >= 20 && !game.careerCounted) {
    game.careerCounted = true;
    game.career.match(game.rules.id, won);
  }
  $('end-title').textContent = res.draw ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT';
  $('end-title').style.color = res.draw ? '#ffd24d' : won ? '#5dff9a' : '#ff6b6b';
  $('end-sub').textContent = `${game.rules.name}: ${res.sub}`;
  hud.renderScores(game, $('end-body'));
  renderAwards();
  renderVote();
  setState('ended');
  audio.muted = false;
  audio.play(won ? 'win' : 'lose');
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
  $('vote-title').textContent = net.active ? '— everyone votes' : '— pick one';
  updateVoteNote();
}

function updateVoteNote() {
  const el = $('vote-note');
  if (!game.voteOptions || !game.voteOptions.length) { el.textContent = ''; return; }
  if (net.active && game.voteDeadline) {
    const left = Math.max(0, Math.ceil((game.voteDeadline - performance.now()) / 1000));
    const txt = `Starts in ${left}s${net.role === 'host' ? ' — or press Start next match' : ''}. Most votes wins.`;
    if (el.textContent !== txt) el.textContent = txt;
  } else if (!net.active) {
    el.textContent = 'Then press Play again.';
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
if (params.get('join')) setMpStatus(`Invited to room ${codeInput.value} — pick a name and press Join.`);
requestAnimationFrame(frame);

// handy for debugging / automated tests
window.__game = game;
window.__net = net;
window.__app = { get state() { return state; }, startMatch, hostGame, joinGame, pause, resume, setState, openChat, closeChat, input, settings };
