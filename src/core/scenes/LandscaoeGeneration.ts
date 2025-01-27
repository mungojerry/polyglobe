import * as THREE from "three";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise";
import { pseudoRandom } from "../utils/PseudoRandom";

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

  mountainRanges: {
    count: number;
    height: number;
    complexity: number;
  };
}

export class LandscapeGenerator {
  private config: LandscapeConfig;
  private readonly PLANET_RADIUS: number;
  private vertexNeighbors: Map<number, number[]>;

  constructor(planetRadius: number, config?: Partial<LandscapeConfig>) {
    if (planetRadius <= 0) {
      throw new Error("Planet radius must be positive");
    }
    this.PLANET_RADIUS = planetRadius;
    this.config = this.validateConfig(this.mergeWithDefaults(config));
    this.vertexNeighbors = new Map();
  }

  private validateConfig(config: LandscapeConfig): LandscapeConfig {
    if (config.resolution < 1) {
      throw new Error("Resolution must be at least 1");
    }
    if (config.ridgeNoise.scale <= 0 || config.ridgeNoise.amplitude < 0) {
      throw new Error("Invalid ridge noise parameters");
    }
    if (config.noiseLayers.some((layer) => layer.scale <= 0 || layer.amplitude < 0)) {
      throw new Error("Invalid noise layer parameters");
    }
    return config;
  }

  private buildVertexNeighborMap(geometry: THREE.BufferGeometry): void {
    // Create index if not exists
    if (!geometry.index) {
      const vertices = geometry.attributes.position;
      const indices = [];
      for (let i = 0; i < vertices.count; i += 3) {
        indices.push(i, i + 1, i + 2);
      }
      geometry.setIndex(indices);
    }

    const indices = geometry.index!.array;
    this.vertexNeighbors = new Map();

    // Build neighbor map
    for (let i = 0; i < indices.length; i += 3) {
      const v1 = indices[i];
      const v2 = indices[i + 1];
      const v3 = indices[i + 2];

      if (!this.vertexNeighbors.has(v1)) this.vertexNeighbors.set(v1, []);
      if (!this.vertexNeighbors.has(v2)) this.vertexNeighbors.set(v2, []);
      if (!this.vertexNeighbors.has(v3)) this.vertexNeighbors.set(v3, []);

      this.vertexNeighbors.get(v1)!.push(v2, v3);
      this.vertexNeighbors.get(v2)!.push(v1, v3);
      this.vertexNeighbors.get(v3)!.push(v1, v2);
    }
  }

  private findHighElevationVertex(vertexLengths: Float32Array, minElevation: number): number {
    const candidates = [];
    for (let i = 0; i < vertexLengths.length; i++) {
      if (vertexLengths[i] >= this.PLANET_RADIUS * minElevation) {
        candidates.push(i);
      }
    }
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  private findNeighborVertex(currentIndex: number): number {
    const neighbors = Array.from(this.vertexNeighbors.get(currentIndex) || []);
    return neighbors[Math.floor(Math.random() * neighbors.length)] || currentIndex;
  }

  private mergeWithDefaults(partialConfig?: Partial<LandscapeConfig>): LandscapeConfig {
    const defaultConfig: LandscapeConfig = {
      resolution: 50,
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
        { height: 0.0, color: new THREE.Color(0x000066) }, // Deep water
        { height: 0.05, color: new THREE.Color(0x0066bb) }, // Shallow water
        { height: 0.1, color: new THREE.Color(0xf0e68c) }, // Beach
        { height: 0.2, color: new THREE.Color(0x339933) }, // Lowlands
        { height: 0.6, color: new THREE.Color(0x663300) }, // Hills
        { height: 0.8, color: new THREE.Color(0x666666) }, // Mountains
        { height: 1.0, color: new THREE.Color(0xffffff) }, // Snow
      ],

      mountainRanges: {
        count: 2,
        height: 0.2,
        complexity: 8,
      },
    };

    return { ...defaultConfig, ...partialConfig };
  }

  generateTerrain(): THREE.BufferGeometry {
    const geometry = new THREE.IcosahedronGeometry(this.PLANET_RADIUS, this.config.resolution);

    // Ensure indices exist
    this.buildVertexNeighborMap(geometry);

    const vertices = geometry.attributes.position.array as Float32Array;
    const vertexLengths = new Float32Array(vertices.length / 3);

    const noise = new SimplexNoise(pseudoRandom);
    const colors: number[] = [];

    const RIDGE_PARAMS = this.config.ridgeNoise;
    const NOISE_LAYERS = this.config.noiseLayers;

    const normal = new THREE.Vector3();
    const vertex = new THREE.Vector3();

    let minHeight = this.PLANET_RADIUS,
      maxHeight = this.PLANET_RADIUS;

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
    this.generateMountainRanges(vertices, vertexLengths);

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

  private generateMountainRanges(vertices: Float32Array, vertexLengths: Float32Array): void {
    const noise = new SimplexNoise(pseudoRandom);
    const { count, height, complexity } = this.config.mountainRanges;

    for (let rangeIndex = 0; rangeIndex < count; rangeIndex++) {
      // Select mountain range seed point
      let currentVertexIndex = this.findHighElevationVertex(vertexLengths, 1.2);

      for (let step = 0; step < complexity; step++) {
        const normal = new THREE.Vector3(
          vertices[currentVertexIndex * 3],
          vertices[currentVertexIndex * 3 + 1],
          vertices[currentVertexIndex * 3 + 2]
        ).normalize();

        // Amplify height with mountain-specific noise
        const mountainNoise = noise.noise3d(normal.x * 3, normal.y * 3, normal.z * 3);

        vertexLengths[currentVertexIndex] += height * Math.abs(mountainNoise) * (1 + noise.noise3d(normal.x, normal.y, normal.z));

        // Spread mountain range to nearby vertices
        currentVertexIndex = this.findNeighborVertex(currentVertexIndex);
      }
    }
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
}
