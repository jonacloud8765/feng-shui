// A real bone skeleton for a static character mesh.
//
// The model arrives as plain meshes in an A/T pose. We place joints from its
// proportions (the same measurements the room already takes), build a bone
// hierarchy with standard humanoid names (Hips, Spine, Spine2, Neck, Head,
// Left/RightShoulder, Arm, ForeArm, UpLeg, Leg), skin every vertex to up to
// four bones, and swap the meshes for SkinnedMeshes. Posing is then just bone
// rotations, done on the GPU, and any joint's position can be read back for
// props and hand targets.
//
// Ideas borrowed from motion models such as NVIDIA's Kimodo: a single root
// (the hips) that carries the body through the room, joint rotations local to
// their parent, and end effectors (hands, mouth) solved to targets rather than
// keyed by hand.

const sm = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// Laplacian smoothing of the weight tables over the whole body, all meshes
// together (vertices welded by position, so UV seams and the joins between
// separate meshes such as head and body don't open), only where mask > 0.
function smoothWeights(parts, NB, mask) {
  let n = 0;
  const off = parts.map((p) => { const o = n; n += p.wArm.length; return o; });
  const weld = new Int32Array(n), key = new Map();
  parts.forEach((p, pi) => {
    for (let i = 0; i < p.wArm.length; i++) {
      const b = p.base;
      const k = Math.round(b[i * 3] * 1000) + ',' + Math.round(b[i * 3 + 1] * 1000) + ',' + Math.round(b[i * 3 + 2] * 1000);
      let w = key.get(k); if (w == null) { w = key.size; key.set(k, w); }
      weld[off[pi] + i] = w;
    }
  });
  const m = key.size;
  const deg = new Uint32Array(m);
  const tris = parts.map((p) => { const idx = p.mesh.geometry.index; return idx ? idx.array : Uint32Array.from({ length: p.wArm.length }, (_, i) => i); });
  parts.forEach((p, pi) => { const t = tris[pi], o = off[pi]; for (let j = 0; j < t.length; j++) deg[weld[o + t[j]]] += 2; });
  const start = new Uint32Array(m + 1);
  for (let i = 0; i < m; i++) start[i + 1] = start[i] + deg[i];
  const nb = new Uint32Array(start[m]), fill = start.slice(0, m);
  parts.forEach((p, pi) => {
    const t = tris[pi], o = off[pi];
    for (let j = 0; j < t.length; j += 3) for (let e = 0; e < 3; e++) {
      const a = weld[o + t[j + e]];
      nb[fill[a]++] = weld[o + t[j + (e + 1) % 3]]; nb[fill[a]++] = weld[o + t[j + (e + 2) % 3]];
    }
  });
  const V = new Float32Array(m * NB), cnt = new Uint16Array(m), M = new Float32Array(m);
  parts.forEach((p, pi) => {
    for (let i = 0; i < p.wArm.length; i++) {
      const w = weld[off[pi] + i]; cnt[w]++; M[w] = Math.max(M[w], mask(p, i));
      for (let b = 0; b < NB; b++) V[w * NB + b] += p.W[i * NB + b];
    }
  });
  for (let w = 0; w < m; w++) for (let b = 0; b < NB; b++) V[w * NB + b] /= cnt[w] || 1;
  const tmp = new Float32Array(m * NB);
  for (let it = 0; it < 18; it++) {
    tmp.set(V);
    for (let w = 0; w < m; w++) {
      const k = M[w], d = start[w + 1] - start[w];
      if (k <= 0 || !d) continue;
      for (let b = 0; b < NB; b++) {
        let acc = 0;
        for (let j = start[w]; j < start[w + 1]; j++) acc += tmp[nb[j] * NB + b];
        V[w * NB + b] = tmp[w * NB + b] * (1 - k) + (acc / d) * k;
      }
    }
  }
  parts.forEach((p, pi) => { for (let i = 0; i < p.wArm.length; i++) { const w = weld[off[pi] + i]; p.W.set(V.subarray(w * NB, w * NB + NB), i * NB); } });
}

