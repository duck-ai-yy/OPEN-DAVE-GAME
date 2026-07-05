import Phaser from 'phaser';
import { PX_PER_METER } from '../core/types';
import type { RegionDef } from '../core/types';
import { DataRegistry } from '../data/DataRegistry';
import { Fish } from './Fish';

/**
 * 按 region 深度带 + spawnWeight 在相机外滚动生成/回收鱼。
 * 生成区：相机外 0.5~1.5 屏环带；回收区：距相机 2.5 屏以外。全场上限 40。
 */
export class FishSpawner {
  private static readonly MAX_ACTIVE = 40;
  private static readonly CHECK_INTERVAL_MS = 500;

  readonly fishes: Fish[] = [];
  private scene: Phaser.Scene;
  private region: RegionDef;
  private checkTimerMs = 0;

  constructor(scene: Phaser.Scene, region: RegionDef) {
    this.scene = scene;
    this.region = region;
  }

  update(
    dtMs: number,
    camera: Phaser.Cameras.Scene2D.Camera,
    players: readonly { x: number; y: number }[],
    timeMs: number,
  ): void {
    // 每条鱼以最近的玩家为行为目标（逃跑/追击），支持双人
    for (const f of this.fishes) {
      let nx = players[0].x;
      let ny = players[0].y;
      let best = Number.MAX_VALUE;
      for (const p of players) {
        const d = (f.x - p.x) ** 2 + (f.y - p.y) ** 2;
        if (d < best) {
          best = d;
          nx = p.x;
          ny = p.y;
        }
      }
      f.update(dtMs, nx, ny, timeMs);
    }

    this.checkTimerMs -= dtMs;
    if (this.checkTimerMs > 0) return;
    this.checkTimerMs = FishSpawner.CHECK_INTERVAL_MS;

    this.despawnFar(camera);
    if (this.fishes.length < FishSpawner.MAX_ACTIVE) {
      this.trySpawn(camera);
    }
  }

  remove(fish: Fish): void {
    const i = this.fishes.indexOf(fish);
    if (i >= 0) this.fishes.splice(i, 1);
  }

  private despawnFar(camera: Phaser.Cameras.Scene2D.Camera): void {
    const cx = camera.midPoint.x;
    const cy = camera.midPoint.y;
    const limX = camera.width * 2.5;
    const limY = camera.height * 2.5;
    for (let i = this.fishes.length - 1; i >= 0; i--) {
      const f = this.fishes[i];
      if (!f.alive || Math.abs(f.x - cx) > limX || Math.abs(f.y - cy) > limY) {
        f.sprite.destroy();
        this.fishes.splice(i, 1);
      }
    }
  }

  private trySpawn(camera: Phaser.Cameras.Scene2D.Camera): void {
    // 相机外环带随机取点（0.6~1.4 屏偏移，避开可视区）
    const cx = camera.midPoint.x;
    const cy = camera.midPoint.y;
    const w = camera.width;
    const h = camera.height;
    for (let attempt = 0; attempt < 6; attempt++) {
      const side = Math.random();
      let x: number;
      let y: number;
      if (side < 0.5) {
        x = cx + (Math.random() < 0.5 ? -1 : 1) * Phaser.Math.FloatBetween(0.6, 1.4) * w;
        y = cy + Phaser.Math.FloatBetween(-1, 1) * h;
      } else {
        x = cx + Phaser.Math.FloatBetween(-1, 1) * w;
        y = cy + (Math.random() < 0.5 ? -1 : 1) * Phaser.Math.FloatBetween(0.6, 1.4) * h;
      }
      const bounds = this.scene.physics.world.bounds;
      if (x < 90 || x > bounds.width - 90 || y < 30 || y > bounds.height - 80) continue;

      const band = this.bandAt(y / PX_PER_METER);
      if (!band) continue;
      const fishId = this.pickWeighted(band.spawns);
      if (!fishId) continue;
      this.fishes.push(new Fish(this.scene, DataRegistry.getFish(fishId), x, y));
      return;
    }
  }

  private bandAt(depthM: number) {
    return this.region.depthBands.find((b) => depthM >= b.range[0] && depthM < b.range[1]);
  }

  private pickWeighted(spawns: { fishId: string; weight: number }[]): string | null {
    const total = spawns.reduce((s, e) => s + e.weight, 0);
    if (total <= 0) return null;
    let r = Math.random() * total;
    for (const e of spawns) {
      r -= e.weight;
      if (r <= 0) return e.fishId;
    }
    return spawns[spawns.length - 1].fishId;
  }
}
