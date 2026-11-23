// The Library: four floating sculptures, each made of the books in one part of
// your reading life. Approach one, pull a book out of it, turn the book over in
// your hands, and put it back exactly where it was.
//
//   overview  all four sculptures in the gallery
//   focus     one sculpture up close; drag a book out of it
//   inspect   the book held in front of you; drag to turn it, hold and drag to
//             carry it back, or press Esc / "Put it back"
//
// A book is always the same 3D object: it leaves its sculpture, is held, and
// goes back into the same slot with the same orientation. Nothing here changes
// what shelf a book is on; only the Favorites button does anything to the
// catalogue, and that only adds or removes the book from Favorites.

import * as T from '../records/three.js';
import { Book, hash, rng } from './books.js';

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeBack = (t) => { const c = 1.25; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const fileUrl = (p) => 'file://' + encodeURI(p).replace(/#/g, '%23').replace(/\?/g, '%3F');
const send = (msg) => { if (parent !== window) parent.postMessage(msg, '*'); };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Each sculpture has its own character: how many books show their covers,
// how many their page edges, how loosely they sit, how they turn, its light.
const CATS = [
  { key: 'reading', name: 'Currently Reading', tile: 0.55, fore: 0.08, spread: 1.22, spin: 0.055, light: '#ffd7a6', empty: 'Nothing on your currently-reading shelf' },
  { key: 'read', name: 'Read', tile: 0.45, fore: 0.12, spread: 1.04, spin: 0.026, light: '#fff0de', empty: 'Waiting for your Goodreads export' },
];
const SCALE = 2.4; // the sculptures are made of books a little larger than life
const FLOAT_Y = 1.32;

// ---------------------------------------------------------------- renderer & gallery

const canvas = $('#c');
const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.info.autoReset = false;

const scene = new T.Scene();
const BG = new T.Color('#0d0c0b');
scene.background = BG;
scene.fog = new T.FogExp2('#0d0c0b', 0.075);
const camera = new T.PerspectiveCamera(36, 1, 0.02, 60);
camera.position.set(0, 1.6, 7);
scene.add(camera);
const pmrem = new T.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new T.RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.22;

const composer = new T.EffectComposer(renderer);
composer.addPass(new T.RenderPass(scene, camera));
const bloom = new T.UnrealBloomPass(new T.Vector2(512, 512), 0.42, 0.7, 0.86);
composer.addPass(bloom);
composer.addPass(new T.OutputPass());

function noiseTexture(size, base, spread, seed) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'), img = x.createImageData(size, size), r = rng(seed);
  for (let i = 0; i < size * size; i++) {
    const n = base + (r() - 0.5) * spread + (r() < 0.004 ? -18 : 0);
    img.data[i * 4] = n + 2; img.data[i * 4 + 1] = n; img.data[i * 4 + 2] = n - 2; img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  x.globalAlpha = 0.05;
  for (let i = 0; i < 40; i++) { x.fillStyle = r() < 0.5 ? '#000' : '#fff'; x.beginPath(); x.arc(r() * size, r() * size, 10 + r() * 60, 0, 7); x.fill(); }
  const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.colorSpace = T.SRGBColorSpace;
  return t;
}

// Polished concrete, a curved wall of dark plaster with tall slits of light.
const floorTex = noiseTexture(512, 40, 16, 3); floorTex.repeat.set(10, 10);
const floor = new T.Mesh(new T.PlaneGeometry(60, 60), new T.MeshStandardMaterial({ map: floorTex, color: '#8a837a', roughness: 0.36, metalness: 0.0, envMapIntensity: 0.9 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
scene.add(floor);
const wallTex = noiseTexture(256, 32, 10, 9); wallTex.repeat.set(16, 3);
const wall = new T.Mesh(new T.CylinderGeometry(12, 12, 10, 96, 1, true), new T.MeshStandardMaterial({ map: wallTex, color: '#6d665d', roughness: 0.96, side: T.BackSide }));
wall.position.set(0, 5, -2);
scene.add(wall);
// Tall, soft windows of light in the far wall, fading towards the floor.
const slitMat = new T.ShaderMaterial({
  transparent: true, depthWrite: false, fog: false,
  uniforms: { uColor: { value: new T.Color('#ffdcb2') }, uAmt: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform vec3 uColor; uniform float uAmt; varying vec2 vUv; void main(){ float x = 1.0 - pow(abs(vUv.x - 0.5) * 2.0, 2.0); float y = smoothstep(0.0, 0.7, vUv.y) * smoothstep(1.0, 0.85, vUv.y); gl_FragColor = vec4(uColor, x * y * 0.16 * uAmt); }',
});
for (let i = -3; i <= 3; i++) {
  const a = i * 0.27 + Math.PI;
  const s = new T.Mesh(new T.PlaneGeometry(0.7, 6.5), slitMat);
  s.position.set(Math.sin(a) * 11.8, 4.6, Math.cos(a) * 11.8 - 2);
  s.lookAt(0, 4.6, -2);
  scene.add(s);
}

const hemi = new T.HemisphereLight('#f4e6d2', '#16120f', 0.42);
scene.add(hemi);
const key = new T.DirectionalLight('#ffeedd', 1.25);
key.position.set(2.6, 7, 4.2);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
key.shadow.camera.near = 1; key.shadow.camera.far = 20;
scene.add(key, key.target);

// While a book is held: a soft key, a fill and a rim that travel with the viewer.
const holdLights = new T.Group();
camera.add(holdLights);
const holdTarget = new T.Object3D(); holdTarget.position.set(0, 0, -1); camera.add(holdTarget);
const holdKey = new T.DirectionalLight('#fff2e2', 0); holdKey.position.set(-1.4, 1.5, 0.8); holdKey.target = holdTarget;
const holdFill = new T.DirectionalLight('#dfe8ff', 0); holdFill.position.set(1.6, -0.4, 0.6); holdFill.target = holdTarget;
const holdRim = new T.DirectionalLight('#ffe0b8', 0); holdRim.position.set(0.9, 1.1, -2.6); holdRim.target = holdTarget;
holdLights.add(holdKey, holdFill, holdRim);

// Dust drifting through the light.
const motes = (() => {
  const n = 900, pos = new Float32Array(n * 3), seed = new Float32Array(n), r = rng(21);
  for (let i = 0; i < n; i++) { pos[i * 3] = (r() - 0.5) * 16; pos[i * 3 + 1] = r() * 5; pos[i * 3 + 2] = (r() - 0.5) * 8 - 0.5; seed[i] = r() * 100; }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3));
  g.setAttribute('seed', new T.BufferAttribute(seed, 1));
  const m = new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uAmt: { value: 1 } },
    vertexShader: `attribute float seed; uniform float uTime, uPx; varying float vA;
      void main(){ vec3 p = position; float t = uTime * 0.035 + seed;
        p.x += sin(t * 1.3) * 0.35; p.y = mod(p.y + uTime * 0.018 + sin(t) * 0.2, 5.0); p.z += cos(t * 0.9) * 0.3;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = max(1.0, uPx * 0.0075 / -mv.z); vA = 0.35 + 0.65 * fract(seed * 7.13); }`,
    fragmentShader: `uniform float uAmt; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d)); gl_FragColor = vec4(1.0, 0.92, 0.8, a * vA * 0.32 * uAmt); }`,
  });
  const p = new T.Points(g, m);
  p.frustumCulled = false;
  scene.add(p);
  return m;
})();

// A shaft of light falling on each sculpture.
function beam(color) {
  const m = new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
    uniforms: { uColor: { value: new T.Color(color) }, uAmt: { value: 1 } },
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 w = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-w.xyz); gl_Position = projectionMatrix * w; }',
    fragmentShader: 'uniform vec3 uColor; uniform float uAmt; varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(vN, vV)), 2.2); float fall = smoothstep(0.0, 0.55, vUv.y) * (0.35 + 0.65 * vUv.y); gl_FragColor = vec4(uColor, edge * fall * 0.075 * uAmt); }',
  });
  return new T.Mesh(new T.CylinderGeometry(0.16, 1, 1, 48, 1, true), m);
}

// ---------------------------------------------------------------- sculptures

// Books on a sphere: spread evenly (a Fibonacci spiral turned at random), each
// turned its own way. Some lie flat with a cover out, some point their spine
// out, a few their page edges. The sphere's size follows the books it holds.
// Separating-axis test for two boxes, each { c, ax: [3 unit axes], h: [3 half sizes] }.
function boxesOverlap(a, b, gap) {
  const d = tmpA.subVectors(b.c, a.c);
  const axes = [...a.ax, ...b.ax];
  for (const u of a.ax) for (const v of b.ax) { const c = tmpB.crossVectors(u, v); if (c.lengthSq() > 1e-8) axes.push(c.clone().normalize()); }
  for (const L of axes) {
    let ra = 0, rb = 0;
    for (let k = 0; k < 3; k++) { ra += a.h[k] * Math.abs(a.ax[k].dot(L)); rb += b.h[k] * Math.abs(b.ax[k].dot(L)); }
    if (Math.abs(d.dot(L)) > ra + rb + gap) return false;
  }
  return true;
}
const tmpA = new T.Vector3(), tmpB = new T.Vector3();

