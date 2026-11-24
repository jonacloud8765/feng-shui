// Music Player: the SoundCloud tracks of up to three artists, played in a 3D
// scene. The record being played sits half out of its sleeve and spins, with
// a ring around it for how far in the track is; below it, a cover flow of the
// list you're browsing. The light and the backdrop take the cover's colours.
//
// The widget (widgets/records.js) fetches the artists' tracks and posts them
// in; SoundCloud's own embedded player (hidden) does the playing.

import * as T from './three.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const PI = Math.PI;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const fmt = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const parseDur = (s) => { const p = String(s || '').split(':').map(Number); if (p.some(isNaN) || !p.length) return 0; return p.reduce((a, v) => a * 60 + v, 0) * 1000; };
const bigArt = (u) => (u ? u.replace(/-(t\d+x\d+|large|small|crop)\./, '-t500x500.') : '');
const send = (msg) => { if (parent !== window) parent.postMessage(msg, '*'); };

// ---------------------------------------------------------------- state
const prefs = { volume: 80, muted: false, shuffle: false, repeat: 'off', tab: 'all', list: false, last: '' };
try { Object.assign(prefs, JSON.parse(localStorage.getItem('musicPlayer') || '{}')); } catch {}
const savePrefs = () => { try { localStorage.setItem('musicPlayer', JSON.stringify(prefs)); } catch {} };
let autoplay = true;
let artists = []; // [{ name, profile, avatar, tracks: [track] }]
let all = []; // every track, each { id, title, url, art, dur, artist }
let shown = []; // the tab and search applied
let query = '';
// What's playing and what plays after it: the list it was started from, in order (or shuffled).
const ctx = { list: [], order: [], pos: -1 };
const np = { track: null, playing: false, loading: false, pos: 0, dur: 0, progress: 0 };
const history = [];

// ---------------------------------------------------------------- renderer
const canvas = $('#c');
const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = T.SRGBColorSpace;
const scene = new T.Scene();
const camera = new T.PerspectiveCamera(32, 1, 0.1, 100);
const pmrem = new T.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new T.RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;
const composer = new T.EffectComposer(renderer);
composer.addPass(new T.RenderPass(scene, camera));
const bloom = new T.UnrealBloomPass(new T.Vector2(256, 256), 0.32, 0.6, 0.86);
composer.addPass(bloom);
composer.addPass(new T.OutputPass());

// The palette everything eases toward: from the cover that's playing.
const pal = { a: new T.Color('#ff8a5c'), b: new T.Color('#5c4bff'), ta: new T.Color('#ff8a5c'), tb: new T.Color('#5c4bff') };

// Backdrop: a big inside-out sphere, dark, with the palette glowing softly behind the record.
const sky = new T.Mesh(new T.SphereGeometry(40, 48, 24), new T.ShaderMaterial({
  side: T.BackSide, depthWrite: false,
  uniforms: { uA: { value: pal.a }, uB: { value: pal.b }, uT: { value: 0 }, uE: { value: 0 } },
  vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
  fragmentShader: `
    uniform vec3 uA, uB; uniform float uT, uE; varying vec3 vD;
    void main(){
      vec3 d = normalize(vD);
      float back = clamp(-d.z, 0., 1.);
      vec2 p = vec2(d.x, d.y) / max(0.2, back);
      float g1 = exp(-dot(p - vec2(-0.12 + 0.05 * sin(uT * 0.13), 0.12), p - vec2(-0.12 + 0.05 * sin(uT * 0.13), 0.12)) * 5.0);
      float g2 = exp(-dot(p - vec2(0.38, -0.16 + 0.05 * cos(uT * 0.11)), p - vec2(0.38, -0.16 + 0.05 * cos(uT * 0.11))) * 3.2);
      vec3 c = vec3(0.016, 0.016, 0.024);
      c += uA * g1 * (0.22 + 0.08 * uE) * back + uB * g2 * (0.16 + 0.06 * uE) * back;
      c += uB * 0.025 * (1. - abs(d.y));
      // A faint floor fade below the flow.
      c *= 1. - 0.55 * smoothstep(0.0, -0.5, d.y);
      gl_FragColor = vec4(c, 1.);
    }`,
}));
scene.add(sky);

scene.add(new T.HemisphereLight('#bcc4ff', '#100c0a', 0.5));
const key = new T.DirectionalLight('#ffffff', 2.2); key.position.set(2.5, 3.5, 4); scene.add(key);
const rimA = new T.PointLight(pal.a.clone(), 9, 9, 2); rimA.position.set(-2.6, 1.6, -0.6); scene.add(rimA);
const rimB = new T.PointLight(pal.b.clone(), 7, 9, 2); rimB.position.set(2.8, -0.2, -0.4); scene.add(rimB);

// ---------------------------------------------------------------- textures
const loader = new T.TextureLoader();
loader.setCrossOrigin('anonymous');
const texCache = new Map();
function tex(url, then) {
  if (!url) return null;
  let e = texCache.get(url);
  if (!e) {
    e = { t: null, wait: [] };
    texCache.set(url, e);
    loader.load(url, (t) => {
      t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
      e.t = t; for (const f of e.wait) f(t); e.wait = [];
    }, undefined, () => { e.failed = true; });
  }
  if (e.t) { then?.(e.t); return e.t; }
  if (then) e.wait.push(then);
  return null;
}
// The cover's two strongest colours (an average and its most vivid pixel), for the light.
function paletteOf(img) {
  try {
    const n = 24, c = document.createElement('canvas'); c.width = c.height = n;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, n, n);
    const d = g.getImageData(0, 0, n, n).data;
    let r = 0, gg = 0, b = 0, best = null, bs = -1, best2 = null, bs2 = -1;
    const hsl = {}, col = new T.Color();
    for (let i = 0; i < d.length; i += 4) {
      r += d[i]; gg += d[i + 1]; b += d[i + 2];
      col.setRGB(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, T.SRGBColorSpace).getHSL(hsl);
      const s = hsl.s * (1 - Math.abs(hsl.l - 0.5) * 1.6);
      if (s > bs) { bs2 = bs; best2 = best; bs = s; best = { ...hsl }; }
      else if (s > bs2 && best && Math.abs(hsl.h - best.h) > 0.12) { bs2 = s; best2 = { ...hsl }; }
    }
    const m = d.length / 4;
    const avg = new T.Color().setRGB(r / m / 255, gg / m / 255, b / m / 255, T.SRGBColorSpace).getHSL({});
    const A = best ? new T.Color().setHSL(best.h, clamp(best.s, 0.45, 0.95), 0.55) : new T.Color('#ff8a5c');
    const B = best2 ? new T.Color().setHSL(best2.h, clamp(best2.s, 0.4, 0.9), 0.5) : new T.Color().setHSL((avg.h + 0.5) % 1, 0.55, 0.5);
    return [A, B];
  } catch { return null; }
}

