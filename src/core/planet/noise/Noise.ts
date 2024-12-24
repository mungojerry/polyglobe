import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise.js";
import { pseudoRandom } from "../../utils/PseudoRandom";

export type NoiseConfig = {
  // Basic noise parameters
  octaves: number; // Number of noise layers (1-8, higher = more detail)
  persistence: number; // How much each octave contributes (0-1, higher = rougher)
  lacunarity: number; // How much detail is added in each octave (1-4, higher = more frequent details)

  // Terrain shaping
  baseRoughness: number; // Base terrain roughness (0-2, higher = rougher terrain)
  ridgedOffset: number; // Ridge sharpness (0.5-2, higher = sharper ridges)
  plateauStrength: number; // Strength of flat areas (0-1, higher = more plateaus)
  valleyDepth: number; // Depth of valleys (0-1, higher = deeper valleys)

  // Scale parameters
  frequency: number; // Base frequency of the noise (0.1-2, higher = more variations)
  amplitude: number; // Overall height multiplier (0.5-3, higher = more extreme heights)

  // Detail control
  detailScale: number; // Scale of small details (0.1-2, higher = smaller details)
  warpStrength: number; // Strength of terrain distortion (0-1, higher = more warping)
  erosionStrength: number; // Simulated erosion strength (0-1, higher = more erosion)
};

// Enhanced terrain presets
export const TERRAIN_MOUNTAINS = {
  octaves: 6,
  persistence: 0.65,
  lacunarity: 2.2,
  baseRoughness: 1.5,
  ridgedOffset: 1.1,
  plateauStrength: 0.3,
  valleyDepth: 0.7,
  frequency: 0.45,
  amplitude: 2.0,
  detailScale: 1.2,
  warpStrength: 0.45,
  erosionStrength: 0.6,
};

export const TERRAIN_HILLS = {
  octaves: 5,
  persistence: 0.5,
  lacunarity: 1.8,
  baseRoughness: 0.8,
  ridgedOffset: 0.9,
  plateauStrength: 0.4,
  valleyDepth: 0.4,
  frequency: 0.35,
  amplitude: 1.4,
  detailScale: 0.8,
  warpStrength: 0.3,
  erosionStrength: 0.4,
};

export const TERRAIN_PLAINS = {
  octaves: 4,
  persistence: 0.4,
  lacunarity: 1.5,
  baseRoughness: 0.4,
  ridgedOffset: 0.7,
  plateauStrength: 0.8,
  valleyDepth: 0.2,
  frequency: 0.25,
  amplitude: 0.8,
  detailScale: 0.6,
  warpStrength: 0.2,
  erosionStrength: 0.3,
};

export class Noise {
  private static baseNoiseGenerator = new SimplexNoise(pseudoRandom);
  private static warpNoiseGenerator = new SimplexNoise(pseudoRandom);

  private cache: Map<number, number>;
  private readonly MAX_CACHE_SIZE = 1024;
  private readonly CACHE_PRECISION = 100;
  private readonly WARP_FREQUENCY = 0.8;
  private readonly SECONDARY_WARP = 0.4;

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

    // Base terrain generation
    for (let i = 0; i < this.config.octaves; i++) {
      const noiseValue = Noise.baseNoiseGenerator.noise3d(
        wx * frequency * this.config.baseRoughness,
        wy * frequency * this.config.baseRoughness,
        wz * frequency * this.config.baseRoughness
      );

      // Enhanced ridge formation with plateau influence
      const ridge = this.config.ridgedOffset - Math.abs(noiseValue);
      const plateauInfluence = Math.pow(ridge, 1 + this.config.plateauStrength);

      // Height-based terrain characteristics
      const heightFactor = Math.max(0, Math.min(1, (ridge + 1) / 2));

      // Valley deepening
      const valleyFactor = heightFactor < 0.4 ? 1 - this.config.valleyDepth * (0.4 - heightFactor) : 1;

      // Amplitude modification based on terrain features
      const terrainAmplitude = currentAmplitude * valleyFactor;

      // Apply terrain characteristics with erosion
      const erosionFactor = 1 - this.config.erosionStrength * Math.abs(noiseValue);
      const scaled = plateauInfluence * terrainAmplitude * erosionFactor;

      total += scaled;
      maxValue += terrainAmplitude;

      // Detail noise at higher elevations
      if (heightFactor > 0.6 && i > 2) {
        const detailNoise = Noise.baseNoiseGenerator.noise3d(
          wx * frequency * this.config.detailScale * 2,
          wy * frequency * this.config.detailScale * 2,
          wz * frequency * this.config.detailScale * 2
        );

        const detailContribution = detailNoise * currentAmplitude * 0.3 * (heightFactor - 0.6);
        total += detailContribution;
        maxValue += currentAmplitude * 0.3;
      }

      currentAmplitude *= this.config.persistence;
      frequency *= this.config.lacunarity;
    }

    const result = (total / maxValue) * this.config.amplitude;

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
