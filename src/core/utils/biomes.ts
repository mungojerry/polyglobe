import * as THREE from "three";
import { smoothstep } from "./utils";

export enum BiomeName {
  "DeepOcean",
  "Ocean",
  "Beach",
  "Land",

  "Forest", // New
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
    color: new THREE.Color(0x001133), // Darker, deeper blue
    elevationMin: 0,
    elevationMax: 0.15,
  },
  [BiomeName.Ocean]: {
    name: BiomeName.Ocean,
    color: new THREE.Color(0x0055aa), // Rich medium blue
    elevationMin: 0.15,
    elevationMax: 0.42,
  },
  [BiomeName.Beach]: {
    name: BiomeName.Beach,
    color: new THREE.Color(0xf0e68c), // Khaki sand color
    elevationMin: 0.42,
    elevationMax: 0.46,
  },
  [BiomeName.Land]: {
    name: BiomeName.Land,
    color: new THREE.Color(0x567d46), // Muted green
    elevationMin: 0.46,
    elevationMax: 0.55,
  },
  [BiomeName.Forest]: {
    name: BiomeName.Forest,
    color: new THREE.Color(0x1b4d2e), // Deep forest green
    elevationMin: 0.55,
    elevationMax: 0.65,
  },

  [BiomeName.Mountain]: {
    name: BiomeName.Mountain,
    color: new THREE.Color(0x8b7355), // Rich mountain brown
    elevationMin: 0.65,
    elevationMax: 0.7,
  },
  [BiomeName.Snow]: {
    name: BiomeName.Snow,
    color: new THREE.Color(0xffffff),
    elevationMin: 0.7,
    elevationMax: 1.0,
  },
};
// Updated landBoundary to match new elevation ranges
export const landBoundary = 0.45;

export function isLand(height: number) {
  return height > landBoundary;
}

const sortedBiomes = Object.values(BIOMES).sort((a, b) => a.elevationMin - b.elevationMin);

export function getBiomeByElevation(elevation: number): { biome: Biome; color: THREE.Color } | undefined {
  for (let i = 0; i < sortedBiomes.length - 1; i++) {
    const currentBiome = sortedBiomes[i];
    const nextBiome = sortedBiomes[i + 1];

    if (elevation >= currentBiome.elevationMin && elevation < currentBiome.elevationMax) {
      // Calculate how far we are between this biome and the next
      const t = (elevation - currentBiome.elevationMin) / (currentBiome.elevationMax - currentBiome.elevationMin);

      // Interpolate between current and next biome colors
      const lerpedColor = currentBiome.color.clone().lerp(nextBiome.color, t);

      return {
        biome: currentBiome,
        color: lerpedColor,
      };
    }
  }

  // Handle last biome
  const lastBiome = sortedBiomes[sortedBiomes.length - 1];
  if (elevation >= lastBiome.elevationMin && elevation < lastBiome.elevationMax) {
    return {
      biome: lastBiome,
      color: lastBiome.color,
    };
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
