import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../core/types';

/**
 * 两层视差背景：远景礁影（深色剪影）+ 中景浮游颗粒。
 * TileSprite 钉在相机上（scrollFactor 0），用 tilePosition 按视差系数手动滚动；
 * 颗粒层叠加随时间的缓慢漂移模拟水流。
 */
export class ParallaxBackground {
  private static readonly FAR_FACTOR = 0.15;
  private static readonly MID_FACTOR = 0.4;

  private far: Phaser.GameObjects.TileSprite;
  private mid: Phaser.GameObjects.TileSprite;

  constructor(scene: Phaser.Scene) {
    ParallaxBackground.ensureTextures(scene);
    this.far = scene.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'ph_bg_reef')
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(-20)
      .setAlpha(0.7);
    this.mid = scene.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'ph_bg_plankton')
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(-10)
      .setAlpha(0.6);
  }

  update(camera: Phaser.Cameras.Scene2D.Camera, timeMs: number): void {
    this.far.setTilePosition(
      camera.scrollX * ParallaxBackground.FAR_FACTOR,
      camera.scrollY * ParallaxBackground.FAR_FACTOR,
    );
    // 颗粒随水流缓慢斜向漂移
    this.mid.setTilePosition(
      camera.scrollX * ParallaxBackground.MID_FACTOR + timeMs * 0.004,
      camera.scrollY * ParallaxBackground.MID_FACTOR + timeMs * 0.01,
    );
  }

  /** 背景占位纹理：固定种子生成，与 region 地形种子无关（ph_ 前缀约定） */
  private static ensureTextures(scene: Phaser.Scene): void {
    if (scene.textures.exists('ph_bg_reef')) return;
    const rng = new Phaser.Math.RandomDataGenerator(['parallax_bg']);
    const g = scene.make.graphics({ x: 0, y: 0 }, false);

    // 远景礁影 240×180：深色剪影团块 + 石柱
    for (let i = 0; i < 7; i++) {
      g.fillStyle(0x0b2a3c, 1);
      g.fillEllipse(rng.between(0, 220), rng.between(40, 170), rng.between(40, 90), rng.between(24, 50));
    }
    for (let i = 0; i < 4; i++) {
      g.fillStyle(0x0a2434, 1);
      g.fillRect(rng.between(10, 230), rng.between(60, 120), rng.between(8, 18), 180);
    }
    g.generateTexture('ph_bg_reef', 240, 180);
    g.clear();

    // 中景浮游颗粒 120×120：稀疏微光点
    for (let i = 0; i < 26; i++) {
      const s = rng.between(1, 2);
      g.fillStyle(0xcfeef7, rng.realInRange(0.25, 0.6));
      g.fillRect(rng.between(0, 118), rng.between(0, 118), s, s);
    }
    g.generateTexture('ph_bg_plankton', 120, 120);
    g.destroy();
  }
}
