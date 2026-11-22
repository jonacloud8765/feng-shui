// Record Room: a 3D listening room with three crates of SoundCloud records,
// a couch, and a turntable. Click a crate to flip through it, click the front
// record to pull it out onto the coffee table, then drag it onto the turntable.
// When a record ends the next one goes on by itself.
//
// Everything here is drawn in code (canvas textures, simple geometry, a few
// shaders); only the record sleeves use the artwork SoundCloud serves. Audio
// plays through SoundCloud's own embedded player.
//
// The room follows the Mac's appearance: daylight through the window in light
// mode, warm lamps and fairy lights in dark mode. Same room, same things.

import * as T from './three.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const PI = Math.PI;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------- renderer
const canvas = $('#c');
const renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;

const scene = new T.Scene();
scene.background = new T.Color('#0b0a0d');
const camera = new T.PerspectiveCamera(50, 1, 0.03, 40);
const pmrem = new T.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new T.RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

const composer = new T.EffectComposer(renderer);
composer.addPass(new T.RenderPass(scene, camera));
const bloom = new T.UnrealBloomPass(new T.Vector2(512, 512), 0.55, 0.6, 0.9);
composer.addPass(bloom);
composer.addPass(new T.OutputPass());
const grade = new T.ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uNight: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uNight; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5; float r2 = dot(d, d);
      vec3 c = vec3(texture2D(tDiffuse, vUv - d * 0.0035).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv + d * 0.0035).b);
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      vec3 shadowTint = mix(vec3(0.0, 0.025, 0.04), vec3(0.035, 0.01, 0.045), uNight);
      c += shadowTint * (1.0 - l) * 0.7;
      c = mix(c, c * mix(vec3(1.03, 1.0, 0.95), vec3(1.07, 0.99, 0.9), uNight), smoothstep(0.35, 1.0, l));
      c = mix(vec3(l), c, 1.1);
      c *= 1.0 - r2 * 0.95;
      c += (hash(vUv * vec2(1733.0, 977.0) + fract(uTime)) - 0.5) * 0.022;
      gl_FragColor = vec4(c, 1.0);
    }`,
});
composer.addPass(grade);

let baseFov = 50, fovBoost = 0;
function resize() {
  const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  baseFov = w / h < 1.25 ? 60 : 50;
  camera.fov = baseFov + (fovBoost || 0);
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- textures
function canvasTex(w, h, draw, { repeat, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new T.CanvasTexture(c);
  if (srgb) t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const rgb = (r, g, b, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;

function woodGrain(ctx, x, y, w, h, base, rand, { lines = 26, dark = 0.22 } = {}) {
  const [r, g, b] = base;
  ctx.fillStyle = rgb(r, g, b);
  ctx.fillRect(x, y, w, h);
  for (let i = 0; i < lines; i++) {
    const yy = y + rand() * h, amp = 1 + rand() * 4, f = 0.002 + rand() * 0.01, ph = rand() * 9;
    const k = rand() < 0.5 ? -1 : 1;
    ctx.strokeStyle = k < 0 ? rgb(r * (1 - dark), g * (1 - dark), b * (1 - dark), 0.25 + rand() * 0.3) : rgb(Math.min(255, r * 1.18), Math.min(255, g * 1.15), Math.min(255, b * 1.1), 0.12 + rand() * 0.15);
    ctx.lineWidth = 0.6 + rand() * 1.8;
    ctx.beginPath();
    for (let xx = x; xx <= x + w; xx += 6) ctx.lineTo(xx, yy + Math.sin(xx * f + ph) * amp);
    ctx.stroke();
  }
}

const floorTex = canvasTex(1024, 1024, (ctx, w, h) => {
  const rand = rng(7), rows = 8, rh = h / rows;
  for (let r = 0; r < rows; r++) {
    let x = -rand() * 300;
    while (x < w) {
      const len = 260 + rand() * 380, tone = 0.82 + rand() * 0.3;
      woodGrain(ctx, x, r * rh, len, rh, [104 * tone, 70 * tone, 44 * tone], rand, { lines: 30 });
      ctx.fillStyle = 'rgba(20,12,6,0.85)';
      ctx.fillRect(x, r * rh, 2, rh);
      x += len;
    }
    ctx.fillStyle = 'rgba(18,10,5,0.9)';
    ctx.fillRect(0, r * rh, w, 2);
  }
}, { repeat: [2.2, 2.2] });

const plaster = (base, seed) => canvasTex(512, 512, (ctx, w, h) => {
  const rand = rng(seed);
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) {
    const v = rand() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${0.018 + rand() * 0.025})`;
    ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 2.5, 1 + rand() * 2.5);
  }
}, { repeat: [3, 2] });

const slatTex = canvasTex(1024, 512, (ctx, w, h) => {
  const rand = rng(21), n = 16, sw = w / n;
  ctx.fillStyle = '#120c08'; ctx.fillRect(0, 0, w, h);
  ctx.save();
  for (let i = 0; i < n; i++) {
    ctx.save();
    ctx.translate(i * sw + 4 + sw / 2, h / 2); ctx.rotate(PI / 2); ctx.translate(-h / 2, -(sw - 8) / 2);
    const tone = 0.85 + rand() * 0.25;
    woodGrain(ctx, 0, 0, h, sw - 8, [86 * tone, 54 * tone, 33 * tone], rand, { lines: 10 });
    ctx.restore();
  }
  ctx.restore();
}, { repeat: [1.6, 1] });

const rugTex = canvasTex(1024, 732, (ctx, w, h) => {
  const rand = rng(5);
  const C = ['#3a2519', '#a4512b', '#c99a2e', '#2f6b6a', '#e6d7b8', '#6d2f3a'];
  ctx.fillStyle = C[0]; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = C[4]; ctx.fillRect(18, 18, w - 36, h - 36);
  ctx.fillStyle = C[0]; ctx.fillRect(30, 30, w - 60, h - 60);
  ctx.save();
  ctx.beginPath(); ctx.rect(44, 44, w - 88, h - 88); ctx.clip();
  const cx = w / 2, cy = h / 2;
  for (let k = 0, R = 720; R > 10; k++, R -= 34) {
    ctx.beginPath();
    for (let a = 0; a <= PI * 2 + 0.01; a += 0.02) {
      const rr = R + Math.sin(a * 7 + k * 0.6) * 14 + Math.sin(a * 3 - k) * 8;
      ctx.lineTo(cx + Math.cos(a) * rr * 1.25, cy + Math.sin(a) * rr * 0.92);
    }
    ctx.closePath();
    ctx.fillStyle = C[1 + (k % 5)];
    ctx.fill();
  }
  ctx.restore();
  for (let i = 0; i < 26000; i++) {
    ctx.fillStyle = `rgba(${rand() < 0.5 ? 0 : 255},${rand() < 0.5 ? 20 : 230},${rand() < 0.5 ? 10 : 200},${0.04 + rand() * 0.05})`;
    ctx.fillRect(rand() * w, rand() * h, 2, 2);
  }
});

const vinylTex = canvasTex(512, 512, (ctx, w, h) => {
  const c = w / 2;
  ctx.fillStyle = '#060606'; ctx.fillRect(0, 0, w, h);
  for (let r = c; r > c * 0.36; r -= 1.3) {
    ctx.strokeStyle = `rgba(255,255,255,${0.02 + 0.03 * Math.abs(Math.sin(r * 0.7))})`;
    ctx.beginPath(); ctx.arc(c, c, r, 0, PI * 2); ctx.stroke();
  }
  const g = ctx.createConicGradient(0.6, c, c);
  g.addColorStop(0, 'rgba(255,255,255,0.09)'); g.addColorStop(0.12, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.08)'); g.addColorStop(0.62, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0.09)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c, c, c, 0, PI * 2); ctx.fill();
});

function labelTex(title, sub, accent) {
  return canvasTex(512, 168, (ctx, w, h) => {
    const rand = rng(title.length * 31 + 7);
    ctx.fillStyle = '#d8c39a'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) { ctx.fillStyle = `rgba(90,60,20,${rand() * 0.08})`; ctx.fillRect(rand() * w, rand() * h, 2, 2); }
    ctx.strokeStyle = 'rgba(40,25,10,0.7)'; ctx.lineWidth = 4; ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = '#1c140d';
    let size = 74;
    const text = title.toUpperCase();
    do { ctx.font = `800 ${size}px "Avenir Next Condensed", "Futura", Impact, sans-serif`; size -= 2; } while (ctx.measureText(text).width > w - 56 && size > 20);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h * 0.43);
    ctx.font = '600 22px "Avenir Next", Futura, sans-serif';
    ctx.fillStyle = accent || '#7a3b1c';
    ctx.fillText(sub.toUpperCase(), w / 2, h * 0.8);
  });
}

function dotSprite() {
  return canvasTex(64, 64, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
  });
}

