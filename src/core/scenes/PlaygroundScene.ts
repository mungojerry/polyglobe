import * as THREE from "three";
import { debugManager } from "../managers/debugManager";
import { ParticleSystem } from "../particles/ParticleSystem";

export class PlaygroundScene {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private cube: THREE.Mesh;
  private globe: THREE.Mesh;
  private particleSystem: ParticleSystem;
  private mouse: THREE.Vector2;
  private raycaster: THREE.Raycaster;

  constructor() {
    // Create scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x111111);

    // Set up camera
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(3, 3, 5);
    this.camera.lookAt(0, 0, 0);

    // Initialize renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(this.renderer.domElement);

    // Add lights
    const ambientLight = new THREE.AmbientLight(0x404040);
    this.scene.add(ambientLight);

    // Create cube
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshPhongMaterial({
      color: 0x156289,
      shininess: 100,
      flatShading: true,
      transparent: true,
      opacity: 0.4,
    });
    this.cube = new THREE.Mesh(geometry, material);
    // this.scene.add(this.cube);

    const globeGeometry = new THREE.IcosahedronGeometry(1, 10);
    const globeMaterial = new THREE.MeshPhongMaterial({
      color: 0x00ff00,
      shininess: 100,
      // vertexColors: true,
      transparent: true,
      opacity: 0.4,
      flatShading: true,
    });

    this.globe = new THREE.Mesh(globeGeometry, globeMaterial);
    this.scene.add(this.globe);

    const textureLoader = new THREE.TextureLoader();
    this.particleSystem = new ParticleSystem({
      maxParticles: 1000,
      gravity: 0.1,
      gravityDirection: new THREE.Vector3(0, 0, 0),
      texture: textureLoader.load("assets/textures/fire.png"),
    });

    this.scene.add(this.particleSystem);
    this.particleSystem.addCollidableMesh(this.globe);

    this.mouse = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();

    // Add mouse move listener
    window.addEventListener("mousemove", (event) => this.onMouseMove(event));

    // Handle resize
    window.addEventListener("resize", this.onWindowResize.bind(this));

    debugManager.addElement("fps", () => {
      const fps = 1 / ((performance.now() - this.lastFrameTime) / 1000);
      return `FPS: ${fps.toFixed(1)}`;
    });

    // Start animation
    this.animate();
  }
  private lastFrameTime: number = 0;
  private animate(): void {
    requestAnimationFrame(() => this.animate());

    // Calculate delta time in seconds
    const currentTime = performance.now();
    const deltaTime = (currentTime - this.lastFrameTime) / 1000 / 60; // Convert to seconds
    this.lastFrameTime = currentTime;

    this.cube.rotation.x += 0.01;
    this.cube.rotation.y += 0.01;

    // Update raycaster
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersectPoint = new THREE.Vector3();
    // Project mouse to z=0 plane
    const planeNormal = new THREE.Vector3(0, 0, 1);
    const plane = new THREE.Plane(planeNormal);
    this.raycaster.ray.intersectPlane(plane, intersectPoint);

    // Emit particles at mouse position
    this.particleSystem.emit({
      position: intersectPoint,
      velocity: new THREE.Vector3(Math.random() - 0.5, 0.1, Math.random() - 0.5),
      color: new THREE.Color(1, 0.5, 0),
      startSize: 1,
      endSize: 2,
      lifetime: 3.0,
      startOpacity: 1.0,
      endOpacity: 0,
      followVelocity: true,
      bounceCoefficient: 0.4,
    });

    this.particleSystem.update(0.01);
    this.renderer.render(this.scene, this.camera);
  }

  private onMouseMove(event: MouseEvent): void {
    // Convert mouse position to normalized device coordinates (-1 to +1)
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  }

  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
