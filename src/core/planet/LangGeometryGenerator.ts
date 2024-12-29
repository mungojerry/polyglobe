import * as THREE from "three";
import { BufferGeometry } from "three";
import { debugManager } from "../managers/debugManager";
import { ProgressCallback } from "../utils/utils";
import LandGeometryWorker from "./landgeometryWorker?worker";
import { VoronoiNoise } from "./noise/VoroniNoise";
export class LandGeometryGenerator {
  constructor() {}

  public async generateLand(radius: number, detail: number, seed: number, noise: VoronoiNoise, onProgress?: ProgressCallback): Promise<BufferGeometry> {
    const start = performance.now();
    const workerPromises: Promise<void>[] = [];

    const worker = new LandGeometryWorker();
    worker.postMessage({ radius, detail, seed, noise });

    let landGeometry;

    const promise = new Promise<void>((resolve, reject) => {
      worker.onmessage = (event) => {
        try {
          switch (event.data.type) {
            case "progress":
              this.updateTotalProgress(event.data.progress, onProgress);
              break;
            case "complete":
              const serializedGeometry = event.data.geometry;
              const loader = new THREE.BufferGeometryLoader();
              const geometry = loader.parse(serializedGeometry);
              geometry.computeBoundsTree();
              landGeometry = geometry;
              this.updateTotalProgress(100, onProgress);
              worker.terminate();
              resolve();
              break;
            case "error":
              worker.terminate();
              reject(new Error(event.data.error));
              break;
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

    workerPromises.push(promise);

    try {
      await Promise.all(workerPromises);
      const end = performance.now();
      debugManager.set("landGeometry", "landGeometry: " + (end - start).toFixed(4));
      console.log("land geometry generator complete: ", landGeometry);
      return landGeometry || ({} as BufferGeometry);
    } catch (error) {
      debugManager.set("error", `Land geometry generation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      throw error;
    }
  }

  private updateTotalProgress(progress: number, onProgress?: ProgressCallback): void {
    if (onProgress) {
      onProgress(progress);
    }

    debugManager.set("landProgress", `Land: ${progress.toFixed(1)}%)`);
  }
}
