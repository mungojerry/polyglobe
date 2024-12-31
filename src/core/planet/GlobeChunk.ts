import * as THREE from "three";
import { SimplifyModifier } from "three-stdlib";

export class GlobeChunk {
  mesh: THREE.Mesh;
  public boundingSphere: THREE.Sphere;
  public normalizedPositions: Float32Array;
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

    // Calculate normalized positions
    const positions = geometry.getAttribute("position");
    this.normalizedPositions = new Float32Array(positions.count * 3);
    this.calculateNormalizedPositions(positions);
  }

  private calculateNormalizedPositions(positions: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): void {
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      const length = Math.sqrt(x * x + y * y + z * z);

      this.normalizedPositions[i * 3] = x / length;
      this.normalizedPositions[i * 3 + 1] = y / length;
      this.normalizedPositions[i * 3 + 2] = z / length;
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
}
