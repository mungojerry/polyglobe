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

export const TERRAIN_MOUNTAINS = {
  octaves: 5,
  persistence: 0.55,
  lacunarity: 2.0,
  baseRoughness: 1.2,
  ridgedOffset: 1.1,
  plateauStrength: 0.4,
  valleyDepth: 0.6,
  frequency: 0.4,
  amplitude: 1.8,
  detailScale: 0.9,
  warpStrength: 0.45,
  erosionStrength: 0.4,
};

export const TERRAIN_HILLS = {
  octaves: 4,
  persistence: 0.5,
  lacunarity: 1.8,
  baseRoughness: 0.8,
  ridgedOffset: 0.9,
  plateauStrength: 0.5,
  valleyDepth: 0.4,
  frequency: 0.35,
  amplitude: 1.4,
  detailScale: 0.7,
  warpStrength: 0.35,
  erosionStrength: 0.3,
};

export const TERRAIN_PLAINS = {
  octaves: 3,
  persistence: 0.45,
  lacunarity: 1.6,
  baseRoughness: 0.5,
  ridgedOffset: 0.7,
  plateauStrength: 0.6,
  valleyDepth: 0.3,
  frequency: 0.3,
  amplitude: 1.0,
  detailScale: 0.5,
  warpStrength: 0.25,
  erosionStrength: 0.25,
};

export class Noise {
  private static baseNoiseGenerator = new SimplexNoise(pseudoRandom);
  private static warpNoiseGenerator = new SimplexNoise(pseudoRandom);

  private cache: Map<number, number>;
  private readonly MAX_CACHE_SIZE = 1024;
  private readonly CACHE_PRECISION = 100;
  private readonly WARP_FREQUENCY = 0.6;
  private readonly SECONDARY_WARP = 0.3;

  public config: NoiseConfig;

  constructor(config: Partial<NoiseConfig> = {}) {
    this.config = { ...TERRAIN_MOUNTAINS, ...config };
    this.cache = new Map();
  }

  private fastDomainWarp(x: number, y: number, z: number): [number, number, number] {
    const wx = Noise.warpNoiseGenerator.noise3d(x * this.WARP_FREQUENCY, y * this.SECONDARY_WARP, z * this.SECONDARY_WARP) * this.config.warpStrength;
    const wy = Noise.warpNoiseGenerator.noise3d(y * this.WARP_FREQUENCY, z * this.SECONDARY_WARP, x * this.SECONDARY_WARP) * this.config.warpStrength;
    const wz = Noise.warpNoiseGenerator.noise3d(z * this.WARP_FREQUENCY, x * this.SECONDARY_WARP, y * this.SECONDARY_WARP) * this.config.warpStrength;

    return [x + wx, y + wy, z + wz];
  }

  public layeredNoise(x: number, y: number, z: number): number {
    const cacheKey = Math.round(x * this.CACHE_PRECISION) * 1000000 + Math.round(y * this.CACHE_PRECISION) * 1000 + Math.round(z * this.CACHE_PRECISION);

    const cachedValue = this.cache.get(cacheKey);
    if (cachedValue !== undefined) return cachedValue;

    const [wx, wy, wz] = this.fastDomainWarp(x, y, z);

    let total = 0;
    let currentAmplitude = this.config.amplitude;
    let frequency = this.config.frequency;
    let maxValue = 0;

    for (let i = 0; i < this.config.octaves; i++) {
      const noiseValue = Noise.baseNoiseGenerator.noise3d(
        wx * frequency * this.config.baseRoughness,
        wy * frequency * this.config.baseRoughness,
        wz * frequency * this.config.baseRoughness
      );

      // Ridge formation with variable sharpness
      const absNoise = Math.abs(noiseValue);
      const ridgeBase = this.config.ridgedOffset - absNoise;
      const ridge = Math.pow(Math.abs(ridgeBase), 1.5) * Math.sign(ridgeBase);

      // Height factor with plateau influence
      const heightBase = (ridge + 1) * 0.5;
      const plateau = Math.pow(heightBase, 1 + this.config.plateauStrength);
      const heightFactor = Math.max(0, Math.min(1, plateau));

      // Valley formation with depth variation
      const valleyDepth = this.config.valleyDepth * (1 + heightFactor * 0.2);
      const valleyFactor = heightFactor < 0.4 
        ? 1 - (valleyDepth * Math.pow(0.4 - heightFactor, 1.8))
        : 1;

      // Amplitude modification with octave weighting
      const octaveWeight = 1.0 / (1.0 + i * 0.5);
      const terrainAmplitude = currentAmplitude * valleyFactor * octaveWeight;

      // Erosion influence
      const erosionFactor = 1 - (this.config.erosionStrength * Math.pow(absNoise, 1.2));

      // Combine all factors
      const contribution = ridge * terrainAmplitude * erosionFactor;

      total += contribution;
      maxValue += terrainAmplitude;

      // Detail noise for higher elevations
      if (heightFactor > 0.6 && i > 1) {
        const detailNoise = Noise.baseNoiseGenerator.noise3d(
          wx * frequency * this.config.detailScale,
          wy * frequency * this.config.detailScale,
          wz * frequency * this.config.detailScale
        );

        const detailWeight = Math.pow(heightFactor - 0.6, 1.5);
        const detailContribution = detailNoise * currentAmplitude * 0.25 * detailWeight;
        total += detailContribution;
        maxValue += currentAmplitude * 0.25;
      }

      currentAmplitude *= this.config.persistence;
      frequency *= this.config.lacunarity;
    }

    const result = (total / maxValue) * this.config.amplitude;

    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(cacheKey, result);

    return result;
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