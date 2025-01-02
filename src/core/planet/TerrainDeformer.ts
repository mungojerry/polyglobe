import * as THREE from "three";
import { getTerrainColor } from "../utils/biomes";
import { VoronoiNoise } from "./noise/VoroniNoise";

interface VertexData {
  vertex: THREE.Vector3;
  index: number;
}

export class TerrainDeformer {
  private spatialMap: Map<string, VertexData[]>;
  private initialized: boolean = false;
  private bounds: THREE.Box3;
  private readonly cellSize: number = 25; // Size based on typical deformation radius

  constructor(private land: THREE.Mesh, private noise: VoronoiNoise) {
    this.spatialMap = new Map();
    this.bounds = new THREE.Box3();
  }

  private getHashKey(point: THREE.Vector3): string {
    const hashX = Math.floor(point.x / this.cellSize);
    const hashY = Math.floor(point.y / this.cellSize);
    const hashZ = Math.floor(point.z / this.cellSize);
    return `${hashX},${hashY},${hashZ}`;
  }

  private initializeVertexMap(): void {
    if (this.initialized) return;

    const geometry = this.land.geometry;
    const positions = geometry.attributes.position;

    // Calculate bounds
    const positionAttribute = positions instanceof THREE.BufferAttribute ? positions : new THREE.BufferAttribute(positions.array, 3);
    this.bounds.setFromBufferAttribute(positionAttribute);

    // Store all vertices in their respective spatial cells
    for (let i = 0; i < positions.count; i++) {
      const vertex = new THREE.Vector3();
      vertex.fromBufferAttribute(positions, i);

      const key = this.getHashKey(vertex);

      // Initialize array for this cell if it doesn't exist
      if (!this.spatialMap.has(key)) {
        this.spatialMap.set(key, []);
      }

      // Add vertex data to the cell
      this.spatialMap.get(key)!.push({
        vertex: vertex.clone(),
        index: i,
      });
    }

    this.initialized = true;
  }

  private getVerticesInRange(center: THREE.Vector3, radius: number): VertexData[] {
    const nearbyVertices: VertexData[] = [];

    // Calculate the range of cells we need to check
    const minCell = new THREE.Vector3(
      Math.floor((center.x - radius) / this.cellSize),
      Math.floor((center.y - radius) / this.cellSize),
      Math.floor((center.z - radius) / this.cellSize)
    );

    const maxCell = new THREE.Vector3(
      Math.ceil((center.x + radius) / this.cellSize),
      Math.ceil((center.y + radius) / this.cellSize),
      Math.ceil((center.z + radius) / this.cellSize)
    );

    // Check all cells that might contain vertices within our radius
    for (let x = minCell.x; x <= maxCell.x; x++) {
      for (let y = minCell.y; y <= maxCell.y; y++) {
        for (let z = minCell.z; z <= maxCell.z; z++) {
          const key = `${x},${y},${z}`;
          const cellVertices = this.spatialMap.get(key);

          if (cellVertices) {
            // Check each vertex in the cell
            for (const data of cellVertices) {
              if (data.vertex.distanceTo(center) <= radius) {
                nearbyVertices.push(data);
              }
            }
          }
        }
      }
    }

    return nearbyVertices;
  }

