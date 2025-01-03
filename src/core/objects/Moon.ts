import * as THREE from "three";

export class Moon {
  private moonMesh: THREE.Sprite;
  private directionalLight: THREE.DirectionalLight;
  private moonSize: number = 300; // Slightly smaller than the sun

  constructor(scene: THREE.Scene, private radius: number = 1700) {
    // Moon light (dimmer and bluer than the sun)
    this.directionalLight = new THREE.DirectionalLight(0x87cefa, 1.4); // Light steel blue color
    this.directionalLight.position.set(-this.radius, 0, 0); // Start opposite to the sun
    this.directionalLight.castShadow = true;

    // Configure shadow properties
    this.directionalLight.shadow.mapSize.width = 2048;
    this.directionalLight.shadow.mapSize.height = 2048;

    const shadowCameraSize = 500;
    this.directionalLight.shadow.camera.left = -shadowCameraSize;
    this.directionalLight.shadow.camera.right = shadowCameraSize;
    this.directionalLight.shadow.camera.top = shadowCameraSize;
    this.directionalLight.shadow.camera.bottom = -shadowCameraSize;
    this.directionalLight.shadow.camera.near = 0.1;
    this.directionalLight.shadow.camera.far = 2500;
    this.directionalLight.shadow.bias = -0.00001;
    this.directionalLight.shadow.normalBias = 0.02;
    scene.add(this.directionalLight);
    this.directionalLight.name = "moon";
    // Load moon texture
    const textureLoader = new THREE.TextureLoader();
    const moonTexture = textureLoader.load("assets/textures/moon.png");

    // Moon visualization using CircleGeometry
    const moonMaterial = new THREE.SpriteMaterial({
      map: moonTexture,
      color: 0xb0c4de,
      transparent: true,
    });
    this.moonMesh = new THREE.Sprite(moonMaterial);
    this.moonMesh.position.copy(this.directionalLight.position);
    scene.add(this.moonMesh);
  }

  public getLight(): THREE.DirectionalLight {
    return this.directionalLight;
  }

  public update(sunAngle: number) {
    // Position moon opposite to the sun (180 degrees offset)
    const moonAngle = sunAngle + Math.PI;
    const x = Math.cos(moonAngle) * this.radius;
    const y = Math.sin(moonAngle) * this.radius;

    // Update moon light and visuals
    this.directionalLight.position.set(x, y, 0);
    this.moonMesh.position.copy(this.directionalLight.position);

    this.directionalLight.shadow.camera.updateProjectionMatrix();
  }
}
