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

  // Trail properties
  positionHistory: THREE.Vector3[];
  maxTrailLength: number;
  trailFade: number;

  // Collision properties
  radius: number;
  elasticity: number;
  friction: number;
  collisionGroup: number;
  collisionMask: number;
  onCollision?: (other: Particle) => void;

  // Sub-emitter properties
  subEmitOnCollision: boolean;
  subEmitOnDeath: boolean;
  subEmitPeriodically: boolean;
  subEmitInterval: number;
  subEmitCount: number;
  subEmitVelocityFactor: number;
  subEmitInheritColor: boolean;
  lastSubEmitTime: number;
  parentParticle?: Particle;

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

    // Enhanced trail properties
    this.positionHistory = [];
    this.maxTrailLength = 20; // Increased for smoother trails
    this.trailFade = 0.95; // Adjusted for better visibility

    // Initialize collision properties
    this.radius = 0.5;
    this.elasticity = 0.8;
    this.friction = 0.3;
    this.collisionGroup = 1;
    this.collisionMask = 1;

    // Initialize sub-emitter properties
    this.subEmitOnCollision = false;
    this.subEmitOnDeath = false;
    this.subEmitPeriodically = false;
    this.subEmitInterval = 0.1;
    this.subEmitCount = 5;
    this.subEmitVelocityFactor = 0.5;
    this.subEmitInheritColor = true;
    this.lastSubEmitTime = 0;
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
    this.positionHistory = [];

    // Reset collision callback
    this.onCollision = undefined;

    // Reset sub-emitter properties
    this.lastSubEmitTime = 0;
    this.parentParticle = undefined;
  }

  // Helper method to apply a force considering mass
  applyForce(force: THREE.Vector3): void {
    // F = ma -> a = F/m
    this.acceleration.add(force.clone().divideScalar(this.mass));
  }

  // Helper method to check if particle should emit based on time
  shouldEmit(currentTime: number): boolean {
    if (!this.subEmitPeriodically || !this.active) return false;
    if (currentTime - this.lastSubEmitTime >= this.subEmitInterval) {
      this.lastSubEmitTime = currentTime;
      return true;
    }
    return false;
  }

  // Helper method to get sub-particle initial properties
  getSubParticleProperties(): { position: THREE.Vector3; velocity: THREE.Vector3; color: THREE.Color } {
    const position = this.position.clone();
    const velocity = this.velocity.clone().multiplyScalar(this.subEmitVelocityFactor);

    // Add some randomization to the velocity
    velocity.add(
      new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2).multiplyScalar(this.velocity.length() * 0.2)
    );

    const color = this.subEmitInheritColor ? this.color.clone() : new THREE.Color();

    return { position, velocity, color };
  }

  // Helper method to check collision with another particle
  checkCollision(other: Particle): boolean {
    if (!this.active || !other.active) return false;
    if ((this.collisionGroup & other.collisionMask) === 0) return false;

    const combinedRadius = this.radius + other.radius;
    const distanceSquared = this.position.distanceToSquared(other.position);
    return distanceSquared <= combinedRadius * combinedRadius;
  }

  // Helper method to resolve collision with another particle
  resolveCollision(other: Particle): void {
    // Calculate collision normal
    const normal = this.position.clone().sub(other.position).normalize();

    // Calculate relative velocity
    const relativeVelocity = this.velocity.clone().sub(other.velocity);

    // Calculate impulse scalar
    const velocityAlongNormal = relativeVelocity.dot(normal);
    if (velocityAlongNormal > 0) return; // Objects are moving apart

    const combinedElasticity = Math.min(this.elasticity, other.elasticity);
    const j = -(1 + combinedElasticity) * velocityAlongNormal;
    const totalMass = this.mass + other.mass;
    const impulse = j / totalMass;

    // Apply impulse
    const impulseVector = normal.multiplyScalar(impulse);
    this.velocity.add(impulseVector.clone().multiplyScalar(other.mass));
    other.velocity.sub(impulseVector.clone().multiplyScalar(this.mass));

    // Apply friction
    const tangent = relativeVelocity
      .clone()
      .sub(normal.multiplyScalar(relativeVelocity.dot(normal)))
      .normalize();
    const combinedFriction = (this.friction + other.friction) * 0.5;
    const frictionImpulse = -combinedFriction * j;

    const frictionVector = tangent.multiplyScalar(frictionImpulse);
    this.velocity.add(frictionVector.clone().multiplyScalar(other.mass / totalMass));
    other.velocity.sub(frictionVector.clone().multiplyScalar(this.mass / totalMass));

    // Trigger collision callbacks
    if (this.onCollision) this.onCollision(other);
    if (other.onCollision) other.onCollision(this);
  }

  // Enhanced update method with improved trail handling
  integrate(deltaTime: number): void {
    if (!this.active) return;

    // Always store position history for active particles
    const currentPos = this.position.clone();

    // Calculate interpolated position for smoother trails
    if (this.velocity.lengthSq() > 0.001) {
      // Add intermediate position for fast-moving particles
      const intermediatePos = currentPos.clone().sub(this.velocity.clone().multiplyScalar(deltaTime * 0.5));
      this.positionHistory.unshift(intermediatePos);
    }

    this.positionHistory.unshift(currentPos);

    // Adjust trail length based on velocity
    const speed = this.velocity.length();
    const dynamicLength = Math.min(
      this.maxTrailLength,
      Math.floor(5 + speed * 2) // Dynamic trail length based on speed
    );

    // Trim history to dynamic length
    while (this.positionHistory.length > dynamicLength) {
      this.positionHistory.pop();
    }

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
