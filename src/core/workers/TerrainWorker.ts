import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise";
import { TerrainGenerateMessage } from "../types/terrain";
import { pseudoRandom, PseudoRandomNumberGenerator } from "../utils/PseudoRandom";

let sharedNoise: SimplexNoise | null = null;

class TerrainGenerator {
  private gridSize: number;
  private gridSize07: number;

  constructor(seed: number, gridSize: number) {
    this.gridSize = gridSize;
    this.gridSize07 = gridSize * 0.7;

    if (!sharedNoise) {
      pseudoRandom.setSeed(seed);
      sharedNoise = new SimplexNoise(new PseudoRandomNumberGenerator(seed));
    }
  }

  private warpNoise(x: number, y: number, z: number, scale: number, amplitude: number): { x: number; y: number; z: number } {
    if (!sharedNoise) return { x, y, z };

    const noiseScale = scale * 0.5;
    const xScaled = x * noiseScale;
    const yScaled = y * noiseScale;
    const zScaled = z * noiseScale;

    // Precompute amplitude factors
    const xAmp = amplitude * 0.5;
    const yAmp = amplitude * 0.3;
    const zAmp = amplitude * 0.5;

    // Calculate displacements
    const nx1 = sharedNoise.noise3d(xScaled * 1.619, yScaled * 1.373, zScaled * 2.111);
    const nx2 = sharedNoise.noise3d(xScaled * 2.371, yScaled * 1.931, zScaled * 1.471);
    const ny1 = sharedNoise.noise3d(xScaled * 1.789, yScaled * 2.029, zScaled * 1.847);
    const ny2 = sharedNoise.noise3d(xScaled * 2.213, yScaled * 1.691, zScaled * 2.137);
    const nz1 = sharedNoise.noise3d(xScaled * 1.131, yScaled * 2.293, zScaled * 1.747);
    const nz2 = sharedNoise.noise3d(xScaled * 2.141, yScaled * 1.557, zScaled * 2.309);

    const xDisplacement = (nx1 + nx2) * xAmp;
    const yDisplacement = (ny1 + ny2) * yAmp;
    const zDisplacement = (nz1 + nz2) * zAmp;

    // Calculate rotations
    const rotX = sharedNoise.noise3d(xScaled * 1.273, yScaled * 1.783, zScaled * 1.377) * Math.PI;
    const rotZ = sharedNoise.noise3d(xScaled * 1.911, yScaled * 1.433, zScaled * 1.619) * Math.PI;

    const cosX = Math.cos(rotX);
    const sinX = Math.sin(rotX);
    const cosZ = Math.cos(rotZ);
    const sinZ = Math.sin(rotZ);

    return {
      x: x + xDisplacement * cosX + zDisplacement * sinZ,
      y: y + yDisplacement,
      z: z + zDisplacement * cosZ - xDisplacement * sinX,
    };
  }

  generateTerrainNoise(worldX: number, worldY: number, worldZ: number): number {
    if (!sharedNoise) return 0;

    // Warping layers
    const warpedLarge = this.warpNoise(worldX, worldY, worldZ, 0.017 * 0.233, 12.0);
    const warpedMedium = this.warpNoise(warpedLarge.x, warpedLarge.y, warpedLarge.z, 0.017 * 0.471, 6.0);
    const warpedSmall = this.warpNoise(warpedMedium.x, warpedMedium.y, warpedMedium.z, 0.017 * 0.977, 3.0);
    const warpedTiny = this.warpNoise(warpedSmall.x, warpedSmall.y, warpedSmall.z, 0.017 * 1.731, 1.5);

    // Precompute frequency factors
    const baseFreq = 0.017;
    const [cX, cY, cZ] = [warpedLarge.x * baseFreq * 0.431, warpedLarge.y * baseFreq * 0.271, warpedLarge.z * baseFreq * 0.533];
    const [mX, mY, mZ] = [warpedMedium.x * baseFreq * 0.877, warpedMedium.y * baseFreq * 0.673, warpedMedium.z * baseFreq * 0.789];
    const [hX, hY, hZ] = [warpedSmall.x * baseFreq * 1.231, warpedSmall.y * baseFreq * 1.159, warpedSmall.z * baseFreq * 1.373];
    const [dX, dY, dZ] = [warpedTiny.x * baseFreq * 2.213, warpedTiny.y * baseFreq * 1.879, warpedTiny.z * baseFreq * 1.971];

    // Noise layers
    let height = sharedNoise.noise3d(cX, cY, cZ) * 0.45;
    height += sharedNoise.noise3d(mX, mY, mZ) * 0.3 * (1 - Math.abs(height));
    height += sharedNoise.noise3d(hX, hY, hZ) * 0.15 * (1 - Math.abs(height));
    height += sharedNoise.noise3d(dX, dY, dZ) * 0.1 * (1 - Math.abs(height));

    // Height falloff
    const yNorm = worldY / this.gridSize07;
    height *= Math.max(0, 1 - yNorm * yNorm);
    height = 0.48 + height * 0.35;

    // Flatten low areas
    const flatThreshold = 0.45;
    if (height < flatThreshold) {
      const t = height / flatThreshold;
      height = flatThreshold * (t * t * (3 - 2 * t));
    }

    return Math.min(Math.max(height, 0.001), 0.999);
  }
}

// Worker context setup
const ctx: Worker = self as any;
let currentField: Float32Array | null = null;
let currentTemperatures: Float32Array | null = null;
let currentHumidities: Float32Array | null = null;

ctx.addEventListener("message", (e: MessageEvent<TerrainGenerateMessage>) => {
  if (e.data.type === "generateTerrain") {
    const { chunkX, chunkZ, gridSize, padding, seed } = e.data;
    const generator = new TerrainGenerator(seed, gridSize);
    const totalSize = gridSize + padding * 2;
    const bufferSize = totalSize ** 3;

    // Reuse buffers when possible
    if (!currentField || currentField.length !== bufferSize) {
      currentField = new Float32Array(bufferSize);
      currentTemperatures = new Float32Array(totalSize ** 2);
      currentHumidities = new Float32Array(totalSize ** 2);
    }

    // Optimized loop with single index
    const chunkScale = gridSize - padding * 2;
    const worldX = chunkX * chunkScale - padding;
    const worldZ = chunkZ * chunkScale - padding;
    let index = 0;

    for (let x = 0; x < totalSize; x++) {
      const globalX = worldX + x;
      for (let y = 0; y < totalSize; y++) {
        for (let z = 0; z < totalSize; z++) {
          currentField![index++] = generator.generateTerrainNoise(globalX, y, worldZ + z);
        }
      }
    }

    ctx.postMessage(
      {
        type: "terrainGenerated",
        chunkX,
        chunkZ,
        field: currentField,
        temperatures: currentTemperatures,
        humidities: currentHumidities,
      },
      [currentField.buffer]
    );

    // Reset references
    currentField = null;
    currentTemperatures = null;
    currentHumidities = null;
  }
});
