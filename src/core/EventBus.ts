import Phaser from 'phaser';

/**
 * 全局事件总线。场景/系统之间唯一的通信通道：
 * 各系统互不 import，全部经 EventBus + GameState 交互。
 * UIScene 监听这里的事件更新 HUD，不直接引用玩法场景。
 */
export const EventBus = new Phaser.Events.EventEmitter();