// ---------------------------------------------------------------- the record
const hero = new T.Group();
scene.add(hero);
hero.position.set(0, 0.55, 0);
hero.scale.setScalar(0.74);
hero.rotation.set(-0.05, -0.14, 0);
const SLEEVE = 1.62, R = 0.78;
const sleeveFace = new T.MeshBasicMaterial({ color: '#222228', toneMapped: false });
const sleeveSide = new T.MeshStandardMaterial({ color: '#1a1a1f', roughness: 0.7 });
const sleeve = new T.Mesh(new T.BoxGeometry(SLEEVE, SLEEVE, 0.022), [sleeveSide, sleeveSide, sleeveSide, sleeveSide, sleeveFace, sleeveSide]);
hero.add(sleeve);
// A soft shadow of the sleeve on the record behind it.
const vinylMat = new T.ShaderMaterial({
  uniforms: {
    uLabel: { value: null }, uHas: { value: 0 }, uR: { value: R }, uA: { value: pal.a }, uB: { value: pal.b },
    uRight: { value: new T.Vector3(1, 0, 0) }, uUp: { value: new T.Vector3(0, 1, 0) }, uC: { value: new T.Vector3() },
  },
  vertexShader: `
    varying vec3 vL; varying vec3 vW;
    void main(){ vL = position; vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `
    uniform sampler2D uLabel; uniform float uHas, uR; uniform vec3 uA, uB, uRight, uUp, uC;
    varying vec3 vL; varying vec3 vW;
    void main(){
      float r = length(vL.xz) / uR;
      if (r < 0.022) { gl_FragColor = vec4(0.005, 0.005, 0.006, 1.); return; }
      if (r < 0.36) {
        vec2 uv = vL.xz / (uR * 0.72) + 0.5;
        vec3 lab = uHas > 0.5 ? texture2D(uLabel, uv).rgb : mix(uA, uB, uv.y) * 0.8;
        lab = pow(lab, vec3(2.2));
        float edge = smoothstep(0.35, 0.345, r);
        gl_FragColor = vec4(lab * (0.85 + 0.15 * edge), 1.);
        #include <colorspace_fragment>
        return;
      }
      // Grooves, with the two streaks of light a record has, fixed while it turns.
      vec3 d = vW - uC;
      float a = atan(dot(d, uUp), dot(d, uRight));
      float groove = 0.5 + 0.5 * sin(r * 1500.);
      float band = smoothstep(0.38, 0.4, r) * (1. - smoothstep(0.95, 0.97, r));
      float gap = 1. - 0.6 * (smoothstep(0.62, 0.625, r) - smoothstep(0.635, 0.64, r)) - 0.6 * (smoothstep(0.8, 0.805, r) - smoothstep(0.815, 0.82, r));
      float s1 = pow(abs(cos(a - 0.75)), 26.) ;
      float streak = s1 * (0.55 + 0.45 * groove) * band * gap;
      vec3 c = vec3(0.012, 0.012, 0.016) + vec3(0.03) * groove * band;
      c += mix(vec3(1.), mix(uA, uB, 0.5 + 0.5 * sin(a)), 0.45) * streak * 0.55;
      c += vec3(0.02) * smoothstep(0.97, 1., r);
      gl_FragColor = vec4(c, 1.);
    }`,
});
const rimMat = new T.MeshStandardMaterial({ color: '#0b0b0e', roughness: 0.35, metalness: 0.2 });
const disc = new T.Mesh(new T.CylinderGeometry(R, R, 0.012, 160, 1), [rimMat, vinylMat, vinylMat]);
disc.rotation.x = PI / 2;
const spinner = new T.Group();
spinner.add(disc);
const slider = new T.Group(); // slides the record out of the sleeve
slider.add(spinner);
slider.position.z = -0.03;
hero.add(slider);
// How far in: a thin arc round the record.
const ringGeo = new T.RingGeometry(R + 0.045, R + 0.058, 180, 1, PI / 2, -0.0001);
const ringMat = new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, toneMapped: false, side: T.DoubleSide });
const ring = new T.Mesh(ringGeo, ringMat);
const ringTrack = new T.Mesh(new T.RingGeometry(R + 0.045, R + 0.058, 180), new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.1, side: T.DoubleSide }));
slider.add(ringTrack, ring);
ring.position.z = ringTrack.position.z = -0.02;
let ringShown = -1;
function paintRing(p) {
  const q = Math.round(p * 720) / 720;
  if (q === ringShown) return;
  ringShown = q;
  ring.geometry.dispose();
  ring.geometry = new T.RingGeometry(R + 0.045, R + 0.058, Math.max(8, Math.ceil(180 * q)), 1, PI / 2, -Math.max(0.0001, q * PI * 2));
}
const heroAnim = { slide: 0.32, spin: 0, speed: 0, lift: 0, swap: 1, label: null };

// ---------------------------------------------------------------- the cover flow
const FLOW_N = 15; // drawn at once, either side of the focus
const flow = { focus: 0, to: 0, items: [], y: -0.66, size: 0.52 };
const reflGeo = new T.PlaneGeometry(1, 1);
const coverGeo = new T.PlaneGeometry(1, 1);
const placeholder = new T.Color('#24242b');
function makeCover() {
  const g = new T.Group();
  const front = new T.Mesh(coverGeo, new T.MeshBasicMaterial({ color: placeholder.clone(), toneMapped: false, transparent: true }));
  const refl = new T.Mesh(reflGeo, new T.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { map: { value: null }, uHas: { value: 0 }, uO: { value: 0.22 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `uniform sampler2D map; uniform float uHas, uO; varying vec2 vUv;
      void main(){ vec3 c = uHas > 0.5 ? texture2D(map, vec2(vUv.x, 1. - vUv.y)).rgb : vec3(0.14); float f = smoothstep(0.45, 1.0, vUv.y); gl_FragColor = vec4(c * 0.8, f * uO);
        #include <colorspace_fragment>
      }`,
  }));
  refl.position.y = -1.02;
  const glow = new T.Mesh(coverGeo, new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, toneMapped: false }));
  glow.scale.setScalar(1.05); glow.position.z = -0.004;
  g.add(glow, front, refl);
  g.userData = { front, refl, glow, idx: -1, url: '' };
  front.userData.cover = g;
  scene.add(g);
  return g;
}
for (let i = 0; i < FLOW_N; i++) flow.items.push(makeCover());
function setCoverArt(c, track) {
  const url = track?.art || '';
  if (c.userData.url === url) return;
  c.userData.url = url;
  const { front, refl } = c.userData;
  front.material.map = null; front.material.color.copy(placeholder); front.material.needsUpdate = true;
  refl.material.uniforms.uHas.value = 0;
  if (!url) return;
  tex(url, (t) => {
    if (c.userData.url !== url) return;
    front.material.map = t; front.material.color.set('#ffffff'); front.material.needsUpdate = true;
    refl.material.uniforms.map.value = t; refl.material.uniforms.uHas.value = 1;
  });
}
function layoutFlow(dt) {
  flow.focus += (flow.to - flow.focus) * damp(9, dt);
  if (Math.abs(flow.to - flow.focus) < 0.0005) flow.focus = flow.to;
  const center = Math.round(flow.focus);
  const s = flow.size;
  for (let k = 0; k < FLOW_N; k++) {
    const c = flow.items[k];
    const idx = center - (FLOW_N >> 1) + k;
    const tr = shown[idx];
    c.visible = !!tr;
    if (!tr) { c.userData.idx = -1; continue; }
    c.userData.idx = idx;
    setCoverArt(c, tr);
    const d = idx - flow.focus, ad = Math.abs(d), sg = Math.sign(d);
    // The middle one faces you; the others turn away and stack up either side.
    const near = clamp(ad, 0, 1);
    const x = sg * (near * s * 1.0 + Math.max(0, ad - 1) * s * 0.34);
    const z = -near * 0.55 - Math.max(0, ad - 1) * 0.02;
    const ry = -sg * near * 1.05;
    c.position.set(x, flow.y, z);
    c.rotation.set(0, ry, 0);
    c.scale.setScalar(s);
    const fade = clamp(1.25 - (ad - 4.5) * 0.5, 0, 1);
    c.userData.front.material.opacity = fade;
    c.userData.refl.material.uniforms.uO.value = 0.2 * fade;
    c.renderOrder = 100 - Math.round(ad * 2);
    const playing = np.track && tr.id === np.track.id;
    const gm = c.userData.glow.material;
    gm.opacity += ((playing ? 0.85 : 0) * fade - gm.opacity) * damp(6, dt);
    gm.color.copy(pal.a);
  }
}
function focusOn(i, instant) {
  if (!shown.length) return;
  flow.to = clamp(Math.round(i), 0, shown.length - 1);
  if (instant) flow.focus = flow.to;
  paintCaption();
  paintListFocus();
  // Nothing playing yet: the record shows the cover you're on.
  if (!np.track) { clearTimeout(focusOn.t); focusOn.t = setTimeout(() => { const tr = shown[Math.round(flow.to)]; if (tr && !np.track && heroAnim.id !== tr.id) setHero(tr); }, 220); }
}

// ---------------------------------------------------------------- dust
const dust = (() => {
  const n = 260, g = new T.BufferGeometry(), p = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) { p[i * 3] = (Math.random() - 0.5) * 9; p[i * 3 + 1] = (Math.random() - 0.5) * 5; p[i * 3 + 2] = -Math.random() * 5 + 0.8; seed[i] = Math.random(); }
  g.setAttribute('position', new T.BufferAttribute(p, 3));
  const m = new T.PointsMaterial({ size: 0.018, color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false, blending: T.AdditiveBlending });
  const pts = new T.Points(g, m);
  scene.add(pts);
  return { pts, p, seed, n };
})();

// ---------------------------------------------------------------- layout
let W = 1, H = 1, listShift = 0;
function resize() {
  W = innerWidth; H = innerHeight;
  renderer.setSize(W, H, false);
  composer.setSize(W, H);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
function aimCamera(dt, t) {
  // Fit the record (top) down to the flow and its caption (bottom) into the
  // space between the top row and the transport bar, and keep it all in width.
  const aspect = W / H;
  const top = 1.2, bottom = -0.96, needW = 4.4;
  const yTop = 64, yBot = Math.max(yTop + 120, H - 150);
  const vf = Math.tan((camera.fov * PI / 180) / 2);
  const dist = Math.max((top - bottom) * H / (2 * vf * (yBot - yTop)), needW / 2 / (vf * aspect));
  const mid = (top + bottom) / 2;
  const px = (mouse.x - 0.5) * 0.25, py = (mouse.y - 0.5) * 0.14;
  cam.x += (px - cam.x) * damp(2.5, dt); cam.y += (py - cam.y) * damp(2.5, dt);
  camera.position.set(cam.x + Math.sin(t * 0.07) * 0.04, mid - cam.y + Math.sin(t * 0.09) * 0.03, dist);
  camera.lookAt(cam.x * 0.3, mid, 0);
  // With the list open, the scene's middle moves left to the space beside it.
  const want = document.body.classList.contains('list') && W > 760 ? 161 : 0;
  listShift += (want - listShift) * damp(7, dt);
  camera.setViewOffset(W, H, listShift, H / 2 - (yTop + yBot) / 2, W, H);
}
const mouse = { x: 0.5, y: 0.5 }, cam = { x: 0, y: 0 };

// ---------------------------------------------------------------- SoundCloud
let sc = null, scReady = false, volNow = 0;
const scOpts = { auto_play: true, visual: false, show_artwork: false, buying: false, sharing: false, download: false, show_comments: false, show_playcount: false, show_user: false, hide_related: true, show_teaser: false };
const targetVol = () => (prefs.muted ? 0 : prefs.volume);
function setVol(v) { volNow = v; if (sc && scReady) sc.setVolume(v); }
function fadeTo(v, ms, then) {
  clearInterval(fadeTo.id);
  const v0 = volNow, t0 = performance.now();
  fadeTo.id = setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    setVol(v0 + (v - v0) * k);
    if (k >= 1) { clearInterval(fadeTo.id); then?.(); }
  }, 30);
}
function scLoad(url) {
  if (!window.SC) { toast('SoundCloud’s player didn’t load. Check the internet connection, then Reload Player.'); np.loading = false; return; }
  np.loading = true;
  if (!sc) {
    const f = document.createElement('iframe');
    f.id = 'sc'; f.allow = 'autoplay; encrypted-media';
    f.src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&${new URLSearchParams(Object.entries(scOpts).map(([k, v]) => [k, String(v)]))}`;
    document.body.append(f);
    sc = SC.Widget(f);
    const E = SC.Widget.Events;
    sc.bind(E.READY, () => { scReady = true; setVol(0); sc.play(); });
    sc.bind(E.PLAY, () => {
      np.playing = true; np.loading = false;
      fadeTo(targetVol(), 700);
      sc.getDuration((d) => { if (d) np.dur = d; });
      paint();
    });
    sc.bind(E.PAUSE, () => { np.playing = false; paint(); });
    sc.bind(E.PLAY_PROGRESS, (e) => { np.pos = e.currentPosition || 0; np.progress = e.relativePosition || 0; });
    sc.bind(E.FINISH, () => { np.playing = false; np.progress = 1; ended(); });
    sc.bind(E.ERROR, () => { np.loading = false; toast('That track wouldn’t play on SoundCloud.'); paint(); });
  } else {
    setVol(0);
    sc.load(url, { ...scOpts, callback: () => { setVol(0); sc.play(); } });
  }
}

