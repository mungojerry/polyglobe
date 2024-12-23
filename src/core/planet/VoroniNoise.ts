import * as THREE from "three";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise.js";
import { vectorPool } from "../utils/vectorPool";

export class VoronoiNoise {
  // Use typed arrays for better performance with points
  private points: Float32Array;
  private pointCount: number = 0;

  // Pre-calculate constants
  private readonly RANGE_MULT = 2;
  private readonly JITTER_HALF = 0.5;

  public name: string;
  public cellSize: number;
  public jitter: number;
  public amplitude: number;
  public blendFactor: number;
  public octaves: number;
  public persistence: number;
  public lacunarity: number;
  public warpStrength: number;
  public ridgeOffset: number;
  public turbulence: number;
  public erosionStrength: number;
  public plateauThreshold: number;
  public biomeScale: number;
  private simplexNoise: SimplexNoise;
  private spatialGrid: Map<string, THREE.Vector3[]>;
  private cachedResults: Map<string, THREE.Vector3[]>;
  private voronoiCache: Map<string, number>;
  private erosionCache: Map<string, number>;

  constructor({
    name = "voroni",
    cellSize = 50,
    jitter = 0.8,
    amplitude = 1.0,
    blendFactor = 0.5,
    octaves = 4,
    persistence = 0.5,
    lacunarity = 2.0,
    warpStrength = 0.4,
    ridgeOffset = 1.0,
    turbulence = 0.3,
    erosionStrength = 0.3,
    plateauThreshold = 0.7,
    biomeScale = 0.5,
  } = {}) {
    this.name = name;
    this.cellSize = cellSize;
    this.jitter = jitter;
    this.amplitude = amplitude;
    this.blendFactor = blendFactor;
    this.octaves = octaves;
    this.persistence = persistence;
    this.lacunarity = lacunarity;
    this.warpStrength = warpStrength;
    this.ridgeOffset = ridgeOffset;
    this.turbulence = turbulence;
    this.erosionStrength = erosionStrength;
    this.plateauThreshold = plateauThreshold;
    this.biomeScale = biomeScale;
    this.simplexNoise = new SimplexNoise();
    this.spatialGrid = new Map();
    this.cachedResults = new Map();
    this.voronoiCache = new Map();
    this.erosionCache = new Map();

    // Pre-allocate max points array based on range
    const range = Math.ceil(this.RANGE_MULT * cellSize);
    const maxPoints = Math.pow(Math.ceil((2 * range) / cellSize) + 1, 3);
    this.points = new Float32Array(maxPoints * 3);

    this.generatePoints();
    this.initSpatialGrid();
  }

  private generatePoints(): void {
    const range = Math.ceil(this.RANGE_MULT * this.cellSize);
    let idx = 0;

    // Avoid repeated calculations
    const jitterAmount = this.jitter * this.cellSize;

    // Use single loop with pre-calculated bounds
    const steps = Math.ceil((2 * range) / this.cellSize) + 1;
    const total = steps * steps * steps;

    for (let i = 0; i < total; i++) {
      // Convert single index to x,y,z coordinates
      const x = (i % steps) * this.cellSize - range;
      const y = (Math.floor(i / steps) % steps) * this.cellSize - range;
      const z = Math.floor(i / (steps * steps)) * this.cellSize - range;

      // Direct array access is faster than push()
      this.points[idx] = x + (Math.random() - this.JITTER_HALF) * jitterAmount;
      this.points[idx + 1] = y + (Math.random() - this.JITTER_HALF) * jitterAmount;
      this.points[idx + 2] = z + (Math.random() - this.JITTER_HALF) * jitterAmount;

      idx += 3;
    }

    this.pointCount = idx / 3;
  }

  private initSpatialGrid() {
    this.spatialGrid.clear();

    // Process points in chunks for better performance
    const CHUNK_SIZE = 1000;

    for (let i = 0; i < this.pointCount; i += CHUNK_SIZE) {
      const end = Math.min(i + CHUNK_SIZE, this.pointCount);

      for (let j = i; j < end; j++) {
        const idx = j * 3;
        const point = new THREE.Vector3(this.points[idx], this.points[idx + 1], this.points[idx + 2]);
        const cell = this.getCellKey(point);

        let points = this.spatialGrid.get(cell);
        if (!points) {
          points = [];
          this.spatialGrid.set(cell, points);
        }
        points.push(point);
      }
    }
  }

