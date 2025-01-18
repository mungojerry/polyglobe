import * as THREE from "three";

export class HealthBar {
  private healthBar: THREE.Sprite;
  private healthBarCanvas: HTMLCanvasElement;
  private healthBarTexture: THREE.CanvasTexture;

  private parentObject: THREE.Object3D;
  private readonly width: number = 50;
  private readonly height: number = 5;

  constructor(parentObject: THREE.Object3D, initialHealth: number = 100) {
    this.parentObject = parentObject;

    // Initialize Health Bar
    this.healthBarCanvas = document.createElement("canvas");
    this.healthBarCanvas.width = this.width;
    this.healthBarCanvas.height = this.height;
    const ctx = this.healthBarCanvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get canvas context for HealthBar.");

    // Draw initial health (full health)
    this.drawHealthBar(ctx, initialHealth);

    // Create texture and sprite
    this.healthBarTexture = new THREE.CanvasTexture(this.healthBarCanvas);
    this.healthBarTexture.minFilter = THREE.LinearFilter;
    this.healthBarTexture.magFilter = THREE.LinearFilter;
    this.healthBarTexture.needsUpdate = true;

    const healthBarMaterial = new THREE.SpriteMaterial({ map: this.healthBarTexture, transparent: true });
    this.healthBar = new THREE.Sprite(healthBarMaterial);
    this.healthBar.scale.set(1, 0.1, 0.5); // Adjust size as needed
    this.healthBar.position.set(0, 1, 0); // Position slightly above the parent object

    // Add health bar to the parent object
    this.parentObject.add(this.healthBar);
  }

  /**
   * Draws the health bar based on the current health percentage.
   * @param ctx Canvas rendering context
   * @param health Current health percentage (0-100)
   */
  private drawHealthBar(ctx: CanvasRenderingContext2D, health: number) {
    // Clear the canvas
    ctx.clearRect(0, 0, this.width, this.height);

    // Draw background (red)
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, this.width, this.height);

    // Draw foreground (green) based on health percentage
    const healthPercent = Math.max(health, 0) / 100;
    ctx.fillStyle = "#00ff00";
    ctx.fillRect(0, 0, this.width * healthPercent, this.height);
  }

  /**
   * Updates the health bar to reflect the current health.
   * @param health Current health percentage (0-100)
   */
  public setHealth(health: number): void {
    const ctx = this.healthBarCanvas.getContext("2d");
    if (!ctx) return;

    this.drawHealthBar(ctx, health);
    this.healthBarTexture.needsUpdate = true;
  }

  /**
   * Removes the health bar from the scene and disposes of its resources.
   */
  public dispose(): void {
    // Dispose texture
    this.healthBarTexture.dispose();

    // Remove sprite from parent object
    this.parentObject.remove(this.healthBar);
  }
}
