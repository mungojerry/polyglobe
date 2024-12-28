import RAPIER, { EventQueue, RigidBody, Vector3, World } from "@dimforge/rapier3d";
import * as THREE from "three";
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from "three-mesh-bvh";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { controlManager } from "../managers/controlManager";
import { debugManager } from "../managers/debugManager";
import { modelGroups } from "../managers/models";
import { ObjectManager } from "../managers/ObjectManager";
import { Cloud } from "../objects/Cloud";
import { FlyingObject } from "../objects/FlyingObject";
import { Moon } from "../objects/Moon";
import { Player } from "../objects/Player";
import { Stars } from "../objects/Stars";
import { Sun } from "../objects/Sun";
import { Globe } from "../planet/Globe";
import { MiniGlobe } from "../planet/MiniGlobe";
import { VoronoiNoise, VoronoiNoiseConfig } from "../planet/noise/VoroniNoise";
import { LoadingScreen } from "../ui/LoadingScreen";
import { generateRandomPosition } from "../utils/utils";
import { vectorPool } from "../utils/vectorPool";
import { BulletGenerator } from "../weapons/BulletGenerator";

// Add the extension functions for BVH
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const config = {
  numUFOs: 1,
  dayNightCycle: {
    rotationSpeed: 0.00005,
    currentAngle: 0,
    dayColor: new THREE.Color(0x448ee4),
    nightColor: new THREE.Color(0x000000),
    skyColor: new THREE.Color(0, 0, 0),
  },
  tiltShift: {
    amount: 100.003,
    focusPosition: new THREE.Vector2(0.5, 0.5),
    angle: Math.PI / 4,
    brightness: 1.2,
    luminanceThreshold: 0.8,
  },
};

export class GameScene {
  private readonly world: World;
  private readonly dynamicBodies: { mesh: THREE.Object3D; body: RAPIER.RigidBody }[] = [];
  private readonly eventQueue: EventQueue;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly controls: OrbitControls;
  private readonly globe: Globe;
  private readonly player: Player;
  private readonly clouds: Cloud[] = [];
  private readonly stars: Stars;
  private objectManager!: ObjectManager;
  private miniGlobe!: MiniGlobe;
  private loadingScreen: LoadingScreen;
  private isInitializing: boolean = false;
  private isInitialized: boolean = false;

  private cameraAttachedTo: THREE.Object3D;
  private debugMesh: THREE.LineSegments;
  private orbitCoontrols: boolean = true;
  private currentGenerator: VoronoiNoise;
  private sun!: Sun;
  private moon!: Moon;
  private flyingObjects: FlyingObject[] = [];
  private currentLookAt = new THREE.Vector3();
  private currentPosition = new THREE.Vector3();
  private offset = new THREE.Vector3(0, 2, -3);
  private debugEnabled: boolean = false;
  private readonly GRAVITY_FUDGE: number = 0.01;
  private readonly G = 9.81 * this.GRAVITY_FUDGE;

