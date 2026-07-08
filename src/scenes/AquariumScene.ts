import Phaser from 'phaser';
import { GameState } from '../core/GameState';
import { SaveManager } from '../core/SaveManager';
import { DataRegistry } from '../data/DataRegistry';
import { GAME_WIDTH, GAME_HEIGHT, type DecorationDef, type FishDef } from '../core/types';
import { computeRating, computeRatingScore, type RatingInput } from '../aquarium/AquariumRating';
import { installTicketOffice } from '../aquarium/TicketOffice';

// 模块加载即安装门票结算监听（main.ts 注册本场景时触发）：
// 保证玩家当天没进过水族馆，打烊时也照常结算门票。
installTicketOffice();

/** 水缸内壁（鱼游动范围），与外框留出内边距 */
const TANK = { left: 36, right: 604, top: 62, bottom: 268 } as const;
/** 展示条数上限：展品可以远多于此，但同屏 sprite 到此封顶（性能与观感） */
const MAX_TANK_SPRITES = 30;
/** 每种鱼最多展示的 sprite 数 */
const MAX_SPRITES_PER_SPECIES = 12;

/**
 * 缸内游动的鱼 —— 轻量内部类，只做 wander（随机变向 + 边界反弹）。
 * 刻意不复用 dive/ 下的 Fish：那边耦合捕猎/挣扎逻辑，馆内只要观赏行为。
 */
class AquariumFish {
  readonly sprite: Phaser.GameObjects.Image;
  private vx: number;
  private vy: number;
  /** 距下次随机变向的剩余毫秒 */
  private retargetMs: number;
  private readonly speed: number;

  constructor(scene: Phaser.Scene, def: FishDef) {
    const x = Phaser.Math.Between(TANK.left + 20, TANK.right - 20);
    const y = Phaser.Math.Between(TANK.top + 10, TANK.bottom - 10);
    this.sprite = scene.add.image(x, y, def.texture);
    // 馆内节奏放缓：巡游速度打对折并夹在观赏区间
    this.speed = Phaser.Math.Clamp(def.speed * 0.5, 8, 40);
    const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
    this.vx = Math.cos(a) * this.speed;
    this.vy = Math.sin(a) * this.speed * 0.4;
    this.retargetMs = Phaser.Math.Between(1500, 4000);
  }

  update(deltaMs: number): void {
    const dt = deltaMs / 1000;
    let x = this.sprite.x + this.vx * dt;
    let y = this.sprite.y + this.vy * dt;
    // 碰壁反弹：翻转速度并夹回缸内
    if (x < TANK.left || x > TANK.right) {
      this.vx = -this.vx;
      x = Phaser.Math.Clamp(x, TANK.left, TANK.right);
    }
    if (y < TANK.top || y > TANK.bottom) {
      this.vy = -this.vy;
      y = Phaser.Math.Clamp(y, TANK.top, TANK.bottom);
    }
    this.retargetMs -= deltaMs;
    if (this.retargetMs <= 0) {
      this.retargetMs = Phaser.Math.Between(1500, 4000);
      const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
      this.vx = Math.cos(a) * this.speed;
      this.vy = Math.sin(a) * this.speed * 0.4;
    }
    this.sprite.setPosition(x, y);
    this.sprite.setFlipX(this.vx < 0);
  }

  destroy(): void {
    this.sprite.destroy();
  }
}

/**
 * 水族馆场景：展品管理（库存⇄展出）、装饰商店、星级评分展示。
 * 门票收入不在这里算——TicketOffice 监听打烊事件全局结算，
 * 本场景只展示 lastTicketIncome。
 * 保护动物无需特判：它们不可捕获，天然不会出现在 inventory，
 * 因此也永远不会被转入展出。
 */
export class AquariumScene extends Phaser.Scene {
  private statusText!: Phaser.GameObjects.Text;
  private moneyText!: Phaser.GameObjects.Text;
  private tankFish: AquariumFish[] = [];
  private decoSprites: Phaser.GameObjects.GameObject[] = [];
  private exhibitLayer?: Phaser.GameObjects.Container;
  private shopLayer?: Phaser.GameObjects.Container;
  /** DEV 调试钩子读取用：当前星级与综合得分 */
  currentRating = 1;
  currentScore = 0;

