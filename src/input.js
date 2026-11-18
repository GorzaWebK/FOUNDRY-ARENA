// Keyboard + mouse state with per-frame "pressed" edges and pointer lock.

import { defaultBinds } from './bindings.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mdx = 0; this.mdy = 0;
    this.left = false; this.right = false;
    this.leftPressed = false;
    this.wheel = 0;
    this.locked = false;
    this.active = false; // true while gameplay should receive input
    this.onLockChange = null;
    this.binds = defaultBinds(); // action -> [code, code]; replaced with the saved bindings
    this.capture = null; // while rebinding: called with the next key / mouse code instead

    // Capture phase: the game hears a key before any element on the page can stop it
    // (a text box with focus, say), so play can never go deaf to the keyboard.
    window.addEventListener('keydown', (e) => {
      if (this.capture) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) this.capture(e.code); return; }
      this.lastKey = e.code; this.lastKeyT = performance.now();
      if (this.active && this.isBound(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
    }, true);
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); }, true);
    window.addEventListener('blur', () => { this.keys.clear(); this.left = this.right = false; });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // some browsers occasionally report huge spikes; drop them
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.mdx += e.movementX;
      this.mdy += e.movementY;
    });
    window.addEventListener('mousedown', (e) => {
      if (this.capture) { e.preventDefault(); e.stopImmediatePropagation(); this.capture('Mouse' + e.button); return; }
    }, true);
    canvas.addEventListener('mousedown', (e) => {
      if (!this.active) return;
      if (e.button === 0) { this.left = true; this.leftPressed = true; }
      if (e.button === 2) this.right = true;
      this.keys.add('Mouse' + e.button);
      this.pressed.add('Mouse' + e.button);
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.left = false;
      if (e.button === 2) this.right = false;
      this.keys.delete('Mouse' + e.button);
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => {
      if (this.active) { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }
    }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.keys.clear(); this.left = this.right = false; }
      // only real changes: locked -> unlocked (Esc) or unlocked -> locked
      if (this.locked !== was && this.onLockChange) this.onLockChange(this.locked);
    });
    // A failed request is not the player letting go of the mouse: requestLock()
    // handles it (it retries without raw input, which some browsers refuse with
    // an error event before the retry succeeds), so it must not pause the game.
  }

  // keys only count while gameplay has focus (not while a menu is open)
  down(code) {
    if (!this.active || !code) return false;
    return this.keys.has(code) || (code === 'Mouse0' && this.left) || (code === 'Mouse2' && this.right);
  }
  hit(code) {
    if (!this.active || !code) return false;
    return this.pressed.has(code) || (code === 'Mouse0' && this.leftPressed);
  }

  /** Is any key bound to this action held? */
  act(action) {
    const b = this.binds[action];
    return !!b && (this.down(b[0]) || this.down(b[1]));
  }

  /** Was any key bound to this action pressed this frame? */
  actHit(action) {
    const b = this.binds[action];
    return !!b && (this.hit(b[0]) || this.hit(b[1]));
  }

  isBound(code) {
    for (const k in this.binds) if (this.binds[k][0] === code || this.binds[k][1] === code) return true;
    return false;
  }

  /**
   * Ask for pointer lock. Resolves true once the pointer is captured.
   *
   * The first try asks for raw (unaccelerated) mouse input. Browsers that can't
   * do that reject it, and may also fire a pointerlockerror event for it, which
   * can arrive late, even after the plain retry has already succeeded. So where
   * requestPointerLock returns a promise, only the promises decide; the events
   * are used only by older browsers that return nothing.
   */
  requestLock() {
    return new Promise((resolve) => {
      if (this.locked) { resolve(true); return; }
      const canvas = this.canvas;
      let done = false, promised = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        document.removeEventListener('pointerlockchange', onChange);
        document.removeEventListener('pointerlockerror', onErr);
        resolve(v);
      };
      const onChange = () => { if (document.pointerLockElement === canvas) finish(true); };
      const onErr = () => { if (!promised) finish(false); };
      document.addEventListener('pointerlockchange', onChange);
      document.addEventListener('pointerlockerror', onErr);
      setTimeout(() => finish(document.pointerLockElement === canvas), 1500);
      const plain = () => {
        try {
          const p = canvas.requestPointerLock();
          if (p && p.then) { promised = true; p.then(() => finish(true), () => finish(document.pointerLockElement === canvas)); }
        } catch (e) { finish(false); }
      };
      try {
        const p = canvas.requestPointerLock({ unadjustedMovement: true });
        if (p && p.then) {
          promised = true;
          p.then(() => finish(true), (err) => { if (err && err.name === 'NotSupportedError') plain(); else finish(false); });
        }
      } catch (e) { plain(); }
    });
  }

  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  endFrame() {
    this.pressed.clear();
    this.mdx = 0; this.mdy = 0;
    this.leftPressed = false;
    this.wheel = 0;
  }
}
