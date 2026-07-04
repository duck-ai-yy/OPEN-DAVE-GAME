import type Phaser from 'phaser';
import type { InputFrame } from '../core/types';

/**
 * 输入源抽象。Player 构造时注入一个 InputSource，每帧 poll 出 InputFrame。
 * 实现：KeyboardMouseSource（现在）/ GamepadSource、SecondKeyboardSource、
 * NetworkSource（未来双人/联机）——Player 与 DiveScene 代码零改动。
 */
export interface InputSource {
  /** 每帧调用一次，返回当前输入快照 */
  poll(scene: Phaser.Scene): InputFrame;
}

export const EMPTY_FRAME: InputFrame = {
  moveX: 0,
  moveY: 0,
  aimWorldX: 0,
  aimWorldY: 0,
  firePressed: false,
  fireHeld: false,
  fireReleased: false,
  interact: false,
  tap: false,
};
