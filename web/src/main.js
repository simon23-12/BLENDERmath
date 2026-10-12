import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as G from './geo.js';
import { SCENARIOS } from './scenarios.js';

const $ = (id) => document.getElementById(id);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const COARSE = matchMedia('(pointer: coarse)').matches;
const LOW = COARSE || Math.min(innerWidth, innerHeight) < 600;
const isPhone = () => innerWidth <= 820 || innerHeight <= 500;

// math coordinates (x1|x2|x3) → three.js: x1 to the viewer (+z), x2 right (+x), x3 up (+y)
const W = (p) => new THREE.Vector3(p[1], p[2], p[0]);
const M = (v) => [v.z, v.x, v.y];
const AXIS_COL = ['#ff8f6b', '#5fb6ff', '#8be08a'];
const PALETTE = ['#7c9cff', '#ff7a59', '#5ad1c8', '#ffd166', '#c58bff', '#7fbf6a', '#ff6fa8', '#4db3ff'];
const SPEED_STEP = 9; // seconds per scenario step when playing

// ---------------------------------------------------------------- renderer / scene
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
let pixelRatio = Math.min(devicePixelRatio, LOW ? 1.5 : 2);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#060c18');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;
scene.add(new THREE.HemisphereLight(0xdbe6ff, 0x1a1420, 0.7));
const key = new THREE.DirectionalLight(0xfff3e6, 2.0);
key.position.set(8, 16, 10);
scene.add(key);
const rim = new THREE.DirectionalLight(0x8fb8ff, 0.8);
rim.position.set(-10, 6, -12);
scene.add(rim);

const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.05, 500);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.zoomToCursor = !COARSE;
controls.minDistance = 2;
controls.maxDistance = 120;
controls.screenSpacePanning = true;

const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: LOW ? 2 : 4 });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(pixelRatio);
composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.22, 0.45, 0.92));
composer.addPass(new OutputPass());

const axesGroup = new THREE.Group(), objGroup = new THREE.Group(), helperGroup = new THREE.Group(), modelGroup = new THREE.Group();
scene.add(axesGroup, objGroup, helperGroup, modelGroup);

// ---------------------------------------------------------------- state
const S = {
  list: [], byName: new Map(), sel: null, sel2: null,
  range: 6, grid: true, guides: true, labels: true, view: 'schraeg',
  t: 0, r: 0, s: 0, playing: false, pdir: 1,
  scenario: null, step: 0, time: 0, workshop: null,
  flight: null, colorIdx: 0,
};
const parseCtx = { get: (n) => S.byName.get(n)?.o };
let TPL = null;   // geometries from Blender
const MODELS = {};

// ---------------------------------------------------------------- labels (HTML overlay)
const labelHost = $('labels');
const LABELS = [];
function makeLabel(text, cls = '', color = null) {
  const el = document.createElement('div');
  el.className = 'mlabel ' + cls;
  el.textContent = text;
  if (color) el.style.setProperty('--c', color);
  labelHost.appendChild(el);
  const L = { el, pos: new THREE.Vector3(), off: [8, -10] };
  LABELS.push(L);
  return L;
}
function dropLabel(L) {
  L.el.remove();
  const i = LABELS.indexOf(L);
  if (i >= 0) LABELS.splice(i, 1);
}
const _p = new THREE.Vector3();
const PRIO = (L) => (L.el.classList.contains('tick') ? 3 : L.el.classList.contains('axis') ? 0 : L.el.classList.contains('small') ? 2 : 1);
function updateLabels() {
  const w = innerWidth, h = innerHeight;
  const placed = [];
  const order = [...LABELS].sort((a, b) => PRIO(a) - PRIO(b));
  for (const L of order) {
    _p.copy(L.pos).project(camera);
    const off = _p.z > 1 || Math.abs(_p.x) > 1.05 || Math.abs(_p.y) > 1.05;
    let gone = off || !!L.hidden;
    if (!gone) {
      const x = ((_p.x + 1) / 2) * w + L.off[0], y = ((1 - _p.y) / 2) * h + L.off[1];
      if (!L.w) { L.w = L.el.offsetWidth || 40; L.h = L.el.offsetHeight || 16; }
      const r = [x, y, x + L.w, y + L.h];
      // hide labels that would overlap one with a higher priority (object names beat helper labels beat ticks)
      if (S.labels && placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) gone = true;
      else placed.push(r);
      L.el.style.transform = `translate(${x}px, ${y}px)`;
    }
    L.el.classList.toggle('gone', gone);
  }
}

// ---------------------------------------------------------------- primitives
const _up = new THREE.Vector3(0, 1, 0);
function cylinder(a, b, r, mat) {
  const d = new THREE.Vector3().subVectors(b, a);
  const L = d.length();
  const m = new THREE.Mesh(TPL.shaft, mat);
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(_up, d.clone().normalize());
  m.scale.set(r, Math.max(L, 1e-4), r);
  return m;
}
function arrow(a, b, r, mat, headR = r * 3.2, headL = r * 9) {
  const g = new THREE.Group();
  const d = new THREE.Vector3().subVectors(b, a);
  const L = d.length();
  if (L < 1e-6) return g;
  const dir = d.clone().normalize();
  const hl = Math.min(headL, L * 0.45);
  g.add(cylinder(a, a.clone().addScaledVector(dir, L - hl), r, mat));
  const head = new THREE.Mesh(TPL.head, mat);
  head.position.copy(a).addScaledVector(dir, L - hl);
  head.quaternion.setFromUnitVectors(_up, dir);
  head.scale.set(headR, hl, headR);
  g.add(head);
  return g;
}
function sphere(p, r, mat) {
  const m = new THREE.Mesh(TPL.point, mat);
  m.position.copy(p);
  m.scale.setScalar(r);
  return m;
}
function dashed(a, b, r, mat, dash = 0.22) {
  const g = new THREE.Group();
  const d = new THREE.Vector3().subVectors(b, a);
  const L = d.length();
  const n = Math.max(1, Math.floor(L / (dash * 2)));
  for (let i = 0; i < n; i++) {
    const s0 = (i * 2 * dash) / L, s1 = Math.min(1, ((i * 2 + 1) * dash) / L);
    g.add(cylinder(a.clone().lerp(b, s0), a.clone().lerp(b, s1), r, mat));
  }
  return g;
}
const matCache = new Map();
function solid(color, emissive = 0.18) {
  const k = color + emissive;
  if (!matCache.has(k)) {
    const c = new THREE.Color(color);
    matCache.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.1, emissive: c, emissiveIntensity: emissive }));
  }
  return matCache.get(k);
}

