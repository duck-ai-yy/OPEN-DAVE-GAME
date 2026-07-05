import Phaser from 'phaser';
import { EventBus } from '../core/EventBus';
import { Events } from '../core/types';
import { GameState } from '../core/GameState';

/**
 * 常驻 HUD overlay，与 DiveScene 并行运行（scene.launch）。
 * 只监听 EventBus，不直接引用任何玩法场景。
 */
export class UIScene extends Phaser.Scene {
  private depthText!: Phaser.GameObjects.Text;
  private oxygenText!: Phaser.GameObjects.Text;
  private weightText!: Phaser.GameObjects.Text;
  private moneyText!: Phaser.GameObjects.Text;

  constructor() {
    super('UI');
  }

  create(): void {
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#e8f4f8',
    };
    this.depthText = this.add.text(8, 8, '深度 0m', style);
    this.oxygenText = this.add.text(8, 20, '氧气 --', style);
    this.weightText = this.add.text(8, 32, '负重 --', style);
    this.moneyText = this.add.text(8, 44, `金币 ${GameState.money}`, style);

    const onDepth = (m: number) => this.depthText.setText(`深度 ${m}m`);
    const onOxygen = (v: { current: number; max: number }) => {
      this.oxygenText.setText(`氧气 ${Math.ceil(v.current)}/${v.max}`);
      this.oxygenText.setColor(v.current / v.max < 0.25 ? '#ff8f8f' : '#e8f4f8');
    };
    const onWeight = (v: { current: number; max: number }) => {
      this.weightText.setText(`负重 ${v.current}/${v.max}${v.current > v.max ? ' 超重!' : ''}`);
      this.weightText.setColor(v.current > v.max ? '#ffd97d' : '#e8f4f8');
    };
    const onMoney = (m: number) => this.moneyText.setText(`金币 ${m}`);

    EventBus.on(Events.DEPTH_CHANGED, onDepth);
    EventBus.on(Events.OXYGEN_CHANGED, onOxygen);
    EventBus.on(Events.WEIGHT_CHANGED, onWeight);
    EventBus.on(Events.MONEY_CHANGED, onMoney);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      EventBus.off(Events.DEPTH_CHANGED, onDepth);
      EventBus.off(Events.OXYGEN_CHANGED, onOxygen);
      EventBus.off(Events.WEIGHT_CHANGED, onWeight);
      EventBus.off(Events.MONEY_CHANGED, onMoney);
    });
  }
}