  constructor() {
    super('Aquarium');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#071e30');

    this.add.text(14, 10, `第 ${GameState.day} 天 · 水族馆`, {
      fontFamily: 'monospace', fontSize: '12px', color: '#ffd97d',
    });
    this.moneyText = this.add
      .text(GAME_WIDTH - 14, 10, `金币 ${GameState.money}`, {
        fontFamily: 'monospace', fontSize: '12px', color: '#ffd97d',
      })
      .setOrigin(1, 0);
    this.statusText = this.add.text(14, 30, '', {
      fontFamily: 'monospace', fontSize: '10px', color: '#8bd3dd',
    });

    // 大水缸：一个带描边的矩形区域，鱼与装饰都画在里面
    this.add
      .rectangle(GAME_WIDTH / 2, 174, 600, 252, 0x0d3752)
      .setStrokeStyle(2, 0x8bd3dd, 0.4);

    this.makeButton(170, 332, '🐟 展品管理', () => this.openExhibitPanel());
    this.makeButton(320, 332, '🪸 装饰商店', () => this.openShop());
    this.makeButton(470, 332, '⬅ 返回船上', () => this.scene.start('Surface'));

    this.rebuildTank();
    this.drawDecorations();
    this.refreshStatus();

    // 仅开发模式：暴露场景给 e2e 断言（模式同 DiveScene 的 __dive）
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__aquarium = this;
    }
  }

  update(_time: number, delta: number): void {
    for (const f of this.tankFish) f.update(delta);
  }

  // ---------- 状态区 ----------

  /** 聚合评级输入：种类数 / 总价值 / 装饰加成 */
  private ratingInput(): RatingInput {
    let speciesCount = 0;
    let totalValue = 0;
    for (const [fishId, count] of Object.entries(GameState.aquarium.exhibits)) {
      if (count <= 0) continue;
      speciesCount += 1;
      totalValue += DataRegistry.getFish(fishId).sellPrice * count;
    }
    let decorationBonus = 0;
    for (const id of GameState.aquarium.decorations) {
      decorationBonus += DataRegistry.getDecoration(id).ratingBonus;
    }
    return { speciesCount, totalValue, decorationBonus };
  }

  private refreshStatus(): void {
    const input = this.ratingInput();
    this.currentRating = computeRating(input);
    this.currentScore = computeRatingScore(input);
    const totalCount = Object.values(GameState.aquarium.exhibits).reduce((a, b) => a + b, 0);
    const stars = '★'.repeat(this.currentRating) + '☆'.repeat(5 - this.currentRating);
    this.statusText.setText(
      `${stars} 评分 ${Math.floor(this.currentScore)} · 展出 ${totalCount} 条 / ${input.speciesCount} 种` +
        ` · 昨日门票收入 ${GameState.aquarium.lastTicketIncome} 金币`,
    );
    this.moneyText.setText(`金币 ${GameState.money}`);
  }

  // ---------- 水缸展示 ----------

  /** 按 exhibits 重建缸内鱼 sprite（展品变化时整缸重建，数量有限不值得做增量） */
  private rebuildTank(): void {
    for (const f of this.tankFish) f.destroy();
    this.tankFish = [];
    let total = 0;
    for (const fishDef of DataRegistry.allFish()) {
      const count = GameState.aquarium.exhibits[fishDef.id] ?? 0;
      const show = Math.min(count, MAX_SPRITES_PER_SPECIES);
      for (let i = 0; i < show && total < MAX_TANK_SPRITES; i++) {
        this.tankFish.push(new AquariumFish(this, fishDef));
        total++;
      }
    }
  }

  /** 已购装饰画在缸底：占位色块，正式素材接入后同位替换 */
  private drawDecorations(): void {
    for (const s of this.decoSprites) s.destroy();
    this.decoSprites = [];
    GameState.aquarium.decorations.forEach((id, i) => {
      const def = DataRegistry.getDecoration(id);
      const x = 60 + i * 48;
      const color = Phaser.Display.Color.HexStringToColor(def.color).color;
      this.decoSprites.push(this.add.rectangle(x, 288, 26, 20, color));
      this.decoSprites.push(
        this.add
          .text(x, 274, def.name, { fontFamily: 'monospace', fontSize: '7px', color: '#9db8c8' })
          .setOrigin(0.5, 1),
      );
    });
  }

  // ---------- 展品管理弹层 ----------

  private openExhibitPanel(): void {
    this.exhibitLayer?.destroy(true);
    this.exhibitLayer = this.add.container(0, 0).setDepth(10);
    const layer = this.exhibitLayer;

    const dim = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x04101c, 0.94)
      .setInteractive(); // 挡住底下按钮
    layer.add(dim);
    layer.add(
      this.add
        .text(GAME_WIDTH / 2, 24, '—— 展品管理 ——', {
          fontFamily: 'monospace', fontSize: '13px', color: '#ffd97d',
        })
        .setOrigin(0.5),
    );
    layer.add(
      this.add
        .text(GAME_WIDTH / 2, 44, '转入即从库存扣除：同一条鱼要么卖钱/做菜，要么展览', {
          fontFamily: 'monospace', fontSize: '9px', color: '#9a8fa8',
        })
        .setOrigin(0.5),
    );

    // 左列：库存（可转入）。行序固定按数据表顺序，避免操作后行位置跳变
    layer.add(
      this.add.text(60, 64, '【库存】', {
        fontFamily: 'monospace', fontSize: '11px', color: '#e8f4f8',
      }).setOrigin(0, 0.5),
    );
    const inInventory = DataRegistry.allFish().filter((f) => (GameState.inventory[f.id] ?? 0) > 0);
    if (inInventory.length === 0) {
      layer.add(
        this.add.text(60, 88, '（空）', {
          fontFamily: 'monospace', fontSize: '10px', color: '#4a5a68',
        }).setOrigin(0, 0.5),
      );
    }
    inInventory.forEach((f, i) => {
      const y = 88 + i * 22;
      layer.add(
        this.add
          .text(60, y, `${f.name} ×${GameState.inventory[f.id]} (${f.sellPrice}金)`, {
            fontFamily: 'monospace', fontSize: '10px', color: '#e8f4f8',
          })
          .setOrigin(0, 0.5),
      );
      const btn = this.add
        .text(255, y, '转入→', {
          fontFamily: 'monospace', fontSize: '10px', color: '#8bd3dd',
          backgroundColor: '#123047', padding: { x: 8, y: 3 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => {
        if (!GameState.moveToAquarium(f.id, 1)) return;
        this.afterExhibitChange();
        this.openExhibitPanel(); // 重建弹层刷新数量
      });
      layer.add(btn);
    });

    // 右列：展出中（可取回库存）
    layer.add(
      this.add.text(360, 64, '【展出中】', {
        fontFamily: 'monospace', fontSize: '11px', color: '#e8f4f8',
      }).setOrigin(0, 0.5),
    );
    const exhibited = DataRegistry.allFish().filter(
      (f) => (GameState.aquarium.exhibits[f.id] ?? 0) > 0,
    );
    if (exhibited.length === 0) {
      layer.add(
        this.add.text(360, 88, '（空）', {
          fontFamily: 'monospace', fontSize: '10px', color: '#4a5a68',
        }).setOrigin(0, 0.5),
      );
    }
    exhibited.forEach((f, i) => {
      const y = 88 + i * 22;
      layer.add(
        this.add
          .text(360, y, `${f.name} ×${GameState.aquarium.exhibits[f.id]}`, {
            fontFamily: 'monospace', fontSize: '10px', color: '#e8f4f8',
          })
          .setOrigin(0, 0.5),
      );
      const btn = this.add
        .text(560, y, '←取回', {
          fontFamily: 'monospace', fontSize: '10px', color: '#8bd3dd',
          backgroundColor: '#123047', padding: { x: 8, y: 3 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => {
        if (!GameState.takeFromAquarium(f.id, 1)) return;
        this.afterExhibitChange();
        this.openExhibitPanel();
      });
      layer.add(btn);
    });

    const close = this.add
      .text(GAME_WIDTH / 2, 336, '关闭', {
        fontFamily: 'monospace', fontSize: '12px', color: '#8bd3dd',
        backgroundColor: '#123047', padding: { x: 14, y: 4 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => {
      this.exhibitLayer?.destroy(true);
      this.exhibitLayer = undefined;
    });
    layer.add(close);
  }

  /** 展品增减后的统一收尾：存档 + 重建缸 + 刷新状态行 */
  private afterExhibitChange(): void {
    SaveManager.save();
    this.rebuildTank();
    this.refreshStatus();
  }

  // ---------- 装饰商店弹层 ----------

  private openShop(): void {
    this.shopLayer?.destroy(true);
    this.shopLayer = this.add.container(0, 0).setDepth(10);
    const layer = this.shopLayer;

    const dim = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x04101c, 0.94)
      .setInteractive();
    layer.add(dim);
    layer.add(
      this.add
        .text(GAME_WIDTH / 2, 24, '—— 装饰商店 ——', {
          fontFamily: 'monospace', fontSize: '13px', color: '#ffd97d',
        })
        .setOrigin(0.5),
    );
    layer.add(
      this.add
        .text(GAME_WIDTH / 2, 46, `金币 ${GameState.money}`, {
          fontFamily: 'monospace', fontSize: '11px', color: '#ffd97d',
        })
        .setOrigin(0.5),
    );

    DataRegistry.allDecorations().forEach((deco, i) => {
      this.buildShopRow(deco, 80 + i * 34);
    });

    const close = this.add
      .text(GAME_WIDTH / 2, 336, '关闭', {
        fontFamily: 'monospace', fontSize: '12px', color: '#8bd3dd',
        backgroundColor: '#123047', padding: { x: 14, y: 4 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => {
      this.shopLayer?.destroy(true);
      this.shopLayer = undefined;
    });
    layer.add(close);
  }

  /** 一行一件装饰：已购显示持有态，未购按余额决定按钮亮灰 */
  private buildShopRow(deco: DecorationDef, y: number): void {
    if (!this.shopLayer) return;
    const color = Phaser.Display.Color.HexStringToColor(deco.color).color;
    this.shopLayer.add(this.add.rectangle(92, y, 18, 14, color));
    this.shopLayer.add(
      this.add
        .text(112, y, `${deco.name}  评分+${deco.ratingBonus}`, {
          fontFamily: 'monospace', fontSize: '11px', color: '#e8f4f8',
        })
        .setOrigin(0, 0.5),
    );

    if (GameState.aquarium.decorations.includes(deco.id)) {
      this.shopLayer.add(
        this.add
          .text(520, y, '✅ 已购置', {
            fontFamily: 'monospace', fontSize: '11px', color: '#8bd3dd',
          })
          .setOrigin(0.5),
      );
      return;
    }

    const affordable = GameState.money >= deco.cost;
    const btn = this.add
      .text(520, y, `购买 ${deco.cost}金`, {
        fontFamily: 'monospace', fontSize: '11px',
        color: affordable ? '#ffd97d' : '#4a5a68',
        backgroundColor: '#123047', padding: { x: 10, y: 3 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerdown', () => this.buyDecoration(deco));
    this.shopLayer.add(btn);
  }

  /** 购买装饰：每件只可购一次；成功即入列表、存档并刷新缸底与评级 */
  private buyDecoration(deco: DecorationDef): void {
    if (GameState.aquarium.decorations.includes(deco.id)) return;
    if (!GameState.spendMoney(deco.cost)) return;
    GameState.aquarium.decorations.push(deco.id);
    SaveManager.save();
    this.drawDecorations();
    this.refreshStatus();
    this.openShop(); // 重建弹层刷新持有态与余额
  }

  // ---------- 通用 ----------

  private makeButton(x: number, y: number, label: string, onClick: () => void): void {
    const btn = this.add
      .text(x, y, label, {
        fontFamily: 'monospace', fontSize: '13px', color: '#8bd3dd',
        backgroundColor: '#123047', padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => btn.setColor('#ffffff'));
    btn.on('pointerout', () => btn.setColor('#8bd3dd'));
    btn.on('pointerdown', onClick);
  }
}
