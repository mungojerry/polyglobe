import { getTerrainColor, isLand, landBoundary } from "../utils/biomes";
import { VoronoiNoise } from "./noise/VoroniNoise";

export class TerrainGenerator {
  constructor(private noise: VoronoiNoise) {}

  public computeSurfaceHeight(x: number, y: number, z: number): number {
    return 0.4 + this.noise.getValue(x, y, z) * 0.7;
  }

  public computeElevationMultiplier(noiseValue: number): number {
    const normalizedHeight = (noiseValue + 1) * 0.5;
    const curve = Math.pow(normalizedHeight, 1.5);
    return 0.7 + curve * 0.6;
  }

  public isLandHeight(noiseValue: number): boolean {
    return isLand(noiseValue);
  }

  public getTerrainBoundary(): number {
    return landBoundary;
  }

  public getTerrainColorValue(height: number, latitude: number) {
    return getTerrainColor(height, latitude);
  }
}