// clip the parameter range of a line to the view box [-R, R]^3
function clipLine(p, u, R) {
  let t0 = -Infinity, t1 = Infinity;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(u[k]) < 1e-12) { if (Math.abs(p[k]) > R) return null; continue; }
    let a = (-R - p[k]) / u[k], b = (R - p[k]) / u[k];
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
  }
  return t0 < t1 ? [t0, t1] : null;
}
// polygon of a plane inside the cube [-R, R]^3 (math coordinates)
function clipPlane(n, d, R) {
  const C = [];
  for (const x of [-R, R]) for (const y of [-R, R]) for (const z of [-R, R]) C.push([x, y, z]);
  const E = [];
  for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) {
    const diff = C[i].filter((v, k) => v !== C[j][k]).length;
    if (diff === 1) E.push([C[i], C[j]]);
  }
  const pts = [];
  for (const [a, b] of E) {
    const fa = G.dot(n, a) - d, fb = G.dot(n, b) - d;
    if ((fa <= 0 && fb >= 0) || (fa >= 0 && fb <= 0)) {
      if (Math.abs(fa - fb) < 1e-12) continue;
      const t = fa / (fa - fb);
      const p = G.add(a, G.mul(G.sub(b, a), t));
      if (!pts.some((q) => G.len(G.sub(q, p)) < 1e-6)) pts.push(p);
    }
  }
  if (pts.length < 3) return null;
  const c = G.mul(pts.reduce((s, p) => G.add(s, p), [0, 0, 0]), 1 / pts.length);
  const nn = G.mul(n, 1 / G.len(n));
  let e1 = G.cross(nn, Math.abs(nn[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]);
  e1 = G.mul(e1, 1 / G.len(e1));
  const e2 = G.cross(nn, e1);
  pts.sort((a, b) => Math.atan2(G.dot(G.sub(a, c), e2), G.dot(G.sub(a, c), e1)) - Math.atan2(G.dot(G.sub(b, c), e2), G.dot(G.sub(b, c), e1)));
  return { pts, c };
}

// ---------------------------------------------------------------- coordinate system
let axisLabels = [];
function buildAxes() {
  for (const L of axisLabels) dropLabel(L);
  axisLabels = [];
  axesGroup.clear();
  const R = S.range, s = R / 6;
  const step = R > 8 ? 2 : 1;
  for (let k = 0; k < 3; k++) {
    const dir = [0, 0, 0];
    dir[k] = 1;
    const mat = solid(AXIS_COL[k], 0.35);
    const a = W(G.mul(dir, -R)), b = W(G.mul(dir, R + 0.9 * s));
    axesGroup.add(arrow(a, b, 0.022 * s, mat, 0.085 * s, 0.32 * s));
    for (let i = -R; i <= R; i += step) {
      if (i === 0) continue;
      axesGroup.add(sphere(W(G.mul(dir, i)), 0.04 * s, mat));
      const L = makeLabel(String(i).replace('-', '−'), 'tick');
      L.pos.copy(W(G.mul(dir, i)));
      L.off = k === 2 ? [8, -7] : [-4, 6];
      axisLabels.push(L);
    }
    const La = makeLabel(['x₁', 'x₂', 'x₃'][k], 'axis', AXIS_COL[k]);
    La.pos.copy(W(G.mul(dir, R + 1.15 * s)));
    La.off = [-6, -12];
    axisLabels.push(La);
  }
  axesGroup.add(sphere(new THREE.Vector3(), 0.06 * s, solid('#e8eefc', 0.4)));
  // grid in the x1x2 plane
  const pos = [];
  for (let i = -R; i <= R; i += step) {
    if (i === 0) continue;
    pos.push(...W([i, -R, 0]).toArray(), ...W([i, R, 0]).toArray(), ...W([-R, i, 0]).toArray(), ...W([R, i, 0]).toArray());
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const grid = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x7c9cff, transparent: true, opacity: 0.16, depthWrite: false }));
  grid.name = 'grid';
  grid.visible = S.grid;
  axesGroup.add(grid);
  $('rRange').textContent = '±' + R;
}

// ---------------------------------------------------------------- objects
function nextColor() { return PALETTE[S.colorIdx++ % PALETTE.length]; }
function addObject(src, color = null, { select = false, quiet = false } = {}) {
  const o = G.parseStatement(src, parseCtx);
  const old = S.byName.get(o.name);
  const e = { o, src, color: color || old?.color || nextColor(), visible: true, group: new THREE.Group(), labels: [] };
  if (old) removeObject(o.name, true);
  S.list.push(e);
  S.byName.set(o.name, e);
  objGroup.add(e.group);
  buildVisual(e);
  if (!quiet) { renderList(); save(); }
  if (select) selectObj(o.name);
  return e;
}
function removeObject(name, keepSel = false) {
  const e = S.byName.get(name);
  if (!e) return;
  objGroup.remove(e.group);
  for (const L of e.labels) dropLabel(L);
  S.list.splice(S.list.indexOf(e), 1);
  S.byName.delete(name);
  if (!keepSel) {
    if (S.sel === name) S.sel = null;
    if (S.sel2 === name) S.sel2 = null;
  }
}
function buildVisual(e) {
  e.group.clear();
  for (const L of e.labels) dropLabel(L);
  e.labels = [];
  const o = e.o, R = S.range, s = R / 6;
  const mat = solid(e.color);
  const tag = (m) => { m.traverse((c) => { if (c.isMesh) c.userData.obj = o.name; }); return m; };
  const label = (text, pos, off = [10, -12]) => { const L = makeLabel(text, '', e.color); L.pos.copy(pos); L.off = off; e.labels.push(L); return L; };
  if (o.type === 'point') {
    e.group.add(tag(sphere(W(o.p), 0.11 * s, mat)));
    label(G.ptText(o.name, o.p), W(o.p));
  } else if (o.type === 'vector') {
    const a = o.from || [0, 0, 0];
    e.group.add(tag(arrow(W(a), W(G.add(a, o.v)), 0.03 * s, mat, 0.1 * s, 0.34 * s)));
    label(o.name + '⃗', W(G.add(a, G.mul(o.v, 0.55))), [8, -18]);
  } else if (o.type === 'line') {
    const c = clipLine(o.p, o.u, R);
    if (c) {
      const A = G.lineAt(o, c[0]), B = G.lineAt(o, c[1]);
      e.group.add(tag(cylinder(W(A), W(B), 0.03 * s, mat)));
      label(o.name, W(G.lineAt(o, c[0] + (c[1] - c[0]) * 0.86)), [8, -20]);
    }
  } else if (o.type === 'plane') {
    const poly = clipPlane(o.n, o.d, R);
    if (poly) {
      const pos = [];
      for (let i = 1; i < poly.pts.length - 1; i++) pos.push(...W(poly.pts[0]).toArray(), ...W(poly.pts[i]).toArray(), ...W(poly.pts[i + 1]).toArray());
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      const pm = new THREE.MeshStandardMaterial({ color: e.color, transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false, roughness: 0.6, emissive: new THREE.Color(e.color), emissiveIntensity: 0.1 });
      const mesh = new THREE.Mesh(g, pm);
      mesh.renderOrder = 2;
      e.group.add(tag(mesh));
      for (let i = 0; i < poly.pts.length; i++) e.group.add(tag(cylinder(W(poly.pts[i]), W(poly.pts[(i + 1) % poly.pts.length]), 0.014 * s, mat)));
      // label near the corner closest to the viewer's default direction
      label(o.name, W(G.add(poly.c, G.mul(G.sub(poly.pts[0], poly.c), 0.75))), [6, -14]);
    }
  }
  e.group.visible = e.visible;
}
function rebuildAll() {
  buildAxes();
  for (const e of S.list) buildVisual(e);
  updateHelpers();
}

