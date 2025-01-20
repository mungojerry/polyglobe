import RAPIER from "@dimforge/rapier3d";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { FlyingEntity, IFlyingEntity } from "./FlyingEntity";
const PLANET_RADIUS = 1300;
const LINEAR_DAMPING = 0.2; // Reduced for more responsive movement
const ANGULAR_DAMPING = 2.0; // Reduced for smoother rotation
const SHIP_START_HEIGHT = PLANET_RADIUS + 50;
const COLLISION_MASKS = {
  PLANET: 0xffffffff,
  SHIP: 0xffffffff,
};
export class PlayerEntity extends FlyingEntity implements IFlyingEntity {
  private screenCenterX: number = 0;
  private screenCenterY: number = 0;
  private isPointerLocked: boolean = true;
  private crosshair: HTMLDivElement;
  private cursorX: number = 0;
  private cursorY: number = 0;

  constructor(scene: THREE.Scene, world: RAPIER.World, initPos: THREE.Vector3, private renderer: THREE.WebGLRenderer) {
    super(scene, initPos, world, "player_entity");
    this.object = new THREE.Object3D();
    // Create and style the crosshair element
    this.crosshair = document.createElement("div");
    this.crosshair.style.position = "fixed";
    this.crosshair.style.width = "32px";
    this.crosshair.style.height = "32px";
    this.crosshair.style.backgroundImage = "url(assets/textures/crosshair.svg)";
    this.crosshair.style.backgroundSize = "contain";
    this.crosshair.style.backgroundRepeat = "no-repeat";
    this.crosshair.style.pointerEvents = "none";
    this.crosshair.style.zIndex = "1000";
    this.crosshair.style.transform = "translate(-50%, -50%)";
    document.body.style.cursor = "none";

    document.body.appendChild(this.crosshair);

    const loader = new GLTFLoader();

    loader.load("assets/models/wooden_ufo_toy.glb", (gltf) => {
      console.log("loaded saucer");
      const objectMesh = gltf.scene;
      console.log(objectMesh);
      objectMesh.scale.setScalar(1);
      let mesh: THREE.Mesh;

      objectMesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (!mesh) mesh = child;
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

      const startPos = new THREE.Vector3(0, SHIP_START_HEIGHT, 0);
      const rigidBodyDesc = new RAPIER.RigidBodyDesc(RAPIER.RigidBodyType.Dynamic)
        .setTranslation(startPos.x, startPos.y, startPos.z)
        .setLinearDamping(LINEAR_DAMPING)
        .setAngularDamping(ANGULAR_DAMPING)
        .setAdditionalMass(10); // Reduced mass for better responsiveness

      this.body = this.world.createRigidBody(rigidBodyDesc);

      const shipCollider = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5)
        .setCollisionGroups(COLLISION_MASKS.SHIP)
        .setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
        .setFriction(0.2)
        .setRestitution(0.9);

      this.world.createCollider(shipCollider, this.body);

      this.object.add(objectMesh);

      this.scene.add(this.object);
      this.object.frustumCulled = true;
    });

    // Setup object and add to scene
    this.move = 0;

    this.setupEventListeners();
  }

  onHit() {
    console.log("Player hit");
  }
  private setupEventListeners(): void {
    // Initialize cursor position to center
    this.cursorX = window.innerWidth / 2;
    this.cursorY = window.innerHeight / 2;
    this.screenCenterX = window.innerWidth / 2;
    this.screenCenterY = window.innerHeight / 2;

    // Mouse movement handler
    document.addEventListener("mousemove", (event) => {
      // Update cursor position based on movement
      this.cursorX = event.clientX; //Math.max(0, Math.min(window.innerWidth, this.cursorX + event.movementX));
      this.cursorY = event.clientY; //Math.max(0, Math.min(window.innerHeight, this.cursorY + event.movementY));

      // Update ship control values
      // this.mouseX = (this.cursorX - this.screenCenterX) / this.screenCenterX;
      // this.mouseY = (this.screenCenterY - this.cursorY) / this.screenCenterY;

      this.mouseX = (event.clientX - this.screenCenterX) / this.screenCenterX;
      this.mouseY = (event.clientY - this.screenCenterY) / this.screenCenterY;

      // Clamp values to -1 to 1
      this.mouseX = Math.max(-1, Math.min(1, this.mouseX));
      this.mouseY = Math.max(-1, Math.min(1, this.mouseY));

      // Update crosshair position
      this.crosshair.style.left = `${this.cursorX}px`;
      this.crosshair.style.top = `${this.cursorY}px`;
    });

    // Key handlers
    window.addEventListener("keydown", (event) => {
      if (event.code === "Space") {
        this.thrustActive = true;
      } else if (event.code === "Escape" && this.isPointerLocked) {
        document.exitPointerLock();
      }
    });

    window.addEventListener("keyup", (event) => {
      if (event.code === "Space") {
        this.thrustActive = false;
      }
    });

    // Update screen center on resize
    window.addEventListener("resize", () => {
      this.screenCenterX = window.innerWidth / 2;
      this.screenCenterY = window.innerHeight / 2;
    });
  }
}