// Places every book on a sphere as a solid object: no two books touch. Books
// start on an even spiral; any pair that would meet is nudged apart over the
// surface, and if that is not enough the whole sphere opens up a little.
function arrange(books, cat) {
  const r = rng(hash(cat.key));
  const N = books.length;
  if (!N) return { R: 0.2, slots: new Map() };
  // A small collection closes up with covers, like the faces of a polyhedron;
  // a large one has room for spines and page edges.
  const tileP = clamp(cat.tile + (1 - cat.tile) * clamp((30 - N) / 18, 0, 1), 0, 0.94);
  const foreP = cat.fore * (1 - tileP) / Math.max(0.01, 1 - cat.tile);
  const modes = books.map((b) => { const x = rng(hash(b.id + cat.key))(); return x < tileP ? 'tile' : x < tileP + foreP ? 'fore' : 'spine'; });
  let area = 0, maxW = 0;
  books.forEach((b, i) => { area += modes[i] === 'tile' ? b.d.W * b.d.H : b.d.T * b.d.H * 2.4; maxW = Math.max(maxW, b.d.W); });
  const allTiles = modes.every((m) => m === 'tile');
  let R = Math.max(Math.sqrt(area / (4 * Math.PI)) * cat.spread * 1.12, allTiles ? maxW * 0.5 : maxW * 0.66, 0.1);
  const turn = new T.Quaternion().setFromEuler(new T.Euler(r() * 6.28, r() * 6.28, r() * 6.28));
  const golden = Math.PI * (3 - Math.sqrt(5));
  const GAP = 0.012; // the air between neighbours, in metres of book

  const items = books.map((b, i) => {
    const y = 1 - ((i + 0.5) / N) * 2, rad = Math.sqrt(1 - y * y), th = i * golden;
    const n = new T.Vector3(Math.cos(th) * rad, y, Math.sin(th) * rad).applyQuaternion(turn);
    const jit = 0.12 / Math.sqrt(Math.max(N, 4) / 4);
    n.add(new T.Vector3((r() - 0.5) * jit, (r() - 0.5) * jit, (r() - 0.5) * jit)).normalize();
    const twist = (r() < 0.22 ? Math.PI / 2 : 0) + (r() - 0.5) * 0.8;
    const layer = (i % 3) - 1, wobble = (r() - 0.5) * 0.018;
    const { W, H, T: t } = b.d;
    // Half sizes with a little extra for rounded spines and overhanging boards.
    const h = [W / 2 + 0.004, H / 2 + 0.002, t / 2 + 0.001];
    return { b, n, twist, layer, wobble, mode: modes[i], h, W, H, t };
  });

  const place = (it) => {
    const n = it.n;
    const up = new T.Vector3(0, 1, 0).addScaledVector(n, -n.y);
    if (up.lengthSq() < 1e-3) up.set(1, 0, 0).addScaledVector(n, -n.x);
    up.normalize().applyAxisAngle(n, it.twist);
    let X, Z, depth;
    if (it.mode === 'tile') {
      Z = n.clone(); X = new T.Vector3().crossVectors(up, Z);
      depth = R - it.t / 2 + it.layer * it.t * 0.9;
      it.out = it.t * 2 + 0.05;
    } else {
      X = it.mode === 'spine' ? n.clone().negate() : n.clone();
      Z = new T.Vector3().crossVectors(X, up);
      depth = R - it.W / 2 + it.wobble;
      it.out = it.W * 1.08 + 0.02;
    }
    it.box = { c: n.clone().multiplyScalar(depth), ax: [X, up, Z], h: it.h };
    it.rad = Math.hypot(...it.h);
  };

  let clean = false;
  for (let round = 0; round < 60 && !clean; round++) {
    for (let pass = 0; pass < 12; pass++) {
      items.forEach(place);
      let hits = 0;
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
        const a = items[i], c = items[j];
        if (a.box.c.distanceTo(c.box.c) > a.rad + c.rad + GAP) continue;
        if (!boxesOverlap(a.box, c.box, GAP)) continue;
        hits++;
        // Slide the two apart over the sphere.
        const away = tmpA.subVectors(a.n, c.n);
        if (away.lengthSq() < 1e-8) away.set(r() - 0.5, r() - 0.5, r() - 0.5);
        away.normalize().multiplyScalar(0.018);
        a.n.add(away).normalize(); c.n.sub(away).normalize();
      }
      if (!hits) { clean = true; break; }
    }
    if (!clean) R *= 1.035;
  }
  items.forEach(place);

  const slots = new Map();
  for (const it of items) {
    const q = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(...it.box.ax));
    slots.set(it.b.id, { pos: it.box.c.clone(), quat: q, normal: it.n.clone(), out: it.out, mode: it.mode });
  }
  return { R, slots, clean };
}

const balls = [];
const ballProxyGeo = new T.SphereGeometry(1, 24, 16);

class Sculpture {
  constructor(cat, index) {
    this.cat = cat;
    this.index = index;
    this.root = new T.Group();
    this.spin = new T.Group();
    this.root.add(this.spin);
    this.root.scale.setScalar(SCALE);
    scene.add(this.root);
    this.books = new Map();      // id → Book (this sculpture's own copy)
    this.slots = new Map();
    this.order = [];
    this.R = 0.25;
    this.base = new T.Vector3(0, FLOAT_Y, 0);
    this.baseGoal = this.base.clone();
    this.phase = index * 1.7;
    this.angle = index * 1.1;
    this.user = new T.Quaternion();
    this.userVel = new T.Vector2();
    this.hot = 0; this.hotGoal = 0;
    this.pending = null;
    this.jostle = new Map();     // id → { x, v }
    this.disturb = null;         // { pos (local), amount }
    this.leaving = [];

    this.proxy = new T.Mesh(ballProxyGeo, new T.MeshBasicMaterial({ visible: false }));
    this.proxy.userData.ball = this;
    this.root.add(this.proxy);

    this.spot = new T.SpotLight(cat.light, 30, 9, 0.2, 0.85, 2);
    this.spot.position.set(0, 6.2, 0.6);
    scene.add(this.spot, this.spot.target);
    this.beam = beam(cat.light);
    scene.add(this.beam);

    // An empty sculpture is a faint sphere of points until books arrive.
    const n = 520, pts = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const y = 1 - ((i + 0.5) / n) * 2, rr = Math.sqrt(1 - y * y), t = i * 2.39996; pts.set([Math.cos(t) * rr, y, Math.sin(t) * rr], i * 3); }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pts, 3));
    this.ghost = new T.Points(g, new T.PointsMaterial({ color: cat.light, size: 0.012, transparent: true, opacity: 0.0, depthWrite: false }));
    this.spin.add(this.ghost);

    this.label = document.createElement('div');
    this.label.className = 'label';
    $('#labels').append(this.label);
  }

  get worldR() { return this.R * SCALE; }
  center(v = new T.Vector3()) { return v.copy(this.root.position); }
  isOut(book) { return book.group.parent !== this.spin; }

  // New membership: books that stay glide to their new places, new ones grow
  // in, ones that left shrink away. Waits while one of its books is held.
  sync(list, catalogue) {
    if ([...this.books.values()].some((b) => this.isOut(b) && !b.leaving)) { this.pending = list; return; }
    this.pending = null;
    const next = new Map();
    for (const data of list) {
      let b = this.books.get(data.id);
      if (b) b.refresh(data);
      else { b = new Book(data, fileUrl); b.group.scale.setScalar(0.001); b.grow = 0; this.spin.add(b.group); coverQueue.push(b); }
      next.set(data.id, b);
    }
    for (const [id, b] of this.books) if (!next.has(id)) { b.leaving = true; b.grow = 1; this.leaving.push(b); }
    this.books = next;
    this.order = list.map((d) => d.id);
    const { R, slots } = arrange(this.order.map((id) => next.get(id)), this.cat);
    this.R = R;
    this.slots = slots;
    for (const [id, b] of next) {
      const s = slots.get(id);
      if (b.slotted) { b.move = { from: b.group.position.clone(), fromQ: b.group.quaternion.clone(), t: 0 }; }
      else { b.group.position.copy(s.pos); b.group.quaternion.copy(s.quat); b.slotted = true; }
      if (!this.jostle.has(id)) this.jostle.set(id, { x: 0, v: 0, hover: 0 });
    }
    this.proxy.scale.setScalar(Math.max(this.R * 1.08, 0.16));
    this.ghost.scale.setScalar(Math.max(this.R, 0.2));
    this.count = list.length;
    this.catalogue = catalogue;
  }

  update(dt, t, motion) {
    // Float and turn slowly; turn even more slowly when you're close.
    const close = focused === this ? 0.15 : 1;
    this.angle += dt * this.cat.spin * motion * close;
    this.base.lerp(this.baseGoal, damp(3, dt));
    this.root.position.set(this.base.x, this.base.y + Math.sin(t * 0.42 + this.phase) * 0.028 * motion, this.base.z);
    if (this.userVel.lengthSq() > 1e-8) {
      const qa = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), this.userVel.x * dt);
      const qb = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), this.userVel.y * dt);
      this.user.premultiply(qa).premultiply(qb).normalize();
      if (!dragSpin) this.userVel.multiplyScalar(Math.exp(-dt * 3));
    }
    const idle = new T.Quaternion().setFromEuler(new T.Euler(Math.sin(t * 0.11 + this.phase) * 0.05 * motion, this.angle, 0));
    this.spin.quaternion.copy(this.user).multiply(idle);
    this.hot = lerp(this.hot, this.hotGoal, damp(8, dt));
    this.root.scale.setScalar(SCALE * (1 + this.hot * 0.018));

    // Neighbours of a book being pulled out (or pushed back in) give way a
    // little, then settle with a soft wobble.
    for (const [id, b] of this.books) {
      const s = this.slots.get(id), j = this.jostle.get(id);
      if (!s || !j || this.isOut(b)) continue;
      let target = 0;
      if (this.disturb && this.disturb.id !== id) {
        const d = s.pos.distanceTo(this.disturb.pos);
        target = Math.exp(-Math.pow(d / (this.R * 0.55 + 0.04), 2)) * this.disturb.amount;
      }
      target += j.hover * 0.006;
      const k = 140, c = 7;
      j.v += (k * (target - j.x) - c * j.v) * dt;
      j.x += j.v * dt;
      if (b.move) {
        b.move.t = Math.min(1, b.move.t + dt / 1.3);
        const e = ease(b.move.t);
        b.group.position.lerpVectors(b.move.from, s.pos, e).addScaledVector(s.normal, j.x);
        b.group.quaternion.slerpQuaternions(b.move.fromQ, s.quat, e);
        if (b.move.t >= 1) b.move = null;
      } else {
        b.group.position.copy(s.pos).addScaledVector(s.normal, j.x);
      }
      if (b.grow !== undefined && b.grow < 1) { b.grow = Math.min(1, b.grow + dt * 1.6); b.group.scale.setScalar(Math.max(0.001, easeOut(b.grow))); }
    }
    for (const b of this.leaving) { b.grow -= dt * 2; b.group.scale.setScalar(Math.max(0.001, easeOut(Math.max(0, b.grow)))); }
    this.leaving = this.leaving.filter((b) => { if (b.grow > 0) return true; b.group.removeFromParent(); return false; });

    // Close up, the full models; further away, simple blocks.
    const dist = camera.position.distanceTo(this.root.position);
    const near = dist < this.worldR * 7 + 1.4;
    for (const b of this.books.values()) if (!this.isOut(b)) b.setDetail(near);

    this.ghost.material.opacity = lerp(this.ghost.material.opacity, this.count ? 0 : 0.5 + this.hot * 0.3, damp(4, dt));
    const top = 5.9;
    this.spot.position.set(this.root.position.x, top, this.root.position.z + 0.4);
    this.spot.target.position.copy(this.root.position);
    this.spot.angle = clamp(Math.atan((this.worldR * 1.5 + 0.25) / (top - this.root.position.y)), 0.08, 0.6);
    this.spot.intensity = (34 + this.hot * 16) * lightLevel;
    const bh = top - this.root.position.y + this.worldR;
    this.beam.position.set(this.root.position.x, top - bh / 2, this.root.position.z + 0.2);
    this.beam.scale.set(this.worldR * 1.5 + 0.1, bh, this.worldR * 1.5 + 0.1);
    this.beam.material.uniforms.uAmt.value = (0.8 + this.hot * 0.6) * lightLevel;
  }

  // Where a slot is in the world right now.
  slotWorld(id, pos = new T.Vector3(), quat = new T.Quaternion(), extra = 0) {
    const s = this.slots.get(id);
    this.spin.updateWorldMatrix(true, false);
    pos.copy(s.normal).multiplyScalar(extra).add(s.pos).applyMatrix4(this.spin.matrixWorld);
    this.spin.getWorldQuaternion(quat).multiply(s.quat);
    return { pos, quat, normal: s.normal.clone().transformDirection(this.spin.matrixWorld) };
  }
}