// ---------------------------------------------------------------- helpers (analysis drawings, parameter point)
let helperLabels = [];
function updateHelpers() {
  helperGroup.clear();
  for (const L of helperLabels) dropLabel(L);
  helperLabels = [];
  const s = S.range / 6;
  const hmat = solid('#ffd166', 0.45), wmat = solid('#ffffff', 0.3);
  const lab = (text, pos, cls = 'small') => { const L = makeLabel(text, cls); L.pos.copy(pos); helperLabels.push(L); };
  const draw = (items) => {
    for (const it of items) {
      const mat = it.c === '#ffffff' ? wmat : hmat;
      if (it.k === 'pt') { helperGroup.add(sphere(W(it.p), (it.small ? 0.075 : 0.1) * s, mat)); if (it.label) lab(`${it.label}(${it.p.map(G.num).join('|')})`, W(it.p)); }
      if (it.k === 'seg') helperGroup.add(it.dashed ? dashed(W(it.a), W(it.b), 0.018 * s, mat, 0.16 * s) : cylinder(W(it.a), W(it.b), 0.022 * s, mat));
      if (it.k === 'vec') { helperGroup.add(arrow(W(it.a), W(G.add(it.a, it.v)), 0.024 * s, mat, 0.08 * s, 0.26 * s)); if (it.label) lab(it.label + '⃗', W(G.add(it.a, it.v))); }
      if (it.k === 'line') { const c = clipLine(it.p, it.u, S.range); if (c) helperGroup.add(cylinder(W(G.lineAt(it, c[0])), W(G.lineAt(it, c[1])), 0.026 * s, hmat)); }
      if (it.k === 'right') {
        const e1 = G.mul(it.d1, 1 / G.len(it.d1));
        let e2 = G.sub(it.d2, G.mul(e1, G.dot(it.d2, e1)));
        if (G.len(e2) < 1e-9) continue;
        e2 = G.mul(e2, 1 / G.len(e2));
        const q = 0.32 * s;
        const a = G.add(it.at, G.mul(e1, q)), b = G.add(G.add(it.at, G.mul(e1, q)), G.mul(e2, q)), c = G.add(it.at, G.mul(e2, q));
        helperGroup.add(cylinder(W(a), W(b), 0.012 * s, wmat), cylinder(W(b), W(c), 0.012 * s, wmat));
      }
      if (it.k === 'angle') {
        let d1 = G.mul(it.d1, 1 / G.len(it.d1)), d2 = G.mul(it.d2, 1 / G.len(it.d2));
        if (G.dot(d1, d2) < 0) d2 = G.mul(d2, -1);
        const ang = Math.acos(clamp(G.dot(d1, d2), -1, 1));
        let e2 = G.sub(d2, G.mul(d1, G.dot(d2, d1)));
        if (G.len(e2) < 1e-9) continue;
        e2 = G.mul(e2, 1 / G.len(e2));
        const rr = 0.9 * s, n = 24;
        let prev = null;
        for (let i = 0; i <= n; i++) {
          const a = (ang * i) / n;
          const p = W(G.add(it.at, G.add(G.mul(d1, rr * Math.cos(a)), G.mul(e2, rr * Math.sin(a)))));
          if (prev) helperGroup.add(cylinder(prev, p, 0.014 * s, hmat));
          prev = p;
        }
        const mid = G.add(it.at, G.add(G.mul(d1, rr * 1.3 * Math.cos(ang / 2)), G.mul(e2, rr * 1.3 * Math.sin(ang / 2))));
        lab(`α ≈ ${it.label}`, W(mid));
      }
      if (it.k === 'path' && S.guides) {
        const p = it.p, q1 = [p[0], 0, 0], q2 = [p[0], p[1], 0];
        const cols = AXIS_COL.map((c) => solid(c, 0.5));
        if (Math.abs(p[0]) > 1e-9) helperGroup.add(dashed(W([0, 0, 0]), W(q1), 0.016 * s, cols[0], 0.14 * s));
        if (Math.abs(p[1]) > 1e-9) helperGroup.add(dashed(W(q1), W(q2), 0.016 * s, cols[1], 0.14 * s));
        if (Math.abs(p[2]) > 1e-9) helperGroup.add(dashed(W(q2), W(p), 0.016 * s, cols[2], 0.14 * s));
      }
    }
  };
  const a = S.sel && S.byName.get(S.sel), b = S.sel2 && S.byName.get(S.sel2);
  if (a) {
    const an = G.analyzeOne(a.o);
    if (!b && (S.guides || a.o.type !== 'plane')) draw((an?.draw || []).filter((d) => S.guides || d.k !== 'pt'));
    if (a.o.type === 'line') {
      // support point, direction vector and the moving point X(t)
      if (!b) draw([{ k: 'vec', a: a.o.p, v: a.o.u, c: '#ffffff', label: '' }]);
      const X = G.lineAt(a.o, S.t);
      helperGroup.add(sphere(W(X), 0.1 * s, wmat));
      lab(`X(${X.map(G.num).join('|')})`, W(X));
    }
    if (a.o.type === 'plane') {
      if (!b) draw([{ k: 'vec', a: a.o.p, v: a.o.u, c: '#ffffff' }, { k: 'vec', a: a.o.p, v: a.o.v, c: '#ffffff' }]);
      const X = G.planeAt(a.o, S.r, S.s);
      helperGroup.add(sphere(W(X), 0.1 * s, wmat));
      lab(`X(${X.map(G.num).join('|')})`, W(X));
      if (S.guides && !b) {
        const Sp = G.interceptsOfPlane(a.o).filter(Boolean);
        for (let i = 0; i < Sp.length; i++) for (let j = i + 1; j < Sp.length; j++) helperGroup.add(dashed(W(Sp[i]), W(Sp[j]), 0.016 * s, wmat, 0.14 * s));
      }
    }
  }
  if (a && b) {
    const rel = G.analyzePair(a.o, b.o);
    if (rel) draw(rel.draw || []);
  }
  if (S.scenario?.shadow && S.byName.has('K') && S.byName.get('K').visible) {
    const sm = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 1, transparent: true, opacity: 0.78 });
    helperGroup.add(cylinder(W([3, 2, 0.03]), W([-1, -2, 0.03]), 0.16, sm), cylinder(W([-1, -2, 0.03]), W([-2, -3, 1.03]), 0.16, sm));
  }
}

