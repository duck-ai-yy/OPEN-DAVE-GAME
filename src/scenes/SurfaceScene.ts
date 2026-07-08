import Phaser from 'phaser';
import { GameState } from '../core/GameState';
import { SaveManager } from '../core/SaveManager';
import { DataRegistry } from '../data/DataRegistry';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  type EquipmentDef,
  type EquipmentSlot,
  type RegionDef,
} from '../core/types';

const SLOT_LABELS: Record<EquipmentSlot, string> = {
  tank: '氧气瓶',
  cargo: '货舱',
  harpoon: '鱼叉',
};

/** 效果字段的中文展示名（差值面板用） */
const EFFECT_LABELS: Record<keyof EquipmentDef['effects'], string> = {
  oxygenMax: '氧气',
  weightMax: '载重',
  damage: '伤害',
  chargeRate: '蓄力',
};

/**
 * 水面/船上枢纽（菜单式）。
 * 选项：下潜 / 开店营业 / 装备升级（M5：同场景弹层商店）。
 */
export class SurfaceScene extends Phaser.Scene {
  private moneyText!: Phaser.GameObjects.Text;
  private shopLayer?: Phaser.GameObjects.Container;
  private craftLayer?: Phaser.GameObjects.Container;
  private codexLayer?: Phaser.GameObjects.Container;
  private regionLayer?: Phaser.GameObjects.Container;

  constructor() {
    super('Surface');
  }

  create(): void {
    this.grantStarterGear();
    SaveManager.save();
    this.cameras.main.setBackgroundColor('#0e3a52');

    this.add
      .text(GAME_WIDTH / 2, 60, `第 ${GameState.day} 天 · 船上`, {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#e8f4f8',
      })
      .setOrigin(0.5);
    this.moneyText = this.add
      .text(GAME_WIDTH / 2, 84, `金币 ${GameState.money}`, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#ffd97d',
      })
      .setOrigin(0.5);

