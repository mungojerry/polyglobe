import * as THREE from "three";
import { Vector3 } from "three";
import { TerrainDeformer } from "../planet/TerrainDeformer";
import { BiomeName } from "../utils/biomes";
import { ObjectPool } from "../utils/ObjectPool";
import { ProgressCallback } from "../utils/utils";
import { CachedLandVertex, ModelGroup, ModelType, SpatialHashGrid } from "./models";

// Pools and constants
const vectorPool = new ObjectPool<THREE.Vector3>(10, () => new THREE.Vector3(), 10);
const matrixPool = new ObjectPool<THREE.Matrix4>(10, () => new THREE.Matrix4(), 10);
const quaternionPool = new ObjectPool<THREE.Quaternion>(10, () => new THREE.Quaternion(), 10);
const upVector = new THREE.Vector3(0, 1, 0);

// Types for specialized placement parameters
interface TerrainModificationParams {
  center: THREE.Vector3;
  radius: number;
  strength?: number;
}

interface CircularPlacementParams {
  center: CachedLandVertex;
  radius: number;
  count: number;
  faceCenter?: boolean;
}

interface GridPlacementParams {
  center: CachedLandVertex;
  size: number;
  spacing: number;
}

// Utility functions
class PlacementUtils {
  static selectModelTypesForBatch(modelTypes: ModelType[], batchCount: number): Map<ModelType, number> {
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

  static filterVerticesByBiome(vertices: CachedLandVertex[], allowedBiomes?: BiomeName[]): CachedLandVertex[] {
    if (!allowedBiomes) return vertices;
    return vertices.filter((vertex) => vertex.biome && allowedBiomes.includes(vertex.biome.name));
  }

  static async distributeRemainingModels(
    models: ModelType[],
    excludeNames: string[],
    center: CachedLandVertex,
    radius: number,
    matrices: Map<string, THREE.Matrix4[]>,
    getRandomVariant: (modelType: ModelType) => string
  ): Promise<number> {
    const remainingModels = models.filter((model) => !excludeNames.includes(model.name));
    let placedCount = 0;

    for (const model of remainingModels) {
      console.log(`Distributing ${model.numInstances} instances of ${model.name}`);
      const batchPromises: Promise<void>[] = [];

      for (let i = 0; i < model.numInstances; i++) {
        const angle = Math.random() * Math.PI * 2;
        // Use sqrt for better radial distribution
        const distance = Math.sqrt(Math.random()) * radius;
        const position = PlacementUtils.getPositionInCircle(center.position, distance, angle);

        const matrix = PlacementUtils.createPlacementMatrix(position, center.normal, true);
        const modelKey = getRandomVariant(model);

        if (!matrices.has(modelKey)) {
          matrices.set(modelKey, []);
        }
        matrices.get(modelKey)!.push(matrix.clone());
        placedCount++;
      }

      await Promise.all(batchPromises);
    }

    return placedCount;
  }

  static createPlacementMatrix(position: THREE.Vector3, normal: THREE.Vector3, randomRotation = true): THREE.Matrix4 {
    const matrix = matrixPool.acquire();
    matrix.setPosition(position);

    // First align with surface normal
    const alignQuaternion = quaternionPool.acquire().setFromUnitVectors(upVector, normal);

    if (randomRotation) {
      // Create random rotation around the aligned normal vector
      const randomRotationQuat = quaternionPool.acquire().setFromAxisAngle(normal, Math.random() * Math.PI * 2);
      alignQuaternion.multiply(randomRotationQuat);
    }

    const rotationMatrix = matrixPool.acquire().makeRotationFromQuaternion(alignQuaternion);
    return matrix.multiply(rotationMatrix);
  }

  static flattenTerrainArea(terrainDeformer: TerrainDeformer, params: TerrainModificationParams): boolean {
    const { center, radius, strength = -20 } = params;

    // Initial depression for smooth transitions
    let modifiedVertices = terrainDeformer.deformSmoothFalloff(center, strength, radius * 2.5);
    if (!modifiedVertices?.length) return false;

    // Secondary flattening
    modifiedVertices = terrainDeformer.deformSmoothFalloff(center, strength / 2, radius * 2);
    if (!modifiedVertices?.length) return false;

    // Final precise flattening
    modifiedVertices = terrainDeformer.flatten(center, radius * 1.5);
    return modifiedVertices?.length > 0;
  }

  static getPositionInCircle(center: Vector3, radius: number, angle: number): Vector3 {
    return new Vector3(center.x + Math.cos(angle) * radius, center.y, center.z + Math.sin(angle) * radius).normalize().multiplyScalar(center.length());
  }

  static getRandomVertex(vertices: CachedLandVertex[]): CachedLandVertex {
    return vertices[Math.floor(Math.random() * vertices.length)];
  }
}

// Base interfaces
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
  getRandomVariant: (modelType: ModelType) => string;
}

