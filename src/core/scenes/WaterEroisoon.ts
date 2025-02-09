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

  // Erosion parameters
  readonly WATER_RETENTION = 0.8;
  readonly EVAPORATION_RATE = 0.02;
  readonly SEDIMENT_CAPACITY = 0.1;
  readonly EROSION_RATE = 0.05;
  readonly DEPOSITION_RATE = 0.1;
  readonly MIN_SLOPE_FOR_FLOW = 0.01;
  readonly RAINFALL_RATE = 0.05;
  readonly GRAVITY = 9.81;

  constructor() {
    this.initScene();
    this.createTerrain();
    this.initErosion();
    this.createWater();
    this.setupEventListeners();
    this.animate();
  }

  private initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb); // Sky blue background

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 50, 100);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    document.body.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;

    // Add multiple lights for better shadows and ambient lighting
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

    this.noise = new SimplexNoise();
    this.vertices = this.geometry.attributes.position.array as Float32Array;
    const vertexCount = this.vertices.length / 3;
    this.colors = new Float32Array(vertexCount * 3);

    // Generate more interesting terrain using multiple noise octaves
    for (let i = 0; i < this.vertices.length; i += 3) {
      const x = this.vertices[i];
      const z = this.vertices[i + 2];
      let height = 0;
      let amplitude = 5;
      let frequency = 0.03;

      // Add multiple octaves of noise
      for (let o = 0; o < 6; o++) {
        height += this.noise.noise(x * frequency, z * frequency) * amplitude;
        amplitude *= 0.5;
        frequency *= 2;
      }

      // Add some ridges and valleys
      const ridge = Math.abs(this.noise.noise(x * 0.02, z * 0.02));
      height += ridge * ridge * 5;

      this.vertices[i + 1] = height;

      // Enhanced terrain coloring based on height and slope
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

  private updateTerrainColor(index: number, height: number) {
    const normalizedHeight = (height + 10) / 20;

    // Define color bands based on height
    if (normalizedHeight < 0.2) {
      // Beach/sand
      this.colors[index] = 0.76;
      this.colors[index + 1] = 0.7;
      this.colors[index + 2] = 0.5;
    } else if (normalizedHeight < 0.4) {
      // Grass
      this.colors[index] = 0.2;
      this.colors[index + 1] = 0.6;
      this.colors[index + 2] = 0.2;
    } else if (normalizedHeight < 0.7) {
      // Forest
      this.colors[index] = 0.1;
      this.colors[index + 1] = 0.4;
      this.colors[index + 2] = 0.1;
    } else if (normalizedHeight < 0.9) {
      // Rock
      this.colors[index] = 0.5;
      this.colors[index + 1] = 0.5;
      this.colors[index + 2] = 0.5;
    } else {
      // Snow
      this.colors[index] = 0.95;
      this.colors[index + 1] = 0.95;
      this.colors[index + 2] = 0.95;
    }
  }

  private initErosion() {
    const vertexCount = this.vertices.length / 3;
    this.waterMap = new Float32Array(vertexCount).fill(0);
    this.sedimentMap = new Float32Array(vertexCount).fill(0);
    this.velocityMap = new Array(vertexCount).fill(null).map(() => new THREE.Vector2());

    // Initialize water sources in higher elevation areas
    for (let i = 0; i < vertexCount; i++) {
      const height = this.vertices[i * 3 + 1];
      if (height > 5) {
        this.waterMap[i] = Math.random() * this.RAINFALL_RATE;
      }
    }
  }

  private createWater() {
    const waterGeometry = new THREE.PlaneGeometry(this.size, this.size, this.divisions, this.divisions);
    waterGeometry.rotateX(-Math.PI / 2);
    this.waterVertices = waterGeometry.attributes.position.array as Float32Array;

    this.waterMaterial = new THREE.MeshStandardMaterial({
      color: 0x3366ff,
      transparent: true,
      opacity: 0.6,
      roughness: 0.2,
      metalness: 0.8,
    });

    this.water = new THREE.Mesh(waterGeometry, this.waterMaterial);
    this.water.position.y = 0.1; // Slight offset to prevent z-fighting
    this.scene.add(this.water);
  }

  private applyErosion() {
    const tempWaterMap = new Float32Array(this.waterMap);
    const tempSedimentMap = new Float32Array(this.sedimentMap);

    for (let i = 0; i < this.vertices.length; i += 3) {
      const index = i / 3;
      if (this.waterMap[index] > 0) {
        this.processCell(index, tempWaterMap, tempSedimentMap);
      }
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

    // Calculate water flow
    for (const neighbor of neighbors) {
      if (neighbor === null) continue;

      const neighborHeight = this.vertices[neighbor * 3 + 1];
      const heightDiff = currentHeight + this.waterMap[index] - (neighborHeight + this.waterMap[neighbor]);

      if (heightDiff > this.MIN_SLOPE_FOR_FLOW) {
        // Calculate water flow based on height difference
        const flow = Math.min(this.waterMap[index], heightDiff * this.WATER_RETENTION * this.getTimeStep());

        // Update water levels
        tempWaterMap[index] -= flow;
        tempWaterMap[neighbor] += flow;

        // Calculate erosion and deposition
        const velocity = Math.sqrt(2 * this.GRAVITY * heightDiff);
        const sedimentCapacity = this.SEDIMENT_CAPACITY * velocity;

        if (this.sedimentMap[index] < sedimentCapacity) {
          // Erosion
          const erosion = this.EROSION_RATE * (sedimentCapacity - this.sedimentMap[index]);
          this.vertices[index * 3 + 1] -= erosion;
          tempSedimentMap[index] += erosion;
        } else {
          // Deposition
          const deposition = this.DEPOSITION_RATE * (this.sedimentMap[index] - sedimentCapacity);
          this.vertices[index * 3 + 1] += deposition;
          tempSedimentMap[index] -= deposition;
        }

        // Transport sediment with water flow
        const sedimentFlow = flow * (this.sedimentMap[index] / this.waterMap[index]);
        tempSedimentMap[index] -= sedimentFlow;
        tempSedimentMap[neighbor] += sedimentFlow;
      }
    }

    // Apply evaporation
    tempWaterMap[index] *= 1 - this.EVAPORATION_RATE;

    // Add rainfall
    if (Math.random() < this.RAINFALL_RATE) {
      tempWaterMap[index] += this.RAINFALL_RATE;
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
      if (this.waterMap[index] > 0) {
        this.colors[i] *= 0.8;
        this.colors[i + 1] *= 0.8;
        this.colors[i + 2] *= 0.9;
      }
    }

    this.geometry.attributes.color.needsUpdate = true;
  }

  private updateWater() {
    // Update water mesh vertices based on terrain and water height
    for (let i = 0; i < this.waterVertices.length; i += 3) {
      const index = i / 3;
      const terrainHeight = this.vertices[i + 1];
      const waterHeight = this.waterMap[index];
      this.waterVertices[i + 1] = terrainHeight + waterHeight;
    }

    this.water.geometry.attributes.position.needsUpdate = true;
    this.water.geometry.computeVertexNormals();
  }

  private getTimeStep(): number {
    return 1 / 60; // Assuming 60 FPS
  }

  private setupEventListeners() {
    // Add rain on click
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

        // Add water to clicked area and surrounding vertices
        vertices.forEach((vertexIndex) => {
          this.waterMap[vertexIndex] += 1;
        });
      }
    });

    // Handle window resize
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
