// 町並み（家・電柱・提灯・見物人・宮）を作る。

import * as THREE from 'three';
import type { Course, Vec2 } from '../sim/course';
import { mulberry32 } from '../sim/game';
import * as TX from './textures';
import { Crowd } from './people';

const SETBACK = 1.7; // 道の端から家の正面まで（見物人が立つ）

export interface World {
  group: THREE.Group;
  spectators: Crowd;
  spectatorSpots: { x: number; z: number; yaw: number; s: number }[];
  goal: THREE.Group;
}

/** 切妻屋根の単位形状（長さ x・奥行き z・高さ y がそれぞれ 1、中心が原点） */
function gableGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, -0.5);
  shape.lineTo(0.5, -0.5);
  shape.lineTo(0, 0.5);
  shape.lineTo(-0.5, -0.5);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  g.rotateY(Math.PI / 2);
  return g;
}

/** 平面座標 (x, y) → three.js (x, 0, z) */
const w3 = (p: Vec2, h = 0) => new THREE.Vector3(p.x, h, p.y);

export function buildWorld(course: Course): World {
  const group = new THREE.Group();
  const rnd = mulberry32(7);

  // 地面
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 1200),
    new THREE.MeshStandardMaterial({ map: TX.asphalt(), roughness: 0.95, color: '#9a9a9a' }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // 道の端の白線と、見物人との境の綱
  const lineMat = new THREE.MeshBasicMaterial({ color: '#d8d4c8' });
  const fenceMat = new THREE.MeshStandardMaterial({ color: '#e8e0c8', roughness: 0.9 });
  for (const sg of course.segs) {
    for (const side of [-1, 1]) {
      // 道の外側が本当に道でない区間だけを境にする（角で脇道をふさがない）
      const runs: [number, number][] = [];
      let runStart: number | null = null;
      for (let t = -sg.hw; t <= sg.len + sg.hw + 0.01; t += 0.5) {
        const off = sg.hw + 0.3;
        const px = sg.a.x + sg.ux * t - sg.uy * off * side;
        const py = sg.a.y + sg.uy * t + sg.ux * off * side;
        const edge = !course.inside({ x: px, y: py });
        if (edge && runStart === null) runStart = t;
        if ((!edge || t + 0.5 > sg.len + sg.hw + 0.01) && runStart !== null) {
          runs.push([runStart, edge ? t : t - 0.5]);
          runStart = null;
        }
      }
      for (const [t0, t1] of runs) {
        const len = t1 - t0;
        if (len < 0.5) continue;
        const tm = (t0 + t1) / 2;
        const at = (off: number) => ({ x: sg.a.x + sg.ux * tm - sg.uy * off * side, y: sg.a.y + sg.uy * tm + sg.ux * off * side });
        const line = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.15), lineMat);
        line.rotation.x = -Math.PI / 2;
        line.rotation.z = -Math.atan2(sg.uy, sg.ux);
        line.position.copy(w3(at(sg.hw), 0.012));
        group.add(line);
        // 見物人との境の綱と杭
        const fence = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 5), fenceMat);
        fence.rotation.order = 'YXZ';
        fence.rotation.set(0, -Math.atan2(sg.uy, sg.ux), Math.PI / 2);
        fence.position.copy(w3(at(sg.hw + 0.35), 0.85));
        group.add(fence);
        for (let t = t0; t <= t1; t += 4) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.95, 0.06), fenceMat);
          const pp = { x: sg.a.x + sg.ux * t - sg.uy * (sg.hw + 0.35) * side, y: sg.a.y + sg.uy * t + sg.ux * (sg.hw + 0.35) * side };
          post.position.copy(w3(pp, 0.47));
          group.add(post);
        }
      }
    }
  }

  // 家並み: 各区間の両側に、道に食い込まない家を並べる
  const houses: { x: number; z: number; w: number; d: number; h: number; yaw: number }[] = [];
  const footprintOk = (cx: number, cy: number, ux: number, uy: number, w: number, d: number) => {
    for (const [a, b] of [
      [-w / 2, -d / 2],
      [w / 2, -d / 2],
      [-w / 2, d / 2],
      [w / 2, d / 2],
      [0, -d / 2],
    ]) {
      const px = cx + ux * a - uy * b;
      const py = cy + uy * a + ux * b;
      if (course.inside({ x: px, y: py }, -SETBACK + 0.05)) return false;
    }
    return true;
  };
  for (const sg of course.segs) {
    for (const side of [-1, 1]) {
      let t = -sg.hw - 30;
      while (t < sg.len + sg.hw + 30) {
        const w = 5 + rnd() * 4.5;
        const d = 9 + rnd() * 4;
        const off = sg.hw + SETBACK + d / 2;
        const cx = sg.a.x + sg.ux * (t + w / 2) - sg.uy * off * side;
        const cy = sg.a.y + sg.uy * (t + w / 2) + sg.ux * off * side;
        if (footprintOk(cx, cy, sg.ux, sg.uy, w - 0.1, d)) {
          houses.push({ x: cx, z: cy, w: w - 0.15, d, h: 6 + rnd() * 2.6, yaw: -Math.atan2(sg.uy, sg.ux) });
        }
        t += w;
      }
    }
  }
  // 出発点の後ろは家でふさぐ
  {
    const sg = course.segs[0];
    const d = 10;
    const back = sg.hw + SETBACK + d / 2;
    for (let n = -sg.hw - 12; n < sg.hw + 12; ) {
      const w = 5 + rnd() * 3;
      const off = n + w / 2;
      const cx = sg.a.x - sg.ux * back - sg.uy * off;
      const cy = sg.a.y - sg.uy * back + sg.ux * off;
      houses.push({ x: cx, z: cy, w: w - 0.15, d, h: 6 + rnd() * 2.6, yaw: -Math.atan2(sg.ux, -sg.uy) });
      n += w;
    }
  }
  const wallMat = new THREE.MeshStandardMaterial({ map: TX.machiya(), roughness: 0.85 });
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), wallMat, houses.length);
  const roofGeo = gableGeometry();
  const roofs = new THREE.InstancedMesh(roofGeo, new THREE.MeshStandardMaterial({ map: TX.roofTiles(), roughness: 0.6 }), houses.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  houses.forEach((h, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), h.yaw);
    m.compose(new THREE.Vector3(h.x, h.h / 2, h.z), q, new THREE.Vector3(h.w, h.h, h.d));
    walls.setMatrixAt(i, m);
    col.setHSL(0.08 + rnd() * 0.04, 0.12 + rnd() * 0.15, 0.62 + rnd() * 0.2);
    walls.setColorAt(i, col);
    m.compose(new THREE.Vector3(h.x, h.h + 1.1, h.z), q, new THREE.Vector3(h.w + 0.5, 2.2, h.d + 0.8));
    roofs.setMatrixAt(i, m);
  });
  walls.castShadow = walls.receiveShadow = true;
  roofs.castShadow = true;
  group.add(walls, roofs);

  // 電柱と電線
  const poleMat = new THREE.MeshStandardMaterial({ color: '#8f8b84', roughness: 0.8 });
  const padMat = new THREE.MeshStandardMaterial({ color: '#d14b3c', roughness: 0.95 });
  const wire = new THREE.LineBasicMaterial({ color: '#1a1a1a' });
  const tops: { p: THREE.Vector3; line: number }[] = [];
  for (const p of course.poles) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 10, 8), poleMat);
    pole.position.set(p.x, 5, p.y);
    pole.castShadow = true;
    group.add(pole);
    if (p.padded) {
      // やりまわしの角の電柱には布団を巻く
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 2.6, 12), padMat);
      pad.position.set(p.x, 1.4, p.y);
      pad.castShadow = true;
      group.add(pad);
    } else {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.08), poleMat);
      arm.position.set(p.x, 9.2, p.y);
      group.add(arm);
      tops.push({ p: new THREE.Vector3(p.x, 9.2, p.y), line: p.line });
    }
  }
  // 同じ並びの隣どうしを電線でつなぐ
  const wirePts: THREE.Vector3[] = [];
  for (let i = 0; i + 1 < tops.length; i++) {
    const a = tops[i];
    const b = tops[i + 1];
    if (a.line !== b.line) continue;
    for (const dy of [0, -0.5]) {
      for (let k = 0; k < 8; k++) {
        const pa = a.p.clone().lerp(b.p, k / 8);
        pa.y += dy - Math.sin((k / 8) * Math.PI) * 0.6;
        const pb = a.p.clone().lerp(b.p, (k + 1) / 8);
        pb.y += dy - Math.sin(((k + 1) / 8) * Math.PI) * 0.6;
        wirePts.push(pa, pb);
      }
    }
  }
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wirePts), wire));

  // 通りを横切る提灯の列
  const lanGeo = new THREE.SphereGeometry(0.22, 10, 8);
  lanGeo.scale(1, 1.3, 1);
  const lanSpots: THREE.Vector3[] = [];
  for (const sg of course.segs) {
    for (let t = 18; t < sg.len - 12; t += 22) {
      const cx = sg.a.x + sg.ux * t;
      const cy = sg.a.y + sg.uy * t;
      const span = sg.hw + SETBACK;
      for (let k = -4; k <= 4; k++) {
        const a = k / 4.5;
        lanSpots.push(new THREE.Vector3(cx - sg.uy * span * a, 6.8 - (1 - a * a) * 0.7, cy + sg.ux * span * a));
      }
    }
  }
  const lanterns = new THREE.InstancedMesh(
    lanGeo,
    new THREE.MeshStandardMaterial({ map: TX.lantern(), emissive: '#ff5a1e', emissiveIntensity: 0.35 }),
    lanSpots.length,
  );
  lanSpots.forEach((p, i) => lanterns.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)));
  group.add(lanterns);

  // 見物人（家の前に並ぶ）
  const spots: World['spectatorSpots'] = [];
  for (const sg of course.segs) {
    for (const side of [-1, 1]) {
      for (let t = -sg.hw + 1; t < sg.len + sg.hw; t += 0.75 + rnd() * 0.9) {
        const off = sg.hw + 0.5 + rnd() * (SETBACK - 0.7);
        const x = sg.a.x + sg.ux * t - sg.uy * off * side;
        const y = sg.a.y + sg.uy * t + sg.ux * off * side;
        if (course.inside({ x, y }, -0.25)) continue;
        // 道の方を向く
        const yaw = Math.atan2(sg.uy * side, -sg.ux * side);
        spots.push({ x, z: y, yaw, s: sg.s0 + Math.max(0, Math.min(sg.len, t)) });
      }
    }
  }
  const SPECTATOR_COLORS = ['#3b4a63', '#a33a2f', '#e1dccf', '#5e6b3a', '#2d2d33', '#c7a35b', '#7a4f8c', '#1f3f8a'];
  const spectators = new Crowd(spots.length, SPECTATOR_COLORS, false);
  spots.forEach((p, i) => spectators.set(i, p.x, 0, p.z, p.yaw, 0, 0, 0.92 + ((i * 37) % 11) / 60));
  spectators.commit();
  group.add(spectators.group);

  // 宮（ゴール）: 鳥居と社殿
  const goal = new THREE.Group();
  const last = course.segs[course.segs.length - 1];
  const torii = new THREE.MeshStandardMaterial({ color: '#c8361f', roughness: 0.6 });
  const gx = last.b.x;
  const gy = last.b.y;
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 8, 16), torii);
    post.position.set(-last.uy * 4.2 * side, 4, last.ux * 4.2 * side);
    goal.add(post);
  }
  const kasagi = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 11.5), new THREE.MeshStandardMaterial({ color: '#1d1d1d' }));
  kasagi.position.y = 8.1;
  const nuki = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 10), torii);
  nuki.position.y = 6.6;
  kasagi.rotation.y = nuki.rotation.y = -Math.atan2(last.uy, last.ux);
  goal.add(kasagi, nuki);
  const shrine = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 14), new THREE.MeshStandardMaterial({ map: TX.keyaki(true), roughness: 0.8 }));
  shrine.position.set(last.ux * 26, 3, last.uy * 26);
  const shrineRoof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ map: TX.roofTiles(), color: '#6f8a6a' }));
  shrineRoof.scale.set(12, 4, 17);
  shrineRoof.position.set(last.ux * 26, 8, last.uy * 26);
  goal.add(shrine, shrineRoof);
  goal.position.set(gx, 0, gy);
  goal.traverse((o) => (o.castShadow = true));
  group.add(goal);

  return { group, spectators, spectatorSpots: spots, goal };
}
