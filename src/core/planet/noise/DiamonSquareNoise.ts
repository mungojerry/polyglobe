import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise.js";
import { BaseNoise } from "./BaseNoise";
import { LRUCache } from "./LRUCache";
export type DiamondSquareNoiseConfig = {
  octaves: number;
  roughness: number;
  heightScale: number;
};

const DEFAULT_CONFIG: Readonly<DiamondSquareNoiseConfig> = {
  octaves: 7,
  roughness: 0.3,
  heightScale: 0.6,
};

export class DiamondSquareNoise implements BaseNoise {
  private simplexNoise: SimplexNoise;
  private config: DiamondSquareNoiseConfig;
  private cache: LRUCache<string, number>;

  constructor(config: Partial<DiamondSquareNoiseConfig> = {}) {
    this.simplexNoise = new SimplexNoise();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cache = new LRUCache<string, number>(1000); // Increased cache size
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

  public getNoise(x: number, y: number, z: number): number {
    // Normalize the position to the unit sphere
    const length = Math.sqrt(x * x + y * y + z * z);
    const nx = x / length;
    const ny = y / length;
    const nz = z / length;

    let total = 0;
    let amplitude = 1.0;
    let frequency = 1.0;
    let maxValue = 0;

    // Add multiple octaves of noise with rotation
    for (let i = 0; i < this.config.octaves; i++) {
      // Rotate the point differently for each octave to break up patterns
      const angle1 = i * 1.7 + 0.5;
      const angle2 = i * 2.3 + 0.8;
      const [rx1, ry1, rz1] = this.rotatePoint(nx, ny, nz, angle1, "y");
      const [rx2, ry2, rz2] = this.rotatePoint(rx1, ry1, rz1, angle2, "x");

      // Use 3D simplex noise directly with the rotated coordinates
      const value = this.simplexNoise.noise3d(rx2 * frequency * 2, ry2 * frequency * 2, rz2 * frequency * 2);

      total += value * amplitude;
      maxValue += amplitude;
      amplitude *= this.config.roughness;
      frequency *= 2;
    }

    // Apply heightScale after normalization for better control
    return (total / maxValue) * this.config.heightScale;
  }

  public getValue(x: number, y: number, z: number): number {
    // Cache key based on rounded coordinates for better cache hits
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

  public getConfig(): DiamondSquareNoiseConfig {
    return this.config;
  }
}
