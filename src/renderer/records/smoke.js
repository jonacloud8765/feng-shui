// Smoking on the couch: the cigarette box and ashtray on the coffee table, one
// cigarette at a time, its smoke and ember, and the arm movements that go with it.
//
// Cigarette states: box -> pickup -> lighting -> smoking -> finished -> ashing -> box.
// (The spec's "picked up", "being lit", "lit", "smoking", "finished", "being
// ashed", "extinguished" map onto these; 'lit' is the moment lighting ends.)
// Ashtray states: empty -> ash -> butts (ash plus the stubbed-out cigarettes, up to five shown).
//
// The cigarette lasts exactly 120 seconds from the moment it's lit. The timer
// adds up real elapsed time (seconds between frames, never frames), only while
// the game isn't paused, and nothing else resets it.
//
// The room supplies the character: where his hands and mouth are (anchor) and
// arm angles that put a hand on a point (ik). This module only decides when.

export const CIGARETTE_SECONDS = 120;

const sm = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

export function createSmoking(env) {
  const { T, room } = env;
  const PI = Math.PI;
  const up = new T.Vector3(0, 1, 0);
  const v1 = new T.Vector3(), v2 = new T.Vector3(), v3 = new T.Vector3(), v4 = new T.Vector3();

  // ---------------------------------------------------------------- objects
  const props = new T.Group();
  room.add(props);
  const spot = { box: new T.Vector3(), ash: new T.Vector3(), seat: null };

  // The cigarette: filter at the local origin, burning end along +y.
  const LEN = 0.084, FILTER = 0.022, PAPER = LEN - FILTER;
  const cig = new T.Group();
  const filterM = new T.MeshStandardMaterial({ color: '#c98a45', roughness: 0.75 });
  const paperM = new T.MeshStandardMaterial({ color: '#f3f0ea', roughness: 0.85 });
  const ashM = new T.MeshStandardMaterial({ color: '#8c8782', roughness: 1 });
  const emberM = new T.MeshStandardMaterial({ color: '#3a1a10', emissive: new T.Color('#ff5a1a'), emissiveIntensity: 0, roughness: 0.9 });
  const filter = new T.Mesh(new T.CylinderGeometry(0.0042, 0.0042, FILTER, 14), filterM); filter.position.y = FILTER / 2;
  const paper = new T.Mesh(new T.CylinderGeometry(0.0042, 0.0042, 1, 14), paperM);
  const ashTip = new T.Mesh(new T.CylinderGeometry(0.004, 0.0041, 0.005, 12), ashM);
  const ember = new T.Mesh(new T.SphereGeometry(0.0043, 12, 8), emberM);
  cig.add(filter, paper, ashTip, ember);
  for (const m of [filter, paper, ashTip, ember]) { m.castShadow = true; }
  const glow = new T.PointLight('#ff7a2a', 0, 0.7, 2);
  cig.add(glow);
  cig.visible = false;
  room.add(cig);
  function setBurn(b) {
    // b: 0 fresh, 1 burnt down to the filter (a short stub of paper left).
    const len = PAPER * lerp(1, 0.3, b);
    paper.scale.y = len; paper.position.y = FILTER + len / 2;
    ashTip.position.y = FILTER + len + 0.0025;
    ember.position.y = FILTER + len + 0.001;
    glow.position.y = FILTER + len + 0.01;
  }
  setBurn(0);

  // Ashtray: a heavy, low glass-and-ceramic dish.
  const ashtray = new T.Group();
  {
    const prof = [[0, 0], [0.058, 0], [0.064, 0.006], [0.062, 0.026], [0.05, 0.028], [0.046, 0.012], [0, 0.011]].map(([x, y]) => new T.Vector2(x, y));
    const dish = new T.Mesh(new T.LatheGeometry(prof, 40), new T.MeshStandardMaterial({ color: '#25262b', roughness: 0.28, metalness: 0.15 }));
    dish.castShadow = true; dish.receiveShadow = true;
    ashtray.add(dish);
    // Three rests cut in the rim.
    for (let k = 0; k < 3; k++) {
      const notch = new T.Mesh(new T.BoxGeometry(0.014, 0.008, 0.02), new T.MeshStandardMaterial({ color: '#16171a', roughness: 0.5 }));
      const a = k * PI * 2 / 3;
      notch.position.set(Math.cos(a) * 0.057, 0.025, Math.sin(a) * 0.057); notch.rotation.y = -a;
      ashtray.add(notch);
    }
  }
  const ashBed = new T.Mesh(new T.CircleGeometry(0.036, 24), new T.MeshStandardMaterial({ color: '#7d7873', roughness: 1 }));
  ashBed.rotation.x = -PI / 2; ashBed.position.y = 0.0125; ashBed.scale.setScalar(0.001); ashBed.visible = false;
  ashtray.add(ashBed);
  props.add(ashtray);
  const ashtrayState = { ash: 0, butts: 0 };
  // Stubbed-out cigarettes in the tray: a fixed pool, oldest one reused.
  const butts = [];
  for (let k = 0; k < 5; k++) {
    const b = new T.Group();
    const f = new T.Mesh(new T.CylinderGeometry(0.0042, 0.0042, FILTER, 10), filterM); f.position.y = FILTER / 2;
    const p = new T.Mesh(new T.CylinderGeometry(0.0042, 0.0038, 0.012, 10), new T.MeshStandardMaterial({ color: '#4a4440', roughness: 1 })); p.position.y = FILTER + 0.006;
    b.add(f, p); b.visible = false;
    const a = 0.6 + k * 1.25;
    b.userData.slot = { x: Math.cos(a) * 0.022, z: Math.sin(a) * 0.022, rz: PI / 2 - 0.08, ry: a + 1.2 };
    ashtray.add(b); butts.push(b);
  }

  // The cigarette box: the supplied model if there is one, else a plain box.
  let box = null;
  function plainBox() {
    const g = new T.Group();
    const m = new T.Mesh(new T.BoxGeometry(0.056, 0.088, 0.022), [
      new T.MeshStandardMaterial({ color: '#f1eee8', roughness: 0.6 }), new T.MeshStandardMaterial({ color: '#f1eee8', roughness: 0.6 }),
      new T.MeshStandardMaterial({ color: '#b3261e', roughness: 0.5 }), new T.MeshStandardMaterial({ color: '#f1eee8', roughness: 0.6 }),
      new T.MeshStandardMaterial({ color: '#f1eee8', roughness: 0.6 }), new T.MeshStandardMaterial({ color: '#f1eee8', roughness: 0.6 }),
    ]);
    m.position.y = 0.044; m.castShadow = true;
    g.add(m);
    g.userData.top = 0.088;
    return g;
  }
  function setBox(obj) {
    if (box) props.remove(box);
    box = obj; props.add(box);
    layout();
  }
  setBox(plainBox());
  let boxUrl = '';
  function loadBox(url) {
    if (url === boxUrl) return;
    boxUrl = url;
    if (!url) { setBox(plainBox()); return; }
    new T.GLTFLoader().load(url, (gltf) => {
      if (url !== boxUrl) return;
      const root = gltf.scene;
      root.updateMatrixWorld(true);
      const bb = new T.Box3().setFromObject(root), size = bb.getSize(new T.Vector3());
      // A real pack is 5.6 cm wide; stand it upright on the table.
      const s = 0.056 / Math.max(1e-6, size.x);
      const g = new T.Group();
      root.scale.multiplyScalar(s);
      root.updateMatrixWorld(true);
      const bb2 = new T.Box3().setFromObject(root), c = bb2.getCenter(new T.Vector3());
      root.position.sub(new T.Vector3(c.x, bb2.min.y, c.z));
      root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      g.add(root);
      g.userData.top = bb2.max.y - bb2.min.y;
      setBox(g);
    }, undefined, () => setBox(plainBox()));
  }

  function layout() {
    if (!spot.seat) return;
    box.position.copy(spot.box);
    box.rotation.y = spot.seat.h + 0.35;
    ashtray.position.copy(spot.ash);
  }
  // On the coffee table, at the edge nearest the main seat: the box a little to
  // his left of centre, the ashtray to his right, both inside arm's reach.
  function place(seat, table) {
    spot.seat = seat;
    const rx = Math.cos(seat.h), rz = -Math.sin(seat.h);
    const inset = 0.055;
    const px = Math.min(table.x + table.w / 2 - inset, Math.max(table.x - table.w / 2 + inset, seat.x));
    const pz = Math.min(table.z + table.d / 2 - inset, Math.max(table.z - table.d / 2 + inset, seat.z));
    spot.box.set(px - rx * 0.02 + 0, table.y, pz - rz * 0.02);
    spot.ash.set(px + rx * 0.2, table.y, pz + rz * 0.2);
    layout();
    ikCache = null;
  }

  // ---------------------------------------------------------------- particles
  const puffTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.4, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
  })();
  function pool(n, color, blending) {
    const list = [];
    for (let k = 0; k < n; k++) {
      const m = new T.SpriteMaterial({ map: puffTex, color, transparent: true, opacity: 0, depthWrite: false, blending: blending || T.NormalBlending });
      const sp = new T.Sprite(m); sp.visible = false; room.add(sp);
      list.push({ sp, life: 0, max: 1, v: new T.Vector3(), size0: 0.01, size1: 0.05, a: 0.3, g: 0 });
    }
    return list;
  }
  const smokeP = pool(90, '#d8d4ce');
  const ashP = pool(18, '#6d6964');
  function emit(list, pos, vel, life, size0, size1, alpha, g = 0) {
    let p = list.find((q) => q.life <= 0);
    if (!p) p = list.reduce((a, b) => (a.life < b.life ? a : b));
    p.sp.position.copy(pos); p.v.copy(vel); p.life = life; p.max = life; p.size0 = size0; p.size1 = size1; p.a = alpha; p.g = g;
    p.sp.visible = true;
  }
  function stepParticles(list, dt, t) {
    for (const p of list) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.sp.visible = false; continue; }
      const k = 1 - p.life / p.max;
      // Smoke curls as it rises and slows; ash just falls.
      p.v.y -= p.g * dt;
      if (!p.g) { p.v.multiplyScalar(Math.exp(-dt * 1.2)); p.v.y += dt * 0.05; p.v.x += Math.sin(t * 2.3 + p.max * 9) * dt * 0.02; p.v.z += Math.cos(t * 1.9 + p.max * 7) * dt * 0.02; }
      p.sp.position.addScaledVector(p.v, dt);
      const s = lerp(p.size0, p.size1, Math.sqrt(k));
      p.sp.scale.set(s, s, s);
      p.sp.material.opacity = p.a * sm(0, 0.12, k) * (1 - sm(0.45, 1, k));
      if (p.g && p.sp.position.y < spot.ash.y + 0.013) { p.life = 0; p.sp.visible = false; }
    }
  }
  // The lighter's flame.
  const flame = new T.Sprite(new T.SpriteMaterial({ map: puffTex, color: new T.Color(1.6, 0.9, 0.35), transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 }));
  flame.visible = false; room.add(flame);
  const flameLight = new T.PointLight('#ffb15c', 0, 1.2, 2); room.add(flameLight);

  // ---------------------------------------------------------------- state
  const S = { state: 'box', t: 0, lit: 0, nextDrag: 6, drag: -1, bright: 0, held: 0, release: null, ikHand: null };
  let ikCache = null;
  const busy = () => S.state !== 'box';
  function set(state) { S.state = state; S.t = 0; env.changed?.(); }

  function start() {
    if (busy() || !env.canSmoke()) return false;
    ikCache = env.solveAll(spot);
    S.ashQueued = false; S.lit = 0; S.drag = -1; S.nextDrag = 7 + Math.random() * 5; S.bright = 0; S.held = 0;
    setBurn(0);
    set('pickup');
    return true;
  }
  // He can put it out whenever he likes, not only once it has burned down.
  function ash() {
    if (S.state !== 'finished' && S.state !== 'smoking') return false;
    // Mid-drag, he finishes the drag first, then puts it out.
    if (S.state === 'smoking' && S.drag >= 0) { S.ashQueued = true; env.changed?.(); return true; }
    set('ashing');
    return true;
  }
  const remaining = () => Math.max(0, CIGARETTE_SECONDS - S.lit);

  // Arm targets for this moment: weights for reaching the box, the mouth, the
  // ashtray, and lifting the lighter.
  function weights() {
    const t = S.t, w = { box: 0, mouth: 0, ash: 0, light: 0, rest: 0, tap: 0, lookAsh: 0 };
    if (S.state === 'pickup') { w.box = sm(0, 1.0, t) * (1 - sm(1.35, 2.3, t)); w.rest = sm(1.2, 2.3, t); }
    else if (S.state === 'lighting') { w.rest = 1; w.mouth = sm(0, 0.9, t) * (1 - sm(2.5, 3.2, t)); w.light = sm(0.15, 0.95, t) * (1 - sm(2.0, 2.6, t)); }
    else if (S.state === 'smoking' || S.state === 'finished') {
      w.rest = 1;
      if (S.drag >= 0) w.mouth = sm(0, 1.0, S.drag) * (1 - sm(2.3, 3.1, S.drag));
    } else if (S.state === 'ashing') {
      w.rest = 1 - sm(2.6, 3.5, t);
      w.ash = sm(0.3, 1.2, t) * (1 - sm(2.5, 3.4, t));
      w.lookAsh = sm(0, 0.6, t) * (1 - sm(2.8, 3.5, t));
      for (const tt of [1.4, 1.7, 2.0]) w.tap += Math.max(0, Math.sin(PI * (t - tt) / 0.18)) * (t > tt && t < tt + 0.18 ? 1 : 0);
    }
    return w;
  }

  // Override his arms (called after the room's own pose for this frame).
  function pose(P) {
    if (!busy() || !ikCache) return;
    const w = weights();
    const R = { f: P.armF.R, d: P.armD.R, el: P.elbow.R }, lean0 = P.lean;
    const mix = (to, k) => { if (!to || k <= 0) return; R.f = lerp(R.f, to.f, k); R.d = lerp(R.d, to.d, k); R.el = lerp(R.el, to.el, k); };
    // Resting: forearm up, the cigarette held loosely above his knee.
    mix({ f: 0.42, d: -0.72, el: 1.55 }, w.rest);
    mix(ikCache.box, w.box); mix(ikCache.mouth, w.mouth); mix(ikCache.ash, w.ash);
    R.f -= w.tap * 0.07;
    P.armF.R = R.f; P.armD.R = R.d; P.elbow.R = R.el;
    let lean = lean0, scoot = 0;
    for (const [k, sol] of [['box', ikCache.box], ['mouth', ikCache.mouth], ['ash', ikCache.ash]]) if (sol) { lean = lerp(lean, sol.lean, w[k]); scoot = lerp(scoot, sol.scoot || 0, w[k]); }
    P.lean = lean; P.scoot = scoot;
    if (ikCache.light && w.light > 0) { P.armF.L = lerp(P.armF.L, ikCache.light.f, w.light); P.armD.L = lerp(P.armD.L, ikCache.light.d, w.light); P.elbow.L = lerp(P.elbow.L, ikCache.light.el, w.light); }
    // Eyes on the cigarette as it comes up, on the ashtray when he puts it out.
    // Head dips and turns to meet the hand (part of the solve).
    for (const [k, sol] of [['mouth', ikCache.mouth]]) if (sol && w[k] > 0) { P.headPitch = lerp(P.headPitch, sol.hp || 0, w[k]); P.headYaw = lerp(P.headYaw, sol.hy || 0, w[k]); }
    if (w.lookAsh > 0) { P.headYaw = lerp(P.headYaw, ikCache.ashYaw || -0.35, w.lookAsh); P.headPitch = lerp(P.headPitch, 0.35, w.lookAsh); }
  }

  // Advance the sequence and place everything (after the character is posed).
  function update(dt, t) {
    if (S.freeze) dt = 0;
    S.t += dt;
    const a = env.anchors(v1, v2, v3, v4);
    if (S.state === 'pickup') {
      if (S.t >= 1.0 && S.held === 0) { S.held = 0.001; env.sfx?.('pick'); }
      if (S.t >= 2.4) set('lighting');
    } else if (S.state === 'lighting') {
      if (S.t >= 0.95 && S.t < 0.97) env.sfx?.('lighter');
      if (S.t >= 1.55 && S.lit === 0) { S.lit = 1e-6; }
      if (S.t >= 2.7 && S.t - dt < 2.7) exhale(a);
      if (S.t >= 3.2) set('smoking');
    } else if (S.state === 'smoking') {
      if (S.drag >= 0) {
        S.drag += dt;
        if (S.drag >= 3.0 && S.drag - dt < 3.0) exhale(a);
        if (S.drag >= 4.4) { S.drag = -1; S.nextDrag = 8 + Math.random() * 8; if (S.ashQueued) { S.ashQueued = false; set('ashing'); } }
      } else {
        S.nextDrag -= dt;
        if (S.nextDrag <= 0 && remaining() > 5) S.drag = 0;
      }
      if (S.state === 'smoking' && remaining() <= 0 && S.drag < 0) set('finished');
    } else if (S.state === 'ashing') {
      for (const tt of [1.4, 1.7, 2.0]) if (S.t >= tt && S.t - dt < tt) { tapAsh(); env.sfx?.('tap'); }
      if (S.t >= 2.4 && !S.release) {
        // Let go: the cigarette drops into a slot in the tray.
        S.release = { t: 0, p0: cig.position.clone(), q0: cig.quaternion.clone() };
      }
      if (S.t >= 3.6) {
        S.release = null; cig.visible = false; S.held = 0;
        ashtrayState.butts++;
        const b = butts[(ashtrayState.butts - 1) % butts.length];
        const sl = b.userData.slot; b.position.set(sl.x, 0.014, sl.z); b.rotation.set(0, sl.ry, sl.rz); b.visible = true;
        set('box');
      }
    }
    // Lit time: real seconds, only while lit and not paused (the room passes dt = 0 when paused).
    const lit = S.lit > 0 && (S.state === 'lighting' || S.state === 'smoking' || S.state === 'finished' || (S.state === 'ashing' && S.t < 2.05));
    if (lit && S.state !== 'finished' && S.state !== 'ashing') S.lit = Math.min(CIGARETTE_SECONDS, S.lit + dt);
    const burn = S.lit / CIGARETTE_SECONDS;
    setBurn(burn);

    // Ember: brighter on a drag, dim once it's done, out once ashed.
    const dragging = (S.state === 'lighting' && S.t > 1.55 && S.t < 2.3) || (S.drag > 1.0 && S.drag < 2.2);
    const target = !lit ? 0 : S.state === 'finished' ? 0.25 : dragging ? 2.6 : 0.9;
    S.bright += (target - S.bright) * (1 - Math.exp(-dt * (target > S.bright ? 6 : 2.5)));
    if (S.state === 'ashing' && S.t > 2.05) S.bright *= Math.exp(-dt * 12);
    emberM.emissiveIntensity = S.bright * (0.9 + 0.1 * Math.sin(t * 23));
    ember.scale.setScalar(0.85 + 0.15 * Math.min(1, S.bright));
    glow.intensity = S.bright * 0.35;
    ashTip.visible = lit || (S.state === 'ashing');

    // Where the cigarette is: in his fingers, pointing out of them (and away
    // from his face while it's at his lips).
    if (S.held > 0 && a && !S.release) {
      cig.visible = true;
      const hand = a.handR, fore = a.foreR, fwd = a.fwd;
      const axis = v1.copy(hand).sub(fore).normalize();
      const w = weights();
      axis.lerp(fwd, 0.55 + 0.4 * w.mouth).normalize();
      if (S.held < 1) S.held = Math.min(1, S.held + dt / 0.25);
      const from = v2.copy(spot.box).add(v4.set(0, (box?.userData.top || 0.09) - 0.01, 0));
      cig.position.lerpVectors(from, hand, sm(0, 1, S.held));
      cig.quaternion.setFromUnitVectors(up, axis);
    } else if (S.release) {
      S.release.t = Math.min(1, S.release.t + dt / 0.35);
      const tgt = v2.copy(spot.ash).add(v4.set(0.015, 0.016, 0.01));
      cig.position.lerpVectors(S.release.p0, tgt, S.release.t);
      cig.quaternion.slerpQuaternions(S.release.q0, new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), PI / 2 - 0.1), S.release.t);
    } else if (S.state === 'box' || S.state === 'pickup') cig.visible = false;

    // Lighter flame between his left hand and the tip.
    const flameOn = S.state === 'lighting' && S.t > 0.95 && S.t < 1.9 && a;
    flame.visible = !!flameOn;
    if (flameOn) {
      const tip = cig.localToWorld(v3.set(0, LEN, 0));
      flame.position.lerpVectors(a.handL, tip, 0.65).y += 0.012;
      const f = 0.016 + 0.003 * Math.sin(t * 31);
      flame.scale.set(f * 0.55, f, f);
      flame.material.opacity = 0.55;
    }
    flameLight.intensity = flameOn ? 0.18 + 0.06 * Math.sin(t * 27) : 0;
    if (flameOn) flameLight.position.copy(flame.position);

    // A thin wisp off the ember while it burns.
    if (lit && S.bright > 0.2 && cig.visible) {
      S.wisp = (S.wisp || 0) + dt * (dragging ? 3 : 7);
      while (S.wisp > 1) {
        S.wisp -= 1;
        const tip = cig.localToWorld(v3.set(0, FILTER + PAPER * lerp(1, 0.3, burn) + 0.004, 0));
        emit(smokeP, tip, v4.set((Math.random() - 0.5) * 0.01, 0.06 + Math.random() * 0.03, (Math.random() - 0.5) * 0.01), 2.6, 0.008, 0.05, 0.22);
      }
    }
    // Ash builds up in the tray as he taps it.
    ashBed.visible = ashtrayState.ash > 0;
    ashBed.scale.setScalar(Math.min(1, 0.35 + ashtrayState.ash * 0.12));
    stepParticles(smokeP, dt, t);
    stepParticles(ashP, dt, t);
  }
  function exhale(a) {
    if (!a) return;
    env.sfx?.('exhale');
    // A slow stream out over the table: emitted over about a second from his mouth.
    let n = 0;
    const tick = () => {
      if (n++ > 22) return;
      const m = env.anchors(v1, v2, v3, v4);
      if (m) {
        const vel = new T.Vector3().copy(m.fwd).multiplyScalar(0.28 + Math.random() * 0.12).add(new T.Vector3((Math.random() - 0.5) * 0.05, 0.03 + Math.random() * 0.04, (Math.random() - 0.5) * 0.05));
        emit(smokeP, m.mouth.clone().addScaledVector(m.fwd, 0.03), vel, 2.2 + Math.random(), 0.02, 0.16, 0.3);
      }
      setTimeout(tick, 45);
    };
    tick();
  }
  function tapAsh() {
    const tip = cig.localToWorld(v3.set(0, FILTER + PAPER * 0.3 + 0.004, 0));
    for (let k = 0; k < 4; k++) emit(ashP, tip, v4.set((Math.random() - 0.5) * 0.03, -0.02, (Math.random() - 0.5) * 0.03), 0.8, 0.006, 0.004, 0.95, 1.6);
    ashtrayState.ash++;
  }

  return {
    place, start, ash, update, pose, loadBox,
    get state() { return S.state; },
    get busy() { return busy(); },
    get active() { return busy(); },
    get finished() { return S.state === 'finished'; },
    get ashQueued() { return !!S.ashQueued; },
    get remaining() { return remaining(); },
    get ashtray() { return ashtrayState.butts ? 'butts' : ashtrayState.ash ? 'ash' : 'empty'; },
    spot,
    // For tests: skip ahead in the burn (the timer still only moves by elapsed time).
    _debugSet(st, tt, drag) { S.state = st; S.t = tt; if (drag != null) S.drag = drag; S.freeze = true; },
    _debugAge(sec) { if (S.lit > 0) S.lit = Math.min(CIGARETTE_SECONDS, S.lit + sec); },
  };
}
