import Phaser from 'phaser';
import type { InputFrame } from '../core/types';
import type { InputSource } from '../input/InputSource';

export interface PlayerConfig {
  x: number;
  y: number;
  /** 玩家编号（未来双人：0 / 1） */
  index: number;
}

/**
 * 潜水员。手感参数（spike 定稿）：
 * acceleration 600、maxVelocity 200（超重降 120）、drag 400、无输入轻微下沉。
 * 只消费 InputFrame，绝不直接访问 scene.input —— 双人/联机预留。
 */
export class Player {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  readonly index: number;
  private input: InputSource;
  overweight = false;
  private lastFrame: InputFrame | null = null;

  static readonly ACCEL = 600;
  static readonly MAX_VEL = 200;
  static readonly MAX_VEL_OVERWEIGHT = 120;
  static readonly DRAG = 400;
  static readonly SINK_ACCEL = 12;

  constructor(scene: Phaser.Scene, input: InputSource, config: PlayerConfig) {
    this.input = input;
    this.index = config.index;
    this.sprite = scene.physics.add.sprite(config.x, config.y, 'ph_diver');
    this.sprite.setDrag(Player.DRAG, Player.DRAG);
    this.sprite.setMaxVelocity(Player.MAX_VEL, Player.MAX_VEL);
    this.sprite.setCollideWorldBounds(true);
  }

  setOverweight(value: boolean): void {
    if (this.overweight === value) return;
    this.overweight = value;
    const max = value ? Player.MAX_VEL_OVERWEIGHT : Player.MAX_VEL;
    this.sprite.setMaxVelocity(max, max);
  }

  /** 每帧由 DiveScene 调用 */
  update(scene: Phaser.Scene): InputFrame {
    const frame = this.input.poll(scene);
    this.lastFrame = frame;

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setAcceleration(frame.moveX * Player.ACCEL, frame.moveY * Player.ACCEL);
    // 无输入时轻微下沉（负重潜水直觉）
    if (frame.moveX === 0 && frame.moveY === 0) {
      body.setAccelerationY(Player.SINK_ACCEL);
    }
    // 朝向：只水平翻转，不旋转身体
    if (frame.moveX !== 0) {
      this.sprite.setFlipX(frame.moveX < 0);
    }
    return frame;
  }

  get frame(): InputFrame | null {
    return this.lastFrame;
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }
}
