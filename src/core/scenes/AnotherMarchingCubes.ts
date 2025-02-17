import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { TerrainChunk, WorkerMessage, WorkerQueueItem } from "../types/terrain";
import { edgeTable, triTable } from "./MCDefs";
import { BIOMES, CHUNK_POOL_SIZE, CUBE_CORNER_OFFSETS, DEGENERATE_EPSILON, EDGE_TO_VERTEX, INTERPOLATION_EPSILON } from "./constants";

// Cache chunk key strings
const getChunkKey = (() => {
  const keyCache = new Map<string, string>();
  return (x: number, z: number): string => {
    const key = `${x.toFixed(2)}, ${z.toFixed(2)}`;
    if (!keyCache.has(key)) {
      keyCache.set(key, key);
    }
    return keyCache.get(key)!;
  };
})();
const WORKER_COUNT = 1; // Math.max(2, navigator.hardwareConcurrency || 4);
// Add new types for chunk states
type ChunkState = {
  status: "active" | "pending" | "removing";
  chunk?: TerrainChunk;
  promise?: Promise<TerrainChunk>;
};

export class InfiniteLandscape {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  light: THREE.DirectionalLight;
  private material: THREE.MeshStandardMaterial;
  private gridSize = 32; // Increased for better resolution
  private padding = 1; // Re-enable padding
  private cubeSize = 1;
  private isoLevel = 0.5; // Changed from 0.5 to get more visible terrain

  private raycaster = new THREE.Raycaster();

  private chunkStates: Map<string, ChunkState> = new Map();