  private applyDeformation(
    deformPosition: THREE.Vector3,
    strength: number,
    radius: number,
    falloffFunction: (distance: number, radius: number) => number
  ): { position: THREE.Vector3; color: THREE.Color; index: number }[] {
    const modifiedVertices: { position: THREE.Vector3; color: THREE.Color; index: number }[] = [];
    this.initializeVertexMap();

    const geometry = this.land.geometry;
    const positions = geometry.attributes.position;
    const colors = geometry.attributes.color;

    // Get vertices within deformation radius
    const nearbyVertices = this.getVerticesInRange(deformPosition, radius);

    // Process only vertices within range
    for (const data of nearbyVertices) {
      const vertex = data.vertex;
      const i = data.index;

      const distance = deformPosition.distanceTo(vertex);
      const falloff = falloffFunction(distance, radius);
      const heightChange = strength * falloff;

      const normal = vertex.clone().normalize();
      const newPosition = vertex.clone().add(normal.multiplyScalar(heightChange));

      // Update position
      positions.setXYZ(i, newPosition.x, newPosition.y, newPosition.z);

      // Update vertex in our map
      data.vertex.copy(newPosition);

      // Update color
      const normalizedPos = newPosition.clone().normalize();
      const noiseValue = this.noise.getValue(normalizedPos.x, normalizedPos.y, normalizedPos.z);
      const latitude = Math.asin(normalizedPos.y); // Calculate latitude from normalized position
      const color = getTerrainColor(noiseValue, latitude);

      colors.setXYZ(i, color.r, color.g, color.b);

      // Store modified vertex data
      modifiedVertices.push({
        position: newPosition.clone(),
        color: new THREE.Color(color.r, color.g, color.b),
        index: i,
      });
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.computeVertexNormals();

    // Notify objects about terrain deformation
    if (this.land.userData.onTerrainDeformed) {
      this.land.userData.onTerrainDeformed(deformPosition, radius);
    }

    return modifiedVertices;
  }

  deformPoint(deformPosition: THREE.Vector3, strength: number) {
    return this.applyDeformation(deformPosition, strength, 0, () => 1);
  }

  deformPointWithRadius(deformPosition: THREE.Vector3, strength: number, radius: number) {
    return this.applyDeformation(deformPosition, strength, radius, (distance, radius) => (distance <= radius ? 1 : 0));
  }

  deformSmoothFalloff(deformPosition: THREE.Vector3, strength: number, radius: number) {
    return this.applyDeformation(deformPosition, strength, radius, (distance, radius) => Math.pow(1 - distance / radius, 2));
  }

  flatten(deformPosition: THREE.Vector3, radius: number) {
    const targetLength = deformPosition.length();

    // Custom deformation that ensures all vertices are at the same height
    const modifiedVertices: { position: THREE.Vector3; color: THREE.Color; index: number }[] = [];
    this.initializeVertexMap();

    const geometry = this.land.geometry;
    const positions = geometry.attributes.position;
    const colors = geometry.attributes.color;

    // Get vertices within deformation radius
    const nearbyVertices = this.getVerticesInRange(deformPosition, radius);

    // First, calculate average height of affected vertices
    let totalHeight = 0;
    let vertexCount = 0;
    for (const data of nearbyVertices) {
      const vertex = data.vertex;
      const distance = deformPosition.distanceTo(vertex);
      if (distance <= radius * 0.8) {
        // Use inner 80% for average calculation
        totalHeight += vertex.length();
        vertexCount++;
      }
    }
    const averageHeight = vertexCount > 0 ? totalHeight / vertexCount : targetLength;

    // Process vertices
    for (const data of nearbyVertices) {
      const vertex = data.vertex;
      const i = data.index;
      const distance = deformPosition.distanceTo(vertex);

      if (distance <= radius) {
        // Calculate falloff for smooth transition at edges
        const falloff = Math.pow(1 - distance / radius, 3); // Cubic falloff for sharper transition

        // Calculate target height based on distance from center
        let targetHeight = averageHeight;
        if (distance < radius * 0.2) {
          // Inner 20% is completely flat
          targetHeight = averageHeight;
        } else if (distance > radius * 0.8) {
          // Outer 20% blends with surroundings
          const t = (distance - radius * 0.8) / (radius * 0.2);
          targetHeight = averageHeight * (1 - t) + vertex.length() * t;
        }

        // Move vertex to target height while maintaining its direction from center
        const direction = vertex.clone().normalize();
        const newPosition = direction.multiplyScalar(targetHeight);

        // For very central vertices, ensure perfect flatness
        if (distance < radius * 0.1) {
          newPosition.copy(direction.multiplyScalar(averageHeight));
        }

        // Update position
        positions.setXYZ(i, newPosition.x, newPosition.y, newPosition.z);
        data.vertex.copy(newPosition);

        // Update color
        const normalizedPos = newPosition.clone().normalize();
        const noiseValue = this.noise.getValue(normalizedPos.x, normalizedPos.y, normalizedPos.z);
        const latitude = Math.asin(normalizedPos.y);
        const color = getTerrainColor(noiseValue, latitude);

        colors.setXYZ(i, color.r, color.g, color.b);

        modifiedVertices.push({
          position: newPosition.clone(),
          color: new THREE.Color(color.r, color.g, color.b),
          index: i,
        });
      }
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    geometry.computeVertexNormals();

    if (this.land.userData.onTerrainDeformed) {
      this.land.userData.onTerrainDeformed(deformPosition, radius);
    }

    return modifiedVertices;
  }

  enlarge(deformPosition: THREE.Vector3, strength: number, radius: number) {
    return this.applyDeformation(deformPosition, strength, radius, (distance, radius) => 1);
  }
}
