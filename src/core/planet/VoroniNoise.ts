import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise.js";

export interface VoronoiNoiseConfig {
  cellSize: number;
  jitter: number;
  amplitude: number;
  blendFactor: number;
  octaves: number;
  persistence: number;
  lacunarity: number;
  warpStrength: number;
  ridgeOffset: number;
  turbulence: number;
  erosionStrength: number;
  plateauThreshold: number;
  biomeScale: number;
}

interface GridCell {
  x: number;
  y: number;
  z: number;
}

export class VoronoiNoise {
  private readonly points: Float32Array;
  private readonly pointCount: number;
  private readonly simplexNoise: SimplexNoise;
  private readonly spatialGrid: Int32Array;
  private readonly gridSize: number;

  // Cache configuration
  private readonly valueCache: Float32Array;
  private readonly valueCacheKeys: Int32Array;
  private readonly CACHE_SIZE = 8192; // Increased cache size, power of 2
  private readonly COORD_SCALE = 100; // Scale for coordinate precision in cache

  // Configuration with validation
  public readonly config: VoronoiNoiseConfig;

  constructor(config: Partial<VoronoiNoiseConfig> = {}) {
    // Default configuration with safe values
    const defaultConfig: VoronoiNoiseConfig = {
      cellSize: 50,
      jitter: 0.8,
      amplitude: 1.0,
      blendFactor: 0.5,
      octaves: 4,
      persistence: 0.5,
      lacunarity: 2.0,
      warpStrength: 0.2,
      ridgeOffset: 1.0,
      turbulence: 0.15,
      erosionStrength: 0.2,
      plateauThreshold: 0.7,
      biomeScale: 0.3,
    };

    // Validate and clamp configuration values
    this.config = this.validateConfig({ ...defaultConfig, ...config });

    this.simplexNoise = new SimplexNoise();

    // Initialize grid with safe dimensions
    this.gridSize = this.calculateGridSize();
    const totalPoints = this.gridSize ** 3;

    // Initialize typed arrays with proper sizes
    this.points = new Float32Array(totalPoints * 3);
    this.spatialGrid = new Int32Array(totalPoints);
    this.valueCache = new Float32Array(this.CACHE_SIZE);
    this.valueCacheKeys = new Int32Array(this.CACHE_SIZE * 3);

    // Generate and initialize
    this.pointCount = this.generatePoints();
    this.initSpatialGrid();
  }

  private validateConfig(config: VoronoiNoiseConfig): VoronoiNoiseConfig {
    return {
      cellSize: Math.max(1, Math.min(1000, config.cellSize)),
      jitter: Math.max(0, Math.min(1, config.jitter)),
      amplitude: Math.max(0.1, Math.min(10, config.amplitude)),
      blendFactor: Math.max(0, Math.min(1, config.blendFactor)),
      octaves: Math.max(1, Math.min(8, Math.floor(config.octaves))),
      persistence: Math.max(0.1, Math.min(1, config.persistence)),
      lacunarity: Math.max(1, Math.min(4, config.lacunarity)),
      warpStrength: Math.max(0, Math.min(1, config.warpStrength)),
      ridgeOffset: Math.max(0.1, Math.min(2, config.ridgeOffset)),
      turbulence: Math.max(0, Math.min(1, config.turbulence)),
      erosionStrength: Math.max(0, Math.min(1, config.erosionStrength)),
      plateauThreshold: Math.max(0, Math.min(1, config.plateauThreshold)),
      biomeScale: Math.max(0.1, Math.min(1, config.biomeScale)),
    };
  }

  private calculateGridSize(): number {
    // Ensure grid size is odd for proper centering
    return Math.max(3, Math.ceil((2 * Math.ceil(2 * this.config.cellSize)) / this.config.cellSize) | 1);
  }

  private generatePoints(): number {
    const { cellSize, jitter } = this.config;
    const range = Math.ceil(2 * cellSize);
    const jitterAmount = jitter * cellSize;
    let idx = 0;

    for (let i = 0; i < this.gridSize ** 3; i++) {
      const x = (i % this.gridSize) * cellSize - range;
      const y = (Math.floor(i / this.gridSize) % this.gridSize) * cellSize - range;
      const z = Math.floor(i / (this.gridSize * this.gridSize)) * cellSize - range;

      // Add jitter with bounds checking
      const jx = x + (Math.random() - 0.5) * jitterAmount;
      const jy = y + (Math.random() - 0.5) * jitterAmount;
      const jz = z + (Math.random() - 0.5) * jitterAmount;

      // Ensure points are within valid range
      if (isFinite(jx) && isFinite(jy) && isFinite(jz)) {
        this.points[idx] = jx;
        this.points[idx + 1] = jy;
        this.points[idx + 2] = jz;
        idx += 3;
      }
    }

    return idx / 3;
  }

