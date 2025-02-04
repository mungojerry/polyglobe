import RAPIER from "@dimforge/rapier3d";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Water } from "../effects/Water";
import { AccordionElement, ButtonElement, ColorElement, controlManager, SliderElement } from "../managers/controlManager";
import { DragBehavior, PlanetaryGravityBehavior } from "../particles/Behaviors";
import { ConeEmitter } from "../particles/Emitters";
import { ParticleSystem } from "../particles/ParticleSystem";
import { pseudoRandom } from "../utils/PseudoRandom";
import { LandscapeConfig, LandscapeGenerator } from "./LandscaoeGeneration";
import { PLANET_PRESETS } from "./LandscapePresets";

// Constants
const LINEAR_DAMPING = 0.19;
const ANGULAR_DAMPING = 0.1;
const PLANET_RADIUS = 1300;
const GRAVITY_STRENGTH = 9.8 * 50;
const SHIP_START_HEIGHT = PLANET_RADIUS + 150;
const MAX_PITCH = Math.PI;
const POLE_CYLINDER_RADIUS = 50;
const POLE_CYLINDER_HEIGHT = 1000;
const SHOT_COOLDOWN = 100; //

const MOUSE_SENSITIVITY = 0.003;

const COLLISION_MASKS = {
  PLANET: 0xffffffff,
  SHIP: 0xffffffff,
};

// Helicopter Control Constants
const MAX_TILT_ANGLE = Math.PI / 6; // 30 degrees max tilt
const TILT_RESPONSE = 2.0; // How quickly the helicopter responds to tilt commands
const ROTATION_RATE = 1.5; // Yaw rotation rate
const COLLECTIVE_RESPONSE = 20.0; // How quickly thrust changes
const DRIFT_DAMPING = 0.95; // Air resistance factor
const MAX_SPEED = 50;

export class ZarchFlyScene {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private world: RAPIER.World;

  private shipModel: THREE.Group | null = null;
  private thrustActive: boolean = false;
  private mouseX: number = 0;
  private mouseY: number = 0;
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

  private directionalLight: THREE.DirectionalLight;
  private directionalLight2: THREE.DirectionalLight;

  private shipBody!: RAPIER.RigidBody;

  private planetBody!: RAPIER.RigidBody;
  private planetCollider!: RAPIER.Collider;

  private landscapeWire!: THREE.Mesh;
  private landscape!: THREE.Mesh;

  private pitch: number = 0;
  private yaw: number = 0;
  private roll: number = 0;

  private currentSeed = 23478;
  private landscapeConfig = {
    resolution: 50,
    ridgeNoise: {
      scale: 1.3,
      amplitude: 0.15,
      sharpness: 1.4,
    },
    noiseLayers: [
      { scale: 0.5, amplitude: 0.1 },
      { scale: 1.0, amplitude: 0.08 },
      { scale: 2.0, amplitude: 0.04 },
      { scale: 4.0, amplitude: 0.02 },
      { scale: 8.0, amplitude: 0.01 },
      { scale: 16.0, amplitude: 0.005 },
    ],
    waterLevel: 1.03,
    colors: [
      { height: 0.0, color: new THREE.Color(0x000066) },
      { height: 0.05, color: new THREE.Color(0x006699) },
      { height: 0.1, color: new THREE.Color(0xf0e68c) },
      { height: 0.2, color: new THREE.Color(0x339933) },
      { height: 0.6, color: new THREE.Color(0x663300) },
      { height: 0.8, color: new THREE.Color(0x666666) },
      { height: 1.0, color: new THREE.Color(0xffffff) },
    ],

    erosion: {
      iterations: 5, // Lightweight erosion
      strength: 0.1,
    },
  };
  private generator = new LandscapeGenerator(PLANET_RADIUS, this.landscapeConfig);

  private targetRotation = new THREE.Quaternion();
  private currentRotation = new THREE.Quaternion();

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

