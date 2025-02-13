import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise";
import { PseudoRandomNumberGenerator } from "../utils/PseudoRandom";
import { edgeTable, triTable } from "./MCDefs";

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
  scalarField: Float32Array;
  totalSize: number; // Add this to store dimensions
}

// Add these new constants at the top
const VERTEX_POOL_SIZE = 1000000;
const CHUNK_POOL_SIZE = 100;

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
  private material: THREE.MeshStandardMaterial;
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
  // private readonly positions: number[] = [];
  // private readonly indices: number[] = [];
  // private readonly normals: number[] = [];
  // private readonly colors: number[] = [];

  private positionsBuffer: Float32Array;
  private positionsIndex = 0;
  private normalsBuffer: Float32Array;
  private normalsIndex = 0;
  private colorsBuffer: Float32Array;
  private colorsIndex = 0;
  private indicesBuffer: Uint32Array;
  private indicesIndex = 0;
  private initialBufferSize = 131072; // 2^17

  private frustum = new THREE.Frustum();
  private frustumMatrix = new THREE.Matrix4();

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
  private readonly tempVectors: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

  // Modify the constructor to include error handling for worker creation
  constructor() {
    console.log(edgeTable);
    console.log(triTable);

    // Check some known cases
    console.log("Case 1:", triTable[1]); // Should have valid indices and end with -1
    console.log("Case 3:", triTable[3]);
    console.log("Case 255:", triTable[255]); // Should be empty case (all vertices inside)

    this.positionsBuffer = new Float32Array(this.initialBufferSize);
    this.normalsBuffer = new Float32Array(this.initialBufferSize);
    this.colorsBuffer = new Float32Array(this.initialBufferSize);
    this.indicesBuffer = new Uint32Array(this.initialBufferSize);

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

    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      flatShading: true,
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
        // The field is already a transferable object
        pending.resolve(field);
        this.pendingChunks.delete(key);

        const worker = e.target as Worker;
        this.busyWorkers.delete(worker);
        this.workerPool.push(worker);
        this.processNextQueueItem();
      }
    }
  }

  private ensureBufferCapacity(verticesNeeded: number) {
    const requiredSize = this.positionsIndex + verticesNeeded * 3;
    if (requiredSize > this.positionsBuffer.length) {
      const newSize = Math.max(requiredSize, this.positionsBuffer.length * 2);
      this.resizeBuffer(newSize);
    }
  }

  private resizeBuffer(newSize: number) {
    const resize = (old: Float32Array) => {
      const newArr = new Float32Array(newSize);
      newArr.set(old);
      return newArr;
    };

    this.positionsBuffer = resize(this.positionsBuffer);
    this.normalsBuffer = resize(this.normalsBuffer);
    this.colorsBuffer = resize(this.colorsBuffer);
    this.indicesBuffer = new Uint32Array(Math.max(newSize, this.indicesBuffer.length * 2));
  }

  private processNextQueueItem(): void {
    if (this.workerQueue.length === 0 || this.workerPool.length === 0) return;

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
    const effectiveSize = (this.gridSize - this.chunkOverlap) * this.cubeSize;
    const chunkX = Math.floor(position.x / effectiveSize);
    const chunkZ = Math.floor(position.z / effectiveSize);
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

      // Remove old chunks using removeChunk method
      for (const key of chunksToRemove) {
        const chunk = this.chunks.get(key);
        if (chunk) {
          const chunkX = Math.floor(chunk.position.x / ((this.gridSize - this.chunkOverlap) * this.cubeSize));
          const chunkZ = Math.floor(chunk.position.z / ((this.gridSize - this.chunkOverlap) * this.cubeSize));
          this.removeChunk(chunkX, chunkZ);
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
      const { field, totalSize } = await this.createScalarField(chunkX, chunkZ);
      this.generateChunkGeometry(geometry, field, totalSize, position);

      // Add validation for degenerate geometry
      if (geometry.attributes.position.count === 0) {
        console.warn(`Empty geometry generated at chunk ${chunkX},${chunkZ}`);
        return this.createPlaceholderChunk(position);
      }

      mesh.position.copy(position);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = true;

      const chunk: TerrainChunk = { mesh, position, scalarField: field, totalSize };
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

    const totalSize = this.gridSize + this.padding * 2;
    const length = totalSize * totalSize * totalSize;
    const field = new Float32Array(length);
    field.fill(1);

    return { mesh, position, scalarField: field, totalSize };
  }

  private async createScalarField(chunkX: number, chunkZ: number): Promise<{ field: Float32Array; totalSize: number }> {
    try {
      const fieldData = await this.requestTerrainGeneration(chunkX, chunkZ);
      const totalSize = this.gridSize + this.padding * 2;

      // fieldData is already a Float32Array, just return it with size info
      return { field: fieldData, totalSize };
    } catch (error) {
      console.error("Failed to generate terrain:", error);
      return this.createFallbackScalarField();
    }
  }

  // Add a fallback method in case worker generation fails
  private createFallbackScalarField(): { field: Float32Array; totalSize: number } {
    const totalSize = this.gridSize + this.padding * 2;
    const length = totalSize * totalSize * totalSize;
    const field = new Float32Array(length);
    field.fill(this.isoLevel + 0.1);
    return { field, totalSize };
  }

  // Compute per-vertex colors
  getColor(chunkPosition: THREE.Vector3, vertex: THREE.Vector3): THREE.Color {
    const worldX = chunkPosition.x + vertex.x;
    const worldZ = chunkPosition.z + vertex.z;
    const humidity = this.getHumidity(worldX, worldZ);
    const temperature = this.getTemperature(worldX, worldZ); // get temperature based on x,z coordinates
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

  private generateChunkGeometry(geometry: THREE.BufferGeometry, scalarField: Float32Array, totalSize: number, chunkPosition: THREE.Vector3): void {
    // Reset buffer indices
    this.positionsIndex = 0;
    this.normalsIndex = 0;
    this.colorsIndex = 0;
    this.indicesIndex = 0;

    // Pre-allocate space for worst case
    this.ensureBufferCapacity(this.gridSize * this.gridSize * 6);

    // Fix iteration bounds
    for (let x = 0; x < this.gridSize - 1; x++) {
      for (let y = 0; y < this.gridSize - 1; y++) {
        for (let z = 0; z < this.gridSize - 1; z++) {
          // Adjust indices for padding
          const px = x + this.padding;
          const py = y + this.padding;
          const pz = z + this.padding;

          const corners = this.getCubeCorners(x, y, z);
          const values = this.getCubeValues(scalarField, totalSize, px, py, pz);
          const cubeIndex = this.getCubeIndex(values);

          if (edgeTable[cubeIndex] === 0) continue;

          const triangles = triTable[cubeIndex];
          if (!triangles || triangles.length === 0) continue;

          this.processTriangles(triangles, corners, values, chunkPosition);
        }
      }
    }

    this.createGeometry(geometry);
  }

  private getCubeIndex(values: number[]): number {
    let cubeIndex = 0;
    for (let i = 0; i < 8; i++) {
      if (values[i] < this.isoLevel) {
        cubeIndex |= 1 << i;
      }
    }
    return cubeIndex;
  }

  private getCubeValues(field: Float32Array, totalSize: number, x: number, y: number, z: number): number[] {
    return [
      field[(x * totalSize + y) * totalSize + z],
      field[((x + 1) * totalSize + y) * totalSize + z],
      field[(x * totalSize + y) * totalSize + (z + 1)],
      field[((x + 1) * totalSize + y) * totalSize + (z + 1)],
      field[(x * totalSize + (y + 1)) * totalSize + z],
      field[((x + 1) * totalSize + (y + 1)) * totalSize + z],
      field[(x * totalSize + (y + 1)) * totalSize + (z + 1)],
      field[((x + 1) * totalSize + (y + 1)) * totalSize + (z + 1)],
    ];
  }

  private getCubeCorners(x: number, y: number, z: number): THREE.Vector3[] {
    return CUBE_CORNER_OFFSETS.map(
      (offset) => new THREE.Vector3((x + offset.x) * this.cubeSize, (y + offset.y) * this.cubeSize, (z + offset.z) * this.cubeSize)
    );
  }

  private addVertex(chunkPosition: THREE.Vector3, v1: THREE.Vector3, v2: THREE.Vector3, v3: THREE.Vector3): void {
    this.ensureBufferCapacity(3);

    const edge1 = this.tempVectors[0].subVectors(v2, v1);
    const edge2 = this.tempVectors[1].subVectors(v3, v1);
    const normal = this.tempVectors[2].crossVectors(edge1, edge2).normalize();

    const color = this.getColor(chunkPosition, v1);
    const startIndex = this.positionsIndex / 3;

    // Add vertices
    [v1, v2, v3].forEach((v) => {
      this.positionsBuffer[this.positionsIndex++] = v.x;
      this.positionsBuffer[this.positionsIndex++] = v.y;
      this.positionsBuffer[this.positionsIndex++] = v.z;

      this.normalsBuffer[this.normalsIndex++] = normal.x;
      this.normalsBuffer[this.normalsIndex++] = normal.y;
      this.normalsBuffer[this.normalsIndex++] = normal.z;

      this.colorsBuffer[this.colorsIndex++] = color.r;
      this.colorsBuffer[this.colorsIndex++] = color.g;
      this.colorsBuffer[this.colorsIndex++] = color.b;
    });

    // Add indices in counter-clockwise order
    this.indicesBuffer[this.indicesIndex++] = startIndex;
    this.indicesBuffer[this.indicesIndex++] = startIndex + 1;
    this.indicesBuffer[this.indicesIndex++] = startIndex + 2;
  }

  private createGeometry(geometry: THREE.BufferGeometry): void {
    const positions = this.positionsBuffer.subarray(0, this.positionsIndex);
    const normals = this.normalsBuffer.subarray(0, this.normalsIndex);
    const colors = this.colorsBuffer.subarray(0, this.colorsIndex);
    const indices = this.indicesBuffer.subarray(0, this.indicesIndex);

    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  }

  private processTriangles(
    triangles: number[],
    corners: THREE.Vector3[],
    values: number[],

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
        this.addVertex(chunkPosition, vertices[0], vertices[1], vertices[2]);
      }
    }
  }

  private hasValidFieldValues(field: Float32Array, totalSize: number, x: number, y: number, z: number): boolean {
    // Check a larger neighborhood around the point
    for (let dx = -1; dx <= 2; dx++) {
      for (let dy = -1; dy <= 2; dy++) {
        for (let dz = -1; dz <= 2; dz++) {
          const index = ((x + dx) * totalSize + (y + dy)) * totalSize + (z + dz);
          const value = field[index];
          if (value === undefined || !Number.isFinite(value)) {
            return false;
          }
        }
      }
    }
    return true;
  }

  private getTemperature(x: number, z: number): number {
    const scale = 0.02; // Reduced scale for smoother transitions
    return (this.temperatureNoise.noise3d(x * scale, 0, z * scale) + 1) * 0.5;
  }

  private getHumidity(x: number, z: number): number {
    const scale = 0.015; // Even smoother humidity transitions
    return (this.humidityNoise.noise3d(x * scale, 0, z * scale) + 1) * 0.5;
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
          const index = px * this.gridSize * this.gridSize + py * this.gridSize + pz;
          chunk.scalarField[index] += strength * influence;
        }
      }
    }

    const newGeometry = new THREE.BufferGeometry();
    this.generateChunkGeometry(newGeometry, chunk.scalarField, chunk.totalSize, chunk.position);
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
