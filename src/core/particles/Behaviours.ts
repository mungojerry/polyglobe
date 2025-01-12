import * as THREE from "three";
import { Particle } from "./Particle";

export interface ParticleBehavior {
  update(particle: Particle, deltaTime: number): void;
}

// Particle behaviors
export class GravityBehavior implements ParticleBehavior {
  private gravity: number;
  private gravityVector: THREE.Vector3;

  constructor(gravity: number = 9.81) {
    this.gravity = gravity;
    this.gravityVector = new THREE.Vector3(0, -gravity, 0);
  }

  update(particle: Particle, deltaTime: number): void {
    // v = v + at
    particle.velocity.addScaledVector(this.gravityVector, deltaTime);
    // p = p + vt
    particle.position.addScaledVector(particle.velocity, deltaTime);
  }
}

export class PlanetaryGravityBehavior implements ParticleBehavior {
  private center: THREE.Vector3;
  private gravitationalConstant: number;

  constructor(center: THREE.Vector3 = new THREE.Vector3(0, 0, 0), gravitationalConstant: number = 10) {
    this.center = center.clone();
    this.gravitationalConstant = gravitationalConstant;
  }

  update(particle: Particle, deltaTime: number): void {
    const directionToCenter = new THREE.Vector3().subVectors(this.center, particle.position);
    const distanceSq = directionToCenter.lengthSq();
    if (distanceSq === 0) return;

    // Inverse-square law for gravity
    const forceMagnitude = this.gravitationalConstant / distanceSq;
    const acceleration = directionToCenter.normalize().multiplyScalar(forceMagnitude);

    particle.velocity.addScaledVector(acceleration, deltaTime);
    particle.position.addScaledVector(particle.velocity, deltaTime);
  }
}

export class VortexBehavior implements ParticleBehavior {
  private strength: number;
  private axis: THREE.Vector3;
  private temp: THREE.Vector3;

  constructor(strength: number = 1, axis: THREE.Vector3 = new THREE.Vector3(0, 1, 0)) {
    this.strength = strength;
    this.axis = axis.normalize();
    this.temp = new THREE.Vector3();
  }

  update(particle: Particle, deltaTime: number): void {
    // Create rotation quaternion
    const angle = this.strength * deltaTime;
    const rotationQuaternion = new THREE.Quaternion();
    rotationQuaternion.setFromAxisAngle(this.axis, angle);

    this.temp.copy(particle.position);
    particle.position.applyQuaternion(rotationQuaternion);
    particle.velocity.applyQuaternion(rotationQuaternion);
  }
}

// Additional Behaviors
export class DragBehavior implements ParticleBehavior {
  private dragCoefficient: number;

  constructor(dragCoefficient: number = 0.1) {
    this.dragCoefficient = dragCoefficient;
  }

  update(particle: Particle, deltaTime: number): void {
    // Simple drag: v *= (1 - k * dt)
    const dragFactor = 1 - this.dragCoefficient * deltaTime;
    particle.velocity.multiplyScalar(Math.max(dragFactor, 0));
  }
}

export class BounceBehavior implements ParticleBehavior {
  private groundLevel: number;
  private restitution: number;

  constructor(groundLevel: number = 0, restitution: number = 0.8) {
    this.groundLevel = groundLevel;
    this.restitution = restitution;
  }

  update(particle: Particle, deltaTime: number): void {
    // Integrate velocity
    particle.position.addScaledVector(particle.velocity, deltaTime);
    // Check collision with ground
    if (particle.position.y < this.groundLevel) {
      particle.position.y = this.groundLevel;
      particle.velocity.y *= -this.restitution;
    }
  }
}

export class OscillationBehavior implements ParticleBehavior {
  private amplitude: number;
  private frequency: number;
  private axis: THREE.Vector3;

  constructor(amplitude: number = 1, frequency: number = 1, axis: THREE.Vector3 = new THREE.Vector3(0, 1, 0)) {
    this.amplitude = amplitude;
    this.frequency = frequency;
    this.axis = axis.normalize();
  }

  update(particle: Particle, deltaTime: number): void {
    // Oscillate position along a given axis
    const offset = Math.sin(performance.now() * 0.001 * this.frequency) * this.amplitude * deltaTime;
    particle.position.addScaledVector(this.axis, offset);
  }
}
