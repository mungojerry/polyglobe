import RAPIER from "@dimforge/rapier3d";

export interface IEntity {
  getObject(): THREE.Object3D;
  getPosition(): THREE.Vector3;
  getBody(): RAPIER.RigidBody;
  getTag(): string;
  getForwardDirection(): THREE.Vector3;

  update(camera: THREE.Camera): void;
  destroy(): void;
}
