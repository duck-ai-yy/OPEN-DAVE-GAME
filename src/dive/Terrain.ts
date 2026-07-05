import Phaser from 'phaser';
import { GAME_WIDTH, PX_PER_METER } from '../core/types';
import type { RegionDef } from '../core/types';

/**
 * 潜水地形（程序生成占位版）：左右岩壁 + 起伏海底 + 中层散布珊瑚礁平台。
 * 以 region.id 为种子做确定性伪随机——同一 region 每次进入布局完全一致。
 * 对外只暴露静态碰撞组 group；未来接入 Tiled tilemap 时只替换本模块内部实现，
 * DiveScene 不感知生成细节。
 */
export class Terrain {
  readonly group: Phaser.Physics.Arcade.StaticGroup;

  private static readonly ROCK_TEX = 'ph_rock';
  private static readonly ROCK_SIZE = 16;
  private static readonly CORAL_TEXS = ['ph_coral_a', 'ph_coral_b'];

  private scene: Phaser.Scene;
  private rng: Phaser.Math.RandomDataGenerator;

  constructor(scene: Phaser.Scene, region: RegionDef) {
    this.scene = scene;
    this.rng = new Phaser.Math.RandomDataGenerator([region.id]);
    Terrain.ensureTextures(scene);
    this.group = scene.physics.add.staticGroup();

    const width = GAME_WIDTH * 3;
    const height = region.maxDepth * PX_PER_METER;
    this.buildWalls(width, height);
    this.buildSeabed(width, height);
    this.buildReefs(width, height);
  }

  /** 岩石/珊瑚占位纹理：全局只生成一次，重进场景不重复创建（ph_ 前缀约定） */
  private static ensureTextures(scene: Phaser.Scene): void {
    if (scene.textures.exists(Terrain.ROCK_TEX)) return;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);

    // 岩石 16×16：深棕底 + 固定图案明暗斑点（纹理不依赖 region 种子）
    g.fillStyle(0x3d2f2a);
    g.fillRect(0, 0, 16, 16);
    g.fillStyle(0x2b211e);
    g.fillRect(2, 3, 3, 2);
    g.fillRect(10, 1, 4, 3);
    g.fillRect(6, 9, 3, 3);
    g.fillRect(12, 12, 3, 2);
    g.fillStyle(0x4a3a33);
    g.fillRect(0, 13, 4, 3);
    g.fillRect(8, 5, 2, 2);
    g.fillRect(3, 7, 2, 1);
    g.generateTexture(Terrain.ROCK_TEX, 16, 16);
    g.clear();

    // 珊瑚 a：珊瑚橙分枝 8×8
    g.fillStyle(0xe07a5f);
    g.fillRect(3, 2, 2, 6);
    g.fillRect(1, 0, 2, 4);
    g.fillRect(5, 1, 2, 3);
    g.generateTexture('ph_coral_a', 8, 8);
    g.clear();

    // 珊瑚 b：玫红团块 8×6
    g.fillStyle(0xc44569);
    g.fillRect(1, 2, 6, 4);
    g.fillRect(2, 0, 2, 2);
    g.fillRect(5, 1, 2, 1);
    g.generateTexture('ph_coral_b', 8, 6);
    g.destroy();
  }

  /** 左右岩壁：分段变宽制造犬牙参差，封住世界左右边界 */
  private buildWalls(width: number, height: number): void {
    const step = 80;
    for (let y = 0; y < height; y += step) {
      const h = Math.min(step, height - y);
      this.block(0, y, 24 + this.rng.between(0, 48), h);
      const w = 24 + this.rng.between(0, 48);
      this.block(width - w, y, w, h);
    }
  }

  /** 海底：分段起伏的底部岩层，随机点缀珊瑚 */
  private buildSeabed(width: number, height: number): void {
    const step = 64;
    for (let x = 0; x < width; x += step) {
      const w = Math.min(step, width - x);
      const h = 24 + this.rng.between(0, 40);
      this.block(x, height - h, w, h);
      if (this.rng.frac() < 0.5) {
        this.coral(x + this.rng.between(4, w - 16), height - h);
      }
    }
  }

  /** 中层散布的珊瑚礁/岩石平台；y 下限 200 避开顶部出生水域 */
  private buildReefs(width: number, height: number): void {
    const count = 16;
    for (let i = 0; i < count; i++) {
      const w = this.rng.between(60, 160);
      const h = this.rng.between(16, 32);
      const x = this.rng.between(96, width - 96 - w);
      const y = this.rng.between(200, height - 160);
      this.block(x, y, w, h);
      const corals = this.rng.between(0, 3);
      for (let c = 0; c < corals; c++) {
        this.coral(x + this.rng.between(4, w - 16), y);
      }
    }
  }

  /** 用 16×16 岩石纹理缩放拼出 (x,y) 起 w×h 的静态碰撞块 */
  private block(x: number, y: number, w: number, h: number): void {
    const s = this.group.create(x, y, Terrain.ROCK_TEX) as Phaser.Physics.Arcade.Sprite;
    s.setOrigin(0, 0);
    s.setScale(w / Terrain.ROCK_SIZE, h / Terrain.ROCK_SIZE);
    s.refreshBody();
  }

  /** 纯装饰珊瑚（不参与碰撞），底边贴在岩石顶面 y 上 */
  private coral(x: number, y: number): void {
    const key = Terrain.CORAL_TEXS[this.rng.between(0, Terrain.CORAL_TEXS.length - 1)];
    this.scene.add.image(x, y + 1, key).setOrigin(0, 1).setScale(2);
  }
}
