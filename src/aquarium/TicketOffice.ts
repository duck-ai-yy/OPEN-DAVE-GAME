import { EventBus } from '../core/EventBus';
import { GameState } from '../core/GameState';
import { DataRegistry } from '../data/DataRegistry';
import { Events } from '../core/types';
import { computeTicketIncome } from './AquariumRating';

let installed = false;

/**
 * 门票结算：监听打烊事件（DAY_ENDED），按展品计算门票收入直接入账。
 * EventBus.emit 是同步的，且 RestaurantScene 在 nextDay() 之后才 SaveManager.save()，
 * 因此这里的入账与 lastTicketIncome 一定会被同一次存档写盘。
 * 只允许安装一次——由 AquariumScene 模块加载时调用（main.ts 注册场景即触发），
 * 与是否进过水族馆无关，保证当天没进馆也照常结算。
 */
export function installTicketOffice(): void {
  if (installed) return;
  installed = true;
  EventBus.on(Events.DAY_ENDED, () => {
    const income = computeTicketIncome(
      GameState.aquarium.exhibits,
      (fishId) => DataRegistry.getFish(fishId).sellPrice,
    );
    GameState.aquarium.lastTicketIncome = income;
    if (income > 0) GameState.addMoney(income);
  });
}
