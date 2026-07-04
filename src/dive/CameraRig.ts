import type Phaser from 'phaser';
import type { Player } from './Player';

/**
 * 相机封装。MVP：跟随单人。
 * 未来双人：改为跟随所有玩家中点 + 按间距 zoom —— 接口不变。
 */
export class CameraRig {
  private camera: Phaser.Cameras.Scene2D.Camera;

  constructor(camera: Phaser.Cameras.Scene2D.Camera) {
    this.camera = camera;
  }

  follow(players: Player[]): void {
    if (players.length > 0) {
      this.camera.startFollow(players[0].sprite, false, 0.12, 0.12);
    }
  }

  update(_players: Player[]): void {
    // MVP 单人 follow 由 Phaser 处理；双人中点逻辑将来写在这里
  }
}
