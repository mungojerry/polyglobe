import RAPIER from "@dimforge/rapier3d";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// Constants
const THRUST_FORCE = 1.5;
const LINEAR_DAMPING = 1.0;
const PLANET_RADIUS = 300;
const GRAVITY_STRENGTH = 40.0;
const MAX_VELOCITY = 150;
const SHIP_START_HEIGHT = PLANET_RADIUS + 10;
const ROTATION_RATE = 0.05;

const COLLISION_MASKS = {
  PLANET: 0xffffffff,
  SHIP: 0xffffffff,
};

export class ZarchFlyScene {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private world: RAPIER.World;
  private shipBody: RAPIER.RigidBody | undefined;
  private planetBody: RAPIER.RigidBody | undefined;
  private shipModel: THREE.Group | null = null;
  private thrustActive: boolean = false;

  // Target angles for ship rotation
  private targetRotationX: number = 0;
  private targetRotationY: number = 0;
  private targetRotationZ: number = 0;

  // Current mouse state
  private mouseX: number = 0;
  private mouseY: number = 0;
  private screenCenterX: number = 0;
  private screenCenterY: number = 0;

  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(this.renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 20, 10);
    this.scene.add(directionalLight);

    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });

    this.updateScreenCenter();
    this.initialize();
  }

  private updateScreenCenter(): void {
    this.screenCenterX = window.innerWidth / 2;
    this.screenCenterY = window.innerHeight / 2;
  }

  private async initialize(): Promise<void> {
    await this.createShip();
    this.createPlanet();
    this.setupEventListeners();
    this.animate();
  }

  private setupEventListeners(): void {
    window.addEventListener("mousemove", (event) => {
      this.mouseX = event.clientX;
      this.mouseY = event.clientY;
    });

    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.updateScreenCenter();
    });

    window.addEventListener("keydown", (event) => {
      if (event.code === "Space") this.thrustActive = true;
    });

    window.addEventListener("keyup", (event) => {
      if (event.code === "Space") this.thrustActive = false;
    });
  }

  private async createShip(): Promise<void> {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.load(
        "assets/models/wooden_ufo_toy.glb",
        (gltf) => {
          this.shipModel = gltf.scene;
          this.shipModel.scale.set(1.5, 1.5, 1.5);
          this.scene.add(this.shipModel);

          const startPos = new THREE.Vector3(0, SHIP_START_HEIGHT, 0);
          const rigidBodyDesc = new RAPIER.RigidBodyDesc(RAPIER.RigidBodyType.Dynamic)
            .setTranslation(startPos.x, startPos.y, startPos.z)
            .setLinearDamping(LINEAR_DAMPING)
            .setAngularDamping(0.9)
            .setAdditionalMass(1.0);

          this.shipBody = this.world.createRigidBody(rigidBodyDesc);

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
        reject
      );
    });
  }

  private createPlanet(): void {
    const geometry = new THREE.SphereGeometry(PLANET_RADIUS, 64, 64);
    const material = new THREE.MeshStandardMaterial({
      color: 0x33ff66,
      wireframe: true,
      roughness: 0.8,
    });

    const planet = new THREE.Mesh(geometry, material);
    this.scene.add(planet);

    const rigidBodyDesc = new RAPIER.RigidBodyDesc(RAPIER.RigidBodyType.Fixed).setTranslation(0, 0, 0);
    this.planetBody = this.world.createRigidBody(rigidBodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.ball(PLANET_RADIUS)
      .setCollisionGroups(COLLISION_MASKS.PLANET)
      .setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL)
      .setFriction(0.5)
      .setRestitution(0.2);

    this.world.createCollider(colliderDesc, this.planetBody);
  }

  private updateRotation(): void {
    if (!this.shipBody) return;

    // Calculate relative mouse position (-1 to 1 range)
    const relativeX = (this.mouseX - this.screenCenterX) / this.screenCenterX;
    const relativeY = (this.mouseY - this.screenCenterY) / this.screenCenterY;

    // Get current ship orientation relative to planet
    const pos = this.shipBody.translation();
    const shipPos = new THREE.Vector3(pos.x, pos.y, pos.z);
    const upVector = shipPos.clone().normalize();

    // Create a quaternion for our base orientation relative to planet
    const baseOrientation = new THREE.Quaternion();
    const worldUp = new THREE.Vector3(0, 1, 0);
    baseOrientation.setFromUnitVectors(worldUp, upVector);

    // Create rotation quaternion based on mouse position
    const euler = new THREE.Euler(
      -relativeY * Math.PI * 0.4, // Pitch (based on Y mouse position)
      -relativeX * Math.PI * 0.94, // Yaw (based on X mouse position)
      0, // Roll (can be added if needed)
      "YXZ"
    );
    const targetQuat = new THREE.Quaternion().setFromEuler(euler);

    // Combine base orientation with target rotation
    const finalQuat = baseOrientation.multiply(targetQuat);

    // Get current rotation
    const currentRotation = new THREE.Quaternion(
      this.shipBody.rotation().x,
      this.shipBody.rotation().y,
      this.shipBody.rotation().z,
      this.shipBody.rotation().w
    );

    // Smoothly interpolate to target rotation
    currentRotation.slerp(finalQuat, ROTATION_RATE);

    // Apply final rotation
    this.shipBody.setRotation(currentRotation, true);
  }

  private updateMovement(): void {
    if (!this.shipBody || !this.thrustActive) return;

    const rotation = this.shipBody.rotation();
    const quat = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
    const thrustDirection = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);

    this.shipBody.applyImpulse(
      {
        x: thrustDirection.x * THRUST_FORCE,
        y: thrustDirection.y * THRUST_FORCE,
        z: thrustDirection.z * THRUST_FORCE,
      },
      true
    );

    // Apply velocity limits
    const vel = this.shipBody.linvel();
    const velocity = new THREE.Vector3(vel.x, vel.y, vel.z);
    if (velocity.length() > MAX_VELOCITY) {
      velocity.normalize().multiplyScalar(MAX_VELOCITY);
      this.shipBody.setLinvel({ x: velocity.x, y: velocity.y, z: velocity.z }, true);
    }
  }

  private updateGravity(): void {
    if (!this.shipBody) return;

    const pos = this.shipBody.translation();
    const shipPos = new THREE.Vector3(pos.x, pos.y, pos.z);
    const distanceToCenter = shipPos.length();

    const gravityScale = GRAVITY_STRENGTH * (1000 / (distanceToCenter * distanceToCenter));
    const gravityDir = shipPos.normalize().multiplyScalar(-gravityScale);

    this.shipBody.applyImpulse(
      {
        x: gravityDir.x,
        y: gravityDir.y,
        z: gravityDir.z,
      },
      true
    );
  }

  // private updateCamera(): void {
  //   if (!this.shipModel) return;

  //   const shipPos = this.shipModel.position;
  //   const upVector = shipPos.clone().normalize();

  //   // Position camera behind and slightly above ship
  //   const offset = new THREE.Vector3(0, 3, 15);
  //   const shipRotation = this.shipModel.quaternion;
  //   offset.applyQuaternion(shipRotation);

  //   const targetCameraPos = shipPos.clone().add(offset);
  //   this.camera.position.lerp(targetCameraPos, 0.1);

  //   // Orient camera to look at ship
  //   this.camera.up.copy(upVector);
  //   this.camera.lookAt(shipPos);
  // }

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
    this.camera.position.lerp(targetPos, 0.8);

    // Orient camera
    this.camera.up.copy(upVector);
    this.camera.lookAt(shipPos);
  }
  private animate(): void {
    requestAnimationFrame(() => this.animate());

    if (!this.shipModel || !this.shipBody) return;

    this.updateRotation();
    this.updateMovement();
    this.updateGravity();

    // Update ship model position and rotation
    const translation = this.shipBody.translation();
    const rotation = this.shipBody.rotation();
    this.shipModel.position.set(translation.x, translation.y, translation.z);
    this.shipModel.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

    this.updateCamera();
    this.world.step();
    this.renderer.render(this.scene, this.camera);
  }
}
