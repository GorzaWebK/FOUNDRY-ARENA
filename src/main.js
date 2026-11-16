// App bootstrap: menus, pointer lock, pause, multiplayer lobby, main loop.

import './style.css';
import arena from './maps/arena.js';
import { CFG } from './config.js';
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
const game = new Game({ canvas, settings, audio, hud, input, map: arena });

// 'menu' (attract mode) | 'playing' | 'paused' | 'ended'
// In multiplayer the match never stops: 'paused' is just the menu overlay.
let state = 'menu';

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
});

function setState(s) {
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

const bots = $('set-bots'), botsOut = $('out-bots'), diff = $('set-diff');
bots.value = settings.botCount;
botsOut.textContent = settings.botCount;
diff.value = settings.difficulty;
bots.addEventListener('input', () => {
  settings.botCount = parseInt(bots.value, 10);
  botsOut.textContent = settings.botCount;
  saveSettings(settings);
});
diff.addEventListener('change', () => { settings.difficulty = diff.value; saveSettings(settings); });

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
  $('btn-quit').textContent = on ? (net.role === 'host' ? 'Close room' : 'Leave game') : 'Main menu';
  $('btn-again').classList.toggle('hidden', net.role === 'client');
  $('btn-menu').textContent = on ? (net.role === 'host' ? 'Close room' : 'Leave game') : 'Main menu';
  $('end-wait').classList.toggle('hidden', net.role !== 'client');
}

$('btn-copy').addEventListener('click', async () => {
  const link = inviteLink();
  let ok = false;
  try { await navigator.clipboard.writeText(link); ok = true; } catch (e) { /* fall through */ }
  $('copy-note').textContent = ok ? 'Invite link copied.' : link;
});

// ---------------------------------------------------------------- flow
async function lock() {
  if (NOLOCK) { input.locked = true; return true; }
  return input.requestLock();
}

async function startMatch() {
  if (net.role === 'client') return; // only the host starts matches
  audio.resume();
  audio.setVolume(settings.volume);
  game.newMatch({ botCount: settings.botCount, difficulty: settings.difficulty });
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
  await startMatch();
  hud.centerMessage(`ROOM ${net.code}`, 'Press Esc for the invite link', 5, '#4fc3f7');
}

async function joinGame() {
  const code = cleanRoomCode(codeInput.value);
  if (!code) { setMpStatus('Enter the room code from your host.', true); return; }
  audio.resume();
  setMpBusy(true);
  setMpStatus(`Connecting to room ${code}…`);
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
  game.newMatch({ botCount: 6, difficulty: 'normal', attract: true });
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

game.onMatchEnd = (winner, rank) => {
  const me = game.player;
  const won = winner === me;
  const place = rank.indexOf(me) + 1;
  $('end-title').textContent = won ? 'VICTORY' : 'DEFEAT';
  $('end-title').style.color = won ? '#5dff9a' : '#ff6b6b';
  const why = winner.kills >= CFG.killLimit ? `reached ${CFG.killLimit} kills` : `led with ${winner.kills} kills when time ran out`;
  $('end-sub').textContent = won
    ? `You ${why}.`
    : `${winner.name} ${why}. You placed #${place} of ${rank.length}.`;
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
window.__app = { get state() { return state; }, startMatch, hostGame, joinGame, pause, resume, setState, input, settings };
