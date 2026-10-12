// 地車（だんじり）の3Dモデル。前方 = +x、右 = +z、上 = +y。
// 前に小屋根、後ろに大屋根。大工方は大屋根の前寄りに立つ。

import * as THREE from 'three';
import * as TX from './textures';

export const ROOF_TOP_Y = 4.05;
/** 大工方が立つ位置（大屋根の前寄り） */
export const RIDER_X = 0.25;

export interface DanjiriModel {
  root: THREE.Group;
  /** 傾き（片輪浮き・構造のたわみ）を掛けるノード */
  body: THREE.Group;
  wheels: THREE.Object3D[];
  /** 小屋根に立つもう一人の大工方 */
  partner: THREE.Group;
  lanterns: THREE.Mesh[];
}

function roofGeometry(halfW: number, rise: number, length: number, thickness: number): THREE.BufferGeometry {
  // 唐破風のような反りのある断面を前後方向へ押し出す
  const shape = new THREE.Shape();
  const N = 24;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N; // 0 = 左の軒先, 1 = 右の軒先
    const z = -halfW + 2 * halfW * t;
    const u = Math.abs(z) / halfW;
    // 棟は丸く、軒先は反り上がる
    const y = rise * (1 - Math.pow(u, 1.6)) + 0.12 * Math.pow(u, 6);
    pts.push(new THREE.Vector2(z, y));
  }
  shape.moveTo(pts[0].x, pts[0].y);
  for (const p of pts.slice(1)) shape.lineTo(p.x, p.y);
  for (let i = N; i >= 0; i--) shape.lineTo(pts[i].x * 0.97, pts[i].y - thickness);
  const g = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, steps: 1 });
  // 押し出し方向 (z) を前後方向 (x) に向ける
  g.rotateY(Math.PI / 2);
  g.translate(-length / 2, 0, 0);
  return g;
}

