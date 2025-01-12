import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { controlManager } from "../managers/controlManager";
import { ParticlePresets } from "../particles/ParticlePresets";
import { ParticleSystem } from "../particles/ParticleSystem";

export class ParticleExampleScene {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private clock: THREE.Clock;

  private effects: Map<string, THREE.Object3D>;
  private effectsGrid: { rows: number; cols: number; spacing: number };

  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);

    this.camera.position.set(0, 15, 30);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    this.clock = new THREE.Clock();
    this.effects = new Map();

    // Grid layout configuration
    this.effectsGrid = {
      rows: 3,
      cols: 4,
      spacing: 15,
    };

    this.initScene();
    this.initEffects();
    this.animate();

    // Handle window resize
    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  private initScene(): void {
    // Add ground plane for reference
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshBasicMaterial({
        color: 0x333333,
        side: THREE.DoubleSide,
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -5;
    this.scene.add(ground);

    // Add ambient light
    const ambient = new THREE.AmbientLight(0x444444);
    this.scene.add(ambient);

    // Add directional light
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(10, 10, 10);
    this.scene.add(light);
  }

  private initEffects(): void {
    const effects = [
      { name: "Thrust", creator: ParticlePresets.createThrustEffect },
      { name: "Ion Thruster", creator: ParticlePresets.createIonThrusterEffect },
      { name: "Fire", creator: ParticlePresets.createFireEffect },
      { name: "Plasma", creator: ParticlePresets.createPlasmaEffect },
      { name: "Smoke", creator: ParticlePresets.createSmokeEffect },
      { name: "Magic", creator: ParticlePresets.createMagicEffect },
      { name: "Explosion", creator: ParticlePresets.createExplosionEffect },
      { name: "Sparkle", creator: ParticlePresets.createSparkleEffect },
      { name: "Portal", creator: ParticlePresets.createPortalEffect },
      { name: "Poison Cloud", creator: ParticlePresets.createPoisonCloudEffect },
      { name: "Rain", creator: ParticlePresets.createRainEffect },
      { name: "Waterfall", creator: ParticlePresets.createWaterfallEffect },
      { name: "Swarm", creator: ParticlePresets.createSwarmEffect },
      { name: "Snow", creator: ParticlePresets.createSnowEffect },
      { name: "Glow effect", creator: ParticlePresets.createLanternGlowEffect },
      { name: "Trail", creator: ParticlePresets.createCometTrailEffect },
      { name: "Electric arc", creator: ParticlePresets.createElectricArcEffect },
      { name: "Sphere emitter", creator: ParticlePresets.createSphereEmitterEffect },
      { name: "Box emitter", creator: ParticlePresets.createBoxEmitterEffect },
      { name: "Ring emitter", creator: ParticlePresets.createRingEmitterEffect },
      { name: "Cylinder emitter", creator: ParticlePresets.createCylinderEmitterEffect },
    ];

    const { rows, cols, spacing } = this.effectsGrid;
    const offsetX = ((cols - 1) * spacing) / 2;
    const offsetZ = ((rows - 1) * spacing) / 2;

    effects.forEach((effect, index) => {
      const accordion = controlManager.addAccordion(effect.name, effect.name);

      const row = Math.floor(index / cols);
      const col = index % cols;

      const position = new THREE.Vector3(col * spacing - offsetX, 0, row * spacing - offsetZ);

      const particleSystem = effect.creator(position);
      this.scene.add(particleSystem);
      this.effects.set(effect.name, particleSystem);

      // Add text label
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      canvas.width = 256;
      canvas.height = 64;

      if (context) {
        context.fillStyle = "#ffffff";
        context.font = "24px Arial";
        context.textAlign = "center";
        context.fillText(effect.name, canvas.width / 2, canvas.height / 2);
      }

      const texture = new THREE.CanvasTexture(canvas);
      const labelMaterial = new THREE.SpriteMaterial({ map: texture });
      const label = new THREE.Sprite(labelMaterial);
      label.position.copy(position);
      label.position.y += 3;
      label.scale.set(5, 1.25, 1);
      this.scene.add(label);
    });
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);

    const deltaTime = this.clock.getDelta();

    // Update controls
    this.controls.update();

    // Update all particle systems
    this.effects.forEach((effect) => {
      if (effect instanceof ParticleSystem) {
        effect.emit(10);
        effect.update(deltaTime);
      }
    });

    this.renderer.render(this.scene, this.camera);
  };
}

// Usage:
// const container = document.getElementById('particle-demo');
// const demo = new ParticleDemo(container);
