import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise";
import { PseudoRandomNumberGenerator } from "../utils/PseudoRandom";

const GROUND_THRESHOLD = 2;
const TOP_THRESHOLD = 0.95;
const GROUND_VALUE = 0.9;
const AIR_VALUE = 0.1;
const MIN_VALUE = 0.001;
const MAX_VALUE = 0.999;
const VARIATION_SCALE = 0.3;
const VARIATION_STRENGTH = 0.2;
const FALLOFF_POWER = 1.5;

const INITIAL_AMPLITUDE = 0.5;
const INITIAL_FREQUENCY = 0.4;
const FREQUENCY_MULTIPLIER = 2.0;
const NOISE_PRECISION = 100;

// Noise generation constants
const OCTAVES = 6;
const PERSISTENCE = 0.5;
const BASE_SCALE = 0.03;
const RIDGE_OFFSET = 1.0;

interface TerrainGenerationMessage {
  type: "generateTerrain";
  chunkX: number;
  chunkZ: number;
  gridSize: number;
  padding: number;
  seed: number;
}

const ctx: Worker = self as any;

let simplex: SimplexNoise;
let heightNoise: SimplexNoise;
let variationNoise: SimplexNoise;

// Add noise cache for better performance
const noiseCache = new Map<string, number>();

function getCacheKey(x: number, y: number, z: number, scale: number): string {
  return `${~~(x * scale * NOISE_PRECISION)},${~~(y * scale * NOISE_PRECISION)},${~~(z * scale * NOISE_PRECISION)}`;
}

function generateRidgedNoise(x: number, y: number, z: number, scale: number): number {
  const key = getCacheKey(x, y, z, scale);
  const cached = noiseCache.get(key);
  if (cached !== undefined) return cached;

  let noiseValue = 0;
  let amplitude = INITIAL_AMPLITUDE;
  let frequency = INITIAL_FREQUENCY;
  let maxValue = 0;

  for (let i = 0; i < OCTAVES; i++) {
    const scaledX = x * scale * frequency;
    const scaledY = y * scale * frequency;
    const scaledZ = z * scale * frequency;

    // Generate ridged noise
    const ridge = RIDGE_OFFSET - Math.abs(simplex.noise3d(scaledX, scaledY, scaledZ));
    noiseValue += ridge * ridge * amplitude;
    maxValue += amplitude;

    amplitude *= PERSISTENCE;
    frequency *= FREQUENCY_MULTIPLIER;
  }

  // Normalize
  const result = noiseValue / maxValue;

  if (noiseCache.size < 10000) {
    noiseCache.set(key, result);
  }

  return result;
}

function generateTerrainNoise(x: number, y: number, z: number): number {
  // Early exits for fixed values
  if (y < GROUND_THRESHOLD) {
    return GROUND_VALUE;
  }

  const normalizedY = y / 32; // Normalize height
  if (normalizedY > TOP_THRESHOLD) {
    return AIR_VALUE;
  }

  // Calculate height falloff
  const heightFalloff = 1.0 - Math.pow(normalizedY, FALLOFF_POWER);
  if (heightFalloff <= 0) {
    return AIR_VALUE;
  }

  // Generate base terrain
  const baseNoise = generateRidgedNoise(x, y, z, BASE_SCALE);

  // Add height variation
  const heightVariation = heightNoise.noise3d(x * 0.02, 0, z * 0.02) * 0.5 + 0.5;

  // Add large-scale variation
  const largeScaleVariation =
    variationNoise.noise3d(x * BASE_SCALE * VARIATION_SCALE, y * BASE_SCALE * VARIATION_SCALE, z * BASE_SCALE * VARIATION_SCALE) * VARIATION_STRENGTH;

  // Combine all noise components
  let value = (baseNoise + largeScaleVariation) * heightFalloff;
  value = value * (0.8 + heightVariation * 0.4);

  // Clamp final value
  return Math.max(MIN_VALUE, Math.min(MAX_VALUE, value));
}

ctx.addEventListener("message", (e: MessageEvent<TerrainGenerationMessage>) => {
  if (e.data.type === "generateTerrain") {
    const { chunkX, chunkZ, gridSize, padding, seed } = e.data;

    // Initialize noise generators if needed
    if (!simplex) {
      simplex = new SimplexNoise(new PseudoRandomNumberGenerator(seed));
      heightNoise = new SimplexNoise(new PseudoRandomNumberGenerator(seed + 1));
      variationNoise = new SimplexNoise(new PseudoRandomNumberGenerator(seed + 2));
    }

    const totalSize = gridSize + padding * 2;
    const field = new Float32Array(totalSize * totalSize * totalSize);
    const effectiveSize = gridSize - padding;
    const offsetX = chunkX * effectiveSize;
    const offsetZ = chunkZ * effectiveSize;

    // Generate terrain data
    for (let x = 0; x < totalSize; x++) {
      for (let y = 0; y < totalSize; y++) {
        for (let z = 0; z < totalSize; z++) {
          const index = x * totalSize * totalSize + y * totalSize + z;
          const worldX = offsetX + x - padding;
          const worldY = y - padding;
          const worldZ = offsetZ + z - padding;

          field[index] = generateTerrainNoise(worldX, worldY, worldZ);
        }
      }
    }

    // Clear cache periodically
    if (noiseCache.size > 9000) {
      noiseCache.clear();
    }

    ctx.postMessage({
      type: "terrainGenerated",
      chunkX,
      chunkZ,
      field,
    });
  }
});
