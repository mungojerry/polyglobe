import * as THREE from "three";
import { Biome } from "../types/terrain";

export const BIOMES: Biome[] = [
  {
    name: "Desert",
    color: new THREE.Color(0xe6c587),
    temperatureRange: [0.7, 1.0],
    humidityRange: [0.0, 0.3],
    terrainScale: 1.2,
    terrainHeight: 0.6,
    variations: [
      { color: new THREE.Color(0xd4b36a), weight: 0.3 }, // Dunes
      { color: new THREE.Color(0xc19c5c), weight: 0.2 }, // Rocky desert
    ],
  },
  {
    name: "Savanna",
    color: new THREE.Color(0xbfb755),
    temperatureRange: [0.6, 0.9],
    humidityRange: [0.2, 0.4],
    terrainScale: 1.0,
    terrainHeight: 0.7,
    variations: [
      { color: new THREE.Color(0xa3973e), weight: 0.4 }, // Dry grass
      { color: new THREE.Color(0x90814a), weight: 0.2 }, // Rocky areas
    ],
  },
  {
    name: "Tropical Rainforest",
    color: new THREE.Color(0x2d8e39),
    temperatureRange: [0.6, 1.0],
    humidityRange: [0.7, 1.0],
    terrainScale: 0.9,
    terrainHeight: 0.8,
    variations: [
      { color: new THREE.Color(0x1f6e2a), weight: 0.3 }, // Dense forest
      { color: new THREE.Color(0x3ca048), weight: 0.2 }, // Jungle canopy
    ],
  },
  {
    name: "Temperate Forest",
    color: new THREE.Color(0x3b7340),
    temperatureRange: [0.4, 0.7],
    humidityRange: [0.4, 0.8],
    terrainScale: 1.0,
    terrainHeight: 0.75,
    variations: [
      { color: new THREE.Color(0x4f8c54), weight: 0.3 }, // Mixed forest
      { color: new THREE.Color(0x5c7348), weight: 0.2 }, // Deciduous areas
    ],
  },
  {
    name: "Tundra",
    color: new THREE.Color(0xb8c8d0),
    temperatureRange: [0.0, 0.3],
    humidityRange: [0.1, 0.5],
    terrainScale: 0.8,
    terrainHeight: 0.4,
    variations: [
      { color: new THREE.Color(0x8ba0a8), weight: 0.3 }, // Rocky tundra
      { color: new THREE.Color(0xa3b5bd), weight: 0.2 }, // Icy patches
    ],
  },
  {
    name: "Taiga",
    color: new THREE.Color(0x5c7348),
    temperatureRange: [0.2, 0.4],
    humidityRange: [0.4, 0.7],
    terrainScale: 0.9,
    terrainHeight: 0.6,
    variations: [
      { color: new THREE.Color(0x445536), weight: 0.3 }, // Dense pine forest
      { color: new THREE.Color(0x506341), weight: 0.2 }, // Sparse forest
    ],
  },
];

export const ELEVATION_COLORS = {
  mountain: {
    snow: new THREE.Color(0xffffff),
    rock: new THREE.Color(0x808080),
    threshold: 0.7,
  },
  hills: {
    color: new THREE.Color(0x6b705c),
    threshold: 0.45,
  },
  lowland: {
    color: new THREE.Color(0x2d4f1e),
    threshold: 0.2,
  },
};

// Noise parameters for biome variation
export const BIOME_NOISE = {
  scale: 0.03,
  octaves: 2,
  persistence: 0.5,
};
