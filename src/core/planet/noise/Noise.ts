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
  persistence: 0.6,
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
  private static hashCoordinate(x: number, y: number, z: number): number {
    return ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) >>> 0;
  }
  private cleanCache() {
    if (this.cache.size > this.MAX_CACHE_SIZE) {
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => b[1] - a[1]); // Sort by value
      this.cache = new Map(entries.slice(0, this.MAX_CACHE_SIZE / 2));
    }
  }
  private getCachedNoise(x: number, y: number, z: number): number | undefined {
    const key = Noise.hashCoordinate(Math.round(x * this.CACHE_PRECISION), Math.round(y * this.CACHE_PRECISION), Math.round(z * this.CACHE_PRECISION));
    return this.cache.get(key);
  }

  private setCachedNoise(x: number, y: number, z: number, value: number): void {
    const key = Noise.hashCoordinate(Math.round(x * this.CACHE_PRECISION), Math.round(y * this.CACHE_PRECISION), Math.round(z * this.CACHE_PRECISION));
    this.cache.set(key, value);
    this.cleanCache(); // Call cleanup after setting new value
  }

  private fastDomainWarp(x: number, y: number, z: number): [number, number, number] {
    const strength = Math.min(1, this.config.warpStrength);
    const freq = this.WARP_FREQUENCY;
    const sec = this.SECONDARY_WARP;

    // Smoother warping with frequency blending
    const wx = Noise.warpNoiseGenerator.noise3d(x * freq + sec, y * freq, z * freq) * strength;

    const wy = Noise.warpNoiseGenerator.noise3d(y * freq + sec, z * freq, x * freq) * strength;

    const wz = Noise.warpNoiseGenerator.noise3d(z * freq + sec, x * freq, y * freq) * strength;

    return [x + wx * (1 - Math.abs(x) * 0.2), y + wy * (1 - Math.abs(y) * 0.2), z + wz * (1 - Math.abs(z) * 0.2)];
  }

  private layeredNoise(x: number, y: number, z: number): number {
    let noiseValue = 0;
    let frequency = this.config.frequency;
    let amplitude = this.config.amplitude;
    let weightSum = 0;

    // Apply smoother domain warping
    if (this.config.warpStrength > 0) {
      [x, y, z] = this.fastDomainWarp(x, y, z);
    }

    // Improved octave accumulation
    for (let i = 0; i < this.config.octaves; i++) {
      const noise = Noise.baseNoiseGenerator.noise3d(x * frequency, y * frequency, z * frequency);

      // Smooth noise blending
      const weight = 1 / (1 + i);
      noiseValue += noise * amplitude * weight;
      weightSum += amplitude * weight;

      frequency *= this.config.lacunarity;
      amplitude *= this.config.persistence;
    }

    // Proper normalization
    noiseValue = noiseValue / weightSum;

    // Apply terrain features
    if (this.config.plateauStrength > 0) {
      noiseValue = this.applyPlateau(noiseValue);
    }

    return Math.max(-1, Math.min(1, noiseValue));
  }

  private applyPlateau(value: number): number {
    const strength = this.config.plateauStrength;
    const threshold = 0.3;

    if (value > threshold) {
      const t = (value - threshold) / (1 - threshold);
      value = threshold + (1 - Math.pow(1 - t, 1 + strength)) * (1 - threshold);
    }

    return value;
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
    const cached = this.getCachedNoise(x, y, z);
    if (cached !== undefined) return cached;

    let value = this.layeredNoise(x, y, z);

    // Apply erosion smoothing
    if (this.config.erosionStrength > 0) {
      const eroded = this.layeredNoise(x + 0.1, y + 0.1, z + 0.1);
      value = value * (1 - this.config.erosionStrength) + eroded * this.config.erosionStrength;
    }

    this.setCachedNoise(x, y, z, value);
    return value;
  }
}
