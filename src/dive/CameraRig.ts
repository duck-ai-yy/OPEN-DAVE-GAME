import Phaser from 'phaser';
import type { Player } from './Player';

/**
 * 相机封装。单人：Phaser follow；双人：每帧对准所有玩家中点，
 * 按玩家间距平滑调 zoom（近=1，远线性缩到 0.6）——接口对场景保持不变。
 */
export class CameraRig {
  private static readonly ZOOM_MIN = 0.6;
  /** 间距小于此值不缩放 */
  private static readonly NEAR_DIST = 320;
  /** 达到此间距时缩到最小 zoom */
  private static readonly FAR_DIST = 900;

  private camera: Phaser.Cameras.Scene2D.Camera;
  private mode: 'single' | 'multi' = 'single';

  constructor(camera: Phaser.Cameras.Scene2D.Camera) {
    this.camera = camera;
  }

  follow(players: Player[]): void {
    if (players.length <= 1) {
      this.mode = 'single';
      if (players.length > 0) {
        this.camera.startFollow(players[0].sprite, false, 0.12, 0.12);
      }
      this.camera.setZoom(1);
    } else {
      this.mode = 'multi';
      this.camera.stopFollow();
    }
  }

  update(players: Player[]): void {
    // 人数变化时切换模式（F2 drop-in/out）
    const wantMode = players.length > 1 ? 'multi' : 'single';
    if (wantMode !== this.mode) this.follow(players);
    if (this.mode !== 'multi' || players.length < 2) {
      // 单人恢复 zoom
      if (this.camera.zoom !== 1) {
        this.camera.setZoom(Phaser.Math.Linear(this.camera.zoom, 1, 0.08));
      }
      return;
    }

    let midX = 0;
    let midY = 0;
    let maxDist = 0;
    for (const p of players) {
      midX += p.x;
      midY += p.y;
    }
    midX /= players.length;
    midY /= players.length;
    for (const p of players) {
      maxDist = Math.max(maxDist, Phaser.Math.Distance.Between(p.x, p.y, midX, midY) * 2);
    }

    this.camera.centerOn(midX, midY);
    const t = Phaser.Math.Clamp(
      (maxDist - CameraRig.NEAR_DIST) / (CameraRig.FAR_DIST - CameraRig.NEAR_DIST),
      0,
      1,
    );
    const targetZoom = Phaser.Math.Linear(1, CameraRig.ZOOM_MIN, t);
    this.camera.setZoom(Phaser.Math.Linear(this.camera.zoom, targetZoom, 0.08));
  }
}
