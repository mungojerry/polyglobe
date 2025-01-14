import * as THREE from "three";
import { Particle } from "./Particle";

export interface ParticleBehavior {
  update(particle: Particle, deltaTime: number, worldPostion?: THREE.Vector3): void;
}

export interface GravityOptions {
  strength?: number;
}
// Particle behaviors
export class GravityBehavior implements ParticleBehavior {
  private gravity: number;
  private gravityVector: THREE.Vector3;
  private force: THREE.Vector3;

  constructor(options: GravityOptions = {}) {
    this.gravity = options.strength ?? 9.81;
    this.gravityVector = new THREE.Vector3(0, -this.gravity, 0);
    this.force = new THREE.Vector3();
  }

  update(particle: Particle, deltaTime: number): void {
    // F = mg
    this.force.copy(this.gravityVector).multiplyScalar(particle.mass);
    particle.applyForce(this.force);
  }
}

export interface VortexOptions {
  strength?: number;
  axis?: THREE.Vector3;
}
export class VortexBehavior implements ParticleBehavior {
  private strength: number;
  private axis: THREE.Vector3;
  private temp: THREE.Vector3;
  private force: THREE.Vector3;
  private rotationQuaternion: THREE.Quaternion;

  constructor(options: VortexOptions = {}) {
    this.strength = options.strength ?? 1;
    this.axis = options.axis ? options.axis.clone().normalize() : new THREE.Vector3(0, 0, 1).normalize();
    this.temp = new THREE.Vector3();
    this.force = new THREE.Vector3();
    this.rotationQuaternion = new THREE.Quaternion();
  }

  update(particle: Particle, deltaTime: number): void {
    // Project particle position onto plane perpendicular to rotation axis
    this.temp.copy(particle.position);
    const dot = this.temp.dot(this.axis);
    this.temp.copy(this.axis).multiplyScalar(dot);
    const projectedPos = particle.position.clone().sub(this.temp);

    const radius = projectedPos.length();
    if (radius < 0.001) return; // Avoid division by zero and unstable behavior near axis

    // Calculate desired tangential velocity (perpendicular to radius)
    this.force.copy(projectedPos).normalize();
    const desiredDir = new THREE.Vector3().crossVectors(this.axis, this.force);

    // Calculate current tangential velocity
    const currentVel = particle.velocity.clone();
    const radialVel = projectedPos.clone().multiplyScalar(currentVel.dot(projectedPos.clone().normalize()) / radius);
    const tangentialVel = currentVel.sub(radialVel);

    // Apply force to achieve target tangential velocity
    const targetSpeed = this.strength * Math.sqrt(radius);
    const currentTangentialSpeed = tangentialVel.length();
    const speedDiff = targetSpeed - currentTangentialSpeed;

    // Apply dampened force
    const dampening = 0.95;
    this.force.copy(desiredDir).multiplyScalar(speedDiff * particle.mass * dampening);
    particle.applyForce(this.force);

    // Update rotation based on actual angular velocity
    if (currentTangentialSpeed > 0) {
      const angularSpeed = currentTangentialSpeed / radius;
      this.rotationQuaternion.setFromAxisAngle(this.axis, angularSpeed * deltaTime);
      particle.rotation.applyQuaternion(this.rotationQuaternion);
    }
  }
}
export interface DragOptions {
  dragCoefficient?: number;
}
// Additional Behaviors
export class DragBehavior implements ParticleBehavior {
  private dragCoefficient: number;
  private force: THREE.Vector3;

  constructor(options: DragOptions = {}) {
    this.dragCoefficient = options.dragCoefficient ?? 0.1;
    this.force = new THREE.Vector3();
  }

  update(particle: Particle, deltaTime: number): void {
    // Drag force = -kv^2
    const speed = particle.velocity.length();
    if (speed > 0) {
      this.force.copy(particle.velocity).normalize();
      this.force.multiplyScalar(-this.dragCoefficient * speed * speed);
      particle.applyForce(this.force);
    }
  }
}

export class BounceBehavior implements ParticleBehavior {
  private groundLevel: number;
  private restitution: number;
  private force: THREE.Vector3;
  private normal: THREE.Vector3;

