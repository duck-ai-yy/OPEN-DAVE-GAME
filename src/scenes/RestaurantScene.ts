import Phaser from 'phaser';
import { EventBus } from '../core/EventBus';
import { GameState } from '../core/GameState';
import { SaveManager } from '../core/SaveManager';
import { Events, GAME_WIDTH, GAME_HEIGHT } from '../core/types';
import { MenuSelect, type MenuItem } from '../restaurant/MenuSelect';
import { ServiceLoop, type SaleRecord } from '../restaurant/ServiceLoop';

/**
 * 晚间餐厅编排：选菜（MenuSelect）→ 营业（ServiceLoop）→ 收入面板 → 打烊。
 * 三阶段互不引用，只通过本场景的回调串联；金钱变动一律走 GameState。
 */
export class RestaurantScene extends Phaser.Scene {
  private menuSelect?: MenuSelect;
  private serviceLoop?: ServiceLoop;
  private moneyText!: Phaser.GameObjects.Text;

  constructor() {
    super('Restaurant');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#241a2e');
    this.add
      .text(14, 10, `第 ${GameState.day} 天 · 晚间营业`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffd97d',
      });
    this.moneyText = this.add
      .text(GAME_WIDTH - 14, 10, `金币 ${GameState.money}`, {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffd97d',
      })
      .setOrigin(1, 0);

    // 全局总线的监听必须随场景关闭移除，否则重进餐厅会叠加
    const onMoney = (money: number) => this.moneyText.setText(`金币 ${money}`);
    EventBus.on(Events.MONEY_CHANGED, onMoney);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      EventBus.off(Events.MONEY_CHANGED, onMoney);
    });

    this.menuSelect = new MenuSelect(this, {
      onConfirm: (menu) => this.startService(menu),
      onSkip: () => this.closeDay(),
    });
  }

  private startService(menu: MenuItem[]): void {
    this.menuSelect?.destroy();
    this.menuSelect = undefined;
    this.serviceLoop = new ServiceLoop(this, menu, (records, total) =>
      this.showSummary(records, total),
    );
  }

  private showSummary(records: SaleRecord[], total: number): void {
    this.serviceLoop?.destroy();
    this.serviceLoop = undefined;

    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 340, 220, 0x123047, 0.96);
    this.add
      .text(GAME_WIDTH / 2, 92, '—— 今日收入 ——', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffd97d',
      })
      .setOrigin(0.5);

    let y = 120;
    for (const r of records) {
      this.add
        .text(GAME_WIDTH / 2, y, `${r.name} × ${r.sold} 份 = ${r.sold * r.price} 金币`, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#8bd3dd',
        })
        .setOrigin(0.5);
      y += 18;
    }
    this.add
      .text(GAME_WIDTH / 2, y + 8, `合计 ${total} 金币`, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#ffd97d',
      })
      .setOrigin(0.5);

    const btn = this.add
      .text(GAME_WIDTH / 2, y + 44, '打烊，进入第二天 →', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#8bd3dd',
        backgroundColor: '#0a2233',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => btn.setColor('#ffffff'));
    btn.on('pointerout', () => btn.setColor('#8bd3dd'));
    btn.on('pointerdown', () => this.closeDay());
  }

  private closeDay(): void {
    GameState.nextDay();
    SaveManager.save();
    this.scene.start('Surface');
  }
}