// Places the sculptures along a gentle arc, spaced by their sizes.
function layoutBalls() {
  const gap = 0.95;
  const widths = balls.map((b) => Math.max(b.worldR, 0.32) * 2);
  const total = widths.reduce((a, w) => a + w, 0) + gap * (balls.length - 1);
  let x = -total / 2;
  balls.forEach((b, i) => {
    const w = widths[i];
    const cx = x + w / 2;
    const arc = Math.abs(cx) / (total / 2 || 1);
    b.baseGoal.set(cx, FLOAT_Y + [0.06, -0.04, 0.02, 0.1][i] + Math.max(0, 0.42 - b.worldR) * 0.3, -arc * arc * 0.9 + [0, 0.25, 0.25, 0][i]);
    x += w + gap;
  });
  room.width = total;
  const s = total / 2 + 1.2;
  key.shadow.camera.left = -s; key.shadow.camera.right = s; key.shadow.camera.top = 3; key.shadow.camera.bottom = -3;
  key.shadow.camera.updateProjectionMatrix();
  key.target.position.set(0, 1, 0);
}
const room = { width: 6 };

CATS.forEach((c, i) => balls.push(new Sculpture(c, i)));

// Covers load a few at a time, nearest sculpture first.
const coverQueue = [];
let coversLoading = 0;
function pumpCovers() {
  if (coversLoading >= 4 || !coverQueue.length) return;
  coverQueue.sort((a, b) => (focusedHas(b) - focusedHas(a)));
  const b = coverQueue.shift();
  coversLoading++;
  Promise.resolve(b.loadCover()).finally(() => { coversLoading--; pumpCovers(); });
  pumpCovers();
}
const focusedHas = (b) => (focused && focused.books.get(b.id) === b ? 1 : 0);

// ---------------------------------------------------------------- state

let catalogue = null;
let motionOn = true;
let mode = 'overview';         // overview | focus | inspect
let focused = null;
let held = null;               // the book out of its sculpture, see below
let lightLevel = 1;            // the gallery dims while a book is held
let hovered = null, hoveredBall = null;
let dragSpin = false;

// The camera orbits a target. "goal" is where it's heading, "cam" where it is.
const cam = { target: new T.Vector3(0, 1.3, 0), yaw: 0, pitch: 0.06, dist: 8 };
const goal = { target: new T.Vector3(0, 1.3, 0), yaw: 0, pitch: 0.06, dist: 8 };
const look = { yaw: 0, pitch: 0, zoom: 1 }; // what you've added by dragging and scrolling

function overviewGoal() {
  const hfov = 2 * Math.atan(Math.tan(T.MathUtils.degToRad(camera.fov) / 2) * camera.aspect);
  goal.target.set(0, FLOAT_Y + 0.05, -0.25);
  goal.dist = clamp((room.width / 2 + 0.7) / Math.tan(hfov / 2), 3.5, 16) * look.zoom;
  goal.yaw = look.yaw; goal.pitch = 0.07 + look.pitch;
  // With the favorites up, look a little higher: the sculptures settle low in
  // the frame and the books hang in the light above them.
  if (mode === 'favorites') { goal.target.y += goal.dist * 0.16; goal.pitch -= 0.05; }
}
function focusGoal(b) {
  const c = b.base;
  goal.target.set(c.x, c.y, c.z);
  goal.dist = (b.worldR * 4.1 + 0.5) * look.zoom;
  goal.yaw = Math.atan2(c.x, 9) * 0.35 + look.yaw;
  goal.pitch = 0.1 + look.pitch;
  if (mode === 'inspect') {
    // Step to the side so the sculpture sits to the left of the held book.
    const right = new T.Vector3(Math.cos(goal.yaw), 0, -Math.sin(goal.yaw));
    goal.target.addScaledVector(right, b.worldR * 2.1 + 0.35);
    goal.dist = b.worldR * 4.6 + 1.1;
  }
}
function updateGoal() { if (focused) focusGoal(focused); else overviewGoal(); }

function placeCamera(dt) {
  const k = damp(held && held.phase === 'carry' ? 2.2 : 3.2, dt);
  cam.target.lerp(goal.target, k);
  cam.yaw = lerp(cam.yaw, goal.yaw, k); cam.pitch = lerp(cam.pitch, goal.pitch, k); cam.dist = lerp(cam.dist, goal.dist, k);
  const cp = Math.cos(cam.pitch);
  camera.position.set(cam.target.x + Math.sin(cam.yaw) * cp * cam.dist, cam.target.y + Math.sin(cam.pitch) * cam.dist, cam.target.z + Math.cos(cam.yaw) * cp * cam.dist);
  camera.lookAt(cam.target);
  camera.updateMatrixWorld();
}

// ---------------------------------------------------------------- holding a book

// Where the held book sits: in front of you, a little left of centre (the
// details are on the right), at a distance that makes it fill most of the height.
const inspect = { quat: new T.Quaternion(), vel: new T.Vector2(), zoom: 1, goalQuat: null };
function holdPose(book, pos = new T.Vector3(), quat = new T.Quaternion()) {
  const H = book.d.H * SCALE;
  const vfov = T.MathUtils.degToRad(camera.fov);
  const D = (H / 0.62) / (2 * Math.tan(vfov / 2)) * inspect.zoom;
  const panelFrac = Math.min(380, innerWidth * 0.34) / innerWidth;
  const ndc = -panelFrac + 0.04; // the middle of the space left of the details
  const x = ndc * D * Math.tan(vfov / 2) * camera.aspect;
  pos.set(x, 0, -D).applyMatrix4(camera.matrixWorld);
  quat.copy(camera.quaternion).multiply(inspect.quat);
  holdTarget.position.set(x, 0, -D);
  return { pos, quat, D };
}

const VIEWS = {
  front: new T.Quaternion().setFromEuler(new T.Euler(0.06, 0.38, 0)),
  spine: new T.Quaternion().setFromEuler(new T.Euler(0.05, Math.PI / 2, 0)),
  back: new T.Quaternion().setFromEuler(new T.Euler(0.06, Math.PI, 0)),
  edges: new T.Quaternion().setFromEuler(new T.Euler(0.95, -0.75, 0, 'YXZ')),
};

// A held book is { book, ball, phase, … }. Phases:
//   pull     still in its slot, sliding out along its axis as you drag
//   free     out of the sculpture, following the pointer towards you
//   toHold   travelling into your hands
//   hold     held; drag to turn it
//   carry    being carried back by hand
//   back     going back into its slot
function grab(book, ball, x, y) {
  held = { book, ball, phase: 'pull', s: 0, startX: x, startY: y, t: 0, auto: false };
  ball.disturb = { id: book.id, pos: ball.slots.get(book.id).pos, amount: 0 };
  book.setDetail(true);
  setHover(null); tip(null);
}

