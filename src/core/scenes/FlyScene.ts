// Import necessary modules
import RAPIER from "@dimforge/rapier3d";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// Define a configurable thrust force
const THRUST_FORCE = 1.0;
const LINEAR_DAMPING = 0.3; // Reduced from 2
const ANGULAR_DAMPING = 2; // Reduced from 5

const STABILIZATION_STRENGTH = 0.006; // Adjustable auto-level strength

// Rotation limits in radians
const MAX_PITCH = Math.PI / 2; // 45 degrees
const MAX_ROLL = Math.PI / 42; // 45 degrees

const ROTATION_CORRECTION_STRENGTH = 1; // Adjustable correction force

// Constants
const MOUSE_SENSITIVITY = 0.002;
const ROLL_SENSITIVITY = 0.1;

export class FlyScene {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private world: RAPIER.World;
  private shipBody: RAPIER.RigidBody | undefined;

  private roll: number = 0;
  private cameraOffset: THREE.Vector3;
  private shipModel: THREE.Group | null = null;
  private mousePosition: THREE.Vector2;
  private targetRotation: THREE.Quaternion;
  private thrustUp: boolean = false;
  private thrustDown: boolean = false;
  private rollAmount: number = 0;

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

    // Controls state

    this.thrustUp = false;
    this.thrustDown = false;
    this.roll = 0;

    // Camera follow setup
    this.cameraOffset = new THREE.Vector3(0, 3, 10);
    this.mousePosition = new THREE.Vector2();
    this.targetRotation = new THREE.Quaternion();
    window.addEventListener("wheel", this.handleMouseWheel.bind(this));

    // Add mouse controls
    document.addEventListener("mousemove", (event) => this.onMouseMove(event));
    document.addEventListener("pointerlockchange", () => this.onPointerLockChange());
    this.renderer.domElement.addEventListener("click", () => this.renderer.domElement.requestPointerLock());

