import * as THREE from "three";
import { Particle } from "./Particle";
export interface ParticleModifier {
  apply(particle: Particle): void;
}

export interface ParticleAppearance {
  startColor?: THREE.Color;
  endColor?: THREE.Color;
  startSize?: number;
  endSize?: number;
  startOpacity?: number;
  endOpacity?: number;
  blending?: THREE.Blending;
  texture?: THREE.Texture;
}

// Appearance modifier to handle particle appearance transitions
export class AppearanceModifier implements ParticleModifier {
  private startColor: THREE.Color;
  private endColor: THREE.Color;
  private startSize: number;
  private endSize: number;
  private startOpacity: number;
  private endOpacity: number;

  constructor(appearance: ParticleAppearance) {
    this.startColor = appearance.startColor || new THREE.Color(1, 1, 1);
    this.endColor = appearance.endColor || new THREE.Color(1, 1, 1);
    this.startSize = appearance.startSize || 1;
    this.endSize = appearance.endSize || 0.1;
    this.startOpacity = appearance.startOpacity || 1;
    this.endOpacity = appearance.endOpacity || 0;
  }

  apply(particle: Particle): void {
    // Set initial appearance values
    particle.color.copy(this.startColor);
    particle.scale = this.startSize;
    particle.opacity = this.startOpacity;
  }

  update(particle: Particle): void {
    if (!particle.active || particle.lifetime === 0) return;

    // Calculate life progress (0 to 1)
    const progress = particle.age / particle.lifetime;

    // Interpolate color
    particle.color.copy(this.startColor).lerp(this.endColor, progress);

    // Interpolate size
    particle.scale = this.startSize + (this.endSize - this.startSize) * progress;

    // Interpolate opacity
    particle.opacity = this.startOpacity + (this.endOpacity - this.startOpacity) * progress;
  }
}

// Makes particles oscillate in size
export class PulsateModifier implements ParticleModifier {
  private frequency: number;
  private amplitude: number;

  constructor(frequency = 2, amplitude = 0.5) {
    this.frequency = frequency;
    this.amplitude = amplitude;
  }

  apply(particle: Particle): void {
    const wave = Math.sin(particle.age * this.frequency) * this.amplitude;
    particle.scale *= 1 + wave;
  }
}

// Adds turbulent motion to particles
export class TurbulenceModifier implements ParticleModifier {
  private strength: number;
  private scale: number;
  private noiseOffset: THREE.Vector3;
  private force: THREE.Vector3;

  constructor(strength = 0.1, scale = 1.0) {
    this.strength = strength;
    this.scale = scale;
    this.noiseOffset = new THREE.Vector3(Math.random() * 1000, Math.random() * 1000, Math.random() * 1000);
    this.force = new THREE.Vector3();
  }

  update(particle: Particle, deltaTime: number): void {
    // Improved noise approximation for turbulence using multiple frequencies
    const time = particle.age * this.scale;

    // Primary frequency
    const px = Math.sin(time + this.noiseOffset.x) + Math.sin(time * 2.1 + this.noiseOffset.x * 1.7) * 0.5;
    const py = Math.cos(time + this.noiseOffset.y) + Math.cos(time * 1.7 + this.noiseOffset.y * 2.3) * 0.5;
    const pz = Math.sin(time + this.noiseOffset.z) + Math.sin(time * 1.9 + this.noiseOffset.z * 1.4) * 0.5;

    // Apply turbulent force
    this.force.set(px, py, pz).multiplyScalar(this.strength * deltaTime * particle.mass);
    particle.applyForce(this.force);
  }

  apply(particle: Particle): void {
    // Keep apply method for ParticleModifier interface compatibility
    // but delegate to update for actual behavior
    this.update(particle, 1 / 60); // Use default deltaTime if called through apply
  }
}

// Attracts or repels particles from a point
export class AttractorModifier implements ParticleModifier {
  private position: THREE.Vector3;
  private strength: number;
  private radius: number;

  constructor(position = new THREE.Vector3(), strength = 1.0, radius = 10.0) {
    this.position = position;
    this.strength = strength; // Positive for attraction, negative for repulsion
    this.radius = radius;
  }

