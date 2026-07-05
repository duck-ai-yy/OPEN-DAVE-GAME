import Phaser from 'phaser';
import { GameState } from './core/GameState';
import { GAME_HEIGHT, GAME_WIDTH } from './core/types';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { DiveScene } from './scenes/DiveScene';
import { SurfaceScene } from './scenes/SurfaceScene';
import { RestaurantScene } from './scenes/RestaurantScene';
import { UIScene } from './scenes/UIScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  pixelArt: true,
  backgroundColor: '#04101c',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [BootScene, PreloadScene, SurfaceScene, DiveScene, RestaurantScene, UIScene],
});

// 仅开发模式：暴露全局状态给 e2e 断言
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__GameState = GameState;
  (window as unknown as Record<string, unknown>).__PHASER_GAME__ = game;
}
