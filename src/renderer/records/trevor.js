// Trevor: a visitor who walks in through the doorway on the right with a beer
// can, throws it at you wherever you are, and walks back out.
//
// Both models are the user's own supplied assets (a .glb each), used as they
// are: Trevor's Mixamo skeleton is posed procedurally here (the model has no
// animation clips), and the can keeps its mesh, size and PBR materials.
//
// Trevor states: away -> enter -> turn -> windup/throw -> watch -> leave -> away.
// Can states:    none -> held -> flying -> loose (bouncing) -> rolling -> rest.
//
// The room supplies where the doorway is, what the can can hit, and where the
// target (your character) is; this module only decides when and how.

const sm = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function createTrevor(env) {
  const { T, room } = env;
  const PI = Math.PI;
  const G = 9.81;
  const UP = new T.Vector3(0, 1, 0);
  const v1 = new T.Vector3(), v2 = new T.Vector3(), v3 = new T.Vector3(), v4 = new T.Vector3();
  const q1 = new T.Quaternion(), q2 = new T.Quaternion(), q3 = new T.Quaternion();

  // ---------------------------------------------------------------- Trevor
  const HEIGHT = 1.86; // he's modelled ~3.4x real size; scaled uniformly, nothing else changes
  const holder = new T.Group();
  holder.visible = false;
  room.add(holder);
  let model = null, B = null, rest = null, legLen = 0.95;

  function load(url) {
    if (!url || load.url === url) return;
    load.url = url;
    new T.GLTFLoader().load(url, (gltf) => {
      if (model) holder.remove(model);
      model = gltf.scene;
      model.updateMatrixWorld(true);
      const bb = new T.Box3().setFromObject(model);
      const s = HEIGHT / (bb.max.y - bb.min.y);
      model.scale.setScalar(s);
      model.position.y = -bb.min.y * s;
      model.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
          // The supplied file has roughness 0 on every material (a conversion leftover: no
          // roughness maps), which renders him mirror-shiny; give skin and cloth a matte finish.
          for (const m of [].concat(o.material)) if (m && m.roughness === 0 && !m.roughnessMap) m.roughness = 0.78;
        }
      });
      holder.add(model);
      holder.updateMatrixWorld(true);
      const find = (n) => model.getObjectByName('mixamorig' + n) || model.getObjectByName('mixamorig:' + n);
      B = {};
      for (const n of ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head']) B[n] = find(n);
      for (const k of ['Left', 'Right']) {
        for (const n of ['Shoulder', 'Arm', 'ForeArm', 'Hand', 'UpLeg', 'Leg', 'Foot', 'ToeBase']) B[k + n] = find(k + n);
        for (const f of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) for (const i of [1, 2, 3]) B[k + 'Hand' + f + i] = find(k + 'Hand' + f + i);
      }
      if (!B.Hips || !B.RightHand || !B.LeftUpLeg) { model = null; env.error?.('Trevor’s model has no Mixamo skeleton.'); return; }
      rest = new Map();
      model.traverse((o) => { if (o.isBone) rest.set(o, o.quaternion.clone()); });
      legLen = B.LeftUpLeg.getWorldPosition(v1).y - B.LeftToeBase.getWorldPosition(v2).y;
    }, undefined, () => env.error?.('Trevor’s model couldn’t be loaded.'));
  }

  // ---------------------------------------------------------------- the can
  const CAN_R = 0.031, CAN_H = 0.122;
  const can = new T.Group();
  can.visible = false;
  room.add(can);
  let canModel = null;
  function loadCan(url) {
    if (!url || loadCan.url === url) return;
    loadCan.url = url;
    new T.GLTFLoader().load(url, (gltf) => {
      if (canModel) can.remove(canModel);
      canModel = gltf.scene;
      canModel.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      can.add(canModel);
    }, undefined, () => env.error?.('The beer can model couldn’t be loaded.'));
  }

  // ---------------------------------------------------------------- state
  const S = {
    state: 'away', t: 0, x: 0, z: 0, h: 0, speed: 0, phase: 0, stride: 0,
    throwT: 0, released: false, look: new T.Vector3(), lookW: 0,
    canState: 'none', pos: new T.Vector3(), vel: new T.Vector3(), spin: new T.Vector3(), axis: new T.Vector3(0, 1, 0),
    flightT: 0, flightLeft: 0, hit: false, rollQ: new T.Quaternion(),
    nextVisit: 120 + Math.random() * 180, lastTarget: new T.Vector3(), targetVel: new T.Vector3(), seen: false,
  };
  const ready = () => !!(model && canModel);
  const doorZ = () => (env.door.z0 + env.door.z1) / 2;
  const spawn = () => ({ x: env.door.x + 1.15, z: doorZ() });
  function throwSpot() {
    // Just inside the doorway; if you're standing right there, he throws from the doorway itself.
    const tp = env.target(v4);
    const inside = { x: env.door.x - 0.6, z: doorZ() };
    if (tp && Math.hypot(tp.x - inside.x, tp.z - inside.z) < 0.9) return { x: env.door.x + 0.05, z: doorZ() };
    return inside;
  }

  function visit() {
    if (!ready() || S.state !== 'away' || !env.canVisit() || S.canState === 'carried') return false;
    const p = spawn();
    Object.assign(S, { state: 'enter', t: 0, x: p.x, z: p.z, h: -PI / 2, speed: 0, released: false, hit: false, lookW: 0 });
    S.goal = throwSpot();
    S.canState = 'held';
    can.visible = true;
    holder.visible = true;
    env.sfx?.('door');
    env.changed?.('enter');
    return true;
  }

  // ---------------------------------------------------------------- posing
  // Directions are given in his body frame: [left, up, forward]; the bone is
  // turned in world space so that it points from its joint to its child that way.
  const frame = { L: new T.Vector3(), F: new T.Vector3() };
  function setFrame(h) { frame.F.set(Math.sin(h), 0, Math.cos(h)); frame.L.set(Math.cos(h), 0, -Math.sin(h)); }
  function bodyDir(d, out) { return out.copy(frame.L).multiplyScalar(d[0]).addScaledVector(UP, d[1]).addScaledVector(frame.F, d[2]).normalize(); }
  const pw = new T.Quaternion(), bw = new T.Quaternion();
  function aim(bone, child, dirW, w = 1) {
    if (!bone || !child || w <= 0) return;
    bone.updateMatrixWorld(true);
    const a = bone.getWorldPosition(v1), b = child.getWorldPosition(v2);
    const cur = v3.subVectors(b, a).normalize();
    q1.setFromUnitVectors(cur, dirW);
    if (w < 1) q1.slerp(q2.identity(), 1 - w);
    turnWorld(bone, q1);
  }
  // Apply a world-space rotation to a bone, keeping it in its parent's frame.
  function turnWorld(bone, q) {
    bone.getWorldQuaternion(bw);
    bone.parent.getWorldQuaternion(pw);
    bone.quaternion.copy(pw.invert().multiply(q3.copy(q).multiply(bw)));
    bone.updateMatrixWorld(true);
  }
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  // Keyframed throw for the right arm (upper arm, forearm), left arm, torso twist and lean.
  const TH = [
    { t: 0.0, ru: [-0.2, -0.95, 0.22], rf: [-0.15, -0.3, 0.94], lu: [0.2, -0.97, 0.05], lf: [0.12, -0.9, 0.3], tw: 0, ln: 0 },
    { t: 0.5, ru: [-0.95, 0.2, -0.25], rf: [-0.25, 0.8, -0.55], lu: [0.3, 0.25, 0.92], lf: [0.15, 0.3, 0.94], tw: -0.65, ln: -0.12 },
    { t: 0.66, ru: [-0.45, 0.5, 0.74], rf: [-0.12, 0.45, 0.88], lu: [0.45, -0.3, 0.6], lf: [0.2, -0.4, 0.89], tw: 0.1, ln: 0.08 },
    { t: 0.9, ru: [0.15, -0.55, 0.82], rf: [0.45, -0.65, 0.6], lu: [0.3, -0.85, 0.3], lf: [0.1, -0.5, 0.86], tw: 0.45, ln: 0.22 },
    { t: 1.6, ru: [-0.2, -0.97, 0.05], rf: [-0.15, -0.9, 0.3], lu: [0.2, -0.97, 0.05], lf: [0.12, -0.9, 0.3], tw: 0, ln: 0 },
  ];
  const RELEASE = 0.62;
  function throwKey(t) {
    let i = 0;
    while (i < TH.length - 2 && t > TH[i + 1].t) i++;
    const a = TH[i], b = TH[i + 1], u = sm(a.t, b.t, t);
    return { ru: mix(a.ru, b.ru, u), rf: mix(a.rf, b.rf, u), lu: mix(a.lu, b.lu, u), lf: mix(a.lf, b.lf, u), tw: lerp(a.tw, b.tw, u), ln: lerp(a.ln, b.ln, u) };
  }

  function pose(t) {
    for (const [b, q] of rest) b.quaternion.copy(q);
    const w = S.stride, ph = S.phase;
    // Walking: the planted leg is straight, so the body dips a little mid-stride.
    const aL = 0.42 * w * Math.sin(ph), aR = -aL;
    holder.position.set(S.x, -legLen * (1 - Math.cos(Math.abs(aL))) * 0.9 + 0.012 * w * Math.abs(Math.cos(ph)), S.z);
    holder.rotation.set(0, S.h, 0);
    holder.updateMatrixWorld(true);
    setFrame(S.h);

    const th = S.state === 'throw' || S.state === 'windup' ? throwKey(S.throwT) : null;
    const tw = th ? th.tw : 0, ln = th ? th.ln : 0.04 * w;
    // Torso: twist (about up) and lean (about his left axis), spread over the spine.
    if (tw || ln) {
      q1.setFromAxisAngle(UP, tw / 3).multiply(q2.setFromAxisAngle(frame.L, ln / 3));
      for (const n of ['Spine', 'Spine1', 'Spine2']) turnWorld(B[n], q1);
    }
    // Legs.
    for (const [k, a, sign] of [['Left', aL, 1], ['Right', aR, -1]]) {
      const lp = ph + (sign < 0 ? PI : 0);
      const knee = w * (0.08 + 0.62 * Math.max(0, Math.cos(lp)));
      aim(B[k + 'UpLeg'], B[k + 'Leg'], bodyDir([0.05 * sign, -Math.cos(a), Math.sin(a)], v4));
      aim(B[k + 'Leg'], B[k + 'Foot'], bodyDir([0.03 * sign, -Math.cos(a - knee), Math.sin(a - knee)], v4));
      aim(B[k + 'Foot'], B[k + 'ToeBase'], bodyDir([0.04 * sign, -0.5 + 0.4 * Math.max(0, Math.sin(-(a - knee))), 0.86], v4));
    }
    // Arms: the throw frame turns with his chest.
    setFrame(S.h + tw);
    const swing = 0.32 * w * Math.sin(ph);
    const walkU = (s, b) => [0.2 * s, -Math.cos(b), Math.sin(b)];
    const walkF = (s, b) => [0.1 * s, -Math.cos(b + 0.3), Math.sin(b + 0.3)];
    const holding = S.canState === 'held';
    let ru = holding ? [-0.2, -0.95, 0.22] : walkU(-1, swing), rf = holding ? [-0.15, -0.3, 0.94] : walkF(-1, swing);
    let lu = walkU(1, -swing), lf = walkF(1, -swing);
    if (th) { ru = th.ru; rf = th.rf; lu = th.lu; lf = th.lf; }
    aim(B.RightArm, B.RightForeArm, bodyDir(ru, v4));
    aim(B.RightForeArm, B.RightHand, bodyDir(rf, v4));
    aim(B.RightHand, B.RightHandMiddle1, bodyDir(rf, v4), 0.7);
    aim(B.LeftArm, B.LeftForeArm, bodyDir(lu, v4));
    aim(B.LeftForeArm, B.LeftHand, bodyDir(lf, v4));
    aim(B.LeftHand, B.LeftHandMiddle1, bodyDir(lf, v4), 0.7);
    // Fingers: wrapped round the can while he holds it, loosely curled otherwise.
    curlFingers('Right', holding || (th && S.throwT < RELEASE) ? 1 : 0.25);
    curlFingers('Left', 0.3);
    // Head: on you once he's in the room.
    S.lookW += ((S.state === 'enter' && S.x > env.door.x - 0.1) || S.state === 'leave' ? -1 : 1) * 0.05;
    S.lookW = clamp(S.lookW, 0, 1);
    if (S.lookW > 0 && env.target(S.look)) {
      const hp = B.Head.getWorldPosition(v1);
      const want = Math.atan2(S.look.x - hp.x, S.look.z - hp.z);
      let d = want - (S.h + tw); d = Math.atan2(Math.sin(d), Math.cos(d));
      const pitch = Math.atan2(S.look.y - hp.y, Math.hypot(S.look.x - hp.x, S.look.z - hp.z));
      const yaw = clamp(d, -1.1, 1.1) * S.lookW, pit = clamp(pitch, -0.6, 0.4) * S.lookW;
      setFrame(S.h + tw);
      for (const n of ['Neck', 'Head']) {
        q1.setFromAxisAngle(UP, yaw / 2).multiply(q2.setFromAxisAngle(frame.L, -pit / 2));
        turnWorld(B[n], q1);
        setFrame(S.h + tw + yaw / 2);
      }
    }
  }
  function curlFingers(k, c) {
    const hand = B[k + 'Hand'];
    if (!hand || c <= 0) return;
    // The knuckle line (index to pinky) is the curl axis; the palm side is where the thumb sits.
    const i1 = B[k + 'HandIndex1'].getWorldPosition(v1), p1 = B[k + 'HandPinky1'].getWorldPosition(v2);
    const axis = v3.subVectors(i1, p1).normalize();
    const hp = hand.getWorldPosition(new T.Vector3()), m1 = B[k + 'HandMiddle1'].getWorldPosition(new T.Vector3());
    const along = m1.clone().sub(hp).normalize();
    const th = B[k + 'HandThumb2'].getWorldPosition(new T.Vector3()).sub(hp);
    const palm = th.addScaledVector(along, -th.dot(along)).addScaledVector(axis, -th.clone().dot(axis)).normalize();
    // Which way round the axis moves a fingertip toward the palm.
    const test = along.clone().applyAxisAngle(axis, 0.3);
    const sgn = test.dot(palm) > 0 ? 1 : -1;
    for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) {
      for (const [i, a] of [[1, 0.9], [2, 1.0], [3, 0.6]]) {
        const b = B[k + 'Hand' + f + i];
        if (!b) continue;
        q1.setFromAxisAngle(axis, sgn * a * c);
        turnWorld(b, q1);
      }
    }
    const t1 = B[k + 'HandThumb1'];
    if (t1) { q1.setFromAxisAngle(along, -sgn * 0.5 * c * (k === 'Right' ? 1 : -1)); turnWorld(t1, q1); }
    return { axis, palm, along, hp };
  }
  // The can sits in his palm, its axis along the knuckle line, fingers round it.
  function canInHand(out) {
    const k = 'Right';
    const hp = B[k + 'Hand'].getWorldPosition(v1), m1 = B[k + 'HandMiddle1'].getWorldPosition(v2);
    const along = v3.subVectors(m1, hp);
    const len = along.length(); along.normalize();
    const i1 = B[k + 'HandIndex1'].getWorldPosition(new T.Vector3()), p1 = B[k + 'HandPinky1'].getWorldPosition(new T.Vector3());
    const axis = i1.sub(p1).normalize();
    const th = B[k + 'HandThumb2'].getWorldPosition(new T.Vector3()).sub(hp);
    const palm = th.addScaledVector(along, -th.dot(along)).addScaledVector(axis, -th.dot(axis)).normalize();
    out.copy(hp).addScaledVector(along, len * 0.75).addScaledVector(palm, CAN_R + 0.012);
    S.axis.copy(axis);
    if (S.axis.y < 0) S.axis.negate();
    return out;
  }

  // ---------------------------------------------------------------- the throw
  // Precise: the launch velocity is solved so the can's ballistic arc meets
  // where you'll be when it arrives (leading you if you're moving), and in
  // flight it keeps re-solving for the time left, so it lands wherever you are.
  const g = new T.Vector3(0, -G, 0);
  function solveLaunch(from, to, tFlight, out) {
    return out.subVectors(to, from).divideScalar(tFlight).addScaledVector(UP, 0.5 * G * tFlight);
  }
  function release() {
    S.released = true;
    S.canState = 'flying';
    canInHand(S.pos);
    env.target(v4);
    const d = S.pos.distanceTo(v4);
    let tf = clamp(d / 8.5, 0.22, 0.7);
    // Keep the arc under the ceiling.
    for (let i = 0; i < 6; i++) {
      const lead = v1.copy(v4).addScaledVector(S.targetVel, tf);
      solveLaunch(S.pos, lead, tf, S.vel);
      const apex = S.pos.y + Math.max(0, S.vel.y) ** 2 / (2 * G);
      if (apex < env.ceiling - 0.15) break;
      tf *= 0.8;
    }
    S.flightT = 0; S.flightLeft = tf;
    S.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(14);
    env.sfx?.('whoosh');
  }

  // ---------------------------------------------------------------- can physics
  const qd = new T.Quaternion();
  function integrateSpin(dt) {
    const w = S.spin.length();
    if (w > 1e-4) { qd.setFromAxisAngle(v1.copy(S.spin).divideScalar(w), w * dt); can.quaternion.premultiply(qd); }
  }
  function boxPush(p, r, b) {
    // Sphere against an axis-aligned box: push out along the shallowest side, return the normal.
    const cx = clamp(p.x, b.min[0], b.max[0]), cy = clamp(p.y, b.min[1], b.max[1]), cz = clamp(p.z, b.min[2], b.max[2]);
    const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz, d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > r * r) return null;
    if (d2 > 1e-10) {
      const d = Math.sqrt(d2), n = new T.Vector3(dx / d, dy / d, dz / d);
      p.addScaledVector(n, r - d);
      return n;
    }
    // Centre inside: leave by the nearest face.
    const opts = [[p.x - b.min[0], -1, 0, 0], [b.max[0] - p.x, 1, 0, 0], [p.y - b.min[1], 0, -1, 0], [b.max[1] - p.y, 0, 1, 0], [p.z - b.min[2], 0, 0, -1], [b.max[2] - p.z, 0, 0, 1]];
    opts.sort((a, c) => a[0] - c[0]);
    const [dd, nx, ny, nz] = opts[0];
    const n = new T.Vector3(nx, ny, nz);
    p.addScaledVector(n, dd + r);
    return n;
  }
  function bounce(n, e = 0.35, mu = 0.75) {
    const vn = S.vel.dot(n);
    if (vn >= 0) return 0;
    v1.copy(n).multiplyScalar(vn);
    v2.subVectors(S.vel, v1).multiplyScalar(mu);
    S.vel.copy(v2).addScaledVector(v1, -e);
    return -vn;
  }
  function stepCan(dt) {
    if (S.canState === 'flying' || S.canState === 'loose') {
      const sub = 4, h = dt / sub;
      for (let i = 0; i < sub; i++) {
        if (S.canState === 'flying') {
          // Guidance: re-solve the arc for the time that's left, so it always arrives on target.
          env.target(v4);
          S.flightLeft -= h; S.flightT += h;
          const left = Math.max(S.flightLeft, h * 2);
          solveLaunch(S.pos, v1.copy(v4).addScaledVector(S.targetVel, left), left, v2);
          S.vel.lerp(v2, 0.35);
        }
        S.vel.addScaledVector(g, h);
        S.pos.addScaledVector(S.vel, h);
        integrateSpin(h);
        if (S.canState === 'flying') {
          env.target(v4);
          if (S.pos.distanceTo(v4) < 0.14 || S.flightLeft <= -0.05) { hitTarget(v4); continue; }
        }
        collideRoom(CAN_R * 1.3);
      }
    } else if (S.canState === 'rolling') {
      roll(dt);
    }
    if (S.canState === 'flying' || S.canState === 'loose' || S.canState === 'rolling' || S.canState === 'rest') {
      can.position.copy(S.pos);
    }
  }
  function hitTarget(tp) {
    S.hit = true;
    S.canState = 'loose';
    const dir = v1.copy(S.vel).normalize();
    env.onHit?.(dir.clone(), S.vel.length());
    env.sfx?.('clank');
    // It glances off you: back the way it came, a little up, with a fresh tumble.
    const away = v2.subVectors(S.pos, tp).setY(0);
    if (away.lengthSq() < 1e-4) away.copy(dir).negate().setY(0);
    away.normalize();
    S.pos.copy(tp).addScaledVector(away, 0.17);
    S.vel.copy(dir).multiplyScalar(-1.1).setY(0).addScaledVector(away, 1.3).add(v3.set(0, 1.6, 0));
    S.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(18);
  }
  function collideRoom(r) {
    const b = env.bounds;
    let n = null, hard = 0;
    const face = (cond, nx, ny, nz, fix) => { if (cond) { fix(); n = v3.set(nx, ny, nz); hard = Math.max(hard, bounce(n, 0.4)); } };
    face(S.pos.x < b.x0 + r, 1, 0, 0, () => { S.pos.x = b.x0 + r; });
    face(S.pos.x > b.x1 - r && !(S.pos.z > env.door.z0 + r && S.pos.z < env.door.z1 - r && S.pos.y < env.door.h), -1, 0, 0, () => { S.pos.x = b.x1 - r; });
    face(S.pos.x > b.x1 + 1.3, -1, 0, 0, () => { S.pos.x = b.x1 + 1.3; });
    face(S.pos.z < b.z0 + r, 0, 0, 1, () => { S.pos.z = b.z0 + r; });
    face(S.pos.z > b.z1 - r, 0, 0, -1, () => { S.pos.z = b.z1 - r; });
    face(S.pos.y > env.ceiling - r, 0, -1, 0, () => { S.pos.y = env.ceiling - r; });
    for (const box of env.obstacles()) {
      const nn = boxPush(S.pos, r, box);
      if (nn) {
        const k = bounce(nn, 0.3, 0.7); hard = Math.max(hard, k);
        // Came to rest on top of something (the coffee table): lie down and roll there.
        if (nn.y > 0.7 && Math.abs(S.vel.y) < 0.45 && S.canState === 'loose') { startRolling(box.max[1], box); break; }
      }
    }
    // The floor.
    if (S.pos.y < CAN_R) {
      S.pos.y = CAN_R;
      const k = bounce(v3.set(0, 1, 0), 0.32, 0.8);
      hard = Math.max(hard, k);
      S.spin.multiplyScalar(0.6);
      if (Math.abs(S.vel.y) < 0.45 && S.canState === 'loose') startRolling(0, null);
    }
    if (hard > 0.35) env.sfx?.(hard > 1.5 ? 'clank' : 'tink');
  }

  // On the floor it lies on its side and rolls: motion across its axis turns
  // it about that axis (no slipping); motion along the axis just slides to a stop.
  const rollAxis = new T.Vector3();
  function startRolling(y = 0, on = null) {
    S.canState = 'rolling';
    S.groundY = y; S.onBox = on; S.rollAngle = 0;
    // Its axis tips over flat, keeping its heading.
    v1.set(0, 1, 0).applyQuaternion(can.quaternion).setY(0);
    if (v1.lengthSq() < 1e-4) v1.set(S.vel.z, 0, -S.vel.x);
    if (v1.lengthSq() < 1e-6) v1.set(1, 0, 0);
    rollAxis.copy(v1.normalize());
    S.vel.y = 0;
    S.settle = 0;
    S.fromQ = can.quaternion.clone();
  }
  function roll(dt) {
    const across = v1.set(-rollAxis.z, 0, rollAxis.x);
    let u = S.vel.dot(across), a = S.vel.dot(rollAxis);
    a *= Math.exp(-dt * 6); // sliding along its length: friction
    const rr = 0.35 * dt; // rolling resistance
    u = Math.abs(u) <= rr ? 0 : u - Math.sign(u) * rr;
    S.vel.copy(across).multiplyScalar(u).addScaledVector(rollAxis, a);
    S.pos.addScaledVector(S.vel, dt);
    S.pos.y = S.groundY + CAN_R;
    // Rolled off the edge of the table: it falls again.
    const ob = S.onBox;
    if (ob && (S.pos.x < ob.min[0] || S.pos.x > ob.max[0] || S.pos.z < ob.min[2] || S.pos.z > ob.max[2])) {
      S.canState = 'loose'; S.vel.y = -0.2; S.spin.set(-S.vel.z, 0, S.vel.x).multiplyScalar(1 / CAN_R); return;
    }
    // Walls and furniture.
    const b = env.bounds, r = CAN_R + 0.01;
    const wall = (n) => { const k = bounce(n, 0.45, 0.9); if (k > 0.15) env.sfx?.('tink'); };
    if (S.pos.x < b.x0 + r) { S.pos.x = b.x0 + r; wall(v2.set(1, 0, 0)); }
    if (S.pos.x > b.x1 - r && !(S.pos.z > env.door.z0 && S.pos.z < env.door.z1)) { S.pos.x = b.x1 - r; wall(v2.set(-1, 0, 0)); }
    if (S.pos.x > b.x1 + 1.3) { S.pos.x = b.x1 + 1.3; wall(v2.set(-1, 0, 0)); }
    if (S.pos.z < b.z0 + r) { S.pos.z = b.z0 + r; wall(v2.set(0, 0, 1)); }
    if (S.pos.z > b.z1 - r) { S.pos.z = b.z1 - r; wall(v2.set(0, 0, -1)); }
    if (!ob) for (const box of env.obstacles()) if (box.min[1] < 0.05) { const n = boxPush(S.pos, r, box); if (n) { n.y = 0; n.normalize(); wall(n); S.pos.y = CAN_R; } }
    // Your feet nudge it along.
    const fp = ob ? null : env.feet?.(v2);
    if (fp) {
      const dx = S.pos.x - fp.x, dz = S.pos.z - fp.z, d = Math.hypot(dx, dz);
      if (d < 0.2 && d > 1e-4) { S.pos.x = fp.x + dx / d * 0.2; S.pos.z = fp.z + dz / d * 0.2; S.vel.x += dx / d * 0.6; S.vel.z += dz / d * 0.6; env.sfx?.('tink'); }
    }
    // Lie flat (blend from however it landed), and turn about the axis by distance / radius.
    S.settle = Math.min(1, S.settle + dt * 7);
    const turn = (S.rollAngle = (S.rollAngle || 0) + (u * dt) / CAN_R);
    q1.setFromUnitVectors(UP, rollAxis);
    q2.setFromAxisAngle(rollAxis, -turn);
    const flat = q2.multiply(q1);
    can.quaternion.copy(S.fromQ).slerp(flat, sm(0, 1, S.settle));
    if (Math.abs(u) < 0.01 && Math.abs(a) < 0.01 && S.settle >= 1) S.canState = 'rest';
  }

  // ---------------------------------------------------------------- update
  function walkTo(goal, dt, speed = 1.05) {
    const dx = goal.x - S.x, dz = goal.z - S.z, d = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    let dh = want - S.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    S.h += clamp(dh, -dt * 4, dt * 4);
    // Stop short of you rather than walking through you.
    const tp = env.feet?.(v1);
    const blocked = tp && Math.hypot(tp.x - S.x - Math.sin(S.h) * 0.3, tp.z - S.z - Math.cos(S.h) * 0.3) < 0.5;
    const target = d < 0.04 || blocked ? 0 : speed * clamp(d / 0.35, 0.3, 1) * (Math.abs(dh) > 1 ? 0.3 : 1);
    S.speed += (target - S.speed) * (1 - Math.exp(-dt * 6));
    S.x += Math.sin(S.h) * S.speed * dt;
    S.z += Math.cos(S.h) * S.speed * dt;
    return d < 0.06 || (blocked && d < 1.6);
  }
  function faceTarget(dt) {
    if (!env.target(v1)) return true;
    const want = Math.atan2(v1.x - S.x, v1.z - S.z);
    let dh = want - S.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    S.h += clamp(dh, -dt * 3.5, dt * 3.5);
    S.speed *= Math.exp(-dt * 8);
    return Math.abs(dh) < 0.08;
  }
  let prevStep = 0;
  function update(dt, t) {
    // Track how fast you're moving, for leading the throw.
    if (dt > 0 && env.target(v4)) {
      if (S.seen) S.targetVel.lerp(v1.subVectors(v4, S.lastTarget).divideScalar(dt), 1 - Math.exp(-dt * 8));
      S.lastTarget.copy(v4); S.seen = true;
      S.targetVel.clampLength(0, 3);
    }
    // Every few minutes he drops by.
    if (S.state === 'away' && dt > 0 && ready()) {
      S.nextVisit -= dt;
      if (S.nextVisit <= 0) { if (!visit()) S.nextVisit = 20; else S.nextVisit = 240 + Math.random() * 240; }
    }
    if (S.state !== 'away' && model) {
      S.t += dt;
      if (S.state === 'enter') {
        if (walkTo(S.goal, dt) || S.t > 9) { S.state = 'turn'; S.t = 0; }
      } else if (S.state === 'turn') {
        if (faceTarget(dt) || S.t > 1.5) { S.state = 'windup'; S.throwT = 0; S.t = 0; }
      } else if (S.state === 'windup' || S.state === 'throw') {
        faceTarget(dt * 0.6);
        S.throwT += dt;
        S.state = 'throw';
        if (!S.released && S.throwT >= RELEASE) release();
        if (S.throwT >= 1.6) { S.state = 'watch'; S.t = 0; }
      } else if (S.state === 'watch') {
        faceTarget(dt);
        if (S.t > 1.4) { S.state = 'leave'; S.t = 0; }
      } else if (S.state === 'leave') {
        if (walkTo(spawn(), dt) || S.t > 10) { S.state = 'away'; holder.visible = false; env.changed?.('left'); }
      }
      // Stride from speed; footsteps as each foot comes down.
      S.stride += (clamp(S.speed / 0.9, 0, 1) - S.stride) * (1 - Math.exp(-dt * 8));
      S.phase += dt * S.speed / 0.62 * PI;
      const st = Math.floor(S.phase / PI);
      if (st !== prevStep) { prevStep = st; if (S.stride > 0.3) env.sfx?.('step'); }
      if (holder.visible) pose(t);
      if (S.canState === 'held') { canInHand(S.pos); can.position.copy(S.pos); q1.setFromUnitVectors(UP, S.axis); can.quaternion.copy(q1); }
    }
    stepCan(dt);
  }

  // Someone else picks the can up: from now on they move it, until it's gone.
  function takeCan() { if (S.canState !== 'rest') return null; S.canState = 'carried'; return can; }
  function dropCan() { S.canState = 'none'; can.visible = false; }
  function clearCan() { if (S.canState === 'rest' || S.canState === 'rolling') { S.canState = 'none'; can.visible = false; } }

  return {
    load, loadCan, visit, update, clearCan, takeCan, dropCan,
    canPos(out) { return out.copy(S.pos); },
    get state() { return S.state; },
    get canState() { return S.canState; },
    get active() { return S.state !== 'away'; },
    get ready() { return ready(); },
    // Where he stands, for keeping you from walking through him.
    body(out) { return S.state === 'away' ? null : out.set(S.x, 0, S.z); },
    radius: 0.32,
    _elbow: () => { if (!B) return null; const a = B.RightArm.getWorldPosition(new T.Vector3()), b = B.RightForeArm.getWorldPosition(new T.Vector3()), c = B.RightHand.getWorldPosition(new T.Vector3()); return { up: b.clone().sub(a).normalize().toArray().map((v) => +v.toFixed(2)), fo: c.clone().sub(b).normalize().toArray().map((v) => +v.toFixed(2)), lenU: +a.distanceTo(b).toFixed(3), lenF: +b.distanceTo(c).toFixed(3), foreType: B.RightForeArm.type, foreParent: B.RightForeArm.parent.name, h: S.h }; },
    // Test hook: lay the can at rest on its side at (x, y, z).
    _putCan: (x, y, z, yaw = 0) => {
      S.pos.set(x, y + CAN_R, z); S.vel.set(0, 0, 0); S.canState = 'rest';
      can.visible = true; can.position.copy(S.pos);
      can.quaternion.setFromEuler(new T.Euler(0, yaw, Math.PI / 2));
    },
    _debug: () => ({ state: S.state, t: +S.t.toFixed(2), x: +S.x.toFixed(2), z: +S.z.toFixed(2), h: +S.h.toFixed(2), can: S.canState, pos: S.pos.toArray().map((v) => +v.toFixed(2)), hit: S.hit, next: +S.nextVisit.toFixed(1) }),
  };
}
