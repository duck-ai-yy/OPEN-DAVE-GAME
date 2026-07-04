import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './core/types';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { DiveScene } from './scenes/DiveScene';
import { SurfaceScene } from './scenes/SurfaceScene';
import { RestaurantScene } from './scenes/RestaurantScene';
import { UIScene } from './scenes/UIScene';

new Phaser.Game({
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
