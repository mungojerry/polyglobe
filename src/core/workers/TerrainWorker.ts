import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise";
import { TerrainGenerateMessage } from "../types/terrain";
import { pseudoRandom, PseudoRandomNumberGenerator } from "../utils/PseudoRandom";

let sharedNoise: SimplexNoise | null = null;

class TerrainGenerator {
  private gridSize: number;

  constructor(seed: number, gridSize: number) {
    this.gridSize = gridSize;

    if (!sharedNoise) {
      pseudoRandom.setSeed(seed);
      sharedNoise = new SimplexNoise(new PseudoRandomNumberGenerator(seed));
    }
  }

  private warpNoise(x: number, y: number, z: number, scale: number, amplitude: number): { x: number; y: number; z: number } {
    if (!sharedNoise) return { x, y, z };
    const noiseScale = scale * 0.5;

    // Use different prime numbers for each coordinate sampling to avoid alignment
    const nx1 = sharedNoise.noise3d(x * noiseScale * 1.619, y * noiseScale * 1.373, z * noiseScale * 2.111);
    const nx2 = sharedNoise.noise3d(x * noiseScale * 2.371, y * noiseScale * 1.931, z * noiseScale * 1.471);
    const ny1 = sharedNoise.noise3d(x * noiseScale * 1.789, y * noiseScale * 2.029, z * noiseScale * 1.847);
    const ny2 = sharedNoise.noise3d(x * noiseScale * 2.213, y * noiseScale * 1.691, z * noiseScale * 2.137);
    const nz1 = sharedNoise.noise3d(x * noiseScale * 1.131, y * noiseScale * 2.293, z * noiseScale * 1.747);
    const nz2 = sharedNoise.noise3d(x * noiseScale * 2.141, y * noiseScale * 1.557, z * noiseScale * 2.309);

    // Create independent displacements for each axis
    const xDisplacement = (nx1 + nx2) * amplitude * 0.5;
    const yDisplacement = (ny1 + ny2) * amplitude * 0.3; // Less vertical displacement
    const zDisplacement = (nz1 + nz2) * amplitude * 0.5;

    // Add different rotations per axis
    const rotationX = sharedNoise.noise3d(x * noiseScale * 1.273, y * noiseScale * 1.783, z * noiseScale * 1.377) * Math.PI;
    const rotationZ = sharedNoise.noise3d(x * noiseScale * 1.911, y * noiseScale * 1.433, z * noiseScale * 1.619) * Math.PI;

    return {
      x: x + xDisplacement * Math.cos(rotationX) + zDisplacement * Math.sin(rotationZ),
      y: y + yDisplacement,
      z: z + zDisplacement * Math.cos(rotationZ) - xDisplacement * Math.sin(rotationX),
    };
  }

  generateTerrainNoise(worldX: number, worldY: number, worldZ: number): number {
    if (!sharedNoise) return 0;
    // Use prime numbers for base frequency to avoid regular patterns
    const baseFreq = 0.017;
    const coordScale = 1.0;

    const x = worldX * coordScale;
    const y = worldY * coordScale;
    const z = worldZ * coordScale;

    // Add more warp layers with varying scales
    const warpedLarge = this.warpNoise(x, y, z, baseFreq * 0.233, 12.0);
    const warpedMedium = this.warpNoise(warpedLarge.x, warpedLarge.y, warpedLarge.z, baseFreq * 0.471, 6.0);
    const warpedSmall = this.warpNoise(warpedMedium.x, warpedMedium.y, warpedMedium.z, baseFreq * 0.977, 3.0);
    const warpedTiny = this.warpNoise(warpedSmall.x, warpedSmall.y, warpedSmall.z, baseFreq * 1.731, 1.5);

    // Add more noise octaves with prime number frequencies
    const continent = sharedNoise.noise3d(warpedLarge.x * baseFreq * 0.431, warpedLarge.y * baseFreq * 0.271, warpedLarge.z * baseFreq * 0.533);
    const mountains = sharedNoise.noise3d(warpedMedium.x * baseFreq * 0.877, warpedMedium.y * baseFreq * 0.673, warpedMedium.z * baseFreq * 0.789);
    const hills = sharedNoise.noise3d(warpedSmall.x * baseFreq * 1.231, warpedSmall.y * baseFreq * 1.159, warpedSmall.z * baseFreq * 1.373);
    const details = sharedNoise.noise3d(warpedTiny.x * baseFreq * 2.213, warpedTiny.y * baseFreq * 1.879, warpedTiny.z * baseFreq * 1.971);

    // Blend layers with varying weights and use the previous layer to modulate the next
    let height = continent * 0.45;
    height += mountains * 0.3 * (1.0 - Math.abs(height));
    height += hills * 0.15 * (1.0 - Math.abs(height));
    height += details * 0.1 * (1.0 - Math.abs(height));

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

// Pre-allocate buffers for better performance
const ctx: Worker = self as any;
let currentField: Float32Array | null = null;
let currentTemperatures: Float32Array | null = null;
let currentHumidities: Float32Array | null = null;

ctx.addEventListener("message", (e: MessageEvent<TerrainGenerateMessage>) => {
  if (e.data.type === "generateTerrain") {
    const { chunkX, chunkZ, gridSize, padding, seed } = e.data;
    const generator = new TerrainGenerator(seed, gridSize);

    const totalSize = gridSize + padding * 2;
    const totalSizeSquared = totalSize * totalSize;
    const chunkScale = gridSize - padding * 2;
    const worldX = chunkX * chunkScale - padding;
    const worldZ = chunkZ * chunkScale - padding;

    // Reuse buffers when possible
    if (!currentField || currentField.length !== totalSize * totalSizeSquared) {
      currentField = new Float32Array(totalSize * totalSizeSquared);
      currentTemperatures = new Float32Array(totalSizeSquared);
      currentHumidities = new Float32Array(totalSizeSquared);
    }

    // Use a single loop for better cache utilization
    for (let x = 0; x < totalSize; x++) {
      const globalX = worldX + x;
      for (let y = 0; y < totalSize; y++) {
        const globalY = y;
        const xyOffset = (x * totalSize + y) * totalSize;
        for (let z = 0; z < totalSize; z++) {
          const globalZ = worldZ + z;
          currentField![xyOffset + z] = generator.generateTerrainNoise(globalX, globalY, globalZ);
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

    // Clear references to transferred buffers
    currentField = null;
    currentTemperatures = null;
    currentHumidities = null;
  }
});
