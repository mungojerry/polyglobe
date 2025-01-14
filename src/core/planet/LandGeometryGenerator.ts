import * as THREE from "three";
import { BufferGeometry } from "three";
import { debugManager } from "../managers/debugManager";
import { getTerrainColor } from "../utils/biomes";
import { ProgressCallback, yieldToMainThread } from "../utils/utils";
import { BaseNoise } from "./noise/BaseNoise";
import { terrainHelper } from "./terrainHelper";

interface PrefabPlacement {
  position: THREE.Vector3; // Position in spherical coordinates
  radius: number; // Radius of the flat area
}

export class LandGeometryGenerator {
  private prefabs: PrefabPlacement[] = [];
  constructor() {}
  public addPrefabPlacement(position: THREE.Vector3, radius: number) {
    // Normalize the position to ensure it's on the sphere surface
    const normalized = position.clone().normalize();
    this.prefabs.push({ position: normalized, radius });
  }

  private isInPrefabArea(nx: number, ny: number, nz: number): PrefabPlacement | null {
    const point = new THREE.Vector3(nx, ny, nz);

    for (const prefab of this.prefabs) {
      // Calculate angular distance between point and prefab center
      const angle = Math.acos(point.dot(prefab.position));

      // If within prefab radius (converted to radians), return the prefab
      if (angle < prefab.radius / prefab.position.length()) {
        return prefab;
      }
    }

    return null;
  }

  private smoothStepToFlat(distance: number, radius: number): number {
    // Create a smooth transition from normal terrain to flat area
    const t = Math.max(0, Math.min(1, distance / radius));
    return t * t * (3 - 2 * t);
  }
  public async generateLand(radius: number, detail: number, seed: number, noise: BaseNoise, onProgress?: ProgressCallback): Promise<BufferGeometry> {
    const start = performance.now();
    const geometry = new BufferGeometry();
    const icosahedron = new THREE.IcosahedronGeometry(radius + 0.2, detail);
    const positionAttr = icosahedron.attributes.position;
    const vertexCount = positionAttr.count;

    const vertices = new Float32Array(vertexCount * 3);
    const colors = new Float32Array(vertexCount * 3);
    const indices = new Uint32Array(vertexCount);
    const posArray = positionAttr.array;

    terrainHelper.setDefaults(noise, geometry);

    const CHUNK_SIZE = 1024;
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

        // Check if point is in a prefab area
        const prefab = this.isInPrefabArea(x, y, z);
        let elevation;
        let height = terrainHelper.computeSurfaceHeight(nx, ny, nz);

        if (prefab) {
          // For prefab areas, use a fixed elevation based on the prefab's position
          height = terrainHelper.computeSurfaceHeight(prefab.position.x, prefab.position.y, prefab.position.z);
          const point = new THREE.Vector3(x, y, z);
          const angle = Math.acos(point.dot(prefab.position));
          const blend = this.smoothStepToFlat(angle, prefab.radius / prefab.position.length());

          const normalElevation = terrainHelper.computeSurfaceHeight(nx, ny, nz);
          elevation = terrainHelper.computeElevationMultiplier(normalElevation * blend + height * (1 - blend));
        } else {
          // Normal terrain generation
          elevation = terrainHelper.computeElevationMultiplier(height);
        }

        vertices[idx] = x * elevation;
        vertices[idx + 1] = y * elevation;
        vertices[idx + 2] = z * elevation;

        // const height = elevation / (radius + 0.2);
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

    debugManager.set("landProgress", `Land: ${progress.toFixed(1)}%`);

    /// this does await the timeout!!!
    await yieldToMainThread();
  }
}