function skyTex(night) {
  return canvasTex(1024, 640, (ctx, w, h) => {
    const rand = rng(night ? 99 : 98);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    if (night) { g.addColorStop(0, '#05070f'); g.addColorStop(0.6, '#141a33'); g.addColorStop(1, '#3a2a3a'); }
    else { g.addColorStop(0, '#6fa6e0'); g.addColorStop(0.55, '#b9d6ef'); g.addColorStop(1, '#f4e6cf'); }
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    if (night) {
      for (let i = 0; i < 260; i++) { ctx.fillStyle = `rgba(255,255,255,${0.2 + rand() * 0.7})`; ctx.fillRect(rand() * w, rand() * h * 0.55, 1.4, 1.4); }
      ctx.fillStyle = '#f2ead2'; ctx.beginPath(); ctx.arc(w * 0.72, h * 0.2, 18, 0, PI * 2); ctx.fill();
    } else {
      for (let i = 0; i < 14; i++) {
        const cx = rand() * w, cy = h * (0.1 + rand() * 0.35), s = 40 + rand() * 90;
        for (let j = 0; j < 8; j++) {
          const gg = ctx.createRadialGradient(cx + (rand() - 0.5) * s * 1.6, cy + (rand() - 0.5) * s * 0.3, 0, cx, cy, s);
          gg.addColorStop(0, 'rgba(255,255,255,0.35)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = gg; ctx.fillRect(cx - s * 2, cy - s, s * 4, s * 2);
        }
      }
    }
    // A distant skyline.
    let x = 0;
    while (x < w) {
      const bw = 30 + rand() * 70, bh = h * (0.12 + rand() * 0.3);
      ctx.fillStyle = night ? '#0b0d16' : '#8d9bb0';
      ctx.fillRect(x, h - bh, bw, bh);
      if (night) for (let wy = h - bh + 8; wy < h - 6; wy += 9) for (let wx = x + 4; wx < x + bw - 4; wx += 7) if (rand() < 0.28) { ctx.fillStyle = `rgba(255,${190 + rand() * 50},${110 + rand() * 60},${0.5 + rand() * 0.5})`; ctx.fillRect(wx, wy, 3, 4); }
      x += bw + rand() * 6;
    }
  });
}

// Dense high-rise towers outside the window, drawn in layers for parallax:
// concrete and glass by day, a wall of lit flats by night.
function towerTex(night, seed, { w = 1024, h = 1024, count = 9, minW = 0.08, maxW = 0.2, topMin = 0.05, topMax = 0.45, cell = 14, fill = 1, tone = 0 } = {}) {
  return canvasTex(w, h, (ctx) => {
    const rand = rng(seed);
    const xs = [];
    let x = -rand() * 40;
    while (x < w && xs.length < count * 3) { const bw = w * (minW + rand() * (maxW - minW)); if (rand() < fill) xs.push([x, bw]); x += bw + w * rand() * 0.03; }
    for (const [x0, bw] of xs) {
      const top = h * (topMin + rand() * (topMax - topMin));
      const hue = rand();
      const base = night ? [14 + tone, 15 + tone, 22 + tone] : [150 + hue * 40 - tone * 3, 148 + hue * 30 - tone * 3, 140 + hue * 20 - tone * 3];
      ctx.fillStyle = rgb(...base);
      ctx.fillRect(x0, top, bw, h - top);
      // Rooftop clutter.
      ctx.fillRect(x0 + bw * 0.2, top - h * 0.015, bw * 0.25, h * 0.015);
      const cw = cell * (0.8 + rand() * 0.5), ch = cell * (1.1 + rand() * 0.4);
      const litP = 0.22 + rand() * 0.3;
      for (let y = top + ch * 0.6; y < h - ch * 0.4; y += ch) {
        // Floor slabs and balconies.
        ctx.fillStyle = night ? 'rgba(40,38,48,0.9)' : `rgba(${base[0] - 30},${base[1] - 30},${base[2] - 28},0.8)`;
        ctx.fillRect(x0, y + ch * 0.72, bw, ch * 0.12);
        for (let wx = x0 + cw * 0.3; wx < x0 + bw - cw * 0.7; wx += cw) {
          const r = rand();
          if (night) {
            if (r < litP) {
              const k = rand();
              ctx.fillStyle = k < 0.06 ? `rgba(255,120,190,0.95)` : k < 0.16 ? `rgba(150,215,255,0.9)` : `rgba(255,${185 + rand() * 50},${100 + rand() * 60},${0.75 + rand() * 0.25})`;
            } else ctx.fillStyle = `rgba(${20 + rand() * 18},${22 + rand() * 18},${34 + rand() * 20},1)`;
          } else {
            ctx.fillStyle = r < 0.15 ? 'rgba(210,225,240,0.9)' : `rgba(${45 + rand() * 40},${55 + rand() * 40},${70 + rand() * 40},0.95)`;
          }
          ctx.fillRect(wx, y + ch * 0.12, cw * 0.62, ch * 0.55);
          // An air conditioner here and there.
          if (rand() < 0.12) { ctx.fillStyle = night ? 'rgba(60,60,66,1)' : 'rgba(205,205,200,1)'; ctx.fillRect(wx + cw * 0.05, y + ch * 0.55, cw * 0.32, ch * 0.18); }
        }
      }
    }
  });
}

// ---------------------------------------------------------------- more textures
function swirlTex(w, h, colors, { seed = 1, turns = 3, rings = 13, shag = 0, oval = false, repeat } = {}) {
  return canvasTex(w, h, (ctx) => {
    const img = ctx.createImageData(w, h), d = img.data, rand = rng(seed);
    const cols = colors.map((c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);
    const cx = w * (0.45 + rand() * 0.1), cy = h * (0.45 + rand() * 0.1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (x - cx) / w, dy = (y - cy) / h, r = Math.hypot(dx, dy);
      const a = Math.atan2(dy, dx);
      const v = a * turns / (2 * PI) + r * rings + Math.sin(r * 9 + a * 2) * 0.35;
      const f = ((v % 1) + 1) % 1, idx = Math.floor(((v % cols.length) + cols.length) % cols.length);
      const c0 = cols[idx], c1 = cols[(idx + 1) % cols.length];
      const k = Math.min(1, Math.max(0, (f - 0.82) / 0.18));
      const n = shag ? 1 - shag * 0.5 + rand() * shag : 1;
      const i = (y * w + x) * 4;
      d[i] = (c0[0] + (c1[0] - c0[0]) * k) * n; d[i + 1] = (c0[1] + (c1[1] - c0[1]) * k) * n; d[i + 2] = (c0[2] + (c1[2] - c0[2]) * k) * n;
      d[i + 3] = 255;
      if (oval) { const ox = (x / w - 0.5) * 2, oy = (y / h - 0.5) * 2; const e = ox * ox + oy * oy; if (e > 1) d[i + 3] = 0; else if (e > 0.9 && rand() < (e - 0.9) * 10) d[i + 3] = 0; }
    }
    ctx.putImageData(img, 0, 0);
  }, { repeat });
}
const noiseTex = (size, seed, lo, hi, repeat) => canvasTex(size, size, (ctx, w, h) => {
  const img = ctx.createImageData(w, h), d = img.data, rand = rng(seed);
  for (let i = 0; i < d.length; i += 4) { const v = lo + rand() * (hi - lo); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  // Loops, for bouclé.
  for (let i = 0; i < size * 3; i++) { ctx.strokeStyle = `rgba(255,255,255,${0.15 + rand() * 0.25})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(rand() * w, rand() * h, 1 + rand() * 2.2, 0, PI * 2); ctx.stroke(); }
}, { srgb: false, repeat });

const oakPanelTex = canvasTex(1024, 1024, (ctx, w, h) => {
  const rand = rng(31), n = 8, bw = w / n;
  for (let i = 0; i < n; i++) {
    ctx.save();
    ctx.translate(i * bw + bw / 2, h / 2); ctx.rotate(PI / 2); ctx.translate(-h / 2, -bw / 2);
    const tone = 0.9 + rand() * 0.18;
    woodGrain(ctx, 0, 0, h, bw, [178 * tone, 122 * tone, 72 * tone], rand, { lines: 34, dark: 0.18 });
    ctx.restore();
    ctx.fillStyle = 'rgba(60,32,14,0.65)'; ctx.fillRect(i * bw, 0, 2, h);
  }
}, { repeat: [2, 1] });

const spinesTex = canvasTex(1024, 128, (ctx, w, h) => {
  const rand = rng(77);
  const cols = ['#2c2622', '#e9dcc0', '#9c4a26', '#c08a2e', '#556b3a', '#1f2a36', '#7d2f22', '#d8c39a', '#3d3a52', '#b8b2a4'];
  let x = 0;
  while (x < w) { const t = 3 + rand() * 7; ctx.fillStyle = cols[(rand() * cols.length) | 0]; ctx.fillRect(x, 0, t, h); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + t - 0.8, 0, 0.8, h); x += t; }
  const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
});

const paperTex = canvasTex(256, 512, (ctx, w, h) => {
  ctx.fillStyle = '#f3e9d4'; ctx.fillRect(0, 0, w, h);
  const rand = rng(5);
  for (let i = 0; i < 3000; i++) { ctx.fillStyle = `rgba(150,120,80,${rand() * 0.06})`; ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 3, 1); }
  for (let y = 0; y < h; y += 26) { ctx.fillStyle = 'rgba(120,90,50,0.35)'; ctx.fillRect(0, y, w, 2); }
});

function faceTex(kind) {
  return canvasTex(512, 128, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#d9d6cf'); g.addColorStop(1, '#a9a59c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1b1a18';
    if (kind === 'amp') {
      for (const x of [40, 150]) { ctx.fillStyle = '#20140a'; ctx.fillRect(x, 22, 90, 54); ctx.fillStyle = '#f0b25a'; ctx.fillRect(x + 4, 26, 82, 46); ctx.strokeStyle = '#2a1a0a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 45, 70); ctx.lineTo(x + 20 + (x % 3) * 10, 36); ctx.stroke(); }
      for (let i = 0; i < 4; i++) { ctx.fillStyle = '#3a3835'; ctx.beginPath(); ctx.arc(290 + i * 56, 64, 20, 0, PI * 2); ctx.fill(); ctx.fillStyle = '#c9c6bf'; ctx.beginPath(); ctx.arc(290 + i * 56, 64, 15, 0, PI * 2); ctx.fill(); }
    } else {
      ctx.fillStyle = '#111'; ctx.fillRect(30, 26, 200, 70);
      ctx.fillStyle = '#3a3530'; ctx.fillRect(40, 36, 180, 50);
      ctx.fillStyle = '#c9b48a'; ctx.beginPath(); ctx.arc(95, 61, 16, 0, PI * 2); ctx.arc(165, 61, 16, 0, PI * 2); ctx.fill();
      for (let i = 0; i < 6; i++) { ctx.fillStyle = '#2b2926'; ctx.fillRect(260 + i * 36, 70, 28, 22); }
      ctx.fillStyle = '#5be07a'; ctx.fillRect(270, 30, 140, 20);
    }
  });
}

// ---------------------------------------------------------------- materials
const PINK = '#b98272';
const M = {
  floor: new T.MeshStandardMaterial({ map: floorTex, roughness: 0.5 }),
  pink: new T.MeshStandardMaterial({ map: plaster(PINK, 3), roughness: 0.95 }),
  ceiling: new T.MeshStandardMaterial({ map: plaster('#e3d6c4', 4), roughness: 1 }),
  oakPanel: new T.MeshStandardMaterial({ map: oakPanelTex, roughness: 0.55 }),
  oak: new T.MeshStandardMaterial({ roughness: 0.48, map: canvasTex(512, 256, (c, w, h) => woodGrain(c, 0, 0, w, h, [186, 130, 78], rng(11), { lines: 40 })) }),
  walnut: new T.MeshStandardMaterial({ roughness: 0.42, map: canvasTex(512, 512, (c, w, h) => woodGrain(c, 0, 0, w, h, [110, 70, 44], rng(12), { lines: 60 })) }),
  pine: new T.MeshStandardMaterial({ roughness: 0.7, map: canvasTex(512, 128, (c, w, h) => woodGrain(c, 0, 0, w, h, [196, 150, 100], rng(13), { lines: 18, dark: 0.3 })) }),
  black: new T.MeshStandardMaterial({ color: '#141414', roughness: 0.45, metalness: 0.6 }),
  steel: new T.MeshStandardMaterial({ color: '#c4c1bb', roughness: 0.25, metalness: 1 }),
  brass: new T.MeshStandardMaterial({ color: '#c8a24a', roughness: 0.25, metalness: 1 }),
  boucle: new T.MeshStandardMaterial({ color: '#e7dccb', roughness: 1, bumpMap: noiseTex(256, 9, 90, 170, [5, 5]), bumpScale: 2.2 }),
  velvet: new T.MeshPhysicalMaterial({ color: '#8f3820', roughness: 0.75, sheen: 1, sheenRoughness: 0.35, sheenColor: new T.Color('#ff9b6e') }),
  mustard: new T.MeshPhysicalMaterial({ color: '#c08a2e', roughness: 0.8, sheen: 1, sheenRoughness: 0.4, sheenColor: new T.Color('#ffd27a') }),
  olive: new T.MeshPhysicalMaterial({ color: '#5d6533', roughness: 0.8, sheen: 1, sheenRoughness: 0.4, sheenColor: new T.Color('#c9d08a') }),
  swirl: new T.MeshStandardMaterial({ roughness: 0.95, map: swirlTex(256, 256, ['#9c4a26', '#e9dcc0', '#c08a2e', '#5d6533'], { seed: 4, rings: 8, turns: 2 }) }),
  rug: new T.MeshStandardMaterial({ map: swirlTex(1024, 768, ['#9c4a26', '#e9dcc0', '#6b6a32', '#c08a2e', '#e9dcc0'], { seed: 2, shag: 0.35, oval: true }), roughness: 1, alphaTest: 0.5, bumpMap: noiseTex(512, 4, 60, 200, [3, 3]), bumpScale: 3 }),
  grille: new T.MeshStandardMaterial({ color: '#2a2420', roughness: 0.95 }),
  cone: new T.MeshStandardMaterial({ color: '#d9cdb5', roughness: 0.7 }),
  card: new T.MeshStandardMaterial({ color: '#cbb894', roughness: 0.85 }),
  vinyl: new T.MeshPhysicalMaterial({ map: vinylTex, color: '#ffffff', roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2 }),
  hoodie: new T.MeshStandardMaterial({ color: '#3b4032', roughness: 0.95 }),
  denim: new T.MeshStandardMaterial({ color: '#2a3140', roughness: 0.9 }),
  skin: new T.MeshStandardMaterial({ color: '#a87653', roughness: 0.6 }),
  hair: new T.MeshStandardMaterial({ color: '#17110d', roughness: 0.8 }),
  sneaker: new T.MeshStandardMaterial({ color: '#e9e4da', roughness: 0.7 }),
  ceramic: new T.MeshStandardMaterial({ color: '#d9cbb2', roughness: 0.35 }),
  terracotta: new T.MeshStandardMaterial({ color: '#a65a3a', roughness: 0.85 }),
  leaf: null,
};

const add = (parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
  const m = new T.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
};
const box = (w, h, d) => new T.BoxGeometry(w, h, d);
const rbox = (w, h, d, r = 0.03, s = 3) => new T.RoundedBoxGeometry(w, h, d, s, r);
const cyl = (rt, rb, h, n = 32) => new T.CylinderGeometry(rt, rb, h, n);

// ---------------------------------------------------------------- the room
// A corner lounge: dusty pink plaster on the left (with the window), warm oak
// panelling behind the hi-fi and on the right.
const RW = 5.2, RD = 5.3, RH = 2.6;
const X0 = -RW / 2, X1 = RW / 2, Z0 = -RD / 2, Z1 = RD / 2;
const room = new T.Group();
scene.add(room);
const noShadow = new Set();

add(room, box(RW, 0.1, RD), M.floor, 0, -0.05, 0);
add(room, box(RW, 0.1, RD), M.ceiling, 0, RH + 0.05, 0);
add(room, box(RW, RH, 0.1), M.oakPanel, 0, RH / 2, Z0 - 0.05);
add(room, box(RW, RH, 0.1), M.pink, 0, RH / 2, Z1 + 0.05);
// Right wall, with a doorway to a dim hallway.
const DOOR = { z0: -1.95, z1: -0.75, h: 2.14 };
{
  const rw = (z0, z1, y0, y1) => add(room, box(0.12, y1 - y0, z1 - z0), M.oakPanel, X1 + 0.06, (y0 + y1) / 2, (z0 + z1) / 2);
  rw(Z0, DOOR.z0, 0, RH); rw(DOOR.z1, Z1, 0, RH); rw(DOOR.z0, DOOR.z1, DOOR.h, RH);
  const cz = (DOOR.z0 + DOOR.z1) / 2, w = DOOR.z1 - DOOR.z0;
  for (const [h2, d2, y, z] of [[DOOR.h, 0.06, DOOR.h / 2, DOOR.z0 - 0.03], [DOOR.h, 0.06, DOOR.h / 2, DOOR.z1 + 0.03], [0.06, w + 0.12, DOOR.h + 0.03, cz]]) add(room, box(0.15, h2, d2), M.oak, X1 + 0.02, y, z);
  const hall = new T.MeshStandardMaterial({ map: plaster('#7a6a5a', 6), roughness: 1, side: T.BackSide });
  add(room, box(1.6, RH, w + 1.4), hall, X1 + 0.92, RH / 2, cz);
  const hl = new T.PointLight('#ffcf9a', 1.2, 3, 2);
  hl.position.set(X1 + 0.9, 2.2, cz);
  room.add(hl);
}
const WIN = { z0: -1.35, z1: 0.15, y0: 0.8, y1: 2.05 };
const lw = (z0, z1, y0, y1) => add(room, box(0.14, y1 - y0, z1 - z0), M.pink, X0 - 0.07, (y0 + y1) / 2, (z0 + z1) / 2);
lw(Z0, WIN.z0, 0, RH); lw(WIN.z1, Z1, 0, RH); lw(WIN.z0, WIN.z1, 0, WIN.y0); lw(WIN.z0, WIN.z1, WIN.y1, RH);
for (const [w, d, x, z] of [[RW, 0.02, 0, Z0 + 0.01], [0.02, RD, X1 - 0.01, 0], [0.02, RD, X0 + 0.01, 0]]) add(room, box(w, 0.09, d), M.oak, x, 0.045, z);

// Window: oak frame and cross bars, faint glass, the sky beyond.
{
  const g = new T.Group();
  const cz = (WIN.z0 + WIN.z1) / 2, cy = (WIN.y0 + WIN.y1) / 2, ww = WIN.z1 - WIN.z0, wh = WIN.y1 - WIN.y0;
  for (const [h2, d2, y, z] of [[0.06, ww + 0.06, WIN.y0, cz], [0.06, ww + 0.06, WIN.y1, cz], [wh, 0.06, cy, WIN.z0], [wh, 0.06, cy, WIN.z1], [0.035, ww, cy + 0.15, cz], [wh, 0.035, cy, cz]]) add(g, box(0.07, h2, d2), M.oak, X0 - 0.07, y, z);
  add(g, box(0.2, 0.04, ww + 0.14), M.oak, X0 + 0.03, WIN.y0 - 0.02, cz);
  const glass = add(g, new T.PlaneGeometry(ww, wh), new T.MeshStandardMaterial({ color: '#9fb3c8', transparent: true, opacity: 0.06, roughness: 0.05, metalness: 0.1 }), X0 - 0.07, cy, cz, 0, PI / 2, 0);
  noShadow.add(glass);
  // A trailing plant on the sill.
  add(g, cyl(0.07, 0.055, 0.12, 20), M.terracotta, X0 + 0.06, WIN.y0 + 0.06, WIN.z1 - 0.2);
  room.add(g);
}
const skyDay = new T.MeshBasicMaterial({ map: skyTex(false), transparent: true });
const skyNight = new T.MeshBasicMaterial({ map: skyTex(true), transparent: true, opacity: 0 });
noShadow.add(add(room, new T.PlaneGeometry(26, 14), skyDay, X0 - 9, 4, -0.6, 0, PI / 2, 0));
noShadow.add(add(room, new T.PlaneGeometry(26, 14), skyNight, X0 - 8.99, 4, -0.6, 0, PI / 2, 0));
// Three layers of towers, far to near; we're high up, so they run down out of view.
const cityLayers = [
  { d: 7.5, w: 20, h: 13, y: 1.6, o: { count: 16, minW: 0.03, maxW: 0.07, topMin: 0.12, topMax: 0.5, cell: 7, tone: 0 } },
  { d: 4.2, w: 11, h: 9, y: 0.6, o: { count: 7, minW: 0.08, maxW: 0.16, topMin: 0.0, topMax: 0.3, cell: 11, fill: 0.75, tone: 4 } },
  { d: 2.0, w: 6.5, h: 7, y: 0.4, o: { count: 3, minW: 0.18, maxW: 0.34, topMin: -0.1, topMax: 0.12, cell: 22, fill: 0.5, tone: 8 } },
].map((L, k) => {
  const day = new T.MeshBasicMaterial({ map: towerTex(false, 300 + k, L.o), transparent: true, depthWrite: false });
  const night = new T.MeshBasicMaterial({ map: towerTex(true, 300 + k, L.o), transparent: true, opacity: 0, depthWrite: false });
  for (const [m, e] of [[day, 0], [night, 0.01]]) { const p = add(room, new T.PlaneGeometry(L.w, L.h), m, X0 - L.d + e, L.y, -0.6, 0, PI / 2, 0); p.renderOrder = -10 + k; noShadow.add(p); }
  return { day, night };
});

// Shaggy swirl rug.
const stock = {};
stock.rug = add(room, new T.PlaneGeometry(3.1, 2.3), M.rug, 0, 0.012, -0.1, -PI / 2, 0, 0);

// Low modular floor sofa: a rust velvet chaise on the left, cream bouclé to the right.
const SOFA_Z = 1.6;
{
  const g = new T.Group();
  g.position.set(0, 0, SOFA_Z);
  stock.sofa = g;
  const mods = [[-0.78, M.velvet], [0, M.boucle], [0.78, M.boucle]];
  for (const [x, mat] of mods) {
    add(g, rbox(0.77, 0.3, 0.92, 0.1, 5), mat, x, 0.15, 0);
    add(g, rbox(0.76, 0.42, 0.24, 0.1, 5), mat, x, 0.46, 0.36, -0.14);
  }
  add(g, rbox(0.77, 0.3, 0.78, 0.1, 5), M.velvet, -0.78, 0.15, -0.85);
  add(g, rbox(0.42, 0.38, 0.14, 0.06, 4), M.mustard, 0.86, 0.5, 0.18, -0.25, -0.2, -0.1);
  add(g, rbox(0.4, 0.36, 0.14, 0.06, 4), M.olive, 0.42, 0.48, 0.2, -0.3, 0.1, 0.05);
  add(g, rbox(0.4, 0.36, 0.13, 0.06, 4), M.swirl, -0.92, 0.5, 0.18, -0.25, 0.25, 0.12);
  add(g, rbox(0.36, 0.32, 0.13, 0.06, 4), M.mustard, -0.55, 0.47, 0.2, -0.3, -0.1, -0.08);
  room.add(g);
}

// Low round oak coffee table, off to the right, where pulled records land.
const TABLE = { x: 0.64, z: 0.58, y: 0.335, w: 0.74, d: 0.74 };
{
  const g = new T.Group();
  add(g, cyl(0.42, 0.42, 0.04, 48), M.oak, TABLE.x, 0.31, TABLE.z);
  add(g, cyl(0.3, 0.34, 0.29, 32), M.oak, TABLE.x, 0.145, TABLE.z);
  add(g, cyl(0.04, 0.036, 0.09, 24), M.ceramic, TABLE.x + 0.27, 0.375, TABLE.z + 0.18);
  room.add(g);
  stock.table = g;
}

// Beanbag lounge chair by the window.
{
  const g = new T.Group();
  g.position.set(-1.75, 0, -0.55);
  g.rotation.y = 0.9;
  stock.beanbag = g;
  const bean = M.boucle.clone(); bean.color.set('#dccbb2');
  add(g, new T.SphereGeometry(0.46, 32, 20), bean, 0, 0.2, 0).scale.set(1, 0.45, 1);
  add(g, new T.SphereGeometry(0.4, 32, 20), bean, 0, 0.44, 0.24).scale.set(1, 0.8, 0.5);
  add(g, rbox(0.36, 0.3, 0.12, 0.05, 4), M.olive, 0.05, 0.44, 0.1, -0.4, 0.2, 0.1);
  room.add(g);
}

// Back wall: a low oak console full of records, the turntable and a hi-fi stack,
// speakers on stands, and two floating oak shelves with lights underneath.
const CRED = { y: 0.5, z: Z0 + 0.25 };
const shelfLeds = [];
{
  const g = new T.Group();
  const cw = 2.3, cd = 0.44;
  add(g, box(cw, 0.035, cd), M.oak, 0, CRED.y - 0.0175, CRED.z);
  add(g, box(cw, 0.03, cd), M.oak, 0, 0.1, CRED.z);
  for (const x of [-cw / 2 + 0.0175, -cw / 6, cw / 6, cw / 2 - 0.0175]) add(g, box(0.035, CRED.y - 0.1, cd), M.oak, x, 0.1 + (CRED.y - 0.1) / 2 - 0.02, CRED.z);
  for (const x of [-1.05, 1.05]) for (const z of [-0.17, 0.17]) add(g, cyl(0.018, 0.014, 0.085, 10), M.oak, x, 0.042, CRED.z + z);
  // Hi-fi stack: amplifier and cassette deck.
  add(g, box(0.44, 0.1, 0.3), M.black, -0.68, CRED.y + 0.05, CRED.z - 0.02);
  add(g, new T.PlaneGeometry(0.43, 0.09), new T.MeshStandardMaterial({ map: faceTex('amp'), roughness: 0.4, metalness: 0.5, emissive: '#ffb050', emissiveMap: faceTex('amp'), emissiveIntensity: 0 }), -0.68, CRED.y + 0.05, CRED.z + 0.131).userData.hifi = true;
  add(g, box(0.44, 0.09, 0.28), M.black, -0.68, CRED.y + 0.147, CRED.z - 0.03);
  add(g, new T.PlaneGeometry(0.43, 0.08), new T.MeshStandardMaterial({ map: faceTex('deck'), roughness: 0.4, metalness: 0.5, emissive: '#7dffa0', emissiveMap: faceTex('deck'), emissiveIntensity: 0 }), -0.68, CRED.y + 0.147, CRED.z + 0.111).userData.hifi = true;
  // A small plant and a few records leaning at the right end.
  add(g, cyl(0.07, 0.06, 0.13, 20), M.terracotta, 0.88, CRED.y + 0.065, CRED.z);
  // Floating shelves.
  for (const [y, w, x] of [[1.28, 2.0, -0.1], [1.72, 1.5, 0.15]]) {
    add(g, box(w, 0.04, 0.26), M.oak, x, y, Z0 + 0.13);
    const led = add(g, box(w - 0.08, 0.008, 0.012), new T.MeshBasicMaterial({ color: '#000000' }), x, y - 0.024, Z0 + 0.2);
    noShadow.add(led);
    shelfLeds.push(led);
    const l = new T.PointLight('#ffb067', 0, 2.2, 2);
    l.position.set(x, y - 0.12, Z0 + 0.3);
    room.add(l);
    shelfLeds.push(l);
  }
  // Shelf contents: rows of records, books, a gold record, plants.
  add(g, box(0.55, 0.32, 0.22), new T.MeshStandardMaterial({ map: spinesTex, roughness: 0.7 }), -0.75, 1.46, Z0 + 0.13);
  add(g, box(0.05, 0.36, 0.22), M.oak, -0.45, 1.48, Z0 + 0.13);
  [['#7d2f22', 0.24], ['#c7a35a', 0.27], ['#2e4d4a', 0.22], ['#d9d0bd', 0.25], ['#3b3b3b', 0.23], ['#9c4a26', 0.26]].forEach(([c, h], i) => add(g, box(0.035, h, 0.18), new T.MeshStandardMaterial({ color: c, roughness: 0.8 }), 0.25 + i * 0.04, 1.3 + h / 2, Z0 + 0.13, 0, 0, i === 5 ? -0.3 : 0));
  add(g, cyl(0.075, 0.06, 0.14, 20), M.ceramic, 0.65, 1.37, Z0 + 0.13);
  add(g, box(0.9, 0.3, 0.2), new T.MeshStandardMaterial({ map: spinesTex, roughness: 0.7 }), -0.25, 1.89, Z0 + 0.12);
  add(g, cyl(0.07, 0.06, 0.13, 20), M.terracotta, 0.6, 1.805, Z0 + 0.13);
  // Framed gold record.
  add(g, box(0.5, 0.6, 0.03), M.black, 1.55, 1.62, Z0 + 0.015);
  add(g, box(0.46, 0.56, 0.005), new T.MeshStandardMaterial({ color: '#1c1916', roughness: 0.9 }), 1.55, 1.62, Z0 + 0.033);
  add(g, cyl(0.17, 0.17, 0.004, 64), M.brass, 1.55, 1.66, Z0 + 0.037, PI / 2, 0, 0);
  add(g, cyl(0.055, 0.055, 0.005, 32), new T.MeshStandardMaterial({ color: '#9c4a26', roughness: 0.6 }), 1.55, 1.66, Z0 + 0.04, PI / 2, 0, 0);
  add(g, box(0.2, 0.04, 0.003), M.brass, 1.55, 1.42, Z0 + 0.037);
  room.add(g);
  // Recessed downlights over the shelves.
  for (const x of [-1.0, 0, 1.0]) {
    const disc = add(room, cyl(0.06, 0.06, 0.01, 24), new T.MeshBasicMaterial({ color: '#000000' }), x, RH - 0.004, Z0 + 0.45);
    noShadow.add(disc);
    shelfLeds.push(disc);
    const s = new T.SpotLight('#ffc184', 0, 4.5, 0.62, 0.85, 1.6);
    s.position.set(x, RH - 0.02, Z0 + 0.45);
    s.target.position.set(x, 0.6, Z0 + 0.05);
    room.add(s, s.target);
    shelfLeds.push(s);
  }
}

// Wooden bookshelf speakers on stands either side of the console.
const woofers = [];
for (const x of [-1.6, 1.6]) {
  const g = new T.Group();
  g.position.set(x, 0, CRED.z + 0.05);
  g.rotation.y = -x * 0.1;
  add(g, box(0.22, 0.02, 0.22), M.black, 0, 0.01, 0);
  add(g, cyl(0.025, 0.025, 0.56, 12), M.black, 0, 0.3, 0);
  add(g, box(0.18, 0.02, 0.18), M.black, 0, 0.59, 0);
  add(g, rbox(0.27, 0.42, 0.27, 0.01), M.walnut, 0, 0.81, 0);
  add(g, box(0.24, 0.39, 0.005), M.grille, 0, 0.81, 0.137);
  const w = add(g, new T.SphereGeometry(0.075, 24, 12, 0, PI * 2, 0, PI / 2.4), M.cone, 0, 0.73, 0.12, PI / 2, 0, 0);
  add(g, new T.SphereGeometry(0.024, 16, 10, 0, PI * 2, 0, PI / 2), M.brass, 0, 0.92, 0.135, PI / 2, 0, 0);
  woofers.push(w);
  room.add(g);
}

// Turntable.
const TT = { x: 0, y: CRED.y, z: CRED.z };
const turntable = new T.Group();
turntable.position.set(TT.x, TT.y, TT.z);
const platter = new T.Group();
const tonearm = new T.Group();
let disc, discLabel, dropRing;
{
  add(turntable, rbox(0.5, 0.07, 0.38, 0.012), M.walnut, 0, 0.035, 0);
  add(turntable, box(0.46, 0.004, 0.34), new T.MeshStandardMaterial({ color: '#d6d1c7', roughness: 0.35, metalness: 0.7 }), 0, 0.071, 0);
  platter.position.set(-0.04, 0.074, 0);
  add(platter, cyl(0.152, 0.152, 0.018, 64), M.steel, 0, 0.009, 0);
  add(platter, cyl(0.148, 0.148, 0.003, 64), new T.MeshStandardMaterial({ color: '#202020', roughness: 0.95 }), 0, 0.019, 0);
  add(platter, cyl(0.004, 0.004, 0.03, 10), M.steel, 0, 0.03, 0);
  disc = new T.Group();
  disc.position.y = 0.022;
  add(disc, cyl(0.15, 0.15, 0.003, 96), [new T.MeshStandardMaterial({ color: '#0a0a0a' }), M.vinyl, M.vinyl], 0, 0.0015, 0);
  discLabel = add(disc, cyl(0.05, 0.05, 0.0035, 48), new T.MeshStandardMaterial({ color: '#d8c39a', roughness: 0.6 }), 0, 0.002, 0);
  disc.visible = false;
  platter.add(disc);
  turntable.add(platter);
  tonearm.position.set(0.17, 0.075, -0.12);
  add(tonearm, cyl(0.022, 0.026, 0.03, 20), M.steel, 0, 0.015, 0);
  add(tonearm, cyl(0.004, 0.004, 0.24, 10), M.steel, 0, 0.045, 0.12, PI / 2, 0, 0);
  add(tonearm, box(0.018, 0.01, 0.035), M.black, -0.006, 0.042, 0.25, 0, 0.35, 0);
  add(tonearm, cyl(0.014, 0.014, 0.03, 16), M.black, 0, 0.045, -0.035, PI / 2, 0, 0);
  for (const x of [-0.2, -0.16]) add(turntable, cyl(0.012, 0.012, 0.012, 16), M.steel, x, 0.078, 0.15);
  dropRing = add(turntable, new T.TorusGeometry(0.17, 0.004, 8, 64), new T.MeshBasicMaterial({ color: new T.Color(2.2, 1.2, 0.5), transparent: true, opacity: 0 }), -0.04, 0.1, 0, PI / 2, 0, 0);
  noShadow.add(dropRing);
  turntable.add(tonearm);
  room.add(turntable);
}
const STAND = new T.Vector3(0.36, CRED.y + 0.158, CRED.z - 0.06);

// Paper rice lamp in the back-left corner.
const lampLight = new T.PointLight('#ffb36b', 0, 6, 2);
let lampShade;
{
  const g = new T.Group();
  g.position.set(X0 + 0.42, 0, Z0 + 0.45);
  for (const [x, z] of [[-0.1, -0.1], [0.1, -0.1], [0, 0.12]]) add(g, cyl(0.008, 0.008, 0.36, 8), M.black, x, 0.18, z);
  lampShade = add(g, new T.CylinderGeometry(0.19, 0.19, 1.05, 40, 1, false), new T.MeshStandardMaterial({ map: paperTex, roughness: 0.9, emissive: new T.Color('#ffc27a'), emissiveMap: paperTex, emissiveIntensity: 0 }), 0, 0.88, 0);
  noShadow.add(lampShade);
  lampLight.position.set(0, 0.95, 0.32);
  lampLight.castShadow = true;
  lampLight.shadow.mapSize.set(512, 512);
  lampLight.shadow.bias = -0.002;
  lampLight.shadow.radius = 6;
  g.add(lampLight);
  room.add(g);
}

// Lava lamp on a little oak stool right of the sofa.
const lava = new T.ShaderMaterial({
  transparent: true,
  uniforms: { uTime: { value: 0 }, uGlow: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform float uTime, uGlow; varying vec2 vUv;
    void main(){
      float f = 0.0;
      for (int i = 0; i < 6; i++) {
        float fi = float(i);
        vec2 c = vec2(fract(0.17 * fi + 0.1 * sin(uTime * 0.2 + fi)), 0.5 + 0.42 * sin(uTime * (0.11 + 0.03 * fi) + fi * 1.9));
        vec2 d = vUv - c; d.x = (fract(d.x + 0.5) - 0.5) * 2.4;
        f += (0.010 + 0.004 * fi) / dot(d, d);
      }
      f += smoothstep(0.18, 0.0, vUv.y) * 2.0;
      float blob = smoothstep(0.9, 1.25, f);
      vec3 liquid = vec3(0.3, 0.08, 0.05);
      vec3 wax = mix(vec3(2.2, 0.55, 0.2), vec3(2.6, 1.3, 0.35), vUv.y);
      gl_FragColor = vec4(mix(liquid, wax, blob) * uGlow, 0.95);
    }`,
});
const lavaLight = new T.PointLight('#ff7a3d', 0, 3, 2);
{
  const g = new T.Group();
  g.position.set(1.45, 0, SOFA_Z - 0.1);
  add(g, cyl(0.2, 0.2, 0.36, 32), M.oak, 0, 0.18, 0);
  add(g, cyl(0.045, 0.075, 0.12, 24), M.brass, 0, 0.42, 0);
  noShadow.add(add(g, cyl(0.035, 0.058, 0.3, 32), lava, 0, 0.63, 0));
  add(g, cyl(0.02, 0.036, 0.07, 24), M.brass, 0, 0.815, 0);
  lavaLight.position.set(0, 0.68, 0);
  g.add(lavaLight);
  room.add(g);
}

// Leaves, for the plants.
M.leaf = new T.MeshStandardMaterial({ side: T.DoubleSide, alphaTest: 0.5, roughness: 0.6, map: canvasTex(128, 128, (ctx, w, h) => {
  ctx.fillStyle = '#3f6b2e';
  ctx.beginPath(); ctx.moveTo(w / 2, h * 0.02); ctx.bezierCurveTo(w * 1.05, h * 0.3, w * 0.8, h * 0.85, w / 2, h * 0.98); ctx.bezierCurveTo(w * 0.2, h * 0.85, -w * 0.05, h * 0.3, w / 2, h * 0.02); ctx.fill();
  ctx.strokeStyle = '#86a860'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(w / 2, h * 0.08); ctx.lineTo(w / 2, h * 0.92); ctx.stroke();
}) });
const leafGeo = new T.PlaneGeometry(0.075, 0.085);
// Trailing pothos: vines hanging from a pot.
function trailing(from, n, len, seed) {
  const rand = rng(seed);
  for (let v = 0; v < n; v++) {
    const a = rand() * PI * 2, drift = new T.Vector3(Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1);
    const steps = Math.round(len / 0.06 * (0.6 + rand() * 0.6));
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const p = from.clone().add(drift.clone().multiplyScalar(Math.min(1, t * 4))).add(new T.Vector3(Math.sin(i * 0.7 + v) * 0.02, -i * 0.06, Math.cos(i * 0.5 + v) * 0.015));
      const leaf = add(room, leafGeo, M.leaf, p.x, p.y, p.z, rand() - 0.5, rand() * PI * 2, rand() - 0.5);
      leaf.scale.setScalar(0.8 + rand() * 0.6);
    }
  }
}
trailing(new T.Vector3(0.6, 1.9, Z0 + 0.15), 4, 0.9, 3);
trailing(new T.Vector3(0.88, CRED.y + 0.14, CRED.z), 3, 0.4, 5);
trailing(new T.Vector3(X0 + 0.07, WIN.y0 + 0.13, WIN.z1 - 0.2), 3, 0.7, 8);
// A fern in the front-right corner.
{
  const g = new T.Group();
  g.position.set(X1 - 0.4, 0, 1.25);
  add(g, cyl(0.2, 0.15, 0.4, 28), M.terracotta, 0, 0.2, 0);
  const rand = rng(21);
  const frond = new T.PlaneGeometry(0.12, 0.7);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * PI * 2 + rand() * 0.3;
    const m = add(g, frond, M.leaf, Math.cos(a) * 0.18, 0.62, Math.sin(a) * 0.18);
    m.rotation.set(0, -a + PI / 2, 0); m.rotateX(0.9 + rand() * 0.4);
  }
  room.add(g);
}

// Right wall: two guitars, a skateboard, a wall shelf of books, and the poster.
function guitar(x, y, z, body, scale) {
  const g = new T.Group();
  const s = new T.Shape();
  s.absarc(0, 0, 0.19, PI * 0.25, PI * 0.75 + PI * 2, false);
  const s2 = new T.Shape();
  s2.absarc(0, 0.25, 0.145, 0, PI * 2, false);
  const mat = new T.MeshPhysicalMaterial({ color: body, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  add(g, new T.ExtrudeGeometry(s, { depth: 0.09, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, curveSegments: 36 }), mat, 0, 0, -0.045);
  add(g, new T.ExtrudeGeometry(s2, { depth: 0.09, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, curveSegments: 36 }), mat, 0, 0, -0.045);
  add(g, new T.CircleGeometry(0.05, 32), M.black, 0, 0.16, 0.054);
  add(g, box(0.05, 0.5, 0.025), M.walnut, 0, 0.62, 0.02);
  add(g, box(0.075, 0.15, 0.02), M.walnut, 0, 0.94, 0.02);
  add(g, box(0.1, 0.018, 0.012), M.black, 0, -0.08, 0.06);
  g.scale.setScalar(scale);
  g.position.set(x, y, z);
  g.rotation.y = -PI / 2;
  room.add(g);
}
guitar(X1 - 0.07, 1.0, 1.85, '#b06a2c', 1);
guitar(X1 - 0.07, 1.05, 2.35, '#2f5f5c', 0.9);
{
  const g = new T.Group();
  g.position.set(X1 - 0.08, 0.36, -0.35);
  g.rotation.set(0, -PI / 2, 0.06);
  g.rotateX(-0.12);
  add(g, rbox(0.2, 0.78, 0.016, 0.006), new T.MeshStandardMaterial({ map: swirlTex(128, 512, ['#c08a2e', '#9c4a26', '#e9dcc0'], { seed: 9, rings: 6 }), roughness: 0.6 }), 0, 0, 0);
  for (const y of [-0.27, 0.27]) for (const x of [-0.07, 0.07]) add(g, cyl(0.026, 0.026, 0.03, 16), new T.MeshStandardMaterial({ color: '#e9dcc0', roughness: 0.5 }), x, y, -0.04, 0, 0, PI / 2);
  room.add(g);
}
{
  const g = new T.Group();
  add(g, box(0.24, 0.03, 1.0), M.oak, X1 - 0.12, 1.15, 0.55);
  const rand = rng(8);
  let z = 0.1;
  const cols = ['#7d2f22', '#c7a35a', '#2e4d4a', '#d9d0bd', '#3b3b3b', '#56402c', '#8a8f7a', '#a8552f'];
  while (z < 0.85) {
    const t = 0.03 + rand() * 0.035, hh = 0.18 + rand() * 0.1;
    add(g, box(0.17, hh, t), new T.MeshStandardMaterial({ color: cols[(rand() * cols.length) | 0], roughness: 0.85 }), X1 - 0.12, 1.165 + hh / 2, z + t / 2);
    z += t + 0.004;
  }
  add(g, cyl(0.07, 0.06, 0.13, 20), M.ceramic, X1 - 0.13, 1.23, 0.97);
  room.add(g);
  trailing(new T.Vector3(X1 - 0.13, 1.28, 0.97), 3, 0.7, 11);
}

// The framed wave poster: a slow, endless screen print.
const poster = new T.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uGlow: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform float uTime, uGlow; varying vec2 vUv;
    void main(){
      vec2 p = vUv;
      float t = uTime * 0.05;
      float y = p.y + 0.06 * sin(p.x * 7.0 + t * 6.0) + 0.04 * sin(p.x * 13.0 - t * 4.0 + p.y * 5.0);
      float band = floor(y * 11.0 + 0.6 * sin(p.x * 3.0 + t * 3.0));
      vec3 cols[5];
      cols[0] = vec3(0.61, 0.29, 0.15); cols[1] = vec3(0.91, 0.86, 0.75); cols[2] = vec3(0.75, 0.54, 0.18); cols[3] = vec3(0.36, 0.40, 0.2); cols[4] = vec3(0.85, 0.45, 0.38);
      int k = int(mod(band, 5.0));
      vec3 col = cols[0];
      if (k == 1) col = cols[1]; else if (k == 2) col = cols[2]; else if (k == 3) col = cols[3]; else if (k == 4) col = cols[4];
      vec2 s = (vUv - vec2(0.5, 0.7)) * vec2(1.0, 1.35);
      col = mix(col, vec3(0.97, 0.72, 0.3), smoothstep(0.17, 0.16, length(s)) * step(0.62, vUv.y + 0.0));
      float inner = step(0.06, vUv.x) * step(vUv.x, 0.94) * step(0.05, vUv.y) * step(vUv.y, 0.95);
      col = mix(vec3(0.93, 0.88, 0.78), col, inner);
      gl_FragColor = vec4(pow(col, vec3(2.2)) * uGlow, 1.0);
    }`,
});
{
  const g = new T.Group();
  add(g, box(0.03, 1.12, 0.84), M.oak, X1 - 0.015, 1.75, 0.45);
  noShadow.add(add(g, new T.PlaneGeometry(0.78, 1.06), poster, X1 - 0.032, 1.75, 0.45, 0, -PI / 2, 0));
  room.add(g);
}

// Fairy lights: scallops above the window and along the top of the back wall, one across the ceiling.
const fairy = { bulbs: null, lights: [], mat: new T.MeshBasicMaterial({ color: '#ffffff' }) };
{
  const strands = [];
  const scallop = (a, b, n, sag) => { for (let i = 0; i < n; i++) strands.push([a.clone().lerp(b, i / n), a.clone().lerp(b, (i + 1) / n), sag]); };
  scallop(new T.Vector3(X0 + 0.05, 2.28, WIN.z0 - 0.2), new T.Vector3(X0 + 0.05, 2.28, WIN.z1 + 0.2), 4, 0.1);
  scallop(new T.Vector3(X0 + 0.15, 2.5, Z0 + 0.06), new T.Vector3(X1 - 0.15, 2.5, Z0 + 0.06), 5, 0.12);
  strands.push([new T.Vector3(X0 + 0.2, 2.56, Z0 + 0.2), new T.Vector3(X1 - 0.2, 2.56, 1.0), 0.45]);
  const bulbs = [];
  const wire = new T.MeshStandardMaterial({ color: '#222', roughness: 0.7 });
  for (const [a, b, sag] of strands) {
    const pts = [];
    for (let i = 0; i <= 24; i++) { const t = i / 24; const p = a.clone().lerp(b, t); p.y -= sag * 4 * t * (1 - t); pts.push(p); }
    const curve = new T.CatmullRomCurve3(pts);
    noShadow.add(add(room, new T.TubeGeometry(curve, 48, 0.0025, 4), wire));
    const len = curve.getLength(), n = Math.max(2, Math.round(len / 0.15));
    for (let i = 0; i < n; i++) bulbs.push(curve.getPointAt((i + 0.5) / n));
    if (sag > 0.3) fairy.lights.push(curve.getPointAt(0.5));
  }
  const im = new T.InstancedMesh(new T.SphereGeometry(0.012, 8, 6), fairy.mat, bulbs.length);
  const rand = rng(3), mtx = new T.Matrix4(), col = new T.Color();
  bulbs.forEach((p, i) => {
    mtx.makeTranslation(p.x, p.y - 0.012, p.z);
    im.setMatrixAt(i, mtx);
    col.setRGB(1, 0.62 + rand() * 0.15, 0.3 + rand() * 0.15);
    im.setColorAt(i, col);
  });
  noShadow.add(im);
  room.add(im);
  fairy.bulbs = im;
  fairy.lights.push(new T.Vector3(X0 + 0.3, 2.2, -0.6));
  fairy.lights = fairy.lights.map((p) => { const l = new T.PointLight('#ffad5c', 0, 5, 2); l.position.copy(p); room.add(l); return l; });
}

// ---------------------------------------------------------------- lighting
const hemi = new T.HemisphereLight('#cfe3ff', '#6d5a46', 1);
scene.add(hemi);
const sun = new T.DirectionalLight('#fff0d8', 4);
sun.position.set(X0 - 3.4, 3.7, 0.9);
sun.target.position.set(0.5, 0, -1.0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 0.5, far: 14 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.02;
sun.shadow.radius = 4;
scene.add(sun, sun.target);
const fill = new T.PointLight('#ffd7a8', 0, 8, 2);
fill.position.set(0.5, 2.2, 0.4);
scene.add(fill);

// Light leaking through the window: a soft shaft with dust drifting in it.
const shaftDir = sun.target.position.clone().sub(sun.position).normalize();
const shaft = (() => {
  const L = 5.2;
  const corners = [[WIN.z0, WIN.y0], [WIN.z1, WIN.y0], [WIN.z1, WIN.y1], [WIN.z0, WIN.y1]].map(([z, y]) => new T.Vector3(X0, y, z));
  const far = corners.map((c) => c.clone().addScaledVector(shaftDir, L));
  const pos = [], along = [], side = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4], c = far[(i + 1) % 4], d = far[i];
    for (const [p, t, s] of [[a, 0, 0], [b, 0, 1], [c, 1, 1], [a, 0, 0], [c, 1, 1], [d, 1, 0]]) { pos.push(p.x, p.y, p.z); along.push(t); side.push(s); }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  geo.setAttribute('along', new T.Float32BufferAttribute(along, 1));
  geo.setAttribute('side', new T.Float32BufferAttribute(side, 1));
  const mat = new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
    uniforms: { uStrength: { value: 1 }, uTime: { value: 0 } },
    vertexShader: 'attribute float along; attribute float side; varying float vA; varying float vS; void main(){ vA = along; vS = side; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uStrength, uTime; varying float vA; varying float vS;
      void main(){ float edge = smoothstep(0.0, 0.35, vS) * smoothstep(1.0, 0.65, vS);
        float flick = 0.85 + 0.15 * sin(uTime * 0.7 + vS * 6.0);
        float a = pow(1.0 - vA, 1.6) * edge * flick * 0.11 * uStrength;
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.62) * a, a); }`,
  });
  const m = new T.Mesh(geo, mat);
  noShadow.add(m);
  scene.add(m);
  return m;
})();
const dust = (() => {
  const n = 420, pos = new Float32Array(n * 3), rand = rng(17);
  for (let i = 0; i < n; i++) {
    const t = rand() * 3.8;
    const p = new T.Vector3(X0, lerp(WIN.y0, WIN.y1, rand()), lerp(WIN.z0, WIN.z1, rand())).addScaledVector(shaftDir, t);
    pos.set([p.x, p.y, p.z], i * 3);
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  const mat = new T.PointsMaterial({ size: 0.012, map: dotSprite(), transparent: true, depthWrite: false, blending: T.AdditiveBlending, color: new T.Color(1.6, 1.4, 1.1), opacity: 0.6 });
  const pts = new T.Points(geo, mat);
  noShadow.add(pts);
  scene.add(pts);
  return { pts, base: pos.slice(), n };
})();

room.traverse((o) => { if (o.isMesh && !noShadow.has(o)) { o.castShadow = true; o.receiveShadow = true; } });
const hifiMats = [];
room.traverse((o) => { if (o.userData.hifi) hifiMats.push(o.material); });

// ---------------------------------------------------------------- crates & records
const SLEEVE = 0.31, THICK = 0.0032;
// The three crates sit in the console's cubbies, under the turntable.
const CRATE = { w: 0.38, d: 0.38, h: 0.25, front: 0.15, z: CRED.z + 0.01, y: 0.118, xs: [-2.3 / 3, 0, 2.3 / 3] };
const loader = new T.TextureLoader();
loader.setCrossOrigin('anonymous');
const sleeveGeo = new T.BoxGeometry(SLEEVE, SLEEVE, THICK);
const crates = CRATE.xs.map((x, ci) => {
  const g = new T.Group();
  g.position.set(x, CRATE.y, CRATE.z);
  const tone = [[1, 1, 1], [0.86, 0.8, 0.74], [1.05, 0.95, 0.85]][ci];
  const wood = M.pine.clone(); wood.color.setRGB(...tone);
  const { w, d, h, front } = CRATE;
  add(g, box(w, 0.02, d), wood, 0, 0.01, 0);
  for (const s of [-1, 1]) for (const y of [0.05, 0.155]) add(g, box(0.018, 0.075, d), wood, s * (w / 2 - 0.009), y + 0.012, 0);
  for (const y of [0.05, 0.155]) add(g, box(w, 0.075, 0.018), wood, 0, y + 0.012, -d / 2 + 0.009);
  for (const s of [-1, 1]) for (const z of [-1, 1]) add(g, box(0.03, h, 0.03), wood, s * (w / 2 - 0.015), h / 2, z * (d / 2 - 0.015));
  add(g, box(w, front - 0.02, 0.018), wood, 0, (front - 0.02) / 2 + 0.01, d / 2 - 0.009);
  const plate = add(g, new T.PlaneGeometry(0.3, 0.098), new T.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 }), 0, 0.075, d / 2 + 0.001);
  plate.castShadow = false;
  const hit = add(g, box(w + 0.2, h + 0.1, d + 0.04), new T.MeshBasicMaterial({ visible: false }), 0, (h + 0.1) / 2, 0);
  hit.userData.crate = ci;
  g.traverse((o) => { if (o.isMesh && o !== hit) { o.castShadow = true; o.receiveShadow = true; } });
  room.add(g);
  return { ci, group: g, plate, hit, wood, data: null, recs: [], focus: 0 };
});

