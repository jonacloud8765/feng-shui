// The woman: after Trevor's can has come to rest, she walks in through the
// doorway on the right, picks it up wherever it ended up, and walks back out.
//
// Her model is a single static scan (no skeleton, no animations, no root bone),
// standing with her hands raised, with a doorway baked into the same file. Only
// her figure is used. A skeleton is fitted to her scan here (hips, spine, head,
// thighs, shins, feet, upper arms, forearms, wrists, fingers), every vertex is
// skinned to it, and she's posed procedurally: bones turned toward target
// directions, arms placed by two-bone IK. None of it is motion capture.
//
// The pickup uses three more scans (V16, V13, V34) only as pose references:
// their joint angles were measured off the scans (side view, see POSES) and are
// applied to her own skeleton, at her own proportions. There are two separate
// sequences, never mixed:
//   kneel: stand -> kneel down -> V16 (upright on both knees) -> V13 (leaning
//          forward on her knees) -> reach, grip, lift -> V16 -> up -> stand
//   bend:  stand -> V34 (standing bend at hips and knees) -> reach, grip, lift
//          -> straighten -> stand
// Which one: CONFIG.pickup ('auto' picks kneel for a can on the floor with room
// around it, bend for a raised can or a cramped spot).
//
// States: away -> enter -> position -> pickup (phases below) -> leave -> away.

export const CONFIG = { pickup: 'auto' }; // 'auto' | 'kneel' | 'bend'

const sm = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const D2R = Math.PI / 180;

// Her joints in the scan's own units (she's 100 tall, facing +z, her left is +x).
const J = {
  hips: [0.8, 52, 18.2], spine: [0.8, 56, 18], neck: [1, 86, 17.5], headTop: [1.3, 100, 20],
  R: { shoulder: [-10.5, 80, 15], hip: [-5, 49.5, 18.5], knee: [-1.5, 29, 27], ankle: [-0.7, 5.5, 18.5], toe: [-0.6, 0.8, 27.5],
    elbow: [-13.3, 62.5, 13], wrist: [-19, 75.5, 21], knuckle: [-20.8, 81.5, 25.5], tip: [-21.5, 87, 25.5],
    // Where a held can's centre sits: just off her palm (her palms face inward, thumb forward).
    grip: [-17.4, 79.5, 25] },
  L: { shoulder: [11.2, 80, 15], hip: [6, 49.5, 17.5], knee: [4, 29, 19.5], ankle: [2.2, 5.5, 16.5], toe: [3.2, 0.8, 26.5],
    elbow: [13.5, 62.5, 12.5], wrist: [20, 74.5, 16.5], knuckle: [21.8, 81, 18], tip: [22.6, 87, 17.7],
    grip: [20.4, 79, 18] },
};
const HEIGHT = 1.66;

// Body poses, as angles in her side plane (degrees). Thigh and shin: from
// straight down, + swinging forward. Foot: 0 flat, + toes pointing back along
// the floor (kneeling), - up on the balls of the feet. Pelvis and spine: forward
// pitch (they add up to the torso's lean). Head: extra nod.
// V16, V13, V34 were measured off the reference scans' side views
// (hip -> knee -> ankle, hip -> neck, neck -> head); their arms are not copied
// (hands behind the head, hand flat on the floor): her free hand rests on her
// thigh or hangs, and her right arm is driven by IK to the can.
const POSES = {
  STAND: { tL: 0, sL: 0, tR: 0, sR: 0, foot: 0, pelvis: 0, spine: 0, head: 0, spread: 0.04 },
  // Going down to her knees / pushing back up: a deep crouch, heels up.
  CROUCH: { tL: 78, sL: -42, tR: 70, sR: -50, foot: -40, pelvis: 12, spine: 16, head: 6, spread: 0.1 },
  // V16: on both knees, sitting up, thighs ~60 deg forward, shins flat behind, torso ~6 deg lean.
  V16: { tL: 60, sL: -86, tR: 60, sR: -86, foot: 80, pelvis: 2, spine: 4, head: 2, spread: 0.08 },
  // V13: still on both knees, hips up off the heels (thighs ~55 deg), torso leaning ~35 deg, head down.
  V13: { tL: 55, sL: -87, tR: 52, sR: -87, foot: 82, pelvis: 13, spine: 22, head: 16, spread: 0.1 },
  // V34: standing, legs nearly straight (feet split a little), folded ~109 deg at the hips, head hanging.
  V34: { tL: 4, sL: -2, tR: -7, sR: -12, foot: 0, pelvis: 62, spine: 47, head: 22, spread: 0.07 },
};
const KEYS = Object.keys(POSES.STAND);
function mix(a, b, t) { const o = {}; for (const k of KEYS) o[k] = lerp(a[k], b[k], t); return o; }

