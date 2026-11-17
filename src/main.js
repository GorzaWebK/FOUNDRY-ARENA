// App bootstrap: menus, pointer lock, pause, multiplayer lobby, chat, main loop.

import './style.css';
import { MAPS, getMap } from './maps/index.js';
import { MODES, getMode } from './modes.js';
import { WEAPON_BY_ID, PRIMARIES } from './weapons.js';
import { loadSettings, saveSettings, buildSettingsUI } from './settings.js';
import { AudioSys } from './audio.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { Game } from './game.js';
import { Net, cleanName } from './net.js';
import { cleanRoomCode } from './transport.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const NOLOCK = params.has('nolock'); // dev/testing: play without pointer lock

const canvas = $('game');
const settings = loadSettings();
const audio = new AudioSys();
audio.volume = settings.volume;
const hud = new Hud();
const input = new Input(canvas);
const game = new Game({ canvas, settings, audio, hud, input, map: getMap(settings.map) });

// 'menu' (attract mode) | 'playing' | 'paused' | 'ended'
// In multiplayer the match never stops: 'paused' is just the menu overlay.
let state = 'menu';
let chatting = false;

const ui = { menu: $('menu'), pause: $('pause'), end: $('end') };

const net = new Net(game, {
  onRoster: () => updateRoomUi(),
  onLeft: (reason) => {
    input.exitLock();
    startAttract();
    setMpStatus(reason, true);
  },
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
function syncMatchPickers() {
  for (const s of mapSels) s.value = settings.map;
  for (const s of modeSels) s.value = settings.mode;
  const blurb = getMode(settings.mode).blurb;
  $('mode-blurb').textContent = blurb;
  $('pause-mode-blurb').textContent = blurb;
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
function syncLoadout() {
  for (const [id, b] of loadoutButtons) b.classList.toggle('on', id === settings.primary);
}
buildLoadoutUI($('menu-loadout'));
buildLoadoutUI($('pause-loadout'));
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
  $('next-match').classList.toggle('hidden', net.role === 'client');
  $('btn-bots').classList.toggle('hidden', net.role === 'client');
  $('btn-quit').textContent = on ? (net.role === 'host' ? 'Close room' : 'Leave game') : 'Main menu';
  $('btn-again').classList.toggle('hidden', net.role === 'client');
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
  if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.preventDefault(); closeChat(true); }
  else if (e.code === 'Escape') closeChat(false);
});
chatInput.addEventListener('blur', () => closeChat(false));

// ---------------------------------------------------------------- flow
async function lock() {
  if (NOLOCK) { input.locked = true; return true; }
  return input.requestLock();
}

async function startMatch() {
  if (net.role === 'client') return; // only the host starts matches
  audio.resume();
  audio.setVolume(settings.volume);
  game.newMatch({
    botCount: settings.botCount, bots: settings.bots, difficulty: settings.difficulty,
    map: getMap(settings.map), rules: getMode(settings.mode),
  });
  setState('playing');
  const ok = await lock();
  if (!ok && state === 'playing') hud.setLockHint(true);
}

async function hostGame() {
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
  setMpStatus('');
  audio.setVolume(settings.volume);
  if (game.over) { game.onMatchEnd(game.ranking()[0], game.ranking()); return; }
  setState('playing');
  const ok = await lock();
  if (!ok && state === 'playing') hud.setLockHint(true);
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

$('btn-play').addEventListener('click', startMatch);
$('btn-host').addEventListener('click', hostGame);
$('btn-join').addEventListener('click', joinGame);
$('btn-again').addEventListener('click', startMatch);
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', startMatch);
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
  const typing = e.target instanceof HTMLInputElement && e.target.type === 'text';
  if (typing) return;
  if ((e.code === 'Enter' || e.code === 'NumpadEnter') && state === 'playing' && net.active) {
    e.preventDefault();
    openChat();
    return;
  }
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (state === 'playing') {
      if (NOLOCK || !input.locked) pause();
      else input.exitLock();
    } else if (state === 'paused' && e.code === 'KeyP' && !e.repeat) {
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
window.addEventListener('pagehide', () => net.leave());

game.onMatchEnd = () => {
  const res = game.rules.result(game);
  const won = res.won;
  $('end-title').textContent = res.draw ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT';
  $('end-title').style.color = res.draw ? '#ffd24d' : won ? '#5dff9a' : '#ff6b6b';
  $('end-sub').textContent = `${game.rules.name}: ${res.sub}`;
  hud.renderScores(game, $('end-body'));
  setState('ended');
  audio.muted = false;
  audio.play(won ? 'win' : 'lose');
  input.exitLock();
};

// ---------------------------------------------------------------- main loop
function tick(dt, render) {
  if (state === 'playing') {
    hud.setScoreboard(input.down('Tab'), game);
    game.update(dt);
  } else if (state === 'menu' || state === 'ended' || (state === 'paused' && net.active)) {
    game.update(dt);
  }
  net.update(dt);
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