function freeBook() {
  const { book, ball } = held;
  const wp = new T.Vector3(), wq = new T.Quaternion();
  book.group.getWorldPosition(wp); book.group.getWorldQuaternion(wq);
  scene.add(book.group);
  book.group.position.copy(wp); book.group.quaternion.copy(wq); book.group.scale.setScalar(SCALE);
  held.phase = 'free';
  held.freePos = wp.clone(); held.freeQuat = wq.clone();
  held.depth0 = camera.position.distanceTo(wp);
  held.freeAt = Math.hypot(pointer.x - held.startX, pointer.y - held.startY);
  ball.disturb.amount = 0.004;
  book.sharpenBack();
}

function toHold() {
  const { book } = held;
  if (held.phase === 'pull') freeBook();
  held.phase = 'toHold';
  held.t = 0;
  held.from = book.group.position.clone(); held.fromQ = book.group.quaternion.clone();
  inspect.quat.copy(VIEWS.front); inspect.vel.set(0, 0); inspect.zoom = 1; inspect.goalQuat = null;
  mode = 'inspect';
  held.ball.disturb.amount = 0;
  updateGoal();
  document.body.classList.add('inspect');
  showPanel(book, held.ball);
  hint();
}

function putBack() {
  if (!held || held.phase === 'back') return;
  const { book } = held;
  if (held.phase === 'pull') { held.phase = 'snap'; held.t = 0; return; }
  held.phase = 'back';
  held.t = 0;
  held.from = book.group.position.clone(); held.fromQ = book.group.quaternion.clone();
  mode = 'focus';
  updateGoal();
  document.body.classList.remove('inspect');
  hint();
}

// Back in its slot, exactly as it was.
function settle() {
  const { book, ball } = held;
  const s = ball.slots.get(book.id);
  ball.spin.add(book.group);
  book.group.position.copy(s.pos); book.group.quaternion.copy(s.quat); book.group.scale.setScalar(1);
  const j = ball.jostle.get(book.id); if (j) { j.x = 0; j.v = 0; j.hover = 0; }
  ball.disturb = { id: book.id, pos: s.pos, amount: -0.006 };
  setTimeout(() => { if (ball.disturb && ball.disturb.id === book.id && !held) ball.disturb = null; }, 160);
  held = null;
  if (ball.pending) ball.sync(ball.pending, catalogue);
}

const tmpV = new T.Vector3(), tmpQ = new T.Quaternion(), tmpV2 = new T.Vector3();
function rayPoint(x, y, depth, out) {
  const ndc = new T.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return out.copy(ray.ray.origin).addScaledVector(ray.ray.direction, depth);
}

// The sculpture on screen: its centre and radius in pixels.
function screenCircle(ball) {
  const c = ball.root.position.clone().project(camera);
  const right = new T.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(ball.worldR).add(ball.root.position).project(camera);
  const cx = (c.x + 1) / 2 * innerWidth, cy = (1 - c.y) / 2 * innerHeight;
  return { x: cx, y: cy, r: Math.abs((right.x + 1) / 2 * innerWidth - cx) };
}

function updateHeld(dt) {
  if (!held) return;
  const { book, ball } = held;
  const slot = ball.slots.get(book.id);
  if (held.phase === 'pull' || held.phase === 'snap') {
    if (held.phase === 'snap') { held.s = lerp(held.s, 0, damp(14, dt)); if (held.s < 0.0005) { ball.disturb = null; held = null; return; } }
    if (held.auto) { held.t += dt / 0.42; held.s = slot.out * easeOut(Math.min(1, held.t)); if (held.t >= 1) { toHold(); return; } }
    const e = slot.out * (1 - Math.exp(-held.s / (slot.out * 0.8)));
    book.group.position.copy(slot.pos).addScaledVector(slot.normal, e);
    ball.disturb.amount = 0.008 * Math.min(1, e / slot.out) * (held.phase === 'snap' ? 0.5 : 1);
    if (!held.auto && held.phase === 'pull' && e > slot.out * 0.85) freeBook();
    return;
  }
  if (held.phase === 'free') {
    const travel = Math.hypot(pointer.x - held.startX, pointer.y - held.startY);
    const k = clamp((travel - held.freeAt) / 240, 0, 1);
    const hp = holdPose(book, tmpV2, tmpQ);
    const depth = lerp(held.depth0, hp.D, ease(k) * 0.75);
    const target = rayPoint(pointer.x, pointer.y, depth, new T.Vector3());
    book.group.position.lerp(target, damp(16, dt));
    const q = held.freeQuat.clone().slerp(hp.quat, ease(k) * 0.8);
    book.group.quaternion.slerp(q, damp(10, dt));
    return;
  }
  if (held.phase === 'toHold') {
    held.t = Math.min(1, held.t + dt / 0.95);
    const e = ease(held.t);
    const hp = holdPose(book, tmpV2, tmpQ);
    book.group.position.lerpVectors(held.from, hp.pos, e);
    book.group.position.y += Math.sin(Math.PI * e) * 0.06;
    book.group.quaternion.slerpQuaternions(held.fromQ, hp.quat, e);
    lightLevel = lerp(1, 0.32, e);
    if (held.t >= 1) held.phase = 'hold';
    return;
  }
  if (held.phase === 'hold') {
    if (inspect.goalQuat) { inspect.quat.slerp(inspect.goalQuat, damp(7, dt)); if (inspect.quat.angleTo(inspect.goalQuat) < 0.002) inspect.goalQuat = null; }
    else if (!rotating && inspect.vel.lengthSq() > 1e-6) { spinHeld(inspect.vel.x * dt, inspect.vel.y * dt); inspect.vel.multiplyScalar(Math.exp(-dt * 4)); }
    const hp = holdPose(book, tmpV2, tmpQ);
    book.group.position.lerp(hp.pos, damp(14, dt));
    book.group.quaternion.slerp(hp.quat, damp(18, dt));
    return;
  }
  if (held.phase === 'carry') {
    const circle = screenCircle(ball);
    const dd = Math.hypot(pointer.x - circle.x, pointer.y - circle.y);
    const near = clamp(1 - (dd - circle.r) / (circle.r * 2.6 + 60), 0, 1);
    const hp = holdPose(book, tmpV2, tmpQ);
    const sw = ball.slotWorld(book.id, new T.Vector3(), new T.Quaternion(), slot.out * 1.2);
    const depth = lerp(hp.D * 0.92, camera.position.distanceTo(sw.pos), ease(near));
    const target = rayPoint(pointer.x, pointer.y, depth, new T.Vector3());
    book.group.position.lerp(target, damp(14, dt));
    book.group.quaternion.slerp(hp.quat.clone().slerp(sw.quat, ease(near) * 0.85), damp(8, dt));
    held.snap = dd < circle.r * 1.3 + 24;
    ball.hotGoal = held.snap ? 1 : near * 0.4;
    lightLevel = lerp(0.32, 0.85, near);
    return;
  }
  if (held.phase === 'back') {
    // First to just outside its slot, lined up; then slide in.
    held.t = Math.min(1, held.t + dt / 1.05);
    const split = 0.62;
    const approach = ball.slotWorld(book.id, new T.Vector3(), new T.Quaternion(), slot.out * 1.15);
    const home = ball.slotWorld(book.id, new T.Vector3(), new T.Quaternion(), 0);
    if (held.t < split) {
      const e = ease(held.t / split);
      book.group.position.lerpVectors(held.from, approach.pos, e);
      book.group.position.y += Math.sin(Math.PI * e) * 0.04;
      book.group.quaternion.slerpQuaternions(held.fromQ, approach.quat, Math.min(1, e * 1.15));
    } else {
      const e = easeBack((held.t - split) / (1 - split));
      book.group.position.lerpVectors(approach.pos, home.pos, e);
      book.group.quaternion.copy(home.quat);
      ball.disturb = { id: book.id, pos: slot.pos, amount: 0.01 * Math.sin(Math.PI * Math.min(1, e)) };
    }
    lightLevel = lerp(lightLevel, 1, damp(3, dt));
    ball.hotGoal = 0;
    if (held.t >= 1) settle();
  }
}

function spinHeld(ax, ay) {
  const qy = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), ax);
  const qx = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), ay);
  inspect.quat.premultiply(qy).premultiply(qx).normalize();
}

// ---------------------------------------------------------------- pointer

const ray = new T.Raycaster();
const pointer = { x: -1, y: -1, down: false, sx: 0, sy: 0, moved: false, t0: 0, lx: 0, ly: 0 };
let rotating = false, holdTimer = null, pressBook = null;