    this.initialize();
  }

  private async initialize() {
    await this.loadShipModel();

    // Create physics body without joint constraints
    this.shipBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.newDynamic().setTranslation(0, 10, 0).setAngularDamping(ANGULAR_DAMPING).setLinearDamping(LINEAR_DAMPING)
    );

    this.world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5), this.shipBody);

    // Ground geometry with grid
    const groundGeometry = new THREE.PlaneGeometry(400, 400, 50, 50);
    groundGeometry.rotateX(-Math.PI / 2);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x228b22, wireframe: false });
    const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    groundMesh.receiveShadow = true;
    this.scene.add(groundMesh);

    const gridHelper = new THREE.GridHelper(400, 50, 0x000000, 0x000000);
    gridHelper.position.y = 0.1;
    this.scene.add(gridHelper);

    const groundBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.newStatic());
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(200, 0.1, 200).setTranslation(0, 0, 0), groundBody);

    // Input handling
    window.addEventListener("keydown", (event) => this.onKeyDown(event));
    window.addEventListener("keyup", (event) => this.onKeyUp(event));

    window.addEventListener("resize", () => this.onWindowResize());

    this.animate();
  }

  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private updateCamera(): void {
    if (this.shipModel) {
      const shipPosition = this.shipModel.position;
      this.camera.position.lerp(shipPosition.clone().add(this.cameraOffset), 0.9);
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

  private onMouseMove(event: MouseEvent): void {
    if (document.pointerLockElement === this.renderer.domElement) {
      this.mousePosition.x += event.movementX * MOUSE_SENSITIVITY;
      this.mousePosition.y += event.movementY * MOUSE_SENSITIVITY;
      this.mousePosition.y = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.mousePosition.y));
    }
  }

  private onPointerLockChange(): void {
    if (document.pointerLockElement !== this.renderer.domElement) {
      this.mousePosition.set(0, 0);
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    switch (event.code.toLowerCase()) {
      case "space":
        this.thrustUp = true;
        break;
      case "shiftleft":
        this.thrustDown = true;
        break;
    }
  }

  private onKeyUp(event: KeyboardEvent): void {
    switch (event.code.toLowerCase()) {
      case "space":
        this.thrustUp = false;
        break;
      case "shiftleft":
        this.thrustDown = false;
        break;
    }
  }
  private getCurrentRotation(): THREE.Euler {
    if (!this.shipBody) return new THREE.Euler();

    const rotation = this.shipBody.rotation();
    const euler = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w));

    // Normalize angles to [-π, π]
    euler.x = ((euler.x + Math.PI) % (2 * Math.PI)) - Math.PI;
    euler.z = ((euler.z + Math.PI) % (2 * Math.PI)) - Math.PI;

    return euler;
  }

  private getLimitCorrectionTorque(): { x: number; y: number; z: number } {
    if (!this.shipBody) return { x: 0, y: 0, z: 0 };

    const currentRotation = this.getCurrentRotation();
    let correctionX = 0;
    let correctionZ = 0;

    // Calculate correction for pitch
    if (Math.abs(currentRotation.x) > MAX_PITCH) {
      const overRotation = Math.abs(currentRotation.x) - MAX_PITCH;
      correctionX = -Math.sign(currentRotation.x) * overRotation * ROTATION_CORRECTION_STRENGTH;
    }

    // Calculate correction for roll
    if (Math.abs(currentRotation.z) > MAX_ROLL) {
      const overRotation = Math.abs(currentRotation.z) - MAX_ROLL;
      correctionZ = -Math.sign(currentRotation.z) * overRotation * ROTATION_CORRECTION_STRENGTH;
    }

    return { x: correctionX, y: 0, z: correctionZ };
  }

  private animate(): void {
    if (!this.shipModel || !this.shipBody) return;
    requestAnimationFrame(() => this.animate());

    this.updateShipRotation();

    if (this.thrustUp || this.thrustDown) {
      const rotation = this.shipBody.rotation();
      const quaternion = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
      const thrustDirection = new THREE.Vector3(0, this.thrustUp ? 1 : -1, 0);
      thrustDirection.applyQuaternion(quaternion);

      this.shipBody.applyImpulse(
        {
          x: thrustDirection.x * THRUST_FORCE,
          y: thrustDirection.y * THRUST_FORCE,
          z: thrustDirection.z * THRUST_FORCE,
        },
        true
      );
    }

    // Apply stabilization when no input
    // const stabilizationTorque = this.getStabilizationTorque();
    // this.shipBody.applyTorqueImpulse(stabilizationTorque, true);

    // // Apply limit correction torque
    // const correctionTorque = this.getLimitCorrectionTorque();
    // this.shipBody.applyTorqueImpulse(correctionTorque, true);

    // Sync visual model with physics body
    const translation = this.shipBody.translation();
    const rotation = this.shipBody.rotation();

    this.shipModel.position.set(translation.x, translation.y, translation.z);
    this.shipModel.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

    // Update ship rotation based on mouse
    if (this.shipBody) {
      const euler = new THREE.Euler(-this.mousePosition.y, -this.mousePosition.x, 0, "YXZ");
      this.targetRotation.setFromEuler(euler);

      const currentRot = new THREE.Quaternion().setFromEuler(this.getCurrentRotation());
      currentRot.slerp(this.targetRotation, 0.1);

      this.shipBody.setRotation(currentRot, true);
    }

    this.updateCamera();
    this.world.step();
    this.renderer.render(this.scene, this.camera);
  }

  private handleMouseWheel(event: WheelEvent): void {
    if (document.pointerLockElement === this.renderer.domElement) {
      this.rollAmount += Math.sign(event.deltaY) * ROLL_SENSITIVITY;
    }
  }

  private updateShipRotation(): void {
    if (!this.shipBody) return;

    // Y movement affects pitch (X rotation), X movement affects roll (Z rotation)
    const euler = new THREE.Euler(-this.mousePosition.y, 0, -this.mousePosition.x, "XYZ");

    const targetQuat = new THREE.Quaternion().setFromEuler(euler);
    const currentRot = new THREE.Quaternion().setFromEuler(this.getCurrentRotation());
    currentRot.slerp(targetQuat, 0.1);

    this.shipBody.setRotation(currentRot, true);
  }
}
