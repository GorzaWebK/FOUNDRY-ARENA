// Rebindable controls. Each action has two slots; a slot holds a
// KeyboardEvent.code (e.g. "KeyW") or a mouse button ("Mouse0" = left,
// "Mouse1" = middle, "Mouse2" = right, "Mouse3"/"Mouse4" = side buttons).
// Esc always pauses and the mouse wheel always swaps weapons.

export const ACTIONS = [
  { id: 'forward', label: 'Move forward', keys: ['KeyW', ''] },
  { id: 'back', label: 'Move back', keys: ['KeyS', ''] },
  { id: 'left', label: 'Move left', keys: ['KeyA', ''] },
  { id: 'right', label: 'Move right', keys: ['KeyD', ''] },
  { id: 'jump', label: 'Jump', keys: ['Space', ''] },
  { id: 'sprint', label: 'Sprint', keys: ['ShiftLeft', 'ShiftRight'] },
  { id: 'crouch', label: 'Crouch / slide', keys: ['KeyC', 'ControlLeft'] },
  { id: 'fire', label: 'Fire', keys: ['Mouse0', ''] },
  { id: 'aim', label: 'Aim down sights', keys: ['Mouse2', ''] },
  { id: 'reload', label: 'Reload', keys: ['KeyR', ''] },
  { id: 'primary', label: 'Primary weapon', keys: ['Digit1', ''] },
  { id: 'pistol', label: 'Pistol', keys: ['Digit2', ''] },
  { id: 'grenade', label: 'Grenade (hold to cook)', keys: ['KeyF', ''] },
  { id: 'tactical', label: 'Flashbang / smoke', keys: ['KeyG', ''] },
  { id: 'knife', label: 'Knife', keys: ['KeyV', ''] },
  { id: 'leanLeft', label: 'Lean left', keys: ['KeyQ', ''] },
  { id: 'leanRight', label: 'Lean right', keys: ['KeyE', ''] },
  { id: 'inspect', label: 'Inspect weapon', keys: ['KeyT', ''] },
  { id: 'scoreboard', label: 'Scoreboard', keys: ['Tab', ''] },
  { id: 'chat', label: 'Chat (multiplayer)', keys: ['Enter', 'NumpadEnter'] },
  { id: 'pause', label: 'Pause (Esc always works)', keys: ['KeyP', ''] },
];

export function defaultBinds() {
  const b = {};
  for (const a of ACTIONS) b[a.id] = [...a.keys];
  return b;
}

/** Fill in anything missing or malformed in saved bindings. */
export function cleanBinds(saved) {
  const b = defaultBinds();
  if (saved && typeof saved === 'object') {
    for (const a of ACTIONS) {
      const v = saved[a.id];
      if (Array.isArray(v) && v.length === 2 && v.every((k) => typeof k === 'string' && k.length <= 24)) b[a.id] = [...v];
    }
  }
  return b;
}

const NAMES = {
  Mouse0: 'Left Mouse', Mouse1: 'Middle Mouse', Mouse2: 'Right Mouse', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5',
  Space: 'Space', Enter: 'Enter', NumpadEnter: 'Num Enter', Tab: 'Tab', Backquote: '`', Minus: '-', Equal: '=',
  BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl',
  AltLeft: 'Left Alt', AltRight: 'Right Alt', CapsLock: 'Caps Lock', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
};

/** Human-readable name for a binding code. */
export function keyName(code) {
  if (!code) return '—';
  if (NAMES[code]) return NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}

/** Short label for the first bound key of an action (for HUD hints). */
export function bindLabel(binds, action) {
  const k = (binds[action] || []).find((c) => c);
  return k ? keyName(k) : '—';
}
