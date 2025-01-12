import * as THREE from "three";
import { GravityBehavior, ParticleBehavior } from "./Behaviours";
import { ParticleEmitterShape, PointEmitter } from "./Emitters";
import { AppearanceModifier, ParticleAppearance, ParticleModifier } from "./Modifiers";
import { Particle } from "./Particle";

interface ParticleSystemOptions {
  count?: number;
  emitter?: ParticleEmitterShape;
  behaviors?: ParticleBehavior[];
  modifiers?: ParticleModifier[];
  appearance?: ParticleAppearance;
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