// ---------------------------------------------------------------- selection + info panel
function selectObj(name, second = false) {
  if (second && S.sel && name !== S.sel) S.sel2 = name;
  else { S.sel = name; S.sel2 = null; }
  if (!name) { S.sel = S.sel2 = null; }
  S.t = 0; S.r = 0; S.s = 0;
  const a = S.sel && S.byName.get(S.sel);
  if (a?.o.type === 'line') { const c = clipLine(a.o.p, a.o.u, S.range); if (c && (0 < c[0] || 0 > c[1])) S.t = (c[0] + c[1]) / 2; }
  renderList();
  renderInfo();
  updateHelpers();
  syncScrub();
}
function texHTML(s) {
  try { return window.katex ? window.katex.renderToString(s, { throwOnError: false, displayMode: false }) : s; } catch { return s; }
}
function renderInfo() {
  const info = $('info');
  const a = S.sel && S.byName.get(S.sel);
  document.body.classList.toggle('info-open', !!a);
  if (!a) { info.classList.remove('open'); info.setAttribute('aria-hidden', 'true'); $('rSel').textContent = '—'; return; }
  const b = S.sel2 && S.byName.get(S.sel2);
  const an = G.analyzeOne(a.o);
  info.style.setProperty('--c', a.color);
  $('infoKicker').textContent = an.kicker;
  $('infoTitle').textContent = an.title;
  $('infoFormula').innerHTML = texHTML(G.formsOf(a.o).tex);
  const blocks = [...an.blocks.map((bl) => blockHTML(bl))];
  let facts = an.facts;
  if (b) {
    const rel = G.analyzePair(a.o, b.o);
    if (rel) {
      blocks.unshift(`<div class="relhead"><div class="info-kicker"><span class="swatch" style="background:${b.color}"></span><span>${rel.kicker}</span></div><h3>${rel.title}</h3></div>` + rel.blocks.map(blockHTML).join(''));
      facts = rel.facts;
    } else blocks.unshift(`<div class="relhead"><h3>${a.o.name} und ${b.o.name}</h3><p class="blk">Für diese Kombination gibt es keine Lagebeziehung.</p></div>`);
  }
  $('infoBlocks').innerHTML = blocks.join('');
  $('infoFacts').innerHTML = (facts || []).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  // compare selector
  const sel = $('cmpSel');
  sel.innerHTML = '<option value="">—</option>' + S.list.filter((e) => e.o.name !== a.o.name).map((e) => `<option value="${e.o.name}" ${e.o.name === S.sel2 ? 'selected' : ''}>${e.o.name} · ${G.TYPE_DE[e.o.type]}</option>`).join('');
  $('infoHide').textContent = a.visible ? 'Ausblenden' : 'Einblenden';
  $('infoDel').hidden = !!S.scenario;
  renderLive();
  info.classList.add('open');
  info.setAttribute('aria-hidden', 'false');
  $('rSel').textContent = b ? `${a.o.name} · ${b.o.name}` : a.o.name;
}
function blockHTML(bl) {
  return `<div class="blk"><h4>${bl.h}</h4>${(bl.tex || []).map((t) => `<div class="tx">${texHTML(t)}</div>`).join('')}${bl.p ? `<p>${bl.p}</p>` : ''}</div>`;
}
function renderLive() {
  const a = S.sel && S.byName.get(S.sel);
  const live = $('infoLive');
  if (S.flight && S.scenario) {
    live.hidden = false;
    live.innerHTML = flightText();
    return;
  }
  if (!a || (a.o.type !== 'line' && a.o.type !== 'plane')) { live.hidden = true; return; }
  live.hidden = false;
  if (a.o.type === 'line') {
    const X = G.lineAt(a.o, S.t);
    live.innerHTML = `<b>${a.o.param} = ${G.dec(S.t, 2)}</b> → X(${X.map(G.num).join(' | ')})<br><span style="color:var(--muted)">Regler unten oder ▶ bewegt X über die Gerade.</span>`;
  } else {
    const X = G.planeAt(a.o, S.r, S.s);
    live.innerHTML = `<div class="paramrow"><span>${a.o.params[0]} = ${G.dec(S.r, 1)}</span><input type="range" min="-4" max="4" step="0.1" value="${S.r}" data-p="r"></div>` +
      `<div class="paramrow"><span>${a.o.params[1]} = ${G.dec(S.s, 1)}</span><input type="range" min="-4" max="4" step="0.1" value="${S.s}" data-p="s"></div>` +
      `<b>X</b>(${X.map(G.num).join(' | ')})`;
    live.querySelectorAll('input').forEach((inp) => inp.addEventListener('input', () => {
      S[inp.dataset.p] = +inp.value;
      updateHelpers();
      const Y = G.planeAt(a.o, S.r, S.s);
      live.querySelectorAll('span')[inp.dataset.p === 'r' ? 0 : 1].textContent = `${a.o.params[inp.dataset.p === 'r' ? 0 : 1]} = ${G.dec(+inp.value, 1)}`;
      live.lastChild.textContent = `(${Y.map(G.num).join(' | ')})`;
    }));
  }
}

