import * as THREE from "three";

export class Moon {
  private moonMesh: THREE.Sprite;
  private directionalLight: THREE.DirectionalLight;
  private moonSize: number = 3; // Slightly smaller than the sun

  constructor(scene: THREE.Scene, private radius: number = 1700) {
    // Moon light (dimmer and bluer than the sun)
    this.directionalLight = new THREE.DirectionalLight(0x87cefa, 1.4); // Light steel blue color
    this.directionalLight.position.set(-this.radius, 0, 0); // Start opposite to the sun
    this.directionalLight.castShadow = true;

    // Configure shadow properties
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.set(4096, 4096);
    this.directionalLight.shadow.camera = new THREE.OrthographicCamera(-35, 35, 35, -35, 0.1, 100);
    this.directionalLight.shadow.bias = -0.0001;
    this.directionalLight.shadow.normalBias = 0.001;
    this.directionalLight.shadow.radius = 2;

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
    this.moonMesh.scale.set(this.moonSize, this.moonSize, 1);
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
