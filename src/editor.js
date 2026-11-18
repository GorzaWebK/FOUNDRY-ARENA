// Map editor: a top-down grid where you draw blocks, ramps and stairs, and
// place spawns, pickups, flag bases and hills. Maps are saved as specs (see
// mapspec.js), checked live with the real collision world and bot nav grid, and
// can be test-played, saved, shared as a code, or published as a community map.
//
//   left drag     draw (box / ramp / stairs tools), move (select tool), pan (on empty ground)
//   right drag    pan          wheel   zoom
//   V select  B box  R ramp  T stairs  S spawn  P pickup  F flag  H hill  E erase
//   Del delete  Ctrl+Z undo  Ctrl+Y redo  Ctrl+D duplicate  arrows nudge  [ ] lower / raise

import { blankSpec, cleanSpec, buildMap, validateMap, specToCode, codeToSpec, themes, EDITOR_MATS, PICKUP_KINDS, SPEC_LIMITS } from './mapspec.js';

const DRAFT_KEY = 'foundry-arena-map-draft';
export const MYMAPS_KEY = 'foundry-arena-maps';

const TOOLS = [
  ['select', 'Select', 'V'], ['box', 'Block', 'B'], ['ramp', 'Ramp', 'R'], ['stairs', 'Stairs', 'T'],
  ['spawn', 'Spawn', 'S'], ['pickup', 'Pickup', 'P'], ['flag', 'Flag', 'F'], ['hill', 'Hill', 'H'], ['erase', 'Erase', 'E'],
];
const PRESETS = [['Low cover', 0, 1], ['Cover', 0, 1.5], ['Wall', 0, 3], ['Tall wall', 0, 6], ['Platform', 3, 0.5], ['High deck', 6, 0.5]];
const DIRS = [['-z', 'North'], ['+x', 'East'], ['+z', 'South'], ['-x', 'West']];
const PK_COL = { health: '#4dff88', armor: '#4db8ff', ammo: '#ffd24d', crate: '#ff9a3d' };
const PK_LETTER = { health: 'H', armor: 'A', ammo: 'M', crate: 'C' };
const TEAM_COL = ['#3f7fd0', '#c9343c'];

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const snap = (v, s = 1) => Math.round(v / s) * s;
const r2 = (v) => Math.round(v * 100) / 100;

export function loadMyMaps() {
  try { const a = JSON.parse(localStorage.getItem(MYMAPS_KEY) || '[]'); return Array.isArray(a) ? a.filter((m) => m && m.id && m.spec) : []; } catch (e) { return []; }
}
export function saveMyMaps(list) {
  try { localStorage.setItem(MYMAPS_KEY, JSON.stringify(list.slice(0, 50))); return true; } catch (e) { return false; }
}

export class MapEditor {
  /**
   * hooks: {
   *   onTest(spec)      play it now (solo, with bots)
   *   onPublish(spec, publishedId) -> Promise<id>   (absent when there's no online service)
   *   onClose()
   *   matColor(mat, themeId) -> css colour
   * }
   */
  constructor(root, hooks) {
    this.root = root;
    this.hooks = hooks;
    this.tool = 'box';
    this.opt = { base: 0, height: 1.5, mat: 'concrete', dir: '-z', pickup: 'health', team: 0, radius: 4 };
    this.sel = null; // { k: 's'|'sp'|'pk'|'fl'|'hl', i }
    this.undo = [];
    this.redo = [];
    this.view = { cx: 0, cz: 0, scale: 9 };
    this.drag = null;
    this.docId = null; // id in My maps
    this.publishedId = null;
    this.result = null;
    this._build();
  }

  // ---------------------------------------------------------------- open / close

