import * as THREE from "three";
import { Enemy } from "../objects/Enemy";

const cameraConfig = {
  snapToLevelFlight: false,
  smoothingFactor: 0.1,
  offset: new THREE.Vector3(0, 4, -4),
  zOffsetStep: 10.5,
  minZOffset: -105,
  maxZOffset: -2,
  yOffsetStep: 10.5,
  minYOffset: 2,
  maxYOffset: 200,
  xOffsetStep: 15.5,
  minXOffset: -200,
  maxXOffset: 200,
};

export class CameraController {
  private camera: THREE.PerspectiveCamera;
  private offset = cameraConfig.offset;
  private currentPosition = new THREE.Vector3();
  private currentLookAt!: THREE.Vector3;
  private velocityPosition = new THREE.Vector3();
  private velocityLookAt = new THREE.Vector3();
  private mode: "static" | "follow" = "static";

  public setMode(mode: "static" | "follow") {
    this.mode = mode;
  }

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.currentPosition.copy(camera.position);
    document.addEventListener("keydown", this.handleKeyDown.bind(this));
  }

  private handleKeyDown(event: KeyboardEvent) {
    switch (event.key) {
      case "ArrowUp":
        this.offset.y = Math.min(cameraConfig.maxYOffset, this.offset.y - cameraConfig.yOffsetStep);
        this.offset.z = Math.min(cameraConfig.maxZOffset, this.offset.z + cameraConfig.zOffsetStep);
        break;
      case "ArrowDown":
        this.offset.y = Math.max(cameraConfig.minYOffset, this.offset.y + cameraConfig.yOffsetStep);
        this.offset.z = Math.max(cameraConfig.minZOffset, this.offset.z - cameraConfig.zOffsetStep);
        break;
      case "ArrowLeft":
        this.offset.x = Math.max(cameraConfig.minYOffset, this.offset.x - cameraConfig.xOffsetStep);
        break;
      case "ArrowRight":
        this.offset.x = Math.min(cameraConfig.maxYOffset, this.offset.x + cameraConfig.xOffsetStep);
        break;
    }
  }

  private attachedTo!: Enemy;

  public attachTo(object: Enemy) {
    this.attachedTo = object;
  }

  public updateStaticCamera(objPosition: THREE.Vector3) {
    // Calculate the up vector based on the globe's up direction
    const up = objPosition.clone().normalize();

    // Calculate the right and forward vectors
    const forward = new THREE.Vector3(0, 0, 1);
    const right = new THREE.Vector3().crossVectors(forward, up).normalize();
    const alignedForward = new THREE.Vector3().crossVectors(up, right).normalize();

    // Create the rotation matrix
    const rotationMatrix = new THREE.Matrix4().makeBasis(right, up, alignedForward);

    // Calculate the target position for the camera
    const targetPosition = objPosition.clone().add(this.offset.clone().applyMatrix4(rotationMatrix));

    // Update the camera's position and lookAt target
    this.camera.position.copy(targetPosition);
    this.camera.lookAt(objPosition);
    this.camera.up.copy(up);
  }

  private updateFollowCamera(objPosition: THREE.Vector3) {
    if (!this.attachedTo.getObject().body) return;

    // Get velocity directly from physics body
    const objVelocity = this.attachedTo.getObject().body.velocity;
    const velocity = new THREE.Vector3(objVelocity.x, objVelocity.y, objVelocity.z).negate();

    // Use forward direction if velocity is too small
    if (velocity.lengthSq() < 0.01) {
      velocity.copy(this.attachedTo.getForward());
    }

    // Get the horizontal component of velocity for camera direction
    const horizontalVelocity = velocity.clone();
    horizontalVelocity.y = 0;
    horizontalVelocity.normalize();

    // Calculate target position behind the object
    const targetPosition = objPosition.clone();
    targetPosition.add(horizontalVelocity.multiplyScalar(-this.offset.z)); // Move back
    targetPosition.y += this.offset.y; // Move up

    // Apply smoothing to camera position
    const deltaPosition = targetPosition.clone().sub(this.currentPosition);
    this.velocityPosition.add(deltaPosition.multiplyScalar(cameraConfig.smoothingFactor));
    this.velocityPosition.multiplyScalar(0.85);
    this.currentPosition.add(this.velocityPosition);
    this.camera.position.copy(this.currentPosition);

    // Update look-at target with smoothing
    if (!this.currentLookAt) {
      this.currentLookAt = objPosition.clone();
    }
    const deltaLookAt = objPosition.clone().sub(this.currentLookAt);
    this.velocityLookAt.add(deltaLookAt.multiplyScalar(cameraConfig.smoothingFactor));
    this.velocityLookAt.multiplyScalar(0.85);
    this.currentLookAt.add(this.velocityLookAt);

    // Update camera orientation
    this.camera.lookAt(this.currentLookAt);
    this.camera.up.copy(objPosition.normalize());
  }

  public update() {
    const objPosition = this.attachedTo.getPosition();
    this.mode === "static" ? this.updateStaticCamera(objPosition) : this.updateFollowCamera(objPosition);
  }
}
