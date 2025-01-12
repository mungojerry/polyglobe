import * as THREE from "three";

// Core interfaces
// Core interfaces

// Add these interfaces at the top of the file
interface ParticleAppearance {
  startColor?: THREE.Color;
  endColor?: THREE.Color;
  startSize?: number;
  endSize?: number;
  startOpacity?: number;
  endOpacity?: number;
  blending?: THREE.Blending;
  texture?: THREE.Texture; // Optional particle texture
}

interface ParticleSystemOptions {
  count?: number;
  emitter?: ParticleEmitterShape;
  behaviors?: ParticleBehavior[];
  modifiers?: ParticleModifier[];
  appearance?: ParticleAppearance;
}

interface ParticleEmitterShape {
  getEmissionPoint(): THREE.Vector3;
  getEmissionDirection(): THREE.Vector3;
}

interface ParticleBehavior {
  update(particle: Particle, deltaTime: number): void;
}

interface ParticleModifier {
  apply(particle: Particle): void;
}

// Particle class to store individual particle data
export class Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  age: number;
  lifetime: number;
  active: boolean;
  scale: number;
  color: THREE.Color;
  opacity: number;

  constructor() {
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.age = 0;
    this.lifetime = 0;
    this.active = false;
    this.scale = 1;
    this.color = new THREE.Color();
    this.opacity = 1;
  }

  reset(): void {
    this.position.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
    this.age = 0;
    this.active = false;
    this.scale = 1;
    this.opacity = 1;
  }
}

// Emitter shapes
export class PointEmitter implements ParticleEmitterShape {
  private position: THREE.Vector3;

  constructor(position: THREE.Vector3 = new THREE.Vector3()) {
    this.position = position.clone();
  }

  getEmissionPoint(): THREE.Vector3 {
    return this.position.clone();
  }

  getEmissionDirection(): THREE.Vector3 {
    return new THREE.Vector3((Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2).normalize();
  }
}

export class SphereEmitter implements ParticleEmitterShape {
  private position: THREE.Vector3;
  private radius: number;
  private tempVector: THREE.Vector3;

  constructor(position: THREE.Vector3 = new THREE.Vector3(), radius: number = 1) {
    this.position = position.clone();
    this.radius = radius;
    this.tempVector = new THREE.Vector3();
  }

  getEmissionPoint(): THREE.Vector3 {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = this.radius * Math.cbrt(Math.random());

    return this.tempVector.set(r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi)).add(this.position);
  }

  getEmissionDirection(): THREE.Vector3 {
    // Get direction from center to emission point
    return this.tempVector.clone().sub(this.position).normalize();
  }
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

    // Rotate position around axis
    this.temp.copy(particle.position);
    particle.position.applyQuaternion(rotationQuaternion);

    // Rotate velocity to maintain tangential motion
    particle.velocity.applyQuaternion(rotationQuaternion);
  }
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

// Enhanced ParticleSystem class
export class ParticleSystem extends THREE.Object3D {
  private particles: Particle[];
  private geometry!: THREE.BufferGeometry<THREE.NormalBufferAttributes>;
  private material!: THREE.ShaderMaterial;
  private points!: THREE.Points<THREE.BufferGeometry<THREE.NormalBufferAttributes>, THREE.ShaderMaterial>;
  private appearanceModifier: AppearanceModifier;

  private emitter: ParticleEmitterShape;
  private behaviors: ParticleBehavior[];
  private modifiers: ParticleModifier[];

  private positions!: Float32Array;
  private colors!: Float32Array;
  private scales!: Float32Array;
  private opacities!: Float32Array;

  constructor(options: ParticleSystemOptions = {}) {
    super();

    const {
      count = 10000,
      emitter = new PointEmitter(),
      behaviors = [new GravityBehavior()],
      modifiers = [],
      appearance = {
        startColor: new THREE.Color(1, 1, 1),
        endColor: new THREE.Color(1, 1, 1),
        startSize: 1,
        endSize: 0.1,
        startOpacity: 1,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    } = options;

    this.particles = Array(count)
      .fill(null)
      .map(() => new Particle());
    this.emitter = emitter;
    this.behaviors = behaviors;

    // Create and add the appearance modifier
    this.appearanceModifier = new AppearanceModifier(appearance);
    this.modifiers = [...modifiers, this.appearanceModifier];

    this.initializeBuffers(count);
    this.initializeMaterial(appearance);
    this.initializeGeometry();
  }

  private initializeBuffers(count: number): void {
    this.positions = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);
    this.scales = new Float32Array(count);
    this.opacities = new Float32Array(count);
  }

