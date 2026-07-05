import Phaser from 'phaser';
import { EventBus } from '../core/EventBus';
import { Events, GAME_HEIGHT, GAME_WIDTH } from '../core/types';
import type { InputFrame } from '../core/types';
import { Fish } from './Fish';
import type { Player } from './Player';

/**
 * 鱼叉三段：蓄力（按住）→ 射出（松开，蓄力影响速度）→ 中大鱼挣扎连打 QTE。
 * 小鱼一叉即得；保护动物免疫并提示。捕获经 EventBus 发 FISH_CAUGHT，
 * 库存归属由场景侧处理——本模块不碰 GameState。
 */
export class Harpoon {
  /** M3 接入装备数值前的基础伤害/蓄力速率 */
  static damage = 1;
  static chargeRate = 1.0;

  private static readonly CHARGE_TIME_MS = 800;
  private static readonly PROJ_SPEED_MIN = 320;
  private static readonly PROJ_SPEED_MAX = 640;
  private static readonly PROJ_LIFE_MS = 900;

  private scene: Phaser.Scene;
  private player: Player;

  private charge = 0;
  private charging = false;
  private chargeBar: Phaser.GameObjects.Rectangle;
  private chargeBarBg: Phaser.GameObjects.Rectangle;

  private projectile?: Phaser.Physics.Arcade.Image;
  private projLifeMs = 0;

  // 挣扎 QTE
  private struggling: Fish | null = null;
  private struggleTaps = 0;
  private struggleTimerMs = 0;
  private rope: Phaser.GameObjects.Graphics;
  private qteText: Phaser.GameObjects.Text;
  private qteBar: Phaser.GameObjects.Rectangle;
  private qteBarBg: Phaser.GameObjects.Rectangle;

  private toast: Phaser.GameObjects.Text;
  private toastTimerMs = 0;

