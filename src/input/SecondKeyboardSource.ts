import Phaser from 'phaser';
import type { InputFrame } from '../core/types';
import type { InputSource } from './InputSource';

/**
 * P2 键盘输入源：方向键移动，Shift 蓄力/松开发射，Ctrl 连打，回车交互。
 * 无鼠标可用，瞄准 = 最后移动方向的延长线（origin 由持有者注入，
 * 因为输入源不该反向依赖 Player）。
 */
export class SecondKeyboardSource implements InputSource {
  private keys?: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    fire: Phaser.Input.Keyboard.Key;
    tap: Phaser.Input.Keyboard.Key;
    interact: Phaser.Input.Keyboard.Key;
  };
  private boundScene?: Phaser.Scene;
  private prevFireDown = false;
  private lastDirX = 1;
  private lastDirY = 0;
  private getOrigin: () => { x: number; y: number };

  private static readonly AIM_REACH = 120;

  constructor(getOrigin: () => { x: number; y: number }) {
    this.getOrigin = getOrigin;
  }

  private ensureKeys(scene: Phaser.Scene): void {
    if (this.keys && this.boundScene === scene) return;
    const kb = scene.input.keyboard;
    if (!kb) return;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      up: kb.addKey(K.UP),
      down: kb.addKey(K.DOWN),
      left: kb.addKey(K.LEFT),
      right: kb.addKey(K.RIGHT),
      fire: kb.addKey(K.SHIFT),
      tap: kb.addKey(K.CTRL),
      interact: kb.addKey(K.ENTER),
    };
    this.boundScene = scene;
  }

  poll(scene: Phaser.Scene): InputFrame {
    this.ensureKeys(scene);
    const k = this.keys;

    let moveX = 0;
    let moveY = 0;
    if (k) {
      if (k.left.isDown) moveX -= 1;
      if (k.right.isDown) moveX += 1;
      if (k.up.isDown) moveY -= 1;
      if (k.down.isDown) moveY += 1;
    }
    if (moveX !== 0 && moveY !== 0) {
      const inv = 1 / Math.SQRT2;
      moveX *= inv;
      moveY *= inv;
    }
    if (moveX !== 0 || moveY !== 0) {
      this.lastDirX = moveX;
      this.lastDirY = moveY;
    }

    const origin = this.getOrigin();
    const fireDown = k ? k.fire.isDown : false;
    const frame: InputFrame = {
      moveX,
      moveY,
      aimWorldX: origin.x + this.lastDirX * SecondKeyboardSource.AIM_REACH,
      aimWorldY: origin.y + this.lastDirY * SecondKeyboardSource.AIM_REACH,
      firePressed: fireDown && !this.prevFireDown,
      fireHeld: fireDown,
      fireReleased: !fireDown && this.prevFireDown,
      interact: k ? Phaser.Input.Keyboard.JustDown(k.interact) : false,
      tap: k ? Phaser.Input.Keyboard.JustDown(k.tap) : false,
    };
    this.prevFireDown = fireDown;
    return frame;
  }
}
