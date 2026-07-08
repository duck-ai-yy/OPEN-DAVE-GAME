import { describe, expect, it } from 'vitest';
import {
  computeRating,
  computeRatingScore,
  computeTicketIncome,
} from '../src/aquarium/AquariumRating';
import type { FishDef } from '../src/core/types';
import fishJson from '../public/assets/data/fish.json';

// 直接吃真实鱼表：sellPrice 调整时门票测试同步验证公式
const fishById = new Map((fishJson as FishDef[]).map((f) => [f.id, f]));
const price = (id: string): number => {
  const def = fishById.get(id);
  if (!def) throw new Error(`测试引用了不存在的鱼 ${id}`);
  return def.sellPrice;
};

describe('computeRating', () => {
  it('空馆（无展品无装饰）保底 1 星', () => {
    expect(computeRating({ speciesCount: 0, totalValue: 0, decorationBonus: 0 })).toBe(1);
  });

  it('种类数权重高于总价值：同价值下种类多的星级更高', () => {
    // 3 种低价鱼 vs 1 种高价鱼，总价值相同
    const many = computeRating({ speciesCount: 3, totalValue: 300, decorationBonus: 0 });
    const single = computeRating({ speciesCount: 1, totalValue: 300, decorationBonus: 0 });
    expect(many).toBeGreaterThan(single);
  });

  it('装饰加成可以推动星级跨档（e2e 种子场景：2 种 290 金 + 气泡机）', () => {
    // 沙丁鱼×2 + 金枪鱼×1：score = 2×12 + 290/40 = 31.25 → 2 星
    const before = { speciesCount: 2, totalValue: 290, decorationBonus: 0 };
    expect(computeRatingScore(before)).toBeCloseTo(31.25);
    expect(computeRating(before)).toBe(2);
    // 买气泡机（+6）后 37.25 → 3 星
    expect(computeRating({ ...before, decorationBonus: 6 })).toBe(3);
  });

  it('高分封顶 5 星，不会溢出', () => {
    expect(computeRating({ speciesCount: 20, totalValue: 10000, decorationBonus: 37 })).toBe(5);
  });

  it('星级只能落在 1~5 区间', () => {
    for (let species = 0; species <= 25; species++) {
      const stars = computeRating({ speciesCount: species, totalValue: species * 200, decorationBonus: 0 });
      expect(stars).toBeGreaterThanOrEqual(1);
      expect(stars).toBeLessThanOrEqual(5);
    }
  });
});

describe('computeTicketIncome', () => {
  it('空馆收入为 0', () => {
    expect(computeTicketIncome({}, price)).toBe(0);
  });

  it('e2e 种子场景精确值：沙丁鱼×2 + 金枪鱼×1 = 64', () => {
    // 5×3 + (15+260)×0.15 × (1 + 0.1×2) = 15 + 41.25×1.2 = 64.5 → 64
    expect(computeTicketIncome({ sardine: 2, tuna: 1 }, price)).toBe(64);
  });

  it('单一种类堆数量：鱼价部分只按种类计一次', () => {
    // 5×5 + 15×0.15×1.1 = 25 + 2.475 = 27.475 → 27
    expect(computeTicketIncome({ sardine: 5 }, price)).toBe(27);
  });

  it('计数为 0 的种类不参与总数与多样性', () => {
    expect(computeTicketIncome({ sardine: 2, tuna: 0 }, price)).toBe(
      computeTicketIncome({ sardine: 2 }, price),
    );
  });

  it('种类越多多样性系数越大：拆成多种比堆同种收入高', () => {
    // 同为 3 条、总价接近：2 种 vs 1 种
    const diverse = computeTicketIncome({ sardine: 2, clownfish: 1 }, price);
    const mono = computeTicketIncome({ sardine: 3 }, price);
    expect(diverse).toBeGreaterThan(mono);
  });
});
