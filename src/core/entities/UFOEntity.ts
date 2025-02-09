import RAPIER from "@dimforge/rapier3d";
import * as THREE from "three";
import { ModelLoader } from "../managers/ModelLoader";
import { FlyingEntity } from "./FlyingEntity";

export class UFOEntity extends FlyingEntity {
  private modelLoader: ModelLoader;

  constructor(scene: THREE.Scene, position: THREE.Vector3, world: RAPIER.World) {
    super(scene, position, world, "player_ufo");
    this.modelLoader = new ModelLoader();

    // Create temporary object and body
    this.object = new THREE.Group();
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setLinearDamping(0.8) // Increased damping for smoother movement
      .setAngularDamping(0.95) // Higher angular damping for more stable rotation
      .setCcdEnabled(true); // Enable continuous collision detection

    this.body = this.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.ball(2.0);
    this.world.createCollider(colliderDesc, this.body);

    // Add to scene immediately
    this.scene.add(this.object);

    // Set up controls
    this.setupControls();

    // Load model asynchronously
    this.loadModel();
  }

  private setupControls(): void {
    document.addEventListener("mousemove", (event) => {
      const movementX = event.movementX || 0;
      const movementY = event.movementY || 0;

      // Reduced mouse sensitivity for finer control
      this.mouseX = (movementX / window.innerWidth) * 0.2;
      this.mouseY = (movementY / window.innerHeight) * 0.2;
    });

    document.addEventListener("keydown", (event) => {
      if (event.code === "Space") {
        this.thrustActive = true;
      }
    });

    document.addEventListener("keyup", (event) => {
      if (event.code === "Space") {
        this.thrustActive = false;
      }
    });
  }

  private async loadModel() {
    try {
      const model = await this.modelLoader.loadModelForInstancing("assets/models/wooden_ufo_toy", 1, 1, true);

      // Clear existing children
      while (this.object.children.length > 0) {
        this.object.remove(this.object.children[0]);
      }

      // Add new model meshes
      model.meshes.forEach(({ instancedMesh }) => {
        instancedMesh.count = 1;
        const matrix = new THREE.Matrix4();
        matrix.compose(new THREE.Vector3(0, 0, 0), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
        instancedMesh.setMatrixAt(0, matrix);
        instancedMesh.instanceMatrix.needsUpdate = true;
        this.object.add(instancedMesh);
      });
    } catch (error) {
      console.error("Failed to load UFO model:", error);
    }
  }

  public update(camera: THREE.Camera): void {
    super.update(camera);

    if (this.body) {
      // Apply circular gravity towards planet center
      const position = this.body.translation();
      const positionVec = new THREE.Vector3(position.x, position.y, position.z);
      const direction = positionVec.clone().normalize().negate();

      // Adjusted gravity for better orbital mechanics
      const distanceFromCenter = positionVec.length();
      const gravityStrength = Math.max(15.0, 30.0 * (1.0 - distanceFromCenter / 50.0));
      const gravity = direction.multiplyScalar(gravityStrength);

      // Apply gravity force
      this.body.addForce({ x: gravity.x, y: gravity.y, z: gravity.z }, true);

      // Add slight auto-stabilization
      const up = positionVec.clone().normalize();
      const currentRotation = this.body.rotation();
      const currentUp = new THREE.Vector3(0, 1, 0).applyQuaternion(
        new THREE.Quaternion(currentRotation.x, currentRotation.y, currentRotation.z, currentRotation.w)
      );

      const stabilizationTorque = new THREE.Vector3().crossVectors(currentUp, up).multiplyScalar(0.5);
      this.body.addTorque({ x: stabilizationTorque.x, y: stabilizationTorque.y, z: stabilizationTorque.z }, true);
    }
  }
}
