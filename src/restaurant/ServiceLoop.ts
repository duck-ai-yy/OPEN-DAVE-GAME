import Phaser from 'phaser';
import { GameState } from '../core/GameState';
import { GAME_WIDTH, GAME_HEIGHT } from '../core/types';
import type { MenuItem } from './MenuSelect';

/** 单道菜的营业战报 */
export interface SaleRecord {
  recipeId: string;
  name: string;
  price: number;
  sold: number;
}

const MAX_CUSTOMERS = 20;

/**
 * 营业演出：顾客按 1~2 秒节奏进店，随机吃一份在售菜品，
 * 金币实时入账（GameState.addMoney，MONEY_CHANGED 由其广播）。
 * 结束条件：全部售罄 或 到店 20 位。演出用 tween/timer，
 * 场景关闭时随 scene 一起销毁，不持有跨场景状态。
 */
export class ServiceLoop {
  private scene: Phaser.Scene;
  private menu: MenuItem[];
  private records: SaleRecord[];
  private onFinish: (records: SaleRecord[], total: number) => void;

  private container: Phaser.GameObjects.Container;
  private stockTexts: Phaser.GameObjects.Text[] = [];
  private customerText!: Phaser.GameObjects.Text;
  private customers = 0;
  private total = 0;
  private finished = false;

  constructor(
    scene: Phaser.Scene,
    menu: MenuItem[],
    onFinish: (records: SaleRecord[], total: number) => void,
  ) {
    this.scene = scene;
    this.menu = menu;
    this.onFinish = onFinish;
    this.records = menu.map((m) => ({
      recipeId: m.recipe.id,
      name: m.recipe.name,
      price: m.recipe.price,
      sold: 0,
    }));
    this.container = scene.add.container(0, 0);
    this.build();
    this.scheduleNext();
  }

  destroy(): void {
    this.container.destroy(true);
  }

  private build(): void {
    const title = this.scene.add
      .text(GAME_WIDTH / 2, 34, '—— 营业中 ——', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffd97d',
      })
      .setOrigin(0.5);
    this.container.add(title);

    // 吧台：顾客走到这条线前吃完弹飘字
    const counter = this.scene.add.rectangle(GAME_WIDTH / 2, 210, 360, 6, 0x123047);
    this.container.add(counter);

    this.menu.forEach((_item, i) => {
      const t = this.scene.add
        .text(GAME_WIDTH / 2 - 170 + i * 130, 70, '', {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#8bd3dd',
          backgroundColor: '#123047',
          padding: { x: 6, y: 4 },
        })
        .setOrigin(0, 0);
      this.container.add(t);
      this.stockTexts.push(t);
    });

    this.customerText = this.scene.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 30, '', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#9a8fa8',
      })
      .setOrigin(0.5);
    this.container.add(this.customerText);

    this.refreshBoard();
  }

  private refreshBoard(): void {
    this.menu.forEach((item, i) => {
      const t = this.stockTexts[i];
      t.setText(`${item.recipe.name}\n剩 ${item.servings} 份 · ${item.recipe.price}金`);
      if (item.servings === 0) t.setColor('#4a5a68');
    });
    this.customerText.setText(`顾客 ${this.customers}/${MAX_CUSTOMERS} · 今晚已入账 ${this.total} 金币`);
  }

  private scheduleNext(): void {
    if (this.finished) return;
    if (this.customers >= MAX_CUSTOMERS || this.menu.every((m) => m.servings === 0)) {
      this.finish();
      return;
    }
    this.scene.time.delayedCall(Phaser.Math.Between(1000, 2000), () => this.spawnCustomer());
  }

  private spawnCustomer(): void {
    if (this.finished) return;
    const available = this.menu.filter((m) => m.servings > 0);
    if (available.length === 0) {
      this.finish();
      return;
    }
    this.customers += 1;
    const pick = Phaser.Math.RND.pick(available);
    pick.servings -= 1;
    const record = this.records.find((r) => r.recipeId === pick.recipe.id);
    if (record) record.sold += 1;

    const targetX = Phaser.Math.Between(GAME_WIDTH / 2 - 160, GAME_WIDTH / 2 + 160);
    const icon = this.scene.add
      .text(-16, 196, '🙂', { fontSize: '14px' })
      .setOrigin(0.5);
    this.container.add(icon);
    this.scene.tweens.add({
      targets: icon,
      x: targetX,
      duration: 500,
      ease: 'Sine.easeOut',
      onComplete: () => {
        // 到吧台才算成交：飘字 + 入账，避免动画未完成钱先到
        this.total += pick.recipe.price;
        GameState.addMoney(pick.recipe.price);
        this.popPrice(targetX, pick.recipe.price);
        this.refreshBoard();
        this.scene.tweens.add({
          targets: icon,
          alpha: 0,
          y: 230,
          delay: 500,
          duration: 300,
          onComplete: () => icon.destroy(),
        });
      },
    });
    this.refreshBoard();
    this.scheduleNext();
  }

  private popPrice(x: number, price: number): void {
    const pop = this.scene.add
      .text(x, 184, `+${price}`, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#ffd97d',
      })
      .setOrigin(0.5);
    this.container.add(pop);
    this.scene.tweens.add({
      targets: pop,
      y: 160,
      alpha: 0,
      duration: 800,
      ease: 'Sine.easeOut',
      onComplete: () => pop.destroy(),
    });
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    // 留一拍让最后一位顾客的飘字播完再切收入面板
    this.scene.time.delayedCall(1200, () => this.onFinish(this.records, this.total));
  }
}
