import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { Water } from "../effects/Water";
import { AccordionElement, ButtonElement, ColorElement, controlManager, SliderElement } from "../managers/controlManager";
import { pseudoRandom } from "../utils/PseudoRandom";
import { LandscapeConfig, LandscapeGenerator } from "./LandscaoeGeneration";
import { PLANET_PRESETS } from "./LandscapePresets";

export class ZarchGameSpherical {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private velocity: THREE.Vector3;
  private readonly thrust: number;
  private readonly maxVelocity: number;
  private ship!: THREE.Mesh;
  private landscape!: THREE.Mesh;
  private directionalLight: THREE.DirectionalLight; // Add this
  private lightHelper: THREE.DirectionalLightHelper; // Add this
  private controls: OrbitControls;
  private isOrbitEnabled: boolean = true;
  private readonly CAMERA_LERP_FACTOR = 0.8;
  private readonly PLANET_RADIUS = 200;
  private readonly GRAVITY_STRENGTH = 0.01;
  private mousePosition: THREE.Vector2 = new THREE.Vector2();
  private thrustActive: boolean = false;
  private waterSphere!: Water;
  private readonly WATER_LEVEL = 1.04; // 1% above planet radius
  private currentSeed = 23478;
  private landscapeConfig: LandscapeConfig = {
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
    mountainRanges: {
      count: 2,
      height: 0.2,
      complexity: 8,
    },
  };

  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x87ceeb); // Sky blue
    document.body.appendChild(this.renderer.domElement);

    // Debug helpers
    const axesHelper = new THREE.AxesHelper(1000);
    const gridHelper = new THREE.GridHelper(1000, 100);
    this.scene.add(axesHelper);
    this.scene.add(gridHelper);

    // Camera setup
    this.camera.position.set(0, 300, 300);
    this.camera.lookAt(0, 0, 0);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(100, 100, 100);
    this.scene.add(directionalLight);

    // Game state
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.thrust = 0.01;
    this.maxVelocity = 2;

    // Add directional light
    this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    this.directionalLight.position.set(100, 100, 50);
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.width = 2048;
    this.directionalLight.shadow.mapSize.height = 2048;
    this.scene.add(this.directionalLight);

    // Add light helper for debugging
    this.lightHelper = new THREE.DirectionalLightHelper(this.directionalLight, 10);
    this.scene.add(this.lightHelper);

    // Initialize controls after camera and renderer setup
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.screenSpacePanning = false;
    this.controls.minDistance = 1;
    this.controls.maxDistance = 500;
    this.controls.maxPolarAngle = Math.PI / 2;

    this.velocity = new THREE.Vector3();
    this.thrust = 0.1;
    this.maxVelocity = 2.0;

    // Initialize game elements
    this.initializeScene();
    this.setupEventListeners();
    this.animate();
    this.setupDebugControls();
  }

  initializeScene() {
    // Ship
    this.ship = this.createShip();
    this.scene.add(this.ship);

    // Landscape
    this.regenerateLandscape();

    // Water
    this.waterSphere = this.createWaterSphere();
    this.scene.add(this.waterSphere.getObject());

    // Camera positioning
    this.camera.position.set(0, 20, 50);
    this.camera.lookAt(0, 0, 0);

    // Lighting
    this.addLighting();
  }

  public updateLandscapeConfig(newConfig: Partial<LandscapeConfig>): void {
    this.landscapeConfig = { ...this.landscapeConfig, ...newConfig };
    this.regenerateLandscape();
  }

  private regenerateLandscape(): void {
    console.log("regenerateLandscape...");
    pseudoRandom.setSeed(this.currentSeed);
    const startTime = performance.now();
    this.scene.remove(this.landscape);

    const geometry = this.createLandscape();
    this.landscape = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        flatShading: true,
      })
    );
    this.scene.add(this.landscape);
    console.log(`landscape generation in ${performance.now() - startTime}ms`);
    console.log("DONE");
  }
  generator = new LandscapeGenerator(this.PLANET_RADIUS, this.landscapeConfig);
  private createLandscape() {
    this.generator.updateConfig(this.landscapeConfig);
    return this.generator.generateTerrain();
  }

  createShip() {
    const shipGeometry = new THREE.ConeGeometry(0.2, 1, 6);
    const shipMaterial = new THREE.MeshPhongMaterial({ color: 0x00ff00 });
    const ship = new THREE.Mesh(shipGeometry, shipMaterial);
    ship.frustumCulled = false;
    ship.rotation.x = Math.PI * 2;
    ship.position.y = this.PLANET_RADIUS * 2.5;
    return ship;
  }

  private createWaterSphere(): Water {
    return new Water(this.PLANET_RADIUS * this.WATER_LEVEL, 20);
  }
  private updateShipOrientation(event: MouseEvent) {
    // Get screen dimensions
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    // Calculate pointer position relative to screen center
    const centerX = screenWidth / 2;
    const centerY = screenHeight / 2;

    // Calculate offset from center
    const offsetX = event.clientX - centerX;
    const offsetY = event.clientY - centerY;

    // Normalize offsets to [-1, 1] range
    const normalizedX = offsetX / (screenWidth / 2);
    const normalizedY = offsetY / (screenHeight / 2);

    // Calculate angle and magnitude
    const magnitude = Math.min(1, Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY));

    // Yaw (rotation around Z-axis)
    // Map horizontal position to Z-axis rotation
    this.ship.rotation.z = -normalizedX * (Math.PI / 2);

    // Pitch (rotation around X-axis)
    // Map vertical position to X-axis rotation
    // Ensure pitch is between -PI/4 and PI/4
    this.ship.rotation.x = normalizedY * (Math.PI / 2);

    // Optional: Adjust thrust based on magnitude
    if (this.thrustActive) {
      // Scale thrust based on pointer distance from center
      this.velocity.multiplyScalar(magnitude);
    }
  }

  setupEventListeners() {
    // Resize handler
    window.addEventListener("resize", () => this.handleResize());

    // Mouse controls
    this.renderer.domElement.addEventListener("mousedown", (event) => {
      switch (event.button) {
        case 0: // Left click - thrust
          this.thrustActive = true; //();
          break;
      }
    });
    this.renderer.domElement.addEventListener("mouseup", (event) => {
      switch (event.button) {
        case 0: // Left click - thrust
          this.thrustActive = false; //();
          break;
      }
    });

    // Mouse movement for ship rotation
    this.renderer.domElement.addEventListener("mousemove", (event) => {
      this.updateShipOrientation(event);
    });

    // Add keyboard event for toggle
    window.addEventListener("keydown", (event) => {
      if (event.key === "c" || event.key === "C") {
        this.toggleOrbitCamera();
      }
    });

    // Mouse move handler
    window.addEventListener("mousemove", (event) => {
      // Calculate mouse position relative to center
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;

      // Normalize to [-1, 1]
      this.mousePosition.x = (event.clientX - centerX) / centerX;
      this.mousePosition.y = (event.clientY - centerY) / centerY;
    });

    // Thrust control
    window.addEventListener("keydown", (event) => {
      if (event.code === "Space") this.thrustActive = true;
    });

    window.addEventListener("keyup", (event) => {
      if (event.code === "Space") this.thrustActive = false;
    });
  }

  handleResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  applyThrust() {
    const thrustVector = new THREE.Vector3(0, this.thrust, 0);
    thrustVector.applyQuaternion(this.ship.quaternion);

    this.velocity.add(thrustVector);
    this.velocity.clampLength(0, this.maxVelocity);
  }

  fireWeapon() {
    console.log("Weapon fired!");
    // Add weapon logic here
  }

  addLighting() {
    const ambientLight = new THREE.AmbientLight(0x404040);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
    directionalLight.position.set(1, 1, 1);
    this.scene.add(directionalLight);
  }

  private animate(): void {
    requestAnimationFrame(() => this.animate());

    // Update ship physics and position
    this.updateShipPhysics();
    this.updateShipPosition();

    // Update camera based on mode
    if (this.isOrbitEnabled) {
      this.controls.update();
    } else {
      this.updateCamera();
    }

    // Render scene
    this.renderer.render(this.scene, this.camera);
  }

  private updateCamera(): void {
    if (!this.isOrbitEnabled) {
      const shipUp = this.ship.position.clone().normalize();
      const targetPosition = this.ship.position.clone().add(shipUp.multiplyScalar(20)).add(this.velocity.clone().normalize().multiplyScalar(50));

      this.camera.position.lerp(targetPosition, this.CAMERA_LERP_FACTOR);
      this.camera.lookAt(this.ship.position);
      this.camera.up.copy(shipUp);
    }
  }

  private updateShipPosition(): void {
    // Apply velocity to position
    this.ship.position.add(this.velocity);

    // Keep above surface
    const minAltitude = this.PLANET_RADIUS + 2;
    if (this.ship.position.length() < minAltitude) {
      this.ship.position.normalize().multiplyScalar(minAltitude);
    }
  }

  start() {
    // Optional method to explicitly start the game
    console.log("Game started!");
  }

  private toggleOrbitCamera(): void {
    this.isOrbitEnabled = !this.isOrbitEnabled;
    this.controls.enabled = this.isOrbitEnabled;

    if (!this.isOrbitEnabled) {
      // Reset to follow camera when disabling orbit
      this.updateFollowCamera();
    }
  }

  private updateFollowCamera(): void {
    // Calculate desired camera position
    const shipUp = this.ship.position.clone().normalize();
    const targetPosition = this.ship.position.clone().add(shipUp.multiplyScalar(20)).add(this.velocity.clone().normalize().multiplyScalar(50));

    // Smooth camera movement
    this.camera.position.lerp(targetPosition, this.CAMERA_LERP_FACTOR);
    this.camera.lookAt(this.ship.position);
    this.camera.up.copy(shipUp);
  }

  private updateShipPhysics(): void {
    // Vector to planet center (0,0,0)
    const toCenter = new THREE.Vector3(0, 0, 0).sub(this.ship.position);
    const distance = toCenter.length();
    const direction = toCenter.normalize();

    // Inverse square gravity
    const gravity = direction.multiplyScalar(this.GRAVITY_STRENGTH * (this.PLANET_RADIUS / distance) ** 2);

    // Apply gravity
    this.velocity.add(gravity);

    // Update position
    this.ship.position.add(this.velocity);

    // Keep above surface
    const minAltitude = this.PLANET_RADIUS + 2;
    if (this.ship.position.length() < minAltitude) {
      this.ship.position.normalize().multiplyScalar(minAltitude);
      // Kill velocity into surface
      const surfaceNormal = this.ship.position.clone().normalize();
      const velocityIntoSurface = this.velocity.dot(surfaceNormal);
      if (velocityIntoSurface < 0) {
        this.velocity.sub(surfaceNormal.multiplyScalar(velocityIntoSurface));
      }
    }

    // Orient ship relative to surface
    const up = this.ship.position.clone().normalize();
    const shipUp = new THREE.Vector3(0, 1, 0);
    this.ship.quaternion.setFromUnitVectors(shipUp, up);

    // Apply mouse rotation
    if (this.mousePosition.length() > 0) {
      const rotationAxis = new THREE.Vector3(-this.mousePosition.y, 0, this.mousePosition.x);
      this.ship.rotateOnAxis(rotationAxis.normalize(), 0.05);
    }
  }

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
            max: key == "resolution" ? 100 : 4,
            step: key == "resolution" ? 1 : 0.02,
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