// Base placement strategy with common functionality
abstract class BasePlacementStrategy implements PlacementStrategy {
  protected async placeModel(
    modelType: ModelType,
    position: THREE.Vector3,
    normal: THREE.Vector3,
    matrices: Map<string, THREE.Matrix4[]>,
    getRandomVariant: (modelType: ModelType) => string,
    randomRotation = true
  ): Promise<void> {
    const matrix = PlacementUtils.createPlacementMatrix(position, normal, randomRotation);
    const modelKey = getRandomVariant(modelType);

    if (!matrices.has(modelKey)) {
      matrices.set(modelKey, []);
    }

    matrices.get(modelKey)!.push(matrix.clone());
  }

  protected async placeModelsInCircle(
    params: CircularPlacementParams,
    modelType: ModelType,
    matrices: Map<string, THREE.Matrix4[]>,
    getRandomVariant: (modelType: ModelType) => string
  ): Promise<void> {
    const { center, radius, count, faceCenter = false } = params;
    const angleStep = (Math.PI * 2) / count;

    for (let i = 0; i < count; i++) {
      const angle = angleStep * i;
      const position = PlacementUtils.getPositionInCircle(center.position, radius, angle);
      await this.placeModel(modelType, position, center.normal, matrices, getRandomVariant, !faceCenter);
    }
  }

  protected async placeModelsInGrid(
    params: GridPlacementParams,
    modelType: ModelType,
    matrices: Map<string, THREE.Matrix4[]>,
    getRandomVariant: (modelType: ModelType) => string
  ): Promise<void> {
    const { center, size, spacing } = params;
    const startOffset = -((size - 1) * spacing) / 2;

    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const position = new Vector3(center.position.x + startOffset + col * spacing, center.position.y, center.position.z + startOffset + row * spacing)
          .normalize()
          .multiplyScalar(center.position.length());

        await this.placeModel(modelType, position, center.normal, matrices, getRandomVariant, false);
      }
    }
  }

  protected updateProgress(current: number, total: number, onProgress?: ProgressCallback) {
    if (onProgress) {
      onProgress((current / total) * 100);
    }
  }

  abstract place(params: PlacementStrategyParams): Promise<void>;
}

export class RandomPlacement extends BasePlacementStrategy {
  async place(params: PlacementStrategyParams): Promise<void> {
    const { group, landVertices, batchSize, onProgress, matrices, getRandomVariant } = params;
    console.log("placeRandom " + group.type);

    const validVertices = PlacementUtils.filterVerticesByBiome(landVertices, group.biomes);
    if (validVertices.length === 0) {
      console.warn(`No valid vertices found for biome(s): ${group.biomes?.join(", ")}`);
      return;
    }

    const promises = [];
    let placedInstances = 0;
    const totalInstances = group.models.reduce((sum, model) => sum + model.numInstances, 0);
    console.log(`Placing ${totalInstances} instances for ${group.type}`);

    // Process each model type
    for (const modelType of group.models) {
      console.log(`Placing ${modelType.numInstances} instances of ${modelType.name}`);
      const remainingInstances = modelType.numInstances;
      const numBatches = Math.ceil(remainingInstances / batchSize);

      // Create batches for parallel processing
      for (let batchIndex = 0; batchIndex < numBatches; batchIndex++) {
        const startIdx = batchIndex * batchSize;
        const batchCount = Math.min(batchSize, remainingInstances - startIdx);

        promises.push(
          (async () => {
            const batchPromises = [];
            for (let j = 0; j < batchCount; j++) {
              const vertex = PlacementUtils.getRandomVertex(validVertices);
              batchPromises.push(this.placeModel(modelType, vertex.position, vertex.normal, matrices, getRandomVariant));
            }
            await Promise.all(batchPromises);
            placedInstances += batchCount;
            this.updateProgress(placedInstances, totalInstances, onProgress);
          })()
        );
      }
    }

    await Promise.all(promises);
    console.log(`Completed placing ${placedInstances}/${totalInstances} instances for ${group.type} in biome(s): ${group.biomes?.join(", ")}`);
  }
}

