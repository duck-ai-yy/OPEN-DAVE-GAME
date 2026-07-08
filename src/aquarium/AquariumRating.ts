/**
 * 水族馆评级与门票收入 —— 纯函数模块，不依赖 Phaser / 全局状态，
 * 鱼价通过 getSellPrice 回调注入，便于单测直接喂假数据。
 */

/** 评级输入：全部由调用方从 GameState/数据表聚合好再传入 */
export interface RatingInput {
  /** 展出的鱼种类数（多样性只按种类算，与每种条数无关） */
  speciesCount: number;
  /** 展品总价值 = Σ(sellPrice × 条数) */
  totalValue: number;
  /** 装饰得分 = Σ 已购装饰的 ratingBonus */
  decorationBonus: number;
}

/**
 * 评级综合得分。种类数权重最高（一种鱼 = 12 分），
 * 总价值折算（40 金币 = 1 分），装饰按 ratingBonus 直加。
 */
export function computeRatingScore(input: RatingInput): number {
  return input.speciesCount * 12 + input.totalValue / 40 + input.decorationBonus;
}

/** 得分 → 星级 1~5：空馆保底 1 星，85 分封顶 5 星 */
export function computeRating(input: RatingInput): number {
  const score = computeRatingScore(input);
  if (score >= 85) return 5;
  if (score >= 55) return 4;
  if (score >= 32) return 3;
  if (score >= 15) return 2;
  return 1;
}

/**
 * 每日门票收入（打烊结算调用）：
 *   收入 = 5 × 展品总条数 + Σ(每种鱼 sellPrice × 0.15) × (1 + 0.1 × 种类数)，向下取整。
 * 多样性系数只乘鱼价部分——鼓励凑种类而非堆同一种鱼。空馆返回 0。
 */
export function computeTicketIncome(
  exhibits: Record<string, number>,
  getSellPrice: (fishId: string) => number,
): number {
  let totalCount = 0;
  let speciesCount = 0;
  let speciesPriceSum = 0;
  for (const [fishId, count] of Object.entries(exhibits)) {
    if (count <= 0) continue;
    totalCount += count;
    speciesCount += 1;
    speciesPriceSum += getSellPrice(fishId) * 0.15;
  }
  if (totalCount === 0) return 0;
  return Math.floor(5 * totalCount + speciesPriceSum * (1 + 0.1 * speciesCount));
}
