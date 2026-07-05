import { EventBus } from '../../core/EventBus';
import { Events } from '../../core/types';
import { DataRegistry } from '../../data/DataRegistry';
import { GameState } from '../../core/GameState';

/**
 * 本潜渔获（潜水局部）：上岸成功才 commit 进 GameState；
 * 氧尽救援只保留一件——这是死亡惩罚成立的关键，所以不能边捕边入账。
 * 无硬上限：超过 weightMax 进入超重（移速惩罚由场景侧作用于 Player）。
 */
export class InventorySystem {
  readonly weightMax: number;
  readonly catches: string[] = [];
  totalWeight = 0;

  constructor(weightMax: number) {
    this.weightMax = weightMax;
    const onCaught = ({ fishId }: { fishId: string }) => this.addCatch(fishId);
    EventBus.on(Events.FISH_CAUGHT, onCaught);
    this.dispose = () => EventBus.off(Events.FISH_CAUGHT, onCaught);
    this.emit();
  }

  readonly dispose: () => void;

  get overweight(): boolean {
    return this.totalWeight > this.weightMax;
  }

  private addCatch(fishId: string): void {
    this.catches.push(fishId);
    this.totalWeight += DataRegistry.getFish(fishId).weight;
    this.emit();
  }

  /** 上岸成功：全部入账 */
  commitAll(): void {
    for (const id of this.catches) GameState.addCatch(id);
    this.catches.length = 0;
  }

  /** 救援：只保留一件 */
  commitOne(fishId: string): void {
    if (this.catches.includes(fishId)) GameState.addCatch(fishId);
    this.catches.length = 0;
  }

  private emit(): void {
    EventBus.emit(Events.WEIGHT_CHANGED, { current: this.totalWeight, max: this.weightMax });
  }
}
