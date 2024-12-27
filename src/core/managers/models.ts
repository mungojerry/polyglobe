import { BiomeName } from "../utils/biomes";
import { PlacementBehavior, StructureType, ModelGroup } from "./ObjectManager";

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
        models: [
            { name: "Grass", filename: "Grass", files: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], numInstances: 20000, weight: 1 }
        ],
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