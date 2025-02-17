import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise";
import { TerrainGenerateMessage } from "../types/terrain";
import { PseudoRandomNumberGenerator } from "../utils/PseudoRandom";

class TerrainGenerator {
  private readonly noise: SimplexNoise;
  private readonly seed: number;

  constructor(seed: number) {
    this.seed = seed;
    this.noise = new SimplexNoise(new PseudoRandomNumberGenerator(seed));
  }

  generateTerrainNoise(worldX: number, worldY: number, worldZ: number): number {
    // Add debug logging to verify coordinates
    console.log(`Generating for world coords: ${worldX}, ${worldY}, ${worldZ}`);

    // Ensure we're not losing precision or getting incorrect scaling
    const x = worldX; // Remove any initial scaling
    const y = worldY;
    const z = worldZ;

    // Use the seed to create truly varying offsets per coordinate
    const seedOffsetX = (this.seed * 16807) % 2147483647;
    const seedOffsetY = (this.seed * 48271) % 2147483647;
    const seedOffsetZ = (this.seed * 69621) % 2147483647;

    // Apply large prime offsets to break any potential patterns
    const primeX = x + seedOffsetX * 0.001;
    const primeY = y + seedOffsetY * 0.001;
    const primeZ = z + seedOffsetZ * 0.001;

    // Multiple layers of noise at different scales
    let height = 0;

    // Large scale features
    height += this.noise.noise3d(primeX * 0.01, primeY * 0.01, primeZ * 0.01) * 1.0;
    height += this.noise.noise3d(primeX * 0.02 + 500, primeY * 0.02, primeZ * 0.02) * 0.5;
    height += this.noise.noise3d(primeX * 0.04 + 1000, primeY * 0.04, primeZ * 0.04) * 0.25;

    // Medium scale details
    height += this.noise.noise3d(primeX * 0.08 + 1500, primeY * 0.08, primeZ * 0.08) * 0.125;
    height += this.noise.noise3d(primeX * 0.16 + 2000, primeY * 0.16, primeZ * 0.16) * 0.0625;

    // Small scale details
    height += this.noise.noise3d(primeX * 0.32 + 2500, primeY * 0.32, primeZ * 0.32) * 0.03125;

    return Math.max(0.001, Math.min(0.999, 0.5 + height * 0.5));
  }
}

// In your worker message handler:

const ctx: Worker = self as any;

ctx.addEventListener("message", (e: MessageEvent<TerrainGenerateMessage>) => {
  if (e.data.type === "generateTerrain") {
    const { chunkX, chunkZ, gridSize, padding, seed } = e.data;
    const generator = new TerrainGenerator(seed);

    const totalSize = gridSize + padding * 2;

    // Use large numbers to ensure we're getting unique coordinates per chunk
    const chunkScale = gridSize;
    const worldX = chunkX * chunkScale;
    const worldZ = chunkZ * chunkScale;

    console.log(`Generating chunk at ${chunkX}, ${chunkZ}`);
    console.log(`World coordinates start at ${worldX}, ${worldZ}`);

    const field = new Float32Array(totalSize * totalSize * totalSize);

    for (let x = 0; x < totalSize; x++) {
      for (let y = 0; y < totalSize; y++) {
        for (let z = 0; z < totalSize; z++) {
          // Ensure global coordinates are truly unique per position
          const globalX = worldX + (x - padding);
          const globalY = y - padding;
          const globalZ = worldZ + (z - padding);

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
