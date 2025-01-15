import { PseudoRandomNumberGenerator } from "@/core/utils/PseudoRandom";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise.js";
import { BaseNoise } from "./BaseNoise";
import { LRUCache } from "./LRUCache";

/**
 * distortion: controls how much warping happens. A higher value means more warping, leading to more extreme terrain features.
 * distortionFrequency: Controls the scale/frequency of the distortion itself. Lower values make the distortion smoother, higher values make it more chaotic.
 * lacunarity: lacunarity controls how much the frequency increases each octave (usually 2.0).
 * gain: gain controls how much the amplitude decreases each octave.
 *
 * Using these gives you more control over the noise's appearance and is more efficient than just roughness. Often gain is the inverse of roughness.
 *
 */

export type TerrainNoiseConfig = {
  octaves: number;
  roughness: number;
  heightScale: number;
  distortion: number;
  distortionFrequency: number;
  lacunarity: number;
  gain: number;
};

const DEFAULT_CONFIG: Readonly<TerrainNoiseConfig> = {
  octaves: 7,
  roughness: 0.4,
  heightScale: 0.6,
  distortion: 0.8,
  distortionFrequency: 0.5,
  lacunarity: 2.0,
  gain: 0.5,
};

export class TerrainNoise implements BaseNoise {
  private simplexNoise: SimplexNoise;
  private config: TerrainNoiseConfig;
  private cache: LRUCache<string, number>;

  constructor(config: Partial<TerrainNoiseConfig> = {}) {
    const rng = new PseudoRandomNumberGenerator(231231);
    this.simplexNoise = new SimplexNoise(rng);
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cache = new LRUCache<string, number>(1000);
  }

  private rotatePoint(x: number, y: number, z: number, angle: number, axis: "x" | "y" | "z"): [number, number, number] {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    switch (axis) {
      case "x":
        return [x, y * cos - z * sin, y * sin + z * cos];
      case "y":
        return [x * cos + z * sin, y, -x * sin + z * cos];
      case "z":
        return [x * cos - y * sin, x * sin + y * cos, z];
    }
  }

  private getNoise(x: number, y: number, z: number): number {
    const length = Math.sqrt(x * x + y * y + z * z);
    const nx = x / length;
    const ny = y / length;
    const nz = z / length;

    let total = 0;
    let amplitude = 1.0;
    let frequency = 1.0;
    let maxValue = 0;

    const distortionFrequency = this.config.distortionFrequency;
    const distortion = this.config.distortion;
    const lacunarity = this.config.lacunarity;
    const gain = this.config.gain;

    for (let i = 0; i < this.config.octaves; i++) {
      const angle1 = i * 1.7 + 0.5;
      const angle2 = i * 2.3 + 0.8;
      const [rx1, ry1, rz1] = this.rotatePoint(nx, ny, nz, angle1, "y");
      const [rx2, ry2, rz2] = this.rotatePoint(rx1, ry1, rz1, angle2, "x");

      const distortionX = this.simplexNoise.noise3d(rx2 * distortionFrequency, ry2 * distortionFrequency, rz2 * distortionFrequency) * distortion;
      const distortionY =
        this.simplexNoise.noise3d(rx2 * distortionFrequency + 10, ry2 * distortionFrequency + 10, rz2 * distortionFrequency + 10) * distortion;
      const distortionZ =
        this.simplexNoise.noise3d(rx2 * distortionFrequency + 20, ry2 * distortionFrequency + 20, rz2 * distortionFrequency + 20) * distortion;

      const distortedX = rx2 * frequency * 2 + distortionX;
      const distortedY = ry2 * frequency * 2 + distortionY;
      const distortedZ = rz2 * frequency * 2 + distortionZ;

      const value = this.simplexNoise.noise3d(distortedX, distortedY, distortedZ);

      total += value * amplitude;
      maxValue += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }

    return (total / maxValue) * this.config.heightScale;
  }

  public getValue(x: number, y: number, z: number): number {
    const key = `${Math.round(x * 100)},${Math.round(y * 100)},${Math.round(z * 100)}`;
    let value = this.cache.get(key);

    if (value === undefined) {
      value = this.getNoise(x, y, z);
      this.cache.set(key, value);
    }

    return value;
  }

  public clearCache(): void {
    this.cache.clear();
  }

  public getConfig(): TerrainNoiseConfig {
    return this.config;
  }
}
