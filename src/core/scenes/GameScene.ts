import RAPIER, { EventQueue, RigidBody, Vector3, World } from "@dimforge/rapier3d";
import * as THREE from "three";
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from "three-mesh-bvh";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { SpeedShader } from "../effects/SpeedShader";
import { UnderWaterShader } from "../effects/UnderWaterShader";
import { Cloud } from "../entities/Cloud";
import { EnemyEntity } from "../entities/EnemyEntity";
import { Moon } from "../entities/Moon";
import { PlayerEntity } from "../entities/PlayerEntity";
import { Stars } from "../entities/Stars";
import { Sun } from "../entities/Sun";
import { ButtonElement, ColorElement, controlManager, SliderElement } from "../managers/ControlManager";
import { debugManager } from "../managers/DebugManager";
import { modelGroups } from "../managers/models";
import { ObjectManager } from "../managers/ObjectManager";
import { Globe } from "../planet/Globe";
import { MiniGlobe } from "../planet/MiniGlobe";
import { BaseNoise } from "../planet/noise/BaseNoise";
import { TerrainHelper } from "../planet/terrainHelper";
import { LoadingScreen } from "../ui/LoadingScreen";
import { CameraController } from "../utils/CameraController";
import { generateRandomPosition } from "../utils/utils";
import { vectorPool } from "../utils/VectorPool";
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
  orbitCoontrols: false,
};

export class GameScene {
  private readonly world: World;
  private readonly eventQueue: EventQueue;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly controls: OrbitControls;
  private readonly globe: Globe;
  private underWaterPass: ShaderPass;
  private speedPass: ShaderPass;
  private isUnderwater: boolean = false;
  private readonly player: PlayerEntity;
  private enemies: EnemyEntity[] = [];
  private readonly clouds: Cloud[] = [];
  private readonly stars: Stars;
  private objectManager!: ObjectManager;
  private miniGlobe!: MiniGlobe;
  private loadingScreen: LoadingScreen;
  private isInitializing: boolean = false;
  private isInitialized: boolean = false;
  private cameraController: CameraController;
  private debugMesh: THREE.LineSegments;

  private currentGenerator: BaseNoise;
  private sun!: Sun;
  private moon!: Moon;
  private debugEnabled: boolean = false;
  private readonly GRAVITY_FUDGE: number = 0.01; //   0.01;
  private readonly G = 9.81 * this.GRAVITY_FUDGE;

  constructor() {
    this.world = new World(new Vector3(0, 0, 0));
    this.eventQueue = new EventQueue(false);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 4000);
    this.cameraController = new CameraController(this.camera);
    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.CineonToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Initialize EffectComposer
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    // Initialize underwater effect
    this.underWaterPass = new ShaderPass(UnderWaterShader);
    this.underWaterPass.enabled = false;
    this.composer.addPass(this.underWaterPass);

    // Initialise speed effect
    this.speedPass = new ShaderPass(SpeedShader);
    // this.composer.addPass(this.speedPass);

    document.body.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.enableZoom = true;

    const ambientLight = new THREE.AmbientLight(0xffffd0, 0.2);
    this.scene.add(ambientLight);

    this.globe = new Globe(this.camera, this.world);

    this.currentGenerator = this.globe.noise;
    TerrainHelper.getInstance().setDefaults(this.currentGenerator, this.globe.getLandGeometry());

    this.player = new PlayerEntity(this.scene, this.world, generateRandomPosition(this.globe.getRadius() * 1.3), this.renderer);

    this.cameraController.attachTo(this.player);

    this.camera.position.set(0, this.globe.getRadius() * 2, 0);

