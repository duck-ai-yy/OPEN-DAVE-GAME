import Phaser from 'phaser';
import { GameState } from '../core/GameState';
import { SaveManager } from '../core/SaveManager';
import { GAME_WIDTH } from '../core/types';

/**
 * 水面/船上枢纽（框架骨架版：菜单式）。
 * 选项：下潜 / 开店营业。M5 在此加商店升级。
 */
export class SurfaceScene extends Phaser.Scene {
  constructor() {
    super('Surface');
  }

  create(): void {
    SaveManager.save();
    this.cameras.main.setBackgroundColor('#0e3a52');

    this.add
      .text(GAME_WIDTH / 2, 60, `第 ${GameState.day} 天 · 船上`, {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#e8f4f8',
      })
      .setOrigin(0.5);
    this.add
      .text(GAME_WIDTH / 2, 84, `金币 ${GameState.money}`, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#ffd97d',
      })
      .setOrigin(0.5);

    this.makeButton(150, '🤿 下潜（埃及红海）', () => {
      this.scene.launch('UI');
      this.scene.start('Dive', { regionId: 'red_sea' });
    });
    this.makeButton(190, '🍜 晚间营业', () => {
      this.scene.start('Restaurant');
    });
  }

  private makeButton(y: number, label: string, onClick: () => void): void {
    const btn = this.add
      .text(GAME_WIDTH / 2, y, label, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#8bd3dd',
        backgroundColor: '#123047',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => btn.setColor('#ffffff'));
    btn.on('pointerout', () => btn.setColor('#8bd3dd'));
    btn.on('pointerdown', onClick);
  }
}
