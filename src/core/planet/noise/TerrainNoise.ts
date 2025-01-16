import { PseudoRandomNumberGenerator } from "@/core/utils/PseudoRandom";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise.js";
import { BaseNoise } from "./BaseNoise";
import { LRUCache } from "./LRUCache";

export type TerrainNoiseConfig = {
  octaves: number;
  roughness: number;
  heightScale: number;
  distortion: number;
  distortionFrequency: number;
  lacunarity: number;
  gain: number;
  erosionStrength: number;
  erosionScale: number;
  erosionOctaves: number;
  erosionLacunarity: number;
  erosionGain: number;
};

const DEFAULT_CONFIG: Readonly<TerrainNoiseConfig> = {
  octaves: 7,
  roughness: 0.4,
  heightScale: 0.7,
  distortion: 0.8,
  distortionFrequency: 0.5,
  lacunarity: 1.6,
  gain: 0.5,
  erosionStrength: 0.3,
  erosionScale: 0.8,
  erosionOctaves: 4,
  erosionLacunarity: 2.0,
  erosionGain: 0.5,
};

export class TerrainNoise implements BaseNoise {
  private simplexNoise: SimplexNoise;
  private erosionNoise: SimplexNoise;
  private config: TerrainNoiseConfig;
  private cache: LRUCache<string, number>;

  constructor(config: Partial<TerrainNoiseConfig> = {}) {
    this.simplexNoise = new SimplexNoise(new PseudoRandomNumberGenerator(231231));
    this.erosionNoise = new SimplexNoise(new PseudoRandomNumberGenerator(654321));
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

  private getErosionNoise(x: number, y: number, z: number): number {
    const length = Math.sqrt(x * x + y * y + z * z);
    if (length === 0) return 0;

    const nx = x / length;
    const ny = y / length;
    const nz = z / length;

    let total = 0;
    let amplitude = 1.0;
    let frequency = this.config.erosionScale;
    let maxValue = 0;

    for (let i = 0; i < this.config.erosionOctaves; i++) {
      const angle1 = i * 2.1 + 0.7;
      const angle2 = i * 1.9 + 0.3;
      const [rx1, ry1, rz1] = this.rotatePoint(nx, ny, nz, angle1, "y");
      const [rx2, ry2, rz2] = this.rotatePoint(rx1, ry1, rz1, angle2, "x");

      const value = this.erosionNoise.noise3d(rx2 * frequency, ry2 * frequency, rz2 * frequency);

      total += value * amplitude;
      maxValue += amplitude;
      amplitude *= this.config.erosionGain;
      frequency *= this.config.erosionLacunarity;
    }

    // Ensure we don't divide by zero
    return maxValue > 0 ? total / maxValue : 0;
  }

  private getNoise(x: number, y: number, z: number): number {
    const length = Math.sqrt(x * x + y * y + z * z);
    if (length === 0) return 0;

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

    // Ensure we don't divide by zero
    return maxValue > 0 ? (total / maxValue) * this.config.heightScale : 0;
  }

  private calculateErosion(x: number, y: number, z: number): number {
    const baseNoise = this.getNoise(x, y, z);
    const erosionValue = this.getErosionNoise(x, y, z);

    // Calculate slope with safeguards against invalid values
    const delta = 0.01;
    const h0 = this.getNoise(x, y, z);
    const hx = this.getNoise(x + delta, y, z);
    const hy = this.getNoise(x, y + delta, z);
    const hz = this.getNoise(x, y, z + delta);

    // Calculate slope with bounds
    const slope = Math.min(Math.sqrt(Math.pow(hx - h0, 2) + Math.pow(hy - h0, 2) + Math.pow(hz - h0, 2)) / delta, 1.0);

    // Normalize erosion factors
    const slopeFactor = Math.max(0, Math.min(slope * 2, 1));
    const erosionFactor = Math.max(0, Math.min(erosionValue * slopeFactor * this.config.erosionStrength, 1));
    const heightFactor = Math.max(0, Math.min(baseNoise, 1));

    // Apply erosion with bounds checking
    const erosionAmount = erosionFactor * heightFactor;
    return Math.max(-1, Math.min(baseNoise - erosionAmount, 1));
  }

  public getValue(x: number, y: number, z: number): number {
    const key = `${Math.round(x * 100)},${Math.round(y * 100)},${Math.round(z * 100)}`;
    let value = this.cache.get(key);

    if (value === undefined) {
      value = this.calculateErosion(x, y, z);
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
