import Phaser from 'phaser';
import { EventBus } from '../core/EventBus';
import { Events, GAME_HEIGHT, GAME_WIDTH, PX_PER_METER } from '../core/types';
import type { RegionDef } from '../core/types';
import { DataRegistry } from '../data/DataRegistry';
import { KeyboardMouseSource } from '../input/KeyboardMouseSource';
import { CameraRig } from '../dive/CameraRig';
import { Player } from '../dive/Player';

export interface DiveSceneData {
  regionId: string;
}

/**
 * 潜水主场景（框架骨架版）。
 * 当前：region 数据驱动的世界边界 + 深度变暗 + 玩家移动 + 深度广播 + ESC 结束下潜。
 * M2/M3 由后续任务包填充：FishSpawner、Harpoon、Oxygen/Inventory systems。
 */
export class DiveScene extends Phaser.Scene {
  private players: Player[] = [];
  private cameraRig!: CameraRig;
  private region!: RegionDef;
  private darkenOverlay!: Phaser.GameObjects.Rectangle;
  private lastDepthMeters = -1;

  constructor() {
    super('Dive');
  }

  create(data: DiveSceneData): void {
    this.region = DataRegistry.getRegion(data.regionId ?? 'red_sea');

    const worldWidth = GAME_WIDTH * 3;
    const worldHeight = this.region.maxDepth * PX_PER_METER;
    this.physics.world.setBounds(0, 0, worldWidth, worldHeight);
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    this.cameras.main.setBackgroundColor(this.region.waterColor);

    // 玩家（MVP 单人；数组结构为双人预留）
    const player = new Player(this, new KeyboardMouseSource(), {
      x: worldWidth / 2,
      y: 40,
      index: 0,
    });
    this.players = [player];

    this.cameraRig = new CameraRig(this.cameras.main);
    this.cameraRig.follow(this.players);

    // 深度变暗遮罩（跟随相机）
    this.darkenOverlay = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000814, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(1000);

    // ESC 结束下潜返回水面
    this.input.keyboard?.on('keydown-ESC', () => {
      EventBus.emit(Events.DIVE_ENDED);
      this.scene.stop('UI');
      this.scene.start('Surface');
    });
  }

  update(): void {
    for (const p of this.players) p.update(this);
    this.cameraRig.update(this.players);

    // 深度广播 + 环境变暗
    const depthMeters = Math.max(0, Math.floor(this.players[0].y / PX_PER_METER));
    if (depthMeters !== this.lastDepthMeters) {
      this.lastDepthMeters = depthMeters;
      EventBus.emit(Events.DEPTH_CHANGED, depthMeters);
    }
    const darkness = Math.min(0.82, depthMeters * this.region.ambientDarkenPerMeter);
    this.darkenOverlay.setFillStyle(0x000814, darkness);
  }
}
