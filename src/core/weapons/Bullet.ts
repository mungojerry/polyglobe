import RAPIER from "@dimforge/rapier3d";
import * as THREE from "three";
import { IGameObject } from "../objects/BaseGameObject";
import { colliderToGameObjectMap } from "../utils/colliderMap";

export class Bullet implements IGameObject {
  private object: THREE.Object3D;
  private mesh: THREE.Mesh;
  public body: RAPIER.RigidBody;
  public speed = 50;
  public lifetime = 3000; // milliseconds
  public spawnTime: number;
  public collider: RAPIER.Collider;
  public isDestroyed = false;
  private tag: string;

  constructor(world: RAPIER.World, scene: THREE.Scene, tag: string) {
    this.spawnTime = Date.now();
    this.tag = tag;
    this.object = new THREE.Object3D();
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffff00 }));
    this.object.add(this.mesh);
    scene.add(this.object);

    const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic().setLinearDamping(0).setGravityScale(0);
    this.body = world.createRigidBody(rigidBodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.ball(0.5).setCollisionGroups((0x0001 << 16) | (0x0002 | 0x0004)); // Bullet group, collides with Player and Enemy
    this.collider = world.createCollider(colliderDesc, this.body);

    // Register collider with the associated GameObject
    colliderToGameObjectMap.set(this.collider, this);
  }

  public getTag(): string {
    return this.tag;
  }

  public onHit() {}

  public getPosition() {
    return this.object.position;
  }

  public applyDamage() {}

  public getObject() {
    return this.object;
  }

  update() {
    const position = this.body.translation();
    this.object.position.set(position.x, position.y, position.z);
  }

  public destroy() {
    if (this.isDestroyed) return;

    // Remove physics
    if (this.collider && this.body) {
      colliderToGameObjectMap.delete(this.collider);
    }

    // Remove 3D objects
    this.mesh.geometry.dispose();
    this.object.parent?.remove(this.object);

    this.isDestroyed = true;
  }
}