// The two sequences: keyframed poses (eased between), and when each part of the
// pickup happens. reach: the arm goes out; grip: fingers close; attach: the can
// is in her hand from here; lift: the can comes up to carry height.
const SEQ = {
  kneel: {
    keys: [[0, 'STAND'], [0.85, 'CROUCH'], [1.6, 'V16'], [2.5, 'V13'], [4.1, 'V13'], [4.9, 'V16'], [5.7, 'CROUCH'], [6.6, 'STAND']],
    phases: [[0, 'kneel-prep'], [1.6, 'V16'], [2.2, 'V13'], [2.6, 'reach'], [3.25, 'grip'], [3.55, 'lift'], [4.1, 'recover']],
    reach: [2.1, 3.2], grip: [3.1, 3.45], attach: 3.4, lift: [3.55, 4.4], end: 6.6, ref: 'V13',
  },
  bend: {
    keys: [[0, 'STAND'], [1.3, 'V34'], [2.7, 'V34'], [3.8, 'STAND']],
    phases: [[0, 'V34'], [1.0, 'reach'], [1.6, 'grip'], [1.95, 'lift'], [2.7, 'recover']],
    reach: [0.6, 1.55], grip: [1.45, 1.8], attach: 1.75, lift: [1.95, 2.8], end: 3.8, ref: 'V34',
  },
};

