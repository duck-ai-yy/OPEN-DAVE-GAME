import { GameState } from './GameState';
import type { SaveData } from './types';

const SAVE_KEY = 'open-dave:save:v1';

/**
 * localStorage 存档。只存进度（天数/金钱/库存/升级），
 * 不存潜水中状态——潜水中退出 = 放弃本潜。
 * version 字段留给未来 schema 迁移函数表。
 */
export const SaveManager = {
  save(): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(GameState.toSave()));
    } catch {
      // 隐私模式等场景下写入失败：静默降级，游戏可玩但无持久化
    }
  },

  load(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw) as SaveData;
      if (data.version !== 1) return false;
      // 多地域功能上线前的旧档没有该字段：补初始地域，版本号不动
      if (!Array.isArray(data.unlockedRegions)) data.unlockedRegions = ['red_sea'];
      GameState.loadFrom(data);
      return true;
    } catch {
      return false;
    }
  },

  clear(): void {
    localStorage.removeItem(SAVE_KEY);
  },
};
