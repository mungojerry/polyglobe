import * as THREE from "three";
import { computeBoundsTree } from "three-mesh-bvh";
import { debugManager } from "../managers/debugManager";
import { ProgressCallback } from "../utils/utils";
import { vectorPool } from "../utils/vectorPool";
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
  private chunkProgress: Map<number, number> = new Map();
  private lastProgressUpdate: number = 0;
  private positionAttr!: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
  private colorAttr!: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
  private indexAttr!: THREE.BufferAttribute | null;
  private indexArray!: Uint32Array;
  private filteredIndices!: Uint32Array;
  private readonly BATCH_SIZE = 8; // Adjust based on testing
  constructor() {}

  public async generateChunks(
    landGeometry: THREE.BufferGeometry,
    landMaterial: THREE.MeshPhongMaterial,
    parentObject: THREE.Object3D,
    chunkSize: number,
    onProgress?: ProgressCallback
  ): Promise<GlobeChunk[][]> {
    const start = performance.now();
    const chunks: GlobeChunk[][] = [];
    let chunkId = 0;

    this.positionAttr = landGeometry.attributes.position;
    this.colorAttr = landGeometry.attributes.color;
    this.indexAttr = landGeometry.index;
    if (!this.indexAttr) throw new Error("Geometry must have an index attribute");
    this.indexArray = this.indexAttr.array as Uint32Array;
    this.filteredIndices = new Uint32Array(this.indexArray.length);

    // Calculate total chunks
    const latChunks = Math.ceil(180 / chunkSize);
    const lonChunks = Math.ceil(360 / chunkSize);
    this.totalChunks = latChunks * lonChunks;
    this.completedChunks = 0;
    this.chunkProgress.clear();

    console.log(`Starting chunk generation. Total chunks: ${this.totalChunks}`);

    // Pre-allocate the chunks array
    for (let i = 0; i < latChunks; i++) {
      chunks.push(new Array(lonChunks));
    }

    // Create task queue
    const tasks: ChunkTask[] = [];
    for (let latIndex = 0; latIndex < latChunks; latIndex++) {
      const lat = -90 + latIndex * chunkSize;
      for (let lonIndex = 0; lonIndex < lonChunks; lonIndex++) {
        const lon = -180 + lonIndex * chunkSize;
        tasks.push({
          latIndex,
          lonIndex,
          lat,
          lon,
          chunkId: chunkId++,
        });
      }
    }

    // Process tasks in small groups
    while (tasks.length > 0) {
      const currentTasks = tasks.splice(0, this.BATCH_SIZE);
      await this.processBatch(currentTasks, landMaterial, parentObject, chunkSize, chunks, onProgress);
      // Allow UI to update
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }

    console.log(`Total chunk generation time: ${performance.now() - start}ms`);
    return chunks;
  }

  private async processBatch(
    tasks: ChunkTask[],
    landMaterial: THREE.MeshPhongMaterial,
    parentObject: THREE.Object3D,
    chunkSize: number,
    chunks: GlobeChunk[][],
    onProgress?: ProgressCallback
  ): Promise<void> {
    const batchPromises = tasks.map((task) => this.processChunk(task, landMaterial, parentObject, chunkSize, chunks, onProgress));
    await Promise.all(batchPromises);
  }

  private async processChunk(
    task: ChunkTask,
    landMaterial: THREE.MeshPhongMaterial,
    parentObject: THREE.Object3D,
    chunkSize: number,
    chunks: GlobeChunk[][],
    onProgress?: ProgressCallback
  ): Promise<void> {
    this.chunkProgress.set(task.chunkId, 0);

    try {
      const geometry = await this.extractChunkGeometry(task.lat, task.lon, chunkSize, (progress) => {
        this.chunkProgress.set(task.chunkId, progress);
        this.updateProgress(onProgress);
      });

      if (geometry) {
        if (typeof geometry.computeBoundsTree === "undefined") {
          geometry.computeBoundsTree = computeBoundsTree;
        }
        if (typeof geometry.computeBoundsTree === "function") {
          geometry.computeBoundsTree();
        }

        // Create chunk with geometry and material
        const chunk = new GlobeChunk(geometry, landMaterial.clone());
        chunk.latStart = task.lat;
        chunk.latEnd = task.lat + chunkSize;
        chunk.lonStart = task.lon;
        chunk.lonEnd = task.lon + chunkSize;
        chunk.mesh.layers.enable(1);
        parentObject.add(chunk.mesh);

        chunks[task.latIndex][task.lonIndex] = chunk;
      }
    } catch (error) {
      console.error(`Error generating chunk at lat:${task.lat}, lon:${task.lon}:`, error);
    } finally {
      this.completedChunks++;
      this.chunkProgress.set(task.chunkId, 100);
      this.updateProgress(onProgress);
    }
  }

  private updateProgress(onProgress?: ProgressCallback): void {
    const now = performance.now();
    if (now - this.lastProgressUpdate < 16) return; // Limit to ~60fps
    this.lastProgressUpdate = now;

    if (this.chunkProgress.size === 0) return;

    const completedProgress = (this.completedChunks / this.totalChunks) * 100;

    if (onProgress) {
      onProgress(completedProgress);
    }

    debugManager.set("chunkProgress", `Chunks: ${this.completedChunks}/${this.totalChunks}`);
  }

  private extractChunkGeometry(lat: number, lon: number, size: number, onProgress: ProgressCallback): Promise<THREE.BufferGeometry | null> {
    return new Promise((resolve) => {
      const EPS = THREE.MathUtils.degToRad(1.0);
      const LAT_MIN = THREE.MathUtils.degToRad(lat) - EPS;
      const LAT_MAX = THREE.MathUtils.degToRad(lat + size) + EPS;
      const LON_MIN = THREE.MathUtils.degToRad(lon) - EPS;
      const LON_MAX = THREE.MathUtils.degToRad(lon + size) + EPS;

      const tempVec = vectorPool.getVector();
      const normalVec = vectorPool.getVector();
      const spherical = new THREE.Spherical();

      const posArray = this.positionAttr.array as Float32Array;
      const colArray = this.colorAttr.array as Float32Array;

      const maxVertices = Math.ceil(this.positionAttr.count * (size / 360));
      const interleavedData = new Float32Array(maxVertices * 6);
      const vertexMap = new Int32Array(this.positionAttr.count).fill(-1);
      let vertexCount = 0;

      const processVertex = (i: number): boolean => {
        const ix = i * 3;
        tempVec.set(posArray[ix], posArray[ix + 1], posArray[ix + 2]);
        spherical.setFromVector3(tempVec);

        // Store elevation in vertex data
        const vertexLat = Math.PI / 2 - spherical.phi;
        const vertexLon = THREE.MathUtils.euclideanModulo(spherical.theta + Math.PI, Math.PI * 2) - Math.PI;

        return vertexLat >= LAT_MIN && vertexLat <= LAT_MAX && vertexLon >= LON_MIN && vertexLon <= LON_MAX;
      };

      const copyVertex = (srcIdx: number, destIdx: number): void => {
        const src = srcIdx * 3;
        const dest = destIdx * 6;
        interleavedData[dest] = posArray[src];
        interleavedData[dest + 1] = posArray[src + 1];
        interleavedData[dest + 2] = posArray[src + 2];
        interleavedData[dest + 3] = colArray[src];
        interleavedData[dest + 4] = colArray[src + 1];
        interleavedData[dest + 5] = colArray[src + 2];
      };

      const geometry = new THREE.BufferGeometry();
      let hasVertices = false;

      if (this.indexAttr) {
        let indexCount = 0;

        const processChunk = (startIdx: number, endIdx: number) => {
          for (let i = startIdx; i < endIdx && i < this.indexArray.length; i += 3) {
            const a = this.indexArray[i];
            const b = this.indexArray[i + 1];
            const c = this.indexArray[i + 2];

            if (processVertex(a) || processVertex(b) || processVertex(c)) {
              hasVertices = true;
              if (vertexMap[a] === -1) {
                vertexMap[a] = vertexCount;
                copyVertex(a, vertexCount++);
              }
              if (vertexMap[b] === -1) {
                vertexMap[b] = vertexCount;
                copyVertex(b, vertexCount++);
              }
              if (vertexMap[c] === -1) {
                vertexMap[c] = vertexCount;
                copyVertex(c, vertexCount++);
              }

              this.filteredIndices[indexCount++] = vertexMap[a];
              this.filteredIndices[indexCount++] = vertexMap[b];
              this.filteredIndices[indexCount++] = vertexMap[c];
            }
          }
        };

        const CHUNK_SIZE = 300;
        for (let i = 0; i < this.indexArray.length; i += CHUNK_SIZE) {
          processChunk(i, i + CHUNK_SIZE);
          onProgress((i / this.indexArray.length) * 100);
        }

        if (hasVertices) {
          geometry.setIndex(new THREE.BufferAttribute(this.filteredIndices.slice(0, indexCount), 1));
        }
      } else {
        const processChunk = (startIdx: number, endIdx: number) => {
          for (let i = startIdx; i < endIdx && i < this.positionAttr.count; i++) {
            if (processVertex(i)) {
              hasVertices = true;
              vertexMap[i] = vertexCount;
              copyVertex(i, vertexCount++);
            }
          }
        };

        const CHUNK_SIZE = 300;
        for (let i = 0; i < this.positionAttr.count; i += CHUNK_SIZE) {
          processChunk(i, i + CHUNK_SIZE);
          onProgress((i / this.positionAttr.count) * 100);
        }
      }

      if (!hasVertices) {
        vectorPool.releaseVector(tempVec);
        resolve(null);
        return;
      }

      const finalData = new Float32Array(interleavedData.buffer, 0, vertexCount * 6);
      const interleavedBuffer = new THREE.InterleavedBuffer(finalData, 6);
      geometry.setAttribute("position", new THREE.InterleavedBufferAttribute(interleavedBuffer, 3, 0));
      geometry.setAttribute("color", new THREE.InterleavedBufferAttribute(interleavedBuffer, 3, 3));
      geometry.computeVertexNormals();
      onProgress(100);
      vectorPool.releaseVector(tempVec);
      vectorPool.releaseVector(normalVec);
      resolve(geometry);
    });
  }
}
