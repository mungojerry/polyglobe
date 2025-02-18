import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { TerrainChunk, WorkerMessage, WorkerQueueItem } from "../types/terrain";
import { CHUNK_POOL_SIZE } from "./constants";

type Buffers = {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
};
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
const WORKER_COUNT = Math.max(2, navigator.hardwareConcurrency || 4);
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
  private gridSize = 60; // Increased for better resolution
  private padding = 1; // Re-enable padding
  private cubeSize = 2;
  private isoLevel = 0.5; // Changed from 0.5 to get more visible terrain
  public showDebug = false;
  private raycaster = new THREE.Raycaster();

  private chunkStates: Map<string, ChunkState> = new Map();

  // Add new properties for optimization
  private readonly geometryPool: THREE.BufferGeometry[] = [];
  private readonly meshPool: THREE.Mesh[] = [];
  private frameCount = 0;

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

  // Add a class property to hold the fixed seed.
  private readonly seed: number = 321232133;

  private effectiveGridSize: number; // Add this property

  // Add new worker pool property
  private readonly geometryWorkers: Worker[] = [];
  private readonly geometryWorkerPool: Worker[] = [];

  // Modify the constructor to include error handling for worker creation
  constructor() {
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
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Add this line to enable soft shadows
    document.body.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;

    this.light = new THREE.DirectionalLight(0xffffff, 1);
    this.light.position.set(50, 100, 50);
    this.light.castShadow = true;
    // Add these shadow camera settings
    this.light.shadow.camera.near = 0.1;
    this.light.shadow.camera.far = 500;
    this.light.shadow.camera.left = -500;
    this.light.shadow.camera.right = 500;
    this.light.shadow.camera.top = 500;
    this.light.shadow.camera.bottom = -500;
    this.light.shadow.mapSize.width = 2048;
    this.light.shadow.mapSize.height = 2048;
    this.scene.add(this.light);

    const ambientLight = new THREE.AmbientLight(0x404040, 0.3);
    this.scene.add(ambientLight);

    const hemisphereLight = new THREE.HemisphereLight(0xffffbb, 0x080820, 0.5);
    this.scene.add(hemisphereLight);

    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      flatShading: false,
      wireframe: false,
    });

    // Move ground plane lower to not obscure chunks
    const groundGeometry = new THREE.PlaneGeometry(1000, 1000);
    const groundMaterial = new THREE.MeshPhongMaterial({
      // blue water color
      shininess: 100,
      reflectivity: 1,
      color: 0x0033ff,
      specular: 0x33ccff,
      side: THREE.DoubleSide,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2; // Fix rotation to be facing up
    ground.position.y = 0; // Move slightly lower
    ground.receiveShadow = true;
    ground.castShadow = false; // Ground shouldn't cast shadows, only receive them
    this.scene.add(ground);
    this.setupEventListeners();
    this.initWorkerPool();
    this.initGeometryWorkers();

    this.createStaticGrid(20, 20);
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

  private initGeometryWorkers() {
    for (let i = 0; i < WORKER_COUNT; i++) {
      try {
        const worker = new Worker(new URL("../workers/GeometryWorker.ts", import.meta.url), { type: "module" });
        worker.onerror = (error) => console.error("Geometry worker error:", error);
        this.geometryWorkers.push(worker);
        this.geometryWorkerPool.push(worker);
      } catch (error) {
        console.error("Failed to create geometry worker:", error);
      }
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

    // console.log(`Creating ${width}x${height} grid with offsets ${offsetX}, ${offsetZ}`);

    for (let x = 0; x < width; x++) {
      for (let z = 0; z < height; z++) {
        const chunkX = x + offsetX / this.gridSize;
        const chunkZ = z + offsetZ / this.gridSize;
        // console.log(`Initializing chunk at ${chunkX}, ${chunkZ}`);
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
        // console.log(`Adding chunk mesh to scene at ${key}`, chunk.mesh.position); // Debug log

        chunk.mesh.castShadow = true;
        chunk.mesh.receiveShadow = true;
        this.scene.add(chunk.mesh);
        chunk.debugMesh = this.createGridVisualizer(chunk.position);
        if (this.showDebug) this.scene.add(chunk.debugMesh); // Actually add the grid visualizer to the scene
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

      await this.generateChunkGeometry(geometry, field, temperatures, humidities, totalSize);

      // console.log(`Chunk ${chunkX},${chunkZ} vertex count: ${geometry.attributes.position?.count || 0}`);

      if (geometry.attributes.position?.count === 0) {
        // console.warn(`Empty geometry generated at chunk ${chunkX},${chunkZ}`);
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

  private async generateChunkGeometry(
    geometry: THREE.BufferGeometry,
    scalarField: Float32Array,
    temperatures: Float32Array,
    humidities: Float32Array,
    totalSize: number
  ): Promise<void> {
    const worker = this.geometryWorkerPool.pop();
    if (!worker) {
      throw new Error("No available geometry workers");
    }

    try {
      const buffers = await new Promise<Buffers>((resolve) => {
        const handleMessage = (e: MessageEvent<WorkerMessage>) => {
          if (e.data.type === "geometryGenerated") {
            worker.removeEventListener("message", handleMessage);
            resolve(e.data.buffers);
          }
        };

        worker.addEventListener("message", handleMessage);
        worker.postMessage(
          {
            type: "generateGeometry",
            scalarField,
            temperatures,
            humidities,
            totalSize,
            gridSize: this.gridSize,
            cubeSize: this.cubeSize,
            isoLevel: this.isoLevel,
            padding: this.padding,
          },
          [scalarField.buffer, temperatures.buffer, humidities.buffer]
        );
      });

      geometry.setIndex(new THREE.BufferAttribute(buffers.indices, 1));
      geometry.setAttribute("position", new THREE.BufferAttribute(buffers.positions, 3));
      // geometry.setAttribute("normal", new THREE.BufferAttribute(buffers.normals, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(buffers.colors, 3));

      geometry.computeBoundingSphere();
      geometry.computeBoundingBox();
      geometry.computeVertexNormals();
    } finally {
      this.geometryWorkerPool.push(worker);
    }
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
    this.generateChunkGeometry(newGeometry, chunk.scalarField, chunk.temperatures, chunk.humidities, chunk.totalSize);
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

    // Terminate geometry workers
    this.geometryWorkers.forEach((worker) => {
      worker.terminate();
    });
    this.geometryWorkers.length = 0;
    this.geometryWorkerPool.length = 0;
  }
}
