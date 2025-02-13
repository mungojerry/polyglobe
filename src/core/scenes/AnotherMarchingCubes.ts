import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise";
import { PseudoRandomNumberGenerator } from "../utils/PseudoRandom";
import { edgeTable, triTable } from "./MCDefs";

// Add these constants at class/file level
const GROUND_THRESHOLD = 2;
const TOP_THRESHOLD = 0.95;
const GROUND_VALUE = 0.9;
const AIR_VALUE = 0.1;
const MIN_VALUE = 0.001;
const MAX_VALUE = 0.999;
const VARIATION_SCALE = 0.3;
const VARIATION_STRENGTH = 0.2;
const FALLOFF_POWER = 1.5;

const INITIAL_AMPLITUDE = 0.5;
const INITIAL_FREQUENCY = 0.4;
const FREQUENCY_MULTIPLIER = 2.0;
const NOISE_PRECISION = 100;
// Cache chunk key strings
const getChunkKey = (() => {
  const keyCache = new Map<string, string>();
  return (x: number, z: number): string => {
    const key = `${x},${z}`;
    if (!keyCache.has(key)) {
      keyCache.set(key, key);
    }
    return keyCache.get(key)!;
  };
})();

// Pre-compute cube corners offsets
const CUBE_CORNER_OFFSETS = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 0, 1],
  [1, 0, 1],
  [0, 1, 0],
  [1, 1, 0],
  [0, 1, 1],
  [1, 1, 1],
].map(([x, y, z]) => new THREE.Vector3(x, y, z));

// Adjust epsilon for different checks
const DEGENERATE_EPSILON = 1e-10; // For degenerate triangle checks
const INTERPOLATION_EPSILON = 1e-7; // For interpolation calculations
const POSITION_EPSILON = 1e-6; // For position comparisons
function visualizeScalarFieldSlice(field: number[][][], yIndex: number): void {
  // Create a canvas that's as big as the X-Z plane of the scalar field
  const width = field.length;
  const height = field[0][0]?.length || 0;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.style.position = "absolute";
  canvas.style.top = "0";
  canvas.style.left = "0";
  canvas.style.zIndex = "100";
  canvas.style.width = "256px";
  canvas.style.height = "256px";

  canvas.style.border = "1px solid black ";
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    console.error("Could not get canvas context.");
    return;
  }

  // Create an image data object to manipulate pixel values
  const imageData = ctx.createImageData(width, height);

  // Loop over the X-Z plane at the specified y-index
  for (let x = 0; x < width; x++) {
    for (let z = 0; z < height; z++) {
      // Clamp yIndex within bounds
      const y = Math.min(Math.max(yIndex, 0), field[x].length - 1);
      let value = field[x][y][z];
      // Normalize value to [0, 255] for grayscale (adjust normalization as needed)
      const grayscale = Math.floor(255 * Math.min(1, Math.max(0, value)));

      const index = (x + z * width) * 4;
      imageData.data[index] = grayscale; // red
      imageData.data[index + 1] = grayscale; // green
      imageData.data[index + 2] = grayscale; // blue
      imageData.data[index + 3] = 255; // alpha
    }
  }

  ctx.putImageData(imageData, 0, 0);
}
const EPSILON = 1e-5;

type Biome = {
  name: string;
  color: THREE.Color;
  temperatureRange: [number, number];
  humidityRange: [number, number];
  terrainScale: number;
  terrainHeight: number;
};
const BIOMES: Biome[] = [
  {
    name: "plains",
    color: new THREE.Color(0x91b165), // Softer, more natural green
    temperatureRange: [0.3, 0.6],
    humidityRange: [0.4, 0.7],
    terrainScale: 0.03,
    terrainHeight: 16,
  },
  {
    name: "desert",
    color: new THREE.Color(0xd6c087), // Warmer, sandy color
    temperatureRange: [0.7, 1.0],
    humidityRange: [0.0, 0.3],
    terrainScale: 0.02,
    terrainHeight: 12,
  },
  {
    name: "mountain",
    color: new THREE.Color(0x9b928a), // Warmer grey for rocks
    temperatureRange: [0.0, 0.3],
    humidityRange: [0.0, 0.4],
    terrainScale: 0.04,
    terrainHeight: 28,
  },
  {
    name: "forest",
    color: new THREE.Color(0x4a6b3d), // Rich forest green
    temperatureRange: [0.4, 0.7],
    humidityRange: [0.6, 1.0],
    terrainScale: 0.04,
    terrainHeight: 18,
  },
];

const DEFAULT_BIOME: Biome = BIOMES[0];

interface TerrainChunk {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  scalarField: number[][][];
}

// Add these new constants at the top
const VERTEX_POOL_SIZE = 1000000;
const CHUNK_POOL_SIZE = 100;
const MAX_CHUNKS = 100;

interface WorkerMessage {
  type: string;
  chunkX: number;
  chunkZ: number;
  field: Float32Array;
}

