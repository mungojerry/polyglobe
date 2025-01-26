import * as THREE from "three";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise";
import { pseudoRandom } from "../utils/PseudoRandom";

export interface ErosionConfig {
  iterations: number;
  erosionRate: number;
  depositionRate: number;
  smoothingFactor: number;
}

export interface LandscapeConfig {
  resolution: number;
  ridgeNoise: {
    scale: number;
    amplitude: number;
    sharpness: number;
  };
  noiseLayers: Array<{
    scale: number;
    amplitude: number;
  }>;
  waterLevel: number;
  colors: Array<{
    height: number;
    color: THREE.Color;
  }>;
  erosion?: ErosionConfig;
}

export class LandscapeGenerator {
  private config: LandscapeConfig;
  private readonly PLANET_RADIUS: number;

  constructor(planetRadius: number, config?: Partial<LandscapeConfig>) {
    if (planetRadius <= 0) {
      throw new Error("Planet radius must be positive");
    }
    this.PLANET_RADIUS = planetRadius;
    this.config = this.validateConfig(this.mergeWithDefaults(config));
  }

  private validateConfig(config: LandscapeConfig): LandscapeConfig {
    // Validate numeric ranges and configurations

    // Validate noise parameters
    if (config.ridgeNoise.scale <= 0 || config.ridgeNoise.amplitude < 0) {
      throw new Error("Invalid ridge noise parameters");
    }

    // Validate erosion config if present
    if (config.erosion) {
      const { iterations, erosionRate, depositionRate, smoothingFactor } = config.erosion;
      if (iterations < 0 || erosionRate < 0 || depositionRate < 0 || smoothingFactor < 0 || smoothingFactor > 1) {
        throw new Error("Invalid erosion configuration");
      }
    }

    return config;
  }

  private mergeWithDefaults(partialConfig?: Partial<LandscapeConfig>): LandscapeConfig {
    // Same implementation as before
    const defaultConfig: LandscapeConfig = {
      resolution: 7,
      ridgeNoise: {
        scale: 1.3,
        amplitude: 0.15,
        sharpness: 1.4,
      },
      noiseLayers: [
        { scale: 0.5, amplitude: 0.1 },
        { scale: 1.0, amplitude: 0.08 },
        { scale: 2.0, amplitude: 0.04 },
        { scale: 4.0, amplitude: 0.02 },
        { scale: 8.0, amplitude: 0.01 },
        { scale: 16.0, amplitude: 0.005 },
      ],
      waterLevel: 1.03,
      colors: [
        { height: 0.0, color: new THREE.Color(0x000066) },
        { height: 0.05, color: new THREE.Color(0x006699) },
        { height: 0.1, color: new THREE.Color(0xf0e68c) },
        { height: 0.2, color: new THREE.Color(0x339933) },
        { height: 0.6, color: new THREE.Color(0x663300) },
        { height: 0.8, color: new THREE.Color(0x666666) },
        { height: 1.0, color: new THREE.Color(0xffffff) },
      ],
      erosion: {
        iterations: 3,
        erosionRate: 0.5,
        depositionRate: 0.3,
        smoothingFactor: 0.2,
      },
    };

    return { ...defaultConfig, ...partialConfig };
  }

  // Implement a more efficient neighbor finding method
  private findNearestNeighbors(vertices: Float32Array, index: number, maxNeighbors: number = 6): number[] {
    const queryVertex = new THREE.Vector3(vertices[index], vertices[index + 1], vertices[index + 2]);
    const distanceMap = new Map<number, number>();

    for (let i = 0; i < vertices.length; i += 3) {
      if (i === index) continue;

      const neighbor = new THREE.Vector3(vertices[i], vertices[i + 1], vertices[i + 2]);
      const distance = queryVertex.distanceTo(neighbor);
      distanceMap.set(i, distance);
    }

    // Sort by distance and take nearest neighbors
    return Array.from(distanceMap.entries())
      .sort((a, b) => a[1] - b[1])
      .slice(0, maxNeighbors)
      .map((entry) => entry[0]);
  }

