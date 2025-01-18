import * as THREE from "three";

export class RibbonTrail {
  private geometry: THREE.BufferGeometry;
  private material: THREE.MeshBasicMaterial;
  private mesh: THREE.Mesh;
  private positions: Float32Array;
  private indices: Uint16Array;
  private maxPoints: number;
  private currentLength: number;
  private scene: THREE.Scene;
  private readonly BASE_WIDTH = 0.3;
  private readonly MIN_WIDTH = 0.02;

  constructor(scene: THREE.Scene, maxPoints: number = 30) {
    this.scene = scene;
    this.maxPoints = maxPoints;
    this.currentLength = 0;

    // Create geometry with vertices for a continuous ribbon
    this.positions = new Float32Array(maxPoints * 2 * 3); // 2 vertices per point, 3 components per vertex

    // Create indices for triangle strip
    this.indices = new Uint16Array((maxPoints - 1) * 6);

    // Setup indices for triangle strip
    for (let i = 0; i < maxPoints - 1; i++) {
      const indexBase = i * 6;
      const vertexBase = i * 2;

      // First triangle
      this.indices[indexBase] = vertexBase;
      this.indices[indexBase + 1] = vertexBase + 1;
      this.indices[indexBase + 2] = vertexBase + 2;

      // Second triangle
      this.indices[indexBase + 3] = vertexBase + 2;
      this.indices[indexBase + 4] = vertexBase + 1;
      this.indices[indexBase + 5] = vertexBase + 3;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setIndex(new THREE.BufferAttribute(this.indices, 1));
    this.geometry.setDrawRange(0, 0);

    // Create material with transparency for fading
    this.material = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    // Create mesh and add to scene
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  update(position: THREE.Vector3, direction: THREE.Vector3): void {
    // Calculate perpendicular vector for ribbon width
    const perpendicular = new THREE.Vector3().crossVectors(direction, position.clone().normalize()).normalize();

    // Shift existing vertices back
    for (let i = this.positions.length - 6; i >= 6; i -= 6) {
      for (let j = 0; j < 6; j++) {
        this.positions[i + j] = this.positions[i + j - 6];
      }
    }

    // Add new vertices at the front with full width
    const leftEdge = position.clone().add(perpendicular.multiplyScalar(this.BASE_WIDTH));
    const rightEdge = position.clone().add(perpendicular.multiplyScalar(-this.BASE_WIDTH));

    this.positions[0] = leftEdge.x;
    this.positions[1] = leftEdge.y;
    this.positions[2] = leftEdge.z;
    this.positions[3] = rightEdge.x;
    this.positions[4] = rightEdge.y;
    this.positions[5] = rightEdge.z;

    // Scale each segment to create a smooth taper
    for (let i = 6; i < this.positions.length; i += 6) {
      const segmentIndex = i / 6;
      const scale = Math.max(this.MIN_WIDTH / this.BASE_WIDTH, 1.0 - (segmentIndex / this.maxPoints) * 0.5);

      // Get center point
      const centerX = (this.positions[i] + this.positions[i + 3]) / 2;
      const centerY = (this.positions[i + 1] + this.positions[i + 4]) / 2;
      const centerZ = (this.positions[i + 2] + this.positions[i + 5]) / 2;

      // Scale vertices around center point
      const leftX = centerX + (this.positions[i] - centerX) * scale;
      const leftY = centerY + (this.positions[i + 1] - centerY) * scale;
      const leftZ = centerZ + (this.positions[i + 2] - centerZ) * scale;
      const rightX = centerX + (this.positions[i + 3] - centerX) * scale;
      const rightY = centerY + (this.positions[i + 4] - centerY) * scale;
      const rightZ = centerZ + (this.positions[i + 5] - centerZ) * scale;

      this.positions[i] = leftX;
      this.positions[i + 1] = leftY;
      this.positions[i + 2] = leftZ;
      this.positions[i + 3] = rightX;
      this.positions[i + 4] = rightY;
      this.positions[i + 5] = rightZ;
    }

    // Update geometry
    const positionAttribute = this.geometry.getAttribute("position");
    positionAttribute.needsUpdate = true;

    // Increase current length up to max points
    if (this.currentLength < this.maxPoints) {
      this.currentLength++;
      this.geometry.setDrawRange(0, (this.currentLength - 1) * 6);
    }
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}
