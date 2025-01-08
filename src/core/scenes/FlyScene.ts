// Import necessary modules
import RAPIER from "@dimforge/rapier3d";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// Define a configurable thrust force
// Updated constants for better handling
const THRUST_FORCE = 1.0; // Doubled for more responsive acceleration
const LINEAR_DAMPING = 1.0; // Increased for tighter stopping
const ROLL_SENSITIVITY = 2; // Added for mouse wheel roll control

const PLANET_RADIUS = 300;
const GRAVITY_STRENGTH = 20.0; // Reduced further for more forgiving flight
const MAX_VELOCITY = 150; // Increased for higher top speed
const SHIP_START_HEIGHT = PLANET_RADIUS + 10;

const ROTATION_SMOOTHING = 0.05; // Reduced from 0.1

const COLLISION_MASKS = {
  PLANET: 0xffffffff, // Collide with everything
  SHIP: 0xffffffff, // Collide with everything
};

const SHIP_MASS = 1.0;
const PLANET_MASS = 1000.0;

export class FlyScene {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private world: RAPIER.World;
  private shipBody: RAPIER.RigidBody | undefined;
  private planetBody: RAPIER.RigidBody | undefined;

  private shipModel: THREE.Group | null = null;
  private mousePosition: THREE.Vector2;
  private thrustUp: boolean = false;
  private thrustDown: boolean = false;
  private rollAmount: number = 0;
  private planet!: THREE.Mesh;

  private mouseRotation: THREE.Euler = new THREE.Euler(0, 0, 0, "YXZ");
  private desiredRotation: THREE.Quaternion = new THREE.Quaternion();