  constructor(groundLevel: number = 0, restitution: number = 0.8) {
    this.groundLevel = groundLevel;
    this.restitution = restitution;
    this.force = new THREE.Vector3();
    this.normal = new THREE.Vector3(0, 1, 0);
  }

  update(particle: Particle, deltaTime: number): void {
    if (particle.position.y < this.groundLevel) {
      // Apply normal force to prevent penetration with deltaTime scaling
      const penetrationDepth = this.groundLevel - particle.position.y;
      const springConstant = 1000 / deltaTime; // Scale with deltaTime for consistent behavior
      this.force.copy(this.normal).multiplyScalar(penetrationDepth * springConstant);
      particle.applyForce(this.force);

      // Apply impulse for bounce with friction
      if (particle.velocity.y < 0) {
        // Vertical bounce
        particle.velocity.y = -particle.velocity.y * this.restitution;

        // Horizontal friction
        const friction = 0.98;
        particle.velocity.x *= friction;
        particle.velocity.z *= friction;
      }

      // Ensure minimum ground level
      particle.position.y = Math.max(particle.position.y, this.groundLevel);
    }
  }
}
export interface OscillationOptions {
  amplitude?: number;
  frequency?: number;
  axis?: THREE.Vector3;
}
export class OscillationBehavior implements ParticleBehavior {
  private amplitude: number;
  private frequency: number;
  private axis: THREE.Vector3;
  private force: THREE.Vector3;

  constructor(options: OscillationOptions) {
    this.amplitude = options.amplitude ?? 1;
    this.frequency = options.frequency ?? 1;
    this.axis = options.axis ? options.axis.normalize() : new THREE.Vector3(0, 1, 0).normalize();
    this.force = new THREE.Vector3();
  }

  update(particle: Particle, deltaTime: number): void {
    // Use particle age instead of global time for consistent oscillation
    const particleTime = particle.age;
    const frequency = Math.max(this.frequency, 0.0001); // Prevent division by zero

    // Calculate current displacement from rest position
    const currentDisplacement = this.axis.dot(particle.position);
    const targetDisplacement = Math.sin(particleTime * frequency) * this.amplitude;

    // Spring force with damping
    const springConstant = Math.pow(frequency, 2);
    const dampingFactor = 0.5;

    const springForce = (targetDisplacement - currentDisplacement) * springConstant;
    const dampingForce = -particle.velocity.dot(this.axis) * dampingFactor;

    this.force.copy(this.axis).multiplyScalar((springForce + dampingForce) * particle.mass);
    particle.applyForce(this.force);
  }
}

export interface PlanetaryGravityOptions {
  center?: THREE.Vector3;
  strength?: number;
}
export class PlanetaryGravityBehavior implements ParticleBehavior {
  private center: THREE.Vector3;
  private strength: number;
  private minDistance: number;

  constructor(options: PlanetaryGravityOptions = {}) {
    this.center = options.center ? options.center.clone() : new THREE.Vector3();
    this.strength = options.strength ?? 5;
    this.minDistance = 0.1; // Minimum distance to prevent extreme forces
  }

  update(particle: Particle, deltaTime: number, worldPosition: THREE.Vector3): void {
    const particleWorldPos = particle.position.clone().add(worldPosition);
    const direction = particleWorldPos.sub(this.center);
    const distanceSquared = direction.lengthSq();
    if (distanceSquared === 0) return;

    const forceMagnitude = this.strength * particle.mass; // / clampedDistanceSquared;
    const force = direction.normalize().multiplyScalar(-forceMagnitude);
    particle.applyForce(force);
  }
}

// Spatial grid for efficient collision detection
class SpatialGrid {
  private cellSize: number;
  private cells: Map<string, Set<Particle>>;

  constructor(cellSize: number) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  private getCellKey(position: THREE.Vector3): string {
    const x = Math.floor(position.x / this.cellSize);
    const y = Math.floor(position.y / this.cellSize);
    const z = Math.floor(position.z / this.cellSize);
    return `${x},${y},${z}`;
  }

  clear(): void {
    this.cells.clear();
  }

  insertParticle(particle: Particle): void {
    const key = this.getCellKey(particle.position);
    if (!this.cells.has(key)) {
      this.cells.set(key, new Set());
    }
    this.cells.get(key)!.add(particle);
  }

