import * as THREE from "three";
import { Vector3 } from "three";
import TerrainDeformer from "../planet/TerrainDeformer";
import { ObjectPool } from "../utils/ObjectPool";
import { getModelKey, ProgressCallback } from "../utils/utils";
import { CachedLandVertex, MAX_INSTANCES_PER_TYPE, ModelGroup, ModelType, SpatialHashGrid } from "./models";

const vectorPool = new ObjectPool(() => new THREE.Vector3(), 10);
const matrixPool = new ObjectPool(() => new THREE.Matrix4(), 10);
const quaternionPool = new ObjectPool(() => new THREE.Quaternion(), 10);
const upVector = new THREE.Vector3(0, 1, 0);
function selectModelTypesForBatch(modelTypes: ModelType[], batchCount: number): Map<ModelType, number> {
  const selectedTypes = new Map<ModelType, number>();
  const totalWeight = modelTypes.reduce((sum, type) => sum + type.weight, 0);

  for (let i = 0; i < batchCount; i++) {
    let random = Math.random() * totalWeight;
    let weightSum = 0;

    for (const modelType of modelTypes) {
      weightSum += modelType.weight;
      if (random <= weightSum) {
        selectedTypes.set(modelType, (selectedTypes.get(modelType) || 0) + 1);
        break;
      }
    }
  }

  return selectedTypes;
}

function placeBatch(modelType: ModelType, vertices: CachedLandVertex[], count: number, matrices: Map<string, THREE.Matrix4[]>): Promise<void> {
  const randomFileIndex = modelType.files[Math.floor(Math.random() * modelType.files.length)];
  const modelKey = getModelKey("assets/models/fbx/" + modelType.filename, randomFileIndex);

  if (!matrices.has(modelKey)) {
    matrices.set(modelKey, []);
  }

  const currentMatrices = matrices.get(modelKey)!;
  const startIndex = currentMatrices.length;

  if (startIndex + count > MAX_INSTANCES_PER_TYPE) {
    console.warn(`Maximum instances reached for model ${modelKey}`);
    return Promise.resolve();
  }

  for (let i = 0; i < count; i++) {
    const vertex = vertices[Math.floor(Math.random() * vertices.length)];
    const matrix = matrixPool.acquire();

    matrix.setPosition(vertex.position);

    const quaternion = quaternionPool
      .acquire()
      .setFromUnitVectors(upVector, vertex.normal)
      .multiply(quaternionPool.acquire().setFromAxisAngle(upVector, Math.random() * Math.PI * 2));

    const rotationMatrix = matrixPool.acquire().makeRotationFromQuaternion(quaternion);
    matrix.multiply(rotationMatrix);

    currentMatrices.push(matrix.clone());
  }

  return Promise.resolve();
}

export interface PlacementStrategy {
  place(params: PlacementStrategyParams): Promise<void>;
}

export interface PlacementStrategyParams {
  group: ModelGroup;
  batchSize: number;
  matrices: Map<string, THREE.Matrix4[]>;
  spatialGrid: SpatialHashGrid;
  terrainDeformer: TerrainDeformer;
  landVertices: CachedLandVertex[];
  onProgress?: ProgressCallback;
}

export class RandomPlacement implements PlacementStrategy {
  async place(params: PlacementStrategyParams): Promise<void> {
    const { group, landVertices, batchSize, onProgress, matrices } = params;
    const promises = [];
    let totalInstances = 0;
    let placedInstances = 0;

    group.models.forEach((model) => {
      totalInstances += model.numInstances;
    });

    for (const modelType of group.models) {
      for (let i = 0; i < modelType.numInstances; i += batchSize) {
        const batchCount = Math.min(batchSize, modelType.numInstances - i);
        promises.push(
          placeBatch(modelType, landVertices, batchCount, matrices).then(() => {
            placedInstances += batchCount;
            if (onProgress) {
              onProgress((placedInstances / totalInstances) * 100);
            }
          })
        );
      }
    }
    await Promise.all(promises);
  }
}

