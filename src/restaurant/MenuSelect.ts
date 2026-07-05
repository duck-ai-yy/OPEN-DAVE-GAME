import Phaser from 'phaser';
import { EventBus } from '../core/EventBus';
import { GameState } from '../core/GameState';
import { DataRegistry } from '../data/DataRegistry';
import { Events, GAME_WIDTH, GAME_HEIGHT, type RecipeDef } from '../core/types';

/** 上架菜品：营业期间只剩份数会变，菜谱定义不可变 */
export interface MenuItem {
  recipe: RecipeDef;
  servings: number;
}

/**
 * 结算菜谱解锁：default 直接解锁，firstCatch 看首捕记录。
 * 新解锁的写进 GameState.unlockedRecipes 并广播 RECIPE_UNLOCKED——
 * 以 unlockedRecipes 成员判重，保证每道菜一生只广播一次。
 * 返回当前全部已解锁菜谱（按数据表顺序）。
 */
export function syncUnlockedRecipes(): RecipeDef[] {
  const unlocked: RecipeDef[] = [];
  for (const recipe of DataRegistry.allRecipes()) {
    const ok =
      recipe.unlock.type === 'default' || GameState.firstCatches.includes(recipe.unlock.fishId);
    if (!ok) continue;
    if (!GameState.unlockedRecipes.includes(recipe.id)) {
      GameState.unlockedRecipes.push(recipe.id);
      EventBus.emit(Events.RECIPE_UNLOCKED, recipe.id);
    }
    unlocked.push(recipe);
  }
  return unlocked;
}

/** 库存是否够做一轮（一组 ingredients） */
export function canCook(recipe: RecipeDef, inventory: Record<string, number>): boolean {
  return recipe.ingredients.every((ing) => (inventory[ing.fishId] ?? 0) >= ing.count);
}

const MAX_DISHES = 3;

/**
 * 选菜界面：列出已解锁菜谱 → 勾选 ≤3 道 → 开业。
 * 确认时才扣食材（每道一轮：消耗一组 ingredients 产出 servings 份），
 * 之后把上架清单交回 RestaurantScene，本模块不管营业过程。
 */
export class MenuSelect {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private recipes: RecipeDef[];
  private selected = new Set<string>();
  private rowTexts = new Map<string, Phaser.GameObjects.Text>();
  private hintText!: Phaser.GameObjects.Text;
  private openBtn!: Phaser.GameObjects.Text;
  private onConfirm: (menu: MenuItem[]) => void;
  private onSkip: () => void;

  constructor(
    scene: Phaser.Scene,
    callbacks: { onConfirm: (menu: MenuItem[]) => void; onSkip: () => void },
  ) {
    this.scene = scene;
    this.onConfirm = callbacks.onConfirm;
    this.onSkip = callbacks.onSkip;
    this.recipes = syncUnlockedRecipes();
    this.container = scene.add.container(0, 0);
    this.build();
  }

  destroy(): void {
    this.container.destroy(true);
  }

  private build(): void {
    const title = this.scene.add
      .text(GAME_WIDTH / 2, 34, '—— 今晚菜单（最多 3 道） ——', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffd97d',
      })
      .setOrigin(0.5);
    this.container.add(title);

    let y = 58;
    for (const recipe of this.recipes) {
      const row = this.scene.add
        .text(46, y, '', {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#8bd3dd',
          backgroundColor: '#123047',
          padding: { x: 6, y: 3 },
        })
        .setInteractive({ useHandCursor: true });
      row.on('pointerdown', () => this.toggle(recipe));
      this.container.add(row);
      this.rowTexts.set(recipe.id, row);
      y += 22;
    }

