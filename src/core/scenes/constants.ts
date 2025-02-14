import * as THREE from "three";
import { Biome } from "../types/terrain";
// Pre-compute cube corners offsets
export const CUBE_CORNER_OFFSETS = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 0, 1],
  [1, 0, 1],
  [0, 1, 0],
  [1, 1, 0],
  [0, 1, 1],
  [1, 1, 1],
].map(([x, y, z]) => new THREE.Vector3(x, y, z));

// Adjust epsilon for different checks
export const DEGENERATE_EPSILON = 1e-10; // For degenerate triangle checks
export const INTERPOLATION_EPSILON = 1e-7; // For interpolation calculations

export const BIOMES: Biome[] = [
  {
    name: "plains",
    color: new THREE.Color(0x91b165), // Softer, more natural green
    temperatureRange: [0.3, 0.6],
    humidityRange: [0.4, 0.7],
    terrainScale: 0.03,
    terrainHeight: 16,
  },
  {
    name: "desert",
    color: new THREE.Color(0xd6c087), // Warmer, sandy color
    temperatureRange: [0.7, 1.0],
    humidityRange: [0.0, 0.3],
    terrainScale: 0.02,
    terrainHeight: 12,
  },
  {
    name: "mountain",
    color: new THREE.Color(0x9b928a), // Warmer grey for rocks
    temperatureRange: [0.0, 0.3],
    humidityRange: [0.0, 0.4],
    terrainScale: 0.04,
    terrainHeight: 28,
  },
  {
    name: "forest",
    color: new THREE.Color(0x4a6b3d), // Rich forest green
    temperatureRange: [0.4, 0.7],
    humidityRange: [0.6, 1.0],
    terrainScale: 0.04,
    terrainHeight: 18,
  },
];

export const CHUNK_POOL_SIZE = 100;

export const EDGE_TO_VERTEX = [
  [0, 1], // edge 0: connects vertex 0 to vertex 1
  [1, 3], // edge 1: connects vertex 1 to vertex 3
  [2, 3], // edge 2: connects vertex 2 to vertex 3
  [0, 2], // edge 3: connects vertex 0 to vertex 2
  [4, 5], // edge 4: connects vertex 4 to vertex 5
  [5, 7], // edge 5: connects vertex 5 to vertex 7
  [6, 7], // edge 6: connects vertex 6 to vertex 7
  [4, 6], // edge 7: connects vertex 4 to vertex 6
  [0, 4], // edge 8: connects vertex 0 to vertex 4
  [1, 5], // edge 9: connects vertex 1 to vertex 5
  [3, 7], // edge 10: connects vertex 3 to vertex 7
  [2, 6], // edge 11: connects vertex 2 to vertex 6
];