export function buildSkeleton(T, rig, root) {
  const { H, xc, zc, hipY, kneeY, S } = rig;
  const y0 = hipY - H * 0.5;
  const legX = H * 0.05;
  const chestY = y0 + H * 0.66;
  const shoulderIn = H * 0.03;

  // ---- bones, in model space (the model faces +z, its left is +x)
  const bones = [];
  const at = (name, parent, x, y, z) => {
    const b = new T.Bone();
    b.name = name;
    const pw = parent ? parent.userData.world : new T.Vector3();
    b.position.set(x - pw.x, y - pw.y, z - pw.z);
    b.userData.world = new T.Vector3(x, y, z);
    b.userData.rest = b.position.clone();
    (parent || root).add(b);
    bones.push(b);
    return b;
  };
  const hips = at('Hips', null, xc, hipY, zc);
  const spine = at('Spine', hips, xc, hipY, zc);
  const chest = at('Spine2', spine, xc, chestY, zc);
  const neck = at('Head', chest, xc, rig.neckY, zc);
  const side = {};
  for (const s of [1, -1]) {
    const k = s === 1 ? 'L' : 'R', N = s === 1 ? 'Left' : 'Right';
    const clav = at(N + 'Shoulder', chest, xc + s * shoulderIn, S.y, S.z);
    const arm = at(N + 'Arm', clav, xc + s * S.x, S.y, S.z);
    const eN = rig.elbowAt[s] * H;
    const ex = xc + s * (S.x + rig.armDir.x * eN), ey = S.y + rig.armDir.y * eN;
    const fore = at(N + 'ForeArm', arm, ex, ey, S.z);
    // The elbow hinge in the rest pose: across the arm, in the body's plane.
    const d0 = new T.Vector2(s * rig.armDir.x, rig.armDir.y).normalize();
    const thigh = at(N + 'UpLeg', hips, xc + s * legX, hipY, zc);
    const shin = at(N + 'Leg', thigh, xc + s * legX, kneeY, zc);
    side[k] = { s, clav, arm, fore, thigh, shin, hinge: new T.Vector3(d0.y, -d0.x, 0) };
  }
  const index = new Map(bones.map((b, i) => [b, i]));
  root.updateMatrixWorld(true);
  const skeleton = new T.Skeleton(bones);

  // ---- skin weights from the body-region masks
  const sw = new Float32Array(bones.length);
  const shoulderPt = { 1: new T.Vector2(xc + S.x, S.y), [-1]: new T.Vector2(xc - S.x, S.y) };
  const NB = bones.length;
  rig.parts.forEach((p) => {
    const n = p.wArm.length;
    const skinIndex = new Uint16Array(n * 4), skinWeight = new Float32Array(n * 4);
    p.skin = { idx: skinIndex, w: skinWeight };
    const W = p.W = new Float32Array(n * NB);
    for (let i = 0; i < n; i++) {
      sw.fill(0);
      const s = p.side[i], g = side[s === 1 ? 'L' : 'R'];
      const x = p.base[i * 3], y = p.base[i * 3 + 1];
      const a = p.wArm[i];
      sw[index.get(g.arm)] += a * (1 - p.wFore[i]);
      sw[index.get(g.fore)] += a * p.wFore[i];
      const legs = (1 - a) * p.wThigh[i];
      sw[index.get(g.thigh)] += legs * (1 - p.wKnee[i]);
      sw[index.get(g.shin)] += legs * p.wKnee[i];
      const r = Math.max(0, 1 - a - legs);
      const head = r * p.wHead[i];
      sw[index.get(neck)] += head;
      const torso = r - head;
      // Round the shoulder: skin near the joint follows the collarbone a little.
      const dS = Math.hypot(x - shoulderPt[s].x, y - shoulderPt[s].y) / H;
      const clav = torso * 0.6 * (1 - sm(0.03, 0.085, dS)) * sm(0.7, 0.76, (y - y0) / H);
      sw[index.get(g.clav)] += clav;
      const up = (torso - clav) * p.wUp[i];
      const chestW = up * sm(0.6, 0.7, (y - y0) / H);
      sw[index.get(chest)] += chestW;
      sw[index.get(spine)] += up - chestW;
      sw[index.get(hips)] += torso - clav - up;
      W.set(sw, i * NB);
    }
  });
  // Smooth the weights over the surface around the shoulders, neck and hips,
  // so the skin between two bones stretches evenly instead of folding.
  smoothWeights(rig.parts, NB, (p, i) => {
    const x = p.base[i * 3], y = p.base[i * 3 + 1], s = p.side[i];
    const dS = Math.hypot(x - shoulderPt[s].x, y - shoulderPt[s].y) / H;
    const dHip = Math.abs(y - hipY) / H, dNeck = Math.abs(y - rig.neckY) / H;
    return Math.max(1 - sm(0.05, 0.13, dS), 1 - sm(0.02, 0.06, dHip), 1 - sm(0.015, 0.04, dNeck)) * 0.55;
  });
  rig.parts.forEach((p) => {
    const n = p.wArm.length, W = p.W, skinIndex = p.skin.idx, skinWeight = p.skin.w;
    for (let i = 0; i < n; i++) {
      const top = [];
      for (let b = 0; b < NB; b++) if (W[i * NB + b] > 1e-4) top.push(b);
      top.sort((u, v) => W[i * NB + v] - W[i * NB + u]);
      let sum = 0;
      for (let j = 0; j < 4 && j < top.length; j++) sum += W[i * NB + top[j]];
      for (let j = 0; j < 4; j++) {
        const b = top[j];
        skinIndex[i * 4 + j] = b ?? 0;
        skinWeight[i * 4 + j] = b == null || !sum ? (j === 0 && !sum ? 1 : 0) : W[i * NB + b] / sum;
      }
    }
    // Swap the static mesh for a skinned one, its vertices in model space.
    const o = p.mesh;
    const geo = o.geometry.clone();
    geo.setAttribute('position', new T.BufferAttribute(p.base.slice(), 3));
    geo.setAttribute('normal', new T.BufferAttribute(p.nBase.slice(), 3));
    geo.setAttribute('skinIndex', new T.Uint16BufferAttribute(skinIndex, 4));
    geo.setAttribute('skinWeight', new T.Float32BufferAttribute(skinWeight, 4));
    geo.computeBoundingSphere();
    const mesh = new T.SkinnedMesh(geo, o.material);
    mesh.name = o.name;
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    o.parent?.remove(o);
    root.add(mesh);
    mesh.updateMatrixWorld(true);
    mesh.bind(skeleton, new T.Matrix4());
    p.mesh = mesh;
    p.W = null;
  });

  // ---- posing from the room's pose numbers
  const q = new T.Quaternion(), e = new T.Euler(), axis = new T.Vector3();
  const rot = (bone, x, y, z, order = 'XYZ') => bone.quaternion.setFromEuler(e.set(x, y, z, order));
  function pose(P) {
    // Lean (forward) then twist (turn), about the base of the spine.
    rot(spine, P.lean, P.twist, 0, 'XYZ');
    chest.position.copy(chest.userData.rest); chest.position.y += P.breath * 0.006 * H;
    chest.scale.set(1, 1, 1 + P.breath * 0.01);
    rot(neck, P.headPitch, P.headYaw, 0, 'XYZ');
    const hide = P.armsOnly ? 0.001 : 1;
    neck.scale.setScalar(hide);
    for (const k of ['L', 'R']) {
      const g = side[k], s = g.s;
      // A small shrug once the arm comes up past the shoulder.
      const shrug = 0.22 * sm(1.2, 2.6, P.armF[k]) + 0.12 * sm(-0.3, 0.4, P.armD[k]);
      rot(g.clav, 0, 0, s * shrug);
      // The arm: lowered from the A pose in the body's plane, then swung forward.
      g.arm.quaternion.setFromEuler(e.set(0, 0, s * (P.armD[k] - shrug), 'XYZ'));
      q.setFromAxisAngle(axis.set(1, 0, 0), -P.armF[k]);
      g.arm.quaternion.premultiply(q);
      g.fore.quaternion.setFromAxisAngle(g.hinge, P.elbow[k]);
      rot(g.thigh, -P.thigh[k], 0, 0);
      rot(g.shin, P.knee[k], 0, 0);
    }
  }

  // Where a skinned vertex (an anchor) is in the world, in the current bone pose.
  const v = new T.Vector3(), acc = new T.Vector3(), m = new T.Matrix4();
  function anchor(ref, out) {
    const p = rig.parts[ref.part], i = ref.i;
    v.set(p.base[i * 3], p.base[i * 3 + 1], p.base[i * 3 + 2]);
    acc.set(0, 0, 0);
    for (let j = 0; j < 4; j++) {
      const w = p.skin.w[i * 4 + j];
      if (!w) continue;
      const b = p.skin.idx[i * 4 + j];
      m.multiplyMatrices(bones[b].matrixWorld, skeleton.boneInverses[b]);
      acc.addScaledVector(out.copy(v).applyMatrix4(m), w);
    }
    return out.copy(acc);
  }
  // Refresh just the bone matrices (cheap; used inside the hand solver).
  function refresh() { hips.updateMatrixWorld(true); }

  return { bones, skeleton, side, hips, spine, chest, neck, pose, anchor, refresh };
}