  private initializeMaterial(appearance: ParticleAppearance): void {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        particleTexture: { value: appearance.texture || null },
      },
      vertexShader: `
        attribute float scale;
        attribute float opacity;
        attribute vec3 color;

        varying float vOpacity;
        varying vec3 vColor;
        varying vec2 vUv;

        void main() {
          vColor = color;
          vOpacity = opacity;
          vUv = position.xy * 0.5 + 0.5;
          
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = scale * (300.0 / -mvPosition.z);
        }
      `,
      fragmentShader: `
        uniform sampler2D particleTexture;
        
        varying float vOpacity;
        varying vec3 vColor;
        varying vec2 vUv;

        void main() {
          vec2 coord = gl_PointCoord;
          vec4 texColor = texture2D(particleTexture, coord);
          
          float a = vOpacity;
          if(texColor.a > 0.0) {
            a *= texColor.a;
          } else {
            vec2 circCoord = 2.0 * gl_PointCoord - 1.0;
            float dist = length(circCoord);
            a *= 1.0 - smoothstep(0.8, 1.0, dist);
          }
          
          gl_FragColor = vec4(vColor, a);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: appearance.blending || THREE.AdditiveBlending,
    });
  }

  private initializeGeometry(): void {
    this.geometry = new THREE.BufferGeometry();

    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute("scale", new THREE.BufferAttribute(this.scales, 1));
    this.geometry.setAttribute("opacity", new THREE.BufferAttribute(this.opacities, 1));

    this.points = new THREE.Points(this.geometry, this.material);
    this.add(this.points);
  }

  emit(count: number): void {
    let emitted = 0;
    for (let i = 0; i < this.particles.length && emitted < count; i++) {
      const particle = this.particles[i];
      if (!particle.active) {
        const emissionPoint = this.emitter.getEmissionPoint();
        const direction = this.emitter.getEmissionDirection();

        particle.position.copy(emissionPoint);
        particle.velocity.copy(direction).multiplyScalar(2);
        particle.lifetime = 2 + Math.random();
        particle.age = 0;
        particle.active = true;

        this.modifiers.forEach((modifier) => modifier.apply(particle));
        emitted++;
      }
    }
  }

  update(deltaTime: number): void {
    // Update particle states
    this.particles.forEach((particle, i) => {
      if (particle.active) {
        particle.age += deltaTime;

        if (particle.age >= particle.lifetime) {
          particle.reset();
        } else {
          // Apply behaviors
          this.behaviors.forEach((behavior) => behavior.update(particle, deltaTime));

          // Apply appearance modifier update
          this.appearanceModifier.update(particle);

          // Apply other modifiers
          this.modifiers.forEach((modifier) => {
            if (modifier !== this.appearanceModifier) {
              modifier.apply(particle);
            }
          });

          // Update buffers
          const idx = i * 3;
          particle.position.toArray(this.positions, idx);
          particle.color.toArray(this.colors, idx);

          this.scales[i] = particle.scale;
          this.opacities[i] = particle.opacity;
        }
      }
    });

    // Update geometry attributes
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.scale.needsUpdate = true;
    this.geometry.attributes.opacity.needsUpdate = true;
  }

  addBehavior(behavior: ParticleBehavior): void {
    this.behaviors.push(behavior);
  }

  addModifier(modifier: ParticleModifier): void {
    this.modifiers.push(modifier);
  }

  setEmitter(emitter: ParticleEmitterShape): void {
    this.emitter = emitter;
  }

  getActiveParticleCount(): number {
    return this.particles.filter((p) => p.active).length;
  }

  // Add method to update appearance at runtime
  setAppearance(appearance: ParticleAppearance): void {
    this.appearanceModifier = new AppearanceModifier(appearance);
    // Update material properties if needed
    if (appearance.blending !== undefined) {
      this.material.blending = appearance.blending;
    }
    if (appearance.texture !== undefined) {
      this.material.uniforms.particleTexture.value = appearance.texture;
    }
  }
}
