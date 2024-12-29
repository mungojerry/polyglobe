import RAPIER from "@dimforge/rapier3d";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { debugManager } from "../managers/debugManager";
import { terrainHelper } from "../planet/terrainHelper";
import { BaseGameObject, IGameObject } from "./BaseGameObject";

export class Player extends BaseGameObject implements IGameObject {
  private thrustArrowHelper: THREE.ArrowHelper;
  private velocityArrowHelper: THREE.ArrowHelper;
  private gravityArrowHelper: THREE.ArrowHelper;

  constructor(scene: THREE.Scene, world: RAPIER.World, initPos: THREE.Vector3) {
    super(scene, initPos, world, "player");
    this.body.setLinearDamping(0.8);
    this.body.setAngularDamping(0.8);
    this.rotationSpeed = 0.1;
    this.thrustForce = 1;
    this.movementForce = 0.9;
    const loader = new GLTFLoader();

    loader.load("assets/models/wooden_ufo_toy.glb", (gltf) => {
      console.log("loaded saucer");
      this.objectMesh = gltf.scene;

      let mesh: THREE.Mesh;
      this.objectMesh.traverse((child) => {
        if (!mesh && child instanceof THREE.Mesh) {
          mesh = child;
        }
      });

      const geometry = mesh!.geometry;

      // Compute the bounding box to determine the model's dimensions
      geometry.computeBoundingBox();
      const boundingBox = geometry.boundingBox;
      if (!boundingBox) {
        console.error("Failed to compute bounding box for the model.");
        return;
      }

      // Calculate the center and size of the bounding box
      const center = new THREE.Vector3();
      boundingBox.getCenter(center);
      const size = new THREE.Vector3();
      boundingBox.getSize(size);

      // Create a cuboid collider based on the bounding box dimensions
      const halfExtents = new RAPIER.Vector3(size.x / 2, size.y / 2, size.z / 2);
      const colliderDesc = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
        .setFriction(0.9)
        .setRestitution(0.5) // Adjusted restitution for realistic collisions
        .setDensity(1.0); // Using density instead of setMass for dynamic bodies

      // Attach the collider to the player's rigid body
      world.createCollider(colliderDesc, this.body);

      this.object.add(this.objectMesh);
      this.object.position.set(initPos.x, initPos.y, initPos.z);

      scene.add(this.object);
      this.object.frustumCulled = false;
    });

    // Setup object and add to scene
    this.move = 0;

    // Setup keyboard controls
    document.addEventListener("keydown", this.handleKeyDown.bind(this));
    document.addEventListener("keyup", this.handleKeyUp.bind(this));

    // Initialize arrow helpers
    const arrowLength = 1;
    const arrowColor = 0xffff00; // Yellow for thrust
    this.thrustArrowHelper = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), arrowLength, arrowColor);
    scene.add(this.thrustArrowHelper);

    const velocityColor = 0x00ff00; // Green for velocity
    this.velocityArrowHelper = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), arrowLength, velocityColor);
    scene.add(this.velocityArrowHelper);

    const gravityColor = 0xff0000; // Red for gravity
    this.gravityArrowHelper = new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 0), arrowLength, gravityColor);
    scene.add(this.gravityArrowHelper);
  }

  onHit() {
    console.log("Player hit");
  }

  private handleKeyDown(event: KeyboardEvent) {
    switch (event.key.toLowerCase()) {
      case "w":
        this.move = 1;
        break;
      case "s":
        this.move = -1;
        break;
      case "a":
        this.rotationDirection = 1;
        break;
      case "d":
        this.rotationDirection = -1;
        break;
      case " ":
        this.thrusting = true;
        break;
      case "t":
        this.shoot();
        break;
    }
  }

  private handleKeyUp(event: KeyboardEvent) {
    switch (event.key.toLowerCase()) {
      case "w":
      case "s":
        this.move = 0;
        break;
      case "a":
      case "d":
        this.rotationDirection = 0;
        break;
      case " ":
        this.thrusting = false;
        break;
    }
  }

  protected thrust() {
    super.thrust();
    const upDirection = this.object.position.clone().normalize();
    // Update thrust arrow helper
    this.thrustArrowHelper.setDirection(upDirection);
    this.thrustArrowHelper.setLength(this.thrustForce);
    this.thrustArrowHelper.position.copy(this.object.position);
  }

  updateGravityArrow(force: RAPIER.Vector3) {
    const physVector = new THREE.Vector3(force.x, force.y, force.z);
    const gravityDirection = physVector.clone().normalize();
    const gravityMagnitude = physVector.length();

    this.gravityArrowHelper.setDirection(gravityDirection);
    this.gravityArrowHelper.setLength(gravityMagnitude * 10);
    this.gravityArrowHelper.position.copy(this.object.position);
  }

  update(camera: THREE.Camera) {
    super.update(camera);
    const dir = this.getPosition();
    const h = terrainHelper.computeSurfaceHeight(dir.x, dir.y, dir.z);
    const e = terrainHelper.computeElevationMultiplier(h);
    console.log(h);
    debugManager.set("activetrail", "trail sprites: " + this.activeSprites.length);
  }
}