  constructor() {
    this.world = new World(new Vector3(0, 0, 0));
    this.eventQueue = new EventQueue(false);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.CineonToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Initialize EffectComposer
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    document.body.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.enableZoom = true;

    const ambientLight = new THREE.AmbientLight(0xffffd0, 0.2);
    this.scene.add(ambientLight);

    this.globe = new Globe(this.camera, this.world);
    this.scene.add(this.globe.getObject());

    this.currentGenerator = this.globe.noise;
    this.dynamicBodies = [];
    this.player = new Player(this.scene, this.world, generateRandomPosition(this.globe.getRadius() * 1.3));
    this.cameraAttachedTo = this.player.getObject();

    this.dynamicBodies.push({ body: this.player.getBody(), mesh: this.player.getObject() });
    this.camera.position.set(0, 400, 0);

    this.debugMesh = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, vertexColors: true }));
    this.debugMesh.frustumCulled = false;
    this.scene.add(this.debugMesh);
    this.debugMesh.visible = this.debugEnabled;

    this.stars = new Stars(this.globe.getRadius() * 5);
    this.scene.add(this.stars.getObject());

    this.loadingScreen = new LoadingScreen();

    // Start initialization
    this.initialize();

    // Handle window resize
    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.composer.setSize(window.innerWidth, window.innerHeight);
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "p") {
        this.toggleDebugView();
      }
    });

    // Start render loop immediately with loading state
    this.animate();
  }

  private async initialize(): Promise<void> {
    if (this.isInitializing) {
      debugManager.set("warning", "Initialization already in progress");
      return;
    }

    this.isInitializing = true;
    this.loadingScreen.show();
    this.loadingScreen.reset();

    try {
      // Create clouds while waiting for globe
      this.loadingScreen.updateStage("Generating Land", 0);
      for (let i = 0; i < 40; i++) {
        this.clouds.push(new Cloud(this.globe.getRadius() * 1.25, this.scene));
      }

      // Wait for globe initialization
      await this.globe.initializeGlobe(undefined, (progress: number) => {
        this.loadingScreen.updateStage("Generating Land", progress);
      });
      this.loadingScreen.setStageComplete("Generating Land");

      // Create chunks
      this.loadingScreen.updateStage("Creating Chunks", 0);
      await this.globe.buildChunks((progress: number) => {
        this.loadingScreen.updateStage("Creating Chunks", progress);
      });
      this.loadingScreen.setStageComplete("Creating Chunks");

      // Place objects
      this.loadingScreen.updateStage("Placing Objects", 0);
      this.objectManager = new ObjectManager(this.globe, this.scene);
      await this.objectManager.placeObjects(modelGroups, (progress: number) => {
        this.loadingScreen.updateStage("Placing Objects", progress);
      });
      this.loadingScreen.setStageComplete("Placing Objects");

      // Initialize world
      this.loadingScreen.updateStage("Initializing World", 0);
      this.miniGlobe = new MiniGlobe(this.globe.getLandGeometry(), this.camera, 200, 200);
      this.sun = new Sun(this.globe, this.scene, this.globe.getRadius() * 2.4);
      this.moon = new Moon(this.scene, this.globe.getRadius() * 2.4);
      this.loadingScreen.updateStage("Initializing World", 50);

      await this.initializeFlyingObjects();
      this.loadingScreen.updateStage("Initializing World", 75);

      // Add markers to miniglobe
      this.miniGlobe.addMarkers([this.player], 0x00ff00);
      this.miniGlobe.addMarkers([...this.flyingObjects], 0xff0000);

      this.setupControls();
      this.loadingScreen.setStageComplete("Initializing World");

      this.isInitialized = true;
      debugManager.set("status", "Initialization complete");

      // Hide loading screen with a slight delay to show completion
      setTimeout(() => {
        this.loadingScreen.hide();
      }, 500);
    } catch (error) {
      debugManager.set("error", `Initialization failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      console.error("Scene initialization error:", error);
      // Keep loading screen visible with error state
      this.loadingScreen.updateStage("Initializing World", 0);
    } finally {
      this.isInitializing = false;
    }
  }

  private async initializeFlyingObjects(): Promise<void> {
    const globeRadius = this.globe.getRadius();
    const minDistance = globeRadius * 1.3;
    for (let i = 0; i < config.numUFOs; i++) {
      const position = generateRandomPosition(minDistance);
      const flyingObject = new FlyingObject(this.scene, this.world, position, this.globe, this.player);
      this.flyingObjects.push(flyingObject);
    }
  }

  private toggleDebugView(): void {
    this.debugEnabled = !this.debugEnabled;
    if (this.debugEnabled) {
      this.updateDebugVisualization();
      this.debugMesh.visible = true;
    } else {
      this.debugMesh.visible = false;
    }
  }

  private updateDebugVisualization(): void {
    const { vertices, colors } = this.world.debugRender();
    this.debugMesh.geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    this.debugMesh.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 4));
  }

  private animate(): void {
    const step = () => {
      if (!this.isInitialized) {
        // Render loading state
        this.composer.render();
        requestAnimationFrame(step);
        return;
      }

      if (this.player.getObject()) {
        this.world.step(this.eventQueue);
        this.applyGravityToObjects();
        this.clouds.forEach((cloud) => cloud.animateCloud());
        this.globe.update(this.camera, 1);
        this.player.update(this.camera);
        this.updateDayNightCycle();
        if (this.orbitCoontrols) this.controls.update();
        else this.updateCamera(this.cameraAttachedTo.position.clone(), this.cameraAttachedTo.quaternion.clone());
        BulletGenerator.getInstance(this.world).update(1);
        const camPos = this.camera.position;

        this.dynamicBodies.forEach(({ mesh, body }) => {
          const position = body.translation();
          mesh.position.set(position.x, position.y, position.z);
          const rotation = body.rotation();
          mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
        });

        debugManager.set("camera", "Cam: " + camPos.x.toFixed(2) + "," + camPos.y.toFixed(2) + "," + camPos.z.toFixed(2));
        if (this.debugMesh?.visible) {
          this.updateDebugVisualization();
        }
        this.flyingObjects.forEach((flyingObject) => flyingObject.update(this.camera));
      }

      if (this.miniGlobe) {
        this.miniGlobe.update();
      }

      this.composer.render();
      debugManager.set("polys", "Polys: " + this.renderer.info.render.triangles);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  private updateDayNightCycle(): void {
    config.dayNightCycle.currentAngle += config.dayNightCycle.rotationSpeed;

    const cameraPos = this.camera.position.clone();
    const cameraUp = cameraPos.clone().normalize();
    const sunPos = this.sun.getObject().position;
    const cameraToSun = sunPos.clone().sub(cameraPos).normalize();
    const angle = cameraUp.angleTo(cameraToSun);
    const normalizedAngle = Math.min(Math.max(angle / Math.PI, 0), 1);
    const normalizedHeight = 1 - normalizedAngle;

    const dayNightMix = Math.pow(normalizedHeight, 1.5);
    config.dayNightCycle.skyColor.lerpColors(config.dayNightCycle.nightColor, config.dayNightCycle.dayColor, dayNightMix);
    this.scene.fog?.color.copy(config.dayNightCycle.skyColor);
    this.renderer.setClearColor(config.dayNightCycle.skyColor);
    const stars = this.stars.getObject();
    if (stars && stars.material) {
      if (Array.isArray(stars.material)) {
        stars.material.forEach((material) => {
          if ("transparent" in material) {
            material.transparent = true;
            material.opacity = THREE.MathUtils.lerp(0.5, 0, dayNightMix);
            material.needsUpdate = true;
          }
        });
      } else {
        const material = stars.material as THREE.Material;
        if ("transparent" in material) {
          (material as any).transparent = true;
          (material as any).opacity = THREE.MathUtils.lerp(0.5, 0, dayNightMix);
          material.needsUpdate = true;
        }
      }
    }
  }

  private updateCamera(position: THREE.Vector3, playerRotation: THREE.Quaternion): void {
    const up = position.clone().normalize();
    const forward = vectorPool.getVector(0, 0, 1);
    forward.applyQuaternion(playerRotation);
    const right = vectorPool.getVector().crossVectors(up, forward).normalize();
    forward.crossVectors(right, up).normalize();

    const targetPosition = position.clone();
    targetPosition.add(up.multiplyScalar(this.offset.y));
    targetPosition.add(forward.multiplyScalar(this.offset.z));
    const cameraLerp = 0.72;

    this.currentPosition.lerp(targetPosition, cameraLerp);
    this.camera.position.copy(this.currentPosition);
    this.currentLookAt.lerp(position, cameraLerp);
    this.camera.lookAt(this.currentLookAt);
    this.camera.up.copy(up);

    vectorPool.releaseVector(forward);
    vectorPool.releaseVector(right);
  }

  private applyGravity(body: RigidBody): void {
    if (!body || !body.isDynamic()) return;

    const position = body.translation();
    const pos = vectorPool.getVector(position.x, position.y, position.z);
    pos.normalize();

    const forceMagnitude = this.G * body.mass();
    const force = new RAPIER.Vector3(-pos.x * forceMagnitude, -pos.y * forceMagnitude, -pos.z * forceMagnitude);

    body.applyImpulse(force, true);
    if (body === this.player.getBody()) {
      this.player.updateGravityArrow(force);
    }
    vectorPool.releaseVector(pos);
  }

  private applyGravityToObjects(): void {
    this.dynamicBodies.forEach(({ body }) => {
      this.applyGravity(body);
    });
    this.flyingObjects.forEach((flyingObject) => {
      this.applyGravity(flyingObject.getBody());
    });
  }

  private setupControls(): void {
    controlManager.addSlider(
      "fov",
      "FOV: ",
      () => this.camera.fov,
      (value) => {
        this.camera.fov = value as number;
        this.camera.updateProjectionMatrix();
      },
      0,
      120,
      1
    );

    controlManager.addCheckbox(
      "orbit",
      "Orbit camera: ",
      () => this.orbitCoontrols,
      (value) => {
        this.orbitCoontrols = value as boolean;
      }
    );

    controlManager.addCheckbox(
      "infextion",
      "Run infection: ",
      () => this.globe.runInfection,
      (value) => {
        this.globe.runInfection = value as boolean;
      }
    );

    controlManager.addCheckbox(
      "deform",
      "Click deform: ",
      () => this.globe.terrainClickAllowed,
      (value) => {
        this.globe.terrainClickAllowed = value as boolean;
      }
    );

    controlManager.addDropdown(
      "cmaera",
      "Camera: ",
      () => "Player",
      (value) => {
        this.cameraAttachedTo = value === "Player" ? this.player.getObject() : this.flyingObjects[parseInt(value.replace("UFO #", ""))].getObject();
      },
      ["Player", ...this.flyingObjects.map((_, index) => "UFO #" + index)]
    );

    const config = this.currentGenerator.config;
    Object.keys(config).forEach((propKey) => {
      if (typeof config[propKey as keyof VoronoiNoiseConfig] === "number") {
        controlManager.addSlider(
          propKey,
          propKey,
          () => config[propKey as keyof VoronoiNoiseConfig] as number,
          (value) => {
            (config[propKey as keyof VoronoiNoiseConfig] as number) = Number(value);
          },
          0,
          propKey === "octaves" ? 8 : 2,
          propKey === "octaves" ? 1 : 0.1
        );
      }
    });
  }
}