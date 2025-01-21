import RAPIER from "@dimforge/rapier3d";
import * as THREE from "three";
import { DragBehavior, PlanetaryGravityBehavior } from "../particles/Behaviors";
import { ConeEmitter } from "../particles/Emitters";
import { ParticleSystem } from "../particles/ParticleSystem";
import { vectorPool } from "../utils/VectorPool";
import { Bullet } from "../weapons/Bullet";
import { BulletGenerator } from "../weapons/BulletGenerator";
import { IEntity } from "./Entity";
import { HealthBar } from "./HealthBar";
import { RibbonTrail } from "./RibbonTrail";
const THRUST_FORCE = 10; // Increased for better control
const MAX_VELOCITY = 150;

const ROTATION_RATE = 0.05; // Slower rotation for better control
const MAX_PITCH = Math.PI * 0.95; // Maximum pitch angle (about 72 degrees)
const MAX_ROLL = Math.PI * 0.95; // Maximum roll angle (about 54 degrees)
const MOUSE_SENSITIVITY = 0.003;
export interface IFlyingEntity {
  applyDamage(amount: number): void;
  onHit(): void;
}

type MoveDirection = -1 | 0 | 1;
type RotationDirection = -1 | 0 | 1;

export class FlyingEntity implements IFlyingEntity, IEntity {
  protected object!: THREE.Object3D;
  protected body!: RAPIER.RigidBody;
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

  protected mouseX: number = 0;
  protected mouseY: number = 0;
  protected currentPitch: number = 0;
  protected currentRoll: number = 0;
  protected thrustActive: boolean = false;
  protected emitter!: ConeEmitter;
  protected particleSystem: ParticleSystem | null = null;

  private healthBar!: HealthBar;
  private tag: string;
  private health: number = 100;

