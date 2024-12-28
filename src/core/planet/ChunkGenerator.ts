import * as THREE from "three";
import { computeBoundsTree } from "three-mesh-bvh";
import { debugManager } from "../managers/debugManager";
import { ProgressCallback } from "../utils/utils";
import { GlobeChunk } from "./GlobeChunk";
import ChunkWorker from "./chunkWorker?worker";

export class ChunkGenerator {
  private totalChunks: number = 0;
  private completedChunks: number = 0;
  private chunkProgress: Map<number, number> = new Map();
  private activeWorkers: Worker[] = [];

  private readonly MAX_WORKERS = navigator.hardwareConcurrency || 4;

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

    // Calculate total chunks
    this.totalChunks = Math.ceil(180 / chunkSize) * Math.ceil(360 / chunkSize);
    this.completedChunks = 0;
    this.chunkProgress.clear();
    const jsonLandgeometry = landGeometry.toJSON();
    console.log(`Starting chunk generation. Total chunks: ${this.totalChunks}`);

    const BATCH_SIZE = this.MAX_WORKERS; // Process 4 chunks at a time
    let currentBatch: Promise<void>[] = [];

    for (let lat = -90; lat < 90; lat += chunkSize) {
      const row: GlobeChunk[] = [];
      chunks.push(row);
      for (let lon = -180; lon < 180; lon += chunkSize) {
        const currentChunkId = chunkId++;
        this.chunkProgress.set(currentChunkId, 0);

        const worker = new ChunkWorker();
        this.activeWorkers.push(worker);
        worker.postMessage({ source: jsonLandgeometry, lat, lon, size: chunkSize });

        const promise = new Promise<void>((resolve, reject) => {
          worker.onmessage = (event) => {
            try {
              switch (event.data.type) {
                case "progress":
                  this.chunkProgress.set(currentChunkId, event.data.progress);
                  this.updateTotalProgress(onProgress);
                  break;
                case "complete":
                  const serializedGeometry = event.data.geometry;
                  const loader = new THREE.BufferGeometryLoader();
                  const geometry = loader.parse(serializedGeometry);

                  // Ensure the computeBoundsTree method is available
                  if (!geometry.computeBoundsTree) {
                    geometry.computeBoundsTree = computeBoundsTree;
                  }
                  geometry.computeBoundsTree();

                  const chunk = new GlobeChunk(geometry, landMaterial.clone());
                  chunk.latStart = lat;
                  chunk.latEnd = lat + chunkSize;
                  chunk.lonStart = lon;
                  chunk.lonEnd = lon + chunkSize;
                  chunk.mesh.layers.enable(1);

                  row.push(chunk);
                  parentObject.add(chunk.mesh);

                  this.completedChunks++;
                  this.chunkProgress.set(currentChunkId, 100);
                  this.updateTotalProgress(onProgress);

                  worker.terminate();
                  resolve();
                  break;
                case "error":
                  worker.terminate();
                  reject(new Error(event.data.error));
              }
            } catch (error) {
              worker.terminate();
              reject(error);
            }
          };

          worker.onerror = (error) => {
            worker.terminate();
            reject(error);
          };
        });
        currentBatch.push(promise);

        if (currentBatch.length >= BATCH_SIZE) {
          await Promise.all(currentBatch);
          currentBatch = [];
        }

        worker.postMessage({
          source: jsonLandgeometry,
          lat,
          lon,
          size: chunkSize,
        });
      }
    }
    // Process remaining chunks
    await Promise.all(currentBatch);

    console.log(`Total chunk generation time: ${performance.now() - start}ms`);
    return chunks;
  }

  private updateTotalProgress(onProgress?: ProgressCallback): void {
    if (this.chunkProgress.size === 0) return;

    const totalProgress = Array.from(this.chunkProgress.values()).reduce((sum, progress) => sum + progress, 0) / 100;

    const averageProgress = (totalProgress / this.totalChunks) * 100;

    if (onProgress) {
      onProgress(averageProgress);
    }

    debugManager.set("chunkProgress", `Chunks: ${this.completedChunks}/${this.totalChunks} (${averageProgress.toFixed(1)}%)`);
  }
}
