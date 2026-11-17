// User settings, persisted to localStorage.

import { DEFAULT_PRIMARY, isPrimary, DEFAULT_TACTICAL, isTactical } from './weapons.js';
import { DEFAULT_MAP, MAPS } from './maps/index.js';
import { DEFAULT_MODE, MODES } from './modes.js';
import { defaultBinds, cleanBinds } from './bindings.js';

const KEY = 'foundry-arena-settings-v3';

export const DEFAULTS = {
  sensitivity: 1.0,
  fov: 95, // horizontal, degrees (at 16:9)
  volume: 0.6,
  botCount: 5,
  bots: true,
  difficulty: 'normal',
  quality: 'high', // 'high' | 'low'
  invertY: false,
  showFps: false,
  name: '', // multiplayer display name
  primary: DEFAULT_PRIMARY, // loadout
  tactical: DEFAULT_TACTICAL, // 'flash' | 'smoke'
  map: DEFAULT_MAP,
  mode: DEFAULT_MODE,
  announcer: true, // spoken killstreak call-outs
  killcam: true,
  leanToggle: true, // tap Q / E to lean instead of holding
  rules: { limits: {}, time: 0, ff: false, pickups: true, hardcore: false }, // custom match rules (limits per mode)
  skins: {}, // weapon id -> skin id (only used once unlocked)
  // crosshair
  xhColor: '#ffffff',
  xhLen: 9, // line length, px (0 = dot only)
  xhThick: 2, // px
  xhGap: 0, // extra gap, px (on top of the gap that shows your current spread)
  xhDot: true,
  xhOutline: true,
  binds: defaultBinds(), // action -> [key, key]
};

export function loadSettings() {
  const s = { ...DEFAULTS };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    for (const k of Object.keys(DEFAULTS)) {
      if (typeof raw[k] === typeof DEFAULTS[k]) s[k] = raw[k];
    }
  } catch (e) { /* ignore corrupt / unavailable storage */ }
  s.sensitivity = Math.min(3, Math.max(0.1, s.sensitivity));
  s.fov = Math.min(120, Math.max(70, s.fov));
  s.volume = Math.min(1, Math.max(0, s.volume));
  s.botCount = Math.min(10, Math.max(1, Math.round(s.botCount)));
  if (!['easy', 'normal', 'hard'].includes(s.difficulty)) s.difficulty = 'normal';
  if (!['high', 'low'].includes(s.quality)) s.quality = 'high';
  if (!isPrimary(s.primary)) s.primary = DEFAULT_PRIMARY;
  if (!isTactical(s.tactical)) s.tactical = DEFAULT_TACTICAL;
  if (!MAPS.some((m) => m.id === s.map)) s.map = DEFAULT_MAP;
  if (!MODES.some((m) => m.id === s.mode)) s.mode = DEFAULT_MODE;
  s.binds = cleanBinds(s.binds);
  {
    const out = {};
    if (s.skins && typeof s.skins === 'object') for (const [k, v] of Object.entries(s.skins)) if (typeof v === 'string' && v.length < 20 && k.length < 20) out[k] = v;
    s.skins = out;
  }
  {
    const r = s.rules && typeof s.rules === 'object' ? s.rules : {};
    const limits = {};
    if (r.limits && typeof r.limits === 'object') for (const [k, v] of Object.entries(r.limits)) if (typeof v === 'number') limits[k] = v;
    s.rules = { limits, time: typeof r.time === 'number' ? r.time : 0, ff: !!r.ff, pickups: r.pickups !== false, hardcore: !!r.hardcore };
  }
  if (!XH_COLORS.some(([v]) => v === s.xhColor)) s.xhColor = DEFAULTS.xhColor;
  s.xhLen = Math.min(20, Math.max(0, Math.round(s.xhLen)));
  s.xhThick = Math.min(5, Math.max(1, Math.round(s.xhThick)));
  s.xhGap = Math.min(16, Math.max(-4, Math.round(s.xhGap)));
  return s;
}

export const XH_COLORS = [
  ['#ffffff', 'White'], ['#5dff9a', 'Green'], ['#ffe14d', 'Yellow'], ['#4fe3ff', 'Cyan'],
  ['#ff5cf0', 'Magenta'], ['#ff4d4d', 'Red'], ['#ff9a2a', 'Orange'],
];