// ---------------------------------------------------------------- the listener
// One set of pose numbers drives both characters: the built-in one (simple
// shapes on joints) and a custom .glb (a standing mesh bent per vertex).
// Angles: thigh/arm forward is positive, knee bend is positive, lean forward
// is positive, twist turns the upper body like rotation.y.
const SEAT = { x: 0, z: SOFA_Z + 0.03, h: 0 };
const FRONT = { x: 0, z: SOFA_Z - 0.62 };
const P = {
  thigh: { L: 0, R: 0 }, knee: { L: 0, R: 0 }, armF: { L: 0, R: 0 }, armD: { L: -0.78, R: -0.78 },
  lean: 0, twist: 0, breath: 0, armsOnly: false,
};

// Built-in listener: hoodie, jeans, headphones. Origin at the hips, facing -z.
const avatar = new T.Group();
const builtIn = { upper: new T.Group(), arms: {}, hips: {}, knees: {}, torso: null, chest: null, head: [] };
{
  const u = builtIn.upper;
  avatar.add(u);
  builtIn.torso = add(u, new T.CapsuleGeometry(0.17, 0.32, 6, 16), M.hoodie, 0, 0.27, 0.04, -0.12);
  builtIn.chest = add(u, new T.SphereGeometry(0.2, 20, 14), M.hoodie, 0, 0.44, 0.06);
  builtIn.chest.scale.set(1.35, 0.55, 0.9);
  builtIn.head = [
    add(u, cyl(0.05, 0.055, 0.1, 12), M.skin, 0, 0.52, 0.03),
    add(u, new T.SphereGeometry(0.105, 24, 18), M.skin, 0, 0.64, 0.01),
    add(u, new T.SphereGeometry(0.113, 24, 18, 0, PI * 2, 0, PI * 0.58), M.hair, 0, 0.655, 0.025),
    add(u, new T.TorusGeometry(0.115, 0.012, 8, 28, PI), M.black, 0, 0.54, 0.03, PI / 2 - 0.4, 0, 0),
  ];
  builtIn.head[1].scale.set(1, 1.12, 1.05); builtIn.head[2].scale.set(1, 1.1, 1.05);
  for (const [k, s] of [['L', -1], ['R', 1]]) {
    const arm = new T.Group();
    arm.position.set(s * 0.22, 0.4, 0.04);
    add(arm, new T.CapsuleGeometry(0.055, 0.3, 4, 10), M.hoodie, s * 0.02, -0.2, 0, 0, 0, s * 0.08);
    add(arm, new T.SphereGeometry(0.045, 12, 10), M.skin, s * 0.035, -0.4, 0);
    u.add(arm); builtIn.arms[k] = arm;
    const hip = new T.Group();
    hip.position.set(s * 0.1, 0, 0);
    add(hip, new T.CapsuleGeometry(0.075, 0.3, 4, 10), M.denim, 0, -0.21, 0);
    const knee = new T.Group();
    knee.position.set(0, -0.43, 0);
    add(knee, new T.CapsuleGeometry(0.058, 0.3, 4, 10), M.denim, 0, -0.2, 0);
    add(knee, rbox(0.11, 0.07, 0.25, 0.03), M.sneaker, 0, -0.42, -0.05);
    hip.add(knee); avatar.add(hip);
    builtIn.hips[k] = hip; builtIn.knees[k] = knee;
  }
}
room.add(avatar);
const builtInAvatar = avatar;
builtIn.standHip = 0.9; builtIn.seatHip = 0.44; builtIn.seatKnee = 1.45;

