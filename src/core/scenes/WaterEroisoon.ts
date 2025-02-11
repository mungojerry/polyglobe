import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise";
import { pseudoRandom } from "../utils/PseudoRandom";

// Updated TERRAIN_CONFIG with merged values from snippet
const TERRAIN_CONFIG = {
  EVAPORATION_RATE: 0.015, // Reduced evaporation for more retained water
  WATER_RETENTION: 0.2, // Increased from 0.05
  SEDIMENT_CAPACITY: 0.15, // Increased from 0.05
  DEPOSITION_RATE: 0.4, // Increased from 0.3
  THERMAL_EROSION_RATE: 0.005, // Increased from 0.001
  RAINFALL_RATE: 0.3, // Increased rainfall to boost water accumulation
  MAX_WATER_DEPTH: 2.0, // Increased from 1.5
  EROSION_RATE: 0.95, // Increased slightly
  MIN_SLOPE_FOR_FLOW: 0.001, // Increased from 0.0001
  GRAVITY: 9.81, // Unchanged
  MAX_SEDIMENT: 0.5, // Increased from 0.5
  TALUS_ANGLE: 0.5, // Decreased from 0.7 for more erosion
  FLOW_FRICTION: 0.9, // Decreased from 0.95
  VELOCITY_DECAY: 0.95, // Decreased from 0.99
};

export class ProceduralTerrain {
  scene!: THREE.Scene;
  camera!: THREE.PerspectiveCamera;
  renderer!: THREE.WebGLRenderer;
  controls!: OrbitControls;
  light!: THREE.DirectionalLight;
  terrain!: THREE.Mesh;
  geometry!: THREE.PlaneGeometry;
  vertices!: Float32Array;
  noise!: SimplexNoise;
  material!: THREE.MeshStandardMaterial;
  waterMap!: Float32Array;
  sedimentMap!: Float32Array;
  velocityMap!: THREE.Vector2[];
  waterMaterial!: THREE.MeshPhongMaterial;
  water!: THREE.Mesh;
  waterVertices!: Float32Array;
  colors!: Float32Array;
  size: number = 100;
  divisions: number = 100;

  rain!: THREE.Points;
  rainGeo!: THREE.BufferGeometry;
  rainMaterial!: THREE.PointsMaterial;
  rainCount: number = 10000; // adjust number of raindrops as needed
  rainSpeed: number = 0.7; // drop speed

  private animationFrameId?: number;
  // New property for tracking thermal erosion timing
  private thermalErosionTimer: number = 0;

  constructor() {
    this.initScene();
    this.createTerrain();
    this.initErosion();
    this.createWater();
    this.createRain(); // Initialize rain particles
    this.setupEventListeners();
    this.animate();
  }

  private initScene() {
    // Scene initialization remains the same
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 50, 100);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    document.body.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;

    this.light = new THREE.DirectionalLight(0xffffff, 1);
    this.light.position.set(50, 100, 50);
    this.light.castShadow = true;
    this.scene.add(this.light);

    const ambientLight = new THREE.AmbientLight(0x404040);
    this.scene.add(ambientLight);

