import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise";

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
  divisions: number = 100;

  // Adjusted erosion parameters for stability
  readonly WATER_RETENTION = 0.1; // Increased
  readonly EVAPORATION_RATE = 0.01; // Reduced
  readonly RAINFALL_RATE = 0.01; // Increased
  readonly MAX_WATER_DEPTH = 1.0; // Increased

  readonly EROSION_RATE = 0.001; // Reduced from 0.003
  readonly DEPOSITION_RATE = 0.005; // Reduced from 0.01
  readonly SEDIMENT_CAPACITY = 0.01; // Reduced from 0.04
  readonly MIN_SLOPE_FOR_FLOW = 0.01; // Reduced from 0.03
  readonly GRAVITY = 1.0; // Reduced from 2.5
  readonly MAX_SEDIMENT = 0.3; // Reduced from 0.8
  readonly MAX_EROSION_DEPTH = 1.0; // Reduced from 3.0

  constructor() {
    this.initScene();
    this.createTerrain();
    this.initErosion();
    this.createWater();
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
  private removeGeometrySeams() {
    const positions = this.geometry.attributes.position.array as Float32Array;
    const verticesPerRow = this.divisions + 2;

    // Blend vertices along potential seam lines
    for (let i = 0; i < verticesPerRow; i++) {
      for (let j = 0; j < verticesPerRow; j++) {
        const index = (i * verticesPerRow + j) * 3;
        if (i > 0 && i < verticesPerRow - 1 && j > 0 && j < verticesPerRow - 1) {
          // Average heights with neighbors
          const height = positions[index + 1];
          const neighbors = [
            positions[index - verticesPerRow * 3 + 1], // up
            positions[index + verticesPerRow * 3 + 1], // down
            positions[index - 3 + 1], // left
            positions[index + 3 + 1], // right
          ];
          positions[index + 1] = (height + neighbors.reduce((a, b) => a + b, 0) / 4) / 2;
        }
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
  }
  private createTerrain() {
    this.geometry = new THREE.PlaneGeometry(this.size, this.size, this.divisions + 1, this.divisions + 1);
    this.geometry.rotateX(-Math.PI / 2);

    this.noise = new SimplexNoise();
    this.vertices = this.geometry.attributes.position.array as Float32Array;
    const vertexCount = this.vertices.length / 3;
    this.colors = new Float32Array(vertexCount * 3);

    // Improved terrain generation with smoother noise
    for (let i = 0; i < this.vertices.length; i += 3) {
      const x = this.vertices[i];
      const z = this.vertices[i + 2];
      let height = 0;
      let amplitude = 4;
      let frequency = 0.02;

      // Add multiple noise layers for natural variation
      for (let o = 0; o < 5; o++) {
        const noiseValue = this.noise.noise(x * frequency + o * 100, z * frequency + o * 100);
        height += noiseValue * amplitude;
        amplitude *= 0.5;
        frequency *= 2.0;
      }

      // Add large-scale mountain shapes
      const mountainNoise = this.noise.noise(x * 0.005, z * 0.005) * 10;
      height += Math.max(0, mountainNoise) * 2;

      // Add medium-scale detail
      const detailNoise = this.noise.noise(x * 0.1, z * 0.1) * 1.5;
      height += detailNoise;

      this.vertices[i + 1] = height;
      this.updateTerrainColor(i, height);
    }

    // Smooth the terrain
    this.smoothTerrain(2);
    this.removeGeometrySeams();

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

    this.waterMaterial = new THREE.MeshStandardMaterial({
      color: 0x3366ff,
      transparent: true,
      opacity: 0.8, // Increased opacity
      roughness: 0.1, // More reflective
      metalness: 0.9, // More reflective
    });

    this.water = new THREE.Mesh(waterGeometry, this.waterMaterial);
    this.water.position.y = 0.01; // Reduced to prevent z-fighting
    this.scene.add(this.water);
  }

  private applyErosion() {
    const tempWaterMap = new Float32Array(this.waterMap);
    const tempSedimentMap = new Float32Array(this.sedimentMap);

    for (let i = 0; i < this.vertices.length; i += 3) {
      const index = i / 3;
      // Always process the cell so that evaporation and rainfall are applied.
      this.processCell(index, tempWaterMap, tempSedimentMap);
    }

    // Update maps
    this.waterMap = tempWaterMap;
    this.sedimentMap = tempSedimentMap;

    // Update geometry and water visualization
    this.updateGeometry();
    this.updateWater();
  }

  private processCell(index: number, tempWaterMap: Float32Array, tempSedimentMap: Float32Array) {
    const currentHeight = this.vertices[index * 3 + 1];
    const neighbors = this.getNeighbors(index);

    // Add more consistent rainfall
    if (Math.random() < this.RAINFALL_RATE) {
      tempWaterMap[index] += this.RAINFALL_RATE * 2;
    }

    let totalDownhill = 0;
    const flowDirections: number[] = [];

    neighbors.forEach((neighbor, i) => {
      if (neighbor === null) {
        flowDirections.push(0);
        return;
      }

      const neighborHeight = this.vertices[neighbor * 3 + 1] + this.waterMap[neighbor];
      const currentTotal = currentHeight + this.waterMap[index];

      if (currentTotal > neighborHeight) {
        const difference = currentTotal - neighborHeight;
        // Add momentum-based flow
        const momentum = Math.abs(this.waterVelocities[index]) * 0.5;
        flowDirections.push(difference + momentum);
        totalDownhill += difference + momentum;
      } else {
        flowDirections.push(0);
      }
    });

    if (totalDownhill > 0) {
      // Reduce flow rate for more stability
      const waterToMove = this.waterMap[index] * 0.3; // Reduced from 0.5

      neighbors.forEach((neighbor, i) => {
        if (neighbor === null || flowDirections[i] === 0) return;

        const flowAmount = (flowDirections[i] / totalDownhill) * waterToMove;
        // Gradually transfer water
        const actualFlow = Math.min(flowAmount, this.waterMap[index] * 0.5);
        tempWaterMap[index] -= actualFlow;
        tempWaterMap[neighbor] += actualFlow;
      });
    }

    // Ensure minimum water level is maintained
    tempWaterMap[index] = Math.max(0.01, tempWaterMap[index] * (1 - this.EVAPORATION_RATE));
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
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
