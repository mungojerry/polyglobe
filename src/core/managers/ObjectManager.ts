import * as THREE from "three";
import { Globe } from "../planet/Globe";
import { terrainHelper } from "../planet/terrainHelper";
import { getBiomeByElevation } from "../utils/biomes";
import { getModelKey, ProgressCallback } from "../utils/utils";
import { ModelLoader } from "./ModelLoader";
import { CachedLandVertex, ModelGroup, ModelType, SpatialHashGrid } from "./models";

// Shared interfaces
export interface InstancedMeshData {
  instancedMesh: THREE.InstancedMesh;
  originalWorldMatrix: THREE.Matrix4;
  parentMatrix?: THREE.Matrix4;
}

export interface InstancedModelGroup {
  group: THREE.Group;
  meshes: InstancedMeshData[];
}

const MAX_INSTANCES = 1000;
export class ObjectManager {
  private readonly modelLoader: ModelLoader;
  private readonly globe: Globe;
  private readonly landGeometry: THREE.BufferGeometry;
  private readonly scene: THREE.Scene;
  private readonly instancedMeshes: Map<string, InstancedModelGroup>;
  private readonly instanceCounts: Map<string, number[]>;
  private readonly landVertices: CachedLandVertex[] = [];
  private readonly spatialGrid: SpatialHashGrid;
  private readonly debugMarkers: THREE.Object3D[] = [];
  private readonly boundingBoxHelpers: Map<string, THREE.BoxHelper[]> = new Map();
  private isDebugMode = true;

  // Reusable objects to minimize garbage collection
  private static readonly tempVector = new THREE.Vector3();
  private static readonly tempNormal = new THREE.Vector3();

  constructor(globe: Globe, scene: THREE.Scene) {
    this.modelLoader = new ModelLoader(MAX_INSTANCES);
    this.globe = globe;
    this.landGeometry = this.globe.getLandGeometry();
    this.scene = scene;
    this.instancedMeshes = new Map();
    this.instanceCounts = new Map();
    this.spatialGrid = new SpatialHashGrid(25);
    this.cacheLandVertices();
    this.setDebugMode(this.isDebugMode);
  }

  private cacheLandVertices(): void {
    const positions = this.landGeometry.attributes.position;

    for (let i = 0; i < positions.count; i++) {
      ObjectManager.tempVector.fromBufferAttribute(positions, i);
      ObjectManager.tempNormal.copy(ObjectManager.tempVector).normalize();

      if (terrainHelper.isLand(ObjectManager.tempNormal)) {
        const biome = getBiomeByElevation(
          terrainHelper.computeSurfaceHeight(ObjectManager.tempNormal.x, ObjectManager.tempNormal.y, ObjectManager.tempNormal.z)
        );

        const vertex: CachedLandVertex = {
          position: ObjectManager.tempVector.clone(), // Only clone when necessary
          normal: ObjectManager.tempNormal.clone(),
          cellKey: "",
          biome: biome.biome,
        };

        this.landVertices.push(vertex);
        this.spatialGrid.add(vertex);
      }
    }
  }

  public setDebugMode(enabled: boolean): void {
    this.isDebugMode = enabled;
    this.debugMarkers.forEach((marker) => (marker.visible = enabled));
    // Toggle bounding box visibility
    this.boundingBoxHelpers.forEach((helpers) => {
      helpers.forEach((helper) => (helper.visible = enabled));
    });
  }
  private addDebugMarker(position: THREE.Vector3, scale: number): void {
    if (!this.isDebugMode) return;

    const marker = new THREE.Mesh(new THREE.SphereGeometry(scale, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true }));

