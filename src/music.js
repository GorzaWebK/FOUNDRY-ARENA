// Music and ambience, synthesised on the fly like every other sound (audio.js).
//
// Music: a small step sequencer. Each track is a chord progression played by
// layers (pad, bass, drums, arpeggio, lead), every layer on its own gain so the
// match music can bring layers in and out with `intensity` (0..1): calm while
// you look for a fight, the full band when one is on, a little tenser in the
// last minute. The menu has its own slower theme. All of it runs through the
// music channel (Settings → Music volume).
//
// Ambience: a looping bed per map (machinery hum, wind, water) with the odd
// one-off sound (a distant clank, a gull, a hiss), on the effects channel.

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI note -> Hz

// chords as MIDI notes [bass, ...chord tones]
const C = {
  Am: [45, 57, 60, 64], F: [41, 57, 60, 65], Dm: [38, 57, 62, 65], E: [40, 56, 59, 64],
  Em: [40, 55, 59, 64], Cmaj: [36, 55, 60, 64], D: [38, 57, 62, 66], Bm: [35, 54, 59, 62],
  G: [43, 55, 59, 62], B: [35, 54, 59, 63], Gm: [43, 55, 58, 62], Bb: [46, 58, 62, 65], A: [45, 57, 61, 64],
};

export const TRACKS = {
  menu: { bpm: 84, bars: [['Am', 'F', 'Dm', 'E'], ['Am', 'F', 'Cmaj', 'E']], swing: 0, menu: true },
  match: [
    { bpm: 116, bars: [['Em', 'Cmaj', 'Am', 'B'], ['Em', 'Cmaj', 'D', 'B']] },
    { bpm: 120, bars: [['Dm', 'Bb', 'Gm', 'A'], ['Dm', 'Bb', 'Cmaj', 'A']] },
    { bpm: 112, bars: [['Am', 'F', 'G', 'E'], ['Am', 'Dm', 'F', 'E']] },
  ],
};

const LOOKAHEAD = 0.3; // seconds of notes scheduled ahead
const TICK = 60; // ms between scheduler runs

// per-map ambience presets
const AMBIENCE = {
  industrial: { hum: [55, 110], humGain: 0.05, wind: 0.025, windF: 500, events: ['clank', 'hiss'] },
  wind: { hum: null, wind: 0.07, windF: 700, gust: true, events: ['creak'] },
  harbour: { hum: null, wind: 0.04, windF: 600, water: 0.05, events: ['gull', 'clank'] },
  courtyard: { hum: null, wind: 0.03, windF: 900, events: ['bird', 'bird', 'bell'] },
  heights: { hum: [40], humGain: 0.03, wind: 0.08, windF: 1100, gust: true, events: ['creak'] },
  works: { hum: [48, 96, 144], humGain: 0.06, wind: 0.02, windF: 400, events: ['clank', 'hiss', 'hiss', 'thump'] },
  range: { hum: [60], humGain: 0.02, wind: 0.015, windF: 600, events: [] },
};
const MAP_AMBIENCE = { foundry: 'industrial', depot: 'industrial', dockyard: 'harbour', cloister: 'courtyard', skyline: 'heights', span: 'wind', steelworks: 'works', range: 'range' };

export class Music {
  constructor(audio) {
    this.audio = audio;
    this.track = null;
    this.intensity = 0.3; this.target = 0.3;
    this.timer = null;
    this.ambId = null;
  }

  get ctx() { return this.audio.ctx; }