  constructor(scene: THREE.Scene, position: THREE.Vector3, world: RAPIER.World, tag: string) {
    this.tag = tag;
    // this.object = new THREE.Object3D();
    this.world = world;
    this.scene = scene;
    this.ribbonTrail = new RibbonTrail(scene);

    this.particleSystem = this.createThrustEffect();
    this.scene.add(this.particleSystem);
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

  protected targetRotation = new THREE.Quaternion();
  protected currentRotation = new THREE.Quaternion();
  protected previousRight = new THREE.Vector3(1, 0, 0);

  protected updateRotation(): void {
    if (!this.body) return;

    // Get position for normal
    const pos = this.body.translation();
    const normal = new THREE.Vector3(pos.x, pos.y, pos.z).normalize();

    // Create rotation to align with normal
    const alignQuat = new THREE.Quaternion();
    const worldUp = new THREE.Vector3(0, 1, 0);

    if (normal.dot(worldUp) < -0.99999) {
      alignQuat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
    } else {
      const rotationAxis = new THREE.Vector3().crossVectors(worldUp, normal).normalize();
      const rotationAngle = Math.acos(normal.dot(worldUp));
      alignQuat.setFromAxisAngle(rotationAxis, rotationAngle);
    }

    // Calculate heading only from mouseX (-1 to 1) to avoid the 180° flip
    const heading = -this.mouseX * (Math.PI / 2); // Scale to ±90°
    const headingQuat = new THREE.Quaternion();
    headingQuat.setFromAxisAngle(normal, heading);

    // Pitch based on mouseY
    const pitchQuat = new THREE.Quaternion();
    const right = new THREE.Vector3(1, 0, 0);
    const pitchAngle = -this.mouseY * Math.PI;
    pitchQuat.setFromAxisAngle(right, pitchAngle);

    // Combine rotations
    this.targetRotation.copy(alignQuat).multiply(headingQuat).multiply(pitchQuat);

    // Smooth transition
    this.currentRotation.slerp(this.targetRotation, ROTATION_RATE);

    // Apply to physics body
    const rotation = new RAPIER.Quaternion(this.currentRotation.x, this.currentRotation.y, this.currentRotation.z, this.currentRotation.w);
    this.body.setRotation(rotation, true);

    // Update visual object
    this.object.quaternion.copy(this.currentRotation);
    this.updateForwardDirection();
  }
  protected updateRotationBROKNEPITCH(): void {
    if (!this.body) return;

    // Get position and create stable up vector
    const pos = this.body.translation();
    const up = new THREE.Vector3(pos.x, pos.y, pos.z).normalize();

    // Create stable world reference vector
    const worldReference = new THREE.Vector3(0, 1, 0);

    // Create right vector with corrected direction
    let right = new THREE.Vector3().crossVectors(worldReference, up);

    // If right vector is too small (near poles), use alternate reference
    if (right.lengthSq() < 0.1) {
      right = new THREE.Vector3().crossVectors(new THREE.Vector3(1, 0, 0), up);
    }
    right.normalize();

    // Create forward vector (same as original)
    const forward = new THREE.Vector3().crossVectors(right, up).normalize();

    // Create base orientation from orthogonal vectors
    const baseRotation = new THREE.Matrix4().makeBasis(right, up, forward);
    const baseQuaternion = new THREE.Quaternion().setFromRotationMatrix(baseRotation);

    // Apply roll first (around forward) - keeping original logic
    const rollQuat = new THREE.Quaternion().setFromAxisAngle(forward, THREE.MathUtils.clamp(this.mouseX * MAX_ROLL, -MAX_ROLL, MAX_ROLL));

    // Apply roll to right vector for pitch - keeping original logic
    const rolledRight = right.clone().applyQuaternion(rollQuat);

    // Then apply pitch (around rolled right) - keeping original logic
    const pitchQuat = new THREE.Quaternion().setFromAxisAngle(rolledRight, THREE.MathUtils.clamp(-this.mouseY * MAX_PITCH, -MAX_PITCH, MAX_PITCH));

    // Combine rotations - keeping original order
    this.targetRotation.copy(baseQuaternion).multiply(rollQuat).multiply(pitchQuat);

    // Smooth transition
    this.currentRotation.slerp(this.targetRotation, ROTATION_RATE);

    // Apply to physics body
    const rotation = new RAPIER.Quaternion(this.currentRotation.x, this.currentRotation.y, this.currentRotation.z, this.currentRotation.w);
    this.body.setRotation(rotation, true);

    // Update visual object
    this.object.quaternion.copy(this.currentRotation);

    // Store right vector for next frame
    this.previousRight.copy(right);

    // Update forward direction for movement
    this.updateForwardDirection();
  }
  protected updateRotationPITCHBAD(): void {
    if (!this.body) return;

    // Get position and create stable up vector
    const pos = this.body.translation();
    const up = new THREE.Vector3(pos.x, pos.y, pos.z).normalize();

    // Create stable world reference vector
    const worldReference = new THREE.Vector3(0, 1, 0);

    // Reverse the cross product order to flip the right vector direction
    let right = new THREE.Vector3().crossVectors(worldReference, up);

    // If right vector is too small (near poles), use alternate reference
    if (right.lengthSq() < 0.1) {
      right = new THREE.Vector3().crossVectors(new THREE.Vector3(1, 0, 0), up);
    }
    right.normalize();

    // Create forward vector
    const forward = new THREE.Vector3().crossVectors(right, up).normalize();
    right.crossVectors(up, forward).normalize(); // Re-orthogonalize right vector

    // Create base orientation from orthogonal vectors
    const baseRotation = new THREE.Matrix4().makeBasis(right, up, forward);
    const baseQuaternion = new THREE.Quaternion().setFromRotationMatrix(baseRotation);

    // Apply roll first (around forward)
    const rollQuat = new THREE.Quaternion().setFromAxisAngle(forward, THREE.MathUtils.clamp(this.mouseX * MAX_ROLL, -MAX_ROLL, MAX_ROLL));

    // Apply roll to right vector for pitch
    const rolledRight = right.clone().applyQuaternion(rollQuat);

    // Then apply pitch (around rolled right)
    const pitchQuat = new THREE.Quaternion().setFromAxisAngle(rolledRight, THREE.MathUtils.clamp(this.mouseY * MAX_PITCH, -MAX_PITCH, MAX_PITCH));

    // Combine rotations
    this.targetRotation.copy(baseQuaternion).multiply(rollQuat).multiply(pitchQuat);

    // Smooth transition
    this.currentRotation.slerp(this.targetRotation, ROTATION_RATE);

    // Apply to physics body
    const rotation = new RAPIER.Quaternion(this.currentRotation.x, this.currentRotation.y, this.currentRotation.z, this.currentRotation.w);
    this.body.setRotation(rotation, true);

    // Update visual object
    this.object.quaternion.copy(this.currentRotation);

    // Store right vector for next frame
    this.previousRight.copy(right);

    // Update forward direction for movement
    this.updateForwardDirection();
  }

  private updateForwardDirection(): void {
    if (!this.body) return;

    // Get current position and up vector
    const pos = this.body.translation();
    const up = new THREE.Vector3(pos.x, pos.y, pos.z).normalize();

    // Get forward direction from current rotation
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.currentRotation);

    // Project onto surface plane
    const projectedForward = forward
      .clone()
      .sub(up.clone().multiplyScalar(forward.dot(up)))
      .normalize();

    // Store for movement
    this.forwardDirection.copy(projectedForward);
  }

