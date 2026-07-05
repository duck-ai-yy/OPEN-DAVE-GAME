import type { EquipmentDef, EquipmentSlot } from './types';

/**
 * 装备数值聚合 —— 纯函数模块，不依赖 Phaser/DataRegistry，
 * 装备表以参数传入（测试可直接喂 JSON，运行时由调用方从 DataRegistry 取）。
 * DiveScene 等只消费聚合后的 PlayerStats，不关心具体穿了哪件。
 */
export interface PlayerStats {
  oxygenMax: number;
  weightMax: number;
  harpoonDamage: number;
  chargeRate: number;
}

/** requires 链深度：无前置的基础件 = 0，越深级别越高 */
function chainDepth(def: EquipmentDef, byId: Map<string, EquipmentDef>): number {
  let depth = 0;
  let cur = def;
  // 数据表由 DataRegistry.validate 保证 requires 引用存在且无环
  while (cur.requires) {
    const prev = byId.get(cur.requires);
    if (!prev) break;
    depth += 1;
    cur = prev;
  }
  return depth;
}

/**
 * 聚合已购装备：每个 slot 取链深度最高的一件；
 * 未购的 slot 回退到该槽位的基础件（无 requires，即 lv1 免费装备），
 * 因此 upgrades 为空时返回 tank_lv1/cargo_lv1/harpoon_lv1 的基础数值。
 */
export function getPlayerStats(upgrades: string[], equipmentList: EquipmentDef[]): PlayerStats {
  const byId = new Map(equipmentList.map((e) => [e.id, e]));
  const best: Partial<Record<EquipmentSlot, EquipmentDef>> = {};

  for (const id of upgrades) {
    const def = byId.get(id);
    if (!def) continue; // 存档里出现未知 id：忽略而非崩溃，兼容表被删条目
    const cur = best[def.slot];
    if (!cur || chainDepth(def, byId) > chainDepth(cur, byId)) {
      best[def.slot] = def;
    }
  }

  for (const def of equipmentList) {
    if (!def.requires && !best[def.slot]) {
      best[def.slot] = def;
    }
  }

  return {
    oxygenMax: best.tank?.effects.oxygenMax ?? 0,
    weightMax: best.cargo?.effects.weightMax ?? 0,
    harpoonDamage: best.harpoon?.effects.damage ?? 0,
    chargeRate: best.harpoon?.effects.chargeRate ?? 1,
  };
}
