import * as THREE from 'three';
import { computeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { VRButton } from './vendor/VRButton.js';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// ---------- settings ----------
const EYE = 1.6;            // desktop eye height; also the seated-mode eye height
// walking speed, chosen in the menu (5th test: 0.7 felt too slow)
const SPEEDS = { slow: 0.7, normal: 1.1, fast: 1.5 };
const walkSpeed = () => SPEEDS[settings.speed] || SPEEDS.normal;
const ACCEL_TAU = 0.03;     // s; near-instant start/stop: constant speed is more comfortable than accelerating
const SIDE_FACTOR = 0.5, BACK_FACTOR = 0.5;   // sideways / backwards walking at half speed (forward is easiest)
// Step walking (default since the 4th headset test: smooth walking made the tester sick,
// jumps did not). Holding the left stick moves you in short instant steps, each under a
// quick grey blink, so the eyes never see a continuous glide.
const STEP_LEN = 0.5;       // m per step (forward; sideways/backwards use the factors above)
const STEP_EVERY = 0.42;    // s between steps while the stick is held (~1.2 m/s)
const STEP_BLINK = 0.14;    // s blink length; the move happens in the middle of it
const STEP_BLINK_MAX = 0.6; // grey cover at the blink peak
const TURN_MAX = THREE.MathUtils.degToRad(90);   // smooth turn, rad/s at full stick
const TURN_TAU = 0.1;       // s; turn easing
const SNAP = Math.PI / 6;   // 30° per push (soft snap and snap)
const SOFT_SNAP_TIME = 0.12;// s; soft snap sweeps the 30° in this time, hidden by a grey blink
const BLINK_MAX = 0.85;     // grey cover at the middle of a soft snap
const STEP = 0.22;          // highest step you walk up: stair risers (~0.18) yes, bed frames, sofas (0.25+) no
const RADIUS = 0.25;        // body radius for wall collision
// Colour palettes (display values 0..1). "soft" is the default after the headset test:
// Meta's rendering guide links bright white rooms to peripheral flicker and sickness,
// and fine black-on-white lines shimmer, so walls are grey, lines dark grey and fade with distance.
const PALETTES = {
  soft:   { wall: 0.80, ceil: 0.74, floor: 0.73, bg: 0.62, line: 0.22, lineFar: 0.62, fadeNear: 5, fadeFar: 22, edge: 0.35 },
  bright: { wall: 1.00, ceil: 0.89, floor: 1.00, bg: 1.00, line: 0.00, lineFar: 0.00, fadeNear: 900, fadeFar: 1000, edge: 0 },
};
const grey = v => new THREE.Color(v, v, v);

// user comfort settings, remembered on this headset/browser
// v3: after headset tests: jumping is comfortable, walking is wanted but made the tester sick,
// so walking is on with strong tunnel vision + a floor ring; jumping stays on the right stick/trigger
// v4: step walking is the default (smooth walking still made the tester sick at a steady 72 fps)
const SETTINGS_KEY = 'houseTour.settings.v5';   // v5: smooth walk again, slower, narrower tunnel
const settings = Object.assign({ move: 'walk', turn: 'soft', tunnel: 'strong', seated: false, colours: 'soft', meter: false, ring: true, speed: 'normal' },
  JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
const saveSettings = () => localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
// tunnel vision: angle (deg from view centre) where the grey starts / is full
const TUNNEL = { off: null, light: [34, 56], strong: [14, 32] };   // strong = narrow view while walking

// ---------- which house: ?type=t1|t2|t3 (the deck's three options) ----------
const TYPES = {
  t1: { data: './data/r5/', ar: 'النوع ١', en: 'Type 1', rev: 'R5' },
  t2: { data: './data/r3/', ar: 'النوع ٢', en: 'Type 2', rev: 'R3' },
  t3: { data: './data/r4/', ar: 'النوع ٣', en: 'Type 3', rev: 'R4' },
};
const TYPE = TYPES[new URLSearchParams(location.search).get('type')] ? new URLSearchParams(location.search).get('type') : 't1';
const DATA = TYPES[TYPE].data;

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
// phones draw a little softer so they keep up (the headset sets its own resolution)
renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(0.5);
// render sharpness for the headset; lowered automatically for the next visit if frames drop
const FB_KEY = 'houseTour.fbScale';
let fbScale = +localStorage.getItem(FB_KEY) || 1.0;
renderer.xr.setFramebufferScaleFactor(fbScale);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color();
const player = new THREE.Group();          // feet position + yaw
scene.add(player);
const rig = new THREE.Group();             // seated mode lifts this
player.add(rig);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 400);
camera.position.set(0, EYE, 0);
camera.rotation.order = 'YXZ';
rig.add(camera);

const fitFov = () => { camera.fov = innerWidth < innerHeight ? 85 : 70; };   // portrait phones see more
fitFov();
addEventListener('resize', () => {
  fitFov(); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- materials ----------
const faceMat = new THREE.ShaderMaterial({
  uniforms: { uWall: { value: grey(1) }, uCeil: { value: grey(0.89) }, uFloor: { value: grey(1) } },
  vertexShader: /* glsl */`
    varying vec3 vW;
    void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: /* glsl */`
    varying vec3 vW; uniform vec3 uWall, uCeil, uFloor;
    void main() {
      vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));   // faces the viewer
      float under = smoothstep(0.6, 0.9, -n.y);          // looking up at it (ceilings)
      float over  = smoothstep(0.6, 0.9,  n.y);          // looking down at it (floors, tables)
      gl_FragColor = vec4(uWall * (1.0 - under - over) + uCeil * under + uFloor * over, 1.0);
    }`,
  side: THREE.DoubleSide,
  polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
});
// model lines: fade from dark grey to a lighter grey with distance (no far-away shimmer)
const edgeMat = new THREE.ShaderMaterial({
  uniforms: { uNear: { value: grey(0) }, uFar: { value: grey(0) }, uD0: { value: 900 }, uD1: { value: 1000 } },
  vertexShader: /* glsl */`varying float vD;
    void main(){ vec4 v = modelViewMatrix * vec4(position, 1.0); vD = length(v.xyz); gl_Position = projectionMatrix * v; }`,
  fragmentShader: /* glsl */`varying float vD; uniform vec3 uNear, uFar; uniform float uD0, uD1;
    void main(){ gl_FragColor = vec4(mix(uNear, uFar, smoothstep(uD0, uD1, vD)), 1.0); }`,
});
const lineMat = new THREE.LineBasicMaterial({ color: 0x000000 });   // controllers, pointer

// ---------- tunnel vision (head-locked grey edge while moving) ----------
const TUN_D = 0.12;
const tunnelMat = new THREE.ShaderMaterial({
  uniforms: { uCol: { value: grey(0.89) }, uAmt: { value: 0 }, uIn: { value: 0.6 }, uOut: { value: 1.0 }, uBlink: { value: 0 },
    uEdge: { value: 0 }, uEdgeCol: { value: grey(0.45) } },
  // drawn straight in eye space (no model-view), so it never lags the head pose
  vertexShader: /* glsl */`varying vec2 vP; void main(){ vP = position.xy;
    gl_Position = projectionMatrix * vec4(position.xy, -${TUN_D.toFixed(3)}, 1.0); }`,
  fragmentShader: /* glsl */`varying vec2 vP; uniform vec3 uCol, uEdgeCol; uniform float uAmt, uIn, uOut, uBlink, uEdge;
    void main(){ float ang = atan(length(vP), ${TUN_D.toFixed(3)});
      float m = max(smoothstep(uIn, uOut, ang) * uAmt, uBlink);
      float e = smoothstep(0.75, 1.15, ang) * uEdge;        // always-on soft darkening far out (Soft colours)
      float a = max(m, e); if (a < 0.003) discard;
      gl_FragColor = vec4(mix(uEdgeCol, uCol, m / max(a, 1e-3)), a); }`,
  transparent: true, depthTest: false, depthWrite: false,
});
const tunnel = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), tunnelMat);
tunnel.position.z = -TUN_D; tunnel.renderOrder = 1000; tunnel.frustumCulled = false;
camera.add(tunnel);
let tunnelAmt = 0;
function updateTunnel(motion, dt) {        // motion: 0..1
  const t = renderer.xr.isPresenting ? TUNNEL[settings.tunnel] : null;   // a comfort aid for the headset only
  const goal = t ? motion : 0;
  const tau = goal > tunnelAmt ? 0.1 : 0.3;  // in fast, out gently
  tunnelAmt += (goal - tunnelAmt) * Math.min(1, dt / tau);
  if (t) { tunnelMat.uniforms.uIn.value = THREE.MathUtils.degToRad(t[0]); tunnelMat.uniforms.uOut.value = THREE.MathUtils.degToRad(t[1]); }
  tunnelMat.uniforms.uAmt.value = tunnelAmt;
  tunnel.visible = tunnelAmt > 0.003 || tunnelMat.uniforms.uBlink.value > 0.003 || tunnelMat.uniforms.uEdge.value > 0;
}

// soft snap: a 30° sweep in 0.12 s with a grey blink over it
let softTurn = null;                       // { left: rad still to turn, dir }
function startSoftSnap(dir) { if (!softTurn) softTurn = { left: SNAP, t: 0, dir }; }
let softBlink = 0, stepBlink = 0;          // combined into the tunnel's blink each frame
function updateSoftSnap(dt) {
  if (!softTurn) { softBlink = 0; return; }
  softTurn.t += dt;
  const p = Math.min(1, softTurn.t / SOFT_SNAP_TIME);
  const e = p * p * (3 - 2 * p);                       // ease in-out
  const target = SNAP * e, done = SNAP - softTurn.left;
  turnAround(softTurn.dir * (target - done)); softTurn.left = SNAP - target;
  softBlink = BLINK_MAX * Math.sin(Math.PI * p);
  if (p >= 1) softTurn = null;
}

// step walking: one instant step per STEP_EVERY while the stick is held, under a blink
const stepWish = new THREE.Vector2();      // world direction x,z scaled 0..1 (set by input)
let stepTimer = 0, stepT = -1, stepsTaken = 0;
const pendingStep = new THREE.Vector2(); let stepPending = false;
function updateSteps(dt) {
  if (stepWish.lengthSq() > 0) {
    stepTimer -= dt;
    if (stepTimer <= 0 && stepT < 0) {
      pendingStep.copy(stepWish).multiplyScalar(STEP_LEN); stepPending = true;
      stepT = 0; stepTimer = STEP_EVERY;
    }
  } else stepTimer = 0;                      // the next push steps at once
  if (stepT < 0) { stepBlink = 0; return; }
  stepT += dt;
  if (stepPending && stepT >= STEP_BLINK * 0.45) {   // move at the darkest moment
    stepPending = false;
    const len = pendingStep.length();
    if (len > 1e-4) lastDir.copy(pendingStep).divideScalar(len);
    if (!walk(pendingStep.x, pendingStep.y)) walk(pendingStep.x * 0.5, pendingStep.y * 0.5);
    const ty = floorTarget(); player.position.y = ty; lastY = ty;   // stairs: land on the step, no glide
    stepsTaken++;
  }
  stepBlink = STEP_BLINK_MAX * Math.sin(Math.PI * Math.min(1, stepT / STEP_BLINK));
  if (stepT >= STEP_BLINK) { stepT = -1; stepBlink = 0; }
}

// ---------- floor ring (rest frame): a faint ring around your feet that moves with you ----------
// A reference that stays still relative to your body while the house slides past
// is a proven way to cut walking sickness (same idea as a car's dashboard).
const floorRing = new THREE.Group();
{
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  for (const [r0, r1] of [[0.43, 0.45], [0.88, 0.9]]) floorRing.add(new THREE.Mesh(new THREE.RingGeometry(r0, r1, 72).rotateX(-Math.PI / 2), ringMat));
  for (let i = 0; i < 12; i++) {          // short ticks between the circles, like a compass
    const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.018, i % 3 ? 0.12 : 0.22).rotateX(-Math.PI / 2), ringMat);
    const a = i / 12 * Math.PI * 2, r = i % 3 ? 0.6 : 0.66;
    tick.position.set(Math.sin(a) * r, 0, Math.cos(a) * r); tick.rotation.y = a;
    floorRing.add(tick);
  }
  floorRing.userData.mat = ringMat;
}
floorRing.position.y = 0.012; floorRing.visible = false; floorRing.renderOrder = 5;
player.add(floorRing);
let ringAmt = 0;
const _rh = new THREE.Vector3();
function updateRing(motion, dt) {
  const goal = settings.ring ? motion : 0;
  ringAmt += (goal - ringAmt) * Math.min(1, dt / (goal > ringAmt ? 0.1 : 0.4));
  floorRing.visible = ringAmt > 0.01;
  if (!floorRing.visible) return;
  floorRing.userData.mat.opacity = 0.6 * ringAmt;
  _rh.copy(headWorld()); player.worldToLocal(_rh);          // centre under your head
  floorRing.position.x = _rh.x; floorRing.position.z = _rh.z;
}

function applyPalette() {
  const P = PALETTES[settings.colours] || PALETTES.soft;
  faceMat.uniforms.uWall.value = grey(P.wall); faceMat.uniforms.uCeil.value = grey(P.ceil);
  faceMat.uniforms.uFloor.value = grey(P.floor);
  edgeMat.uniforms.uNear.value = grey(P.line); edgeMat.uniforms.uFar.value = grey(P.lineFar);
  edgeMat.uniforms.uD0.value = P.fadeNear; edgeMat.uniforms.uD1.value = P.fadeFar;
  scene.background.setRGB(P.bg, P.bg, P.bg, THREE.SRGBColorSpace);
  tunnelMat.uniforms.uCol.value = grey(P.ceil);
  tunnelMat.uniforms.uEdge.value = P.edge; tunnelMat.uniforms.uEdgeCol.value = grey(P.bg * 0.75);
  tunnel.visible = P.edge > 0;
}
applyPalette();

// ---------- frame-rate meter (on the left controller) + automatic quality ----------
// Counts real frame intervals in the headset. If the average stays below the target
// rate, foveation is raised step by step (cheaper edges of the image); if that is not
// enough, the next visit starts at a lower render sharpness (remembered on the headset).
const fps = { target: 72, frames: 0, t0: 0, last: 0, drops: 0, avg: 0, slowSecs: 0, fov: 0.5, note: '' };
const meterCanvas = document.createElement('canvas'); meterCanvas.width = 512; meterCanvas.height = 192;
const meterTex = new THREE.CanvasTexture(meterCanvas); meterTex.colorSpace = THREE.SRGBColorSpace;
const meter = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.045),
  new THREE.MeshBasicMaterial({ map: meterTex, depthTest: false, transparent: true }));
meter.renderOrder = 1002; meter.position.set(0, 0.045, 0.02); meter.rotation.x = -0.9; meter.visible = false;
function drawMeter() {
  const g = meterCanvas.getContext('2d'), ok = fps.avg >= fps.target * 0.95;
  g.clearRect(0, 0, 512, 192);
  g.fillStyle = ok ? '#1d1d1d' : '#7a1010'; g.beginPath(); g.roundRect(0, 0, 512, 192, 24); g.fill();
  g.fillStyle = '#fff'; g.font = '700 84px "Segoe UI",sans-serif'; g.textAlign = 'left';
  g.fillText(`${Math.round(fps.avg)} / ${fps.target}`, 24, 92);
  g.font = '400 38px "Segoe UI",sans-serif';
  g.fillText(`fps · drops ${fps.drops} · sharp ${Math.round(fbScale * 100)}% · fov ${fps.fov}`, 24, 150);
  meterTex.needsUpdate = true;
}
function frameStats(now) {
  if (!renderer.xr.isPresenting) return;
  if (fps.last) {
    const dtms = now - fps.last;
    if (dtms > 1000 / fps.target * 1.5) fps.drops++;
  }
  fps.last = now; fps.frames++;
  if (!fps.t0) fps.t0 = now;
  if (now - fps.t0 >= 1000) {
    fps.avg = fps.frames * 1000 / (now - fps.t0); fps.frames = 0; fps.t0 = now;
    // automatic quality: 2 slow seconds in a row -> next step
    fps.slowSecs = fps.avg < fps.target * 0.9 ? fps.slowSecs + 1 : 0;
    if (fps.slowSecs >= 2) {
      fps.slowSecs = 0;
      if (fps.fov < 1) { fps.fov = Math.min(1, +(fps.fov + 0.25).toFixed(2)); renderer.xr.setFoveation(fps.fov); }
      else if (fbScale > 0.7) {                          // applies from the next "Enter VR"
        fbScale = +(fbScale - 0.1).toFixed(2); localStorage.setItem(FB_KEY, fbScale);
      }
    }
    if (meter.visible) drawMeter();
  }
}
renderer.xr.addEventListener('sessionstart', async () => {
  Object.assign(fps, { frames: 0, t0: 0, last: 0, drops: 0, avg: 0, slowSecs: 0, fov: 0.5 });
  renderer.xr.setFoveation(0.5);
  const s = renderer.xr.getSession();
  try {                                                  // ask for a steady 72 Hz (Quest default)
    const rates = s.supportedFrameRates ? [...s.supportedFrameRates] : [];
    if (rates.includes(72) && s.updateTargetFrameRate) await s.updateTargetFrameRate(72);
    fps.target = Math.round(s.frameRate || 72);
  } catch { fps.target = 72; }
});

// ---------- loading ----------
const bar = document.querySelector('#bar > i'), msg = document.getElementById('msg');

async function fetchWithProgress(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ' ' + res.status);
  const total = +res.headers.get('content-length') || 0;
  if (!res.body || !total) return new Uint8Array(await res.arrayBuffer()).buffer;
  const reader = res.body.getReader(); const parts = []; let got = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    parts.push(value); got += value.length; bar.style.width = (got / total * 90).toFixed(1) + '%';
  }
  const out = new Uint8Array(got); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out.buffer;
}

function dequant(buf, L, meta) {
  const q = new Int16Array(buf, L.offset, L.count), f = new Float32Array(L.count);
  const mn = meta.bbox_min, mx = meta.bbox_max;
  for (let k = 0; k < 3; k++) {
    const s = (mx[k] - mn[k]) / 65535, b = mn[k] + 32768 * s;
    for (let i = k; i < L.count; i += 3) f[i] = q[i] * s + b;
  }
  return f;
}

const colliders = [];
let meta;
async function load() {
  meta = await (await fetch(DATA + 'model.json')).json();
  // room spots from the plans (tools/make_spots.py); ground floor first, then up, then down
  try {
    const order = y => (y === 0 ? 0 : y > 0 ? y : 100 - y);
    const sp = await (await fetch(DATA + 'spots.json')).json();
    if (sp.length) SPOTS = sp.sort((a, b) => order(a.y) - order(b.y));
  } catch (e) { console.warn('no spots.json for', TYPE, e); }
  const buf = await fetchWithProgress(DATA + 'model.bin');
  msg.textContent = 'Preparing…';
  await new Promise(r => setTimeout(r, 30));
  // solid + glass block you; doors (Revit exports them closed) are drawn but walkable
  for (const g of ['solid', 'glass', 'door', 'doorglass']) {
    const P = meta.layout[g + '_pos'], I = meta.layout[g + '_idx'];
    if (!P || !P.count) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(dequant(buf, P, meta), 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(buf, I.offset, I.count), 1));
    geo.computeBoundsTree();
    const mesh = new THREE.Mesh(geo, faceMat);
    mesh.visible = g === 'solid' || g === 'door';   // glass: no fill, only its lines
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    if (g === 'solid' || g === 'glass') colliders.push(mesh);
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(dequant(buf, meta.layout.lines_pos, meta), 3));
  const lines = new THREE.LineSegments(lg, edgeMat);
  lines.matrixAutoUpdate = false; lines.frustumCulled = false;
  scene.add(lines);
  bar.style.width = '100%';
}

// ---------- physics helpers ----------
const ray = new THREE.Raycaster(); ray.firstHitOnly = true;
const DOWN = new THREE.Vector3(0, -1, 0);
function cast(origin, dir, far) {
  ray.set(origin, dir); ray.near = 0; ray.far = far;
  const hits = ray.intersectObjects(colliders, false);
  return hits.length ? hits[0] : null;
}
const _head = new THREE.Vector3();
function headWorld() { return camera.getWorldPosition(_head); }

// floor levels of all three houses (Revit slab tops): a step up onto one of these may be
// taller (the last stair riser meets the floor finish, ~0.30 m); anything else above STEP
// (bed frame, sofa seat, low table) is not walkable
const FLOOR_LEVELS = [-3.5, 0, 4, 8];
let floorY = null;                 // the surface you are standing on (set by walk / goTo / jump)
function groundAt(x, z, fromY) {     // highest walkable surface you can step onto from fromY
  const h = cast(new THREE.Vector3(x, fromY + 0.36, z), DOWN, 6.36);
  if (!h) return null;
  const y = h.point.y;
  if (y - fromY > STEP && !FLOOR_LEVELS.some(l => Math.abs(y - l) < 0.06)) return null;
  return y;
}

const _o = new THREE.Vector3(), _d = new THREE.Vector3();
function blocked(x, z, dx, dz, y = player.position.y) {
  const len = Math.hypot(dx, dz); if (len < 1e-6) return false;
  _d.set(dx / len, 0, dz / len);
  // knee-height ray is short: it stops you at a sofa or bed you walk into, but does not see
  // the next stair riser (0.28 m further on), so stairs stay walkable; the waist ray (0.75 m)
  // stops you at table tops and counters
  for (const h of [0.75, 1.05]) {            // waist and chest: walls, glass, tables, counters
    _o.set(x, y + h, z);
    if (cast(_o, _d, len + RADIUS)) return true;
  }
  _o.set(x, y + STEP + 0.1, z);
  if (cast(_o, _d, len + 0.08)) {
    // something at knee height: a stair step you can climb, or furniture you cannot
    return groundAt(x + _d.x * (len + 0.3), z + _d.z * (len + 0.3), y) === null;
  }
  return false;
}

// returns the distance actually moved
function walk(dx, dz) {
  const h = headWorld();
  // step-ups are measured from the floor actually under you: on stairs the eye height eases
  // in and lags a little below the tread, which would make the next riser look too tall
  const yRef = floorY ?? player.position.y;
  let mx = dx, mz = dz;
  if (blocked(h.x, h.z, mx, mz, yRef)) {         // slide along walls
    if (!blocked(h.x, h.z, dx, 0, yRef)) { mx = dx; mz = 0; }
    else if (!blocked(h.x, h.z, 0, dz, yRef)) { mx = 0; mz = dz; }
    else return 0;
  }
  const g = groundAt(h.x + mx, h.z + mz, yRef);
  if (g === null) return 0;                      // no floor there: don't walk off the model
  if (g < yRef - 0.6) return 0;     // a drop (pool water, void, balcony edge): stop at the edge
  floorY = g;
  player.position.x += mx; player.position.z += mz;
  return Math.hypot(mx, mz);
}

// Stairs glide: the floor height is averaged over ±0.4 m along the walking
// direction (tent-weighted), which turns a staircase into a smooth slope.
const lastDir = new THREE.Vector2(0, -1);
const GLIDE = [-0.4, -0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3, 0.4];
function floorTarget() {
  const h = headWorld();
  const y = floorY ?? player.position.y;    // the step you stand on (eye height lags on stairs)
  const g0 = groundAt(h.x, h.z, y); if (g0 === null) return y;
  let sum = 0, wsum = 0;
  for (const o of GLIDE) {
    const g = o === 0 ? g0 : groundAt(h.x + lastDir.x * o, h.z + lastDir.y * o, y);
    const w = 0.5 - Math.abs(o);                 // nearer samples count more
    if (g !== null && Math.abs(g - g0) < 0.6) { sum += g * w; wsum += w; }
  }
  return sum / wsum;
}

function placeAt(x, y, z, yaw) {   // put the head above (x,z) standing on y
  player.rotation.y = yaw;
  player.position.set(x, y, z); player.updateMatrixWorld(true);
  const h = headWorld();
  player.position.x += x - h.x; player.position.z += z - h.z;
  vel.set(0, 0); turnRate = 0;
}

function turnAround(a) {            // rotate the player about the head
  const before = headWorld().clone();
  player.rotation.y += a; player.updateMatrixWorld(true);
  const after = headWorld();
  player.position.x += before.x - after.x; player.position.z += before.z - after.z;
}

// ---------- rooms (x, floor y, z, facing° ; model metres) ----------
let SPOTS = [   // fallback only; each type loads data/<rev>/spots.json
  { ar: 'المجلس', en: 'Majlis', x: 46.4, y: 0, z: 3.4, yaw: 60 },
  { ar: 'غرفة الطعام', en: 'Dining', x: 39.8, y: 0, z: 4.6, yaw: 25 },
  { ar: 'الصالة', en: 'Living hall', x: 39.6, y: 0, z: -2.6, yaw: 0 },
  { ar: 'المطبخ والجلسة', en: 'Kitchen & family', x: 50.6, y: 0, z: -11.2, yaw: -45 },
  { ar: 'الكراج', en: 'Garage', x: 53.5, y: 0, z: -0.8, yaw: 180 },
  { ar: 'غرفة النوم الرئيسية', en: 'Master bedroom', x: 52.5, y: 4, z: -11.0, yaw: 0 },
  { ar: 'غرفة نوم ١', en: 'Bedroom 1', x: 41.6, y: 4, z: 3.2, yaw: -45 },
  { ar: 'غرفة نوم ٢', en: 'Bedroom 2', x: 50.5, y: 4, z: 4.4, yaw: 32 },
];
let spawn, spotIdx = 0;
// a spot from the plan is the room's centre, which can be a table, a bed or pool water:
// look outwards in rings for clear floor at the room's level with nothing at head height
function clearFloor(s) {
  const top = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (let r = 0; r <= 3.0; r += 0.25) {
    const n = r === 0 ? 1 : Math.max(8, Math.round(r * 10));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
      const h = cast(top.set(x, s.y + 1.9, z), DOWN, 2.6);          // first thing below head height
      if (!h || Math.abs(h.point.y - s.y) > 0.12) continue;          // furniture, water or a hole
      if (cast(top.set(x, s.y + 0.3, z), up, 1.7)) continue;         // something overhead (bed canopy, stair)
      let near = false;                                              // keep a body's width from walls
      for (let k = 0; k < 8 && !near; k++) {
        const b = (k / 8) * Math.PI * 2;
        near = !!cast(top.set(x, s.y + 1.0, z), _d.set(Math.cos(b), 0, Math.sin(b)), RADIUS + 0.1);
      }
      if (!near) return { x, z };
    }
  }
  return { x: s.x, z: s.z };
}
// spots made from the plans have no view direction (yaw 0): face the most open way instead
const _yo = new THREE.Vector3(), _yd = new THREE.Vector3();
function openYaw(x, y, z) {
  const N = 24, dist = [];
  _yo.set(x, y + EYE, z);
  for (let i = 0; i < N; i++) {
    const a = i / N * Math.PI * 2;
    _yd.set(-Math.sin(a), 0, -Math.cos(a));
    const h = cast(_yo, _yd, 40); dist.push(h ? h.distance : 40);
  }
  let best = 0, bv = -1;   // smooth over neighbours so a door gap does not win over a room
  for (let i = 0; i < N; i++) {
    const v = dist[(i + N - 1) % N] + 2 * dist[i] + dist[(i + 1) % N];
    if (v > bv) { bv = v; best = i; }
  }
  return best / N * Math.PI * 2;
}
function goTo(s) {
  const c = clearFloor(s);
  const yaw = s.yaw ? THREE.MathUtils.degToRad(s.yaw) : openYaw(c.x, s.y, c.z);
  placeAt(c.x, s.y, c.z, yaw);
  const g = groundAt(c.x, c.z, s.y + 0.1);
  player.position.y = g ?? s.y;
  floorY = player.position.y;
}
function computeSpawn() {
  const q = new URLSearchParams(location.search).get('at');
  if (q) { const [x, y, z, yaw] = q.split(',').map(Number); return { x, y, z, yaw }; }
  return SPOTS[0];
}
const goSpawn = () => { spotIdx = 0; goTo(spawn); };
const nextSpot = () => { spotIdx = (spotIdx + 1) % SPOTS.length; goTo(SPOTS[spotIdx]); };

// ---------- seated mode ----------
function applySeated() {
  if (!settings.seated) { rig.position.y = 0; return; }
  if (renderer.xr.isPresenting) {
    const headLocal = camera.position.y;                 // real head height above the floor
    rig.position.y = Math.max(0, EYE - headLocal);
  } else rig.position.y = 0;                             // desktop eye is already 1.6 m
}

// ---------- menu (Arabic + English), opened with Y (or ≡ if the browser passes it) ----------
const MW = 1024, MH = 2110;   // fits the house switch + up to 18 rooms
const mCanvas = document.createElement('canvas'); mCanvas.width = MW; mCanvas.height = MH;
const mCtx = mCanvas.getContext('2d');
const mTex = new THREE.CanvasTexture(mCanvas); mTex.colorSpace = THREE.SRGBColorSpace;
const menu = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62 * MH / MW),
  new THREE.MeshBasicMaterial({ map: mTex, transparent: true, depthTest: false, depthWrite: false }));
menu.renderOrder = 999; menu.visible = false; scene.add(menu);
let buttons = [], hoverId = null;
const AR_FONT = '"Noto Sans Arabic","Noto Naskh Arabic","Segoe UI",Tahoma,sans-serif';

function drawMenu() {
  const g = mCtx; buttons = [];
  g.clearRect(0, 0, MW, MH);
  g.fillStyle = '#ffffff'; g.strokeStyle = '#111'; g.lineWidth = 4;
  g.beginPath(); g.roundRect(4, 4, MW - 8, MH - 8, 28); g.fill(); g.stroke();
  const text = (ar, en, x, y, size, color = '#111') => {
    g.fillStyle = color; g.textAlign = 'center';
    g.font = `600 ${size}px ${AR_FONT}`; g.direction = 'rtl'; g.fillText(ar, x, y);
    g.font = `400 ${Math.round(size * 0.62)}px "Segoe UI",sans-serif`; g.direction = 'ltr';
    g.fillText(en, x, y + size * 0.85);
  };
  const button = (id, ar, en, x, y, w, h, on, size = 34) => {
    const hov = hoverId === id;
    g.fillStyle = on ? '#111' : hov ? '#e6e6e6' : '#fff';
    g.strokeStyle = '#111'; g.lineWidth = 3;
    g.beginPath(); g.roundRect(x, y, w, h, 14); g.fill(); g.stroke();
    text(ar, en, x + w / 2, y + h / 2 - size * 0.12, size, on ? '#fff' : '#111');
    buttons.push({ id, x, y, w, h });
  };
  text('الإعدادات', 'Settings', MW / 2, 74, 50);
  const row = (y, ar, en, opts, key) => {
    text(ar, en, MW / 2, y, 34, '#444');
    const w = (MW - 120 - (opts.length - 1) * 20) / opts.length;
    opts.forEach((o, i) => button(`${key}:${o.v}`, o.ar, o.en, MW - 60 - w - i * (w + 20), y + 50, w, 76, settings[key] === o.v));   // right-to-left
  };
  const OFF_ON = [{ v: false, ar: 'إيقاف', en: 'Off' }, { v: true, ar: 'تشغيل', en: 'On' }];
  row(170, 'التنقل', 'Moving', [{ v: 'step', ar: 'خطوات', en: 'Steps' },
    { v: 'walk', ar: 'مشي سلس', en: 'Smooth walk' }, { v: 'jump', ar: 'القفز', en: 'Jump' }], 'move');
  row(335, 'سرعة المشي', 'Walking speed', [{ v: 'slow', ar: 'بطيئة', en: 'Slow' }, { v: 'normal', ar: 'عادية', en: 'Normal' }, { v: 'fast', ar: 'سريعة', en: 'Fast' }], 'speed');
  row(500, 'الالتفاف', 'Turning', [{ v: 'soft', ar: 'متقطع ناعم', en: 'Soft snap' },
    { v: 'snap', ar: 'متقطع', en: 'Snap' }, { v: 'smooth', ar: 'سلس', en: 'Smooth' }], 'turn');
  row(665, 'الرؤية النفقية عند الحركة', 'Comfort vignette',
    [{ v: 'off', ar: 'إيقاف', en: 'Off' }, { v: 'light', ar: 'خفيفة', en: 'Light' }, { v: 'strong', ar: 'قوية', en: 'Strong' }], 'tunnel');
  row(830, 'الألوان', 'Colours', [{ v: 'soft', ar: 'هادئة', en: 'Soft' }, { v: 'bright', ar: 'ساطعة', en: 'Bright' }], 'colours');
  // on/off extras as toggle buttons (black = on)
  text('إضافات (اضغط للتشغيل/الإيقاف)', 'Extras (tap to switch on/off)', MW / 2, 995, 34, '#444');
  const tw = (MW - 120 - 40) / 3;
  [['ring', 'حلقة الأرض', 'Floor ring'], ['seated', 'وضع الجلوس', 'Seated mode'], ['meter', 'عداد الإطارات', 'Frame meter']]
    .forEach(([k, ar, en], i) => button(`tog:${k}`, ar, en, MW - 60 - tw - i * (tw + 20), 1045, tw, 76, !!settings[k], 30));
  text('الخيار', 'House option', MW / 2, 1183, 34, '#444');
  const yw = (MW - 120 - 40) / 3;
  Object.entries(TYPES).forEach(([k, t], i) =>
    button(`type:${k}`, `${t.ar} · ${t.rev}`, t.en, MW - 60 - yw - i * (yw + 20), 1228, yw, 76, TYPE === k, 30));
  text('الانتقال إلى غرفة', 'Go to room', MW / 2, 1360, 34, '#444');
  const cw = (MW - 120 - 20) / 2, ch = 64;
  SPOTS.forEach((s, i) => {
    const c = i % 2, r = (i - c) / 2;      // two columns, Arabic reading order: right column first
    button(`room:${i}`, s.ar, s.en, MW - 60 - cw - c * (cw + 20), 1402 + r * (ch + 12), cw, ch, spotIdx === i, 24);
  });
  mTex.needsUpdate = true;
}

// The menu follows you: it stays in front at chest height, and when you turn or
// move away it slides back in front (lazy follow, so small head moves don't drag it).
const MENU_DIST = 0.8, MENU_DROP = 0.32;
const _mt = new THREE.Vector3(), _mf = new THREE.Vector3(), _mh = new THREE.Vector3();
let menuFollowing = false;
function menuTarget(out) {
  const h = headWorld(); camera.getWorldDirection(_mf); _mf.y = 0;
  if (_mf.lengthSq() < 1e-6) _mf.set(0, 0, -1); _mf.normalize();
  return out.set(h.x + _mf.x * MENU_DIST, h.y - MENU_DROP, h.z + _mf.z * MENU_DIST);
}
function faceMenu() { const h = headWorld(); menu.lookAt(h.x, h.y - 0.1, h.z); }
function followMenu(dt) {
  if (!menu.visible) return;
  menuTarget(_mt);
  _mh.copy(menu.position).sub(headWorld()); _mh.y = 0; _mh.normalize();
  const off = Math.acos(THREE.MathUtils.clamp(_mh.dot(_mf), -1, 1));   // angle away from your view
  const far = menu.position.distanceTo(_mt);
  if (off > THREE.MathUtils.degToRad(22) || far > 0.35) menuFollowing = true;
  if (menuFollowing) {
    menu.position.lerp(_mt, Math.min(1, dt * 5));
    if (menu.position.distanceTo(_mt) < 0.02) menuFollowing = false;
  }
  faceMenu();
}
function openMenu() {
  drawMenu();
  menuTarget(menu.position); faceMenu(); menuFollowing = false;
  menu.visible = true;
  if (document.pointerLockElement) document.exitPointerLock();
}
function closeMenu() { menu.visible = false; hoverId = null; pointerLine.visible = false; }
const toggleMenu = () => (menu.visible ? closeMenu() : openMenu());

function menuHit(raycaster) {
  const hit = raycaster.intersectObject(menu, false)[0];
  if (!hit) return null;
  const px = hit.uv.x * MW, py = (1 - hit.uv.y) * MH;
  const b = buttons.find(b => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h);
  return { point: hit.point, id: b ? b.id : null };
}
function pressMenu(id) {
  if (!id) return;
  let [k, v] = id.split(':');
  if (k === 'room') { closeMenu(); spotIdx = +v; goTo(SPOTS[spotIdx]); return; }
  if (k === 'type') {                       // another house: reload the page with it (keeps settings)
    if (v !== TYPE) { const u = new URL(location.href); u.searchParams.set('type', v); u.searchParams.delete('at'); location.href = u; }
    return;
  }
  if (k === 'tog') { k = v; settings[k] = !settings[k]; }
  else settings[k] = v === 'true' ? true : v === 'false' ? false : v;
  saveSettings(); if (k === 'seated') applySeated();
  if (k === 'colours') applyPalette();
  if (k === 'meter') { meter.visible = settings.meter; if (meter.visible) drawMeter(); }
  drawMenu();
}
function setHover(id) { if (id !== hoverId) { hoverId = id; drawMenu(); } }

// pointer ray from the right controller (only while the menu is open)
const pointerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
const pointerLine = new THREE.Line(pointerGeo, new THREE.LineBasicMaterial({ color: 0x000000, depthTest: false }));
pointerLine.renderOrder = 1001; pointerLine.visible = false; pointerLine.frustumCulled = false; scene.add(pointerLine);

// ---------- desktop controls ----------
const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyR') goSpawn();
  if (e.code === 'KeyN') nextSpot();
  if (e.code === 'KeyM' || e.code === 'Escape' && menu.visible) toggleMenu();
});
addEventListener('keyup', e => { keys[e.code] = false; });
const mouseRay = new THREE.Raycaster(), mouseNdc = new THREE.Vector2();
renderer.domElement.addEventListener('click', e => {
  if (renderer.xr.isPresenting) return;
  if (menu.visible) {
    mouseNdc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    mouseRay.setFromCamera(mouseNdc, camera);
    const h = menuHit(mouseRay); if (h) pressMenu(h.id);
    return;
  }
  Promise.resolve(renderer.domElement.requestPointerLock?.()).catch(() => {});
});
addEventListener('mousemove', e => {
  if (menu.visible && !renderer.xr.isPresenting) {
    mouseNdc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    mouseRay.setFromCamera(mouseNdc, camera); setHover(menuHit(mouseRay)?.id ?? null); return;
  }
  if (document.pointerLockElement !== renderer.domElement) return;
  player.rotation.y -= e.movementX * 0.0022;
  camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - e.movementY * 0.0022, -1.45, 1.45);
});

// ---------- XR controllers ----------
const hands = { left: null, right: null };
const ctrlGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -0.12)]);
for (let i = 0; i < 2; i++) {
  const c = renderer.xr.getController(i);
  c.add(new THREE.Line(ctrlGeo, lineMat));
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  c.add(tip);
  c.addEventListener('connected', e => {
    c.userData.src = e.data; hands[e.data.handedness] = c;
    if (e.data.handedness === 'left') { c.add(meter); meter.visible = settings.meter; drawMeter(); }
  });
  c.addEventListener('disconnected', () => { for (const k in hands) if (hands[k] === c) hands[k] = null; });
  rig.add(c);
}
renderer.xr.addEventListener('sessionstart', () => {
  camera.rotation.set(0, 0, 0); camera.position.set(0, 0, 0);
  setTimeout(applySeated, 600);              // wait for a real head pose
});
renderer.xr.addEventListener('sessionend', () => { camera.position.set(0, EYE, 0); rig.position.y = 0; closeMenu(); });

// teleport arc
const ARC_N = 48;
const arcGeo = new THREE.BufferGeometry();
arcGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARC_N * 3), 3));
const arcLine = new THREE.Line(arcGeo, new THREE.LineDashedMaterial({ color: 0x000000, dashSize: 0.08, gapSize: 0.05 }));
arcLine.frustumCulled = false; arcLine.visible = false; scene.add(arcLine);
const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.27, 40).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide }));
ring.visible = false; scene.add(ring);
let tpTarget = null;

const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _v = new THREE.Vector3(), _seg = new THREE.Vector3();
function updateArc(ctrl) {
  ctrl.getWorldPosition(_p);
  _v.set(0, 0, -1).applyQuaternion(ctrl.getWorldQuaternion(new THREE.Quaternion())).multiplyScalar(7);
  const pos = arcGeo.attributes.position; tpTarget = null;
  let n = 0; pos.setXYZ(n++, _p.x, _p.y, _p.z);
  const dt = 0.035;
  for (; n < ARC_N; n++) {
    _q.copy(_p).addScaledVector(_v, dt); _q.y -= 4.9 * dt * dt; _v.y -= 9.8 * dt;
    _seg.subVectors(_q, _p); const len = _seg.length();
    const hit = cast(_p, _seg.normalize(), len);
    if (hit) {
      pos.setXYZ(n, hit.point.x, hit.point.y, hit.point.z); n++;
      const nrm = hit.face ? Math.abs(hit.face.normal.y) : 0;
      if (nrm > 0.75) tpTarget = hit.point.clone();
      break;
    }
    pos.setXYZ(n, _q.x, _q.y, _q.z); _p.copy(_q);
  }
  for (let k = n; k < ARC_N; k++) pos.setXYZ(k, pos.getX(n - 1), pos.getY(n - 1), pos.getZ(n - 1));
  pos.needsUpdate = true; arcLine.computeLineDistances();
  arcLine.visible = true;
  ring.visible = !!tpTarget; if (tpTarget) ring.position.copy(tpTarget).y += 0.01;
}

// ---------- locomotion state ----------
const vel = new THREE.Vector2();          // world x,z m/s, eased
let turnRate = 0;                          // rad/s, eased (smooth turning)
const wish = new THREE.Vector2();          // desired velocity this frame
let wishTurn = 0;                          // desired turn rate this frame

const curve = (v, dead = 0.15) => {        // stick deadzone + gentle response
  const a = Math.abs(v); if (a < dead) return 0;
  return Math.sign(v) * Math.pow((a - dead) / (1 - dead), 1.5);
};

const prev = { trig: false, a: false, b: false, x: false, y: false, menu: false, snap: 0 };
const menuRay = new THREE.Raycaster();
let holdTrig = false;                      // ignore the trigger until released after a menu click
const _cq = new THREE.Quaternion(), _cp = new THREE.Vector3(), _cd = new THREE.Vector3();
function xrInput() {
  const L = hands.left?.userData.src?.gamepad, R = hands.right?.userData.src?.gamepad;
  const edge = (pad, i, key) => { const p = !!pad?.buttons[i]?.pressed; const e = p && !prev[key]; prev[key] = p; return e; };

  // menu: Y on the left controller (index 5); any extra left button (≡ where exposed)
  let menuPress = edge(L, 5, 'y');
  if (L) { const extra = L.buttons.slice(6).some(b => b?.pressed); if (extra && !prev.menu) menuPress = true; prev.menu = extra; }
  if (menuPress) toggleMenu();

  // menu open: point and click with the right controller (you can still move and turn)
  if (menu.visible) {
    const c = hands.right || hands.left;
    if (c) {
      c.getWorldPosition(_cp); c.getWorldQuaternion(_cq); _cd.set(0, 0, -1).applyQuaternion(_cq);
      menuRay.set(_cp, _cd);
      const h = menuHit(menuRay); setHover(h?.id ?? null);
      const end = h ? h.point : _cp.clone().addScaledVector(_cd, 1.5);
      const pa = pointerGeo.attributes.position; pa.setXYZ(0, _cp.x, _cp.y, _cp.z); pa.setXYZ(1, end.x, end.y, end.z); pa.needsUpdate = true;
      pointerLine.visible = true;
      const pad = c === hands.right ? R : L;
      if (edge(pad, 0, 'mtrig') && h?.id) { pressMenu(h.id); holdTrig = true; }
    }
  } else pointerLine.visible = false;

  const lx = L?.axes[2] || 0, ly = L?.axes[3] || 0, rx = R?.axes[2] || 0, ry = R?.axes[3] || 0;

  // left stick: step walking (default) or smooth walking (menu)
  wish.set(0, 0); stepWish.set(0, 0);
  if ((settings.move === 'walk' || settings.move === 'step') && L) {
    let ax = curve(lx), ay = curve(ly);
    if (settings.move === 'step') {          // steps: direction only, no slow creeping
      if (Math.hypot(lx, ly) < 0.4) ax = ay = 0;
      else { const m = Math.hypot(lx, ly); ax = lx / m; ay = ly / m; }
    }
    if (ax || ay) {
      const n = Math.hypot(ax, ay); if (n > 1) { ax /= n; ay /= n; }
      ax *= SIDE_FACTOR; if (ay > 0) ay *= BACK_FACTOR;          // forward full, other ways half
      const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
      const dx = fwd.x * -ay + -fwd.z * ax, dz = fwd.z * -ay + fwd.x * ax;
      if (settings.move === 'step') stepWish.set(dx, dz); else wish.set(dx, dz).multiplyScalar(walkSpeed());
    }
  }

  // jumping: push a stick forward to aim (left stick in Jump mode, right stick always),
  // or hold the right trigger; let go to jump to the ring
  const rightAim = R && ry < -0.6 && Math.abs(rx) < 0.5;
  const trig = !!R?.buttons[0]?.pressed;
  if (holdTrig && !trig) holdTrig = false;            // the click that chose something in the menu
  let want = null;
  if (settings.move === 'jump' && L && ly < -0.6) want = hands.left;
  else if (rightAim) want = hands.right;
  else if (trig && !holdTrig && !menu.visible) want = hands.right;
  if (want) { updateArc(want); aiming = true; }
  else if (aiming) {
    aiming = false; arcLine.visible = ring.visible = false;
    if (tpTarget) { placeAt(tpTarget.x, tpTarget.y, tpTarget.z, player.rotation.y); player.position.y = tpTarget.y; floorY = tpTarget.y; }
    tpTarget = null;
  }

  // turning: right stick left/right (not while the right stick is aiming a jump)
  wishTurn = 0;
  if (R && !rightAim) {
    if (settings.turn === 'smooth') wishTurn = -curve(rx) * TURN_MAX;
    else {
      const s = rx > 0.7 ? 1 : rx < -0.7 ? -1 : 0;
      if (s && !prev.snap) settings.turn === 'soft' ? startSoftSnap(-s) : turnAround(-s * SNAP);
      prev.snap = s;
    }
  }

  if (edge(L, 4, 'x')) goSpawn();
  if (edge(R, 4, 'a')) goSpawn();
  if (edge(R, 5, 'b')) nextSpot();
}
let aiming = false;

const joy = { f: 0, s: 0 };                 // on-screen stick (phones), -1..1
function desktopInput() {
  wish.set(0, 0); wishTurn = 0;
  let f = joy.f, s = joy.s;
  if (keys.KeyW || keys.ArrowUp) f += 1; if (keys.KeyS || keys.ArrowDown) f -= 1;
  if (keys.KeyD) s += 1; if (keys.KeyA) s -= 1;
  if (keys.KeyQ || keys.ArrowLeft) wishTurn += TURN_MAX;
  if (keys.KeyE || keys.ArrowRight) wishTurn -= TURN_MAX;
  const n = Math.hypot(f, s);
  if (n < 0.08) return;
  const k = Math.min(1, n) * walkSpeed();       // a half-pushed stick walks at half speed
  const yaw = player.rotation.y, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  wish.set((fx * f + -fz * s) / n * k, (fz * f + fx * s) / n * k);
}

// ---------- on-screen controls: drag to look, stick to walk, buttons to jump between rooms ----------
const ui = document.getElementById('ui');
function setupScreenUI() {
  const $ = id => document.getElementById(id);
  const roomBtn = $('room'), sheet = $('sheet'), tip = $('tip');
  $('types').innerHTML = Object.entries(TYPES).map(([k, t]) =>
    `<button data-type="${k}" class="${k === TYPE ? 'on' : ''}">${t.en} · ${t.rev}</button>`).join('');
  $('types').addEventListener('click', e => { const b = e.target.closest('[data-type]'); if (b) pressMenu('type:' + b.dataset.type); });
  let shown = -1;
  const label = () => {
    if (shown === spotIdx) return; shown = spotIdx;
    const sp = SPOTS[spotIdx] || {};
    roomBtn.querySelector('.ar').textContent = sp.ar || ''; roomBtn.querySelector('.en').textContent = `${spotIdx + 1} / ${SPOTS.length} · ${sp.en || ''}`;
    sheet.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i === spotIdx));
  };
  const jump = i => { spotIdx = (i + SPOTS.length) % SPOTS.length; goTo(SPOTS[spotIdx]); camera.rotation.x = 0; sheet.hidden = true; label(); };
  sheet.innerHTML = SPOTS.map((sp, i) => `<button data-i="${i}"><span class="en">${i + 1} · ${sp.en}</span><span class="ar">${sp.ar}</span></button>`).join('');
  sheet.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) jump(+b.dataset.i); });
  roomBtn.addEventListener('click', () => { sheet.hidden = !sheet.hidden; });
  $('prev').addEventListener('click', () => jump(spotIdx - 1));
  $('next').addEventListener('click', () => jump(spotIdx + 1));
  setInterval(label, 300);                     // also follows N / the headset menu
  label();

  // drag on the view to look around (finger or pen; the mouse keeps click-to-look)
  const cv = renderer.domElement;
  let drag = null;
  cv.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' || renderer.xr.isPresenting) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    sheet.hidden = true; tip.style.opacity = 0;
  });
  cv.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const k = 0.0045;                                        // rad per pixel
    player.rotation.y += (e.clientX - drag.x) * k;          // drag the scene: right swipe turns you left
    camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x + (e.clientY - drag.y) * k, -1.3, 1.3);
    drag.x = e.clientX; drag.y = e.clientY;
  });
  const endDrag = e => { if (drag && e.pointerId === drag.id) drag = null; };
  cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);

  // thumb stick to walk
  const pad = $('joy'), knob = pad.querySelector('i');
  let jid = null;
  const moveStick = e => {
    const r = pad.getBoundingClientRect(), R = r.width / 2;
    let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R);
    const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    joy.s = dx / R; joy.f = -dy / R;
  };
  const release = () => { jid = null; joy.f = joy.s = 0; knob.style.transform = ''; };
  // Fingers: touch events, tracked on the whole window by the finger's id, so the stick keeps
  // following a thumb that slides off the circle and always lets go when it lifts (pointer
  // capture on phones can lose the finger and leave the stick stuck).
  const findTouch = list => { for (const t of list) if (t.identifier === jid) return t; return null; };
  pad.addEventListener('touchstart', e => {
    e.preventDefault();
    if (jid !== null) return;
    const t = e.changedTouches[0]; jid = t.identifier;
    moveStick(t); tip.style.opacity = 0; sheet.hidden = true;
  }, { passive: false });
  addEventListener('touchmove', e => { const t = jid !== null && findTouch(e.changedTouches); if (t) { e.preventDefault(); moveStick(t); } }, { passive: false });
  const touchEnd = e => { if (jid !== null && (findTouch(e.changedTouches) || !findTouch(e.touches))) release(); };
  addEventListener('touchend', touchEnd); addEventListener('touchcancel', touchEnd);
  // Mouse / pen: pointer events on the window
  pad.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') return;
    jid = 'p' + e.pointerId; moveStick(e); tip.style.opacity = 0; sheet.hidden = true; e.preventDefault();
  });
  addEventListener('pointermove', e => { if (jid === 'p' + e.pointerId) moveStick(e); });
  const ptrEnd = e => { if (jid === 'p' + e.pointerId) release(); };
  addEventListener('pointerup', ptrEnd); addEventListener('pointercancel', ptrEnd);
  // never stay walking when the page loses focus
  addEventListener('blur', release);
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
  pad.addEventListener('contextmenu', e => e.preventDefault());

  setTimeout(() => { tip.style.opacity = 0; }, 6000);
  ui.hidden = false;
  renderer.xr.addEventListener('sessionstart', () => { ui.hidden = true; });
  renderer.xr.addEventListener('sessionend', () => { ui.hidden = false; });
}

// ---------- loop ----------
const clock = new THREE.Clock();
let lastY = 0;
function step(dt) {
  // eased walking
  vel.lerp(wish, Math.min(1, dt / ACCEL_TAU));
  if (vel.lengthSq() < 1e-5 && wish.lengthSq() === 0) vel.set(0, 0);
  const sp = vel.length();
  if (sp > 0.05) lastDir.copy(vel).divideScalar(sp);
  if (sp > 0) { const moved = walk(vel.x * dt, vel.y * dt); if (moved === 0) vel.multiplyScalar(0.5); }
  // eased smooth turning
  turnRate += (wishTurn - turnRate) * Math.min(1, dt / TURN_TAU);
  if (Math.abs(turnRate) < 1e-3 && wishTurn === 0) turnRate = 0;
  if (turnRate) turnAround(turnRate * dt);
  updateSoftSnap(dt);
  updateSteps(dt);
  tunnelMat.uniforms.uBlink.value = Math.max(softBlink, stepBlink);
  // stairs glide
  const ty = floorTarget();
  player.position.y += (ty - player.position.y) * Math.min(1, dt / 0.18);
  const vy = Math.abs(player.position.y - lastY) / Math.max(dt, 1e-3); lastY = player.position.y;
  // tunnel vision follows any artificial motion
  const motion = Math.min(1, Math.max(sp / walkSpeed(), Math.abs(turnRate) / TURN_MAX * 1.2, vy / 0.5));
  updateTunnel(motion, dt);
  updateRing(Math.min(1, Math.max(sp / walkSpeed(), vy / 0.5, stepWish.lengthSq() > 0 ? 1 : 0)), dt);
  followMenu(dt);
}
function frame(time) {
  frameStats(time);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (renderer.xr.isPresenting) xrInput(); else desktopInput();
  step(dt);
  renderer.render(scene, camera);
}

load().then(() => {
  spawn = computeSpawn(); goTo(spawn); lastY = player.position.y;
  document.getElementById('load').remove();
  const vrb = VRButton.createButton(renderer, { optionalFeatures: ['local-floor'] });
  document.body.appendChild(vrb);
  setTimeout(() => { if (!/ENTER VR|EXIT VR/i.test(vrb.textContent)) vrb.remove(); }, 2500);   // phones without VR
  setupScreenUI();
  renderer.setAnimationLoop(frame);
  window.tour = { THREE, scene, player, camera, renderer, meta, settings, get SPOTS() { return SPOTS; }, TYPE, clearFloor, goTo, placeAt, setFloorY: v => { floorY = v; }, getFloorY: () => floorY, groundAt, colliders, cast,
    walk, headWorld, step, wish, vel, setWishTurn: v => { wishTurn = v; }, openMenu, closeMenu, pressMenu, menu, tunnelMat, startSoftSnap, turnAround, xrInput, hands, rig, fps, frameStats, drawMeter, meter, applyPalette };
}).catch(e => { msg.textContent = 'Could not load the model: ' + e.message; console.error(e); });
