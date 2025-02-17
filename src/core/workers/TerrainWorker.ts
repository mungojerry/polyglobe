import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise";
import { TerrainGenerateMessage } from "../types/terrain";
import { PseudoRandomNumberGenerator } from "../utils/PseudoRandom";

let sharedNoise: SimplexNoise | null = null;

class TerrainGenerator {
  private gridSize: number;
  private seed: number;
  private padding: number;

  constructor(seed: number, gridSize: number, padding: number) {
    this.seed = seed;
    this.gridSize = gridSize;
    this.padding = padding;

    if (!sharedNoise) {
      const deterministicRandom = {
        random: () => {
          return PseudoRandomNumberGenerator.createWithPosition(this.seed, 0, 0, 0);
        },
      };
      sharedNoise = new SimplexNoise(deterministicRandom);
    }
  }

  private warpNoise(x: number, y: number, z: number, scale: number): { x: number; y: number; z: number } {
    // Use separate noise functions for each dimension
    const wx = sharedNoise!.noise3d(x * scale, y * scale, z * scale) * 8;
    const wy = sharedNoise!.noise3d(x * scale + 100, y * scale + 100, z * scale + 100) * 4;
    const wz = sharedNoise!.noise3d(x * scale + 200, y * scale + 200, z * scale + 200) * 8;

    return {
      x: x + wx,
      y: y + wy,
      z: z + wz,
    };
  }

  generateTerrainNoise(worldX: number, worldY: number, worldZ: number): number {
    const baseFreq = 0.02;

    // Apply domain warping at different scales
    const warpedLarge = this.warpNoise(worldX, worldY, worldZ, baseFreq * 0.5);
    const warpedMedium = this.warpNoise(worldX, worldY, worldZ, baseFreq * 2);

    // Generate continental features using large-scale warping
    const continent = sharedNoise!.noise3d(warpedLarge.x * baseFreq, warpedLarge.y * baseFreq * 0.5, warpedLarge.z * baseFreq) * 0.6;

    // Add medium-scale terrain features
    const terrain = sharedNoise!.noise3d(warpedMedium.x * baseFreq * 2, warpedMedium.y * baseFreq * 1.5, warpedMedium.z * baseFreq * 2) * 0.3;

    // Add small-scale details (less warping for fine details)
    const details = sharedNoise!.noise3d(worldX * baseFreq * 4, worldY * baseFreq * 3, worldZ * baseFreq * 4) * 0.1;

    // Combine all features
    let height = continent + terrain + details;

    // Apply vertical gradient with smoother falloff
    const heightFalloff = Math.max(0, 1 - Math.pow(worldY / (this.gridSize * 0.8), 2));
    height *= heightFalloff;

    // Normalize and bias
    height = 0.45 + height * 0.45;

    // Smooth out flat areas with cubic interpolation
    const flatThreshold = 0.45;
    if (height < flatThreshold) {
      const t = height / flatThreshold;
      height = flatThreshold * (t * t * (3 - 2 * t));
    }

    return Math.max(0.001, Math.min(0.999, height));
  }
}

const ctx: Worker = self as any;

ctx.addEventListener("message", (e: MessageEvent<TerrainGenerateMessage>) => {
  if (e.data.type === "generateTerrain") {
    const { chunkX, chunkZ, gridSize, padding, seed } = e.data;
    const generator = new TerrainGenerator(seed, gridSize, padding);

    const totalSize = gridSize + padding * 2;
    const chunkScale = gridSize - padding * 2;
    const worldX = chunkX * chunkScale - padding;
    const worldZ = chunkZ * chunkScale - padding;

    const field = new Float32Array(totalSize * totalSize * totalSize);

    for (let x = 0; x < totalSize; x++) {
      for (let y = 0; y < totalSize; y++) {
        for (let z = 0; z < totalSize; z++) {
          const globalX = worldX + x;
          const globalY = y;
          const globalZ = worldZ + z;

          const index = (x * totalSize + y) * totalSize + z;
          field[index] = generator.generateTerrainNoise(globalX, globalY, globalZ);
        }
      }
    }

    ctx.postMessage(
      {
        type: "terrainGenerated",
        chunkX,
        chunkZ,
        field,
        temperatures: new Float32Array(totalSize * totalSize),
        humidities: new Float32Array(totalSize * totalSize),
      },
      [field.buffer]
    );
  }
});
