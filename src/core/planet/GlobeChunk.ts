import * as THREE from "three";
import { SimplifyModifier } from "three-stdlib";

export class GlobeChunk {
  public mesh!: THREE.Mesh;
  public boundingSphere!: THREE.Sphere;
  public normalizedPositions!: Float32Array;
  // public elevations!: Float32Array;
  public latStart: number = 0;
  public latEnd: number = 0;
  public lonStart: number = 0;
  public lonEnd: number = 0;

  private currentLOD: number = 0;
  private geometryLevels: THREE.BufferGeometry[] = [];
  private lodDistanceThresholds: number[] = [1000, 2000, 4000];

  constructor(geometry: THREE.BufferGeometry, material: THREE.Material) {
    // Generate LOD chain
    this.geometryLevels = this.generateLODLevels(geometry);

    // Initialize with highest detail
    this.mesh = new THREE.Mesh(this.geometryLevels[0], material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;

    // Setup bounding sphere
    geometry.computeBoundingSphere();
    this.boundingSphere = geometry.boundingSphere!.clone();
    this.boundingSphere.center.add(this.mesh.position);

    // Calculate normalized positions and store elevations
    const positions = geometry.getAttribute("position");
    this.normalizedPositions = new Float32Array(positions.count * 3);
    // this.elevations = new Float32Array(positions.count);
    this.calculateNormalizedPositions(positions);
  }

  private calculateNormalizedPositions(positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): void {
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      const length = Math.sqrt(x * x + y * y + z * z);

      // Store normalized positions
      this.normalizedPositions[i * 3] = x / length;
      this.normalizedPositions[i * 3 + 1] = y / length;
      this.normalizedPositions[i * 3 + 2] = z / length;

      // Calculate and store elevation
      // const nx = x / length;
      // const ny = y / length;
      // const nz = z / length;
      // const height = terrainHelper.computeSurfaceHeight(nx, ny, nz);
      // this.elevations[i] = height;
    }
  }

  private generateLODLevels(baseGeometry: THREE.BufferGeometry): THREE.BufferGeometry[] {
    const levels: THREE.BufferGeometry[] = [baseGeometry];
    const modifier = new SimplifyModifier();
    const reductionFactors = [0.5, 0.25, 0.125]; // Progressive vertex reduction

    for (const factor of reductionFactors) {
      const vertexCount = Math.floor(baseGeometry.attributes.position.count * factor);
      const simplifiedGeometry = modifier.modify(baseGeometry.clone(), vertexCount);
      levels.push(simplifiedGeometry);
    }

    return levels;
  }

  public updateLOD(cameraDistance: number): void {
    let targetLOD = 0;

    for (let i = 0; i < this.lodDistanceThresholds.length; i++) {
      if (cameraDistance > this.lodDistanceThresholds[i]) {
        targetLOD = i + 1;
      }
    }

    if (targetLOD !== this.currentLOD && targetLOD < this.geometryLevels.length) {
      this.mesh.geometry = this.geometryLevels[targetLOD];
      this.currentLOD = targetLOD;
    }
  }

  public getCurrentLOD(): number {
    return this.currentLOD;
  }

  public dispose(): void {
    this.geometryLevels.forEach((geometry) => {
      if (geometry !== this.mesh.geometry) {
        geometry.dispose();
      }
    });
    this.mesh.geometry.dispose();
  }

  public updateGeometry(modifiedVertices: { position: THREE.Vector3; color: THREE.Color; index: number; elevation?: number }[]): void {
    const baseGeometry = this.geometryLevels[0];
    const positions = baseGeometry.attributes.position;
    const colors = baseGeometry.attributes.color;
    let geometryModified = false;

    // Update vertices that belong to this chunk
    for (const vertexData of modifiedVertices) {
      const position = vertexData.position;

      // Check if the vertex is within this chunk's bounds
      const { lat, lon } = this.calculateLatLon(position);
      if (lat >= this.latStart && lat < this.latEnd && lon >= this.lonStart && lon < this.lonEnd) {
        // Update position and color in the base geometry
        positions.setXYZ(vertexData.index, position.x, position.y, position.z);
        colors.setXYZ(vertexData.index, vertexData.color.r, vertexData.color.g, vertexData.color.b);

        // Update elevation if provided
        // if (vertexData.elevation !== undefined) {
        //   this.elevations[vertexData.index] = vertexData.elevation;
        // }
        geometryModified = true;
      }
    }

    if (geometryModified) {
      // Update geometry attributes
      positions.needsUpdate = true;
      colors.needsUpdate = true;
      baseGeometry.computeVertexNormals();

      // Regenerate LOD levels
      this.geometryLevels = this.generateLODLevels(baseGeometry);

      // Update current mesh geometry while maintaining LOD
      const currentLOD = this.currentLOD;
      this.mesh.geometry = this.geometryLevels[currentLOD];

      // Recalculate normalized positions and elevations
      this.calculateNormalizedPositions(positions);
    }
  }

  private calculateLatLon(position: THREE.Vector3): { lat: number; lon: number } {
    const normalizedPos = position.clone().normalize();
    const lat = Math.asin(normalizedPos.y) * (180 / Math.PI);
    let lon = Math.atan2(normalizedPos.x, normalizedPos.z) * (180 / Math.PI);
    lon = ((lon + 180) % 360) - 180;
    return { lat, lon };
  }
}
