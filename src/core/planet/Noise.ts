import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise.js";
import { pseudoRandom } from "../utils/PseudoRandom";

export class Noise {
  // Static noise generators to reduce object creation overhead
  private static baseNoiseGenerator = new SimplexNoise(pseudoRandom);
  private static warpNoiseGenerator = new SimplexNoise(pseudoRandom);

  // Preallocated cache with fixed size to reduce memory allocation
  private cache: Map<number, number>;
  private readonly MAX_CACHE_SIZE = 1024;

  // Precomputed constants to avoid repeated calculations
  private readonly CACHE_PRECISION = 100;
  private readonly WARP_FREQUENCY = 0.8;
  private readonly SECONDARY_WARP = 0.4;

  // Configurable parameters with sensible defaults
  public octaves: number; // Number of noise layers
  public persistence: number; // How much each octave contributes
  public lacunarity: number; // How frequency changes between octaves
  public ridgedOffset: number; // Offset for ridge formation
  public frequency: number; // Base frequency
  public amplitude: number; // Base amplitude
  public warpStrength: number; // Domain warping strength

  // Add terrain presets as static members
  public static readonly TERRAIN_MOUNTAINS = {
    octaves: 6,
    persistence: 0.65,
    lacunarity: 2.2,
    ridgedOffset: 1.1,
    frequency: 0.45,
    amplitude: 2.0,
    warpStrength: 0.45,
  };

  constructor({ octaves = 6, persistence = 0.65, lacunarity = 2.2, ridgedOffset = 1.1, frequency = 0.45, amplitude = 0.5, warpStrength = 0.45 } = {}) {
    this.octaves = octaves;
    this.persistence = persistence;
    this.lacunarity = lacunarity;
    this.ridgedOffset = ridgedOffset;
    this.frequency = frequency;
    this.amplitude = amplitude;
    this.warpStrength = warpStrength;

    // Use a fixed-size Map to prevent unbounded memory growth
    this.cache = new Map();
  }

  // Optimized domain warping with inline calculations
  private fastDomainWarp(x: number, y: number, z: number): [number, number, number] {
    const wx = Noise.warpNoiseGenerator.noise3d(x * this.WARP_FREQUENCY, y * this.SECONDARY_WARP, z * this.SECONDARY_WARP) * this.warpStrength;

    const wy = Noise.warpNoiseGenerator.noise3d(y * this.WARP_FREQUENCY, z * this.SECONDARY_WARP, x * this.SECONDARY_WARP) * this.warpStrength;

    const wz = Noise.warpNoiseGenerator.noise3d(z * this.WARP_FREQUENCY, x * this.SECONDARY_WARP, y * this.SECONDARY_WARP) * this.warpStrength;

    return [x + wx, y + wy, z + wz];
  }

  // Optimized noise generation with reduced complexity
  public layeredNoise(x: number, y: number, z: number): number {
    const cacheKey = Math.round(x * this.CACHE_PRECISION) * 1000000 + Math.round(y * this.CACHE_PRECISION) * 1000 + Math.round(z * this.CACHE_PRECISION);

    const cachedValue = this.cache.get(cacheKey);
    if (cachedValue !== undefined) return cachedValue;

    // Apply different noise characteristics based on height
    const [wx, wy, wz] = this.fastDomainWarp(x, y, z);

    let total = 0;
    let currentAmplitude = this.amplitude;
    let frequency = this.frequency;
    let maxValue = 0;

    // Base mountain noise
    for (let i = 0; i < this.octaves; i++) {
      const noiseValue = Noise.baseNoiseGenerator.noise3d(wx * frequency, wy * frequency, wz * frequency);

      // Enhanced ridge formation
      const ridge = this.ridgedOffset - Math.abs(noiseValue);

      // Apply height-based blending
      const heightFactor = Math.max(0, Math.min(1, (ridge + 1) / 2));
      const blendedAmplitude =
        currentAmplitude *
        (heightFactor > 0.7
          ? // Peak amplification
            currentAmplitude * 1.5 * (heightFactor - 0.7)
          : // Base terrain
            currentAmplitude);

      // Apply terrain characteristics
      const scaled = ridge * blendedAmplitude;
      total += scaled * (1.0 + Math.abs(noiseValue));

      maxValue += blendedAmplitude;
      currentAmplitude *= this.persistence;
      frequency *= this.lacunarity;

      // Add detail noise at higher elevations
      if (heightFactor > 0.6 && i > 2) {
        const detailNoise = Noise.baseNoiseGenerator.noise3d(wx * frequency * 2, wy * frequency * 2, wz * frequency * 2);
        total += detailNoise * currentAmplitude * 0.3 * (heightFactor - 0.6);
        maxValue += currentAmplitude * 0.3;
      }
    }

    const result = (total / maxValue) * this.amplitude;

    // Cache management
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(cacheKey, result);

    return result;
  }

  // Batch processing with SIMD-like optimization
  public batchProcess(coordinates: ReadonlyArray<[number, number, number]>): Float32Array {
    const results = new Float32Array(coordinates.length);
    for (let i = 0; i < coordinates.length; i++) {
      results[i] = this.layeredNoise(...coordinates[i]);
    }
    return results;
  }

  // Utility methods
  public clearCache(): void {
    this.cache.clear();
  }

  // Modify getTerrainHeight if you have one
  public getValue(x: number, y: number, z: number): number {
    return this.layeredNoise(x, y, z);
  }
}
