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
  biomes: Array<{
    height: number;
    temperature: number;
    humidity: number;
    color: THREE.Color;
    roughness: number;
    features: TerrainFeatures[];
  }>;
  geologicalFeatures: {
    volcanoes: {
      count: number;
      maxHeight: number;
      craterDepth: number;
      lavaColor: THREE.Color;
    };
    canyons: {
      count: number;
      depth: number;
      width: number;
      meanderFactor: number;
    };
    iceSheets: {
      coverage: number;
      thickness: number;
      roughness: number;
    };
  };
  mountainRanges: {
    count: number;
    height: number;
    complexity: number;
    snowLineHeight: number;
    erosionFactor: number;
  };
  weathering: {
    enabled: boolean;
    intensity: number;
    cycleCount: number;
  };
}

enum TerrainFeatures {
  CAVES,
  RIVERS,
  FORESTS,
  CRACKS,
  DUNES,
  GLACIERS,
}

export class LandscapeGenerator {
  private config: LandscapeConfig;
  private readonly PLANET_RADIUS: number;
  private vertexNeighbors: Map<number, Set<number>>;
  private tempVector3 = new THREE.Vector3();
  private tempColor = new THREE.Color();
  private weatheringMap: Float32Array;
  private temperatureMap: Float32Array;
  private humidityMap: Float32Array;
  private vertexLengths: Float32Array;
  private noise: SimplexNoise;

  constructor(planetRadius: number, config?: Partial<LandscapeConfig>) {
    if (planetRadius <= 0) throw new Error("Planet radius must be positive");
    this.PLANET_RADIUS = planetRadius;
    this.config = this.validateConfig(this.mergeWithDefaults(config));
    this.vertexNeighbors = new Map();
    this.weatheringMap = new Float32Array(0);
    this.temperatureMap = new Float32Array(0);
    this.humidityMap = new Float32Array(0);
    this.vertexLengths = new Float32Array(0);
    this.noise = new SimplexNoise(pseudoRandom);
  }

