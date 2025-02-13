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
const OCTAVES = 4;
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

// Optimize caching with typed arrays
const CACHE_SIZE = 2048;
const noiseValues = new Float32Array(CACHE_SIZE);
const cacheKeys = new Int32Array(CACHE_SIZE * 3);
let cacheIndex = 0;

// Precalculated values
const octaveScales = new Float32Array(OCTAVES);
const octaveAmplitudes = new Float32Array(OCTAVES);

// Initialize precalculated values
(() => {
  let amplitude = INITIAL_AMPLITUDE;
  let frequency = INITIAL_FREQUENCY;
  let maxValue = 0;
  for (let i = 0; i < OCTAVES; i++) {
    octaveScales[i] = BASE_SCALE * frequency;
    octaveAmplitudes[i] = amplitude;
    maxValue += amplitude;
    amplitude *= PERSISTENCE;
    frequency *= FREQUENCY_MULTIPLIER;
  }
  // Normalize amplitudes
  for (let i = 0; i < OCTAVES; i++) {
    octaveAmplitudes[i] /= maxValue;
  }
})();

function getCacheKey(x: number, y: number, z: number, scale: number): number {
  return ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) % CACHE_SIZE;
}

function generateRidgedNoise(x: number, y: number, z: number, scale: number): number {
  const key = getCacheKey(x, y, z, scale);

  // Check cache
  const keyIndex = key * 3;
  if (cacheKeys[keyIndex] === x && cacheKeys[keyIndex + 1] === y && cacheKeys[keyIndex + 2] === z) {
    return noiseValues[key];
  }

  let noiseValue = 0;

  // Unrolled octaves loop for better performance
  for (let i = 0; i < OCTAVES; i++) {
    const scaledX = x * octaveScales[i];
    const scaledY = y * octaveScales[i];
    const scaledZ = z * octaveScales[i];

    const ridge = RIDGE_OFFSET - Math.abs(simplex.noise3d(scaledX, scaledY, scaledZ));
    noiseValue += ridge * ridge * octaveAmplitudes[i];
  }

  // Update cache
  cacheKeys[keyIndex] = x;
  cacheKeys[keyIndex + 1] = y;
  cacheKeys[keyIndex + 2] = z;
  noiseValues[key] = noiseValue;

  return noiseValue;
}

function generateTerrainNoise(x: number, y: number, z: number): number {
  // Fast early exits
  if (y < GROUND_THRESHOLD) return GROUND_VALUE;

  const normalizedY = y * 0.03125; // Multiply by 1/32 instead of division
  if (normalizedY > TOP_THRESHOLD) return AIR_VALUE;

  // Use lookup table or faster approximation for pow
  const heightFalloff = 1.0 - normalizedY * normalizedY * Math.sqrt(normalizedY);
  if (heightFalloff <= 0) return AIR_VALUE;

  const baseNoise = generateRidgedNoise(x, y, z, BASE_SCALE);

  // Combine height and variation calculations to reduce noise calls
  const xzScale = 0.02;
  const heightVar = heightNoise.noise3d(x * xzScale, 0, z * xzScale) * 0.2 + 0.9;

  const varScale = BASE_SCALE * VARIATION_SCALE;
  const variation = variationNoise.noise3d(x * varScale, y * varScale, z * varScale) * VARIATION_STRENGTH;

  const value = (baseNoise + variation) * heightFalloff * heightVar;

  // Use ternary for bounds checking
  return value < MIN_VALUE ? MIN_VALUE : value > MAX_VALUE ? MAX_VALUE : value;
}

// Optimize terrain generation loop
ctx.addEventListener("message", (e: MessageEvent<TerrainGenerationMessage>) => {
  if (e.data.type === "generateTerrain") {
    const { chunkX, chunkZ, gridSize, padding, seed } = e.data;

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

    // Use a single loop with precalculated indices
    const totalElements = totalSize * totalSize * totalSize;
    const yzSize = totalSize * totalSize;

    for (let i = 0; i < totalElements; i++) {
      const x = (i / yzSize) | 0;
      const y = ((i % yzSize) / totalSize) | 0;
      const z = i % totalSize;

      const worldX = offsetX + x - padding;
      const worldY = y - padding;
      const worldZ = offsetZ + z - padding;

      field[i] = generateTerrainNoise(worldX, worldY, worldZ);
    }

    // Reset cache periodically
    if (++cacheIndex > CACHE_SIZE * 0.9) {
      cacheIndex = 0;
      noiseValues.fill(0);
      cacheKeys.fill(0);
    }

    ctx.postMessage({
      type: "terrainGenerated",
      chunkX,
      chunkZ,
      field,
    });
  }
});
