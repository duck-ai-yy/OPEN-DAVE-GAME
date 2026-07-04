import Phaser from 'phaser';
import { GameState } from '../core/GameState';
import { SaveManager } from '../core/SaveManager';
import { GAME_WIDTH } from '../core/types';

/**
 * 晚间餐厅（框架骨架版）。
 * M4 任务包实装：选 ≤3 道菜 → 顾客自动结算 → 收入面板。
 * 骨架仅提供「结束今天 → day+1 → 回水面」以保证日循环可跑通。
 */
export class RestaurantScene extends Phaser.Scene {
  constructor() {
    super('Restaurant');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#241a2e');
    this.add
      .text(GAME_WIDTH / 2, 70, `第 ${GameState.day} 天 · 晚间营业`, {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffd97d',
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 100, '（餐厅玩法 M4 实装中）', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#9a8fa8',
      })
      .setOrigin(0.5);

    const btn = this.add
      .text(GAME_WIDTH / 2, 160, '打烊，进入第二天 →', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#8bd3dd',
        backgroundColor: '#123047',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerdown', () => {
      GameState.nextDay();
      SaveManager.save();
      this.scene.start('Surface');
    });
  }
}
