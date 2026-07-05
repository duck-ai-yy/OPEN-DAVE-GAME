import { EventBus } from '../../core/EventBus';
import { Events } from '../../core/types';

/**
 * 氧气 = 生命 + 时间 + 探索预算：持续消耗（基础 1/s × 深度带系数），
 * 受击扣氧而非扣血。归零发 PLAYER_RESCUED（只发一次），救援流程由场景处理。
 */
export class OxygenSystem {
  readonly max: number;
  current: number;

  private static readonly BASE_DRAIN_PER_S = 1;
  private rescued = false;
  private lastEmitted = -1;

  constructor(max: number) {
    this.max = max;
    this.current = max;
    this.emit();
  }

  update(dtMs: number, drainMul: number): void {
    if (this.rescued) return;
    this.current = Math.max(0, this.current - OxygenSystem.BASE_DRAIN_PER_S * drainMul * (dtMs / 1000));
    this.emitIfChanged();
    if (this.current <= 0) {
      this.rescued = true;
      EventBus.emit(Events.PLAYER_RESCUED);
    }
  }

  damage(amount: number): void {
    if (this.rescued) return;
    this.current = Math.max(0, this.current - amount);
    this.emitIfChanged();
    if (this.current <= 0) {
      this.rescued = true;
      EventBus.emit(Events.PLAYER_RESCUED);
    }
  }

  /** 整数位变化才广播，避免每帧刷 UI */
  private emitIfChanged(): void {
    const rounded = Math.ceil(this.current);
    if (rounded !== this.lastEmitted) this.emit();
  }

  private emit(): void {
    this.lastEmitted = Math.ceil(this.current);
    EventBus.emit(Events.OXYGEN_CHANGED, { current: this.current, max: this.max });
  }
}
