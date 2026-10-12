// キーボード・ゲームパッド・タッチの入力をまとめる。

import type { PlayerInput } from './sim/game';

const approach = (v: number, target: number, rate: number, dt: number) => {
  const d = target - v;
  const step = rate * dt;
  return Math.abs(d) <= step ? target : v + Math.sign(d) * step;
};

export class Input {
  private keys = new Set<string>();
  private jumpQueued = false;
  private steer = 0;
  private lean = 0;
  /** タッチ操作の状態 */
  touch = { pull: false, brake: false, steerL: false, steerR: false, lean: 0 };
  onToggleCamera: () => void = () => {};
  onToggleMute: () => void = () => {};
  onPause: () => void = () => {};

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) {
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
        return;
      }
      this.keys.add(e.code);
      if (e.code === 'Space') {
        this.jumpQueued = true;
        e.preventDefault();
      }
      if (e.code === 'KeyC') this.onToggleCamera();
      if (e.code === 'KeyM') this.onToggleMute();
      if (e.code === 'Escape' || e.code === 'KeyP') this.onPause();
      if (e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  queueJump(): void {
    this.jumpQueued = true;
  }

  private has(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }

  read(dt: number): PlayerInput {
    const pad = navigator.getGamepads?.().find((p) => p && p.connected) ?? null;
    let steerTarget = (this.has('KeyD') ? 1 : 0) - (this.has('KeyA') ? 1 : 0);
    let leanTarget = (this.has('ArrowRight') ? 1 : 0) - (this.has('ArrowLeft') ? 1 : 0);
    let pull = this.has('KeyW', 'ArrowUp');
    let brake = this.has('KeyS', 'ArrowDown');

    if (this.touch.steerL || this.touch.steerR) steerTarget = (this.touch.steerR ? 1 : 0) - (this.touch.steerL ? 1 : 0);
    if (this.touch.lean !== 0) leanTarget = this.touch.lean;
    pull ||= this.touch.pull;
    brake ||= this.touch.brake;

    let analogLean: number | null = null;
    if (pad) {
      const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);
      if (dz(pad.axes[0]) !== 0) steerTarget = dz(pad.axes[0]);
      if (dz(pad.axes[2] ?? 0) !== 0) analogLean = dz(pad.axes[2]);
      pull ||= (pad.buttons[7]?.value ?? 0) > 0.3 || !!pad.buttons[12]?.pressed;
      brake ||= (pad.buttons[6]?.value ?? 0) > 0.3 || !!pad.buttons[13]?.pressed;
      if (pad.buttons[0]?.pressed && !this.padJumpHeld) this.jumpQueued = true;
      this.padJumpHeld = !!pad.buttons[0]?.pressed;
    }

    // 団扇の合図は振りはじめてから強まる。体重移動はじわりと掛ける
    this.steer = approach(this.steer, steerTarget, steerTarget === 0 ? 5 : 3.2, dt);
    this.lean = analogLean ?? (this.touch.lean !== 0 ? this.touch.lean : approach(this.lean, leanTarget, leanTarget === 0 ? 4 : 2.2, dt));

    const jump = this.jumpQueued;
    this.jumpQueued = false;
    return { pull, brake, steer: this.steer, lean: this.lean, jump };
  }

  private padJumpHeld = false;
}