// A custom character (a standing .glb) takes the listener's place. It is
// scaled to a person's height and bent per vertex at the hips, knees,
// shoulders and waist. The arm weights follow the line from the shoulder to
// the hand of a model in an A or T pose.
let customAvatar = null, avatarUrl = '';
const sm = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function rigModel(root) {
  root.updateMatrixWorld(true);
  const bbox = new T.Box3().setFromObject(root);
  const size = bbox.getSize(new T.Vector3());
  const H = size.y, y0 = bbox.min.y, hipY = y0 + H * 0.5, kneeY = y0 + H * 0.28;
  const zc = (bbox.min.z + bbox.max.z) / 2, xc = (bbox.min.x + bbox.max.x) / 2;
  const S = { x: H * 0.09, y: y0 + H * 0.8, z: zc - H * 0.014 };
  const armDir = new T.Vector2(0.27, -0.26).normalize();
  const scale = 1.78 / H;
  const rig = { H, xc, zc, hipY, kneeY, S, parts: [], standHip: 0.5 * 1.78, seatHip: 0.4, seatKnee: PI * 0.32 };
  const v = new T.Vector3();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry = o.geometry.clone();
    g.computeVertexNormals();
    const pos = g.attributes.position, nrm = g.attributes.normal, n = pos.count;
    const base = new Float32Array(n * 3), nBase = new Float32Array(n * 3);
    const wArm = new Float32Array(n), wUp = new Float32Array(n), wChest = new Float32Array(n);
    const wThigh = new Float32Array(n), wKnee = new Float32Array(n), side = new Int8Array(n), shirt = new Float32Array(n);
    let anyShirt = false;
    const nm = new T.Matrix3().getNormalMatrix(o.matrixWorld);
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      base[i * 3] = v.x; base[i * 3 + 1] = v.y; base[i * 3 + 2] = v.z;
      const y = v.y, fx = (v.x - xc) / H, fy = (y - y0) / H;
      side[i] = fx < 0 ? -1 : 1;
      const ax = Math.abs(fx) - S.x / H, ay = fy - (S.y - y0) / H;
      const along = ax * armDir.x + ay * armDir.y;
      const off = Math.hypot(ax - along * armDir.x, ay - along * armDir.y);
      wArm[i] = sm(-0.005, 0.04, along) * (1 - sm(0.07, 0.1, off));
      wUp[i] = sm(hipY + H * 0.01, hipY + H * 0.12, y);
      wChest[i] = sm(0.58, 0.68, fy) * (1 - sm(0.74, 0.8, fy)) * (1 - sm(0.07, 0.1, Math.abs(fx))) * (v.z > S.z ? 1 : 0.3);
      wThigh[i] = wArm[i] > 0.5 ? 0 : sm(hipY + H * 0.02, hipY - H * 0.05, y);
      wKnee[i] = wArm[i] > 0.5 ? 0 : sm(kneeY + H * 0.03, kneeY - H * 0.03, y);
      // A white tank top: from the waistband up, scooped at the neck, thin
      // straps over the shoulders, open armholes so the arms stay bare.
      if (settings.tank) {
        const ax2 = Math.abs(fx), front = v.z > S.z;
        const top = ax2 < 0.045 ? (front ? 0.735 : 0.775) : ax2 < 0.078 ? 0.835 : 0.765;
        const m = sm(0.565, 0.575, fy) * (1 - sm(top - 0.006, top + 0.006, fy)) * (1 - sm(0.06, 0.16, wArm[i])) * (1 - sm(0.105, 0.12, ax2));
        shirt[i] = m; if (m > 0) anyShirt = true;
      }
      v.fromBufferAttribute(nrm, i).applyMatrix3(nm).normalize();
      nBase[i * 3] = v.x; nBase[i * 3 + 1] = v.y; nBase[i * 3 + 2] = v.z;
    }
    if (anyShirt) {
      g.setAttribute('shirt', new T.BufferAttribute(shirt, 1));
      const mat = o.material = o.material.clone();
      mat.onBeforeCompile = (sh) => {
        sh.vertexShader = 'attribute float shirt;\nvarying float vShirt;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvShirt = shirt;');
        sh.fragmentShader = 'varying float vShirt;\n' + sh.fragmentShader
          .replace('#include <map_fragment>', '#include <map_fragment>\nfloat lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.89, 0.86) * (0.82 + 0.5 * lum), vShirt);')
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.92, vShirt);');
      };
    }
    const inv = new T.Matrix4().copy(o.matrixWorld).invert();
    const nInv = new T.Matrix3().getNormalMatrix(o.matrixWorld).invert();
    let minY = Infinity; for (let i = 1; i < n * 3; i += 3) minY = Math.min(minY, base[i]);
    rig.parts.push({ pos, nrm, base, nBase, wArm, wUp, wChest, wThigh, wKnee, side, inv, nInv, mesh: o, head: minY > y0 + H * 0.76 });
    o.castShadow = true; o.receiveShadow = true;
    o.frustumCulled = false;
  });
  // The holder's origin is the hips; the model faces +z, so turn it to face -z like the room's listener.
  const holder = new T.Group();
  root.position.set(-xc, -hipY, -zc);
  const inner = new T.Group();
  inner.scale.setScalar(scale);
  inner.add(root);
  inner.rotation.y = PI;
  holder.add(inner);
  holder.userData.rig = rig;
  return holder;
}
function loadAvatar(url) {
  if (url === avatarUrl) return;
  avatarUrl = url;
  if (customAvatar) { room.remove(customAvatar); customAvatar = null; }
  if (!url) { builtInAvatar.visible = true; return; }
  new T.GLTFLoader().load(url, (gltf) => {
    if (avatarUrl !== url) return;
    customAvatar = rigModel(gltf.scene);
    room.add(customAvatar);
    builtInAvatar.visible = false;
  }, undefined, () => { showError('That character model couldn’t be loaded.'); });
}

