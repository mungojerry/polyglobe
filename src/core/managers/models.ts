import * as THREE from "three";
import { Biome, BiomeName } from "../utils/biomes";
import { ClusteredPlacement, PlacementStrategy } from "./PlacementStrategies";

export const MAX_INSTANCES_PER_TYPE: number = 5000;
export interface CachedLandVertex {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  cellKey: string;
  biome: Biome;
}

export class SpatialHashGrid {
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
export enum StructureType {
  Forest = "Forest",
  PineForest = "PineForest",
  Village = "Village",
  Cemetery = "Cemetary",
  Wilderness = "Wilderness",
  Meadow = "Meadow",
  Swamp = "swamp",
  LandingPad = "LandingPad",
}

export interface ModelType {
  name: string;
  filename: string;
  files: number[];
  noLeadingZero?: boolean;
  numInstances: number;
  maxSlope?: number;
  useCollision?: boolean;
  nearTypes?: string[];
  weight: number;

  scale?: number;
}

export interface ModelGroup {
  models: ModelType[];
  placement: PlacementStrategy;
  type: StructureType;
  spacing?: number;
  maxSlope?: number;
  biomes?: BiomeName[];
  numInCluster?: number;
}

export const modelGroups: ModelGroup[] = [
  // {
  //   type: StructureType.LandingPad,
  //   models: [
  //     {
  //       name: "Tile",
  //       filename: "assets/models/fbx/Tile",
  //       files: [1, 2, 3, 4, 5, 6, 7, 8],
  //       numInstances: 9, // 3x3 grid
  //       weight: 1,
  //       maxSlope: 0.3, // Relatively flat terrain required
  //       scale: 100, // Adjust if needed based on tile size
  //     },
  //   ],
  //   placement: new LandingPadPlacement(),
  //   spacing: 10, // Space between tiles
  //   maxSlope: 0.3, // Flat terrain required for landing pad
  //   biomes: [BiomeName.Land],
  // },
  // {
  //   type: StructureType.Village,
  //   models: [
  //     { name: "House", filename: "assets/models/fbx/House", files: [1], numInstances: 6, weight: 0.8, maxSlope:0.25 },
  //     { name: "Fire", filename: "assets/models/fbx/Fire", files: [1, 2], numInstances: 1, weight: 0.2, maxSlope: 0.3 },
  //   ],
  //   placement: new VillagePlacement(),
  //   spacing: 30, // Space between buildings
  //   maxSlope:0.25, // Relatively flat terrain required
  //   biomes: [BiomeName.Land],
  //   numInCluster: 7, // 6 houses + 1 central fire
  // },
  {
    type: StructureType.Forest,
    models: [
      {
        name: "BirchTree_Snow",
        filename: "assets/models/nature/Willow_Snow",
        noLeadingZero: true,
        files: [1],
        scale: 0.05,
        numInstances: 200,
        weight: 0.3,
      },
      // {
      //   name: "BirchTree_Dead_Snow",
      //   filename: "assets/models/nature/BirchTree_Dead_Snow",
      //   noLeadingZero: true,
      //   files: [1, 2, 3, 4, 5],
      //   numInstances: 200,
      //   scale: 0.05,
      //   weight: 0.3,
      // },
      // {
      //   name: "CommmonTree_Snow",
      //   filename: "assets/models/nature/CommonTree_Snow",
      //   noLeadingZero: true,
      //   files: [1, 2, 3, 4, 5],
      //   numInstances: 100,
      //   scale: 0.05, //35,
      //   weight: 0.2,
      // },
      // {
      //   name: "CommmonTree_Dead_Snow",
      //   filename: "assets/models/nature/CommonTree_Dead_Snow",
      //   noLeadingZero: true,
      //   files: [1, 2, 3, 4, 5],
      //   numInstances: 100,
      //   scale: 0.05,
      //   weight: 0.2,
      // },
    ],
    placement: new ClusteredPlacement(),
    spacing: 50,
    maxSlope: 1.2,
    biomes: [BiomeName.Land],
    numInCluster: 30,
  },
  // {
  //   type: StructureType.Forest,
  //   models: [
  //     { name: "Tree", filename: "assets/models/fbx/Tree", scale: 1, files: [1, 2], numInstances: 200, weight: 0.3 },
  //     { name: "Tree", filename: "assets/models/fbx/Tree", scale: 1, files: [3, 4, 5], numInstances: 200, weight: 0.3 },
  //     { name: "Tree", filename: "assets/models/fbx/Tree", scale: 1, files: [5], numInstances: 100, weight: 0.2 },
  //     { name: "DeadTree", filename: "assets/models/fbx/Tree", scale: 1, files: [15, 16, 17], numInstances: 100, nearTypes: ["Tree"], weight: 0.2 },
  //   ],
  //   placement: new ClusteredPlacement(),
  //   spacing: 50,
  //   maxSlope: 1.2,
  //   biomes: [BiomeName.Land],
  //   numInCluster: 30,
  // },
  // {
  //   type: StructureType.PineForest,
  //   models: [
  //     { name: "Pine", filename: "assets/models/fbx/Tree", files: [23, 24, 27, 28, 6, 7], numInstances: 300, weight: 0.4 },
  //     { name: "Pine", filename: "assets/models/fbx/Tree", files: [18, 19, 20, 21, 22], numInstances: 300, weight: 0.4 },
  //     { name: "DeadPine", filename: "assets/models/fbx/Tree", files: [25, 26], numInstances: 100, nearTypes: ["Pine"], weight: 0.2 },
  //   ],
  //   placement: new ClusteredPlacement(),
  //   spacing: 50,
  //   maxSlope: 1.2,
  //   biomes: [BiomeName.Land],
  //   numInCluster: 40,
  // },
  // {
  //   type: StructureType.Wilderness,
  //   models: [{ name: "Grass", filename: "assets/models/fbx/Grass", files: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], numInstances: 20000, weight: 1 }],
  //   placement: new RandomPlacement(),
  // },
  // {
  //   type: StructureType.Wilderness,
  //   models: [
  //     { name: "Rock", filename: "assets/models/fbx/Rock", files: [1, 2, 3, 4], numInstances: 2000, weight: 1 },
  //     { name: "Rock", filename: "assets/models/fbx/Rock", files: [5, 6, 7, 8], numInstances: 2000, weight: 1 },
  //     { name: "Rock", filename: "assets/models/fbx/Rock", files: [9, 10, 11, 12, 13], numInstances: 2000, weight: 1 },
  //     { name: "Rock", filename: "assets/models/fbx/Rock", files: [14, 15, 16, 17, 18, 19], numInstances: 2000, weight: 1 },
  //   ],
  //   placement: new RandomPlacement(),
  // },
];
