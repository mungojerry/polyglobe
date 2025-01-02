import * as THREE from "three";
import { BufferGeometry } from "three";
import { debugManager } from "../managers/debugManager";
import { getTerrainColor } from "../utils/biomes";
import { ProgressCallback } from "../utils/utils";
import { BaseNoise } from "./noise/BaseNoise";
import { terrainHelper } from "./terrainHelper";
export class LandGeometryGenerator {
  constructor() {}

  public async generateLand(radius: number, detail: number, seed: number, noise: BaseNoise, onProgress?: ProgressCallback): Promise<BufferGeometry> {
    const start = performance.now();

    // Create geometry
    const geometry = new BufferGeometry();

    // Create base icosahedron
    const icosahedron = new THREE.IcosahedronGeometry(radius + 0.2, detail);
    const positionAttr = icosahedron.attributes.position;
    const vertexCount = positionAttr.count;

    const vertices = new Float32Array(vertexCount * 3);
    const colors = new Float32Array(vertexCount * 3);
    const indices = new Uint32Array(vertexCount);
    const posArray = positionAttr.array;

    terrainHelper.setDefaults(noise, geometry);

    // Process vertices in chunks to report progress
    const CHUNK_SIZE = 1000;
    const totalVertices = vertexCount;

    for (let i = 0; i < vertexCount; i += CHUNK_SIZE) {
      const end = Math.min(i + CHUNK_SIZE, vertexCount);

      for (let j = i; j < end; j++) {
        const idx = j * 3;
        const x = posArray[idx];
        const y = posArray[idx + 1];
        const z = posArray[idx + 2];

        const length = Math.sqrt(x * x + y * y + z * z);
        const nx = x / length;
        const ny = y / length;
        const nz = z / length;
        const latitude = Math.asin(ny);

        // Use actual terrain generation logic
        const height = terrainHelper.computeSurfaceHeight(nx, ny, nz);
        const elevation = terrainHelper.computeElevationMultiplier(height);

        vertices[idx] = x * elevation;
        vertices[idx + 1] = y * elevation;
        vertices[idx + 2] = z * elevation;

        // Use the same color generation as main thread
        const color = getTerrainColor(height, latitude);
        colors[idx] = color.r;
        colors[idx + 1] = color.g;
        colors[idx + 2] = color.b;

        indices[j] = j;
      }

      const progress = Math.min((end / totalVertices) * 100, 99);

      await this.updateTotalProgress(progress, onProgress);
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    const end = performance.now();
    debugManager.set("landGeometry", "land geometry time: " + (end - start).toFixed(4));
    console.log("land geometry generator complete");
    return geometry;
  }

  private async updateTotalProgress(progress: number, onProgress?: ProgressCallback): Promise<void> {
    if (onProgress) {
      onProgress(progress);
    }

    debugManager.set("landProgress", `Land: ${progress.toFixed(1)}%)`);

    /// this does await the timeout!!!
    await setTimeout(() => {}, 0);
  }
}
