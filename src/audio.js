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
      this._buildVerb();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.wanted = true;
    if (!this.watching) {
      this.watching = true;
      // Something else (speech call-outs, another tab's audio, the OS) can suspend
      // or "interrupt" the context. Ask for it back whenever that happens.
      this.ctx.addEventListener('statechange', () => { if (this.ctx.state !== 'running') setTimeout(() => this.kick(), 60); });
    }
  }

  /** Make sure the audio context is running (after something paused it). */
  kick() {
    const c = this.ctx;
    if (!c || !this.wanted || c.state === 'running' || c.state === 'closed') return;
    if (typeof document !== 'undefined' && document.hidden) return;
    c.resume().catch(() => {});
  }

  /**
   * A shared room reverb: gunfire, explosions and impacts send some of their
   * sound here, more the further away they are, so distant fights sound distant.
   * The impulse response is generated: a few early reflections, then a decaying
   * noise tail that darkens as it fades.
   */
  _buildVerb() {
    const ctx = this.ctx, rate = ctx.sampleRate, len = Math.floor(rate * 1.9);
    const ir = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / rate;
        const k = 0.35 + 0.6 * Math.min(1, t / 1.2); // the tail loses its top end
        lp += (Math.random() * 2 - 1 - lp) * (1 - k);
        d[i] = lp * Math.pow(1 - i / len, 2.6) * (t < 0.008 ? t / 0.008 : 1);
      }
      for (const [at, g] of [[0.011, 0.7], [0.019, 0.5], [0.031, 0.42], [0.047, 0.3]]) {
        const i = Math.floor((at + ch * 0.003) * rate);
        d[i] += g; d[i + 1] -= g * 0.6;
      }
    }
    this.verb = ctx.createConvolver();
    this.verb.buffer = ir;
    this.verbIn = ctx.createGain();
    this.verbIn.gain.value = 0.55;
    this.verbIn.connect(this.verb).connect(this.master);
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  /**
   * Flashbanged: everything goes quiet and muffled behind a ringing tone, then
   * comes back over `dur` seconds. `amount` 0..1.
   */
  deafen(amount, dur, soft = false) {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (!this.duck) {
      // a gain + low-pass between the master volume and the speakers
      this.duck = ctx.createGain();
      this.duckLp = ctx.createBiquadFilter();
      this.duckLp.type = 'lowpass';
      this.duckLp.frequency.value = 20000;
      this.master.disconnect();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.12;
      this.master.connect(this.duckLp).connect(this.duck).connect(comp).connect(ctx.destination);
      this.ringOut = comp;
    }
    const g = this.duck.gain, f = this.duckLp.frequency;
    g.cancelScheduledValues(t); f.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(0.08, 1 - amount * 0.85), t);
    g.linearRampToValueAtTime(1, t + dur);
    f.setValueAtTime(Math.max(500, 20000 * (1 - amount)), t);
    f.exponentialRampToValueAtTime(20000, t + dur);
    // the ring, which skips the muffling
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 3400 + Math.random() * 300;
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime((soft ? 0.025 : 0.09) * amount * this.volume + 0.0002, t + (soft ? 0.4 : 0.05));
    og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(og).connect(this.ringOut);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  setListener(x, y, z, yaw) { this.lx = x; this.ly = y; this.lz = z; this.lyaw = yaw; }

  // --- building blocks -----------------------------------------------------

  /** Output node for a sound at `pos` (or centred if null). Returns null if inaudible. */
  _out(pos, vol, refDist = 9, verb = 0) {
    const ctx = this.ctx;
    let gain = vol, pan = 0, lp = 0, d = 0;
    if (pos) {
      const dx = pos.x - this.lx, dy = pos.y - this.ly, dz = pos.z - this.lz;
      d = Math.hypot(dx, dy, dz);
      gain *= 1 / Math.pow(1 + d / refDist, 1.5);
      if (gain < 0.004) return null;
      if (d > 0.5) {
        const rx = Math.cos(this.lyaw), rz = -Math.sin(this.lyaw);
        pan = Math.max(-0.85, Math.min(0.85, ((dx * rx + dz * rz) / d) * 0.9));
      }
      lp = 16000 / (1 + d / 14);
    }
    if (this.voices > 90 && gain < 0.1) return null; // a busy fight: drop the faint stuff first
    const g = ctx.createGain();
    g.gain.value = gain;
    let node = g;
    if (lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = lp;
      g.connect(f); node = f;
    }
    // reverb send: a little up close, more with distance (a far shot is mostly room)
    if (verb > 0 && this.verbIn) {
      const s = ctx.createGain();
      s.gain.value = verb * (pos ? 0.3 + Math.min(1.2, d / 25) : 0.3);
      node.connect(s).connect(this.verbIn);
    }
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(p); node = p;
    }
    node.connect(this.master);
    return g;
  }

  /**
   * A gunshot in layers: a sharp crack, the body of the blast, a low thump you
   * feel more than hear, the gun's own mechanism, and the slap of the room.
   * Every shot is detuned a touch so automatic fire doesn't sound like a loop.
   */
  _shot(pos, vol, ref, p) {
    const o = this._out(pos, vol, ref, p.verb ?? 1); if (!o) return null;
    const t = this.ctx.currentTime, r = 0.95 + Math.random() * 0.1;
    const [cf, cd, cp] = p.crack;
    this._noise(o, t, cd, 'highpass', cf * r, 0.7, cp, 0.0008);
    const [bf, bq, bd, bp] = p.body;
    this._noise(o, t, bd, 'bandpass', bf * r, bq, bp, 0.001);
    const [lf0, lf1, ld, lp] = p.low;
    this._tone(o, t, ld, 'sine', lf0 * r, lf1, lp, 0.002);
    if (p.sub) this._tone(o, t, p.sub[2], 'triangle', p.sub[0] * r, p.sub[1], p.sub[3], 0.002);
    if (p.tail) this._noise(o, t + 0.01, p.tail[0], 'lowpass', p.tail[1], 0.5, p.tail[2], 0.02);
    // mechanism: [delay, freq, q, peak] clicks (only heard up close)
    if (p.mech && (!pos || Math.hypot(pos.x - this.lx, pos.z - this.lz) < 14)) {
      for (const [at, f, q, pk] of p.mech) this._noise(o, t + at, 0.035, 'bandpass', f * r, q, pk, 0.001);
    }
    return o;
  }

  /** A struck metal thing: inharmonic partials ringing down. */
  _clang(o, t, f, dur, peak) {
    for (const [ratio, g] of [[1, 1], [2.76, 0.55], [5.4, 0.3], [8.93, 0.16]]) this._tone(o, t, dur / Math.sqrt(ratio), 'sine', f * ratio, f * ratio * 0.998, peak * g, 0.001);
  }

  /** A detuned saw pad through a sweeping low-pass: the body of the music stings. */
  _pad(o, t, freqs, dur, peak, sweep = [400, 2400]) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(sweep[0], t);
    f.frequency.exponentialRampToValueAtTime(sweep[1], t + dur * 0.45);
    f.frequency.exponentialRampToValueAtTime(sweep[0], t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.35, dur * 0.25));
    g.gain.setValueAtTime(peak, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f.connect(g).connect(o);
    for (const fr of freqs) {
      for (const det of [-7, 6]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = fr;
        osc.detune.value = det;
        osc.connect(f);
        osc.start(t); osc.stop(t + dur + 0.05);
        this.voices++;
        osc.onended = () => { this.voices--; };
      }
    }
  }

  /** A big low drum hit. */
  _drum(o, t, peak = 1, f = 70) {
    this._tone(o, t, 0.5, 'sine', f * 1.8, f * 0.6, peak, 0.002);
    this._noise(o, t, 0.12, 'lowpass', 900, 0.6, peak * 0.6, 0.001);
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
    if (!this.ctx || this.muted) return;
    if (this.ctx.state !== 'running' && !this.offline) { this.kick(); return; }
    const t = this.ctx.currentTime;
    switch (name) {
      case 'pistol': {
        this._shot(pos, 0.9 * vol, 12, { crack: [3800, 0.025, 0.9], body: [1700, 0.9, 0.12, 1.0], low: [240, 70, 0.09, 0.8], tail: [0.18, 700, 0.18], mech: [[0.05, 2600, 5, 0.25]] });
        break;
      }
      case 'rifle': {
        this._shot(pos, 0.85 * vol, 13, { crack: [3200, 0.022, 1.0], body: [1150, 0.75, 0.11, 1.0], low: [170, 52, 0.1, 0.75], sub: [95, 40, 0.07, 0.35], tail: [0.24, 520, 0.3], mech: [[0.035, 2100, 6, 0.2]] });
        break;
      }
      case 'shotgun': {
        const o = this._shot(pos, 1.0 * vol, 14, { crack: [2600, 0.04, 1.0], body: [900, 0.5, 0.3, 1.25], low: [120, 36, 0.28, 1.15], sub: [70, 30, 0.2, 0.6], tail: [0.5, 420, 0.45], verb: 1.3 });
        if (!o) return;
        // pump: back, then forward
        this._noise(o, t + 0.36, 0.06, 'bandpass', 1500, 3, 0.35);
        this._tone(o, t + 0.36, 0.05, 'square', 260, 180, 0.08);
        this._noise(o, t + 0.5, 0.05, 'bandpass', 1100, 3, 0.35);
        this._tone(o, t + 0.5, 0.04, 'square', 200, 150, 0.08);
        break;
      }
      case 'impact': {
        const o = this._out(pos, 0.25 * vol, 5, 0.4); if (!o) return;
        this._noise(o, t, 0.05, 'bandpass', 3000 + Math.random() * 2500, 2, 0.8);
        this._tone(o, t, 0.04, 'triangle', 1400 + Math.random() * 900, 600, 0.15);
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
        // arg: the surface underfoot ('metal', 'wood', 'concrete', 'sand')
        const o = this._out(pos, 0.2 * vol, 4); if (!o) return;
        const r = 0.9 + Math.random() * 0.2;
        if (arg === 'metal') {
          this._noise(o, t, 0.06, 'bandpass', 380 * r, 1.4, 0.8, 0.003);
          this._clang(o, t, 520 * r, 0.16, 0.14);
          this._noise(o, t, 0.05, 'bandpass', 2600 * r, 5, 0.25);
        } else if (arg === 'wood') {
          this._noise(o, t, 0.07, 'bandpass', 520 * r, 2.5, 0.9, 0.003);
          this._tone(o, t, 0.08, 'sine', 190 * r, 130, 0.45);
          this._noise(o, t + 0.01, 0.03, 'highpass', 2500, 0.6, 0.12);
        } else if (arg === 'sand') {
          for (let i = 0; i < 4; i++) this._noise(o, t + i * 0.014 + Math.random() * 0.01, 0.03, 'highpass', 2200 + Math.random() * 1800, 0.8, 0.09);
          this._noise(o, t, 0.08, 'lowpass', 400, 0.8, 0.7, 0.008);
        } else {
          // concrete: a dull heel strike plus a little grit
          this._noise(o, t, 0.065, 'bandpass', (240 + Math.random() * 120) * r, 1.2, 0.95, 0.004);
          this._noise(o, t + 0.008, 0.03, 'highpass', 3200, 0.6, 0.16);
        }
        break;
      }
      case 'land': {
        const o = this._out(pos, 0.4 * vol, 5); if (!o) return;
        this._noise(o, t, 0.12, 'lowpass', 300, 0.8, 1.0);
        this._tone(o, t, 0.1, 'sine', 100, 50, 0.6);
        if (arg === 'metal') this._clang(o, t, 300 + Math.random() * 60, 0.35, 0.22);
        else if (arg === 'wood') this._tone(o, t, 0.14, 'sine', 150, 100, 0.5);
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
        this._shot(pos, 0.7 * vol, 11, { crack: [4200, 0.018, 0.85], body: [1600, 0.9, 0.075, 1.0], low: [210, 85, 0.06, 0.45], tail: [0.16, 650, 0.2], mech: [[0.028, 2900, 6, 0.18]], verb: 0.8 });
        break;
      }
      case 'sniper': {
        const o = this._shot(pos, 1.0 * vol, 20, { crack: [2800, 0.05, 1.3], body: [1250, 0.55, 0.4, 1.2], low: [150, 34, 0.32, 1.15], sub: [62, 26, 0.3, 0.7], tail: [0.9, 380, 0.4], verb: 1.6 });
        if (!o) return;
        // supersonic crack decaying into a rolling echo, then the bolt
        this._noise(o, t + 0.16, 0.9, 'lowpass', 480, 0.4, 0.28, 0.12);
        this._noise(o, t + 0.5, 0.05, 'bandpass', 2100, 4, 0.25);
        this._tone(o, t + 0.5, 0.04, 'square', 300, 220, 0.06);
        this._noise(o, t + 0.75, 0.06, 'bandpass', 1500, 4, 0.28);
        this._noise(o, t + 0.83, 0.03, 'bandpass', 3000, 6, 0.2);
        break;
      }
      case 'lmg': {
        this._shot(pos, 0.75 * vol, 14, { crack: [2900, 0.025, 0.95], body: [950, 0.65, 0.13, 1.05], low: [135, 44, 0.12, 0.8], sub: [80, 34, 0.1, 0.5], tail: [0.3, 450, 0.36], mech: [[0.04, 1700, 5, 0.22], [0.06, 3200, 7, 0.12]], verb: 1.1 });
        break;
      }
      case 'explosion': {
        const o = this._out(pos, 1.3 * vol, 22, 1.4); if (!o) return;
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
      case 'pin': {
        const o = this._out(pos, 0.35 * vol, 5); if (!o) return;
        this._tone(o, t, 0.05, 'triangle', 2400, 1800, 0.4);
        this._noise(o, t + 0.04, 0.05, 'bandpass', 3200, 6, 0.5);
        break;
      }
      case 'flashbang': {
        const o = this._out(pos, 1.4 * vol, 24, 1.2); if (!o) return;
        this._noise(o, t, 0.35, 'highpass', 1800, 0.4, 1.6);
        this._noise(o, t, 0.6, 'lowpass', 900, 0.3, 1.0);
        this._tone(o, t, 0.25, 'square', 180, 60, 0.7);
        break;
      }
      case 'smoke': {
        const o = this._out(pos, 0.55 * vol, 10); if (!o) return;
        this._noise(o, t, 0.06, 'bandpass', 1400, 1, 0.8);
        const f = this._noise(o, t + 0.04, 2.6, 'bandpass', 3200, 0.7, 0.5, 0.15); // hiss
        f.frequency.exponentialRampToValueAtTime(1500, t + 2.6);
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
      // ---- music stings: synthesised, a couple of seconds each, foundry flavoured
      case 'sting-start': {
        // two drum hits, an anvil strike, and a rising open fifth
        const o = this._out(null, 0.42 * vol); if (!o) return;
        this._drum(o, t, 0.9, 60);
        this._drum(o, t + 0.28, 0.9, 60);
        this._clang(o, t + 0.56, 880, 1.4, 0.22);
        this._drum(o, t + 0.56, 1.0, 52);
        this._pad(o, t + 0.5, [110, 165, 220], 2.2, 0.16, [300, 2600]);
        break;
      }
      case 'sting-minute': {
        // a clock-tick pulse under a tense, close-voiced pad
        const o = this._out(null, 0.4 * vol); if (!o) return;
        for (let i = 0; i < 6; i++) {
          this._noise(o, t + i * 0.25, 0.03, 'bandpass', i % 2 ? 2400 : 3200, 8, 0.5);
          if (i % 2 === 0) this._drum(o, t + i * 0.25, 0.55, 58);
        }
        this._pad(o, t, [98, 104, 147], 2.0, 0.15, [250, 1400]);
        this._clang(o, t + 1.5, 660, 1.0, 0.16);
        break;
      }
      case 'sting-win': {
        const o = this._out(null, 0.45 * vol); if (!o) return;
        this._drum(o, t, 1.0, 55);
        this._clang(o, t, 1046, 1.6, 0.2);
        this._pad(o, t, [131, 196, 262, 330], 1.2, 0.16, [500, 3200]);
        this._drum(o, t + 0.9, 0.8, 55);
        this._pad(o, t + 0.9, [175, 262, 349, 440], 2.4, 0.18, [500, 3600]);
        [523, 659, 784, 1047].forEach((f, i) => this._tone(o, t + 0.9 + i * 0.09, 0.9, 'triangle', f, f, 0.22));
        break;
      }
      case 'sting-lose': {
        const o = this._out(null, 0.42 * vol); if (!o) return;
        this._drum(o, t, 0.9, 50);
        this._pad(o, t, [110, 131, 165], 1.3, 0.15, [300, 1500]);
        this._pad(o, t + 1.1, [87, 104, 131], 2.4, 0.15, [250, 1000]);
        [330, 262, 220, 165].forEach((f, i) => this._tone(o, t + 1.1 + i * 0.22, 0.6, 'triangle', f, f, 0.18));
        this._clang(o, t + 1.1, 220, 1.8, 0.12);
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
