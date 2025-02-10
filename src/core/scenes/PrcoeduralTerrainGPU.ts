import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise";
import { pseudoRandom } from "../utils/PseudoRandom";

// Compute shader for erosion simulation
const erosionShader = {
  vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
  fragmentShader: `
        uniform sampler2D heightMap;
        uniform sampler2D waterMap;
        uniform sampler2D sedimentMap;
        uniform float deltaTime;
        uniform float evaporationRate;
        uniform float rainRate;
        uniform float erosionRate;
        uniform float depositionRate;
        uniform float minSlope;
        uniform float maxWaterDepth;
        uniform vec2 resolution;
        
        varying vec2 vUv;
        
        float random(vec2 st) {
            return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
        }
        
        void main() {
            vec2 texelSize = 1.0 / resolution;
            vec2 uv = vUv;
            
            float height = texture2D(heightMap, uv).r;
            float water = texture2D(waterMap, uv).r;
            float sediment = texture2D(sedimentMap, uv).r;
            
            // Sample neighbors
            vec4 neighborHeights;
            neighborHeights.x = texture2D(heightMap, uv + vec2(0.0, texelSize.y)).r;
            neighborHeights.y = texture2D(heightMap, uv + vec2(texelSize.x, 0.0)).r;
            neighborHeights.z = texture2D(heightMap, uv - vec2(0.0, texelSize.y)).r;
            neighborHeights.w = texture2D(heightMap, uv - vec2(texelSize.x, 0.0)).r;
            
            vec4 neighborWater;
            neighborWater.x = texture2D(waterMap, uv + vec2(0.0, texelSize.y)).r;
            neighborWater.y = texture2D(waterMap, uv + vec2(texelSize.x, 0.0)).r;
            neighborWater.z = texture2D(waterMap, uv - vec2(0.0, texelSize.y)).r;
            neighborWater.w = texture2D(waterMap, uv - vec2(texelSize.x, 0.0)).r;
            
            float totalHeight = height + water;
            vec4 totalNeighborHeights = neighborHeights + neighborWater;
            vec4 heightDiffs = vec4(totalHeight) - totalNeighborHeights;
            
            // Calculate flow
            vec4 flow = max(vec4(0.0), heightDiffs) * deltaTime;
            float totalFlow = flow.x + flow.y + flow.z + flow.w;
            
            // Update water and sediment
            if (totalFlow > 0.0) {
                flow /= totalFlow;
                float velocity = length(heightDiffs) * sqrt(2.0 * 9.81 * totalFlow);
                float capacity = max(velocity * erosionRate, 0.0);
                
                if (capacity > sediment && length(heightDiffs) > minSlope) {
                    float erosionAmount = min(erosionRate * (capacity - sediment), 1.0);
                    height -= erosionAmount;
                    sediment += erosionAmount;
                } else if (capacity < sediment) {
                    float depositionAmount = depositionRate * (sediment - capacity);
                    height += depositionAmount;
                    sediment -= depositionAmount;
                }
                
                float waterToMove = min(water, totalFlow);
                water -= waterToMove;
            }
            
            // Apply rainfall and evaporation
            if (random(uv + vec2(deltaTime)) < rainRate) {
                water += rainRate * 2.0;
            }
            water *= (1.0 - evaporationRate * deltaTime);
            water = clamp(water, 0.0, maxWaterDepth);
            
            gl_FragColor = vec4(height, water, sediment, 1.0);
        }
    `,
};

export class ProceduralTerrainGPU {
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
  waterMaterial!: THREE.MeshStandardMaterial;
  water!: THREE.Mesh;
  waterVertices!: Float32Array;
  colors!: Float32Array;
  size: number = 100;
  divisions: number = 200;

  waterMap!: Float32Array;
  sedimentMap!: Float32Array;
  velocityMap!: THREE.Vector2[];

  private simulationMaterial!: THREE.ShaderMaterial;
  private simulationScene!: THREE.Scene;
  private simulationCamera!: THREE.OrthographicCamera;
  private simulationMesh!: THREE.Mesh;
  private renderTargets!: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  private currentRenderTarget: number = 0;

  // Erosion parameters
  readonly EVAPORATION_RATE = 0.004;
  readonly RAINFALL_RATE = 0.02;
  readonly MAX_WATER_DEPTH = 1.0;
  readonly WATER_RETENTION = 0.2;
  readonly EROSION_RATE = 0.05;
  readonly DEPOSITION_RATE = 0.05;
  readonly SEDIMENT_CAPACITY = 0.05;
  readonly MIN_SLOPE_FOR_FLOW = 0.01;
  readonly GRAVITY = 9.81;
  readonly MAX_SEDIMENT = 0.3;
  readonly MAX_EROSION_DEPTH = 1.0;

