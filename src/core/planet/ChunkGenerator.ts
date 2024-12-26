import * as THREE from "three";
import { debugManager } from "../managers/debugManager";
import { GlobeChunk } from "./GlobeChunk";
import ChunkWorker from "./chunkWorker?worker";

export class ChunkGenerator {
  public async generateChunks(
    landGeometry: THREE.BufferGeometry,
    landMaterial: THREE.MeshPhongMaterial,
    parentObject: THREE.Object3D,
    chunkSize: number
  ): Promise<GlobeChunk[][]> {
    const start = performance.now();
    const chunks: GlobeChunk[][] = [];
    const workerPromises: Promise<void>[] = [];

    for (let lat = -90; lat < 90; lat += chunkSize) {
      const row: GlobeChunk[] = [];
      for (let lon = -180; lon < 180; lon += chunkSize) {
        const worker = new ChunkWorker();
        worker.postMessage({ source: landGeometry, lat, lon, size: chunkSize });

        const promise = new Promise<void>((resolve) => {
          worker.onmessage = (event) => {
            const serializedGeometry = event.data.geometry;
            const loader = new THREE.BufferGeometryLoader();
            const geometry = loader.parse(serializedGeometry);
            geometry.computeBoundsTree();

            const chunk = new GlobeChunk(geometry, landMaterial.clone());
            chunk.latStart = lat;
            chunk.latEnd = lat + chunkSize;
            chunk.lonStart = lon;
            chunk.lonEnd = lon + chunkSize;
            chunk.mesh.layers.enable(1);

            row.push(chunk);
            parentObject.add(chunk.mesh);

            worker.terminate();
            resolve();
          };
        });
        workerPromises.push(promise);
      }
      chunks.push(row);
    }

    await Promise.all(workerPromises);
    debugManager.set("initChunks", "initChunks: " + (performance.now() - start).toFixed(4));
    return chunks;
  }
}
