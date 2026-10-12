// ゲーム全体の進行（コース・地車・大工方・採点）。描画と入力には依存しない。

import { Course, MAIN_COURSE, type Corner, type CourseDef, type Vec2 } from './course';
import { DanjiriSim, SPEC, type DanjiriControls } from './danjiri';
import { RiderSim, type RoofMotion } from './rider';

export interface PlayerInput {
  /** 曳け（加速の合図） */
  pull: boolean;
  /** 止め（前梃子） */
  brake: boolean;
  /** 団扇の合図（-1..1） */
  steer: number;
  /** 体重移動（-1..1） */
  lean: number;
  /** 跳ぶ（押した瞬間） */
  jump: boolean;
}

export interface CornerResult {
  name: string;
  dir: 1 | -1;
  entryKmh: number;
  minKmh: number;
  avgKmh: number;
  hits: number;
  jumps: number;
  wheelLift: boolean;
  score: number;
  grade: string;
}

export type GameEvent =
  | { type: 'hit'; speed: number; kind: 'wall' | 'pole'; padded: boolean }
  | { type: 'slam'; strength: number }
  | { type: 'corner'; result: CornerResult }
  | { type: 'jump' }
  | { type: 'land'; offset: number }
  | { type: 'end'; reason: EndReason };

export type EndReason = 'goal' | 'fall' | 'overturn' | 'wrecked';

export interface GameOptions {
  /** 体重移動アシスト（0 = なし、1 = 全自動） */
  assist: number;
  course?: CourseDef;
}

const ZONE_BEFORE = 16;
const ZONE_AFTER = 14;
const FIXED_DT = 1 / 120;

interface ZoneTrack {
  corner: Corner;
  entryKmh: number;
  minKmh: number;
  sumKmh: number;
  n: number;
  hits: number;
  jumps: number;
  wheelLift: boolean;
}

export class Game {
  readonly course: Course;
  readonly danjiri = new DanjiriSim();
  readonly rider = new RiderSim();
  readonly opts: GameOptions;

  time = 0;
  /** 中心線上の進み [m] */
  s = 0;
  seg = 0;
  lateral = 0;
  /** 傷み（100 で曳行中止） */
  damage = 0;
  score = 0;
  results: CornerResult[] = [];
  ended: EndReason | null = null;
  events: GameEvent[] = [];
  /** 実際に効かせている合図（描画・音用） */
  control: DanjiriControls = { pull: 0, brake: 0, steer: 0 };
  /** 路面の突き上げ（描画用） */
  bump = 0;
  appliedLean = 0;
  ropeTarget: Vec2 = { x: 0, y: 0 };

  private zone: ZoneTrack | null = null;
  private nextCorner = 0;
  private acc = 0;
  private bumpPhase = 0;
  private rng = mulberry32(20261012);

  constructor(opts: GameOptions) {
    this.opts = opts;
    this.course = new Course(opts.course ?? MAIN_COURSE);
    const p = this.course.pointAt(4);
    this.danjiri.x = p.x;
    this.danjiri.y = p.y;
    this.danjiri.theta = Math.atan2(p.uy, p.ux);
    this.s = 4;
  }

  get kmh(): number {
    return this.danjiri.vf * 3.6;
  }

  get upcomingCorner(): Corner | null {
    return this.course.corners[this.nextCorner] ?? null;
  }

  /** 実時間 dt ぶん進める（内部は固定刻み） */
  update(dt: number, input: PlayerInput): void {
    this.acc += Math.min(dt, 0.1);
    let jump = input.jump;
    while (this.acc >= FIXED_DT) {
      this.acc -= FIXED_DT;
      this.tick(FIXED_DT, { ...input, jump });
      jump = false;
    }
  }

