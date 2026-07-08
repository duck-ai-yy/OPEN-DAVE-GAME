import Phaser from 'phaser';
import { DataRegistry } from '../data/DataRegistry';
import type { DecorationDef, EquipmentDef, FishDef, GadgetDef, RecipeDef, RegionDef } from '../core/types';

/**
 * 加载数据表与素材，生成程序占位纹理，初始化 DataRegistry。
 * 占位纹理约定：ph_ 前缀 = placeholder，正式像素素材接入后按同 key 替换。
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  preload(): void {
    const { width, height } = this.scale;
    const barBg = this.add.rectangle(width / 2, height / 2, 240, 12, 0x0a2233);
    const bar = this.add.rectangle(width / 2 - 118, height / 2, 4, 8, 0x4fc3f7).setOrigin(0, 0.5);
    this.load.on('progress', (v: number) => {
      bar.width = 236 * v;
    });
    this.load.on('complete', () => {
      barBg.destroy();
      bar.destroy();
    });

    this.load.json('data_fish', 'assets/data/fish.json');
    this.load.json('data_equipment', 'assets/data/equipment.json');
    this.load.json('data_recipes', 'assets/data/recipes.json');
    this.load.json('data_region_red_sea', 'assets/data/regions/red_sea.json');
    this.load.json('data_region_great_barrier_reef', 'assets/data/regions/great_barrier_reef.json');
    this.load.json('data_region_shipwreck', 'assets/data/regions/shipwreck.json');
    this.load.json('data_gadgets', 'assets/data/gadgets.json');
    this.load.json('data_decorations', 'assets/data/decorations.json');
  }

  create(): void {
    DataRegistry.init({
      fish: this.cache.json.get('data_fish') as FishDef[],
      equipment: this.cache.json.get('data_equipment') as EquipmentDef[],
      recipes: this.cache.json.get('data_recipes') as RecipeDef[],
      regions: [
        this.cache.json.get('data_region_red_sea') as RegionDef,
        this.cache.json.get('data_region_great_barrier_reef') as RegionDef,
        this.cache.json.get('data_region_shipwreck') as RegionDef,
      ],
      gadgets: this.cache.json.get('data_gadgets') as GadgetDef[],
      decorations: this.cache.json.get('data_decorations') as DecorationDef[],
    });

    this.makePlaceholders();
    this.scene.start('Surface');
  }

  /** 程序生成占位纹理（色块），后续被 CC0 像素素材按 key 替换 */
  private makePlaceholders(): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);

    // 潜水员 12×16
    g.fillStyle(0xffcf6e);
    g.fillRect(0, 0, 12, 16);
    g.fillStyle(0x2c3e50);
    g.fillRect(0, 0, 12, 6);
    g.generateTexture('ph_diver', 12, 16);
    g.clear();

    // 小鱼 10×6 / 中鱼 18×10 / 大鱼 30×16
    g.fillStyle(0x8bd3dd);
    g.fillRect(0, 0, 10, 6);
    g.generateTexture('ph_fish_small', 10, 6);
    g.clear();
    g.fillStyle(0xf3a683);
    g.fillRect(0, 0, 18, 10);
    g.generateTexture('ph_fish_medium', 18, 10);
    g.clear();
    g.fillStyle(0xc44569);
    g.fillRect(0, 0, 30, 16);
    g.generateTexture('ph_fish_large', 30, 16);
    g.clear();

    // 鱼叉 8×2
    g.fillStyle(0xd1ccc0);
    g.fillRect(0, 0, 8, 2);
    g.generateTexture('ph_harpoon', 8, 2);
    g.clear();

    // 1×1 白点（粒子/遮罩通用）
    g.fillStyle(0xffffff);
    g.fillRect(0, 0, 1, 1);
    g.generateTexture('ph_pixel', 1, 1);
    g.destroy();
  }
}