// A furniture model (couch, coffee table, rug, already placed in room
// coordinates, with its layout in the scene's extras) replaces the stock ones.
let furniture = null, furnitureUrl = '';
function loadFurniture(url) {
  if (url === furnitureUrl) return;
  furnitureUrl = url;
  if (furniture) { room.remove(furniture); furniture = null; }
  const stockOn = (on) => { for (const k of ['sofa', 'table', 'rug', 'beanbag']) stock[k].visible = on; };
  if (!url) { stockOn(true); return; }
  new T.GLTFLoader().load(url, (gltf) => {
    if (furnitureUrl !== url) return;
    const L = gltf.scene.userData.layout || gltf.scene.children[0]?.userData.layout;
    if (!L) { showError('That furniture model has no room layout in it.'); return; }
    furniture = gltf.scene;
    furniture.traverse((o) => { if (o.isMesh) { o.castShadow = o.name !== 'rug'; o.receiveShadow = true; if (o.name === 'rug') o.position.y -= L.rug.y - 0.012; } });
    room.add(furniture);
    stockOn(false);
    const { sofa: S, table: Tb } = L;
    // An L couch: the long side along the front wall, the short side along the left one.
    LAYOUT.sofa = [[S.minX, S.maxX, S.maxZ - S.depth, Z1], [X0, S.minX + S.depth, S.minZ, Z1]];
    LAYOUT.table = { rect: [Tb.x - Tb.w / 2, Tb.x + Tb.w / 2, Tb.z - Tb.d / 2, Tb.z + Tb.d / 2] };
    LAYOUT.beanbag = false;
    Object.assign(TABLE, { x: Tb.x, z: Tb.z, y: Tb.y, w: Tb.w, d: Tb.d });
    // He sits on the short arm facing into the room, so the corner camera sees him.
    const armZ = (S.minZ + S.maxZ - S.depth) / 2, armX = S.minX + S.depth / 2;
    Object.assign(SEAT, { x: armX + 0.04, z: armZ + 0.1, h: -PI / 2 });
    Object.assign(FRONT, { x: S.minX + S.depth + 0.32, z: armZ + 0.1 });
    Object.assign(LIE, { x: armX, z: armZ + 0.05, psi: PI, at: { x: armX + 1.6, y: 1.35, z: armZ + 0.9 } });
    setLie();
    LAYOUT.cam = { pos: new T.Vector3(X1 - 0.25, 2.45, Z1 - 0.15), at: new T.Vector3(-0.6, 0.1, -0.9) };
    buildNav();
    if (body.state === 'seated') { body.x = SEAT.x; body.z = SEAT.z; body.h = SEAT.h; }
    for (const r of recs) if (r.state === 'table') { r.tablePose = tableSlot(); }
  }, undefined, () => { showError('The furniture model couldn’t be loaded.'); });
}

// Bend the custom mesh into pose P. Model +x is the character's left.
function poseCustom(rig) {
  const { H, xc, zc, hipY, kneeY, S } = rig;
  const rise = P.breath * 0.006 * H, swell = P.breath * 0.01 * H;
  const sideK = { 1: 'L', [-1]: 'R' };
  const trig = {};
  for (const s of [1, -1]) {
    const k = sideK[s];
    const th = -P.thigh[k];
    // Where the knee sits once the thigh has turned.
    const ky = hipY + (kneeY - hipY) * Math.cos(th), kz = zc + (kneeY - hipY) * Math.sin(th);
    trig[s] = { th, ky, kz, kn: P.knee[k], a: P.armD[k], b: -P.armF[k] };
  }
  const tw = P.twist, ln = P.lean;
  for (const p of rig.parts) {
    const { base, nBase, wArm, wUp, wChest, wThigh, wKnee, side: sd } = p;
    const pa = p.pos.array, na = p.nrm.array, e = p.inv.elements, ne = p.nInv.elements;
    const n = wArm.length;
    for (let i = 0; i < n; i++) {
      let x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
      let nx = nBase[i * 3], ny = nBase[i * 3 + 1], nz = nBase[i * 3 + 2];
      const s = sd[i], g = trig[s];
      const wt = wThigh[i];
      if (wt > 0) {
        const a = g.th * wt, ca = Math.cos(a), sa = Math.sin(a);
        const yy = y - hipY, zz = z - zc;
        y = hipY + yy * ca - zz * sa; z = zc + yy * sa + zz * ca;
        const ny2 = ny * ca - nz * sa; nz = ny * sa + nz * ca; ny = ny2;
        const wk = wKnee[i];
        if (wk > 0) {
          const b = g.kn * wk, cb = Math.cos(b), sb = Math.sin(b);
          const y2 = y - g.ky, z2 = z - g.kz;
          y = g.ky + y2 * cb - z2 * sb; z = g.kz + y2 * sb + z2 * cb;
          const ny3 = ny * cb - nz * sb; nz = ny * sb + nz * cb; ny = ny3;
        }
      }
      const wa = wArm[i];
      if (wa > 0) {
        // Lower the arm from the shoulder (in its own mirrored frame), then swing it.
        const a = g.a * wa, ca = Math.cos(a), sa = Math.sin(a);
        const u = s * (x - xc) - S.x, w = y - S.y;
        x = xc + s * (S.x + u * ca - w * sa); y = S.y + u * sa + w * ca;
        const nu = s * nx; nx = s * (nu * ca - ny * sa); ny = nu * sa + ny * ca;
        const b = g.b * wa, cb = Math.cos(b), sb = Math.sin(b);
        const yy = y - S.y, zz = z - S.z;
        y = S.y + yy * cb - zz * sb; z = S.z + yy * sb + zz * cb;
        const ny2 = ny * cb - nz * sb; nz = ny * sb + nz * cb; ny = ny2;
      }
      const wu = wUp[i];
      if (wu > 0) {
        y += rise * wu;
        z += swell * wChest[i];
        const t = tw * wu, ct = Math.cos(t), st = Math.sin(t);
        const dx = x - xc, dz = z - zc;
        x = xc + dx * ct + dz * st; z = zc - dx * st + dz * ct;
        const nx2 = nx * ct + nz * st; nz = -nx * st + nz * ct; nx = nx2;
        const l = ln * wu, cl = Math.cos(l), sl = Math.sin(l);
        const yy = y - hipY, zz = z - zc;
        y = hipY + yy * cl - zz * sl; z = zc + yy * sl + zz * cl;
        const ny3 = ny * cl - nz * sl; nz = ny * sl + nz * cl; ny = ny3;
      }
      // First person at the shelf: only his arms and hands, the camera sits where his chest would be.
      if (P.armsOnly && wa < 0.35) { x = xc; y = S.y; z = S.z; }
      pa[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
      pa[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      pa[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      na[i * 3] = ne[0] * nx + ne[3] * ny + ne[6] * nz;
      na[i * 3 + 1] = ne[1] * nx + ne[4] * ny + ne[7] * nz;
      na[i * 3 + 2] = ne[2] * nx + ne[5] * ny + ne[8] * nz;
    }
    p.pos.needsUpdate = true; p.nrm.needsUpdate = true;
  }
}
function poseBuiltIn() {
  const b = P.breath;
  builtIn.torso.scale.set(1 + b * 0.015, 1 + b * 0.02, 1 + b * 0.035);
  builtIn.chest.position.y = 0.44 + b * 0.008;
  builtIn.upper.rotation.set(-P.lean, P.twist, 0, 'YXZ');
  for (const k of ['L', 'R']) {
    builtIn.hips[k].rotation.x = P.thigh[k];
    builtIn.knees[k].rotation.x = -P.knee[k];
    builtIn.arms[k].rotation.x = P.armF[k];
  }
}

// ---------------------------------------------------------------- moving around
// Walkable floor as a grid; furniture blocks cells (grown by the body's radius).
const NAV = { cell: 0.08, x0: X0, z0: Z0, r: 0.2 };
NAV.nx = Math.ceil((X1 + 0.6 - X0) / NAV.cell); NAV.nz = Math.ceil((Z1 - Z0) / NAV.cell);
NAV.free = new Uint8Array(NAV.nx * NAV.nz);
// What blocks the floor: the sofa (rects, also where a click means "the sofa"),
// the coffee table, and the rest. A furniture model swaps the first two.
const LAYOUT = {
  sofa: [[-1.17, 1.17, SOFA_Z - 0.46, Z1], [-1.17, -0.39, SOFA_Z - 1.24, SOFA_Z]],
  table: { circle: [TABLE.x, TABLE.z, 0.36] },
  beanbag: true,
  cam: null,
};
function buildNav() {
  const rects = [...LAYOUT.sofa, [-1.2, 1.2, Z0, CRED.z + 0.24]];
  if (LAYOUT.table.rect) rects.push(LAYOUT.table.rect);
  const circles = [
    [X0 + 0.42, Z0 + 0.45, 0.22], [-1.6, CRED.z + 0.05, 0.16], [1.6, CRED.z + 0.05, 0.16],
    [1.45, SOFA_Z - 0.1, 0.16], [X1 - 0.4, 1.25, 0.28],
  ];
  if (LAYOUT.table.circle) circles.push(LAYOUT.table.circle);
  if (LAYOUT.beanbag) circles.push([-1.75, -0.55, 0.5]);
  const r = NAV.r;
  for (let j = 0; j < NAV.nz; j++) for (let i = 0; i < NAV.nx; i++) {
    const x = NAV.x0 + (i + 0.5) * NAV.cell, z = NAV.z0 + (j + 0.5) * NAV.cell;
    const inRoom = x > X0 + r && x < X1 - r && z > Z0 + r && z < Z1 - r;
    const inDoor = x >= X1 - r && x < X1 + 0.45 && z > DOOR.z0 + r && z < DOOR.z1 - r;
    let ok = inRoom || inDoor;
    if (ok) for (const [a, b, c, d] of rects) if (x > a - r && x < b + r && z > c - r && z < d + r) { ok = false; break; }
    if (ok) for (const [cx, cz, cr] of circles) if (Math.hypot(x - cx, z - cz) < cr + r) { ok = false; break; }
    NAV.free[j * NAV.nx + i] = ok ? 1 : 0;
  }
}
buildNav();
const isSofa = (p) => LAYOUT.sofa.some(([a, b, c, d]) => p.x > a - 0.05 && p.x < b + 0.05 && p.z > c - 0.05 && p.z < d + 0.05);
const navCell = (x, z) => [clamp(Math.floor((x - NAV.x0) / NAV.cell), 0, NAV.nx - 1), clamp(Math.floor((z - NAV.z0) / NAV.cell), 0, NAV.nz - 1)];
const navFree = (i, j) => i >= 0 && j >= 0 && i < NAV.nx && j < NAV.nz && NAV.free[j * NAV.nx + i] === 1;
const navPoint = (i, j) => ({ x: NAV.x0 + (i + 0.5) * NAV.cell, z: NAV.z0 + (j + 0.5) * NAV.cell });
function nearestFree(x, z) {
  const [ci, cj] = navCell(x, z);
  if (navFree(ci, cj)) return [ci, cj];
  for (let r = 1; r < 40; r++) {
    let best = null, bd = 1e9;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r || !navFree(ci + di, cj + dj)) continue;
      const p = navPoint(ci + di, cj + dj), d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) { bd = d; best = [ci + di, cj + dj]; }
    }
    if (best) return best;
  }
  return [ci, cj];
}
function lineFree(a, b) {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (NAV.cell * 0.5));
  for (let k = 0; k <= n; k++) { const [i, j] = navCell(lerp(a.x, b.x, k / n), lerp(a.z, b.z, k / n)); if (!navFree(i, j)) return false; }
  return true;
}
// A* over the grid, then pull the path tight so he walks in straight lines.
function findPath(from, to) {
  const [si, sj] = nearestFree(from.x, from.z), [ti, tj] = nearestFree(to.x, to.z);
  const N = NAV.nx * NAV.nz, start = sj * NAV.nx + si, goal = tj * NAV.nx + ti;
  const g = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const open = [start]; g[start] = 0;
  const h = (k) => Math.hypot((k % NAV.nx) - ti, Math.floor(k / NAV.nx) - tj);
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (g[open[k]] + h(open[k]) < g[open[bi]] + h(open[bi])) bi = k;
    const cur = open.splice(bi, 1)[0];
    if (cur === goal) break;
    closed[cur] = 1;
    const ci = cur % NAV.nx, cj = Math.floor(cur / NAV.nx);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = ci + di, nj = cj + dj;
      if (!navFree(ni, nj) || (di && dj && (!navFree(ci + di, cj) || !navFree(ci, cj + dj)))) continue;
      const k = nj * NAV.nx + ni;
      if (closed[k]) continue;
      const ng = g[cur] + (di && dj ? 1.414 : 1);
      if (ng < g[k]) { g[k] = ng; came[k] = cur; if (!open.includes(k)) open.push(k); }
    }
  }
  if (came[goal] < 0 && goal !== start) return null;
  const cells = [];
  for (let k = goal; k >= 0; k = k === start ? -1 : came[k]) cells.unshift(navPoint(k % NAV.nx, Math.floor(k / NAV.nx)));
  const pts = [{ x: from.x, z: from.z }];
  for (const c of cells.slice(1)) pts.push(c);
  if (navFree(ti, tj) && lineFree(cells[cells.length - 1], to)) pts.push({ x: to.x, z: to.z });
  const out = [pts[0]];
  let k = 0;
  while (k < pts.length - 1) {
    let j = pts.length - 1;
    while (j > k + 1 && !lineFree(pts[k], pts[j])) j--;
    out.push(pts[j]); k = j;
  }
  return out;
}

// Where he is and what he's doing. sit: 1 on the sofa, 0 standing. lie: 1 lying
// along the sofa. crouch: 1 squatting at the record shelf.
const body = {
  x: SEAT.x, z: SEAT.z, h: 0, sit: 1, lie: 0, crouch: 0, crouchTo: 0, state: 'seated', path: [], speed: 0, phase: 0, stride: 0,
  reach: 0, reachTo: 0, hold: 0, look: null, then: null, t: 0, from: null, to: null, faceTo: null, after: null, idle: 0, exiting: false,
};
const LIE = { x: 0.12, z: SOFA_Z - 0.02, psi: -PI / 2, at: { x: 0.6, y: 1.5, z: -1.6 } };
const qTmp = new T.Quaternion(), qLie = new T.Quaternion(), qUp = new T.Quaternion(), eUp = new T.Euler();
// Lying: tip the body onto its back (Rx), then point the head along LIE.psi.
function setLie() { qLie.setFromEuler(new T.Euler(PI / 2, LIE.psi, 0, 'YXZ')); }
setLie();
const marker = add(room, new T.RingGeometry(0.11, 0.14, 40), new T.MeshBasicMaterial({ color: '#ffd9a8', transparent: true, opacity: 0, depthWrite: false }), 0, 0.006, 0, -PI / 2);
noShadow.add(marker);
const angleTo = (a, b) => { let d = (b - a) % (PI * 2); if (d > PI) d -= PI * 2; if (d < -PI) d += PI * 2; return d; };
const headingFor = (dx, dz) => Math.atan2(-dx, -dz);
const onSofa = () => ['seated', 'sitting', 'rising', 'lying', 'lyingDown', 'gettingUp'].includes(body.state);

// Get him on his feet, whatever he's doing, then carry on.
function getUp(then) {
  if (body.state === 'lying' || body.state === 'lyingDown') { body.state = 'gettingUp'; body.t = 1 - body.lie; body.after = () => standUp(then); return; }
  if (body.state === 'gettingUp') { body.after = () => standUp(then); return; }
  if (body.state === 'seated' || body.state === 'sitting') { standUp(then); return; }
  if (body.state === 'rising') { body.after = then; return; }
  then();
}
function walkTo(target, then, faceTo) {
  body.then = then || null;
  body.faceTo = faceTo ?? null;
  body.reachTo = 0; body.crouchTo = 0;
  getUp(() => {
    const path = findPath(body, target);
    if (!path || path.length < 2) { arrive(); return; }
    body.path = path.slice(1);
    body.state = 'walking';
    const end = path[path.length - 1];
    marker.position.set(end.x, 0.006, end.z); marker.material.opacity = 0.9;
  });
}
function arrive() {
  body.state = 'standing'; body.path = [];
  const done = body.then; body.then = null;
  if (body.faceTo != null) { body.state = 'turning'; body.turnThen = done; return; }
  done?.();
}
function standUp(then) {
  body.state = 'rising'; body.t = 0; body.from = { x: body.x, z: body.z }; body.to = { ...FRONT }; body.after = then;
}
function sitOnSofa(then) {
  if (body.state === 'seated') { then?.(); return; }
  if (onSofa()) return;
  walkTo(FRONT, () => { body.state = 'sitting'; body.t = 0; body.from = { x: body.x, z: body.z }; body.to = { x: SEAT.x, z: SEAT.z }; body.after = then || null; }, SEAT.h);
}
function lieDown() {
  sitOnSofa(() => { body.state = 'lyingDown'; body.t = 0; });
}

