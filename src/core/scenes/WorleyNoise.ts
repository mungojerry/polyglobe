import * as THREE from "three";
import { pseudoRandom } from "../utils/PseudoRandom";
export class WorleyNoise {
  private points!: THREE.Vector3[];

  constructor(private pointCount: number = 50, private planetRadius: number = 1) {
    this.generatePoints();
  }

  private generatePoints() {
    this.points = Array.from({ length: this.pointCount }, () => {
      const theta = pseudoRandom.random() * 2 * Math.PI;
      const phi = Math.acos(1 - 2 * pseudoRandom.random());
      const x = Math.sin(phi) * Math.cos(theta);
      const y = Math.sin(phi) * Math.sin(theta);
      const z = Math.cos(phi);
      return new THREE.Vector3(x, y, z);
    });
  }

  // Implement noise3d method with Simplex-like signature
  noise3d(x: number, y: number, z: number): number {
    const point = new THREE.Vector3(x, y, z);

    // Find the three closest feature points
    const distances = this.points.map((featurePoint) => point.distanceTo(featurePoint)).sort((a, b) => a - b);

    // Return a value between -1 and 1
    return (distances[0] / this.planetRadius) * 2 - 1;
  }
}