// ---------------------------------------------------------------- object list
function renderList() {
  const ol = $('objList');
  if (!S.list.length) { ol.innerHTML = '<li class="empty">Noch keine Objekte – gib oben etwas ein oder wähle ein Beispiel.</li>'; }
  else ol.innerHTML = S.list.map((e) => {
    const f = G.formsOf(e.o);
    const cls = [e.o.name === S.sel ? 'sel' : '', e.o.name === S.sel2 ? 'sel2' : '', e.visible ? '' : 'off'].join(' ');
    return `<li class="${cls}" data-n="${e.o.name}"><span class="dot" style="background:${e.color}"></span><span class="nm"><b>${e.o.name}</b> · ${G.TYPE_DE[e.o.type]}<small>${f.short}</small></span>` +
      `<button class="ic" data-act="vis" title="${e.visible ? 'Ausblenden' : 'Einblenden'}">${e.visible ? '◉' : '○'}</button>` +
      (S.scenario ? '' : `<button class="ic" data-act="del" title="Löschen">×</button>`) + '</li>';
  }).join('');
  $('partCount').textContent = `· ${S.list.length}`;
  $('tCount').textContent = `${S.list.length} Objekt${S.list.length === 1 ? '' : 'e'}`;
}
$('objList').addEventListener('click', (ev) => {
  const li = ev.target.closest('li[data-n]');
  if (!li) return;
  const n = li.dataset.n;
  const act = ev.target.closest('button')?.dataset.act;
  if (act === 'vis') { toggleVis(n); return; }
  if (act === 'del') { removeObject(n); renderList(); renderInfo(); updateHelpers(); save(); return; }
  selectObj(n === S.sel && !ev.shiftKey ? null : n, ev.shiftKey);
  if (isPhone()) setIndexOpen(false);
});
function toggleVis(n) {
  const e = S.byName.get(n);
  e.visible = !e.visible;
  e.group.visible = e.visible;
  for (const L of e.labels) L.hidden = !e.visible;
  renderList();
  if (S.sel === n) renderInfo();
}

// ---------------------------------------------------------------- input
const EXAMPLES = ['A(2|1|3)', 'B(-1|4|2)', 'g = Gerade(A, B)', 'E: x1 + 2x2 + 2x3 = 8', 'h: x = (0|0|1) + t*(1|-1|2)', 'P(4|4|4)', 'u = AB'];
$('examples').innerHTML = EXAMPLES.map((x) => `<button type="button">${x}</button>`).join('');
$('examples').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  $('cmd').value = b.textContent;
  submit();
});
$('inputForm').addEventListener('submit', (e) => { e.preventDefault(); submit(); });
function submit() {
  const v = $('cmd').value.trim();
  if (!v) return;
  if (S.scenario) exitScenario();
  try {
    const e = addObject(v, null, { select: true });
    $('cmd').value = '';
    $('err').hidden = true;
    flyToObject(e, true);
  } catch (err) {
    $('err').hidden = false;
    $('err').textContent = err.message;
  }
}
$('helpBtn').addEventListener('click', () => {
  const h = $('help');
  h.hidden = !h.hidden;
  $('helpBtn').setAttribute('aria-expanded', String(!h.hidden));
});
function save() {
  if (S.scenario) return;
  try { localStorage.setItem('lmg-vektoren', JSON.stringify(S.list.map((e) => [e.src, e.color, e.visible]))); } catch { /* storage unavailable */ }
}
function load() {
  let items = null;
  try { items = JSON.parse(localStorage.getItem('lmg-vektoren') || 'null'); } catch { items = null; }
  if (!items || !items.length) items = [['A(4|2|3)', '#ff7a59', true], ['g: x = (2|-3|1) + t*(1|2|1)', '#7c9cff', true], ['E: x1 + 2x2 + 2x3 = 8', '#5ad1c8', true]];
  for (const [src, color, vis] of items) {
    try {
      const e = addObject(src, color, { quiet: true });
      if (vis === false) toggleVis(e.o.name);
    } catch { /* skip broken entries */ }
  }
  S.colorIdx = S.list.length;
  renderList();
}

// ---------------------------------------------------------------- tabs, panel
$('tabObj').addEventListener('click', () => setTab('obj'));
$('tabTask').addEventListener('click', () => setTab('task'));
function setTab(t) {
  $('tabObj').classList.toggle('on', t === 'obj');
  $('tabTask').classList.toggle('on', t === 'task');
  $('paneObj').hidden = t !== 'obj';
  $('paneTask').hidden = t !== 'task';
  $('indexTitle').textContent = t === 'obj' ? 'Objekte' : 'Aufgaben';
}
$('taskList').innerHTML = SCENARIOS.map((sc) => `<li><button data-id="${sc.id}"><div class="tk">${sc.kicker}</div><div class="tt">${sc.title}</div><div class="td">${sc.desc}</div></button></li>`).join('');
$('taskList').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-id]');
  if (b) startScenario(b.dataset.id);
});
$('indexToggle').addEventListener('click', () => setIndexOpen($('index').classList.contains('collapsed')));
function setIndexOpen(open) {
  $('index').classList.toggle('collapsed', !open);
  $('indexToggle').setAttribute('aria-expanded', String(open));
}