  private initSpatialGrid(): void {
    this.spatialGrid.fill(-1); // Initialize with invalid indices

    for (let i = 0; i < this.pointCount; i++) {
      const idx = i * 3;
      const gridIdx = this.getGridIndex(this.points[idx], this.points[idx + 1], this.points[idx + 2]);

      if (gridIdx >= 0 && gridIdx < this.spatialGrid.length) {
        this.spatialGrid[i] = gridIdx;
      }
    }
  }

  private getGridIndex(x: number, y: number, z: number): number {
    const gx = Math.floor(x / this.config.cellSize + this.gridSize / 2);
    const gy = Math.floor(y / this.config.cellSize + this.gridSize / 2);
    const gz = Math.floor(z / this.config.cellSize + this.gridSize / 2);

    if (gx < 0 || gx >= this.gridSize || gy < 0 || gy >= this.gridSize || gz < 0 || gz >= this.gridSize) {
      return -1;
    }

    return gz * this.gridSize * this.gridSize + gy * this.gridSize + gx;
  }

  private getBaseTerrain(x: number, y: number, z: number): number {
    if (!isFinite(x) || !isFinite(y) || !isFinite(z)) {
      return 0;
    }

    // Apply warping with bounds checking
    const warp = this.simplexNoise.noise3d(x, y, z) * this.config.warpStrength;
    if (!isFinite(warp)) return 0;

    const wx = x + warp;
    const wy = y + warp;
    const wz = z + warp;

    // Calculate and validate components
    const voronoi = this.getVoronoiValue(wx, wy, wz);
    const ridge = this.getRidgeNoise(wx, wy, wz);
    const turbulence = this.simplexNoise.noise3d(wx * 2, wy * 2, wz * 2) * this.config.turbulence;

    if (!isFinite(voronoi) || !isFinite(ridge) || !isFinite(turbulence)) {
      return 0;
    }

    // Blend components with validation
    const value = voronoi * this.config.blendFactor + ridge * (1 - this.config.blendFactor) + turbulence;

    return isFinite(value) ? value : 0;
  }

  public getValue(x: number, y: number, z: number): number {
    // Input validation
    if (!isFinite(x) || !isFinite(y) || !isFinite(z)) {
      return 0;
    }

    // Check cache
    const cacheKey = this.getCacheKey(x, y, z);
    const cachedValue = this.checkCache(cacheKey, x, y, z);
    if (cachedValue !== undefined && isFinite(cachedValue)) {
      return cachedValue;
    }

    // Get base terrain with validation
    let value = this.getBaseTerrain(x, y, z);
    if (!isFinite(value)) value = 0;

    // Apply erosion
    const erosion = this.calculateErosion(x, y, z);
    if (isFinite(erosion)) {
      value = Math.max(-1, Math.min(1, value - erosion));
    }

    // Apply plateau effect with validation
    if (isFinite(value) && value > this.config.plateauThreshold) {
      const t = (value - this.config.plateauThreshold) / (1 - this.config.plateauThreshold);
      if (isFinite(t)) {
        const plateau = this.config.plateauThreshold + (1 - Math.pow(1 - t, 3)) * (1 - this.config.plateauThreshold);
        value = isFinite(plateau) ? plateau : value;
      }
    }

    // Ensure final value is within bounds
    value = Math.max(-1, Math.min(1, value));

    // Cache valid results
    if (isFinite(value)) {
      this.cacheValue(cacheKey, value, x, y, z);
    }

    return value;
  }

