import * as THREE from "three";

export interface Biome {
  name: string;
  color: THREE.Color;
  temperatureRange: [number, number];
  humidityRange: [number, number];
}
export const BIOMES: Biome[] = [
  {
    name: "TUNDRA",
    temperatureRange: [0, 0.2],
    humidityRange: [0, 0.3],
    color: new THREE.Color(0xe8e8e8), // Lighter, cooler color
  },
  {
    name: "DESERT",
    temperatureRange: [0.7, 1],
    humidityRange: [0, 0.2],
    color: new THREE.Color(0xdeb887), // Warmer sand color
  },
  {
    name: "GRASSLAND",
    temperatureRange: [0.3, 0.7],
    humidityRange: [0.2, 0.4],
    color: new THREE.Color(0x90ad5e), // More natural grass color
  },
  {
    name: "FOREST",
    temperatureRange: [0.3, 0.7],
    humidityRange: [0.4, 0.7],
    color: new THREE.Color(0x2e5a1e), // Richer forest green
  },
  {
    name: "RAINFOREST",
    temperatureRange: [0.6, 1],
    humidityRange: [0.7, 1],
    color: new THREE.Color(0x1b4001), // Deep rainforest green
  },
  {
    name: "TAIGA",
    temperatureRange: [0, 0.3],
    humidityRange: [0.4, 0.8],
    color: new THREE.Color(0x2b4b28), // Cool forest color
  },
  {
    name: "SAVANNA",
    temperatureRange: [0.7, 1],
    humidityRange: [0.2, 0.4],
    color: new THREE.Color(0xc1b86c), // Warm grassland color
  },
];
