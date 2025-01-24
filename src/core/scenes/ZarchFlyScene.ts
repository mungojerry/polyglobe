import RAPIER from "@dimforge/rapier3d";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise";
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

  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
    directionalLight.position.set(2000, 2000, 0);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 1;
    directionalLight.shadow.camera.far = 5000;
    directionalLight.shadow.bias = -0.001;
    this.scene.add(directionalLight);
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });

    this.updateScreenCenter();
    this.initialize();
    this.createPoleCylinders();
    this.createVisiblePoleCylinders();
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

  // Add method to check if can shoot
  private canShoot(): boolean {
    const now = performance.now();
    return now - this.lastShotTime >= SHOT_COOLDOWN;
  }

  private setupEventListeners(): void {
    // Mouse movement with pointer lock
    document.addEventListener("mousemove", (event) => {
      // Direct cursor position
      this.cursorX = event.clientX;
      this.cursorY = event.clientY;

      // Update ship control values
      this.mouseX = (event.clientX - this.screenCenterX) / this.screenCenterX;
      this.mouseY = (this.screenCenterY - event.clientY) / this.screenCenterY;

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
          this.shipModel.scale.set(1.5, 1.5, 1.5);
          this.shipModel.rotation.x = Math.PI;
          this.shipModel.castShadow = true;
          this.shipModel.receiveShadow = true;
          this.scene.add(this.shipModel);

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

  private createPlanet(): void {
    const simplex = new SimplexNoise();
    const geometry = new THREE.IcosahedronGeometry(PLANET_RADIUS, 32);
    const positions = geometry.attributes.position;

    for (let i = 0; i < positions.count; i++) {
      const vertex = new THREE.Vector3();
      vertex.fromBufferAttribute(positions, i);
      const scale = 1;
      let amplitude = 20;
      const normalized = vertex.clone().normalize();

      let noise = simplex.noise3d(normalized.x * scale, normalized.y * scale, normalized.z * scale) * amplitude;
      noise = noise * 0.5 + simplex.noise3d(normalized.x * scale, normalized.y * scale, normalized.z * scale) * (amplitude * 0.5);
      vertex.add(normalized.multiplyScalar(noise));

      positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    positions.needsUpdate = true;
    const material = new THREE.MeshStandardMaterial({
      color: 0x33ff66,
      flatShading: true,
      metalness: 0.5,
      roughness: 0.1,
      wireframe: false,
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

    this.northPoleMesh = new THREE.Mesh(geometry, material);
    this.southPoleMesh = new THREE.Mesh(geometry, material);

    this.northPoleMesh.position.set(0, PLANET_RADIUS + POLE_CYLINDER_HEIGHT / 2, 0);
    this.southPoleMesh.position.set(0, -(PLANET_RADIUS + POLE_CYLINDER_HEIGHT / 2), 0);
    this.northPoleMesh.receiveShadow = true;
    this.northPoleMesh.castShadow = true;
    this.southPoleMesh.receiveShadow = true;
    this.southPoleMesh.castShadow = true;
    this.northPoleMesh.geometry.computeVertexNormals();
    this.southPoleMesh.geometry.computeVertexNormals();
    this.scene.add(this.northPoleMesh);
    this.scene.add(this.southPoleMesh);
  }

  private updateMovement(): void {
    if (!this.shipBody) return;

    if (this.thrustActive) {
      const rotation = this.shipBody.rotation();
      const quat = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);

      const baseThrust = THRUST_FORCE;
      const dynamicThrust = baseThrust * (1 + Math.abs(this.mouseY));
      const thrustDirection = new THREE.Vector3(0, 1, 0).applyQuaternion(quat).multiplyScalar(dynamicThrust);

      this.shipBody.applyImpulse(
        {
          x: thrustDirection.x,
          y: thrustDirection.y,
          z: thrustDirection.z,
        },
        true
      );

      const vel = this.shipBody.linvel();
      const velocity = new THREE.Vector3(vel.x, vel.y, vel.z);
      const velocityMagnitude = velocity.length();

      if (velocityMagnitude > MAX_VELOCITY) {
        velocity.normalize().multiplyScalar(MAX_VELOCITY * (1 + Math.abs(this.mouseY)));
        this.shipBody.setLinvel({ x: velocity.x, y: velocity.y, z: velocity.z }, true);
      }
    }
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

  private offset = new THREE.Vector3(0, 11, -8);
  private currentPosition = new THREE.Vector3(0, 0, 0);

  private currentLookAt = new THREE.Vector3();

  private updateRotation(): void {
    if (!this.shipBody) return;

    const pos = this.shipBody.translation();
    const planetUp = new THREE.Vector3(pos.x, pos.y, pos.z).normalize();

    const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), planetUp);

    const pitchRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.mouseY * MAX_PITCH);

    const rollRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.mouseX * MAX_ROLL);

    rotation.multiply(pitchRotation).multiply(rollRotation);
    this.shipBody.setRotation(rotation, true);
  }

  private cameraLag = 0.9;

  private updateCamera(position: THREE.Vector3): void {
    const surfaceNormal = position.clone().normalize();

    const dynamicOffset = this.offset.clone().add(new THREE.Vector3(this.mouseX * 1, Math.abs(this.mouseY) * 2, -Math.abs(this.mouseY) * 2));

    const worldUp = new THREE.Vector3(0, 1, 0);
    const rotationAxis = new THREE.Vector3().crossVectors(worldUp, surfaceNormal);
    const angle = worldUp.angleTo(surfaceNormal);
    const surfaceRotation = new THREE.Quaternion().setFromAxisAngle(rotationAxis.normalize(), angle);

    const rotatedOffset = dynamicOffset.clone().applyQuaternion(surfaceRotation);
    const targetPosition = position.clone().add(rotatedOffset);

    this.currentPosition.lerp(targetPosition, this.cameraLag);
    this.currentLookAt.lerp(position, this.cameraLag);

    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookAt);
    this.camera.up.copy(surfaceNormal);
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
