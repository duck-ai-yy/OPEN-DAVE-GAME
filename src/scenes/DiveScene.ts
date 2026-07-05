import Phaser from 'phaser';
import { EventBus } from '../core/EventBus';
import { Events, GAME_HEIGHT, GAME_WIDTH, PX_PER_METER } from '../core/types';
import type { RegionDef } from '../core/types';
import { DataRegistry } from '../data/DataRegistry';
import { getPlayerStats } from '../core/EquipmentStats';
import { GameState } from '../core/GameState';
import { KeyboardMouseSource } from '../input/KeyboardMouseSource';
import { CameraRig } from '../dive/CameraRig';
import { FishSpawner } from '../dive/FishSpawner';
import { Harpoon } from '../dive/Harpoon';
import { ParallaxBackground } from '../dive/ParallaxBackground';
import { Player } from '../dive/Player';
import { Terrain } from '../dive/Terrain';
import { InventorySystem } from '../dive/systems/InventorySystem';
import { OxygenSystem } from '../dive/systems/OxygenSystem';

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
  private oxygen!: OxygenSystem;
  private inventory!: InventorySystem;
  private rescueActive = false;

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
    this.rescueActive = false;

    // 装备数值聚合（EquipmentStats 统一实现）
    const stats = getPlayerStats(GameState.upgrades, DataRegistry.allEquipment());
    Harpoon.damage = stats.harpoonDamage;
    Harpoon.chargeRate = stats.chargeRate;
    this.oxygen = new OxygenSystem(stats.oxygenMax);
    this.inventory = new InventorySystem(stats.weightMax);

    // 渔获飘字（入包由 InventorySystem 监听同一事件处理）
    const onCaught = ({ fishId }: { fishId: string }) => {
      const def = DataRegistry.getFish(fishId);
      this.floatText(`+ ${def.name}`, '#8bd3dd');
    };
    const onDamaged = ({ amount }: { amount: number }) => {
      this.cameras.main.shake(120, 0.004);
      this.oxygen.damage(amount);
    };
    const onRescued = () => this.showRescuePanel();
    EventBus.on(Events.FISH_CAUGHT, onCaught);
    EventBus.on(Events.PLAYER_DAMAGED, onDamaged);
    EventBus.on(Events.PLAYER_RESCUED, onRescued);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      EventBus.off(Events.FISH_CAUGHT, onCaught);
      EventBus.off(Events.PLAYER_DAMAGED, onDamaged);
      EventBus.off(Events.PLAYER_RESCUED, onRescued);
      this.inventory.dispose();
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

    // 新手操作提示：开局展示几秒后淡出
    const hint = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 20, 'WASD 游动 · 按住鼠标蓄力松开发射 · J/空格 连打收线 · 回水面按 E 上浮', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#e8f4f8',
        backgroundColor: '#12304788',
        padding: { x: 8, y: 3 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1001);
    this.tweens.add({ targets: hint, alpha: 0, delay: 6500, duration: 800, onComplete: () => hint.destroy() });

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

  /** 氧尽救援：暂停玩法，只能保留一件渔获 */
  private showRescuePanel(): void {
    if (this.rescueActive) return;
    this.rescueActive = true;
    this.physics.pause();

    this.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000814, 0.75)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(2000);
    this.add
      .text(GAME_WIDTH / 2, 70, '氧气耗尽！被救援船捞了上来', {
        fontFamily: 'monospace', fontSize: '14px', color: '#ff8f8f',
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(2001);

    const distinct = [...new Set(this.inventory.catches)];
    if (distinct.length === 0) {
      this.rescueButton(120, '两手空空地回去…', () => this.finishRescue(null));
      return;
    }
    this.add
      .text(GAME_WIDTH / 2, 92, '只能保留一件渔获：', {
        fontFamily: 'monospace', fontSize: '11px', color: '#e8f4f8',
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(2001);
    distinct.slice(0, 5).forEach((fishId, i) => {
      const def = DataRegistry.getFish(fishId);
      const count = this.inventory.catches.filter((c) => c === fishId).length;
      this.rescueButton(118 + i * 26, `${def.name} ×${count} → 留 1 条`, () => this.finishRescue(fishId));
    });
  }

  private rescueButton(y: number, label: string, onClick: () => void): void {
    const btn = this.add
      .text(GAME_WIDTH / 2, y, label, {
        fontFamily: 'monospace', fontSize: '11px', color: '#8bd3dd',
        backgroundColor: '#123047', padding: { x: 10, y: 4 },
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(2001)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerdown', onClick);
  }

  private finishRescue(keepFishId: string | null): void {
    if (keepFishId) this.inventory.commitOne(keepFishId);
    this.physics.resume();
    EventBus.emit(Events.DIVE_ENDED);
    this.scene.stop('UI');
    this.scene.start('Surface');
  }

  private endDive(): void {
    this.inventory.commitAll();
    EventBus.emit(Events.DIVE_ENDED);
    this.scene.stop('UI');
    this.scene.start('Surface');
  }

  update(time: number, delta: number): void {
    if (this.rescueActive) return;
    for (const p of this.players) p.update(this);
    this.cameraRig.update(this.players);
    this.parallax.update(this.cameras.main, time);

    const player0 = this.players[0];
    this.spawner.update(delta, this.cameras.main, player0.x, player0.y, time);
    if (player0.frame) {
      this.harpoon.update(player0.frame, delta, this.spawner.fishes);
    }

    // 氧气：深度带系数驱动消耗
    const depthM = player0.y / PX_PER_METER;
    const band = this.region.depthBands.find((b) => depthM >= b.range[0] && depthM < b.range[1]);
    this.oxygen.update(delta, band?.oxygenDrainMul ?? 1);

    // 超重减速
    player0.setOverweight(this.inventory.overweight);

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
