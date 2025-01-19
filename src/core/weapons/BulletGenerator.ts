import RAPIER from "@dimforge/rapier3d";
import * as THREE from "three";
import { IGameObject } from "../entities/FlyingEntity";
import { debugManager } from "../managers/DebugManager";
import { colliderToGameObjectMap } from "../utils/ColliderMap";
import { Bullet } from "./Bullet";

interface BulletData {
  bullet: Bullet;
  owner: IGameObject;
  createdAt: number;
  tag: string;
}

export class BulletGenerator {
  private static instance: BulletGenerator;
  private activeBullets: Map<number, BulletData>;
  private bulletLifetime: number = 5000; // 5 seconds
  private world: RAPIER.World;

  private constructor(world: RAPIER.World) {
    this.activeBullets = new Map();
    this.world = world;
  }

  static getInstance(world: RAPIER.World): BulletGenerator {
    if (!BulletGenerator.instance) {
      BulletGenerator.instance = new BulletGenerator(world);
    }
    return BulletGenerator.instance;
  }

  createBullet(scene: THREE.Scene, owner: IGameObject, position: THREE.Vector3, direction: THREE.Vector3, tag: string): Bullet {
    const bullet = new Bullet(this.world, scene, tag);

    bullet.body.setTranslation({ x: position.x, y: position.y, z: position.z }, true);

    bullet.body.setLinvel({ x: direction.x * bullet.speed, y: direction.y * bullet.speed, z: direction.z * bullet.speed }, true);

    this.activeBullets.set(bullet.body.handle, {
      bullet,
      owner,
      createdAt: Date.now(),
      tag,
    });

    return bullet;
  }

  update(deltaTime: number) {
    const now = Date.now();

    // Process collisions using contactPair
    this.processCollisions();

    // Update active bullets and remove expired ones
    this.activeBullets.forEach((data, handle) => {
      data.bullet.update();
      if (now - data.createdAt > this.bulletLifetime) {
        this.destroyBullet(handle);
      }
    });
  }

  private processCollisions() {
    debugManager.set("bullets", "bullets: " + this.activeBullets.size);
    // Iterate over each active bullet
    this.activeBullets.forEach((data, handle) => {
      const bulletCollider = data.bullet.collider;

      // Iterate over all colliders in the world
      this.world.forEachCollider((otherCollider) => {
        // Skip if it's the same collider
        if (otherCollider === bulletCollider) return;

        // Use contactPair to check for contact between bulletCollider and otherCollider
        this.world.contactPair(bulletCollider, otherCollider, (manifold, flipped) => {
          // If there's a contact manifold, handle the collision
          if (manifold.numContacts() > 0) {
            console.log("collision");
            const otherObject = colliderToGameObjectMap.get(otherCollider);

            if (otherObject && otherObject !== data.owner) {
              // Check if the collision should be processed based on tags/masks
              if (this.shouldProcessCollision(data.tag, otherObject)) {
                // Handle collision: destroy bullet and apply damage
                this.destroyBullet(handle);
                otherObject.applyDamage(10); // Example damage value
              }
            }
          }
        });
      });
    });
  }

  private shouldProcessCollision(bulletTag: string, target: IGameObject): boolean {
    // Define logic to determine if collision should be processed based on tags/masks
    // Example: Prevent friendly fire
    return bulletTag !== target.getTag();
  }

  private destroyBullet(handle: number) {
    console.log("destroyBullet");
    const bulletData = this.activeBullets.get(handle);
    if (bulletData) {
      bulletData.bullet.destroy();
      this.activeBullets.delete(handle);
    }
  }
}
