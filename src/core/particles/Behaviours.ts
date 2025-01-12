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

export class PlanetaryGravityBehavior implements ParticleBehavior {
  private center: THREE.Vector3;
  private gravitationalConstant: number;
  private force: THREE.Vector3;

  constructor(center: THREE.Vector3 = new THREE.Vector3(0, 0, 0), gravitationalConstant: number = 10) {
    this.center = center.clone();
    this.gravitationalConstant = gravitationalConstant;
    this.force = new THREE.Vector3();
  }

  update(particle: Particle, deltaTime: number): void {
    this.force.subVectors(this.center, particle.position);
    const distanceSq = this.force.lengthSq();
    if (distanceSq === 0) return;

    // Add minimum distance to prevent extreme forces
    const minDistance = 0.1;
    const clampedDistanceSq = Math.max(distanceSq, minDistance * minDistance);

    // F = GMm/r^2 with force clamping
    const maxForce = 100 * particle.mass;
    const forceMagnitude = Math.min((this.gravitationalConstant * particle.mass) / clampedDistanceSq, maxForce);

    this.force.normalize().multiplyScalar(forceMagnitude);
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
