import * as THREE from "three";

interface ParticleSystemOptions {
  count?: number;
  lifeTime?: number;
  size?: number;
  color?: THREE.Color;
  spawnRate?: number;
  velocityFactor?: number;
}

export class ParticleSystem extends THREE.Object3D {
  private geometry: THREE.BufferGeometry;
  private positions: Float32Array;
  private velocities: Float32Array;
  private lifetimes: Float32Array;
  private ages: Float32Array;
  private activeParticles: number[];

  private material: THREE.ShaderMaterial;
  private points: THREE.Points;

  private spawnTimer: number = 0;
  private spawnRate: number;
  private particleLifeTime: number;
  private totalParticles: number;

  constructor(options: ParticleSystemOptions = {}) {
    super();

    const {
      count = 10000,
      lifeTime = 3.0,
      size = 0.1,
      color = new THREE.Color(0x00ff00),
      spawnRate = 100, // particles per second
      velocityFactor = 1.0,
    } = options;

    this.totalParticles = count;
    this.spawnRate = spawnRate;
    this.particleLifeTime = lifeTime;

    this.geometry = new THREE.BufferGeometry();

    this.positions = new Float32Array(count * 3);
    this.velocities = new Float32Array(count * 3);
    this.lifetimes = new Float32Array(count);
    this.ages = new Float32Array(count);
    this.activeParticles = [];

    // Initialize particle arrays
    for (let i = 0; i < count; i++) {
      this.positions[i * 3] = 0;
      this.positions[i * 3 + 1] = -1000; // Move off-screen initially
      this.positions[i * 3 + 2] = 0;
      this.lifetimes[i] = 0;
      this.ages[i] = 0;
    }

    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("lifetime", new THREE.BufferAttribute(this.lifetimes, 1));
    this.geometry.setAttribute("age", new THREE.BufferAttribute(this.ages, 1));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        baseColor: { value: color },
        size: { value: size },
      },
      vertexShader: `
        attribute float lifetime;
        attribute float age;

        uniform float time;
        uniform float size;

        varying float vOpacity;
        varying vec3 vColor;

        void main() {
          float progress = age / lifetime;
          
          // Simple parabolic motion
          vec3 initialPosition = position;
          vec3 gravity = vec3(0.0, -9.81, 0.0);
          vec3 finalPosition = initialPosition + 
                                vec3(0.0, 5.0, 0.0) * progress - 
                                0.5 * gravity * progress * progress;

          gl_Position = projectionMatrix * modelViewMatrix * vec4(finalPosition, 1.0);
          
          // Particle size and opacity based on lifetime
          gl_PointSize = max(1.0, (1.0 - progress) * 10.0);
          
          // Opacity fade
          vOpacity = 1.0 - smoothstep(0.7, 1.0, progress);
          
          // Color transition
          vColor = vec3(
            1.0, 
            1.0 - progress, 
            0.5 + progress * 0.5
          );
        }
      `,
      fragmentShader: `
        uniform vec3 baseColor;

        varying float vOpacity;
        varying vec3 vColor;

        void main() {
          // Circular particle shape
          vec2 circCoord = 2.0 * gl_PointCoord - 1.0;
          float dist = length(circCoord);
          if (dist > 1.0) discard;

          // Soft edge
          float alpha = (1.0 - smoothstep(0.8, 1.0, dist)) * vOpacity;
          
          gl_FragColor = vec4(baseColor * vColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.add(this.points);
  }

  private spawnParticle(): void {
    // Find an inactive particle
    for (let i = 0; i < this.totalParticles; i++) {
      if (this.lifetimes[i] <= 0) {
        // Spawn at origin with random initial velocity
        this.positions[i * 3] = 0;
        this.positions[i * 3 + 1] = 0;
        this.positions[i * 3 + 2] = 0;

        // Random velocity
        this.velocities[i * 3] = (Math.random() - 0.5) * 2;
        this.velocities[i * 3 + 1] = Math.random() * 5;
        this.velocities[i * 3 + 2] = (Math.random() - 0.5) * 2;

        // Set lifetime and reset age
        this.lifetimes[i] = this.particleLifeTime * (0.8 + Math.random() * 0.4);
        this.ages[i] = 0;

        // Add to active particles if not already tracked
        if (!this.activeParticles.includes(i)) {
          this.activeParticles.push(i);
        }
        break;
      }
    }
  }

  update(deltaTime: number) {
    // Update shader time
    this.material.uniforms.time.value += deltaTime;

    // Spawn new particles
    this.spawnTimer += deltaTime;
    const particlesToSpawn = Math.floor(this.spawnTimer * this.spawnRate);
    for (let i = 0; i < particlesToSpawn; i++) {
      this.spawnParticle();
    }
    this.spawnTimer %= 1 / this.spawnRate;

    // Update active particles
    const toRemove: number[] = [];
    this.activeParticles.forEach((particleIndex, arrayIndex) => {
      this.ages[particleIndex] += deltaTime;

      // Check if particle has exceeded its lifetime
      if (this.ages[particleIndex] >= this.lifetimes[particleIndex]) {
        // Mark particle as inactive
        this.lifetimes[particleIndex] = 0;
        this.ages[particleIndex] = 0;
        toRemove.push(arrayIndex);

        // Move particle off-screen
        this.positions[particleIndex * 3 + 1] = -1000;
      } else {
        // Update particle position
        const age = this.ages[particleIndex];
        const lifetime = this.lifetimes[particleIndex];
        const progress = age / lifetime;

        this.positions[particleIndex * 3] += this.velocities[particleIndex * 3] * deltaTime;
        this.positions[particleIndex * 3 + 1] += this.velocities[particleIndex * 3 + 1] * deltaTime - 0.5 * 9.81 * age * age;
        this.positions[particleIndex * 3 + 2] += this.velocities[particleIndex * 3 + 2] * deltaTime;
      }
    });

    // Remove expired particles from tracking
    toRemove.reverse().forEach((index) => {
      this.activeParticles.splice(index, 1);
    });

    // Update geometry attributes
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.lifetime.needsUpdate = true;
    this.geometry.attributes.age.needsUpdate = true;
  }

  // Additional methods for dynamic control
  setColor(color: THREE.Color) {
    this.material.uniforms.baseColor.value = color;
  }

  setSize(size: number) {
    this.material.uniforms.size.value = size;
  }

  getActiveParticleCount(): number {
    return this.activeParticles.length;
  }
}
