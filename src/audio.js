// All sound is synthesised with the Web Audio API — no audio files.

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.volume = 0.6;
    this.muted = false;
    this.lx = 0; this.ly = 0; this.lz = 0; this.lyaw = 0;
    this.voices = 0;
  }

  /** Must be called from a user gesture. */
  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.12;
      this.master.connect(comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, len);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  setListener(x, y, z, yaw) { this.lx = x; this.ly = y; this.lz = z; this.lyaw = yaw; }

  // --- building blocks -----------------------------------------------------

  /** Output node for a sound at `pos` (or centred if null). Returns null if inaudible. */
  _out(pos, vol, refDist = 9) {
    const ctx = this.ctx;
    let gain = vol, pan = 0, lp = 0;
    if (pos) {
      const dx = pos.x - this.lx, dy = pos.y - this.ly, dz = pos.z - this.lz;
      const d = Math.hypot(dx, dy, dz);
      gain *= 1 / Math.pow(1 + d / refDist, 1.5);
      if (gain < 0.004) return null;
      if (d > 0.5) {
        const rx = Math.cos(this.lyaw), rz = -Math.sin(this.lyaw);
        pan = Math.max(-0.85, Math.min(0.85, ((dx * rx + dz * rz) / d) * 0.9));
      }
      lp = 16000 / (1 + d / 14);
    }
    if (this.voices > 40 && gain < 0.08) return null;
    const g = ctx.createGain();
    g.gain.value = gain;
    let node = g;
    if (lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = lp;
      g.connect(f); node = f;
    }
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(p); node = p;
    }
    node.connect(this.master);
    return g;
  }

  _noise(out, t, dur, type, freq, q, peak, attack = 0.002) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.loopStart = Math.random() * 0.5;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
    this.voices++;
    src.onended = () => { this.voices--; };
    return f;
  }

  _tone(out, t, dur, type, f0, f1, peak, attack = 0.003) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
    this.voices++;
    o.onended = () => { this.voices--; };
  }

  // --- sounds --------------------------------------------------------------

  play(name, pos = null, vol = 1, arg = 0) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'pistol': {
        const o = this._out(pos, 0.9 * vol, 12); if (!o) return;
        this._noise(o, t, 0.13, 'bandpass', 1900, 0.7, 1.0);
        this._noise(o, t, 0.05, 'highpass', 4000, 0.5, 0.5);
        this._tone(o, t, 0.09, 'triangle', 260, 70, 0.9);
        break;
      }
      case 'rifle': {
        const o = this._out(pos, 0.85 * vol, 13); if (!o) return;
        this._noise(o, t, 0.11, 'bandpass', 1300, 0.6, 1.0);
        this._noise(o, t, 0.2, 'lowpass', 500, 0.5, 0.35);
        this._tone(o, t, 0.08, 'square', 170, 55, 0.5);
        break;
      }
      case 'shotgun': {
        const o = this._out(pos, 1.0 * vol, 14); if (!o) return;
        this._noise(o, t, 0.32, 'lowpass', 1100, 0.4, 1.2);
        this._noise(o, t, 0.08, 'bandpass', 2600, 0.6, 0.7);
        this._tone(o, t, 0.26, 'sine', 120, 38, 1.1);
        // pump
        this._noise(o, t + 0.36, 0.05, 'bandpass', 1700, 3, 0.25);
        this._noise(o, t + 0.5, 0.05, 'bandpass', 1300, 3, 0.25);
        break;
      }
      case 'impact': {
        const o = this._out(pos, 0.25 * vol, 5); if (!o) return;
        this._noise(o, t, 0.05, 'bandpass', 3000 + Math.random() * 2500, 2, 0.8);
        break;
      }
      case 'hit': {
        const o = this._out(null, 0.32 * vol); if (!o) return;
        this._tone(o, t, 0.05, 'square', 1250, 900, 0.5);
        this._noise(o, t, 0.03, 'highpass', 3000, 0.5, 0.3);
        break;
      }
      case 'headshot': {
        const o = this._out(null, 0.4 * vol); if (!o) return;
        this._tone(o, t, 0.16, 'sine', 2100, 2100, 0.6);
        this._tone(o, t, 0.2, 'sine', 3150, 3150, 0.35);
        this._noise(o, t, 0.03, 'highpass', 4000, 0.5, 0.4);
        break;
      }
      case 'kill': {
        const o = this._out(null, 0.35 * vol); if (!o) return;
        this._tone(o, t, 0.1, 'triangle', 660, 660, 0.6);
        this._tone(o, t + 0.09, 0.2, 'triangle', 990, 990, 0.6);
        break;
      }
      case 'hurt': {
        const o = this._out(null, 0.6 * vol); if (!o) return;
        this._noise(o, t, 0.14, 'lowpass', 420, 0.8, 1.0);
        this._tone(o, t, 0.14, 'sine', 130, 60, 0.8);
        break;
      }
      case 'death': {
        const o = this._out(pos, 0.6 * vol, 8); if (!o) return;
        this._tone(o, t, 0.5, 'sawtooth', 220, 45, 0.4);
        this._noise(o, t, 0.4, 'lowpass', 600, 0.6, 0.5);
        break;
      }
      case 'step': {
        const o = this._out(pos, 0.2 * vol, 4); if (!o) return;
        this._noise(o, t, 0.07, 'bandpass', 260 + Math.random() * 180, 1.2, 0.9, 0.005);
        break;
      }
      case 'land': {
        const o = this._out(pos, 0.4 * vol, 5); if (!o) return;
        this._noise(o, t, 0.12, 'lowpass', 300, 0.8, 1.0);
        this._tone(o, t, 0.1, 'sine', 100, 50, 0.6);
        break;
      }
      case 'jump': {
        const o = this._out(pos, 0.12 * vol, 4); if (!o) return;
        this._noise(o, t, 0.09, 'bandpass', 500, 1, 0.8, 0.02);
        break;
      }
      case 'reload': {
        // arg = reload duration
        const o = this._out(pos, 0.35 * vol, 4); if (!o) return;
        const d = arg || 1.5;
        this._noise(o, t + 0.12, 0.05, 'bandpass', 1500, 4, 0.8);
        this._tone(o, t + 0.12, 0.04, 'square', 320, 200, 0.2);
        this._noise(o, t + d * 0.55, 0.06, 'bandpass', 1000, 4, 0.9);
        this._noise(o, t + d - 0.22, 0.04, 'bandpass', 2200, 5, 0.9);
        this._noise(o, t + d - 0.12, 0.05, 'bandpass', 1600, 5, 0.9);
        break;
      }
      case 'dry': {
        const o = this._out(null, 0.25 * vol); if (!o) return;
        this._noise(o, t, 0.03, 'bandpass', 2400, 6, 0.9);
        break;
      }
      case 'switch': {
        const o = this._out(null, 0.2 * vol); if (!o) return;
        this._noise(o, t, 0.06, 'bandpass', 900, 2, 0.8, 0.01);
        this._noise(o, t + 0.12, 0.04, 'bandpass', 1800, 4, 0.6);
        break;
      }
      case 'pickup': {
        const o = this._out(pos, 0.3 * vol, 6); if (!o) return;
        const base = arg || 520;
        this._tone(o, t, 0.1, 'triangle', base, base, 0.6);
        this._tone(o, t + 0.07, 0.1, 'triangle', base * 1.26, base * 1.26, 0.6);
        this._tone(o, t + 0.14, 0.18, 'triangle', base * 1.5, base * 1.5, 0.6);
        break;
      }
      case 'respawn': {
        const o = this._out(null, 0.3 * vol); if (!o) return;
        this._tone(o, t, 0.35, 'sine', 220, 880, 0.5, 0.05);
        this._noise(o, t, 0.3, 'bandpass', 1200, 1, 0.2, 0.1);
        break;
      }
      case 'win': {
        const o = this._out(null, 0.4 * vol); if (!o) return;
        [523, 659, 784, 1047].forEach((f, i) => this._tone(o, t + i * 0.13, 0.3, 'triangle', f, f, 0.6));
        break;
      }
      case 'lose': {
        const o = this._out(null, 0.4 * vol); if (!o) return;
        [392, 330, 262, 196].forEach((f, i) => this._tone(o, t + i * 0.16, 0.35, 'triangle', f, f, 0.6));
        break;
      }
      case 'smg': {
        const o = this._out(pos, 0.7 * vol, 11); if (!o) return;
        this._noise(o, t, 0.08, 'bandpass', 1700, 0.7, 1.0);
        this._noise(o, t, 0.04, 'highpass', 3500, 0.5, 0.4);
        this._tone(o, t, 0.06, 'square', 210, 80, 0.4);
        break;
      }
      case 'sniper': {
        const o = this._out(pos, 1.0 * vol, 20); if (!o) return;
        this._noise(o, t, 0.45, 'lowpass', 1500, 0.5, 1.3);
        this._noise(o, t, 0.1, 'bandpass', 3000, 0.7, 0.8);
        this._tone(o, t, 0.3, 'sine', 150, 36, 1.1);
        this._noise(o, t + 0.12, 0.7, 'lowpass', 500, 0.4, 0.3, 0.1); // echo
        // bolt
        this._noise(o, t + 0.45, 0.05, 'bandpass', 2000, 4, 0.2);
        this._noise(o, t + 0.7, 0.05, 'bandpass', 1500, 4, 0.2);
        break;
      }
      case 'lmg': {
        const o = this._out(pos, 0.9 * vol, 14); if (!o) return;
        this._noise(o, t, 0.13, 'bandpass', 1000, 0.6, 1.0);
        this._noise(o, t, 0.24, 'lowpass', 420, 0.5, 0.45);
        this._tone(o, t, 0.1, 'square', 130, 45, 0.6);
        break;
      }
      case 'explosion': {
        const o = this._out(pos, 1.3 * vol, 22); if (!o) return;
        this._noise(o, t, 0.9, 'lowpass', 700, 0.3, 1.6);
        this._noise(o, t, 0.25, 'bandpass', 2200, 0.5, 0.9);
        this._tone(o, t, 0.7, 'sine', 95, 26, 1.5);
        this._noise(o, t + 0.15, 1.4, 'lowpass', 260, 0.3, 0.5, 0.2); // rumble
        break;
      }
      case 'throw': {
        const o = this._out(pos, 0.3 * vol, 5); if (!o) return;
        this._noise(o, t, 0.16, 'bandpass', 700, 1, 0.9, 0.05);
        this._noise(o, t, 0.03, 'bandpass', 2600, 5, 0.5); // pin
        break;
      }
      case 'bounce': {
        const o = this._out(pos, 0.3 * vol, 5); if (!o) return;
        this._tone(o, t, 0.05, 'triangle', 900 + Math.random() * 300, 500, 0.5);
        this._noise(o, t, 0.03, 'bandpass', 2400, 3, 0.5);
        break;
      }
      case 'slide': {
        const o = this._out(pos, 0.35 * vol, 5); if (!o) return;
        const f = this._noise(o, t, 0.6, 'bandpass', 900, 0.8, 0.9, 0.04);
        f.frequency.exponentialRampToValueAtTime(260, t + 0.6);
        break;
      }
      case 'chat': {
        const o = this._out(null, 0.18 * vol); if (!o) return;
        this._tone(o, t, 0.06, 'sine', 880, 880, 0.5);
        this._tone(o, t + 0.06, 0.09, 'sine', 1320, 1320, 0.5);
        break;
      }
      case 'knife': {
        // whoosh
        const o = this._out(pos, 0.45 * vol, 5); if (!o) return;
        const f = this._noise(o, t, 0.22, 'bandpass', 2600, 1.4, 0.9, 0.03);
        f.frequency.exponentialRampToValueAtTime(700, t + 0.22);
        break;
      }
      case 'stab': {
        const o = this._out(pos, 0.6 * vol, 6); if (!o) return;
        this._noise(o, t, 0.12, 'lowpass', 900, 0.8, 1.1);
        this._tone(o, t, 0.1, 'sine', 160, 70, 0.8);
        this._noise(o, t, 0.04, 'bandpass', 3500, 3, 0.5);
        break;
      }
      case 'announce': {
        const o = this._out(null, 0.32 * vol); if (!o) return;
        this._noise(o, t, 0.5, 'lowpass', 900, 0.4, 0.6, 0.01);
        [392, 587, 784].forEach((f, i) => this._tone(o, t + i * 0.05, 0.45, 'sawtooth', f, f * 1.01, 0.22, 0.01));
        this._tone(o, t, 0.6, 'sine', 98, 70, 0.7);
        break;
      }
      case 'ui': {
        const o = this._out(null, 0.2 * vol); if (!o) return;
        this._tone(o, t, 0.05, 'square', 700, 700, 0.3);
        break;
      }
      default:
        break;
    }
  }
}
