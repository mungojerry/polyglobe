import * as THREE from "three";

class HelicopterGlobeSimulation {
  scene;
  camera;
  renderer;

  globeRadius;
  helicopter;
  globe;

  position;
  velocity;
  orientation;

  mousePosition;
  isLeftMouseDown;

  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });

    this.globeRadius = 5;

    this.position = new THREE.Vector3(this.globeRadius, 0, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.orientation = new THREE.Quaternion();

    this.mousePosition = new THREE.Vector2();
    this.isLeftMouseDown = false;

    this.initRenderer();
    this.initScene();
    this.createHelicopter();
    this.setupControls();
    this.animate();
  }

  initRenderer() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(this.renderer.domElement);
  }

  initScene() {
    const globeGeometry = new THREE.SphereGeometry(this.globeRadius, 32, 32);
    const globeMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
    this.globe = new THREE.Mesh(globeGeometry, globeMaterial);
    this.scene.add(this.globe);
    this.camera.position.z = 10;
  }

  createHelicopter() {
    const helicopterGeometry = new THREE.ConeGeometry(0.2, 1, 8);
    const helicopterMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    this.helicopter = new THREE.Mesh(helicopterGeometry, helicopterMaterial);

    this.helicopter.position.copy(this.position);
    this.scene.add(this.helicopter);
  }

  setupControls() {
    window.addEventListener("mousemove", (event) => {
      // Normalize mouse position
      this.mousePosition.x = (event.clientX / window.innerWidth) * 2 - 1;
      this.mousePosition.y = -(event.clientY / window.innerHeight) * 2 + 1;
    });

    window.addEventListener("mousedown", (event) => {
      if (event.button === 0) this.isLeftMouseDown = true;
    });

    window.addEventListener("mouseup", (event) => {
      if (event.button === 0) this.isLeftMouseDown = false;
    });
  }

  updateHelicopterPhysics() {
    // Gravity towards globe center
    const gravityVector = this.position.clone().normalize().multiplyScalar(-0.05);

    // Thrust based on left mouse button
    const thrustMagnitude = this.isLeftMouseDown ? 0.2 : 0;
    const thrustVector = this.position.clone().negate().normalize().multiplyScalar(thrustMagnitude);

    // Rotation based on mouse position
    const rotationFactor = 0.1;
    const rotationX = this.mousePosition.y * rotationFactor;
    const rotationY = this.mousePosition.x * rotationFactor;

    // Update velocity
    this.velocity.add(thrustVector);
    this.velocity.add(gravityVector);

    // Apply rotation to velocity
    const rotationMatrix = new THREE.Matrix4().makeRotationX(rotationX).multiply(new THREE.Matrix4().makeRotationY(rotationY));
    this.velocity.applyMatrix4(rotationMatrix);

    // Limit velocity
    this.velocity.clampLength(0, 0.3);

    // Update position
    this.position.add(this.velocity);
    this.position.normalize().multiplyScalar(this.globeRadius);

    // Update helicopter position and orientation
    this.helicopter.position.copy(this.position);
    this.helicopter.lookAt(this.globe.position);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    this.updateHelicopterPhysics();
    this.renderer.render(this.scene, this.camera);
  }
}

export default HelicopterGlobeSimulation;
