import * as THREE from "three";

export class HelicopterScene {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private helicopter: THREE.Object3D;

  velocity: THREE.Vector3;
  acceleration: THREE.Vector3;
  private mousePosition: THREE.Vector2;
  private thrustActive: boolean;
  private clock: THREE.Clock;
  private thrustVisual: THREE.Mesh;
  private readonly GRAVITY = -0.981;
  private readonly THRUST = 15;
  private isFlying = false;
  private readonly CAMERA_OFFSET = new THREE.Vector3(0, 5, 10);
  private readonly LERP_FACTOR = 0.1;
  private readonly GLOBE_RADIUS = 100;
  private readonly HOVER_HEIGHT = 5;
  private globe: THREE.Mesh;

  constructor() {
    // Initialize core elements
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    document.body.appendChild(this.renderer.domElement);

    // Add grid helper
    const size = 20;
    const divisions = 20;
    const gridHelper = new THREE.GridHelper(size, divisions);
    gridHelper.position.y = -2; // Position grid below helicopter
    this.scene.add(gridHelper);

    // Initialize helicopter
    this.helicopter = new THREE.Object3D();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 0.5), new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true }));
    this.helicopter.add(body);

    // Add thrust visual
    const thrustGeometry = new THREE.ConeGeometry(0.2, 0.5, 16);
    const thrustMaterial = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    this.thrustVisual = new THREE.Mesh(thrustGeometry, thrustMaterial);
    this.thrustVisual.rotation.x = Math.PI; // Point cone downwards
    this.thrustVisual.visible = false; // Initially hidden
    this.helicopter.add(this.thrustVisual);

    this.scene.add(this.helicopter);

    // Camera position
    this.camera.position.copy(this.CAMERA_OFFSET);
    this.camera.lookAt(0, 0, 0);

    // Initialize movement system
    this.mousePosition = new THREE.Vector2(0, 0);
    this.thrustActive = false;
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.clock = new THREE.Clock();

    this.velocity = new THREE.Vector3(0, 0, 0);
    this.acceleration = new THREE.Vector3(0, this.GRAVITY, 0);
    // Create globe
    const globeGeometry = new THREE.SphereGeometry(this.GLOBE_RADIUS, 64, 64);
    const globeMaterial = new THREE.MeshPhongMaterial({
      color: 0x007700,
      wireframe: false,
    });
    this.globe = new THREE.Mesh(globeGeometry, globeMaterial);
    this.scene.add(this.globe);

    // Position helicopter above globe
    this.helicopter.position.y = this.GLOBE_RADIUS + this.HOVER_HEIGHT;

    // Add lighting
    const light = new THREE.DirectionalLight(0xffffff, 1);
    light.position.set(0, 100, 0);
    this.scene.add(light);
    this.scene.add(new THREE.AmbientLight(0x404040));

    // Event listeners
    window.addEventListener("mousemove", this.onMouseMove.bind(this));
    window.addEventListener("mousedown", this.onMouseDown.bind(this));
    window.addEventListener("mouseup", this.onMouseUp.bind(this));

    // Add key listeners for thrust
    document.addEventListener("keydown", (e) => {
      if (e.code === "Space") this.isFlying = true;
    });
    document.addEventListener("keyup", (e) => {
      if (e.code === "Space") this.isFlying = false;
    });

    // Start render loop
    this.animate();
  }

  private onMouseMove(event: MouseEvent) {
    const normalizedX = (event.clientX / window.innerWidth) * 2 - 1;
    const normalizedY = -(event.clientY / window.innerHeight) * 2 + 1;
    this.mousePosition.set(normalizedX, normalizedY);
  }

  private onMouseDown() {
    this.thrustActive = true;
    this.thrustVisual.visible = true; // Show thrust effect
  }

  private onMouseUp() {
    this.thrustActive = false;
    this.thrustVisual.visible = false; // Hide thrust effect
  }

  private updateHelicopter(delta: number) {
    // Mouse input adjusts pitch and yaw
    const pitch = (this.mousePosition.y * Math.PI) / 2; // Max pitch ±30°
    const yaw = (this.mousePosition.x * Math.PI) / 2; // Max yaw ±60°
    this.helicopter.rotation.x = pitch;
    this.helicopter.rotation.z = -yaw;

    // Update thrust position based on helicopter orientation
    const bottomOffset = new THREE.Vector3(0, -0.5, 0); // Below helicopter body
    this.thrustVisual.position.copy(bottomOffset.applyQuaternion(this.helicopter.quaternion));

    // Apply thrust if active
    const thrust = this.thrustActive ? 0.1 : 0;
    const thrustDirection = new THREE.Vector3(0, 1, 0).applyQuaternion(this.helicopter.quaternion);
    thrustDirection.multiplyScalar(thrust * delta);

    this.velocity.add(thrustDirection);
    this.velocity.multiplyScalar(0.98); // Apply drag
    this.helicopter.position.add(this.velocity);
    this.helicopter.rotation.set(thrustDirection.x, thrustDirection.y, thrustDirection.z);
  }

  private updateCamera() {
    // Calculate target camera position
    const targetPosition = this.helicopter.position.clone().add(this.CAMERA_OFFSET);

    // Lerp current camera position to target
    this.camera.position.lerp(targetPosition, this.LERP_FACTOR);

    // Update camera look target
    this.camera.lookAt(this.helicopter.position);
  }

  private animate() {
    requestAnimationFrame(() => this.animate());
    const delta = this.clock.getDelta();

    // Update helicopter
    this.updateHelicopter(delta);
    this.update(delta);
    this.updateCamera();
    // Render scene
    this.renderer.render(this.scene, this.camera);
  }

  public resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private calculateGravity(): THREE.Vector3 {
    const gravityDirection = this.helicopter.position.clone().normalize().multiplyScalar(-1);
    return gravityDirection.multiplyScalar(this.GRAVITY);
  }

  private alignWithGlobe() {
    const up = this.helicopter.position.clone().normalize();
    const forward = new THREE.Vector3(0, 1, 0);
    forward.crossVectors(up, new THREE.Vector3(1, 0, 0));
    this.helicopter.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), forward, up));
  }

  private update(deltaTime: number) {
    // Calculate gravity towards globe center
    const gravity = this.calculateGravity();

    // Apply forces
    const thrust = this.isFlying ? this.helicopter.up.multiplyScalar(this.THRUST) : new THREE.Vector3();

    this.acceleration.copy(gravity).add(thrust);
    this.velocity.add(this.acceleration.multiplyScalar(deltaTime));
    this.helicopter.position.add(this.velocity.multiplyScalar(deltaTime));

    // Globe collision
    const distanceToCenter = this.helicopter.position.length();
    if (distanceToCenter < this.GLOBE_RADIUS + this.HOVER_HEIGHT) {
      const normal = this.helicopter.position.clone().normalize();
      this.helicopter.position.copy(normal.multiplyScalar(this.GLOBE_RADIUS + this.HOVER_HEIGHT));
      this.velocity.set(0, 0, 0);
    }

    this.alignWithGlobe();
  }
}
