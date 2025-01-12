import * as THREE from "three";
export class Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotation: THREE.Vector3;
  age: number;
  lifetime: number;
  active: boolean;
  scale: number;
  color: THREE.Color;
  opacity: number;

  constructor() {
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.rotation = new THREE.Vector3();
    this.age = 0;
    this.lifetime = 0;
    this.active = false;
    this.scale = 1;
    this.color = new THREE.Color();
    this.opacity = 1;
  }

  reset(): void {
    this.position.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
    this.rotation.set(0, 0, 0);
    this.age = 0;
    this.active = false;
    this.scale = 1;
    this.opacity = 1;
  }
}
