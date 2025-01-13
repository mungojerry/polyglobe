import * as THREE from "three";
import { Particle } from "./Particle";

export interface ParticleBehavior {
  update(particle: Particle, deltaTime: number): void;
}

// Particle behaviors
export class GravityBehavior implements ParticleBehavior {
  private gravity: number;
  private gravityVector: THREE.Vector3;
  private force: THREE.Vector3;

  constructor(gravity: number = 9.81) {
    this.gravity = gravity;
    this.gravityVector = new THREE.Vector3(0, -gravity, 0);
    this.force = new THREE.Vector3();
  }

  update(particle: Particle, deltaTime: number): void {
    // F = mg
    this.force.copy(this.gravityVector).multiplyScalar(particle.mass);
    particle.applyForce(this.force);
  }
}

export class VortexBehavior implements ParticleBehavior {
  private strength: number;
  private axis: THREE.Vector3;
  private temp: THREE.Vector3;
  private force: THREE.Vector3;
  private rotationQuaternion: THREE.Quaternion;

  constructor(strength: number = 1, axis: THREE.Vector3 = new THREE.Vector3(0, 0, 1)) {
    this.strength = strength;
    this.axis = axis.clone().normalize();
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

// Additional Behaviors
export class DragBehavior implements ParticleBehavior {
  private dragCoefficient: number;
  private force: THREE.Vector3;

  constructor(dragCoefficient: number = 0.1) {
    this.dragCoefficient = dragCoefficient;
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

export class OscillationBehavior implements ParticleBehavior {
  private amplitude: number;
  private frequency: number;
  private axis: THREE.Vector3;
  private force: THREE.Vector3;
  private startTime: number;

  constructor(amplitude: number = 1, frequency: number = 1, axis: THREE.Vector3 = new THREE.Vector3(0, 1, 0)) {
    this.amplitude = amplitude;
    this.frequency = frequency;
    this.axis = axis.normalize();
    this.force = new THREE.Vector3();
    this.startTime = performance.now() * 0.001;
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

export class PlanetaryGravityBehavior implements ParticleBehavior {
  private center: THREE.Vector3;
  private strength: number;
  private force: THREE.Vector3;
  private direction: THREE.Vector3;
  private minDistance: number;
  private maxForce: number;

  constructor(center: THREE.Vector3, strength: number = 5) {
    this.center = center.clone();
    this.strength = strength;
    this.force = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.minDistance = 0.1; // Minimum distance to prevent extreme forces
    this.maxForce = 100; // Maximum force cap to prevent instability
  }

  update(particle: Particle, deltaTime: number): void {
    // Calculate direction to center
    this.direction.subVectors(this.center, particle.position);
    const distanceSquared = this.direction.lengthSq();

    if (distanceSquared === 0) return;

    // Use clamped distance to prevent extreme forces near center
    const clampedDistanceSquared = Math.max(distanceSquared, this.minDistance * this.minDistance);

    // Calculate force magnitude using inverse square law (like real gravity)
    const forceMagnitude = Math.min((this.strength * particle.mass) / clampedDistanceSquared, this.maxForce * particle.mass);

    // Apply force towards center
    this.force.copy(this.direction).normalize().multiplyScalar(forceMagnitude);
    particle.applyForce(this.force);
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

export class CollisionBehavior implements ParticleBehavior {
  private spatialGrid: SpatialGrid;
  private maxCollisionRange: number;

  constructor(cellSize: number = 5, maxCollisionRange: number = 10) {
    this.spatialGrid = new SpatialGrid(cellSize);
    this.maxCollisionRange = maxCollisionRange;
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
  private maxLength: number;

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

    // Store current position
    const currentPos = particle.position.clone();

    // Add intermediate position for fast-moving particles
    if (this.speedInfluence && particle.velocity.lengthSq() > 0.001) {
      const intermediatePos = currentPos.clone().sub(particle.velocity.clone().multiplyScalar(deltaTime * 0.5));
      particle.positionHistory.unshift(intermediatePos);
    }

    particle.positionHistory.unshift(currentPos);

    // Calculate dynamic trail length based on speed
    let targetLength = this.length;
    if (this.speedInfluence) {
      const speed = particle.velocity.length();
      targetLength = Math.min(this.maxLength, Math.max(this.minLength, Math.floor(this.minLength + speed * 2)));
    }

    // Trim history to target length
    while (particle.positionHistory.length > targetLength) {
      particle.positionHistory.pop();
    }
  }
}