export class VillagePlacement implements PlacementStrategy {
  async place(params: PlacementStrategyParams): Promise<void> {
    const { group, landVertices, matrices, terrainDeformer, batchSize, spatialGrid, onProgress } = params;

    const totalInstances = group.models.reduce((sum, type) => sum + type.numInstances, 0);
    let placedInstances = 0;
    const numInCluster = group.numInCluster ?? 1;
    const numClusters = Math.ceil(totalInstances / numInCluster);
    const clusterCenters = Array(numClusters)
      .fill(null)
      .map(() => landVertices[Math.floor(Math.random() * landVertices.length)]);

    for (const center of clusterCenters) {
      // Create a completely flat area for village placement
      if (terrainDeformer) {
        // Calculate village parameters
        const numHouses = group.models.find((m) => m.name === "House")?.numInstances || 0;
        const houseRadius = group.spacing || 30;
        // Make sure the flat area is large enough for all houses plus extra space
        const villageRadius = Math.max(houseRadius * 4, numHouses * houseRadius * 0.8);

        // Initial pass: Create a large depression
        let modifiedVertices = terrainDeformer.deformSmoothFalloff(
          center.position,
          -20, // Very strong downward force
          villageRadius * 2.5 // Much larger area for smooth transitions
        );

        if (!modifiedVertices || modifiedVertices.length === 0) {
          console.warn("Village placement: Initial depression failed, skipping this location");
          continue;
        }

        // Second pass: Initial flattening of the large area
        modifiedVertices = terrainDeformer.deformSmoothFalloff(center.position, -10, villageRadius * 2);

        if (!modifiedVertices || modifiedVertices.length === 0) {
          console.warn("Village placement: Secondary depression failed, skipping this location");
          continue;
        }

        // Third pass: Flatten the main area
        modifiedVertices = terrainDeformer.flatten(center.position, villageRadius * 1.5);

        if (!modifiedVertices || modifiedVertices.length === 0) {
          console.warn("Village placement: Main flattening failed, skipping this location");
          continue;
        }

        // Fourth pass: Ensure village area is perfectly flat
        modifiedVertices = terrainDeformer.flatten(center.position, villageRadius);

        if (!modifiedVertices || modifiedVertices.length === 0) {
          console.warn("Village placement: Village area flattening failed");
          continue;
        }

        // Final pass: Extra flattening for the central area
        modifiedVertices = terrainDeformer.flatten(center.position, villageRadius * 0.5);

        if (!modifiedVertices || modifiedVertices.length === 0) {
          console.warn("Village placement: Central flattening failed");
          continue;
        }
      }

      const fireModel = group.models.find((m) => m.name === "Fire");
      const houseModel = group.models.find((m) => m.name === "House");

      if (fireModel && houseModel) {
        // Place central fire
        const fireMatrix = matrixPool.acquire();
        fireMatrix.setPosition(center.position);
        const fireQuaternion = quaternionPool.acquire().setFromUnitVectors(upVector, center.normal);
        const fireRotation = matrixPool.acquire().makeRotationFromQuaternion(fireQuaternion);
        fireMatrix.multiply(fireRotation);

        const fireKey = getModelKey("assets/models/fbx/" + fireModel.filename, fireModel.files[0]);
        if (!matrices.has(fireKey)) matrices.set(fireKey, []);
        matrices.get(fireKey)!.push(fireMatrix.clone());

        // Place houses in a circle
        const numHouses = houseModel.numInstances;
        const angleStep = (Math.PI * 2) / numHouses;
        const radius = group.spacing || 30;

        for (let i = 0; i < numHouses; i++) {
          const angle = angleStep * i;
          const position = new Vector3(center.position.x + Math.cos(angle) * radius, center.position.y, center.position.z + Math.sin(angle) * radius);
          position.normalize().multiplyScalar(center.position.length());

          const matrix = matrixPool.acquire();
          matrix.setPosition(position);

          // Make houses face the center
          const toCenter = vectorPool.acquire().subVectors(center.position, position).normalize();
          const quaternion = quaternionPool
            .acquire()
            .setFromUnitVectors(upVector, center.normal)
            .multiply(quaternionPool.acquire().setFromAxisAngle(upVector, Math.atan2(toCenter.z, toCenter.x) + Math.PI));

          const rotationMatrix = matrixPool.acquire().makeRotationFromQuaternion(quaternion);
          matrix.multiply(rotationMatrix);

          const houseKey = getModelKey("assets/models/fbx/" + houseModel.filename, houseModel.files[0]);
          if (!matrices.has(houseKey)) matrices.set(houseKey, []);
          matrices.get(houseKey)!.push(matrix.clone());
        }

        placedInstances += numHouses + 1;
        if (onProgress) {
          onProgress((placedInstances / totalInstances) * 100);
        }
        continue;
      }
    }
  }
}

export class ClusteredPlacement implements PlacementStrategy {
  async place(params: PlacementStrategyParams): Promise<void> {
    const { group, landVertices, matrices, terrainDeformer, batchSize, spatialGrid, onProgress } = params;
    console.log("placeClusteredObjects " + group.type);
    const promises = [];
    const totalInstances = group.models.reduce((sum, type) => sum + type.numInstances, 0);
    let placedInstances = 0;
    const numInCluster = group.numInCluster ?? 1;
    const numClusters = Math.ceil(totalInstances / numInCluster);
    const clusterCenters = Array(numClusters)
      .fill(null)
      .map(() => landVertices[Math.floor(Math.random() * landVertices.length)]);

    for (const center of clusterCenters) {
      const nearbyVertices = spatialGrid.getNearby(center.position, group.spacing || 5);
      const numInThisCluster = Math.min(numInCluster, totalInstances);

      for (let i = 0; i < numInThisCluster; i += batchSize) {
        const batchCount = Math.min(batchSize, numInThisCluster - i);
        const selectedTypes = selectModelTypesForBatch(group.models, batchCount);

        for (const [modelType, count] of selectedTypes) {
          promises.push(
            placeBatch(modelType, nearbyVertices, count, matrices).then(() => {
              placedInstances += count;
              if (onProgress) {
                onProgress((placedInstances / totalInstances) * 100);
              }
            })
          );
        }
      }
    }
    await Promise.all(promises);
  }
}

export class NearWaterPlacement implements PlacementStrategy {
  async place(params: PlacementStrategyParams): Promise<void> {
    // Implement near water placement logic
    console.log("Placing models near water");
  }
}

export class NearStructurePlacement implements PlacementStrategy {
  async place(params: PlacementStrategyParams): Promise<void> {
    // Implement near structure placement logic
    console.log("Placing models near structures");
  }
}

export class InGroupPlacement implements PlacementStrategy {
  async place(params: PlacementStrategyParams): Promise<void> {
    // Implement in group placement logic
    console.log("Placing models in groups");
  }
}
