import * as THREE from "three";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise.js";
import { vectorPool } from "../utils/vectorPool";

export class VoronoiNoise {
  private points: Array<[number, number, number]>;
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
  private simplexNoise: SimplexNoise;
  private spatialGrid: Map<string, THREE.Vector3[]>;
  private cachedResults: Map<string, THREE.Vector3[]>;

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
  } = {}) {
    this.name = name;
    this.points = [];
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
    this.simplexNoise = new SimplexNoise();
    this.spatialGrid = new Map();
    this.cachedResults = new Map();
    this.generatePoints();
    this.initSpatialGrid();
  }

  private generatePoints(): void {
    const range = Math.ceil(2 * this.cellSize);
    this.points = [];
    for (let x = -range; x <= range; x += this.cellSize) {
      for (let y = -range; y <= range; y += this.cellSize) {
        for (let z = -range; z <= range; z += this.cellSize) {
          this.points.push([
            x + (Math.random() - 0.5) * this.jitter * this.cellSize,
            y + (Math.random() - 0.5) * this.jitter * this.cellSize,
            z + (Math.random() - 0.5) * this.jitter * this.cellSize,
          ]);
        }
      }
    }
  }

  private initSpatialGrid() {
    // Index all points into grid cells
    this.points.forEach((point) => {
      const cell = this.getCellKey(new THREE.Vector3(point[0], point[1], point[2]));
      if (!this.spatialGrid.has(cell)) {
        this.spatialGrid.set(cell, []);
      }
      this.spatialGrid.get(cell)!.push(new THREE.Vector3(point[0], point[1], point[2]));
    });
  }

  private getCellKey(point: THREE.Vector3): string {
    const x = Math.floor(point.x / this.cellSize);
    const y = Math.floor(point.y / this.cellSize);
    const z = Math.floor(point.z / this.cellSize);
    return `${x},${y},${z}`;
  }

  getNearbyPoints(position: THREE.Vector3, maxCount: number = 4): THREE.Vector3[] {
    // Check cache first with lower precision key
    const key = `${Math.floor(position.x * 10)},${Math.floor(position.y * 10)},${Math.floor(position.z * 10)}_${maxCount}`;
    if (this.cachedResults.has(key)) {
      return this.cachedResults.get(key)!;
    }

    const cell = this.getCellKey(position);
    const neighborCells = this.getNeighborCells(cell);

    // Pre-allocate array
    const candidates: Array<{ point: THREE.Vector3; distSq: number }> = [];
    const tempVec = vectorPool.getVector();

    neighborCells.forEach((cellKey) => {
      const points = this.spatialGrid.get(cellKey);
      if (points) {
        for (const point of points) {
          tempVec.copy(point).sub(position);
          const distSq = tempVec.lengthSq();
          if (candidates.length < maxCount || distSq < candidates[candidates.length - 1].distSq) {
            candidates.push({ point, distSq });
            candidates.sort((a, b) => a.distSq - b.distSq);
            if (candidates.length > maxCount) candidates.pop();
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

    // Check immediate neighbors only
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          neighbors.push(`${x + dx},${y + dy},${z + dz}`);
        }
      }
    }
    return neighbors;
  }

  private getTurbulence(x: number, y: number, z: number): number {
    return this.simplexNoise.noise3d(x * 2.0, y * 2.0, z * 2.0) * this.turbulence;
  }

  private getRidgeNoise(x: number, y: number, z: number): number {
    let value = 0;
    let frequency = 1;
    let amplitude = 1;
    let weight = 1;
    const gain = 2.0; // Controls ridge sharpness

    for (let i = 0; i < this.octaves; i++) {
      // Get absolute noise value
      let n = Math.abs(this.simplexNoise.noise3d(x * frequency, y * frequency, z * frequency));

      // Invert and shape the noise into ridges
      n = this.ridgeOffset - n;
      n = n * n; // Square for sharper ridges

      // Apply gain and weight
      value += n * amplitude * weight;

      // Update frequency and amplitude for next octave
      frequency *= this.lacunarity;
      amplitude *= this.persistence;

      // Adjust weight based on previous noise value
      weight = n * gain;
    }

    // Normalize the output
    return value * this.amplitude;
  }

  private getRotationalVariance(x: number, y: number, z: number): number {
    // Create rotational variation based on position
    const angle = Math.atan2(z, x);
    const rotationalNoise = this.simplexNoise.noise3d(Math.cos(angle) * 0.5, y * 0.3, Math.sin(angle) * 0.5);

    return rotationalNoise * this.turbulence;
  }

  // Modify getValue method to include rotational variance
  public getValue(x: number, y: number, z: number): number {
    // Add rotation-based warping
    const rotation = this.getRotationalVariance(x, y, z);
    const wx = x + this.warpStrength * (this.simplexNoise.noise3d(x, y, z) + rotation);
    const wy = y + this.warpStrength * (this.simplexNoise.noise3d(y, z, x) + rotation * 0.5);
    const wz = z + this.warpStrength * (this.simplexNoise.noise3d(z, x, y) + rotation);

    // Get base noise with added complexity
    const voronoiValue = this.getVoronoiValue(wx, wy, wz);
    const ridgeNoise = this.getRidgeNoise(wx * 1.1, wy * 0.9, wz * 1.2);
    const turbulence = this.getTurbulence(wx, wy, wz);

    // Add fractal variation
    const fractalNoise = this.simplexNoise.noise3d(wx * 1.5, wy * 1.5, wz * 1.5) * 0.3;

    // Blend all components with rotation influence
    const value = voronoiValue * this.blendFactor + ridgeNoise * (1 - this.blendFactor) + turbulence + fractalNoise + rotation * 0.4;

    return value;
  }

  private voronoiCache: Map<string, number> = new Map();

  private getVoronoiValue(x: number, y: number, z: number): number {
    const cacheKey = `${(x / 0.1).toFixed(1)},${(y / 0.1).toFixed(1)},${(z / 0.1).toFixed(1)}`;
    if (this.voronoiCache.has(cacheKey)) {
      return this.voronoiCache.get(cacheKey)!;
    }

    let minDistSq = Infinity;
    let secondMinDistSq = Infinity;
    const v = vectorPool.getVector(x, y, z);
    // Get only nearby points
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