    this.initialize();
  }
  private isInitialized: boolean = false;
  private water!: Water;
  private createWater() {
    this.water = new Water(PLANET_RADIUS * this.landscapeConfig.waterLevel, 40);
    this.scene.add(this.water.getObject());
  }
  private async initialize(): Promise<void> {
    await this.createShip();

    this.createPoleCylinders();
    this.createVisiblePoleCylinders();
    this.createWater();
    this.regenerateLandscape();

    this.setupEventListeners();
    this.directionalLight.target = this.landscape;
    this.setupDebugControls();
    this.isInitialized = true; // Add this line
    this.animate();
  }

  public updateLandscapeConfig(newConfig: Partial<LandscapeConfig>): void {
    this.landscapeConfig = { ...this.landscapeConfig, ...newConfig };
    this.regenerateLandscape();
  }

  private regenerateLandscape(): void {
    console.log("regenerateLandscape...");
    pseudoRandom.setSeed(this.currentSeed);
    if (this.landscape) {
      this.scene.remove(this.landscape);
      this.scene.remove(this.landscapeWire);
    }
    const startTime = performance.now();

    let geometry = this.createLandscapeGeometry();
    geometry = BufferGeometryUtils.mergeVertices(geometry);

    this.landscape = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        flatShading: true,
      })
    );
    this.scene.add(this.landscape);

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
    this.landscapeWire = new THREE.Mesh(geometry, materialWire);
    this.createPhysicsCollider();

    console.log(`landscape generation in ${performance.now() - startTime}ms`);
    console.log("DONE");
  }

  private createPhysicsCollider(): void {
    if (this.planetBody) {
      // Remove old collider
      this.world.removeCollider(this.planetCollider, true);
      this.world.removeRigidBody(this.planetBody);
    }

    // Create new rigid body with updated geometry
    const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed();
    this.planetBody = this.world.createRigidBody(rigidBodyDesc);

    const vertices = this.landscape.geometry.attributes.position.array;
    const indices = this.landscape.geometry.index ? this.landscape.geometry.index.array : undefined;
    const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices as Float32Array, indices as Uint32Array);
    this.planetCollider = this.world.createCollider(colliderDesc, this.planetBody);
  }

  private createLandscapeGeometry() {
    this.generator.updateConfig(this.landscapeConfig);
    return this.generator.generateTerrain();
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

      // Update mouse input for lateral movement
      this.mouseX = Math.max(-1, Math.min(1, this.mouseX + deltaX));
      this.mouseY = Math.max(-1, Math.min(1, this.mouseY + deltaY));

      // Update rotation (pitch and yaw)
      this.pitch -= deltaY * 0.5; // Reduce sensitivity for smoother rotation
      this.yaw -= deltaX * 0.5;

      // Apply limits to pitch and yaw
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
    });
  }

  private async createShip(): Promise<void> {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.load(
        "assets/models/ship2.glb",
        (gltf) => {
          this.shipModel = gltf.scene;
          this.shipModel.scale.setScalar(0.5);
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
  // private planetObject!: THREE.Mesh;
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
    const upVector = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);

    // Base hover thrust to counter gravity
    const hoverForce = upVector; //.multiplyScalar(HOVER_THRUST);

    // Additional vertical thrust based on collective (spacebar)
    const collectiveForce = this.thrustActive ? upVector.multiplyScalar(COLLECTIVE_RESPONSE) : new THREE.Vector3();

    // Calculate tilt-based movement
    const tiltForce = new THREE.Vector3();
    if (Math.abs(this.mouseX) > 0.01 || Math.abs(this.mouseY) > 0.01) {
      // Convert mouse input to tilt angles
      const pitchAngle = -this.mouseY * MAX_TILT_ANGLE;
      const rollAngle = -this.mouseX * MAX_TILT_ANGLE;

      // Apply tilt forces
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);

      tiltForce.add(forward.multiplyScalar(pitchAngle * TILT_RESPONSE));
      tiltForce.add(right.multiplyScalar(rollAngle * TILT_RESPONSE));
    }

    // Get current velocity and apply damping
    const vel = this.shipBody.linvel();
    const currentVelocity = new THREE.Vector3(vel.x, vel.y, vel.z);
    currentVelocity.multiplyScalar(DRIFT_DAMPING);

    // Combine all forces
    const totalForce = hoverForce.add(collectiveForce).add(tiltForce);

    // Apply speed limit
    const newVelocity = currentVelocity.add(totalForce.multiplyScalar(1 / 60));
    if (newVelocity.length() > MAX_SPEED) {
      newVelocity.normalize().multiplyScalar(MAX_SPEED);
    }

    this.shipBody.setLinvel(newVelocity, true);
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
  planetCenter = new THREE.Vector3(0, 0, 0);
  // Common function both methods can use
  private getOrientationOnPlanet(position: THREE.Vector3): THREE.Quaternion {
    // Get up vector from planet center to position
    const upVector = position.clone().normalize();

    // Create base orientation quaternion that aligns with planet surface
    const baseQuat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), upVector);
    return baseQuat;
  }

  private updateRotation(): void {
    if (!this.shipBody) return;

    const translation = this.shipBody.translation();
    const shipPos = new THREE.Vector3(translation.x, translation.y, translation.z);

    // Get base orientation relative to planet
    const baseQuat = this.getOrientationOnPlanet(shipPos);

    // Apply tilt based on mouse input
    const pitchQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -this.mouseY * MAX_TILT_ANGLE);
    const rollQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -this.mouseX * MAX_TILT_ANGLE);
    const yawQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw * ROTATION_RATE);

    // Combine rotations
    this.targetRotation.copy(baseQuat).multiply(yawQuat).multiply(pitchQuat).multiply(rollQuat);

    // Smooth interpolation
    this.currentRotation.slerp(this.targetRotation, 0.1);

    this.shipBody.setRotation(this.currentRotation, true);
  }

  private updateCamera(position: THREE.Vector3): void {
    if (!this.shipBody) return;

    // Get base orientation on planet surface (same as ship uses)
    const baseQuat = this.getOrientationOnPlanet(position);

    // Create camera offset in local space
    const localOffset = new THREE.Vector3(0, this.offset.y, this.offset.z);

    // Apply the same base orientation to camera offset
    const rotatedOffset = localOffset.clone().applyQuaternion(baseQuat);

    // Target camera position
    const targetPosition = position.clone().add(rotatedOffset);

    // Smooth interpolation
    const smoothFactor = 1; // Reduced for smoother camera movement
    this.currentPosition.lerp(targetPosition, smoothFactor);
    this.currentLookAt.lerp(position, smoothFactor);

    // Apply camera transformations
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookAt);
    this.camera.up.copy(position.clone().normalize());
  }
  private currentPosition = new THREE.Vector3();
  private currentLookAt = new THREE.Vector3();
  private offset = new THREE.Vector3(0, 10, -20); // Adjust these values as needed

  private animate = (): void => {
    if (!this.isInitialized || !this.shipModel || !this.shipBody || !this.planetBody || !this.landscape || !this.landscapeWire) return;
    requestAnimationFrame(this.animate);

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
    this.updateCamera(this.shipModel.position);
    this.world.step();
    this.renderer.render(this.scene, this.camera);
  };

  private setupDebugControls(): void {
    controlManager.addAccordion("noiseControls", "Noise Generator Controls");

    controlManager.addDropdown(
      "Preset",
      "Preset: ",
      () => "Earth-like",
      (value) => {
        this.loadPreset(value);
      },
      [...PLANET_PRESETS.map(({ name }) => name)]
    );

    // Add noise generator controls
    const noiseConfig = this.landscapeConfig;
    const rebuildButton: ButtonElement = {
      id: "rebuildButton",
      label: "Rebuild globe",
      type: "button",
      callback: () => {
        this.currentSeed = Math.round(performance.now());
        this.regenerateLandscape();
      },
    };
    controlManager.addChildToAccordion("noiseControls", rebuildButton);
    const outputValues: ButtonElement = {
      id: "outputValues",
      label: "Output values",
      type: "button",
      callback: () => {
        console.log(JSON.stringify(Object.fromEntries(Object.entries(noiseConfig).map(([key, value]) => [key, value])), null, 2));
      },
    };
    controlManager.addChildToAccordion("noiseControls", outputValues);

    const processConfig = (obj: any, prefix: string = "", accordianID: string) => {
      Object.entries(obj).forEach(([key, value]) => {
        const fullKey = prefix ? `${prefix}.${key}` : key;

        if (Array.isArray(value)) {
          console.log(key);
          const accordianControl: AccordionElement = {
            expanded: false,
            id: accordianID + fullKey,
            label: key,
            type: "accordion",
            children: [],
          };
          controlManager.addChildToAccordion(accordianID, accordianControl);
          value.forEach((item, index) => {
            processConfig(item, `${fullKey}[${index}]`, accordianID + fullKey);
          });
        } else if (value instanceof THREE.Color) {
          // Color picker control
          const colorControl: ColorElement = {
            id: fullKey,
            label: key,
            type: "color",
            getValue: () => `#${value.getHexString()}`,
            setValue: (newValue) => {
              value.set(newValue);
              this.regenerateLandscape();
            },
          };
          controlManager.addChildToAccordion(accordianID, colorControl);
        } else if (typeof value === "number") {
          // Slider control with appropriate ranges
          console.log("  number " + key + "  " + accordianID);
          const sliderControl: SliderElement = {
            id: fullKey,
            label: key,
            type: "slider",
            getValue: () => value,
            setValue: (newValue) => {
              obj[key] = Number(newValue);
              this.regenerateLandscape();
            },
            min: key == "resolution" ? 4 : 0,
            max: key == "resolution" ? 150 : 4,
            step: key == "resolution" || key === "count" ? 1 : 0.02,
          };
          controlManager.addChildToAccordion(accordianID, sliderControl);
        } else if (typeof value === "object") {
          console.log(key + "   creating " + accordianID + fullKey);
          // Recursively process nested objects
          const accordianControl: AccordionElement = {
            id: accordianID + fullKey,
            expanded: false,
            label: key,
            type: "accordion",
            children: [],
          };
          controlManager.addChildToAccordion(accordianID, accordianControl);
          processConfig(value, fullKey, accordianID + fullKey);
        }
      });
    };

    processConfig(this.landscapeConfig, "", "noiseControls");
  }

  // Add method to switch presets
  public loadPreset(presetName: string): void {
    const preset = PLANET_PRESETS.find((p) => p.name === presetName);
    if (preset) {
      this.landscapeConfig = { ...this.landscapeConfig, ...preset.config };

      this.regenerateLandscape();
    }
  }
}