// Keys held down for walking: WASD or the arrow keys.
const held = new Set();
const MOVE_KEYS = { w: 'f', arrowup: 'f', s: 'b', arrowdown: 'b', a: 'l', arrowleft: 'l', d: 'r', arrowright: 'r' };
function moveInput() {
  let f = 0, r = 0;
  for (const k of held) { const m = MOVE_KEYS[k]; if (m === 'f') f += 1; if (m === 'b') f -= 1; if (m === 'l') r -= 1; if (m === 'r') r += 1; }
  return { f: clamp(f, -1, 1), r: clamp(r, -1, 1) };
}
function tryMove(dx, dz) {
  const ok = (x, z) => { const [i, j] = navCell(x, z); return navFree(i, j); };
  if (ok(body.x + dx, body.z + dz)) { body.x += dx; body.z += dz; return Math.hypot(dx, dz); }
  if (ok(body.x + dx, body.z)) { body.x += dx; return Math.abs(dx); }
  if (ok(body.x, body.z + dz)) { body.z += dz; return Math.abs(dz); }
  return 0;
}

function stepBody(dt, t) {
  const WALK = 1.05, RUN = 1.3, TURN = 5.5;
  body.idle += dt;
  // Keyboard walking (only out in the room, not while browsing).
  const inp = mode === 'room' && !body.exiting ? moveInput() : { f: 0, r: 0 };
  if (inp.f || inp.r) {
    body.idle = 0;
    if (onSofa()) { if (body.state !== 'rising' && body.state !== 'gettingUp') getUp(() => { body.state = 'standing'; }); }
    else if (['standing', 'walking', 'turning', 'manual'].includes(body.state)) {
      body.state = 'manual'; body.path = []; body.then = null; body.faceTo = null; body.reachTo = 0; body.crouchTo = 0;
    }
  } else if (body.state === 'manual') body.state = 'standing';

  const st = body.state;
  if (st === 'rising' || st === 'sitting') {
    body.t = Math.min(1, body.t + dt / 1.1);
    const e = ease(body.t);
    body.sit = st === 'rising' ? 1 - e : e;
    body.x = lerp(body.from.x, body.to.x, e); body.z = lerp(body.from.z, body.to.z, e);
    body.h += angleTo(body.h, SEAT.h) * (1 - Math.exp(-dt * 6));
    if (body.t >= 1) {
      body.state = st === 'rising' ? 'standing' : 'seated';
      if (st === 'sitting') body.h = SEAT.h;
      const a = body.after; body.after = null; a?.();
    }
  } else if (st === 'lyingDown' || st === 'gettingUp') {
    body.t = Math.min(1, body.t + dt / 1.6);
    body.lie = st === 'lyingDown' ? body.t : 1 - body.t;
    if (body.t >= 1) {
      body.state = st === 'lyingDown' ? 'lying' : 'seated';
      const a = body.after; body.after = null; a?.();
    }
  } else if (st === 'walking') {
    const tgt = body.path[0];
    const dx = tgt.x - body.x, dz = tgt.z - body.z, d = Math.hypot(dx, dz);
    const want = headingFor(dx, dz), turn = angleTo(body.h, want);
    body.h += clamp(turn, -TURN * dt, TURN * dt);
    const left = body.path.reduce((s, p, k) => s + (k ? Math.hypot(p.x - body.path[k - 1].x, p.z - body.path[k - 1].z) : d), 0);
    // Slow down to turn sharply and to stop; speed up gently.
    const vMax = WALK * clamp(1.2 - Math.abs(turn) * 0.8, 0.15, 1) * clamp(left / 0.45, 0.25, 1);
    body.speed += (vMax - body.speed) * (1 - Math.exp(-dt * 5));
    const step = Math.min(d, body.speed * dt);
    if (d > 1e-4) { body.x += dx / d * step; body.z += dz / d * step; }
    body.phase += step / 0.62 * PI;
    if (d < 0.03) { body.path.shift(); if (!body.path.length) arrive(); }
  } else if (st === 'turning') {
    const turn = angleTo(body.h, body.faceTo);
    body.h += clamp(turn, -3.5 * dt, 3.5 * dt);
    body.phase += Math.abs(clamp(turn, -3.5 * dt, 3.5 * dt)) * 0.9;
    if (Math.abs(turn) < 0.02) { body.state = 'standing'; body.faceTo = null; const a = body.turnThen; body.turnThen = null; a?.(); }
  } else if (st === 'manual') {
    let mx, mz;
    if (settings.view === 'first') {
      body.h -= inp.r * 2.4 * dt;
      mx = -Math.sin(body.h) * inp.f; mz = -Math.cos(body.h) * inp.f;
    } else {
      // Relative to the camera: W is away from it, A and D to its left and right.
      const cf = new T.Vector3(); camera.getWorldDirection(cf); cf.y = 0; cf.normalize();
      mx = cf.x * inp.f - cf.z * inp.r; mz = cf.z * inp.f + cf.x * inp.r;
    }
    const m = Math.hypot(mx, mz);
    if (m > 0.01) {
      mx /= m; mz /= m;
      const back = settings.view === 'first' && inp.f < 0;
      if (!back) { const turn = angleTo(body.h, headingFor(mx, mz)); body.h += clamp(turn, -TURN * dt, TURN * dt); }
      const vMax = (back ? 0.55 : RUN) * clamp(1.2 - Math.abs(angleTo(body.h, headingFor(mx, mz))) * (back ? 0 : 0.6), 0.2, 1);
      body.speed += (vMax - body.speed) * (1 - Math.exp(-dt * 6));
      const moved = tryMove(mx * body.speed * dt, mz * body.speed * dt);
      body.phase += moved / 0.62 * PI * (back ? -1 : 1);
      if (moved < body.speed * dt * 0.3) body.speed *= Math.exp(-dt * 10);
    }
  }
  if (!['walking', 'manual'].includes(st)) body.speed *= Math.exp(-dt * 8);
  const moving = st === 'walking' || st === 'manual' || st === 'turning';
  body.stride += ((moving ? Math.max(clamp(body.speed / WALK, 0, 1.15), st === 'turning' ? 0.35 : 0) : 0) - body.stride) * (1 - Math.exp(-dt * 8));
  body.reach += (body.reachTo - body.reach) * (1 - Math.exp(-dt * (body.reachTo > body.reach ? 5 : 3)));
  body.crouch += (body.crouchTo - body.crouch) * (1 - Math.exp(-dt * 4));
  body.hold += ((mode === 'inspect' ? 1 : 0) - body.hold) * (1 - Math.exp(-dt * 5));
  marker.material.opacity *= Math.exp(-dt * (st === 'walking' ? 0.6 : 3));

  // Out through the door on the right: leave the room for the Feng Shui layout.
  if (body.x > X1 + 0.12 && !body.exiting) {
    body.exiting = true;
    $('#veil').textContent = 'Heading out…';
    $('#veil').classList.remove('gone');
    setTimeout(() => send({ type: 'exit' }), 700);
    setTimeout(() => {
      Object.assign(body, { x: SEAT.x, z: SEAT.z, h: SEAT.h, sit: 1, lie: 0, state: 'seated', path: [], speed: 0, exiting: false });
      held.clear();
      $('#veil').classList.add('gone');
    }, 1800);
  }

  // Dozing off: left alone for a while, he goes and lies down on the sofa.
  if (body.idle > 45 && mode === 'room' && (st === 'standing' || st === 'seated')) { body.idle = 0; lieDown(); }

  // Pose numbers from the state.
  const rig = customAvatar?.userData.rig || builtIn;
  const s = ease(clamp(body.sit, 0, 1)), lie = ease(clamp(body.lie, 0, 1)), c = ease(clamp(body.crouch, 0, 1));
  const a = 0.42 * Math.min(1, body.stride), ph = body.phase;
  const swingL = a * Math.sin(ph), swingR = -swingL;
  const legs = (swing, bend) => [lerp(lerp(lerp(swing, 1.3, c), PI / 2, s), 0.1, lie), lerp(lerp(lerp(bend, 2.2, c), rig.seatKnee, s), 0.22, lie)];
  [P.thigh.L, P.knee.L] = legs(swingL, 1.15 * a * Math.max(0, Math.cos(ph)) + 0.04);
  [P.thigh.R, P.knee.R] = legs(swingR, 1.15 * a * Math.max(0, -Math.cos(ph)) + 0.04);
  P.breath = 0.5 - 0.5 * Math.cos(t * PI * 2 / (lie > 0.5 ? 6 : 4.6));
  let reachSide = null, twist = 0;
  if (body.reach > 0.001 && body.look) {
    const want = headingFor(body.look.x - body.x, body.look.z - body.z);
    twist = clamp(angleTo(body.h, want), -0.9, 0.9) * 0.6 * body.reach;
    reachSide = angleTo(body.h, want) > 0.05 ? 'L' : 'R';
  }
  P.twist = twist;
  P.lean = lerp(lerp(lerp(0.05 * body.stride, 0.42, c), -0.13, s), 0, lie) + body.reach * 0.55 * (1 - c) * (1 - lie) + P.breath * 0.012;
  for (const k of ['L', 'R']) {
    const walkArm = -0.55 * (k === 'L' ? swingL : swingR);
    let f = lerp(lerp(lerp(walkArm, 0.5, c), 0.55, s), 0.3, lie), d = lerp(lerp(-0.8, -0.66, s), -0.86, lie);
    if (k === reachSide) { f = lerp(f, lerp(lerp(1.25, 1.15, s), 0.75, c), body.reach); d = lerp(d, -0.45, body.reach); }
    else f = lerp(f, f * 0.7, body.reach);
    // Holding a record up to look at it: both hands out in front.
    f = lerp(f, 1.2, body.hold); d = lerp(d, -0.5, body.hold);
    P.armF[k] = f; P.armD[k] = d;
  }
  const standY = rig.standHip * Math.cos(a * Math.sin(ph)) - 0.012 * body.stride;
  const hip = lerp(lerp(lerp(standY, 0.46, c), rig.seatHip, s), 0.45, lie);
  const px = lerp(body.x, LIE.x, lie), pz = lerp(body.z, LIE.z, lie);
  qUp.setFromEuler(eUp.set(0, body.h, 0));
  qTmp.slerpQuaternions(qUp, qLie, lie);
  for (const o of [customAvatar, builtInAvatar]) if (o) { o.position.set(px, hip, pz); o.quaternion.copy(qTmp); }
  if (customAvatar?.visible) poseCustom(customAvatar.userData.rig);
  else if (builtInAvatar.visible) poseBuiltIn();
}
// Where his eyes are, for the first-person view.
function eyePose(out) {
  const rig = customAvatar?.userData.rig || builtIn;
  const s = ease(clamp(body.sit, 0, 1)), lie = ease(clamp(body.lie, 0, 1));
  const y = lerp(rig.standHip + 0.76 + 0.015 * Math.sin(body.phase * 2) * Math.min(1, body.stride), rig.seatHip + 0.62, s);
  const fx = -Math.sin(body.h), fz = -Math.cos(body.h);
  out.pos.set(body.x + fx * 0.1, y, body.z + fz * 0.1);
  out.at.set(body.x + fx * 2, y - lerp(0.35, 0.55, s), body.z + fz * 2);
  if (lie > 0) {
    out.pos.lerp(tmpV.set(LIE.x + Math.sin(LIE.psi) * 0.72, 0.62, LIE.z + Math.cos(LIE.psi) * 0.72), lie);
    out.at.lerp(tmpV.set(LIE.at.x, LIE.at.y, LIE.at.z), lie);
  }
  return out;
}

let recs = [];
let tableSeq = 0;
const nowPlaying = { rec: null, playing: false, progress: 0, loading: false };
const settings = { view: 'third', autoplay: true, tank: true };

function setPlate(c) {
  const d = c.data;
  let title = 'Empty crate', sub = 'click to add a SoundCloud link';
  if (d && d.error) { title = 'Can’t open'; sub = d.input ? String(d.input).slice(0, 40) : 'check the link in settings'; }
  else if (d && d.tracks) { title = d.name || d.slug; sub = `${d.tracks.length} record${d.tracks.length === 1 ? '' : 's'}${d.stale ? ' · offline' : ''}`; }
  c.plate.material.map?.dispose();
  c.plate.material.map = labelTex(title, sub, ['#7a3b1c', '#2f5f5c', '#6d2f3a'][c.ci]);
  c.plate.material.needsUpdate = true;
}

function makeSleeve(track, ci) {
  const art = new T.MeshStandardMaterial({ color: '#3a332c', roughness: 0.55 });
  const back = new T.MeshStandardMaterial({ color: '#2a2622', roughness: 0.7 });
  const mesh = new T.Mesh(sleeveGeo, [M.card, M.card, M.card, M.card, art, back]);
  mesh.castShadow = true; mesh.receiveShadow = true;
  const rec = { ci, track, mesh, art, tex: null, state: 'crate', anim: null, tablePose: null, order: 0 };
  mesh.userData.rec = rec;
  if (track.art) loader.load(track.art, (tex) => {
    tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = 4;
    rec.tex = tex;
    art.map = tex; art.color.set('#ffffff'); art.needsUpdate = true;
    back.map = tex; back.color.set('#4a4640'); back.needsUpdate = true;
    if (nowPlaying.rec === rec) setLabel(rec);
  });
  room.add(mesh);
  return rec;
}

function buildCrates(list) {
  const playingId = nowPlaying.rec?.track.id;
  for (const r of recs) { room.remove(r.mesh); r.art.map?.dispose(); r.art.dispose(); }
  recs = [];
  crates.forEach((c, ci) => {
    c.data = list[ci] || null;
    c.recs = (c.data?.tracks || []).map((t, i) => { const r = makeSleeve(t, ci); r.i = i; return r; });
    c.focus = 0;
    recs.push(...c.recs);
    setPlate(c);
  });
  for (const r of recs) snap(r);
  const still = playingId && recs.find((r) => r.track.id === playingId);
  if (still) { still.state = 'platter'; nowPlaying.rec = still; snap(still); setLabel(still); }
  else if (nowPlaying.rec) stopPlayback();
}

const tmpQ = new T.Quaternion(), tmpE = new T.Euler(), tmpV = new T.Vector3();
function crateSpacing(c) { return Math.min(0.0072, (CRATE.d - 0.06) / Math.max(1, c.recs.length)); }

// Where a record wants to be right now, from its state.
function poseFor(r, out = { p: new T.Vector3(), q: new T.Quaternion() }) {
  if (r.state === 'crate') {
    const c = crates[r.ci];
    const sp = crateSpacing(c);
    const zLocal = CRATE.d / 2 - 0.035 - r.i * sp;
    const active = mode === 'crate' && activeCrate === r.ci;
    let a = 0, lift = 0;
    if (active && r.i < c.focus) a = Math.min(1.25, 0.95 + (c.focus - 1 - r.i) * 0.012);
    if (active && r.i === c.focus) lift = 0.07;
    const half = SLEEVE / 2;
    out.p.set(0, 0.022 + lift + Math.cos(a) * half, zLocal + Math.sin(a) * half);
    tmpE.set(a, 0, 0);
    out.q.setFromEuler(tmpE);
    out.p.applyQuaternion(c.group.quaternion).add(c.group.position);
    out.q.premultiply(c.group.quaternion);
  } else if (r.state === 'table') {
    out.p.copy(r.tablePose.p); out.q.copy(r.tablePose.q);
  } else if (r.state === 'platter') {
    out.p.copy(STAND); tmpE.set(-0.14, 0.18, 0); out.q.setFromEuler(tmpE);
  } else if (r.state === 'drag') {
    out.p.copy(drag.point); tmpE.set(-PI / 2 + 0.35, 0, drag.spin); out.q.setFromEuler(tmpE);
  } else if (r.state === 'hand') {
    out.p.set(body.x - Math.sin(body.h) * 0.4, 1.4, body.z - Math.cos(body.h) * 0.4);
    out.q.setFromEuler(new T.Euler(-0.32, body.h, 0, 'YXZ'));
  }
  return out;
}
const pose = { p: new T.Vector3(), q: new T.Quaternion() };
function snap(r) { poseFor(r, pose); r.mesh.position.copy(pose.p); r.mesh.quaternion.copy(pose.q); }
function moveTo(r, state, dur = 0.9, arc = 0.35) {
  r.anim = { p0: r.mesh.position.clone(), q0: r.mesh.quaternion.clone(), t: 0, dur, arc };
  r.state = state;
}
function stepRecords(dt) {
  const k = 1 - Math.exp(-dt * 13);
  for (const r of recs) {
    poseFor(r, pose);
    if (r.anim) {
      const a = r.anim;
      a.t += dt / a.dur;
      const e = ease(Math.min(1, a.t));
      r.mesh.position.lerpVectors(a.p0, pose.p, e);
      r.mesh.position.y += Math.sin(PI * e) * a.arc;
      r.mesh.quaternion.slerpQuaternions(a.q0, pose.q, e);
      if (a.t >= 1) { r.anim = null; a.done?.(); }
    } else if (r.state === 'drag') {
      r.mesh.position.lerp(pose.p, 1 - Math.exp(-dt * 24));
      r.mesh.quaternion.slerp(pose.q, k);
    } else if (r.state === 'crate' && r.ci === activeCrate) {
      r.mesh.position.lerp(pose.p, k);
      r.mesh.quaternion.slerp(pose.q, k);
    } else if (r.mesh.position.distanceToSquared(pose.p) > 1e-8) {
      r.mesh.position.lerp(pose.p, k);
      r.mesh.quaternion.slerp(pose.q, k);
    }
  }
}