    marker.position.copy(position);
    marker.visible = this.isDebugMode;
    this.debugMarkers.push(marker);
    this.scene.add(marker);
  }

  private createBoundingBoxHelper(mesh: THREE.Mesh | THREE.InstancedMesh, modelKey: string, color: number = 0xffff00): void {
    if (!this.isDebugMode) return;

    const boxHelper = new THREE.BoxHelper(mesh, color);
    boxHelper.visible = this.isDebugMode;
    this.scene.add(boxHelper);

    // Store the helper for later reference
    if (!this.boundingBoxHelpers.has(modelKey)) {
      this.boundingBoxHelpers.set(modelKey, []);
    }
    this.boundingBoxHelpers.get(modelKey)!.push(boxHelper);

    // For instanced meshes, we need to update the box helper after matrix updates
    if (mesh instanceof THREE.InstancedMesh) {
      // Store original setMatrixAt method
      const originalSetMatrixAt = mesh.setMatrixAt.bind(mesh);

      // Override setMatrixAt to update box helper after matrix changes
      mesh.setMatrixAt = (index: number, matrix: THREE.Matrix4) => {
        originalSetMatrixAt(index, matrix);
        // Only update the box helper if the instance matrix was actually changed
        boxHelper.update();
      };
    }
  }
  private async preloadModelVariants(modelType: ModelType, onProgress?: ProgressCallback): Promise<void> {
    const promises = modelType.files.map(async (fileIndex) => {
      const modelKey = getModelKey(modelType.filename, fileIndex);

      if (!this.instancedMeshes.has(modelKey)) {
        const modelData = await this.modelLoader.loadModelForInstancing(modelType.filename, fileIndex, modelType.scale || 1, modelType.noLeadingZero);

        const instanceGroup = new THREE.Group();
        const instancedMeshArray: InstancedMeshData[] = [];

        modelData.meshes.forEach((meshData) => {
          const { instancedMesh, originalWorldMatrix, parentMatrix } = meshData;

          instancedMesh.castShadow = true;
          // instancedMesh.receiveShadow = true;
          // instancedMesh.visible = true;
          // (instancedMesh.material as THREE.MeshPhongMaterial).color = new THREE.Color(255, 0, 0);
          instanceGroup.add(instancedMesh);

          instancedMeshArray.push({
            instancedMesh,
            originalWorldMatrix,
            parentMatrix,
          });

          if (this.isDebugMode) {
            this.createBoundingBoxHelper(instancedMesh, modelKey);
          }
        });
        instanceGroup.castShadow = true;
        instanceGroup.receiveShadow = true;
        const instancedModelGroup: InstancedModelGroup = {
          group: instanceGroup,
          meshes: instancedMeshArray,
        };

        this.instancedMeshes.set(modelKey, instancedModelGroup);
        this.instanceCounts.set(modelKey, new Array(instancedMeshArray.length).fill(0));
        this.scene.add(instanceGroup);
      }
    });

    await Promise.all(promises);
  }

  public async placeObjects(modelGroups: ModelGroup[], onProgress?: ProgressCallback): Promise<void> {
    // Phase 1: Preload models (30% of total progress)
    const totalModels = modelGroups.reduce((sum, group) => sum + group.models.length, 0);
    let loadedModels = 0;

    const preloadPromises = modelGroups.flatMap((group) =>
      group.models.map(async (model) => {
        await this.preloadModelVariants(model, (_) => {
          // Handle progress updates
          loadedModels++;
          if (onProgress) {
            onProgress((loadedModels / totalModels) * 30);
          }
        });
      })
    );

    await Promise.all(preloadPromises);

    // Phase 2: Place instances (70% of total progress)
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
          const key = getModelKey(model.filename, fileIndex);
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
    this.applyTransforms(matrices);

    if (onProgress) {
      onProgress(100);
    }
  }

  private applyTransforms(matrices: Map<string, THREE.Matrix4[]>): void {
    const tempMatrix = new THREE.Matrix4();

    matrices.forEach((matrixArray, modelKey) => {
      const instancedModelGroup = this.instancedMeshes.get(modelKey);
      if (!instancedModelGroup) return;

      instancedModelGroup.meshes.forEach((instanceData) => {
        const { instancedMesh, originalWorldMatrix } = instanceData;
        const tempPosition = new THREE.Vector3();
        for (let i = 0; i < matrixArray.length; i++) {
          tempMatrix.copy(originalWorldMatrix);
          tempMatrix.premultiply(matrixArray[i]);
          tempMatrix.scale(new THREE.Vector3(5, 5, 5));
          instancedMesh.setMatrixAt(i, tempMatrix);

          if (this.isDebugMode) {
            tempPosition.setFromMatrixPosition(tempMatrix);
            this.addDebugMarker(tempPosition, 1);
          }
        }

        instancedMesh.count = matrixArray.length;
        instancedMesh.instanceMatrix.needsUpdate = true;
      });
    });
  }
  private getRandomModelVariant(modelType: ModelType): string {
    const basePath = modelType.filename;
    const randomIndex = Math.floor(Math.random() * modelType.files.length);
    return getModelKey(basePath, modelType.files[randomIndex]);
  }

  public dispose(): void {
    // Clean up resources
    this.instancedMeshes.forEach(({ group, meshes }) => {
      meshes.forEach((mesh) => {
        mesh.instancedMesh.geometry.dispose();
        if (mesh.instancedMesh.material instanceof THREE.Material) {
          mesh.instancedMesh.material.dispose();
        }
      });
      this.scene.remove(group);
    });

    // Clean up debug markers
    this.debugMarkers.forEach((marker) => {
      if (marker instanceof THREE.Mesh) {
        marker.geometry.dispose();
        if (marker.material instanceof THREE.Material) {
          marker.material.dispose();
        }
      }
      this.scene.remove(marker);
    });

    // Clean up bounding box helpers
    this.boundingBoxHelpers.forEach((helpers) => {
      helpers.forEach((helper) => {
        this.scene.remove(helper);
        if (helper.material instanceof THREE.Material) {
          helper.material.dispose();
        }
      });
    });

    this.debugMarkers.length = 0;
    this.boundingBoxHelpers.clear();
    this.instancedMeshes.clear();
    this.instanceCounts.clear();
    this.landVertices.length = 0;
  }
}
