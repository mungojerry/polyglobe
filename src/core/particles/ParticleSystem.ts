import * as THREE from "three";
import { ObjectPool } from "../utils/ObjectPool";
import { GravityBehavior, ParticleBehavior, TrailBehavior } from "./Behaviors";
import { ParticleEmitterShape, PointEmitter } from "./Emitters";
import { AppearanceModifier, ParticleAppearance, ParticleModifier, SubEmitterModifier } from "./Modifiers";
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
  public particlePool: ObjectPool<Particle>;
  private geometry!: THREE.BufferGeometry<THREE.NormalBufferAttributes>;
  private material!: THREE.ShaderMaterial;
  private points!: THREE.Points<THREE.BufferGeometry<THREE.NormalBufferAttributes>, THREE.ShaderMaterial>;
  private appearanceModifier: AppearanceModifier;

  // Trail rendering properties - initialized only when needed
  private trailGeometry?: THREE.BufferGeometry;
  private trailMaterial?: THREE.LineBasicMaterial;
  private trails?: THREE.LineSegments;
  private trailPositions?: Float32Array;
  private trailColors?: Float32Array;
  private hasTrailBehavior: boolean = false;

  private emitter: ParticleEmitterShape;
  private behaviors: ParticleBehavior[];
  private modifiers: ParticleModifier[];

  private childen: ParticleSystem[] = [];

  private positions!: Float32Array;
  private colors!: Float32Array;
  private rotations!: Float32Array;
  private scales!: Float32Array;
  private opacities!: Float32Array;

  private getTrailBehavior(): TrailBehavior | undefined {
    return this.behaviors.find((b): b is TrailBehavior => b instanceof TrailBehavior);
  }

  public setChildren(child: ParticleSystem | ParticleSystem[]) {
    if (Array.isArray(child)) {
      this.childen.push(...child);
      this.add(...child);
    } else {
      this.childen.push(child);
      this.add(child);
    }
  }

  public hasChildren() {
    return this.childen.length > 0;
  }

  public getChildren() {
    return this.childen;
  }

  private initializeTrailRendering(count: number) {
    const trailBehavior = this.getTrailBehavior();
    if (!trailBehavior) return;

    const maxTrailLength = trailBehavior.maxLength ?? 40;
    // Double the buffer size to ensure smooth connections between segments
    this.trailPositions = new Float32Array(count * maxTrailLength * 6); // *6 for doubled vertices
    this.trailColors = new Float32Array(count * maxTrailLength * 6);

    this.trailGeometry = new THREE.BufferGeometry();
    this.trailGeometry.setAttribute("position", new THREE.BufferAttribute(this.trailPositions, 3));
    this.trailGeometry.setAttribute("color", new THREE.BufferAttribute(this.trailColors, 3));

    this.trailMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      opacity: 1.0, // Full opacity, we'll control fade in colors
      depthWrite: false,
      depthTest: true,
      linewidth: 3, // Thicker lines for better visibility
    });

    this.trails = new THREE.LineSegments(this.trailGeometry, this.trailMaterial);
    this.add(this.trails);
  }

  constructor(options: ParticleSystemOptions = {}) {
    super();
    this.hasTrailBehavior = options.behaviors?.some((b) => b instanceof TrailBehavior) ?? false;

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

    // Initialize sub-emitter support
    this.modifiers.forEach((modifier) => {
      if (modifier instanceof SubEmitterModifier) {
        modifier.setParticleSystem(this);
      }
    });

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

    if (this.hasTrailBehavior) {
      this.initializeTrailRendering(count);
    }
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
    // Initialize particle geometry
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute("rotation", new THREE.BufferAttribute(this.rotations, 3));
    this.geometry.setAttribute("scale", new THREE.BufferAttribute(this.scales, 1));
    this.geometry.setAttribute("opacity", new THREE.BufferAttribute(this.opacities, 1));
    this.points = new THREE.Points(this.geometry, this.material);

    // Add points to the scene
    this.add(this.points);
  }

  // Helper method to create a particle with specific properties
  createParticle(props: {
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    color?: THREE.Color;
    lifetime?: number;
    scale?: number;
    parentParticle?: Particle;
  }): Particle | null {
    const particle = this.particlePool.acquire();
    if (!particle) return null;
    particle.active = true;
    particle.position.copy(props.position);
    particle.velocity.copy(props.velocity);
    if (props.color) particle.color.copy(props.color);
    particle.lifetime = props.lifetime ?? 2 + Math.random();
    particle.scale = props.scale ?? 1;
    particle.age = 0;
    particle.parentParticle = props.parentParticle;

    this.modifiers.forEach((modifier) => modifier.apply(particle));
    return particle;
  }

  emit(count: number): void {
    for (let i = 0; i < count; i++) {
      const emissionPoint = this.emitter.getEmissionPoint();
      const direction = this.emitter.getEmissionDirection();
      const speed = 1.5 + Math.random() * 0.5; // Speed between 1.5 and 2

      this.createParticle({
        position: emissionPoint,
        velocity: direction.multiplyScalar(speed),
      });
    }
  }

  update(deltaTime: number): void {
    let activeIndex = 0;

    const particles = this.particlePool.activeObjects; // Access internal array for performance
    // Update particle states
    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      if (particle.active) {
        particle.age += deltaTime;

        if (particle.age >= particle.lifetime) {
          // Trigger death events before releasing
          this.modifiers.forEach((modifier) => {
            if (modifier instanceof SubEmitterModifier) {
              modifier.onDeath(particle);
            }
          });
          this.particlePool.release(particle);
        } else {
          // Apply behaviors first to accumulate forces
          this.behaviors.forEach((behavior) => behavior.update(particle, deltaTime));

          // Integrate physics
          particle.integrate(deltaTime);

          // Apply appearance modifier update
          this.appearanceModifier.update(particle);

          // Apply and update other modifiers
          this.modifiers.forEach((modifier) => {
            if (!(modifier instanceof AppearanceModifier)) {
              modifier.apply(particle);
              modifier.update?.(particle, deltaTime);
            }
          });

          // Check for collisions
          for (let j = i + 1; j < particles.length; j++) {
            const other = particles[j];
            if (particle.checkCollision(other)) {
              particle.resolveCollision(other);
              // Trigger collision events
              this.modifiers.forEach((modifier) => {
                if (modifier instanceof SubEmitterModifier) {
                  modifier.onCollision(particle);
                  modifier.onCollision(other);
                }
              });
            }
          }

          // Update particle buffers
          const idx = activeIndex * 3;
          particle.position.toArray(this.positions, idx);
          particle.color.toArray(this.colors, idx);
          particle.rotation.toArray(this.rotations, idx);
          this.scales[activeIndex] = particle.scale;
          this.opacities[activeIndex] = particle.opacity;

          this.updateTrail(particle, activeIndex);

          activeIndex++;
        }
      }
    }

    // Update geometry draw range
    this.geometry.setDrawRange(0, activeIndex);

    // Update trail geometry if it exists
    if (this.trailGeometry && this.trailPositions && this.trailColors) {
      this.trailGeometry.attributes.position.needsUpdate = true;
      this.trailGeometry.attributes.color.needsUpdate = true;
    }

    // Update geometry attributes
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.rotation.needsUpdate = true;
    this.geometry.attributes.scale.needsUpdate = true;
    this.geometry.attributes.opacity.needsUpdate = true;
  }

  updateTrail(particle: Particle, activeIndex: number) {
    const trailBehavior = this.hasTrailBehavior ? this.getTrailBehavior() : undefined;

    // Update trail buffers if trail behavior exists
    if (trailBehavior && particle.positionHistory) {
      const history = particle.positionHistory;
      const maxTrailLength = trailBehavior.maxLength ?? 40;
      const trailLength = Math.min(history.length, maxTrailLength);

      // Ensure we have valid trail buffers
      if (this.trailPositions && this.trailColors) {
        const positions = this.trailPositions;
        const colors = this.trailColors;

        // Calculate base index for this particle's trail
        const baseIndex = activeIndex * maxTrailLength * 6;

        // Create line segments with proper fade
        for (let i = 0; i < trailLength - 1; i++) {
          const segmentIndex = baseIndex + i * 6;

          // Set positions
          const currentPos = history[i];
          const nextPos = history[i + 1];
          currentPos.toArray(positions, segmentIndex);
          nextPos.toArray(positions, segmentIndex + 3);

          // Calculate fade values with slower falloff
          const alpha = Math.pow(1 - i / (trailLength - 1), 1.5);
          const nextAlpha = Math.pow(1 - (i + 1) / (trailLength - 1), 1.5);

          // Set colors with proper fade
          const { r, g, b } = particle.color;
          colors[segmentIndex] = r * alpha;
          colors[segmentIndex + 1] = g * alpha;
          colors[segmentIndex + 2] = b * alpha;
          colors[segmentIndex + 3] = r * nextAlpha;
          colors[segmentIndex + 4] = g * nextAlpha;
          colors[segmentIndex + 5] = b * nextAlpha;
        }

        // Update trail geometry draw range
        if (this.trailGeometry) {
          const totalSegments = activeIndex * (trailLength - 1);
          this.trailGeometry.setDrawRange(0, totalSegments * 2);
        }
      }
    }
  }

  addBehavior(behavior: ParticleBehavior): void {
    this.behaviors.push(behavior);
    if (behavior instanceof TrailBehavior && !this.hasTrailBehavior) {
      this.hasTrailBehavior = true;
      this.initializeTrailRendering(this.particlePool.activeObjects.length);
    }
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

    if (this.trailGeometry) {
      this.trailGeometry.dispose();
    }
    if (this.trailMaterial) {
      this.trailMaterial.dispose();
    }

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
