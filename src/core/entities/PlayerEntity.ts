import RAPIER from "@dimforge/rapier3d";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DragBehavior, PlanetaryGravityBehavior } from "../particles/Behaviors";
import { ConeEmitter } from "../particles/Emitters";
import { ParticleSystem } from "../particles/ParticleSystem";
import { FlyingEntity, IFlyingEntity } from "./FlyingEntity";
const THRUST_FORCE = 10; // Increased for better control
const LINEAR_DAMPING = 0.2; // Reduced for more responsive movement
const ANGULAR_DAMPING = 2.0; // Reduced for smoother rotation
const PLANET_RADIUS = 1300;
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
export class PlayerEntity extends FlyingEntity implements IFlyingEntity {
  private thrustArrowHelper: THREE.ArrowHelper;
  private velocityArrowHelper: THREE.ArrowHelper;
  private gravityArrowHelper: THREE.ArrowHelper;

  private mouseX: number = 0;
  private mouseY: number = 0;
  private screenCenterX: number = 0;
  private screenCenterY: number = 0;
  private isPointerLocked: boolean = true;
  private currentPitch: number = 0;
  private currentRoll: number = 0;
  private crosshair: HTMLDivElement;
  private cursorX: number = 0;
  private cursorY: number = 0;
  private thrustActive: boolean = false;

  private particleSystem: ParticleSystem | null = null;

  private emitter!: ConeEmitter;

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

      this.particleSystem = this.createThrustEffect();
      this.scene.add(this.particleSystem);

      this.object.add(objectMesh);

      this.scene.add(this.object);
      this.object.frustumCulled = true;
    });

    // Setup object and add to scene
    this.move = 0;

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
      this.mouseX = (this.cursorX - this.screenCenterX) / this.screenCenterX;
      this.mouseY = (this.screenCenterY - this.cursorY) / this.screenCenterY;

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
  protected thrust() {
    // super.thrust();
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

  private updateRotation(): void {
    if (!this.body) return;

    // Get ship's position and up vector (surface normal)
    const pos = this.body.translation();
    const planetUp = new THREE.Vector3(pos.x, pos.y, pos.z).normalize();

    // Update pitch and roll based on mouse input, but invert based on hemisphere
    const upDot = planetUp.y; // dot product with world up to determine hemisphere
    this.currentPitch = THREE.MathUtils.lerp(this.currentPitch, this.mouseY * MAX_PITCH * Math.sign(upDot), ROTATION_RATE);
    this.currentRoll = THREE.MathUtils.lerp(this.currentRoll, this.mouseX * MAX_ROLL * Math.sign(upDot), ROTATION_RATE);

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
    this.body.setRotation(finalQuat, true);
  }
  createThrustEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    // Create emitter at position and point downward
    const emitterPos = position.clone();
    // Even narrower cone angle (5 degrees) and faster initial velocity
    this.emitter = new ConeEmitter(
      emitterPos,
      0.1, // Narrower spread
      3, // Smaller cone angle
      () => Math.random() * 3 + 5 // Faster initial velocity
    );
    const direction = new THREE.Vector3(0, -1, 0);
    this.emitter.setDirection(direction);

    return new ParticleSystem({
      count: 1000,
      emitter: this.emitter,
      behaviors: [
        new PlanetaryGravityBehavior({
          center: new THREE.Vector3(0, 0, 0),
          strength: 9.8, // Reduced gravity effect for better visibility
        }),
        new DragBehavior({ dragCoefficient: 0.1 }), // Less drag for longer trails
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
  private updateMovement(): void {
    if (!this.body) return;

    if (this.thrustActive) {
      const rotation = this.body.rotation();
      const quat = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
      // Thrust comes from bottom of ship (positive Y pushes away from bottom)
      const thrustDirection = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);

      this.body.applyImpulse(
        {
          x: thrustDirection.x * THRUST_FORCE,
          y: thrustDirection.y * THRUST_FORCE,
          z: thrustDirection.z * THRUST_FORCE,
        },
        true
      );

      // Apply velocity limits
      const vel = this.body.linvel();
      const velocity = new THREE.Vector3(vel.x, vel.y, vel.z);
      if (velocity.length() > MAX_VELOCITY) {
        velocity.normalize().multiplyScalar(MAX_VELOCITY);
        this.body.setLinvel({ x: velocity.x, y: velocity.y, z: velocity.z }, true);
      }
    }
  }

  public update(camera: THREE.PerspectiveCamera): void {
    if (!this.object || !this.body) return;

    this.updateRotation();
    this.updateMovement();

    // Update ship model position and rotation
    const translation = this.body.translation();
    const rotation = this.body.rotation();
    this.object.position.set(translation.x, translation.y, translation.z);
    this.object.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    if (this.object) {
      // Update particle system position and gravity center
      this.particleSystem?.position.copy(this.object.position);

      // Calculate emission direction based on ship's orientation
      const rotation = this.object.quaternion;
      const direction = new THREE.Vector3(0, -1, 0).applyQuaternion(rotation);
      this.emitter.setDirection(direction);

      // Emit particles when thrust is active
      if (this.thrustActive) {
        this.particleSystem?.emit(2); // Increased emission rate
      }
    }
    this.particleSystem?.update(1 / 60);
  }
}
