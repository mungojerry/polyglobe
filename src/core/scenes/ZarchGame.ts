import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise";

export class ZarchGame {
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
  private isOrbitEnabled: boolean = false;
  private defaultCameraPosition: THREE.Vector3;
  private defaultCameraTarget: THREE.Vector3;
  private cameraOffset: THREE.Vector3;
  private readonly CAMERA_LERP_FACTOR = 0.8;

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

    this.defaultCameraPosition = new THREE.Vector3(0, 20, 50);
    this.defaultCameraTarget = new THREE.Vector3(0, 0, 0);
    this.cameraOffset = new THREE.Vector3(0, 2, 2);

    // Initialize game elements
    this.initializeScene();
    this.setupEventListeners();
    this.animate();
  }

  initializeScene() {
    // Ship
    this.ship = this.createShip();
    this.scene.add(this.ship);

    // Landscape
    this.landscape = this.createLandscape(1000, 1000, 4);
    this.scene.add(this.landscape);

    // Camera positioning
    this.camera.position.set(0, 20, 50);
    this.camera.lookAt(0, 0, 0);

    // Lighting
    this.addLighting();
  }

  createShip() {
    const shipGeometry = new THREE.ConeGeometry(0.2, 1, 6);
    const shipMaterial = new THREE.MeshPhongMaterial({ color: 0x00ff00 });
    const ship = new THREE.Mesh(shipGeometry, shipMaterial);
    ship.frustumCulled = false;
    ship.rotation.x = Math.PI * 2;
    ship.position.y = 30;
    return ship;
  }

  createLandscape(width: number, depth: number, heightVariation: number) {
    const geometry = new THREE.PlaneGeometry(width, depth, width / 5, depth / 5);
    const vertices = geometry.attributes.position.array;
    const noise = new SimplexNoise();

    let minHeight = Infinity;
    let maxHeight = -Infinity;
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i] / width;
      const z = vertices[i + 1] / depth;

      // Calculate height with multiple octaves of Simplex Noise
      let height = 0;
      let persistence = 0.5; // Controls the amplitude of each octave
      let octaveCount = 8; // Number of octaves to use

      for (let j = 0; j < octaveCount; j++) {
        const frequency = Math.pow(2, j);
        const amplitude = Math.pow(persistence, j);
        height += noise.noise(x * frequency, z * frequency) * amplitude * heightVariation;
      }

      height *= 10; // Scale the final height
      vertices[i + 2] = height;

      minHeight = Math.min(minHeight, height);
      maxHeight = Math.max(maxHeight, height);
    }

    const material = new THREE.MeshStandardMaterial({ flatShading: true, vertexColors: true, wireframe: false, side: THREE.DoubleSide });
    material.vertexColors = true;

    // In createLandscape, replace color assignment section:
    const colors = [];
    // Define color stops
    const colorStops = [
      { height: 0.0, color: new THREE.Color(1, 1, 1) },
      { height: 0.2, color: new THREE.Color(0.6, 0.5, 0.4) },
      { height: 0.4, color: new THREE.Color(0.4, 0.3, 0.2) },
      { height: 0.6, color: new THREE.Color(0.3, 0.2, 0.1) },
      { height: 0.9, color: new THREE.Color(0, 0.3, 0.8) },
    ];

    for (let i = 0; i < vertices.length; i += 3) {
      const height = vertices[i + 2];
      const normalizedHeight = (height - minHeight) / (maxHeight - minHeight);
      let color;

      // Check for water level

      // Find color stops to lerp between (excluding water)
      let lower = colorStops[1];
      let upper = colorStops[colorStops.length - 1];

      for (let j = 1; j < colorStops.length - 1; j++) {
        if (normalizedHeight >= colorStops[j].height && normalizedHeight <= colorStops[j + 1].height) {
          lower = colorStops[j];
          upper = colorStops[j + 1];
          break;
        }
      }

      const t = (normalizedHeight - lower.height) / (upper.height - lower.height);
      color = this.lerpColor(lower.color, upper.color, t);

      colors.push(color.r, color.g, color.b);
    }

    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  }
  private lerpColor(colorA: THREE.Color, colorB: THREE.Color, t: number): THREE.Color {
    const result = new THREE.Color();
    result.r = colorA.r + (colorB.r - colorA.r) * t;
    result.g = colorA.g + (colorB.g - colorA.g) * t;
    result.b = colorA.b + (colorB.b - colorA.b) * t;
    return result;
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

  private thrustActive = false;
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

  animate() {
    requestAnimationFrame(() => this.animate());
    this.ship.position.add(this.velocity);
    this.updateShipPosition();
    if (!this.isOrbitEnabled) {
      this.updateCamera();
    } else {
      this.controls.update();
    }
    this.renderer.render(this.scene, this.camera);
  }

  // Add this to your animation loop
  private updateLandscape(): void {
    if (!this.landscape) return;

    const scrollSpeed = 0.5;
    this.landscape.position.z += scrollSpeed;

    // Reset terrain segments when they move too far
    if (this.landscape.position.z > 50) {
      this.landscape.position.z = 0;
      // Optionally regenerate terrain here for variety
    }
  }

  start() {
    // Optional method to explicitly start the game
    console.log("Game started!");
  }

  private getTerrainHeight(x: number, z: number): number {
    // Convert world coordinates to terrain coordinates
    if (!this.landscape.geometry.boundingBox) {
      this.landscape.geometry.computeBoundingBox();
    }
    if (!this.landscape.geometry.boundingBox) {
      return 0; // Return default height if boundingBox is still null
    }
    const width = this.landscape.geometry.boundingBox.max.x - this.landscape.geometry.boundingBox.min.x;
    const depth = this.landscape.geometry.boundingBox.max.z - this.landscape.geometry.boundingBox.min.z;

    // Get vertices from geometry
    const vertices = this.landscape.geometry.attributes.position.array;
    const segmentWidth = width / (Math.sqrt(vertices.length / 3) - 1);
    const segmentDepth = depth / (Math.sqrt(vertices.length / 3) - 1);

    // Find grid coordinates
    const gx = Math.floor((x + width / 2) / segmentWidth);
    const gz = Math.floor((z + depth / 2) / segmentDepth);

    // Get vertex indices
    const idx = (gz * Math.sqrt(vertices.length / 3) + gx) * 3;

    // Return height at position
    return vertices[idx + 2];
  }

  private updateShipPosition(): void {
    // Get terrain height at ship position
    const terrainHeight = this.getTerrainHeight(this.ship.position.x, this.ship.position.z);

    // Prevent ship from going below terrain
    if (this.ship.position.y < terrainHeight) {
      this.ship.position.y = terrainHeight;
      this.velocity.y = -this.velocity.y * 0.9; // Stop downward movement
    }

    if (this.thrustActive) {
      this.applyThrust();
    }

    // Update ship position with physics
    this.velocity.y -= 0.001; // Gravity
    this.ship.position.add(this.velocity);
  }

  private toggleOrbitCamera(): void {
    this.isOrbitEnabled = !this.isOrbitEnabled;

    if (!this.isOrbitEnabled) {
      // Reset to default game camera
      this.camera.position.copy(this.defaultCameraPosition);
      this.camera.lookAt(this.defaultCameraTarget);
      this.controls.enabled = false;
    } else {
      this.controls.enabled = true;
    }
  }

  private updateCamera(): void {
    if (!this.isOrbitEnabled) {
      // Calculate desired camera position
      const targetPosition = new THREE.Vector3();
      targetPosition.copy(this.ship.position).add(this.cameraOffset);

      // Smoothly move camera
      this.camera.position.lerp(targetPosition, this.CAMERA_LERP_FACTOR);
      this.camera.lookAt(this.ship.position);
    }
  }
}