  /** The audio graph (once the audio context exists). */
  _init() {
    if (this.bus || !this.ctx || !this.audio.music) return !!this.bus;
    const ctx = this.ctx;
    this.duckLp = ctx.createBiquadFilter();
    this.duckLp.type = 'lowpass'; this.duckLp.frequency.value = 20000;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(this.duckLp).connect(this.audio.music);
    // a soft echo for the arpeggio and lead
    this.echo = ctx.createDelay(1);
    this.echoFb = ctx.createGain(); this.echoFb.gain.value = 0.32;
    this.echoOut = ctx.createGain(); this.echoOut.gain.value = 0.35;
    const echoLp = ctx.createBiquadFilter(); echoLp.type = 'lowpass'; echoLp.frequency.value = 2600;
    this.echo.connect(echoLp).connect(this.echoFb).connect(this.echo);
    echoLp.connect(this.echoOut).connect(this.bus);
    this.layers = {};
    for (const k of ['pad', 'bass', 'drums', 'arp', 'lead']) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.bus);
      this.layers[k] = g;
    }
    this.layers.arp.connect(this.echo);
    this.layers.lead.connect(this.echo);
    return true;
  }

  /** Start a track: 'menu' or 'match' (a match picks one of a few). Same one again: keeps playing. */
  play(name) {
    if (!this._init()) { this.want = name; return; }
    this.want = null;
    if (this.name === name && this.timer) return;
    const tr = name === 'menu' ? TRACKS.menu : TRACKS.match[(Math.random() * TRACKS.match.length) | 0];
    this.name = name;
    this.track = tr;
    this.step = 0;
    this.variant = 0;
    this.nextT = this.ctx.currentTime + 0.15;
    const t = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setValueAtTime(this.bus.gain.value, t);
    this.bus.gain.linearRampToValueAtTime(name === 'menu' ? 2.0 : 1.7, t + 2.5);
    if (name === 'menu') this.target = this.intensity = 0.5;
    else { this.target = 0.25; this.intensity = 0.25; }
    this._mix(true);
    clearInterval(this.timer);
    this.timer = setInterval(() => this._schedule(), TICK);
  }

  /** Fade out and stop. */
  stop(fade = 1.2) {
    this.want = null;
    if (!this.bus || !this.timer) { this.name = null; return; }
    const t = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setValueAtTime(this.bus.gain.value, t);
    this.bus.gain.linearRampToValueAtTime(0.0001, t + fade);
    clearTimeout(this.stopT);
    const which = this.timer;
    this.stopT = setTimeout(() => { if (this.timer === which) { clearInterval(this.timer); this.timer = null; this.name = null; } }, fade * 1000 + 100);
  }

  /** Paused: muffle and lower the music (and back). */
  duck(on) {
    if (!this.bus) return;
    const t = this.ctx.currentTime;
    this.duckLp.frequency.setTargetAtTime(on ? 700 : 20000, t, 0.15);
  }

  /** How heated the match is, 0..1 (the music follows it smoothly). */
  setIntensity(v) { this.target = Math.max(0, Math.min(1, v)); }

  update(dt) {
    if (this.want && this.ctx && this.audio.music) this.play(this.want);
    if (!this.track || this.track.menu) return;
    // rise fast, settle slowly
    const k = this.target > this.intensity ? 1.2 : 0.18;
    this.intensity += (this.target - this.intensity) * Math.min(1, dt * k);
    this.mixT = (this.mixT || 0) + dt;
    if (this.mixT > 0.25) { this.mixT = 0; this._mix(false); }
  }

  /** Layer volumes from the intensity. */
  _mix(now) {
    if (!this.layers) return;
    const i = this.track && this.track.menu ? 0.5 : this.intensity;
    const ramp = (lo, hi) => Math.max(0, Math.min(1, (i - lo) / (hi - lo)));
    const lv = this.track && this.track.menu
      ? { pad: 0.85, bass: 0.6, drums: 0.35, arp: 0.7, lead: 0 }
      : { pad: 0.7 + 0.3 * (1 - ramp(0.6, 1)), bass: ramp(0.15, 0.4), drums: ramp(0.4, 0.65), arp: ramp(0.3, 0.6) * 0.8, lead: ramp(0.72, 0.95) };
    const t = this.ctx.currentTime;
    for (const [k, v] of Object.entries(lv)) this.layers[k].gain.setTargetAtTime(v, t, now ? 0.01 : 0.6);
  }

  // ---------------------------------------------------------------- the sequencer

  _schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.track || ctx.state !== 'running') return;
    const tr = this.track, s16 = 60 / tr.bpm / 4;
    if (this.nextT < ctx.currentTime - 0.5) this.nextT = ctx.currentTime + 0.05; // fell behind (tab hidden): catch up
    while (this.nextT < ctx.currentTime + LOOKAHEAD) {
      this._playStep(this.step, this.nextT, s16);
      this.nextT += s16;
      this.step++;
      if (this.step % 64 === 0) this.variant = (this.variant + 1) % tr.bars.length;
    }
  }

  _playStep(step, t, s16) {
    const tr = this.track, menu = !!tr.menu;
    const bar = Math.floor(step / 16) % 4, pos = step % 16;
    const chord = C[tr.bars[this.variant][bar]];
    const L = this.layers, i = this.intensity;
    // pad: the chord for the whole bar
    if (pos === 0) this._padChord(L.pad, t, chord.slice(1).map((n) => NOTE(n)), s16 * 16, menu ? 0.05 : 0.045);
    // bass
    if (menu) { if (pos % 4 === 0) this._bass(L.bass, t, NOTE(chord[0]), s16 * 3.5, 0.12); }
    else if (pos % 2 === 0) this._bass(L.bass, t, NOTE(chord[0] + (pos % 8 === 6 ? 12 : 0)), s16 * 1.6, 0.11);
    // drums
    if (menu) {
      if (pos === 0 || pos === 10) this._kick(L.drums, t, 0.35);
      if (pos % 4 === 2) this._hat(L.drums, t, 0.03);
      if (bar === 3 && pos === 12) this._anvil(L.drums, t, 0.05);
    } else {
      if (pos % 4 === 0 || (i > 0.8 && pos === 14)) this._kick(L.drums, t, 0.5);
      if (pos === 4 || pos === 12) this._snare(L.drums, t, 0.18);
      if (pos % 2 === 0 || i > 0.75) this._hat(L.drums, t, pos % 4 === 2 ? 0.05 : 0.03);
      if (bar === 3 && pos === 15) this._anvil(L.drums, t, 0.06);
    }
    // arpeggio: chord tones up an octave
    const tones = chord.slice(1);
    if (menu ? pos % 2 === 0 : true) {
      const n = tones[(Math.floor(step / (menu ? 2 : 1)) + (bar % 2)) % tones.length] + 12;
      if (menu || pos % 2 === 0 || i > 0.55) this._pluck(L.arp, t, NOTE(n), s16 * 1.5, menu ? 0.05 : 0.035);
    }
    // lead: a short motif on the top of the chord (only when it's all kicking off)
    if (!menu && (pos === 0 || pos === 3 || pos === 6 || pos === 10)) {
      const n = tones[[2, 1, 2, 0][[0, 3, 6, 10].indexOf(pos)]] + 12;
      this._lead(L.lead, t, NOTE(n), s16 * (pos === 10 ? 5 : 2.5), 0.05);
    }
  }

  // ---------------------------------------------------------------- instruments

  _env(g, t, peak, a, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  }

  _osc(out, t, type, f, dur, peak, a = 0.005, detune = 0) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f; o.detune.value = detune;
    this._env(g, t, peak, a, dur);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  _padChord(out, t, freqs, dur, peak) {
    const ctx = this.ctx, f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'lowpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(500, t);
    f.frequency.linearRampToValueAtTime(1400, t + dur * 0.5);
    f.frequency.linearRampToValueAtTime(600, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + dur * 0.2);
    g.gain.setValueAtTime(peak, t + dur * 0.75);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.1);
    f.connect(g).connect(out);
    for (const fr of freqs) for (const det of [-8, 7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = fr; o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + dur + 0.15);
    }
  }

  _bass(out, t, f, dur, peak) {
    this._osc(out, t, 'triangle', f, dur, peak, 0.01);
    this._osc(out, t, 'sine', f / 2, dur, peak * 0.8, 0.01);
  }

  _pluck(out, t, f, dur, peak) {
    const ctx = this.ctx, o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = f;
    fl.type = 'lowpass'; fl.frequency.setValueAtTime(3200, t); fl.frequency.exponentialRampToValueAtTime(400, t + dur);
    this._env(g, t, peak, 0.003, dur);
    o.connect(fl).connect(g).connect(out);
    o.start(t); o.stop(t + dur + 0.05);
  }

  _lead(out, t, f, dur, peak) {
    const ctx = this.ctx, g = ctx.createGain(), fl = ctx.createBiquadFilter();
    fl.type = 'lowpass'; fl.frequency.value = 2400; fl.Q.value = 3;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.03);
    g.gain.setValueAtTime(peak, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    fl.connect(g).connect(out);
    for (const det of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      // a touch of vibrato
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 5.5; lg.gain.value = 4;
      lfo.connect(lg).connect(o.detune);
      o.connect(fl); o.start(t); o.stop(t + dur + 0.05); lfo.start(t); lfo.stop(t + dur + 0.05);
    }
  }

  _noise(out, t, dur, type, freq, q, peak) {
    const ctx = this.ctx, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.audio.noiseBuf; src.loop = true;
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    this._env(g, t, peak, 0.002, dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }

  _kick(out, t, peak) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    this._env(g, t, peak, 0.002, 0.32);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + 0.36);
  }

  _snare(out, t, peak) {
    this._noise(out, t, 0.16, 'bandpass', 1900, 0.8, peak);
    this._osc(out, t, 'triangle', 190, 0.08, peak * 0.6, 0.002);
  }

  _hat(out, t, peak) { this._noise(out, t, 0.04, 'highpass', 7500, 0.7, peak); }

  /** The foundry's signature: a struck anvil. */
  _anvil(out, t, peak) {
    for (const [r, gg] of [[1, 1], [2.76, 0.5], [5.4, 0.25]]) this._osc(out, t, 'sine', 880 * r, 1.2 / Math.sqrt(r), peak * gg, 0.002);
  }

  // ---------------------------------------------------------------- ambience

  /** Start the ambience for a map (by id, or a custom map's theme); null stops it. */
  ambience(mapId, theme = null) {
    const id = mapId ? MAP_AMBIENCE[mapId] || (theme && AMBIENCE[theme] ? theme : 'industrial') : null;
    if (id === this.ambId) return;
    this._stopAmb();
    this.ambId = id;
    if (!id || !this.ctx || !this.audio.sfx) { this.ambArgs = id ? [mapId, theme] : null; return; }
    this.ambArgs = null;
    const ctx = this.ctx, p = AMBIENCE[id], t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.linearRampToValueAtTime(1, t + 2);
    out.connect(this.audio.sfx);
    const nodes = [out];
    const keep = (n) => { nodes.push(n); return n; };
    if (p.hum) for (const f of p.hum) {
      const o = keep(ctx.createOscillator()), g = keep(ctx.createGain());
      o.type = 'sine'; o.frequency.value = f; g.gain.value = p.humGain / p.hum.length;
      o.connect(g).connect(out); o.start();
    }
    if (p.wind) {
      const src = keep(ctx.createBufferSource()), f = keep(ctx.createBiquadFilter()), g = keep(ctx.createGain());
      src.buffer = this.audio.noiseBuf; src.loop = true;
      f.type = 'bandpass'; f.frequency.value = p.windF; f.Q.value = 0.6;
      g.gain.value = p.wind;
      // the wind rises and falls
      const lfo = keep(ctx.createOscillator()), lg = keep(ctx.createGain());
      lfo.frequency.value = p.gust ? 0.11 : 0.06; lg.gain.value = p.wind * 0.6;
      lfo.connect(lg).connect(g.gain);
      const lfo2 = keep(ctx.createOscillator()), lg2 = keep(ctx.createGain());
      lfo2.frequency.value = 0.07; lg2.gain.value = p.windF * 0.4;
      lfo2.connect(lg2).connect(f.frequency);
      src.connect(f).connect(g).connect(out);
      src.start(); lfo.start(); lfo2.start();
    }
    if (p.water) {
      const src = keep(ctx.createBufferSource()), f = keep(ctx.createBiquadFilter()), g = keep(ctx.createGain());
      src.buffer = this.audio.noiseBuf; src.loop = true;
      f.type = 'lowpass'; f.frequency.value = 380;
      g.gain.value = p.water;
      const lfo = keep(ctx.createOscillator()), lg = keep(ctx.createGain());
      lfo.frequency.value = 0.35; lg.gain.value = p.water * 0.8; // lapping
      lfo.connect(lg).connect(g.gain);
      src.connect(f).connect(g).connect(out);
      src.start(); lfo.start();
    }
    this.amb = { nodes, out, p, nextT: t + 3 + Math.random() * 5 };
  }

  _stopAmb() {
    const a = this.amb;
    this.amb = null;
    if (!a || !this.ctx) return;
    const t = this.ctx.currentTime;
    a.out.gain.cancelScheduledValues(t);
    a.out.gain.setValueAtTime(a.out.gain.value, t);
    a.out.gain.linearRampToValueAtTime(0.0001, t + 1);
    setTimeout(() => { for (const n of a.nodes) { try { if (n.stop) n.stop(); n.disconnect(); } catch (e) { /* already stopped */ } } }, 1100);
  }

  /** Every frame: one-off ambient sounds now and then. */
  updateAmbience() {
    if (this.ambArgs && this.ctx && this.audio.sfx) { const a = this.ambArgs; this.ambArgs = null; this.ambId = null; this.ambience(...a); }
    const a = this.amb;
    if (!a || !this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    if (t < a.nextT) return;
    a.nextT = t + 4 + Math.random() * 9;
    if (!a.p.events.length) return;
    const ev = a.p.events[(Math.random() * a.p.events.length) | 0];
    const g = this.ctx.createGain(), pan = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    g.gain.value = 1;
    if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; g.connect(pan).connect(a.out); } else g.connect(a.out);
    if (ev === 'clank') { // far-off metal on metal
      const f = 300 + Math.random() * 500;
      for (const [r, gg] of [[1, 1], [2.76, 0.5], [5.4, 0.25]]) this._osc(g, t, 'sine', f * r, 1.6 / Math.sqrt(r), 0.025 * gg, 0.002);
      this._noise(g, t, 0.05, 'bandpass', 2400, 2, 0.02);
    } else if (ev === 'hiss') { // a steam valve
      this._noise(g, t, 1.4 + Math.random(), 'highpass', 3500, 0.5, 0.02);
    } else if (ev === 'thump') { // a heavy press
      this._kick(g, t, 0.08);
      this._noise(g, t, 0.3, 'lowpass', 300, 0.6, 0.05);
    } else if (ev === 'creak') { // strained steel
      const o = this.ctx.createOscillator(), og = this.ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(70 + Math.random() * 40, t);
      o.frequency.linearRampToValueAtTime(55 + Math.random() * 30, t + 1.2);
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 6;
      this._env(og, t, 0.02, 0.3, 1.3);
      o.connect(f).connect(og).connect(g); o.start(t); o.stop(t + 1.4);
    } else if (ev === 'gull') { // two falling cries
      for (let k = 0; k < 2; k++) {
        const o = this.ctx.createOscillator(), og = this.ctx.createGain(), tt = t + k * 0.35;
        o.type = 'triangle';
        o.frequency.setValueAtTime(1500, tt); o.frequency.exponentialRampToValueAtTime(900, tt + 0.28);
        this._env(og, tt, 0.018, 0.03, 0.3);
        o.connect(og).connect(g); o.start(tt); o.stop(tt + 0.32);
      }
    } else if (ev === 'bird') { // a few quick chirps
      for (let k = 0; k < 3 + ((Math.random() * 3) | 0); k++) {
        const o = this.ctx.createOscillator(), og = this.ctx.createGain(), tt = t + k * 0.12;
        const f0 = 2600 + Math.random() * 1200;
        o.type = 'sine';
        o.frequency.setValueAtTime(f0, tt); o.frequency.exponentialRampToValueAtTime(f0 * 1.4, tt + 0.06);
        this._env(og, tt, 0.012, 0.01, 0.08);
        o.connect(og).connect(g); o.start(tt); o.stop(tt + 0.1);
      }
    } else if (ev === 'bell') { // a far bell
      this._anvil(g, t, 0.012);
    }
  }
}
