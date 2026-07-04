/**
 * 全局类型与数据表 schema —— 模块间的接口合同。
 * 数据驱动原则：鱼类/装备/菜谱/地域全部由 public/assets/data/*.json 描述，
 * 新增内容不改核心代码。
 */

// ---------- 输入抽象（双人预留的关键接缝） ----------

/** 每帧输入快照。Player 只读取 InputFrame，绝不直接访问 scene.input */
export interface InputFrame {
  /** -1..1 */
  moveX: number;
  /** -1..1 */
  moveY: number;
  /** 准星世界坐标 */
  aimWorldX: number;
  aimWorldY: number;
  /** 本帧按下开火（蓄力开始） */
  firePressed: boolean;
  /** 开火持续按住（蓄力中） */
  fireHeld: boolean;
  /** 本帧松开开火（蓄力释放） */
  fireReleased: boolean;
  /** 交互键（拾取/对话） */
  interact: boolean;
  /** 连打键（挣扎 QTE） */
  tap: boolean;
}

// ---------- 数据表 schema ----------

export type FishSize = 'small' | 'medium' | 'large';
export type FishBehavior = 'wander' | 'school' | 'flee_only' | 'aggressive';

export interface FishDef {
  id: string;
  name: string;
  texture: string;
  frame?: string;
  animKey?: string;
  size: FishSize;
  /** 占背包重量 */
  weight: number;
  hp: number;
  sellPrice: number;
  behavior: FishBehavior;
  /** 巡游速度 px/s */
  speed: number;
  fleeSpeed: number;
  /** aggressive 型的仇恨半径，其他为 0 */
  aggroRadius: number;
  fleeRadius: number;
  /** 咬一口扣多少氧，非攻击型为 0 */
  damage: number;
  /** 出现深度区间（米） */
  depthBand: [number, number];
  spawnWeight: number;
  /** medium/large 才需要；small 一叉即得 */
  struggle?: { duration: number; tapsRequired: number };
  /** 保护动物：不可攻击（P1 好感度系统入口） */
  protected?: boolean;
}

export type EquipmentSlot = 'tank' | 'cargo' | 'harpoon';

export interface EquipmentDef {
  id: string;
  slot: EquipmentSlot;
  name: string;
  cost: number;
  effects: {
    oxygenMax?: number;
    weightMax?: number;
    damage?: number;
    chargeRate?: number;
  };
  /** 升级链前置 */
  requires?: string;
}

export interface RecipeDef {
  id: string;
  name: string;
  ingredients: { fishId: string; count: number }[];
  /** 单份售价 */
  price: number;
  /** 一次做出几份 */
  servings: number;
  unlock: { type: 'default' } | { type: 'firstCatch'; fishId: string };
}

export interface DepthBandDef {
  /** [浅, 深] 米 */
  range: [number, number];
  oxygenDrainMul: number;
  spawns: { fishId: string; weight: number }[];
}

export interface RegionDef {
  id: string;
  name: string;
  /** Tiled 导出 JSON 的 key；框架期可为程序生成占位 */
  tilemapKey?: string;
  waterColor: string;
  /** 每米变暗系数（0..1） */
  ambientDarkenPerMeter: number;
  depthBands: DepthBandDef[];
  maxDepth: number;
}

// ---------- 存档 ----------

export interface SaveData {
  version: 1;
  day: number;
  money: number;
  /** 已购装备 id 列表 */
  upgrades: string[];
  /** 渔获库存 fishId -> count */
  inventory: Record<string, number>;
  unlockedRecipes: string[];
  /** 首捕记录（图鉴/菜谱解锁/未来水族馆的种子数据） */
  firstCatches: string[];
}

// ---------- 事件名常量 ----------

export const Events = {
  // 潜水
  OXYGEN_CHANGED: 'oxygen-changed',
  DEPTH_CHANGED: 'depth-changed',
  WEIGHT_CHANGED: 'weight-changed',
  FISH_CAUGHT: 'fish-caught',
  PLAYER_DAMAGED: 'player-damaged',
  PLAYER_RESCUED: 'player-rescued',
  DIVE_ENDED: 'dive-ended',
  // 经济 / 日循环
  MONEY_CHANGED: 'money-changed',
  DAY_ENDED: 'day-ended',
  RECIPE_UNLOCKED: 'recipe-unlocked',
} as const;

export type EventName = (typeof Events)[keyof typeof Events];

// ---------- 常量 ----------

/** 逻辑分辨率（像素风） */
export const GAME_WIDTH = 640;
export const GAME_HEIGHT = 360;
/** 深度换算：10px = 1m；水面所在世界 y */
export const PX_PER_METER = 10;
export const SURFACE_Y = 0;