// ---------------------------------------------------------------- playing
function orderFor(list, startIdx) {
  const idx = list.map((_, i) => i);
  if (!prefs.shuffle) return { order: idx, pos: startIdx };
  const rest = idx.filter((i) => i !== startIdx);
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  return { order: [startIdx, ...rest], pos: 0 };
}
// Play a track from a list: what follows comes from the same list.
function playFrom(list, i) {
  const tr = list[i];
  if (!tr) return;
  ctx.list = list.slice();
  Object.assign(ctx, orderFor(ctx.list, i));
  start(tr);
}
function start(tr, back) {
  if (np.track && np.track !== tr && !back) { history.push(np.track); if (history.length > 50) history.shift(); }
  const swap = !np.track || np.track.id !== tr.id;
  np.track = tr; np.pos = 0; np.progress = 0; np.dur = tr.dur || 0; np.playing = false;
  prefs.last = tr.id; savePrefs();
  if (swap) setHero(tr);
  scLoad(tr.url);
  const k = shown.findIndex((x) => x.id === tr.id);
  if (k >= 0) focusOn(k);
  paint();
}
function toggle() {
  if (!np.track) { const i = Math.round(flow.to); if (shown[i]) playFrom(shown, i); return; }
  if (!sc || !scReady) { scLoad(np.track.url); return; }
  if (np.playing) fadeTo(0, 220, () => sc.pause()); else sc.play();
}
function next(auto) {
  if (!np.track) return;
  if (auto && prefs.repeat === 'one') { sc?.seekTo(0); sc?.play(); return; }
  let p = ctx.pos + 1;
  if (p >= ctx.order.length) {
    if (prefs.repeat === 'off' && auto) { np.playing = false; paint(); return; }
    if (prefs.shuffle) Object.assign(ctx, orderFor(ctx.list, ctx.order[ctx.order.length - 1]), { pos: 0 }), p = 1 % ctx.order.length;
    else p = 0;
  }
  ctx.pos = p;
  const tr = ctx.list[ctx.order[p]];
  if (tr) start(tr);
}
function ended() {
  if (!autoplay && prefs.repeat !== 'one') { paint(); return; }
  next(true);
}
function prev() {
  if (!np.track) return;
  if (np.pos > 4000) { sc?.seekTo(0); np.pos = 0; return; }
  if (ctx.pos > 0) { ctx.pos--; start(ctx.list[ctx.order[ctx.pos]], true); return; }
  const h = history.pop();
  if (h) start(h, true); else sc?.seekTo(0);
}
function setShuffle(on) {
  prefs.shuffle = on; savePrefs();
  if (np.track && ctx.list.length) {
    const cur = ctx.list.findIndex((x) => x.id === np.track.id);
    if (cur >= 0) Object.assign(ctx, orderFor(ctx.list, cur));
  }
  paint();
  toast(on ? 'Shuffle on' : 'Shuffle off', 900);
}
function cycleRepeat() {
  prefs.repeat = { off: 'all', all: 'one', one: 'off' }[prefs.repeat] || 'off'; savePrefs();
  paint();
  toast({ off: 'Repeat off', all: 'Repeat all', one: 'Repeat this track' }[prefs.repeat], 900);
}
function setVolume(v) {
  prefs.volume = clamp(Math.round(v), 0, 100); prefs.muted = false; savePrefs();
  clearInterval(fadeTo.id);
  if (np.playing) setVol(targetVol());
  paintVol();
}
function toggleMute() { prefs.muted = !prefs.muted; savePrefs(); clearInterval(fadeTo.id); if (np.playing) setVol(targetVol()); paintVol(); }

