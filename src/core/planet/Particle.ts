// ParticleSystem.ts

import RAPIER, { ColliderDesc } from "@dimforge/rapier3d";
import * as THREE from "three";

export class Particle {
  mesh: THREE.Mesh;
  rigidBody: RAPIER.RigidBody;

  constructor(position: THREE.Vector3, world: RAPIER.World) {
    // Larger, more visible geometry
    const size = 1;
    const geometry = new THREE.SphereGeometry(size);
    const material = new THREE.MeshBasicMaterial({
      color: Math.random() > 0.5 ? 0xff0000 : 0xff4500, // Red or OrangeRed
      transparent: true,
      opacity: 1,
      depthWrite: false, // Important for transparency
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.copy(position);

    // Add small position offset to prevent z-fighting
    this.mesh.position.add(new THREE.Vector3((Math.random() - 0.5) * 20.1, (Math.random() - 0.5) * 20.1, (Math.random() - 0.5) * 20.1));

    // Physics body
    const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(this.mesh.position.x, this.mesh.position.y, this.mesh.position.z);

    const colliderDesc = ColliderDesc.ball(size);
    colliderDesc.restitution = 0.29;
    colliderDesc.mass = 100;
    colliderDesc.friction = 1;

    // Create the sphere
    this.rigidBody = world.createRigidBody(rigidBodyDesc);
    world.createCollider(colliderDesc, this.rigidBody);

    const impulse = position.clone().normalize().multiplyScalar(20);
    this.rigidBody.addForce(impulse, true);

    // Debug log
    console.log("Particle created at:", this.mesh.position);
  }

  update(deltaTime: number): boolean {
    const pos = this.rigidBody.translation();
    this.mesh.position.set(pos.x, pos.y, pos.z);

    const v = new THREE.Vector3(pos.x, pos.y, pos.z).normalize().negate().multiplyScalar(9.81);
    const gravityForce = new THREE.Vector3(v.x, v.y, v.z);
    this.rigidBody.applyImpulse(gravityForce, true);

    return true; // Keep particles alive longer for testing
  }
}
