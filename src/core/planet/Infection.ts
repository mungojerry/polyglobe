import * as THREE from "three";
import { Globe } from "./Globe";
import { GlobeChunk } from "./GlobeChunk";

export class Infection {
  private raycaster: THREE.Raycaster;
  private infectedVertices: Set<string> = new Set();
  private infectionRadius: number = 10.0; // Very large radius

  constructor(private globe: Globe) {
    this.raycaster = new THREE.Raycaster();
  }

  private getVertexKey(chunkId: string, index: number): string {
    return `${chunkId}_${index}`;
  }

  public infect(position: THREE.Vector3, chunk: GlobeChunk) {
    const mesh = chunk.mesh;
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const material = mesh.material as THREE.MeshStandardMaterial;

    // Setup raycaster
    const origin = position
      .clone()
      .normalize()
      .multiplyScalar(this.globe.getRadius() * 2);
    const direction = origin.clone().normalize().negate();
    this.raycaster.set(origin, direction);

    const intersects = this.raycaster.intersectObject(mesh, false);

    if (intersects.length > 0) {
      const intersect = intersects[0];

      // Ensure we have color attribute
      if (!geometry.attributes.color) {
        const colors = new Float32Array(geometry.attributes.position.count * 3);
        for (let i = 0; i < colors.length; i++) colors[i] = 1;
        geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      }

      const positionAttr = geometry.attributes.position;
      const colorAttr = geometry.attributes.color as THREE.BufferAttribute;

      // Get intersection point in local space
      const localIntersectionPoint = intersect.point.clone().applyMatrix4(mesh.matrixWorld.invert());

      // Process all vertices
      for (let i = 0; i < positionAttr.count; i++) {
        const vertexKey = this.getVertexKey(mesh.uuid, i);

        // Skip already infected vertices
        if (this.infectedVertices.has(vertexKey)) continue;

        const vertex = new THREE.Vector3();
        vertex.fromBufferAttribute(positionAttr, i);

        const distance = vertex.distanceTo(localIntersectionPoint);

        // Use a larger radius and more aggressive infection
        if (distance <= this.infectionRadius) {
          // Mark as infected
          this.infectedVertices.add(vertexKey);

          // Set to pure red immediately
          colorAttr.setXYZ(i, 1, 0, 0);
        }
      }

      // Mark color attribute as needing update
      colorAttr.needsUpdate = true;

      // Ensure the material uses vertex colors
      if (!material.vertexColors) {
        material.vertexColors = true;
        material.needsUpdate = true;
      }
    }
  }

  public update(deltaTime: number): void {}
}
