import * as THREE from "three";
import { smoothstep } from "./utils";

export enum BiomeName {
  "DeepOcean",
  "Ocean",
  "Beach",
  "Land",
  "Mountain",
  "Snow",
}

export type Biome = {
  name: BiomeName;
  color: THREE.Color;
  elevationMin: number;
  elevationMax: number;
};

interface PolarTransition {
  startLatitude: number;
  endLatitude: number;
}

const POLAR_REGIONS: PolarTransition = {
  startLatitude: Math.PI / 2 - 0.5,
  endLatitude: Math.PI / 2 - 0.2,
};

type BiomesMap = {
  [key in BiomeName]: Biome;
};
export const BIOMES: BiomesMap = {
  [BiomeName.DeepOcean]: {
    name: BiomeName.DeepOcean,
    color: new THREE.Color(0x000000),
    elevationMin: 0,
    elevationMax: 0.1,
  },
  [BiomeName.Ocean]: {
    name: BiomeName.Ocean,
    color: new THREE.Color(0x0066aa),
    elevationMin: 0.1,
    elevationMax: 0.4,
  },
  [BiomeName.Beach]: {
    name: BiomeName.Beach,
    color: new THREE.Color(0xffdd99),
    elevationMin: 0.4,
    elevationMax: 0.45,
  },
  [BiomeName.Land]: {
    name: BiomeName.Land,
    color: new THREE.Color(0x44aa44),
    elevationMin: 0.45,
    elevationMax: 0.7,
  },
  [BiomeName.Mountain]: {
    name: BiomeName.Mountain,
    color: new THREE.Color(0x996633),
    elevationMin: 0.7,
    elevationMax: 0.8,
  },
  [BiomeName.Snow]: {
    name: BiomeName.Snow,
    color: new THREE.Color(0xffffff),
    elevationMin: 0.8,
    elevationMax: 1.0,
  },
};

// Updated landBoundary to match new elevation ranges
export const landBoundary = 0.45;

export function isLand(height: number) {
  return height > landBoundary;
}

const sortedBiomes = Object.values(BIOMES).sort((a, b) => a.elevationMin - b.elevationMin);

export function getBiomeByElevation(elevation: number): Biome | undefined {
  for (const biome of sortedBiomes) {
    if (elevation >= biome.elevationMin && elevation < biome.elevationMax) {
      return biome;
    }
  }
  return undefined;
}

export function getTerrainColor(elevation: number, latitude: number): THREE.Color {
  const isLand = elevation > landBoundary;
  const normalBiome = getBiomeByElevation(elevation);
  if (isLand) {
    const snowBiome = BIOMES[BiomeName.Snow];

    const polarBlendFactor = smoothstep(POLAR_REGIONS.startLatitude, POLAR_REGIONS.endLatitude, Math.abs(latitude));
    if (normalBiome && snowBiome && polarBlendFactor > 0) {
      // Smooth interpolation between normal terrain and snow
      return new THREE.Color().lerpColors(normalBiome.color, snowBiome.color, polarBlendFactor);
    }
  }

  return normalBiome ? normalBiome.color : new THREE.Color(0xffffff);
}