    // 新增水族馆入口后按钮增至 6 个：间距压缩到 35 以塞进 360 高度
    this.makeButton(145, '🤿 下潜', () => {
      this.openRegionPicker();
    });
    this.makeButton(180, '🍜 晚间营业', () => {
      this.scene.start('Restaurant');
    });
    this.makeButton(215, '🐠 水族馆', () => {
      this.scene.start('Aquarium');
    });
    this.makeButton(250, '🔧 装备升级', () => {
      this.openShop();
    });
    this.makeButton(285, '🧪 生物合成', () => {
      this.openCraft();
    });
    this.makeButton(320, '📖 生物图鉴', () => {
      this.openCodex();
    });
  }

  // ---------- 生物图鉴弹层 ----------

  /** firstCatches 驱动：捕过显名字与价格，没捕过是 ???；保护动物显好感 */
  private openCodex(): void {
    this.codexLayer?.destroy(true);
    this.codexLayer = this.add.container(0, 0).setDepth(10);
    const dim = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x04101c, 0.94)
      .setInteractive();
    this.codexLayer.add(dim);

    const all = DataRegistry.allFish();
    const seen = all.filter((f) => GameState.firstCatches.includes(f.id) || (GameState.affinity[f.id] ?? 0) > 0).length;
    this.codexLayer.add(
      this.add
        .text(GAME_WIDTH / 2, 26, `—— 生物图鉴 ${seen}/${all.length} ——`, {
          fontFamily: 'monospace', fontSize: '13px', color: '#ffd97d',
        })
        .setOrigin(0.5),
    );

    const perCol = Math.ceil(all.length / 2);
    all.forEach((f, i) => {
      const col = Math.floor(i / perCol);
      const row = i % perCol;
      const x = 60 + col * 280;
      const y = 52 + row * 20;
      let label: string;
      let color: string;
      if (f.protected) {
        const level = GameState.affinity[f.id] ?? 0;
        const met = GameState.firstCatches.includes(f.id) || level > 0;
        label = met
          ? `🛡 ${f.name}  ${'❤'.repeat(level)}${'♡'.repeat(Math.max(0, 3 - level))}`
          : '🛡 ？？？（保护动物·喂食解锁）';
        color = met ? '#6ec87a' : '#4a5a68';
      } else if (GameState.firstCatches.includes(f.id)) {
        label = `● ${f.name}  ${f.sellPrice}金`;
        color = '#e8f4f8';
      } else {
        label = '○ ？？？';
        color = '#4a5a68';
      }
      this.codexLayer!.add(
        this.add.text(x, y, label, { fontFamily: 'monospace', fontSize: '10px', color }).setOrigin(0, 0.5),
      );
    });

    const close = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 22, '返回', {
        fontFamily: 'monospace', fontSize: '12px', color: '#8bd3dd',
        backgroundColor: '#123047', padding: { x: 14, y: 4 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => {
      this.codexLayer?.destroy(true);
      this.codexLayer = undefined;
    });
    this.codexLayer.add(close);
  }

  // ---------- 生物合成弹层 ----------

  /** 碎片→能力武器：进度可视 + 集齐可合成；已合成的显示持有态 */
  private openCraft(): void {
    this.craftLayer?.destroy(true);
    this.craftLayer = this.add.container(0, 0).setDepth(10);

    const dim = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x04101c, 0.92)
      .setInteractive();
    this.craftLayer.add(dim);
    this.craftLayer.add(
      this.add
        .text(GAME_WIDTH / 2, 34, '—— 生物碎片合成 ——', {
          fontFamily: 'monospace', fontSize: '14px', color: '#ffd97d',
        })
        .setOrigin(0.5),
    );

    DataRegistry.allGadgets().forEach((g, i) => {
      const y = 90 + i * 70;
      const owned = GameState.hasUpgrade(g.id);
      const have = GameState.fragments[g.fragmentId] ?? 0;
      this.craftLayer!.add(
        this.add
          .text(GAME_WIDTH / 2 - 180, y, `${g.name}\n${g.description}`, {
            fontFamily: 'monospace', fontSize: '11px', color: '#e8f4f8', lineSpacing: 4,
          })
          .setOrigin(0, 0.5),
      );
      if (owned) {
        this.craftLayer!.add(
          this.add
            .text(GAME_WIDTH / 2 + 150, y, '✅ 已合成', {
              fontFamily: 'monospace', fontSize: '12px', color: '#8bd3dd',
            })
            .setOrigin(0.5),
        );
        return;
      }
      const enough = have >= g.fragmentCount;
      const btn = this.add
        .text(GAME_WIDTH / 2 + 150, y, `碎片 ${have}/${g.fragmentCount} ${enough ? '合成！' : ''}`, {
          fontFamily: 'monospace', fontSize: '11px',
          color: enough ? '#ffd97d' : '#4a5a68',
          backgroundColor: '#123047', padding: { x: 10, y: 4 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => {
        if (GameState.hasUpgrade(g.id)) return;
        if (!GameState.spendFragments(g.fragmentId, g.fragmentCount)) return;
        GameState.upgrades.push(g.id);
        SaveManager.save();
        this.openCraft();
      });
      this.craftLayer!.add(btn);
    });

    const close = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 34, '返回', {
        fontFamily: 'monospace', fontSize: '12px', color: '#8bd3dd',
        backgroundColor: '#123047', padding: { x: 14, y: 5 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => {
      this.craftLayer?.destroy(true);
      this.craftLayer = undefined;
    });
    this.craftLayer.add(close);
  }

  /** lv1 三件免费初始装备：新档（upgrades 为空）首次进水面时补发 */
  private grantStarterGear(): void {
    if (GameState.upgrades.length > 0) return;
    for (const def of DataRegistry.allEquipment()) {
      if (!def.requires && def.cost === 0) {
        GameState.upgrades.push(def.id);
      }
    }
  }

  private makeButton(y: number, label: string, onClick: () => void): void {
    const btn = this.add
      .text(GAME_WIDTH / 2, y, label, {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: '#8bd3dd',
        backgroundColor: '#123047',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerover', () => btn.setColor('#ffffff'));
    btn.on('pointerout', () => btn.setColor('#8bd3dd'));
    btn.on('pointerdown', onClick);
  }

  // ---------- 地域选择弹层 ----------

  /** 下潜前选地域：已解锁直接进，未解锁显示价格、够钱可当场购买 */
  private openRegionPicker(): void {
    this.regionLayer?.destroy(true);
    this.regionLayer = this.add.container(0, 0).setDepth(10);

    const dim = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x04101c, 0.92)
      .setInteractive(); // 挡住底下按钮的点击
    this.regionLayer.add(dim);

    this.regionLayer.add(
      this.add
        .text(GAME_WIDTH / 2, 34, '—— 选择下潜海域 ——', {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#ffd97d',
        })
        .setOrigin(0.5),
    );
    this.regionLayer.add(
      this.add
        .text(GAME_WIDTH / 2, 56, `金币 ${GameState.money}`, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#ffd97d',
        })
        .setOrigin(0.5),
    );

    DataRegistry.allRegions().forEach((region, i) => {
      this.buildRegionRow(region, 100 + i * 56);
    });

    const close = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 34, '返回', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#8bd3dd',
        backgroundColor: '#123047',
        padding: { x: 14, y: 5 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => {
      this.regionLayer?.destroy(true);
      this.regionLayer = undefined;
    });
    this.regionLayer.add(close);
  }

  /** 一行一个地域：解锁状态决定按钮语义（进入 / 购买 / 买不起置灰） */
  private buildRegionRow(region: RegionDef, y: number): void {
    if (!this.regionLayer) return;
    const unlocked = GameState.hasRegion(region.id);
    const cost = region.unlockCost ?? 0;

    this.regionLayer.add(
      this.add
        .text(GAME_WIDTH / 2 - 180, y, `${region.name}  · 最深 ${region.maxDepth}m`, {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: unlocked ? '#e8f4f8' : '#4a5a68',
        })
        .setOrigin(0, 0.5),
    );

    if (unlocked) {
      const goBtn = this.add
        .text(GAME_WIDTH / 2 + 150, y, '下潜 ▶', {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#8bd3dd',
          backgroundColor: '#123047',
          padding: { x: 12, y: 4 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      goBtn.on('pointerover', () => goBtn.setColor('#ffffff'));
      goBtn.on('pointerout', () => goBtn.setColor('#8bd3dd'));
      goBtn.on('pointerdown', () => {
        this.scene.launch('UI');
        this.scene.start('Dive', { regionId: region.id });
      });
      this.regionLayer.add(goBtn);
      return;
    }

    const affordable = GameState.money >= cost;
    const buyBtn = this.add
      .text(GAME_WIDTH / 2 + 150, y, `🔒 解锁 ${cost} 金币`, {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: affordable ? '#ffd97d' : '#4a5a68',
        backgroundColor: '#123047',
        padding: { x: 10, y: 4 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    buyBtn.on('pointerdown', () => this.buyRegion(region));
    this.regionLayer.add(buyBtn);
  }

  /** 购买地域：扣钱→记入已解锁→立即存档；重建弹层刷新状态 */
  private buyRegion(region: RegionDef): void {
    if (GameState.hasRegion(region.id)) return;
    if (!GameState.spendMoney(region.unlockCost ?? 0)) return;
    GameState.unlockedRegions.push(region.id);
    SaveManager.save();
    this.moneyText.setText(`金币 ${GameState.money}`);
    this.openRegionPicker();
  }

  // ---------- 商店弹层 ----------

  private openShop(): void {
    this.shopLayer?.destroy(true);
    this.shopLayer = this.add.container(0, 0).setDepth(10);

    const dim = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x04101c, 0.92)
      .setInteractive(); // 挡住底下按钮的点击
    this.shopLayer.add(dim);

    this.shopLayer.add(
      this.add
        .text(GAME_WIDTH / 2, 34, '—— 装备升级 ——', {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#ffd97d',
        })
        .setOrigin(0.5),
    );
    this.shopLayer.add(
      this.add
        .text(GAME_WIDTH / 2, 56, `金币 ${GameState.money}`, {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#ffd97d',
        })
        .setOrigin(0.5),
    );

    const slots: EquipmentSlot[] = ['tank', 'cargo', 'harpoon'];
    slots.forEach((slot, i) => {
      this.buildSlotColumn(slot, 110 + i * 210);
    });

    const close = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 34, '返回', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#8bd3dd',
        backgroundColor: '#123047',
        padding: { x: 14, y: 5 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => {
      this.shopLayer?.destroy(true);
      this.shopLayer = undefined;
    });
    this.shopLayer.add(close);
  }

  /** 一个 slot 的升级链列：当前持有 → 下一级价格与效果差 → 购买 */
  private buildSlotColumn(slot: EquipmentSlot, x: number): void {
    if (!this.shopLayer) return;
    const chain = this.slotChain(slot);
    const owned = chain.filter((e) => GameState.hasUpgrade(e.id));
    const current = owned[owned.length - 1];
    const next = chain[owned.length];

    this.shopLayer.add(
      this.add
        .text(x, 86, `【${SLOT_LABELS[slot]}】`, {
          fontFamily: 'monospace',
          fontSize: '12px',
          color: '#e8f4f8',
        })
        .setOrigin(0.5),
    );

    // 升级链纵览：已购亮色，未购灰色
    let y = 110;
    for (const def of chain) {
      const has = GameState.hasUpgrade(def.id);
      this.shopLayer.add(
        this.add
          .text(x, y, `${has ? '●' : '○'} ${def.name}`, {
            fontFamily: 'monospace',
            fontSize: '10px',
            color: has ? '#8bd3dd' : '#4a5a68',
          })
          .setOrigin(0.5),
      );
      y += 16;
    }

    y += 10;
    if (!next) {
      this.shopLayer.add(
        this.add
          .text(x, y, '已满级', {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#9a8fa8',
          })
          .setOrigin(0.5),
      );
      return;
    }

    const diff = this.effectDiff(current, next);
    this.shopLayer.add(
      this.add
        .text(x, y, `下一级：${next.name}\n${diff}\n价格 ${next.cost} 金币`, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#e8f4f8',
          align: 'center',
        })
        .setOrigin(0.5, 0),
    );

    const affordable = GameState.money >= next.cost;
    const buyBtn = this.add
      .text(x, y + 58, '购买', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: affordable ? '#8bd3dd' : '#4a5a68',
        backgroundColor: '#123047',
        padding: { x: 16, y: 5 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    buyBtn.on('pointerdown', () => this.buy(next));
    this.shopLayer.add(buyBtn);
  }

  /** 按 requires 从基础件向上串出该 slot 的升级链 */
  private slotChain(slot: EquipmentSlot): EquipmentDef[] {
    const all = DataRegistry.allEquipment().filter((e) => e.slot === slot);
    const chain: EquipmentDef[] = [];
    let cur = all.find((e) => !e.requires);
    while (cur) {
      chain.push(cur);
      const id = cur.id;
      cur = all.find((e) => e.requires === id);
    }
    return chain;
  }

  /** 当前件 → 下一件的效果差值文案，如「氧气 60→100」 */
  private effectDiff(current: EquipmentDef | undefined, next: EquipmentDef): string {
    const parts: string[] = [];
    for (const key of Object.keys(next.effects) as (keyof EquipmentDef['effects'])[]) {
      const from = current?.effects[key];
      const to = next.effects[key];
      if (to === undefined) continue;
      parts.push(`${EFFECT_LABELS[key]} ${from ?? 0}→${to}`);
    }
    return parts.join('  ');
  }

  /** 购买校验：前置已购（链式取 next 已保证）+ 金钱足够；成功即扣钱入包并存档 */
  private buy(def: EquipmentDef): void {
    if (GameState.hasUpgrade(def.id)) return;
    if (def.requires && !GameState.hasUpgrade(def.requires)) return;
    if (!GameState.spendMoney(def.cost)) return;
    GameState.upgrades.push(def.id);
    SaveManager.save();
    this.moneyText.setText(`金币 ${GameState.money}`);
    this.openShop(); // 重建弹层刷新链状态与余额
  }
}