export function buildDanjiri(): DanjiriModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const wood = new THREE.MeshStandardMaterial({ map: TX.keyaki(), roughness: 0.62, metalness: 0.02 });
  const darkWood = new THREE.MeshStandardMaterial({ map: TX.keyaki(true), roughness: 0.7 });
  const carved = new THREE.MeshStandardMaterial({ map: TX.carving(), roughness: 0.75 });
  const roofMat = new THREE.MeshStandardMaterial({ map: TX.keyaki(true), color: '#c49a6c', roughness: 0.5, side: THREE.DoubleSide });
  const brass = new THREE.MeshStandardMaterial({ color: '#c9a44a', roughness: 0.32, metalness: 0.85 });
  const iron = new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.6, metalness: 0.5 });
  const cloth = new THREE.MeshStandardMaterial({ color: '#b8231d', roughness: 0.9 });

  const box = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = body) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };

  // 車輪（木の輪に鉄の帯）
  const wheels: THREE.Object3D[] = [];
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.2, 24);
  wheelGeo.rotateX(Math.PI / 2);
  const tireGeo = new THREE.TorusGeometry(0.41, 0.035, 6, 24);
  for (const x of [0.85, -0.85]) {
    for (const z of [0.98, -0.98]) {
      const w = new THREE.Group();
      const disc = new THREE.Mesh(wheelGeo, darkWood);
      disc.castShadow = true;
      w.add(disc);
      const tire = new THREE.Mesh(tireGeo, iron);
      w.add(tire);
      // 輻（スポーク代わりの板目）
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.06, 0.22), wood);
      w.add(spoke);
      w.position.set(x, 0.42, z);
      root.add(w);
      wheels.push(w);
    }
  }

  // 台木・腰回り
  box(4.3, 0.28, 0.26, darkWood, 0, 0.78, 0.95);
  box(4.3, 0.28, 0.26, darkWood, 0, 0.78, -0.95);
  box(0.3, 0.26, 2.2, darkWood, 1.95, 0.78, 0);
  box(0.3, 0.26, 2.2, darkWood, -1.95, 0.78, 0);
  // 前梃子・後梃子の受け（後ろへ長く出る梃子）
  box(2.6, 0.16, 0.16, darkWood, -3.2, 0.82, 0);
  box(0.16, 0.16, 1.6, darkWood, -4.45, 0.82, 0);
  // 土呂幕（下の彫物）
  box(3.3, 0.62, 2.05, carved, 0, 1.24, 0);
  // 縁と高欄
  box(3.9, 0.08, 2.6, wood, 0, 1.6, 0);
  for (const z of [1.28, -1.28]) {
    box(3.8, 0.06, 0.06, brass, 0, 1.92, z);
    for (let x = -1.8; x <= 1.81; x += 0.45) box(0.06, 0.32, 0.06, wood, x, 1.78, z);
  }
  for (const x of [1.9, -1.9]) box(0.06, 0.06, 2.56, brass, x, 1.92, 0);

  // 柱と枡合（中段の彫物）
  for (const x of [1.25, -1.25]) for (const z of [0.82, -0.82]) box(0.2, 1.5, 0.2, wood, x, 2.4, z);
  box(2.4, 0.95, 0.08, carved, 0, 2.45, 0.86);
  box(2.4, 0.95, 0.08, carved, 0, 2.45, -0.86);
  box(0.08, 0.95, 1.5, carved, -1.28, 2.45, 0);
  // 前の舞台（鳴物の太鼓）
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.5, 20), new THREE.MeshStandardMaterial({ color: '#e7dcc4', roughness: 0.6 }));
  drum.rotation.z = Math.PI / 2;
  drum.position.set(0.3, 2.05, 0);
  body.add(drum);
  box(0.52, 0.66, 0.66, cloth, 0.3, 2.05, 0).scale.set(1.02, 0.4, 1);

  // 小屋根（前・低い）
  const koyane = new THREE.Mesh(roofGeometry(1.35, 0.55, 1.5, 0.1), roofMat);
  koyane.position.set(1.35, 2.95, 0);
  koyane.castShadow = true;
  koyane.receiveShadow = true;
  body.add(koyane);
  box(1.5, 0.07, 0.12, brass, 1.35, 3.52, 0);
  // 大屋根（後ろ・高い）
  const ooyane = new THREE.Mesh(roofGeometry(1.55, 0.8, 2.8, 0.12), roofMat);
  ooyane.position.set(-0.55, ROOF_TOP_Y - 0.8, 0);
  ooyane.castShadow = true;
  ooyane.receiveShadow = true;
  body.add(ooyane);
  // 破風の金具と鬼板
  box(0.12, 0.38, 0.5, brass, 0.88, ROOF_TOP_Y - 0.05, 0);
  box(0.12, 0.38, 0.5, brass, -1.98, ROOF_TOP_Y - 0.05, 0);
  box(2.8, 0.06, 0.1, brass, -0.55, ROOF_TOP_Y + 0.02, 0);
  // 大屋根を支える柱
  for (const x of [0.6, -1.7]) for (const z of [1.0, -1.0]) box(0.16, 1.2, 0.16, wood, x, 3.05, z);
  // 見送り（後ろの彫物）
  box(0.1, 1.0, 1.8, carved, -2.0, 2.55, 0);

  // 提灯（軒下）
  const lanterns: THREE.Mesh[] = [];
  const lanMat = new THREE.MeshStandardMaterial({ map: TX.lantern(), emissive: '#ff6a2a', emissiveIntensity: 0.25, roughness: 0.6 });
  const lanGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.34, 12);
  for (const x of [1.9, 0.75]) {
    for (const z of [1.22, -1.22]) {
      const l = new THREE.Mesh(lanGeo, lanMat);
      l.position.set(x, x > 1 ? 2.75 : 3.0, z);
      body.add(l);
      lanterns.push(l);
    }
  }

  // 綱の付け根
  for (const z of [0.55, -0.55]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.025, 6, 12), iron);
    ring.position.set(2.12, 0.82, z);
    body.add(ring);
  }

  // 小屋根の大工方（相方）
  const partner = new THREE.Group();
  const happi = new THREE.MeshStandardMaterial({ color: '#1f3f8a', roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: '#c99a76', roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.16, 0.6, 8), happi);
  torso.position.y = 1.2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), skin);
  head.position.y = 1.64;
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.9, 8), new THREE.MeshStandardMaterial({ color: '#f1ede3' }));
  legs.position.y = 0.45;
  const fan = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16), new THREE.MeshStandardMaterial({ map: TX.uchiwa('浜'), side: THREE.DoubleSide }));
  fan.position.set(0.05, 1.82, 0.42);
  fan.rotation.y = Math.PI / 2;
  fan.name = 'fan';
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.6, 6), happi);
    arm.position.set(0, 1.42, side * 0.24);
    arm.rotation.x = side * -0.5;
    arm.name = side > 0 ? 'armR' : 'armL';
    partner.add(arm);
  }
  partner.add(torso, head, legs, fan);
  partner.traverse((o) => (o.castShadow = true));
  partner.position.set(1.85, 3.4, -0.78);
  partner.rotation.y = 0.5;
  body.add(partner);

  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });
  return { root, body, wheels, partner, lanterns };
}