  private validateConfig(config: LandscapeConfig): LandscapeConfig {
    if (config.resolution < 1) throw new Error("Resolution must be at least 1");
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
        scale: 1.3,
        amplitude: 0.15,
        sharpness: 1.4,
      },
      noiseLayers: [
        { scale: 0.5, amplitude: 0.12 },
        { scale: 1.0, amplitude: 0.09 },
        { scale: 2.0, amplitude: 0.05 },
        { scale: 4.0, amplitude: 0.025 },
        { scale: 8.0, amplitude: 0.012 },
        { scale: 16.0, amplitude: 0.006 },
      ],
      waterLevel: 1.03,
      biomes: [
        {
          height: 0.0,
          temperature: 0.2,
          humidity: 0.8,
          color: new THREE.Color(0x000066),
          roughness: 0.1,
          features: [TerrainFeatures.GLACIERS],
        },
        {
          height: 0.2,
          temperature: 0.6,
          humidity: 0.7,
          color: new THREE.Color(0x228b22),
          roughness: 0.4,
          features: [TerrainFeatures.FORESTS, TerrainFeatures.RIVERS],
        },
        {
          height: 0.5,
          temperature: 0.8,
          humidity: 0.3,
          color: new THREE.Color(0xdeb887),
          roughness: 0.6,
          features: [TerrainFeatures.CAVES, TerrainFeatures.CRACKS],
        },
        {
          height: 0.8,
          temperature: 0.4,
          humidity: 0.2,
          color: new THREE.Color(0x808080),
          roughness: 0.8,
          features: [TerrainFeatures.GLACIERS],
        },
      ],
      geologicalFeatures: {
        volcanoes: {
          count: 3,
          maxHeight: 0.3,
          craterDepth: 0.1,
          lavaColor: new THREE.Color(0xff4500),
        },
        canyons: {
          count: 2,
          depth: 0.2,
          width: 0.1,
          meanderFactor: 0.5,
        },
        iceSheets: {
          coverage: 0.2,
          thickness: 0.05,
          roughness: 0.3,
        },
      },
      mountainRanges: {
        count: 3,
        height: 0.25,
        complexity: 10,
        snowLineHeight: 0.8,
        erosionFactor: 0.15,
      },
      weathering: {
        enabled: true,
        intensity: 0.5,
        cycleCount: 3,
      },
    };

    return { ...defaultConfig, ...partialConfig };
  }

  private buildVertexNeighborMap(geometry: THREE.BufferGeometry): void {
    if (!geometry.index) {
      const indices = new Uint32Array(geometry.attributes.position.count);
      for (let i = 0; i < indices.length; i++) indices[i] = i;
      geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    }

    const indices = geometry.index!.array;
    this.vertexNeighbors.clear();

    for (let i = 0; i < geometry.attributes.position.count; i++) {
      this.vertexNeighbors.set(i, new Set());
    }

    for (let i = 0; i < indices.length; i += 3) {
      const [v1, v2, v3] = [indices[i], indices[i + 1], indices[i + 2]];
      this.vertexNeighbors.get(v1)!.add(v2).add(v3);
      this.vertexNeighbors.get(v2)!.add(v1).add(v3);
      this.vertexNeighbors.get(v3)!.add(v1).add(v2);
    }
  }

  generateTerrain(): THREE.BufferGeometry {
    const geometry = new THREE.IcosahedronGeometry(this.PLANET_RADIUS, this.config.resolution);
    this.buildVertexNeighborMap(geometry);

    const vertices = geometry.attributes.position.array as Float32Array;
    const vertexCount = vertices.length / 3;

    this.weatheringMap = new Float32Array(vertexCount);
    this.temperatureMap = new Float32Array(vertexCount);
    this.humidityMap = new Float32Array(vertexCount);
    this.vertexLengths = new Float32Array(vertexCount);

    this.generateBaseTerrain(vertices);
    this.generateMountainRanges(vertices);
    this.applyGeologicalFeatures(vertices);
    this.simulateWeathering(vertices);
    this.generateBiomes(vertices);
    this.applyColors(geometry);

    geometry.computeVertexNormals();
    return geometry;
  }

  private generateBaseTerrain(vertices: Float32Array): void {
    const { ridgeNoise, noiseLayers } = this.config;

    for (let i = 0; i < vertices.length; i += 3) {
      const normal = this.tempVector3.set(vertices[i], vertices[i + 1], vertices[i + 2]).normalize();

      // Ridge noise
      const ridgeValue = Math.abs(this.noise.noise3d(normal.x * ridgeNoise.scale, normal.y * ridgeNoise.scale, normal.z * ridgeNoise.scale));
      const ridge = Math.pow(ridgeValue, ridgeNoise.sharpness) * ridgeNoise.amplitude;

      // Layered noise
      let totalDisplacement = 1.0 + ridge;
      for (const layer of noiseLayers) {
        const layerNoise = this.noise.noise3d(normal.x * layer.scale, normal.y * layer.scale, normal.z * layer.scale);
        totalDisplacement += layerNoise * layer.amplitude;
      }

      // Apply displacement
      totalDisplacement = Math.max(0.5, Math.min(2.0, totalDisplacement));
      const scaledRadius = this.PLANET_RADIUS * totalDisplacement;

      normal.multiplyScalar(scaledRadius);
      vertices[i] = normal.x;
      vertices[i + 1] = normal.y;
      vertices[i + 2] = normal.z;

      this.vertexLengths[i / 3] = scaledRadius;
    }
  }

  private generateMountainRanges(vertices: Float32Array): void {
    const { count, height, complexity, erosionFactor } = this.config.mountainRanges;

    for (let range = 0; range < count; range++) {
      let currentVertex = this.findHighPoint(vertices);
      const rangeVertices = new Set<number>([currentVertex]);

      for (let step = 0; step < complexity; step++) {
        const neighbors = Array.from(this.vertexNeighbors.get(currentVertex) || []).filter((v) => !rangeVertices.has(v));

        if (neighbors.length === 0) break;

        // Select next vertex based on height and direction
        currentVertex = this.selectNextMountainVertex(neighbors, vertices);
        rangeVertices.add(currentVertex);

        // Apply mountain displacement
        this.applyMountainDisplacement(vertices, currentVertex, height, erosionFactor);
      }
    }
  }

  private findHighPoint(vertices: Float32Array): number {
    let maxHeight = -Infinity;
    let highestVertex = 0;

    for (let i = 0; i < vertices.length; i += 3) {
      const height = this.vertexLengths[i / 3];
      if (height > maxHeight) {
        maxHeight = height;
        highestVertex = i / 3;
      }
    }

    return highestVertex;
  }

  private selectNextMountainVertex(neighbors: number[], vertices: Float32Array): number {
    let bestScore = -Infinity;
    let bestVertex = neighbors[0];

    for (const neighbor of neighbors) {
      const score = this.vertexLengths[neighbor] + this.noise.noise3d(vertices[neighbor * 3], vertices[neighbor * 3 + 1], vertices[neighbor * 3 + 2]) * 0.2;

      if (score > bestScore) {
        bestScore = score;
        bestVertex = neighbor;
      }
    }

    return bestVertex;
  }

  private applyMountainDisplacement(vertices: Float32Array, vertexIndex: number, height: number, erosionFactor: number): void {
    const vertex = this.tempVector3.set(vertices[vertexIndex * 3], vertices[vertexIndex * 3 + 1], vertices[vertexIndex * 3 + 2]);

    const normal = vertex.clone().normalize();
    const noise = this.noise.noise3d(normal.x * 2, normal.y * 2, normal.z * 2);
    const displacement = height * (1 + noise * 0.5) * (1 - erosionFactor * Math.random());

    vertex.add(normal.multiplyScalar(displacement * this.PLANET_RADIUS));

    vertices[vertexIndex * 3] = vertex.x;
    vertices[vertexIndex * 3 + 1] = vertex.y;
    vertices[vertexIndex * 3 + 2] = vertex.z;

    this.vertexLengths[vertexIndex] = vertex.length();
  }

  private applyGeologicalFeatures(vertices: Float32Array): void {
    this.generateVolcanoes(vertices);
    this.generateCanyons(vertices);
    this.generateIceSheets(vertices);
  }

  private generateVolcanoes(vertices: Float32Array): void {
    const { volcanoes } = this.config.geologicalFeatures;

    for (let i = 0; i < volcanoes.count; i++) {
      const center = this.findVolcanoLocation(vertices);
      const radius = this.PLANET_RADIUS * 0.2;

      for (let j = 0; j < vertices.length; j += 3) {
        const vertex = this.tempVector3.set(vertices[j], vertices[j + 1], vertices[j + 2]);
        const distance = vertex.distanceTo(center);

        if (distance < radius) {
          const height = Math.cos((distance / radius) * Math.PI) * volcanoes.maxHeight;
          const craterFactor = distance < radius * 0.2 ? Math.cos((distance / (radius * 0.2)) * Math.PI) * volcanoes.craterDepth : 0;

          const normal = vertex.normalize();
          vertex.copy(normal).multiplyScalar(this.PLANET_RADIUS + height - craterFactor);

          vertices[j] = vertex.x;
          vertices[j + 1] = vertex.y;
          vertices[j + 2] = vertex.z;
          this.vertexLengths[j / 3] = vertex.length();
        }
      }
    }
  }


  private generateBiomes(vertices: Float32Array): void {
    const noise = new SimplexNoise(pseudoRandom);

    for (let i = 0; i < vertices.length; i += 3) {
      const normal = this.tempVector3.set(vertices[i], vertices[i + 1], vertices[i + 2]).normalize();
      
      // Generate temperature based on latitude and noise
      const latitude = Math.asin(normal.y) / (Math.PI / 2);
      this.temperatureMap[i / 3] = (1 - Math.abs(latitude)) * 0.8 + 
        0.2 * noise.noise3d(normal.x * 2, normal.y * 2, normal.z * 2);
      
      // Generate humidity based on temperature and noise
      this.humidityMap[i / 3] = Math.max(0, Math.min(1,
        0.5 + 0.5 * noise.noise3d(normal.x * 3, normal.y * 3, normal.z * 3)
      ));

      // Apply biome-specific features
      this.applyBiomeFeatures(vertices, i, this.temperatureMap[i / 3], this.humidityMap[i / 3]);
    }
  }

  private applyBiomeFeatures(vertices: Float32Array, index: number, temperature: number, humidity: number): void {
    const biome = this.findBiome(temperature, humidity);
    const normal = this.tempVector3.set(vertices[index], vertices[index + 1], vertices[index + 2]).normalize();
    
    // Apply biome-specific displacement and features
    for (const feature of biome.features) {
      switch (feature) {
        case TerrainFeatures.CAVES:
          this.generateCaveFeature(vertices, index, normal, biome.roughness);
          break;
        case TerrainFeatures.DUNES:
          this.generateDuneFeature(vertices, index, normal, temperature);
          break;
        // ... other feature generators ...
      }
    }
  }


  private findVolcanoLocation(vertices: Float32Array): THREE.Vector3 {
    const highPoint = this.findHighPoint(vertices);
    return new THREE.Vector3(vertices[highPoint * 3], vertices[highPoint * 3 + 1], vertices[highPoint * 3 + 2]);
  }
  private generateCanyons(vertices: Float32Array): void {
    const { canyons } = this.config.geologicalFeatures;

    for (let canyonIndex = 0; canyonIndex < canyons.count; canyonIndex++) {
      // Find a suitable starting point for the canyon
      let currentVertex = this.findCanyonStartPoint(vertices);
      const canyonPath = new Set<number>([currentVertex]);

      // Generate the main canyon path
      const pathLength = Math.floor((vertices.length / 3) * 0.1); // Canyon length is 10% of total vertices
      for (let step = 0; step < pathLength; step++) {
        const neighbors = Array.from(this.vertexNeighbors.get(currentVertex) || []).filter((v) => !canyonPath.has(v));

        if (neighbors.length === 0) break;

        // Apply meandering based on noise
        const normal = this.tempVector3.set(vertices[currentVertex * 3], vertices[currentVertex * 3 + 1], vertices[currentVertex * 3 + 2]).normalize();

        const meander = this.noise.noise3d(normal.x * canyons.meanderFactor, normal.y * canyons.meanderFactor, normal.z * canyons.meanderFactor);

        // Select next point based on downhill direction and meandering
        currentVertex = this.selectNextCanyonPoint(neighbors, vertices, meander);
        canyonPath.add(currentVertex);
      }

      // Carve the canyon along the path
      for (const pathVertex of canyonPath) {
        // Create wider canyon area around path
        const nearbyVertices = this.findVerticesInRadius(vertices, pathVertex, canyons.width * this.PLANET_RADIUS);

        for (const nearbyVertex of nearbyVertices) {
          const vertex = this.tempVector3.set(vertices[nearbyVertex * 3], vertices[nearbyVertex * 3 + 1], vertices[nearbyVertex * 3 + 2]);

          const normal = vertex.clone().normalize();
          const distance = vertex.distanceTo(new THREE.Vector3(vertices[pathVertex * 3], vertices[pathVertex * 3 + 1], vertices[pathVertex * 3 + 2]));

          // Calculate depth based on distance from canyon center
          const depthFactor = 1 - distance / (canyons.width * this.PLANET_RADIUS);
          const depth = canyons.depth * this.PLANET_RADIUS * depthFactor * (0.8 + 0.4 * this.noise.noise3d(normal.x * 2, normal.y * 2, normal.z * 2));

          // Erode the vertex
          vertex.sub(normal.multiplyScalar(Math.max(0, depth)));

          vertices[nearbyVertex * 3] = vertex.x;
          vertices[nearbyVertex * 3 + 1] = vertex.y;
          vertices[nearbyVertex * 3 + 2] = vertex.z;
          this.vertexLengths[nearbyVertex] = vertex.length();
        }
      }

      // Add erosion details along canyon walls
      this.addCanyonErosionDetails(vertices, canyonPath, canyons.width);
    }
  }

  private findCanyonStartPoint(vertices: Float32Array): number {
    // Find a high point that's not too close to existing features
    let bestVertex = 0;
    let bestHeight = -Infinity;

    for (let i = 0; i < vertices.length; i += 3) {
      const height = this.vertexLengths[i / 3];
      if (height > bestHeight && this.isValidCanyonStart(vertices, i / 3)) {
        bestHeight = height;
        bestVertex = i / 3;
      }
    }

    return bestVertex;
  }

  private isValidCanyonStart(vertices: Float32Array, vertexIndex: number): boolean {
    // Check if point is suitable for starting a canyon
    const vertex = new THREE.Vector3(vertices[vertexIndex * 3], vertices[vertexIndex * 3 + 1], vertices[vertexIndex * 3 + 2]);

    // Avoid water
    if (vertex.length() < this.PLANET_RADIUS * this.config.waterLevel) {
      return false;
    }

    // Check slope
    const normal = vertex.clone().normalize();
    const slope = 1 - Math.abs(normal.dot(new THREE.Vector3(0, 1, 0)));
    return slope > 0.3; // Require minimum slope for water erosion
  }

  private selectNextCanyonPoint(neighbors: number[], vertices: Float32Array, meanderFactor: number): number {
    let bestVertex = neighbors[0];
    let bestScore = -Infinity;

    for (const neighbor of neighbors) {
      const height = this.vertexLengths[neighbor];
      const normal = this.tempVector3.set(vertices[neighbor * 3], vertices[neighbor * 3 + 1], vertices[neighbor * 3 + 2]).normalize();

      // Score based on heading downhill with some meandering
      const score = -height + meanderFactor * this.noise.noise3d(normal.x * 2, normal.y * 2, normal.z * 2);

      if (score > bestScore) {
        bestScore = score;
        bestVertex = neighbor;
      }
    }

    return bestVertex;
  }

  private findVerticesInRadius(vertices: Float32Array, centerVertex: number, radius: number): Set<number> {
    const result = new Set<number>();
    const center = new THREE.Vector3(vertices[centerVertex * 3], vertices[centerVertex * 3 + 1], vertices[centerVertex * 3 + 2]);

    const checkVertex = (vertex: number, visited: Set<number>) => {
      if (visited.has(vertex)) return;
      visited.add(vertex);

      const distance = new THREE.Vector3(vertices[vertex * 3], vertices[vertex * 3 + 1], vertices[vertex * 3 + 2]).distanceTo(center);

      if (distance <= radius) {
        result.add(vertex);
        // Recursively check neighbors
        for (const neighbor of this.vertexNeighbors.get(vertex) || []) {
          checkVertex(neighbor, visited);
        }
      }
    };

    checkVertex(centerVertex, new Set<number>());
    return result;
  }

  private addCanyonErosionDetails(vertices: Float32Array, canyonPath: Set<number>, width: number): void {
    // Add smaller erosion channels and details along canyon walls
    for (const pathVertex of canyonPath) {
      const nearbyVertices = this.findVerticesInRadius(vertices, pathVertex, width * 1.2 * this.PLANET_RADIUS);

      for (const nearbyVertex of nearbyVertices) {
        const vertex = this.tempVector3.set(vertices[nearbyVertex * 3], vertices[nearbyVertex * 3 + 1], vertices[nearbyVertex * 3 + 2]);

        const normal = vertex.clone().normalize();
        const noise = this.noise.noise3d(normal.x * 8, normal.y * 8, normal.z * 8);

        // Add detailed erosion patterns
        if (noise > 0.7) {
          const erosionDepth = 0.02 * this.PLANET_RADIUS * (noise - 0.7);
          vertex.sub(normal.multiplyScalar(erosionDepth));

          vertices[nearbyVertex * 3] = vertex.x;
          vertices[nearbyVertex * 3 + 1] = vertex.y;
          vertices[nearbyVertex * 3 + 2] = vertex.z;
          this.vertexLengths[nearbyVertex] = vertex.length();
        }
      }
    }
  }

  private simulateWeathering(vertices: Float32Array): void {
    if (!this.config.weathering.enabled) return;

    const { intensity, cycleCount } = this.config.weathering;
    const vertexCount = vertices.length / 3;

    // Initialize weathering buffers
    const erosionBuffer = new Float32Array(vertexCount);
    const depositionBuffer = new Float32Array(vertexCount);

    for (let cycle = 0; cycle < cycleCount; cycle++) {
      // Reset buffers for each cycle
      erosionBuffer.fill(0);
      depositionBuffer.fill(0);

      // Calculate erosion and deposition for each vertex
      for (let i = 0; i < vertices.length; i += 3) {
        const vertexIndex = i / 3;
        const vertex = this.tempVector3.set(vertices[i], vertices[i + 1], vertices[i + 2]);

        // Calculate slope and aspect
        const normal = vertex.clone().normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const slope = 1 - Math.abs(normal.dot(up));

        // Get local neighborhood information
        const neighbors = Array.from(this.vertexNeighbors.get(vertexIndex) || []);
        const currentHeight = this.vertexLengths[vertexIndex];

        // Calculate local relief (height difference from neighbors)
        let maxHeightDiff = 0;
        let lowestNeighborIndex = -1;

        for (const neighbor of neighbors) {
          const heightDiff = currentHeight - this.vertexLengths[neighbor];
          if (heightDiff > maxHeightDiff) {
            maxHeightDiff = heightDiff;
            lowestNeighborIndex = neighbor;
          }
        }

        // Calculate erosion factor based on multiple parameters
        const erosionFactor = this.calculateErosionFactor(slope, maxHeightDiff, this.temperatureMap[vertexIndex], this.weatheringMap[vertexIndex]);

        // Apply erosion
        const erosionAmount = erosionFactor * intensity * this.PLANET_RADIUS * 0.001;
        erosionBuffer[vertexIndex] = erosionAmount;

        // Calculate deposition for the lowest neighbor
        if (lowestNeighborIndex >= 0) {
          depositionBuffer[lowestNeighborIndex] += erosionAmount * 0.7; // 70% of eroded material gets deposited
        }
      }

      // Apply erosion and deposition
      this.applyWeatheringChanges(vertices, erosionBuffer, depositionBuffer);

      // Update weathering map for cumulative effects
      this.updateWeatheringMap(erosionBuffer);
    }
  }

  private calculateErosionFactor(slope: number, heightDiff: number, temperature: number, previousWeathering: number): number {
    // Base erosion on slope
    let erosionFactor = slope * 0.5;

    // Increase erosion in areas with high relief
    erosionFactor += (heightDiff / this.PLANET_RADIUS) * 2;

    // Temperature affects weathering rate
    // Higher temperatures generally increase weathering
    erosionFactor *= 0.5 + temperature;

    // Add some noise for natural variation
    const noise = this.noise.noise3d(this.tempVector3.x * 4, this.tempVector3.y * 4, this.tempVector3.z * 4);
    erosionFactor *= 0.8 + 0.4 * noise;

    // Consider previous weathering (areas that have weathered a lot might be more resistant)
    erosionFactor *= Math.max(0.2, 1 - previousWeathering * 2);

    return Math.max(0, Math.min(1, erosionFactor));
  }

  private applyWeatheringChanges(vertices: Float32Array, erosionBuffer: Float32Array, depositionBuffer: Float32Array): void {
    for (let i = 0; i < vertices.length; i += 3) {
      const vertexIndex = i / 3;
      const vertex = this.tempVector3.set(vertices[i], vertices[i + 1], vertices[i + 2]);

      const normal = vertex.clone().normalize();

      // Apply erosion (decrease height)
      const erosion = erosionBuffer[vertexIndex];
      if (erosion > 0) {
        vertex.sub(normal.multiplyScalar(erosion));
      }

      // Apply deposition (increase height)
      const deposition = depositionBuffer[vertexIndex];
      if (deposition > 0) {
        vertex.add(normal.multiplyScalar(deposition));
      }

      // Update vertex position
      vertices[i] = vertex.x;
      vertices[i + 1] = vertex.y;
      vertices[i + 2] = vertex.z;
      this.vertexLengths[vertexIndex] = vertex.length();
    }
  }

  private updateWeatheringMap(erosionBuffer: Float32Array): void {
    for (let i = 0; i < erosionBuffer.length; i++) {
      // Accumulate weathering over time
      this.weatheringMap[i] += erosionBuffer[i] / (this.PLANET_RADIUS * 0.001);
      // Clamp to prevent overflow
      this.weatheringMap[i] = Math.min(1, this.weatheringMap[i]);
    }
  }

  private generateIceSheets(vertices: Float32Array): void {
    const { iceSheets } = this.config.geologicalFeatures;
    const vertexCount = vertices.length / 3;

    // Calculate polar regions based on latitude
    for (let i = 0; i < vertices.length; i += 3) {
      const vertexIndex = i / 3;
      const normal = this.tempVector3.set(vertices[i], vertices[i + 1], vertices[i + 2]).normalize();

      // Calculate latitude (0 at equator, 1 at poles)
      const latitude = Math.abs(Math.asin(normal.y) / (Math.PI / 2));

      // Ice sheets form primarily in polar regions
      if (latitude > 1 - iceSheets.coverage) {
        // Calculate ice thickness based on latitude and noise
        const latitudeFactor = (latitude - (1 - iceSheets.coverage)) / iceSheets.coverage;
        const baseThickness = iceSheets.thickness * this.PLANET_RADIUS * latitudeFactor;

        // Add noise to ice thickness
        const noise = this.noise.noise3d(normal.x * iceSheets.roughness * 4, normal.y * iceSheets.roughness * 4, normal.z * iceSheets.roughness * 4);

        // Modify thickness based on terrain height and slope
        const heightFactor = Math.max(0, 1 - (this.vertexLengths[vertexIndex] - this.PLANET_RADIUS) / (0.1 * this.PLANET_RADIUS));
        const slope = 1 - Math.abs(normal.dot(new THREE.Vector3(0, 1, 0)));
        const slopeFactor = Math.max(0, 1 - slope * 2);

        // Calculate final ice thickness
        const iceThickness = baseThickness * (0.8 + 0.4 * noise) * heightFactor * slopeFactor;

        // Apply ice thickness to vertex
        if (iceThickness > 0) {
          // Add ice layer
          normal.multiplyScalar(iceThickness);
          vertices[i] += normal.x;
          vertices[i + 1] += normal.y;
          vertices[i + 2] += normal.z;

          // Update vertex length
          this.vertexLengths[vertexIndex] = Math.sqrt(vertices[i] * vertices[i] + vertices[i + 1] * vertices[i + 1] + vertices[i + 2] * vertices[i + 2]);

          // Add surface detail to ice
          this.addIceSurfaceDetail(vertices, vertexIndex, iceThickness);
        }
      }
    }

    // Smooth ice sheet edges
    this.smoothIceSheetEdges(vertices);
  }

  private addIceSurfaceDetail(vertices: Float32Array, vertexIndex: number, iceThickness: number): void {
    const normal = this.tempVector3.set(vertices[vertexIndex * 3], vertices[vertexIndex * 3 + 1], vertices[vertexIndex * 3 + 2]).normalize();

    // Add high-frequency noise for small surface features
    const detailNoise = this.noise.noise3d(normal.x * 20, normal.y * 20, normal.z * 20);

    // Add medium-frequency noise for larger surface features
    const mediumNoise = this.noise.noise3d(normal.x * 8, normal.y * 8, normal.z * 8);

    // Calculate surface displacement
    const surfaceDetail = (detailNoise * 0.02 + mediumNoise * 0.04) * iceThickness;

    // Apply surface detail
    normal.multiplyScalar(surfaceDetail);
    vertices[vertexIndex * 3] += normal.x;
    vertices[vertexIndex * 3 + 1] += normal.y;
    vertices[vertexIndex * 3 + 2] += normal.z;

    // Update vertex length
    this.vertexLengths[vertexIndex] = Math.sqrt(
      vertices[vertexIndex * 3] * vertices[vertexIndex * 3] +
        vertices[vertexIndex * 3 + 1] * vertices[vertexIndex * 3 + 1] +
        vertices[vertexIndex * 3 + 2] * vertices[vertexIndex * 3 + 2]
    );
  }

  private smoothIceSheetEdges(vertices: Float32Array): void {
    const tempPositions = vertices.slice();

    // Smooth transitions at ice sheet edges
    for (let i = 0; i < vertices.length; i += 3) {
      const vertexIndex = i / 3;
      const neighbors = Array.from(this.vertexNeighbors.get(vertexIndex) || []);

      if (neighbors.length > 0) {
        let avgHeight = this.vertexLengths[vertexIndex];
        let neighborCount = 1;

        // Calculate average height including neighbors
        for (const neighbor of neighbors) {
          avgHeight += this.vertexLengths[neighbor];
          neighborCount++;
        }
        avgHeight /= neighborCount;

        // Smooth height differences
        const currentHeight = this.vertexLengths[vertexIndex];
        const heightDiff = avgHeight - currentHeight;

        // Apply smoothing only at significant height differences (ice sheet edges)
        if (Math.abs(heightDiff) > 0.01 * this.PLANET_RADIUS) {
          const normal = this.tempVector3.set(vertices[i], vertices[i + 1], vertices[i + 2]).normalize();

          const smoothingFactor = 0.3; // Adjust this to control smoothing strength
          const adjustment = heightDiff * smoothingFactor;

          normal.multiplyScalar(adjustment);
          tempPositions[i] += normal.x;
          tempPositions[i + 1] += normal.y;
          tempPositions[i + 2] += normal.z;
        }
      }
    }

    // Update vertices with smoothed positions
    vertices.set(tempPositions);

    // Update vertex lengths
    for (let i = 0; i < vertices.length; i += 3) {
      this.vertexLengths[i / 3] = Math.sqrt(vertices[i] * vertices[i] + vertices[i + 1] * vertices[i + 1] + vertices[i + 2] * vertices[i + 2]);
    }
  }
}
