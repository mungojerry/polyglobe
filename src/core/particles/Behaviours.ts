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
    const directionToCenter = new THREE.Vector3().subVectors(this.center, particle.position);
    const distanceSq = directionToCenter.lengthSq();
    if (distanceSq === 0) return;

    // F = GMm/r^2
    const forceMagnitude = (this.gravitationalConstant * particle.mass) / distanceSq;
    this.force.copy(directionToCenter.normalize()).multiplyScalar(forceMagnitude);
    particle.applyForce(this.force);
  }
}

export class VortexBehavior implements ParticleBehavior {
  private strength: number;
  private axis: THREE.Vector3;
  private temp: THREE.Vector3;
  private force: THREE.Vector3;
  private rotationQuaternion: THREE.Quaternion;

  constructor(strength: number = 1, axis: THREE.Vector3 = new THREE.Vector3(0, 1, 0)) {
    this.strength = strength;
    this.axis = axis.normalize();
    this.temp = new THREE.Vector3();
    this.force = new THREE.Vector3();
    this.rotationQuaternion = new THREE.Quaternion();
  }

  update(particle: Particle, deltaTime: number): void {
    // Calculate tangential force for vortex effect
    this.temp.copy(particle.position);
    const radius = this.temp.length();
    if (radius === 0) return;

    // Create perpendicular force vector for circular motion
    this.force.crossVectors(this.axis, particle.position);
    this.force.normalize().multiplyScalar(this.strength * radius * particle.mass);
    particle.applyForce(this.force);

    // Update angular velocity for rotation
    const angle = this.strength * deltaTime;
    this.rotationQuaternion.setFromAxisAngle(this.axis, angle);
    particle.rotation.applyQuaternion(this.rotationQuaternion);
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
      // Apply normal force to prevent penetration
      const penetrationDepth = this.groundLevel - particle.position.y;
      this.force.copy(this.normal).multiplyScalar(penetrationDepth * 1000); // Spring force
      particle.applyForce(this.force);

      // Apply impulse for bounce
      if (particle.velocity.y < 0) {
        particle.velocity.y = -particle.velocity.y * this.restitution;
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
    const time = performance.now() * 0.001 - this.startTime;
    // Simple harmonic motion: F = -kx
    // Where k is spring constant (frequency squared) and x is displacement
    const displacement = Math.sin(time * this.frequency) * this.amplitude;
    const springForce = -Math.pow(this.frequency, 2) * displacement;

    this.force.copy(this.axis).multiplyScalar(springForce * particle.mass);
    particle.applyForce(this.force);
  }
}