  getNearbyParticles(position: THREE.Vector3, radius: number): Set<Particle> {
    const result = new Set<Particle>();
    const cellRadius = Math.ceil(radius / this.cellSize);

    const baseX = Math.floor(position.x / this.cellSize);
    const baseY = Math.floor(position.y / this.cellSize);
    const baseZ = Math.floor(position.z / this.cellSize);

    for (let x = -cellRadius; x <= cellRadius; x++) {
      for (let y = -cellRadius; y <= cellRadius; y++) {
        for (let z = -cellRadius; z <= cellRadius; z++) {
          const key = `${baseX + x},${baseY + y},${baseZ + z}`;
          const cell = this.cells.get(key);
          if (cell) {
            cell.forEach((particle) => result.add(particle));
          }
        }
      }
    }

    return result;
  }
}
export interface CollisionOptions {
  cellSize?: number;
  maxCollisionRange?: number;
}
export class CollisionBehavior implements ParticleBehavior {
  private spatialGrid: SpatialGrid;
  private maxCollisionRange: number;

  constructor(options: CollisionOptions = {}) {
    this.spatialGrid = new SpatialGrid(options.cellSize ?? 5);
    this.maxCollisionRange = options.maxCollisionRange ?? 10;
  }

  update(particle: Particle, deltaTime: number): void {
    // First pass: Build spatial grid
    this.spatialGrid.clear();
    this.spatialGrid.insertParticle(particle);

    // Second pass: Check collisions with nearby particles
    const nearbyParticles = this.spatialGrid.getNearbyParticles(particle.position, this.maxCollisionRange);

    nearbyParticles.forEach((other) => {
      if (other !== particle && particle.checkCollision(other)) {
        particle.resolveCollision(other);
      }
    });
  }
}

export interface TrailOptions {
  length?: number;
  fade?: number;
  speedInfluence?: boolean;
  minLength?: number;
  maxLength?: number;
}

export class TrailBehavior implements ParticleBehavior {
  private length: number;
  private fade: number;
  private speedInfluence: boolean;
  private minLength: number;
  public maxLength: number;

  constructor(options: TrailOptions = {}) {
    this.length = options.length ?? 20;
    this.fade = options.fade ?? 0.95;
    this.speedInfluence = options.speedInfluence ?? true;
    this.minLength = options.minLength ?? 5;
    this.maxLength = options.maxLength ?? 30;
  }

  update(particle: Particle, deltaTime: number): void {
    // Initialize trail properties if needed
    if (!particle.positionHistory) {
      particle.positionHistory = [];
      particle.maxTrailLength = this.length;
      particle.trailFade = this.fade;
    }

    const currentPos = particle.position.clone();
    const speed = particle.velocity.length();

    // Always add current position first
    particle.positionHistory.unshift(currentPos);

    // Add intermediate positions for smoother trails
    if (this.speedInfluence && speed > 0.5) {
      // Lower speed threshold
      // Calculate number of intermediate positions based on speed
      const steps = Math.min(5, Math.ceil(speed / 2)); // More steps, lower division factor
      const stepDelta = 1.0 / (steps + 1);

      // Add interpolated positions with slight offset for thickness
      for (let i = steps; i > 0; i--) {
        const t = i * stepDelta;
        const basePos = currentPos.clone().sub(particle.velocity.clone().multiplyScalar(deltaTime * t));

        // Add slight perpendicular offset for visual thickness
        const perpendicular = new THREE.Vector3(-particle.velocity.y, particle.velocity.x, 0).normalize().multiplyScalar(0.05);
        const intermediatePos = basePos.clone().add(perpendicular);
        particle.positionHistory.unshift(intermediatePos);

        // Add opposite offset for thickness
        const oppositePos = basePos.clone().sub(perpendicular);
        particle.positionHistory.unshift(oppositePos);
      }
    }

    // Smoothly adjust trail length based on speed with more gradual scaling
    let targetLength = this.length;
    if (this.speedInfluence) {
      // Use smooth interpolation with slower falloff
      const speedFactor = Math.min(1.0, Math.pow(speed / 4.0, 0.7));
      targetLength = this.minLength + (this.maxLength - this.minLength) * speedFactor;
    }

    // Gradually adjust trail length
    while (particle.positionHistory.length > Math.ceil(targetLength)) {
      particle.positionHistory.pop();
    }
  }
}
