// Live line model of the house for the deck: one WebGL canvas that moves into
// whichever slide frame is showing. Hidden-line look (faces hide what is behind),
// a height "reveal" so the house builds up floor by floor, and a horizontal cut
// (uTop / uBot) so the axonometric can swing down into a plan.
import * as THREE from '../vendor/three.module.js';

const VS = `varying float vY;
void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const CLIP = `if (vY > uTop || vY < uBot || vY > uRev) discard;`;
const FS_FACE = `uniform vec3 uFace; uniform float uTop, uBot, uRev; varying float vY;
void main(){ ${CLIP} gl_FragColor = vec4(uFace, 1.0); }`;
const FS_LINE = `uniform vec3 uFace, uLine, uAcc; uniform float uTop, uBot, uRev, uEdge, uK; varying float vY;
void main(){ ${CLIP}
  float e = uEdge * smoothstep(0.9, 0.0, uRev - vY);
  gl_FragColor = vec4(mix(mix(uFace, uLine, uK), uAcc, e), 1.0); }`;

const rgb = hex => new THREE.Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
const PALETTE = {
  paper: { face: 0xffffff, line: 0x1d1f20, k: 0.82 },
  ink:   { face: 0x1d1f20, line: 0xd4d4d7, k: 0.62 },
};
// Levels shared by R3/R4/R5 (Revit, m): basement -3.5, ground 0, first 4.0, roof 8.0.
// Plans are cut 1.2 m above each floor. H values are multiples of the building's size.
export const LEVELS = { basement: -3.5, ground: 0, first: 4.0, roof: 8.0 };
const plan = (lv, extra = 1.2) => ({ pal: 'paper', spin: 0, plan: true,
  s: { az: 0, el: 89.9, H: 1.36, top: LEVELS[lv] + extra, bot: LEVELS[lv] - 0.6 } });
export const PRESETS = {
  cover: { pal: 'ink',   spin: 0.045, s: { el: 27, H: 1.45, top: 99, bot: -99 } },
  site:  { pal: 'paper', spin: 0.035, s: { el: 34, H: 1.75, top: 99, bot: -99 } },
  axon:  { pal: 'paper', spin: 0.05,  s: { el: 26, H: 1.35, top: 99, bot: -99 } },
  basement: plan('basement'), ground: plan('ground'), first: plan('first'), roof: plan('roof', 3.5),
};
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const TAU = Math.PI * 2;

export class HouseModel {
  // base: folder with model.json/.bin; target: plan centre on the ground floor (null = from the bbox)
  constructor({ base = '../data/' } = {}) {
    this.base = base; this.size = 30;
    this.r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.r.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.canvas = this.r.domElement;
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 600);
    this.s = { az: 0.75, el: 27, H: 36, top: 99, bot: -99, rev: 99, edge: 0, tx: 0, ty: 2.5, tz: 0 };
    this.u = { uFace: { value: rgb(0xffffff) }, uLine: { value: rgb(0) }, uAcc: { value: rgb(0x1b6f91) },
      uTop: { value: 99 }, uBot: { value: -99 }, uRev: { value: 99 }, uEdge: { value: 0 }, uK: { value: 0.8 } };
    this.spin = 0; this.tweens = []; this.active = false; this.ready = false; this.built = false;
    this.last = performance.now();
    requestAnimationFrame(t => this.tick(t));
  }

  async load(onProgress = () => {}) {
    const meta = await (await fetch(this.base + 'model.json')).json();
    const res = await fetch(this.base + 'model.bin');
    const total = +res.headers.get('content-length') || 0;
    let buf;
    if (res.body && total) {
      const rd = res.body.getReader(), parts = []; let got = 0;
      for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; onProgress(got / total); }
      const out = new Uint8Array(got); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
      buf = out.buffer;
    } else buf = await res.arrayBuffer();
    const deq = L => {
      const q = new Int16Array(buf, L.offset, L.count), f = new Float32Array(L.count);
      for (let k = 0; k < 3; k++) {
        const s = (meta.bbox_max[k] - meta.bbox_min[k]) / 65535, b = meta.bbox_min[k] + 32768 * s;
        for (let i = k; i < L.count; i += 3) f[i] = q[i] * s + b;
      }
      return f;
    };
    const faceMat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS_FACE, uniforms: this.u,
      side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const lineMat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS_LINE, uniforms: this.u });
    const P = meta.layout.solid_pos, I = meta.layout.solid_idx;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(deq(P), 3));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(buf, I.offset, I.count), 1));
    this.measure(g.attributes.position.array, g.index.array);
    const faces = new THREE.Mesh(g, faceMat);
    const D = meta.layout.door_pos, DI = meta.layout.door_idx;   // doors: drawn like walls
    if (D && D.count) {
      const dg = new THREE.BufferGeometry();
      dg.setAttribute('position', new THREE.BufferAttribute(deq(D), 3));
      dg.setIndex(new THREE.BufferAttribute(new Uint32Array(buf, DI.offset, DI.count), 1));
      const dm = new THREE.Mesh(dg, faceMat); dm.frustumCulled = false; dm.matrixAutoUpdate = false; this.scene.add(dm);
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(deq(meta.layout.lines_pos), 3));
    const lines = new THREE.LineSegments(lg, lineMat);
    for (const o of [faces, lines]) { o.frustumCulled = false; o.matrixAutoUpdate = false; this.scene.add(o); }
    this.ready = true;
  }

  // Building box from the first-floor and roof slabs (the site is wider), and the
  // horizontal area at each floor level (approximate gross floor area, m²).
  measure(pos, idx) {
    const box = [1e9, -1e9, 1e9, -1e9], areas = {};
    for (const k in LEVELS) areas[k] = 0;
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3, y = pos[a + 1];
      if (Math.abs(y - pos[b + 1]) > 0.01 || Math.abs(y - pos[c + 1]) > 0.01) continue;
      const ar = Math.abs((pos[b] - pos[a]) * (pos[c + 2] - pos[a + 2]) - (pos[c] - pos[a]) * (pos[b + 2] - pos[a + 2])) / 2;
      for (const k in LEVELS) if (Math.abs(y - LEVELS[k]) < 0.06) areas[k] += ar;
      if (Math.abs(y - LEVELS.first) < 0.06 || Math.abs(y - LEVELS.roof) < 0.06)
        for (const v of [a, b, c]) { box[0] = Math.min(box[0], pos[v]); box[1] = Math.max(box[1], pos[v]); box[2] = Math.min(box[2], pos[v + 2]); box[3] = Math.max(box[3], pos[v + 2]); }
    }
    this.box = { x0: box[0], x1: box[1], z0: box[2], z1: box[3], w: box[1] - box[0], d: box[3] - box[2] };
    this.areas = areas;
    this.size = Math.max(this.box.w, this.box.d);
    Object.assign(this.s, { tx: (box[0] + box[1]) / 2, tz: (box[2] + box[3]) / 2 });
  }

  palette(name) {
    const p = PALETTE[name];
    this.u.uFace.value = rgb(p.face); this.u.uLine.value = rgb(p.line); this.u.uK.value = p.k;
  }

  // Put the canvas into a frame and switch to a preset (tweened unless instant)
  mount(el, mode, { instant = false } = {}) {
    if (this.canvas.parentNode !== el) el.appendChild(this.canvas);
    this.el = el; this.active = true; this.mode = mode;
    this.resize();
    const p = PRESETS[mode];
    this.palette(p.pal); this.spin = p.spin;
    const to = { ...p.s, H: p.s.H * this.size };
    if (to.az !== undefined) {               // shortest way round to the target angle
      this.s.az = ((this.s.az % TAU) + TAU) % TAU; if (this.s.az > Math.PI) this.s.az -= TAU;
    }
    this.tweens = [];
    if (instant || matchMedia('(prefers-reduced-motion: reduce)').matches) Object.assign(this.s, to);
    else this.tween(to, p.plan && !PRESETS[this.prev]?.plan ? 1700 : 1000);
    this.prev = mode;
  }

  // Build the house up from the ground (first showing only)
  build(ms = 4200) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { this.s.rev = 99; this.s.edge = 0; this.built = true; return; }
    this.s.rev = -6; this.s.edge = 1;
    this.tween({ rev: 13 }, ms, () => { this.tween({ edge: 0 }, 900); this.s.rev = 99; this.built = true; });
  }

  park() { this.active = false; }

  tween(to, ms, done) {
    const from = {}; for (const k in to) from[k] = this.s[k];
    this.tweens.push({ from, to, t0: performance.now(), ms, done });
  }

  resize() {
    if (!this.el) return;
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (w && h) { this.r.setSize(w, h, false); this.canvas.style.width = '100%'; this.canvas.style.height = '100%'; this.aspect = w / h; }
  }

  apply() {
    const s = this.s, el = THREE.MathUtils.degToRad(s.el), a = this.aspect || 1.5;
    const d = new THREE.Vector3(Math.sin(s.az) * Math.cos(el), Math.sin(el), Math.cos(s.az) * Math.cos(el));
    this.cam.position.set(s.tx, s.ty, s.tz).addScaledVector(d, 200);
    this.cam.up.set(0, 1, 0);
    this.cam.lookAt(s.tx, s.ty, s.tz);
    const ox = (this.offX || 0) * s.H * a;   // shift the drawing left of a glass card
    this.cam.left = -s.H * a / 2 + ox; this.cam.right = s.H * a / 2 + ox; this.cam.top = s.H / 2; this.cam.bottom = -s.H / 2;
    this.cam.updateProjectionMatrix();
    this.u.uTop.value = s.top; this.u.uBot.value = s.bot; this.u.uRev.value = s.rev; this.u.uEdge.value = s.edge;
  }

  tick(now) {
    requestAnimationFrame(t => this.tick(t));
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    for (const tw of [...this.tweens]) {
      const k = Math.min(1, (now - tw.t0) / tw.ms), e = ease(k);
      for (const key in tw.to) this.s[key] = tw.from[key] + (tw.to[key] - tw.from[key]) * e;
      if (k >= 1) { this.tweens.splice(this.tweens.indexOf(tw), 1); tw.done && tw.done(); }
    }
    if (!this.ready || !this.active) return;
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) this.s.az += this.spin * dt;
    this.apply();
    this.r.render(this.scene, this.cam);
  }

  // Still image of a preset, for thumbnails
  snapshot(mode, w, h, az = 0.75, H) {
    const keep = { s: { ...this.s }, el: this.el, aspect: this.aspect, mode: this.mode };
    const p = PRESETS[mode];
    this.palette(p.pal); Object.assign(this.s, p.s, { az, rev: 99, edge: 0, H: (H || p.s.H) * this.size });
    this.r.setSize(w, h, false); this.aspect = w / h;
    this.apply(); this.r.render(this.scene, this.cam);
    const url = this.canvas.toDataURL('image/png');
    this.s = keep.s; this.aspect = keep.aspect;
    if (keep.mode) this.palette(PRESETS[keep.mode].pal);
    this.resize();
    return url;
  }
}
