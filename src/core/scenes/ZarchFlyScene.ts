import RAPIER from "@dimforge/rapier3d";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DragBehavior, PlanetaryGravityBehavior } from "../particles/Behaviors";
import { ConeEmitter } from "../particles/Emitters";
import { ParticleSystem } from "../particles/ParticleSystem";

// Constants
const THRUST_FORCE = 20;
const LINEAR_DAMPING = 0.8;
const ANGULAR_DAMPING = 1.0;
const PLANET_RADIUS = 1300;
const GRAVITY_STRENGTH = 9.8 * 50;
const MAX_VELOCITY = 150;
const SHIP_START_HEIGHT = PLANET_RADIUS + 150;
const MAX_PITCH = Math.PI;
const MAX_ROLL = Math.PI;
const POLE_CYLINDER_RADIUS = 50;
const POLE_CYLINDER_HEIGHT = 100;
const SHOT_COOLDOWN = 100; //

// Helicopter Control Constants
const HOVER_DAMPING = 0.94;
const MAX_LATERAL_SPEED = 75;
const LATERAL_ACCELERATION = 0.5;
const ROTATION_SMOOTHING = 0.15;
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
  private crosshair: HTMLDivElement;
  private cursorX: number = 0;
  private cursorY: number = 0;
  private northPoleMesh: THREE.Mesh | undefined;
  private southPoleMesh: THREE.Mesh | undefined;

  private lastShotTime: number = 0;

  private emitter!: ConeEmitter;
  private bulletEmitter!: ConeEmitter;

  private particleSystem: ParticleSystem | null = null;
  private bulletSystem: ParticleSystem | null = null;

  directionalLight: THREE.DirectionalLight;
  directionalLight2: THREE.DirectionalLight;

  private pitch: number = 0;
  private yaw: number = 0;
  private roll: number = 0;
  private mouseSensitivity: number = 0.005;

  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
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

    const shadowCameraSize = 2048;
    this.directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    this.directionalLight.position.set(2000, 600, 600);
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.width = 8192;
    this.directionalLight.shadow.mapSize.height = 8192;
    this.directionalLight.shadow.camera.left = -shadowCameraSize;
    this.directionalLight.shadow.camera.right = shadowCameraSize;
    this.directionalLight.shadow.camera.top = shadowCameraSize;
    this.directionalLight.shadow.camera.bottom = -shadowCameraSize;
    this.directionalLight.shadow.camera.near = 0.1;
    this.directionalLight.shadow.camera.far = 10000;
    this.directionalLight.shadow.bias = -0.001;
    this.directionalLight.shadow.normalBias = 0.02;

    this.directionalLight.shadow.camera.updateProjectionMatrix();
    this.scene.add(this.directionalLight);

    this.directionalLight2 = new THREE.DirectionalLight(0xffff00, 1);
    this.directionalLight2.position.set(-2000, -2000, 0);
    this.directionalLight2.castShadow = true;

    this.directionalLight2.shadow.camera.left = -shadowCameraSize;
    this.directionalLight2.shadow.camera.right = shadowCameraSize;
    this.directionalLight2.shadow.camera.top = shadowCameraSize;
    this.directionalLight2.shadow.camera.bottom = -shadowCameraSize;
    this.directionalLight2.shadow.camera.near = 0.1;
    this.directionalLight2.shadow.camera.far = 5000;
    this.directionalLight2.shadow.bias = -0.0001;
    this.directionalLight2.shadow.normalBias = 0.02;

    this.directionalLight2.shadow.camera.updateProjectionMatrix();
    this.scene.add(this.directionalLight2);

    const shadowHelper = new THREE.CameraHelper(this.directionalLight.shadow.camera);
    this.scene.add(shadowHelper);

    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });

    this.updateScreenCenter();
    this.initialize();
    this.createPoleCylinders();
    this.createVisiblePoleCylinders();

    // this.directionalLight.target = this.planetObject;
  }

  private updateScreenCenter(): void {
    this.screenCenterX = window.innerWidth / 2;
    this.screenCenterY = window.innerHeight / 2;
  }

  private async initialize(): Promise<void> {
    await this.createShip();
    this.createPlanet();
    this.setupEventListeners();
    this.directionalLight.target = this.planetObject;
    this.animate();
  }

  // Add method to check if can shoot
  private canShoot(): boolean {
    const now = performance.now();
    return now - this.lastShotTime >= SHOT_COOLDOWN;
  }

  private setupEventListeners(): void {
    // Mouse movement with pointer lock
    document.addEventListener("mousemove", (event) => {
      const deltaX = (event.movementX || 0) * MOUSE_SENSITIVITY;
      const deltaY = (event.movementY || 0) * MOUSE_SENSITIVITY;

      // Reduced sensitivity, smoother transitions
      this.mouseX = Math.max(-1, Math.min(1, this.mouseX + deltaX));
      this.mouseY = Math.max(-1, Math.min(1, this.mouseY + deltaY));

      // Gradual decay when no input
      this.mouseX *= 0.95;
      this.mouseY *= 0.95;

      this.pitch -= deltaY;
      this.yaw -= deltaX;

      // Softer pitch/yaw limits
      this.pitch = Math.max(-MAX_PITCH * 0.5, Math.min(MAX_PITCH * 0.5, this.pitch));
      // Update crosshair position
      this.crosshair.style.left = `${this.cursorX}px`;
      this.crosshair.style.top = `${this.cursorY}px`;
    });

    // Pointer lock controls
    this.renderer.domElement.addEventListener("mousedown", () => {
      this.thrustActive = true;
    });
    this.renderer.domElement.addEventListener("mouseup", () => {
      this.thrustActive = false;
    });

    // Thrust control
    window.addEventListener("keydown", (event) => {
      if (event.code === "Space" && this.canShoot()) {
        this.bulletSystem?.emit(1);
        this.lastShotTime = performance.now();
      }
    });

    // Window resize
    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.updateScreenCenter();
    });
  }

  private async createShip(): Promise<void> {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.load(
        "assets/models/wooden_ufo_toy.glb",
        (gltf) => {
          this.shipModel = gltf.scene;
          this.shipModel.scale.setScalar(3);
          this.shipModel.rotation.x = Math.PI;
          this.shipModel.castShadow = true;
          this.shipModel.receiveShadow = true;
          this.scene.add(this.shipModel);

          this.shipModel.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              if (child.material) {
                child.material.transparent = false;
                child.material.opacity = 1;
                child.material.shininess = 0;
                child.material.vertexColors = false;
                child.material.flatShading = true;
                child.material.reflectivity = 0;
                child.material.side = THREE.FrontSide;
              }
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          const startPos = new THREE.Vector3(0, SHIP_START_HEIGHT, 0);
          const rigidBodyDesc = new RAPIER.RigidBodyDesc(RAPIER.RigidBodyType.Dynamic)
            .setTranslation(startPos.x, startPos.y, startPos.z)
            .setLinearDamping(LINEAR_DAMPING)
            .setAngularDamping(ANGULAR_DAMPING)
            .setAdditionalMass(20);

          this.shipBody = this.world.createRigidBody(rigidBodyDesc);

          const shipCollider = RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5)
            .setCollisionGroups(COLLISION_MASKS.SHIP)
            .setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL)
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
            .setFriction(0.2)
            .setRestitution(0.9);

          this.world.createCollider(shipCollider, this.shipBody);

          this.particleSystem = this.createThrustEffect();
          this.bulletSystem = this.createBullet();
          this.scene.add(this.particleSystem);
          this.scene.add(this.bulletSystem);
          resolve();
        },
        undefined,
        reject
      );
    });
  }
  createBullet(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    const emitterPos = position.clone();
    this.bulletEmitter = new ConeEmitter(emitterPos, 0.1, 2, () => Math.random() * 1 + 15);
    const direction = new THREE.Vector3(0, -1, 0);
    this.emitter.setDirection(direction);
    return new ParticleSystem({
      count: 1000,
      emitter: this.bulletEmitter,
      behaviors: [
        new PlanetaryGravityBehavior({
          center: new THREE.Vector3(0, 0, 0),
          strength: 2.8,
        }),
        new DragBehavior({ dragCoefficient: 0.01 }),
      ],
      appearance: {
        startColor: new THREE.Color(1, 0.8, 0.3),
        endColor: new THREE.Color(1, 0.2, 0),
        startSize: 0.5,
        endSize: 0.5,
        startOpacity: 1,
        endOpacity: 1,
        blending: THREE.NormalBlending,
      },
    });
  }

  createThrustEffect(position: THREE.Vector3 = new THREE.Vector3()): ParticleSystem {
    const emitterPos = position.clone();
    this.emitter = new ConeEmitter(emitterPos, 0.1, 3, () => Math.random() * 3 + 5);
    const direction = new THREE.Vector3(0, -1, 0);
    this.emitter.setDirection(direction);

    return new ParticleSystem({
      count: 1000,
      emitter: this.emitter,
      behaviors: [
        new PlanetaryGravityBehavior({
          center: new THREE.Vector3(0, 0, 0),
          strength: 9.8,
        }),
        new DragBehavior({ dragCoefficient: 0.1 }),
      ],
      appearance: {
        startColor: new THREE.Color(1, 0.8, 0.3),
        endColor: new THREE.Color(1, 0.2, 0),
        startSize: 0.5,
        endSize: 0.1,
        startOpacity: 0.8,
        endOpacity: 0,
        blending: THREE.AdditiveBlending,
      },
    });
  }
  private planetObject!: THREE.Mesh;
  private createPlanet(): void {
    const geometry = new THREE.IcosahedronGeometry(PLANET_RADIUS, 32);

    const material = new THREE.MeshStandardMaterial({
      color: 0x33ff66,
      metalness: 0.5,
      roughness: 0.1,
      side: THREE.DoubleSide,
      wireframe: false,
    });
    // geometry.computeBoundingSphere();
    geometry.computeVertexNormals();
    const planet = new THREE.Mesh(geometry, material);
    // planet.castShadow = true;
    planet.receiveShadow = true;
    this.planetObject = planet;
    this.scene.add(planet);
    const materialWire = new THREE.MeshStandardMaterial({
      color: 0x33ff66,
      flatShading: true,
      polygonOffset: true,
      polygonOffsetFactor: 5,
      metalness: 0.5,
      roughness: 0.1,
      wireframe: true,
      clipShadows: false,
    });
    const planetWire = new THREE.Mesh(geometry, materialWire);

    this.scene.add(planetWire);

    const rigidBodyDesc = new RAPIER.RigidBodyDesc(RAPIER.RigidBodyType.Fixed).setTranslation(0, 0, 0);
    this.planetBody = this.world.createRigidBody(rigidBodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.ball(PLANET_RADIUS * 1.002)
      .setCollisionGroups(COLLISION_MASKS.PLANET)
      .setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL)
      .setFriction(0.5)
      .setRestitution(0.2);

    this.world.createCollider(colliderDesc, this.planetBody);
  }

  private createPoleCylinders(): void {
    const northPoleColliderDesc = RAPIER.ColliderDesc.cylinder(POLE_CYLINDER_HEIGHT / 2, POLE_CYLINDER_RADIUS).setTranslation(
      0,
      PLANET_RADIUS + POLE_CYLINDER_HEIGHT / 2,
      0
    );
    const southPoleColliderDesc = RAPIER.ColliderDesc.cylinder(POLE_CYLINDER_HEIGHT / 2, POLE_CYLINDER_RADIUS).setTranslation(
      0,
      -(PLANET_RADIUS + POLE_CYLINDER_HEIGHT / 2),
      0
    );

    this.world.createCollider(northPoleColliderDesc, this.planetBody);
    this.world.createCollider(southPoleColliderDesc, this.planetBody);
  }

  private createVisiblePoleCylinders(): void {
    const geometry = new THREE.CylinderGeometry(POLE_CYLINDER_RADIUS, POLE_CYLINDER_RADIUS, POLE_CYLINDER_HEIGHT, 32);
    const material = new THREE.MeshPhongMaterial({ color: 0x808080, flatShading: true });
    geometry.computeVertexNormals();

    this.northPoleMesh = new THREE.Mesh(geometry, material);
    this.southPoleMesh = new THREE.Mesh(geometry, material);

    this.northPoleMesh.position.set(0, PLANET_RADIUS + POLE_CYLINDER_HEIGHT / 2, 0);
    this.southPoleMesh.position.set(0, -(PLANET_RADIUS + POLE_CYLINDER_HEIGHT / 2), 0);
    this.northPoleMesh.receiveShadow = true;
    this.northPoleMesh.castShadow = true;
    this.southPoleMesh.receiveShadow = true;
    this.southPoleMesh.castShadow = true;
    this.scene.add(this.northPoleMesh);
    this.scene.add(this.southPoleMesh);
  }

  private updateMovement(): void {
    if (!this.shipBody) return;

    const rotation = this.shipBody.rotation();
    const quat = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);

    // Compute directional vectors
    const forwardVector = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
    const rightVector = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);
    const upVector = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);

    // Compute current velocity
    const vel = this.shipBody.linvel();
    const currentVelocity = new THREE.Vector3(vel.x, vel.y, vel.z);

    // Lateral movement based on mouse input
    const lateralMovement = new THREE.Vector3();
    lateralMovement.add(rightVector.multiplyScalar(this.mouseX * LATERAL_ACCELERATION));
    lateralMovement.add(forwardVector.multiplyScalar(-this.mouseY * LATERAL_ACCELERATION));

    // Apply lateral movement with speed limit
    const newVelocity = currentVelocity.add(lateralMovement);
    const velocityMagnitude = newVelocity.length();

    if (velocityMagnitude > MAX_LATERAL_SPEED) {
      newVelocity.normalize().multiplyScalar(MAX_LATERAL_SPEED);
    }

    // Thrust: vertical hover mechanism
    const hoverThrust = this.thrustActive ? upVector.multiplyScalar(THRUST_FORCE * 0.5) : new THREE.Vector3();

    // Apply damping for more helicopter-like feel
    newVelocity.multiplyScalar(HOVER_DAMPING);

    this.shipBody.setLinvel({ x: newVelocity.x + hoverThrust.x, y: newVelocity.y + hoverThrust.y, z: newVelocity.z + hoverThrust.z }, true);
  }

  private updateGravity(): void {
    if (!this.shipBody) return;

    const pos = this.shipBody.translation();
    const shipPos = new THREE.Vector3(pos.x, pos.y, pos.z);
    const distanceToCenter = shipPos.length();

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

  private targetRotation = new THREE.Quaternion();
  private currentRotation = new THREE.Quaternion();
  private rotationLerpSpeed = 0.15; // Adjust for desired smoothness
  private updateRotation(): void {
    if (!this.shipBody) return;

    const translation = this.shipBody.translation();
    const shipPos = new THREE.Vector3(translation.x, translation.y, translation.z);
    const planetCenter = new THREE.Vector3(0, 0, 0);
    const surfaceNormal = shipPos.clone().sub(planetCenter).normalize();

    // Simplified rotation relative to surface
    const tangent = new THREE.Vector3(1, 0, 0).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), surfaceNormal));
    const binormal = surfaceNormal.clone().cross(tangent).normalize();

    // Smoother, more controlled rotation
    const pitchQuaternion = new THREE.Quaternion().setFromAxisAngle(tangent, this.pitch * 0.5);
    const yawQuaternion = new THREE.Quaternion().setFromAxisAngle(binormal, this.yaw * 0.5);
    const rollQuaternion = new THREE.Quaternion().setFromAxisAngle(surfaceNormal, this.roll * 0.5);

    this.targetRotation = pitchQuaternion.multiply(yawQuaternion).multiply(rollQuaternion);
    this.currentRotation.slerp(this.targetRotation, ROTATION_SMOOTHING);

    this.shipBody.setRotation(this.currentRotation, true);
  }
  private updateCamera(position: THREE.Vector3): void {
    if (!this.shipBody) return;

    // Calculate camera direction based on ship's rotation
    const rotation = this.shipBody.rotation();
    const cameraDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w));

    // Calculate camera position based on ship's position and direction
    const cameraOffset = cameraDirection.clone().multiplyScalar(-10); // Adjust distance as needed
    const targetCameraPosition = position.clone().add(cameraOffset);

    // Lerp camera position for smooth movement
    this.camera.position.lerp(targetCameraPosition, 0.9);

    const worldUp = position.clone().normalize();
    this.camera.up.copy(worldUp);

    // Look at the ship's position
    this.camera.lookAt(position);
  }
  private animate(): void {
    requestAnimationFrame(() => this.animate());

    if (!this.shipModel || !this.shipBody) return;

    this.updateRotation();
    this.updateMovement();
    this.updateGravity();

    const translation = this.shipBody.translation();
    const rotation = this.shipBody.rotation();
    this.shipModel.position.set(translation.x, translation.y, translation.z);
    this.shipModel.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);

    if (this.shipModel) {
      this.particleSystem?.position.copy(this.shipModel.position);
      this.bulletSystem?.position.copy(this.shipModel.position);

      const rotation = this.shipModel.quaternion;
      const direction = new THREE.Vector3(0, -1, 0).applyQuaternion(rotation);
      this.emitter.setDirection(direction);
      this.bulletEmitter.setDirection(direction.negate());

      if (this.thrustActive) {
        this.particleSystem?.emit(2);
      }
    }
    this.particleSystem?.update(1 / 60);
    this.bulletSystem?.update(1 / 60);
    this.updateCamera(this.shipModel.position.clone());
    this.world.step();
    this.renderer.render(this.scene, this.camera);
  }
}