  private forwardDirection = new THREE.Vector3(0, 0, 1);

  public getForwardDirection(): THREE.Vector3 {
    return this.forwardDirection.clone();
  }
  createThrustEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    // Create emitter at position and point downward
    const emitterPos = position.clone();
    // Even narrower cone angle (5 degrees) and faster initial velocity
    this.emitter = new ConeEmitter(
      emitterPos,
      0.1, // Narrower spread
      3, // Smaller cone angle
      () => Math.random() * 3 + 5 // Faster initial velocity
    );
    const direction = new THREE.Vector3(0, -1, 0);
    this.emitter.setDirection(direction);

    return new ParticleSystem({
      count: 1000,
      emitter: this.emitter,
      behaviors: [
        new PlanetaryGravityBehavior({
          center: new THREE.Vector3(0, 0, 0),
          strength: 9.8, // Reduced gravity effect for better visibility
        }),
        new DragBehavior({ dragCoefficient: 0.1 }), // Less drag for longer trails
      ],
      appearance: {
        startColor: new THREE.Color(1, 0.8, 0.3),
        endColor: new THREE.Color(1, 0.2, 0),
        startSize: 0.5, // Increased initial size
        endSize: 0.1,
        startOpacity: 0.8, // Slightly reduced initial opacity
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });
  }
  private updateMovement(): void {
    if (!this.body) return;

    if (this.thrustActive) {
      const rotation = this.body.rotation();
      const quat = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
      // Thrust comes from bottom of ship (positive Y pushes away from bottom)
      const thrustDirection = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);

      this.body.applyImpulse(
        {
          x: thrustDirection.x * THRUST_FORCE,
          y: thrustDirection.y * THRUST_FORCE,
          z: thrustDirection.z * THRUST_FORCE,
        },
        true
      );

      // Apply velocity limits
      const vel = this.body.linvel();
      const velocity = new THREE.Vector3(vel.x, vel.y, vel.z);
      if (velocity.length() > MAX_VELOCITY) {
        velocity.normalize().multiplyScalar(MAX_VELOCITY);
        this.body.setLinvel({ x: velocity.x, y: velocity.y, z: velocity.z }, true);
      }
    }
  }

  public update(camera: THREE.Camera): void {
    if (!this.object || !this.body) return;

    this.updateRotation();
    this.updateMovement();

    // Update ship model position and rotation
    const translation = this.body.translation();
    const rotation = this.body.rotation();
    this.object.position.set(translation.x, translation.y, translation.z);
    this.object.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    if (this.object) {
      // Update particle system position and gravity center
      this.particleSystem?.position.copy(this.object.position);

      // Calculate emission direction based on ship's orientation
      const rotation = this.object.quaternion;
      const direction = new THREE.Vector3(0, -1, 0).applyQuaternion(rotation);
      this.emitter.setDirection(direction);

      // Emit particles when thrust is active
      if (this.thrustActive) {
        this.particleSystem?.emit(2); // Increased emission rate
      }
    }
    this.particleSystem?.update(1 / 60);
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
  // public getForwardDirection(): THREE.Vector3 {
  //   const position = vectorPool.getVector(this.body.translation().x, this.body.translation().y, this.body.translation().z);
  //   const up = position.clone().normalize();
  //   const orientation = this.object.quaternion;
  //   const forward = vectorPool.getVector(0, 0, 1).applyQuaternion(orientation);
  //   const projection = forward.clone().sub(up.clone().multiplyScalar(forward.dot(up)));
  //   return projection.normalize();
  // }

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
