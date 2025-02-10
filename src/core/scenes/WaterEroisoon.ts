import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise";
import { pseudoRandom } from "../utils/PseudoRandom";

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
  waterMaterial!: THREE.MeshStandardMaterial;
  water!: THREE.Mesh;
  waterVertices!: Float32Array;
  colors!: Float32Array;
  size: number = 100;
  divisions: number = 200;

  // Adjusted erosion parameters for stability
  readonly EVAPORATION_RATE = 0.004; // Reduced
  readonly RAINFALL_RATE = 0.02; // Increased
  readonly MAX_WATER_DEPTH = 1.0; // Increased

  readonly WATER_RETENTION = 0.2; // Increased for more stable flow
  readonly EROSION_RATE = 0.05; // Increased for more visible erosion
  readonly DEPOSITION_RATE = 0.05; // Matched to erosion rate
  readonly SEDIMENT_CAPACITY = 0.05; // Increased for more sediment transport
  readonly MIN_SLOPE_FOR_FLOW = 0.01; // Lowered for more widespread erosion
  readonly GRAVITY = 9.81; // Real gravity for more realistic flow

  readonly MAX_SEDIMENT = 0.3; // Reduced from 0.8
  readonly MAX_EROSION_DEPTH = 1.0; // Reduced from 3.0

  rain!: THREE.Points;
  rainGeo!: THREE.BufferGeometry;
  rainMaterial!: THREE.PointsMaterial;
  rainCount: number = 1000; // adjust number of raindrops as needed
  rainSpeed: number = 0.8; // drop speed

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
    this.geometry = new THREE.PlaneGeometry(this.size, this.size, this.divisions + 1, this.divisions + 1);
    this.geometry.rotateX(-Math.PI / 2);

    pseudoRandom.setSeed(101010);
    this.noise = new SimplexNoise(pseudoRandom);
    this.vertices = this.geometry.attributes.position.array as Float32Array;
    const vertexCount = this.vertices.length / 3;
    this.colors = new Float32Array(vertexCount * 3);

    // **New Randomization Variables**
    const warpStrength = 1.0; // Increases terrain randomness
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

      this.vertices[i + 1] = height;
      this.updateTerrainColor(i, height);
    }

    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
    this.geometry.computeVertexNormals();

    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.8,
      metalness: 0.2,
    });

    this.terrain = new THREE.Mesh(this.geometry, this.material);
    this.terrain.castShadow = true;
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
  }

  private smoothTerrain(iterations: number) {
    const smoothKernel = [0.1, 0.15, 0.5, 0.15, 0.1];
    for (let iter = 0; iter < iterations; iter++) {
      // Create a temporary array to store the new heights.
      const tempHeights = new Float32Array(this.vertices.length / 3);
      for (let z = 0; z < this.divisions; z++) {
        for (let x = 0; x < this.divisions; x++) {
          const index = z * this.divisions + x;
          let smoothed = 0;
          let totalWeight = 0;
          // Loop over neighbors using kernel indices.
          for (let dz = -2; dz <= 2; dz++) {
            for (let dx = -2; dx <= 2; dx++) {
              const newX = x + dx;
              const newZ = z + dz;
              // Only include valid neighbors.
              if (newX >= 0 && newX < this.divisions && newZ >= 0 && newZ < this.divisions) {
                const nIndex = newZ * this.divisions + newX;
                const weight = smoothKernel[dz + 2] * smoothKernel[dx + 2];
                smoothed += this.vertices[nIndex * 3 + 1] * weight;
                totalWeight += weight;
              }
            }
          }
          tempHeights[index] = smoothed / totalWeight;
        }
      }
      // Update the heights in vertices using the temporary values.
      for (let z = 0; z < this.divisions; z++) {
        for (let x = 0; x < this.divisions; x++) {
          const index = z * this.divisions + x;
          this.vertices[index * 3 + 1] = tempHeights[index];
        }
      }
    }
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
    const waterGeometry = new THREE.PlaneGeometry(this.size, this.size, this.divisions + 1, this.divisions + 1);
    waterGeometry.rotateX(-Math.PI / 2);
    this.waterVertices = waterGeometry.attributes.position.array as Float32Array;

    this.waterMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x3366ff,
      transparent: true,
      opacity: 0.6,
      roughness: 0.2,
      metalness: 0.8,
      envMapIntensity: 1.5,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
    });

    this.water = new THREE.Mesh(waterGeometry, this.waterMaterial);
    this.water.position.y = 0.01; // Reduced to prevent z-fighting
    this.water.receiveShadow = true;
    this.scene.add(this.water);
  }

  private applyErosion() {
    const tempWaterMap = new Float32Array(this.waterMap);
    const tempSedimentMap = new Float32Array(this.sedimentMap);

    // Apply hydraulic erosion
    // process cells in random order
    const indices = Array.from({ length: this.vertices.length / 3 }, (_, i) => i);
    indices.sort(() => Math.random() - 0.5);

    for (let i = 0; i < indices.length; i++) {
      const index = indices[i];
      this.processCell(index, tempWaterMap, tempSedimentMap);
    }

    // Apply thermal erosion periodically (every 10 frames for example)
    // if (Math.random() < 0.1) {
    this.applyThermalErosion();
    // }

    // Update maps
    this.waterMap = tempWaterMap;
    this.sedimentMap = tempSedimentMap;

    const kernel = [0.2, 0.5, 1.0, 0.5, 0.2];
    const smoothedErosion = new Float32Array(this.sedimentMap.length);
    for (let i = 2; i < this.sedimentMap.length - 2; i++) {
      smoothedErosion[i] =
        (this.sedimentMap[i - 2] * kernel[0] +
          this.sedimentMap[i - 1] * kernel[1] +
          this.sedimentMap[i] * kernel[2] +
          this.sedimentMap[i + 1] * kernel[3] +
          this.sedimentMap[i + 2] * kernel[4]) /
        2.4;
    }
    this.sedimentMap.set(smoothedErosion);

    // Update geometry and water visualization
    this.updateGeometry();
    this.updateWater();
  }

  private processCell(index: number, tempWaterMap: Float32Array, tempSedimentMap: Float32Array) {
    const currentHeight = this.vertices[index * 3 + 1];
    const x = index % this.divisions;
    const z = Math.floor(index / this.divisions);

    // Add rainfall
    if (Math.random() < this.RAINFALL_RATE) {
      tempWaterMap[index] += this.RAINFALL_RATE * 2;
    }

    // Calculate water surface height
    const currentWaterHeight = currentHeight + this.waterMap[index];

    // Get all 4 direct neighbors (north, east, south, west)
    const directNeighbors = [
      z > 0 ? (z - 1) * this.divisions + x : null, // north
      x < this.divisions - 1 ? z * this.divisions + (x + 1) : null, // east
      z < this.divisions - 1 ? (z + 1) * this.divisions + x : null, // south
      x > 0 ? z * this.divisions + (x - 1) : null, // west
    ];

    let totalFlow = 0;
    const flows: number[] = [];
    const heightDiffs: number[] = [];
    let lowestNeighborHeight = Infinity;
    let lowestNeighborIndex = -1;

    // Calculate height differences and identify lowest neighbor
    directNeighbors.forEach((neighbor, i) => {
      if (neighbor === null) {
        flows.push(0);
        heightDiffs.push(0);
        return;
      }

      const neighborHeight = this.vertices[neighbor * 3 + 1];
      const neighborWaterHeight = neighborHeight + this.waterMap[neighbor];

      if (neighborWaterHeight < lowestNeighborHeight) {
        lowestNeighborHeight = neighborWaterHeight;
        lowestNeighborIndex = i;
      }

      // Calculate height difference
      const heightDiff = currentWaterHeight - neighborWaterHeight;
      heightDiffs.push(heightDiff);

      // Only flow if current water level is higher
      if (heightDiff > 0) {
        // Use modified flow calculation that considers direction
        const flow = heightDiff * this.WATER_RETENTION * (1 + Math.random() * 0.1); // Small random variation
        flows.push(flow);
        totalFlow += flow;
      } else {
        flows.push(0);
      }
    });

    if (totalFlow > 0) {
      // Calculate velocity based on steepest descent
      const maxHeightDiff = Math.max(...heightDiffs);
      const velocity = Math.sqrt(2 * this.GRAVITY * maxHeightDiff);
      this.waterVelocities[index] = velocity;

      // Calculate local slope using steepest descent
      const slope = maxHeightDiff / (this.size / this.divisions);

      // Modified sediment capacity calculation
      const sedimentCapacity = Math.max(
        velocity * slope * this.SEDIMENT_CAPACITY * (1 + Math.abs(Math.sin((2 * Math.PI * x) / this.divisions)) * 0.1), // Slight variation based on position
        0
      );

      // Erosion and deposition logic
      const currentSediment = this.sedimentMap[index];
      const capacityDiff = sedimentCapacity - currentSediment;

      if (capacityDiff > 0 && slope > this.MIN_SLOPE_FOR_FLOW) {
        // Erode with position-dependent variation
        const erosionAmount = Math.min(
          this.EROSION_RATE * capacityDiff * (1 + Math.random() * 0.2), // Add randomness to break patterns
          this.MAX_EROSION_DEPTH
        );

        // Apply erosion to terrain height
        this.vertices[index * 3 + 1] -= erosionAmount;
        tempSedimentMap[index] += erosionAmount;

        // Distribute sediment to neighbors based on flow and direction
        directNeighbors.forEach((neighbor, i) => {
          if (neighbor === null || flows[i] === 0) return;

          // Weight flow distribution by direction and height difference
          const directionWeight = 1 + (i === lowestNeighborIndex ? 0.2 : 0);
          const sedimentAmount = (flows[i] / totalFlow) * erosionAmount * directionWeight;
          tempSedimentMap[neighbor] += sedimentAmount;
        });
      } else if (capacityDiff < 0) {
        // Modified deposition with position-dependent variation
        const depositionAmount = Math.min(
          this.DEPOSITION_RATE * -capacityDiff * (1 + Math.abs(Math.cos((2 * Math.PI * z) / this.divisions)) * 0.1), // Slight variation
          currentSediment
        );

        this.vertices[index * 3 + 1] += depositionAmount;
        tempSedimentMap[index] -= depositionAmount;
      }

      // Distribute water with modified flow pattern
      const waterToMove = Math.min(this.waterMap[index], totalFlow);
      directNeighbors.forEach((neighbor, i) => {
        if (neighbor === null || flows[i] === 0) return;

        // Weight water distribution by direction and height difference
        const directionWeight = 1 + (i === lowestNeighborIndex ? 0.1 : 0);
        const waterAmount = (flows[i] / totalFlow) * waterToMove * directionWeight;
        tempWaterMap[index] -= waterAmount;
        tempWaterMap[neighbor] += waterAmount;
      });
    }

    // Apply evaporation with slight position-dependent variation
    const evaporationFactor = 1 - this.EVAPORATION_RATE * (1 + Math.sin(x * z * 0.1) * 0.1); // Slight spatial variation
    tempWaterMap[index] *= evaporationFactor;
    tempWaterMap[index] = Math.max(0, tempWaterMap[index]);

    // Ensure sediment stays within bounds
    tempSedimentMap[index] = Math.max(0, Math.min(tempSedimentMap[index], this.MAX_SEDIMENT));
  }

  // Add this helper method to class
  private applyThermalErosion() {
    const talus = 0.5; // Maximum stable slope angle (in rise/run)
    const erosionRate = 0.0001;

    for (let z = 0; z < this.divisions; z++) {
      for (let x = 0; x < this.divisions; x++) {
        const index = z * this.divisions + x;
        const currentHeight = this.vertices[index * 3 + 1];
        const neighbors = this.getNeighbors(index);

        neighbors.forEach((neighbor) => {
          if (neighbor === null) return;

          const neighborHeight = this.vertices[neighbor * 3 + 1];
          const heightDiff = currentHeight - neighborHeight;
          const distance = this.size / this.divisions;
          const slope = Math.abs(heightDiff) / distance;

          if (slope > talus) {
            const adjustment = (slope - talus) * distance * erosionRate;
            if (heightDiff > 0) {
              this.vertices[index * 3 + 1] -= adjustment;
              this.vertices[neighbor * 3 + 1] += adjustment;
            }
          }
        });
      }
    }
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
        const waterFactor = Math.min(this.waterMap[index] / this.MAX_WATER_DEPTH, 1);
        this.colors[i] = this.colors[i] * (1 - waterFactor * 0.2);
        this.colors[i + 1] = this.colors[i + 1] * (1 - waterFactor * 0.2);
        this.colors[i + 2] = this.colors[i + 2] * (1 + waterFactor * 0.1);
      }
    }

    this.geometry.attributes.color.needsUpdate = true;
  }

  // Add these properties to the class
  private previousWaterHeights!: Float32Array;
  private waterVelocities!: Float32Array;

  // Add this to initErosion() method
  private initErosion() {
    const vertexCount = this.vertices.length / 3;
    this.waterMap = new Float32Array(vertexCount).fill(0);
    this.sedimentMap = new Float32Array(vertexCount).fill(0);
    this.velocityMap = new Array(vertexCount).fill(null).map(() => new THREE.Vector2());

    // Initialize temporal smoothing arrays
    this.previousWaterHeights = new Float32Array(vertexCount).fill(0);
    this.waterVelocities = new Float32Array(vertexCount).fill(0);
  }

  private updateWater() {
    const MIN_VISIBLE_WATER = 0.04;
    const SMOOTHING_RADIUS = 2;
    const SURFACE_TENSION = 0.3;
    const DAMPING = 0.85; // Controls how quickly water movement slows down
    const TEMPORAL_SMOOTHING = 0.15; // Controls how much previous frame influences current frame
    const MAX_VELOCITY = 0.1; // Maximum change in height per frame

    // First pass: Create a smoothed water height map
    const smoothedWaterHeights = new Float32Array(this.waterMap.length);

    for (let z = 0; z < this.divisions; z++) {
      for (let x = 0; x < this.divisions; x++) {
        const index = z * this.divisions + x;
        let totalHeight = 0;
        let weightSum = 0;

        // Sample neighboring vertices with gaussian-like weighting
        for (let dz = -SMOOTHING_RADIUS; dz <= SMOOTHING_RADIUS; dz++) {
          for (let dx = -SMOOTHING_RADIUS; dx <= SMOOTHING_RADIUS; dx++) {
            const nx = x + dx;
            const nz = z + dz;

            if (nx >= 0 && nx < this.divisions && nz >= 0 && nz < this.divisions) {
              const nIndex = nz * this.divisions + nx;
              const distance = Math.sqrt(dx * dx + dz * dz);
              // Gaussian-like falloff for smoother blending
              const weight = Math.exp((-distance * distance) / (SMOOTHING_RADIUS * SMOOTHING_RADIUS));

              if (this.waterMap[nIndex] > MIN_VISIBLE_WATER) {
                totalHeight += (this.vertices[nIndex * 3 + 1] + this.waterMap[nIndex]) * weight;
                weightSum += weight;
              }
            }
          }
        }

        smoothedWaterHeights[index] = weightSum > 0 ? totalHeight / weightSum : this.vertices[index * 3 + 1] - 1;
      }
    }

    // Second pass: Apply temporal smoothing and update vertices
    for (let i = 0; i < this.waterVertices.length; i += 3) {
      const index = i / 3;
      const terrainHeight = this.vertices[i + 1];

      if (this.waterMap[index] > MIN_VISIBLE_WATER) {
        const rawWaterHeight = terrainHeight + this.waterMap[index];
        const smoothedHeight = smoothedWaterHeights[index];
        const targetHeight = rawWaterHeight * (1 - SURFACE_TENSION) + smoothedHeight * SURFACE_TENSION;

        // Calculate new velocity with damping
        let velocity = this.waterVelocities[index];
        velocity = (targetHeight - this.previousWaterHeights[index]) * (1 - DAMPING);

        // Clamp velocity to prevent extreme changes
        velocity = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, velocity));

        this.waterVelocities[index] = velocity;

        // Apply temporal smoothing
        const newHeight = this.previousWaterHeights[index] + velocity;
        const temporallySmoothedHeight = newHeight * (1 - TEMPORAL_SMOOTHING) + this.previousWaterHeights[index] * TEMPORAL_SMOOTHING;

        // Update water vertex and store height for next frame
        this.waterVertices[i + 1] = temporallySmoothedHeight;
        this.previousWaterHeights[index] = temporallySmoothedHeight;

        // Fade out water at edges
        let edgeFactor = 1.0;
        const x = index % this.divisions;
        const z = Math.floor(index / this.divisions);
        if (x < 2 || x > this.divisions - 3 || z < 2 || z > this.divisions - 3) {
          edgeFactor = 0.0;
        }

        if (this.water.geometry.attributes.opacity) {
          this.water.geometry.attributes.opacity.array[index] = 0.6 * edgeFactor;
        }
      } else {
        // Smoothly transition to hidden state
        this.waterVertices[i + 1] = terrainHeight - 1;
        this.previousWaterHeights[index] = terrainHeight - 1;
        this.waterVelocities[index] = 0;

        if (this.water.geometry.attributes.opacity) {
          this.water.geometry.attributes.opacity.array[index] = 0;
        }
      }
    }

    this.water.geometry.attributes.position.needsUpdate = true;
    if (this.water.geometry.attributes.opacity) {
      this.water.geometry.attributes.opacity.needsUpdate = true;
    }
    this.water.geometry.computeVertexNormals();
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
      size: 0.4,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });

    this.rain = new THREE.Points(this.rainGeo, this.rainMaterial);
    this.scene.add(this.rain);
  }

  private updateRain() {
    const positions = (this.rainGeo.attributes.position as THREE.BufferAttribute).array as Float32Array;
    for (let i = 0; i < this.rainCount; i++) {
      // Move each drop downward
      positions[i * 3 + 1] -= this.rainSpeed;
      // Reset if the drop goes below the terrain (assume terrain height ~ -5)
      if (positions[i * 3 + 1] < 0) {
        positions[i * 3 + 1] = Math.random() * 50 + 50; // reset drop high above
        positions[i * 3] = (Math.random() - 0.5) * this.size;
        positions[i * 3 + 2] = (Math.random() - 0.5) * this.size;
      }
    }
    (this.rainGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
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
        const faceIndex = intersects[0].faceIndex!;
        const vertices = [faceIndex * 3, faceIndex * 3 + 1, faceIndex * 3 + 2];

        vertices.forEach((vertexIndex) => {
          this.waterMap[vertexIndex] = Math.min(this.MAX_WATER_DEPTH, this.waterMap[vertexIndex] + 0.5);
        });
      }
    });

    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.applyErosion();
    this.updateRain(); // update rain drops each frame
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
