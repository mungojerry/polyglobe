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

  private warpNoise(x: number, y: number, z: number, scale: number, amplitude: number): { x: number; y: number; z: number } {
    const noiseScale = scale * 0.5;

    // Sample noise at different frequencies for each dimension
    const nx1 = sharedNoise!.noise3d(x * noiseScale * 1.7, y * noiseScale * 1.3, z * noiseScale * 2.1);
    const nx2 = sharedNoise!.noise3d(x * noiseScale * 2.3, y * noiseScale * 1.9, z * noiseScale * 1.5);
    const nz1 = sharedNoise!.noise3d(x * noiseScale * 1.1, y * noiseScale * 2.3, z * noiseScale * 1.7);
    const nz2 = sharedNoise!.noise3d(x * noiseScale * 2.1, y * noiseScale * 1.5, z * noiseScale * 2.3);

    // Create independent displacements for each axis
    const xDisplacement = (nx1 + nx2) * amplitude * 0.5;
    const zDisplacement = (nz1 + nz2) * amplitude * 0.5;

    // Add rotation to break up linear patterns
    const rotation = sharedNoise!.noise3d(x * noiseScale * 1.3, y * noiseScale * 1.7, z * noiseScale * 1.1) * Math.PI;

    return {
      x: x + xDisplacement * Math.cos(rotation),
      y: y + sharedNoise!.noise3d(x * noiseScale * 1.9, y * noiseScale * 2.1, z * noiseScale * 1.3) * amplitude * 0.3,
      z: z + zDisplacement * Math.sin(rotation),
    };
  }

  generateTerrainNoise(worldX: number, worldY: number, worldZ: number): number {
    const baseFreq = 0.02;
    const coordScale = 1.0;

    const x = worldX * coordScale;
    const y = worldY * coordScale;
    const z = worldZ * coordScale;

    // Use prime number ratios for frequencies and amplitudes
    const warpedLarge = this.warpNoise(x, y, z, baseFreq * 0.23, 8.0);
    const warpedMedium = this.warpNoise(warpedLarge.x, warpedLarge.y, warpedLarge.z, baseFreq * 0.47, 4.0);
    const warpedSmall = this.warpNoise(warpedMedium.x, warpedMedium.y, warpedMedium.z, baseFreq * 0.97, 2.0);

    // Add more noise octaves with varying frequencies
    const continent = sharedNoise!.noise3d(warpedLarge.x * baseFreq * 0.43, warpedLarge.y * baseFreq * 0.27, warpedLarge.z * baseFreq * 0.53);
    const hills = sharedNoise!.noise3d(warpedMedium.x * baseFreq * 1.13, warpedMedium.y * baseFreq * 0.67, warpedMedium.z * baseFreq * 0.89);
    const details = sharedNoise!.noise3d(warpedSmall.x * baseFreq * 2.21, warpedSmall.y * baseFreq * 1.79, warpedSmall.z * baseFreq * 1.97);

    // Blend layers with different weights
    let height = continent * 0.5;
    height += hills * 0.35 * (1.0 - Math.abs(height));
    height += details * 0.15 * (1.0 - Math.abs(height));

    const heightFalloff = Math.max(0, 1 - Math.pow(y / (this.gridSize * 0.7), 2));
    height *= heightFalloff;

    height = 0.48 + height * 0.35;

    const flatThreshold = 0.45;
    if (height < flatThreshold) {
      const t = height / flatThreshold;
      const smoothstep = t * t * (3 - 2 * t);
      height = flatThreshold * smoothstep;
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
