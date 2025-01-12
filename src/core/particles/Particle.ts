import * as THREE from "three";

export class Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  acceleration: THREE.Vector3;
  rotation: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  age: number;
  lifetime: number;
  active: boolean;
  scale: number;
  color: THREE.Color;
  opacity: number;
  mass: number;

  constructor() {
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.acceleration = new THREE.Vector3();
    this.rotation = new THREE.Vector3();
    this.angularVelocity = new THREE.Vector3();
    this.age = 0;
    this.lifetime = 0;
    this.active = false;
    this.scale = 1;
    this.color = new THREE.Color();
    this.opacity = 1;
    this.mass = 1;
  }

  reset(): void {
    this.position.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
    this.acceleration.set(0, 0, 0);
    this.rotation.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
    this.age = 0;
    this.lifetime = 0;
    this.active = false;
    this.scale = 1;
    this.color.setRGB(1, 1, 1);
    this.opacity = 1;
    this.mass = 1;
  }

  // Helper method to apply a force considering mass
  applyForce(force: THREE.Vector3): void {
    // F = ma -> a = F/m
    this.acceleration.add(force.clone().divideScalar(this.mass));
  }

  // Update particle physics
  integrate(deltaTime: number): void {
    if (!this.active) return;

    // Update velocity with acceleration
    this.velocity.addScaledVector(this.acceleration, deltaTime);
    // Update position with velocity
    this.position.addScaledVector(this.velocity, deltaTime);
    // Update rotation with angular velocity
    this.rotation.addScaledVector(this.angularVelocity, deltaTime);
    // Reset acceleration for next frame
    this.acceleration.set(0, 0, 0);
  }
}
