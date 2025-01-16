import * as THREE from "three";
import { ProgressCallback, yieldToMainThread } from "../utils/utils";
import { GlobeChunk } from "./GlobeChunk";

export class GlobeChunkGenerator {
  // Reusable objects to avoid allocations
  private readonly spherical = new THREE.Spherical();
  private readonly vec3 = new THREE.Vector3();
  private readonly OVERLAP = Math.PI / 180; // 1 degree in radians

  // Pre-allocated TypedArrays for vertex processing
  private vertexCache: Float32Array;
  private vertexInBounds: Uint8Array;
  private indexMap: Int32Array;

  constructor() {
    // Initialize with reasonable sizes - will grow if needed
    this.vertexCache = new Float32Array(50000 * 2); // lat/lon pairs
    this.vertexInBounds = new Uint8Array(50000);
    this.indexMap = new Int32Array(50000);
  }

  public async generateChunks(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    parent: THREE.Object3D,
    chunkSize: number,
    onProgress?: ProgressCallback
  ): Promise<GlobeChunk[][]> {
    if (!geometry.index) throw new Error("Geometry must have an index attribute");

    // Ensure our cache arrays are large enough
    const vertexCount = geometry.attributes.position.count;
    if (vertexCount > this.vertexCache.length / 2) {
      this.vertexCache = new Float32Array(vertexCount * 2);
      this.vertexInBounds = new Uint8Array(vertexCount);
      this.indexMap = new Int32Array(vertexCount);
    }

    // Pre-calculate all vertex lat/lons once
    const positionAttr = geometry.attributes.position;
    if (positionAttr instanceof THREE.BufferAttribute) {
      this.cacheVertexPositions(positionAttr);
    } else {
      throw new Error("Position attribute must be of type BufferAttribute");
    }

    const latChunks = Math.ceil(180 / chunkSize);
    const lonChunks = Math.ceil(360 / chunkSize);
    const totalChunks = latChunks * lonChunks;
    let completedChunks = 0;

    // Pre-allocate chunks array
    const chunks: GlobeChunk[][] = Array.from({ length: latChunks }, () => new Array(lonChunks));

    // Preallocate bounds object to avoid repeated creation
    const bounds = {
      latMin: 0,
      latMax: 0,
      lonMin: 0,
      lonMax: 0,
    };

    // Process chunks in parallel for better performance
    const tasks: Promise<void>[] = [];
    const BATCH_SIZE = 4; // Process 4 chunks at a time

    for (let latIdx = 0; latIdx < latChunks; latIdx++) {
      const latStart = -90 + latIdx * chunkSize;

      for (let lonIdx = 0; lonIdx < lonChunks; lonIdx++) {
        const lonStart = -180 + lonIdx * chunkSize;

        const task = (async () => {
          const chunkGeometry = this.extractChunkGeometry(geometry, latStart, latStart + chunkSize, lonStart, lonStart + chunkSize, bounds);

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

          completedChunks++;
          onProgress?.((completedChunks / totalChunks) * 100);
        })();

        tasks.push(task);

        // Process in batches to avoid overwhelming the system
        if (tasks.length >= BATCH_SIZE) {
          await Promise.all(tasks);
          await yieldToMainThread();
          tasks.length = 0;
        }
      }
    }

    // Process any remaining tasks
    if (tasks.length > 0) {
      await Promise.all(tasks);
      await yieldToMainThread();
    }

    return chunks;
  }

  private cacheVertexPositions(positionAttr: THREE.BufferAttribute): void {
    const positions = positionAttr.array as Float32Array;

    // Process vertices in batches for better performance
    const BATCH_SIZE = 1000;
    for (let i = 0; i < positions.length; i += BATCH_SIZE * 3) {
      const end = Math.min(i + BATCH_SIZE * 3, positions.length);

      for (let j = i; j < end; j += 3) {
        const idx = j / 3;
        this.vec3.fromArray(positions, j);
        this.spherical.setFromVector3(this.vec3);

        // Cache lat/lon
        this.vertexCache[idx * 2] = Math.PI / 2 - this.spherical.phi;
        let lon = this.spherical.theta;
        if (lon > Math.PI) lon -= Math.PI * 2;
        this.vertexCache[idx * 2 + 1] = lon;
      }
    }
  }