function pick(x, y, objects) {
  ray.setFromCamera(new T.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
  return ray.intersectObjects(objects, false)[0] || null;
}
const hitsOf = (ball) => [...ball.books.values()].filter((b) => !ball.isOut(b) && !b.leaving).map((b) => b.hit);
function pickBook(x, y) {
  if (!focused) return null;
  const h = pick(x, y, hitsOf(focused));
  return h ? h.object.userData.book : null;
}
function pickBall(x, y) {
  const h = pick(x, y, balls.map((b) => b.proxy));
  return h ? h.object.userData.ball : null;
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  canvas.setPointerCapture(e.pointerId);
  Object.assign(pointer, { down: true, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, t0: performance.now(), x: e.clientX, y: e.clientY });
  pressBook = null;
  if (mode === 'inspect' && held && held.phase === 'hold') {
    rotating = true;
    inspect.vel.set(0, 0); inspect.goalQuat = null;
    // Pressing on the book and holding still picks it up to carry back.
    const h = pick(e.clientX, e.clientY, [held.book.hit]);
    if (h) {
      const ring = $('#hold'); ring.style.left = e.clientX + 'px'; ring.style.top = e.clientY + 'px';
      ring.classList.remove('on'); void ring.getBoundingClientRect(); ring.classList.add('on');
      holdTimer = setTimeout(() => {
        holdTimer = null; ring.classList.remove('on');
        if (!held || held.phase !== 'hold' || pointer.moved) return;
        rotating = false; held.phase = 'carry';
        document.body.classList.remove('inspect');
        hint();
      }, 380);
    }
  } else if (mode === 'focus') {
    const b = pickBook(e.clientX, e.clientY);
    if (b) pressBook = b;
    else dragSpin = true;
  }
  setCursor();
});

canvas.addEventListener('pointermove', (e) => {
  const dx = e.clientX - pointer.lx, dy = e.clientY - pointer.ly;
  pointer.x = e.clientX; pointer.y = e.clientY; pointer.lx = e.clientX; pointer.ly = e.clientY;
  if (pointer.down && Math.hypot(e.clientX - pointer.sx, e.clientY - pointer.sy) > 4) {
    if (!pointer.moved && holdTimer) { clearTimeout(holdTimer); holdTimer = null; $('#hold').classList.remove('on'); }
    pointer.moved = true;
  }
  if (!pointer.down) { hoverAt(e.clientX, e.clientY); return; }
  if (!pointer.moved) return;
  if (held && held.phase === 'hold' && rotating) {
    const k = 0.0095;
    spinHeld(dx * k, dy * k);
    inspect.vel.set(dx * k * 60, dy * k * 60);
    return;
  }
  if (held && (held.phase === 'pull')) {
    const wpp = (2 * Math.tan(T.MathUtils.degToRad(camera.fov) / 2) * cam.dist) / innerHeight;
    held.s = Math.hypot(e.clientX - held.startX, e.clientY - held.startY) * wpp * 1.5 / SCALE;
    return;
  }
  if (held) return;
  if (pressBook && focused) { grab(pressBook, focused, pointer.sx, pointer.sy); pressBook = null; return; }
  if (mode === 'focus' && dragSpin && focused) {
    focused.userVel.set(dx * 0.6, dy * 0.6);
    const qa = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), dx * 0.008);
    const qb = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), dy * 0.008);
    focused.user.premultiply(qa).premultiply(qb).normalize();
    return;
  }
  if (mode === 'overview' || mode === 'favorites') {
    look.yaw = clamp(look.yaw - dx * 0.0032, -0.85, 0.85);
    look.pitch = clamp(look.pitch + dy * 0.0024, -0.06, 0.55);
    updateGoal();
  }
});

function endPointer(e) {
  if (!pointer.down) return;
  pointer.down = false;
  if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; $('#hold').classList.remove('on'); }
  const click = !pointer.moved && performance.now() - pointer.t0 < 1200;
  if (click && !pressBook && mode === 'focus' && !held) pressBook = pickBook(e.clientX, e.clientY);
  rotating = false;
  dragSpin = false;
  if (held) {
    if (held.phase === 'pull') {
      const slot = held.ball.slots.get(held.book.id);
      const e2 = slot.out * (1 - Math.exp(-held.s / (slot.out * 0.8)));
      if (e2 > slot.out * 0.38) { held.auto = true; held.t = e2 / slot.out; } else { held.phase = 'snap'; }
    } else if (held.phase === 'free') toHold();
    else if (held.phase === 'carry') {
      if (held.snap) putBack();
      else { held.phase = 'toHold'; held.t = 0; held.from = held.book.group.position.clone(); held.fromQ = held.book.group.quaternion.clone(); document.body.classList.add('inspect'); held.ball.hotGoal = 0; hint(); }
    }
  } else if (click && mode === 'favorites') {
    const f = pickFavorite(e.clientX, e.clientY);
    if (f) { fav.open = { id: f.id, ball: f.ball }; closeFavorites(); }
    else { const b = pickBall(e.clientX, e.clientY); if (b) focusOn(b); }
  } else if (click) {
    if (pressBook && focused) { grab(pressBook, focused, pointer.sx, pointer.sy); held.auto = true; }
    else {
      const b = pickBall(e.clientX, e.clientY);
      if (b && b !== focused) focusOn(b);
      else if (b && !b.count) showEmpty(b);
    }
  }
  pressBook = null;
  setCursor();
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => { if (!pointer.down) { tip(null); setHover(null); } });
canvas.addEventListener('dblclick', () => { if (held && held.phase === 'hold') setView('front'); });

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const f = Math.exp(e.deltaY * 0.0012);
  if (held && held.phase === 'hold') { inspect.zoom = clamp(inspect.zoom * f, 0.5, 1.9); return; }
  look.zoom = clamp(look.zoom * f, mode === 'focus' ? 0.5 : 0.55, mode === 'focus' ? 2.4 : 1.6);
  updateGoal();
}, { passive: false });

function hoverAt(x, y) {
  if (held) { tip(null); return; }
  if (mode === 'focus') {
    const b = pickBook(x, y);
    setHover(b);
    if (b) tip(b, x, y); else tip(null);
    const other = b ? null : pickBall(x, y);
    hoveredBall = other && other !== focused ? other : null;
  } else if (mode === 'favorites') {
    const f = pickFavorite(x, y);
    setHover(f ? f.book : null);
    if (f) tip(f.book, x, y); else tip(null);
    hoveredBall = null;
  } else if (mode === 'overview') {
    hoveredBall = pickBall(x, y);
    tip(null);
  }
  for (const b of balls) b.hotGoal = held && held.phase === 'carry' ? b.hotGoal : (b === hoveredBall ? 1 : 0);
  setCursor();
}
function setHover(b) {
  if (hovered === b) return;
  if (hovered && focused) { const j = focused.jostle.get(hovered.id); if (j) j.hover = 0; }
  hovered = b;
  if (b && focused) { const j = focused.jostle.get(b.id); if (j) j.hover = 1; }
}
function setCursor() {
  const c = document.body.classList;
  c.remove('grab', 'grabbing', 'point');
  if (pointer.down && (held || dragSpin || mode === 'overview')) c.add('grabbing');
  else if (hovered || hoveredBall) c.add('point');
  else c.add('grab');
}

function tip(book, x, y) {
  const el = $('#tip');
  if (!book) { el.classList.remove('on'); return; }
  el.querySelector('.t').textContent = book.data.title;
  el.querySelector('.a').textContent = book.data.author || '';
  el.style.left = Math.min(x, innerWidth - 300) + 'px'; el.style.top = y + 'px';
  el.classList.add('on');
}


// ---------------------------------------------------------------- favorites rising