function tableSlot() {
  const onTable = recs.filter((r) => r.state === 'table').length;
  const k = onTable % 4;
  const rand = rng(tableSeq * 7 + 3);
  return placeOnTable(new T.Vector3(TABLE.x + (k % 2 ? 0.1 : -0.1) + (rand() - 0.5) * 0.05, 0, TABLE.z + (k < 2 ? -0.08 : 0.1) + (rand() - 0.5) * 0.05), (rand() - 0.5) * 0.7);
}
function placeOnTable(p, spin) {
  const onTable = recs.filter((r) => r.state === 'table').length;
  p.x = clamp(p.x, TABLE.x - TABLE.w / 2 + 0.12, TABLE.x + TABLE.w / 2 - 0.12);
  p.z = clamp(p.z, TABLE.z - TABLE.d / 2 + 0.1, TABLE.z + TABLE.d / 2 - 0.1);
  p.y = TABLE.y + THICK / 2 + 0.002 + onTable * (THICK + 0.0006);
  tmpE.set(-PI / 2, 0, spin);
  return { p, q: new T.Quaternion().setFromEuler(tmpE) };
}

function setLabel(r) {
  const m = discLabel.material;
  if (r?.tex) { m.map = r.tex; m.color.set('#ffffff'); } else { m.map = null; m.color.set('#d8c39a'); }
  m.needsUpdate = true;
}