  private screenCenter: THREE.Vector2;
  private mouseScreenPosition: THREE.Vector2;

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
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 }); // Remove default gravity

    this.thrustUp = false;
    this.thrustDown = false;

    // Camera follow setup
    this.mousePosition = new THREE.Vector2();
    window.addEventListener("wheel", this.handleMouseWheel.bind(this));

    this.screenCenter = new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2);
    this.mouseScreenPosition = new THREE.Vector2(this.screenCenter.x, this.screenCenter.y);

    this.initialize();
  }

  private async initialize() {
    await this.createShip();
    this.createPlanet();

    // Input handling
    window.addEventListener("keydown", (event) => this.onKeyDown(event));
    window.addEventListener("keyup", (event) => this.onKeyUp(event));

    window.addEventListener("resize", () => this.onWindowResize());

    // Add mouse controls
    document.addEventListener("mousemove", (event) => this.onMouseMove(event));
    document.addEventListener("pointerlockchange", () => this.onPointerLockChange());
    //  this.renderer.domElement.addEventListener("click", () => this.renderer.domElement.requestPointerLock());

    this.animate();
  }

  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.screenCenter.set(window.innerWidth / 2, window.innerHeight / 2);
  }
  private updateCamera(): void {
    if (!this.shipModel) return;

    const shipPos = this.shipModel.position;

    // Calculate up vector (from planet center to ship)
    const upVector = shipPos.clone().normalize();

    // Create right vector
    const right = new THREE.Vector3(0, 0, 1).cross(upVector).normalize();

    // Create forward vector perpendicular to up and right
    const forward = upVector.clone().cross(right);

    // Create rotation matrix from these vectors
    const rotationMatrix = new THREE.Matrix4();
    rotationMatrix.makeBasis(right, upVector, forward);

    // Apply camera offset in this local space
    const offset = new THREE.Vector3(0, 3, 10);
    offset.applyMatrix4(rotationMatrix);

    // Calculate final camera position
    const targetPos = shipPos.clone().add(offset);

    // Smooth camera movement
    this.camera.position.lerp(targetPos, 0.1);

    // Orient camera
    this.camera.up.copy(upVector);
    this.camera.lookAt(shipPos);
  }

  private createShip(): Promise<void> {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.load(
        "assets/models/wooden_ufo_toy.glb",
        (gltf) => {
          this.shipModel = gltf.scene;
          this.shipModel.scale.set(1.5, 1.5, 1.5); // Adjust scale as needed
          this.scene.add(this.shipModel);

          // Position ship above planet surface
          const startPos = new THREE.Vector3(0, SHIP_START_HEIGHT, 0);

          // Create static RigidBody for planet
          const rigidBodyDesc = new RAPIER.RigidBodyDesc(RAPIER.RigidBodyType.Dynamic)
            .setTranslation(startPos.x, startPos.y, startPos.z)
            .setLinearDamping(LINEAR_DAMPING)
            .setAngularDamping(0.9)
            .setAdditionalMass(SHIP_MASS);
          this.shipBody = this.world.createRigidBody(rigidBodyDesc);

          // Ship collider with collision group
          const shipCollider = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5)
            .setCollisionGroups(COLLISION_MASKS.SHIP)
            .setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL)
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
            .setFriction(0.2)
            .setRestitution(0.9);
          this.world.createCollider(shipCollider, this.shipBody);
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
    // Update actual screen position of mouse
    this.mouseScreenPosition.x += event.movementX;
    this.mouseScreenPosition.y += event.movementY;

    // Clamp to screen bounds
    this.mouseScreenPosition.x = Math.max(0, Math.min(window.innerWidth, this.mouseScreenPosition.x));
    this.mouseScreenPosition.y = Math.max(0, Math.min(window.innerHeight, this.mouseScreenPosition.y));

    // Calculate relative position from center (-1 to 1 range)
    const relativeX = (this.mouseScreenPosition.x - this.screenCenter.x) / (window.innerWidth / 2);
    const relativeY = (this.mouseScreenPosition.y - this.screenCenter.y) / (window.innerHeight / 2);

    // Update mouse position with relative values and sensitivity
    this.mousePosition.x = Math.max(-1, Math.min(1, relativeX)) * Math.PI;
    this.mousePosition.y = Math.max(-1, Math.min(1, relativeY)) * (Math.PI / 2.5);

    // Directly apply pitch and roll based on mouse movement
    this.rollAmount = relativeX * ROLL_SENSITIVITY;
    this.mouseRotation.x = relativeY * ROLL_SENSITIVITY;
  }

  private onPointerLockChange(): void {
    if (document.pointerLockElement !== this.renderer.domElement) {
      // Reset local rotation when pointer lock is released
      this.mouseRotation.set(0, 0, 0);
      this.desiredRotation.identity();

      this.mouseScreenPosition.copy(this.screenCenter);
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

  private animate(): void {
    if (!this.shipModel || !this.shipBody) return;
    requestAnimationFrame(() => this.animate());

    this.updateGravity();
    this.updateShipRotation(); // This will now handle all rotation

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

    const translation = this.shipBody.translation();
    const rotation = this.shipBody.rotation();

    this.shipModel.position.set(translation.x, translation.y, translation.z);
    this.shipModel.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

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

    const pos = this.shipBody.translation();
    const shipPos = new THREE.Vector3(pos.x, pos.y, pos.z);

    // Up vector (from planet center to ship)
    const upVector = shipPos.clone().normalize();

    // Calculate the base orientation on the planet surface
    const worldForward = new THREE.Vector3(0, 0, 1);
    const right = worldForward.cross(upVector).normalize();
    const forward = upVector.clone().cross(right).normalize();

    // Surface-aligned basis matrix
    let surfaceMatrix = new THREE.Matrix4().makeBasis(right, upVector, forward);

    // Apply pitch and roll
    const pitchMatrix = new THREE.Matrix4().makeRotationAxis(right, this.mouseRotation.x);
    const rollMatrix = new THREE.Matrix4().makeRotationAxis(forward, this.rollAmount);

    const finalMatrix = surfaceMatrix.clone().multiply(rollMatrix).multiply(pitchMatrix);

    const finalRotation = new THREE.Quaternion().setFromRotationMatrix(finalMatrix);

    const currentRot = new THREE.Quaternion(this.shipBody.rotation().x, this.shipBody.rotation().y, this.shipBody.rotation().z, this.shipBody.rotation().w);

    currentRot.slerp(finalRotation, ROTATION_SMOOTHING);

    this.shipBody.setRotation(currentRot, true);
  }
  private createPlanet(): void {
    const geometry = new THREE.SphereGeometry(PLANET_RADIUS, 64, 64);
    const material = new THREE.MeshStandardMaterial({
      color: 0x33ff66,
      wireframe: true,
      roughness: 0.8,
    });

    this.planet = new THREE.Mesh(geometry, material);
    this.scene.add(this.planet);

    // Create static RigidBody for planet
    const rigidBodyDesc = new RAPIER.RigidBodyDesc(RAPIER.RigidBodyType.Fixed).setTranslation(0, 0, 0);
    this.planetBody = this.world.createRigidBody(rigidBodyDesc);

    // Create spherical collider
    // Create spherical collider
    const colliderDesc = RAPIER.ColliderDesc.ball(PLANET_RADIUS)
      .setCollisionGroups(COLLISION_MASKS.PLANET)
      .setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL)
      .setFriction(0.5)
      .setRestitution(0.2);

    this.world.createCollider(colliderDesc, this.planetBody);
  }

  private updateGravity(): void {
    if (!this.shipBody) return;

    const pos = this.shipBody.translation();
    const shipPos = new THREE.Vector3(pos.x, pos.y, pos.z);
    const distanceToCenter = shipPos.length();

    // Scale gravity by inverse square law
    const gravityScale = GRAVITY_STRENGTH * (PLANET_MASS / (distanceToCenter * distanceToCenter));
    const gravityDir = shipPos.normalize().multiplyScalar(-gravityScale);

    this.shipBody.applyImpulse(
      {
        x: gravityDir.x,
        y: gravityDir.y,
        z: gravityDir.z,
      },
      true
    );

    // Limit velocity
    const vel = this.shipBody.linvel();
    const velocity = new THREE.Vector3(vel.x, vel.y, vel.z);
    if (velocity.length() > MAX_VELOCITY) {
      velocity.normalize().multiplyScalar(MAX_VELOCITY);
      this.shipBody.setLinvel({ x: velocity.x, y: velocity.y, z: velocity.z }, true);
    }
  }
}