export class VillagePlacement extends BasePlacementStrategy {
  async place(params: PlacementStrategyParams): Promise<void> {
    const { group, landVertices, matrices, terrainDeformer, getRandomVariant, onProgress } = params;
    console.log("placeVillage " + group.type);

    // First filter vertices by biome
    const validVertices = PlacementUtils.filterVerticesByBiome(landVertices, group.biomes);
    if (validVertices.length === 0) {
      console.warn(`No valid vertices found for biome(s): ${group.biomes?.join(", ")}`);
      return;
    }

    console.log(`Found ${validVertices.length} valid vertices in biome(s): ${group.biomes?.join(", ")}`);
    const totalInstances = group.models.reduce((sum, type) => sum + type.numInstances, 0);
    let placedInstances = 0;
    const numInCluster = group.numInCluster ?? 1;
    const numClusters = Math.ceil(totalInstances / numInCluster);

    const clusterCenters = Array(numClusters)
      .fill(null)
      .map(() => PlacementUtils.getRandomVertex(validVertices));

    for (const center of clusterCenters) {
      if (terrainDeformer) {
        const numHouses = group.models.find((m) => m.name === "House")?.numInstances || 0;
        const houseRadius = group.spacing || 30;
        const villageRadius = Math.max(houseRadius * 4, numHouses * houseRadius * 0.8);

        if (
          !PlacementUtils.flattenTerrainArea(terrainDeformer, {
            center: center.position,
            radius: villageRadius,
            strength: -20,
          })
        ) {
          console.warn("Village placement: Terrain flattening failed, skipping location");
          continue;
        }
      }

      const fireModel = group.models.find((m) => m.name === "Fire");
      const houseModel = group.models.find((m) => m.name === "House");

      // Place central fire if exists
      if (fireModel) {
        await this.placeModel(fireModel, center.position, center.normal, matrices, getRandomVariant);
        placedInstances++;
      }

      // Place houses in a circle if exists
      if (houseModel) {
        await this.placeModelsInCircle(
          {
            center,
            radius: group.spacing || 30,
            count: houseModel.numInstances,
            faceCenter: true,
          },
          houseModel,
          matrices,
          getRandomVariant
        );
        placedInstances += houseModel.numInstances;
      }

      // Distribute remaining models in a random pattern around the village
      const additionalInstances = await PlacementUtils.distributeRemainingModels(
        group.models,
        ["Fire", "House"],
        center,
        (group.spacing || 30) * 1.5, // Slightly larger radius for other models
        matrices,
        getRandomVariant
      );
      placedInstances += additionalInstances;
      this.updateProgress(placedInstances, totalInstances, onProgress);
    }
  }
}