  // Rest of the methods remain largely the same, with added safety checks
  private applyErosion(vertices: Float32Array, vertexLengths: Float32Array): void {
    if (!this.config.erosion) return;

    const { iterations, erosionRate, depositionRate, smoothingFactor } = this.config.erosion;
    const noise = new SimplexNoise(pseudoRandom);

    for (let iter = 0; iter < iterations; iter++) {
      const newVertexLengths = new Float32Array(vertexLengths);

      for (let i = 0; i < vertices.length; i += 3) {
        const normal = new THREE.Vector3(vertices[i], vertices[i + 1], vertices[i + 2]).normalize();
        const currentHeight = vertexLengths[i / 3];

        const slope = this.calculateLocalSlope(vertices, vertexLengths, i);
        const noiseInfluence = noise.noise3d(normal.x * 2, normal.y * 2, normal.z * 2) * 0.1;

        const erosionAmount = Math.max(0, slope * erosionRate * (1 + noiseInfluence));
        const depositionAmount = Math.max(0, slope * depositionRate * (1 - noiseInfluence));

        newVertexLengths[i / 3] = Math.max(
          0.5 * this.PLANET_RADIUS, // Prevent terrain from becoming too flat
          Math.min(currentHeight - erosionAmount, currentHeight + depositionAmount)
        );
      }

      if (smoothingFactor > 0) {
        this.smoothTerrain(newVertexLengths, smoothingFactor);
      }

      vertexLengths.set(newVertexLengths);
    }

    // Update vertices based on modified lengths
    for (let i = 0; i < vertices.length; i += 3) {
      const normal = new THREE.Vector3(vertices[i], vertices[i + 1], vertices[i + 2]).normalize();
      const length = vertexLengths[i / 3];

      vertices[i] = normal.x * length;
      vertices[i + 1] = normal.y * length;
      vertices[i + 2] = normal.z * length;
    }
  }

  // Add more robust error checking and prevent extreme calculations
  generateTerrain(): THREE.BufferGeometry {
    const geometry = new THREE.IcosahedronGeometry(this.PLANET_RADIUS, this.config.resolution);
    const vertices = geometry.attributes.position.array as Float32Array;

    const noise = new SimplexNoise(pseudoRandom);
    const colors: number[] = [];

    const RIDGE_PARAMS = this.config.ridgeNoise;
    const NOISE_LAYERS = this.config.noiseLayers;

    const normal = new THREE.Vector3();
    const vertex = new THREE.Vector3();

    let minHeight = this.PLANET_RADIUS,
      maxHeight = this.PLANET_RADIUS;
    const vertexLengths = new Float32Array(vertices.length / 3);

    // Precompute noise values to reduce redundant calculations
    const precomputedRidgeNoise = new Float32Array(vertices.length / 3);
    const precomputedNoiseLayer = NOISE_LAYERS.map(() => new Float32Array(vertices.length / 3));

    // First pass: Precompute noise values
    for (let i = 0; i < vertices.length; i += 3) {
      normal.set(vertices[i], vertices[i + 1], vertices[i + 2]).normalize();

      // Ridge noise precomputation
      precomputedRidgeNoise[i / 3] = Math.abs(noise.noise3d(normal.x * RIDGE_PARAMS.scale, normal.y * RIDGE_PARAMS.scale, normal.z * RIDGE_PARAMS.scale));

      // Layer noise precomputation
      NOISE_LAYERS.forEach((layer, layerIndex) => {
        precomputedNoiseLayer[layerIndex][i / 3] = noise.noise3d(normal.x * layer.scale, normal.y * layer.scale, normal.z * layer.scale);
      });
    }

    // Second pass: Terrain generation
    for (let i = 0; i < vertices.length; i += 3) {
      normal.set(vertices[i], vertices[i + 1], vertices[i + 2]).normalize();

      const ridgeNoise = Math.max(0, Math.min(1, precomputedRidgeNoise[i / 3]));
      const ridge = Math.pow(ridgeNoise, RIDGE_PARAMS.sharpness) * RIDGE_PARAMS.amplitude;

      let totalDisplacement = 1.0 + ridge;
      for (let j = 0; j < NOISE_LAYERS.length; j++) {
        const layer = NOISE_LAYERS[j];
        const layerNoise = Math.max(-1, Math.min(1, precomputedNoiseLayer[j][i / 3]));
        totalDisplacement += layerNoise * layer.amplitude;
      }

      // Strict displacement clamping
      totalDisplacement = Math.max(0.5, Math.min(2.0, totalDisplacement));

      const scaledRadius = this.PLANET_RADIUS * totalDisplacement;

      vertex.x = normal.x * scaledRadius;
      vertex.y = normal.y * scaledRadius;
      vertex.z = normal.z * scaledRadius;

      vertices[i] = vertex.x;
      vertices[i + 1] = vertex.y;
      vertices[i + 2] = vertex.z;

      const length = vertex.length();
      vertexLengths[i / 3] = isFinite(length) ? length : this.PLANET_RADIUS;

      minHeight = Math.min(minHeight, vertexLengths[i / 3]);
      maxHeight = Math.max(maxHeight, vertexLengths[i / 3]);
    }

    const waterLevel = this.PLANET_RADIUS * this.config.waterLevel;
    const colorStops = this.config.colors;

    // Color generation
    for (let i = 0; i < vertices.length; i += 3) {
      const height = vertexLengths[i / 3];
      let color;

      if (height <= waterLevel) {
        color = colorStops[0].color;
      } else {
        const normalizedHeight = Math.max(0, Math.min(1, (height - waterLevel) / (maxHeight - waterLevel)));

        let lowerStop = colorStops[0];
        let upperStop = colorStops[colorStops.length - 1];

        for (let j = 0; j < colorStops.length - 1; j++) {
          if (normalizedHeight >= colorStops[j].height && normalizedHeight < colorStops[j + 1].height) {
            lowerStop = colorStops[j];
            upperStop = colorStops[j + 1];
            break;
          }
        }

        const t = (normalizedHeight - lowerStop.height) / (upperStop.height - lowerStop.height);
        color = this.lerpColor(lowerStop.color, upperStop.color, t);
      }

      colors.push(color.r, color.g, color.b);
    }

    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    return geometry;
  }

