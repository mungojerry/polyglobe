import * as THREE from "three";
import { BufferGeometry } from "three";
import { debugManager } from "../managers/debugManager";
import { getTerrainColor } from "../utils/biomes";
import { ProgressCallback, yieldToMainThread } from "../utils/utils";
import { BaseNoise } from "./noise/BaseNoise";
import { terrainHelper } from "./terrainHelper";

interface PrefabPlacement {
  direction: THREE.Vector3;
  radius: number;
  innerRadius: number; // radius of fully flat area
  outerRadius: number; // radius of blend zone
}

export class LandGeometryGenerator {
  private prefabs: PrefabPlacement[] = [];
  private paintItRed: boolean = true;

  public addPrefabPlacement(position: THREE.Vector3, radius: number) {
    this.prefabs.push({
      direction: position.clone().normalize(),
      radius,
      innerRadius: radius * 0.7, // Core flat area
      outerRadius: radius, // Full influence radius
    });
  }

  private computeBlendFactor(distance: number, innerRadius: number, outerRadius: number): number {
    if (distance <= innerRadius) return 1.0;
    if (distance >= outerRadius) return 0.0;

    // Smooth step function for better transition
    const x = (distance - innerRadius) / (outerRadius - innerRadius);
    return 1 - x * x * (3 - 2 * x);
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

        const point = new THREE.Vector3(x, y, z);
        const direction = point.clone().normalize();
        const latitude = Math.asin(direction.y);

        // Get the normal terrain height
        const normalHeight = terrainHelper.computeSurfaceHeight(direction.x, direction.y, direction.z);
        let finalHeight = normalHeight;
        let totalWeight = 0;
        let maxBlendFactor = 0;

        // Process all prefab influences
        for (const prefab of this.prefabs) {
          const angle = direction.angleTo(prefab.direction);
          const surfaceDistance = angle * radius;

          if (surfaceDistance < prefab.outerRadius) {
            const blendFactor = this.computeBlendFactor(surfaceDistance, prefab.innerRadius, prefab.outerRadius);

            if (blendFactor > 0) {
              // For flat areas, we want the height at the center of the prefab
              const prefabHeight = terrainHelper.computeSurfaceHeight(prefab.direction.x, prefab.direction.y, prefab.direction.z);

              totalWeight += blendFactor;
              finalHeight = finalHeight * (1 - blendFactor) + prefabHeight * blendFactor;
              maxBlendFactor = Math.max(maxBlendFactor, blendFactor);
            }
          }
        }

        // Normalize if we have multiple influences
        if (totalWeight > 1) {
          finalHeight = normalHeight * (1 - totalWeight) + finalHeight;
        }

        // Calculate final elevation multiplier
        const elevation = terrainHelper.computeElevationMultiplier(finalHeight);

        // Color handling
        if (maxBlendFactor > 0) {
          // Blend between terrain color and flattened area color
          const terrainColor = getTerrainColor(normalHeight, latitude);
          if (this.paintItRed) {
            colors[idx] = 1;
            colors[idx + 1] = 0;
            colors[idx + 2] = 0;
          } else {
            colors[idx] = terrainColor.r * (1 - maxBlendFactor) + 0.8 * maxBlendFactor;
            colors[idx + 1] = terrainColor.g * (1 - maxBlendFactor) + 0.7 * maxBlendFactor;
            colors[idx + 2] = terrainColor.b * (1 - maxBlendFactor) + 0.7 * maxBlendFactor;
          }
        } else {
          const color = getTerrainColor(normalHeight, latitude);
          colors[idx] = color.r;
          colors[idx + 1] = color.g;
          colors[idx + 2] = color.b;
        }

        // Apply final position
        vertices[idx] = x * elevation;
        vertices[idx + 1] = y * elevation;
        vertices[idx + 2] = z * elevation;

        indices[j] = j;
      }

      const progress = Math.min((end / totalVertices) * 90, 99);
      await this.updateTotalProgress(progress, onProgress);
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();

    const end = performance.now();
    debugManager.set("landGeometry", "land geometry time: " + (end - start).toFixed(4));
    return geometry;
  }

  private async updateTotalProgress(progress: number, onProgress?: ProgressCallback): Promise<void> {
    if (onProgress) {
      onProgress(progress);
    }

    debugManager.set("landProgress", `Land: ${progress.toFixed(1)}%`);
    await yieldToMainThread();
  }
}
