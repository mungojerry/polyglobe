import * as THREE from "three";
import { Globe } from "./Globe";
import { GlobeChunk } from "./GlobeChunk";

export class Infection {
  private raycaster: THREE.Raycaster;

  constructor(private globe: Globe) {
    this.raycaster = new THREE.Raycaster();
  }

  public infect(position: THREE.Vector3, chunk: GlobeChunk) {
    // Move origin slightly above surface
    const origin = position
      .clone()
      .normalize()
      .multiplyScalar(this.globe.getRadius() * 2);

    // Direction towards center
    const direction = origin.clone().normalize().negate();

    // Transform ray to chunk's local space
    const localOrigin = origin.clone().applyMatrix4(chunk.mesh.matrixWorld.invert());
    const localDirection = direction.clone().transformDirection(chunk.mesh.matrixWorld.invert());

    // Setup raycaster in local space
    this.raycaster.set(localOrigin, localDirection);
    const intersects = this.raycaster.intersectObject(chunk.mesh, false);
    if (intersects.length > 0) {
      const intersect = intersects[0]; // Take the closest intersection
      const mesh = intersect.object as THREE.Mesh;

      // Access the geometry and material
      const geometry = mesh.geometry as THREE.BufferGeometry;
      const material = mesh.material as THREE.MeshStandardMaterial; // Replace with your actual material type

      // Get the index of the face's vertices
      const indexAttr = geometry.index;
      const colorAttr = geometry.attributes.color as THREE.BufferAttribute;

      if (indexAttr && intersect.faceIndex !== undefined) {
        const vertexIndices = [
          indexAttr.getX(intersect.faceIndex * 3),
          indexAttr.getX(intersect.faceIndex * 3 + 1),
          indexAttr.getX(intersect.faceIndex * 3 + 2),

          indexAttr.getX(intersect.faceIndex * 3 + 3),
          indexAttr.getX(intersect.faceIndex * 3 + 4),
          indexAttr.getX(intersect.faceIndex * 3 + 5),
        ];

        // Set the colors of the face's vertices to red
        for (const vertexIndex of vertexIndices) {
          colorAttr.setXYZ(vertexIndex, 1, 0, 0);
        }
        colorAttr.needsUpdate = true;

        // Ensure the material uses vertex colors
        if (!material.vertexColors) {
          material.vertexColors = true;
          material.needsUpdate = true;
        }
      }
    } else {
      console.log("No intersection found.");
    }
  }

  public update(deltaTime: number): void {}
}