// ---------------------------------------------------------------- SoundCloud
let sc = null, scReady = false;
const scOpts = { auto_play: true, visual: false, show_artwork: false, buying: false, sharing: false, download: false, show_comments: false, show_playcount: false, show_user: false, hide_related: true, show_teaser: false };
function scPlay(url) {
  if (!window.SC) { showError('SoundCloud’s player didn’t load. Check the internet connection, then use Reload Room.'); return; }
  nowPlaying.loading = true;
  if (!sc) {
    const f = document.createElement('iframe');
    f.id = 'sc';
    f.allow = 'autoplay; encrypted-media';
    f.src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&${new URLSearchParams(Object.entries(scOpts).map(([k, v]) => [k, String(v)]))}`;
    document.body.append(f);
    sc = SC.Widget(f);
    const E = SC.Widget.Events;
    sc.bind(E.READY, () => { scReady = true; sc.play(); if (params.get('debug')) console.log('sc ready'); });
    sc.bind(E.PLAY, () => { if (params.get('debug')) console.log('sc play'); nowPlaying.playing = true; nowPlaying.loading = false; paintNow(); });
    sc.bind(E.PAUSE, () => { nowPlaying.playing = false; paintNow(); });
    sc.bind(E.PLAY_PROGRESS, (e) => { nowPlaying.progress = e.relativePosition || 0; });
    sc.bind(E.FINISH, () => { nowPlaying.playing = false; nowPlaying.progress = 1; if (settings.autoplay) playNext(); else paintNow(); });
    sc.bind(E.ERROR, () => { if (params.get('debug')) console.log('sc error'); nowPlaying.loading = false; showError('That track wouldn’t play on SoundCloud.'); });
  } else {
    sc.load(url, { ...scOpts, callback: () => sc.play() });
  }
}
function scPause() { if (sc && scReady) sc.pause(); }
function scToggle() { if (sc && scReady) sc.toggle(); }

function play(r) {
  hideError();
  const prev = nowPlaying.rec;
  if (prev && prev !== r) moveTo(prev, 'crate', 1.0, 0.45);
  nowPlaying.rec = r;
  nowPlaying.progress = 0;
  moveTo(r, 'platter', 1.0, 0.3);
  r.anim.done = () => {};
  setLabel(r);
  disc.visible = true;
  disc.position.y = 0.12;
  scPlay(r.track.url);
  paintNow();
  paintQueue();
}
function stopPlayback() {
  scPause();
  nowPlaying.rec = null; nowPlaying.playing = false; nowPlaying.progress = 0;
  disc.visible = false;
  paintNow();
  paintQueue();
}
function playNext() {
  const cur = nowPlaying.rec;
  let next = queued()[0];
  if (!next && cur) {
    const list = crates[cur.ci].recs;
    for (let k = 1; k <= list.length; k++) { const c = list[(cur.i + k) % list.length]; if (c.state === 'crate' && c !== cur) { next = c; break; } }
  }
  if (!next) {
    const any = crates.flatMap((c) => c.recs).filter((r) => r.state === 'crate');
    next = any[0];
  }
  if (next) play(next); else stopPlayback();
}

// ---------------------------------------------------------------- HUD
const now = $('#now'), hint = $('#hint'), tip = $('#tip'), errBox = $('#err');
function paintNow() {
  const r = nowPlaying.rec;
  now.classList.toggle('idle', !r);
  if (!r) return;
  const c = crates[r.ci].data;
  now.querySelector('img').src = r.track.art || '';
  now.querySelector('.t').textContent = r.track.title;
  now.querySelector('.a').textContent = c?.name || '';
  $('#pp').innerHTML = nowPlaying.playing
    ? '<svg viewBox="0 0 16 16"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/></svg>'
    : '<svg viewBox="0 0 16 16"><path d="M4 2.5v11l9-5.5z"/></svg>';
}
$('#pp').onclick = () => { if (nowPlaying.rec) scToggle(); };
$('#nx').onclick = () => playNext();
now.querySelector('.a').onclick = () => { const r = nowPlaying.rec; if (r) send({ type: 'open', url: r.track.url }); };

// ---------------------------------------------------------------- queue
// The queue is the records on the coffee table, in the order they'll play.
// After it, autoplay carries on through the crate of the record that's playing.
const queueBox = $('#queue'), queueList = queueBox.querySelector('ol');
const queued = () => recs.filter((r) => r.state === 'table').sort((a, b) => a.order - b.order);
function autoAfter(from, n) {
  const out = [];
  if (!from || !settings.autoplay) return out;
  const list = crates[from.ci].recs;
  for (let k = 1; k <= list.length && out.length < n; k++) { const c = list[(from.i + k) % list.length]; if (c.state === 'crate' && c !== nowPlaying.rec) out.push(c); }
  return out;
}
function enqueue(r) {
  if (r.state !== 'crate') return;
  r.tablePose = tableSlot();
  r.order = ++tableSeq;
  moveTo(r, 'table', 1.15, 0.5);
}
function unqueue(r) { if (r.state === 'table') { r.order = 0; moveTo(r, 'crate', 0.9, 0.4); } }
function reorder(r, to) {
  const q = queued().filter((x) => x !== r);
  q.splice(clamp(to, 0, q.length), 0, r);
  q.forEach((x, i) => { x.order = i + 1; });
  tableSeq = q.length;
  paintQueue();
}
let dragItem = null;
function paintQueue() {
  const q = queued();
  $('#qb b').textContent = q.length;
  if (!document.body.classList.contains('q')) return;
  queueList.textContent = '';
  const item = (r, auto) => {
    const li = document.createElement('li');
    if (auto) li.className = 'auto';
    li.innerHTML = `<img alt=""><div class="m"><div class="t"></div><div class="a"></div></div>`;
    li.querySelector('img').src = r.track.art || '';
    li.querySelector('.t').textContent = r.track.title;
    li.querySelector('.a').textContent = crates[r.ci].data?.name || '';
    const btn = (label, title, fn) => { const b = document.createElement('button'); b.textContent = label; b.title = title; b.onclick = (e) => { e.stopPropagation(); fn(); }; li.append(b); };
    if (auto) {
      btn('+', 'Add to the queue', () => { enqueue(r); roomHint(); });
    } else {
      btn('▶', 'Play now', () => play(r));
      btn('✕', 'Put it back in its crate', () => { unqueue(r); roomHint(); });
      li.draggable = true;
      li.ondragstart = (e) => { dragItem = r; e.dataTransfer.effectAllowed = 'move'; };
      li.ondragend = () => { dragItem = null; for (const x of queueList.children) x.classList.remove('drop'); };
      li.ondragover = (e) => { if (!dragItem) return; e.preventDefault(); for (const x of queueList.children) x.classList.toggle('drop', x === li); };
      li.ondrop = (e) => { e.preventDefault(); if (dragItem && dragItem !== r) reorder(dragItem, queued().filter((x) => x !== dragItem).indexOf(r)); };
    }
    li.ondblclick = () => play(r);
    queueList.append(li);
  };
  if (!q.length) { const p = document.createElement('div'); p.className = 'empty'; p.textContent = 'Nothing queued. Pull records out of a crate to line them up.'; queueList.append(p); }
  q.forEach((r) => item(r, false));
  const last = q.length ? q[q.length - 1] : nowPlaying.rec;
  const more = autoAfter(last, 4);
  if (more.length) {
    const sep = document.createElement('div'); sep.className = 'sep';
    sep.textContent = `Then from ${crates[more[0].ci].data?.name || 'the crate'}`;
    queueList.append(sep);
    more.forEach((r) => item(r, true));
  }
}
function toggleQueue(on) {
  document.body.classList.toggle('q', on ?? !document.body.classList.contains('q'));
  paintQueue();
}
$('#qb').onclick = () => toggleQueue();
$('#qclear').onclick = () => { for (const r of queued()) unqueue(r); roomHint(); };

function showError(t) { errBox.textContent = t; errBox.style.display = 'block'; clearTimeout(showError.t); showError.t = setTimeout(hideError, 7000); }
function hideError() { errBox.style.display = 'none'; }
function setHint(t) { hint.textContent = t; hint.style.opacity = t ? 1 : 0; }
function roomHint() {
  paintQueue();
  if (!recs.length) return setHint(crates.some((c) => c.data) ? 'Add SoundCloud links in settings to fill the crates' : 'Filling the crates…');
  if (!nowPlaying.rec && recs.some((r) => r.state === 'table')) return setHint('Drag a record onto the turntable');
  if (!nowPlaying.rec) return setHint('Click the records under the turntable · walk with WASD or the arrow keys');
  setHint('');
}
function crateHint() {
  const c = crates[activeCrate];
  const r = c.recs[c.focus];
  setHint(r ? `${r.track.title}  ·  ${c.focus + 1} of ${c.recs.length}  ·  scroll to flip, click to pull it out` : 'This crate is empty');
}

for (const b of document.querySelectorAll('#views button')) b.onclick = () => setView(b.dataset.v, true);
$('#back').onclick = () => leaveCrate();

// ---------------------------------------------------------------- camera
let mode = 'room', activeCrate = -1;
const look = { yaw: 0, pitch: 0 };
const cam = { pos: new T.Vector3(), at: new T.Vector3(), tween: null };
function viewPose() {
  if (mode === 'inspect') {
    const fx = -Math.sin(body.h), fz = -Math.cos(body.h);
    return { pos: new T.Vector3(body.x + fx * 0.04, 1.62, body.z + fz * 0.04), at: new T.Vector3(body.x + fx * 0.4, 1.36, body.z + fz * 0.4) };
  }
  if (mode === 'crate') {
    const g = crates[activeCrate].group.position;
    // 1st person: down over his hand at the records. 3rd: over his shoulder.
    if (settings.view === 'first') return { pos: new T.Vector3(g.x + 0.06, 0.64, g.z + 0.46), at: new T.Vector3(g.x, 0.24, g.z + 0.04) };
    const side = g.x > 0.1 ? -1 : 1;
    return { pos: new T.Vector3(g.x + side * 1.05, 1.55, g.z + 1.95), at: new T.Vector3(g.x + side * 0.1, 0.4, g.z + 0.15) };
  }
  if (settings.view === 'first') return eyePose({ pos: new T.Vector3(), at: new T.Vector3() });
  // Third person: high in the back corner, looking down over the room, and
  // drifting after him when he's up and about.
  if (LAYOUT.cam) {
    const at = LAYOUT.cam.at.clone();
    const up = 1 - clamp(body.sit, 0, 1);
    at.x = lerp(at.x, lerp(at.x, body.x, 0.45), up); at.z = lerp(at.z, lerp(at.z, body.z - 0.4, 0.45), up);
    return { pos: LAYOUT.cam.pos.clone(), at };
  }
  const at = new T.Vector3(-0.05, 0.05, -1.05);
  const up = 1 - clamp(body.sit, 0, 1);
  at.x = lerp(at.x, body.x * 0.55, up); at.z = lerp(at.z, lerp(-1.05, body.z - 0.6, 0.45), up);
  return { pos: new T.Vector3(0.3, 2.42, Z1 - 0.06), at };
}
function goCamera(dur = 1.0, delay = 0) {
  const to = viewPose();
  cam.tween = { p0: cam.pos.clone(), a0: cam.at.clone(), p1: to.pos, a1: to.at, t: -delay / dur, dur };
}
function stepCamera(dt) {
  if (cam.tween) {
    const tw = cam.tween;
    tw.t += dt / tw.dur;
    const e = ease(clamp(tw.t, 0, 1));
    cam.pos.lerpVectors(tw.p0, tw.p1, e);
    cam.at.lerpVectors(tw.a0, tw.a1, e);
    if (tw.t >= 1) cam.tween = null;
  } else {
    const to = viewPose();
    const k = mode === 'room' && settings.view === 'first' ? 14 : mode === 'room' ? 2.2 : 6;
    cam.pos.lerp(to.pos, 1 - Math.exp(-dt * k));
    cam.at.lerp(to.at, 1 - Math.exp(-dt * k));
  }
  const boost = mode === 'room' && settings.view === 'third' ? 12 : 0;
  if (Math.abs(fovBoost - boost) > 0.01) { fovBoost += (boost - fovBoost) * (1 - Math.exp(-dt * 3)); camera.fov = baseFov + fovBoost; camera.updateProjectionMatrix(); }
  camera.position.copy(cam.pos);
  const dir = tmpV.copy(cam.at).sub(cam.pos);
  const yaw = mode === 'room' ? look.yaw : 0, pitch = mode === 'room' ? look.pitch : 0;
  dir.applyAxisAngle(new T.Vector3(0, 1, 0), yaw);
  const right = new T.Vector3().crossVectors(dir, camera.up).normalize();
  dir.applyAxisAngle(right, pitch);
  camera.lookAt(cam.pos.clone().add(dir));
  const showMe = settings.view !== 'first' || mode === 'crate' || mode === 'inspect';
  builtInAvatar.visible = showMe && !customAvatar;
  if (customAvatar) customAvatar.visible = showMe;
  // Up close in first person, only his body and hands show, not his head.
  const noHead = (settings.view === 'first' && mode === 'crate') || (mode === 'inspect' && !cam.tween);
  P.armsOnly = noHead;
  for (const m of [...builtIn.head, builtIn.torso, builtIn.chest]) m.visible = !noHead;
  if (customAvatar) for (const p of customAvatar.userData.rig.parts) if (p.head) p.mesh.visible = !noHead;
}
function setView(v, user) {
  if (v !== 'first' && v !== 'third') return;
  settings.view = v;
  look.yaw = 0; look.pitch = 0;
  for (const b of document.querySelectorAll('#views button')) b.classList.toggle('on', b.dataset.v === v);
  if (mode === 'room') goCamera(1.1);
  if (user) send({ type: 'view', view: v });
}
function enterCrate(ci) {
  const c = crates[ci];
  if (!c.data || c.data.error || !c.recs.length) { send({ type: 'settings' }); return; }
  const fromRoom = mode === 'room';
  mode = 'crate'; activeCrate = ci;
  document.body.classList.add('crate');
  const first = c.recs.findIndex((r, i) => i >= c.focus && r.state === 'crate');
  if (first >= 0) c.focus = first;
  body.look = { x: c.group.position.x, z: CRATE.z }; body.reachTo = 1; body.crouchTo = 1;
  // He crouches down to the shelf, then the camera comes in.
  goCamera(1.1, fromRoom ? 0.35 : 0);
  crateHint();
}
// Standing up, he walks over to the crate first; from the sofa he just reaches.
function crateClick(ci) {
  const c = crates[ci];
  if (!c.data || c.data.error || !c.recs.length) { send({ type: 'settings' }); return; }
  body.idle = 0;
  const spot = { x: c.group.position.x, z: CRATE.z + 0.68 };
  if (Math.hypot(body.x - spot.x, body.z - spot.z) < 0.12 && !onSofa()) { body.h = 0; enterCrate(ci); return; }
  walkTo(spot, () => enterCrate(ci), 0);
}
function leaveCrate() {
  if (mode !== 'crate') return;
  mode = 'room'; activeCrate = -1;
  body.reachTo = 0; body.crouchTo = 0;
  document.body.classList.remove('crate');
  goCamera(1.0);
  roomHint();
}
function flip(c, to) {
  const n = c.recs.length;
  to = clamp(to, 0, n - 1);
  // Skip records that are out of the crate.
  const dir = Math.sign(to - c.focus) || 1;
  while (to >= 0 && to < n && c.recs[to].state !== 'crate') to += dir;
  if (to < 0 || to >= n) return;
  c.focus = to;
  if (mode === 'crate') crateHint();
}

// ---------------------------------------------------------------- input
const ray = new T.Raycaster();
const ndc = new T.Vector2();
const dragPlane = new T.Plane(new T.Vector3(0, 1, 0), -0.95);
const drag = { rec: null, point: new T.Vector3(), spin: 0, from: null };
let down = null;
function pointer(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
}
function hitTest() {
  const targets = [...recs.map((r) => r.mesh), ...crates.map((c) => c.hit), disc];
  const hits = ray.intersectObjects(targets, true);
  // A record or the disc wins over the crate's (invisible, larger) hit box around it.
  let crate = null;
  for (const h of hits) {
    let o = h.object;
    while (o && !o.userData.rec && o.userData.crate == null && o !== disc) o = o.parent;
    if (!o) continue;
    if (o === disc) { if (disc.visible) return { disc: true }; continue; }
    if (o.userData.rec) return { rec: o.userData.rec };
    if (crate == null) crate = o.userData.crate;
  }
  return crate == null ? {} : { crate };
}
function showTip(e, html) {
  if (!html) { tip.style.opacity = 0; return; }
  tip.innerHTML = html;
  tip.style.left = `${e.clientX}px`; tip.style.top = `${e.clientY}px`;
  tip.style.opacity = 1;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

canvas.addEventListener('pointerdown', (e) => {
  body.idle = 0;
  if (e.button !== 0) return;
  canvas.focus();
  pointer(e);
  const h = hitTest();
  down = { x: e.clientX, y: e.clientY, yaw: look.yaw, pitch: look.pitch, hit: h, moved: false };
  const r = h.rec || (h.disc ? nowPlaying.rec : null);
  if (mode === 'room' && r && (r.state === 'table' || r.state === 'platter')) {
    canvas.setPointerCapture(e.pointerId);
    if (r.state === 'platter') { stopPlayback(); }
    drag.rec = r; drag.from = r.state; drag.spin = (Math.random() - 0.5) * 0.4;
    ray.ray.intersectPlane(dragPlane, drag.point);
    r.anim = null; r.state = 'drag';
    canvas.style.cursor = 'grabbing';
    showTip(e, '');
  } else {
    canvas.setPointerCapture(e.pointerId);
  }
});

canvas.addEventListener('pointermove', (e) => {
  pointer(e);
  if (drag.rec) {
    const p = new T.Vector3();
    if (ray.ray.intersectPlane(dragPlane, p)) {
      p.x = clamp(p.x, X0 + 0.3, X1 - 0.3); p.z = clamp(p.z, Z0 + 0.3, Z1 - 0.5);
      drag.point.copy(p);
    }
    return;
  }
  if (down) {
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (Math.hypot(dx, dy) > 5) down.moved = true;
    if (down.moved && mode === 'room' && !down.hit.rec) {
      const lim = settings.view === 'first' ? 1.1 : 0.45;
      look.yaw = clamp(down.yaw - dx * 0.004, -lim, lim);
      look.pitch = clamp(down.pitch - dy * 0.003, -0.45, 0.4);
      canvas.style.cursor = 'grabbing';
    }
    return;
  }
  const h = hitTest();
  let cursor = 'default', html = '';
  if (mode === 'room') {
    if (h.rec && h.rec.state === 'table') { cursor = 'grab'; html = `<b>${esc(h.rec.track.title)}</b><br><span>Drag onto the turntable</span>`; }
    else if ((h.rec && h.rec.state === 'platter') || h.disc) { cursor = 'grab'; html = '<span>Drag the record off to stop it</span>'; }
    else if (h.crate != null || (h.rec && h.rec.state === 'crate')) {
      const c = crates[h.crate ?? h.rec.ci];
      cursor = 'pointer';
      html = c.data?.tracks ? `<b>${esc(c.data.name)}</b> <span>· ${c.data.tracks.length} records</span>` : '<span>Empty crate · click to add a SoundCloud link</span>';
    }
  } else if (h.rec && h.rec.ci === activeCrate && h.rec.state === 'crate') {
    cursor = 'pointer';
    if (h.rec.i !== crates[activeCrate].focus) html = `<span>${esc(h.rec.track.title)}</span>`;
  } else if (h.crate != null && h.crate !== activeCrate) cursor = 'pointer';
  canvas.style.cursor = cursor;
  showTip(e, html);
});

canvas.addEventListener('pointerup', (e) => {
  const d = down;
  down = null;
  canvas.style.cursor = 'default';
  if (drag.rec) {
    const r = drag.rec;
    drag.rec = null;
    const p = drag.point.clone();
    const platterWorld = platter.getWorldPosition(new T.Vector3());
    const overTable = Math.abs(p.x - TABLE.x) < TABLE.w / 2 + 0.05 && Math.abs(p.z - TABLE.z) < TABLE.d / 2 + 0.05;
    const nearCrate = crates.find((c) => c.ci === r.ci && Math.hypot(p.x - c.group.position.x, p.z - c.group.position.z) < 0.35);
    if (Math.hypot(p.x - platterWorld.x, p.z - platterWorld.z) < 0.4) play(r);
    else if (nearCrate) moveTo(r, 'crate', 0.6, 0.15);
    else if (overTable) { r.tablePose = placeOnTable(p, drag.spin); r.order = r.order || ++tableSeq; moveTo(r, 'table', 0.35, 0.02); }
    else { r.tablePose = r.tablePose || tableSlot(); moveTo(r, 'table', 0.6, 0.1); }
    roomHint();
    return;
  }
  if (!d || d.moved) return;
  const h = d.hit;
  if (mode === 'room') {
    if (h.crate != null) crateClick(h.crate);
    else if (h.rec && h.rec.state === 'crate') crateClick(h.rec.ci);
    else if (!h.rec && !h.disc) {
      // Anywhere else: he walks there; the sofa sits him back down.
      const hitAt = ray.intersectObject(room, true).find((x) => x.object.isMesh && x.object !== marker && x.object.visible && !(x.object.material?.transparent) && !x.object.isInstancedMesh);
      const p = hitAt?.point;
      if (p && Math.abs(p.x) < X1 + 0.5 && Math.abs(p.z) < Z1) {
        const sofaHit = isSofa(p);
        // On the sofa: sit; seated already, stretch out; lying, sit back up.
        if (sofaHit) {
          if (body.state === 'seated') lieDown();
          else if (body.state === 'lying') { body.state = 'gettingUp'; body.t = 0; body.after = null; }
          else sitOnSofa();
        } else walkTo({ x: p.x > X1 - 0.3 && p.z > DOOR.z0 && p.z < DOOR.z1 ? X1 + 0.4 : p.x, z: p.z });
      }
    }
  } else if (mode === 'inspect') {
    if (h.rec && h.rec === held_) endInspect('play');
  } else {
    const c = crates[activeCrate];
    if (h.rec && h.rec.ci === activeCrate && h.rec.state === 'crate') {
      if (h.rec.i === c.focus) pull(h.rec);
      else flip(c, h.rec.i);
    } else if (h.crate != null && h.crate !== activeCrate) enterCrate(h.crate);
    else if (h.crate == null) leaveCrate();
  }
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (mode !== 'crate') return;
  const c = crates[activeCrate];
  wheelAcc += e.deltaY;
  while (Math.abs(wheelAcc) >= 40) { flip(c, c.focus + Math.sign(wheelAcc)); wheelAcc -= Math.sign(wheelAcc) * 40; }
}, { passive: false });
let wheelAcc = 0;

addEventListener('keydown', (e) => {
  body.idle = 0;
  const k = e.key.toLowerCase();
  if (mode === 'room' && MOVE_KEYS[k] && !e.metaKey && !e.ctrlKey) { e.preventDefault(); held.add(k); return; }
  if (mode === 'inspect' && held_) {
    if (e.key === 'Enter') endInspect('play');
    else if (e.key === 'q' || e.key === 'Q') endInspect('queue');
    else if (e.key === 'Escape' || e.key === 'Backspace') endInspect('back');
    return;
  }
  if (e.key === 'Escape') leaveCrate();
  else if (e.key === 'v' || e.key === 'V') setView(settings.view === 'first' ? 'third' : 'first', true);
  else if (e.key === ' ') { e.preventDefault(); if (nowPlaying.rec) scToggle(); }
  else if (e.key === 'n' || e.key === 'N') playNext();
  else if (e.key === 'q' || e.key === 'Q') toggleQueue();
  else if (mode === 'crate' && (e.key === 'ArrowDown' || e.key === 'ArrowRight')) flip(crates[activeCrate], crates[activeCrate].focus + 1);
  else if (mode === 'crate' && (e.key === 'ArrowUp' || e.key === 'ArrowLeft')) flip(crates[activeCrate], crates[activeCrate].focus - 1);
  else if (mode === 'crate' && e.key === 'Enter') { const c = crates[activeCrate]; if (c.recs[c.focus]) pull(c.recs[c.focus]); }
});

addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()));
addEventListener('blur', () => held.clear());

// Pull the front record out: it lands on the coffee table and the view returns to the room.
// Pulling a record out: he stands up with it, and the view goes to his eyes
// as he looks it over. Then: play it, queue it, or put it back.
let held_ = null;
function pull(r) {
  const c = crates[r.ci];
  held_ = r;
  mode = 'inspect'; activeCrate = -1;
  document.body.classList.remove('crate'); document.body.classList.add('inspect');
  body.crouchTo = 0; body.reachTo = 0;
  moveTo(r, 'hand', 1.1, 0.12);
  flip(c, c.focus + 1);
  const ins = $('#inspect');
  ins.querySelector('img').src = r.track.art || '';
  ins.querySelector('.t').textContent = r.track.title;
  ins.querySelector('.a').textContent = c.data?.name || '';
  goCamera(1.2, 0.6);
  setHint('');
}
function endInspect(next) {
  const r = held_;
  held_ = null;
  document.body.classList.remove('inspect');
  mode = 'room';
  if (next === 'play') { play(r); goCamera(1.1); }
  else if (next === 'queue') { r.tablePose = tableSlot(); r.order = ++tableSeq; moveTo(r, 'table', 1.0, 0.4); goCamera(1.1); }
  else { moveTo(r, 'crate', 0.8, 0.1); enterCrate(r.ci); return; }
  roomHint();
}
for (const b of document.querySelectorAll('#inspect button')) b.onclick = () => { if (held_) endInspect(b.dataset.a); };

// ---------------------------------------------------------------- day and night
const dark = matchMedia('(prefers-color-scheme: dark)');
const forced = params.get('mood');
let nightTarget = forced ? (forced === 'night' ? 1 : 0) : (dark.matches ? 1 : 0);
let night = nightTarget;
dark.addEventListener('change', () => { if (!forced) nightTarget = dark.matches ? 1 : 0; });

const cDaySun = new T.Color('#fff0d8'), cMoon = new T.Color('#8fa6ff');
const cDaySky = new T.Color('#d7e6ff'), cNightSky = new T.Color('#2a2b45');
const cDayGround = new T.Color('#6d5a46'), cNightGround = new T.Color('#3a2418');
function applyMood(n, t, beat) {
  const d = 1 - n;
  sun.intensity = lerp(4.6, 0.32, n);
  sun.color.lerpColors(cDaySun, cMoon, n);
  hemi.intensity = lerp(1.25, 0.12, n);
  hemi.color.lerpColors(cDaySky, cNightSky, n);
  hemi.groundColor.lerpColors(cDayGround, cNightGround, n);
  fill.intensity = lerp(1.4, 0, n);
  scene.environmentIntensity = lerp(0.42, 0.14, n);
  renderer.toneMappingExposure = lerp(1.0, 1.08, n);
  skyNight.opacity = n;
  for (const L of cityLayers) { L.night.opacity = n; L.night.color.setScalar(1.35); L.day.color.setScalar(lerp(1.05, 0.25, n)); }
  skyDay.color.setScalar(lerp(1.5, 0.3, n));
  shaft.material.uniforms.uStrength.value = d;
  dust.pts.material.opacity = 0.55 * d + 0.08 * n;
  lampLight.intensity = 2.4 * n;
  lampShade.material.emissiveIntensity = 0.38 * n;
  const twinkle = 0.85 + 0.15 * Math.sin(t * 1.3);
  fairy.mat.color.setRGB(lerp(0.35, 3.2, n) * twinkle, lerp(0.33, 2.6, n) * twinkle, lerp(0.3, 1.9, n) * twinkle);
  for (const l of fairy.lights) l.intensity = 2.1 * n;
  // Shelf LED strips and downlights: off by day, on at night.
  for (const o of shelfLeds) {
    if (o.isSpotLight) o.intensity = 4 * n;
    else if (o.isPointLight) o.intensity = 0.7 * n * (1 + beat * 0.15);
    else o.material.color.setRGB(1.5 * n, 1.0 * n, 0.55 * n);
  }
  for (const m of hifiMats) m.emissiveIntensity = 0.15 + 0.9 * n;
  lava.uniforms.uGlow.value = lerp(0.7, 1.15, n);
  lavaLight.intensity = lerp(0.15, 1.3, n);
  poster.uniforms.uGlow.value = lerp(0.85, 1.25, n);
  bloom.strength = lerp(0.35, 0.5, n);
  bloom.threshold = lerp(0.95, 0.9, n);
  grade.uniforms.uNight.value = n;
}

// ---------------------------------------------------------------- loop
const clock = new T.Clock();
let spin = 0, armAngle = 0, first = true;
function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  night += (nightTarget - night) * (1 - Math.exp(-dt * 1.5));
  const playing = nowPlaying.playing && !!nowPlaying.rec;
  const beat = playing ? Math.pow(0.5 + 0.5 * Math.sin(t * PI * 4), 8) : 0;
  applyMood(night, t, beat);

  spin += (playing ? 3.49 : 0) * dt;
  platter.rotation.y = -spin;
  const armTo = nowPlaying.rec ? -0.42 - 0.2 * nowPlaying.progress : 0;
  armAngle += (armTo - armAngle) * (1 - Math.exp(-dt * 3));
  tonearm.rotation.y = armAngle;
  if (disc.visible) disc.position.y += (0.022 - disc.position.y) * (1 - Math.exp(-dt * 6));
  for (const w of woofers) w.scale.setScalar(1 + beat * 0.06);
  dropRing.material.opacity = drag.rec ? 0.45 + 0.35 * Math.sin(t * 6) : 0;

  lava.uniforms.uTime.value = t * (playing ? 1.6 : 1);
  poster.uniforms.uTime.value = t * (playing ? 1.5 : 1);
  shaft.material.uniforms.uTime.value = t;
  grade.uniforms.uTime.value = t;
  const pa = dust.pts.geometry.attributes.position;
  for (let i = 0; i < dust.n; i++) {
    pa.array[i * 3 + 1] = dust.base[i * 3 + 1] + Math.sin(t * 0.3 + i) * 0.04;
    pa.array[i * 3] = dust.base[i * 3] + Math.sin(t * 0.21 + i * 1.7) * 0.03;
  }
  pa.needsUpdate = true;

  stepRecords(dt);
  stepCamera(dt);
  stepBody(dt, t);
  if (nowPlaying.rec) now.querySelector('.bar i').style.width = `${(nowPlaying.progress * 100).toFixed(2)}%`;
  composer.render(dt);
  if (first) { first = false; setTimeout(() => $('#veil').classList.add('gone'), 250); }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- messages
function send(msg) { if (parent !== window) parent.postMessage(msg, '*'); }
addEventListener('message', (e) => {
  if (e.source !== parent || !e.data || typeof e.data !== 'object') return;
  const m = e.data;
  if (m.type === 'settings') {
    settings.autoplay = m.autoplay !== false;
    if (typeof m.avatar === 'string') loadAvatar(m.avatar);
    if (typeof m.furniture === 'string') loadFurniture(m.furniture);
    if (m.view && m.view !== settings.view) setView(m.view, false);
  } else if (m.type === 'crates' && Array.isArray(m.crates)) {
    const sig = JSON.stringify(m.crates.map((c) => c && (c.error || (c.tracks || []).map((t) => t.id).join(','))));
    if (sig !== buildCrates.sig) { buildCrates.sig = sig; buildCrates(m.crates); }
    if (mode === 'room') roomHint();
  } else if (m.type === 'loading') {
    if (!recs.length) setHint('Filling the crates…');
  }
});

applyMood(night, 0, 0);
crates.forEach(setPlate);
setView(settings.view, false);
cam.pos.copy(viewPose().pos); cam.at.copy(viewPose().at);
setHint('Filling the crates…');
requestAnimationFrame(frame);
send({ type: 'ready' });

// Test hook: ?debug=1 exposes screen positions of things to click.
if (params.get('debug')) {
  const screenOf = (v) => { const p = v.clone().project(camera); return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight }; };
  window.__room = {
    crate: (i) => screenOf(crates[i].group.position.clone().add(new T.Vector3(0, 0.2, 0))),
    focused: () => { const c = crates[activeCrate]; return screenOf(c.recs[c.focus].mesh.position.clone().add(new T.Vector3(0, 0.1, 0))); },
    tableRec: () => { const r = recs.find((x) => x.state === 'table'); return r && screenOf(r.mesh.position); },
    platter: () => screenOf(platter.getWorldPosition(new T.Vector3()).add(new T.Vector3(0, 0.37, 0))),
    grid: () => { let o = ''; for (let j = 0; j < NAV.nz; j++) { for (let i = 0; i < NAV.nx; i++) o += NAV.free[j * NAV.nx + i] ? '.' : '#'; o += '\n'; } return o; },
    path: (ax, az, bx, bz) => ({ p: findPath({ x: ax, z: az }, { x: bx, z: bz }), free: NAV.free.reduce((s, v) => s + v, 0), n: NAV.free.length, s: nearestFree(ax, az), t: nearestFree(bx, bz) }),
    screen: (x, y, z) => screenOf(new T.Vector3(x, y, z)),
    doze: () => { body.idle = 1000; },
    walk: (x, z) => walkTo({ x, z }),
    body: () => ({ exiting: body.exiting, lie: +body.lie.toFixed(2), crouch: +body.crouch.toFixed(2), state: body.state, x: +body.x.toFixed(2), z: +body.z.toFixed(2), h: +body.h.toFixed(2), sit: +body.sit.toFixed(2), reach: +body.reach.toFixed(2) }),
    state: () => ({ mode, playing: nowPlaying.playing, rec: nowPlaying.rec?.track.title, progress: nowPlaying.progress, table: recs.filter((r) => r.state === 'table').length }),
  };
}