// Add these new interfaces at the top with other interfaces
interface WorkerQueueItem {
  chunkX: number;
  chunkZ: number;
  resolve: (field: Float32Array) => void;
  reject: (error: any) => void;
}

export class InfiniteLandscape {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  light: THREE.DirectionalLight;
  private material: THREE.MeshPhongMaterial;
  private simplex: SimplexNoise;
  private gridSize = 32; // Increased for better resolution
  private cubeSize = 1;
  private isoLevel = 0.5; // Slightly adjusted for better surface generation
  private chunkOverlap = 8; // Increased overlap
  private padding = 4; // New: explicit padding for field values
  private boundaryPadding = 2; // New: explicit boundary padding
  private surfaceThickness = 0.1; // New: control surface thickness
  private raycaster = new THREE.Raycaster();
  private temperatureNoise: SimplexNoise;
  private humidityNoise: SimplexNoise;

  private chunks: Map<string, TerrainChunk> = new Map();
  private viewDistance = 3; // Number of chunks visible in each direction
  private currentCenterChunk: THREE.Vector2 = new THREE.Vector2();

  // Add new properties for optimization
  private readonly geometryPool: THREE.BufferGeometry[] = [];
  private readonly meshPool: THREE.Mesh[] = [];
  private frameCount = 0;
  private currentChunk = new THREE.Vector2();

  // Pre-allocate arrays for geometry generation
  private readonly positions: number[] = [];
  private readonly indices: number[] = [];
  private readonly normals: number[] = [];
  private readonly colors: number[] = [];

  private frustum = new THREE.Frustum();
  private frustumMatrix = new THREE.Matrix4();

  // Add these new properties
  private readonly vertexPool: Float32Array;
  private vertexPoolIndex = 0;
  private readonly tempVector = new THREE.Vector3();
  private readonly tempVector2 = new THREE.Vector3();
  private readonly tempColor = new THREE.Color();
  private readonly workingMatrix = new THREE.Matrix4();

  // Add these new properties
  private readonly workers: Worker[] = [];
  private readonly workerPool: Worker[] = [];
  private readonly pendingChunks = new Map<
    string,
    {
      resolve: (field: Float32Array) => void;
      reject: (error: any) => void;
    }
  >();

  // Add these new properties
  private readonly workerQueue: WorkerQueueItem[] = [];
  private readonly busyWorkers = new Set<Worker>();

  // Modify the constructor to include error handling for worker creation
  constructor() {
    console.log(edgeTable);
    console.log(triTable);

    // Check some known cases
    console.log("Case 1:", triTable[1]); // Should have valid indices and end with -1
    console.log("Case 3:", triTable[3]);
    console.log("Case 255:", triTable[255]); // Should be empty case (all vertices inside)
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 32, 64);
    this.camera.lookAt(0, 0, 0);

