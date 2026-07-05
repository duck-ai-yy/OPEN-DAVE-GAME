import { describe, expect, it } from 'vitest';
import { getPlayerStats } from '../src/core/EquipmentStats';
import type { EquipmentDef } from '../src/core/types';
import equipmentJson from '../public/assets/data/equipment.json';

// 直接吃真实数据表：表改动（如调数值）时测试同步验证聚合逻辑
const equipment = equipmentJson as EquipmentDef[];

describe('getPlayerStats', () => {
  it('upgrades 为空时返回三件 lv1 基础值', () => {
    expect(getPlayerStats([], equipment)).toEqual({
      oxygenMax: 60,
      weightMax: 12,
      harpoonDamage: 1,
      chargeRate: 1.0,
    });
  });

  it('单槽位升级只影响该槽位，其余保持基础值', () => {
    const stats = getPlayerStats(['tank_lv1', 'cargo_lv1', 'harpoon_lv1', 'tank_lv2'], equipment);
    expect(stats.oxygenMax).toBe(100);
    expect(stats.weightMax).toBe(12);
    expect(stats.harpoonDamage).toBe(1);
    expect(stats.chargeRate).toBe(1.0);
  });

  it('同槽位持有多级时取链深度最高的一件（与数组顺序无关）', () => {
    const stats = getPlayerStats(['tank_lv3', 'tank_lv1', 'tank_lv2'], equipment);
    expect(stats.oxygenMax).toBe(160);
  });

  it('三槽位满级时聚合各自 lv3 的效果', () => {
    const stats = getPlayerStats(
      ['tank_lv1', 'tank_lv2', 'tank_lv3', 'cargo_lv1', 'cargo_lv2', 'cargo_lv3', 'harpoon_lv1', 'harpoon_lv2', 'harpoon_lv3'],
      equipment,
    );
    expect(stats).toEqual({
      oxygenMax: 160,
      weightMax: 36,
      harpoonDamage: 4,
      chargeRate: 1.6,
    });
  });

  it('存档里的未知装备 id 被忽略，不影响其余聚合', () => {
    const stats = getPlayerStats(['ghost_item', 'cargo_lv2'], equipment);
    expect(stats.weightMax).toBe(22);
    expect(stats.oxygenMax).toBe(60);
  });

  it('装备表以参数传入：换一张表也能正确聚合', () => {
    const tiny: EquipmentDef[] = [
      { id: 'a1', slot: 'tank', name: 'A1', cost: 0, effects: { oxygenMax: 10 } },
      { id: 'a2', slot: 'tank', name: 'A2', cost: 50, effects: { oxygenMax: 30 }, requires: 'a1' },
    ];
    expect(getPlayerStats(['a2'], tiny).oxygenMax).toBe(30);
    // 表里没有 cargo/harpoon 槽位：对应数值回退为 0 / 默认蓄力 1
    expect(getPlayerStats([], tiny)).toEqual({
      oxygenMax: 10,
      weightMax: 0,
      harpoonDamage: 0,
      chargeRate: 1,
    });
  });
});
