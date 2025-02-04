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
  craters?: {
    count: number;
    minRadius: number;
    maxRadius: number;
    depth: number;
    rimHeight: number;
  };
}

export class LandscapeGenerator {
  private config: LandscapeConfig;
  private readonly PLANET_RADIUS: number;
  private tempColor = new THREE.Color();
  private noise: SimplexNoise;

  constructor(planetRadius: number, config?: Partial<LandscapeConfig>) {
    if (planetRadius <= 0) {
      throw new Error("Planet radius must be positive");
    }
    this.PLANET_RADIUS = planetRadius;
    this.config = this.validateConfig(this.mergeWithDefaults(config));
    this.noise = new SimplexNoise(pseudoRandom);
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

  private mergeWithDefaults(partialConfig?: Partial<LandscapeConfig>): LandscapeConfig {
    const defaultConfig: LandscapeConfig = {
      resolution: 50,
      ridgeNoise: {
        scale: 2.0, // Increased from 1.3 to create larger ridge features
        amplitude: 0.25, // Increased from 0.15 for more dramatic height variation
        sharpness: 1.8, // Increased from 1.4 for more defined ridges
      },
      noiseLayers: [
        { scale: 0.5, amplitude: 0.1 },
        { scale: 1.0, amplitude: 0.08 },
        { scale: 2.0, amplitude: 0.04 },
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
      craters: {
        count: 8,
        minRadius: 0.05,
        maxRadius: 0.15,
        depth: 0.0015, // Adjusted for better proportions
        rimHeight: 0.07, // Increased for more prominent rims
      },
    };

    return { ...defaultConfig, ...partialConfig };
  }

  private calculateCraterEffect(vertexPos: THREE.Vector3, craterCenter: THREE.Vector3, radius: number, depth: number, rimHeight: number): number {
    const distance = vertexPos.distanceTo(craterCenter);
    const normalizedDist = distance / radius;

    if (normalizedDist > 2.0) return 0; // Extend effect range for ejecta

    // Complex crater shape with central peak for larger craters
    const centralPeak = radius > this.PLANET_RADIUS * 0.1 ? 0.15 * Math.exp(-Math.pow(normalizedDist * 4, 2)) : 0;

    // Main crater bowl with steeper walls
    const craterDepth = -depth * Math.pow(Math.max(0, 1 - Math.pow(normalizedDist, 1.5)), 2);

    // Enhanced rim formation with debris accumulation
    const rimEffect =
      rimHeight *
      (Math.exp(-Math.pow((normalizedDist - 1.0) * 4, 2)) + // Main rim
        0.3 * Math.exp(-Math.pow((normalizedDist - 1.2) * 3, 2))); // Secondary rim

    // Ejecta blanket that thins with distance
    const ejecta = normalizedDist > 1.0 ? 0.02 * Math.pow(2.0 - normalizedDist, 3) * rimHeight : 0;

    // Add subtle noise to break up symmetry
    const noise = this.noise.noise3d(vertexPos.x * 10, vertexPos.y * 10, vertexPos.z * 10) * 0.02 * rimHeight;

    return craterDepth + rimEffect + ejecta + centralPeak + noise;
  }

  generateTerrain(): THREE.BufferGeometry {
    const geometry = new THREE.IcosahedronGeometry(this.PLANET_RADIUS, this.config.resolution);

    const vertices = geometry.attributes.position.array as Float32Array;
    const vertexLengths = new Float32Array(vertices.length / 3);

    const RIDGE_PARAMS = this.config.ridgeNoise;
    const NOISE_LAYERS = this.config.noiseLayers;

    const normal = new THREE.Vector3();
    const vertex = new THREE.Vector3();

    let minHeight = this.PLANET_RADIUS,
      maxHeight = this.PLANET_RADIUS;

    const colors = new Float32Array(vertices.length);

    // Precompute noise values to reduce redundant calculations
    const precomputedRidgeNoise = new Float32Array(vertices.length / 3);
    const precomputedNoiseLayer = NOISE_LAYERS.map(() => new Float32Array(vertices.length / 3));

    // First pass: Precompute noise values
    for (let i = 0; i < vertices.length; i += 3) {
      normal.set(vertices[i], vertices[i + 1], vertices[i + 2]).normalize();

      // Ridge noise precomputation
      precomputedRidgeNoise[i / 3] = Math.abs(this.noise.noise3d(normal.x * RIDGE_PARAMS.scale, normal.y * RIDGE_PARAMS.scale, normal.z * RIDGE_PARAMS.scale));

      // Layer noise precomputation
      NOISE_LAYERS.forEach((layer, layerIndex) => {
        precomputedNoiseLayer[layerIndex][i / 3] = this.noise.noise3d(normal.x * layer.scale, normal.y * layer.scale, normal.z * layer.scale);
      });
    }

    // Generate crater positions if configured
    const craters: Array<{ center: THREE.Vector3; radius: number }> = [];
    if (this.config.craters) {
      const { count, minRadius, maxRadius } = this.config.craters;

      for (let i = 0; i < count; i++) {
        const phi = pseudoRandom.random() * Math.PI * 2;
        const cosTheta = 2 * pseudoRandom.random() - 1;
        const theta = Math.acos(cosTheta);

        const center = new THREE.Vector3(Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta))
          .normalize()
          .multiplyScalar(this.PLANET_RADIUS);

        const radius = (minRadius + pseudoRandom.random() * (maxRadius - minRadius)) * this.PLANET_RADIUS;
        craters.push({ center, radius });
      }
    }

    // Second pass: Terrain generation
    for (let i = 0; i < vertices.length; i += 3) {
      normal.set(vertices[i], vertices[i + 1], vertices[i + 2]).normalize();
      const iDiv3 = i / 3;
      const ridgeNoise = Math.max(0, Math.min(1, precomputedRidgeNoise[iDiv3]));
      const ridge = Math.pow(ridgeNoise, RIDGE_PARAMS.sharpness) * RIDGE_PARAMS.amplitude;

      let totalDisplacement = 1.0 + ridge;
      for (let j = 0; j < NOISE_LAYERS.length; j++) {
        const layer = NOISE_LAYERS[j];
        const layerNoise = Math.max(-1, Math.min(1, precomputedNoiseLayer[j][iDiv3]));
        totalDisplacement += layerNoise * layer.amplitude;
      }

      // Apply crater modifications
      if (this.config.craters) {
        const vertexPos = new THREE.Vector3(vertices[i], vertices[i + 1], vertices[i + 2]);
        for (const crater of craters) {
          const craterEffect = this.calculateCraterEffect(vertexPos, crater.center, crater.radius, this.config.craters.depth, this.config.craters.rimHeight);
          totalDisplacement += craterEffect;
        }
      }

      // Strict displacement clamping
      totalDisplacement = Math.max(0.9, Math.min(3.0, totalDisplacement));

      const scaledRadius = this.PLANET_RADIUS * totalDisplacement;

      vertex.x = normal.x * scaledRadius;
      vertex.y = normal.y * scaledRadius;
      vertex.z = normal.z * scaledRadius;

      vertices[i] = vertex.x;
      vertices[i + 1] = vertex.y;
      vertices[i + 2] = vertex.z;

      const length = vertex.length();

      vertexLengths[iDiv3] = isFinite(length) ? length : this.PLANET_RADIUS;

      minHeight = Math.min(minHeight, vertexLengths[iDiv3]);
      maxHeight = Math.max(maxHeight, vertexLengths[iDiv3]);
    }

    this.generateColors(vertices, vertexLengths, colors, maxHeight);

    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    return geometry;
  }

  private generateColors(vertices: Float32Array, vertexLengths: Float32Array, colors: Float32Array, maxHeight: number): void {
    const waterLevel = this.PLANET_RADIUS * this.config.waterLevel;
    const colorStops = this.config.colors;

    for (let i = 0; i < vertices.length; i += 3) {
      const height = vertexLengths[i / 3];
      let color: THREE.Color;

      if (height <= waterLevel) {
        color = colorStops[0].color;
      } else {
        const normalizedHeight = (height - waterLevel) / (maxHeight - waterLevel);
        const stopIndex = colorStops.findIndex(
          (stop, j) => j < colorStops.length - 1 && normalizedHeight >= stop.height && normalizedHeight < colorStops[j + 1].height
        );

        const [lowerStop, upperStop] = [colorStops[Math.max(0, stopIndex)], colorStops[Math.min(colorStops.length - 1, stopIndex + 1)]];
        const t = (normalizedHeight - lowerStop.height) / (upperStop.height - lowerStop.height);
        color = this.lerpColor(lowerStop.color, upperStop.color, t);
      }

      colors[i] = color.r;
      colors[i + 1] = color.g;
      colors[i + 2] = color.b;
    }
  }

  private lerpColor(colorA: THREE.Color, colorB: THREE.Color, t: number): THREE.Color {
    this.tempColor.r = colorA.r + (colorB.r - colorA.r) * t;
    this.tempColor.g = colorA.g + (colorB.g - colorA.g) * t;
    this.tempColor.b = colorA.b + (colorB.b - colorA.b) * t;
    return this.tempColor;
  }

  updateConfig(newConfig: Partial<LandscapeConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }
}