// The hero: the record swaps for the new one, sleeve and label.
function setHero(tr) {
  heroAnim.id = tr.id;
  heroAnim.swap = 0;
  heroAnim.pending = tr;
}
function applyHero(tr) {
  const url = bigArt(tr.art) || tr.art;
  heroAnim.label = url;
  sleeveFace.map = null; sleeveFace.color.set('#26262d'); sleeveFace.needsUpdate = true;
  vinylMat.uniforms.uHas.value = 0;
  const use = (t) => {
    if (heroAnim.label !== url && heroAnim.label !== tr.art) return;
    sleeveFace.map = t; sleeveFace.color.set('#ffffff'); sleeveFace.needsUpdate = true;
    vinylMat.uniforms.uLabel.value = t; vinylMat.uniforms.uHas.value = 1;
    const p = paletteOf(t.image);
    if (p) { pal.ta.copy(p[0]); pal.tb.copy(p[1]); }
  };
  const t = tex(url, use);
  if (!t && url !== tr.art) {
    // The big one may not exist: fall back to the small one if it fails.
    setTimeout(() => { const e = texCache.get(url); if (e?.failed) { heroAnim.label = tr.art; tex(tr.art, use); } }, 2500);
  }
}

// ---------------------------------------------------------------- lists
function rebuild() {
  all = [];
  artists.forEach((a, ai) => { for (const t of a.tracks) all.push({ ...t, dur: parseDur(t.duration), artist: a.name, profile: a.profile, ai }); });
  document.body.classList.toggle('none', !all.length);
  paintTabs();
  filter(true);
  if (!np.track && prefs.last) {
    const tr = all.find((x) => x.id === prefs.last);
    if (tr) { np.track = tr; np.dur = tr.dur; setHero(tr); ctx.list = shown.slice(); const i = ctx.list.findIndex((x) => x.id === tr.id); Object.assign(ctx, orderFor(ctx.list, Math.max(0, i))); }
  }
  if (np.track) { const k = shown.findIndex((x) => x.id === np.track.id); if (k >= 0) focusOn(k, true); }
  paint();
}
function filter(keepFocus) {
  const tab = prefs.tab;
  const q = query.trim().toLowerCase();
  const focusId = shown[Math.round(flow.to)]?.id;
  shown = all.filter((t) => (tab === 'all' || t.ai === tab) && (!q || t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)));
  let k = keepFocus && focusId ? shown.findIndex((x) => x.id === focusId) : -1;
  if (k < 0 && np.track) k = shown.findIndex((x) => x.id === np.track.id);
  focusOn(Math.max(0, k), true);
  paintList();
  paintCaption();
}
function paintTabs() {
  const el = $('#tabs');
  el.textContent = '';
  if (typeof prefs.tab === 'number' && !artists[prefs.tab]) prefs.tab = 'all';
  const mk = (label, val, n, img) => {
    const b = document.createElement('button');
    if (img) { const i = document.createElement('img'); i.src = img; i.alt = ''; b.append(i); }
    const s = document.createElement('span'); s.textContent = label; s.dir = 'auto'; b.append(s);
    const c = document.createElement('span'); c.className = 'n'; c.textContent = n; b.append(c);
    b.classList.toggle('on', prefs.tab === val);
    b.onclick = () => { prefs.tab = val; savePrefs(); paintTabs(); filter(false); };
    el.append(b);
  };
  mk('All', 'all', all.length);
  artists.forEach((a, i) => mk(a.name, i, a.tracks.length, a.avatar));
}
function paintList() {
  const ol = $('#list ol');
  ol.textContent = '';
  $('#listName').textContent = prefs.tab === 'all' ? 'All tracks' : artists[prefs.tab]?.name || 'Tracks';
  $('#listCount').textContent = query ? `${shown.length} found` : `${shown.length} tracks`;
  if (!shown.length) { const e = document.createElement('div'); e.className = 'empty'; e.textContent = query ? 'Nothing matches that.' : 'No tracks here.'; ol.append(e); return; }
  const frag = document.createDocumentFragment();
  shown.forEach((tr, i) => {
    const li = document.createElement('li');
    li.dataset.i = i;
    const img = document.createElement('img'); img.loading = 'lazy'; img.alt = ''; img.src = tr.art || '';
    const m = document.createElement('div'); m.style.minWidth = '0';
    const t = document.createElement('div'); t.className = 't'; t.dir = 'auto'; t.textContent = tr.title;
    const a = document.createElement('div'); a.className = 'a'; a.textContent = tr.artist;
    m.append(t, a);
    const d = document.createElement('div'); d.className = 'd'; d.textContent = tr.dur ? fmt(tr.dur) : '';
    li.append(img, m, d);
    li.onclick = () => playFrom(shown, i);
    frag.append(li);
  });
  ol.append(frag);
  paintListNow();
  paintListFocus();
}
function paintListNow() {
  for (const li of document.querySelectorAll('#list li')) {
    const tr = shown[+li.dataset.i], on = !!np.track && tr?.id === np.track.id;
    if (li.classList.contains('now') === on) continue;
    li.classList.toggle('now', on);
    const d = li.querySelector('.d');
    if (on) d.innerHTML = '<span class="eq"><i></i><i></i><i></i></span>'; else d.textContent = tr?.dur ? fmt(tr.dur) : '';
  }
}
function paintListFocus() {
  const k = Math.round(flow.to);
  let el = null;
  for (const li of document.querySelectorAll('#list li')) { const on = +li.dataset.i === k; li.classList.toggle('focus', on); if (on) el = li; }
  if (el && document.body.classList.contains('list')) el.scrollIntoView({ block: 'nearest' });
}
function paintCaption() {
  const tr = shown[Math.round(flow.to)];
  $('#cap .t').textContent = tr ? tr.title : '';
  $('#cap .a').textContent = tr ? `${tr.artist}${tr.dur ? ' · ' + fmt(tr.dur) : ''}` : (query ? 'Nothing matches that.' : '');
}

