import * as THREE from "three";
import { debugManager } from "../managers/debugManager";
import { Globe } from "./Globe";
import { GlobeChunk } from "./GlobeChunk";

export class Infection {
  private raycaster: THREE.Raycaster;
  private infectedVertices: Set<string> = new Set();
  private infectionRadius: number = 10.0; // Very large radius
  private processedMeshes: Set<string> = new Set();
  private gridSize: number = this.infectionRadius;

  constructor(private globe: Globe) {
    this.raycaster = new THREE.Raycaster();
    this.raycaster.firstHitOnly = true;
    this.raycaster.layers.set(1);
  }

  private getVertexKey(chunkId: string, index: number): string {
    return `${chunkId}_${index}`;
  }

  private getGridKey(position: THREE.Vector3): string {
    const x = Math.floor(position.x / this.gridSize);
    const y = Math.floor(position.y / this.gridSize);
    const z = Math.floor(position.z / this.gridSize);
    return `${x},${y},${z}`;
  }

  public infect(position: THREE.Vector3, chunk: GlobeChunk) {
    const start = performance.now();
    const mesh = chunk.mesh;

    // Setup color attributes only once per mesh
    if (!this.processedMeshes.has(mesh.uuid)) {
      this.setupColorAttributes(mesh);
      this.processedMeshes.add(mesh.uuid);
    }

    const geometry = mesh.geometry as THREE.BufferGeometry;
    const boundingSphere = geometry.boundingSphere;
    if (boundingSphere && position.distanceTo(boundingSphere.center) > boundingSphere.radius + this.infectionRadius) {
      return;
    }

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

      const positionAttr = geometry.attributes.position;
      const colorAttr = geometry.attributes.color as THREE.BufferAttribute;

      // Get intersection point in local space
      const localIntersectionPoint = intersect.point.clone().applyMatrix4(mesh.matrixWorld.invert());
      const gridKey = this.getGridKey(localIntersectionPoint);

      // Only process vertices in nearby grid cells
      for (let i = 0; i < positionAttr.count; i++) {
        const vertex = new THREE.Vector3().fromBufferAttribute(positionAttr, i);
        const vertexGridKey = this.getGridKey(vertex);

        if (vertexGridKey === gridKey) {
          const vertexKey = this.getVertexKey(mesh.uuid, i);

          // Skip already infected vertices
          if (this.infectedVertices.has(vertexKey)) continue;

          const distance = vertex.distanceTo(localIntersectionPoint);

          // Use a larger radius and more aggressive infection
          if (distance <= this.infectionRadius) {
            // Mark as infected
            this.infectedVertices.add(vertexKey);

            // Set to pure red immediately
            if (colorAttr) colorAttr?.setXYZ(i, 1, 0, 0);
          }
        }
      }

      // Mark color attribute as needing update#if (colorAttr
      if (colorAttr) colorAttr.needsUpdate = true;
    }
    const end = performance.now();
    debugManager.set("infectiontime", "infect: " + (end - start).toFixed(4));
  }

  private setupColorAttributes(mesh: THREE.Mesh) {
    const geometry = mesh.geometry as THREE.BufferGeometry;
    const material = mesh.material as THREE.MeshStandardMaterial;

    if (!geometry.attributes.color) {
      const colors = new Float32Array(geometry.attributes.position.count * 3);
      for (let i = 0; i < colors.length; i++) colors[i] = 1;
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    }

    if (!material.vertexColors) {
      material.vertexColors = true;
      material.needsUpdate = true;
    }
  }

  public update(deltaTime: number): void {}
}