// ---------------------------------------------------------------- scenarios
function startScenario(id) {
  const sc = SCENARIOS.find((x) => x.id === id);
  if (!S.scenario) S.workshop = { list: S.list.map((e) => [e.src, e.color, e.visible]), range: S.range };
  for (const e of [...S.list]) removeObject(e.o.name);
  S.scenario = sc;
  S.flight = sc.flight || null;
  S.range = sc.range;
  $('range').value = String(sc.range);
  buildAxes();
  for (const [src, color] of sc.objects) addObject(src, color, { quiet: true });
  for (const [name, m] of Object.entries(MODELS)) m.visible = name === sc.model || (sc.model === 'Flugzeuge' && /^Flugzeug_/.test(name));
  document.querySelectorAll('#taskList button').forEach((b) => b.classList.toggle('on', b.dataset.id === id));
  $('tMode').textContent = 'Aufgabe: ' + sc.title;
  $('phase').hidden = false;
  $('phaseTrack').innerHTML = sc.steps.map(() => '<i style="--w:1"><b></b></i>').join('');
  $('ticks').innerHTML = sc.steps.map((_, i) => `<i style="left:${(i / sc.steps.length) * 100}%"></i><span style="left:${((i + 0.5) / sc.steps.length) * 100}%">${i + 1}</span>`).join('');
  S.time = 0;
  setPlaying(false);
  applyStep(0, true);
  renderList();
  if (innerWidth < 1280) setIndexOpen(false);
}
function exitScenario() {
  if (!S.scenario) return;
  for (const e of [...S.list]) removeObject(e.o.name);
  S.scenario = null;
  S.flight = null;
  for (const m of Object.values(MODELS)) m.visible = false;
  S.range = S.workshop?.range || 6;
  $('range').value = String(S.range);
  buildAxes();
  for (const [src, color, vis] of S.workshop?.list || []) {
    try { const e = addObject(src, color, { quiet: true }); if (vis === false) toggleVis(e.o.name); } catch { /* ignore */ }
  }
  S.workshop = null;
  document.querySelectorAll('#taskList button').forEach((b) => b.classList.remove('on'));
  $('tMode').textContent = 'Werkstatt';
  $('phase').hidden = true;
  $('ticks').innerHTML = '';
  setPlaying(false);
  selectObj(null);
  renderList();
  resetView();
}
function applyStep(i, fly) {
  const sc = S.scenario;
  S.step = i;
  const st = sc.steps[i];
  for (const e of S.list) {
    const vis = !st.show || st.show.includes(e.o.name);
    e.visible = vis;
    e.group.visible = vis;
    for (const L of e.labels) L.hidden = !vis;
  }
  S.sel = st.select?.[0] || null;
  S.sel2 = st.select?.[1] || null;
  $('phaseNo').textContent = `${String(i + 1).padStart(2, '0')} / ${String(sc.steps.length).padStart(2, '0')}`;
  const h3 = $('phaseTitle');
  h3.textContent = st.title;
  h3.classList.remove('swap'); void h3.offsetWidth; h3.classList.add('swap');
  $('phaseText').textContent = st.live === 'flight' ? flightSummary() : st.text;
  renderList();
  renderInfo();
  updateHelpers();
  syncScrub();
  if (fly && st.view) flyView(st.view);
}
function stepIndexAt(time) { return clamp(Math.floor(time / SPEED_STEP), 0, S.scenario.steps.length - 1); }
$('phasePrev').addEventListener('click', () => jumpStep(-1));
$('phaseNext').addEventListener('click', () => jumpStep(1));
$('phaseExit').addEventListener('click', exitScenario);
function jumpStep(d) {
  if (!S.scenario) return;
  const i = clamp(S.step + d, 0, S.scenario.steps.length - 1);
  S.time = i * SPEED_STEP + 0.01;
  applyStep(i, true);
}

// flight scenario: aircraft move with t (minutes); distance at equal times vs. distance of the paths
function flightTime() { return (S.time / (S.scenario.steps.length * SPEED_STEP)) * S.flight.tMax; }
function flightState(t) {
  const [g, h] = S.flight.lines.map((n) => S.byName.get(n).o);
  const A = G.lineAt(g, t), B = G.lineAt(h, t);
  return { g, h, A, B, d: G.len(G.sub(A, B)) };
}
function flightMin() {
  const [g, h] = S.flight.lines.map((n) => S.byName.get(n).o);
  const w = G.sub(g.p, h.p), du = G.sub(g.u, h.u);
  const t = -G.dot(w, du) / G.dot(du, du);
  return { t, d: G.len(G.add(w, G.mul(du, t))) };
}
function flightSummary() {
  const m = flightMin();
  return `Beide Flugzeuge sind zur selben Zeit t an den Punkten f1(t) und f2(t). Ihr Abstand d(t) = |f1(t) − f2(t)| ist am kleinsten für t ≈ ${G.dec(m.t, 2)} min: d ≈ ${G.dec(m.d, 2)} km – deutlich mehr als der Abstand der Bahnen. Die Bahnen kommen sich nah, die Flugzeuge nicht gleichzeitig.`;
}
function flightText() {
  const t = flightTime();
  const f = flightState(t);
  const m = flightMin();
  return `<b>t = ${G.dec(t, 2)} min</b><br>A(${f.A.map((x) => G.dec(x, 2)).join(' | ')})<br>B(${f.B.map((x) => G.dec(x, 2)).join(' | ')})<br><b>Abstand jetzt</b> · ${G.dec(f.d, 2)} km<br><b>kleinster Abstand</b> · ${G.dec(m.d, 2)} km bei t ≈ ${G.dec(m.t, 2)} min`;
}
function updateFlight() {
  if (!S.flight || !S.scenario) return;
  const t = flightTime();
  const f = flightState(t);
  const place = (name, P, u) => {
    const m = MODELS[name];
    if (!m) return;
    m.position.copy(W(P));
    const d = W(u).normalize();
    m.up.set(0, 1, 0);
    m.lookAt(m.position.clone().sub(d));     // nose of the model points along −Z
    m.scale.setScalar(S.range / 8 * 0.9);
  };
  place(S.flight.planes[0], f.A, f.g.u);
  place(S.flight.planes[1], f.B, f.h.u);
  $('pval').textContent = `t = ${G.dec(t, 1)} min`;
  if (S.sel) renderLive();
}