    const hemisphereLight = new THREE.HemisphereLight(0xffffbb, 0x080820, 0.5);
    this.scene.add(hemisphereLight);
  }
  private createTerrain() {
    this.geometry = new THREE.PlaneGeometry(this.size, this.size, this.divisions, this.divisions);
    this.geometry.rotateX(-Math.PI / 2);

    pseudoRandom.setSeed(101010);
    this.noise = new SimplexNoise(pseudoRandom);
    this.vertices = this.geometry.attributes.position.array as Float32Array;
    const vertexCount = this.vertices.length / 3;
    this.colors = new Float32Array(vertexCount * 3);

    // **New Randomization Variables**
    const warpStrength = 1.0 + Math.random() * 0.5; // Increases terrain randomness
    const jitterAmount = 0.5; // Adds jitter to vertices
    const randomOffsetX = Math.random() * 1000;
    const randomOffsetZ = Math.random() * 1000;

    for (let i = 0; i < this.vertices.length; i += 3) {
      let x = this.vertices[i];
      let y = this.vertices[i + 1];
      let z = this.vertices[i + 2];

      // **1. Apply Jitter (breaks strict grid alignment)**
      x += (Math.random() - 0.5) * jitterAmount;
      z += (Math.random() - 0.5) * jitterAmount;

      // **2. Add Directional Warping**
      const warpX = this.noise.noise3d(x * 0.2, y * 0.2, z * 0.2) * warpStrength;
      const warpZ = this.noise.noise3d(x * 0.2 + 1000, y * 0.2, z * 0.2) * warpStrength;
      const warpedX = x + warpX;
      const warpedZ = z + warpZ;

      // **3. Multi-Layered Noise with Random Offsets**
      let height = 0;
      let amplitude = 1;
      let frequency = 0.1;

      for (let o = 0; o < 5; o++) {
        const noiseValue = this.noise.noise3d(
          warpedX * frequency + o * 500 + randomOffsetX,
          y * frequency + o * 250,
          warpedZ * frequency + o * 750 + randomOffsetZ
        );
        height += noiseValue * amplitude;
        amplitude *= 0.55; // Slightly reduce contribution per octave
        frequency *= 2; // Change factor to avoid perfect doubling
      }

      // **4. Add Large-Scale Warped Mountain Shapes**
      const mountainNoise = this.noise.noise3d(warpedX * 0.05, y * 0.05, warpedZ * 0.05) * 4;
      height += Math.max(0, mountainNoise) * 3.5; // Increase effect

      // **5. Add Medium & Small-Scale Detail**
      height += this.noise.noise3d(warpedX * 0.2, y * 0.2, warpedZ * 0.2) * 1.5;
      height += this.noise.noise3d(warpedX * 0.6, y * 0.6, warpedZ * 0.6) * 0.5;

      const basinNoise = Math.max(0, this.noise.noise3d(warpedX * 0.1, y * 0.1, warpedZ * 0.1) * -2);
      height += basinNoise * 1.5; // Create natural basins

      this.vertices[i + 1] = height;
      this.updateTerrainColor(i, height);
    }

    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
    this.geometry.computeVertexNormals();

    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.8,
      metalness: 0.2,
      flatShading: true,
    });

    this.terrain = new THREE.Mesh(this.geometry, this.material);
    this.terrain.castShadow = true;
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
  }

  private updateTerrainColor(index: number, height: number) {
    const normalizedHeight = (height + 4) / 12; // Adjusted normalization

    // Color definitions
    const BEACH = [0.96, 0.87, 0.7];
    const GRASS = [0.27, 0.75, 0.35];
    const ROCK = [0.5, 0.45, 0.35];
    const SNOW = [1.0, 1.0, 1.0];

    let color: number[];
    if (normalizedHeight < 0.25) {
      const t = Math.min(Math.max((normalizedHeight - 0.15) / 0.1, 0), 1);
      color = this.lerpColor(BEACH, GRASS, t);
    } else if (normalizedHeight < 0.5) {
      const t = Math.min(Math.max((normalizedHeight - 0.4) / 0.1, 0), 1);
      color = this.lerpColor(GRASS, ROCK, t);
    } else if (normalizedHeight < 0.7) {
      const t = Math.min(Math.max((normalizedHeight - 0.6) / 0.1, 0), 1);
      color = this.lerpColor(ROCK, SNOW, t);
    } else {
      color = SNOW;
    }

    // Only apply water tint if waterMap has been initialized
    const vertexIndex = index / 3;
    if (this.waterMap && this.waterMap[vertexIndex] > 0.1) {
      color = [color[0] * 0.7 + 0.3 * 0.2, color[1] * 0.7 + 0.3 * 0.4, color[2] * 0.8 + 0.2 * 0.6];
    }
    if (this.colors) {
      this.colors[index] = color[0];
      this.colors[index + 1] = color[1];
      this.colors[index + 2] = color[2];
    }
  }

  private lerpColor(a: number[], b: number[], t: number): number[] {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  private createWater() {
    const waterGeometry = new THREE.PlaneGeometry(this.size, this.size, this.divisions, this.divisions);
    waterGeometry.rotateX(-Math.PI / 2);
    this.waterVertices = waterGeometry.attributes.position.array as Float32Array;

    this.waterMaterial = new THREE.MeshPhongMaterial({
      color: 0x3366ff,
      transparent: true,
      shininess: 300, // Increased shininess
      specular: 0x88ffff, // Added specular highlight color
      opacity: 0.9, // Slightly more transparent
      side: THREE.DoubleSide,
      depthWrite: true,
      flatShading: false, // Smooth shading for better reflections
      reflectivity: 1.0, // Maximum reflectivity
    });

    this.water = new THREE.Mesh(waterGeometry, this.waterMaterial);
    this.water.position.y = 0.01; // Reduced to prevent z-fighting
    this.water.receiveShadow = true;
    this.scene.add(this.water);
  }

  // Replaced applyErosion method
  private applyErosion() {
    const tempWaterMap = new Float32Array(this.waterMap);
    const tempSedimentMap = new Float32Array(this.sedimentMap);
    const tempVelocityMap = this.velocityMap.map((v) => v.clone());

    // Hydraulic erosion
    const indices = Array.from({ length: this.vertices.length / 3 }, (_, i) => i);
    indices.sort(() => Math.random() - 0.5);
    for (const index of indices) {
      this.processHydraulicErosion(index, tempWaterMap, tempSedimentMap, tempVelocityMap);
    }

    // Apply thermal erosion every 5 frames
    if (this.thermalErosionTimer++ % 105 === 0) {
      this.applyThermalErosion();
    }

    // Update maps
    this.waterMap = tempWaterMap;
    this.sedimentMap = tempSedimentMap;
    this.velocityMap = tempVelocityMap;

    this.updateGeometry();
    this.updateWater();
  }

  // Replaced processHydraulicErosion method
  private processHydraulicErosion(index: number, waterMap: Float32Array, sedimentMap: Float32Array, velocityMap: THREE.Vector2[]) {
    const cellSize = this.size / this.divisions;
    const currentHeight = this.vertices[index * 3 + 1];
    const waterHeight = waterMap[index];
    const sediment = sedimentMap[index];
    const velocity = velocityMap[index];

    // More aggressive evaporation for visible changes
    waterMap[index] *= 1 - TERRAIN_CONFIG.EVAPORATION_RATE;

    const neighbors = this.getNeighbors(index)
      .filter((n) => n !== null)
      .map((n) => ({
        index: n!,
        height: this.vertices[n! * 3 + 1],
        water: waterMap[n!],
        dir: this.getDirectionVector(index, n!),
      }));

    let totalOutflow = 0;
    const outflows: number[] = [];

    // Calculate more aggressive outflow
    neighbors.forEach((neighbor, i) => {
      const totalHeight = currentHeight + waterHeight;
      const neighborTotalHeight = neighbor.height + neighbor.water;
      const heightDiff = totalHeight - neighborTotalHeight;

      if (heightDiff > TERRAIN_CONFIG.MIN_SLOPE_FOR_FLOW) {
        const slope = heightDiff / cellSize;
        // More aggressive flow rate calculation
        const flowRate = Math.min(waterHeight, heightDiff * TERRAIN_CONFIG.WATER_RETENTION * Math.pow(slope, 0.75));
        outflows[i] = flowRate;
        totalOutflow += flowRate;
      } else {
        outflows[i] = 0;
      }
    });

    // More aggressive erosion and deposition
    if (totalOutflow > 0) {
      waterMap[index] -= totalOutflow;
      const velocity_magnitude = velocity.length() + 0.01; // Prevent zero velocity
      const sedimentCapacity = TERRAIN_CONFIG.SEDIMENT_CAPACITY * velocity_magnitude * Math.sqrt(totalOutflow);

      if (sediment > sedimentCapacity) {
        // More aggressive deposition
        const depositAmount = (sediment - sedimentCapacity) * TERRAIN_CONFIG.DEPOSITION_RATE;
        sedimentMap[index] -= depositAmount;
        this.vertices[index * 3 + 1] += depositAmount;
      } else {
        // More aggressive erosion
        const erodeAmount = Math.min((sedimentCapacity - sediment) * TERRAIN_CONFIG.EROSION_RATE * velocity_magnitude, TERRAIN_CONFIG.MAX_WATER_DEPTH * 0.1);
        sedimentMap[index] += erodeAmount;
        this.vertices[index * 3 + 1] -= erodeAmount;
      }

      // Update velocity with more impact
      const avgDirection = new THREE.Vector2();
      neighbors.forEach((neighbor, i) => {
        if (outflows[i] > 0) {
          avgDirection.add(neighbor.dir.multiplyScalar(outflows[i] * 2)); // Doubled impact
          waterMap[neighbor.index] += outflows[i];
        }
      });

      // More impactful velocity updates
      avgDirection.normalize().multiplyScalar((totalOutflow / cellSize) * 2);
      velocityMap[index].add(avgDirection).multiplyScalar(TERRAIN_CONFIG.VELOCITY_DECAY);
    }

    // Enhanced gravity effect
    velocityMap[index].y -= TERRAIN_CONFIG.GRAVITY * 0.002; // Doubled from 0.001
  }

  // Replaced applyThermalErosion method
  private applyThermalErosion() {
    const cellSize = this.size / this.divisions;
    const maxDelta = TERRAIN_CONFIG.THERMAL_EROSION_RATE * cellSize;
    for (let i = 0; i < this.vertices.length / 3; i++) {
      const neighbors = this.getNeighbors(i).filter((n) => n !== null) as number[];
      const currentHeight = this.vertices[i * 3 + 1];
      neighbors.forEach((n) => {
        const neighborHeight = this.vertices[n * 3 + 1];
        const heightDiff = currentHeight - neighborHeight;
        const slope = heightDiff / cellSize;
        if (slope > TERRAIN_CONFIG.TALUS_ANGLE) {
          const transfer = Math.min(maxDelta, (slope - TERRAIN_CONFIG.TALUS_ANGLE) * cellSize * 0.1);
          this.vertices[i * 3 + 1] -= transfer;
          this.vertices[n * 3 + 1] += transfer;
        }
      });
    }
  }

  // Replaced updateWater method
  private updateWater() {
    // Modified MIN_WATER value to capture lower water volumes
    const MIN_WATER = 0.005;
    const cellSize = this.size / this.divisions;
    const newWaterHeights = new Float32Array(this.waterMap.length);
    const velocityScale = 0.05 * cellSize; // Scale velocity based on cell size

    // Enhanced diffusion with multiple iterations
    for (let iter = 0; iter < 3; iter++) {
      // 3 diffusion iterations
      const tempHeights = new Float32Array(newWaterHeights);
      for (let i = 0; i < this.waterMap.length; i++) {
        if (this.waterMap[i] < MIN_WATER) {
          this.waterVertices[i * 3 + 1] = this.vertices[i * 3 + 1] - 0.1;
          tempHeights[i] = 0;
          continue;
        }

        // Improved advection with velocity scaling
        const velocity = this.velocityMap[i].clone().multiplyScalar(velocityScale);
        const x = i % this.divisions;
        const z = Math.floor(i / this.divisions);

        // Semi-Lagrangian advection (sample from previous position)
        const prevX = Math.round(x - velocity.x);
        const prevZ = Math.round(z - velocity.y);
        if (prevX >= 0 && prevX < this.divisions && prevZ >= 0 && prevZ < this.divisions) {
          const prevIndex = prevZ * this.divisions + prevX;
          tempHeights[i] = this.waterMap[prevIndex];
        }

        // Stronger diffusion (25% neighbor influence)
        let total = 0;
        let count = 0;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (x + dx >= 0 && x + dx < this.divisions && z + dz >= 0 && z + dz < this.divisions) {
              total += this.waterMap[(z + dz) * this.divisions + (x + dx)];
              count++;
            }
          }
        }
        newWaterHeights[i] = 0.85 * tempHeights[i] + 0.15 * (total / count);
      }
    }

    // Add pressure-based height correction
    const PRESSURE_FACTOR = 0.001; // Controls flattening strength
    const pressureHeights = new Float32Array(newWaterHeights);

    for (let iter = 0; iter < 2; iter++) {
      for (let i = 0; i < this.waterMap.length; i++) {
        if (newWaterHeights[i] < MIN_WATER) continue;

        const neighbors = this.getNeighbors(i).filter((n) => n !== null) as number[];
        let avgNeighborHeight = 0;
        neighbors.forEach((n) => (avgNeighborHeight += newWaterHeights[n]));
        avgNeighborHeight /= neighbors.length;

        // Calculate pressure-based adjustment
        const heightDiff = newWaterHeights[i] - avgNeighborHeight;
        pressureHeights[i] -= heightDiff * PRESSURE_FACTOR;
      }
      // Update heights for next iteration
      newWaterHeights.set(pressureHeights);
    }

    // Update final water heights with pressure correction
    for (let i = 0; i < this.waterVertices.length; i += 3) {
      const idx = i / 3;
      const targetHeight = this.vertices[idx * 3 + 1] + newWaterHeights[idx];
      this.waterVertices[i + 1] = THREE.MathUtils.lerp(
        this.waterVertices[i + 1],
        targetHeight,
        0.5 // Conservative lerp to prevent overshooting
      );
    }

    this.water.geometry.attributes.position.needsUpdate = true;
    this.water.geometry.computeVertexNormals();
  }

  // Replaced updateRain method
  private updateRain() {
    const positions = (this.rainGeo.attributes.position as THREE.BufferAttribute).array as Float32Array;
    // Clone and invert the matrix rather than mutating the original
    const invMatrix = new THREE.Matrix4().copy(this.terrain.matrixWorld).invert();
    for (let i = 0; i < this.rainCount; i++) {
      const idx = i * 3;
      const pos = new THREE.Vector3(positions[idx], positions[idx + 1], positions[idx + 2]);
      // Transform to terrain local space using the cloned inverted matrix
      const localPos = pos.clone().applyMatrix4(invMatrix);
      const terrainX = Math.floor(((localPos.x + this.size / 2) / this.size) * this.divisions);
      const terrainZ = Math.floor(((localPos.z + this.size / 2) / this.size) * this.divisions);
      if (terrainX >= 0 && terrainX < this.divisions && terrainZ >= 0 && terrainZ < this.divisions) {
        const terrainIndex = terrainZ * this.divisions + terrainX;
        const terrainHeight = this.vertices[terrainIndex * 3 + 1];
        if (localPos.y < terrainHeight) {
          this.waterMap[terrainIndex] = Math.min(
            TERRAIN_CONFIG.MAX_WATER_DEPTH,
            this.waterMap[terrainIndex] + TERRAIN_CONFIG.RAINFALL_RATE * 0.1 // Reduced impact
          );
          positions[idx + 1] = Math.random() * 50 + 50;
        }
      }
      positions[idx + 1] -= this.rainSpeed;
      if (positions[idx + 1] < 0) {
        positions[idx + 1] = Math.random() * 50 + 50;
      }
    }
    (this.rainGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  private createRain() {
    this.rainGeo = new THREE.BufferGeometry();
    const rainPositions = new Float32Array(this.rainCount * 3);
    // Create raindrops at random positions above the scene
    for (let i = 0; i < this.rainCount; i++) {
      const x = (Math.random() - 0.5) * this.size;
      const y = Math.random() * 50 + 50; // drops start high
      const z = (Math.random() - 0.5) * this.size;
      rainPositions[i * 3] = x;
      rainPositions[i * 3 + 1] = y;
      rainPositions[i * 3 + 2] = z;
    }
    this.rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPositions, 3));

    this.rainMaterial = new THREE.PointsMaterial({
      color: 0x0000ff,
      size: 0.2,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });

    this.rain = new THREE.Points(this.rainGeo, this.rainMaterial);
    this.scene.add(this.rain);
  }

  private setupEventListeners() {
    this.renderer.domElement.addEventListener("click", (event) => {
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();

      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

      raycaster.setFromCamera(mouse, this.camera);
      const intersects = raycaster.intersectObject(this.terrain);

      if (intersects.length > 0) {
        const impactPoint = intersects[0].point;
        // Determine grid coordinates from the impact point relative to terrain size
        const localX = impactPoint.x + this.size / 2;
        const localZ = impactPoint.z + this.size / 2;
        const gridX = Math.floor((localX / this.size) * this.divisions);
        const gridZ = Math.floor((localZ / this.size) * this.divisions);
        if (gridX >= 0 && gridX < this.divisions && gridZ >= 0 && gridZ < this.divisions) {
          const terrainIndex = gridZ * this.divisions + gridX;
          this.waterMap[terrainIndex] = Math.min(TERRAIN_CONFIG.MAX_WATER_DEPTH, this.waterMap[terrainIndex] + 0.5);
        }
      }
    });

    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  animate() {
    this.animationFrameId = requestAnimationFrame(this.animate.bind(this));
    this.applyErosion();
    this.updateRain();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  // Optional cleanup method:
  dispose() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  // Add this to initErosion() method
  private initErosion() {
    const vertexCount = this.vertices.length / 3;
    this.waterMap = new Float32Array(vertexCount).fill(0);
    this.sedimentMap = new Float32Array(vertexCount).fill(0);
    this.velocityMap = new Array(vertexCount).fill(null).map(() => new THREE.Vector2());
  }

  private getNeighbors(index: number): (number | null)[] {
    const neighbors: (number | null)[] = [];
    const x = index % this.divisions;
    const z = Math.floor(index / this.divisions);

    // Check all 8 neighbors
    const directions = [
      [-1, -1],
      [0, -1],
      [1, -1],
      [-1, 0],
      [1, 0],
      [-1, 1],
      [0, 1],
      [1, 1],
    ];

    for (const [dx, dz] of directions) {
      const newX = x + dx;
      const newZ = z + dz;

      if (newX >= 0 && newX < this.divisions && newZ >= 0 && newZ < this.divisions) {
        neighbors.push(newZ * this.divisions + newX);
      } else {
        neighbors.push(null);
      }
    }

    return neighbors;
  }

  private getDirectionVector(fromIndex: number, toIndex: number): THREE.Vector2 {
    const fromX = fromIndex % this.divisions;
    const fromZ = Math.floor(fromIndex / this.divisions);
    const toX = toIndex % this.divisions;
    const toZ = Math.floor(toIndex / this.divisions);
    return new THREE.Vector2(toX - fromX, toZ - fromZ).normalize();
  }

  private calculateSlope(index: number): number {
    const neighbors = this.getNeighbors(index).filter((n) => n !== null) as number[];
    const currentHeight = this.vertices[index * 3 + 1];
    let maxSlope = 0;

    neighbors.forEach((n) => {
      const neighborHeight = this.vertices[n * 3 + 1];
      const slope = Math.abs(currentHeight - neighborHeight);
      maxSlope = Math.max(maxSlope, slope);
    });

    return maxSlope;
  }

  private updateGeometry() {
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();

    // Update colors based on erosion and water
    for (let i = 0; i < this.vertices.length; i += 3) {
      const index = i / 3;
      const height = this.vertices[i + 1];
      this.updateTerrainColor(i, height);

      // Darken areas with water
      if (this.waterMap[index] > 0.05) {
        const waterFactor = Math.min(this.waterMap[index] / TERRAIN_CONFIG.MAX_WATER_DEPTH, 1);
        this.colors[i] = this.colors[i] * (1 - waterFactor * 0.2);
        this.colors[i + 1] = this.colors[i + 1] * (1 - waterFactor * 0.2);
        this.colors[i + 2] = this.colors[i + 2] * (1 + waterFactor * 0.1);
      }
    }

    this.geometry.attributes.color.needsUpdate = true;
  }
}