  private previousWaterHeights!: Float32Array;
  private waterVelocities!: Float32Array;
  constructor() {
    this.initScene();
    this.createTerrain();
    this.initSimulation();
    this.createWater();
    this.setupEventListeners();
    this.animate();
  }

  private initSimulation() {
    console.log("Initializing erosion simulation...");

    const rtOptions = {
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
    };

    this.renderTargets = [
      new THREE.WebGLRenderTarget(this.divisions, this.divisions, rtOptions),
      new THREE.WebGLRenderTarget(this.divisions, this.divisions, rtOptions),
    ];

    // Initialize heightmap data with actual terrain heights
    const heightData = new Float32Array(this.divisions * this.divisions * 4);
    const waterData = new Float32Array(this.divisions * this.divisions * 4);
    const sedimentData = new Float32Array(this.divisions * this.divisions * 4);

    // Fill initial data with actual terrain values
    for (let i = 0; i < this.vertices.length / 3; i++) {
      const idx = i * 4;
      const height = this.vertices[i * 3 + 1];

      // Store height in R channel
      heightData[idx] = height;
      // Initialize some water in G channel (small amount everywhere)
      heightData[idx + 1] = 0.1; // Initial water level
      // No initial sediment in B channel
      heightData[idx + 2] = 0;
      // Full alpha in A channel
      heightData[idx + 3] = 1;
    }

    // Create and update textures
    const heightTexture = new THREE.DataTexture(heightData, this.divisions, this.divisions, THREE.RGBAFormat, THREE.FloatType);
    heightTexture.needsUpdate = true;

    // Create simulation material with updated parameters
    this.simulationMaterial = new THREE.ShaderMaterial({
      uniforms: {
        heightMap: { value: heightTexture },
        waterMap: { value: null },
        sedimentMap: { value: null },
        deltaTime: { value: 1.0 / 60.0 },
        evaporationRate: { value: 0.1 }, // Increased for visibility
        rainRate: { value: 0.3 }, // Increased for visibility
        erosionRate: { value: 0.2 }, // Increased for visibility
        depositionRate: { value: 0.2 }, // Increased for visibility
        minSlope: { value: 0.01 },
        maxWaterDepth: { value: 1.0 },
        resolution: { value: new THREE.Vector2(this.divisions, this.divisions) },
      },
      vertexShader: erosionShader.vertexShader,
      fragmentShader: erosionShader.fragmentShader,
    });

    // Setup simulation scene
    this.simulationScene = new THREE.Scene();
    this.simulationCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const simulationGeometry = new THREE.PlaneGeometry(2, 2);
    this.simulationMesh = new THREE.Mesh(simulationGeometry, this.simulationMaterial);
    this.simulationScene.add(this.simulationMesh);

    // Initial render to first target
    this.renderer.setRenderTarget(this.renderTargets[0]);
    this.renderer.render(this.simulationScene, this.simulationCamera);
    this.renderer.setRenderTarget(null);

    console.log("Erosion simulation initialized");
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

  private createWater() {
    console.log("Creating water geometry...");

    // Create geometry with validation
    const waterGeometry = new THREE.PlaneGeometry(this.size, this.size, this.divisions, this.divisions);

    // Validate geometry creation
    if (!waterGeometry.attributes.position) {
      console.error("Failed to create water geometry");
      return;
    }

    // Rotate to horizontal plane
    waterGeometry.rotateX(-Math.PI / 2);

    // Store vertices with validation
    this.waterVertices = waterGeometry.attributes.position.array as Float32Array;

    // Validate vertex array
    if (this.waterVertices.length === 0) {
      console.error("Water vertices array is empty");
      return;
    }

    // Initialize water heights to match terrain with slight offset
    for (let i = 0; i < this.waterVertices.length; i += 3) {
      const terrainHeight = this.vertices[i + 1];
      // Ensure we're not propagating NaN values
      this.waterVertices[i + 1] = isNaN(terrainHeight) ? 0 : terrainHeight + 0.01;
    }

    // Create water material
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

    // Create water mesh
    this.water = new THREE.Mesh(waterGeometry, this.waterMaterial);
    this.water.position.y = 0.01;
    this.water.receiveShadow = true;

    // Initialize arrays for water simulation
    const vertexCount = this.waterVertices.length / 3;
    this.previousWaterHeights = new Float32Array(vertexCount);
    this.waterVelocities = new Float32Array(vertexCount);

    // Initialize previous heights and velocities
    for (let i = 0; i < vertexCount; i++) {
      this.previousWaterHeights[i] = this.waterVertices[i * 3 + 1];
      this.waterVelocities[i] = 0;
    }

    // Compute initial normals
    waterGeometry.computeVertexNormals();

    // Validate bounding sphere before adding to scene
    waterGeometry.computeBoundingSphere();
    if (!waterGeometry.boundingSphere || isNaN(waterGeometry.boundingSphere.radius)) {
      console.error("Invalid water geometry bounding sphere");
      return;
    }

    // Add to scene if valid
    this.scene.add(this.water);
    console.log("Water geometry created successfully");
  }

  private initScene() {
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
  private generateHeight(x: number, z: number): number {
    // Validate inputs
    if (isNaN(x) || isNaN(z)) {
      console.warn(`Invalid input to generateHeight: x=${x}, z=${z}`);
      return 0;
    }

    // Scale down the input coordinates
    const scaledX = (x / this.size) * 10;
    const scaledZ = (z / this.size) * 10;

    let height = 0;
    let amplitude = 4.0;
    let frequency = 0.3;

    // Add validation for scaled coordinates
    if (isNaN(scaledX) || isNaN(scaledZ)) {
      console.warn(`Invalid scaled coordinates: scaledX=${scaledX}, scaledZ=${scaledZ}`);
      return 0;
    }

    for (let o = 0; o < 5; o++) {
      const noiseValue = this.noise.noise3d(scaledX * frequency, scaledZ * frequency, o * 0.5);

      // Validate noise value
      if (isNaN(noiseValue)) {
        console.warn(`Invalid noise value at octave ${o}: ${noiseValue}`);
        continue;
      }

      height += noiseValue * amplitude;
      amplitude *= 0.5;
      frequency *= 2.0;
    }

    // Clamp height to prevent extreme values
    const clampedHeight = Math.max(-50, Math.min(50, height));

    // Final validation
    if (isNaN(clampedHeight)) {
      console.error(`Generated invalid height: ${height}`);
      return 0;
    }

    return clampedHeight;
  }

  private createTerrain() {
    console.log("Starting terrain creation...");

    this.geometry = new THREE.PlaneGeometry(this.size, this.size, this.divisions, this.divisions);
    this.geometry.rotateX(-Math.PI / 2);

    this.vertices = this.geometry.attributes.position.array as Float32Array;
    const vertexCount = this.vertices.length / 3;

    // Validate initial geometry
    if (vertexCount <= 0 || !Number.isInteger(vertexCount)) {
      console.error(`Invalid vertex count: ${vertexCount}`);
      return;
    }

    // Initialize arrays with proper size validation
    this.colors = new Float32Array(vertexCount * 3);
    this.waterMap = new Float32Array(vertexCount);
    this.sedimentMap = new Float32Array(vertexCount);
    this.previousWaterHeights = new Float32Array(vertexCount);
    this.waterVelocities = new Float32Array(vertexCount);

    // Initialize noise with validation
    if (!pseudoRandom) {
      console.error("pseudoRandom is not defined");
      return;
    }
    pseudoRandom.setSeed(101010);
    this.noise = new SimplexNoise(pseudoRandom);

    // Debug counter for invalid vertices
    let invalidVertices = 0;

    // Generate terrain heights with extensive validation
    for (let i = 0; i < this.vertices.length; i += 3) {
      const x = this.vertices[i];
      const z = this.vertices[i + 2];

      // Validate vertex coordinates
      if (isNaN(x) || isNaN(z)) {
        console.error(`Invalid vertex coordinates at index ${i}: x=${x}, z=${z}`);
        invalidVertices++;
        continue;
      }

      // Generate and validate height
      const height = this.generateHeight(x, z);

      if (isNaN(height)) {
        console.error(`Generated invalid height at index ${i}: ${height}`);
        invalidVertices++;
        this.vertices[i + 1] = 0; // Fallback to zero height
      } else {
        this.vertices[i + 1] = height;
      }

      // Update terrain color with validation
      this.updateTerrainColor(i, height);
    }

    // Log validation results
    if (invalidVertices > 0) {
      console.warn(`Found ${invalidVertices} invalid vertices during terrain generation`);
    }

    // Update geometry with validation
    this.geometry.attributes.position.needsUpdate = true;

    // Validate colors before setting attribute
    const colorsValid = this.colors.every((value) => !isNaN(value));
    if (!colorsValid) {
      console.error("Invalid color values detected");
    }

    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));

    // Compute normals and validate bounding sphere
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();

    if (!this.geometry.boundingSphere || isNaN(this.geometry.boundingSphere.radius)) {
      console.error("Invalid bounding sphere computed");
    }

    // Create and validate material
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.8,
      metalness: 0.2,
    });

    // Create mesh and add to scene
    this.terrain = new THREE.Mesh(this.geometry, this.material);
    this.terrain.castShadow = true;
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);

    console.log("Terrain creation completed");
  }
  private updateTerrainColor(index: number, height: number) {
    // Normalize height to 0-1 range for coloring
    const normalizedHeight = (height + 50) / 100; // Assuming height range of -50 to 50

    // Color definitions
    const BEACH = [0.96, 0.87, 0.7];
    const GRASS = [0.27, 0.75, 0.35];
    const ROCK = [0.5, 0.45, 0.35];
    const SNOW = [1.0, 1.0, 1.0];

    let color: number[];

    // Ensure normalizedHeight is within bounds
    const clampedHeight = Math.max(0, Math.min(1, normalizedHeight));

    if (clampedHeight < 0.25) {
      const t = Math.min(Math.max((clampedHeight - 0.15) / 0.1, 0), 1);
      color = this.lerpColor(BEACH, GRASS, t);
    } else if (clampedHeight < 0.5) {
      const t = Math.min(Math.max((clampedHeight - 0.4) / 0.1, 0), 1);
      color = this.lerpColor(GRASS, ROCK, t);
    } else if (clampedHeight < 0.7) {
      const t = Math.min(Math.max((clampedHeight - 0.6) / 0.1, 0), 1);
      color = this.lerpColor(ROCK, SNOW, t);
    } else {
      color = SNOW;
    }

    // Ensure valid color values
    this.colors[index] = Math.max(0, Math.min(1, color[0]));
    this.colors[index + 1] = Math.max(0, Math.min(1, color[1]));
    this.colors[index + 2] = Math.max(0, Math.min(1, color[2]));
  }

  private updateErosion() {
    if (!this.renderer || !this.simulationMaterial || !this.renderTargets) {
      console.error("Required erosion components not initialized");
      return;
    }

    try {
      // Save current renderer state
      const currentRenderTarget = this.renderer.getRenderTarget();
      const currentViewport = this.renderer.getViewport(new THREE.Vector4());

      // Update simulation uniforms
      this.simulationMaterial.uniforms.deltaTime.value = 1.0 / 60.0;
      this.simulationMaterial.uniforms.heightMap.value = this.renderTargets[this.currentRenderTarget].texture;

      // Set viewport to match simulation size
      this.renderer.setViewport(0, 0, this.divisions, this.divisions);

      // Render to next target
      const nextTarget = (this.currentRenderTarget + 1) % 2;

      if (!this.renderTargets[nextTarget]) {
        console.error("Invalid render target");
        return;
      }

      this.renderer.setRenderTarget(this.renderTargets[nextTarget]);

      // Clear the render target
      this.renderer.clear();

      // Render simulation
      this.renderer.render(this.simulationScene, this.simulationCamera);

      // Validate render target content
      const gl = this.renderer.getContext();
      const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (status !== gl.FRAMEBUFFER_COMPLETE) {
        console.error("Framebuffer is not complete:", status);
        return;
      }

      // Read back the results
      const pixels = new Float32Array(this.divisions * this.divisions * 4);
      gl.readPixels(0, 0, this.divisions, this.divisions, gl.RGBA, gl.FLOAT, pixels);

      // Validate pixel data
      if (pixels.some(isNaN)) {
        console.error("NaN values detected in erosion simulation output");
        return;
      }

      // Update terrain geometry
      for (let i = 0; i < this.vertices.length / 3; i++) {
        const height = pixels[i * 4];
        const water = pixels[i * 4 + 1];

        if (!isNaN(height)) {
          this.vertices[i * 3 + 1] = height;
          this.waterMap[i] = water;
        }
      }

      // Swap render targets
      this.currentRenderTarget = nextTarget;

      // Update geometry
      this.updateGeometry();
      this.updateWater();

      // Restore renderer state
      this.renderer.setRenderTarget(currentRenderTarget);
      this.renderer.setViewport(currentViewport);
    } catch (error) {
      console.error("Error in erosion update:", error);
    }
  }

  private updateWater() {
    if (!this.water || !this.waterVertices) {
      console.error("Water mesh not properly initialized");
      return;
    }

    const MIN_VISIBLE_WATER = 0.04;
    const SMOOTHING_RADIUS = 2;
    const SURFACE_TENSION = 0.3;
    const DAMPING = 0.85;
    const TEMPORAL_SMOOTHING = 0.15;
    const MAX_VELOCITY = 0.1;

    // Create temporary array for smoothed heights
    const smoothedWaterHeights = new Float32Array(this.waterMap.length);

    try {
      // First pass: Create smoothed water height map
      for (let z = 0; z < this.divisions; z++) {
        for (let x = 0; x < this.divisions; x++) {
          const index = z * this.divisions + x;
          let totalHeight = 0;
          let weightSum = 0;

          // Sample neighboring vertices
          for (let dz = -SMOOTHING_RADIUS; dz <= SMOOTHING_RADIUS; dz++) {
            for (let dx = -SMOOTHING_RADIUS; dx <= SMOOTHING_RADIUS; dx++) {
              const nx = x + dx;
              const nz = z + dz;

              if (nx >= 0 && nx < this.divisions && nz >= 0 && nz < this.divisions) {
                const nIndex = nz * this.divisions + nx;
                const distance = Math.sqrt(dx * dx + dz * dz);
                const weight = Math.exp((-distance * distance) / (SMOOTHING_RADIUS * SMOOTHING_RADIUS));

                const terrainHeight = this.vertices[nIndex * 3 + 1];
                const waterHeight = this.waterMap[nIndex];

                // Validate heights before using them
                if (!isNaN(terrainHeight) && !isNaN(waterHeight) && waterHeight > MIN_VISIBLE_WATER) {
                  totalHeight += (terrainHeight + waterHeight) * weight;
                  weightSum += weight;
                }
              }
            }
          }

          smoothedWaterHeights[index] = weightSum > 0 ? totalHeight / weightSum : this.vertices[index * 3 + 1];
        }
      }

      // Second pass: Update vertices with validation
      for (let i = 0; i < this.waterVertices.length; i += 3) {
        const index = i / 3;
        const terrainHeight = this.vertices[i + 1];

        if (isNaN(terrainHeight)) {
          console.warn(`Invalid terrain height at index ${index}`);
          continue;
        }

        if (this.waterMap[index] > MIN_VISIBLE_WATER) {
          const rawWaterHeight = terrainHeight + this.waterMap[index];
          const smoothedHeight = smoothedWaterHeights[index];
          const targetHeight = rawWaterHeight * (1 - SURFACE_TENSION) + smoothedHeight * SURFACE_TENSION;

          // Update velocity with validation
          let velocity = this.waterVelocities[index];
          if (!isNaN(this.previousWaterHeights[index])) {
            velocity = (targetHeight - this.previousWaterHeights[index]) * (1 - DAMPING);
            velocity = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, velocity));
          } else {
            velocity = 0;
          }

          this.waterVelocities[index] = velocity;

          // Update height with temporal smoothing
          const newHeight = this.previousWaterHeights[index] + velocity;
          const finalHeight = newHeight * (1 - TEMPORAL_SMOOTHING) + this.previousWaterHeights[index] * TEMPORAL_SMOOTHING;

          // Validate final height before assignment
          if (!isNaN(finalHeight)) {
            this.waterVertices[i + 1] = finalHeight;
            this.previousWaterHeights[index] = finalHeight;
          }
        } else {
          // Reset water vertex to slightly below terrain
          this.waterVertices[i + 1] = terrainHeight - 0.1;
          this.previousWaterHeights[index] = terrainHeight - 0.1;
          this.waterVelocities[index] = 0;
        }
      }

      // Update geometry
      const waterGeometry = this.water.geometry;
      waterGeometry.attributes.position.needsUpdate = true;
      waterGeometry.computeVertexNormals();
      waterGeometry.computeBoundingSphere();

      // Validate final bounding sphere
      if (!waterGeometry.boundingSphere || isNaN(waterGeometry.boundingSphere.radius)) {
        console.error("Invalid water bounding sphere after update");
      }
    } catch (error) {
      console.error("Error in water update:", error);
    }
  }

  private lerpColor(a: number[], b: number[], t: number): number[] {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
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
  animate() {
    requestAnimationFrame(() => this.animate());
    this.updateErosion(); // Replace old erosion update with compute shader version

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
