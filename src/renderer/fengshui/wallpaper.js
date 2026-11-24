// The Feng Shui wallpaper: a living yin yang, drawn as flat 2D generative
// graphics on warm paper, with the Five Elements around it as small systems.
//
// Everything is drawn on two canvases. "paper" is the still ground (tone,
// grain, a fine dot grid) and is redrawn only on resize. "ink" is redrawn
// every frame: the yin yang, its orbits and particles, the Wu Xing ring and
// a little quiet activity across the room.
//
// The main process tells us where the open centre of the room is (the space
// the widgets leave free) with window.fsRoom({ cx, cy, r }); the centrepiece
// glides there and resizes to fit.

(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const paper = document.getElementById('paper');
  const ink = document.getElementById('ink');
  const pc = paper.getContext('2d');
  const g = ink.getContext('2d');

  const INK = '#1a1a19';
  const LIGHT = '#faf8f3';
  const GROUND = '#eeebe4';
  const MONO = 'ui-monospace, "SF Mono", Menlo, monospace';
  const SANS = '-apple-system, "SF Pro Text", "Helvetica Neue", sans-serif';
  const HAN = '"Songti SC", "STSong", "PingFang SC", serif';

  // Generating order, Fire at the top (the south is up on old maps). Each
  // element is marked with an alchemical glyph, drawn as paths: the classical
  // triangles for Fire, Earth and Water; Jupiter (tin) for Wood and Venus
  // (copper) for Metal, the planets the Chinese call the Wood and Metal stars.
  const ELEMENTS = [
    { key: 'fire', han: '火', name: 'FIRE', color: '#d4582f' },
    { key: 'earth', han: '土', name: 'EARTH', color: '#bfa274' },
    { key: 'metal', han: '金', name: 'METAL', color: '#8f949b' },
    { key: 'water', han: '水', name: 'WATER', color: '#527698' },
    { key: 'wood', han: '木', name: 'WOOD', color: '#5f8d76' },
  ];
  // Alchemical glyphs in a unit box (-1..1), stroked.
  const GLYPH = {
    fire(c) { c.moveTo(0, -0.9); c.lineTo(0.85, 0.7); c.lineTo(-0.85, 0.7); c.closePath(); },
    water(c) { c.moveTo(0, 0.9); c.lineTo(0.85, -0.7); c.lineTo(-0.85, -0.7); c.closePath(); },
    earth(c) { GLYPH.water(c); c.moveTo(-0.62, -0.18); c.lineTo(0.62, -0.18); },
    metal(c) { c.moveTo(0.46, -0.4); c.arc(0, -0.4, 0.46, 0, TAU); c.moveTo(0, 0.06); c.lineTo(0, 0.95); c.moveTo(-0.38, 0.52); c.lineTo(0.38, 0.52); },
    wood(c) {
      c.moveTo(-0.62, -0.5); c.bezierCurveTo(-0.62, -0.98, 0.08, -1.02, 0.08, -0.56);
      c.bezierCurveTo(0.08, -0.18, -0.38, 0.12, -0.78, 0.32); c.lineTo(0.8, 0.32);
      c.moveTo(0.38, -0.62); c.lineTo(0.38, 0.95);
    },
  };
  function glyph(key, x, y, size, color, width = 1) {
    g.save();
    g.translate(x, y); g.scale(size / 2, size / 2);
    g.beginPath(); GLYPH[key](g);
    g.lineWidth = (width * 2) / size; g.lineJoin = 'round'; g.lineCap = 'round';
    g.strokeStyle = color; g.stroke();
    g.restore();
  }

  // The twelve double hours and their elements.
  const BRANCH = '子丑寅卯辰巳午未申酉戌亥';
  const BRANCH_EL = ['water', 'earth', 'wood', 'wood', 'earth', 'fire', 'fire', 'earth', 'metal', 'metal', 'earth', 'water'];

  let W = 0, H = 0;
  let target = null; // where the main process wants the centrepiece
  const room = { cx: 0, cy: 0, r: 0 };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const rgba = (h, a) => { const [r, gg, b] = hex(h); return `rgba(${r},${gg},${b},${a})`; };
  const mix = (a, b, t) => { const x = hex(a), y = hex(b); return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`; };

  function defaultRoom() {
    const r = Math.min(W, H) * 0.17;
    return { cx: W / 2, cy: H / 2 + 12, r };
  }

  window.fsRoom = (o) => {
    if (!o || !(o.r > 0)) return;
    target = { cx: +o.cx, cy: +o.cy, r: +o.r };
  };

  // ---- The still ground -------------------------------------------------
  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    for (const c of [paper, ink]) { c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); }
    if (!room.r) Object.assign(room, target || defaultRoom());
    drawPaper();
  }

  function drawPaper() {
    pc.setTransform(DPR, 0, 0, DPR, 0, 0);
    const bg = pc.createRadialGradient(W / 2, H * 0.48, 0, W / 2, H * 0.48, Math.hypot(W, H) * 0.62);
    bg.addColorStop(0, '#f3f1eb');
    bg.addColorStop(0.6, GROUND);
    bg.addColorStop(1, '#e4e0d7');
    pc.fillStyle = bg;
    pc.fillRect(0, 0, W, H);
    // Paper grain: a tile of soft noise.
    const n = document.createElement('canvas');
    n.width = n.height = 160;
    const nc = n.getContext('2d');
    const img = nc.createImageData(160, 160);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() < 0.5 ? 0 : 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = Math.random() * 9;
    }
    nc.putImageData(img, 0, 0);
    pc.fillStyle = pc.createPattern(n, 'repeat');
    pc.fillRect(0, 0, W, H);
    // A fine dot grid, like squared drafting paper, fading toward the edges.
    const step = 28;
    for (let y = step / 2; y < H; y += step) {
      for (let x = step / 2; x < W; x += step) {
        const d = Math.hypot((x - W / 2) / W, (y - H / 2) / H);
        const a = 0.085 * (1 - smooth(d * 1.5));
        if (a < 0.008) continue;
        pc.fillStyle = `rgba(26,26,25,${a})`;
        pc.fillRect(x - 0.5, y - 0.5, 1, 1);
      }
    }
  }

  // ---- The yin yang -----------------------------------------------------
  // The boundary between the two halves, from the top of the disc (u = 0) to
  // the bottom (u = 1), as x offsets. It blends the classic two half-circles
  // with a sine and a few slow harmonics, and every 64 s the two halves trade
  // places in a quick, fluid crossing.
  function shape(t) {
    const s = Math.cos((t * TAU) / 64 + 0.6);
    const a = 0.5 * Math.sign(s) * Math.pow(Math.abs(s), 0.32);
    const m = 0.55 + 0.45 * Math.sin((t * TAU) / 23);
    const h = [
      0.065 * Math.sin(t * 0.31),
      0.05 * Math.sin(t * 0.23 + 1.1),
      0.03 * Math.sin(t * 0.41 + 2.3),
      0.018 * Math.sin(t * 0.67 + 0.4),
    ];
    return { a, m, h };
  }
  function bx(u, R, sh) {
    const semi = u < 0.5 ? Math.sqrt(Math.max(0, 0.0625 - (u - 0.25) ** 2)) / 0.25 : -Math.sqrt(Math.max(0, 0.0625 - (u - 0.75) ** 2)) / 0.25;
    const base = sh.m * semi + (1 - sh.m) * Math.sin(TAU * u);
    let x = sh.a * base;
    for (let k = 0; k < sh.h.length; k++) x += sh.h[k] * Math.sin((k + 3) * Math.PI * u);
    return x * R;
  }
  const N = 120;
  function boundary(R, sh, shift = 0) {
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      pts.push([bx(u, R, sh) + shift, -R + 2 * R * u]);
    }
    return pts;
  }
  function yinShare(R, sh) {
    let dark = 0, all = 0;
    for (let i = 1; i < 200; i++) {
      const u = i / 200, y = -R + 2 * R * u, w = Math.sqrt(R * R - y * y);
      dark += clamp(bx(u, R, sh), -w, w) + w;
      all += 2 * w;
    }
    return dark / all;
  }
  function darkPath(R, pts) {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts) g.lineTo(p[0], p[1]);
    g.arc(0, 0, R, Math.PI / 2, (3 * Math.PI) / 2);
    g.closePath();
  }
  function polyline(pts) {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  }

  function drawYinYang(R, t, sh, active) {
    const rot = (t * TAU) / 180;
    g.save();
    g.rotate(rot);
    const pts = boundary(R, sh);
    // The light half, then the dark half over it.
    g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fillStyle = LIGHT; g.fill();
    darkPath(R, pts); g.fillStyle = INK; g.fill();

    // Fine striations that follow the boundary, drifting through each half.
    const gap = Math.max(5, R * 0.065);
    const drift = ((t * R * 0.02) % gap);
    g.lineWidth = 0.6;
    g.save();
    darkPath(R, pts); g.clip();
    g.strokeStyle = 'rgba(250,248,243,0.075)';
    for (let k = 1; k < 2.2 * R / gap; k++) { polyline(boundary(R, sh, -k * gap + drift)); g.stroke(); }
    g.restore();
    g.save();
    g.beginPath(); g.arc(0, 0, R, 0, TAU); g.clip();
    g.strokeStyle = 'rgba(26,26,25,0.07)';
    for (let k = 1; k < 2.2 * R / gap; k++) { polyline(boundary(R, sh, k * gap - drift)); g.stroke(); }
    g.restore();

    // The eyes: each sits in its lobe in the opposite colour, breathing. As
    // the halves trade places they shrink away and return on the other side.
    const lobe = Math.abs(sh.a) / 0.5;
    const topX = bx(0.25, R, sh) - sh.a * R;
    const botX = bx(0.75, R, sh) + sh.a * R;
    const topDark = sh.a > 0;
    const er = R * 0.115 * lobe * (1 + 0.12 * Math.sin(t * 1.3));
    const eyes = [[topX, -R / 2, topDark ? LIGHT : INK, 0], [botX, R / 2, topDark ? INK : LIGHT, 0.5]];
    for (const [x, y, c, off] of eyes) {
      if (er < 0.5) continue;
      g.beginPath(); g.arc(x, y, er, 0, TAU); g.fillStyle = c; g.fill();
      // A ripple leaving the eye.
      const p = (t / 4.2 + off) % 1;
      g.beginPath(); g.arc(x, y, er + p * R * 0.32, 0, TAU);
      g.strokeStyle = c === LIGHT ? `rgba(250,248,243,${0.5 * (1 - p) * lobe})` : `rgba(26,26,25,${0.45 * (1 - p) * lobe})`;
      g.lineWidth = 0.8; g.stroke();
    }
    g.restore();

    // The rim.
    g.beginPath(); g.arc(0, 0, R, 0, TAU);
    g.strokeStyle = INK; g.lineWidth = 1; g.stroke();

    // A rose curve that draws itself across the disc and fades, in difference
    // ink, so it reads dark on the light half and light on the dark half.
    const ROSES = [[3, 1], [5, 2], [7, 3], [2, 1], [5, 3], [4, 1], [8, 5]];
    const period = 19;
    const idx = Math.floor(t / period) % ROSES.length;
    const ph = (t % period) / period;
    const env = Math.sin(Math.PI * ph) ** 2;
    if (env > 0.01) {
      const [n, d] = ROSES[idx];
      const span = TAU * d * Math.min(1, ph * 2.2);
      g.save();
      g.rotate(-rot * 0.5 + idx);
      g.globalCompositeOperation = 'difference';
      g.strokeStyle = `rgba(255,255,255,${0.42 * env})`;
      g.lineWidth = 0.7;
      g.beginPath();
      for (let th = 0; th <= span; th += 0.01) {
        const r = R * 0.92 * Math.cos((n / d) * th);
        const x = r * Math.cos(th), y = r * Math.sin(th);
        if (th === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
      g.restore();
    }
  }

  // ---- Orbits -----------------------------------------------------------
  const ORBITERS = [
    { ring: 1.27, speed: 0.31, size: 2.1, off: 0 },
    { ring: 1.27, speed: 0.31, size: 1.4, off: 2.1 },
    { ring: 1.27, speed: -0.19, size: 1.6, off: 4.0 },
    { ring: 1.42, speed: 0.12, size: 1.2, off: 1.0 },
    { ring: 1.42, speed: 0.12, size: 1.2, off: 1.0 + TAU / 3 },
    { ring: 1.42, speed: 0.12, size: 1.2, off: 1.0 + (2 * TAU) / 3 },
  ];

  function drawOrbitsBehind(R, t, el) {
    // Two flat ellipses, slowly turning, with a particle on each. The disc is
    // drawn over them, so they pass behind it.
    for (let i = 0; i < 2; i++) {
      const ang = t * 0.045 + i * (Math.PI / 2.6);
      g.save();
      g.rotate(ang);
      g.beginPath(); g.ellipse(0, 0, R * 1.5, R * 0.42, 0, 0, TAU);
      g.strokeStyle = 'rgba(26,26,25,0.13)'; g.lineWidth = 0.6; g.stroke();
      const p = t * (0.5 - i * 0.17) + i * 2;
      const x = R * 1.5 * Math.cos(p), y = R * 0.42 * Math.sin(p);
      g.beginPath(); g.arc(x, y, 2, 0, TAU); g.fillStyle = i ? INK : el.color; g.fill();
      g.restore();
    }
  }

  function drawOrbits(R, t, el, yin) {
    // Tick ring: 120 ticks, every tenth longer, slowly turning.
    const r1 = R * 1.13;
    const spin = (t * TAU) / 240;
    g.strokeStyle = 'rgba(26,26,25,0.5)';
    g.lineWidth = 0.6;
    g.beginPath();
    for (let i = 0; i < 120; i++) {
      const a = spin + (i * TAU) / 120;
      const len = i % 10 === 0 ? R * 0.055 : i % 5 === 0 ? R * 0.035 : R * 0.02;
      g.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
      g.lineTo(Math.cos(a) * (r1 + len), Math.sin(a) * (r1 + len));
    }
    g.stroke();

    // A sweep in the element's colour, its head leaving a dot.
    const head = t * 0.21;
    const span = TAU * (0.09 + 0.05 * Math.sin(t * 0.37));
    const rs = r1 + R * 0.085;
    g.beginPath(); g.arc(0, 0, rs, head - span, head);
    g.strokeStyle = el.color; g.lineWidth = 1.4; g.lineCap = 'round'; g.stroke();
    g.lineCap = 'butt';
    g.beginPath(); g.arc(Math.cos(head) * rs, Math.sin(head) * rs, 2.2, 0, TAU); g.fillStyle = el.color; g.fill();

    // Thin rings.
    g.lineWidth = 0.6;
    g.beginPath(); g.arc(0, 0, R * 1.27, 0, TAU); g.strokeStyle = 'rgba(26,26,25,0.22)'; g.stroke();
    g.save();
    g.rotate(-t * 0.03);
    g.setLineDash([1.5, 6]);
    g.beginPath(); g.arc(0, 0, R * 1.42, 0, TAU); g.strokeStyle = 'rgba(26,26,25,0.35)'; g.stroke();
    g.setLineDash([]);
    g.restore();

    // Particles with short trails.
    for (const o of ORBITERS) {
      const r = R * o.ring;
      for (let k = 0; k < 7; k++) {
        const a = t * o.speed + o.off - k * 0.022 * Math.sign(o.speed);
        g.beginPath();
        g.arc(Math.cos(a) * r, Math.sin(a) * r, o.size * (1 - k / 9), 0, TAU);
        g.fillStyle = `rgba(26,26,25,${0.85 * (1 - k / 7)})`;
        g.fill();
      }
    }

    // Numbers: the sweep's bearing, upper right; the balance, lower left.
    const deg = (((head * 180) / Math.PI) % 360 + 360) % 360;
    g.font = `500 ${Math.max(9, Math.round(R * 0.062))}px ${MONO}`;
    g.fillStyle = 'rgba(26,26,25,0.62)';
    const q = Math.PI / 4;
    const tr = R * 1.3;
    g.textAlign = 'left'; g.textBaseline = 'bottom';
    g.fillText(`${deg.toFixed(1).padStart(5, '0')}°`, Math.cos(-q) * tr + 6, Math.sin(-q) * tr - 2);
    g.textAlign = 'right'; g.textBaseline = 'top';
    g.fillText(`陰 ${(yin * 100).toFixed(1)}  陽 ${((1 - yin) * 100).toFixed(1)}`, Math.cos(Math.PI - q) * tr - 6, Math.sin(Math.PI - q) * tr + 2);
  }

  // ---- The Five Elements -----------------------------------------------
  // Each gets its own small graphic language, drawn inside a circle of radius s.
  const woodTrees = new Map();
  function woodTree(seed) {
    if (woodTrees.has(seed)) return woodTrees.get(seed);
    let x = seed * 9301 + 49297;
    const rnd = () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
    const segs = [];
    (function branch(x0, y0, ang, len, depth) {
      const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
      segs.push({ x0, y0, x1, y1, depth });
      if (depth >= 5) return;
      const n = depth < 1 ? 2 : rnd() < 0.7 ? 2 : 3;
      for (let i = 0; i < n; i++) {
        const spread = 0.35 + rnd() * 0.45;
        branch(x1, y1, ang + (i - (n - 1) / 2) * spread * 1.4 + (rnd() - 0.5) * 0.3, len * (0.62 + rnd() * 0.16), depth + 1);
      }
    })(0, 0.85, -Math.PI / 2, 0.42, 0);
    woodTrees.set(seed, segs);
    if (woodTrees.size > 4) woodTrees.delete(woodTrees.keys().next().value);
    return segs;
  }

  const DRAW = {
    water(s, t, c, act) {
      // A drop falls, meets the surface and sends flat rings outward; below,
      // layered currents roll at different speeds.
      const surf = -s * 0.05;
      const wave = (x, i, amp) => surf + i * s * 0.24 + Math.sin((x / s) * Math.PI * (1.2 + i * 0.35) + t * (1.4 - i * 0.25) + i * 1.7) * amp
        + Math.sin((x / s) * Math.PI * 2.7 - t * 0.9 + i) * amp * 0.35;
      for (let i = 0; i < 4; i++) {
        const amp = s * (0.06 - i * 0.008) * (1 + 0.6 * act);
        g.beginPath();
        g.moveTo(-s, s);
        for (let x = -s; x <= s; x += 1) g.lineTo(x, wave(x, i, amp));
        g.lineTo(s, s); g.closePath();
        g.fillStyle = rgba('#527698', 0.1 + i * 0.07); g.fill();
        g.beginPath();
        for (let x = -s; x <= s; x += 1) { const y = wave(x, i, amp); if (x === -s) g.moveTo(x, y); else g.lineTo(x, y); }
        g.strokeStyle = rgba(i ? '#46698c' : '#6f93b5', 0.9 - i * 0.12); g.lineWidth = i ? 0.7 : 1; g.stroke();
      }
      // Glints riding the top current.
      for (let k = 0; k < 4; k++) {
        const x = ((t * 0.18 + k / 4) % 1) * 2 * s - s;
        g.beginPath(); g.moveTo(x - s * 0.06, wave(x, 0, s * 0.06) + s * 0.07); g.lineTo(x + s * 0.06, wave(x, 0, s * 0.06) + s * 0.07);
        g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 0.8; g.stroke();
      }
      // The drop and its rings, every 3.2 s.
      const p = (t / 3.2) % 1;
      if (p < 0.3) {
        const q = p / 0.3, y = -s * 0.9 + (surf + s * 0.85) * q * q;
        g.beginPath();
        g.moveTo(0, y - s * 0.13); g.bezierCurveTo(s * 0.07, y - s * 0.02, s * 0.07, y + s * 0.06, 0, y + s * 0.06);
        g.bezierCurveTo(-s * 0.07, y + s * 0.06, -s * 0.07, y - s * 0.02, 0, y - s * 0.13);
        g.fillStyle = '#527698'; g.fill();
      } else {
        const q = (p - 0.3) / 0.7;
        for (let k = 0; k < 3; k++) {
          const r = (q - k * 0.12) * s * 1.1;
          if (r <= 0) continue;
          g.beginPath(); g.ellipse(0, surf, r, r * 0.26, 0, 0, TAU);
          g.strokeStyle = rgba('#3e6185', 0.7 * (1 - q)); g.lineWidth = 0.8; g.stroke();
        }
        if (q < 0.25) { // a small crown of spray
          for (let k = -1; k <= 1; k += 2) {
            const u = q / 0.25;
            g.beginPath(); g.arc(k * s * 0.12 * (1 + u), surf - s * 0.22 * Math.sin(Math.PI * u), 1, 0, TAU);
            g.fillStyle = rgba('#527698', 1 - u); g.fill();
          }
        }
      }
    },
    fire(s, t, c, act) {
      // A candle-like flame: three nested tongues that sway and stretch on
      // their own rhythms, a blue root, embers lifting off the tip.
      const base = s * 0.62;
      const flick = (k) => Math.sin(t * (5.1 + k)) * 0.5 + Math.sin(t * (8.3 + k * 1.7) + k) * 0.3 + Math.sin(t * 13.7 + k * 2) * 0.2;
      function tongue(scale, k, fill) {
        const h = s * 1.25 * scale * (1 + 0.07 * flick(k) + 0.12 * act);
        const w = s * 0.42 * scale * (1 + 0.04 * flick(k + 3));
        const sway = s * 0.09 * scale * (Math.sin(t * 1.9 + k) + 0.5 * flick(k + 1));
        const tipX = sway, tipY = base - h;
        g.beginPath();
        g.moveTo(0, base);
        g.bezierCurveTo(-w * 1.25, base - h * 0.05, -w * 0.95, base - h * 0.55, tipX - w * 0.05, tipY + h * 0.08);
        g.quadraticCurveTo(tipX, tipY - h * 0.02, tipX, tipY);
        g.quadraticCurveTo(tipX + w * 0.1, tipY + h * 0.1, tipX + w * 0.2, tipY + h * 0.12);
        g.bezierCurveTo(w * 0.95, base - h * 0.5, w * 1.25, base - h * 0.05, 0, base);
        g.closePath();
        g.fillStyle = fill; g.fill();
      }
      // Heat haze ring.
      const p = (t / 2.4) % 1;
      g.beginPath(); g.arc(0, base - s * 0.45, s * (0.4 + 0.55 * p), 0, TAU);
      g.strokeStyle = rgba('#d4582f', 0.35 * (1 - p)); g.lineWidth = 0.7; g.stroke();
      tongue(1, 0, rgba('#d4582f', 0.9));
      tongue(0.72, 1.3, '#e9823f');
      tongue(0.46, 2.6, '#f4c06a');
      // The blue root.
      g.beginPath(); g.ellipse(0, base - s * 0.06, s * 0.11, s * 0.07, 0, 0, TAU);
      g.fillStyle = rgba('#527698', 0.55); g.fill();
      // Wick.
      g.beginPath(); g.moveTo(0, base); g.lineTo(0, base + s * 0.2);
      g.strokeStyle = INK; g.lineWidth = 1; g.stroke();
      // Embers.
      for (let i = 0; i < 7; i++) {
        const q = (t * 0.45 + i / 7) % 1;
        const x = Math.sin(i * 2.4 + t * 2.1 + q * 4) * s * 0.18 * q;
        const y = base - s * 1.1 - q * s * 0.55;
        g.beginPath(); g.arc(x, y, Math.max(0.4, 1.3 * (1 - q)), 0, TAU);
        g.fillStyle = rgba('#e9823f', 0.9 * (1 - q)); g.fill();
      }
    },
    earth(s, t, c, act) {
      // A sun crossing behind layered hills, strata below, a cairn of stones
      // keeping its balance.
      const p = (t / 16) % 1;
      const sx = -s * 0.7 + p * s * 1.4, sy = -s * 0.05 - Math.sin(Math.PI * p) * s * 0.55;
      g.beginPath(); g.arc(sx, sy, s * 0.2, 0, TAU); g.fillStyle = rgba('#e2b96f', 0.85); g.fill();
      g.beginPath(); g.arc(sx, sy, s * 0.28 + Math.sin(t * 1.3) * s * 0.02, 0, TAU); g.strokeStyle = rgba('#d1a75e', 0.5); g.lineWidth = 0.6; g.stroke();
      const hills = [
        [[-s, 0.12], [-s * 0.35, -0.42], [s * 0.2, 0.05], [s * 0.7, -0.28], [s, 0.0]],
        [[-s, 0.2], [-s * 0.6, -0.05], [-s * 0.05, 0.14], [s * 0.5, -0.12], [s, 0.18]],
      ];
      hills.forEach((pts, i) => {
        g.beginPath(); g.moveTo(-s, s);
        for (const [x, y] of pts) g.lineTo(x, (y + 0.015 * Math.sin(t * 0.3 + i)) * s);
        g.lineTo(s, s); g.closePath();
        g.fillStyle = ['#d9c39b', '#c4a877'][i]; g.fill();
      });
      // Strata: bands that drift very slowly, with fine dashed seams.
      for (let k = 0; k < 4; k++) {
        const y = s * (0.3 + k * 0.17);
        g.beginPath(); g.moveTo(-s, s);
        for (let x = -s; x <= s; x += 2) g.lineTo(x, y + Math.sin(x / s * 2 + k + t * 0.15) * s * 0.025);
        g.lineTo(s, s); g.closePath();
        g.fillStyle = ['#b89a68', '#a88b5c', '#957a4f', '#836b44'][k]; g.fill();
        g.setLineDash([2, 3]); g.lineDashOffset = -t * (2 + k);
        g.beginPath();
        for (let x = -s; x <= s; x += 2) { const yy = y + s * 0.07 + Math.sin(x / s * 2 + k + t * 0.15) * s * 0.025; if (x === -s) g.moveTo(x, yy); else g.lineTo(x, yy); }
        g.strokeStyle = 'rgba(250,248,243,0.35)'; g.lineWidth = 0.5; g.stroke();
        g.setLineDash([]);
      }
      // The cairn on the near ridge.
      let y = -s * 0.02;
      const stones = [[0.2, 0.07], [0.15, 0.06], [0.1, 0.05]];
      stones.forEach(([rx, ry], i) => {
        const sway = Math.sin(t * 0.8 + i * 0.9) * s * 0.012 * (i + 1) * (1 + act);
        y -= ry * s;
        g.beginPath(); g.ellipse(s * 0.38 + sway, y, rx * s, ry * s, Math.sin(t * 0.5 + i) * 0.05, 0, TAU);
        g.fillStyle = ['#8a7148', '#a88b5c', '#bfa274'][i]; g.fill();
        y -= ry * s * 0.9;
      });
    },
    metal(s, t, c, act) {
      // A small foundry: two gears meshing, driven by a third, turning a
      // conveyor that carries ingots under a stamping press.
      function gear(x, y, r, n, ang, fill) {
        const th = Math.max(1.4, r * 0.22);
        g.beginPath();
        for (let i = 0; i < n; i++) {
          const a = ang + (i * TAU) / n, w = TAU / n;
          g.lineTo(x + Math.cos(a - w * 0.3) * (r - th * 0.5), y + Math.sin(a - w * 0.3) * (r - th * 0.5));
          g.lineTo(x + Math.cos(a - w * 0.17) * (r + th * 0.5), y + Math.sin(a - w * 0.17) * (r + th * 0.5));
          g.lineTo(x + Math.cos(a + w * 0.17) * (r + th * 0.5), y + Math.sin(a + w * 0.17) * (r + th * 0.5));
          g.lineTo(x + Math.cos(a + w * 0.3) * (r - th * 0.5), y + Math.sin(a + w * 0.3) * (r - th * 0.5));
        }
        g.closePath();
        g.fillStyle = fill; g.fill();
        g.strokeStyle = '#5f646b'; g.lineWidth = 0.6; g.stroke();
        // Spokes and hub.
        g.beginPath(); g.arc(x, y, r * 0.62, 0, TAU); g.fillStyle = '#f6f4ef'; g.fill(); g.stroke();
        g.beginPath();
        for (let k = 0; k < 4; k++) { const a = ang + (k * Math.PI) / 2; g.moveTo(x + Math.cos(a) * r * 0.2, y + Math.sin(a) * r * 0.2); g.lineTo(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62); }
        g.lineWidth = Math.max(1, r * 0.14); g.strokeStyle = fill; g.stroke();
        g.beginPath(); g.arc(x, y, r * 0.22, 0, TAU); g.fillStyle = fill; g.fill();
        g.lineWidth = 0.6; g.strokeStyle = '#5f646b'; g.stroke();
        g.beginPath(); g.arc(x, y, r * 0.08, 0, TAU); g.fillStyle = INK; g.fill();
      }
      const speed = 0.7; // steady: scaling t by a changing factor would make the gears lurch
      const A = { x: -s * 0.3, y: -s * 0.22, r: s * 0.36, n: 12 };
      const B = { r: s * 0.24, n: 8 };
      const d = A.r + B.r + s * 0.02, ab = -0.35;
      B.x = A.x + Math.cos(ab) * d; B.y = A.y + Math.sin(ab) * d;
      const C = { r: s * 0.15, n: 6 };
      const dc = B.r + C.r + s * 0.015, bc = 1.25;
      C.x = B.x + Math.cos(bc) * dc; C.y = B.y + Math.sin(bc) * dc;
      const aA = t * speed;
      const aB = -aA * (A.n / B.n) + Math.PI / B.n + ab * (1 + A.n / B.n);
      const aC = -aB * (B.n / C.n) + Math.PI / C.n + bc * (1 + B.n / C.n);
      gear(A.x, A.y, A.r, A.n, aA, '#b8bcc2');
      gear(B.x, B.y, B.r, B.n, aB, '#a3a8af');
      gear(C.x, C.y, C.r, C.n, aC, '#c9ccd1');
      // Conveyor belt with rollers.
      const by = s * 0.62, bl = -s * 0.85, br = s * 0.85, rr = s * 0.07;
      g.strokeStyle = '#5f646b'; g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(bl, by - rr); g.lineTo(br, by - rr); g.moveTo(bl, by + rr); g.lineTo(br, by + rr); g.stroke();
      for (let k = 0; k < 6; k++) {
        const x = bl + (k * (br - bl)) / 5;
        g.beginPath(); g.arc(x, by, rr * 0.8, 0, TAU); g.fillStyle = '#d5d7da'; g.fill(); g.stroke();
        const a = -t * speed * 4;
        g.beginPath(); g.moveTo(x, by); g.lineTo(x + Math.cos(a) * rr * 0.8, by + Math.sin(a) * rr * 0.8); g.stroke();
      }
      // Ingots ride the belt; the press stamps each one as it passes.
      const px = s * 0.62, period = 2.4;
      const ph = (t * speed / 0.7 % period) / period;
      for (let k = 0; k < 3; k++) {
        const u = (ph + k / 3 + 0.565) % 1;
        const x = bl + u * (br - bl);
        const stamped = x > px;
        const w = s * 0.2, h = stamped ? s * 0.07 : s * 0.11;
        g.fillStyle = stamped ? '#8f949b' : '#d4582f';
        g.globalAlpha = Math.min(1, u * 8, (1 - u) * 8);
        g.fillRect(x - w / 2, by - rr - h, w, h);
        g.globalAlpha = 1;
      }
      // The press: a ram that drops each time an ingot reaches it.
      const hit = (ph * 3) % 1, ram = hit > 0.9 ? 1 - (hit - 0.9) / 0.1 : hit > 0.8 ? (hit - 0.8) / 0.1 : 0;
      const top = s * 0.12, low = by - rr - s * 0.16;
      const ry = top + (low - top) * ram;
      g.fillStyle = '#5f646b';
      g.fillRect(px - s * 0.025, -s, s * 0.05, ry + s);
      g.fillRect(px - s * 0.13, ry, s * 0.26, s * 0.07);
      if (ram > 0.85) { // a spark at impact
        for (let k = -1; k <= 1; k += 2) { g.beginPath(); g.arc(px + k * s * 0.18, low + s * 0.02, 1, 0, TAU); g.fillStyle = '#e9823f'; g.fill(); }
      }
    },
    wood(s, t, c, act) {
      const cycle = 11;
      const n = Math.floor(t / cycle);
      const ph = (t % cycle) / cycle;
      const grow = smooth(ph / 0.65) * 6;
      const fade = 1 - smooth((ph - 0.82) / 0.18);
      const segs = woodTree(n % 97);
      g.strokeStyle = c;
      g.lineCap = 'round';
      for (const sg of segs) {
        const f = clamp(grow - sg.depth, 0, 1);
        if (f <= 0) continue;
        g.globalAlpha = fade * (1 - sg.depth * 0.1);
        g.lineWidth = Math.max(0.5, 1.6 - sg.depth * 0.25);
        g.beginPath();
        g.moveTo(sg.x0 * s, sg.y0 * s);
        g.lineTo((sg.x0 + (sg.x1 - sg.x0) * f) * s, (sg.y0 + (sg.y1 - sg.y0) * f) * s);
        g.stroke();
        if (sg.depth === 5 && f >= 1) { g.beginPath(); g.arc(sg.x1 * s, sg.y1 * s, 1.1 + act * 0.6, 0, TAU); g.fillStyle = c; g.fill(); }
      }
      g.globalAlpha = 1;
      g.lineCap = 'butt';
    },
  };

  function drawElements(R, t, activePos) {
    const rw = R * 1.72;
    const s = Math.max(14, R * 0.165);
    const pos = ELEMENTS.map((_, k) => {
      const a = -Math.PI / 2 + (k * TAU) / 5;
      return { a, x: Math.cos(a) * rw, y: Math.sin(a) * rw };
    });
    const nearness = (k) => { let d = Math.abs(k - activePos) % 5; d = Math.min(d, 5 - d); return 1 - smooth(d); };

    // The generating cycle: arcs along the ring with particles carried from
    // one element to the next, changing colour on the way.
    const m = (s + 6) / rw;
    g.lineWidth = 0.6;
    g.strokeStyle = 'rgba(26,26,25,0.28)';
    for (let k = 0; k < 5; k++) {
      const a0 = pos[k].a + m, a1 = pos[k].a + TAU / 5 - m;
      g.beginPath(); g.arc(0, 0, rw, a0, a1); g.stroke();
      for (let j = 0; j < 2; j++) {
        const p = (t / 6 + j / 2 + k * 0.13) % 1;
        const a = a0 + (a1 - a0) * p;
        g.beginPath(); g.arc(Math.cos(a) * rw, Math.sin(a) * rw, 1.6, 0, TAU);
        g.fillStyle = mix(ELEMENTS[k].color, ELEMENTS[(k + 1) % 5].color, p);
        g.fill();
      }
    }
    // The controlling cycle: a faint star, with a pulse running from the
    // active element to the one it restrains.
    g.setLineDash([1, 5]);
    g.strokeStyle = 'rgba(26,26,25,0.2)';
    for (let k = 0; k < 5; k++) {
      const A = pos[k], B = pos[(k + 2) % 5];
      const dx = B.x - A.x, dy = B.y - A.y, L = Math.hypot(dx, dy);
      const ux = dx / L, uy = dy / L;
      g.beginPath(); g.moveTo(A.x + ux * (s + 5), A.y + uy * (s + 5)); g.lineTo(B.x - ux * (s + 5), B.y - uy * (s + 5)); g.stroke();
    }
    g.setLineDash([]);
    {
      const k = Math.round(activePos) % 5;
      const A = pos[k], B = pos[(k + 2) % 5];
      const p = smooth(((activePos + 0.5) % 1) * 1.4);
      if (p > 0 && p < 1) {
        const x = A.x + (B.x - A.x) * p, y = A.y + (B.y - A.y) * p;
        g.beginPath(); g.arc(x, y, 1.8, 0, TAU); g.fillStyle = rgba(ELEMENTS[k].color, Math.sin(Math.PI * p)); g.fill();
      }
    }

    // The nodes.
    ELEMENTS.forEach((el, k) => {
      const { x, y, a } = pos[k];
      const act = nearness(k);
      g.save();
      g.translate(x, y);
      g.beginPath(); g.arc(0, 0, s, 0, TAU); g.fillStyle = '#f6f4ef'; g.fill();
      if (act > 0.05) {
        const p = (t / 2.6) % 1;
        g.beginPath(); g.arc(0, 0, s + 3 + p * s * 0.7, 0, TAU);
        g.strokeStyle = rgba(el.color, 0.5 * act * (1 - p)); g.lineWidth = 0.8; g.stroke();
      }
      g.beginPath(); g.arc(0, 0, s, 0, TAU);
      g.strokeStyle = rgba(el.color, 0.45 + 0.5 * act); g.lineWidth = 0.8 + 0.7 * act; g.stroke();
      g.save();
      g.beginPath(); g.arc(0, 0, s - 2, 0, TAU); g.clip();
      DRAW[el.key](s - 3, t, el.color, act);
      g.restore();
      g.restore();

      // Label, outside the ring: character, name and a live reading.
      const lx = x + Math.cos(a) * (s + 12), ly = y + Math.sin(a) * (s + 12);
      const ca = Math.cos(a), sa = Math.sin(a);
      g.textAlign = ca > 0.35 ? 'left' : ca < -0.35 ? 'right' : 'center';
      const fs = Math.max(9, Math.round(R * 0.058));
      const lines = 2 * fs + 4;
      let top = sa < -0.35 ? ly - lines : sa > 0.35 ? ly : ly - lines / 2;
      g.textBaseline = 'top';
      g.font = `500 ${fs}px ${SANS}`;
      try { g.letterSpacing = `${(fs * 0.18).toFixed(1)}px`; } catch {}
      const gw = fs * 1.05, nw = g.measureText(el.name).width, total = gw + fs * 0.6 + nw;
      const x0 = g.textAlign === 'left' ? lx : g.textAlign === 'right' ? lx - total : lx - total / 2;
      glyph(el.key, x0 + gw / 2, top + fs * 0.5, gw, rgba(el.color, 0.7 + 0.3 * act), 1 + 0.3 * act);
      const align = g.textAlign;
      g.textAlign = 'left';
      g.fillStyle = rgba('#1a1a19', 0.55 + 0.35 * act);
      g.fillText(el.name, x0 + gw + fs * 0.6, top);
      g.textAlign = align;
      try { g.letterSpacing = '0px'; } catch {}
      g.font = `400 ${fs}px ${MONO}`;
      g.fillStyle = rgba(el.color, 0.65 + 0.35 * act);
      const energy = 0.18 + 0.8 * act + 0.02 * Math.sin(t * 1.7 + k);
      g.fillText(energy.toFixed(2), lx, top + fs + 4);
    });
  }

  // ---- Quiet activity across the room -----------------------------------
  const DUST = Array.from({ length: 46 }, (_, i) => ({ x: Math.random(), y: Math.random(), s: 0.4 + Math.random() * 0.9, k: i }));
  function drawAmbient(t, R) {
    // Long flowing lines, low in the room, changing direction slowly.
    g.lineWidth = 0.7;
    for (let i = 0; i < 5; i++) {
      const base = H * (0.8 + i * 0.035);
      g.beginPath();
      for (let x = -20; x <= W + 20; x += 12) {
        const y = base + Math.sin(x * 0.0042 + t * (0.11 + i * 0.03) * (i % 2 ? 1 : -1) + i) * (14 + i * 4) + Math.sin(x * 0.0011 + t * 0.05) * 18;
        if (x === -20) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.strokeStyle = rgba('#527698', 0.05 + i * 0.008);
      g.stroke();
    }
    // Faint concentric guides around the centre.
    g.lineWidth = 0.6;
    for (const [k, a] of [[2.35, 0.07], [3.1, 0.05], [4.2, 0.035]]) {
      g.beginPath(); g.arc(room.cx, room.cy, R * k * (1 + 0.012 * Math.sin(t * 0.4 + k)), 0, TAU);
      g.strokeStyle = `rgba(26,26,25,${a})`; g.stroke();
    }
    // Dust drifting along a slow field.
    for (const d of DUST) {
      const ang = Math.sin(d.y * 6 + t * 0.07) + Math.cos(d.x * 5 - t * 0.05);
      d.x = (d.x + Math.cos(ang) * 0.00006 + 1) % 1;
      d.y = (d.y + Math.sin(ang) * 0.00006 + 1) % 1;
      g.beginPath(); g.arc(d.x * W, d.y * H, d.s, 0, TAU);
      g.fillStyle = 'rgba(26,26,25,0.18)'; g.fill();
    }
  }

  // ---- The caption under the centrepiece --------------------------------
  function drawCaption(R, t, el) {
    const now = new Date();
    const hb = Math.floor(((now.getHours() + 1) % 24) / 2);
    const hourEl = ELEMENTS.find((e) => e.key === BRANCH_EL[hb]);
    const y = room.cy + R * 1.72 + R * 0.12 + 8;
    if (y + 34 > H) return;
    const fs = Math.max(9, Math.round(R * 0.06));
    g.textAlign = 'center'; g.textBaseline = 'top';
    g.font = `600 ${fs}px ${SANS}`;
    try { g.letterSpacing = `${(fs * 0.42).toFixed(1)}px`; } catch {}
    g.fillStyle = 'rgba(26,26,25,0.78)';
    g.fillText('FENG SHUI', room.cx, y);
    try { g.letterSpacing = '0px'; } catch {}
    g.font = `400 ${fs}px ${MONO}`;
    g.fillStyle = 'rgba(26,26,25,0.5)';
    const hh = String(now.getHours()).padStart(2, '0'), mm = String(now.getMinutes()).padStart(2, '0'), ss = String(now.getSeconds()).padStart(2, '0');
    const line = `${BRANCH[hb]}時 ${hourEl.name.toLowerCase()}  ·  ${hh}:${mm}:${ss}  ·  ${el.name.toLowerCase()}`;
    g.fillText(line, room.cx, y + fs + 6);
    // The active element's glyph beside the reading.
    const half = g.measureText(line).width / 2;
    glyph(el.key, room.cx + half + fs * 1.1, y + fs + 6 + fs * 0.55, fs * 1.05, el.color, 1.1);
  }

  // ---- Frame ------------------------------------------------------------
  const t0 = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const t = ((now - t0) / 1000) * (reduced ? 0.25 : 1) + 40;
    if (target) {
      const k = 0.06;
      room.cx += (target.cx - room.cx) * k;
      room.cy += (target.cy - room.cy) * k;
      room.r += (target.r - room.r) * k;
    }
    const R = room.r;
    const activePos = (t / 9) % 5;
    const el = ELEMENTS[Math.round(activePos) % 5];
    const sh = shape(t);
    const yin = yinShare(R, sh);

    g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.clearRect(0, 0, W, H);
    drawAmbient(t, R);
    g.save();
    g.translate(room.cx, room.cy);
    drawOrbitsBehind(R, t, el);
    drawYinYang(R, t, sh, el);
    drawOrbits(R, t, el, yin);
    drawElements(R, t, activePos);
    g.restore();
    drawCaption(R, t, el);
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);
})();
