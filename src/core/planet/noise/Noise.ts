import * as THREE from "three";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise.js";
import { pseudoRandom } from "../../utils/PseudoRandom";
import { BaseNoise } from "./BaseNoise";

export type NoiseConfig = {
  octaves: number;
  persistence: number;
  lacunarity: number;
  plateauStrength: number;
  frequency: number;
  amplitude: number;
  warpStrength: number;
  erosionStrength: number;
};

export const DEFAULT_CONFIG = {
  octaves: 5, // Reduced for better performance while maintaining detail
  persistence: 0.55, // Balanced for natural height progression
  lacunarity: 2.0, // Increased for better detail variation
  plateauStrength: 0.25, // Reduced to avoid artificial-looking flattening
  frequency: 1.5, // Increased for less rounded hills
  amplitude: 1.0, // Base amplitude for consistent range
  warpStrength: 0.11, // Reduced to minimize spikiness
  erosionStrength: 0.4, // Balanced erosion effect
};

// TODO problems with the cache, produces spikes
const MAX_CACHE_SIZE = 1024;
const CACHE_PRECISION = 10000;
const USE_CACHE = false;

export class Noise implements BaseNoise {
  private static baseNoiseGenerator = new SimplexNoise(pseudoRandom);
  private static warpNoiseGenerator = new SimplexNoise(pseudoRandom);

  private cache: Map<number, number>;

  // Warp parameters now exposed as constants, but can be adjusted
  private readonly WARP_FREQUENCY = 0.08; // Reduced for less aggressive warping
  private readonly SECONDARY_WARP = 0.15; // Reduced secondary influence

  private config: NoiseConfig;

  constructor(config: Partial<NoiseConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cache = new Map();
  }

  public getConfig(): NoiseConfig {
    return this.config;
  }

  /**
   * Creates a hashed integer coordinate.
   */
  private static hashCoordinate(x: number, y: number, z: number): number {
    const ix = Math.floor(x * CACHE_PRECISION);
    const iy = Math.floor(y * CACHE_PRECISION);
    const iz = Math.floor(z * CACHE_PRECISION);
    return ((ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)) >>> 0;
  }

  /**
   * Keeps cache from growing unbounded.
   */
  private cleanCache(): void {
    if (this.cache.size > MAX_CACHE_SIZE) {
      const entries = Array.from(this.cache.entries());
      // Sort by value for potential LRU or usage-based culling
      entries.sort((a, b) => b[1] - a[1]);
      this.cache = new Map(entries.slice(0, MAX_CACHE_SIZE / 2));
    }
  }

  /**
   * Returns cached noise if available.
   */
  private getCachedNoise(x: number, y: number, z: number): number | undefined {
    const key = Noise.hashCoordinate(Math.round(x * CACHE_PRECISION), Math.round(y * CACHE_PRECISION), Math.round(z * CACHE_PRECISION));
    return this.cache.get(key);
  }

  /**
   * Stores noise value in cache.
   */
  private setCachedNoise(x: number, y: number, z: number, value: number): void {
    const key = Noise.hashCoordinate(Math.round(x * CACHE_PRECISION), Math.round(y * CACHE_PRECISION), Math.round(z * CACHE_PRECISION));
    this.cache.set(key, value);
    this.cleanCache();
  }

  /**
   * Simple clamp utility.
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Domain warp function with clamping to reduce large spikes.
   */
  private applyWarp(x: number, y: number, z: number): [number, number, number] {
    const strength = this.clamp(this.config.warpStrength, 0, 1);
    const freq = this.WARP_FREQUENCY;
    const sec = this.SECONDARY_WARP;

    // Sample warp noise
    const wx = Noise.warpNoiseGenerator.noise3d(x * freq + sec, y * freq, z * freq) * strength;
    const wy = Noise.warpNoiseGenerator.noise3d(y * freq + sec, z * freq, x * freq) * strength;
    const wz = Noise.warpNoiseGenerator.noise3d(z * freq + sec, x * freq, y * freq) * strength;

    // Clamping factors to reduce extreme displacements
    const clampX = this.clamp(1 - Math.abs(x) * 0.2, 0, 1);
    const clampY = this.clamp(1 - Math.abs(y) * 0.2, 0, 1);
    const clampZ = this.clamp(1 - Math.abs(z) * 0.2, 0, 1);

    return [x + wx * clampX, y + wy * clampY, z + wz * clampZ];
  }

