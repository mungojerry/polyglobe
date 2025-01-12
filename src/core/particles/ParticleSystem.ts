import * as THREE from "three";
import { ObjectPool } from "../utils/ObjectPool";
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
  private particlePool: ObjectPool<Particle>;
  private geometry!: THREE.BufferGeometry<THREE.NormalBufferAttributes>;
  private material!: THREE.ShaderMaterial;
  private points!: THREE.Points<THREE.BufferGeometry<THREE.NormalBufferAttributes>, THREE.ShaderMaterial>;
  private appearanceModifier: AppearanceModifier;

  private emitter: ParticleEmitterShape;
  private behaviors: ParticleBehavior[];
  private modifiers: ParticleModifier[];

  private positions!: Float32Array;
  private colors!: Float32Array;
  private rotations!: Float32Array;
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

    this.particlePool = new ObjectPool<Particle>(
      count,
      () => new Particle(),
      Math.floor(count * 0.2) // Expand by 20% when needed
    );
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
    this.rotations = new Float32Array(count * 3);
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
        attribute vec3 rotation;

        varying float vOpacity;
        varying vec3 vColor;
        varying vec2 vUv;

        mat3 rotationMatrix(vec3 rotation) {
          float cx = cos(rotation.x);
          float sx = sin(rotation.x);
          float cy = cos(rotation.y);
          float sy = sin(rotation.y);
          float cz = cos(rotation.z);
          float sz = sin(rotation.z);

          return mat3(
            cy * cz, -cy * sz, sy,
            cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy,
            sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy
          );
        }

        void main() {
          vColor = color;
          vOpacity = opacity;
          vUv = position.xy * 0.5 + 0.5;
          
          // Apply rotation to position
          vec3 rotatedPosition = rotationMatrix(rotation) * position;
          vec4 mvPosition = modelViewMatrix * vec4(rotatedPosition, 1.0);
          
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
    this.geometry.setAttribute("rotation", new THREE.BufferAttribute(this.rotations, 3));
    this.geometry.setAttribute("scale", new THREE.BufferAttribute(this.scales, 1));
    this.geometry.setAttribute("opacity", new THREE.BufferAttribute(this.opacities, 1));

    this.points = new THREE.Points(this.geometry, this.material);
    this.add(this.points);
  }

  emit(count: number): void {
    for (let i = 0; i < count; i++) {
      const particle = this.particlePool.acquire();
      const emissionPoint = this.emitter.getEmissionPoint();
      const direction = this.emitter.getEmissionDirection();

      particle.position.copy(emissionPoint);
      particle.velocity.copy(direction).multiplyScalar(2);
      particle.lifetime = 2 + Math.random();
      particle.age = 0;

      this.modifiers.forEach((modifier) => modifier.apply(particle));
    }
  }

  update(deltaTime: number): void {
    let activeIndex = 0;
    const particles = this.particlePool["objects"]; // Access internal array for performance

    // Update particle states
    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      if (particle.active) {
        particle.age += deltaTime;

        if (particle.age >= particle.lifetime) {
          this.particlePool.release(particle);
        } else {
          // Apply behaviors first to accumulate forces
          this.behaviors.forEach((behavior) => behavior.update(particle, deltaTime));

          // Integrate physics
          particle.integrate(deltaTime);

          // Apply appearance modifier update
          this.appearanceModifier.update(particle);

          // Apply other modifiers
          this.modifiers.forEach((modifier) => {
            if (modifier !== this.appearanceModifier) {
              modifier.apply(particle);
            }
          });

          // Update buffers (only for active particles)
          const idx = activeIndex * 3;
          particle.position.toArray(this.positions, idx);
          particle.color.toArray(this.colors, idx);
          particle.rotation.toArray(this.rotations, idx);

          this.scales[activeIndex] = particle.scale;
          this.opacities[activeIndex] = particle.opacity;

          activeIndex++;
        }
      }
    }

    // Update geometry draw range
    this.geometry.setDrawRange(0, activeIndex);

    // Update geometry attributes
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.rotation.needsUpdate = true;
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
    return this.particlePool.getActiveCount();
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.particlePool.clear();
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
