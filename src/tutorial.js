// First-time tutorial: a guided run through the controls on the training range.
// Each step watches the player actually do the thing (not just press the key),
// shows the key it's bound to, and moves on when it's done.

import { TRAINING } from './training.js';
import { bindLabel } from './bindings.js';
import { GRENADE, TACTICALS } from './weapons.js';

export const TUTORIAL = {
  ...TRAINING,
  id: 'tutorial', name: 'Tutorial', tutorial: true,
  blurb: 'A two-minute run through the controls.',
  hud(game) {
    const t = game.tutorial;
    return { left: ['STEP', t ? `${Math.min(t.i + 1, t.steps.length)}/${t.steps.length}` : '—'], right: ['DOWN', game.range ? game.range.stats.down : 0], sub: 'tutorial' };
  },
};

const isNade = (def) => !!def && def.kind === GRENADE.kind;
const isTactical = (def) => !!def && TACTICALS.includes(def.kind);

export class Tutorial {
  /** onDone(): called once the last step is finished. */
  constructor(game, onDone) {
    this.game = game;
    this.onDone = onDone;
    this.i = 0;
    this.v = 0; // progress within the current step
    this.done = false;
    const k = (a) => `<kbd>${bindLabel(game.settings.binds, a)}</kbd>`;
    const p = () => game.player;
    // each step: title, how (HTML), goal, and a per-frame measure that returns how much progress this frame added
    this.steps = [
      { title: 'Look around', how: 'Move the mouse to look around.', goal: 3, tick: () => this.turned },
      { title: 'Move', how: `Walk with ${k('forward')} ${k('left')} ${k('back')} ${k('right')}.`, goal: 8, tick: () => (p().onGround ? this.moved : 0) },
      { title: 'Sprint', how: `Hold ${k('sprint')} while moving forward.`, goal: 1.5, tick: (dt) => (p().sprinting ? dt : 0) },
      { title: 'Jump', how: `Press ${k('jump')} to jump. Jump twice.`, goal: 2, tick: () => (this.jumped ? 1 : 0) },
      { title: 'Crouch', how: `Hold ${k('crouch')} to crouch. Crouching makes you quieter and steadier.`, goal: 0.8, tick: (dt) => (p().crouching && !p().sliding ? dt : 0) },
      { title: 'Slide', how: `Sprint, then press ${k('crouch')} to slide.`, goal: 1, tick: () => (p().sliding && !this.wasSliding ? 1 : 0) },
      { title: 'Aim down sights', how: `Hold ${k('aim')} to aim. It's slower to move but far more accurate.`, goal: 0.8, tick: (dt) => (p().ads > 0.9 ? dt : 0) },
      { title: 'Shoot', how: `Click ${k('fire')} to fire. Knock down 3 targets downrange.`, goal: 3, tick: () => this.downs },
      // (pressing it counts even with a full magazine, when nothing happens)
      { title: 'Reload', how: `Press ${k('reload')} to reload.`, goal: 1, tick: () => ((p().weapon.reloadT > 0 && !this.wasReloading) || game.input.actHit('reload') ? 1 : 0) },
      { title: 'Switch weapons', how: `Press ${k('pistol')} for your pistol and ${k('primary')} to switch back (or use the mouse wheel).`, goal: 2, tick: () => this.switched },
      { title: 'Grenades', how: `Press ${k('grenade')} to throw a frag (hold it to cook it), and ${k('tactical')} for your flashbang or smoke.`, goal: 2, tick: () => this.threwNew },
      { title: 'Knife and lean', how: `Press ${k('knife')} to knife (a hit from behind is instant). Lean round cover with ${k('leanLeft')} and ${k('leanRight')}.`, goal: 2, tick: () => this.knifeLean },
    ];
    this.last = { yaw: 0, pitch: 0, x: 0, z: 0, onGround: true, weaponIdx: 0, downs: 0, knife: false, lean: false };
    this.threw = { nade: false, tac: false };
    this.render();
  }

  get step() { return this.steps[this.i]; }

  update(dt) {
    if (this.done) return;
    const g = this.game, p = g.player, L = this.last;
    if (!p.alive) return;
    // what happened this frame
    this.turned = Math.abs(p.yaw - L.yaw) + Math.abs(p.pitch - L.pitch);
    this.moved = Math.hypot(p.pos.x - L.x, p.pos.z - L.z);
    if (this.moved > 2) this.moved = 0; // a respawn / teleport isn't walking
    this.jumped = L.onGround && !p.onGround && p.vel.y > 2;
    const downs = g.range ? g.range.stats.down : 0;
    this.downs = Math.max(0, downs - L.downs);
    this.switched = p.weaponIdx !== L.weaponIdx ? 1 : 0;
    // grenades, knife and lean only count on their own step (one done early doesn't use it up)
    const t = g.playerThrows || [];
    const onStep = (title) => this.step.title === title;
    this.threwNew = 0;
    for (const def of t.splice(0)) {
      if (!onStep('Grenades')) continue;
      if (isNade(def) && !this.threw.nade) { this.threw.nade = true; this.threwNew++; }
      else if (isTactical(def) && !this.threw.tac) { this.threw.tac = true; this.threwNew++; }
    }
    this.knifeLean = 0;
    if (onStep('Knife and lean')) {
      if (p.meleeT > 0 && !L.knife) { L.knife = true; this.knifeLean++; }
      if (Math.abs(p.leanOff || 0) > 0.15 && !L.lean) { L.lean = true; this.knifeLean++; }
    }

    const add = this.step.tick(dt) || 0;
    if (add > 0) {
      this.v = Math.min(this.step.goal, this.v + add);
      this.render();
      if (this.v >= this.step.goal) this.next();
    }
    // remember for next frame
    L.yaw = p.yaw; L.pitch = p.pitch; L.x = p.pos.x; L.z = p.pos.z; L.onGround = p.onGround; L.weaponIdx = p.weaponIdx; L.downs = downs;
    this.wasSliding = p.sliding;
    this.wasReloading = p.weapon.reloadT > 0;
  }

  next() {
    this.game.audio.play('pickup', null, 0.7, 660 + this.i * 40);
    this.i++;
    this.v = 0;
    if (this.i >= this.steps.length) {
      this.done = true;
      this.render();
      this.game.hud.centerMessage("YOU'RE READY", 'Press Esc and pick Play solo, Quick play, or keep practising here', 6, '#ff6b1a');
      this.game.audio.play('sting-win');
      if (this.onDone) this.onDone();
      return;
    }
    this.render();
  }

  render() {
    const el = document.getElementById('tutorial');
    if (!el) return;
    el.classList.remove('hidden');
    document.body.classList.add('tutorial-on');
    if (this.done) {
      el.innerHTML = '<div class="tut-step">Tutorial complete</div><div class="tut-how">Everything else you can practise right here: walk onto a stand to try another gun, or step on the orange pad for a 30-second challenge.</div>';
      return;
    }
    const s = this.step;
    el.innerHTML = `<div class="tut-step">Step ${this.i + 1} of ${this.steps.length} · <b>${s.title}</b></div>`
      + `<div class="tut-how">${s.how}</div>`
      + `<div class="tut-bar"><i style="width:${Math.round((100 * this.v) / s.goal)}%"></i></div>`
      + '<div class="tut-skip">Esc for the menu (you can leave any time)</div>';
  }

  dispose() {
    const el = document.getElementById('tutorial');
    if (el) el.classList.add('hidden');
    document.body.classList.remove('tutorial-on');
  }
}
