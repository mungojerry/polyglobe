import * as THREE from "three";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise";

interface ErosionParams {
  sedimentCapacity: number;
  erosionRate: number;
  depositionRate: number;
  evaporationRate: number;
  gravityFactor: number;
  maxLifetime: number;
}
export class SphericalErosionSimulation {
  private readonly PLANET_RADIUS: number;
  private readonly ITERATIONS: number;
  private readonly SEED: number;

  constructor(planetRadius: number, iterations: number = 1000, seed?: number) {
    this.PLANET_RADIUS = planetRadius;
    this.ITERATIONS = iterations;
    this.SEED = seed || Math.random();
  }

  // Improved noise generation for more natural terrain
  private generateNoise(x: number, y: number, z: number): number {
    const simplex = new SimplexNoise();
    return simplex.noise3d(x, y, z);
  }

  // Physically-inspired erosion simulation
  public applyErosion(vertices: Float32Array, geometry: THREE.BufferGeometry): void {
    const erosionParams = {
      sedimentCapacity: 0.4, // Maximum sediment a droplet can carry
      erosionRate: 0.3, // How quickly terrain is eroded
      depositionRate: 0.2, // How quickly sediment is deposited
      evaporationRate: 0.01, // Water loss per iteration
      gravityFactor: 4, // Influence of gravity
      maxLifetime: 50, // Maximum droplet lifetime
    };

    const randomGenerator = this.createPseudoRandomGenerator();

    for (let i = 0; i < this.ITERATIONS; i++) {
      // Generate a random starting point on the sphere
      const startPos = this.generateRandomSpherePoint();
      this.simulateDroplet(startPos, vertices, geometry, erosionParams, randomGenerator);
    }

    // Recompute vertex normals after terrain modification
    geometry.computeVertexNormals();
  }

  private createPseudoRandomGenerator() {
    let seed = this.SEED;
    return () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
  }

  private generateRandomSpherePoint(): THREE.Vector3 {
    const phi = Math.acos(1 - 2 * Math.random());
    const theta = Math.random() * 2 * Math.PI;
    return new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.sin(phi) * Math.sin(theta), Math.cos(phi)).multiplyScalar(this.PLANET_RADIUS);
  }

  private simulateDroplet(
    initialPos: THREE.Vector3,
    vertices: Float32Array,
    geometry: THREE.BufferGeometry,
    params: ErosionParams,
    randomGen: () => number
  ): void {
    let pos = initialPos.clone();
    let sediment = 0;
    let waterVolume = 1;
    let speed = 1;

    for (let lifetime = 0; lifetime < params.maxLifetime; lifetime++) {
      const currentIndex = this.findClosestVertexIndex(pos, vertices);
      const neighbors = this.findVertexNeighbors(currentIndex, geometry);

      // Calculate gradient with improved neighbor weighting
      const gradient = this.computeWeightedGradient(pos, vertices, neighbors);

      // Apply gravity and surface interaction
      const gravityVector = pos.clone().normalize().multiplyScalar(-params.gravityFactor);
      gradient.add(gravityVector);

      // Move droplet
      pos.add(gradient.normalize().multiplyScalar(speed));

      // Erosion and deposition logic
      const maxSedimentCapacity = waterVolume * params.sedimentCapacity;

      if (sediment > maxSedimentCapacity) {
        // Deposit excess sediment
        this.depositSediment(currentIndex, sediment - maxSedimentCapacity, vertices);
        sediment = maxSedimentCapacity;
      } else {
        // Erode terrain
        const erosionAmount = params.erosionRate * (maxSedimentCapacity - sediment) * speed;
        this.erodeTerrain(currentIndex, erosionAmount, vertices);
        sediment += erosionAmount;
      }

      // Update droplet properties
      waterVolume *= 1 - params.evaporationRate;
      speed = Math.max(0, speed * 0.95); // Natural deceleration

      // Early termination if no water or very slow
      if (waterVolume < 0.001 || speed < 0.01) break;
    }
  }

  private findClosestVertexIndex(pos: THREE.Vector3, vertices: Float32Array): number {
    let minDistance = Infinity;
    let closestIndex = 0;

    for (let i = 0; i < vertices.length; i += 3) {
      const vertexPos = new THREE.Vector3(vertices[i], vertices[i + 1], vertices[i + 2]);
      const distance = pos.distanceTo(vertexPos);

      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = i / 3;
      }
    }

    return closestIndex;
  }

  private findVertexNeighbors(vertexIndex: number, geometry: THREE.BufferGeometry): number[] {
    const indices = geometry.index?.array;
    const neighbors = new Set<number>();

    if (!indices) return [];

    for (let i = 0; i < indices.length; i += 3) {
      for (let j = 0; j < 3; j++) {
        if (indices[i + j] === vertexIndex) {
          neighbors.add(indices[i + ((j + 1) % 3)]);
          neighbors.add(indices[i + ((j + 2) % 3)]);
        }
      }
    }

    return Array.from(neighbors);
  }

  private computeWeightedGradient(pos: THREE.Vector3, vertices: Float32Array, neighbors: number[]): THREE.Vector3 {
    const gradient = new THREE.Vector3();
    const currentHeight = pos.length() - this.PLANET_RADIUS;

    for (const neighborIndex of neighbors) {
      const neighborPos = new THREE.Vector3(vertices[neighborIndex * 3], vertices[neighborIndex * 3 + 1], vertices[neighborIndex * 3 + 2]);

      const neighborHeight = neighborPos.length() - this.PLANET_RADIUS;
      const heightDiff = neighborHeight - currentHeight;

      const toNeighbor = neighborPos.clone().sub(pos).normalize();
      gradient.add(toNeighbor.multiplyScalar(heightDiff));
    }

    return neighbors.length > 0 ? gradient.divideScalar(neighbors.length) : gradient;
  }

  private erodeTerrain(index: number, amount: number, vertices: Float32Array): void {
    const pos = new THREE.Vector3(vertices[index * 3], vertices[index * 3 + 1], vertices[index * 3 + 2]);

    const surfaceNormal = pos.clone().normalize();
    pos.sub(surfaceNormal.multiplyScalar(amount));

    vertices[index * 3] = pos.x;
    vertices[index * 3 + 1] = pos.y;
    vertices[index * 3 + 2] = pos.z;
  }

  private depositSediment(index: number, amount: number, vertices: Float32Array): void {
    const pos = new THREE.Vector3(vertices[index * 3], vertices[index * 3 + 1], vertices[index * 3 + 2]);

    const surfaceNormal = pos.clone().normalize();
    pos.add(surfaceNormal.multiplyScalar(amount));

    vertices[index * 3] = pos.x;
    vertices[index * 3 + 1] = pos.y;
    vertices[index * 3 + 2] = pos.z;
  }
}