export function createGuest(env) {
  const { T, room } = env;
  const PI = Math.PI;
  const UP = new T.Vector3(0, 1, 0);
  const v1 = new T.Vector3(), v2 = new T.Vector3(), v3 = new T.Vector3(), v4 = new T.Vector3();
  const q1 = new T.Quaternion(), q2 = new T.Quaternion(), q3 = new T.Quaternion();
  const pw = new T.Quaternion(), bw = new T.Quaternion();

  const holder = new T.Group();
  holder.visible = false;
  room.add(holder);
  let mesh = null, B = null, rest = null;
  const LEN = {};

  // ---------------------------------------------------------------- rigging
  function load(url) {
    if (!url || load.url === url) return;
    load.url = url;
    new T.GLTFLoader().load(url, (gltf) => {
      gltf.scene.updateMatrixWorld(true);
      // Her figure only: the doorway that came in the same file is left out.
      let src = null;
      gltf.scene.traverse((o) => { if (o.isMesh && !src && !/door/i.test(o.name) && !/door/i.test(o.material?.name || '')) src = o; });
      if (!src) { env.error?.('Her model has no figure in it.'); return; }
      build(src);
    }, undefined, () => env.error?.('Her model couldn’t be loaded.'));
  }

  function build(src) {
    const g = src.geometry.clone();
    g.applyMatrix4(src.matrixWorld);
    const pos = g.attributes.position, n = pos.count;
    // Skin weights from body regions, blended softly across each joint.
    const idx = new Uint16Array(n * 4), wts = new Float32Array(n * 4);
    const BONES = ['hips', 'spine', 'head', 'thighR', 'shinR', 'footR', 'thighL', 'shinL', 'footL',
      'upperR', 'foreR', 'wristR', 'fingR', 'upperL', 'foreL', 'wristL', 'fingL'];
    const bi = Object.fromEntries(BONES.map((b, i) => [b, i]));
    const seg = (q, a, b) => { // distance from q to the segment a-b, and how far along it
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], aq = [q.x - a[0], q.y - a[1], q.z - a[2]];
      const t = clamp((ab[0] * aq[0] + ab[1] * aq[1] + ab[2] * aq[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2), 0, 1);
      return [Math.hypot(aq[0] - ab[0] * t, aq[1] - ab[1] * t, aq[2] - ab[2] * t), t];
    };
    const p = new T.Vector3();
    for (let i = 0; i < n; i++) {
      p.fromBufferAttribute(pos, i);
      const { x, y } = p;
      const ax = Math.abs(x - 0.4);
      const w = {};
      const add = (b, v) => { if (v > 1e-4) w[b] = (w[b] || 0) + v; };
      // Arms: out past the torso, from the elbow up to the shoulder (her hands
      // are raised, so the forearm runs up beside the upper arm).
      const arm = sm(9.6, 11.6, ax) * sm(59.5, 63.5, y) * (1 - sm(79, 83, y) * (1 - sm(15, 17, ax)));
      const legs = 1 - sm(43, 52, y);
      const up = sm(50, 58, y);
      const head = sm(84, 88.5, y) * (1 - arm);
      const k = x < 1.0 ? 'R' : 'L';
      const knee = k === 'R' ? 29 : 29.5;
      const shin = sm(knee + 2, knee - 2, y), foot = sm(8, 3.5, y);
      const body = (1 - arm);
      add('hips', body * (1 - legs) * (1 - up));
      add('spine', body * up * (1 - head));
      add('head', body * up * head);
      add('thigh' + k, body * legs * (1 - shin));
      add('shin' + k, body * legs * shin * (1 - foot));
      add('foot' + k, body * legs * shin * foot);
      if (arm > 1e-4) {
        // Which arm bone: nearest segment wins, softly.
        const s = x < 0.4 ? 'R' : 'L', A = J[s];
        const [dU] = seg(p, A.shoulder, A.elbow), [dF] = seg(p, A.elbow, A.wrist), [dH, tH] = seg(p, A.wrist, A.tip);
        const m = Math.min(dU, dF, dH);
        const eU = Math.exp(-(dU - m) / 0.7), eF = Math.exp(-(dF - m) / 0.7), eH = Math.exp(-(dH - m) / 0.7), es = eU + eF + eH;
        const kn = seg({ x: A.knuckle[0], y: A.knuckle[1], z: A.knuckle[2] }, A.wrist, A.tip)[1];
        const fing = sm(kn - 0.07, kn + 0.07, tH);
        add('upper' + s, arm * eU / es);
        add('fore' + s, arm * eF / es);
        add('wrist' + s, arm * eH / es * (1 - fing));
        add('fing' + s, arm * eH / es * fing);
      }
      const top = Object.entries(w).sort((a, b) => b[1] - a[1]).slice(0, 4);
      const sum = top.reduce((s, e) => s + e[1], 0) || 1;
      top.forEach(([b, v], j) => { idx[i * 4 + j] = bi[b]; wts[i * 4 + j] = v / sum; });
      if (!top.length) { idx[i * 4] = bi.hips; wts[i * 4] = 1; }
    }
    g.setAttribute('skinIndex', new T.Uint16BufferAttribute(idx, 4));
    g.setAttribute('skinWeight', new T.Float32BufferAttribute(wts, 4));

    // Bones at her joints (bind pose: no rotations, just offsets).
    const V = (a) => new T.Vector3(a[0], a[1], a[2]);
    const mk = (name, at, parent, parentAt) => { const b = new T.Bone(); b.name = name; b.position.copy(V(at)).sub(parentAt ? V(parentAt) : new T.Vector3()); if (parent) parent.add(b); return b; };
    B = {};
    B.hips = mk('hips', J.hips);
    B.spine = mk('spine', J.spine, B.hips, J.hips);
    B.head = mk('head', J.neck, B.spine, J.spine);
    B.headTop = mk('headTop', J.headTop, B.head, J.neck);
    const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * HEIGHT / 100;
    for (const k of ['R', 'L']) {
      const s = J[k];
      B['thigh' + k] = mk('thigh' + k, s.hip, B.hips, J.hips);
      B['shin' + k] = mk('shin' + k, s.knee, B['thigh' + k], s.hip);
      B['foot' + k] = mk('foot' + k, s.ankle, B['shin' + k], s.knee);
      B['toe' + k] = mk('toe' + k, s.toe, B['foot' + k], s.ankle);
      B['upper' + k] = mk('upper' + k, s.shoulder, B.spine, J.spine);
      B['fore' + k] = mk('fore' + k, s.elbow, B['upper' + k], s.shoulder);
      B['wrist' + k] = mk('wrist' + k, s.wrist, B['fore' + k], s.elbow);
      B['fing' + k] = mk('fing' + k, s.knuckle, B['wrist' + k], s.wrist);
      B['tip' + k] = mk('tip' + k, s.tip, B['fing' + k], s.knuckle);
      B['grip' + k] = mk('grip' + k, s.grip, B['wrist' + k], s.wrist);
      LEN[k] = { a: d(s.shoulder, s.elbow), b: d(s.elbow, s.wrist) };
    }
    const bones = BONES.map((b) => B[b]);
    for (const extra of ['headTop', 'toeR', 'toeL', 'tipR', 'tipL', 'gripR', 'gripL']) bones.push(B[extra]);
    mesh = new T.SkinnedMesh(g, src.material);
    mesh.add(B.hips);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    // Scale to her height; her feet at the holder's origin, centred.
    const s = HEIGHT / 100;
    const inner = new T.Group();
    inner.scale.setScalar(s);
    mesh.position.set(-J.hips[0], 0, -J.hips[2]);
    inner.add(mesh);
    holder.add(inner);
    holder.updateMatrixWorld(true);
    mesh.bind(new T.Skeleton(bones));
    rest = new Map(bones.map((b) => [b, b.quaternion.clone()]));
    // Standing, where her feet meet the floor (the reference every pose is grounded against).
    groundRef = null;
    const save = { x: S.x, z: S.z, h: S.h };
    Object.assign(S, { x: 0, z: 0, h: 0 });
    posePlain(POSES.STAND, 0, 0);
    groundRef = { low: lowPoint(), mid: ankleMid(new T.Vector3()) };
    Object.assign(S, save);
  }

  // ---------------------------------------------------------------- state
  const S = { state: 'away', t: 0, x: 0, z: 0, h: 0, speed: 0, phase: 0, stride: 0, path: [], wait: -1, can: null,
    mode: null, seq: null, plan: null, carry: 0, blockT: 0, pickT: 0, phaseName: '' };
  let groundRef = null;
  const doorZ = () => (env.door.z0 + env.door.z1) / 2;
  const hall = () => ({ x: env.door.x + 1.1, z: doorZ() });
  const doorIn = () => ({ x: env.door.x + 0.3, z: doorZ() });
  const ready = () => !!mesh;

  // Called when the can has come to rest: she comes for it a little later.
  // Until she takes it, the can is left exactly where it stopped.
  function canSettled() { if (S.state === 'away' && S.wait < 0) S.wait = 5 + Math.random() * 6; }
  function come(force) {
    if (!ready() || S.state !== 'away' || env.canState() !== 'rest' || !env.canCome()) return false;
    const h = hall();
    Object.assign(S, { state: 'enter', t: 0, x: h.x, z: h.z, h: -PI / 2, speed: 0, wait: -1, carry: 0, can: null, pickT: 0, phaseName: 'entering' });
    S.why = {};
    S.plan = planPickup(force || env.pickupMode?.() || CONFIG.pickup);
    S.mode = S.plan.mode; S.seq = SEQ[S.mode];
    const p = env.findPath(doorIn(), S.plan.root) || [doorIn(), S.plan.root];
    S.path = [doorIn(), ...p.slice(1), S.plan.root];
    holder.visible = true;
    return true;
  }

  // ---------------------------------------------------------------- planning
  // Where her right shoulder is in a pose, relative to her feet (f forward, l left, y up).
  function shoulderIn(P) {
    const save = { x: S.x, z: S.z, h: S.h };
    Object.assign(S, { x: 0, z: 0, h: 0 });
    posePlain(P, 0, 0); ground();
    const s = B.upperR.getWorldPosition(new T.Vector3());
    const kn = [B.shinL.getWorldPosition(new T.Vector3()), B.shinR.getWorldPosition(new T.Vector3())];
    const toes = [B.toeL.getWorldPosition(new T.Vector3()), B.toeR.getWorldPosition(new T.Vector3())];
    Object.assign(S, save);
    return { f: s.z, l: s.x, y: s.y, knees: kn.map((v) => ({ f: v.z, l: v.x })), toes: toes.map((v) => ({ f: v.z, l: v.x })) };
  }
  const reachLen = () => LEN.R.a + LEN.R.b + 0.1; // shoulder to the middle of her palm
  // Pick the sequence and a spot: facing so the can is ahead of her right
  // shoulder at a comfortable reach, her feet (and knees) on open floor, nothing
  // between her hand and the can, nearest the way she came in.
  function planPickup(mode) {
    const c = env.canPos(new T.Vector3());
    const P = c.clone(); // her palm closes on the can's centre
    const fp = env.feet?.(new T.Vector3());
    const raised = c.y > 0.12;
    const from = doorIn();
    const toward = Math.atan2(c.x - from.x, c.z - from.z);
    const why = (S.why ||= {});
    // One pose (its right shoulder o): try headings around the can, at reach distances
    // from comfortable out to her full reach, for a spot that's clear.
    const search = (m, pose, depth, lean, fracs) => {
      const o = shoulderIn(pose);
      const dy = o.y - P.y, R = reachLen() * (m === 'kneel' ? 0.96 : 0.92);
      const maxH = Math.sqrt(Math.max(0, R * R - dy * dy));
      const w = (why[m] ||= { free: 0, you: 0, solid: 0, tries: 0 });
      for (const fr of fracs) {
        const hd = maxH * fr;
        for (let i = 0; i < 48; i++) {
          w.tries++;
          const h = toward + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (PI / 24);
          const F = [Math.sin(h), Math.cos(h)], L = [Math.cos(h), -Math.sin(h)];
          const at = (f, l) => ({ x: F[0] * f + L[0] * l, z: F[1] * f + L[1] * l });
          const so = at(o.f + hd, o.l);
          const root = { x: P.x - so.x, z: P.z - so.z };
          if (env.free && !env.free(root.x, root.z)) { w.free++; continue; }
          if (fp && Math.hypot(fp.x - root.x, fp.z - root.z) < 0.55) { w.you++; continue; }
          // Knees and toes on bare floor; nothing between her shoulder and the can.
          const pts = [...o.knees, ...o.toes].map((k) => { const d = at(k.f, k.l); return { x: root.x + d.x, z: root.z + d.z, y: 0.05 }; });
          const sh = at(o.f, o.l), S3 = { x: root.x + sh.x, z: root.z + sh.z, y: o.y };
          for (const f of [0.25, 0.5, 0.75, 0.9]) pts.push({ x: lerp(S3.x, P.x, f), z: lerp(S3.z, P.z, f), y: lerp(S3.y, P.y + 0.03, f) });
          if (env.solid && pts.some((q) => env.solid(q.x, q.y, q.z))) { w.solid++; continue; }
          return { mode: m, root, h, depth, lean, P };
        }
      }
      return null;
    };
    const tryMode = (m) => {
      if (m === 'kneel') {
        if (raised) return null; // kneeling is for a can on the floor
        // On her knees: lean further over at the waist as she reaches, as far as the floor needs.
        let lo = 0, hi = 50;
        for (let i = 0; i < 10; i++) { const e = (lo + hi) / 2; if (shoulderIn(leanPose(POSES.V13, e)).y - P.y > reachLen() * 0.95) lo = e; else hi = e; }
        return search('kneel', leanPose(POSES.V13, hi), 1, hi, [0.85, 1]);
      }
      // Bending: only as deep as the can's height needs (softening the knees for the floor),
      // deeper if that's what it takes to reach it from clear floor.
      let lo = 0.3, hi = 2.2;
      for (let i = 0; i < 12; i++) { const u = (lo + hi) / 2; if (shoulderIn(bendPose(u)).y - P.y > reachLen() * 0.86) lo = u; else hi = u; }
      for (const u of [hi, hi + 0.2, hi + 0.4, hi + 0.6]) {
        if (u > 2.2) break;
        const r = search('bend', bendPose(u), u, 0, [0.85, 1]);
        if (r) return r;
      }
      return null;
    };
    let plan = null;
    if (mode === 'kneel' || mode === 'bend') plan = tryMode(mode);
    else if (!raised) plan = tryMode('kneel');
    plan ||= tryMode('bend') || tryMode('kneel');
    if (!plan) {
      // Nowhere she can reach it from cleanly: bend from the nearest open floor.
      let best = null;
      for (let r = 0.4; r < 2 && !best; r += 0.05) for (let i = 0; i < 36 && !best; i++) {
        const a = toward + PI + i * PI / 18, x = c.x + Math.sin(a) * r, z = c.z + Math.cos(a) * r;
        if (!env.free || env.free(x, z)) best = { x, z };
      }
      best ||= { x: c.x - Math.sin(toward) * 0.5, z: c.z - Math.cos(toward) * 0.5 };
      plan = { mode: 'bend', root: best, h: Math.atan2(c.x - best.x, c.z - best.z) + 0.25, depth: 1.3, lean: 0, P };
    }
    S.spot = plan.root;
    return plan;
  }
  function leanPose(p, e) { return { ...p, spine: p.spine + e * 0.7, pelvis: p.pelvis + e * 0.3, head: p.head - e * 0.2 }; }
  function bendPose(u) {
    const d = Math.min(1, u), e = Math.max(0, u - 1);
    const p = mix(POSES.STAND, POSES.V34, d);
    // Past the reference bend, soften the knees rather than fold further.
    p.tL += 50 * e; p.sL -= 45 * e; p.tR += 50 * e; p.sR -= 45 * e; p.pelvis -= 12 * e; p.spine -= 6 * e;
    return p;
  }

  // ---------------------------------------------------------------- posing
  const frame = { L: new T.Vector3(), F: new T.Vector3() };
  function setFrame(h) { frame.F.set(Math.sin(h), 0, Math.cos(h)); frame.L.set(Math.cos(h), 0, -Math.sin(h)); }
  function bodyDir(d, out) { return out.copy(frame.L).multiplyScalar(d[0]).addScaledVector(UP, d[1]).addScaledVector(frame.F, d[2]).normalize(); }
  function turnWorld(bone, q) {
    bone.getWorldQuaternion(bw);
    bone.parent.getWorldQuaternion(pw);
    bone.quaternion.copy(pw.invert().multiply(q3.copy(q).multiply(bw)));
    bone.updateMatrixWorld(true);
  }
  function aim(bone, child, dirW) {
    bone.updateMatrixWorld(true);
    const a = bone.getWorldPosition(v1), b = child.getWorldPosition(v2);
    q1.setFromUnitVectors(v3.subVectors(b, a).normalize(), dirW);
    turnWorld(bone, q1);
  }
  const sag = (deg, side, spread) => [side * spread, -Math.cos(deg * D2R), Math.sin(deg * D2R)];
  // Body and legs for pose P, with a walking stride w at phase ph on top.
  function posePlain(P, w, ph) {
    for (const [b, q] of rest) b.quaternion.copy(q);
    holder.position.set(S.x, 0, S.z);
    holder.rotation.set(0, S.h, 0);
    holder.updateMatrixWorld(true);
    setFrame(S.h);
    q1.setFromAxisAngle(frame.L, P.pelvis * D2R); turnWorld(B.hips, q1);
    q1.setFromAxisAngle(frame.L, P.spine * D2R + 0.05 * w); turnWorld(B.spine, q1);
    const a = 0.36 * w * Math.sin(ph);
    for (const [kk, sgn] of [['L', 1], ['R', -1]]) {
      const lp = ph + (sgn < 0 ? PI : 0);
      const sw = sgn * a / D2R;
      const kn = w * (0.06 + 0.55 * Math.max(0, Math.cos(lp))) / D2R;
      aim(B['thigh' + kk], B['shin' + kk], bodyDir(sag(P['t' + kk] + sw, sgn, P.spread), v4).clone());
      aim(B['shin' + kk], B['foot' + kk], bodyDir(sag(P['s' + kk] + sw - kn, sgn, P.spread * 0.4), v4).clone());
      // Foot: flat (toes forward), up on the toes (-), or laid back along the floor (+).
      const f = P.foot * D2R;
      const fd = P.foot >= 0 ? [0, -0.22 * Math.cos(f) - 0.9 * Math.sin(f), 0.97 * Math.cos(f) - 0.45 * Math.sin(f)]
        : [0, -0.22 + Math.sin(-f) * 0.9, 0.97 * Math.cos(-f)];
      aim(B['foot' + kk], B['toe' + kk], bodyDir(fd, v4).clone());
    }
    q1.setFromAxisAngle(frame.L, P.head * D2R); turnWorld(B.head, q1);
  }
  // The lowest point touching the floor: heels / toes / kneecaps.
  function lowPoint() {
    let y = Infinity;
    for (const kk of ['L', 'R']) {
      y = Math.min(y, B['toe' + kk].getWorldPosition(v1).y - 0.012);
      y = Math.min(y, B['foot' + kk].getWorldPosition(v1).y - 0.085);
      y = Math.min(y, B['shin' + kk].getWorldPosition(v1).y - 0.055);
    }
    return y;
  }
  function ankleMid(out) {
    B.footL.getWorldPosition(v1); B.footR.getWorldPosition(v2);
    return out.addVectors(v1, v2).multiplyScalar(0.5);
  }
  // Put her on the floor: lowest contact at floor level, and her feet kept where
  // they were standing (so nothing slides as she kneels or bends).
  function ground() {
    if (!groundRef) return;
    const dy = groundRef.low - lowPoint();
    const m = ankleMid(new T.Vector3());
    // Standing feet position for this spot and heading.
    setFrame(S.h);
    const want = new T.Vector3(S.x, 0, S.z).addScaledVector(frame.L, groundRef.mid.x).addScaledVector(frame.F, groundRef.mid.z);
    holder.position.set(S.x + (want.x - m.x), dy, S.z + (want.z - m.z));
    holder.updateMatrixWorld(true);
  }

  // Two-bone arm: shoulder -> elbow -> wrist, the grip point brought to P,
  // the elbow bending back and out, the palm turned to face 'palm' (world).
  const AS = new T.Vector3(), AE = new T.Vector3(), AU = new T.Vector3(), AN = new T.Vector3(), AT = new T.Vector3(), AW = new T.Vector3();
  const PALM = { R: new T.Vector3(1, 0, 0), L: new T.Vector3(-1, 0, 0) };
  function armTo(kk, sgn, P, palm, curl) {
    const up = B['upper' + kk], fo = B['fore' + kk], wr = B['wrist' + kk], { a, b } = LEN[kk];
    AT.copy(P);
    for (let it = 0; it < 3; it++) {
      for (const bn of [up, fo, wr]) bn.quaternion.copy(rest.get(bn));
      up.updateMatrixWorld(true);
      up.getWorldPosition(AS);
      AU.subVectors(AT, AS);
      const d = clamp(AU.length(), Math.abs(a - b) + 0.02, (a + b) * 0.998);
      AU.normalize();
      const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
      bodyDir([0.45 * sgn, -0.25, -0.85], AN);
      AN.addScaledVector(AU, -AN.dot(AU));
      if (AN.lengthSq() < 1e-6) AN.copy(frame.F).multiplyScalar(-1);
      AN.normalize();
      AE.copy(AS).addScaledVector(AU, a * cosA).addScaledVector(AN, a * sinA);
      aim(up, fo, v3.subVectors(AE, AS).normalize().clone());
      AW.copy(AS).addScaledVector(AU, d);
      aim(fo, wr, v3.subVectors(AW, fo.getWorldPosition(v2)).normalize().clone());
      // Turn the wrist about the forearm so the palm faces the right way.
      const axis = v3.subVectors(wr.getWorldPosition(v1), fo.getWorldPosition(v2)).normalize().clone();
      wr.getWorldQuaternion(q2);
      const nW = PALM[kk].clone().applyQuaternion(q2);
      nW.addScaledVector(axis, -nW.dot(axis)).normalize();
      const want = palm.clone().addScaledVector(axis, -palm.dot(axis));
      if (want.lengthSq() > 1e-4 && nW.lengthSq() > 1e-4) {
        want.normalize();
        const ang = clamp(Math.atan2(axis.dot(v4.crossVectors(nW, want)), nW.dot(want)), -1.9, 1.9);
        q1.setFromAxisAngle(axis, ang); turnWorld(wr, q1);
      }
      // Fold the fingers toward the palm.
      B['fing' + kk].quaternion.copy(rest.get(B['fing' + kk]));
      q1.setFromAxisAngle(v4.set(0, 0, kk === 'R' ? -1 : 1), curl);
      B['fing' + kk].quaternion.multiply(q1);
      B['fing' + kk].updateMatrixWorld(true);
      // Correct for the grip point sitting off the wrist.
      const g = B['grip' + kk].getWorldPosition(v1);
      AT.add(v2.subVectors(P, g));
    }
  }

  function seqPose(seq, t) {
    const k = seq.keys;
    if (t <= k[0][0]) return { ...POSES[k[0][1]] };
    for (let i = 1; i < k.length; i++) {
      if (t <= k[i][0]) {
        const u = sm(k[i - 1][0], k[i][0], t);
        return mix(poseOf(k[i - 1][1]), poseOf(k[i][1]), u);
      }
    }
    return poseOf(k[k.length - 1][1]);
  }
  const poseOf = (name) => (name === 'V34' && S.plan ? bendPose(S.plan.depth) : POSES[name]);

  function pose() {
    // Body: walking on the standing pose, or the pickup sequence.
    let P = POSES.STAND;
    if (S.state === 'pickup') {
      P = seqPose(S.seq, S.pickT);
      if (S.plan.lean) P = leanPose(P, S.plan.lean * reachW(S.pickT));
      // Knees land one after the other, not both at once.
      if (S.mode === 'kneel') {
        const Pl = seqPose(S.seq, S.pickT + 0.12);
        P.tL = Pl.tL; P.sL = Pl.sL;
      }
    }
    const w = S.stride * (S.state === 'pickup' ? 0 : 1);
    posePlain(P, w, S.phase);
    ground();
    if (S.state !== 'pickup') holder.position.y -= 0.008 * w * Math.abs(Math.sin(S.phase));
    holder.updateMatrixWorld(true);
    setFrame(S.h);
    const swing = 0.22 * w * Math.sin(S.phase);
    const sq = S.state === 'pickup' ? S.seq : null, t = S.pickT;
    const kneelW = sq && S.mode === 'kneel' ? sm(0.6, 1.5, t) * (1 - sm(5.0, 6.0, t)) : 0;
    for (const [kk, sgn] of [['L', 1], ['R', -1]]) {
      const { a: la, b: lb } = LEN[kk], sw = -sgn * swing;
      B['upper' + kk].getWorldPosition(v1);
      const S0 = v1.clone();
      // Hanging (gravity, a little swing), slightly bent at the elbow.
      const Ph = S0.clone()
        .addScaledVector(bodyDir([0.12 * sgn, -1, 0.04 + sw * 0.6], v4), la)
        .addScaledVector(bodyDir([0.04 * sgn, -1, 0.28 + sw], v4), lb + 0.06);
      let target = Ph, curl = 0.25;
      const palm = bodyDir([-sgn, 0, 0.15], new T.Vector3());
      // Kneeling: the free hand rests on top of her thigh.
      if (kneelW > 0 && (kk === 'L' || !sq || t < sq.reach[0] || t > sq.lift[1])) {
        const kn = B['shin' + kk].getWorldPosition(new T.Vector3()), hp = B['thigh' + kk].getWorldPosition(new T.Vector3());
        const onThigh = kn.lerp(hp, 0.3).addScaledVector(UP, 0.07);
        target = target.clone().lerp(onThigh, kneelW);
        palm.lerp(new T.Vector3(0, -1, 0), kneelW).normalize();
      }
      if (kk === 'R') {
        // Carrying: forearm forward at her waist, can upright in her hand.
        if (S.carry > 0) {
          const C = S0.clone().addScaledVector(bodyDir([0.12, -1, 0.12], v4), la).addScaledVector(bodyDir([0.25, -0.25, 0.93], v4), lb + 0.05);
          target = target.clone().lerp(C, S.carry);
          curl = lerp(curl, 1.2, S.carry);
        }
        if (sq) {
          // Reach: out and over the can, then down onto it; grip; lift toward carrying.
          const r = reachW(t);
          const over = 0.12 * (1 - sm(sq.reach[1] - 0.35, sq.reach[1], t));
          const Pc = S.plan.P.clone().addScaledVector(UP, over);
          if (S.can) Pc.copy(liftPoint(Pc, t));
          target = target.clone().lerp(Pc, r);
          curl = lerp(curl, 1.2, sm(sq.grip[0], sq.grip[1], t));
          palm.lerp(bodyDir([0.9, 0, 0.3], v4), r).normalize();
        }
      }
      armTo(kk, sgn, target, palm, curl);
    }
  }
  const reachW = (t) => sm(S.seq.reach[0], S.seq.reach[1], t) * (1 - sm(S.seq.lift[0], S.seq.lift[1], t));
  // While lifting, the can rises from where it lay toward her carrying hand.
  function liftPoint(Pc, t) {
    const sq = S.seq;
    return Pc.clone().addScaledVector(UP, 0.18 * sm(sq.attach, sq.lift[1], t));
  }

  // ---------------------------------------------------------------- the can in her hand
  const held = { pos: new T.Vector3(), quat: new T.Quaternion(), t: 0 };
  const HELD_Q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(0, 0, 1));
  function attachCan(can) {
    // Keep the can exactly where it is, relative to her palm, at the moment she grips it.
    B.gripR.getWorldPosition(v1); B.gripR.getWorldQuaternion(q2);
    const inv = q2.clone().invert();
    held.pos.copy(can.position).sub(v1).applyQuaternion(inv);
    held.quat.copy(inv).multiply(can.quaternion);
    held.from = { pos: held.pos.clone(), quat: held.quat.clone() };
    held.t = 0;
  }
  function holdCan(dt) {
    held.t += dt;
    // Settle into the hand (can upright across her palm) over half a second.
    const u = sm(0, 0.6, held.t);
    const pos = held.from.pos.clone().lerp(new T.Vector3(), u);
    const quat = held.from.quat.clone().slerp(HELD_Q, u);
    B.gripR.getWorldPosition(v1); B.gripR.getWorldQuaternion(q2);
    S.can.position.copy(pos.applyQuaternion(q2).add(v1));
    S.can.quaternion.copy(q2).multiply(quat);
  }

  // ---------------------------------------------------------------- update
  function follow(dt) {
    if (!S.path.length) { S.speed *= Math.exp(-dt * 8); return true; }
    const goal = S.path[0];
    const dx = goal.x - S.x, dz = goal.z - S.z, d = Math.hypot(dx, dz);
    if (d < 0.12 && S.path.length > 1) { S.path.shift(); return false; }
    const want = Math.atan2(dx, dz);
    let dh = want - S.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    S.h += clamp(dh, -dt * 4.5, dt * 4.5);
    // She waits rather than walk through you.
    const fp = env.feet?.(v1);
    const blocked = fp && Math.hypot(fp.x - S.x - Math.sin(S.h) * 0.35, fp.z - S.z - Math.cos(S.h) * 0.35) < 0.45;
    S.blockT = blocked ? S.blockT + dt : 0;
    const last = S.path.length === 1;
    const target = blocked && S.blockT < 4 ? 0 : 0.95 * (last ? clamp(d / 0.4, 0.25, 1) : 1) * (Math.abs(dh) > 1 ? 0.3 : 1);
    S.speed += (target - S.speed) * (1 - Math.exp(-dt * 6));
    S.x += Math.sin(S.h) * S.speed * dt;
    S.z += Math.cos(S.h) * S.speed * dt;
    if (last && d < 0.04) { S.x = goal.x; S.z = goal.z; S.path = []; return true; }
    return false;
  }
  let prevStep = 0;
  function phaseOf(t) { let n = ''; for (const [at, name] of S.seq.phases) if (t >= at) n = name; return n; }
  function update(dt, t) {
    if (S.state === 'away') {
      if (S.wait >= 0 && dt > 0) { S.wait -= dt; if (S.wait < 0) { if (!come()) S.wait = env.canState() === 'rest' ? 3 : -1; } }
      return;
    }
    S.t += dt;
    if (S.state === 'enter') {
      S.phaseName = S.path.length > 2 ? 'entering' : 'walking to the can';
      // If the can's gone (or moved), there's nothing to pick up.
      if (env.canState() !== 'rest') leave();
      else if (follow(dt) || S.t > 20) { S.state = 'position'; S.t = 0; S.phaseName = 'positioning'; }
    } else if (S.state === 'position') {
      // Turn on the spot to face her pickup heading.
      let dh = S.plan.h - S.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      S.h += clamp(dh, -dt * 2.6, dt * 2.6);
      S.speed *= Math.exp(-dt * 10);
      if (Math.abs(dh) < 0.02 && S.speed < 0.05) { S.h = S.plan.h; S.state = 'pickup'; S.t = 0; S.pickT = 0; }
    } else if (S.state === 'pickup') {
      S.pickT += dt;
      const sq = S.seq;
      S.phaseName = phaseOf(S.pickT);
      if (!S.can && S.pickT >= sq.attach) {
        // Only now, with her fingers closed on it, does the can come with her hand.
        S.can = env.takeCan();
        if (S.can) { attachCan(S.can); env.sfx?.('tink'); }
      }
      S.carry = S.can ? sm(sq.lift[1] - 0.3, sq.end, S.pickT) : 0;
      if (S.pickT >= sq.end) { S.carry = S.can ? 1 : 0; leave(); }
    } else if (S.state === 'leave') {
      S.phaseName = 'leaving';
      if (follow(dt) || S.t > 25) {
        S.state = 'away'; holder.visible = false; S.phaseName = '';
        if (S.can) { env.dropCan(); S.can = null; }
      }
    }
    S.stride += (clamp(S.speed / 0.8, 0, 1) - S.stride) * (1 - Math.exp(-dt * 8));
    S.phase += dt * S.speed / 0.58 * PI;
    const st = Math.floor(S.phase / PI);
    if (st !== prevStep) { prevStep = st; if (S.stride > 0.3) env.sfx?.('step'); }
    pose();
    if (S.can) holdCan(dt);
  }
  function leave() {
    S.state = 'leave'; S.t = 0;
    const p = env.findPath({ x: S.x, z: S.z }, doorIn()) || [{ x: S.x, z: S.z }, doorIn()];
    S.path = [...p.slice(1), doorIn(), hall()];
  }

  return {
    load, update, come, canSettled,
    get active() { return S.state !== 'away'; },
    get ready() { return ready(); },
    get holding() { return !!S.can; },
    body(out) { return S.state === 'away' ? null : out.set(S.x, 0, S.z); },
    radius: 0.26,
    _debug: () => {
      let grip = null;
      if (B && S.plan) grip = +B.gripR.getWorldPosition(new T.Vector3()).distanceTo(S.plan.P).toFixed(3);
      return { state: S.state, phase: S.phaseName, mode: S.mode, t: +S.t.toFixed(2), pickT: +S.pickT.toFixed(2), x: +S.x.toFixed(2), z: +S.z.toFixed(2), h: +S.h.toFixed(2),
        carry: +S.carry.toFixed(2), can: !!S.can, wait: +S.wait.toFixed(1), path: S.path.length, plan: S.plan && { ...S.plan.root, h: +S.plan.h.toFixed(2), depth: +S.plan.depth.toFixed(2), lean: +S.plan.lean.toFixed(1), P: S.plan.P.toArray().map((v) => +v.toFixed(2)) }, gripToCan: grip, why: S.why,
        y: +holder.position.y.toFixed(3) };
    },
  };
}