// Favorites are not a sculpture. The Favorites button lifts each favorite out
// of the sculpture it lives in: the books rise, weightless, into an arc in
// front of you, in a warm aura with light rising from beneath, and bob there.
// The button again (or Esc) lets them sink back into exactly the slots they
// came from. Click one to hold it.
const easeLevitate = (t) => 1 - Math.pow(1 - t, 5); // ≈ cubic-bezier(0.22, 1, 0.36, 1)
const fav = { on: false, list: [], amt: 0, open: null, queued: false, D: 3, span: 1 };
const halo = (() => {
  const g = new T.Group();
  const add = (mesh) => { mesh.renderOrder = -1; mesh.frustumCulled = false; g.add(mesh); return mesh; };
  const common = { transparent: true, depthWrite: false, blending: T.AdditiveBlending };
  const aura = add(new T.Mesh(new T.PlaneGeometry(1, 1), new T.ShaderMaterial({ ...common,
    uniforms: { uAmt: { value: 0 }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uAmt, uTime; varying vec2 vUv;
      void main(){ vec2 d = (vUv - vec2(0.5, 0.42)) * vec2(1.0, 1.7); float r = length(d);
        float core = exp(-r * r * 9.0), wide = exp(-r * r * 6.0);
        vec3 gold = vec3(1.0, 0.80, 0.52), white = vec3(1.0, 0.97, 0.9);
        float breathe = 0.92 + 0.08 * sin(uTime * 0.9);
        float edge = smoothstep(0.5, 0.18, abs(vUv.x - 0.5)) * smoothstep(0.5, 0.12, abs(vUv.y - 0.5));
        vec3 c = (gold * wide * 0.13 + white * core * 0.10) * edge;
        gl_FragColor = vec4(c * uAmt * breathe, 1.0); }`,
  })));
  const rays = add(new T.Mesh(new T.PlaneGeometry(1, 1), new T.ShaderMaterial({ ...common,
    uniforms: { uAmt: { value: 0 }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uAmt, uTime; varying vec2 vUv;
      float h(float n){ return fract(sin(n) * 43758.5453); }
      void main(){ float x = vUv.x, y = vUv.y; float s = 0.0;
        for (int i = 0; i < 9; i++) { float fi = float(i); float cx = 0.12 + 0.76 * h(fi * 3.1 + 1.0);
          float w = 0.010 + 0.022 * h(fi * 7.7); float lean = (cx - 0.5) * 0.35 * y;
          float band = exp(-pow((x - cx - lean) / w, 2.0));
          float flicker = 0.55 + 0.45 * sin(uTime * (0.6 + h(fi) * 0.9) + fi * 2.3);
          float rise = 0.7 + 0.3 * sin(y * 9.0 - uTime * (1.2 + h(fi + 4.0)) + fi);
          s += band * flicker * rise * (0.5 + 0.5 * h(fi * 1.7)); }
        float fade = smoothstep(0.0, 0.18, y) * pow(1.0 - y, 1.6);
        float edge = smoothstep(0.0, 0.2, x) * smoothstep(1.0, 0.8, x);
        vec3 c = mix(vec3(1.0, 0.82, 0.55), vec3(1.0, 0.98, 0.92), y);
        gl_FragColor = vec4(c * s * fade * edge * 0.09 * uAmt, 1.0); }`,
  })));
  const n = 90, pos = new Float32Array(n * 3), seed = new Float32Array(n), r = rng(77);
  for (let i = 0; i < n; i++) { pos[i * 3] = r() - 0.5; pos[i * 3 + 1] = r(); pos[i * 3 + 2] = (r() - 0.5) * 0.3; seed[i] = r() * 100; }
  const pg = new T.BufferGeometry();
  pg.setAttribute('position', new T.BufferAttribute(pos, 3)); pg.setAttribute('seed', new T.BufferAttribute(seed, 1));
  const specks = new T.Points(pg, new T.ShaderMaterial({ ...common,
    uniforms: { uAmt: { value: 0 }, uTime: { value: 0 }, uPx: motes.uniforms.uPx, uSize: { value: new T.Vector2(1, 1) } },
    vertexShader: `attribute float seed; uniform float uTime, uPx; uniform vec2 uSize; varying float vA;
      void main(){ float sp = 0.06 + 0.08 * fract(seed * 3.7); float y = fract(position.y + uTime * sp);
        vec3 p = vec3((position.x + sin(uTime * 0.7 + seed) * 0.02) * uSize.x, (y - 0.15) * uSize.y, position.z);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = max(1.0, uPx * (0.006 + 0.008 * fract(seed * 5.3)) / -mv.z);
        vA = smoothstep(0.0, 0.2, y) * (1.0 - y) * (0.5 + 0.5 * sin(uTime * 2.0 + seed)); }`,
    fragmentShader: `uniform float uAmt; varying float vA; void main(){ float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)); gl_FragColor = vec4(vec3(1.0, 0.9, 0.7) * a * vA * 0.55 * uAmt, 1.0); }`,
  }));
  add(specks);
  const glowLight = new T.PointLight('#ffd9a0', 0, 6, 1.6);
  g.add(glowLight);
  g.visible = false;
  camera.add(g);
  return { g, aura, rays, specks, glowLight, mats: [aura.material, rays.material, specks.material] };
})();

function favoriteBooks() {
  if (!catalogue) return [];
  const out = [];
  for (const id of catalogue.categories.favorites || []) {
    const ball = balls.find((b) => b.books.has(id) && !b.books.get(id).leaving);
    if (ball) out.push({ id, ball, book: ball.books.get(id) });
  }
  return out;
}

// Where the favorites float: an arc in front of the camera, sized to fit.
function favFrame() {
  const n = Math.max(1, fav.list.length);
  const vfov = T.MathUtils.degToRad(camera.fov), hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  const maxH = Math.max(...fav.list.map((f) => f.book.d.H), 0.22) * SCALE;
  const gap = Math.max(...fav.list.map((f) => f.book.d.W), 0.15) * SCALE * 1.45;
  const span = gap * (n - 1) + gap * 0.9;
  fav.D = Math.max(span / 0.74 / (2 * Math.tan(hfov / 2)), maxH / 0.42 / (2 * Math.tan(vfov / 2)));
  fav.gap = gap; fav.span = span; fav.maxH = maxH;
  const visH = 2 * Math.tan(vfov / 2) * fav.D;
  fav.y = visH * 0.04;
  halo.g.position.set(0, fav.y - maxH * 0.15, -fav.D - 0.25);
  halo.aura.scale.set(span * 1.7 + 1, maxH * 2.6, 1);
  halo.rays.scale.set(span * 1.5 + 0.8, visH * 1.05, 1); halo.rays.position.set(0, visH * 0.18, -0.05);
  halo.specks.material.uniforms.uSize.value.set(span * 1.3 + 0.6, visH * 0.95);
  halo.glowLight.position.set(0, -maxH * 0.55, 0.6);
}
function favTarget(f, t, out) {
  const n = fav.list.length, k = n > 1 ? f.i / (n - 1) * 2 - 1 : 0;
  const bob = Math.sin(t * 1.05 + f.i * 1.3) * 0.022 * (motionOn ? 1 : 0);
  out.pos.set(k * (fav.span - fav.gap * 0.9) / 2, fav.y - k * k * fav.maxH * 0.09 + bob, -fav.D + k * k * 0.18).applyMatrix4(camera.matrixWorld);
  const sway = Math.sin(t * 0.7 + f.i * 2.1) * 0.035 * (motionOn ? 1 : 0);
  out.quat.copy(camera.quaternion).multiply(tmpQf.setFromEuler(tmpE.set(0.02 + sway * 0.4, -k * 0.28 + sway, sway * 0.3)));
  return out;
}
const tmpQf = new T.Quaternion(), tmpE = new T.Euler(), tmpM = new T.Matrix4(), tmpS = new T.Vector3();
const slotPose = (f, out) => {
  const s = f.ball.slots.get(f.id);
  f.ball.spin.updateMatrixWorld(true);
  tmpM.compose(s.pos, s.quat, tmpS.set(1, 1, 1)).premultiply(f.ball.spin.matrixWorld).decompose(out.pos, out.quat, out.scl);
  return out;
};
const pose = () => ({ pos: new T.Vector3(), quat: new T.Quaternion(), scl: new T.Vector3() });

function openFavorites() {
  if (fav.on) return;
  if (held) { putBack(); fav.queued = true; return; }
  const list = favoriteBooks();
  if (!list.length) { toast('No favorites yet. Hold a book and choose Add to Favorites.'); return; }
  if (focused) { focused = null; look.yaw = 0; look.pitch = 0; look.zoom = 1; }
  mode = 'favorites';
  fav.on = true; fav.open = null;
  fav.list = list.map((f, i) => ({ ...f, i, phase: 'up', t: -i * 0.11, from: pose(), to: pose() }));
  favFrame();
  for (const f of fav.list) {
    const g = f.book.group;
    slotPose(f, f.from);
    scene.attach(g);
    g.position.copy(f.from.pos); g.quaternion.copy(f.from.quat);
    f.book.setDetail(true);
    const j = f.ball.jostle.get(f.id); if (j) { j.x = 0; j.v = 0; j.hover = 0; }
  }
  setHover(null); tip(null);
  halo.g.visible = true;
  document.body.classList.add('favorites');
  updateGoal(); crumb(); hint(); labels(); favButton();
}
function closeFavorites() {
  if (!fav.on) return;
  fav.on = false;
  for (const f of fav.list) if (f.phase !== 'home') { f.phase = 'down'; f.t = -(fav.list.length - 1 - f.i) * 0.07; f.from.pos.copy(f.book.group.position); f.from.quat.copy(f.book.group.quaternion); f.from.scl.copy(f.book.group.scale); }
  setHover(null); tip(null);
  document.body.classList.remove('favorites');
  mode = 'overview';
  updateGoal(); crumb(); hint(); favButton();
}
function updateFavorites(dt, t) {
  fav.amt = lerp(fav.amt, fav.on ? 1 : 0, damp(fav.on ? 1.6 : 3, dt));
  for (const m of halo.mats) { m.uniforms.uAmt.value = fav.amt; m.uniforms.uTime.value = t; }
  halo.glowLight.intensity = fav.amt * 1.3;
  halo.g.visible = fav.amt > 0.003;
  if (!fav.list.length) return;
  if (fav.on) favFrame();
  const cur = pose();
  for (const f of fav.list) {
    const g = f.book.group;
    if (f.phase === 'up' || f.phase === 'float') {
      favTarget(f, t, f.to);
      if (f.phase === 'up') {
        f.t += dt / 1.6;
        const e = easeLevitate(clamp(f.t, 0, 1));
        slotPose(f, f.from);
        // Out of the sculpture along its own face first, then up into the light.
        const lift = Math.sin(Math.PI * Math.min(1, e * 1.2)) * 0.25;
        g.position.lerpVectors(f.from.pos, f.to.pos, e).y += lift * (1 - e);
        g.quaternion.slerpQuaternions(f.from.quat, f.to.quat, e);
        if (f.t >= 1) f.phase = 'float';
      } else {
        g.position.lerp(f.to.pos, damp(6, dt));
        g.quaternion.slerp(f.to.quat, damp(6, dt));
      }
    } else if (f.phase === 'down') {
      f.t += dt / 1.15;
      const e = ease(clamp(f.t, 0, 1));
      slotPose(f, cur);
      g.position.lerpVectors(f.from.pos, cur.pos, e);
      g.quaternion.slerpQuaternions(f.from.quat, cur.quat, e);
      if (f.t >= 1) homeFavorite(f);
    }
  }
  if (!fav.on && fav.list.every((f) => f.phase === 'home')) {
    const open = fav.open;
    fav.list = []; fav.open = null;
    if (open) { const b = open.ball.books.get(open.id); focusOn(open.ball); if (b && !b.leaving) { grab(b, open.ball, innerWidth / 2, innerHeight / 2); held.auto = true; } }
  }
}
// Back in its slot, exactly as it was.
function homeFavorite(f) {
  const g = f.book.group, s = f.ball.slots.get(f.id);
  f.ball.spin.add(g);
  g.position.copy(s.pos); g.quaternion.copy(s.quat); g.scale.setScalar(1);
  const j = f.ball.jostle.get(f.id); if (j) { j.x = 0; j.v = 0; j.hover = 0; }
  f.phase = 'home';
  if (f.ball.pending && ![...f.ball.books.values()].some((b) => f.ball.isOut(b) && !b.leaving)) f.ball.sync(f.ball.pending, catalogue);
}
function pickFavorite(x, y) {
  const live = fav.list.filter((f) => f.phase === 'float' || f.phase === 'up');
  const h = pick(x, y, live.map((f) => f.book.hit));
  return h ? live.find((f) => f.book.hit === h.object) : null;
}
function favButton() {
  const el = $('#favbtn');
  const n = catalogue ? (catalogue.categories.favorites || []).length : 0;
  el.querySelector('.n').textContent = n || '';
  el.querySelector('.l').textContent = fav.on ? 'Put them back' : 'Favorites';
  el.classList.toggle('on', fav.on);
  el.setAttribute('aria-pressed', String(fav.on));
}
$('#favbtn').addEventListener('click', () => (fav.on ? closeFavorites() : openFavorites()));

// ---------------------------------------------------------------- moving between sculptures

function focusOn(b) {
  if (held) return;
  if (fav.on) closeFavorites();
  focused = b;
  mode = 'focus';
  look.yaw = 0; look.pitch = 0; look.zoom = 1;
  updateGoal();
  coverQueue.sort((a, c) => focusedHas(c) - focusedHas(a));
  crumb(); hint(); labels();
}
function overview() {
  if (held) { putBack(); return; }
  if (fav.on) { closeFavorites(); return; }
  focused = null; mode = 'overview';
  look.yaw = 0; look.pitch = 0; look.zoom = 1;
  setHover(null); tip(null);
  updateGoal();
  crumb(); hint(); labels();
}
function step(dir) {
  const list = balls;
  const i = focused ? list.indexOf(focused) : dir > 0 ? -1 : list.length;
  focusOn(list[(i + dir + list.length) % list.length]);
}

addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (held) putBack(); else if (fav.on) closeFavorites(); else if (focused) overview(); }
  else if (held && held.phase === 'hold') {
    const views = { f: 'front', b: 'back', s: 'spine', e: 'edges' };
    if (views[e.key.toLowerCase()]) setView(views[e.key.toLowerCase()]);
    if (e.key === 'ArrowLeft') { inspect.goalQuat = null; spinHeld(-Math.PI / 4, 0); }
    if (e.key === 'ArrowRight') { inspect.goalQuat = null; spinHeld(Math.PI / 4, 0); }
    if (e.key === 'ArrowUp') { inspect.goalQuat = null; spinHeld(0, -Math.PI / 4); }
    if (e.key === 'ArrowDown') { inspect.goalQuat = null; spinHeld(0, Math.PI / 4); }
  } else if (!held && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) step(e.key === 'ArrowRight' ? 1 : -1);
});
$('#home').addEventListener('click', overview);
$('#back').addEventListener('click', putBack);
function setView(v) { inspect.goalQuat = VIEWS[v].clone(); inspect.vel.set(0, 0); }