  // Add new properties for optimization
  private readonly geometryPool: THREE.BufferGeometry[] = [];
  private readonly meshPool: THREE.Mesh[] = [];
  private frameCount = 0;

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
      resolve: (fields: Float32Array, temperatures: Float32Array, humidities: Float32Array) => void;
      reject: (error: any) => void;
    }
  >();

  // Add these new properties
  private readonly workerQueue: WorkerQueueItem[] = [];
  private readonly busyWorkers = new Set<Worker>();
  private readonly tempVectors: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

  // Add a class property to hold the fixed seed.
  private readonly seed: number = 321232133;

  private effectiveGridSize: number; // Add this property

  // Modify the constructor to include error handling for worker creation
  constructor() {
    this.positionsBuffer = new Float32Array(this.initialBufferSize);
    this.normalsBuffer = new Float32Array(this.initialBufferSize);
    this.colorsBuffer = new Float32Array(this.initialBufferSize);
    this.indicesBuffer = new Uint32Array(this.initialBufferSize);

    this.effectiveGridSize = this.gridSize - this.padding * 2 - 1;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);

    // Adjust camera position to better view the 10x10 grid
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(100, 200, 300); // Move camera higher and further back for better view
    this.camera.lookAt(0, 0, 0);

    // Add these lines after camera setup
    this.camera.updateMatrix();
    this.camera.updateMatrixWorld();
    this.frustumMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.frustumMatrix);

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
      wireframe: true,
      color: 0x00ff00, // Changed to bright green for visibility
    });

    // Move ground plane lower to not obscure chunks
    const groundGeometry = new THREE.PlaneGeometry(1000, 1000);
    const groundMaterial = new THREE.MeshBasicMaterial({
      color: 0x404040,
      side: THREE.DoubleSide,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = Math.PI / 2;
    ground.position.y = -50; // Move ground lower
    this.scene.add(ground);
    this.setupEventListeners();
    this.initWorkerPool();

    this.createStaticGrid(10, 10);
    this.animate();
  }

  private initWorkerPool() {
    // Pre-allocate geometry and mesh pools
    for (let i = 0; i < CHUNK_POOL_SIZE; i++) {
      this.geometryPool.push(new THREE.BufferGeometry());
      this.meshPool.push(new THREE.Mesh(new THREE.BufferGeometry(), this.material));
    }

    // Initialize worker pool with error handling

    for (let i = 0; i < WORKER_COUNT; i++) {
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
  }

  // Modify the worker management methods
  private handleWorkerMessage(e: MessageEvent<WorkerMessage>) {
    if (e.data.type === "terrainGenerated") {
      const { chunkX, chunkZ, field, humidities, temperatures } = e.data;
      const key = getChunkKey(chunkX, chunkZ);
      const pending = this.pendingChunks.get(key);

      if (pending) {
        // The field is already a transferable object
        pending.resolve(field, temperatures, humidities);
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
      padding: this.padding, // Include padding in message
      seed: this.seed, // use the fixed seed property
    });

    const key = getChunkKey(item.chunkX, item.chunkZ);
    this.pendingChunks.set(key, {
      resolve: item.resolve,
      reject: item.reject,
    });
  }

  private async requestTerrainGeneration(
    chunkX: number,
    chunkZ: number
  ): Promise<{ field: Float32Array; temperatures: Float32Array; humidities: Float32Array }> {
    return new Promise((resolve, reject) => {
      // Add request to queue
      this.workerQueue.push({
        chunkX,
        chunkZ,
        resolve: (field: Float32Array, temperatures: Float32Array, humidities: Float32Array) => {
          resolve({ field, temperatures, humidities });
        },
        reject,
      });

      // Try to process queue
      this.processNextQueueItem();
    });
  }

  private async createStaticGrid(width: number, height: number): Promise<void> {
    const promises: Promise<void>[] = [];

    // Center the grid around origin
    const offsetX = -(width * this.gridSize) / 2;
    const offsetZ = -(height * this.gridSize) / 2;

    console.log(`Creating ${width}x${height} grid with offsets ${offsetX}, ${offsetZ}`);

    for (let x = 0; x < width; x++) {
      for (let z = 0; z < height; z++) {
        const chunkX = x + offsetX / this.gridSize;
        const chunkZ = z + offsetZ / this.gridSize;
        console.log(`Initializing chunk at ${chunkX}, ${chunkZ}`);
        promises.push(this.initializeChunk(chunkX, chunkZ));
      }
    }

    await Promise.all(promises);
  }

  private async initializeChunk(chunkX: number, chunkZ: number): Promise<void> {
    const key = getChunkKey(chunkX, chunkZ);
    // console.log(`Initializing chunk at ${key}`); // Debug log

    // Create promise for the new chunk
    const chunkPromise = this.createChunk(chunkX, chunkZ).catch((error) => {
      console.error(`Failed to create chunk at ${key}:`, error);
      return this.createPlaceholderChunk(
        new THREE.Vector3(chunkX * this.effectiveGridSize * this.cubeSize, 0, chunkZ * this.effectiveGridSize * this.cubeSize)
      );
    });

    // Store the pending state
    this.chunkStates.set(key, {
      status: "pending",
      promise: chunkPromise,
    });

    try {
      const chunk = await chunkPromise;
      const currentState = this.chunkStates.get(key);

      // Check if chunk was removed during generation
      if (!currentState || currentState.status === "removing") {
        this.cleanupChunk(chunk);
        this.chunkStates.delete(key);
        return;
      }

      // Add the chunk to the scene - IMPORTANT: This must happen before setting the state
      if (chunk.mesh) {
        console.log(`Adding chunk mesh to scene at ${key}`, chunk.mesh.position); // Debug log
        this.scene.add(chunk.mesh);
        chunk.debugMesh = this.createGridVisualizer(chunk.position);
        this.scene.add(chunk.debugMesh); // Actually add the grid visualizer to the scene
      }

      // Update the chunk state
      this.chunkStates.set(key, {
        status: "active",
        chunk,
      });
    } catch (error) {
      console.error(`Failed to initialize chunk at ${key}:`, error);
      this.chunkStates.delete(key);
    }
  }

  private cleanupChunk(chunk: TerrainChunk): void {
    if (!chunk?.mesh) return;

    // Remove from scene
    this.scene.remove(chunk.mesh);
    if (chunk.debugMesh) {
      this.scene.remove(chunk.debugMesh);
      chunk.debugMesh.geometry.dispose();
      if (Array.isArray(chunk.debugMesh.material)) {
        chunk.debugMesh.material.forEach((m) => m.dispose());
      } else {
        chunk.debugMesh.material.dispose();
      }
    }

    // Reset and reuse geometry
    const geometry = chunk.mesh.geometry;
    geometry.setIndex(null);
    geometry.deleteAttribute("position");
    geometry.deleteAttribute("normal");
    geometry.deleteAttribute("color");

    // Return to pools
    if (this.geometryPool.length < CHUNK_POOL_SIZE) {
      this.geometryPool.push(geometry);
    }
    if (this.meshPool.length < CHUNK_POOL_SIZE) {
      this.meshPool.push(chunk.mesh);
    }
  }

  private async createChunk(chunkX: number, chunkZ: number): Promise<TerrainChunk> {
    const geometry = this.geometryPool.pop() || new THREE.BufferGeometry();
    const mesh = this.meshPool.pop() || new THREE.Mesh(geometry, this.material);

    // Position using effectiveGridSize (account for padding)
    const effectiveSize = (this.gridSize - this.padding * 2) * this.cubeSize;
    const position = new THREE.Vector3(chunkX * effectiveSize, 0, chunkZ * effectiveSize);

    try {
      const { field, temperatures, humidities, totalSize } = await this.createScalarField(chunkX, chunkZ);

      this.generateChunkGeometry(geometry, field, temperatures, humidities, totalSize, position);

      console.log(`Chunk ${chunkX},${chunkZ} vertex count: ${geometry.attributes.position?.count || 0}`);

      if (geometry.attributes.position?.count === 0) {
        console.warn(`Empty geometry generated at chunk ${chunkX},${chunkZ}`);
        return this.createPlaceholderChunk(position);
      }
      mesh.geometry = geometry;

      mesh.position.copy(position);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;

      const chunk: TerrainChunk = {
        mesh,
        debugMesh: this.createGridVisualizer(position),
        position,
        scalarField: field,
        temperatures,
        humidities,
        totalSize,
      };

      return chunk;
    } catch (error) {
      console.error("Failed to create chunk:", error);
      return this.createPlaceholderChunk(position);
    }
  }

  private createGridVisualizer(position: THREE.Vector3): THREE.LineSegments {
    // Update grid visualizer to use effectiveGridSize
    const size = (this.gridSize - this.padding * 2) * this.cubeSize;
    const geometry = new THREE.BoxGeometry(size, size, size);
    const edges = new THREE.EdgesGeometry(geometry);
    const material = new THREE.LineBasicMaterial({
      color: 0xff0000,
      linewidth: 1,
    });
    const box = new THREE.LineSegments(edges, material);

    box.position.copy(position);
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
    const temperatures = new Float32Array(length);
    temperatures.fill(1);
    const humidities = new Float32Array(length);
    humidities.fill(1);

    const debugMesh = this.createGridVisualizer(position);

    return { mesh, debugMesh, position, scalarField: field, totalSize, temperatures, humidities };
  }

  private async createScalarField(
    chunkX: number,
    chunkZ: number
  ): Promise<{
    field: Float32Array;
    temperatures: Float32Array;
    humidities: Float32Array;
    totalSize: number;
  }> {
    try {
      // console.log(`Generating terrain for chunk ${chunkX}, ${chunkZ}`); // Debug log
      const data = await this.requestTerrainGeneration(chunkX, chunkZ);
      const totalSize = this.gridSize + this.padding * 2;

      // Verify data is valid
      if (!data.field || data.field.length === 0) {
        console.error("Received empty field data from worker");
        return this.createFallbackScalarField();
      }

      return {
        field: data.field,
        temperatures: data.temperatures,
        humidities: data.humidities,
        totalSize,
      };
    } catch (error) {
      console.error("Failed to generate terrain:", error);
      return this.createFallbackScalarField();
    }
  }

  // Add a fallback method in case worker generation fails
  private createFallbackScalarField(): {
    field: Float32Array;
    temperatures: Float32Array;
    humidities: Float32Array;
    totalSize: number;
  } {
    // console.log("Using fallback scalar field generation");
    const totalSize = this.gridSize + this.padding * 2;
    const length = totalSize * totalSize * totalSize;
    const field = new Float32Array(length);
    const temperatures = new Float32Array(totalSize * totalSize);
    const humidities = new Float32Array(totalSize * totalSize);
    field.fill(this.isoLevel + 0.1);
    temperatures.fill(0.5);
    humidities.fill(0.5);
    return { field, temperatures, humidities, totalSize };
  }

  // Compute per-vertex colors
  getColor(vertex: THREE.Vector3, chunk: TerrainChunk): THREE.Color {
    const localX = Math.floor(vertex.x / this.cubeSize) + this.padding;
    const localZ = Math.floor(vertex.z / this.cubeSize) + this.padding;
    const index = localX * chunk.totalSize + localZ;

    const temperature = chunk.temperatures[index];
    const humidity = chunk.humidities[index];
    return this.getBiomeColor(temperature, humidity, vertex.y);
  }

  private generateChunkGeometry(
    geometry: THREE.BufferGeometry,
    scalarField: Float32Array,
    temperatures: Float32Array,
    humidities: Float32Array,
    totalSize: number,
    chunkPosition: THREE.Vector3
  ): void {
    // Reset indices
    this.positionsIndex = 0;
    this.normalsIndex = 0;
    this.colorsIndex = 0;
    this.indicesIndex = 0;

    // console.log(`Generating geometry for chunk at ${chunkPosition.x}, ${chunkPosition.z}`);
    // console.log(`Scalar field size: ${scalarField.length}, totalSize: ${totalSize}`);

    this.ensureBufferCapacity(this.gridSize * this.gridSize * 6);

    // Iterate over the full chunk including padding
    for (let x = 0; x < totalSize - 1; x++) {
      for (let y = 0; y < totalSize - 1; y++) {
        for (let z = 0; z < totalSize - 1; z++) {
          const corners = this.getCubeCorners(x, y, z);
          const values = this.getCubeValues(scalarField, totalSize, x, y, z);
          const cubeIndex = this.getCubeIndex(values);

          if (edgeTable[cubeIndex] === 0) continue;

          const triangles = triTable[cubeIndex];
          if (!triangles || triangles.length === 0) continue;

          const chunk: TerrainChunk = {
            mesh: new THREE.Mesh(),
            debugMesh: new THREE.LineSegments(),
            position: chunkPosition,
            scalarField,
            temperatures,
            humidities,
            totalSize,
          };

          this.processTriangles(triangles, corners, values, chunk);
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

  private addVertex(v1: THREE.Vector3, v2: THREE.Vector3, v3: THREE.Vector3, chunk: TerrainChunk): void {
    this.ensureBufferCapacity(3);

    const edge1 = this.tempVectors[0].subVectors(v2, v1);
    const edge2 = this.tempVectors[1].subVectors(v3, v1);
    const normal = this.tempVectors[2].crossVectors(edge1, edge2).normalize();

    const color = this.getColor(v1, chunk);
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

  private processTriangles(triangles: number[], corners: THREE.Vector3[], values: number[], chunk: TerrainChunk): void {
    for (let i = 0; i < triangles.length - 1; i += 3) {
      const vertices = [];
      let allValid = true;

      // Generate all vertices first and validate
      for (let j = 0; j < 3; j++) {
        const edgeIndex = triangles[i + j];
        const [v1Index, v2Index] = EDGE_TO_VERTEX[edgeIndex];
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
        this.addVertex(vertices[0], vertices[1], vertices[2], chunk);
      }
    }
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

      const meshes = Array.from(this.chunkStates.values())
        .map((state) => state.chunk?.mesh)
        .filter((mesh) => mesh) as THREE.Mesh[];
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
    const chunk = this.chunkStates.get(key)?.chunk;

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
    this.generateChunkGeometry(newGeometry, chunk.scalarField, chunk.temperatures, chunk.humidities, chunk.totalSize, chunk.position);
    chunk.mesh.geometry.dispose();
    chunk.mesh.geometry = newGeometry;
  }

  public animate(): void {
    requestAnimationFrame(this.animate.bind(this));
    this.controls.update();
    this.camera.updateMatrixWorld();
    this.frustumMatrix.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.frustumMatrix);
    this.renderer.render(this.scene, this.camera);
    this.frameCount++;
  }
  // Don't forget to clean up workers in a dispose method
  public dispose(): void {
    // Clean up all chunks
    for (const [_, state] of this.chunkStates) {
      if (state.chunk) {
        this.cleanupChunk(state.chunk);
      }
    }
    this.chunkStates.clear();

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
