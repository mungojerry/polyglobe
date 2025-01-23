import RAPIER from "@dimforge/rapier3d";
import * as THREE from "three";
import { DragBehavior, PlanetaryGravityBehavior } from "../particles/Behaviors";
import { ConeEmitter } from "../particles/Emitters";
import { ParticleSystem } from "../particles/ParticleSystem";
import { vectorPool } from "../utils/VectorPool";
import { Bullet } from "../weapons/Bullet";
import { IEntity } from "./Entity";
import { HealthBar } from "./HealthBar";
import { RibbonTrail } from "./RibbonTrail";
const THRUST_FORCE = 10; // Increased for better control
const MAX_VELOCITY = 150;

const SHOT_COOLDOWN = 120; // Slower rotation for better control
const MAX_PITCH = Math.PI; // Maximum pitch angle (about 72 degrees)
const MAX_ROLL = Math.PI; // Maximum roll angle (about 54 degrees)

export interface IFlyingEntity {
  applyDamage(amount: number): void;
  onHit(): void;
}

export class FlyingEntity implements IFlyingEntity, IEntity {
  protected object!: THREE.Object3D;
  protected body!: RAPIER.RigidBody;
  protected world: RAPIER.World;
  protected thrustForce: number = 0.3;
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

  protected bulletEmitter!: ConeEmitter;
  protected particleSystem: ParticleSystem | null = null;
  private bulletSystem: ParticleSystem | null = null;

  private healthBar!: HealthBar;
  private tag: string;
  private health: number = 100;
  private canShoot(): boolean {
    const now = performance.now();
    return now - this.lastShotTime >= SHOT_COOLDOWN;
  }

  constructor(scene: THREE.Scene, position: THREE.Vector3, world: RAPIER.World, tag: string) {
    this.tag = tag;
    // this.object = new THREE.Object3D();
    this.world = world;
    this.scene = scene;
    this.ribbonTrail = new RibbonTrail(scene);

    this.particleSystem = this.createThrustSystem();
    this.scene.add(this.particleSystem);

    this.bulletSystem = this.createBulletSystem();
    this.scene.add(this.bulletSystem);
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
  private updateRotation(): void {
    if (!this.body) return;

    // Get ship's position and surface normal
    const pos = this.body.translation();
    const planetUp = new THREE.Vector3(pos.x, pos.y, pos.z).normalize();

    // Create rotation matrix to align with surface
    const surfaceAlignmentMatrix = new THREE.Matrix4().makeRotationFromQuaternion(
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), planetUp)
    );

    // Create separate rotations for pitch and roll
    const pitchRotation = new THREE.Matrix4().makeRotationX(this.mouseY * MAX_PITCH);
    const rollRotation = new THREE.Matrix4().makeRotationZ(this.mouseX * MAX_ROLL);

    // Combine rotations
    const finalRotationMatrix = new THREE.Matrix4().multiply(surfaceAlignmentMatrix).multiply(pitchRotation).multiply(rollRotation);

    // Convert matrix back to quaternion
    const finalQuat = new THREE.Quaternion().setFromRotationMatrix(finalRotationMatrix);

    // Apply final rotation
    this.body.setRotation(finalQuat, true);
  }
  protected updateRotationOLD(): void {
    if (!this.body) return;

    // Get our current position and create our up vector
    const pos = this.body.translation();
    const up = new THREE.Vector3(pos.x, pos.y, pos.z).normalize();

    // Create world reference frame
    const worldUp = new THREE.Vector3(0, 1, 0);
    let right = new THREE.Vector3().crossVectors(up, worldUp);

    // Handle pole cases
    if (right.lengthSq() < 0.001) {
      right.set(1, 0, 0);
    }
    right.normalize();

    // Calculate mouse input
    const mouseAngle = Math.atan2(this.mouseY, this.mouseX);
    const mouseDistance = Math.min(Math.sqrt(this.mouseX * this.mouseX + this.mouseY * this.mouseY), 1.0);

    // Calculate rotation based on mouse input
    const MAX_TILT = Math.PI / 2;
    const tiltAmount = mouseDistance * MAX_TILT;
    const targetDir = up.clone();

    // Apply rotation
    const rotationAxis = right.clone().applyAxisAngle(up, mouseAngle).normalize();
    targetDir.applyAxisAngle(rotationAxis, tiltAmount);

    // Create target quaternion
    const targetQuaternion = new THREE.Quaternion();
    targetQuaternion.setFromUnitVectors(worldUp, targetDir);

    // Get current body rotation
    const currentRotation = this.body.rotation();
    const currentQuaternion = new THREE.Quaternion(currentRotation.x, currentRotation.y, currentRotation.z, currentRotation.w);

    // Smooth interpolation
    const ROTATION_SPEED = 0.1;
    currentQuaternion.slerp(targetQuaternion, ROTATION_SPEED);

    // Apply to physics body
    this.body.setRotation(
      {
        x: currentQuaternion.x,
        y: currentQuaternion.y,
        z: currentQuaternion.z,
        w: currentQuaternion.w,
      },
      true
    );
  }
  private forwardDirection = new THREE.Vector3(0, 0, 1);

  public getForwardDirection(): THREE.Vector3 {
    return this.forwardDirection.clone();
  }
  createThrustSystem(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
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

  createBulletSystem(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    // Create emitter at position and point downward
    const emitterPos = position.clone();
    // Even narrower cone angle (5 degrees) and faster initial velocity
    this.bulletEmitter = new ConeEmitter(
      emitterPos,
      0.1, // Narrower spread
      2, // Smaller cone angle
      () => Math.random() * 1 + 15 // Faster initial velocity
    );
    const direction = new THREE.Vector3(0, -1, 0);
    this.emitter.setDirection(direction);
    return new ParticleSystem({
      count: 1000,
      emitter: this.bulletEmitter,
      behaviors: [
        new PlanetaryGravityBehavior({
          center: new THREE.Vector3(0, 0, 0),
          strength: 2.8, // Reduced gravity effect for better visibility
        }),
        new DragBehavior({ dragCoefficient: 0.01 }), // Less drag for longer trails
      ],
      appearance: {
        startColor: new THREE.Color(1, 0.8, 0.3),
        endColor: new THREE.Color(1, 0.2, 0),
        startSize: 0.5, // Increased initial size
        endSize: 0.5,
        startOpacity: 1, // Slightly reduced initial opacity
        endOpacity: 1,
        blending: THREE.NormalBlending,
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
      this.bulletSystem?.position.copy(this.object.position);

      // Calculate emission direction based on ship's orientation
      const rotation = this.object.quaternion;
      const direction = new THREE.Vector3(0, -1, 0).applyQuaternion(rotation);
      this.emitter.setDirection(direction);
      this.bulletEmitter.setDirection(direction.negate());

      // Emit particles when thrust is active
      if (this.thrustActive) {
        this.particleSystem?.emit(3); // Increased emission rate
      }
    }
    this.particleSystem?.update(1 / 60);
    this.bulletSystem?.update(1 / 60);
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

  public onHit(): void {
    console.warn("Onerrdide GameObject::onHit");
  }

  protected shoot() {
    if (this.canShoot()) {
      console.log("shoot", this.bulletSystem);
      this.bulletSystem?.emit(1);
      this.lastShotTime = performance.now();
    }
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
