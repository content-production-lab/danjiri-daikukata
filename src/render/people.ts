// 人の群れ（曳き手・見物人・梃子方）を InstancedMesh でまとめて描く。

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** 法被（はっぴ）の色。町ごとに揃える */
export const HAPPI_COLORS = ['#1f3f8a', '#1f3f8a', '#1f3f8a', '#f2efe6', '#b8231d'];

function bodyGeometry(): THREE.BufferGeometry {
  const torso = new THREE.CylinderGeometry(0.2, 0.17, 0.62, 8);
  torso.translate(0, 1.2, 0);
  const armL = new THREE.CylinderGeometry(0.06, 0.055, 0.55, 6);
  armL.rotateZ(0.25);
  armL.translate(-0.25, 1.18, 0);
  const armR = armL.clone();
  armR.rotateY(Math.PI);
  return mergeGeometries([torso, armL, armR]);
}

function legGeometry(): THREE.BufferGeometry {
  const l = new THREE.CylinderGeometry(0.075, 0.06, 0.88, 6);
  l.translate(-0.09, 0.45, 0);
  const r = l.clone();
  r.translate(0.18, 0, 0);
  const hips = new THREE.CylinderGeometry(0.18, 0.17, 0.2, 8);
  hips.translate(0, 0.86, 0);
  return mergeGeometries([l, r, hips]);
}

function headGeometry(): THREE.BufferGeometry {
  const h = new THREE.SphereGeometry(0.115, 10, 8);
  h.scale(1, 1.15, 1);
  h.translate(0, 1.66, 0);
  return h;
}

export class Crowd {
  readonly group = new THREE.Group();
  readonly count: number;
  private bodies: THREE.InstancedMesh;
  private legs: THREE.InstancedMesh;
  private heads: THREE.InstancedMesh;
  private bands: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3(1, 1, 1);

  constructor(count: number, colors: string[], castShadow = true) {
    this.count = count;
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    this.bodies = new THREE.InstancedMesh(bodyGeometry(), mat, count);
    this.legs = new THREE.InstancedMesh(legGeometry(), new THREE.MeshStandardMaterial({ color: '#22201f', roughness: 0.9 }), count);
    this.heads = new THREE.InstancedMesh(headGeometry(), new THREE.MeshStandardMaterial({ color: '#c99a76', roughness: 0.7 }), count);
    // 鉢巻
    const band = new THREE.CylinderGeometry(0.122, 0.122, 0.04, 10);
    band.translate(0, 1.71, 0);
    this.bands = new THREE.InstancedMesh(band, new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.8 }), count);
    const col = new THREE.Color();
    for (let i = 0; i < count; i++) {
      col.set(colors[i % colors.length]);
      col.offsetHSL(0, 0, (((i * 7919) % 13) / 13 - 0.5) * 0.08);
      this.bodies.setColorAt(i, col);
    }
    for (const mesh of [this.bodies, this.legs, this.heads, this.bands]) {
      mesh.castShadow = castShadow;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(mesh);
    }
  }

  /**
   * 1人の姿勢を設定する。
   * @param yaw three.js の rotation.y
   * @param lean 前傾（走る・引く）[rad]
   * @param bob 上下動 [m]
   */
  set(i: number, x: number, y: number, z: number, yaw: number, lean = 0, bob = 0, scale = 1): void {
    this.e.set(lean, yaw, 0, 'YXZ');
    this.q.setFromEuler(this.e);
    this.v.set(x, y + bob, z);
    this.sc.setScalar(scale);
    this.m.compose(this.v, this.q, this.sc);
    this.bodies.setMatrixAt(i, this.m);
    this.heads.setMatrixAt(i, this.m);
    this.bands.setMatrixAt(i, this.m);
    // 脚は傾けない
    this.e.set(0, yaw, 0, 'YXZ');
    this.q.setFromEuler(this.e);
    this.v.set(x, y, z);
    this.m.compose(this.v, this.q, this.sc);
    this.legs.setMatrixAt(i, this.m);
  }

  hide(i: number): void {
    this.m.makeScale(0, 0, 0);
    this.bodies.setMatrixAt(i, this.m);
    this.heads.setMatrixAt(i, this.m);
    this.bands.setMatrixAt(i, this.m);
    this.legs.setMatrixAt(i, this.m);
  }

  commit(): void {
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
    this.bands.instanceMatrix.needsUpdate = true;
    this.legs.instanceMatrix.needsUpdate = true;
  }
}