  /** Open with a spec (or the draft, or a blank map). */
  open(spec = null, docId = null, publishedId = null) {
    let s = spec;
    if (!s) { try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); if (d && d.spec) { s = d.spec; docId = d.docId || null; publishedId = d.pub || null; } } catch (e) { /* none */ } }
    try { this.spec = cleanSpec(s || blankSpec()); } catch (e) { this.spec = cleanSpec(blankSpec()); }
    this.docId = docId;
    this.publishedId = publishedId;
    this.sel = null; this.undo = []; this.redo = [];
    this.root.classList.remove('hidden');
    this._fit();
    this._syncTop();
    this._changed(false);
    this.keyHandler = (e) => this._key(e);
    window.addEventListener('keydown', this.keyHandler, true);
    this.resizeHandler = () => this._resize();
    window.addEventListener('resize', this.resizeHandler);
    this._resize();
  }

  close() {
    this.root.classList.add('hidden');
    window.removeEventListener('keydown', this.keyHandler, true);
    window.removeEventListener('resize', this.resizeHandler);
    this.hooks.onClose();
  }

  get isOpen() { return !this.root.classList.contains('hidden'); }

  // ---------------------------------------------------------------- DOM

  _build() {
    const R = this.root;
    R.textContent = '';
    R.className = 'editor hidden';
    // top bar
    const top = el('header', 'ed-top');
    this.nameIn = el('input', 'ed-name'); this.nameIn.maxLength = 28; this.nameIn.placeholder = 'Map name';
    this.nameIn.addEventListener('change', () => this._edit((s) => { s.name = this.nameIn.value.trim() || 'Untitled yard'; }));
    const size = (label) => { const s = el('select', 'ed-size'); for (let v = SPEC_LIMITS.minSize; v <= SPEC_LIMITS.maxSize; v += 10) { const o = el('option', null, `${v} m`); o.value = v; s.append(o); } s.title = label; return s; };
    this.wSel = size('Width'); this.dSel = size('Depth');
    const onSize = () => this._edit((s) => { s.w = +this.wSel.value; s.d = +this.dSel.value; }, true);
    this.wSel.addEventListener('change', onSize); this.dSel.addEventListener('change', onSize);
    this.themeSel = el('select', 'ed-theme');
    for (const t of themes()) { const o = el('option', null, `${t.name} look`); o.value = t.id; this.themeSel.append(o); }
    this.themeSel.addEventListener('change', () => this._edit((s) => { s.theme = this.themeSel.value; }));
    const btn = (label, fn, cls = '') => { const b = el('button', 'small-btn ' + cls, label); b.addEventListener('click', fn); return b; };
    this.undoBtn = btn('Undo', () => this._undo());
    top.append(el('b', 'ed-logo', 'MAP EDITOR'), this.nameIn, el('span', 'ed-x', 'Size'), this.wSel, el('span', 'ed-x', '×'), this.dSel, this.themeSel, this.undoBtn,
      btn('New', () => this._new()), btn('Save', () => this._save()), btn('Share code', () => this._share()), btn('Import code', () => this._import()),
      this.pubBtn = btn('Publish', () => this._publish()), btn('Test play', () => this._test(), 'accent'), btn('Close', () => this.close()));
    // tools
    const tools = el('aside', 'ed-tools');
    this.toolBtns = {};
    const grid = el('div', 'ed-toolgrid');
    for (const [id, label, key] of TOOLS) {
      const b = el('button', 'ed-tool');
      b.innerHTML = `${label}<kbd>${key}</kbd>`;
      b.addEventListener('click', () => this.setTool(id));
      this.toolBtns[id] = b;
      grid.append(b);
    }
    tools.append(grid);
    this.optBox = el('div', 'ed-opts');
    tools.append(this.optBox);
    // canvas
    const wrap = el('main', 'ed-wrap');
    this.canvas = el('canvas', 'ed-canvas');
    this.hint = el('div', 'ed-hint');
    this.coord = el('div', 'ed-coord');
    wrap.append(this.canvas, this.hint, this.coord);
    this.ctx = this.canvas.getContext('2d');
    this._pointer();
    // side panel
    this.side = el('aside', 'ed-side');
    R.append(top, tools, wrap, this.side);
    this.toast = el('div', 'ed-toast hidden');
    R.append(this.toast);
    this.setTool('box');
  }

  setTool(id) {
    this.tool = id;
    for (const [k, b] of Object.entries(this.toolBtns)) b.classList.toggle('on', k === id);
    this._opts();
    this._hint();
    this.draw();
  }

  _hint() {
    const t = {
      select: 'Click something to select it, drag to move it, drag an edge of a block to resize it. Drag empty ground to pan.',
      box: 'Drag to draw a block. Pick a preset or set its base and height on the left.',
      ramp: 'Drag to draw a ramp. It rises toward the direction on the left.',
      stairs: 'Drag to draw stairs. Steps are about 1 m deep and up to 0.5 m high.',
      spawn: 'Click to place a spawn. They face the middle of the map. 8 or more is best.',
      pickup: 'Click to place a pickup.',
      flag: 'Click to place a flag base for the team picked on the left.',
      hill: 'Click to place a King of the Hill zone.',
      erase: 'Click anything to delete it.',
    }[this.tool];
    this.hint.textContent = t + '  ·  Right-drag to pan, wheel to zoom.';
  }

  _opts() {
    const O = this.optBox, o = this.opt;
    O.textContent = '';
    const row = (label, input) => { const r = el('label', 'ed-row'); r.append(el('span', null, label), input); O.append(r); return input; };
    const numIn = (key, step, min, max) => {
      const i = el('input'); i.type = 'number'; i.step = step; i.min = min; i.max = max; i.value = o[key];
      i.addEventListener('change', () => { o[key] = Math.max(min, Math.min(max, +i.value || 0)); i.value = o[key]; });
      return i;
    };
    if (['box', 'ramp', 'stairs'].includes(this.tool)) {
      if (this.tool === 'box') {
        const pre = el('div', 'ed-presets');
        for (const [name, base, h] of PRESETS) {
          const b = el('button', 'small-btn', name);
          b.addEventListener('click', () => { o.base = base; o.height = h; this._opts(); });
          pre.append(b);
        }
        O.append(el('h5', null, 'Presets'), pre);
      }
      row('Base (m)', numIn('base', 0.25, 0, 25));
      row(this.tool === 'box' ? 'Height (m)' : 'Rise (m)', numIn('height', 0.25, 0.25, 12));
      if (this.tool !== 'box') {
        const d = el('select');
        for (const [v, n] of DIRS) { const op = el('option', null, n); op.value = v; d.append(op); }
        d.value = o.dir;
        d.addEventListener('change', () => { o.dir = d.value; });
        row('Rises toward', d);
      }
      O.append(el('h5', null, 'Material'));
      O.append(this._matPicker(o.mat, (m) => { o.mat = m; this._opts(); }));
    } else if (this.tool === 'pickup') {
      const s = el('select');
      for (const k of PICKUP_KINDS) { const op = el('option', null, { health: 'Health', armor: 'Armour', ammo: 'Ammo', crate: 'Supply crate' }[k]); op.value = k; s.append(op); }
      s.value = o.pickup;
      s.addEventListener('change', () => { o.pickup = s.value; });
      row('Type', s);
    } else if (this.tool === 'flag') {
      const s = el('select');
      [['0', 'Cobalt (blue)'], ['1', 'Crimson (red)']].forEach(([v, n]) => { const op = el('option', null, n); op.value = v; s.append(op); });
      s.value = String(o.team);
      s.addEventListener('change', () => { o.team = +s.value; });
      row('Team', s);
    } else if (this.tool === 'hill') {
      row('Radius (m)', numIn('radius', 0.5, 2, 8));
    }
    O.append(el('p', 'note ed-keys', 'Del delete · Ctrl+Z undo · Ctrl+D duplicate · arrows nudge · [ ] lower / raise'));
  }

  _matPicker(cur, onPick) {
    const box = el('div', 'ed-mats');
    for (const m of EDITOR_MATS) {
      const b = el('button', 'ed-mat' + (m === cur ? ' on' : ''));
      b.style.background = this.hooks.matColor(m, this.spec ? this.spec.theme : 'foundry');
      b.title = { concrete: 'Concrete', wall: 'Wall', metal: 'Steel plate', metalDark: 'Dark steel', crate: 'Wooden crate', ramp: 'Tread plate', blue: 'Blue', orange: 'Orange', green: 'Green' }[m] || m;
      b.addEventListener('click', () => onPick(m));
      box.append(b);
    }
    return box;
  }

  _syncTop() {
    const s = this.spec;
    this.nameIn.value = s.name;
    this.wSel.value = s.w; this.dSel.value = s.d;
    this.themeSel.value = s.theme;
    this.pubBtn.style.display = this.hooks.onPublish ? '' : 'none';
  }

  // ---------------------------------------------------------------- editing

  /** Change the spec through `fn` (undoable), then tidy, save the draft and recheck. */
  _edit(fn, refit = false) {
    this.undo.push(JSON.stringify(this.spec));
    if (this.undo.length > 100) this.undo.shift();
    this.redo = [];
    fn(this.spec);
    this.spec = cleanSpec(this.spec);
    if (this.sel && !this._item(this.sel)) this.sel = null;
    if (refit) this._fit();
    this._syncTop();
    this._changed(true);
  }

  _undo() {
    if (!this.undo.length) return;
    this.redo.push(JSON.stringify(this.spec));
    this.spec = cleanSpec(JSON.parse(this.undo.pop()));
    this.sel = null;
    this._syncTop();
    this._changed(true);
  }

  _redo() {
    if (!this.redo.length) return;
    this.undo.push(JSON.stringify(this.spec));
    this.spec = cleanSpec(JSON.parse(this.redo.pop()));
    this.sel = null;
    this._syncTop();
    this._changed(true);
  }

  _changed(save) {
    if (save) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ spec: this.spec, docId: this.docId, pub: this.publishedId })); } catch (e) { /* full */ } }
    this.undoBtn.disabled = !this.undo.length;
    this.draw();
    this._panel();
    clearTimeout(this.checkT);
    this.checkT = setTimeout(() => this.check(), 350);
  }

  /** Validate with the real world + nav grid. */
  check() {
    try { this.map = buildMap(this.spec); this.result = validateMap(this.map); } catch (e) { this.result = { errors: [e.message], warnings: [] }; }
    this._panel();
    this.draw();
    return this.result;
  }

  _item(sel) {
    const s = this.spec;
    if (!sel) return null;
    if (sel.k === 's') return s.s[sel.i] || null;
    if (sel.k === 'sp') return s.sp[sel.i] || null;
    if (sel.k === 'pk') return s.pk[sel.i] || null;
    if (sel.k === 'hl') return s.hl[sel.i] || null;
    if (sel.k === 'fl') return s.fl[sel.i] || null;
    return null;
  }

  _deleteSel() {
    const sel = this.sel;
    if (!sel) return;
    this._edit((s) => {
      if (sel.k === 'fl') s.fl = [];
      else s[sel.k].splice(sel.i, 1);
    });
    this.sel = null;
    this._panel();
  }

  _duplicate() {
    const sel = this.sel;
    if (!sel || sel.k !== 's') return;
    this._edit((s) => {
      const e = [...s.s[sel.i]];
      e[1] += 2; e[4] += 2; e[3] += 2; e[6] += 2;
      s.s.push(e);
      this.sel = { k: 's', i: s.s.length - 1 };
    });
  }

  _move(sel, dx, dz, dy = 0) {
    this._edit((s) => {
      const it = this._item(sel);
      if (!it) return;
      if (sel.k === 's') { it[1] += dx; it[4] += dx; it[3] += dz; it[6] += dz; it[2] = Math.max(0, it[2] + dy); it[5] = Math.max(it[2] + 0.1, it[5] + dy); }
      else if (sel.k === 'pk') { it[1] += dx; it[3] += dz; it[2] = Math.max(0, it[2] + dy); }
      else { it[0] += dx; it[2] += dz; it[1] = Math.max(0, it[1] + dy); }
    });
  }

  /** The height you'd stand at on top of whatever is at x, z. */
  groundAt(x, z) {
    let y = 0;
    for (const e of this.spec.s) {
      const [t, x0, y0, z0, x1, y1, z1, , dir] = e;
      if (x < x0 || x > x1 || z < z0 || z > z1) continue;
      let top = y1;
      if (t !== 'b') {
        const f = dir === '+x' ? (x - x0) / (x1 - x0) : dir === '-x' ? (x1 - x) / (x1 - x0) : dir === '+z' ? (z - z0) / (z1 - z0) : (z1 - z) / (z1 - z0);
        top = y0 + (y1 - y0) * (t === 's' ? Math.ceil(Math.max(0.001, f) * (e[9] || 1)) / (e[9] || 1) : f);
      }
      if (top > y && top <= 30) y = top;
    }
    return r2(y);
  }

  // ---------------------------------------------------------------- pointer

  toWorld(px, py) { const v = this.view; return { x: (px - this.cw / 2) / v.scale + v.cx, z: (py - this.ch / 2) / v.scale + v.cz }; }
  toScreen(x, z) { const v = this.view; return { x: (x - v.cx) * v.scale + this.cw / 2, y: (z - v.cz) * v.scale + this.ch / 2 }; }

  _pointer() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      const before = this.toWorld(px, py);
      this.view.scale = Math.max(3, Math.min(40, this.view.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      const after = this.toWorld(px, py);
      this.view.cx += before.x - after.x; this.view.cz += before.z - after.z;
      this.draw();
    }, { passive: false });
    c.addEventListener('mousedown', (e) => {
      const r = c.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      const w = this.toWorld(px, py);
      if (e.button === 2 || e.button === 1) { this.drag = { mode: 'pan', px, py, cx: this.view.cx, cz: this.view.cz }; return; }
      if (e.button !== 0) return;
      const t = this.tool;
      if (t === 'box' || t === 'ramp' || t === 'stairs') { this.drag = { mode: 'draw', x0: snap(w.x), z0: snap(w.z), x1: snap(w.x), z1: snap(w.z) }; return; }
      if (t === 'erase') { const h = this._hit(w.x, w.z); if (h) { this.sel = h; this._deleteSel(); } return; }
      if (t === 'spawn' || t === 'pickup' || t === 'flag' || t === 'hill') { this._place(w.x, w.z); return; }
      // select
      const edge = this._edgeAt(px, py);
      if (edge) { this.drag = { mode: 'resize', edge, before: JSON.stringify(this.spec) }; return; }
      const h = this._hit(w.x, w.z);
      if (h) {
        this.sel = h;
        this.drag = { mode: 'move', sx: w.x, sz: w.z, dx: 0, dz: 0, before: JSON.stringify(this.spec), orig: JSON.parse(JSON.stringify(this._item(h))) };
        this._panel();
        this.draw();
      } else {
        this.sel = null;
        this._panel();
        this.drag = { mode: 'pan', px, py, cx: this.view.cx, cz: this.view.cz };
      }
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.isOpen) return;
      const r = c.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      const w = this.toWorld(px, py);
      this.coord.textContent = `x ${w.x.toFixed(1)}  z ${w.z.toFixed(1)}  ·  ground ${this.groundAt(w.x, w.z)} m`;
      const d = this.drag;
      if (!d) { c.style.cursor = this.tool === 'select' && this._edgeAt(px, py) ? 'ew-resize' : this.tool === 'select' ? 'default' : 'crosshair'; return; }
      if (d.mode === 'pan') { this.view.cx = d.cx - (px - d.px) / this.view.scale; this.view.cz = d.cz - (py - d.py) / this.view.scale; this.draw(); }
      else if (d.mode === 'draw') { d.x1 = snap(w.x); d.z1 = snap(w.z); this.draw(); }
      else if (d.mode === 'move') {
        const step = this.sel.k === 's' ? 1 : 0.5;
        const dx = snap(w.x - d.sx, step), dz = snap(w.z - d.sz, step);
        if (dx === d.dx && dz === d.dz) return;
        d.dx = dx; d.dz = dz;
        const it = this._item(this.sel), o = d.orig;
        if (this.sel.k === 's') { it[1] = o[1] + dx; it[4] = o[4] + dx; it[3] = o[3] + dz; it[6] = o[6] + dz; }
        else if (this.sel.k === 'pk') { it[1] = o[1] + dx; it[3] = o[3] + dz; it[2] = this.groundAt(it[1], it[3]); }
        else { it[0] = o[0] + dx; it[2] = o[2] + dz; it[1] = this.groundAt(it[0], it[2]); }
        this.draw();
      } else if (d.mode === 'resize') {
        const it = this._item(this.sel), { i, side } = d.edge;
        const v = snap(side === 'x' ? w.x : w.z);
        if (side === 'x') { if (i === 1) it[1] = Math.min(v, it[4] - 1); else it[4] = Math.max(v, it[1] + 1); }
        else if (i === 3) it[3] = Math.min(v, it[6] - 1); else it[6] = Math.max(v, it[3] + 1);
        this.draw();
      }
    });
    window.addEventListener('mouseup', () => {
      const d = this.drag;
      this.drag = null;
      if (!d || !this.isOpen) return;
      if (d.mode === 'draw') {
        const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1), z0 = Math.min(d.z0, d.z1), z1 = Math.max(d.z0, d.z1);
        if (x1 - x0 < 1 || z1 - z0 < 1) return;
        const o = this.opt, t = this.tool;
        this._edit((s) => {
          const y0 = o.base, y1 = o.base + o.height;
          if (t === 'box') s.s.push(['b', x0, y0, z0, x1, y1, z1, o.mat]);
          else {
            const run = o.dir === '+x' || o.dir === '-x' ? x1 - x0 : z1 - z0;
            if (t === 'ramp') s.s.push(['r', x0, y0, z0, x1, y1, z1, o.mat === 'concrete' ? 'ramp' : o.mat, o.dir]);
            else s.s.push(['s', x0, y0, z0, x1, y1, z1, o.mat === 'concrete' ? 'ramp' : o.mat, o.dir, Math.max(Math.ceil(o.height / 0.5), Math.min(Math.round(run), Math.ceil(o.height / 0.25)))]);
          }
          this.sel = { k: 's', i: s.s.length - 1 };
        });
      } else if (d.mode === 'move' || d.mode === 'resize') {
        if (JSON.stringify(this.spec) !== d.before) {
          this.undo.push(d.before); this.redo = [];
          this.spec = cleanSpec(this.spec);
          this._changed(true);
        }
      }
    });
  }

  _place(x, z) {
    const o = this.opt, t = this.tool;
    const px = Math.floor(x) + 0.5, pz = Math.floor(z) + 0.5, py = this.groundAt(px, pz);
    this._edit((s) => {
      if (t === 'spawn') { s.sp.push([px, py, pz]); this.sel = { k: 'sp', i: s.sp.length - 1 }; }
      else if (t === 'pickup') { s.pk.push([o.pickup, px, py, pz]); this.sel = { k: 'pk', i: s.pk.length - 1 }; }
      else if (t === 'hill') { s.hl.push([px, py, pz, o.radius]); this.sel = { k: 'hl', i: s.hl.length - 1 }; }
      else if (t === 'flag') {
        if (s.fl.length !== 2) { const hw = s.w / 2 - 4; s.fl = [[-hw, 0, 0.5], [hw, 0, 0.5]]; }
        s.fl[o.team] = [px, py, pz];
        this.sel = { k: 'fl', i: o.team };
      }
    });
  }

  /** What's under a point: markers first, then the highest solid. */
  _hit(x, z) {
    const s = this.spec, near = (px, pz, r = 0.9) => Math.hypot(px - x, pz - z) < r;
    for (let i = s.sp.length - 1; i >= 0; i--) if (near(s.sp[i][0], s.sp[i][2])) return { k: 'sp', i };
    for (let i = s.pk.length - 1; i >= 0; i--) if (near(s.pk[i][1], s.pk[i][3])) return { k: 'pk', i };
    for (let i = 0; i < s.fl.length; i++) if (near(s.fl[i][0], s.fl[i][2], 1.2)) return { k: 'fl', i };
    let best = -1;
    for (let i = 0; i < s.s.length; i++) {
      const e = s.s[i];
      if (x >= e[1] && x <= e[4] && z >= e[3] && z <= e[6] && (best < 0 || e[5] >= s.s[best][5])) best = i;
    }
    if (best >= 0) return { k: 's', i: best };
    for (let i = s.hl.length - 1; i >= 0; i--) if (near(s.hl[i][0], s.hl[i][2], s.hl[i][3])) return { k: 'hl', i };
    return null;
  }

  /** Near an edge of the selected block? { i: 1|4 (x0|x1) or 3|6 (z0|z1), side } */
  _edgeAt(px, py) {
    if (!this.sel || this.sel.k !== 's') return null;
    const e = this._item(this.sel);
    if (!e) return null;
    const a = this.toScreen(e[1], e[3]), b = this.toScreen(e[4], e[6]), tol = 6;
    const inY = py > a.y - tol && py < b.y + tol, inX = px > a.x - tol && px < b.x + tol;
    if (inY && Math.abs(px - a.x) < tol) return { i: 1, side: 'x' };
    if (inY && Math.abs(px - b.x) < tol) return { i: 4, side: 'x' };
    if (inX && Math.abs(py - a.y) < tol) return { i: 3, side: 'z' };
    if (inX && Math.abs(py - b.y) < tol) return { i: 6, side: 'z' };
    return null;
  }

  _key(e) {
    if (!this.isOpen) return;
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
    if (typing) return;
    e.stopPropagation();
    const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && k === 'z') { e.preventDefault(); if (e.shiftKey) this._redo(); else this._undo(); return; }
    if (ctrl && k === 'y') { e.preventDefault(); this._redo(); return; }
    if (ctrl && k === 'd') { e.preventDefault(); this._duplicate(); return; }
    if (ctrl && k === 's') { e.preventDefault(); this._save(); return; }
    if (ctrl) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this._deleteSel(); return; }
    if (e.key === 'Escape') { this.sel = null; this._panel(); this.draw(); return; }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[e.key] && this.sel) { e.preventDefault(); const st = e.shiftKey ? 0.5 : 1; this._move(this.sel, arrows[e.key][0] * st, arrows[e.key][1] * st); return; }
    if ((k === '[' || k === ']') && this.sel) { this._move(this.sel, 0, 0, k === ']' ? 0.5 : -0.5); return; }
    const tool = TOOLS.find((t) => t[2].toLowerCase() === k);
    if (tool) this.setTool(tool[0]);
  }

  // ---------------------------------------------------------------- side panel

  _panel() {
    const P = this.side;
    P.textContent = '';
    const sel = this.sel, it = this._item(sel);
    if (it) P.append(this._props(sel, it));
    // map summary + checks
    const s = this.spec;
    const sum = el('div', 'ed-sum');
    sum.append(el('h4', null, 'Map'));
    const line = (k, v) => { const r = el('div', 'ed-kv'); r.append(el('span', null, k), el('b', null, v)); sum.append(r); };
    line('Blocks', `${s.s.length} / ${SPEC_LIMITS.maxSolids}`);
    line('Spawns', String(s.sp.length));
    line('Pickups', String(s.pk.length));
    line('Flags', s.fl.length ? 'both' : 'none');
    line('Hills', String(s.hl.length));
    P.append(sum);
    const chk = el('div', 'ed-check');
    chk.append(el('h4', null, 'Check'));
    const r = this.result;
    if (!r) chk.append(el('p', 'note', 'Checking…'));
    else {
      for (const m of r.errors) chk.append(el('p', 'ed-err', m));
      for (const m of r.warnings) chk.append(el('p', 'ed-warn', m));
      if (!r.errors.length) chk.append(el('p', 'ed-ok', r.warnings.length ? 'Playable.' : 'All good: every spawn and pickup can be reached.'));
    }
    P.append(chk);
  }

  _props(sel, it) {
    const box = el('div', 'ed-props');
    const field = (label, val, step, onSet) => {
      const r = el('label', 'ed-row');
      const i = el('input'); i.type = 'number'; i.step = step; i.value = val;
      i.addEventListener('change', () => this._edit(() => onSet(+i.value)));
      r.append(el('span', null, label), i);
      box.append(r);
    };
    const del = el('button', 'small-btn', 'Delete');
    del.addEventListener('click', () => this._deleteSel());
    if (sel.k === 's') {
      const t = it[0];
      box.append(el('h4', null, t === 'b' ? 'Block' : t === 'r' ? 'Ramp' : 'Stairs'));
      field('West edge (x)', it[1], 1, (v) => { it[1] = v; });
      field('East edge (x)', it[4], 1, (v) => { it[4] = v; });
      field('North edge (z)', it[3], 1, (v) => { it[3] = v; });
      field('South edge (z)', it[6], 1, (v) => { it[6] = v; });
      field('Base (m)', it[2], 0.25, (v) => { const h = it[5] - it[2]; it[2] = v; it[5] = v + h; });
      field('Height (m)', r2(it[5] - it[2]), 0.25, (v) => { it[5] = it[2] + Math.max(0.1, v); });
      if (t !== 'b') {
        const r = el('label', 'ed-row');
        const d = el('select');
        for (const [v, n] of DIRS) { const op = el('option', null, n); op.value = v; d.append(op); }
        d.value = it[8];
        d.addEventListener('change', () => this._edit(() => { it[8] = d.value; }));
        r.append(el('span', null, 'Rises toward'), d);
        box.append(r);
      }
      if (t === 's') field('Steps', it[9], 1, (v) => { it[9] = v; });
      box.append(this._matPicker(it[7], (m) => this._edit(() => { it[7] = m; })));
      const dup = el('button', 'small-btn', 'Duplicate');
      dup.addEventListener('click', () => this._duplicate());
      const row = el('div', 'btn-row'); row.append(dup, del); box.append(row);
    } else {
      const names = { sp: 'Spawn', pk: 'Pickup', fl: sel.i === 0 ? 'Cobalt flag' : 'Crimson flag', hl: 'Hill' };
      box.append(el('h4', null, names[sel.k]));
      const o = sel.k === 'pk' ? 1 : 0;
      field('x', it[o], 0.5, (v) => { it[o] = v; });
      field('z', it[o + 2], 0.5, (v) => { it[o + 2] = v; });
      field('Height (m)', it[o + 1], 0.25, (v) => { it[o + 1] = v; });
      if (sel.k === 'hl') field('Radius (m)', it[3], 0.5, (v) => { it[3] = v; });
      if (sel.k === 'pk') {
        const r = el('label', 'ed-row');
        const s = el('select');
        for (const k of PICKUP_KINDS) { const op = el('option', null, k); op.value = k; s.append(op); }
        s.value = it[0];
        s.addEventListener('change', () => this._edit(() => { it[0] = s.value; }));
        r.append(el('span', null, 'Type'), s);
        box.append(r);
      }
      const row = el('div', 'btn-row'); row.append(del); box.append(row);
    }
    return box;
  }

  // ---------------------------------------------------------------- drawing

  _resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cw = r.width; this.ch = r.height;
    this.canvas.width = Math.round(r.width * dpr); this.canvas.height = Math.round(r.height * dpr);
    this.canvas.style.width = r.width + 'px'; this.canvas.style.height = r.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  _fit() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    const w = r.width || 800, h = r.height || 600;
    this.view = { cx: 0, cz: 0, scale: Math.max(3, Math.min(30, Math.min(w / (this.spec.w + 6), h / (this.spec.d + 6)))) };
  }

  draw() {
    const c = this.ctx, s = this.spec;
    if (!c || !s || !this.cw) return;
    const W = this.cw, H = this.ch, sc = this.view.scale;
    c.fillStyle = '#0d0f12';
    c.fillRect(0, 0, W, H);
    const hw = s.w / 2, hd = s.d / 2;
    const a = this.toScreen(-hw, -hd), b = this.toScreen(hw, hd);
    c.fillStyle = this.hooks.matColor('floor', s.theme);
    c.globalAlpha = 0.35; c.fillRect(a.x, a.y, b.x - a.x, b.y - a.y); c.globalAlpha = 1;
    // grid
    c.lineWidth = 1;
    for (let x = Math.ceil(-hw); x <= hw; x++) {
      const p = this.toScreen(x, 0).x;
      c.strokeStyle = x % 5 === 0 ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)';
      if (sc < 6 && x % 5) continue;
      c.beginPath(); c.moveTo(p + 0.5, a.y); c.lineTo(p + 0.5, b.y); c.stroke();
    }
    for (let z = Math.ceil(-hd); z <= hd; z++) {
      const p = this.toScreen(0, z).y;
      c.strokeStyle = z % 5 === 0 ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)';
      if (sc < 6 && z % 5) continue;
      c.beginPath(); c.moveTo(a.x, p + 0.5); c.lineTo(b.x, p + 0.5); c.stroke();
    }
    c.strokeStyle = this.hooks.matColor('wall', s.theme); c.lineWidth = 4;
    c.strokeRect(a.x - 2, a.y - 2, b.x - a.x + 4, b.y - a.y + 4);
    // solids, low to high
    const order = s.s.map((e, i) => i).sort((i, j) => s.s[i][5] - s.s[j][5]);
    for (const i of order) this._drawSolid(s.s[i], this.sel && this.sel.k === 's' && this.sel.i === i);
    // markers
    for (let i = 0; i < s.hl.length; i++) {
      const h = s.hl[i], p = this.toScreen(h[0], h[2]);
      c.setLineDash([6, 4]); c.strokeStyle = '#ffd24d'; c.lineWidth = this._isSel('hl', i) ? 3 : 2;
      c.beginPath(); c.arc(p.x, p.y, h[3] * sc, 0, 7); c.stroke(); c.setLineDash([]);
      this._label(p.x, p.y, 'HILL', '#ffd24d');
    }
    for (let i = 0; i < s.fl.length; i++) {
      const f = s.fl[i], p = this.toScreen(f[0], f[2]), r = Math.max(6, 0.9 * sc);
      c.fillStyle = TEAM_COL[i]; c.fillRect(p.x - r, p.y - r, r * 2, r * 2);
      if (this._isSel('fl', i)) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.strokeRect(p.x - r - 2, p.y - r - 2, r * 2 + 4, r * 2 + 4); }
      this._label(p.x, p.y, 'F', '#fff');
    }
    for (let i = 0; i < s.pk.length; i++) {
      const k = s.pk[i], p = this.toScreen(k[1], k[3]), r = Math.max(5, 0.6 * sc);
      c.fillStyle = PK_COL[k[0]];
      c.beginPath(); c.moveTo(p.x, p.y - r); c.lineTo(p.x + r, p.y); c.lineTo(p.x, p.y + r); c.lineTo(p.x - r, p.y); c.closePath(); c.fill();
      if (this._isSel('pk', i)) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke(); }
      this._label(p.x, p.y, PK_LETTER[k[0]], '#111');
    }
    for (let i = 0; i < s.sp.length; i++) {
      const sp = s.sp[i], p = this.toScreen(sp[0], sp[2]), r = Math.max(5, 0.55 * sc);
      const ang = Math.atan2(-sp[2], -sp[0]); // facing the middle
      c.fillStyle = '#e9e4da';
      c.beginPath(); c.arc(p.x, p.y, r, 0, 7); c.fill();
      c.strokeStyle = '#ff6b1a'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + Math.cos(ang) * r * 1.8, p.y + Math.sin(ang) * r * 1.8); c.stroke();
      if (this._isSel('sp', i)) { c.strokeStyle = '#ff6b1a'; c.beginPath(); c.arc(p.x, p.y, r + 3, 0, 7); c.stroke(); }
    }
    // the shape being drawn
    const d = this.drag;
    if (d && d.mode === 'draw') {
      const p0 = this.toScreen(Math.min(d.x0, d.x1), Math.min(d.z0, d.z1)), p1 = this.toScreen(Math.max(d.x0, d.x1), Math.max(d.z0, d.z1));
      c.fillStyle = 'rgba(255,107,26,0.25)'; c.strokeStyle = '#ff6b1a'; c.lineWidth = 2;
      c.fillRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y); c.strokeRect(p0.x, p0.y, p1.x - p0.x, p1.y - p0.y);
      this._label((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, `${Math.abs(d.x1 - d.x0)} × ${Math.abs(d.z1 - d.z0)} m`, '#fff');
    }
    // compass
    c.fillStyle = 'rgba(233,228,218,0.6)'; c.font = '700 12px "Barlow Condensed", sans-serif'; c.textAlign = 'center';
    c.fillText('N', W - 24, 22);
  }

  _isSel(k, i) { return !!this.sel && this.sel.k === k && this.sel.i === i; }

  _drawSolid(e, selected) {
    const c = this.ctx, [t, x0, y0, z0, x1, y1, z1, mat, dir, steps] = e;
    const a = this.toScreen(x0, z0), b = this.toScreen(x1, z1), w = b.x - a.x, h = b.y - a.y;
    c.fillStyle = this.hooks.matColor(mat, this.spec.theme);
    c.fillRect(a.x, a.y, w, h);
    // lighter the higher it is
    c.fillStyle = `rgba(255,255,255,${Math.min(0.45, y1 / 16)})`;
    c.fillRect(a.x, a.y, w, h);
    if (y0 > 0.4) { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(a.x + 3, a.y + 3, w - 6, h - 6); c.fillStyle = `rgba(255,255,255,${Math.min(0.45, y1 / 16)})`; c.fillRect(a.x + 3, a.y + 3, w - 6, h - 6); }
    if (t !== 'b') {
      // arrow uphill, and step lines for stairs
      const cx = a.x + w / 2, cy = a.y + h / 2;
      const v = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] }[dir];
      c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 2;
      if (t === 's') {
        for (let k = 1; k < steps; k++) {
          c.beginPath();
          if (v[0]) { const x = a.x + (w * k) / steps; c.moveTo(x, a.y); c.lineTo(x, b.y); } else { const y = a.y + (h * k) / steps; c.moveTo(a.x, y); c.lineTo(b.x, y); }
          c.stroke();
        }
      }
      const L = Math.min(Math.abs(w), Math.abs(h)) * 0.3;
      c.strokeStyle = '#111'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(cx - v[0] * L, cy - v[1] * L); c.lineTo(cx + v[0] * L, cy + v[1] * L);
      c.lineTo(cx + v[0] * L - (v[0] + v[1]) * L * 0.4, cy + v[1] * L - (v[1] - v[0]) * L * 0.4);
      c.moveTo(cx + v[0] * L, cy + v[1] * L);
      c.lineTo(cx + v[0] * L - (v[0] - v[1]) * L * 0.4, cy + v[1] * L - (v[1] + v[0]) * L * 0.4);
      c.stroke();
    }
    c.strokeStyle = selected ? '#ff6b1a' : 'rgba(0,0,0,0.6)';
    c.lineWidth = selected ? 3 : 1;
    c.strokeRect(a.x + 0.5, a.y + 0.5, w - 1, h - 1);
    if (Math.min(w, h) > 26) this._label(a.x + w / 2, a.y + h / 2 + (t === 'b' ? 0 : Math.min(w, h) * 0.3), y0 > 0.01 ? `${y0}–${y1} m` : `${y1} m`, '#111', true);
  }

  _label(x, y, text, color, small = false) {
    const c = this.ctx;
    c.font = `700 ${small ? 11 : 12}px "Barlow Condensed", sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = color;
    c.fillText(text, x, y + 0.5);
  }

  // ---------------------------------------------------------------- actions

  _flash(text, err = false) {
    this.toast.textContent = text;
    this.toast.classList.toggle('err', err);
    this.toast.classList.remove('hidden');
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => this.toast.classList.add('hidden'), 3200);
  }

  _new() {
    if (!window.confirm('Start a new map? Unsaved changes to this one will be lost (your saved maps are kept).')) return;
    this.open(blankSpec());
    this.docId = null; this.publishedId = null;
    this._changed(true);
  }

  _save() {
    const list = loadMyMaps();
    if (!this.docId) this.docId = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const i = list.findIndex((m) => m.id === this.docId);
    const doc = { id: this.docId, spec: this.spec, updated: Date.now(), pub: this.publishedId || undefined };
    if (i >= 0) list[i] = doc; else list.unshift(doc);
    if (saveMyMaps(list)) this._flash(`Saved "${this.spec.name}" to My maps.`); else this._flash("Couldn't save: your browser's storage is full.", true);
    this._changed(true);
  }

  async _share() {
    const code = specToCode(this.spec);
    try { await navigator.clipboard.writeText(code); this._flash('Map code copied. Anyone can paste it into Maps → Import code.'); }
    catch (e) { window.prompt('Copy this map code:', code); }
  }

  _import() {
    const code = window.prompt('Paste a map code (it starts FAM1.):');
    if (!code) return;
    try {
      const spec = codeToSpec(code);
      this._edit((s) => { Object.assign(s, spec); }, true);
      this.docId = null; this.publishedId = null;
      this._flash(`Imported "${spec.name}".`);
    } catch (e) { this._flash(e.message, true); }
  }

  _test() {
    const r = this.check();
    if (r.errors.length) { this._flash('Fix the problems listed on the right first.', true); return; }
    this.root.classList.add('hidden');
    window.removeEventListener('keydown', this.keyHandler, true);
    this.hooks.onTest(this.spec);
  }

  /** Back from a test match. */
  resume() {
    this.root.classList.remove('hidden');
    window.addEventListener('keydown', this.keyHandler, true);
    this._resize();
  }

  async _publish() {
    if (!this.hooks.onPublish) return;
    const r = this.check();
    if (r.errors.length) { this._flash('Fix the problems listed on the right before publishing.', true); return; }
    if (this.spec.sp.length < 4) { this._flash('Published maps need at least 4 spawns.', true); return; }
    if (!window.confirm(`Publish "${this.spec.name}" for everyone to play? You can update it later by publishing again.`)) return;
    try {
      this.publishedId = await this.hooks.onPublish(this.spec, this.publishedId);
      this._save();
      this._flash('Published! It\'s in Maps → Community.');
    } catch (e) { this._flash(e.message || 'Publishing failed.', true); }
  }
}