// ---------------------------------------------------------------- timeline: scenario time or parameter of the selected line/plane
function setPlaying(on) {
  S.playing = on;
  $('play').classList.toggle('paused', !on);
  $('play').setAttribute('aria-label', on ? 'Pause' : 'Abspielen');
}
$('play').addEventListener('click', () => setPlaying(!S.playing));
function paramRange() {
  const a = S.sel && S.byName.get(S.sel);
  if (!a) return null;
  if (a.o.type === 'line') { const c = clipLine(a.o.p, a.o.u, S.range); return c ? { key: 't', a: c[0], b: c[1], name: a.o.param } : null; }
  if (a.o.type === 'plane') return { key: 'r', a: -4, b: 4, name: a.o.params[0] };
  return null;
}
function syncScrub() {
  const sc = $('scrub');
  if (S.scenario) {
    const T = S.scenario.steps.length * SPEED_STEP;
    sc.value = (S.time / T) * 10000;
    sc.style.setProperty('--p', ((S.time / T) * 100).toFixed(2) + '%');
    if (!S.flight) $('pval').textContent = `Schritt ${S.step + 1}`;
    sc.disabled = false;
    return;
  }
  const pr = paramRange();
  sc.disabled = !pr;
  $('controls').style.setProperty('--dis', pr ? 1 : 0.4);
  if (!pr) { $('pval').textContent = '—'; sc.style.setProperty('--p', '0%'); return; }
  const v = S[pr.key];
  const k = (v - pr.a) / (pr.b - pr.a);
  if (document.activeElement !== sc) sc.value = k * 10000;
  sc.style.setProperty('--p', (k * 100).toFixed(2) + '%');
  $('pval').textContent = `${pr.name} = ${G.dec(v, 2)}`;
}
$('scrub').addEventListener('input', () => {
  const v = +$('scrub').value / 10000;
  if (S.scenario) {
    S.time = v * S.scenario.steps.length * SPEED_STEP * 0.9999;
    const i = stepIndexAt(S.time);
    if (i !== S.step) applyStep(i, true);
    syncScrub();
    return;
  }
  const pr = paramRange();
  if (!pr) return;
  S[pr.key] = pr.a + v * (pr.b - pr.a);
  updateHelpers();
  renderLive();
  syncScrub();
});

// ---------------------------------------------------------------- camera
const VIEW_DIRS = { schraeg: [1.25, 0.62, 0.78], oben: [0.04, 0.0, 1], vorne: [1, 0.0, 0.08], seite: [0.06, 1, 0.08] };
const VIEW_NAMES = { schraeg: 'Schrägbild', oben: 'Draufsicht', vorne: 'Vorderansicht', seite: 'Seitenansicht' };
let flight = null;
function flyView({ dir, dist, target }, dur = 1.4) {
  const t = W(target || [0, 0, 0]);
  const d = W(dir).normalize();
  flight = { fromT: controls.target.clone(), fromP: camera.position.clone(), toT: t, toP: t.clone().addScaledVector(d, dist), t: 0, dur };
}
function resetView() {
  const R = S.range;
  const a = innerWidth / innerHeight;
  flyView({ dir: VIEW_DIRS[S.view], dist: R * (a >= 1.2 ? 4.3 : a >= 0.8 ? 5.2 : 6.6), target: [0, 0, R * 0.12] });
  $('rView').textContent = VIEW_NAMES[S.view];
}
function flyToObject(e, keepDir = false) {
  const o = e.o;
  let p = [0, 0, 0];
  if (o.type === 'point') p = o.p;
  else if (o.type === 'vector') p = G.add(o.from || [0, 0, 0], G.mul(o.v, 0.5));
  else if (o.type === 'line') { const c = clipLine(o.p, o.u, S.range); p = c ? G.lineAt(o, (c[0] + c[1]) / 2) : o.p; }
  else if (o.type === 'plane') { const poly = clipPlane(o.n, o.d, S.range); p = poly ? poly.c : o.p; }
  const dir = M(camera.position.clone().sub(controls.target).normalize());
  flyView({ dir: keepDir ? dir : dir, dist: Math.max(6, Math.min(camera.position.distanceTo(controls.target), S.range * 3.2)), target: p }, 1.1);
}

