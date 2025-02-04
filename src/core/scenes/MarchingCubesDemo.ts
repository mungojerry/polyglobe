import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise.js";
import { MarchingCubes } from "three/examples/jsm/objects/MarchingCubes.js";

const RESOLUTION = 64;
const OCTAVES = 6;
const PERSISTENCE = 0.5;
const LACUNARITY = 2.0;
const NOISE_SCALE = 4;
const NOISE_INTENSITY = 0.1;
const MOUNTAIN_HEIGHT = 0.9; // Added new parameter

// Define biome colors
const BIOMES = {
  DEEP_OCEAN: new THREE.Color(0x000033),
  OCEAN: new THREE.Color(0x0077be),
  SHALLOW_WATER: new THREE.Color(0x20b2aa),
  BEACH: new THREE.Color(0xffd700),
  SNOW: new THREE.Color(0xfffafa),
  TUNDRA: new THREE.Color(0x8b8589),
  GRASSLAND: new THREE.Color(0x90ee90),
  FOREST: new THREE.Color(0x228b22),
  RAINFOREST: new THREE.Color(0x004225),
  DESERT: new THREE.Color(0xf4a460),
};

export class MarchingCubesDemo {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private planet!: MarchingCubes;
  private controls: OrbitControls;
  private simplex: SimplexNoise;

  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 10;

    this.simplex = new SimplexNoise();

    this.setupScene();
    this.setupLighting();
    this.setupPlanet();
    this.setupCamera();
    this.setupEventListeners();

    this.animate();
  }

  private setupScene(): void {
    this.scene.background = new THREE.Color(0x111111);
  }

  private setupLighting(): void {
    const mainLight = new THREE.DirectionalLight(0xffffff, 3);
    mainLight.position.set(3, 3, 3);
    this.scene.add(mainLight);

    const ambientLight = new THREE.AmbientLight(0x404040, 0.7);
    this.scene.add(ambientLight);
  }

  private setupPlanet(): void {
    const material = new THREE.MeshPhongMaterial({
      vertexColors: true,
      shininess: 100,
      flatShading: true, // Smooth shading for better visual quality
      wireframe: false,
      side: THREE.FrontSide,
    });

    this.planet = new MarchingCubes(RESOLUTION, material, true, true);
    this.planet.scale.set(2, 2, 2);
    this.planet.isolation = 0.5; // Correct isolation for base sphere
    this.scene.add(this.planet);

    this.generateTerrain();
  }

  private setupCamera(): void {
    this.camera.position.set(0, 2, 4);
    this.camera.lookAt(0, 0, 0);
  }

  private setupEventListeners(): void {
    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  private getFbm(x: number, y: number, z: number, simplex: SimplexNoise): number {
    let amplitude = 1.0;
    let frequency = 1.0;
    let noiseValue = 0.0;
    let totalAmplitude = 0.0;

    for (let i = 0; i < OCTAVES; i++) {
      noiseValue += simplex.noise3d(x * NOISE_SCALE * frequency, y * NOISE_SCALE * frequency, z * NOISE_SCALE * frequency) * amplitude;

      totalAmplitude += amplitude;
      amplitude *= PERSISTENCE;
      frequency *= LACUNARITY;
    }

    return noiseValue / totalAmplitude;
  }

  private getBiomeColor(elevation: number, latitude: number): THREE.Color {
    // Adjusted elevation thresholds
    if (elevation < -0.05) return BIOMES.DEEP_OCEAN;
    if (elevation < 0.0) return BIOMES.OCEAN;
    if (elevation < 0.03) return BIOMES.SHALLOW_WATER;
    if (elevation < 0.06) return BIOMES.BEACH;

    // Latitude-based biomes with elevation modifiers
    const absLat = Math.abs(latitude);

    if (elevation > 0.25) return BIOMES.SNOW; // High altitude snow
    if (absLat > 0.8) return BIOMES.SNOW;
    if (absLat > 0.7) return BIOMES.TUNDRA;

    // Lower elevation biomes
    if (elevation < 0.15) {
      return BIOMES.GRASSLAND;
    }

    // Mid-elevation biomes
    if (absLat > 0.5) return BIOMES.FOREST;
    if (absLat > 0.3) return BIOMES.RAINFOREST;
    return BIOMES.DESERT;
  }
  private generateTerrain(): void {
    // Generate noise field
    for (let z = 0; z < RESOLUTION; z++) {
      for (let y = 0; y < RESOLUTION; y++) {
        for (let x = 0; x < RESOLUTION; x++) {
          const i = x + y * RESOLUTION + z * RESOLUTION * RESOLUTION;
          const nx = (x / RESOLUTION) * 2 - 1;
          const ny = (y / RESOLUTION) * 2 - 1;
          const nz = (z / RESOLUTION) * 2 - 1;

          const distance = Math.sqrt(nx * nx + ny * ny + nz * nz);

          if (distance > 1.4) {
            this.planet.field[i] = -1;
            continue;
          }

          const baseHeight = 1.0 - distance;
          const noise = this.getFbm(nx, ny, nz, this.simplex) * NOISE_INTENSITY;
          this.planet.field[i] = baseHeight + noise;
        }
      }
    }

    this.planet.update(); // Generate the mesh

    // Calculate vertex colors based on actual positions
    const positions = this.planet.geometry.attributes.position.array;
    const colors = new Float32Array(positions.length);

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i] / 2; // Account for scaling
      const y = positions[i + 1] / 2;
      const z = positions[i + 2] / 2;

      const distance = Math.sqrt(x * x + y * y + z * z);
      const latitude = Math.asin(y / distance) / (Math.PI / 2);
      const noise = this.getFbm(x, y, z, this.simplex);
      const elevation = distance - 1.0 + noise * NOISE_INTENSITY + Math.max(0, noise - 0.5) * MOUNTAIN_HEIGHT;
      const totalElevation = elevation + noise;

      const color = this.getBiomeColor(totalElevation, latitude);
      colors[i] = color.r;
      colors[i + 1] = color.g;
      colors[i + 2] = color.b;
    }

    this.planet.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.planet.geometry.attributes.color.needsUpdate = true;
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);

    // this.planet.rotation.y += 0.002;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };
}
