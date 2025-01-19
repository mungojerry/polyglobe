import * as THREE from "three";
import { IEntity } from "../entities/Entity";
import { vectorPool } from "./VectorPool";

const cameraConfig = {
  smoothingFactor: 0.7,
  offset: new THREE.Vector3(0, 4, -4),
};

export class CameraController {
  private readonly BASE_FOV = 75; // Default FOV
  private readonly MAX_FOV = 190; // Maximum FOV when moving fast
  private readonly MIN_VELOCITY = 0; // Minimum velocity threshold
  private readonly MAX_VELOCITY = 50; // Velocity at which max FOV is reached
  private readonly FOV_LERP = 0.1; // How smoothly to adjust FOV

  private baseOffset = cameraConfig.offset.clone();
  private closeOffset = new THREE.Vector3(0, 1, -2);

  private camera: THREE.PerspectiveCamera;
  private offset = cameraConfig.offset.clone();
  private currentPosition = new THREE.Vector3();
  private currentLookAt = new THREE.Vector3();
  private attachedTo!: IEntity;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.currentPosition.copy(camera.position);
  }

  public attachTo(entity: IEntity) {
    this.attachedTo = entity;
  }
  public getAttachedTo() {
    return this.attachedTo;
  }

  public update(): void {
    const position: THREE.Vector3 = this.attachedTo.getObject().position;
    // Calculate up vector based on position relative to planet center
    const up = position.clone().normalize();

    // Use a constant forward direction (we don't want it to yaw)
    const forward = vectorPool.getVector(0, 0, 1);

    // Calculate right vector from up and forward
    const right = vectorPool.getVector().crossVectors(up, forward).normalize();

    // Recalculate forward to ensure it's perpendicular to up
    forward.crossVectors(right, up).normalize();

    // Calculate target position using offset
    const targetPosition = position.clone();
    targetPosition.add(up.multiplyScalar(this.offset.y));
    targetPosition.add(forward.multiplyScalar(this.offset.z));

    // Smooth camera movement

    this.currentPosition.lerp(targetPosition, cameraConfig.smoothingFactor);
    this.camera.position.copy(this.currentPosition);
    this.currentLookAt.lerp(position, cameraConfig.smoothingFactor);
    this.camera.lookAt(this.currentLookAt);
    this.camera.up.copy(up);

    // Release vectors back to pool
    vectorPool.releaseVector(forward);
    vectorPool.releaseVector(right);
  }

  public updateCameraFOV(): void {
    if (!this.attachedTo || !this.camera) return;

    // Get forward velocity component
    const velocity = this.attachedTo.getBody().linvel();
    const playerForward = this.attachedTo.getForwardDirection();

    // Project velocity onto forward direction
    const velocityVec = new THREE.Vector3(velocity.x, velocity.y, velocity.z);
    const forwardSpeed = velocityVec.dot(playerForward);

    // Use absolute value since we care about speed not direction
    const absForwardSpeed = Math.abs(forwardSpeed);

    // Calculate target FOV based on forward speed
    const speedFactor = THREE.MathUtils.clamp((absForwardSpeed - this.MIN_VELOCITY) / (this.MAX_VELOCITY - this.MIN_VELOCITY), 0, 1);
    const targetFOV = THREE.MathUtils.lerp(this.BASE_FOV, this.MAX_FOV, speedFactor);

    const targetOffset = speedFactor > 0.2 ? this.baseOffset.clone().lerp(this.closeOffset, speedFactor) : this.baseOffset;

    // Smooth transition to new offset
    this.offset.lerp(targetOffset, 0.2);

    // this.speedPass.uniforms.time.value += 0.016;
    // // Update speed effect intensity
    // this.speedPass.uniforms.speed.value = speedFactor;
    // Smoothly interpolate current FOV to target
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFOV, this.FOV_LERP);
    this.camera.updateProjectionMatrix();
  }
}
