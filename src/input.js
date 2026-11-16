// Keyboard + mouse state with per-frame "pressed" edges and pointer lock.

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
  'KeyC', 'KeyR', 'Digit1', 'Digit2', 'Digit3', 'Tab', 'KeyQ', 'KeyE', 'KeyF',
]);

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

    window.addEventListener('keydown', (e) => {
      if (this.active && GAME_KEYS.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
    });
    window.addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); this.left = this.right = false; });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // some browsers occasionally report huge spikes; drop them
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.mdx += e.movementX;
      this.mdy += e.movementY;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.active) return;
      if (e.button === 0) { this.left = true; this.leftPressed = true; }
      if (e.button === 2) this.right = true;
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.left = false;
      if (e.button === 2) this.right = false;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => {
      if (this.active) { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }
    }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.keys.clear(); this.left = this.right = false; }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => {
      if (this.onLockChange) this.onLockChange(false, true);
    });
  }

  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }

  /** Ask for pointer lock. Resolves true once the pointer is captured. */
  requestLock() {
    return new Promise((resolve) => {
      if (this.locked) { resolve(true); return; }
      const canvas = this.canvas;
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        document.removeEventListener('pointerlockchange', onChange);
        document.removeEventListener('pointerlockerror', onErr);
        resolve(v);
      };
      const onChange = () => finish(document.pointerLockElement === canvas);
      const onErr = () => finish(false);
      document.addEventListener('pointerlockchange', onChange);
      document.addEventListener('pointerlockerror', onErr);
      setTimeout(() => finish(document.pointerLockElement === canvas), 1500);
      const plain = () => {
        try {
          const p = canvas.requestPointerLock();
          if (p && p.catch) p.catch(() => finish(false));
        } catch (e) { finish(false); }
      };
      try {
        // raw (unaccelerated) mouse input where the browser supports it
        const p = canvas.requestPointerLock({ unadjustedMovement: true });
        if (p && p.catch) p.catch((err) => { if (err && err.name === 'NotSupportedError') plain(); else finish(false); });
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