  private calculateErosion(x: number, y: number, z: number): number {
    const delta = 0.1;

    // Get height samples with validation
    const heights = [
      this.getBaseTerrain(x + delta, y, z),
      this.getBaseTerrain(x - delta, y, z),
      this.getBaseTerrain(x, y, z + delta),
      this.getBaseTerrain(x, y, z - delta),
    ];

    if (!heights.every(isFinite)) {
      return 0;
    }

    // Calculate slope
    const dx = (heights[0] - heights[1]) / (2 * delta);
    const dz = (heights[2] - heights[3]) / (2 * delta);

    if (!isFinite(dx) || !isFinite(dz)) {
      return 0;
    }

    const slope = Math.sqrt(dx * dx + dz * dz);
    const rainfall = this.simplexNoise.noise3d(x * 2, y * 2, z * 2) * 0.5 + 0.5;

    if (!isFinite(slope) || !isFinite(rainfall)) {
      return 0;
    }

    const erosion = slope * rainfall * this.config.erosionStrength;
    return isFinite(erosion) ? Math.min(1, Math.max(0, erosion)) : 0;
  }

  private getVoronoiValue(x: number, y: number, z: number): number {
    let minDist = Infinity;
    let secondMinDist = Infinity;
    const gridIdx = this.getGridIndex(x, y, z);
    let foundPoint = false;

    if (gridIdx < 0) return 0;

    // Check neighboring cells
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const neighborIdx = gridIdx + dx + dy * this.gridSize + dz * this.gridSize * this.gridSize;

          if (neighborIdx < 0 || neighborIdx >= this.spatialGrid.length) {
            continue;
          }

          // Process points in this cell
          for (let i = 0; i < this.pointCount; i++) {
            if (this.spatialGrid[i] !== neighborIdx) continue;

            const idx = i * 3;
            const dx = this.points[idx] - x;
            const dy = this.points[idx + 1] - y;
            const dz = this.points[idx + 2] - z;

            if (!isFinite(dx) || !isFinite(dy) || !isFinite(dz)) {
              continue;
            }

            const distSq = dx * dx + dy * dy + dz * dz;
            if (!isFinite(distSq)) continue;

            if (distSq < minDist) {
              secondMinDist = minDist;
              minDist = distSq;
              foundPoint = true;
            } else if (distSq < secondMinDist) {
              secondMinDist = distSq;
            }
          }
        }
      }
    }

    if (!foundPoint || !isFinite(minDist) || !isFinite(secondMinDist)) {
      return 0;
    }

    // Prevent division by zero and ensure minimum difference
    minDist = Math.max(minDist, 1e-10);
    secondMinDist = Math.max(secondMinDist, minDist + 1e-10);

    const value = ((Math.sqrt(secondMinDist) - Math.sqrt(minDist)) / this.config.cellSize) * this.config.amplitude;

    return isFinite(value) ? Math.min(1, Math.max(-1, value)) : 0;
  }

  private getRidgeNoise(x: number, y: number, z: number): number {
    let value = 0;
    let frequency = 1;
    let amplitude = 1;
    let weight = 1;

    for (let i = 0; i < this.config.octaves; i++) {
      const n = this.simplexNoise.noise3d(x * frequency, y * frequency, z * frequency);

      if (!isFinite(n)) continue;

      const ridge = this.config.ridgeOffset - Math.abs(n);
      if (!isFinite(ridge)) continue;

      value += ridge * ridge * amplitude * weight;

      frequency *= this.config.lacunarity;
      amplitude *= this.config.persistence;
      weight = ridge * 2.0;

      if (!isFinite(frequency) || !isFinite(amplitude) || !isFinite(weight)) {
        break;
      }
    }

    const finalValue = value * this.config.amplitude;
    return isFinite(finalValue) ? Math.min(1, Math.max(-1, finalValue)) : 0;
  }

  private getCacheKey(x: number, y: number, z: number): number {
    return (Math.floor(x * 73856093) ^ Math.floor(y * 19349663) ^ Math.floor(z * 83492791)) & (this.CACHE_SIZE - 1);
  }

  private checkCache(key: number, x: number, y: number, z: number): number | undefined {
    const idx = key * 3;
    if (
      this.valueCacheKeys[idx] === Math.floor(x * 100) &&
      this.valueCacheKeys[idx + 1] === Math.floor(y * 100) &&
      this.valueCacheKeys[idx + 2] === Math.floor(z * 100)
    ) {
      return this.valueCache[key];
    }
    return undefined;
  }

  private cacheValue(key: number, value: number, x: number, y: number, z: number): void {
    const idx = key * 3;
    this.valueCacheKeys[idx] = Math.floor(x * 100);
    this.valueCacheKeys[idx + 1] = Math.floor(y * 100);
    this.valueCacheKeys[idx + 2] = Math.floor(z * 100);
    this.valueCache[key] = value;
  }
}
