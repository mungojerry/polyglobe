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
  groupSpacing?: number;
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
    groupSpacing: 10,

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
    groupSpacing: 10,

    spacing: 50,
    maxSlope: 1.2,
    biomes: [BiomeName.Land],
    numInCluster: 40,
  },
  // {
  //   type: StructureType.Village,
  //   models: [
  //     {
  //       primary: [
  //         { name: "House", filename: "House", files: [1], numInstances: 5, maxSlope: 1.0, useCollision: false },
  //         { name: "Fence", filename: "Fence", files: [2, 3, 4], numInstances: 20, maxSlope: 1.0, nearTypes: ["House"] },
  //       ],
  //       secondary: [
  //         { name: "Lantern", filename: "Lantern", files: [1], numInstances: 8, maxSlope: 1.0, nearTypes: ["House"] },
  //         { name: "Fire", filename: "Fire", files: [1, 2], numInstances: 8, maxSlope: 1.0, nearTypes: ["House"] },
  //       ],
  //       placement: PlacementBehavior.Clustered,
  //       groupSpacing: 10,
  //     },
  //   ],
  //   spacing: 50,
  //   maxSlope: 1.2,
  //   biomes: [BiomeName.Land],
  //   numInCluster: 40,
  // },
  // {
  //   type: StructureType.Cemetery,
  //   models: [
  //     {
  //       primary: [{ name: "Gravestone", filename: "Gravestone", files: [1, 2, 3, 4], numInstances: 20, maxSlope: 1.0 }],
  //       secondary: [
  //         { name: "DeadTree", filename: "Tree", files: [15, 16, 17], numInstances: 5, nearTypes: ["Gravestone"] },
  //         { name: "Lantern", filename: "Lantern", files: [1], numInstances: 4, maxSlope: 1.0, nearTypes: ["Gravestone"] },
  //       ],
  //       placement: PlacementBehavior.Clustered,
  //       groupSpacing: 5,
  //     },
  //   ],
  //   spacing: 30,
  //   maxSlope: 1.1,
  //   biomes: [BiomeName.Land],
  //   numInCluster: 40,
  // },
];

interface CachedModel {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

export class ObjectManager {
  private modelLoader: ModelLoader;
  private globe: Globe;
  private globeGeometry: THREE.BufferGeometry;
  private scene: THREE.Scene;

  constructor(globe: Globe, scene: THREE.Scene) {
    this.modelLoader = new ModelLoader();
    this.globe = globe;
    this.globeGeometry = this.globe.getLandGeometry();
    this.scene = scene;
  }

  public async loadModel(name: string, filename: string, fileIndex: number): Promise<CachedModel> {
    return this.modelLoader.loadModel(name, filename, fileIndex);
  }

  public async placeObjects(modelGroups: ModelGroup[]): Promise<void> {
    for (const group of modelGroups) {
      await this.placeModelTypes(group.primary);
      if (group.secondary) {
        await this.placeModelTypes(group.secondary);
      }
    }
  }

  private async placeModelTypes(modelTypes: ModelType[]): Promise<void> {
    for (const modelType of modelTypes) {
      for (let i = 0; i < modelType.numInstances; i++) {
        const randomFileIndex = modelType.files[Math.floor(Math.random() * modelType.files.length)];
        const model = await this.loadModel(modelType.name, "assets/models/fbx/" + modelType.filename, randomFileIndex);
        const mesh = new THREE.Mesh(model.geometry, model.material);

        // Calculate a random vertex on the globe geometry
        const vertexIndex = Math.floor(Math.random() * this.globeGeometry.attributes.position.count);
        const position = new THREE.Vector3().fromBufferAttribute(this.globeGeometry.attributes.position, vertexIndex);

        // Normalize the position to get the direction from the center of the globe
        const normal = position.clone().normalize();

        // Set the mesh position to be on the surface of the globe
        mesh.position.copy(position);
        mesh.scale.set(1, 1, 1); // Default scale

        // Align the mesh to the normal
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
        const localRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);
        mesh.quaternion.multiply(localRotation);
        this.scene.add(mesh);
      }
    }
  }
}
