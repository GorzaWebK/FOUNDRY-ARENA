// User settings, persisted to localStorage.

const KEY = 'foundry-arena-settings-v2';

export const DEFAULTS = {
  sensitivity: 1.0,
  fov: 95, // horizontal, degrees (at 16:9)
  volume: 0.6,
  botCount: 5,
  difficulty: 'normal',
  shadows: true,
  invertY: false,
  showFps: false,
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
  return s;
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
    { key: 'shadows', label: 'Shadows', check: true },
    { key: 'invertY', label: 'Invert Y', check: true },
    { key: 'showFps', label: 'Show FPS', check: true },
  ];
  const syncers = [];
  for (const r of rows) {
    const row = document.createElement('label');
    row.className = 'row';
    const name = document.createElement('span');
    name.textContent = r.label;
    const input = document.createElement('input');
    const out = document.createElement('output');
    if (r.check) {
      input.type = 'checkbox';
      input.addEventListener('change', () => { settings[r.key] = input.checked; saveSettings(settings); onChange(r.key); });
      syncers.push(() => { input.checked = settings[r.key]; });
    } else {
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
    container.append(row);
  }
  const sync = () => syncers.forEach((f) => f());
  sync();
  return sync;
}