    // Optimize renderer settings
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: "high-performance",
      precision: "mediump",
    });
    this.renderer.setPixelRatio(1);
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

    const ambientLight = new THREE.AmbientLight(0x404040, 0.3);
    this.scene.add(ambientLight);

    const hemisphereLight = new THREE.HemisphereLight(0xffffbb, 0x080820, 0.5);
    this.scene.add(hemisphereLight);

    this.material = new THREE.MeshPhongMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      flatShading: false,
      wireframe: false,
      color: 0xffffff,
    });

    const groundGeometry = new THREE.PlaneGeometry(1000, 1000);
    const groundMaterial = new THREE.MeshBasicMaterial({
      color: 0xff00ff,
      side: THREE.DoubleSide,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = Math.PI / 2;
    ground.position.y = -10;
    this.scene.add(ground);
    this.setupEventListeners();
    this.simplex = new SimplexNoise(new PseudoRandomNumberGenerator(2343));
    this.temperatureNoise = new SimplexNoise(new PseudoRandomNumberGenerator(234443));
    this.humidityNoise = new SimplexNoise(new PseudoRandomNumberGenerator(234245));
    this.currentCenterChunk = this.getChunkCoordinates(this.camera.position);
    this.updateChunks(this.currentCenterChunk.x, this.currentCenterChunk.y);

    // Initialize vertex pool
    this.vertexPool = new Float32Array(VERTEX_POOL_SIZE);

    // Pre-allocate geometry and mesh pools
    for (let i = 0; i < CHUNK_POOL_SIZE; i++) {
      this.geometryPool.push(new THREE.BufferGeometry());
      this.meshPool.push(new THREE.Mesh(new THREE.BufferGeometry(), this.material));
    }

    // Initialize worker pool with error handling
    const workerCount = Math.max(2, navigator.hardwareConcurrency || 4);
    for (let i = 0; i < workerCount; i++) {
      try {
        const worker = new Worker(new URL("../workers/TerrainWorker.ts", import.meta.url), { type: "module" });

        worker.onmessage = this.handleWorkerMessage.bind(this);
        worker.onerror = (error) => {
          console.error("Worker error:", error);
          // Remove failed worker from busy set and try to process next item
          this.busyWorkers.delete(worker);
          this.processNextQueueItem();
        };

        this.workers.push(worker);
        this.workerPool.push(worker);
      } catch (error) {
        console.error("Failed to create worker:", error);
      }
    }

    // Ensure at least one worker was created
    if (this.workers.length === 0) {
      throw new Error("Failed to create any workers");
    }

    this.animate();
  }

  // Modify the worker management methods
  private handleWorkerMessage(e: MessageEvent<WorkerMessage>) {
    if (e.data.type === "terrainGenerated") {
      const { chunkX, chunkZ, field } = e.data;
      const key = getChunkKey(chunkX, chunkZ);
      const pending = this.pendingChunks.get(key);

      if (pending) {
        pending.resolve(field);
        this.pendingChunks.delete(key);

        // Return worker to pool and process next item in queue
        const worker = e.target as Worker;
        this.busyWorkers.delete(worker);
        this.workerPool.push(worker);
        this.processNextQueueItem();
      }
    }
  }

  private processNextQueueItem(): void {
    if (this.workerQueue.length === 0) return;
    if (this.workerPool.length === 0) return;

    const item = this.workerQueue.shift()!;
    const worker = this.workerPool.pop()!;
    this.busyWorkers.add(worker);

    worker.postMessage({
      type: "generateTerrain",
      chunkX: item.chunkX,
      chunkZ: item.chunkZ,
      gridSize: this.gridSize,
      padding: this.padding,
      seed: 2343,
    });

    const key = getChunkKey(item.chunkX, item.chunkZ);
    this.pendingChunks.set(key, {
      resolve: item.resolve,
      reject: item.reject,
    });
  }

  private async requestTerrainGeneration(chunkX: number, chunkZ: number): Promise<Float32Array> {
    return new Promise((resolve, reject) => {
      // Add request to queue
      this.workerQueue.push({
        chunkX,
        chunkZ,
        resolve,
        reject,
      });

      // Try to process queue
      this.processNextQueueItem();
    });
  }

  private getChunkCoordinates(position: THREE.Vector3): THREE.Vector2 {
    // Ensure proper chunk alignment with padding
    const effectiveSize = (this.gridSize - this.chunkOverlap - this.boundaryPadding) * this.cubeSize;
    const chunkX = Math.floor((position.x + this.boundaryPadding) / effectiveSize);
    const chunkZ = Math.floor((position.z + this.boundaryPadding) / effectiveSize);
    return new THREE.Vector2(chunkX, chunkZ);
  }

  private async updateChunks(cameraChunkX: number, cameraChunkZ: number): Promise<void> {
    const chunksToRemove = new Set(this.chunks.keys());
    const chunkPromises: Promise<TerrainChunk>[] = [];
    const newChunkKeys = new Set<string>();

    // First, identify chunks to create and remove
    for (let x = cameraChunkX - this.viewDistance; x <= cameraChunkX + this.viewDistance; x++) {
      for (let z = cameraChunkZ - this.viewDistance; z <= cameraChunkZ + this.viewDistance; z++) {
        const key = getChunkKey(x, z);
        chunksToRemove.delete(key);
        newChunkKeys.add(key);

        if (!this.chunks.has(key)) {
          chunkPromises.push(this.createChunk(x, z));
        }
      }
    }

    try {
      // Wait for all new chunks to be created
      const newChunks = await Promise.all(chunkPromises);

      // Add new chunks
      newChunks.forEach((chunk) => {
        if (chunk && chunk.mesh) {
          const key = getChunkKey(
            Math.floor(chunk.position.x / ((this.gridSize - this.chunkOverlap) * this.cubeSize)),
            Math.floor(chunk.position.z / ((this.gridSize - this.chunkOverlap) * this.cubeSize))
          );
          this.chunks.set(key, chunk);
          this.scene.add(chunk.mesh);
        }
      });

      // Remove old chunks
      for (const key of chunksToRemove) {
        const chunk = this.chunks.get(key);
        if (chunk && chunk.mesh) {
          this.scene.remove(chunk.mesh);
          chunk.mesh.geometry.dispose();
          this.geometryPool.push(chunk.mesh.geometry);
          this.meshPool.push(chunk.mesh);
          this.chunks.delete(key);
        }
      }
    } catch (error) {
      console.error("Error updating chunks:", error);
    }
  }

  private async createChunk(chunkX: number, chunkZ: number): Promise<TerrainChunk> {
    const geometry = this.geometryPool.pop() || new THREE.BufferGeometry();
    const mesh = this.meshPool.pop() || new THREE.Mesh(geometry, this.material);

    // Adjust chunk positioning to account for overlap
    const effectiveSize = (this.gridSize - this.chunkOverlap) * this.cubeSize;
    const position = new THREE.Vector3(chunkX * effectiveSize, 0, chunkZ * effectiveSize);

    try {
      const scalarField = await this.createScalarField(chunkX, chunkZ);
      this.generateChunkGeometry(geometry, scalarField, position);

      // Add validation for degenerate geometry
      if (geometry.attributes.position.count === 0) {
        console.warn(`Empty geometry generated at chunk ${chunkX},${chunkZ}`);
        // Generate a small placeholder geometry to avoid rendering issues
        return this.createPlaceholderChunk(position);
      }

      mesh.position.copy(position);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;

      const chunk: TerrainChunk = { mesh, position, scalarField };
      this.chunks.set(getChunkKey(chunkX, chunkZ), chunk);
      this.scene.add(mesh);

      // Add grid visualization
      const gridHelper = this.createGridVisualizer(position);
      this.scene.add(gridHelper);

      return chunk;
    } catch (error) {
      console.error("Failed to create chunk:", error);
      return this.createPlaceholderChunk(position);
    }
  }

  private removeChunk(chunkX: number, chunkZ: number): void {
    const key = getChunkKey(chunkX, chunkZ);
    const chunk = this.chunks.get(key);
    if (chunk) {
      // Remove both the mesh and its grid helper
      const children = this.scene.children.filter((child) => child.position.equals(chunk.mesh.position) && child instanceof THREE.LineSegments);
      children.forEach((child) => {
        this.scene.remove(child);
        if (child instanceof THREE.LineSegments) {
          child.geometry.dispose();
          child.material.dispose();
        }
      });

      this.scene.remove(chunk.mesh);
      chunk.mesh.geometry.dispose();
      this.chunks.delete(key);
    }
  }

  private createGridVisualizer(position: THREE.Vector3): THREE.LineSegments {
    const size = this.gridSize * this.cubeSize;
    const geometry = new THREE.BoxGeometry(size, size, size);
    // Convert BoxGeometry to wireframe
    const edges = new THREE.EdgesGeometry(geometry);
    const material = new THREE.LineBasicMaterial({
      color: 0xff0000, // Red color for visibility
      linewidth: 1,
    });
    const box = new THREE.LineSegments(edges, material);

    // Adjust position to align with chunk
    box.position.copy(position);
    // Center the box on the chunk
    box.position.x += size / 2;
    box.position.y += size / 2;
    box.position.z += size / 2;

    return box;
  }

  private createPlaceholderChunk(position: THREE.Vector3): TerrainChunk {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0.5, 0.5, 0.5);
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.position.copy(position);
    mesh.visible = false; // Hide placeholder geometry

    // Create empty scalar field
    const scalarField: number[][][] = Array(this.gridSize)
      .fill(0)
      .map(() =>
        Array(this.gridSize)
          .fill(0)
          .map(() => Array(this.gridSize).fill(1))
      );

    return { mesh, position, scalarField };
  }

  private async createScalarField(chunkX: number, chunkZ: number): Promise<number[][][]> {
    try {
      const fieldData = await this.requestTerrainGeneration(chunkX, chunkZ);

      // Convert the flat array back to 3D array
      const totalSize = this.gridSize + this.padding * 2;
      const field: number[][][] = Array(totalSize)
        .fill(0)
        .map(() =>
          Array(totalSize)
            .fill(0)
            .map(() => Array(totalSize).fill(0))
        );

      for (let x = 0; x < totalSize; x++) {
        for (let y = 0; y < totalSize; y++) {
          for (let z = 0; z < totalSize; z++) {
            const index = x * totalSize * totalSize + y * totalSize + z;
            field[x][y][z] = fieldData[index];
          }
        }
      }

      return field;
    } catch (error) {
      console.error("Failed to generate terrain:", error);
      return this.createFallbackScalarField();
    }
  }

  // Add a fallback method in case worker generation fails
  private createFallbackScalarField(): number[][][] {
    const totalSize = this.gridSize + this.padding * 2;
    return Array(totalSize)
      .fill(0)
      .map(() =>
        Array(totalSize)
          .fill(0)
          .map(() => Array(totalSize).fill(this.isoLevel + 0.1))
      );
  }

  // Compute per-vertex colors
  getColor(chunkPosition: THREE.Vector3, vertex: THREE.Vector3): THREE.Color {
    const worldX = chunkPosition.x + vertex.x;
    const worldZ = chunkPosition.z + vertex.z;
    const temperature = this.getTemperature(worldX, worldZ);
    const humidity = this.getHumidity(worldX, worldZ);
    return this.getBiomeColor(temperature, humidity, vertex.y);
  }

  private edgeToVertex = [
    [0, 1], // edge 0: connects vertex 0 to vertex 1
    [1, 3], // edge 1: connects vertex 1 to vertex 3
    [2, 3], // edge 2: connects vertex 2 to vertex 3
    [0, 2], // edge 3: connects vertex 0 to vertex 2
    [4, 5], // edge 4: connects vertex 4 to vertex 5
    [5, 7], // edge 5: connects vertex 5 to vertex 7
    [6, 7], // edge 6: connects vertex 6 to vertex 7
    [4, 6], // edge 7: connects vertex 4 to vertex 6
    [0, 4], // edge 8: connects vertex 0 to vertex 4
    [1, 5], // edge 9: connects vertex 1 to vertex 5
    [3, 7], // edge 10: connects vertex 3 to vertex 7
    [2, 6], // edge 11: connects vertex 2 to vertex 6
  ];

  private generateChunkGeometry(geometry: THREE.BufferGeometry, scalarField: number[][][], chunkPosition: THREE.Vector3): void {
    this.positions.length = 0;
    this.indices.length = 0;
    this.normals.length = 0;
    this.colors.length = 0;

    // Account for padding in iteration bounds
    const startIdx = this.padding;
    const endIdx = this.gridSize + this.padding - 1;

    for (let x = startIdx; x < endIdx; x++) {
      for (let y = startIdx; y < endIdx; y++) {
        for (let z = startIdx; z < endIdx; z++) {
          const corners = this.getCubeCorners(x - this.padding, y - this.padding, z - this.padding);

          // Ensure all required values exist
          if (!this.hasValidFieldValues(scalarField, x, y, z)) continue;

          const values = this.getCubeValues(scalarField, x, y, z);
          let cubeIndex = this.computeCubeIndex(values);

          if (Number(edgeTable[cubeIndex]) === 0) continue;

          const triangles = triTable[cubeIndex];
          if (!triangles || triangles.length === 0) continue;

          this.processTriangles(triangles, corners, values, this.positions, this.indices, this.colors, this.normals, chunkPosition);
        }
      }
    }

    this.createGeometry(geometry, this.positions, this.indices, this.normals, this.colors);
  }

  private hasValidFieldValues(field: number[][][], x: number, y: number, z: number): boolean {
    // Check a larger neighborhood around the point
    for (let dx = -1; dx <= 2; dx++) {
      for (let dy = -1; dy <= 2; dy++) {
        for (let dz = -1; dz <= 2; dz++) {
          if (!field[x + dx]?.[y + dy]?.[z + dz]) {
            return false;
          }
          const value = field[x + dx][y + dy][z + dz];
          if (typeof value !== "number" || !Number.isFinite(value)) {
            return false;
          }
        }
      }
    }
    return true;
  }

  private getCubeValues(field: number[][][], x: number, y: number, z: number): number[] {
    return [
      field[x][y][z],
      field[x + 1][y][z],
      field[x][y][z + 1],
      field[x + 1][y][z + 1],
      field[x][y + 1][z],
      field[x + 1][y + 1][z],
      field[x][y + 1][z + 1],
      field[x + 1][y + 1][z + 1],
    ];
  }

  private computeCubeIndex(values: number[]): number {
    let cubeIndex = 0;
    for (let i = 0; i < 8; i++) {
      if (values[i] < this.isoLevel) {
        cubeIndex |= 1 << i;
      }
    }
    return cubeIndex;
  }

  private createGeometry(geometry: THREE.BufferGeometry, positions: number[], indices: number[], normals: number[], colors: number[]): void {
    geometry.setIndex(indices);
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

    // Ensure normals are computed correctly
    geometry.computeVertexNormals();
  }

  private processTriangles(
    triangles: number[],
    corners: THREE.Vector3[],
    values: number[],
    positions: number[],
    indices: number[],
    colors: number[],
    normals: number[],
    chunkPosition: THREE.Vector3
  ): void {
    for (let i = 0; i < triangles.length - 1; i += 3) {
      const vertices = [];
      let allValid = true;

      // Generate all vertices first and validate
      for (let j = 0; j < 3; j++) {
        const edgeIndex = triangles[i + j];
        const [v1Index, v2Index] = this.edgeToVertex[edgeIndex];
        const vertex = this.interpolateVertex(corners[v1Index], corners[v2Index], values[v1Index], values[v2Index]);

        // Check if vertex is valid
        if (!Number.isFinite(vertex.x) || !Number.isFinite(vertex.y) || !Number.isFinite(vertex.z)) {
          allValid = false;
          break;
        }
        vertices.push(vertex);
      }

      // Only add triangle if all vertices are valid and triangle is not degenerate
      if (allValid && this.isValidTriangle(vertices[0], vertices[1], vertices[2])) {
        this.addVertex(positions, indices, colors, normals, chunkPosition, vertices[0], vertices[1], vertices[2]);
      }
    }
  }

  private generateNoiseValue(x: number, y: number, z: number): number {
    // Early exits for fixed values
    if (y < GROUND_THRESHOLD) {
      return GROUND_VALUE;
    }

    const normalizedY = y / (this.gridSize - 1);
    if (normalizedY > TOP_THRESHOLD) {
      return AIR_VALUE;
    }

    // Get biome data once
    const temperature = this.getTemperature(x, z);
    const biome = this.getBiome(temperature, this.getHumidity(x, z));
    const scale = biome.terrainScale;

    // Calculate height falloff
    const heightFalloff = 1.0 - normalizedY ** FALLOFF_POWER;
    if (heightFalloff <= 0) {
      return AIR_VALUE;
    }

    // Generate base noise
    const noiseValue = this.generateRidgedNoise(x, y, z, scale, 4, 0.5);

    // Add large-scale variation
    const largeScale = scale * VARIATION_SCALE;
    const baseVariation = this.simplex.noise3d(x * largeScale, 0, z * largeScale);

    // Combine noise values
    const combinedNoise = (noiseValue + baseVariation * VARIATION_STRENGTH) * heightFalloff;

    // Clamp value
    const value = Math.max(MIN_VALUE, Math.min(MAX_VALUE, combinedNoise));
    const surfaceDist = Math.abs(value - this.isoLevel);

    // Adjust surface values
    if (surfaceDist < this.surfaceThickness) {
      return value > this.isoLevel ? this.isoLevel + this.surfaceThickness : this.isoLevel - this.surfaceThickness;
    }

    return value;
  }

  private getCubeCorners(x: number, y: number, z: number): THREE.Vector3[] {
    return CUBE_CORNER_OFFSETS.map(
      (offset) => new THREE.Vector3((x + offset.x) * this.cubeSize, (y + offset.y) * this.cubeSize, (z + offset.z) * this.cubeSize)
    );
  }

  // Add these constants at class/file level

  // Optional: Add noise cache if memory permits
  private noiseCache = new Map<string, number>();

  private getCacheKey(x: number, y: number, z: number, scale: number): string {
    return `${~~(x * scale * NOISE_PRECISION)},${~~(y * scale * NOISE_PRECISION)},${~~(z * scale * NOISE_PRECISION)}`;
  }

  private generateRidgedNoise(x: number, y: number, z: number, scale: number, octaves: number, persistence: number): number {
    // Check cache first
    const key = this.getCacheKey(x, y, z, scale);
    const cached = this.noiseCache.get(key);
    if (cached !== undefined) return cached;

    let noiseValue = 0;
    let amplitude = INITIAL_AMPLITUDE;
    let frequency = INITIAL_FREQUENCY;
    const scaledX = x * scale;
    const scaledY = y * scale;
    const scaledZ = z * scale;

    // Pre-calculate max value instead of accumulating
    const maxValue = (amplitude * (1 - Math.pow(persistence, octaves))) / (1 - persistence);

    for (let i = 0; i < octaves; i++) {
      // Combine scaling calculations
      const sx = scaledX * frequency;
      const sy = scaledY * frequency;
      const sz = scaledZ * frequency;

      // Get noise value and calculate ridge in one step
      const ridge = 1 - Math.abs(this.simplex.noise3d(sx, sy, sz));

      // Square ridge and accumulate with amplitude
      noiseValue += ridge * ridge * amplitude;

      // Update for next octave
      amplitude *= persistence;
      frequency *= FREQUENCY_MULTIPLIER;
    }

    const result = noiseValue / maxValue;

    // Cache the result
    if (this.noiseCache.size < 10000) {
      this.noiseCache.set(key, result);
    }

    return result;
  }

  // Add cache management method
  private clearNoiseCache(): void {
    if (this.noiseCache.size > 9000) {
      this.noiseCache.clear();
    }
  }
  private getTemperature(x: number, z: number): number {
    const scale = 0.02; // Reduced scale for smoother transitions
    return (this.temperatureNoise.noise3d(x * scale, 0, z * scale) + 1) * 0.5;
  }

  private getHumidity(x: number, z: number): number {
    const scale = 0.015; // Even smoother humidity transitions
    return (this.humidityNoise.noise3d(x * scale, 0, z * scale) + 1) * 0.5;
  }

  private getBiome(temperature: number, humidity: number): Biome {
    for (const biome of BIOMES) {
      if (
        temperature >= biome.temperatureRange[0] &&
        temperature <= biome.temperatureRange[1] &&
        humidity >= biome.humidityRange[0] &&
        humidity <= biome.humidityRange[1]
      ) {
        return biome;
      }
    }
    return DEFAULT_BIOME;
  }

  private getBiomeColor(temperature: number, humidity: number, height: number): THREE.Color {
    // Calculate biome influence factors for smoother transitions
    let totalWeight = 0;
    const biomeWeights = BIOMES.map((b) => {
      const tCenter = (b.temperatureRange[0] + b.temperatureRange[1]) / 2;
      const hCenter = (b.humidityRange[0] + b.humidityRange[1]) / 2;

      // Calculate distance from current point to biome center
      const tDist = 1 - Math.min(1, Math.abs(temperature - tCenter) / 0.3);
      const hDist = 1 - Math.min(1, Math.abs(humidity - hCenter) / 0.3);

      // Combined weight with smooth falloff
      const weight = Math.max(0.0001, Math.pow(tDist * hDist, 2)); // Ensure weight is never zero
      totalWeight += weight;
      return { biome: b, weight };
    });

    // Blend colors based on weights
    const blendedColor = new THREE.Color(0, 0, 0);
    biomeWeights.forEach(({ biome: b, weight }) => {
      const normalizedWeight = weight / totalWeight;
      const biomeColor = b.color.clone();
      blendedColor.add(biomeColor.multiplyScalar(normalizedWeight));
    });

    // Apply height-based shading and variations
    const heightFactor = Math.min(1, Math.max(0, height / 32)); // Clamp height factor between 0 and 1

    // Add slight color variations based on height
    if (heightFactor > 0.7) {
      // Mountain peaks
      blendedColor.lerp(new THREE.Color(0xc0c0c0), Math.min(1, (heightFactor - 0.7) / 0.3));
    } else if (heightFactor < 0.2) {
      // Lower areas
      blendedColor.lerp(new THREE.Color(0x385321), Math.min(1, 0.3 * (1 - heightFactor / 0.2)));
    }

    // Apply ambient occlusion effect for valleys with clamping
    const valleyDarkening = Math.min(1, Math.max(0.3, 0.7 + 0.3 * heightFactor));
    blendedColor.multiplyScalar(valleyDarkening);

    // Ensure color components stay in valid range
    blendedColor.r = Math.min(1, Math.max(0.01, blendedColor.r));
    blendedColor.g = Math.min(1, Math.max(0.01, blendedColor.g));
    blendedColor.b = Math.min(1, Math.max(0.01, blendedColor.b));

    return blendedColor;
  }

  private interpolateVertex(v1: THREE.Vector3, v2: THREE.Vector3, val1: number, val2: number): THREE.Vector3 {
    const BIAS = 1e-10;
    const d1 = val1 - this.isoLevel;
    const d2 = val2 - this.isoLevel;

    // If values are on opposite sides of the surface, use midpoint
    if (d1 * d2 < 0) {
      // Calculate precise interpolation
      const t = d1 / (d1 - d2);
      return new THREE.Vector3(v1.x + (v2.x - v1.x) * t, v1.y + (v2.y - v1.y) * t, v1.z + (v2.z - v1.z) * t);
    }

    // If both points are very close to surface
    if (Math.abs(d1) < INTERPOLATION_EPSILON || Math.abs(d2) < INTERPOLATION_EPSILON) {
      return new THREE.Vector3().addVectors(v1, v2).multiplyScalar(0.5);
    }

    // Default to linear interpolation
    const t = Math.max(0, Math.min(1, (this.isoLevel - val1) / (val2 - val1 + BIAS)));
    return new THREE.Vector3(v1.x + (v2.x - v1.x) * t, v1.y + (v2.y - v1.y) * t, v1.z + (v2.z - v1.z) * t);
  }

  // More sophisticated triangle validation
  private isValidTriangle(v1: THREE.Vector3, v2: THREE.Vector3, v3: THREE.Vector3): boolean {
    // First check for NaN or infinite values
    if ([v1, v2, v3].some((v) => !Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z))) {
      return false;
    }

    // Calculate edges
    const edge1 = new THREE.Vector3().subVectors(v2, v1);
    const edge2 = new THREE.Vector3().subVectors(v3, v1);
    const edge3 = new THREE.Vector3().subVectors(v3, v2);

    // Check edge lengths (reject if any edge is too short)
    if (edge1.lengthSq() < DEGENERATE_EPSILON || edge2.lengthSq() < DEGENERATE_EPSILON || edge3.lengthSq() < DEGENERATE_EPSILON) {
      return false;
    }

    // Calculate triangle normal and area
    const normal = new THREE.Vector3().crossVectors(edge1, edge2);
    const areaSquared = normal.lengthSq() * 0.25;

    // Check for degenerate triangle (too small area)
    if (areaSquared < DEGENERATE_EPSILON) {
      return false;
    }

    // Check for triangle that's too thin (compare area to perimeter)
    const perimeter = edge1.length() + edge2.length() + edge3.length();
    const perimeterSq = perimeter * perimeter;
    if (areaSquared / perimeterSq < DEGENERATE_EPSILON) {
      return false;
    }

    return true;
  }

  private addVertex(
    positions: number[],
    indices: number[],
    colors: number[],
    normals: number[],
    chunkPosition: THREE.Vector3,
    v1: THREE.Vector3,
    v2: THREE.Vector3,
    v3: THREE.Vector3
  ): void {
    // Quick distance check using squared distances to avoid sqrt
    const dx12 = v1.x - v2.x,
      dy12 = v1.y - v2.y,
      dz12 = v1.z - v2.z;
    const dx23 = v2.x - v3.x,
      dy23 = v2.y - v3.y,
      dz23 = v2.z - v3.z;
    const dx31 = v3.x - v1.x,
      dy31 = v3.y - v1.y,
      dz31 = v3.z - v1.z;

    const distSq12 = dx12 * dx12 + dy12 * dy12 + dz12 * dz12;
    if (distSq12 < POSITION_EPSILON) return;

    const distSq23 = dx23 * dx23 + dy23 * dy23 + dz23 * dz23;
    if (distSq23 < POSITION_EPSILON) return;

    const distSq31 = dx31 * dx31 + dy31 * dy31 + dz31 * dz31;
    if (distSq31 < POSITION_EPSILON) return;

    // Calculate normal using cross product of edges
    // Reuse already calculated edge values
    const normalX = dy12 * dz31 - dz12 * dy31;
    const normalY = dz12 * dx31 - dx12 * dz31;
    const normalZ = dx12 * dy31 - dy12 * dx31;

    // Get current position index
    const startIdx = positions.length;
    const vertexCount = startIdx / 3;

    // Add all vertices at once using array spread
    positions.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z, v3.x, v3.y, v3.z);

    // Add indices based on normal Y component
    indices.push(vertexCount, vertexCount + (normalY >= 0 ? 1 : 2), vertexCount + (normalY >= 0 ? 2 : 1));

    // Get color once and reuse
    const color = this.getColor(v1, chunkPosition);
    const { r, g, b } = color;
    colors.push(r, g, b, r, g, b, r, g, b);

    // Add normal components all at once
    normals.push(normalX, normalY, normalZ, normalX, normalY, normalZ, normalX, normalY, normalZ);
  }

  // Modified vertex addition logic for the geometry generation

  private setupEventListeners(): void {
    // window.addEventListener("mousedown", (event) => this.onMouseDown(event));
    // window.addEventListener("mouseup", (event) => this.onMouseUp(event));
    // window.addEventListener("mousemove", (event) => this.onMouseMove(event));
    window.addEventListener("resize", () => this.onWindowResize());
    window.addEventListener("keydown", (event) => this.onKeyDown(event));
  }
  private onKeyDown(event: KeyboardEvent): void {
    if (event.key === "w") {
      this.material.wireframe = !this.material.wireframe;
      this.material.needsUpdate = true;
    }
  }
  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private mouseDown = false;
  private onMouseDown(event: MouseEvent): void {
    this.mouseDown = true;
  }
  private onMouseUp(event: MouseEvent): void {
    this.mouseDown = false;
  }
  private onMouseMove(event: MouseEvent): void {
    if (this.mouseDown) {
      const mouse = new THREE.Vector2((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);

      const meshes = Array.from(this.chunks.values()).map((chunk) => chunk.mesh);
      this.raycaster.setFromCamera(mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(meshes);

      if (intersects.length > 0) {
        const point = intersects[0].point;
        this.sculptTerrain(point);
      }
    }
  }

  private sculptTerrain(point: THREE.Vector3): void {
    const radius = 2;
    const strength = 0.3;

    const chunkX = Math.floor(point.x / ((this.gridSize - 1) * this.cubeSize));
    const chunkZ = Math.floor(point.z / ((this.gridSize - 1) * this.cubeSize));
    const key = getChunkKey(chunkX, chunkZ);
    const chunk = this.chunks.get(key);

    if (!chunk) return;

    const localX = point.x - chunk.position.x;
    const localY = point.y - chunk.position.y;
    const localZ = point.z - chunk.position.z;

    const gridX = Math.floor(localX / this.cubeSize);
    const gridY = Math.floor(localY / this.cubeSize);
    const gridZ = Math.floor(localZ / this.cubeSize);

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const px = gridX + dx;
          const py = gridY + dy;
          const pz = gridZ + dz;

          if (px < 0 || px >= this.gridSize || py < 0 || py >= this.gridSize || pz < 0 || pz >= this.gridSize) continue;

          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (distance > radius) continue;

          const influence = 1 - distance / radius;
          chunk.scalarField[px][py][pz] += strength * influence;
        }
      }
    }

    const newGeometry = new THREE.BufferGeometry();
    this.generateChunkGeometry(newGeometry, chunk.scalarField, chunk.position);
    chunk.mesh.geometry.dispose();
    chunk.mesh.geometry = newGeometry;
  }

  public animate(): void {
    requestAnimationFrame(this.animate.bind(this));

    // Update frustum
    this.frustumMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.frustumMatrix);

    const cameraPosition = this.camera.position;
    const newCenter = this.getChunkCoordinates(cameraPosition);

    if (!this.currentChunk.equals(newCenter)) {
      this.currentChunk.copy(newCenter);
      // Use Promise handling for chunk updates
      this.updateChunks(newCenter.x, newCenter.y).catch((error) => {
        console.error("Error in chunk update:", error);
      });
    }

    // Perform frustum culling
    for (const [key, chunk] of this.chunks) {
      if (chunk && chunk.mesh) {
        const box = new THREE.Box3();
        const size = this.gridSize * this.cubeSize;
        box.setFromCenterAndSize(chunk.position.clone().add(new THREE.Vector3(size / 2, size / 2, size / 2)), new THREE.Vector3(size, size, size));

        chunk.mesh.visible = this.isBoxInFrustum(box);
      }
    }

    this.renderer.render(this.scene, this.camera);
    this.frameCount++;
  }

  private isBoxInFrustum(box: THREE.Box3): boolean {
    return this.frustum.intersectsBox(box);
  }

  // Don't forget to clean up workers in a dispose method
  public dispose(): void {
    // Clear all queues
    this.workerQueue.length = 0;
    this.pendingChunks.clear();

    // Terminate all workers
    this.workers.forEach((worker) => {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    });

    this.workers.length = 0;
    this.workerPool.length = 0;
    this.busyWorkers.clear();
  }
}
