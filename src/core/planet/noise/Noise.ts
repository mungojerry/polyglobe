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

export const DEFAULT_CONFIG: Readonly<NoiseConfig> = {
  octaves: 5,
  persistence: 0.55,
  lacunarity: 2.0,
  plateauStrength: 0.25,
  frequency: 1.5,
  amplitude: 1.0,
  warpStrength: 1.7,
  erosionStrength: 0.84,
};

export const MOUNTAINOUS_CONFIG: Readonly<NoiseConfig> = {
  octaves: 8,
  persistence: 0.85,
  lacunarity: 2.2,
  plateauStrength: 0.1,
  frequency: 1.8,
  amplitude: 2.5,
  warpStrength: 1.2,
  erosionStrength: 0.3,
};

// LRU Cache implementation for better memory management
class LRUCache<K, V> {
  private cache: Map<K, V>;
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  clear(): void {
    this.cache.clear();
  }
}

export class Noise implements BaseNoise {
  private static readonly CACHE_SIZE = 1024;
  private static readonly CACHE_PRECISION = 10000;
  private static readonly WARP_FREQUENCY = 0.15;
  private static readonly SECONDARY_WARP = 0.2;
  private static readonly EROSION_SAMPLE_DISTANCE = 0.1;

  private readonly baseNoiseGenerator: SimplexNoise;
  private readonly warpNoiseGenerator: SimplexNoise;
  private readonly cache: LRUCache<number, number>;
  private readonly octaveOffsets: readonly THREE.Vector3[];
  private readonly config: Readonly<NoiseConfig>;
  private readonly useCache: boolean;

  constructor(config: Partial<NoiseConfig> = {}, useCache = false) {
    this.config = Object.freeze({ ...DEFAULT_CONFIG, ...config });
    this.cache = new LRUCache(Noise.CACHE_SIZE);
    this.useCache = useCache;
    this.baseNoiseGenerator = new SimplexNoise(pseudoRandom);
    this.warpNoiseGenerator = new SimplexNoise(pseudoRandom);
    this.octaveOffsets = this.initOctaveOffsets();
  }

  private initOctaveOffsets(): readonly THREE.Vector3[] {
    return Array.from(
      { length: this.config.octaves },
      () => new THREE.Vector3(pseudoRandom.randomInRange(-10000, 10000), pseudoRandom.randomInRange(-10000, 10000), pseudoRandom.randomInRange(-10000, 10000))
    );
  }

  private static hashCoordinate(x: number, y: number, z: number): number {
    const ix = Math.floor(x * Noise.CACHE_PRECISION);
    const iy = Math.floor(y * Noise.CACHE_PRECISION);
    const iz = Math.floor(z * Noise.CACHE_PRECISION);
    return ((ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)) >>> 0;
  }

  private clamp(value: number, min = -1, max = 1): number {
    return Math.max(min, Math.min(max, value));
  }

  private applyWarp(x: number, y: number, z: number): [number, number, number] {
    if (this.config.warpStrength <= 0) return [x, y, z];

    const strength = this.clamp(this.config.warpStrength, 0, 1);
    const [wx, wy, wz] = [
      this.warpNoiseGenerator.noise3d(x * Noise.WARP_FREQUENCY + Noise.SECONDARY_WARP, y * Noise.WARP_FREQUENCY, z * Noise.WARP_FREQUENCY),
      this.warpNoiseGenerator.noise3d(y * Noise.WARP_FREQUENCY + Noise.SECONDARY_WARP, z * Noise.WARP_FREQUENCY, x * Noise.WARP_FREQUENCY),
      this.warpNoiseGenerator.noise3d(z * Noise.WARP_FREQUENCY + Noise.SECONDARY_WARP, x * Noise.WARP_FREQUENCY, y * Noise.WARP_FREQUENCY),
    ].map((n) => n * strength);

    const [clampX, clampY, clampZ] = [x, y, z].map((v) => this.clamp(1 - Math.abs(v) * 0.2));
    return [x + wx * clampX, y + wy * clampY, z + wz * clampZ];
  }

  private layeredNoise(x: number, y: number, z: number): number {
    const [warpedX, warpedY, warpedZ] = this.applyWarp(x, y, z);
    let value = 0;
    let weightSum = 0;
    let frequency = this.config.frequency;
    let amplitude = this.config.amplitude;

    for (let i = 0; i < this.config.octaves; i++) {
      const n = this.baseNoiseGenerator.noise3d(
        warpedX * frequency + this.octaveOffsets[i].x,
        warpedY * frequency + this.octaveOffsets[i].y,
        warpedZ * frequency + this.octaveOffsets[i].z
      );

      const weight = 1.0 / (1 + i * 0.7);
      const signal = i < 3 ? n : (n + (1.0 - Math.abs(n))) * 0.5;

      value += signal * amplitude * weight;
      weightSum += amplitude * weight;
      frequency *= this.config.lacunarity;
      amplitude *= this.config.persistence;
    }

    return this.applyPlateau(value / weightSum);
  }

  private applyPlateau(value: number): number {
    if (this.config.plateauStrength <= 0 || value <= 0.35) return value;

    const t = (value - 0.35) / 0.65;
    const smooth = 1 - Math.pow(1 - t, 1 + this.config.plateauStrength);
    return 0.35 + smooth * 0.65;
  }

  public getValue(x: number, y: number, z: number): number {
    if (this.useCache) {
      const cached = this.cache.get(Noise.hashCoordinate(x, y, z));
      if (cached !== undefined) return cached;
    }

    let value = this.layeredNoise(x, y, z);

    if (this.config.erosionStrength > 0) {
      const d = Noise.EROSION_SAMPLE_DISTANCE;
      const samples = [this.layeredNoise(x + d, y + d, z + d), this.layeredNoise(x - d, y + d, z - d), this.layeredNoise(x + d, y - d, z + d)];

      const erosionValue = samples.reduce((sum, v) => sum + v) / samples.length;
      value = value * (1 - this.config.erosionStrength) + erosionValue * this.config.erosionStrength;
    }

    value = this.clamp(value);
    if (this.useCache) this.cache.set(Noise.hashCoordinate(x, y, z), value);
    return value;
  }

  public batchProcess(coordinates: ReadonlyArray<[number, number, number]>): Float32Array {
    const results = new Float32Array(coordinates.length);
    coordinates.forEach((coord, i) => {
      results[i] = this.getValue(...coord);
    });
    return results;
  }

  public getConfig(): Readonly<NoiseConfig> {
    return this.config;
  }

  public clearCache(): void {
    this.cache.clear();
  }
}
