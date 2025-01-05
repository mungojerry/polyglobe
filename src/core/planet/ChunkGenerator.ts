import * as THREE from "three";
import { ProgressCallback, yieldToMainThread } from "../utils/utils";
import { GlobeChunk } from "./GlobeChunk";

interface ChunkTask {
  latIndex: number;
  lonIndex: number;
  lat: number;
  lon: number;
  chunkId: number;
}

export class ChunkGenerator {
  private totalChunks: number = 0;
  private completedChunks: number = 0;
  private readonly spherical: THREE.Spherical;
  private vertexLatLonCache!: Float32Array;

  constructor() {
    this.spherical = new THREE.Spherical();
  }

  public async generateChunks(
    landGeometry: THREE.BufferGeometry,
    landMaterial: THREE.MeshPhongMaterial,
    parentObject: THREE.Object3D,
    chunkSize: number,
    onProgress?: ProgressCallback
  ): Promise<GlobeChunk[][]> {
    const positionAttr = landGeometry.attributes.position;
    const indexAttr = landGeometry.index;
    if (!indexAttr) throw new Error("Geometry must have an index attribute");

    // Precalculate lat/lon for all vertices
    this.precalculateVertexPositions(positionAttr);

    const chunks: GlobeChunk[][] = [];
    const latChunks = Math.ceil(180 / chunkSize);
    const lonChunks = Math.ceil(360 / chunkSize);
    this.totalChunks = latChunks * lonChunks;

    // Pre-allocate arrays
    for (let i = 0; i < latChunks; i++) {
      chunks[i] = new Array(lonChunks);
    }

    // Create and process tasks in parallel
    const tasks = this.createTaskQueue(chunkSize);
    const taskGroups = this.groupTasksByLocation(tasks, 4); // Group nearby chunks

    for (const group of taskGroups) {
      const promises = group.map((task) => this.processChunk(task, landGeometry, landMaterial, parentObject, chunkSize, chunks, onProgress));
      await Promise.all(promises);
      // Allow UI update
      await yieldToMainThread();
    }

    return chunks;
  }

  private precalculateVertexPositions(positionAttr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): void {
    const positions = positionAttr.array as Float32Array;
    this.vertexLatLonCache = new Float32Array((positions.length / 3) * 2);
    const tempVec = new THREE.Vector3();

    for (let i = 0; i < positions.length; i += 3) {
      tempVec.set(positions[i], positions[i + 1], positions[i + 2]);
      this.spherical.setFromVector3(tempVec);

      const idx = (i / 3) * 2;
      this.vertexLatLonCache[idx] = Math.PI / 2 - this.spherical.phi;
      this.vertexLatLonCache[idx + 1] = THREE.MathUtils.euclideanModulo(this.spherical.theta + Math.PI, Math.PI * 2) - Math.PI;
    }
  }