// ---------------------------------------------------------------- HUD
const ICON = {
  play: '<svg viewBox="0 0 16 16"><path d="M4.5 2.6v10.8L13.3 8z"/></svg>',
  pause: '<svg viewBox="0 0 16 16"><path d="M4 2.5h3v11H4zm5 0h3v11H9z"/></svg>',
  rep: '<svg viewBox="0 0 16 16"><path d="M4.5 4h7.2V2l3 2.75-3 2.75v-2H4.5c-.8 0-1.5.7-1.5 1.5v1H1.5v-1C1.5 5.3 2.8 4 4.5 4zm9.9 4v1c0 1.7-1.3 3-3 3H4.3v2l-3-2.75 3-2.75v2h7.2c.8 0 1.5-.7 1.5-1.5v-1z"/></svg>',
  rep1: '<svg viewBox="0 0 16 16"><path d="M4.5 4h7.2V2l3 2.75-3 2.75v-2H4.5c-.8 0-1.5.7-1.5 1.5v1H1.5v-1C1.5 5.3 2.8 4 4.5 4zm9.9 4v1c0 1.7-1.3 3-3 3H4.3v2l-3-2.75 3-2.75v2h7.2c.8 0 1.5-.7 1.5-1.5v-1z"/><path d="M7.4 6.4h1.4v4H7.6V7.8l-.7.3V7z"/></svg>',
  vol: '<svg viewBox="0 0 16 16"><path d="M2 6h2.6L8 3v10L4.6 10H2zm8.4-1.6a5 5 0 0 1 0 7.2l-1-1a3.6 3.6 0 0 0 0-5.2zm1.8-1.8a7.5 7.5 0 0 1 0 10.8l-1-1a6 6 0 0 0 0-8.8z"/></svg>',
  mute: '<svg viewBox="0 0 16 16"><path d="M2 6h2.6L8 3v10L4.6 10H2zm8.2.1 1-1L13 6.9l1.8-1.8 1 1L14 8l1.8 1.8-1 1L13 9.1l-1.8 1.8-1-1L12 8z"/></svg>',
};
const seekEl = $('#seek'), volEl = $('#vol');
let seeking = false;
function paint() {
  const tr = np.track;
  document.body.classList.toggle('playing', np.playing);
  $('#pp').innerHTML = np.playing ? ICON.pause : ICON.play;
  $('#pp').title = np.playing ? 'Pause (Space)' : 'Play (Space)';
  $('#np img').src = tr?.art || '';
  $('#np .t').textContent = tr ? tr.title : 'Nothing playing';
  $('#np .a').textContent = tr ? tr.artist : 'Pick a cover, or press Space';
  $('#shuf').classList.toggle('on', prefs.shuffle);
  $('#rep').innerHTML = prefs.repeat === 'one' ? ICON.rep1 : ICON.rep;
  $('#rep').classList.toggle('on', prefs.repeat !== 'off');
  $('#rep').title = { off: 'Repeat (R)', all: 'Repeat all (R)', one: 'Repeat this track (R)' }[prefs.repeat];
  paintTime(true);
  paintListNow();
  media();
}
function paintTime(force) {
  if (seeking && !force) return;
  const a = fmt(np.pos), b = np.dur ? fmt(np.dur) : '0:00';
  if (paintTime.a !== a || force) { paintTime.a = a; $('#tpos').textContent = a; }
  if (paintTime.b !== b) { paintTime.b = b; $('#tdur').textContent = b; }
  const p = np.dur ? clamp(np.pos / np.dur, 0, 1) : np.progress;
  if (!seeking) { seekEl.value = Math.round(p * 1000); seekEl.style.setProperty('--p', `${p * 100}%`); }
}
function paintVol() {
  const v = prefs.muted ? 0 : prefs.volume;
  volEl.value = v; volEl.style.setProperty('--p', `${v}%`);
  $('#mute').innerHTML = v === 0 ? ICON.mute : ICON.vol;
}
let toastT = 0;
function toast(msg, ms = 3200) {
  const el = $('#toast');
  el.textContent = msg; el.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), ms);
}
// The system's media keys and Now Playing, where the app passes them on.
function media() {
  const ms = navigator.mediaSession;
  if (!ms || !np.track) return;
  try {
    if (media.id !== np.track.id) {
      media.id = np.track.id;
      ms.metadata = new MediaMetadata({ title: np.track.title, artist: np.track.artist, artwork: np.track.art ? [{ src: bigArt(np.track.art), sizes: '500x500' }] : [] });
    }
    ms.playbackState = np.playing ? 'playing' : 'paused';
    if (!media.bound) {
      media.bound = true;
      ms.setActionHandler('play', () => { if (!np.playing) toggle(); });
      ms.setActionHandler('pause', () => { if (np.playing) toggle(); });
      ms.setActionHandler('nexttrack', () => next());
      ms.setActionHandler('previoustrack', () => prev());
    }
  } catch {}
}

