// App bootstrap: menus, pointer lock, pause, main loop.

import './style.css';
import arena from './maps/arena.js';
import { CFG } from './config.js';
import { loadSettings, saveSettings, buildSettingsUI } from './settings.js';
import { AudioSys } from './audio.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { Game } from './game.js';

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
let state = 'menu';

const ui = { menu: $('menu'), pause: $('pause'), end: $('end') };

function setState(s) {
  state = s;
  ui.menu.classList.toggle('hidden', s !== 'menu');
  ui.pause.classList.toggle('hidden', s !== 'paused');
  ui.end.classList.toggle('hidden', s !== 'ended');
  hud.show(s === 'playing' || s === 'paused');
  input.active = s === 'playing';
  audio.muted = s === 'menu' || s === 'paused';
  if (s !== 'playing') hud.setScoreboard(false, game);
  hud.setLockHint(false);
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

// ---------------------------------------------------------------- flow
async function lock() {
  if (NOLOCK) { input.locked = true; return true; }
  return input.requestLock();
}

async function startMatch() {
  audio.resume();
  audio.setVolume(settings.volume);
  game.newMatch({ botCount: settings.botCount, difficulty: settings.difficulty });
  setState('playing');
  const ok = await lock();
  if (!ok && state === 'playing') hud.setLockHint(true);
}

function startAttract() {
  game.newMatch({ botCount: 6, difficulty: 'normal', attract: true });
  setState('menu');
}

function pause() {
  if (state !== 'playing') return;
  $('pause-hint').textContent = '';
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
$('btn-again').addEventListener('click', startMatch);
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', startMatch);
$('btn-quit').addEventListener('click', () => { input.exitLock(); startAttract(); });
$('btn-menu').addEventListener('click', startAttract);

input.onLockChange = (locked) => {
  if (NOLOCK) return;
  if (locked) hud.setLockHint(false);
  else if (state === 'playing') pause(); // Esc releases the pointer -> pause menu
};
canvas.addEventListener('click', () => {
  if (state === 'playing' && !input.locked) lock().then((ok) => hud.setLockHint(!ok));
});
window.addEventListener('keydown', (e) => {
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
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (dt <= 0) return;
  if (state === 'playing') {
    hud.setScoreboard(input.down('Tab'), game);
    game.update(dt);
  } else if (state === 'menu' || state === 'ended') {
    game.update(dt);
  }
  game.render();
  input.endFrame();
}

game.applySettings();
startAttract();
requestAnimationFrame(frame);

// handy for debugging / automated tests
window.__game = game;
window.__app = { get state() { return state; }, startMatch, pause, resume, setState, input, settings };