// ---------------------------------------------------------------- words on screen

function crumb() {
  const el = $('#crumb');
  el.querySelectorAll('.sep, .here').forEach((n) => n.remove());
  if (focused) el.insertAdjacentHTML('beforeend', `<span class="sep">/</span><span class="here">${esc(focused.cat.name)}</span>`);
  else if (fav.on) el.insertAdjacentHTML('beforeend', '<span class="sep">/</span><span class="here">Favorites</span>');
}

function hint() {
  const el = $('#hint');
  let h = '';
  if (held && held.phase === 'carry') h = 'Bring it to its sculpture and let go';
  else if (mode === 'inspect') h = 'Drag to turn it &nbsp;·&nbsp; scroll to bring it closer &nbsp;·&nbsp; press and hold, then drag it back &nbsp;·&nbsp; <kbd>esc</kbd> puts it back';
  else if (mode === 'favorites') h = 'Your favorites &nbsp;·&nbsp; click one to hold it &nbsp;·&nbsp; <kbd>esc</kbd> lets them settle back';
  else if (mode === 'focus') h = 'Drag a book out to hold it &nbsp;·&nbsp; drag around the sculpture to turn it &nbsp;·&nbsp; <kbd>←</kbd> <kbd>→</kbd> next sculpture &nbsp;·&nbsp; <kbd>esc</kbd> step back';
  else h = 'Choose a sculpture to approach it &nbsp;·&nbsp; drag to look around &nbsp;·&nbsp; scroll to step closer';
  el.innerHTML = h;
}

function labels() {
  const data = catalogue;
  for (const b of balls) {
    const src = data ? data.sources : {};
    let note = '';
    if (!b.count) note = b.cat.empty;
    else if (b.cat.key === 'read' && src.goodreads && src.goodreads.partial && src.goodreads.profileCounts && src.goodreads.profileCounts.read > b.count) note = `${b.count} of ${src.goodreads.profileCounts.read} · the rest arrive with your Goodreads export`;
    b.label.innerHTML = `<div class="name">${esc(b.cat.name)}</div><div class="count">${b.count || 0}</div>${note ? `<div class="note">${esc(note)}</div>` : ''}`;
  }
}

function placeLabels() {
  for (const b of balls) {
    const p = b.root.position.clone(); p.y -= b.worldR + 0.16;
    const s = p.project(camera);
    b.label.style.left = ((s.x + 1) / 2 * innerWidth) + 'px';
    b.label.style.top = ((1 - s.y) / 2 * innerHeight) + 'px';
    b.label.classList.toggle('gone', s.z > 1 || mode === 'inspect' || (held && held.phase === 'carry' && b !== held.ball) || (mode === 'focus' && b === focused));
    b.label.classList.toggle('dim', mode === 'focus' && b !== focused);
    b.label.classList.toggle('hot', b.hot > 0.5);
  }
}

const STARS = (n) => { const r = Math.round(n * 2) / 2; let s = ''; for (let i = 1; i <= 5; i++) s += i <= r ? '★' : (i - 0.5 === r ? '⯪' : '<i>★</i>'); return `<span class="stars">${s}</span>`; };

function showPanel(book, ball) {
  const d = book.data;
  const [title, ...rest] = String(d.title || '').split(/:\s+/);
  const sub = rest.join(': ');
  const facts = [];
  if (d.avgRating) facts.push(['Goodreads', `${STARS(d.avgRating)}&nbsp; ${d.avgRating.toFixed(2)}${d.ratingsCount ? ` <span style="color:var(--faint)">· ${d.ratingsCount.toLocaleString()} ratings</span>` : ''}`]);
  if (d.myRating) facts.push(['Your rating', STARS(d.myRating)]);
  if (d.genres && d.genres.length) facts.push(['Genre', esc(d.genres.slice(0, 3).join(', '))]);
  if (d.year) facts.push(['Published', esc(d.year < 0 ? `${-d.year} BC` : d.year) + (d.editionYear && d.editionYear !== d.year ? ` <span style="color:var(--faint)">· this edition ${d.editionYear}</span>` : '')]);
  if (d.format || d.pages) facts.push(['Edition', esc([d.format, d.pages ? `${d.pages} pages` : '', d.publisher].filter(Boolean).join(' · '))]);
  if (d.dateRead) facts.push(['Finished', esc(new Date(d.dateRead).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }))]);
  else if (d.dateAdded && d.shelf === 'currently-reading') facts.push(['Started', esc(new Date(d.dateAdded).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }))]);
  if (d.price && d.wishlist) facts.push(['On Amazon', `$${d.price.toFixed(2)}`]);
  const desc = d.review ? `“${d.review}”\n\n${d.description || ''}` : (d.description || '');
  const coverNote = book.coverIsReal || d.cover
    ? `Front cover from ${esc(d.coverSource || 'Goodreads')}. The spine and back are drawn from the book’s details, not photographed.`
    : 'No cover image was found, so the cover, spine and back are drawn from the book’s details.';
  const links = [d.goodreadsUrl && `<button class="link" data-open="${esc(d.goodreadsUrl)}">Goodreads ↗</button>`, d.amazonUrl && `<button class="link" data-open="${esc(d.amazonUrl)}">Amazon ↗</button>`].filter(Boolean).join('');
  $('#panel').innerHTML = `
    <div class="status">${esc(d.status || ball.cat.name)}</div>
    <h1>${esc(title)}</h1>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}
    <div class="by">${esc((d.authors && d.authors.length ? d.authors : [d.author]).filter(Boolean).join(', '))}</div>
    <dl class="facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    <div class="desc">${esc(desc) || '<span style="color:var(--faint)">No description yet.</span>'}</div>
    <div class="row">
      <button class="fav ${d.favorite ? 'on' : ''}" id="fav"><svg viewBox="0 0 14 14"><path d="M7 12.2 1.9 7.3A3 3 0 0 1 7 3.2a3 3 0 0 1 5.1 4.1z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg><span>${d.favorite ? 'In Favorites' : 'Add to Favorites'}</span></button>
      <div class="views"><button data-view="front">Front</button><button data-view="spine">Spine</button><button data-view="back">Back</button><button data-view="edges">Edges</button></div>
    </div>
    <div class="row">${links}</div>
    <div class="note">${coverNote}</div>`;
  $('#panel').querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  $('#panel').querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => send({ type: 'open', url: b.dataset.open })));
  $('#fav').addEventListener('click', () => {
    const on = !book.data.favorite;
    book.data = { ...book.data, favorite: on };
    $('#fav').classList.toggle('on', on);
    $('#fav span').textContent = on ? 'In Favorites' : 'Add to Favorites';
    send({ type: 'favorite', id: book.id, on });
  });
}

