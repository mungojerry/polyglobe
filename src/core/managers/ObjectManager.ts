import * as THREE from "three";
import { Globe } from "../planet/Globe";
import { terrainHelper } from "../planet/terrainHelper";
import { getBiomeByElevation } from "../utils/biomes";
import { getModelKey, ProgressCallback } from "../utils/utils";
import { ModelLoader } from "./ModelLoader";
import { CachedLandVertex, MAX_INSTANCES_PER_TYPE, ModelGroup, ModelType, SpatialHashGrid } from "./models";

export class ObjectManager {
  private modelLoader: ModelLoader;
  private globe: Globe;
  private landGeometry: THREE.BufferGeometry;
  private scene: THREE.Scene;
  private instancedMeshes: Map<string, THREE.InstancedMesh>;
  private instanceCounts: Map<string, number>;

  private landVertices: CachedLandVertex[] = [];
  private spatialGrid: SpatialHashGrid;

  constructor(globe: Globe, scene: THREE.Scene) {
    this.modelLoader = new ModelLoader();
    this.globe = globe;
    this.landGeometry = this.globe.getLandGeometry();
    this.scene = scene;
    this.instancedMeshes = new Map();
    this.instanceCounts = new Map();

    this.spatialGrid = new SpatialHashGrid(25);
    this.cacheLandVertices();
  }

  private cacheLandVertices(): void {
    const positions = this.landGeometry.attributes.position;
    const tempVector = new THREE.Vector3();
    const tempNormal = new THREE.Vector3();

    for (let i = 0; i < positions.count; i++) {
      tempVector.fromBufferAttribute(positions, i);
      tempNormal.copy(tempVector).normalize();
      const biome = getBiomeByElevation(terrainHelper.computeSurfaceHeight(tempNormal.x, tempNormal.y, tempNormal.z));
      if (terrainHelper.isLand(tempNormal)) {
        const vertex: CachedLandVertex = {
          position: tempVector.clone(),
          normal: tempNormal.clone(),
          cellKey: "",
          biome,
        };
        this.landVertices.push(vertex);
        this.spatialGrid.add(vertex);
      }
    }
  }

  private async preloadModelVariants(modelType: ModelType, onProgress?: ProgressCallback): Promise<void> {
    const basePath = "assets/models/fbx/" + modelType.filename;
    const totalFiles = modelType.files.length;
    let loadedFiles = 0;

    const promises = modelType.files.map(async (fileIndex) => {
      const modelKey = getModelKey(basePath, fileIndex);
      if (!this.instancedMeshes.has(modelKey)) {
        const modelData = await this.modelLoader.loadModelForInstancing(basePath, fileIndex);
        modelData.geometry.computeBoundingBox();
        modelData.geometry.computeBoundingSphere();
        const instancedMesh = new THREE.InstancedMesh(modelData.geometry, modelData.material, MAX_INSTANCES_PER_TYPE);
        instancedMesh.castShadow = true;
        instancedMesh.receiveShadow = true;
        instancedMesh.count = 0;
        instancedMesh.frustumCulled = false;
        this.instancedMeshes.set(modelKey, instancedMesh);
        this.instanceCounts.set(modelKey, 0);
        this.scene.add(instancedMesh);

        loadedFiles++;
        if (onProgress) {
          onProgress((loadedFiles / totalFiles) * 100);
        }
      }
    });
    await Promise.all(promises);
  }

  private getRandomModelVariant(modelType: ModelType): string {
    const basePath = "assets/models/fbx/" + modelType.filename;
    const randomIndex = Math.floor(Math.random() * modelType.files.length);
    return getModelKey(basePath, modelType.files[randomIndex]);
  }

  public async placeObjects(modelGroups: ModelGroup[], onProgress?: ProgressCallback): Promise<void> {
    let totalProgress = 0;

    // Phase 1: Preload models (30% of total progress)
    const totalModels = modelGroups.reduce((sum, group) => sum + group.models.length, 0);
    let loadedModels = 0;

    const preloadPromises = modelGroups.flatMap((group) =>
      group.models.map(async (model) => {
        await this.preloadModelVariants(model, (modelProgress) => {
          if (onProgress) {
            const phaseProgress = (loadedModels + modelProgress / 100) / totalModels;
            onProgress(phaseProgress * 30);
          }
        });
        loadedModels++;
      })
    );
    await Promise.all(preloadPromises);
    totalProgress = 30;

    // Phase 2: Place objects (70% of total progress)
    const matrices: Map<string, THREE.Matrix4[]> = new Map();
    const modelVariants: Map<string, ModelType> = new Map();
    const batchSize = 100;
    let processedGroups = 0;
    const totalGroups = modelGroups.length;

    for (const group of modelGroups) {
      console.log("attempting placement: " + group.type);

      // Initialize empty matrix arrays for all variants of each model
      group.models.forEach((model) => {
        model.files.forEach((fileIndex) => {
          const key = getModelKey("assets/models/fbx/" + model.filename, fileIndex);
          matrices.set(key, []);
          modelVariants.set(key, model);
        });
      });

      group.placement.place({
        batchSize,
        group,
        landVertices: this.landVertices,
        matrices,
        terrainDeformer: this.globe.terrainDeformer,
        spatialGrid: this.spatialGrid,
        onProgress,
        getRandomVariant: (modelType: ModelType) => this.getRandomModelVariant(modelType),
      });

      processedGroups++;
      const progress = 30 + (processedGroups / totalGroups) * 60;
      if (onProgress) onProgress(progress);
    }
    if (onProgress) {
      onProgress(95);
    }
    // Apply matrices
    matrices.forEach((matrixArray, modelKey) => {
      const instancedMesh = this.instancedMeshes.get(modelKey)!;
      for (let i = 0; i < matrixArray.length; i += batchSize) {
        const end = Math.min(i + batchSize, matrixArray.length);
        for (let j = i; j < end; j++) {
          instancedMesh.setMatrixAt(j, matrixArray[j]);
        }
      }
      instancedMesh.count = matrixArray.length;
      instancedMesh.instanceMatrix.needsUpdate = true;
    });

    if (onProgress) {
      onProgress(100);
    }
  }
}
