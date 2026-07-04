import Phaser from 'phaser';
import { SaveManager } from '../core/SaveManager';

/** 最小启动：读存档 → 跳 Preload */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    SaveManager.load();
    // 页面隐藏时兜底存档
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') SaveManager.save();
    });
    this.scene.start('Preload');
  }
}
