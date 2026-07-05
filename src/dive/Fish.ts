import Phaser from 'phaser';
import { EventBus } from '../core/EventBus';
import { Events, PX_PER_METER } from '../core/types';
import type { FishDef } from '../core/types';

export type FishState = 'wander' | 'flee' | 'chase' | 'backoff' | 'struggle' | 'caught';

/**
 * 鱼实体：4 态 FSM + steering。不用寻路——转向惯性（速度 lerp）才是"像鱼"的关键。
 * WANDER ⇄ FLEE（进出 fleeRadius）；aggressive 型 WANDER→CHASE→咬一口→BACKOFF；
 * STRUGGLE/CAUGHT 由 Harpoon 驱动，本类只负责挣扎时的乱窜表现。
 */
export class Fish {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  readonly def: FishDef;
  hp: number;
  state: FishState = 'wander';

  /** 速度插值系数：转向惯性 */
  private static readonly STEER_LERP = 0.08;
  private static readonly BITE_COOLDOWN_MS = 1200;

  private target = new Phaser.Math.Vector2();
  private wanderDir = new Phaser.Math.Vector2(1, 0);
  private wanderTimerMs = 0;
  private stateTimerMs = 0;
  private biteCooldownMs = 0;
  private bobPhase = Math.random() * Math.PI * 2;

  constructor(scene: Phaser.Scene, def: FishDef, x: number, y: number) {
    this.def = def;
    this.hp = def.hp;
    this.sprite = scene.physics.add.sprite(x, y, def.texture, def.frame);
    this.sprite.setData('fish', this);
    (this.sprite.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
    this.pickWanderDir();
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  get alive(): boolean {
    return this.state !== 'caught' && this.sprite.active;
  }

  update(dtMs: number, playerX: number, playerY: number, timeMs: number): void {
    if (!this.alive) return;
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    const dx = this.x - playerX;
    const dy = this.y - playerY;
    const distSq = dx * dx + dy * dy;
    this.biteCooldownMs = Math.max(0, this.biteCooldownMs - dtMs);

    switch (this.state) {
      case 'wander': {
        this.wanderTimerMs -= dtMs;
        if (this.wanderTimerMs <= 0) this.pickWanderDir();
        // 游动波形：y 方向叠加 sin 摆动
        const bob = Math.sin(timeMs / 400 + this.bobPhase) * 18;
        this.target.set(this.wanderDir.x * this.def.speed, this.wanderDir.y * this.def.speed + bob);
        this.keepInDepthBand();

        if (this.def.fleeRadius > 0 && distSq < this.def.fleeRadius ** 2) {
          this.state = 'flee';
        } else if (this.def.aggroRadius > 0 && distSq < this.def.aggroRadius ** 2) {
          this.state = 'chase';
        }
        break;
      }
      case 'flee': {
        const d = Math.max(1, Math.sqrt(distSq));
        this.target.set((dx / d) * this.def.fleeSpeed, (dy / d) * this.def.fleeSpeed);
        if (distSq > (this.def.fleeRadius * 1.5) ** 2) {
          this.state = 'wander';
          this.pickWanderDir();
        }
        break;
      }
      case 'chase': {
        const d = Math.max(1, Math.sqrt(distSq));
        const spd = this.def.speed * 1.5;
        this.target.set((-dx / d) * spd, (-dy / d) * spd);
        // 咬一口：贴近且冷却完毕
        if (distSq < 22 ** 2 && this.biteCooldownMs === 0) {
          EventBus.emit(Events.PLAYER_DAMAGED, { amount: this.def.damage, source: this.def.id });
          this.biteCooldownMs = Fish.BITE_COOLDOWN_MS;
          this.state = 'backoff';
          this.stateTimerMs = 700;
        }
        if (distSq > (this.def.aggroRadius * 1.6) ** 2) this.state = 'wander';
        break;
      }
      case 'backoff': {
        const d = Math.max(1, Math.sqrt(distSq));
        this.target.set((dx / d) * this.def.speed, (dy / d) * this.def.speed);
        this.stateTimerMs -= dtMs;
        if (this.stateTimerMs <= 0) this.state = 'chase';
        break;
      }
      case 'struggle': {
        // 被叉住乱窜：高频随机抖动，实际位移由 Harpoon 的绳约束决定
        this.target.set(
          Phaser.Math.Between(-1, 1) * this.def.fleeSpeed,
          Phaser.Math.Between(-1, 1) * this.def.fleeSpeed,
        );
        break;
      }
      case 'caught':
        return;
    }

    // 转向惯性
    body.velocity.x = Phaser.Math.Linear(body.velocity.x, this.target.x, Fish.STEER_LERP);
    body.velocity.y = Phaser.Math.Linear(body.velocity.y, this.target.y, Fish.STEER_LERP);
    if (Math.abs(body.velocity.x) > 4) this.sprite.setFlipX(body.velocity.x < 0);
  }

  /** 被鱼叉命中但未捕获：强制逃窜 */
  forceFlee(): void {
    if (this.state !== 'caught') this.state = 'flee';
  }

  private pickWanderDir(): void {
    // 水平为主的随机巡游方向
    const angle = Phaser.Math.FloatBetween(-0.4, 0.4) + (Math.random() < 0.5 ? 0 : Math.PI);
    this.wanderDir.set(Math.cos(angle), Math.sin(angle) * 0.5);
    this.wanderTimerMs = Phaser.Math.Between(2000, 4500);
  }

  /** 超出所属深度带边界时把巡游方向拉回带内 */
  private keepInDepthBand(): void {
    const [minM, maxM] = this.def.depthBand;
    const y = this.y / PX_PER_METER;
    if (y < minM + 2) this.wanderDir.y = Math.abs(this.wanderDir.y) || 0.3;
    else if (y > maxM - 2) this.wanderDir.y = -(Math.abs(this.wanderDir.y) || 0.3);
  }
}
