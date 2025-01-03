import RAPIER from "@dimforge/rapier3d";
import * as THREE from "three";
import { vectorPool } from "../utils/vectorPool";
import { Bullet } from "../weapons/Bullet";
import { BulletGenerator } from "../weapons/BulletGenerator";
import { HealthBar } from "./HealthBar";
import { RibbonTrail } from "./RibbonTrail";

export interface IGameObject {
  update(camera: THREE.Camera): void;
  onHit(): void;
  getObject(): THREE.Object3D;
  getPosition(): THREE.Vector3;
  getTag(): string;
  applyDamage(amount: number): void;
  destroy(): void;
}

type MoveDirection = -1 | 0 | 1;
type RotationDirection = -1 | 0 | 1;

export class BaseGameObject implements IGameObject {
  protected object: THREE.Object3D;
  protected objectMesh!: THREE.Object3D;
  protected body: RAPIER.RigidBody;
  protected world: RAPIER.World;
  protected rotationSpeed: number = 0.1;
  protected thrustForce: number = 0.3;
  protected movementForce: number = 0.1;
  protected move: MoveDirection = 0;
  protected rotationDirection: RotationDirection = 0;
  protected thrusting: boolean = false;
  private ribbonTrail: RibbonTrail;
  protected scene: THREE.Scene;
  protected bullets: Bullet[] = [];
  protected lastShotTime = 0;
  protected shootCooldown = 150;
  protected tilt: boolean = true;
  private healthBar: HealthBar;
  private tag: string;
  private health: number = 100;

  constructor(scene: THREE.Scene, position: THREE.Vector3, world: RAPIER.World, tag: string) {
    this.tag = tag;
    this.object = new THREE.Object3D();
    this.objectMesh = new THREE.Object3D();
    this.world = world;
    this.scene = scene;
    this.ribbonTrail = new RibbonTrail(scene);
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(position.x, position.y, position.z);
    this.body = world.createRigidBody(bodyDesc);
    this.healthBar = new HealthBar(this.object, this.health);
  }

  private updateHealthBar(camera: THREE.Camera): void {
    this.healthBar.setHealth(this.health);
    this.healthBar["healthBar"].lookAt(camera.position);
  }

  private updateTrail() {
    const position = new THREE.Vector3(this.body.translation().x, this.body.translation().y, this.body.translation().z);

    const direction = new THREE.Vector3();
    this.object.getWorldDirection(direction);

    this.ribbonTrail.update(position, direction);
  }

  private tiltMesh() {
    const targetRotationX = this.move * 0.4;
    const targetRotationZ = -this.rotationDirection * 0.4;
    const lerpFactor = 0.03;
    this.objectMesh.rotation.x = THREE.MathUtils.lerp(this.objectMesh.rotation.x, targetRotationX, lerpFactor);
    this.objectMesh.rotation.z = THREE.MathUtils.lerp(this.objectMesh.rotation.z, targetRotationZ, lerpFactor);
  }

  update(camera: THREE.Camera) {
    const position = this.body.translation();

    if (this.tilt) this.tiltMesh();

    this.object.position.set(position.x, position.y, position.z);

    // Get current position and orientation
    const up = vectorPool.getVector(position.x, position.y, position.z).normalize();
    const currentForward = vectorPool.getVector(0, 0, 1).applyQuaternion(this.object.quaternion);
    const right = vectorPool.getVector().crossVectors(up, currentForward).normalize();
    const alignedForward = vectorPool.getVector().crossVectors(right, up).normalize();

    // Create and apply rotation
    const rotationMatrix = new THREE.Matrix4();
    rotationMatrix.makeBasis(right, up, alignedForward);
    const alignedQuaternion = new THREE.Quaternion().setFromRotationMatrix(rotationMatrix);

    const worldForward = up.clone().applyQuaternion(new THREE.Quaternion().setFromUnitVectors(vectorPool.getVector(), up));

    // Handle rotation
    if (this.rotationDirection !== 0) {
      const rotationDelta = new THREE.Quaternion().setFromAxisAngle(worldForward, this.rotationDirection * this.rotationSpeed * 0.1);
      alignedQuaternion.premultiply(rotationDelta);
    }

    // Apply rotation to both visual object and physics body
    this.object.quaternion.copy(alignedQuaternion);
    this.body.setRotation(
      {
        x: alignedQuaternion.x,
        y: alignedQuaternion.y,
        z: alignedQuaternion.z,
        w: alignedQuaternion.w,
      },
      true
    );

    // Handle movement
    if (this.move !== 0) {
      const moveDir = vectorPool.getVector();
      moveDir.add(currentForward.clone().multiplyScalar(this.move));
      const force = moveDir.normalize().multiplyScalar(this.movementForce);
      this.body.applyImpulse(
        {
          x: force.x,
          y: force.y,
          z: force.z,
        },
        true
      );
    }

    this.thrust();
    this.updateTrail();
    this.updateHealthBar(camera);
  }

  public getBody() {
    return this.body;
  }

  public getObject() {
    return this.object;
  }
  public getUp(): THREE.Vector3 {
    const position = this.getPosition();
    return vectorPool.getVector(position.x, position.y, position.z).normalize();
  }
  public getForwardDirection(): THREE.Vector3 {
    const position = vectorPool.getVector(this.body.translation().x, this.body.translation().y, this.body.translation().z);
    const up = position.clone().normalize();
    const orientation = this.object.quaternion;
    const forward = vectorPool.getVector(0, 0, 1).applyQuaternion(orientation);
    const projection = forward.clone().sub(up.clone().multiplyScalar(forward.dot(up)));
    return projection.normalize();
  }

  protected thrust() {
    if (this.thrusting) {
      const upDirection = this.object.position.clone().normalize();
      const impulse = new RAPIER.Vector3(upDirection.x * this.thrustForce, upDirection.y * this.thrustForce, upDirection.z * this.thrustForce);
      this.body.applyImpulse(impulse, true);
    }
  }

  public setThrusting(thrusting: boolean) {
    this.thrusting = thrusting;
  }

  public setMove(move: MoveDirection) {
    this.move = move;
  }

  public setRotationDirection(rotationDirection: RotationDirection) {
    this.rotationDirection = rotationDirection;
  }

  public onHit(): void {
    console.warn("Onerrdide GameObject::onHit");
  }

  protected shoot() {
    const now = Date.now();
    if (now - this.lastShotTime < this.shootCooldown) return;

    const bodyPos = this.body.translation();
    const position = new THREE.Vector3(bodyPos.x, bodyPos.y, bodyPos.z);
    const forward = this.getForwardDirection();

    const bulletGenerator = BulletGenerator.getInstance(this.world);
    bulletGenerator.createBullet(this.scene, this, position, forward, this.tag);

    this.lastShotTime = now;
  }

  public getPosition() {
    return this.object.position;
  }

  public getTag(): string {
    return this.tag;
  }

  public applyDamage(amount: number): void {
    this.health -= amount;
    if (this.health < 0) this.health = 0;
    this.healthBar.setHealth(this.health);

    if (this.health <= 0) {
      this.destroy();
    }
  }

  public destroy() {
    this.healthBar.dispose();
    this.ribbonTrail.dispose();
    this.object.parent?.remove(this.object);
    this.world.removeRigidBody(this.body);
  }
}
