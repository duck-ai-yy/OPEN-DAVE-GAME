import { EventBus } from './EventBus';
import { Events, type SaveData } from './types';

/**
 * 跨场景游戏状态单例 —— 存档序列化的唯一事实来源。
 * 场景只做表现层；金钱/库存/天数/升级都在这里。
 */
class GameStateImpl {
  day = 1;
  money = 0;
  upgrades: string[] = [];
  inventory: Record<string, number> = {};
  unlockedRecipes: string[] = [];
  firstCatches: string[] = [];
  /** 已解锁地域；red_sea 为初始免费地域 */
  unlockedRegions: string[] = ['red_sea'];
  /** 同屏双人开关（运行时状态，不进存档；F2 drop-in 后跨潜保持） */
  coopEnabled = false;
  /** 生物碎片库存（捕获即得、救援不丢） */
  fragments: Record<string, number> = {};
  /** 保护动物好感度（喂食累积，满值成为伙伴） */
  affinity: Record<string, number> = {};

  addAffinity(fishId: string): number {
    this.affinity[fishId] = (this.affinity[fishId] ?? 0) + 1;
    return this.affinity[fishId];
  }

  addFragment(fragmentId: string, count = 1): void {
    this.fragments[fragmentId] = (this.fragments[fragmentId] ?? 0) + count;
  }

  spendFragments(fragmentId: string, count: number): boolean {
    const have = this.fragments[fragmentId] ?? 0;
    if (have < count) return false;
    if (have === count) delete this.fragments[fragmentId];
    else this.fragments[fragmentId] = have - count;
    return true;
  }

  addMoney(amount: number): void {
    this.money += amount;
    EventBus.emit(Events.MONEY_CHANGED, this.money);
  }

  spendMoney(amount: number): boolean {
    if (this.money < amount) return false;
    this.money -= amount;
    EventBus.emit(Events.MONEY_CHANGED, this.money);
    return true;
  }

  addCatch(fishId: string, count = 1): void {
    this.inventory[fishId] = (this.inventory[fishId] ?? 0) + count;
    if (!this.firstCatches.includes(fishId)) {
      this.firstCatches.push(fishId);
    }
  }

  removeFromInventory(fishId: string, count: number): boolean {
    const have = this.inventory[fishId] ?? 0;
    if (have < count) return false;
    if (have === count) delete this.inventory[fishId];
    else this.inventory[fishId] = have - count;
    return true;
  }

  hasUpgrade(id: string): boolean {
    return this.upgrades.includes(id);
  }

  nextDay(): void {
    this.day += 1;
    EventBus.emit(Events.DAY_ENDED, this.day);
  }

  toSave(): SaveData {
    return {
      version: 1,
      day: this.day,
      money: this.money,
      upgrades: [...this.upgrades],
      inventory: { ...this.inventory },
      unlockedRecipes: [...this.unlockedRecipes],
      firstCatches: [...this.firstCatches],
      unlockedRegions: [...this.unlockedRegions],
      fragments: { ...this.fragments },
      affinity: { ...this.affinity },
    };
  }

  loadFrom(save: SaveData): void {
    this.day = save.day;
    this.money = save.money;
    this.upgrades = [...save.upgrades];
    this.inventory = { ...save.inventory };
    this.unlockedRecipes = [...save.unlockedRecipes];
    this.firstCatches = [...save.firstCatches];
    this.unlockedRegions = [...save.unlockedRegions];
    this.fragments = { ...save.fragments };
    this.affinity = { ...save.affinity };
  }

  hasRegion(id: string): boolean {
    return this.unlockedRegions.includes(id);
  }

  reset(): void {
    this.day = 1;
    this.money = 0;
    this.upgrades = [];
    this.inventory = {};
    this.unlockedRecipes = [];
    this.firstCatches = [];
    this.unlockedRegions = ['red_sea'];
    this.fragments = {};
    this.affinity = {};
  }
}

export const GameState = new GameStateImpl();
