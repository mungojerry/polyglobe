import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise.js";
import { pseudoRandom } from "../../utils/PseudoRandom";

export type NoiseConfig = {
  octaves: number;
  persistence: number;
  lacunarity: number;
  baseRoughness: number;
  ridgedOffset: number;
  plateauStrength: number;
  valleyDepth: number;
  frequency: number;
  amplitude: number;
  detailScale: number;
  warpStrength: number;
  erosionStrength: number;
};

export const DEFAULT_CONFIG = {
  octaves: 6,
  persistence: 0.4,
  lacunarity: 1.8,
  baseRoughness: 0.8,
  ridgedOffset: 0.9,
  plateauStrength: 0.3,
  valleyDepth: 0.4,
  frequency: 1.3,
  amplitude: 1.3,
  detailScale: 0.6,
  warpStrength: 0.3,
  erosionStrength: 0.2,
};

export class Noise {
  private static baseNoiseGenerator = new SimplexNoise(pseudoRandom);
  private static warpNoiseGenerator = new SimplexNoise(pseudoRandom);

  private cache: Map<number, number>;
  private readonly MAX_CACHE_SIZE = 1024;
  private readonly CACHE_PRECISION = 100;
  private readonly WARP_FREQUENCY = 0.4;
  private readonly SECONDARY_WARP = 0.2;

  public config: NoiseConfig;

  constructor(config: Partial<NoiseConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cache = new Map();
  }

  private fastDomainWarp(x: number, y: number, z: number): [number, number, number] {
    const wx = Noise.warpNoiseGenerator.noise3d(x * this.WARP_FREQUENCY, y * this.SECONDARY_WARP, z * this.SECONDARY_WARP) * this.config.warpStrength;
    const wy = Noise.warpNoiseGenerator.noise3d(y * this.WARP_FREQUENCY, z * this.SECONDARY_WARP, x * this.SECONDARY_WARP) * this.config.warpStrength;
    const wz = Noise.warpNoiseGenerator.noise3d(z * this.WARP_FREQUENCY, x * this.SECONDARY_WARP, y * this.SECONDARY_WARP) * this.config.warpStrength;

    return [x + wx, y + wy, z + wz];
  }

  private ridgeNoise(noiseValue: number): number {
    const absValue = Math.abs(noiseValue);
    const ridge = this.config.ridgedOffset - absValue;
    // Make ridge formation more subtle
    return ridge * 0.7;
  }

  public layeredNoise(x: number, y: number, z: number): number {
    const cacheKey = Math.round(x * this.CACHE_PRECISION) * 1000000 + Math.round(y * this.CACHE_PRECISION) * 1000 + Math.round(z * this.CACHE_PRECISION);

    const cachedValue = this.cache.get(cacheKey);
    if (cachedValue !== undefined) return cachedValue;

    const [wx, wy, wz] = this.fastDomainWarp(x, y, z);

    let total = 0;
    let frequency = this.config.frequency;
    let amplitude = 1.0;
    let maxAmplitude = 0;

    for (let i = 0; i < this.config.octaves; i++) {
      const noiseValue = Noise.baseNoiseGenerator.noise3d(
        wx * frequency * this.config.baseRoughness,
        wy * frequency * this.config.baseRoughness,
        wz * frequency * this.config.baseRoughness
      );

      const ridgeValue = this.ridgeNoise(noiseValue);

      // Reduce weight of higher octaves
      const weight = 1.0 / (i + 1.5);
      total += ridgeValue * amplitude * weight;
      maxAmplitude += amplitude * weight;

      // Add subtle detail noise only for first two octaves
      // if (i < 2) {
      const detailNoise = Noise.baseNoiseGenerator.noise3d(
        wx * frequency * this.config.detailScale,
        wy * frequency * this.config.detailScale,
        wz * frequency * this.config.detailScale
      );

      const detailWeight = 0.15 * weight;
      total += detailNoise * amplitude * detailWeight;
      maxAmplitude += amplitude * detailWeight;
      // }

      frequency *= this.config.lacunarity;
      amplitude *= this.config.persistence;
    }

    // Normalize and scale down the final value
    const normalizedValue = (total / maxAmplitude) * this.config.amplitude;

    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(cacheKey, normalizedValue);

    return normalizedValue;
  }

  public batchProcess(coordinates: ReadonlyArray<[number, number, number]>): Float32Array {
    const results = new Float32Array(coordinates.length);
    for (let i = 0; i < coordinates.length; i++) {
      results[i] = this.layeredNoise(...coordinates[i]);
    }
    return results;
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public getValue(x: number, y: number, z: number): number {
    return this.layeredNoise(x, y, z);
  }
}
