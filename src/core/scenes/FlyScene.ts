// Import necessary modules
import RAPIER from "@dimforge/rapier3d";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// Define a configurable thrust force
const THRUST_FORCE = 1;
export class FlyScene {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private world: RAPIER.World;
  // private shipMesh: THREE.Mesh;
  private shipBody: RAPIER.RigidBody;
  private keys: { [key: string]: boolean };
  private thrust: boolean;
  private pitch: number;
  private roll: number;
  private cameraOffset: THREE.Vector3;
  private shipModel: THREE.Group | null = null;

  constructor() {
    // Scene, camera, renderer setup
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 10, 20);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(this.renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    this.scene.add(directionalLight);

    // Physics setup
    this.world = new RAPIER.World({ x: 0, y: -19.81, z: 0 });
    this.initialize();
  }

  private async initialize() {
    await this.loadShipModel();
    // Physics body for the ship
    this.shipBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.newDynamic().setTranslation(0, 10, 0).setAngularDamping(5).setLinearDamping(2));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5), this.shipBody);

    // Ground geometry with grid
    const groundGeometry = new THREE.PlaneGeometry(400, 400, 50, 50);
    groundGeometry.rotateX(-Math.PI / 2);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x228b22, wireframe: false });
    const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    groundMesh.receiveShadow = true;
    this.scene.add(groundMesh);

    const gridHelper = new THREE.GridHelper(400, 50, 0x000000, 0x000000);
    this.scene.add(gridHelper);

    const groundBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.newStatic());
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(200, 0.1, 200).setTranslation(0, 0, 0), groundBody);

    // Controls state
    this.keys = {};
    this.thrust = false;
    this.pitch = 0;
    this.roll = 0;

    // Camera follow setup
    this.cameraOffset = new THREE.Vector3(0, 5, 15);

    // Input handling
    window.addEventListener("keydown", (event) => this.onKeyDown(event));
    window.addEventListener("keyup", (event) => this.onKeyUp(event));

    window.addEventListener("resize", () => this.onWindowResize());

    this.animate();
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.code === "Space") this.thrust = true;
    if (event.code === "ArrowUp") this.pitch = -1;
    if (event.code === "ArrowDown") this.pitch = 1;
    if (event.code === "ArrowLeft") this.roll = -1;
    if (event.code === "ArrowRight") this.roll = 1;
  }

  private onKeyUp(event: KeyboardEvent): void {
    if (event.code === "Space") this.thrust = false;
    if (event.code === "ArrowUp" || event.code === "ArrowDown") this.pitch *= 0.01;
    if (event.code === "ArrowLeft" || event.code === "ArrowRight") this.roll *= 0.01;
  }

  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private updateCamera(): void {
    if (this.shipModel) {
      const shipPosition = this.shipModel.position;
      this.camera.position.lerp(shipPosition.clone().add(this.cameraOffset), 0.1);
      this.camera.lookAt(shipPosition);
    }
  }

  private loadShipModel(): Promise<void> {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.load(
        "assets/models/wooden_ufo_toy.glb",
        (gltf) => {
          this.shipModel = gltf.scene;
          this.shipModel.scale.set(1.5, 1.5, 1.5); // Adjust scale as needed
          this.scene.add(this.shipModel);
          resolve();
        },
        undefined,
        (error) => {
          console.error("Error loading ship model:", error);
          reject(error);
        }
      );
    });
  }

  // Updated animate method with corrected thrust
  private animate(): void {
    if (!this.shipModel) return;
    requestAnimationFrame(() => this.animate());

    // Apply thrust
    if (this.thrust) {
      const thrustDirection = new THREE.Vector3(0, 1, 0); // Upward in local space
      if (this.shipModel) {
        thrustDirection.applyQuaternion(this.shipModel.quaternion); // Rotate to match ship's orientation
      }
      thrustDirection.normalize();
      this.shipBody.applyImpulse(
        {
          x: thrustDirection.x * THRUST_FORCE,
          y: thrustDirection.y * THRUST_FORCE,
          z: thrustDirection.z * THRUST_FORCE,
        },
        true
      );
    }

    // Smooth roll and pitch application
    const angularVelocity = new THREE.Euler(
      this.pitch * 0.05, // Forward/backward tilt
      0, // Yaw, if needed
      this.roll * 0.05 // Left/right roll
    );
    this.shipModel.rotation.x += angularVelocity.x;
    this.shipModel.rotation.z += angularVelocity.z;

    // Sync physics to visual position and rotation
    const shipTranslation = this.shipBody.translation();
    this.shipModel.position.set(shipTranslation.x, shipTranslation.y, shipTranslation.z);

    // Update camera
    this.updateCamera();

    // Step the physics world
    this.world.step();

    // Render the scene
    this.renderer.render(this.scene, this.camera);
  }
}
