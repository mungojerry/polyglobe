import * as THREE from "three";
import { Globe } from "../planet/Globe";
export class Sun {
  private directionalLight: THREE.DirectionalLight;
  private sunSprite: THREE.Sprite;
  private sunSize: number = 200;

  getObject(): THREE.Sprite {
    return this.sunSprite;
  }

  constructor(globe: Globe, scene: THREE.Scene, private radius: number = 500) {
    // Directional light (sun)
    this.directionalLight = new THREE.DirectionalLight(0xffffff, 4);
    this.directionalLight.position.set(this.radius, 0, 0);
    this.directionalLight.target = globe.getObject();
    // .position.set(0, 0, 0);
    scene.add(this.directionalLight.target);

    // Configure shadow properties
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.width = 4096;
    this.directionalLight.shadow.mapSize.height = 4096;

    const shadowCameraSize = radius;
    this.directionalLight.shadow.camera.left = -shadowCameraSize;
    this.directionalLight.shadow.camera.right = shadowCameraSize;
    this.directionalLight.shadow.camera.top = shadowCameraSize;
    this.directionalLight.shadow.camera.bottom = -shadowCameraSize;
    this.directionalLight.shadow.camera.near = 0.1;
    this.directionalLight.shadow.camera.far = 5000;
    this.directionalLight.shadow.bias = -0.0001;
    this.directionalLight.shadow.normalBias = 0.02;

    this.directionalLight.shadow.camera.updateProjectionMatrix();
    this.directionalLight.name = "sun";
    scene.add(this.directionalLight);

    // Load sun texture
    const textureLoader = new THREE.TextureLoader();
    const sunTexture = textureLoader.load("assets/textures/sun.png");

    // Sun visualization using Sprite
    const sunMaterial = new THREE.SpriteMaterial({
      map: sunTexture,
      color: 0xffff00,
      transparent: true,
    });
    this.sunSprite = new THREE.Sprite(sunMaterial);
    this.sunSprite.scale.set(this.sunSize, this.sunSize, 1); // Sprites use scale for size
    this.sunSprite.position.copy(this.directionalLight.position);
    scene.add(this.sunSprite);
  }

  public getRadius(): number {
    return this.radius;
  }

  public getLight(): THREE.DirectionalLight {
    return this.directionalLight;
  }

  public update(angle: number) {
    // Calculate new position
    const x = Math.cos(angle) * this.radius;
    const y = Math.sin(angle) * this.radius;

    // Update directional light position
    this.directionalLight.position.set(x, y, 0);

    // Update sun visualization position
    this.sunSprite.position.copy(this.directionalLight.position);

    this.directionalLight.shadow.camera.updateProjectionMatrix();
  }
}