$('#pp').onclick = () => toggle();
$('#next').onclick = () => next();
$('#prev').onclick = () => prev();
$('#shuf').onclick = () => setShuffle(!prefs.shuffle);
$('#rep').onclick = () => cycleRepeat();
$('#mute').onclick = () => toggleMute();
$('#open').onclick = () => { if (np.track) send({ type: 'open', url: np.track.url }); };
$('#np .a').onclick = () => { if (np.track?.profile) send({ type: 'open', url: np.track.profile }); };
$('#np img').onclick = () => { const k = np.track ? shown.findIndex((x) => x.id === np.track.id) : -1; if (k >= 0) focusOn(k); };
$('#listBtn').onclick = () => toggleList();
$('#setup').onclick = () => send({ type: 'settings' });
seekEl.oninput = () => {
  seeking = true;
  const p = seekEl.value / 1000;
  seekEl.style.setProperty('--p', `${p * 100}%`);
  $('#tpos').textContent = fmt(p * (np.dur || 0));
};
seekEl.onchange = () => {
  const p = seekEl.value / 1000;
  seeking = false;
  if (sc && scReady && np.dur) { sc.seekTo(p * np.dur); np.pos = p * np.dur; }
  paintTime(true);
};
volEl.oninput = () => setVolume(+volEl.value);
function toggleList(on = !document.body.classList.contains('list')) {
  document.body.classList.toggle('list', on);
  prefs.list = on; savePrefs();
  if (on) paintListFocus();
}
document.body.classList.toggle('list', !!prefs.list);
const qEl = $('#q');
qEl.oninput = () => { query = qEl.value; filter(false); };
qEl.onkeydown = (e) => {
  if (e.key === 'Escape') { qEl.value = ''; query = ''; filter(true); canvas.focus(); }
  if (e.key === 'Enter') { if (shown.length) playFrom(shown, Math.round(flow.to)); canvas.focus(); }
  if (e.key === 'ArrowDown') { e.preventDefault(); canvas.focus(); }
  e.stopPropagation();
};

