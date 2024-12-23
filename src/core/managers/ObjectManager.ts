import * as THREE from "three";
import { Globe } from "../planet/Globe";
import { BiomeName } from "../utils/biomes";
import { ModelLoader } from "./ModelLoader";

export enum PlacementType {
  Random,
  Clustered,
  NearWater,
  NearStructure,
}

export enum StructureType {
  Forest,
  PineForest,
  Village,
  Cemetery,
  Wilderness,
  Meadow,
  Swamp,
}

export enum PlacementBehavior {
  Random,
  Clustered,
  NearWater,
  NearStructure,
  InGroup,
}

export interface ModelType {
  name: string;
  filename: string;
  files: number[];
  numInstances: number;
  maxSlope?: number;
  useCollision?: boolean;
  nearTypes?: string[];
  weight: number;
}

export interface ModelGroup {
  models: ModelType[];
  placement: PlacementBehavior;
  type: StructureType;
  spacing?: number;
  maxSlope?: number;
  biomes?: BiomeName[];
  numInCluster?: number;
}

interface CachedLandVertex {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  cellKey: string;
}

class SpatialHashGrid {
  private cells: Map<string, CachedLandVertex[]>;
  private cellSize: number;

  constructor(cellSize: number) {
    this.cells = new Map();
    this.cellSize = cellSize;
  }

  private getCellKey(position: THREE.Vector3): string {
    const x = Math.floor(position.x / this.cellSize);
    const y = Math.floor(position.y / this.cellSize);
    const z = Math.floor(position.z / this.cellSize);
    return `${x},${y},${z}`;
  }

  add(vertex: CachedLandVertex): void {
    const key = this.getCellKey(vertex.position);
    vertex.cellKey = key;
    if (!this.cells.has(key)) {
      this.cells.set(key, []);
    }
    this.cells.get(key)!.push(vertex);
  }

  getNearby(position: THREE.Vector3, radius: number): CachedLandVertex[] {
    const cellRadius = Math.ceil(radius / this.cellSize);
    const centerKey = this.getCellKey(position);
    const [cx, cy, cz] = centerKey.split(",").map(Number);
    const nearby: CachedLandVertex[] = [];

    for (let x = -cellRadius; x <= cellRadius; x++) {
      for (let y = -cellRadius; y <= cellRadius; y++) {
        for (let z = -cellRadius; z <= cellRadius; z++) {
          const key = `${cx + x},${cy + y},${cz + z}`;
          const cell = this.cells.get(key);
          if (cell) {
            nearby.push(...cell.filter((v) => v.position.distanceTo(position) <= radius));
          }
        }
      }
    }
    return nearby;
  }
}

export const modelGroups: ModelGroup[] = [
  {
    type: StructureType.Forest,
    models: [
      { name: "Tree", filename: "Tree", files: [1, 2], numInstances: 200, weight: 0.3 },
      { name: "Tree", filename: "Tree", files: [3, 4, 5], numInstances: 200, weight: 0.3 },
      { name: "Tree", filename: "Tree", files: [5], numInstances: 100, weight: 0.2 },

      { name: "DeadTree", filename: "Tree", files: [15, 16, 17], numInstances: 100, nearTypes: ["Tree"], weight: 0.2 },
    ],
    placement: PlacementBehavior.Clustered,
    spacing: 50,
    maxSlope: 1.2,
    biomes: [BiomeName.Land],
    numInCluster: 30,
  },
  {
    type: StructureType.PineForest,
    models: [
      { name: "Pine", filename: "Tree", files: [23, 24, 27, 28, 6, 7], numInstances: 300, weight: 0.4 },
      { name: "Pine", filename: "Tree", files: [18, 19, 20, 21, 22], numInstances: 300, weight: 0.4 },
      { name: "DeadPine", filename: "Tree", files: [25, 26], numInstances: 100, nearTypes: ["Pine"], weight: 0.2 },
    ],
    placement: PlacementBehavior.Clustered,
    spacing: 50,
    maxSlope: 1.2,
    biomes: [BiomeName.Land],
    numInCluster: 40,
  },

  {
    type: StructureType.Wilderness,
    models: [{ name: "Grass", filename: "Grass", files: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], numInstances: 20000, weight: 1 }],
    placement: PlacementBehavior.Random,
  },
  {
    type: StructureType.Wilderness,
    models: [
      { name: "Rock", filename: "Rock", files: [1, 2, 3, 4], numInstances: 2000, weight: 1 },
      { name: "Rock", filename: "Rock", files: [5, 6, 7, 8], numInstances: 2000, weight: 1 },
      { name: "Rock", filename: "Rock", files: [9, 10, 11, 12, 13], numInstances: 2000, weight: 1 },
      { name: "Rock", filename: "Rock", files: [14, 15, 16, 17, 18, 19], numInstances: 2000, weight: 1 },
    ],
    placement: PlacementBehavior.Random,
  },
];