  /**
   * Accumulates noise across O octaves, applying domain warping.
   */
  private layeredNoise(x: number, y: number, z: number): number {
    let noiseValue = 0;
    let frequency = this.config.frequency;
    let amplitude = this.config.amplitude;
    let weightSum = 0;
    // Domain warp if enabled
    if (this.config.warpStrength > 0) {
      [x, y, z] = this.applyWarp(x, y, z);
    }
    const octaveOffsets: THREE.Vector3[] = [];
    for (let i = 0; i < this.config.octaves; i++) {
      octaveOffsets[i] = new THREE.Vector3(
        pseudoRandom.randomInRange(-10000, 10000),
        pseudoRandom.randomInRange(-10000, 10000),
        pseudoRandom.randomInRange(-10000, 10000)
      );
    }
    for (let i = 0; i < this.config.octaves; i++) {
      const n = Noise.baseNoiseGenerator.noise3d(x * frequency, y * frequency, z * frequency);

      // Progressive weight reduction for natural detail falloff
      const weight = 1.0 / (1 + i * 0.7);

      // Combine regular and ridged noise for varied terrain
      const ridged = 1.0 - Math.abs(n);
      const signal = i < 3 ? n : (n + ridged) * 0.5;

      noiseValue += signal * amplitude * weight;
      weightSum += amplitude * weight;

      frequency *= this.config.lacunarity;
      amplitude *= this.config.persistence;
    }

    // Normalize final value
    noiseValue /= weightSum;

    // Apply enhanced plateau effect
    if (this.config.plateauStrength > 0) {
      noiseValue = this.applyPlateau(noiseValue);
    }

    return this.clamp(noiseValue, -1, 1);
  }

  /**
   * Flattens high values with a plateau effect.
   */
  private applyPlateau(value: number): number {
    const strength = this.config.plateauStrength;
    const threshold = 0.35;

    if (value > threshold) {
      const t = (value - threshold) / (1 - threshold);
      const smooth = 1 - Math.pow(1 - t, 1 + strength);
      return threshold + smooth * (1 - threshold);
    }
    return value;
  }

  /**
   * Optionally processes multiple coordinates at once.
   */
  public batchProcess(coordinates: ReadonlyArray<[number, number, number]>): Float32Array {
    const results = new Float32Array(coordinates.length);
    for (let i = 0; i < coordinates.length; i++) {
      results[i] = this.layeredNoise(...coordinates[i]);
    }
    return results;
  }

  /**
   * Clears the noise cache.
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * Computes final noise value at (x, y, z).
   */
  public getValue(x: number, y: number, z: number): number {
    if (USE_CACHE) {
      const cached = this.getCachedNoise(x, y, z);
      if (cached !== undefined) {
        return cached;
      }
    }

    let value = this.layeredNoise(x, y, z);

    // Enhanced erosion with multiple samples
    if (this.config.erosionStrength > 0) {
      const samples = [
        this.layeredNoise(x + 0.1, y + 0.1, z + 0.1),
        this.layeredNoise(x - 0.1, y + 0.1, z - 0.1),
        this.layeredNoise(x + 0.1, y - 0.1, z + 0.1),
      ];

      const erosionValue = samples.reduce((sum, v) => sum + v, 0) / samples.length;
      value = value * (1 - this.config.erosionStrength) + erosionValue * this.config.erosionStrength;
    }

    // Keep value in -1 to 1 range for terrainHelper
    value = this.clamp(value, -1, 1);
    if (USE_CACHE) this.setCachedNoise(x, y, z, value);
    return value;
  }
}