/** Push the crosshair settings into CSS variables (the HUD crosshair and the preview both use them). */
export function applyCrosshair(s) {
  const r = document.documentElement.style;
  r.setProperty('--xh-col', s.xhColor);
  r.setProperty('--xh-len', s.xhLen + 'px');
  r.setProperty('--xh-th', s.xhThick + 'px');
  r.setProperty('--xh-gap0', s.xhGap + 'px');
  r.setProperty('--xh-dot', s.xhDot ? 'block' : 'none');
  r.setProperty('--xh-lines', s.xhLen > 0 ? 'block' : 'none');
  r.setProperty('--xh-sh', s.xhOutline ? '0 0 0 1px rgba(0, 0, 0, 0.8)' : 'none');
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
}

/** The FOV setting is horizontal (as most shooters show it); three.js wants vertical. */
export function verticalFov(hDeg) {
  return (2 * Math.atan(Math.tan((hDeg * Math.PI) / 360) * (9 / 16)) * 180) / Math.PI;
}

/**
 * Build the shared settings rows (used by both the main menu and the pause
 * menu). `onChange(key)` fires after a value changed and was saved.
 */
export function buildSettingsUI(container, settings, onChange) {
  const rows = [
    { key: 'sensitivity', label: 'Sensitivity', min: 0.1, max: 3, step: 0.05, fmt: (v) => v.toFixed(2) },
    { key: 'fov', label: 'Field of view', min: 70, max: 120, step: 1, fmt: (v) => v + '°' },
    { key: 'volume', label: 'Volume', min: 0, max: 1, step: 0.05, fmt: (v) => Math.round(v * 100) + '%' },
    { key: 'quality', label: 'Graphics', options: [['high', 'High'], ['low', 'Low (faster)']] },
    { key: 'announcer', label: 'Announcer voice', check: true },
    { key: 'killcam', label: 'Kill cam', check: true },
    { key: 'leanToggle', label: 'Toggle lean', check: true },
    { key: 'invertY', label: 'Invert Y', check: true },
    { key: 'showFps', label: 'Show FPS', check: true },
    { key: 'xhColor', label: 'Colour', options: XH_COLORS, group: 'xh' },
    { key: 'xhLen', label: 'Length', min: 0, max: 20, step: 1, fmt: (v) => (v ? v + 'px' : 'dot only'), group: 'xh' },
    { key: 'xhThick', label: 'Thickness', min: 1, max: 5, step: 1, fmt: (v) => v + 'px', group: 'xh' },
    { key: 'xhGap', label: 'Gap', min: -4, max: 16, step: 1, fmt: (v) => (v > 0 ? '+' : '') + v + 'px', group: 'xh' },
    { key: 'xhDot', label: 'Centre dot', check: true, group: 'xh' },
    { key: 'xhOutline', label: 'Outline', check: true, group: 'xh' },
  ];
  // the crosshair rows fold away under their own heading, with a live preview
  const xh = document.createElement('details');
  xh.className = 'xh-group';
  xh.innerHTML = '<summary>Crosshair</summary><div class="xh-preview"><div class="xh"><i class="ch-dot"></i><i class="ch-l ch-top"></i>'
    + '<i class="ch-l ch-bottom"></i><i class="ch-l ch-left"></i><i class="ch-l ch-right"></i>'
    + '<i class="ch-ring"></i><i class="ch-chev ch-chev-l"></i><i class="ch-chev ch-chev-r"></i></div></div>';
  const syncers = [];
  for (const r of rows) {
    const row = document.createElement('label');
    row.className = 'row';
    const name = document.createElement('span');
    name.textContent = r.label;
    const out = document.createElement('output');
    let input;
    if (r.options) {
      input = document.createElement('select');
      for (const [value, label] of r.options) {
        const o = document.createElement('option');
        o.value = value; o.textContent = label;
        input.append(o);
      }
      input.addEventListener('change', () => { settings[r.key] = input.value; saveSettings(settings); onChange(r.key); });
      syncers.push(() => { input.value = settings[r.key]; });
    } else if (r.check) {
      input = document.createElement('input');
      input.type = 'checkbox';
      input.addEventListener('change', () => { settings[r.key] = input.checked; saveSettings(settings); onChange(r.key); });
      syncers.push(() => { input.checked = settings[r.key]; });
    } else {
      input = document.createElement('input');
      input.type = 'range';
      input.min = r.min; input.max = r.max; input.step = r.step;
      input.addEventListener('input', () => {
        settings[r.key] = parseFloat(input.value);
        out.textContent = r.fmt(settings[r.key]);
        saveSettings(settings);
        onChange(r.key);
      });
      syncers.push(() => { input.value = settings[r.key]; out.textContent = r.fmt(settings[r.key]); });
    }
    row.append(name, input, out);
    (r.group === 'xh' ? xh : container).append(row);
  }
  container.append(xh);
  const sync = () => syncers.forEach((f) => f());
  sync();
  return sync;
}
