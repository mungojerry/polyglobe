import * as THREE from "three";

// Create shared texture once instead of per instance
const sharedTexture = (() => {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (context) {
    context.beginPath();
    context.arc(32, 32, 30, 0, 2 * Math.PI);
    context.fillStyle = "#ffffff";
    context.fill();
  }
  return new THREE.CanvasTexture(canvas);
})();

export class Trail {
  public sprite: THREE.Sprite;
  private shrinkRate: number;
  private scene: THREE.Scene;
  private disposed: boolean = false;

  constructor(scene: THREE.Scene, position: THREE.Vector3, size: number = 1.0, color: number = 0xffffff) {
    this.scene = scene;
    this.shrinkRate = 0.99;

    this.sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: sharedTexture,
        color: color,
        transparent: true,
        opacity: 1,
        depthTest: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
      })
    );
    this.sprite.position.copy(position);
    this.sprite.scale.set(size, size, 1);

    scene.add(this.sprite);
  }

  update() {
    if (this.disposed) return;

    const currentScale = this.sprite.scale.x;
    const currentOpacity = this.sprite.material.opacity;
    if (currentScale > 0.1 && currentOpacity > 0.1) {
      const newScale = currentScale * this.shrinkRate;
      const newOpacity = currentOpacity - 0.05;
      // this.sprite.material.opacity = w         newOpacity;
      this.sprite.scale.set(newScale, newScale, 1);
      this.sprite.material.needsUpdate = true;
    } else {
      this.dispose();
    }
  }

  dispose() {
    if (!this.disposed) {
      this.disposed = true;
      if (this.sprite.parent) {
        this.sprite.parent.remove(this.sprite);
      }
      if (this.sprite.material) {
        this.sprite.material.dispose();
      }
    }
  }

  recycle(position: THREE.Vector3, size: number, color: number) {
    if (this.disposed) return this;

    this.sprite.position.copy(position);
    this.sprite.scale.set(size, size, 1);
    this.sprite.material.opacity = 1;
    this.sprite.material.color.setHex(color);
    this.sprite.material.needsUpdate = true;

    if (!this.sprite.parent) {
      this.scene.add(this.sprite);
    }

    return this;
  }

  isDisposed() {
    return this.disposed;
  }
}