// ---------------------------------------------------------------- input
const ray = new T.Raycaster(), ndc = new T.Vector2();
function pick(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects([...flow.items.filter((c) => c.visible).map((c) => c.userData.front), sleeve, disc], false);
  for (const h of hits) {
    if (h.object.userData.cover) return { cover: h.object.userData.cover.userData.idx };
    return { hero: true };
  }
  return {};
}
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  canvas.focus();
  drag = { x: e.clientX, f: flow.to, moved: false, hit: pick(e) };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  mouse.x = e.clientX / W; mouse.y = e.clientY / H;
  if (drag) {
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 5) drag.moved = true;
    if (drag.moved && drag.hit.cover != null) { flow.to = clamp(drag.f - dx / (W * 0.09), 0, Math.max(0, shown.length - 1)); }
    return;
  }
  const h = pick(e);
  canvas.style.cursor = h.cover != null || (h.hero && np.track) ? 'pointer' : 'default';
});
canvas.addEventListener('pointerup', () => {
  const d = drag; drag = null;
  if (!d) return;
  if (d.moved) { focusOn(Math.round(flow.to)); return; }
  const h = d.hit;
  if (h.cover != null && h.cover >= 0) {
    // The middle cover plays (or pauses, if it's the one playing); the others come to the middle.
    if (h.cover === Math.round(flow.to)) {
      const tr = shown[h.cover];
      if (np.track && tr.id === np.track.id) toggle(); else playFrom(shown, h.cover);
    } else focusOn(h.cover);
  } else if (h.hero) toggle();
});
canvas.addEventListener('dblclick', (e) => { const h = pick(e); if (h.cover != null && h.cover >= 0 && h.cover !== Math.round(flow.to)) playFrom(shown, h.cover); });
let wheelAcc = 0;
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  wheelAcc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  while (Math.abs(wheelAcc) >= 50) { focusOn(flow.to + Math.sign(wheelAcc)); wheelAcc -= Math.sign(wheelAcc) * 50; }
}, { passive: false });
addEventListener('keydown', (e) => {
  if (e.target === qEl) return;
  if (e.metaKey || e.ctrlKey) { if (e.key.toLowerCase() === 'f') { e.preventDefault(); qEl.focus(); qEl.select(); } return; }
  const k = e.key;
  if (k === ' ') { e.preventDefault(); toggle(); }
  else if (k === 'ArrowRight' && e.shiftKey) next();
  else if (k === 'ArrowLeft' && e.shiftKey) prev();
  else if (k === 'ArrowRight') focusOn(flow.to + 1);
  else if (k === 'ArrowLeft') focusOn(flow.to - 1);
  else if (k === 'Home') focusOn(0);
  else if (k === 'End') focusOn(shown.length - 1);
  else if (k === 'Enter') { const i = Math.round(flow.to); if (shown[i]) playFrom(shown, i); }
  else if (k === 'ArrowUp') { e.preventDefault(); setVolume(prefs.volume + 5); }
  else if (k === 'ArrowDown') { e.preventDefault(); setVolume(prefs.volume - 5); }
  else if (k === '/') { e.preventDefault(); qEl.focus(); qEl.select(); }
  else if (k.toLowerCase() === 's') setShuffle(!prefs.shuffle);
  else if (k.toLowerCase() === 'r') cycleRepeat();
  else if (k.toLowerCase() === 'm') toggleMute();
  else if (k.toLowerCase() === 'l') toggleList();
  else if (k === 'Escape' && document.body.classList.contains('list')) toggleList(false);
});