  apply(particle: Particle): void {
    const direction = new THREE.Vector3().subVectors(this.position, particle.position);
    const distance = direction.length();

    if (distance < this.radius) {
      direction.normalize();
      const force = (1 - distance / this.radius) * this.strength;
      particle.velocity.add(direction.multiplyScalar(force));
    }
  }
}

// Modifies particle color based on velocity
export class VelocityColorModifier implements ParticleModifier {
  private minSpeed: number;
  private maxSpeed: number;
  private coldColor: THREE.Color;
  private hotColor: THREE.Color;

  constructor(minSpeed = 0, maxSpeed = 5, coldColor = new THREE.Color(0x3498db), hotColor = new THREE.Color(0xe74c3c)) {
    this.minSpeed = minSpeed;
    this.maxSpeed = maxSpeed;
    this.coldColor = coldColor;
    this.hotColor = hotColor;
  }

  apply(particle: Particle): void {
    const speed = particle.velocity.length();
    const t = THREE.MathUtils.clamp((speed - this.minSpeed) / (this.maxSpeed - this.minSpeed), 0, 1);
    particle.color.copy(this.coldColor).lerp(this.hotColor, t);
  }
}

// Configuration for sub-emitter behavior
export interface SubEmitterConfig {
  onCollision?: boolean;
  onDeath?: boolean;
  periodic?: boolean;
  interval?: number;
  count?: number;
  velocityFactor?: number;
  inheritColor?: boolean;
  lifetime?: number;
  scale?: number;
}

// Handles spawning of child particles
export class SubEmitterModifier implements ParticleModifier {
  private config: Required<SubEmitterConfig>;
  private particleSystem: any; // Will be set by ParticleSystem
  private currentTime: number;

  constructor(config: SubEmitterConfig = {}) {
    this.config = {
      onCollision: config.onCollision ?? false,
      onDeath: config.onDeath ?? false,
      periodic: config.periodic ?? false,
      interval: config.interval ?? 0.1,
      count: config.count ?? 5,
      velocityFactor: config.velocityFactor ?? 0.5,
      inheritColor: config.inheritColor ?? true,
      lifetime: config.lifetime ?? 1.0,
      scale: config.scale ?? 0.5,
    };
    this.currentTime = 0;
  }

  setParticleSystem(system: any): void {
    this.particleSystem = system;
  }

  apply(particle: Particle): void {
    // Configure particle for sub-emission
    particle.subEmitOnCollision = this.config.onCollision;
    particle.subEmitOnDeath = this.config.onDeath;
    particle.subEmitPeriodically = this.config.periodic;
    particle.subEmitInterval = this.config.interval;
    particle.subEmitCount = this.config.count;
    particle.subEmitVelocityFactor = this.config.velocityFactor;
    particle.subEmitInheritColor = this.config.inheritColor;
  }

  update(particle: Particle, deltaTime: number): void {
    if (!this.particleSystem) return;

    this.currentTime += deltaTime;

    // Check for periodic emission
    if (particle.shouldEmit(this.currentTime)) {
      this.emitParticles(particle);
    }
  }

  // Called by ParticleSystem when a particle collides
  onCollision(particle: Particle): void {
    if (particle.subEmitOnCollision) {
      this.emitParticles(particle);
    }
  }

  // Called by ParticleSystem when a particle dies
  onDeath(particle: Particle): void {
    if (particle.subEmitOnDeath) {
      this.emitParticles(particle);
    }
  }

  private emitParticles(parent: Particle): void {
    if (!this.particleSystem) return;

    for (let i = 0; i < parent.subEmitCount; i++) {
      const { position, velocity, color } = parent.getSubParticleProperties();

      // Create sub-particle through the particle system
      const subParticle = this.particleSystem.createParticle({
        position,
        velocity,
        color,
        lifetime: this.config.lifetime,
        scale: this.config.scale,
        parentParticle: parent,
      });

      if (subParticle) {
        // Additional customization for sub-particle
        subParticle.mass = parent.mass * 0.5;
        subParticle.radius = parent.radius * 0.5;
      }
    }
  }
}
