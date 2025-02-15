import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise";
import { TerrainGenerateMessage } from "../types/terrain";
import { PseudoRandomNumberGenerator } from "../utils/PseudoRandom";

// Types for better code organization
type NoiseGenerators = {
  simplex: SimplexNoise;
  height: SimplexNoise;
  variation: SimplexNoise;
};

type TerrainConfig = {
  ground: {
    threshold: number;
    value: number;
  };
  air: {
    threshold: number;
    value: number;
  };
  valueBounds: {
    min: number;
    max: number;
  };
  variation: {
    scale: number;
    strength: number;
  };
  noise: {
    octaves: number;
    persistence: number;
    baseScale: number;
    ridgeOffset: number;
    initial: {
      amplitude: number;
      frequency: number;
    };
    frequencyMultiplier: number;
  };
  cache: {
    size: number;
    resetThreshold: number;
  };
};

// Configuration with descriptive names
const TERRAIN_CONFIG: TerrainConfig = {
  ground: {
    threshold: 2,
    value: 0.9,
  },
  air: {
    threshold: 0.95,
    value: 0.1,
  },
  valueBounds: {
    min: 0.001,
    max: 0.999,
  },
  variation: {
    scale: 0.3,
    strength: 0.2,
  },
  noise: {
    octaves: 4,
    persistence: 0.5,
    baseScale: 0.03,
    ridgeOffset: 1.0,
    initial: {
      amplitude: 0.5,
      frequency: 0.4,
    },
    frequencyMultiplier: 2.0,
  },
  cache: {
    size: 4096,
    resetThreshold: 0.9,
  },
};

// Cache manager for noise calculations
class NoiseCache {
  private octaveScales: Float32Array;
  private octaveAmplitudes: Float32Array;
  private noiseValues: Float32Array;
  private cacheKeys: Int32Array;

  constructor(config: TerrainConfig) {
    this.octaveScales = new Float32Array(config.noise.octaves);
    this.octaveAmplitudes = new Float32Array(config.noise.octaves);
    this.noiseValues = new Float32Array(config.cache.size);
    this.cacheKeys = new Int32Array(config.cache.size * 3);

    this.initializeOctaves(config);
  }

  private initializeOctaves(config: TerrainConfig): void {
    let amplitude = config.noise.initial.amplitude;
    let frequency = config.noise.initial.frequency;
    let maxValue = 0;

    for (let i = 0; i < config.noise.octaves; i++) {
      this.octaveScales[i] = config.noise.baseScale * frequency;
      this.octaveAmplitudes[i] = amplitude;
      maxValue += amplitude;
      amplitude *= config.noise.persistence;
      frequency *= config.noise.frequencyMultiplier;
    }

    // Normalize amplitudes
    const invMaxValue = 1 / maxValue;
    for (let i = 0; i < config.noise.octaves; i++) {
      this.octaveAmplitudes[i] *= invMaxValue;
    }
  }

  getCacheKey(x: number, y: number, z: number): number {
    return ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) % TERRAIN_CONFIG.cache.size;
  }

  getValue(key: number): number {
    return this.noiseValues[key];
  }

  setValue(key: number, x: number, y: number, z: number, value: number): void {
    const keyIndex = key * 3;
    this.cacheKeys[keyIndex] = x;
    this.cacheKeys[keyIndex + 1] = y;
    this.cacheKeys[keyIndex + 2] = z;
    this.noiseValues[key] = value;
  }

  isValidCacheEntry(key: number, x: number, y: number, z: number): boolean {
    const keyIndex = key * 3;
    return this.cacheKeys[keyIndex] === x && this.cacheKeys[keyIndex + 1] === y && this.cacheKeys[keyIndex + 2] === z;
  }

  getOctaveData(index: number): { scale: number; amplitude: number } {
    return {
      scale: this.octaveScales[index],
      amplitude: this.octaveAmplitudes[index],
    };
  }
}

// Main terrain generator class
class TerrainGenerator {
  private readonly seeds: {
    simplex: number;
    height: number;
    variation: number;
  };
  private noiseGenerators: NoiseGenerators;
  private cache: NoiseCache;

  constructor(seed: number) {
    // Generate deterministic seeds for each noise generator
    this.seeds = {
      simplex: seed,
      height: seed + 166,
      variation: seed + 6662,
    };

    this.noiseGenerators = {
      simplex: new SimplexNoise(new PseudoRandomNumberGenerator(this.seeds.simplex)),
      height: new SimplexNoise(new PseudoRandomNumberGenerator(this.seeds.height)),
      variation: new SimplexNoise(new PseudoRandomNumberGenerator(this.seeds.variation)),
    };
    this.cache = new NoiseCache(TERRAIN_CONFIG);
  }