// The caption sits just under the middle cover, wherever the camera puts it.
const capEl = $('#cap');
function placeCaption() {
  camera.updateMatrixWorld();
  const p = tmp.set(0, flow.y - flow.size / 2 - 0.02, 0).project(camera);
  const y = Math.round((1 - p.y) / 2 * H + 6);
  if (placeCaption.y !== y) { placeCaption.y = y; capEl.style.top = `${y}px`; }
}
// ---------------------------------------------------------------- frame
const clock = new T.Clock();
const tmp = new T.Vector3();
let first = true;
function frame() {
  const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime;
  // Palette.
  pal.a.lerp(pal.ta, damp(1.6, dt)); pal.b.lerp(pal.tb, damp(1.6, dt));
  rimA.color.copy(pal.a); rimB.color.copy(pal.b);
  document.documentElement.style.setProperty('--accent', `#${pal.a.clone().offsetHSL(0, 0, 0.08).getHexString()}`);
  const energy = np.playing ? 1 : 0;
  sky.material.uniforms.uT.value = t;
  sky.material.uniforms.uE.value += (energy - sky.material.uniforms.uE.value) * damp(1.5, dt);

  // The record: out of its sleeve and turning while it plays; swapping, it drops back in and comes out new.
  const H_ = heroAnim;
  if (H_.swap < 1) {
    H_.swap = Math.min(1, H_.swap + dt / 0.9);
    if (H_.swap >= 0.45 && H_.pending) { applyHero(H_.pending); H_.pending = null; }
  }
  const swapDip = H_.swap < 1 ? Math.sin(H_.swap * PI) : 0;
  const slideTo = np.track ? (np.playing || np.loading ? 0.94 : 0.62) : 0.3;
  H_.slide += (slideTo * (1 - swapDip) - H_.slide) * damp(H_.swap < 1 ? 10 : 3.2, dt);
  slider.position.x = -SLEEVE * 0.12 + H_.slide * R * 1.05;
  sleeve.position.x = -SLEEVE * 0.3 - swapDip * 0.06;
  hero.position.x = -0.28 * (np.track ? 1 : 0.6);
  hero.position.y = 0.55 + Math.sin(t * 0.6) * 0.018;
  hero.rotation.y = -0.14 + (mouse.x - 0.5) * -0.06;
  hero.rotation.x = -0.05 + (mouse.y - 0.5) * -0.04;
  H_.speed += ((np.playing ? 3.49 : 0) - H_.speed) * damp(np.playing ? 1.4 : 2.2, dt);
  H_.spin += H_.speed * dt;
  spinner.rotation.z = -H_.spin;
  hero.updateMatrixWorld(true);
  const u = vinylMat.uniforms;
  u.uC.value.setFromMatrixPosition(slider.matrixWorld);
  u.uRight.value.set(1, 0, 0).transformDirection(hero.matrixWorld);
  u.uUp.value.set(0, 1, 0).transformDirection(hero.matrixWorld);
  const prog = np.dur ? clamp(np.pos / np.dur, 0, 1) : np.progress;
  paintRing(np.track ? prog : 0);
  ringMat.color.copy(pal.a).offsetHSL(0, 0, 0.12);
  ringMat.opacity += ((np.track ? 0.95 : 0) - ringMat.opacity) * damp(4, dt);
  ringTrack.material.opacity = 0.1 * ringMat.opacity;

  // Dust drifts up, a little faster with music on.
  const sp = 0.03 + 0.06 * sky.material.uniforms.uE.value;
  for (let i = 0; i < dust.n; i++) {
    dust.p[i * 3 + 1] += dt * sp * (0.4 + dust.seed[i]);
    dust.p[i * 3] += Math.sin(t * 0.2 + i) * dt * 0.01;
    if (dust.p[i * 3 + 1] > 2.6) dust.p[i * 3 + 1] = -2.6;
  }
  dust.pts.geometry.attributes.position.needsUpdate = true;
  dust.pts.material.color.copy(pal.a).lerp(new T.Color('#ffffff'), 0.6);

  layoutFlow(dt);
  aimCamera(dt, t);
  placeCaption();
  paintTime();
  composer.render(dt);
  if (first) { first = false; setTimeout(() => $('#veil').classList.add('gone'), 200); }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- messages
addEventListener('message', (e) => {
  if (e.source !== parent || !e.data || typeof e.data !== 'object') return;
  const m = e.data;
  if (m.type === 'settings') {
    autoplay = m.autoplay !== false;
  } else if (m.type === 'crates' && Array.isArray(m.crates)) {
    const errs = m.crates.filter((c) => c && c.error);
    artists = m.crates.filter((c) => c && Array.isArray(c.tracks) && c.tracks.length).map((c) => ({ name: c.name || c.slug, profile: c.profile, avatar: c.avatar, tracks: c.tracks }));
    const sig = JSON.stringify(artists.map((a) => [a.name, a.tracks.map((t) => t.id)]));
    if (sig !== rebuild.sig) { rebuild.sig = sig; rebuild(); }
    if (errs.length) toast(`Couldn’t load ${errs.length === 1 ? 'one of the artists' : `${errs.length} of the artists`}: check the links in settings.`);
    $('#veil').classList.add('gone');
  } else if (m.type === 'loading') {
    $('#veil').textContent = 'Loading your music…';
  }
});

resize();
paintVol();
paint();
canvas.focus();
requestAnimationFrame(frame);
send({ type: 'ready' });

// Test hook: ?debug=1 lets a script load tracks without the app.
if (params.get('debug')) {
  window.__player = {
    load: (crates) => window.postMessage({ type: 'crates', crates }, '*'),
    feed: (crates) => { artists = crates.map((c) => ({ name: c.name, profile: c.profile, avatar: c.avatar, tracks: c.tracks })); rebuild(); },
    state: () => ({ track: np.track?.title, playing: np.playing, focus: flow.to, shown: shown.length, ctx: ctx.order.length, pos: ctx.pos, shuffle: prefs.shuffle, repeat: prefs.repeat }),
    fake: (on, pos, dur) => { np.playing = on; if (pos != null) np.pos = pos; if (dur != null) np.dur = dur; paint(); },
    focus: (i) => focusOn(i, true),
    bad: () => renderer.info.programs.filter((p) => p.diagnostics && !p.diagnostics.runnable).map((p) => [p.name, p.diagnostics.vertexShader.log, p.diagnostics.fragmentShader.log, p.diagnostics.programLog].join(" | ").slice(0, 1500)),
  };
}
