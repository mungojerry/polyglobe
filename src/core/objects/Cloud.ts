import * as THREE from "three";
import { optimizeGeometry } from "../utils/utils";

export class Cloud {
  cloudMesh: THREE.Group;
  private scaleFactor: number;
  private theta: number;
  private phi: number;
  private distance: number;

  constructor(radius: number, scene: THREE.Scene, scaleFactor: number = 0.75) {
    this.cloudMesh = new THREE.Group();

    // Set random size and position for each cloud
    this.scaleFactor = scaleFactor * (3 + Math.random() * 9);
    this.distance = radius + 10 + Math.random() * 140;

    // Random initial spherical coordinates
    this.theta = Math.random() * Math.PI * 2;
    this.phi = Math.acos(2 * Math.random() - 1);

    // Build the cloud and position it
    this.createCumuloNimbusCloud();
    this.updatePosition();
    scene.add(this.cloudMesh);
  }

  private createCumuloNimbusCloud() {
    const geometry = new THREE.SphereGeometry(1, 5, 5);
    const material = new THREE.MeshPhongMaterial({
      color: 0xffffff,

      flatShading: true,
      transparent: true,
      opacity: 0.8,
    });

    const numLayers = 3 + Math.floor(Math.random() * 2);
    for (let layer = 0; layer < numLayers; layer++) {
      const layerSize = (numLayers - layer) * this.scaleFactor * (1 + Math.random() * 0.2);
      const numParts = 3 + Math.floor(Math.random() * 2);

      for (let i = 0; i < numParts; i++) {
        const part = new THREE.Mesh(geometry, material);
        part.scale.set(
          layerSize * (0.7 + Math.random() * 0.5),
          layer === 0 ? layerSize * 0.15 : layerSize * (0.25 + Math.random() * 0.4),
          layerSize * (0.7 + Math.random() * 0.5)
        );

        part.position.set(
          (Math.random() - 0.5) * layerSize * 1.2,
          -layer * this.scaleFactor * (0.7 + Math.random() * 0.3),
          (Math.random() - 0.5) * layerSize * 1.2
        );

        part.castShadow = true;
        part.receiveShadow = true;
        this.cloudMesh.add(part);
      }
    }
    this.cloudMesh.children.forEach((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry = optimizeGeometry(child.geometry as THREE.BufferGeometry);
      }
    });
  }

  private updatePosition() {
    this.cloudMesh.position.set(
      this.distance * Math.sin(this.phi) * Math.cos(this.theta),
      this.distance * Math.cos(this.phi),
      this.distance * Math.sin(this.phi) * Math.sin(this.theta)
    );
    this.orientFlatBottomTowardsGlobe();
  }

  private orientFlatBottomTowardsGlobe() {
    const globeCenter = new THREE.Vector3(0, 0, 0);
    this.cloudMesh.lookAt(globeCenter);
    this.cloudMesh.rotateX(Math.PI / 2);
  }

  public animateCloud(speed: number = 0.0001, phiOscillationSpeed: number = 0.00002) {
    this.theta += speed;
    this.phi += Math.sin(this.theta) * phiOscillationSpeed;
    this.updatePosition();
  }
}