  private extractChunkGeometry(
    sourceGeometry: THREE.BufferGeometry,
    latStart: number,
    latEnd: number,
    lonStart: number,
    lonEnd: number,
    bounds: { latMin: number; latMax: number; lonMin: number; lonMax: number }
  ): THREE.BufferGeometry | null {
    // Update bounds (reusing object)
    bounds.latMin = THREE.MathUtils.degToRad(latStart) - this.OVERLAP;
    bounds.latMax = THREE.MathUtils.degToRad(latEnd) + this.OVERLAP;
    bounds.lonMin = THREE.MathUtils.degToRad(lonStart) - this.OVERLAP;
    bounds.lonMax = THREE.MathUtils.degToRad(lonEnd) + this.OVERLAP;

    const positions = sourceGeometry.attributes.position.array as Float32Array;
    const colors = sourceGeometry.attributes.color.array as Float32Array;
    const indices = sourceGeometry.index!.array as Uint32Array;

    // Reset index map
    this.indexMap.fill(-1);

    // Pre-mark vertices in bounds
    this.vertexInBounds.fill(0);
    const crossesDateline = bounds.lonMin > bounds.lonMax;

    for (let i = 0; i < sourceGeometry.attributes.position.count; i++) {
      const lat = this.vertexCache[i * 2];
      const lon = this.vertexCache[i * 2 + 1];

      const inLat = lat >= bounds.latMin && lat <= bounds.latMax;
      const inLon = crossesDateline ? lon >= bounds.lonMin || lon <= bounds.lonMax : lon >= bounds.lonMin && lon <= bounds.lonMax;

      this.vertexInBounds[i] = inLat && inLon ? 1 : 0;
    }

    // Preallocate arrays with estimated size
    const estimatedVertices = Math.ceil(positions.length / 50); // Assume ~2% of vertices
    const chunkPositions = new Float32Array(estimatedVertices * 3);
    const chunkColors = new Float32Array(estimatedVertices * 3);
    const chunkIndices: number[] = [];

    let vertexCount = 0;

    // Process triangles in batches
    const BATCH_SIZE = 1000;
    for (let i = 0; i < indices.length; i += BATCH_SIZE * 3) {
      const end = Math.min(i + BATCH_SIZE * 3, indices.length);

      for (let j = i; j < end; j += 3) {
        const a = indices[j];
        const b = indices[j + 1];
        const c = indices[j + 2];

        // Check if any vertex is in bounds
        if (this.vertexInBounds[a] || this.vertexInBounds[b] || this.vertexInBounds[c]) {
          // Process vertices
          for (const idx of [a, b, c]) {
            if (this.indexMap[idx] === -1) {
              const srcPos = idx * 3;
              const destPos = vertexCount * 3;

              // Copy position and color
              chunkPositions.set(positions.subarray(srcPos, srcPos + 3), destPos);
              chunkColors.set(colors.subarray(srcPos, srcPos + 3), destPos);

              this.indexMap[idx] = vertexCount++;
            }
            chunkIndices.push(this.indexMap[idx]);
          }
        }
      }
    }

    if (chunkIndices.length === 0) return null;

    // Create geometry with exact-sized buffers
    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(chunkPositions.subarray(0, vertexCount * 3), 3));

    geometry.setAttribute("color", new THREE.Float32BufferAttribute(chunkColors.subarray(0, vertexCount * 3), 3));

    geometry.setIndex(chunkIndices);

    // Compute normals and bounds
    geometry.computeBoundingSphere();

    return geometry;
  }
}