  private getCellKey(point: THREE.Vector3): string {
    const x = Math.floor(point.x / this.cellSize);
    const y = Math.floor(point.y / this.cellSize);
    const z = Math.floor(point.z / this.cellSize);
    return `${x},${y},${z}`;
  }

  private getBiomeValue(x: number, y: number, z: number): number {
    const biomeNoise = this.simplexNoise.noise3d(x * this.biomeScale, y * this.biomeScale, z * this.biomeScale);
    return (biomeNoise + 1) * 0.5; // Normalize to 0-1
  }

  private getErosion(x: number, y: number, z: number): number {
    const cacheKey = `${(x / 0.1).toFixed(1)},${(y / 0.1).toFixed(1)},${(z / 0.1).toFixed(1)}`;
    if (this.erosionCache.has(cacheKey)) {
      return this.erosionCache.get(cacheKey)!;
    }

    const slope = this.getSlope(x, y, z);
    const rainfall = this.simplexNoise.noise3d(x * 2, y * 2, z * 2) * 0.5 + 0.5;
    const erosion = slope * rainfall * this.erosionStrength;

    this.erosionCache.set(cacheKey, erosion);
    return erosion;
  }

  private getSlope(x: number, y: number, z: number): number {
    const delta = 0.1;
    const h1 = this.getBaseHeight(x + delta, y, z);
    const h2 = this.getBaseHeight(x - delta, y, z);
    const h3 = this.getBaseHeight(x, y, z + delta);
    const h4 = this.getBaseHeight(x, y, z - delta);

    const dx = (h1 - h2) / (2 * delta);
    const dz = (h3 - h4) / (2 * delta);

    return Math.sqrt(dx * dx + dz * dz);
  }

  private baseHeightCache = new Map<string, number>();

  private getBaseHeight(x: number, y: number, z: number): number {
    const key = `${x},${y},${z}`;
    if (this.baseHeightCache.has(key)) {
      return this.baseHeightCache.get(key)!;
    }
    const voronoiValue = this.getVoronoiValue(x, y, z);
    const ridgeNoise = this.getRidgeNoise(x * 1.1, y * 0.9, z * 1.2);
    const height = voronoiValue * this.blendFactor + ridgeNoise * (1 - this.blendFactor);
    this.baseHeightCache.set(key, height);
    return height;
  }

  private getMountainRange(x: number, y: number, z: number): number {
    const angle = Math.atan2(z, x);
    const distance = Math.sqrt(x * x + z * z);

    const rangeNoise = this.simplexNoise.noise3d(Math.cos(angle) * distance * 0.02, y * 0.02, Math.sin(angle) * distance * 0.02);

    return Math.pow(Math.max(0, rangeNoise), 2) * 2;
  }

  private getPlateau(height: number): number {
    if (height > this.plateauThreshold) {
      const t = (height - this.plateauThreshold) / (1 - this.plateauThreshold);
      return this.plateauThreshold + (1 - Math.pow(1 - t, 3)) * (1 - this.plateauThreshold);
    }
    return height;
  }

  public getValue(x: number, y: number, z: number): number {
    // Add rotation-based warping
    const rotation = this.getRotationalVariance(x, y, z);
    const noise = this.simplexNoise.noise3d(x, y, z);
    const wx = x + this.warpStrength * (noise + rotation);
    const wy = y + this.warpStrength * (noise + rotation * 0.5);
    const wz = z + this.warpStrength * (noise + rotation);

    // Get base terrain components
    const voronoiValue = this.getVoronoiValue(wx, wy, wz);
    const ridgeNoise = this.getRidgeNoise(wx * 1.1, wy * 0.9, wz * 1.2);
    const mountainRange = this.getMountainRange(wx, wy, wz);
    const turbulence = this.getTurbulence(wx, wy, wz);
    const fractalNoise = this.simplexNoise.noise3d(wx * 1.5, wy * 1.5, wz * 1.5) * 0.3;

    // Blend base terrain
    let value = voronoiValue * this.blendFactor + ridgeNoise * (1 - this.blendFactor) + mountainRange * 0.5 + turbulence + fractalNoise + rotation * 0.4;

    // Apply erosion
    const erosion = this.getErosion(wx, wy, wz);
    value -= erosion;

    // Apply plateau formation
    value = this.getPlateau(value);

    // Apply biome variation
    const biomeValue = this.getBiomeValue(wx, wy, wz);
    value *= 0.8 + biomeValue * 0.4;

    return value;
  }

