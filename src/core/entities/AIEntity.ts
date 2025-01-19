const AI_PARAMS = {
  DETECTION_RANGE: 500,
  ATTACK_RANGE: 50,
  CHASE_SPEED: 2.0,
  LOITER_SPEED: 0.5,
  ATTACK_COOLDOWN: 2000,
  LOITER_RADIUS: 100,
  STATE_UPDATE_RATE: 500,
} as const;

enum Mode {
  Idle = "idle", // Minimal movement, default state
  Loiter = "loiter", // Random patrol movement within area
  Chase = "chase", // Active pursuit of player
  Attack = "attack", // Close-range combat with player
  Infect = "infect", // Special infection attack
}

interface StateTransition {
  from: Mode;
  to: Mode;
  condition: () => boolean;
}

import * as RAPIER from "@dimforge/rapier3d";
import * as THREE from "three";
import { ConeEmitter } from "../particles/ConeEmitter";
import { ParticleSystem } from "../particles/ParticleSystem";
import { FlyingEntity, IFlyingEntity } from "./FlyingEntity";

const AI_SETTINGS = {
  SIGHT_RANGE: 1000,
  PURSUIT_SPEED: 2.0,
  TURN_SPEED: 0.05,
  MIN_DISTANCE: 50,
};

function playerInRange(range: number): boolean {
  // Implement the logic to check if the player is within the given range
  // This is a placeholder implementation
  return Math.random() > 0.5;
}

export class AIEntity extends FlyingEntity implements IFlyingEntity {
  private target: THREE.Vector3 | null = null;
  private thrustArrowHelper: THREE.ArrowHelper;

  private particleSystem: ParticleSystem | null = null;
  private emitter!: ConeEmitter;
  private thrustActive: boolean = false;

  stateTransitions: StateTransition[] = [
    {
      from: Mode.Idle,
      to: Mode.Loiter,
      condition: () => Math.random() > 0.8,
    },
    {
      from: Mode.Loiter,
      to: Mode.Chase,
      condition: () => playerInRange(AI_PARAMS.DETECTION_RANGE),
    },
    {
      from: Mode.Chase,
      to: Mode.Attack,
      condition: () => playerInRange(AI_PARAMS.ATTACK_RANGE),
    },
    {
      from: Mode.Attack,
      to: Mode.Infect,
      condition: () => this.playerHealth < 50,
    },
  ];

  constructor(scene: THREE.Scene, world: RAPIER.World, initPos: THREE.Vector3) {
    super(scene, initPos, world, "ai_entity");

    // Setup debug helpers
    const arrowLength = 5;
    this.thrustArrowHelper = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 0), arrowLength, 0x00ff00);
    scene.add(this.thrustArrowHelper);
  }

  setTarget(position: THREE.Vector3) {
    this.target = position.clone();
  }

  update(camera: THREE.Camera) {
    if (!this.body || !this.target) return;

    const currentPos = this.body.translation();
    const direction = new THREE.Vector3().subVectors(this.target, new THREE.Vector3(currentPos.x, currentPos.y, currentPos.z)).normalize();

    // Apply thrust towards target
    const distance = this.target.distanceTo(new THREE.Vector3(currentPos.x, currentPos.y, currentPos.z));
    this.thrustActive = distance > AI_SETTINGS.MIN_DISTANCE;

    if (this.thrustActive) {
      const thrust = direction.multiplyScalar(AI_SETTINGS.PURSUIT_SPEED);
      this.body.applyImpulse({ x: thrust.x, y: thrust.y, z: thrust.z }, true);
    }

    // Update visuals
    super.update(camera);
  }

  onHit() {
    console.log("AI entity hit");
  }
}
