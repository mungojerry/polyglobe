import * as THREE from "three";

export interface ParticleEmitterShape {
  getEmissionPoint(): THREE.Vector3;
  getEmissionDirection(): THREE.Vector3;
}

export class PointEmitter implements ParticleEmitterShape {
  private position: THREE.Vector3;

  constructor(position: THREE.Vector3 = new THREE.Vector3()) {
    this.position = position.clone();
  }

  getEmissionPoint(): THREE.Vector3 {
    return this.position.clone();
  }

  getEmissionDirection(): THREE.Vector3 {
    return new THREE.Vector3((Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2).normalize();
  }
}

export class SphereEmitter implements ParticleEmitterShape {
  private position: THREE.Vector3;
  private radius: number;
  private tempVector: THREE.Vector3;

  constructor(position: THREE.Vector3 = new THREE.Vector3(), radius: number = 1) {
    this.position = position.clone();
    this.radius = radius;
    this.tempVector = new THREE.Vector3();
  }

  getEmissionPoint(): THREE.Vector3 {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = this.radius * Math.cbrt(Math.random());

    return this.tempVector.set(r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta), r * Math.cos(phi)).add(this.position);
  }

  getEmissionDirection(): THREE.Vector3 {
    // Get direction from center to emission point
    return this.tempVector.clone().sub(this.position).normalize();
  }
}

export class BoxEmitter implements ParticleEmitterShape {
  private position: THREE.Vector3;
  private width: number;
  private height: number;
  private depth: number;
  private tempVector: THREE.Vector3;

  constructor(position: THREE.Vector3 = new THREE.Vector3(), width = 1, height = 1, depth = 1) {
    this.position = position.clone();
    this.width = width;
    this.height = height;
    this.depth = depth;
    this.tempVector = new THREE.Vector3();
  }

  getEmissionPoint(): THREE.Vector3 {
    const x = (Math.random() - 0.5) * this.width;
    const y = (Math.random() - 0.5) * this.height;
    const z = (Math.random() - 0.5) * this.depth;
    return this.tempVector.set(x, y, z).add(this.position);
  }

  getEmissionDirection(): THREE.Vector3 {
    return new THREE.Vector3((Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2).normalize();
  }
}

export class CylinderEmitter implements ParticleEmitterShape {
  private position: THREE.Vector3;
  private radius: number;
  private height: number;
  private tempVector: THREE.Vector3;

  constructor(position: THREE.Vector3 = new THREE.Vector3(), radius = 1, height = 2) {
    this.position = position.clone();
    this.radius = radius;
    this.height = height;
    this.tempVector = new THREE.Vector3();
  }

  getEmissionPoint(): THREE.Vector3 {
    const angle = Math.random() * Math.PI * 2;
    const r = this.radius * Math.sqrt(Math.random());
    const y = (Math.random() - 0.5) * this.height;
    const x = r * Math.cos(angle);
    const z = r * Math.sin(angle);

    return this.tempVector.set(x, y, z).add(this.position);
  }

  getEmissionDirection(): THREE.Vector3 {
    return new THREE.Vector3((Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2).normalize();
  }
}

export class RingEmitter implements ParticleEmitterShape {
  private position: THREE.Vector3;
  private innerRadius: number;
  private outerRadius: number;
  private tempVector: THREE.Vector3;

  constructor(position: THREE.Vector3 = new THREE.Vector3(), innerRadius = 0.5, outerRadius = 1) {
    this.position = position.clone();
    this.innerRadius = innerRadius;
    this.outerRadius = outerRadius;
    this.tempVector = new THREE.Vector3();
  }

  getEmissionPoint(): THREE.Vector3 {
    const angle = Math.random() * Math.PI * 2;
    const radius = THREE.MathUtils.lerp(this.innerRadius, this.outerRadius, Math.random());
    const x = radius * Math.cos(angle);
    const z = radius * Math.sin(angle);
    return this.tempVector.set(x, 0, z).add(this.position);
  }

  getEmissionDirection(): THREE.Vector3 {
    // Emit outward from the ring center
    return this.tempVector.clone().sub(this.position).normalize();
  }
}
