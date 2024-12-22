// TrailPool.ts
import * as THREE from "three";
import { Trail } from "./Trail";

export class TrailPool {
  private pool: Trail[] = [];
  private scene: THREE.Scene;
  private poolSize: number = 100; // Adjust based on needs

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.initializePool();
  }

  private initializePool() {
    for (let i = 0; i < this.poolSize; i++) {
      const trail = new Trail(this.scene, new THREE.Vector3(), 0.2, 0xffffff);
      trail.sprite.visible = false;
      this.pool.push(trail);
    }
  }

  acquire(position: THREE.Vector3, size: number, color: number): Trail {
    let trail: Trail;

    if (this.pool.length > 0) {
      trail = this.pool.pop()!;
      trail.recycle(position, size, color);
    } else {
      trail = new Trail(this.scene, position, size, color);
    }

    trail.sprite.visible = true;
    return trail;
  }

  release(trail: Trail) {
    trail.sprite.visible = false;
    this.pool.push(trail);
  }
}
