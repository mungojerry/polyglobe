import * as THREE from "three";
import { Globe } from "../planet/Globe";
import { terrainHelper } from "../planet/terrainHelper";
import { getBiomeByElevation } from "../utils/biomes";
import { getModelKey, ProgressCallback } from "../utils/utils";
import { ModelLoader } from "./ModelLoader";
import { CachedLandVertex, MAX_INSTANCES_PER_TYPE, ModelGroup, ModelType, SpatialHashGrid } from "./models";

interface InstancedModelGroup {
  group: THREE.Group;
  meshes: THREE.InstancedMesh[];
}

export class ObjectManager {
  private readonly modelLoader: ModelLoader;
  private readonly globe: Globe;
  private readonly landGeometry: THREE.BufferGeometry;
  private readonly scene: THREE.Scene;
  private readonly instancedMeshes: Map<string, InstancedModelGroup>;
  private readonly instanceCounts: Map<string, number>;
  private readonly landVertices: CachedLandVertex[] = [];
  private readonly spatialGrid: SpatialHashGrid;
  private readonly debugMarkers: THREE.Object3D[] = [];
  private readonly boundingBoxHelpers: Map<string, THREE.BoxHelper[]> = new Map();
  private isDebugMode = true;

  // Reusable objects to minimize garbage collection
  private static readonly tempVector = new THREE.Vector3();
  private static readonly tempNormal = new THREE.Vector3();

  constructor(globe: Globe, scene: THREE.Scene) {
    this.modelLoader = new ModelLoader();
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
          biome,
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
    const basePath = modelType.filename;
    const totalFiles = modelType.files.length;
    let loadedFiles = 0;

    const promises = modelType.files.map(async (fileIndex) => {
      const modelKey = getModelKey(basePath, fileIndex);
      if (!this.instancedMeshes.has(modelKey)) {
        const modelData = await this.modelLoader.loadModelForInstancing(basePath, fileIndex, modelType.scale || 1, modelType.noLeadingZero);

        const instanceGroup = new THREE.Group();
        const instancedMeshes: THREE.InstancedMesh[] = [];

        modelData.meshes.forEach((meshData, index) => {
          console.log(`Creating InstancedMesh for submesh #${index}`, {
            name: modelKey,
            boundingBox: meshData.geometry.boundingBox,
            materialName: meshData.material.name || "(unnamed)",
          });

          meshData.geometry.computeBoundingBox();
          meshData.geometry.computeBoundingSphere();

          const instancedMesh = new THREE.InstancedMesh(meshData.geometry, meshData.material, MAX_INSTANCES_PER_TYPE);

          instancedMesh.castShadow = true;
          instancedMesh.receiveShadow = true;
          instancedMesh.count = 0;
          instancedMesh.frustumCulled = true;

          // Apply world transform
          instancedMesh.matrix.copy(meshData.worldMatrix);
          instancedMesh.matrix.decompose(instancedMesh.position, instancedMesh.quaternion, instancedMesh.scale);

          // Add a small sphere marker at the instance position
          const sphereMarker = new THREE.Mesh(new THREE.SphereGeometry(2, 10, 10), new THREE.MeshPhongMaterial({ color: 0xff0000 }));
          sphereMarker.position.copy(instancedMesh.position);
          sphereMarker.castShadow = true;
          sphereMarker.receiveShadow = true;
          instanceGroup.add(sphereMarker);

          // Add InstancedMesh to the group
          instanceGroup.add(instancedMesh);
          instancedMeshes.push(instancedMesh);
        });

        this.instancedMeshes.set(modelKey, { group: instanceGroup, meshes: instancedMeshes });
        this.instanceCounts.set(modelKey, 0);
        this.scene.add(instanceGroup);

        loadedFiles++;
        if (onProgress) {
          onProgress((loadedFiles / totalFiles) * 100);
        }
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
    this.applyTransforms(matrices, modelVariants);

    if (onProgress) {
      onProgress(100);
    }
  }

  private applyTransforms(matrices: Map<string, THREE.Matrix4[]>, modelVariants: Map<string, ModelType>): void {
    matrices.forEach((matrixArray, modelKey) => {
      const instancedModelGroup = this.instancedMeshes.get(modelKey)!;
      const modelType = modelVariants.get(modelKey)!;
      const scale = modelType.scale || 1;

      // Apply transforms with corrected order for small-scale models
      instancedModelGroup.meshes.forEach((instancedMesh) => {
        // Debug the initial state
        console.log(`Processing mesh for model: ${modelKey}`, instancedMesh);

        for (let i = 0; i < matrixArray.length; i++) {
          // Start with the placement matrix (position and rotation)
          const finalMatrix = matrixArray[i].clone();

          // Then apply scale - this ensures scale is applied in local space
          finalMatrix.scale(new THREE.Vector3(scale, scale, scale));

          // Set the matrix for this instance
          instancedMesh.setMatrixAt(i, finalMatrix);

          // Extract position from original matrix for debug marker
          const position = new THREE.Vector3();
          position.setFromMatrixPosition(matrixArray[i]);

          this.addDebugMarker(position, 2);
        }
        // Ensure visibility and correct material properties
        instancedMesh.visible = true;
        instancedMesh.frustumCulled = true;
        if (instancedMesh.material instanceof THREE.MeshPhongMaterial) {
          instancedMesh.material.transparent = false;
          instancedMesh.material.opacity = 1;
        }

        instancedMesh.count = matrixArray.length;
        instancedMesh.instanceMatrix.needsUpdate = true;
      });
      this.scene.add(instancedModelGroup.group);
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
        mesh.geometry.dispose();
        if (mesh.material instanceof THREE.Material) {
          mesh.material.dispose();
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