export class ClusteredPlacement extends BasePlacementStrategy {
  async place(params: PlacementStrategyParams): Promise<void> {
    const { group, landVertices, matrices, batchSize, spatialGrid, onProgress, getRandomVariant } = params;
    console.log("ClusteredPlacement attempt " + group.type);

    // First filter vertices by biome
    const validVertices = PlacementUtils.filterVerticesByBiome(landVertices, group.biomes);
    if (validVertices.length === 0) {
      console.warn(`No valid vertices found for biome(s): ${group.biomes?.join(", ")}`);
      return;
    }

    console.log(`Found ${validVertices.length} valid vertices in biome(s): ${group.biomes?.join(", ")}`);
    const totalInstances = group.models.reduce((sum, type) => sum + type.numInstances, 0);
    let placedInstances = 0;
    const numInCluster = group.numInCluster ?? 1;

    // Calculate how many clusters we need to place all instances
    const totalClusters = Math.ceil(
      group.models.reduce((max, model) => Math.max(max, Math.ceil(model.numInstances / (numInCluster / group.models.length))), 0)
    );

    console.log(`Creating ${totalClusters} clusters to place ${totalInstances} instances for ${group.type}`);

    const clusterCenters = Array(totalClusters)
      .fill(null)
      .map(() => PlacementUtils.getRandomVertex(validVertices));

    const promises = [];

    // Process each cluster
    for (const center of clusterCenters) {
      // Get nearby vertices and filter by biome
      const nearbyVertices = spatialGrid
        .getNearby(center.position, group.spacing || 5)
        .filter((vertex) => vertex.biome && (!group.biomes || group.biomes.includes(vertex.biome.name)));

      if (nearbyVertices.length === 0) {
        console.warn(`No valid vertices found near cluster center in biome(s): ${group.biomes?.join(", ")}`);
        continue;
      }

      // Process each model type
      for (const modelType of group.models) {
        // Calculate instances per cluster for this model type
        const instancesPerCluster = Math.ceil(modelType.numInstances / totalClusters);

        // Create batches for this model in this cluster
        for (let i = 0; i < instancesPerCluster; i += batchSize) {
          const batchCount = Math.min(batchSize, instancesPerCluster - i);

          promises.push(
            (async () => {
              const batchPromises = [];
              for (let j = 0; j < batchCount; j++) {
                const vertex = PlacementUtils.getRandomVertex(nearbyVertices);
                batchPromises.push(this.placeModel(modelType, vertex.position, vertex.normal, matrices, getRandomVariant));
              }
              await Promise.all(batchPromises);
              placedInstances += batchCount;
              this.updateProgress(placedInstances, totalInstances, onProgress);
            })()
          );
        }
      }
    }

    await Promise.all(promises);
    console.log(`Completed placing ${placedInstances}/${totalInstances} instances for ${group.type}`);
  }
}

export class LandingPadPlacement extends BasePlacementStrategy {
  async place(params: PlacementStrategyParams): Promise<void> {
    const { group, landVertices, matrices, terrainDeformer, onProgress, getRandomVariant } = params;
    console.log("placeLandingPad " + group.type);

    // First filter vertices by biome
    const validVertices = PlacementUtils.filterVerticesByBiome(landVertices, group.biomes);
    if (validVertices.length === 0) {
      console.warn(`No valid vertices found for biome(s): ${group.biomes?.join(", ")}`);
      return;
    }

    console.log(`Found ${validVertices.length} valid vertices in biome(s): ${group.biomes?.join(", ")}`);
    const center = PlacementUtils.getRandomVertex(validVertices);
    const padSize = 30;
    const tileSpacing = group.spacing || 10;
    const padRadius = (padSize * tileSpacing) / 2;
    const totalTiles = padSize * padSize;
    let placedTiles = 0;

    if (
      terrainDeformer &&
      !PlacementUtils.flattenTerrainArea(terrainDeformer, {
        center: center.position,
        radius: padRadius,
        strength: -20,
      })
    ) {
      console.warn("Landing pad placement: Terrain flattening failed");
      return;
    }

    const startOffset = -((padSize - 1) * tileSpacing) / 2;

    for (let row = 0; row < padSize; row++) {
      for (let col = 0; col < padSize; col++) {
        const position = new Vector3(
          center.position.x + startOffset + col * tileSpacing,
          center.position.y,
          center.position.z + startOffset + row * tileSpacing
        )
          .normalize()
          .multiplyScalar(center.position.length());

        // Randomly select a model from the group for each tile
        const modelType = group.models[Math.floor(Math.random() * group.models.length)];
        await this.placeModel(modelType, position, center.normal, matrices, getRandomVariant, false);

        placedTiles++;
        this.updateProgress(placedTiles, totalTiles, onProgress);
      }
    }
    console.log(`Completed placing landing pad with ${placedTiles} tiles in biome(s): ${group.biomes?.join(", ")}`);
  }
}

// Placeholder strategies
export class NearWaterPlacement extends BasePlacementStrategy {
  async place(params: PlacementStrategyParams): Promise<void> {
    console.log("Placing models near water");
  }
}

export class NearStructurePlacement extends BasePlacementStrategy {
  async place(params: PlacementStrategyParams): Promise<void> {
    console.log("Placing models near structures");
  }
}

export class InGroupPlacement extends BasePlacementStrategy {
  async place(params: PlacementStrategyParams): Promise<void> {
    console.log("Placing models in groups");
  }
}
