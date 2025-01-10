import RAPIER from "@dimforge/rapier3d";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise";
import { vectorPool } from "../utils/vectorPool";

// Constants
const THRUST_FORCE = 50;
const LINEAR_DAMPING = 0.3;
const ANGULAR_DAMPING = 4.9;
const PLANET_RADIUS = 1300;
const GRAVITY_STRENGTH = 9.8 * 20; //20;
const MAX_VELOCITY = 100;
const SHIP_START_HEIGHT = PLANET_RADIUS + 10;
const ROTATION_RATE = 0.1;

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

  // Current mouse state
  private mouseX: number = 0;
  private mouseY: number = 0;
  private screenCenterX: number = 0;
  private screenCenterY: number = 0;

  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(this.renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.15);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(1000, 2000, 1000);
    this.scene.add(directionalLight);

    const pointLight1 = new THREE.PointLight(0xffffff, 1);
    pointLight1.position.set(2000, 0, 0);
    this.scene.add(pointLight1);

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
            .setAngularDamping(ANGULAR_DAMPING)
            .setAdditionalMass(100);

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
    const simplex = new SimplexNoise();
    const geometry = new THREE.SphereGeometry(PLANET_RADIUS, 32, 32);
    const positions = geometry.attributes.position;

    // Apply noise to vertices
    for (let i = 0; i < positions.count; i++) {
      const vertex = new THREE.Vector3();
      vertex.fromBufferAttribute(positions, i);
      const scale = 1; // Increased frequency
      let amplitude = 20; // Increased height variation
      // Get normalized position for noise input
      const normalized = vertex.clone().normalize();

      // Apply noise
      // Apply multi-octave noise

      let noise = simplex.noise3d(normalized.x * scale, normalized.y * scale, normalized.z * scale) * amplitude;
      noise = noise * 0.5 + simplex.noise3d(normalized.x * scale, normalized.y * scale, normalized.z * scale) * (amplitude * 0.5);
      vertex.add(normalized.multiplyScalar(noise));

      // Update vertex
      positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }

    const material = new THREE.MeshStandardMaterial({
      color: 0x33ff66,
      flatShading: true,
      metalness: 0,
      roughness: 0.8,
      wireframe: true,
      // depthWrite: true,
    });

    const planet = new THREE.Mesh(geometry, material);
    planet.castShadow = true;
    planet.receiveShadow = true;
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

  private mouseDeltaX = 0;
  private mouseDeltaY = 0;
  private readonly MOUSE_SMOOTHING = 0.95; // Higher = smoother but less responsive
  private readonly MOUSE_SENSITIVITY = 0.002; // Lower = less sensitive
  private updateRotation(): void {
    if (!this.shipBody) return;

    // 1. Get ship's position and up vector (surface normal)
    const pos = this.shipBody.translation();
    const shipPos = new THREE.Vector3(pos.x, pos.y, pos.z);
    const up = shipPos.clone().normalize();

    // 2. Get mouse position relative to screen center
    let deltaX = this.mouseX - this.screenCenterX;
    const deltaY = this.mouseY - this.screenCenterY;

    if (this.mouseY > this.screenCenterY) deltaX = -deltaX;
    // 3. Calculate normalized distances separately for X and Y
    const maxDistance = Math.sqrt(this.screenCenterX * this.screenCenterX + this.screenCenterY * this.screenCenterY);

    // X position affects yaw (which way the craft faces)
    const normalizedX = deltaX / maxDistance;
    // Y position affects pitch
    const normalizedY = deltaY / maxDistance;

    // 4. Calculate yaw based on X position
    const yawAngle = normalizedX * Math.PI;

    // 5. Calculate pitch based on Y position
    // Center (blue) = pointing up (-PI/2)
    // Edge (red) = pointing down (PI/2)
    const pitch = normalizedY * Math.PI * 2;

    // 6. Create base quaternion aligned with planet surface
    const baseQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);

    // 7. Create yaw rotation
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawAngle);

    // 8. Create pitch rotation
    const pitchQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch);

    // 9. Combine rotations: base * yaw * pitch
    let finalQuat = new THREE.Quaternion().multiplyQuaternions(baseQuat, yawQuat).multiply(pitchQuat);

    // 10. Smooth interpolation using ROTATION_RATE
    const currentRotation = new THREE.Quaternion(
      this.shipBody.rotation().x,
      this.shipBody.rotation().y,
      this.shipBody.rotation().z,
      this.shipBody.rotation().w
    );

    currentRotation.slerp(finalQuat, ROTATION_RATE);
    this.shipBody.setRotation(currentRotation, true);
  }

  private updateRotationWorking(): void {
    if (!this.shipBody) return;

    // Calculate vector from screen center to mouse
    let deltaX = this.mouseX - this.screenCenterX;
    let deltaY = this.mouseY - this.screenCenterY;

    // if (this.mouseY < this .screenCenterY) deltaX = -deltaX;

    // Increase the sensitivity of the yaw by applying a multiplier
    // const yawSensitivity = 2.0; // Adjust this value to make yaw more pronounced
    // deltaX *= yawSensitivity;
    // Calculate angle and normalized distance from center
    const angleToMouse = Math.atan2(deltaY, deltaX);
    const distanceFromCenter = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const maxDistance = Math.sqrt(this.screenCenterX * this.screenCenterX + this.screenCenterY * this.screenCenterY);
    const normalizedDistance = Math.min(distanceFromCenter / maxDistance, 1.0);

    // Get ship's position relative to planet center
    const pos = this.shipBody.translation();
    const shipPos = new THREE.Vector3(pos.x, pos.y, pos.z);
    const up = shipPos.clone().normalize();

    // Step 1: Create the base orientation aligned with planet surface
    const baseQuat = new THREE.Quaternion();
    baseQuat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);

    // Step 2: Create a direction vector based on mouse angle
    // This creates the base direction for the yaw
    const directionVector = new THREE.Vector3(
      Math.cos(angleToMouse), // X component
      0, // Y component (will be affected by pitch)
      Math.sin(angleToMouse) //// Z component
    ).normalize();

    // Step 3: Calculate pitch based on distance from center
    // 0 (center, blue) = straight up (-PI/2)
    // 1 (edge, red) = straight down (PI/2)
    // The purple zone is in between
    const basePitch = -Math.PI / 2; // Start pointing straight up
    const pitchRange = Math.PI; // Full 180-degree range
    const pitch = basePitch + normalizedDistance * pitchRange;

    // Apply pitch to the direction vector
    directionVector.applyAxisAngle(new THREE.Vector3(1, 0, 0), pitch);

    const baseYaw = -Math.PI / 2; // Start pointing straight up
    const yawRange = Math.PI; // Full 180-degree range
    const yaw = baseYaw + normalizedDistance * yawRange;

    // Apply pitch to the direction vector
    directionVector.applyAxisAngle(new THREE.Vector3(0, 0, 1), -yaw);

    // Step 4: Create quaternion that rotates from forward vector to our desired direction
    const dirQuat = new THREE.Quaternion();
    dirQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), directionVector);

    // Combine base alignment with direction rotation
    const finalQuat = new THREE.Quaternion();
    finalQuat.multiplyQuaternions(baseQuat, dirQuat);

    // Get current rotation and smoothly interpolate
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

    // Calculate the gravitational force based on the ship's mass
    const mass = this.shipBody.mass();
    const gravityScale = GRAVITY_STRENGTH * mass * (1000 / (distanceToCenter * distanceToCenter));
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

  //   // Calculate the up vector from the planet center to the ship
  //   const upVector = shipPos.clone().normalize();

  //   // Define spherical coordinates for the camera position relative to the ship
  //   const radius = 10; // Distance from the ship
  //   const theta = Math.PI / 4; // Angle from the vertical (elevation)
  //   const phi = Math.PI / 4; // Angle around the vertical axis (azimuth)

  //   // Convert spherical coordinates to Cartesian coordinates
  //   const offsetX = radius * Math.sin(theta) * Math.cos(phi);
  //   const offsetY = radius * Math.cos(theta);
  //   const offsetZ = radius * Math.sin(theta) * Math.sin(phi);

  //   // Calculate the target camera position
  //   const targetPos = new THREE.Vector3(shipPos.x + offsetX, shipPos.y + offsetY, shipPos.z + offsetZ);

  //   // Smooth camera movement
  //   this.camera.position.lerp(targetPos, 0.8);

  //   // Ensure the camera looks at the ship
  //   this.camera.lookAt(shipPos);

  //   // Set the camera's up vector to be perpendicular to the sphere surface
  //   this.camera.up.copy(upVector);
  // }

  private offset = new THREE.Vector3(0, 5, -8);
  private currentPosition = new THREE.Vector3(0, 0, 0);

  private currentLookAt = new THREE.Vector3();
  private lastValidForward: THREE.Vector3 | null = null;
  private updateCamera(position: THREE.Vector3, playerRotation: THREE.Quaternion): void {
    // Calculate up vector based on position relative to planet center
    const up = position.clone().normalize();

    // Use a constant forward direction (we don't want it to yaw)
    const forward = vectorPool.getVector(0, 0, 1);

    // Calculate right vector from up and forward
    const right = vectorPool.getVector().crossVectors(up, forward).normalize();

    // Recalculate forward to ensure it's perpendicular to up
    forward.crossVectors(right, up).normalize();

    // Calculate target position using offset
    const targetPosition = position.clone();
    targetPosition.add(up.multiplyScalar(this.offset.y));
    targetPosition.add(forward.multiplyScalar(this.offset.z));

    // Smooth camera movement
    const cameraLerp = 1;
    this.currentPosition.lerp(targetPosition, cameraLerp);
    this.camera.position.copy(this.currentPosition);
    this.currentLookAt.lerp(position, cameraLerp);
    this.camera.lookAt(this.currentLookAt);
    this.camera.up.copy(up);

    // Release vectors back to pool
    vectorPool.releaseVector(forward);
    vectorPool.releaseVector(right);
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

    this.updateCamera(this.shipModel.position.clone(), this.shipModel.quaternion.clone());
    this.world.step();
    this.renderer.render(this.scene, this.camera);
  }
}
