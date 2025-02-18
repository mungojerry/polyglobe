import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise";
import { TerrainGenerateMessage } from "../types/terrain";
import { pseudoRandom, PseudoRandomNumberGenerator } from "../utils/PseudoRandom";

let sharedNoise: SimplexNoise | null = null;

const TERRAIN_CONFIG = {
  warpScale: 0.012, // Warp noise scale
  // Base terrain settings
  baseFrequency: 0.015,
  verticalScale: 2.0, // Higher = taller terrain overall

  // Mountain settings
  mountainsScale: 0.8, // How much mountains contribute
  mountainsFreq: 0.14, // Mountain size (lower = larger mountains)
  mountainsOctaves: 6, // Mountain detail levels
  mountainsSteepness: 1.8, // Higher = steeper mountains

  // Hills settings
  hillsScale: 0.3, // How much hills contribute
  hillsFreq: 0.5, // Hill size (higher = more hills)
  hillsOctaves: 4, // Hill detail levels

  // Detail settings
  detailScale: 0.05, // How much small details contribute
  detailFreq: 1.0, // Detail size
  detailOctaves: 3, // Detail levels

  // Height adjustments
  minHeight: 0.0, // Minimum terrain height
  heightRange: 1.0, // Height variation range

  // Feature settings
  plateauHeight: 0.75, // Where plateaus start forming
  valleyDepth: 0.75, // Valley depth threshold

  // Island settings
  islandCount: 2, // Number of island centers
  islandSize: 5.4, // Size of the island (0-1)
  islandFalloff: 4.5, // How sharp the transition from island to ocean is
  oceanLevel: 0.1, // Height below which is ocean

  // Thermal erosion settings
  tallusAngle: 0.8, // Maximum stable slope angle (higher = steeper slopes allowed)
  erosionRate: 0.3, // How much material moves per iteration
  erosionPasses: 3, // Number of erosion passes
};

class TerrainGenerator {
  private gridSize: number;
  private gridSize07: number;
  private islandCenters: Array<{ x: number; z: number }>;

  constructor(seed: number, gridSize: number) {
    this.gridSize = gridSize;
    this.gridSize07 = gridSize * 0.7;

    if (!sharedNoise) {
      pseudoRandom.setSeed(seed);
      sharedNoise = new SimplexNoise(new PseudoRandomNumberGenerator(seed));
    }

    // Generate island centers
    this.islandCenters = [];
    const prng = new PseudoRandomNumberGenerator(seed);
    for (let i = 0; i < TERRAIN_CONFIG.islandCount; i++) {
      this.islandCenters.push({
        x: prng.random() * gridSize - gridSize / 2,
        z: prng.random() * gridSize - gridSize / 2,
      });
    }
  }

  private warpNoise(x: number, y: number, z: number, scale: number, amplitude: number): { x: number; y: number; z: number } {
    if (!sharedNoise) return { x, y, z };
    const c = TERRAIN_CONFIG; // shorthand reference
    const noiseScale = scale * 0.5;
    const xScaled = x * noiseScale;
    const yScaled = y * noiseScale;
    const zScaled = z * noiseScale;

    // Precompute amplitude factors
    const xAmp = amplitude * 0.5 * c.warpScale;
    const yAmp = amplitude * 0.3 * c.warpScale;
    const zAmp = amplitude * 0.5 * c.warpScale;

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

  private ridgedNoise(x: number, y: number, z: number, frequency: number): number {
    if (!sharedNoise) return 0;
    const val = sharedNoise.noise3d(x * frequency, y * frequency, z * frequency);
    return 1.0 - Math.abs(val);
  }

  private fbm(x: number, y: number, z: number, octaves: number, frequency: number, persistence: number): number {
    let total = 0;
    let amplitude = 1.0;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      total += this.ridgedNoise(x, y, z, frequency) * amplitude;
      maxValue += amplitude;
      frequency *= 2.0;
      amplitude *= persistence;
    }

    return total / maxValue;
  }

  private getIslandMask(worldX: number, worldZ: number): number {
    const c = TERRAIN_CONFIG;
    let maxInfluence = 0;

    // Find the closest island center
    for (const center of this.islandCenters) {
      const dx = (worldX - center.x) / (this.gridSize * c.islandSize);
      const dz = (worldZ - center.z) / (this.gridSize * c.islandSize);
      const distance = Math.sqrt(dx * dx + dz * dz);
      const influence = Math.max(0, 1 - Math.pow(distance, c.islandFalloff));
      maxInfluence = Math.max(maxInfluence, influence);
    }

    return maxInfluence;
  }