// ---------------------------------------------------------------- picking
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pick(cx, cy) {
  ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const meshes = [];
  objGroup.traverse((o) => { if (o.isMesh && o.userData.obj && o.parent.visible !== false) { let v = true; for (let p = o; p; p = p.parent) if (!p.visible) v = false; if (v) meshes.push(o); } });
  const hits = raycaster.intersectObjects(meshes, false);
  if (!hits.length) return null;
  // prefer points and lines over (large, translucent) planes
  const rank = (h) => ({ point: 0, vector: 1, line: 1, plane: 3 }[S.byName.get(h.object.userData.obj)?.o.type] ?? 4);
  hits.sort((a, b) => rank(a) - rank(b) || a.distance - b.distance);
  return hits[0].object.userData.obj;
}
let down = null;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  if (Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6 && performance.now() - down.t < 500) {
    const n = pick(e.clientX, e.clientY);
    if (n) selectObj(n, e.shiftKey && !!S.sel);
    else if (!S.scenario) selectObj(null);
  }
  down = null;
});
let hoverReq = null;
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || e.buttons) { $('hoverTip').classList.remove('on'); return; }
  if (hoverReq) return;
  hoverReq = requestAnimationFrame(() => {
    hoverReq = null;
    const n = pick(e.clientX, e.clientY);
    const tip = $('hoverTip');
    canvas.style.cursor = n ? 'pointer' : 'grab';
    if (n) {
      const o = S.byName.get(n).o;
      tip.textContent = `${o.name} · ${G.TYPE_DE[o.type]}${S.sel && S.sel !== n ? '  (⇧ + Klick: vergleichen)' : ''}`;
      tip.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 12}px)`;
      tip.classList.add('on');
    } else tip.classList.remove('on');
  });
});
canvas.addEventListener('pointerleave', () => $('hoverTip').classList.remove('on'));

// ---------------------------------------------------------------- info buttons, options
$('infoClose').addEventListener('click', () => selectObj(null));
$('infoFocus').addEventListener('click', () => { const e = S.sel && S.byName.get(S.sel); if (e) flyToObject(e); });
$('infoHide').addEventListener('click', () => { if (S.sel) toggleVis(S.sel); });
$('infoDel').addEventListener('click', () => { if (S.sel && !S.scenario) { removeObject(S.sel); renderList(); renderInfo(); updateHelpers(); save(); } });
$('cmpSel').addEventListener('change', (e) => { S.sel2 = e.target.value || null; renderList(); renderInfo(); updateHelpers(); });
const chip = (id, on) => { $(id).classList.toggle('on', on); $(id).setAttribute('aria-pressed', String(on)); };
$('grid').addEventListener('click', () => { S.grid = !S.grid; chip('grid', S.grid); axesGroup.getObjectByName('grid').visible = S.grid; });
$('guides').addEventListener('click', () => { S.guides = !S.guides; chip('guides', S.guides); updateHelpers(); });
$('labelsBtn').addEventListener('click', () => { S.labels = !S.labels; chip('labelsBtn', S.labels); labelHost.classList.toggle('hide-labels', !S.labels); });
$('reset').addEventListener('click', () => { resetView(); setOptsOpen(false); });
$('view').addEventListener('change', (e) => { S.view = e.target.value; resetView(); setOptsOpen(false); });
$('range').addEventListener('change', (e) => { S.range = +e.target.value; rebuildAll(); resetView(); syncScrub(); });
$('optsBtn').addEventListener('click', (e) => { e.stopPropagation(); setOptsOpen(!$('controls').classList.contains('opts-open')); });
document.addEventListener('pointerdown', (e) => { if ($('controls').classList.contains('opts-open') && !$('controls').contains(e.target)) setOptsOpen(false); });
function setOptsOpen(open) { $('controls').classList.toggle('opts-open', open); $('optsBtn').setAttribute('aria-expanded', String(open)); }
$('zoomIn').addEventListener('click', () => zoomBy(1 / 1.5));
$('zoomOut').addEventListener('click', () => zoomBy(1.5));
let zoomGoal = null, sliderActive = false;
function zoomBy(k) { zoomGoal = clamp(camera.position.distanceTo(controls.target) * k, controls.minDistance, controls.maxDistance); }
const LOG_MIN = Math.log(controls.minDistance), LOG_MAX = Math.log(controls.maxDistance);
$('zoomSlider').addEventListener('input', (e) => { zoomGoal = Math.exp(LOG_MAX - (e.target.value / 1000) * (LOG_MAX - LOG_MIN)); sliderActive = true; });
$('zoomSlider').addEventListener('change', () => { sliderActive = false; });
addEventListener('keydown', (e) => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (e.code === 'Space') { e.preventDefault(); setPlaying(!S.playing); }
  if (e.key === 'Escape') selectObj(null);
  if (e.key === 'ArrowRight') jumpStep(1);
  if (e.key === 'ArrowLeft') jumpStep(-1);
  if (e.key === '+' || e.key === '=') zoomBy(1 / 1.5);
  if (e.key === '-') zoomBy(1.5);
});

// ---------------------------------------------------------------- load Blender assets
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
loader.load('models/math.glb', (gltf) => {
  const root = gltf.scene;
  const geo = (n) => root.getObjectByName(n).geometry;
  TPL = { shaft: geo('Tpl_Schaft'), head: geo('Tpl_Spitze'), point: geo('Tpl_Punkt') };
  for (const n of ['Szene_Pyramide', 'Szene_Schatten', 'Flugzeug_A', 'Flugzeug_B']) {
    const m = root.getObjectByName(n);
    if (!m) continue;
    m.visible = false;
    m.traverse((o) => {
      if (!o.isMesh) return;
      const mt = o.material;
      if (mt.name === 'Glas') Object.assign(mt, { transparent: true, opacity: 0.2, depthWrite: false, transmission: 0, roughness: 0.05, metalness: 0.2 });
      if (/Glow/.test(mt.name)) mt.toneMapped = false;
      o.renderOrder = mt.transparent ? 1 : 0;
    });
    modelGroup.add(m);
    MODELS[n] = m;
  }
  buildAxes();
  load();
  resetView();
  camera.position.copy(flight.toP).multiplyScalar(1.8);
  controls.target.copy(flight.toT);
  $('loader').classList.add('done');
  syncScrub();
}, (e) => {
  if (e.total) { const p = Math.round((e.loaded / e.total) * 100); $('loadBar').style.width = p + '%'; $('loadPct').textContent = p + ' %'; }
}, (err) => { $('loadPct').textContent = 'Fehler beim Laden: ' + err.message; });

// ---------------------------------------------------------------- loop
let last = performance.now();
function frame(now = performance.now()) {
  requestAnimationFrame(frame);
  const dt = clamp((now - last) / 1000, 0, 0.1);
  last = now;
  tick(dt);
}
function tick(dt, skipRender = false) {
  if (!TPL) { renderer.render(scene, camera); return; }
  if (S.playing) {
    if (S.scenario) {
      const T = S.scenario.steps.length * SPEED_STEP;
      S.time = Math.min(S.time + dt, T - 0.001);
      const i = stepIndexAt(S.time);
      if (i !== S.step) applyStep(i, true);
      if (S.time >= T - 0.002) setPlaying(false);
      syncScrub();
    } else {
      const pr = paramRange();
      if (pr) {
        let v = S[pr.key] + S.pdir * dt * (pr.b - pr.a) / 7;
        if (v > pr.b) { v = pr.b; S.pdir = -1; }
        if (v < pr.a) { v = pr.a; S.pdir = 1; }
        S[pr.key] = v;
        updateHelpers();
        renderLive();
        syncScrub();
      }
    }
  }
  updateFlight();
  if (flight) {
    flight.t += dt / flight.dur;
    const k = easeInOut(clamp(flight.t, 0, 1));
    controls.target.lerpVectors(flight.fromT, flight.toT, k);
    camera.position.lerpVectors(flight.fromP, flight.toP, k);
    if (flight.t >= 1) flight = null;
  } else if (zoomGoal) {
    const d = camera.position.distanceTo(controls.target);
    const nd = Math.exp(Math.log(d) + (Math.log(zoomGoal) - Math.log(d)) * (1 - Math.exp(-dt * 6)));
    camera.position.copy(controls.target).addScaledVector(camera.position.clone().sub(controls.target).normalize(), nd);
    if (Math.abs(nd - zoomGoal) / zoomGoal < 0.002) zoomGoal = null;
  }
  controls.update();
  updateLabels();
  updateScale();
  if (!skipRender) composer.render(dt);
}
function updateScale() {
  const d = camera.position.distanceTo(controls.target);
  const perPx = (2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / innerHeight;
  const nice = [0.5, 1, 2, 5, 10];
  let L = nice[0];
  for (const n of nice) if (n / perPx <= (isPhone() ? 90 : 130)) L = n;
  $('scaleBar').style.width = (L / perPx).toFixed(1) + 'px';
  $('scaleLabel').textContent = `${G.dec(L, 1)} LE`;
  if (!sliderActive) $('zoomSlider').value = ((LOG_MAX - Math.log(d)) / (LOG_MAX - LOG_MIN)) * 1000;
}
frame();
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
  composer.setSize(innerWidth, innerHeight);
});
if (innerWidth < 1100 || innerHeight < 760) setIndexOpen(!isPhone());

window.__vec = { S, camera, controls, addObject, selectObj, startScenario, exitScenario, advance: (sec) => { for (let s = 0; s < sec; s += 1 / 30) tick(1 / 30, s + 1 / 30 < sec); } };