let toastTimer = null;
function toast(text, err) {
  const el = $('#toast');
  el.textContent = text; el.classList.toggle('err', !!err); el.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 5200);
}

function showEmpty(ball) {
  const el = $('#empty');
  const how = {
    read: 'On Goodreads, choose My Books › Import and export › Export Library, then drop the CSV here.',
    reading: 'Books on your Goodreads currently-reading shelf appear here.',
    favorites: 'Hold any book and choose Add to Favorites. It stays on its own shelf too.',
  }[ball.cat.key];
  el.innerHTML = `${esc(how)}<br>${ball.cat.key === 'favorites' || ball.cat.key === 'reading' ? '' : '<button id="choose">Choose a file…</button>'}`;
  el.classList.add('on');
  el.querySelector('#choose')?.addEventListener('click', () => send({ type: 'import-file' }));
  clearTimeout(showEmpty.t); showEmpty.t = setTimeout(() => el.classList.remove('on'), 9000);
}

// ---------------------------------------------------------------- data from Feng Shui

function applyData(data) {
  catalogue = data;
  for (const b of balls) {
    const ids = (data.categories[b.cat.key] || []).filter((id) => data.books[id]);
    b.sync(ids.map((id) => data.books[id]), data);
  }
  layoutBalls();
  updateGoal();
  labels();
  favButton();
  pumpCovers();
  $('#status').textContent = data.status || '';
  const total = balls.reduce((a, b) => a + b.count, 0);
  if (!total) { $('#empty').innerHTML = 'Your Library is empty. Drop your Goodreads export (.csv) here.<br><button id="choose">Choose a file…</button>'; $('#empty').classList.add('on'); $('#empty #choose').addEventListener('click', () => send({ type: 'import-file' })); }
  if (held) { const fresh = data.books[held.book.id]; if (fresh) held.book.data = { ...fresh }; }
}

addEventListener('message', (e) => {
  const m = e.data;
  if (!m || typeof m !== 'object') return;
  if (m.type === 'data' && m.data) applyData(m.data);
  if (m.type === 'settings') { motionOn = m.motion !== 'still'; }
  if (m.type === 'imported' && m.result) { if (m.result.ok) toast(`Added to your Library — ${m.result.what}`); else if (!m.result.canceled) toast(m.result.error || 'That file couldn’t be read.', true); }
  if (m.type === 'synced' && m.result && !m.result.ok) toast(m.result.error, true);
  if (m.type === 'error') toast(m.error, true);
});

// Files dropped anywhere on the Library.
let dragDepth = 0;
addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; document.body.classList.add('dropping'); });
addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dropping'); } });
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', async (e) => {
  e.preventDefault(); dragDepth = 0; document.body.classList.remove('dropping');
  for (const f of e.dataTransfer.files) {
    if (f.size > 60 * 1024 * 1024) { toast(`${f.name} is too large.`, true); continue; }
    send({ type: 'import-text', name: f.name, text: await f.text() });
  }
});
addEventListener('contextmenu', (e) => { e.preventDefault(); send({ type: 'menu' }); });

// ---------------------------------------------------------------- frame

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.resolution.set(w / 2, h / 2);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  motes.uniforms.uPx.value = h * renderer.getPixelRatio() / (2 * Math.tan(T.MathUtils.degToRad(camera.fov) / 2));
  updateGoal();
}
addEventListener('resize', resize);

const clock = new T.Clock();
let elapsed = 0;
let manual = false; // tests step time by hand
function frame(fixed, draw = true) {
  const dt = fixed ?? Math.min(clock.getDelta(), 1 / 20);
  if (draw) renderer.info.reset();
  elapsed += dt;
  const motion = motionOn ? 1 : 0;
  if (!held || held.phase === 'back') lightLevel = lerp(lightLevel, mode === 'inspect' ? 0.32 : mode === 'favorites' ? 0.34 : 1, damp(2.5, dt));
  for (const b of balls) b.update(dt, elapsed, motion);
  placeCamera(dt);
  updateHeld(dt);
  updateFavorites(dt, elapsed);
  if (fav.queued && !held) { fav.queued = false; openFavorites(); }
  const holding = held && ['toHold', 'hold', 'carry'].includes(held.phase) ? 1 : 0;
  holdKey.intensity = lerp(holdKey.intensity, holding * 2.4, damp(4, dt));
  holdFill.intensity = lerp(holdFill.intensity, holding * 0.7, damp(4, dt));
  holdRim.intensity = lerp(holdRim.intensity, holding * 2.2, damp(4, dt));
  hemi.intensity = 0.42 * lightLevel; key.intensity = 1.25 * lightLevel;
  scene.environmentIntensity = 0.22 * (0.6 + 0.4 * lightLevel);
  motes.uniforms.uTime.value = elapsed * motion + 1;
  motes.uniforms.uAmt.value = lightLevel;
  slitMat.uniforms.uAmt.value = 0.5 + 0.5 * lightLevel;
  if (hovered && !held && fav.on) hovered.setGlow(lerp(hovered.hoverT, 1, damp(10, dt)));
  if (hovered && !held && focused) { const j = focused.jostle.get(hovered.id); hovered.setGlow(lerp(hovered.hoverT, 1, damp(10, dt))); if (j) j.hover = 1; }
  for (const b of balls) for (const bk of b.books.values()) if (bk !== hovered && bk.hoverT > 0) bk.setGlow(lerp(bk.hoverT, 0, damp(8, dt)));
  if (!draw) return;
  placeLabels();
  composer.render();
}
renderer.setAnimationLoop(() => { if (!document.hidden && !manual) frame(); });

resize();
layoutBalls();
updateGoal();
Object.assign(cam, { yaw: goal.yaw, pitch: goal.pitch + 0.12, dist: goal.dist * 1.25 }); cam.target.copy(goal.target);
crumb(); hint(); labels();
send({ type: 'ready' });

// For tests and for poking at it from the console.
window.__library = {
  get mode() { return mode; }, get held() { return held && { id: held.book.id, phase: held.phase, ball: held.ball.cat.key }; },
  balls: () => balls.map((b) => ({ key: b.cat.key, count: b.count, R: b.worldR, screen: screenCircle(b) })),
  focusOn: (key) => focusOn(balls.find((b) => b.cat.key === key)),
  overview, putBack, setView,
  // Where a book of a sculpture is on screen now (its centre), and whether it's in its exact slot.
  bookScreen(key, id) {
    const ball = balls.find((b) => b.cat.key === key); const b = ball.books.get(id);
    const p = new T.Vector3(); b.group.getWorldPosition(p); p.project(camera);
    return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight };
  },
  visibleBooks(key) {
    const ball = balls.find((b) => b.cat.key === key);
    const camDir = new T.Vector3(); camera.getWorldDirection(camDir);
    return [...ball.books.values()].map((b) => {
      const p = new T.Vector3(); b.group.getWorldPosition(p);
      const n = ball.slots.get(b.id).normal.clone().transformDirection(ball.spin.matrixWorld);
      const s = p.clone().project(camera);
      return { id: b.id, title: b.data.title, facing: -n.dot(camDir), x: (s.x + 1) / 2 * innerWidth, y: (1 - s.y) / 2 * innerHeight };
    }).sort((a, b) => b.facing - a.facing);
  },
  slotCheck(key, id) {
    const ball = balls.find((b) => b.cat.key === key); const b = ball.books.get(id); const s = ball.slots.get(id);
    return { inSlot: b.group.parent === ball.spin, dPos: b.group.position.distanceTo(s.pos), dRot: b.group.quaternion.angleTo(s.quat), scale: b.group.scale.x, objectId: b.group.id };
  },
  // Pairs of books in a sculpture whose solid boxes touch (should be none), and the narrowest gap.
  collisions() {
    const out = {};
    for (const ball of balls) {
      const boxes = [...ball.slots.entries()].map(([id, s]) => { const d = ball.books.get(id).d; const ax = [new T.Vector3(1, 0, 0), new T.Vector3(0, 1, 0), new T.Vector3(0, 0, 1)].map((v) => v.applyQuaternion(s.quat)); return { c: s.pos, ax, h: [d.W / 2, d.H / 2, d.T / 2] }; });
      let n = 0;
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (boxesOverlap(boxes[i], boxes[j], 0)) n++;
      out[ball.cat.key] = { books: boxes.length, touching: n, R: +ball.R.toFixed(3) };
    }
    return out;
  },
  get favorites() { return { on: fav.on, books: fav.list.map((f) => ({ id: f.id, ball: f.ball.cat.key, phase: f.phase, title: f.book.data.title })) }; },
  openFavorites, closeFavorites,
  favoriteScreen(i) { const f = fav.list[i]; if (!f) return null; const p = f.book.group.getWorldPosition(new T.Vector3()).project(camera); return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight }; },
  pickAt(x, y) { const b = pickBook(x, y); return b ? b.data.title : null; },
  objectId(key, id) { return balls.find((b) => b.cat.key === key).books.get(id).group.id; },
  hasFullModel(key, id) { const b = balls.find((x) => x.cat.key === key).books.get(id); return { detailed: b.detailed, meshes: b.detail.children.length, kind: b.d.kind }; },
  // Runs the Library for some seconds of its own time at 30 frames a second, then draws once.
  advance(sec) { manual = true; clock.getDelta(); for (let i = 0; i < Math.round(sec * 30); i++) frame(1 / 30, false); frame(0, true); },
  stats: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, textures: renderer.info.memory.textures }),
};