    this.debugMesh = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff, vertexColors: true }));
    this.debugMesh.frustumCulled = false;
    this.scene.add(this.debugMesh);
    this.debugMesh.visible = this.debugEnabled;

    this.stars = new Stars(this.globe.getRadius() * 5);
    this.scene.add(this.stars.getObject());

    this.loadingScreen = new LoadingScreen();

    this.initializeenemies();

    // Start initialization
    this.initialize();

    this.sun = new Sun(this.globe, this.scene, this.globe.getRadius() * 2.4);
    this.moon = new Moon(this.scene, this.globe.getRadius() * 2.4);

    this.setupControls();
    this.setupListeners();

    // Start render loop immediately with loading state
    this.animate();
  }

  private setupListeners() {
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
  }

  private async initialize(): Promise<void> {
    if (this.isInitializing) {
      debugManager.set("warning", "Initialization already in progress");
      return;
    }

    this.isInitializing = true;
    this.isInitialized = false;
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
      if (this.miniGlobe) this.miniGlobe.dispose();
      this.miniGlobe = new MiniGlobe(this.globe.getMiniMapGeometry(), this.camera, 200, 200);
      // Add markers to miniglobe
      this.miniGlobe.addMarkers([this.player], 0x00ff00);
      this.miniGlobe.addMarkers([...this.enemies], 0xff0000);

      this.loadingScreen.updateStage("Initializing World", 50);
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

  private async initializeenemies(): Promise<void> {
    const globeRadius = this.globe.getRadius();
    const minDistance = globeRadius * 1.1;
    for (let i = 0; i < config.numUFOs; i++) {
      const position = generateRandomPosition(minDistance);
      const enemy = new EnemyEntity(this.scene, this.world, position, this.globe, this.player);
      this.enemies.push(enemy);
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

  private isPositionUnderwater(position: THREE.Vector3): boolean {
    return position.length() < this.globe.getWaterLevel();
  }

  private animate(): void {
    const step = () => {
      if (!this.isInitialized) {
        // Render loading state
        this.composer.render();
        requestAnimationFrame(step);
        return;
      }

      // Check if camera is underwater
      const wasUnderwater = this.isUnderwater;
      this.isUnderwater = this.isPositionUnderwater(this.camera.position);

      // Update underwater effect
      if (this.isUnderwater !== wasUnderwater) {
        this.underWaterPass.enabled = this.isUnderwater;
      }

      if (this.isUnderwater) {
        this.underWaterPass.uniforms.time.value += 0.016; // ~60fps
      }

      this.world.step(this.eventQueue);
      this.applyGravityToObjects();
      this.clouds.forEach((cloud) => cloud.animateCloud());
      this.globe.update(this.camera, 1);
      this.player.update(this.camera);
      this.updateDayNightCycle();
      if (config.orbitCoontrols) this.controls.update();
      else this.cameraController.update();
      BulletGenerator.getInstance(this.world).update(1);
      const camPos = this.camera.position;

      // this.dynamicBodies.forEach(({ mesh, body }) => {
      //   const position = body.translation();
      //   mesh.position.set(position.x, position.y, position.z);
      //   const rotation = body.rotation();
      //   mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
      // });

      debugManager.set("camera", "Cam: " + camPos.x.toFixed(2) + "," + camPos.y.toFixed(2) + "," + camPos.z.toFixed(2));
      if (this.debugMesh?.visible) {
        this.updateDebugVisualization();
      }
      this.enemies.forEach((enemy) => enemy.update(this.camera));
      if (this.miniGlobe) {
        this.miniGlobe.update();
      }
      debugManager.set("polys", "Polys: " + this.renderer.info.render.triangles);
      // if (this.cameraAttachedTo === this.player.getObject() && !config.orbitCoontrols) this.updateCameraFOV();
      this.composer.render();
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

  private applyGravity(body: RigidBody): void {
    if (!body || !body.isDynamic()) return;

    const position = body.translation();
    const pos = vectorPool.getVector(position.x, position.y, position.z);
    pos.normalize();

    const forceMagnitude = this.G * body.mass();
    const force = new RAPIER.Vector3(-pos.x * forceMagnitude, -pos.y * forceMagnitude, -pos.z * forceMagnitude);

    body.applyImpulse(force, true);

    vectorPool.releaseVector(pos);
  }

  private applyGravityToObjects(): void {
    this.applyGravity(this.player.getBody());

    this.enemies.forEach((enemy) => {
      this.applyGravity(enemy.getBody());
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
      () => config.orbitCoontrols,
      (value) => {
        config.orbitCoontrols = value as boolean;
      }
    );

    controlManager.addCheckbox(
      "speedpass",
      "Speed pass: ",
      () => this.composer.passes.includes(this.speedPass),
      (value) => {
        if (value) {
          this.composer.addPass(this.speedPass);
        } else {
          this.composer.removePass(this.speedPass);
        }
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
        this.cameraController.attachTo(value === "Player" ? this.player : this.enemies[parseInt(value.replace("UFO #", ""))]);
      },
      ["Player", ...this.enemies.map((_, index) => "UFO #" + index)]
    );

    controlManager.addAccordion("waterControls", "Water Shader Controls");
    // Add underwater effect controls
    const waterDistrotion: SliderElement = {
      id: "waterDistortion",
      label: "Water Distortion: ",
      type: "slider",
      getValue: () => this.underWaterPass.uniforms.distortionAmount.value,
      setValue: (value) => {
        this.underWaterPass.uniforms.distortionAmount.value = value as number;
      },
      min: 0,
      max: 0.05,
      step: 0.001,
    };

    const waterBlur: SliderElement = {
      id: "waterBlur",
      label: "Water Blur: ",
      type: "slider",
      getValue: () => this.underWaterPass.uniforms.blurAmount.value,
      setValue: (value) => {
        this.underWaterPass.uniforms.blurAmount.value = value as number;
      },
      min: 0,
      max: 0.01,
      step: 0.0001,
    };

    const waterCaustics: SliderElement = {
      id: "caustics",
      label: "Caustics Intensity: ",
      type: "slider",
      getValue: () => this.underWaterPass.uniforms.causticsIntensity.value,
      setValue: (value) => {
        this.underWaterPass.uniforms.causticsIntensity.value = value as number;
      },
      min: 0,
      max: 0.3,
      step: 0.01,
    };

    // Add color picker for water color
    const waterColorPicker: ColorElement = {
      id: "waterColor",
      label: "Water Color: ",
      type: "color",
      getValue: () => "#" + this.underWaterPass.uniforms.waterColor.value.getHexString(),
      setValue: (value) => {
        this.underWaterPass.uniforms.waterColor.value = new THREE.Color(value);
      },
    };

    controlManager.addChildToAccordion("waterControls", waterDistrotion);
    controlManager.addChildToAccordion("waterControls", waterBlur);
    controlManager.addChildToAccordion("waterControls", waterCaustics);
    controlManager.addChildToAccordion("waterControls", waterColorPicker);

    // Add speed effect controls
    controlManager.addAccordion("speedControls", "Speed Effect Controls");

    const speedIntensity: SliderElement = {
      id: "speedIntensity",
      label: "Speed Effect Intensity: ",
      type: "slider",
      getValue: () => this.speedPass.uniforms.speed.value,
      setValue: (value) => {
        this.speedPass.uniforms.speed.value = value as number;
      },
      min: 0,
      max: 2,
      step: 0.1,
    };

    controlManager.addChildToAccordion("speedControls", speedIntensity);

    controlManager.addAccordion("noiseControls", "Noise Generator Controls");

    // Add noise generator controls
    const noiseConfig = this.currentGenerator.getConfig();
    const rebuildButton: ButtonElement = {
      id: "rebuildButton",
      label: "Rebuild globe",
      type: "button",
      callback: () => this.initialize(),
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
    Object.keys(noiseConfig).forEach((propKey) => {
      if (typeof noiseConfig[propKey] === "number") {
        const sliderControl: SliderElement = {
          id: propKey,
          label: propKey,
          type: "slider",
          getValue: () => noiseConfig[propKey] as number,
          setValue: (value) => {
            (noiseConfig[propKey] as number) = Number(value);
          },
          min: propKey === "octaves" ? 1 : 0,
          max: propKey === "octaves" ? 10 : 2,
          step: propKey === "octaves" ? 1 : 0.1,
        };

        controlManager.addChildToAccordion("noiseControls", sliderControl);
      }
    });
  }
}
