import * as THREE from "three";
import { ProgressCallback, yieldToMainThread } from "../utils/utils";
import { GlobeChunk } from "./GlobeChunk";

export class GlobeChunkGenerator {
  private spherical = new THREE.Spherical();

  /**
   * Splits a spherical geometry into chunks based on lat/lon grid
   */
  public async generateChunks(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    parent: THREE.Object3D,
    chunkSize: number,
    onProgress?: ProgressCallback
  ): Promise<GlobeChunk[][]> {
    // Validate input geometry
    if (!geometry.index) {
      throw new Error("Geometry must have an index attribute");
    }

    // Calculate grid dimensions
    const latChunks = Math.ceil(180 / chunkSize);
    const lonChunks = Math.ceil(360 / chunkSize);
    const totalChunks = latChunks * lonChunks;
    let completedChunks = 0;

    // Initialize chunks array
    const chunks: GlobeChunk[][] = Array(latChunks)
      .fill(null)
      .map(() => Array(lonChunks).fill(null));

    // Process each grid cell
    for (let latIdx = 0; latIdx < latChunks; latIdx++) {
      for (let lonIdx = 0; lonIdx < lonChunks; lonIdx++) {
        const latStart = -90 + latIdx * chunkSize;
        const lonStart = -180 + lonIdx * chunkSize;

        // Extract geometry for this chunk
        const chunkGeometry = this.extractChunkGeometry(geometry, latStart, latStart + chunkSize, lonStart, lonStart + chunkSize);

        // Create chunk if we got valid geometry
        if (chunkGeometry) {
          const chunkMaterial = material.clone();
          const chunk = new GlobeChunk(chunkGeometry, chunkMaterial);

          chunk.latStart = latStart;
          chunk.latEnd = latStart + chunkSize;
          chunk.lonStart = lonStart;
          chunk.lonEnd = lonStart + chunkSize;

          chunk.mesh.layers.enable(1);
          parent.add(chunk.mesh);

          chunks[latIdx][lonIdx] = chunk;
        }

        // Update progress
        completedChunks++;
        if (onProgress) {
          onProgress((completedChunks / totalChunks) * 100);
        }

        // Yield to prevent blocking
        await yieldToMainThread();
      }
    }

    return chunks;
  }

  /**
   * Extracts a portion of the geometry within given lat/lon bounds
   */
  private extractChunkGeometry(
    sourceGeometry: THREE.BufferGeometry,
    latMin: number,
    latMax: number,
    lonMin: number,
    lonMax: number
  ): THREE.BufferGeometry | null {
    const positions = sourceGeometry.attributes.position.array as Float32Array;
    const colors = sourceGeometry.attributes.color.array as Float32Array;
    const indices = sourceGeometry.index!.array as Uint32Array;

    // Convert bounds to radians and add small overlap
    const OVERLAP = THREE.MathUtils.degToRad(1); // 1 degree overlap
    const bounds = {
      latMin: THREE.MathUtils.degToRad(latMin) - OVERLAP,
      latMax: THREE.MathUtils.degToRad(latMax) + OVERLAP,
      lonMin: THREE.MathUtils.degToRad(lonMin) - OVERLAP,
      lonMax: THREE.MathUtils.degToRad(lonMax) + OVERLAP,
    };

    // Arrays to store chunk data
    const chunkPositions: number[] = [];
    const chunkColors: number[] = [];
    const chunkIndices: number[] = [];
    const oldToNewIndex = new Map<number, number>();

    // Process each triangle
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i];
      const b = indices[i + 1];
      const c = indices[i + 2];

      // Check if any vertex is in bounds
      const inBounds = [a, b, c].some((idx) => {
        const pos = new THREE.Vector3(positions[idx * 3], positions[idx * 3 + 1], positions[idx * 3 + 2]);

        this.spherical.setFromVector3(pos);

        const lat = Math.PI / 2 - this.spherical.phi;
        let lon = this.spherical.theta;
        if (lon > Math.PI) lon -= Math.PI * 2;

        // Handle date line crossing
        const inLon = bounds.lonMin > bounds.lonMax ? lon >= bounds.lonMin || lon <= bounds.lonMax : lon >= bounds.lonMin && lon <= bounds.lonMax;

        return lat >= bounds.latMin && lat <= bounds.latMax && inLon;
      });

      if (inBounds) {
        // Add vertices if not already added
        for (const idx of [a, b, c]) {
          if (!oldToNewIndex.has(idx)) {
            const newIdx = chunkPositions.length / 3;
            oldToNewIndex.set(idx, newIdx);

            // Add position
            chunkPositions.push(positions[idx * 3], positions[idx * 3 + 1], positions[idx * 3 + 2]);

            // Add color
            chunkColors.push(colors[idx * 3], colors[idx * 3 + 1], colors[idx * 3 + 2]);
          }
        }

        // Add triangle indices
        chunkIndices.push(oldToNewIndex.get(a)!, oldToNewIndex.get(b)!, oldToNewIndex.get(c)!);
      }
    }

    // Return null if no triangles were found
    if (chunkIndices.length === 0) {
      return null;
    }

    // Create new geometry
    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(chunkPositions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(chunkColors, 3));
    geometry.setIndex(chunkIndices);

    // geometry.computeVertexNormals();
    geometry.computeBoundingSphere();

    return geometry;
  }
}