  tick(dt: number, input: PlayerInput): void {
    if (this.ended) {
      this.danjiri.step(dt, { pull: 0, brake: 1, steer: 0 }, this.ropeTarget);
      return;
    }
    this.time += dt;
    const d = this.danjiri;

    // 合図: 曳け → 全力、何もしない → 流す、止め → 綱を緩めて前梃子
    const pull = input.brake ? 0 : input.pull ? 1 : 0.42;
    this.control = { pull, brake: input.brake ? 1 : 0, steer: Math.max(-1, Math.min(1, input.steer)) };

    // 綱の先頭は、通りに沿って地車の少し先を走る
    const look = 7 + Math.max(0, d.vf) * 0.35;
    this.ropeTarget = this.course.ropeLineAt(this.s + look);
    d.step(dt, this.control, this.ropeTarget);

    this.handleCollisions();
    if (d.slam > 0.4) {
      this.events.push({ type: 'slam', strength: d.slam });
      this.rider.jolt(0, 0);
      this.rider.latRate += Math.sign(d.roll || 1) * d.slam * 0.8;
    }

    // 路面の継ぎ目・マンホールの突き上げ
    this.bumpPhase += Math.max(0, d.vf) * dt;
    this.bump *= Math.exp(-dt * 18);
    if (this.bumpPhase > 3.5) {
      this.bumpPhase -= 3.5 + this.rng() * 4;
      this.bump += (this.rng() - 0.3) * Math.min(1, d.vf / 5) * 6;
    }

    const roof: RoofMotion = { aRight: d.aRight, aFwd: d.aFwd, roll: d.roll, rollAcc: d.rollAcc, bump: this.bump };
    const assist = Math.max(0, Math.min(1, this.opts.assist));
    const lean = Math.max(-1, Math.min(1, input.lean + assist * RiderSim.assistLean(roof)));
    this.appliedLean = lean;
    const wasAir = this.rider.airborne;
    this.rider.step(dt, { lean, jump: input.jump }, roof);
    if (!wasAir && this.rider.airborne) {
      this.events.push({ type: 'jump' });
      if (this.zone) this.zone.jumps++;
    }
    if (this.rider.landedThisStep) this.events.push({ type: 'land', offset: this.rider.lastLandingOffset });

    const pr = this.course.project({ x: d.x, y: d.y }, this.seg);
    this.seg = pr.seg;
    this.s = Math.max(this.s - 2, pr.s);
    this.lateral = pr.lateral;
    this.trackCorners();

    if (this.rider.fallen) this.finish('fall');
    else if (d.overturned) this.finish('overturn');
    else if (this.damage >= 100) this.finish('wrecked');
    else if (this.s >= this.course.total - 8) this.finish('goal');
  }