  private lerpColor(colorA: THREE.Color, colorB: THREE.Color, t: number): THREE.Color {
    const result = new THREE.Color();
    result.r = colorA.r + (colorB.r - colorA.r) * t;
    result.g = colorA.g + (colorB.g - colorA.g) * t;
    result.b = colorA.b + (colorB.b - colorA.b) * t;
    return result;
  }

  // Method to update configuration
  updateConfig(newConfig: Partial<LandscapeConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  private calculateLocalSlope(vertices: Float32Array, vertexLengths: Float32Array, index: number): number {
    // Use a more efficient slope calculation
    const neighbors = this.findAdjacentVertices(vertices, index);
    const currentHeight = vertexLengths[index / 3];

    let totalHeightDiff = 0;
    let validNeighbors = 0;

    for (const neighborIdx of neighbors) {
      const neighborHeight = vertexLengths[neighborIdx / 3];
      totalHeightDiff += Math.abs(currentHeight - neighborHeight);
      validNeighbors++;
    }

    return validNeighbors > 0 ? totalHeightDiff / validNeighbors / this.PLANET_RADIUS : 0;
  }

  private smoothTerrain(vertexLengths: Float32Array, smoothingFactor: number): void {
    const smoothedLengths = [...vertexLengths];

    for (let i = 0; i < vertexLengths.length; i++) {
      const neighbors = this.findAdjacentVertices(new Float32Array(vertexLengths.buffer), i * 3);
      const neighborHeights = neighbors.map((idx) => vertexLengths[idx / 3]);
      const avgNeighborHeight = neighborHeights.reduce((a, b) => a + b, 0) / neighbors.length;

      // Interpolate between current height and average neighbor height
      smoothedLengths[i] = vertexLengths[i] * (1 - smoothingFactor) + avgNeighborHeight * smoothingFactor;
    }

    vertexLengths.set(smoothedLengths);
  }

  // Preallocate and reuse vectors to reduce memory allocation
  private readonly _normal = new THREE.Vector3();
  private readonly _vertex = new THREE.Vector3();
  private readonly _neighborCache: Map<number, number[]> = new Map();

  // Modify findAdjacentVertices to use cached results
  private findAdjacentVertices(vertices: Float32Array, index: number, maxNeighbors: number = 6): number[] {
    const cacheKey = index;
    if (this._neighborCache.has(cacheKey)) {
      return this._neighborCache.get(cacheKey)!;
    }

    const adjacentIndices: number[] = [];
    const vertex = this._vertex.set(vertices[index], vertices[index + 1], vertices[index + 2]);

    for (let i = 0; i < vertices.length; i += 3) {
      if (i === index) continue;

      const otherVertex = this._normal.set(vertices[i], vertices[i + 1], vertices[i + 2]);
      const distance = vertex.distanceTo(otherVertex);

      if (distance < this.PLANET_RADIUS * 0.2) {
        adjacentIndices.push(i);
      }

      if (adjacentIndices.length >= maxNeighbors) break;
    }

    this._neighborCache.set(cacheKey, adjacentIndices);
    return adjacentIndices;
  }
}