  constructor(scene: Phaser.Scene, player: Player) {
    this.scene = scene;
    this.player = player;

    this.chargeBarBg = scene.add.rectangle(0, 0, 22, 4, 0x0a2233).setDepth(500).setVisible(false);
    this.chargeBar = scene.add.rectangle(0, 0, 0, 2, 0xffd97d).setDepth(501).setVisible(false);
    this.rope = scene.add.graphics().setDepth(499);

    this.qteText = scene.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 64, '', {
        fontFamily: 'monospace', fontSize: '12px', color: '#ffd97d',
        backgroundColor: '#123047cc', padding: { x: 10, y: 5 },
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(1002).setVisible(false);
    this.qteBarBg = scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 44, 160, 8, 0x0a2233)
      .setScrollFactor(0).setDepth(1002).setVisible(false);
    this.qteBar = scene.add
      .rectangle(GAME_WIDTH / 2 - 79, GAME_HEIGHT - 44, 0, 6, 0x8bd3dd)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(1003).setVisible(false);

    this.toast = scene.add
      .text(GAME_WIDTH / 2, 90, '', {
        fontFamily: 'monospace', fontSize: '11px', color: '#ff8f8f',
        backgroundColor: '#123047cc', padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(1002).setVisible(false);
  }

  get isStruggling(): boolean {
    return this.struggling !== null;
  }

  update(frame: InputFrame, dtMs: number, fishes: Fish[]): void {
    this.updateToast(dtMs);
    if (this.struggling) {
      this.updateStruggle(frame, dtMs);
      return;
    }
    this.updateCharge(frame, dtMs);
    this.updateProjectile(dtMs, fishes);
    this.rope.clear();
  }

  private updateCharge(frame: InputFrame, dtMs: number): void {
    if (frame.firePressed && !this.projectile) {
      this.charging = true;
      this.charge = 0;
    }
    if (this.charging && frame.fireHeld) {
      this.charge = Math.min(1, this.charge + (dtMs / Harpoon.CHARGE_TIME_MS) * Harpoon.chargeRate);
      this.chargeBarBg.setPosition(this.player.x, this.player.y - 16).setVisible(true);
      this.chargeBar
        .setPosition(this.player.x - 10, this.player.y - 16)
        .setSize(20 * this.charge, 2)
        .setVisible(true);
    }
    if (this.charging && frame.fireReleased) {
      this.charging = false;
      this.chargeBar.setVisible(false);
      this.chargeBarBg.setVisible(false);
      this.fire(frame);
      this.charge = 0;
    }
  }

  private fire(frame: InputFrame): void {
    const dir = new Phaser.Math.Vector2(frame.aimWorldX - this.player.x, frame.aimWorldY - this.player.y);
    if (dir.lengthSq() < 1) dir.set(this.player.sprite.flipX ? -1 : 1, 0);
    dir.normalize();
    const speed = Phaser.Math.Linear(Harpoon.PROJ_SPEED_MIN, Harpoon.PROJ_SPEED_MAX, this.charge);

    this.projectile = this.scene.physics.add.image(this.player.x, this.player.y, 'ph_harpoon');
    this.projectile.setRotation(dir.angle());
    (this.projectile.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    this.projectile.setVelocity(dir.x * speed, dir.y * speed);
    this.projLifeMs = Harpoon.PROJ_LIFE_MS;
  }

  private updateProjectile(dtMs: number, fishes: Fish[]): void {
    const proj = this.projectile;
    if (!proj) return;
    this.projLifeMs -= dtMs;
    if (this.projLifeMs <= 0) {
      proj.destroy();
      this.projectile = undefined;
      return;
    }
    // 简单圆形命中判定（半径 12px），避免为一支叉维护 overlap collider
    for (const fish of fishes) {
      if (!fish.alive || fish.state === 'struggle') continue;
      const dx = fish.x - proj.x;
      const dy = fish.y - proj.y;
      if (dx * dx + dy * dy > 14 * 14) continue;
      this.hit(fish);
      proj.destroy();
      this.projectile = undefined;
      return;
    }
  }

  private hit(fish: Fish): void {
    if (fish.def.protected) {
      this.showToast(`🚫 ${fish.def.name}是保护动物！`);
      return;
    }
    if (fish.def.size === 'small') {
      this.catchFish(fish);
      return;
    }
    fish.hp -= Harpoon.damage;
    if (fish.hp <= 0) {
      this.beginStruggle(fish);
    } else {
      fish.forceFlee();
    }
  }

  private beginStruggle(fish: Fish): void {
    const cfg = fish.def.struggle ?? { duration: 3, tapsRequired: 8 };
    this.struggling = fish;
    fish.state = 'struggle';
    this.struggleTaps = 0;
    this.struggleTimerMs = cfg.duration * 1000;
    this.qteText.setText(`${fish.def.name} 在挣扎！连打 J/空格 0/${cfg.tapsRequired}`).setVisible(true);
    this.qteBarBg.setVisible(true);
    this.qteBar.setVisible(true).setSize(0, 6);
  }

  private updateStruggle(frame: InputFrame, dtMs: number): void {
    const fish = this.struggling;
    if (!fish || !fish.alive) {
      this.endStruggle();
      return;
    }
    const cfg = fish.def.struggle ?? { duration: 3, tapsRequired: 8 };
    this.struggleTimerMs -= dtMs;

    if (frame.tap) {
      this.struggleTaps += 1;
      this.qteText.setText(`${fish.def.name} 在挣扎！连打 J/空格 ${this.struggleTaps}/${cfg.tapsRequired}`);
      this.qteBar.setSize(158 * Math.min(1, this.struggleTaps / cfg.tapsRequired), 6);
    }

    // 绳：玩家与鱼之间的连线 + 距离约束（鱼拖不动就被拉近）
    this.rope.clear();
    this.rope.lineStyle(1, 0xd1ccc0, 0.9);
    this.rope.lineBetween(this.player.x, this.player.y, fish.x, fish.y);
    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, fish.x, fish.y);
    if (dist > 90) {
      const body = fish.sprite.body as Phaser.Physics.Arcade.Body;
      const pull = new Phaser.Math.Vector2(this.player.x - fish.x, this.player.y - fish.y).normalize().scale(120);
      body.velocity.x += pull.x * (dtMs / 1000) * 8;
      body.velocity.y += pull.y * (dtMs / 1000) * 8;
    }

    if (this.struggleTaps >= cfg.tapsRequired) {
      this.catchFish(fish);
      this.endStruggle();
    } else if (this.struggleTimerMs <= 0) {
      fish.hp = Math.max(1, Math.ceil(fish.def.hp / 2));
      fish.forceFlee();
      this.showToast(`${fish.def.name} 挣脱了…`);
      this.endStruggle();
    }
  }

  private endStruggle(): void {
    this.struggling = null;
    this.rope.clear();
    this.qteText.setVisible(false);
    this.qteBar.setVisible(false);
    this.qteBarBg.setVisible(false);
  }

  private catchFish(fish: Fish): void {
    fish.state = 'caught';
    const sprite = fish.sprite;
    this.scene.tweens.add({
      targets: sprite,
      scale: 0,
      alpha: 0,
      duration: 250,
      onComplete: () => sprite.destroy(),
    });
    EventBus.emit(Events.FISH_CAUGHT, { fishId: fish.def.id });
  }

  private showToast(msg: string): void {
    this.toast.setText(msg).setVisible(true);
    this.toastTimerMs = 1600;
  }

  private updateToast(dtMs: number): void {
    if (!this.toast.visible) return;
    this.toastTimerMs -= dtMs;
    if (this.toastTimerMs <= 0) this.toast.setVisible(false);
  }
}
