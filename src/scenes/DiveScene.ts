import Phaser from 'phaser';
import { EventBus } from '../core/EventBus';
import { AFFINITY_MAX, Events, GAME_HEIGHT, GAME_WIDTH, PX_PER_METER, TURTLE_OXYGEN_BONUS } from '../core/types';
import type { RegionDef } from '../core/types';
import { DataRegistry } from '../data/DataRegistry';
import { getPlayerStats } from '../core/EquipmentStats';
import { GameState } from '../core/GameState';
import { SaveManager } from '../core/SaveManager';
import { KeyboardMouseSource } from '../input/KeyboardMouseSource';
import { SecondKeyboardSource } from '../input/SecondKeyboardSource';
import { CameraRig } from '../dive/CameraRig';
import type { Fish } from '../dive/Fish';
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
  private harpoons: Harpoon[] = [];
  private oxygen!: OxygenSystem;
  private inventory!: InventorySystem;
  private rescueActive = false;
  private companion?: Phaser.GameObjects.Image;
  private feedPrompt!: Phaser.GameObjects.Text;

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
    this.harpoons = [new Harpoon(this, player)];
    this.rescueActive = false;

    // 同屏双人：上一潜开着就直接带 P2 下水；F2 随时加入/退出
    if (GameState.coopEnabled) this.addSecondPlayer(false);
    this.input.keyboard?.on('keydown-F2', () => {
      if (this.rescueActive) return;
      if (this.players.length === 1) this.addSecondPlayer(true);
      else this.removeSecondPlayer();
    });

    // 装备数值聚合（EquipmentStats 统一实现）
    const stats = getPlayerStats(GameState.upgrades, DataRegistry.allEquipment());
    Harpoon.damage = stats.harpoonDamage;
    Harpoon.chargeRate = stats.chargeRate;

    // 海龟伙伴：好感满值后同行，额外携带一瓶氧气
    const hasTurtleBuddy = (GameState.affinity['sea_turtle'] ?? 0) >= AFFINITY_MAX;
    if (hasTurtleBuddy) {
      this.companion = this.add
        .image(player.x - 30, player.y - 10, 'ph_fish_large')
        .setTint(0x6ec87a)
        .setDepth(5);
      this.floatText(`🐢 海龟伙伴同行：氧气 +${TURTLE_OXYGEN_BONUS}`, '#6ec87a');
    }
    this.oxygen = new OxygenSystem(stats.oxygenMax + (hasTurtleBuddy ? TURTLE_OXYGEN_BONUS : 0));
    this.inventory = new InventorySystem(stats.weightMax);

    // 渔获飘字（入包由 InventorySystem 监听同一事件处理）；碎片捕获即得、救援不丢
    const onCaught = ({ fishId }: { fishId: string }) => {
      const def = DataRegistry.getFish(fishId);
      this.floatText(`+ ${def.name}`, '#8bd3dd');
      if (def.fragmentId) {
        GameState.addFragment(def.fragmentId);
        this.floatText(`✨ 生物碎片 ×1（共 ${GameState.fragments[def.fragmentId]}）`, '#ffd97d');
      }
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

    this.feedPrompt = this.add
      .text(0, 0, '按 E 喂食（消耗 1 条渔获）', {
        fontFamily: 'monospace',
        fontSize: '9px',
        color: '#ffd97d',
        backgroundColor: '#12304788',
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5, 1)
      .setDepth(1001)
      .setVisible(false);

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

    // 电击器（合成后 Q 键触发，以 P1 为中心的范围麻痹）
    let zapReadyAt = 0;
    this.input.keyboard?.on('keydown-Q', () => {
      if (this.rescueActive || !GameState.hasUpgrade('zapper')) return;
      const now = this.time.now;
      if (now < zapReadyAt) return;
      const zap = DataRegistry.getGadget('zapper');
      zapReadyAt = now + (zap.cooldownMs ?? 5000);
      const cx = this.players[0].x;
      const cy = this.players[0].y;
      const radius = zap.radius ?? 90;
      for (const f of this.spawner.fishes) {
        if (!f.alive || f.def.protected) continue;
        if ((f.x - cx) ** 2 + (f.y - cy) ** 2 <= radius * radius) f.stun(zap.stunMs ?? 3000);
      }
      // 电场视觉：扩散圆环
      const ring = this.add.circle(cx, cy, 12, 0xfff3b0, 0.35).setDepth(600);
      this.tweens.add({
        targets: ring,
        radius,
        alpha: 0,
        duration: 320,
        onComplete: () => ring.destroy(),
      });
      this.floatText('⚡ 电击！', '#ffd97d');
    });

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

  /** 保护动物喂食：任一玩家贴近(60px)且背包有渔获时提示，交互键消耗 1 条 +1 好感 */
  private updateFeeding(): void {
    const FEED_RANGE_SQ = 60 * 60;
    let target: { fish: Fish; player: Player } | null = null;
    for (const f of this.spawner.fishes) {
      if (!f.alive || !f.def.protected) continue;
      for (const p of this.players) {
        if ((f.x - p.x) ** 2 + (f.y - p.y) ** 2 < FEED_RANGE_SQ) {
          target = { fish: f, player: p };
          break;
        }
      }
      if (target) break;
    }
    if (!target || this.inventory.catches.length === 0) {
      this.feedPrompt.setVisible(false);
      return;
    }
    const fish = target.fish;
    const cur = GameState.affinity[fish.def.id] ?? 0;
    const bonded = cur >= AFFINITY_MAX;
    this.feedPrompt
      .setText(bonded ? `${fish.def.name} ❤❤❤（已是伙伴）` : '按 E 喂食（消耗 1 条渔获）')
      .setPosition(fish.x, fish.y - 14)
      .setVisible(true);
    if (bonded) return;

    if (target.player.frame?.interact) {
      const fed = this.inventory.takeOne();
      if (!fed) return;
      const level = GameState.addAffinity(fish.def.id);
      this.floatText(`🐟→${fish.def.name} 好感 ${'❤'.repeat(level)}${'♡'.repeat(Math.max(0, AFFINITY_MAX - level))}`, '#ff9eb5');
      if (level >= AFFINITY_MAX) {
        this.floatText(`🎉 ${fish.def.name}成为同行伙伴！下次下潜生效`, '#6ec87a');
      }
      SaveManager.save();
    }
  }

  /** P2 drop-in：第二键盘输入源 + 着色区分；共享氧气/背包/装备 */
  private addSecondPlayer(announce: boolean): void {
    if (this.players.length > 1) return;
    GameState.coopEnabled = true;
    const p1 = this.players[0];
    const source = new SecondKeyboardSource(() => {
      const p2 = this.players[1];
      return p2 ? { x: p2.x, y: p2.y } : { x: p1.x, y: p1.y };
    });
    const player2 = new Player(this, source, {
      x: p1.x + 40,
      y: p1.y,
      index: 1,
      tint: 0x8bd3dd,
    });
    this.players.push(player2);
    this.physics.add.collider(player2.sprite, this.terrain.group);
    this.harpoons.push(new Harpoon(this, player2));
    if (announce) {
      this.floatText('P2 加入：方向键移动 · Shift 鱼叉 · Ctrl 收线 · 回车交互', '#8bd3dd');
    }
  }

  private removeSecondPlayer(): void {
    if (this.players.length < 2) return;
    GameState.coopEnabled = false;
    this.harpoons[1]?.cancel();
    this.harpoons.pop();
    const p2 = this.players.pop();
    p2?.destroy();
    this.floatText('P2 已退出', '#9a8fa8');
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

    this.spawner.update(delta, this.cameras.main, this.players, time);
    for (let i = 0; i < this.players.length; i++) {
      const frame = this.players[i].frame;
      if (frame) this.harpoons[i]?.update(frame, delta, this.spawner.fishes);
    }

    // 氧气池共享：按最深玩家所在深度带计费（双人时更狠，符合合作张力）
    const deepestM = Math.max(...this.players.map((p) => p.y)) / PX_PER_METER;
    const band = this.region.depthBands.find((b) => deepestM >= b.range[0] && deepestM < b.range[1]);
    this.oxygen.update(delta, band?.oxygenDrainMul ?? 1);

    // 背包共享：超重减速作用于所有人
    for (const p of this.players) p.setOverweight(this.inventory.overweight);

    // 水面出口：浅水区提示 + E 上浮
    // 任一玩家在浅水按交互键即全员上浮
    const anyNear = this.players.some((p) => p.y < SURFACE_EXIT_Y);
    this.surfacePrompt.setVisible(anyNear);
    if (anyNear && this.players.some((p) => p.y < SURFACE_EXIT_Y && p.frame?.interact)) {
      this.endDive();
      return;
    }

    // 喂食保护动物：贴近 + 有渔获 + 按交互键 → 好感度+1
    this.updateFeeding();

    // 海龟伙伴跟随 P1（滞后漂浮感）
    if (this.companion) {
      const target = this.players[0];
      const offX = target.sprite.flipX ? 34 : -34;
      this.companion.x = Phaser.Math.Linear(this.companion.x, target.x + offX, 0.04);
      this.companion.y = Phaser.Math.Linear(this.companion.y, target.y - 8 + Math.sin(time / 500) * 4, 0.04);
      this.companion.setFlipX(this.companion.x > target.x);
    }

    // 气泡只在移动时明显（跟随 P1）
    const p0 = this.players[0];
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
