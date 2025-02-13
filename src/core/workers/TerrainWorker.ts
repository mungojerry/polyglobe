import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise";
import { PseudoRandomNumberGenerator } from "../utils/PseudoRandom";

// Constants moved to a config object for better performance
const CONFIG = {
  GROUND: { THRESHOLD: 2, VALUE: 0.9 },
  AIR: { THRESHOLD: 0.95, VALUE: 0.1 },
  VALUE_BOUNDS: { MIN: 0.001, MAX: 0.999 },
  VARIATION: { SCALE: 0.3, STRENGTH: 0.2 },
  NOISE: {
    OCTAVES: 4,
    PERSISTENCE: 0.5,
    BASE_SCALE: 0.03,
    RIDGE_OFFSET: 1.0,
    INITIAL: { AMPLITUDE: 0.5, FREQUENCY: 0.4 },
    FREQUENCY_MULTIPLIER: 2.0,
  },
  CACHE: { SIZE: 4096, RESET_THRESHOLD: 0.9 },
} as const;

// Precomputed values
const CACHED = {
  octaveScales: new Float32Array(CONFIG.NOISE.OCTAVES),
  octaveAmplitudes: new Float32Array(CONFIG.NOISE.OCTAVES),
  // Pre-allocated buffers for noise calculations
  noiseValues: new Float32Array(CONFIG.CACHE.SIZE),
  cacheKeys: new Int32Array(CONFIG.CACHE.SIZE * 3),
  cacheIndex: 0,
};

// Initialize octave calculations once
(() => {
  let amplitude = CONFIG.NOISE.INITIAL.AMPLITUDE;
  let frequency = CONFIG.NOISE.INITIAL.FREQUENCY;
  let maxValue = 0;

  for (let i = 0; i < CONFIG.NOISE.OCTAVES; i++) {
    CACHED.octaveScales[i] = CONFIG.NOISE.BASE_SCALE * frequency;
    CACHED.octaveAmplitudes[i] = amplitude;
    maxValue += amplitude;
    amplitude *= CONFIG.NOISE.PERSISTENCE;
    frequency *= CONFIG.NOISE.FREQUENCY_MULTIPLIER;
  }

  // Normalize amplitudes
  const invMaxValue = 1 / maxValue;
  for (let i = 0; i < CONFIG.NOISE.OCTAVES; i++) {
    CACHED.octaveAmplitudes[i] *= invMaxValue;
  }
})();

// Noise generators
let noiseGenerators: {
  simplex: SimplexNoise;
  height: SimplexNoise;
  variation: SimplexNoise;
} | null = null;

// Inline small helper functions for better performance
const inline = {
  getCacheKey: (x: number, y: number, z: number): number => ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) % CONFIG.CACHE.SIZE,

  clamp: (value: number): number =>
    value < CONFIG.VALUE_BOUNDS.MIN ? CONFIG.VALUE_BOUNDS.MIN : value > CONFIG.VALUE_BOUNDS.MAX ? CONFIG.VALUE_BOUNDS.MAX : value,
};

// Main noise generation function with optimizations
function generateRidgedNoise(x: number, y: number, z: number): number {
  const key = inline.getCacheKey(x, y, z);
  const keyIndex = key * 3;

  // Cache hit check
  if (CACHED.cacheKeys[keyIndex] === x && CACHED.cacheKeys[keyIndex + 1] === y && CACHED.cacheKeys[keyIndex + 2] === z) {
    return CACHED.noiseValues[key];
  }

  let noiseValue = 0;
  const { simplex } = noiseGenerators!;

  // Unrolled octaves loop with SIMD-friendly operations
  for (let i = 0; i < CONFIG.NOISE.OCTAVES; i++) {
    const scale = CACHED.octaveScales[i];
    const scaledX = x * scale;
    const scaledY = y * scale;
    const scaledZ = z * scale;

    const baseNoise = Math.abs(simplex.noise3d(scaledX, scaledY, scaledZ));
    const ridge = CONFIG.NOISE.RIDGE_OFFSET - baseNoise;
    noiseValue += ridge * ridge * CACHED.octaveAmplitudes[i];
  }

  // Update cache
  CACHED.cacheKeys[keyIndex] = x;
  CACHED.cacheKeys[keyIndex + 1] = y;
  CACHED.cacheKeys[keyIndex + 2] = z;
  CACHED.noiseValues[key] = noiseValue;

  return noiseValue;
}

// Optimized terrain generation with minimal branching
function generateTerrainNoise(x: number, y: number, z: number): number {
  if (y < CONFIG.GROUND.THRESHOLD) return CONFIG.GROUND.VALUE;

  const normalizedY = y * 0.03125; // 1/32 multiplication
  if (normalizedY > CONFIG.AIR.THRESHOLD) return CONFIG.AIR.VALUE;

  // Fast height falloff calculation
  const heightFalloff = 1.0 - normalizedY * normalizedY * Math.sqrt(normalizedY);
  if (heightFalloff <= 0) return CONFIG.AIR.VALUE;

  const { height: heightNoise, variation: variationNoise } = noiseGenerators!;

  // Combined noise calculations
  const baseNoise = generateRidgedNoise(x, y, z);
  const xzScale = 0.02;
  const heightVar = heightNoise.noise3d(x * xzScale, 0, z * xzScale) * 0.2 + 0.9;

  const varScale = CONFIG.NOISE.BASE_SCALE * CONFIG.VARIATION.SCALE;
  const variation = variationNoise.noise3d(x * varScale, y * varScale, z * varScale) * CONFIG.VARIATION.STRENGTH;

  return inline.clamp((baseNoise + variation) * heightFalloff * heightVar);
}

// Optimized message handler with TypedArrays
const ctx: Worker = self as any;

ctx.addEventListener(
  "message",
  (
    e: MessageEvent<{
      type: "generateTerrain";
      chunkX: number;
      chunkZ: number;
      gridSize: number;
      padding: number;
      seed: number;
    }>
  ) => {
    if (e.data.type === "generateTerrain") {
      const { chunkX, chunkZ, gridSize, padding, seed } = e.data;

      // Lazy initialization of noise generators
      if (!noiseGenerators) {
        noiseGenerators = {
          simplex: new SimplexNoise(new PseudoRandomNumberGenerator(seed)),
          height: new SimplexNoise(new PseudoRandomNumberGenerator(seed + 1)),
          variation: new SimplexNoise(new PseudoRandomNumberGenerator(seed + 2)),
        };
      }

      const totalSize = gridSize + padding * 2;
      const field = new Float32Array(totalSize * totalSize * totalSize);
      const effectiveSize = gridSize - padding;
      const offsetX = chunkX * effectiveSize;
      const offsetZ = chunkZ * effectiveSize;

      // Optimized single-loop terrain generation
      const totalElements = totalSize * totalSize * totalSize;
      const yzSize = totalSize * totalSize;

      for (let i = 0; i < totalElements; i++) {
        const x = (i / yzSize) | 0;
        const y = ((i % yzSize) / totalSize) | 0;
        const z = i % totalSize;

        field[i] = generateTerrainNoise(offsetX + x - padding, y - padding, offsetZ + z - padding);
      }

      // Periodic cache reset
      if (++CACHED.cacheIndex > CONFIG.CACHE.SIZE * CONFIG.CACHE.RESET_THRESHOLD) {
        CACHED.cacheIndex = 0;
        CACHED.noiseValues.fill(0);
        CACHED.cacheKeys.fill(0);
      }

      ctx.postMessage({
        type: "terrainGenerated",
        chunkX,
        chunkZ,
        field,
      });
    }
  }
);
