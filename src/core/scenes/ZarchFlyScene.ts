import RAPIER from "@dimforge/rapier3d";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise";
import { DragBehavior, PlanetaryGravityBehavior } from "../particles/Behaviors";
import { ConeEmitter } from "../particles/Emitters";
import { ParticleSystem } from "../particles/ParticleSystem";
import { vectorPool } from "../utils/vectorPool";

// Constants
const THRUST_FORCE = 10; // Increased for better control
const LINEAR_DAMPING = 0.2; // Reduced for more responsive movement
const ANGULAR_DAMPING = 2.0; // Reduced for smoother rotation
const PLANET_RADIUS = 1300;
const GRAVITY_STRENGTH = 9.8 * 20; // Reduced gravity for better control
const MAX_VELOCITY = 150;
const SHIP_START_HEIGHT = PLANET_RADIUS + 50;
const ROTATION_RATE = 0.05; // Slower rotation for better control
const MAX_PITCH = Math.PI * 0.95; // Maximum pitch angle (about 72 degrees)
const MAX_ROLL = Math.PI * 0.95; // Maximum roll angle (about 54 degrees)
const MOUSE_SENSITIVITY = 0.003;

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
  private mouseX: number = 0;
  private mouseY: number = 0;
  private screenCenterX: number = 0;
  private screenCenterY: number = 0;
  private isPointerLocked: boolean = false;
  private currentPitch: number = 0;
  private currentRoll: number = 0;
  private crosshair: HTMLDivElement;
  private cursorX: number = 0;
  private cursorY: number = 0;

  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(this.renderer.domElement);

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
    document.body.appendChild(this.crosshair);

    // Hide the default cursor
    this.renderer.domElement.style.cursor = "none";

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.25);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
    directionalLight.position.set(0, 2000, 0);
    this.scene.add(directionalLight);

    const pointLight1 = new THREE.PointLight(0xffffff, 1);
    pointLight1.position.set(2000, 0, 0);
    this.scene.add(pointLight1);

    // Create and configure emitter for thrust

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
    // Mouse movement with pointer lock
    document.addEventListener("mousemove", (event) => {
      if (this.isPointerLocked) {
        // Update cursor position based on movement
        this.cursorX = Math.max(0, Math.min(window.innerWidth, this.cursorX + event.movementX));
        this.cursorY = Math.max(0, Math.min(window.innerHeight, this.cursorY + event.movementY));

        // Update ship control values
        this.mouseX += event.movementX * MOUSE_SENSITIVITY;
        this.mouseY += event.movementY * MOUSE_SENSITIVITY;
        this.mouseX = Math.max(-1, Math.min(1, this.mouseX));
        this.mouseY = Math.max(-1, Math.min(1, this.mouseY));
      } else {
        // Direct cursor position
        this.cursorX = event.clientX;
        this.cursorY = event.clientY;

        // Update ship control values
        this.mouseX = (event.clientX - this.screenCenterX) / this.screenCenterX;
        this.mouseY = (this.screenCenterY - event.clientY) / this.screenCenterY;
      }

      // Update crosshair position
      this.crosshair.style.left = `${this.cursorX}px`;
      this.crosshair.style.top = `${this.cursorY}px`;
    });

    // Pointer lock controls
    this.renderer.domElement.addEventListener("click", () => {
      if (!this.isPointerLocked) {
        this.renderer.domElement.requestPointerLock();
      }
    });

    document.addEventListener("pointerlockchange", () => {
      this.isPointerLocked = document.pointerLockElement === this.renderer.domElement;
      if (!this.isPointerLocked) {
        this.mouseX = 0;
        this.mouseY = 0;
        // Reset cursor to center when exiting pointer lock
        this.cursorX = window.innerWidth / 2;
        this.cursorY = window.innerHeight / 2;
        this.crosshair.style.left = `${this.cursorX}px`;
        this.crosshair.style.top = `${this.cursorY}px`;
      }
    });

    // Thrust control
    window.addEventListener("keydown", (event) => {
      if (event.code === "Space") {
        this.thrustActive = true;
      } else if (event.code === "Escape" && this.isPointerLocked) {
        document.exitPointerLock();
      }
    });

    window.addEventListener("keyup", (event) => {
      if (event.code === "Space") this.thrustActive = false;
    });

    // Window resize
    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.updateScreenCenter();
    });
  }

  particleSystem: ParticleSystem | null = null;

  private async createShip(): Promise<void> {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.load(
        "assets/models/wooden_ufo_toy.glb",
        (gltf) => {
          this.shipModel = gltf.scene;
          // Scale and rotate ship model to match thrust direction
          this.shipModel.scale.set(1.5, 1.5, 1.5);
          this.shipModel.rotation.x = Math.PI; // Rotate 180 degrees to point engines down
          this.scene.add(this.shipModel);

          const startPos = new THREE.Vector3(0, SHIP_START_HEIGHT, 0);
          const rigidBodyDesc = new RAPIER.RigidBodyDesc(RAPIER.RigidBodyType.Dynamic)
            .setTranslation(startPos.x, startPos.y, startPos.z)
            .setLinearDamping(LINEAR_DAMPING)
            .setAngularDamping(ANGULAR_DAMPING)
            .setAdditionalMass(20); // Reduced mass for better responsiveness

          this.shipBody = this.world.createRigidBody(rigidBodyDesc);

          const shipCollider = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5)
            .setCollisionGroups(COLLISION_MASKS.SHIP)
            .setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL)
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
            .setFriction(0.2)
            .setRestitution(0.9);

          this.world.createCollider(shipCollider, this.shipBody);

          this.particleSystem = this.createThrustEffect();
          this.scene.add(this.particleSystem);
          resolve();
        },
        undefined,
        reject
      );
    });
  }

  emitter!: ConeEmitter;
  private gravityBehavior!: PlanetaryGravityBehavior;

  createThrustEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    // Create emitter at position and point downward
    const emitterPos = position.clone();
    // Even narrower cone angle (5 degrees) and faster initial velocity
    this.emitter = new ConeEmitter(
      emitterPos,
      0.01, // Narrower spread
      2, // Smaller cone angle
      () => Math.random() * 3 + 2 // Faster initial velocity
    );
    const direction = new THREE.Vector3(0, -1, 0);
    this.emitter.setDirection(direction);

    // Create and store gravity behavior reference
    this.gravityBehavior = new PlanetaryGravityBehavior({
      center: new THREE.Vector3(0, 0, 0),
      strength: 9.8, // Reduced gravity effect for better visibility
    });

    return new ParticleSystem({
      count: 1000,
      emitter: this.emitter,
      behaviors: [
        this.gravityBehavior,
        new DragBehavior({ dragCoefficient: 0.05 }), // Less drag for longer trails
      ],
      appearance: {
        startColor: new THREE.Color(1, 0.8, 0.3),
        endColor: new THREE.Color(1, 0.2, 0),
        startSize: 0.5, // Increased initial size
        endSize: 0.1,
        startOpacity: 0.8, // Slightly reduced initial opacity
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
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

      // Apply multi-octave noise for terrain variation
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
  private updateRotation(): void {
    if (!this.shipBody) return;

    // Get ship's position and up vector (surface normal)
    const pos = this.shipBody.translation();
    const planetUp = new THREE.Vector3(pos.x, pos.y, pos.z).normalize();

    // Update pitch and roll based on mouse input
    this.currentPitch = THREE.MathUtils.lerp(this.currentPitch, -this.mouseY * MAX_PITCH, ROTATION_RATE);
    this.currentRoll = THREE.MathUtils.lerp(this.currentRoll, this.mouseX * MAX_ROLL, ROTATION_RATE);

    // Start with base orientation aligned to planet surface
    const baseQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), planetUp);

    // Apply pitch rotation around the right axis
    const rightAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(baseQuat);
    const pitchQuat = new THREE.Quaternion().setFromAxisAngle(rightAxis, this.currentPitch);

    // Apply roll rotation around the forward axis
    const forwardAxis = new THREE.Vector3(0, 0, 1).applyQuaternion(baseQuat);
    const rollQuat = new THREE.Quaternion().setFromAxisAngle(forwardAxis, this.currentRoll);

    // Combine all rotations
    const finalQuat = new THREE.Quaternion().multiplyQuaternions(baseQuat, pitchQuat).multiply(rollQuat);

    // Apply final rotation
    this.shipBody.setRotation(finalQuat, true);
  }

  private updateMovement(): void {
    if (!this.shipBody) return;

    if (this.thrustActive) {
      const rotation = this.shipBody.rotation();
      const quat = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
      // Thrust comes from bottom of ship (positive Y pushes away from bottom)
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

  private offset = new THREE.Vector3(0, 11, -8);
  private currentPosition = new THREE.Vector3(0, 0, 0);

  private currentLookAt = new THREE.Vector3();

  private updateCamera(position: THREE.Vector3): void {
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
    // this.particleSystem
    // Update thrust particles
    if (this.shipModel) {
      // Update particle system position and gravity center
      this.particleSystem?.position.copy(this.shipModel.position);

      // Calculate emission direction based on ship's orientation
      const rotation = this.shipModel.quaternion;
      const direction = new THREE.Vector3(0, -1, 0).applyQuaternion(rotation);
      this.emitter.setDirection(direction);

      // Emit particles when thrust is active
      if (this.thrustActive) {
        this.particleSystem?.emit(2); // Increased emission rate
      }
    }
    this.particleSystem?.update(1 / 60);
    this.updateCamera(this.shipModel.position.clone());
    this.world.step();
    this.renderer.render(this.scene, this.camera);
  }
}
