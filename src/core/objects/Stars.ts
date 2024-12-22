import * as THREE from "three";
import { debugManager } from "../managers/debugManager";

export class Stars {
  private particles: THREE.Points;
  private material: THREE.PointsMaterial;
  private numStars: number = 4000;

  constructor(radius: number) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.numStars * 3);
    const colors = new Float32Array(this.numStars * 3);
    const sizes = new Float32Array(this.numStars);

    for (let i = 0; i < this.numStars; i++) {
      // Random spherical distribution
      const phi = Math.random() * Math.PI * 2;
      const theta = Math.acos(Math.random() * 2 - 1);

      positions[i * 3] = radius * Math.sin(theta) * Math.cos(phi);
      positions[i * 3 + 1] = radius * Math.sin(theta) * Math.sin(phi);
      positions[i * 3 + 2] = radius * Math.cos(theta);

      // Slightly varied white colors for stars
      const brightness = 1.75 + Math.random() * 0.25;
      colors[i * 3] = brightness;
      colors[i * 3 + 1] = brightness;
      colors[i * 3 + 2] = brightness;

      // Increased range of random sizes for more variety
      sizes[i] = 1 + Math.random() * 4; // Base size of 1 with random addition up to 4
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

    // Create material with emissive properties
    this.material = new THREE.PointsMaterial({
      size: 3, // Increased base size from 1 to 2
      transparent: false,
      vertexColors: true,
      blending: THREE.NormalBlending,
      sizeAttenuation: true,
      depthWrite: false,
      depthTest: true,
    });

    this.particles = new THREE.Points(geometry, this.material);
  }

  public getObject(): THREE.Points {
    return this.particles;
  }

  public update(angle: number): void {
    const opacity = 1 - (Math.PI - angle) / Math.PI;
    debugManager.set("starOpacity", () => "star opacity: " + opacity.toFixed(2));
    this.material.opacity = opacity;
  }
}