  generateTerrainNoise(worldX: number, worldY: number, worldZ: number): number {
    if (!sharedNoise) return 0;

    const warpedCoords = this.warpNoise(worldX, worldY, worldZ, 0.012, 25.0);
    const c = TERRAIN_CONFIG; // shorthand reference

    // Generate base terrain components
    const mountains = this.fbm(warpedCoords.x, warpedCoords.y, warpedCoords.z, c.mountainsOctaves, c.baseFrequency * c.mountainsFreq, 0.6);

    const hills = this.fbm(warpedCoords.x, warpedCoords.y, warpedCoords.z, c.hillsOctaves, c.baseFrequency * c.hillsFreq, 0.45);

    const details = this.fbm(warpedCoords.x, warpedCoords.y, warpedCoords.z, c.detailOctaves, c.baseFrequency * c.detailFreq, 0.3);

    // Combine features
    let height = mountains * c.mountainsScale + hills * c.hillsScale + details * c.detailScale;

    // Apply steepness
    height = Math.pow(height, c.mountainsSteepness);

    // Height falloff
    const yNorm = worldY / (this.gridSize07 * c.verticalScale);
    const falloff = 1.0 - Math.min(1.0, Math.pow(yNorm, 1.7));
    height *= falloff;

    // Apply height range
    height = c.minHeight + height * c.heightRange;

    // Plateaus
    if (height > c.plateauHeight) {
      const t = (height - c.plateauHeight) / (1 - c.plateauHeight);
      height = c.plateauHeight + (1 - c.plateauHeight) * Math.pow(t, 1.5);
    }

    // Valleys
    if (height < c.valleyDepth) {
      const t = height / c.valleyDepth;
      height = c.valleyDepth * Math.pow(t, 1.3);
    }

    // Apply island mask
    const islandMask = this.getIslandMask(worldX, worldZ);
    height *= islandMask;

    // Apply ocean level
    if (height < c.oceanLevel) {
      height = c.oceanLevel * 0.8; // Flat ocean floor with slight variation
    }

    return Math.min(Math.max(height, 0.001), 0.999);
  }

  public thermalErode(heightmap: Float32Array, size: number): void {
    const talus = TERRAIN_CONFIG.tallusAngle;
    const rate = TERRAIN_CONFIG.erosionRate;

    for (let pass = 0; pass < TERRAIN_CONFIG.erosionPasses; pass++) {
      // Create a copy for reading while we modify the original
      const tempMap = new Float32Array(heightmap);

      for (let x = 1; x < size - 1; x++) {
        for (let z = 1; z < size - 1; z++) {
          const idx = x + z * size;
          const height = tempMap[idx];

          // Check all 4 neighbors
          const neighbors = [
            { dx: -1, dz: 0, height: tempMap[idx - 1] },
            { dx: 1, dz: 0, height: tempMap[idx + 1] },
            { dx: 0, dz: -1, height: tempMap[idx - size] },
            { dx: 0, dz: 1, height: tempMap[idx + size] },
          ];

          // Calculate material movement
          let totalDiff = 0;
          for (const n of neighbors) {
            const diff = height - n.height;
            if (diff > talus) {
              const amount = (diff - talus) * rate;
              heightmap[idx] -= amount * 0.25;
              heightmap[idx + n.dx + n.dz * size] += amount * 0.25;
              totalDiff += amount;
            }
          }
        }
      }
    }
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

    // Convert 3D field to 2D heightmap
    const heightmap = new Float32Array(totalSize * totalSize);
    for (let x = 0; x < totalSize; x++) {
      for (let z = 0; z < totalSize; z++) {
        let maxHeight = 0;
        for (let y = 0; y < totalSize; y++) {
          const value = currentField![x + y * totalSize + z * totalSize * totalSize];
          if (value > maxHeight) maxHeight = value;
        }
        heightmap[x + z * totalSize] = maxHeight;
      }
    }

    // Apply thermal erosion
    generator.thermalErode(heightmap, totalSize);

    // Apply eroded heightmap back to 3D field
    for (let x = 0; x < totalSize; x++) {
      for (let z = 0; z < totalSize; z++) {
        const erodedHeight = heightmap[x + z * totalSize];
        for (let y = 0; y < totalSize; y++) {
          const index = x + y * totalSize + z * totalSize * totalSize;
          if (currentField![index] > 0) {
            currentField![index] = Math.min(currentField![index], erodedHeight);
          }
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