  private clamp(value: number): number {
    const { min, max } = TERRAIN_CONFIG.valueBounds;
    return value < min ? min : value > max ? max : value;
  }

  private generateRidgedNoise(x: number, y: number, z: number): number {
    const key = this.cache.getCacheKey(x, y, z);

    if (this.cache.isValidCacheEntry(key, x, y, z)) {
      return this.cache.getValue(key);
    }

    let noiseValue = 0;
    const { simplex } = this.noiseGenerators;

    for (let i = 0; i < TERRAIN_CONFIG.noise.octaves; i++) {
      const { scale, amplitude } = this.cache.getOctaveData(i);
      const scaledX = x * scale;
      const scaledY = y * scale;
      const scaledZ = z * scale;

      const baseNoise = Math.abs(simplex.noise3d(scaledX, scaledY, scaledZ));
      const ridge = TERRAIN_CONFIG.noise.ridgeOffset - baseNoise;
      noiseValue += ridge * ridge * amplitude;
    }

    this.cache.setValue(key, x, y, z, noiseValue);
    return noiseValue;
  }

  generateTerrainNoise(x: number, y: number, z: number): number {
    if (y < TERRAIN_CONFIG.ground.threshold) return TERRAIN_CONFIG.ground.value;

    const normalizedY = y * 0.03125; // 1/32 multiplication
    if (normalizedY > TERRAIN_CONFIG.air.threshold) return TERRAIN_CONFIG.air.value;

    const heightFalloff = 1.0 - normalizedY * normalizedY * Math.sqrt(normalizedY);
    if (heightFalloff <= 0) return TERRAIN_CONFIG.air.value;

    const { height: heightNoise, variation: variationNoise } = this.noiseGenerators;

    const baseNoise = this.generateRidgedNoise(x, y, z);
    const xzScale = 0.002;
    const heightVar = heightNoise.noise3d(x * xzScale, 0, z * xzScale) * 0.2 + 0.9;

    const varScale = TERRAIN_CONFIG.noise.baseScale * TERRAIN_CONFIG.variation.scale;
    const variation = variationNoise.noise3d(x * varScale, y * varScale, z * varScale) * TERRAIN_CONFIG.variation.strength;

    return this.clamp((baseNoise + variation) * heightFalloff * heightVar);
  }

  generateClimate(x: number, z: number): { temperature: number; humidity: number } {
    const { height, variation } = this.noiseGenerators;
    const temperatureScale = 0.02;
    const humidityScale = 0.015;

    return {
      temperature: (height.noise3d(x * temperatureScale, 0, z * temperatureScale) + 1) * 0.5,
      humidity: (variation.noise3d(x * humidityScale, 0, z * humidityScale) + 1) * 0.5,
    };
  }
}

// Worker setup
const ctx: Worker = self as any;

ctx.addEventListener("message", (e: MessageEvent<TerrainGenerateMessage>) => {
  if (e.data.type === "generateTerrain") {
    const { chunkX, chunkZ, gridSize, padding, seed } = e.data;
    const generator = new TerrainGenerator(seed);

    const totalSize = gridSize + padding * 2;

    // Use exact grid coordinates without any chunk size adjustments
    const effectiveGridSize = gridSize - 2 * padding;
    const baseX = chunkX * effectiveGridSize;
    const baseZ = chunkZ * effectiveGridSize;

    // Generate terrain data
    const field = new Float32Array(totalSize * totalSize * totalSize);
    const temperatures = new Float32Array(totalSize * totalSize);
    const humidities = new Float32Array(totalSize * totalSize);

    // Generate terrain using exact world coordinates
    for (let x = 0; x < totalSize; x++) {
      for (let y = 0; y < totalSize; y++) {
        for (let z = 0; z < totalSize; z++) {
          const worldX = baseX + (x - padding);
          const worldY = y - padding;
          const worldZ = baseZ + (z - padding);
          const index = (x * totalSize + y) * totalSize + z;
          field[index] = generator.generateTerrainNoise(worldX, worldY, worldZ);
        }
      }
    }

    // Generate climate using exact world coordinates

    // Generate terrain data with correct world coordinates
    for (let x = 0; x < totalSize; x++) {
      for (let z = 0; z < totalSize; z++) {
        const worldX = baseX + (x - padding);
        const worldZ = baseZ + (z - padding);

        const { temperature, humidity } = generator.generateClimate(worldX, worldZ);
        const index = x * totalSize + z;
        temperatures[index] = temperature;
        humidities[index] = humidity;
      }
    }

    ctx.postMessage(
      {
        type: "terrainGenerated",
        chunkX,
        chunkZ,
        field,
        temperatures,
        humidities,
      },
      [field.buffer, temperatures.buffer, humidities.buffer]
    );
  }
});