export class ObjectManager {
  private modelLoader: ModelLoader;
  private globe: Globe;
  private globeGeometry: THREE.BufferGeometry;
  private scene: THREE.Scene;
  private instancedMeshes: Map<string, THREE.InstancedMesh>;
  private instanceCounts: Map<string, number>;
  private maxInstancesPerType: number = 5000;
  private landVertices: CachedLandVertex[] = [];
  private spatialGrid: SpatialHashGrid;
  private tempVector: THREE.Vector3;

  private upVector: THREE.Vector3;
  private matrixPool: THREE.Matrix4[];
  private quaternionPool: THREE.Quaternion[];
  private poolIndex: number = 0;

  constructor(globe: Globe, scene: THREE.Scene) {
    this.modelLoader = new ModelLoader();
    this.globe = globe;
    this.globeGeometry = this.globe.getLandGeometry();
    this.scene = scene;
    this.instancedMeshes = new Map();
    this.instanceCounts = new Map();

    this.tempVector = new THREE.Vector3();
    this.upVector = new THREE.Vector3(0, 1, 0);

    this.matrixPool = Array(10000)
      .fill(null)
      .map(() => new THREE.Matrix4());
    this.quaternionPool = Array(10000)
      .fill(null)
      .map(() => new THREE.Quaternion());

    this.spatialGrid = new SpatialHashGrid(25);

    this.cacheLandVertices();
  }

