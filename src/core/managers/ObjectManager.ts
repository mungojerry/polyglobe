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

export interface ModelGroup {
  primary: ModelType[];
  secondary?: ModelType[];
  placement: PlacementBehavior;
  type: StructureType;
  spacing: number;
  maxSlope?: number;
  biomes?: BiomeName[];
  numInCluster: number;
}

export interface ModelType {
  name: string;
  filename: string;
  files: number[];
  numInstances: number;
  maxSlope?: number;
  useCollision?: boolean;
  nearTypes?: string[];
}

export const modelGroups: ModelGroup[] = [
  {
    type: StructureType.Forest,
    primary: [{ name: "Tree", filename: "Tree", files: [1, 2, 3, 4, 5], numInstances: 400 }],
    secondary: [{ name: "DeadTree", filename: "Tree", files: [15, 16, 17], numInstances: 100, nearTypes: ["Tree"] }],
    placement: PlacementBehavior.Clustered,
    spacing: 50,
    maxSlope: 1.2,
    biomes: [BiomeName.Land],
    numInCluster: 40,
  },
  {
    type: StructureType.PineForest,
    primary: [{ name: "Pine", filename: "Tree", files: [18, 19, 20, 21, 22, 23, 24, 27, 28, 6, 7], numInstances: 400 }],
    secondary: [{ name: "DeadPine", filename: "Tree", files: [25, 26], numInstances: 100, nearTypes: ["Pine"] }],
    placement: PlacementBehavior.Clustered,
    spacing: 50,
    maxSlope: 1.2,
    biomes: [BiomeName.Land],
    numInCluster: 40,
  },
];

export class ObjectManager {
  private modelLoader: ModelLoader;
  private globe: Globe;
  private globeGeometry: THREE.BufferGeometry;
  private scene: THREE.Scene;
  private instancedMeshes: Map<string, THREE.InstancedMesh>;
  private instanceCounts: Map<string, number>;
  private maxInstancesPerType: number = 1000;

  constructor(globe: Globe, scene: THREE.Scene) {
    this.modelLoader = new ModelLoader();
    this.globe = globe;
    this.globeGeometry = this.globe.getLandGeometry();
    this.scene = scene;
    this.instancedMeshes = new Map();
    this.instanceCounts = new Map();
  }

  private getModelKey(filename: string, fileIndex: number): string {
    return `${filename}_${fileIndex}`;
  }

  private async createInstancedMesh(modelType: ModelType, fileIndex: number): Promise<THREE.InstancedMesh> {
    const modelPath = "assets/models/fbx/" + modelType.filename;
    const modelKey = this.getModelKey(modelPath, fileIndex);

    if (this.instancedMeshes.has(modelKey)) {
      return this.instancedMeshes.get(modelKey)!;
    }

    const modelData = await this.modelLoader.loadModelForInstancing(modelPath, fileIndex);
    const instancedMesh = new THREE.InstancedMesh(
      modelData.geometry,
      modelData.material,
      this.maxInstancesPerType
    );
    
    instancedMesh.castShadow = true;
    instancedMesh.receiveShadow = true;
    instancedMesh.count = 0;
    
    this.instancedMeshes.set(modelKey, instancedMesh);
    this.instanceCounts.set(modelKey, 0);
    this.scene.add(instancedMesh);
    
    return instancedMesh;
  }

  public async placeObjects(modelGroups: ModelGroup[]): Promise<void> {
    for (const group of modelGroups) {
      await this.placeModelTypes(group.primary, group);
      if (group.secondary) {
        await this.placeModelTypes(group.secondary, group);
      }
    }
  }

  private async placeModelTypes(modelTypes: ModelType[], group: ModelGroup): Promise<void> {
    for (const modelType of modelTypes) {
      if (group.placement === PlacementBehavior.Clustered) {
        const numClusters = Math.ceil(modelType.numInstances / group.numInCluster);
        for (let c = 0; c < numClusters; c++) {
          const centerIndex = Math.floor(Math.random() * this.globeGeometry.attributes.position.count);
          const centerPos = new THREE.Vector3().fromBufferAttribute(this.globeGeometry.attributes.position, centerIndex);

          const numInThisCluster = Math.min(group.numInCluster, modelType.numInstances - c * group.numInCluster);
          for (let i = 0; i < numInThisCluster; i++) {
            await this.placeObject(modelType, centerPos, group.spacing || 5);
          }
        }
      } else {
        for (let i = 0; i < modelType.numInstances; i++) {
          await this.placeObject(modelType, null, 0);
        }
      }
    }
  }

  private async placeObject(modelType: ModelType, clusterCenter: THREE.Vector3 | null, radius: number): Promise<void> {
    const randomFileIndex = modelType.files[Math.floor(Math.random() * modelType.files.length)];
    const modelKey = this.getModelKey("assets/models/fbx/" + modelType.filename, randomFileIndex);
    
    const instancedMesh = await this.createInstancedMesh(modelType, randomFileIndex);
    const currentCount = this.instanceCounts.get(modelKey) || 0;
    
    if (currentCount >= this.maxInstancesPerType) {
      console.warn(`Maximum instances reached for model ${modelKey}`);
      return;
    }

    let position: THREE.Vector3;
    let vertexPos: THREE.Vector3 = new THREE.Vector3();
    
    if (clusterCenter) {
      const positions = this.globeGeometry.attributes.position;
      const candidateIndices: number[] = [];

      for (let i = 0; i < positions.count; i++) {
        vertexPos = vertexPos.fromBufferAttribute(positions, i);
        if (vertexPos.distanceTo(clusterCenter) < radius && this.globe.isLand(vertexPos)) {
          candidateIndices.push(i);
        }
      }

      if (candidateIndices.length === 0) {
        return;
      }

      const randomIndex = candidateIndices[Math.floor(Math.random() * candidateIndices.length)];
      position = new THREE.Vector3().fromBufferAttribute(positions, randomIndex);
    } else {
      const positions = this.globeGeometry.attributes.position;
      const landIndices: number[] = [];

      for (let i = 0; i < positions.count; i++) {
        if (this.globe.isLand(new THREE.Vector3(positions.getX(i), positions.getY(i), positions.getZ(i)))) {
          landIndices.push(i);
        }
      }

      if (landIndices.length === 0) {
        return;
      }

      const randomIndex = landIndices[Math.floor(Math.random() * landIndices.length)];
      position = new THREE.Vector3().fromBufferAttribute(positions, randomIndex);
    }

    const matrix = new THREE.Matrix4();
    matrix.setPosition(position);

    const normal = position.clone().normalize();
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    const localRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
    quaternion.multiply(localRotation);

    const rotationMatrix = new THREE.Matrix4().makeRotationFromQuaternion(quaternion);
    matrix.multiply(rotationMatrix);

    instancedMesh.setMatrixAt(currentCount, matrix);
    instancedMesh.count = currentCount + 1;
    instancedMesh.instanceMatrix.needsUpdate = true;

    this.instanceCounts.set(modelKey, currentCount + 1);
  }
}