  private getTurbulence(x: number, y: number, z: number): number {
    return this.simplexNoise.noise3d(x * 2.0, y * 2.0, z * 2.0) * this.turbulence;
  }

  private getRidgeNoise(x: number, y: number, z: number): number {
    let value = 0;
    let frequency = 1;
    let amplitude = 1;
    let weight = 1;
    const gain = 2.0;

    for (let i = 0; i < this.octaves; i++) {
      let n = Math.abs(this.simplexNoise.noise3d(x * frequency, y * frequency, z * frequency));
      n = this.ridgeOffset - n;
      n = n * n;

      value += n * amplitude * weight;
      frequency *= this.lacunarity;
      amplitude *= this.persistence;
      weight = n * gain;
    }

    return value * this.amplitude;
  }

  private getRotationalVariance(x: number, y: number, z: number): number {
    const angle = Math.atan2(z, x);
    const rotationalNoise = this.simplexNoise.noise3d(Math.cos(angle) * 0.5, y * 0.3, Math.sin(angle) * 0.5);

    return rotationalNoise * this.turbulence;
  }

  getNearbyPoints(position: THREE.Vector3, maxCount: number = 4): THREE.Vector3[] {
    const key = `${Math.floor(position.x * 10)},${Math.floor(position.y * 10)},${Math.floor(position.z * 10)}_${maxCount}`;
    if (this.cachedResults.has(key)) {
      return this.cachedResults.get(key)!;
    }

    const cell = this.getCellKey(position);
    const neighborCells = this.getNeighborCells(cell);
    const candidates: Array<{ point: THREE.Vector3; distSq: number }> = [];
    const tempVec = vectorPool.getVector();

    neighborCells.forEach((cellKey) => {
      const points = this.spatialGrid.get(cellKey);
      if (points) {
        for (const point of points) {
          tempVec.copy(point).sub(position);
          const distSq = tempVec.lengthSq();
          if (candidates.length < maxCount) {
            candidates.push({ point, distSq });
            if (candidates.length === maxCount) {
              candidates.sort((a, b) => a.distSq - b.distSq);
            }
          } else if (distSq < candidates[maxCount - 1].distSq) {
            // replace the worst candidate, then do a quick insertion
            candidates[maxCount - 1] = { point, distSq };
            let i = maxCount - 2;
            while (i >= 0 && candidates[i].distSq > candidates[i + 1].distSq) {
              [candidates[i], candidates[i + 1]] = [candidates[i + 1], candidates[i]];
              i--;
            }
          }
        }
      }
    });

    const result = candidates.map((c) => c.point);
    this.cachedResults.set(key, result);
    vectorPool.releaseVector(tempVec);
    return result;
  }

  private getNeighborCells(cell: string): string[] {
    const [x, y, z] = cell.split(",").map(Number);
    const neighbors: string[] = [];

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          neighbors.push(`${x + dx},${y + dy},${z + dz}`);
        }
      }
    }
    return neighbors;
  }

  private getVoronoiValue(x: number, y: number, z: number): number {
    const cacheKey = `${(x / 0.1).toFixed(1)},${(y / 0.1).toFixed(1)},${(z / 0.1).toFixed(1)}`;
    if (this.voronoiCache.has(cacheKey)) {
      return this.voronoiCache.get(cacheKey)!;
    }

    let minDistSq = Infinity;
    let secondMinDistSq = Infinity;
    const v = vectorPool.getVector(x, y, z);
    const nearbyPoints = this.getNearbyPoints(v);
    vectorPool.releaseVector(v);

    for (const point of nearbyPoints) {
      const dx = point.x - x;
      const dy = point.y - y;
      const dz = point.z - z;
      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq < minDistSq) {
        secondMinDistSq = minDistSq;
        minDistSq = distSq;
      } else if (distSq < secondMinDistSq) {
        secondMinDistSq = distSq;
      }
    }

    const value = ((Math.sqrt(secondMinDistSq) - Math.sqrt(minDistSq)) / this.cellSize) * this.amplitude;
    this.voronoiCache.set(cacheKey, value);
    return value;
  }
}
