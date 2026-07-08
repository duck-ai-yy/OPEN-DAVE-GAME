import type { DecorationDef, EquipmentDef, FishDef, GadgetDef, RecipeDef, RegionDef } from '../core/types';

/**
 * 数据表注册中心。PreloadScene 加载 JSON 后调用 init()，
 * 之后任何模块通过这里按 id 查表——不允许各模块自己去读 cache。
 */
class DataRegistryImpl {
  private fish = new Map<string, FishDef>();
  private equipment = new Map<string, EquipmentDef>();
  private recipes = new Map<string, RecipeDef>();
  private regions = new Map<string, RegionDef>();
  private gadgets = new Map<string, GadgetDef>();
  private decorations = new Map<string, DecorationDef>();

  init(data: {
    fish: FishDef[];
    equipment: EquipmentDef[];
    recipes: RecipeDef[];
    regions: RegionDef[];
    gadgets?: GadgetDef[];
    decorations?: DecorationDef[];
  }): void {
    this.fish = new Map(data.fish.map((f) => [f.id, f]));
    this.equipment = new Map(data.equipment.map((e) => [e.id, e]));
    this.recipes = new Map(data.recipes.map((r) => [r.id, r]));
    this.regions = new Map(data.regions.map((r) => [r.id, r]));
    this.gadgets = new Map((data.gadgets ?? []).map((g) => [g.id, g]));
    this.decorations = new Map((data.decorations ?? []).map((d) => [d.id, d]));
    this.validate();
  }

  /** 表间引用完整性校验：启动即崩溃优于运行时静默出错 */
  private validate(): void {
    for (const r of this.recipes.values()) {
      for (const ing of r.ingredients) {
        if (!this.fish.has(ing.fishId)) {
          throw new Error(`recipes.json: "${r.id}" 引用了不存在的鱼 "${ing.fishId}"`);
        }
      }
      if (r.unlock.type === 'firstCatch' && !this.fish.has(r.unlock.fishId)) {
        throw new Error(`recipes.json: "${r.id}" 解锁条件引用了不存在的鱼 "${r.unlock.fishId}"`);
      }
    }
    for (const e of this.equipment.values()) {
      if (e.requires && !this.equipment.has(e.requires)) {
        throw new Error(`equipment.json: "${e.id}" 前置 "${e.requires}" 不存在`);
      }
    }
    for (const region of this.regions.values()) {
      for (const band of region.depthBands) {
        for (const s of band.spawns) {
          if (!this.fish.has(s.fishId)) {
            throw new Error(`region "${region.id}": 深度带引用了不存在的鱼 "${s.fishId}"`);
          }
        }
      }
    }
  }

  getFish(id: string): FishDef {
    const def = this.fish.get(id);
    if (!def) throw new Error(`未知鱼类 id: ${id}`);
    return def;
  }

  getEquipment(id: string): EquipmentDef {
    const def = this.equipment.get(id);
    if (!def) throw new Error(`未知装备 id: ${id}`);
    return def;
  }

  getRegion(id: string): RegionDef {
    const def = this.regions.get(id);
    if (!def) throw new Error(`未知地域 id: ${id}`);
    return def;
  }

  allFish(): FishDef[] {
    return [...this.fish.values()];
  }

  allEquipment(): EquipmentDef[] {
    return [...this.equipment.values()];
  }

  allRecipes(): RecipeDef[] {
    return [...this.recipes.values()];
  }

  allRegions(): RegionDef[] {
    return [...this.regions.values()];
  }

  getGadget(id: string): GadgetDef {
    const def = this.gadgets.get(id);
    if (!def) throw new Error(`未知合成道具 id: ${id}`);
    return def;
  }

  allGadgets(): GadgetDef[] {
    return [...this.gadgets.values()];
  }

  getDecoration(id: string): DecorationDef {
    const def = this.decorations.get(id);
    if (!def) throw new Error(`未知装饰 id: ${id}`);
    return def;
  }

  allDecorations(): DecorationDef[] {
    return [...this.decorations.values()];
  }
}

export const DataRegistry = new DataRegistryImpl();