    this.hintText = this.scene.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 76, '', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#9a8fa8',
      })
      .setOrigin(0.5);
    this.container.add(this.hintText);

    this.openBtn = this.makeButton(GAME_WIDTH / 2 - 150, GAME_HEIGHT - 44, '🔔 确认，开始营业', () =>
      this.confirm(),
    );
    this.makeButton(GAME_WIDTH / 2 + 30, GAME_HEIGHT - 44, '💰 直接卖掉多余渔获', () =>
      this.sellAllFish(),
    );
    this.makeButton(GAME_WIDTH / 2 + 220, GAME_HEIGHT - 44, '不营业，打烊', () => this.onSkip());

    this.refresh();
  }

  private makeButton(x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Text {
    const btn = this.scene.add
      .text(x, y, label, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#8bd3dd',
        backgroundColor: '#123047',
        padding: { x: 10, y: 5 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => btn.setColor('#ffffff'));
    btn.on('pointerout', () => btn.setColor('#8bd3dd'));
    btn.on('pointerdown', onClick);
    this.container.add(btn);
    return btn;
  }

  private toggle(recipe: RecipeDef): void {
    if (this.selected.has(recipe.id)) {
      this.selected.delete(recipe.id);
    } else {
      if (!canCook(recipe, GameState.inventory)) return;
      if (this.selected.size >= MAX_DISHES) return;
      this.selected.add(recipe.id);
    }
    this.refresh();
  }

  /** 刷新每行文案与可交互态：卖鱼/选择变化后统一走这里 */
  private refresh(): void {
    // 库存变化可能让已勾选的菜不再够料（例如刚卖掉了鱼）：先剔除
    for (const id of [...this.selected]) {
      const recipe = this.recipes.find((r) => r.id === id);
      if (!recipe || !canCook(recipe, GameState.inventory)) this.selected.delete(id);
    }

    for (const recipe of this.recipes) {
      const row = this.rowTexts.get(recipe.id);
      if (!row) continue;
      const cookable = canCook(recipe, GameState.inventory);
      const picked = this.selected.has(recipe.id);
      const ingredients = recipe.ingredients
        .map((ing) => {
          const fish = DataRegistry.getFish(ing.fishId);
          return `${fish.name}×${ing.count}(库存${GameState.inventory[ing.fishId] ?? 0})`;
        })
        .join(' + ');
      const mark = picked ? '☑' : '☐';
      row.setText(
        `${mark} ${recipe.name}  ${ingredients}  可做${cookable ? recipe.servings : 0}份  单价${recipe.price}`,
      );
      row.setColor(picked ? '#ffd97d' : cookable ? '#8bd3dd' : '#4a5a68');
      row.setBackgroundColor(picked ? '#2a4a67' : '#123047');
    }

    const sellTotal = this.sellableTotal();
    this.hintText.setText(
      `已选 ${this.selected.size}/${MAX_DISHES} 道 · 库存渔获折价可卖 ${sellTotal} 金币（sellPrice×0.5）`,
    );
    const canOpen = this.selected.size > 0;
    this.openBtn.setColor(canOpen ? '#8bd3dd' : '#4a5a68');
  }

  /** 库存全部渔获的折价总额（单条向下取整） */
  private sellableTotal(): number {
    let total = 0;
    for (const [fishId, count] of Object.entries(GameState.inventory)) {
      total += Math.floor(DataRegistry.getFish(fishId).sellPrice * 0.5) * count;
    }
    return total;
  }

  /** 卖鱼兜底：库存所有鱼按 sellPrice×0.5 折价清空换钱 */
  private sellAllFish(): void {
    const total = this.sellableTotal();
    if (total <= 0) return;
    for (const [fishId, count] of Object.entries(GameState.inventory)) {
      GameState.removeFromInventory(fishId, count);
    }
    GameState.addMoney(total);
    this.refresh();
  }

  private confirm(): void {
    if (this.selected.size === 0) return;
    const menu: MenuItem[] = [];
    for (const recipe of this.recipes) {
      if (!this.selected.has(recipe.id)) continue;
      // 再校验一次防御连点：任一食材不足则整道菜跳过
      if (!canCook(recipe, GameState.inventory)) continue;
      for (const ing of recipe.ingredients) {
        GameState.removeFromInventory(ing.fishId, ing.count);
      }
      menu.push({ recipe, servings: recipe.servings });
    }
    if (menu.length === 0) return;
    this.onConfirm(menu);
  }
}
