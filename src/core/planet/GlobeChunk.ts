import * as THREE from "three";
export class GlobeChunk {
  mesh: THREE.Mesh;
  public boundingSphere: THREE.Sphere;
  public normalizedPositions: Float32Array;
  public latStart: number = 0;
  public latEnd: number = 0;
  public lonStart: number = 0;
  public lonEnd: number = 0;
  constructor(geometry: THREE.BufferGeometry, material: THREE.Material) {
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    geometry.computeBoundingSphere();
    this.boundingSphere = geometry.boundingSphere!.clone();
    // Position the bounding sphere based on the mesh position
    this.boundingSphere.center.add(this.mesh.position);

    const positions = geometry.getAttribute("position");
    this.normalizedPositions = new Float32Array(positions.count * 3);

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

  dispose() {
    this.mesh.geometry.dispose();
  }
}
