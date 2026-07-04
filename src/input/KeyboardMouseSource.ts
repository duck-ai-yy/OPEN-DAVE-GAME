import Phaser from 'phaser';
import type { InputFrame } from '../core/types';
import type { InputSource } from './InputSource';

/** WASD/方向键移动 + 鼠标瞄准/左键开火 + E 交互 + J/空格连打 */
export class KeyboardMouseSource implements InputSource {
  private keys?: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
    up2: Phaser.Input.Keyboard.Key;
    down2: Phaser.Input.Keyboard.Key;
    left2: Phaser.Input.Keyboard.Key;
    right2: Phaser.Input.Keyboard.Key;
    interact: Phaser.Input.Keyboard.Key;
    tap: Phaser.Input.Keyboard.Key;
    tap2: Phaser.Input.Keyboard.Key;
  };
  private boundScene?: Phaser.Scene;
  private prevFireDown = false;

  private ensureKeys(scene: Phaser.Scene): void {
    if (this.keys && this.boundScene === scene) return;
    const kb = scene.input.keyboard;
    if (!kb) return;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      up: kb.addKey(K.W),
      down: kb.addKey(K.S),
      left: kb.addKey(K.A),
      right: kb.addKey(K.D),
      up2: kb.addKey(K.UP),
      down2: kb.addKey(K.DOWN),
      left2: kb.addKey(K.LEFT),
      right2: kb.addKey(K.RIGHT),
      interact: kb.addKey(K.E),
      tap: kb.addKey(K.J),
      tap2: kb.addKey(K.SPACE),
    };
    this.boundScene = scene;
  }

  poll(scene: Phaser.Scene): InputFrame {
    this.ensureKeys(scene);
    const k = this.keys;
    const pointer = scene.input.activePointer;
    const world = pointer.positionToCamera(scene.cameras.main) as Phaser.Math.Vector2;

    let moveX = 0;
    let moveY = 0;
    if (k) {
      if (k.left.isDown || k.left2.isDown) moveX -= 1;
      if (k.right.isDown || k.right2.isDown) moveX += 1;
      if (k.up.isDown || k.up2.isDown) moveY -= 1;
      if (k.down.isDown || k.down2.isDown) moveY += 1;
    }
    // 归一化斜向
    if (moveX !== 0 && moveY !== 0) {
      const inv = 1 / Math.SQRT2;
      moveX *= inv;
      moveY *= inv;
    }

    const fireDown = pointer.leftButtonDown();
    const frame: InputFrame = {
      moveX,
      moveY,
      aimWorldX: world.x,
      aimWorldY: world.y,
      firePressed: fireDown && !this.prevFireDown,
      fireHeld: fireDown,
      fireReleased: !fireDown && this.prevFireDown,
      interact: k ? Phaser.Input.Keyboard.JustDown(k.interact) : false,
      tap: k ? Phaser.Input.Keyboard.JustDown(k.tap) || Phaser.Input.Keyboard.JustDown(k.tap2) : false,
    };
    this.prevFireDown = fireDown;
    return frame;
  }
}