  private groupTasksByLocation(tasks: ChunkTask[], groupSize: number): ChunkTask[][] {
    const groups: ChunkTask[][] = [];
    let currentGroup: ChunkTask[] = [];

    for (const task of tasks) {
      currentGroup.push(task);
      if (currentGroup.length === groupSize) {
        groups.push(currentGroup);
        currentGroup = [];
      }
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }

  private async processChunk(
    task: ChunkTask,
    landGeometry: THREE.BufferGeometry,
    landMaterial: THREE.MeshPhongMaterial,
    parentObject: THREE.Object3D,
    chunkSize: number,
    chunks: GlobeChunk[][],
    onProgress?: ProgressCallback
  ): Promise<void> {
    const geometry = await this.extractChunkGeometry(task.lat, task.lon, chunkSize, landGeometry);

    if (geometry) {
      if (typeof geometry.computeBoundsTree === "function") {
        geometry.computeBoundsTree();
      }

      const chunk = new GlobeChunk(geometry, landMaterial.clone());
      chunk.latStart = task.lat;
      chunk.latEnd = task.lat + chunkSize;
      chunk.lonStart = task.lon;
      chunk.lonEnd = task.lon + chunkSize;
      chunk.mesh.layers.enable(1);

      parentObject.add(chunk.mesh);
      chunks[task.latIndex][task.lonIndex] = chunk;
    }

    this.completedChunks++;
    if (onProgress) {
      onProgress((this.completedChunks / this.totalChunks) * 100);
    }
  }

  private extractChunkGeometry(lat: number, lon: number, size: number, landGeometry: THREE.BufferGeometry): Promise<THREE.BufferGeometry | null> {
    return new Promise((resolve) => {
      const bounds = {
        LAT_MIN: THREE.MathUtils.degToRad(lat),
        LAT_MAX: THREE.MathUtils.degToRad(lat + size),
        LON_MIN: THREE.MathUtils.degToRad(lon),
        LON_MAX: THREE.MathUtils.degToRad(lon + size),
      };

      const positionAttr = landGeometry.attributes.position;
      const indexAttr = landGeometry.index!;

      const vertices = new Float32Array(positionAttr.count * 6);
      const indices = new Uint32Array(indexAttr.count);
      const vertexMap = new Int32Array(positionAttr.count);
      vertexMap.fill(-1);

      const result = this.filterGeometryData(bounds, vertices, indices, vertexMap, landGeometry);

      if (!result.hasVertices) {
        resolve(null);
        return;
      }

      const geometry = new THREE.BufferGeometry();
      const finalVertices = new Float32Array(vertices.buffer, 0, result.vertexCount * 6);
      const buffer = new THREE.InterleavedBuffer(finalVertices, 6);

      geometry.setAttribute("position", new THREE.InterleavedBufferAttribute(buffer, 3, 0));
      geometry.setAttribute("color", new THREE.InterleavedBufferAttribute(buffer, 3, 3));

      if (result.indexCount > 0) {
        geometry.setIndex(new THREE.BufferAttribute(indices.slice(0, result.indexCount), 1));
      }

      geometry.computeVertexNormals();
      resolve(geometry);
    });
  }

  private filterGeometryData(
    bounds: { LAT_MIN: number; LAT_MAX: number; LON_MIN: number; LON_MAX: number },
    vertices: Float32Array,
    indices: Uint32Array,
    vertexMap: Int32Array,
    geometry: THREE.BufferGeometry
  ): { hasVertices: boolean; vertexCount: number; indexCount: number } {
    let vertexCount = 0;
    let indexCount = 0;
    let hasVertices = false;

    const posArray = geometry.attributes.position.array as Float32Array;
    const colArray = geometry.attributes.color.array as Float32Array;
    const indexArray = geometry.index!.array as Uint32Array;

    const isVertexInBounds = (idx: number): boolean => {
      const cacheIdx = idx * 2;
      const lat = this.vertexLatLonCache[cacheIdx];
      const lon = this.vertexLatLonCache[cacheIdx + 1];
      return lat >= bounds.LAT_MIN && lat <= bounds.LAT_MAX && lon >= bounds.LON_MIN && lon <= bounds.LON_MAX;
    };

    // Process triangles in bulk
    for (let i = 0; i < indexArray.length; i += 3) {
      const a = indexArray[i];
      const b = indexArray[i + 1];
      const c = indexArray[i + 2];

      if (isVertexInBounds(a) || isVertexInBounds(b) || isVertexInBounds(c)) {
        hasVertices = true;

        for (const idx of [a, b, c]) {
          if (vertexMap[idx] === -1) {
            const srcPos = idx * 3;
            const srcCol = idx * 3;
            const dest = vertexCount * 6;

            // Bulk copy position and color
            vertices.set(posArray.subarray(srcPos, srcPos + 3), dest);
            vertices.set(colArray.subarray(srcCol, srcCol + 3), dest + 3);

            vertexMap[idx] = vertexCount++;
          }
        }

        indices[indexCount++] = vertexMap[a];
        indices[indexCount++] = vertexMap[b];
        indices[indexCount++] = vertexMap[c];
      }
    }

    return { hasVertices, vertexCount, indexCount };
  }

  private createTaskQueue(chunkSize: number): ChunkTask[] {
    const tasks: ChunkTask[] = [];
    const latChunks = Math.ceil(180 / chunkSize);
    const lonChunks = Math.ceil(360 / chunkSize);

    for (let latIndex = 0; latIndex < latChunks; latIndex++) {
      const lat = -90 + latIndex * chunkSize;
      for (let lonIndex = 0; lonIndex < lonChunks; lonIndex++) {
        const lon = -180 + lonIndex * chunkSize;
        tasks.push({
          latIndex,
          lonIndex,
          lat,
          lon,
          chunkId: latIndex * lonChunks + lonIndex,
        });
      }
    }

    return tasks;
  }
}