  private handleCollisions(): void {
    const d = this.danjiri;
    let worst = 0;
    let worstKind: 'wall' | 'pole' = 'wall';
    let padded = false;
    for (const c of d.corners()) {
      const push = this.course.pushInside(c.p);
      if (!push) continue;
      const depth = Math.hypot(push.x, push.y);
      if (depth < 1e-6) continue;
      const v = d.applyContact(c.lf, c.lr, push.x / depth, push.y / depth, depth);
      if (v > worst) {
        worst = v;
        worstKind = 'wall';
      }
    }
    // 電柱（円）と車体（長方形）
    for (const pole of this.course.poles) {
      const dx = pole.x - d.x;
      const dy = pole.y - d.y;
      if (dx * dx + dy * dy > 16) continue;
      const c = Math.cos(d.theta);
      const s = Math.sin(d.theta);
      const lf = c * dx + s * dy;
      const lr = -s * dx + c * dy;
      const cf = Math.max(-SPEC.halfLength, Math.min(SPEC.halfLength, lf));
      const cr = Math.max(-SPEC.halfWidth, Math.min(SPEC.halfWidth, lr));
      const ex = lf - cf;
      const ey = lr - cr;
      const dist = Math.hypot(ex, ey);
      if (dist >= pole.r) continue;
      // 電柱から車体へ向かう法線（世界座標）
      let nf = -ex;
      let nr = -ey;
      let nl = dist;
      if (nl < 1e-6) {
        // 中心が車体の中に入った: 近い辺から押し出す
        const pf = SPEC.halfLength - Math.abs(lf);
        const prr = SPEC.halfWidth - Math.abs(lr);
        if (pf < prr) {
          nf = -Math.sign(lf);
          nr = 0;
        } else {
          nf = 0;
          nr = -Math.sign(lr);
        }
        nl = 1;
      }
      nf /= nl;
      nr /= nl;
      const nx = c * nf - s * nr;
      const ny = s * nf + c * nr;
      const depth = pole.r - dist;
      const v = d.applyContact(cf, cr, nx, ny, depth, pole.padded ? 0.15 : 0.35);
      if (v > worst) {
        worst = v;
        worstKind = 'pole';
        padded = pole.padded;
      }
    }
    if (worst > 0.6) {
      const soft = padded ? 0.5 : 1;
      this.damage += worst * worst * 0.95 * soft;
      this.rider.jolt(-d.aRight * 0.02 + (this.rng() - 0.5) * worst * 0.5, -worst * 0.35 * soft);
      this.events.push({ type: 'hit', speed: worst, kind: worstKind, padded });
      if (this.zone && worst > 1.2) this.zone.hits++;
      this.score -= Math.round(worst * 40);
    }
  }

  private trackCorners(): void {
    const corner = this.course.corners[this.nextCorner];
    const kmh = Math.max(0, this.kmh);
    if (!this.zone && corner && this.s >= corner.s - ZONE_BEFORE) {
      this.zone = { corner, entryKmh: kmh, minKmh: kmh, sumKmh: 0, n: 0, hits: 0, jumps: 0, wheelLift: false };
    }
    const z = this.zone;
    if (!z) return;
    z.minKmh = Math.min(z.minKmh, kmh);
    z.sumKmh += kmh;
    z.n++;
    if (this.danjiri.roll !== 0) z.wheelLift = true;
    if (this.s >= z.corner.s + ZONE_AFTER) {
      const result = scoreCorner(z);
      this.results.push(result);
      this.score += result.score;
      this.events.push({ type: 'corner', result });
      this.zone = null;
      this.nextCorner++;
    }
  }

  private finish(reason: EndReason): void {
    if (this.ended) return;
    this.ended = reason;
    if (reason === 'goal') {
      // 宮入りの時間ボーナス（標準 150 秒）
      this.score += Math.max(0, Math.round((150 - this.time) * 20));
      this.score += Math.max(0, Math.round((100 - this.damage) * 5));
    }
    this.events.push({ type: 'end', reason });
  }

  drainEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}

export function scoreCorner(z: {
  corner: Corner;
  entryKmh: number;
  minKmh: number;
  sumKmh: number;
  n: number;
  hits: number;
  jumps: number;
  wheelLift: boolean;
}): CornerResult {
  const avg = z.n ? z.sumKmh / z.n : 0;
  let score = Math.round(z.minKmh * 25 + avg * 12);
  if (z.hits === 0) score += 400;
  else score -= 250 * z.hits;
  score += z.jumps * Math.round(150 + avg * 12);
  if (z.wheelLift && z.hits === 0) score += 200;
  score = Math.max(0, score);
  const grade =
    z.hits > 0 && score < 400
      ? 'あかん'
      : score >= 1350
        ? '極'
        : score >= 1050
          ? '見事'
          : score >= 800
            ? 'ええで'
            : 'まだまだ';
  return {
    name: z.corner.name,
    dir: z.corner.dir,
    entryKmh: z.entryKmh,
    minKmh: z.minKmh,
    avgKmh: avg,
    hits: z.hits,
    jumps: z.jumps,
    wheelLift: z.wheelLift,
    score,
    grade,
  };
}

/** 再現できる乱数 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
