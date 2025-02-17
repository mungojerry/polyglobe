import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise";
import { TerrainGenerateMessage } from "../types/terrain";
import { pseudoRandom } from "../utils/PseudoRandom";

// Create a single shared noise instance for the worker
let sharedNoise: SimplexNoise | null = null;

class TerrainGenerator {
  private gridSize: number;
  constructor(seed: number, gridSize: number = 16) {
    // Seed the pseudoRandom function
    pseudoRandom.seed(seed);
    this.gridSize = gridSize;
    // Create shared noise instance if it doesn't exist
    if (!sharedNoise) {
      sharedNoise = new SimplexNoise(pseudoRandom);
    }
  }

  generateTerrainNoise(worldX: number, worldY: number, worldZ: number): number {
    const x = worldX;
    const y = worldY;
    const z = worldZ;

    // Use smaller vertical scale for more natural-looking terrain
    const verticalScale = 0.2;
    const scaledY = y * verticalScale;

    // Offset bases based on pseudoRandom but keep them smaller
    const seedOffsetX = pseudoRandom.random() * 0.1;
    const seedOffsetY = pseudoRandom.random() * 0.1;
    const seedOffsetZ = pseudoRandom.random() * 0.1;

    const primeX = x + seedOffsetX;
    const primeY = scaledY + seedOffsetY;
    const primeZ = z + seedOffsetZ;

    // Base continental features (large, gentle slopes)
    let continent = sharedNoise!.noise3d(primeX * 0.02, 0, primeZ * 0.02) * 0.5;

    // Hills and valleys (medium features)
    let hills = sharedNoise!.noise3d(primeX * 0.05, primeY * 0.05, primeZ * 0.05) * 0.25;

    // Small details
    let details = sharedNoise!.noise3d(primeX * 0.1, primeY * 0.1, primeZ * 0.1) * 0.125;

    // Combine all features
    let height = continent + hills + details;

    // Apply vertical gradient to fade out terrain at higher altitudes
    const heightFalloff = Math.max(0, 1 - y / (this.gridSize * 0.75));
    height *= heightFalloff;

    // Normalize and bias the result to keep most terrain below the mid-point
    height = 0.45 + height * 0.4;

    // Add a height-based threshold to create flat areas at the bottom
    const flatThreshold = 0.45;
    if (height < flatThreshold) {
      height = flatThreshold - (flatThreshold - height) * 0.1;
    }

    return Math.max(0.001, Math.min(0.999, height));
  }
}

// In your worker message handler:

const ctx: Worker = self as any;

ctx.addEventListener("message", (e: MessageEvent<TerrainGenerateMessage>) => {
  if (e.data.type === "generateTerrain") {
    const { chunkX, chunkZ, gridSize, seed } = e.data;
    const generator = new TerrainGenerator(seed, gridSize);

    const totalSize = gridSize;

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