  private cacheLandVertices(): void {
    const positions = this.globeGeometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      this.tempVector.fromBufferAttribute(positions, i);
      if (this.globe.isLand(this.tempVector)) {
        const vertex = {
          position: this.tempVector.clone(),
          normal: this.tempVector.clone().normalize(),
          cellKey: "",
        };
        this.landVertices.push(vertex);
        this.spatialGrid.add(vertex);
      }
    }
  }

  private getModelKey(filename: string, fileIndex: number): string {
    return `${filename}_${fileIndex}`;
  }

  private getNextMatrix(): THREE.Matrix4 {
    const matrix = this.matrixPool[this.poolIndex];
    this.poolIndex = (this.poolIndex + 1) % this.matrixPool.length;
    return matrix.identity();
  }

  private getNextQuaternion(): THREE.Quaternion {
    const quaternion = this.quaternionPool[this.poolIndex];
    this.poolIndex = (this.poolIndex + 1) % this.quaternionPool.length;
    return quaternion.identity();
  }

  private async preloadModelVariants(modelType: ModelType): Promise<void> {
    const basePath = "assets/models/fbx/" + modelType.filename;
    const promises = modelType.files.map(async (fileIndex) => {
      const modelKey = this.getModelKey(basePath, fileIndex);
      if (!this.instancedMeshes.has(modelKey)) {
        const modelData = await this.modelLoader.loadModelForInstancing(basePath, fileIndex);
        const instancedMesh = new THREE.InstancedMesh(modelData.geometry, modelData.material, this.maxInstancesPerType);
        instancedMesh.castShadow = true;
        instancedMesh.receiveShadow = true;
        instancedMesh.count = 0;
        this.instancedMeshes.set(modelKey, instancedMesh);
        this.instanceCounts.set(modelKey, 0);
        this.scene.add(instancedMesh);
      }
    });
    await Promise.all(promises);
  }

  public async placeObjects(modelGroups: ModelGroup[]): Promise<void> {
    this.poolIndex = 0;

    const preloadPromises = modelGroups.flatMap((group) => [...group.models.map((model) => this.preloadModelVariants(model))]);
    await Promise.all(preloadPromises);

    for (const group of modelGroups) {
      const matrices: Map<string, THREE.Matrix4[]> = new Map();
      const batchSize = 100;

      if (group.placement === PlacementBehavior.Clustered && group.numInCluster) {
        await this.placeClusteredObjects(group, batchSize, matrices);
      } else {
        await this.placeNormalObjects(group, batchSize, matrices);
      }

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
    }
  }

  private async placeNormalObjects(group: ModelGroup, batchSize: number, matrices: Map<string, THREE.Matrix4[]>) {
    const promises = [];
    for (const modelType of group.models) {
      for (let i = 0; i < modelType.numInstances; i += batchSize) {
        const batchCount = Math.min(batchSize, modelType.numInstances - i);
        promises.push(this.placeBatch(modelType, this.landVertices, batchCount, matrices));
      }
    }
    await Promise.all(promises);
  }

  private async placeClusteredObjects(group: ModelGroup, batchSize: number, matrices: Map<string, THREE.Matrix4[]>) {
    const promises = [];
    const totalInstances = group.models.reduce((sum, type) => sum + type.numInstances, 0);
    const numInCluster = group.numInCluster ?? 1;
    const numClusters = Math.ceil(totalInstances / numInCluster);
    const clusterCenters = Array(numClusters)
      .fill(null)
      .map(() => this.landVertices[Math.floor(Math.random() * this.landVertices.length)]);

    for (const center of clusterCenters) {
      const nearbyVertices = this.spatialGrid.getNearby(center.position, group.spacing || 5);
      const numInThisCluster = Math.min(numInCluster, totalInstances);

      for (let i = 0; i < numInThisCluster; i += batchSize) {
        const batchCount = Math.min(batchSize, numInThisCluster - i);
        const selectedTypes = this.selectModelTypesForBatch(group.models, batchCount);

        for (const [modelType, count] of selectedTypes) {
          promises.push(this.placeBatch(modelType, nearbyVertices, count, matrices));
        }
      }
    }
    await Promise.all(promises);
  }

  private selectModelTypesForBatch(modelTypes: ModelType[], batchCount: number): Map<ModelType, number> {
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

  private async placeBatch(modelType: ModelType, vertices: CachedLandVertex[], count: number, matrices: Map<string, THREE.Matrix4[]>): Promise<void> {
    const randomFileIndex = modelType.files[Math.floor(Math.random() * modelType.files.length)];
    const modelKey = this.getModelKey("assets/models/fbx/" + modelType.filename, randomFileIndex);

    if (!matrices.has(modelKey)) {
      matrices.set(modelKey, []);
    }

    const currentMatrices = matrices.get(modelKey)!;
    const startIndex = currentMatrices.length;

    if (startIndex + count > this.maxInstancesPerType) {
      console.warn(`Maximum instances reached for model ${modelKey}`);
      return;
    }

    for (let i = 0; i < count; i++) {
      const vertex = vertices[Math.floor(Math.random() * vertices.length)];
      const matrix = this.getNextMatrix();

      matrix.setPosition(vertex.position);

      const quaternion = this.getNextQuaternion()
        .setFromUnitVectors(this.upVector, vertex.normal)
        .multiply(this.getNextQuaternion().setFromAxisAngle(this.upVector, Math.random() * Math.PI * 2));

      const rotationMatrix = this.getNextMatrix().makeRotationFromQuaternion(quaternion);
      matrix.multiply(rotationMatrix);

      currentMatrices.push(matrix.clone());
    }
  }
}
