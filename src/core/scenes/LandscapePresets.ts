import * as THREE from "three";
import { LandscapeConfig } from "./LandscaoeGeneration";
interface PlanetPreset {
  name: string;
  description: string;
  config: Partial<LandscapeConfig>;
}

export const PLANET_PRESETS: PlanetPreset[] = [
  {
    name: "Earth-like",
    description: "Familiar terrain with oceans, mountains and greenery",
    config: {
      resolution: 50,
      ridgeNoise: { scale: 1.3, amplitude: 0.15, sharpness: 1.4 },
      waterLevel: 1.03,
      colors: [
        { height: 0.0, color: new THREE.Color(0x000066) }, // Deep ocean
        { height: 0.05, color: new THREE.Color(0x0066bb) }, // Shallow water
        { height: 0.1, color: new THREE.Color(0xf0e68c) }, // Beach
        { height: 0.2, color: new THREE.Color(0x339933) }, // Lowlands
        { height: 0.6, color: new THREE.Color(0x663300) }, // Hills
        { height: 0.8, color: new THREE.Color(0x666666) }, // Mountains
        { height: 1.0, color: new THREE.Color(0xffffff) }, // Snow
      ],
    },
  },
  {
    name: "Water World",
    description: "Deep oceans with scattered archipelagos",
    config: {
      waterLevel: 1.15,
      ridgeNoise: { scale: 0.8, amplitude: 0.1, sharpness: 1.2 },
      colors: [
        { height: 0.0, color: new THREE.Color(0x000033) }, // Abyss
        { height: 0.3, color: new THREE.Color(0x000066) }, // Deep ocean
        { height: 0.6, color: new THREE.Color(0x0066bb) }, // Ocean
        { height: 0.8, color: new THREE.Color(0x00aaff) }, // Shallow
        { height: 1.0, color: new THREE.Color(0xf0e68c) }, // Islands
      ],
    },
  },
  {
    name: "Desert World",
    description: "Vast deserts and rocky canyons",
    config: {
      waterLevel: 0.9,
      ridgeNoise: { scale: 2.0, amplitude: 0.25, sharpness: 1.8 },
      colors: [
        { height: 0.0, color: new THREE.Color(0xd2691e) }, // Red rock
        { height: 0.2, color: new THREE.Color(0xdeb887) }, // Sand
        { height: 0.4, color: new THREE.Color(0xf4a460) }, // Light sand
        { height: 0.7, color: new THREE.Color(0xcd853f) }, // Rocky
        { height: 1.0, color: new THREE.Color(0x8b4513) }, // Mountains
      ],
    },
  },
  {
    name: "Ice World",
    description: "Frozen wasteland with glaciers",
    config: {
      waterLevel: 0.95,
      ridgeNoise: { scale: 1.0, amplitude: 0.12, sharpness: 1.1 },
      colors: [
        { height: 0.0, color: new THREE.Color(0x87ceeb) }, // Ice water
        { height: 0.2, color: new THREE.Color(0xb0e0e6) }, // Light ice
        { height: 0.4, color: new THREE.Color(0xe0ffff) }, // White ice
        { height: 0.6, color: new THREE.Color(0xf0f8ff) }, // Snow
        { height: 1.0, color: new THREE.Color(0xffffff) }, // Pure white
      ],
    },
  },
  {
    name: "Volcanic World",
    description: "Active volcanoes and lava flows",
    config: {
      waterLevel: 0.85,
      ridgeNoise: { scale: 2.5, amplitude: 0.3, sharpness: 2.0 },
      colors: [
        { height: 0.0, color: new THREE.Color(0x330000) }, // Dark rock
        { height: 0.3, color: new THREE.Color(0x660000) }, // Volcanic rock
        { height: 0.6, color: new THREE.Color(0x990000) }, // Hot rock
        { height: 0.8, color: new THREE.Color(0xff3300) }, // Lava
        { height: 1.0, color: new THREE.Color(0xff6600) }, // Molten
      ],
    },
  },
  {
    name: "Alien World",
    description: "Strange and exotic terrain",
    config: {
      resolution: 60,
      ridgeNoise: { scale: 3.0, amplitude: 0.4, sharpness: 2.5 },
      waterLevel: 0.98,
      colors: [
        { height: 0.0, color: new THREE.Color(0x9932cc) }, // Purple liquid
        { height: 0.2, color: new THREE.Color(0x9370db) }, // Medium purple
        { height: 0.4, color: new THREE.Color(0x00ff7f) }, // Alien vegetation
        { height: 0.7, color: new THREE.Color(0x7cfc00) }, // Bright growth
        { height: 1.0, color: new THREE.Color(0x98fb98) }, // Light growth
      ],
    },
  },
];
