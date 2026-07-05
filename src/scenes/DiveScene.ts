import Phaser from 'phaser';
import { EventBus } from '../core/EventBus';
import { Events, GAME_HEIGHT, GAME_WIDTH, PX_PER_METER } from '../core/types';
import type { RegionDef } from '../core/types';
import { DataRegistry } from '../data/DataRegistry';
import { GameState } from '../core/GameState';
import { KeyboardMouseSource } from '../input/KeyboardMouseSource';
import { CameraRig } from '../dive/CameraRig';
import { FishSpawner } from '../dive/FishSpawner';
import { Harpoon } from '../dive/Harpoon';
import { ParallaxBackground } from '../dive/ParallaxBackground';
import { Player } from '../dive/Player';
import { Terrain } from '../dive/Terrain';

/** 玩家浅于此深度（px）时可上浮结束下潜 */
const SURFACE_EXIT_Y = 30;

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
  private terrain!: Terrain;
  private parallax!: ParallaxBackground;
  private surfacePrompt!: Phaser.GameObjects.Text;
  private bubbles!: Phaser.GameObjects.Particles.ParticleEmitter;
  private spawner!: FishSpawner;
  private harpoon!: Harpoon;

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

    this.parallax = new ParallaxBackground(this);
    this.terrain = new Terrain(this, this.region);

    // 玩家（MVP 单人；数组结构为双人预留）
    const player = new Player(this, new KeyboardMouseSource(), {
      x: worldWidth / 2,
      y: 40,
      index: 0,
    });
    this.players = [player];
    this.physics.add.collider(player.sprite, this.terrain.group);

    // 游动气泡：跟随玩家，向上飘散
    this.bubbles = this.add.particles(0, 0, 'ph_pixel', {
      follow: player.sprite,
      followOffset: { x: 0, y: -4 },
      speedY: { min: -40, max: -15 },
      speedX: { min: -8, max: 8 },
      scale: { start: 2, end: 0.5 },
      alpha: { start: 0.7, end: 0 },
      lifespan: 900,
      frequency: 120,
      tint: 0xcfeef7,
    });

    this.cameraRig = new CameraRig(this.cameras.main);
    this.cameraRig.follow(this.players);

    // 深度变暗遮罩（跟随相机）
    this.darkenOverlay = this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000814, 0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(1000);

    this.spawner = new FishSpawner(this, this.region);
    this.harpoon = new Harpoon(this, player);

    // 捕获入包 + 飘字反馈；重量上限由 M3 InventorySystem 接管
    const onCaught = ({ fishId }: { fishId: string }) => {
      const def = DataRegistry.getFish(fishId);
      GameState.addCatch(fishId);
      this.floatText(`+ ${def.name}`, '#8bd3dd');
    };
    const onDamaged = () => {
      this.cameras.main.shake(120, 0.004);
    };
    EventBus.on(Events.FISH_CAUGHT, onCaught);
    EventBus.on(Events.PLAYER_DAMAGED, onDamaged);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      EventBus.off(Events.FISH_CAUGHT, onCaught);
      EventBus.off(Events.PLAYER_DAMAGED, onDamaged);
    });

    this.surfacePrompt = this.add
      .text(GAME_WIDTH / 2, 60, '按 E 上浮返回', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#ffd97d',
        backgroundColor: '#12304788',
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1001)
      .setVisible(false);

    // ESC 放弃本潜返回水面
    this.input.keyboard?.on('keydown-ESC', () => this.endDive());

    // 仅开发模式：暴露场景给 e2e 脚本瞄准/断言
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__dive = this;
    }
  }

  /** 屏幕上方短暂飘字（捕获/提示通用） */
  private floatText(msg: string, color: string): void {
    const t = this.add
      .text(GAME_WIDTH / 2, 110, msg, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1002);
    this.tweens.add({ targets: t, y: 90, alpha: 0, duration: 1100, onComplete: () => t.destroy() });
  }

  private endDive(): void {
    EventBus.emit(Events.DIVE_ENDED);
    this.scene.stop('UI');
    this.scene.start('Surface');
  }

  update(time: number, delta: number): void {
    for (const p of this.players) p.update(this);
    this.cameraRig.update(this.players);
    this.parallax.update(this.cameras.main, time);

    const player0 = this.players[0];
    this.spawner.update(delta, this.cameras.main, player0.x, player0.y, time);
    if (player0.frame) {
      this.harpoon.update(player0.frame, delta, this.spawner.fishes);
    }

    // 水面出口：浅水区提示 + E 上浮
    const p0 = this.players[0];
    const nearSurface = p0.y < SURFACE_EXIT_Y;
    this.surfacePrompt.setVisible(nearSurface);
    if (nearSurface && p0.frame?.interact) {
      this.endDive();
      return;
    }

    // 气泡只在移动时明显
    const moving = (p0.frame?.moveX ?? 0) !== 0 || (p0.frame?.moveY ?? 0) !== 0;
    this.bubbles.frequency = moving ? 120 : 600;

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
