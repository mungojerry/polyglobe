import * as THREE from "three";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise";
import { debugManager } from "../managers/debugManager";

export class FlyScene {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;

  private mapWidth = 1024;
  private mapHeight = 1024;
  private matDivs = 13;
  private matSquareSize = Math.pow(2, 22);
  private subtractFactor = 6 * this.matSquareSize;
  private matViewSize = 1000;
  private conversionFactor = this.matViewSize / (this.matSquareSize * 12);
  private matActualSize = this.matViewSize * (13 / 12);

  private mapHeightData: number[][] = [];
  // private mapTileData: number[][] = [];

  private playerPosition: THREE.Vector3 = new THREE.Vector3(0, 100, 0);
  private playerVelocity: THREE.Vector3 = new THREE.Vector3();
  private playerRotation: THREE.Euler = new THREE.Euler();
  private playerMesh: THREE.Mesh;

  private clock: THREE.Clock = new THREE.Clock();

  private keysPressed = new Set<string>();
  private mouseX = 0;
  private mouseY = 0;
  private previousMouseX = 0;
  private previousMouseY = 0;

  private simplexNoise: SimplexNoise;

  private isThrusting = false;
  private thrustForce = 15.0;

  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb); // Sky blue background
    this.simplexNoise = new SimplexNoise();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(this.renderer.domElement);

    // Increase ambient light
    const ambientLight = new THREE.AmbientLight(0x404040, 1.0);
    this.scene.add(ambientLight);

    // Adjust directional light
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(50, 200, 100);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.1;
    dirLight.shadow.camera.far = 500;
    this.scene.add(dirLight);

    // Add point lights for additional atmosphere
    const pointLight1 = new THREE.PointLight(0x00ff00, 0.5, 100);
    pointLight1.position.set(20, 20, 20);
    this.scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0x0000ff, 0.5, 100);
    pointLight2.position.set(-20, 20, -20);
    this.scene.add(pointLight2);

    // Generate map data
    this.generateMapData();

    // Create terrain
    this.createTerrain();

    // Create player
    this.createPlayer();

    // Set up camera
    this.camera.position.set(0, 1050, 50);
    this.camera.lookAt(0, 0, 0);

    // Handle window resize
    window.addEventListener("resize", () => {
      this.onWindowResize();
    });

    // Handle keyboard input
    window.addEventListener("keydown", (event) => {
      this.keysPressed.add(event.key);
    });

    // Handle keyboard input
    window.addEventListener("keyup", (event) => {
      this.keysPressed.delete(event.key);
    });

    // Handle mouse movement
    window.addEventListener("mousemove", (event) => {
      this.mouseX = event.clientX;
      this.mouseY = event.clientY;
    });

    // Add mouse event listeners
    window.addEventListener("mousedown", () => (this.isThrusting = true));
    window.addEventListener("mouseup", () => (this.isThrusting = false));

    // Start animation loop
    this.animate();
  }

  private generateMapData() {
    for (let a = 0; a < this.mapWidth; a++) {
      this.mapHeightData[a] = [];
      // this.mapTileData[a] = [];
      for (let b = 0; b < this.mapHeight; b++) {
        const nopise = this.simplexNoise.noise(b, a) + this.simplexNoise.noise(b + 100, a + 100) * 0.5;

        this.mapHeightData[a][b] = nopise;
        // this.mapHeightData[a][b] = 0.3 * (Math.random() * 50 + 100 * Math.cos(50 * a) + 50 * Math.cos(40 * a + 50 * b));
        // this.mapTileData[a][b] = 1 + Math.floor(Math.random() * 3); // Replace with your tile logic
      }
    }

    // Create a "launchpad"
    // for (let a = 0; a < 8; a++) {
    //   for (let b = 0; b < 8; b++) {
    //     this.mapTileData[a][b] = 2;
    //     this.mapHeightData[a][b] = 100;
    //   }
    // }
  }

  private createTerrain() {
    const geometry = new THREE.PlaneGeometry(this.mapWidth, this.mapHeight, this.mapWidth - 1, this.mapHeight - 1);

    // Add minor perturbations to the geometry
    const vertices = geometry.attributes.position.array;
    for (let i = 0; i < vertices.length; i += 3) {
      vertices[i + 2] = this.mapHeightData[Math.floor(i / 3) % this.mapWidth][Math.floor(i / 3 / this.mapWidth)] * 1; // Adjust scale as needed
    }
    geometry.attributes.position.needsUpdate = true;

    const material = new THREE.MeshPhongMaterial({
      color: 0xff0000,
      side: THREE.DoubleSide,
      wireframe: true,
    });
    const terrain = new THREE.Mesh(geometry, material);
    terrain.position.set(0, 0, 0); // Place at origin
    terrain.rotation.x = -Math.PI / 2; // Rotate to be horizontal
    terrain.receiveShadow = true; // Enable shadow receiving
    this.scene.add(terrain);
  }

  private createPlayer() {
    const geometry = new THREE.BoxGeometry(2, 0.5, 3); // width, height, depth
    const material = new THREE.MeshStandardMaterial({
      color: 0x00ff00,
      roughness: 0.4,
      metalness: 0.3,
    });

    this.playerMesh = new THREE.Mesh(geometry, material);
    this.playerMesh.position.copy(this.playerPosition);
    this.playerMesh.rotation.copy(this.playerRotation);
    this.playerMesh.castShadow = true;
    this.playerMesh.receiveShadow = true;

    this.scene.add(this.playerMesh);
  }

  private onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private animate() {
    const deltaTime = this.clock.getDelta();

    // Handle player input and movement
    this.handleInput(deltaTime);

    // Update player mesh
    this.playerMesh.position.copy(this.playerPosition);
    this.playerMesh.rotation.copy(this.playerRotation);

    // Update camera position
    const cameraOffset = new THREE.Vector3(0, 5, -15); // Behind and slightly above
    // cameraOffset.applyEuler(this.playerRotation);
    this.camera.position.copy(this.playerPosition).add(cameraOffset);
    this.camera.lookAt(this.playerPosition);

    this.renderer.render(this.scene, this.camera);

    requestAnimationFrame(() => this.animate());
  }

  private handleInput(deltaTime: number) {
    // Keyboard input
    const keyboardInput = new THREE.Vector3();

    if (this.keysPressed.has("ArrowUp") || this.keysPressed.has("w")) {
      keyboardInput.z -= 1;
    }
    if (this.keysPressed.has("ArrowDown") || this.keysPressed.has("s")) {
      keyboardInput.z += 1;
    }
    if (this.keysPressed.has("ArrowLeft") || this.keysPressed.has("a")) {
      keyboardInput.x -= 1;
    }
    if (this.keysPressed.has("ArrowRight") || this.keysPressed.has("d")) {
      keyboardInput.x += 1;
    }

    // Mouse input (for looking)
    const mouseDelta = new THREE.Vector2();
    mouseDelta.x = this.mouseX - this.previousMouseX;
    mouseDelta.y = this.mouseY - this.previousMouseY;

    this.playerRotation.y -= mouseDelta.x * 0.002; // Yaw
    this.playerRotation.x -= mouseDelta.y * 0.002; // Pitch

    // Clamp pitch to prevent inversions
    this.playerRotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.playerRotation.x));

    // Calculate movement direction
    // const direction = new THREE.Vector3();
    // direction.set(0, 0, -1);
    // direction.applyEuler(this.playerRotation);

    // // Calculate movement vector
    // const movementVector = direction.clone().multiplyScalar(keyboardInput.length() * deltaTime * 10);

    // // Apply movement to player velocity
    // this.playerVelocity.add(movementVector);

    // Apply thrust when mouse is pressed
    if (this.isThrusting) {
      // Create basis matrix from player rotation
      const playerMatrix = new THREE.Matrix4().makeRotationFromEuler(this.playerRotation);

      // Get local down vector (-Y axis)
      const localThrust = new THREE.Vector3(0, -1, 0);

      // // Transform to world space
      // const worldThrust = localThrust.clone().transformDirection(playerMatrix);

      // Apply thrust
      const thrust = localThrust.multiplyScalar(this.thrustForce * deltaTime);
      this.playerVelocity.add(thrust);
    }

    this.playerVelocity.multiplyScalar(0.9);

    // Apply gravity (simple implementation)
    this.playerVelocity.y -= 9.8 * deltaTime;

    debugManager.set("v", "v: " + this.playerVelocity.x.toFixed(4) + "," + this.playerVelocity.y.toFixed(4) + "," + this.playerVelocity.z.toFixed(4) + ",");
    debugManager.set("p", "p: " + this.playerPosition.x.toFixed(4) + "," + this.playerPosition.y.toFixed(4) + "," + this.playerPosition.z.toFixed(4) + ",");

    // Limit player velocity
    const maxSpeed = 20;
    // if (this.playerVelocity.lengthSq() > maxSpeed * maxSpeed) {
    //   this.playerVelocity.normalize().multiplyScalar(maxSpeed);
    // }

    // Update player position
    this.playerPosition.add(this.playerVelocity.clone().multiplyScalar(1));

    // Handle ground collision (simplified)
    if (this.playerPosition.y < 0) {
      this.playerPosition.y = 0;
      this.playerVelocity.y = 0;
    }

    // Update previous mouse positions
    this.previousMouseX = this.mouseX;
    this.previousMouseY = this.mouseY;
  }
}
