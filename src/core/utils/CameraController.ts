import * as THREE from "three";
import { IEntity } from "../entities/Entity";
import { vectorPool } from "./VectorPool";

const cameraConfig = {
  smoothingFactor: 0.7,
  offset: new THREE.Vector3(0, 11, -8),
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

  private previousForward = new THREE.Vector3(0, 0, 1);
  public update(): void {
    const position: THREE.Vector3 = this.attachedTo.getObject().position;
    // Normalized surface normal
    const surfaceNormal = position.clone().normalize();

    // Create rotation that aligns camera with surface
    const worldUp = new THREE.Vector3(0, 1, 0);
    const rotationAxis = new THREE.Vector3().crossVectors(worldUp, surfaceNormal);
    const angle = worldUp.angleTo(surfaceNormal);

    const surfaceRotation = new THREE.Quaternion().setFromAxisAngle(rotationAxis.normalize(), angle);

    // Compute camera offset in rotated space
    const localOffset = new THREE.Vector3(0, this.offset.y, this.offset.z);
    const rotatedOffset = localOffset.clone().applyQuaternion(surfaceRotation);

    // Target camera position
    const targetPosition = position.clone().add(rotatedOffset);

    // Smooth interpolation
    const smoothFactor = 1;
    this.currentPosition.lerp(targetPosition, smoothFactor);
    this.currentLookAt.lerp(position, smoothFactor);

    // Apply camera transformations
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookAt);
    this.camera.up.copy(surfaceNormal);
  }
  public updateOLD(): void {
    const position: THREE.Vector3 = this.attachedTo.getObject().position;

    // Up vector (radial direction)
    const up = position.clone().normalize();

    // Get forward vector and project it onto tangent plane
    const forward = vectorPool.getVector().copy(this.previousForward);
    const forwardDotUp = forward.dot(up);
    forward.sub(up.clone().multiplyScalar(forwardDotUp)).normalize();

    // Calculate right from up and projected forward
    const right = vectorPool.getVector().crossVectors(up, forward).normalize();

    // Recalculate forward to ensure orthogonality
    forward.crossVectors(right, up).normalize();

    // Store forward for next frame
    this.previousForward.copy(forward);

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

    // Release vectors
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
