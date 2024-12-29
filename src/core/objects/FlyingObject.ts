import RAPIER from "@dimforge/rapier3d";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { debugManager } from "../managers/debugManager";
import { Globe } from "../planet/Globe";
import { terrainHelper } from "../planet/terrainHelper";
import { vectorPool } from "../utils/vectorPool";
import { BaseGameObject, IGameObject } from "./BaseGameObject";
import { Player } from "./Player";

const WAYPOINT_DISTANCE_THRESHOLD: number = 35;
const ROTATION_THRESHOLD = 0.1; // Adjust as needed for sensitivity

enum Mode {
  Idle = "idle",
  Loiter = "loiter",
  Chase = "chase",
  Attack = "attack",
  Infect = "infect",
}
export class FlyingObject extends BaseGameObject implements IGameObject {
  private mode: Mode = Mode.Infect;
  private attackRange = 50;
  private shootRange = 30;
  private lastStateChange = 0;
  private lastShootTime = 0;
  private stateChangeCooldown = 1000;

  private globeRadius: number; // Assuming globe has a getRadius method
  private globe: Globe; // Assuming globe has a getRadius method
  private waypoints: THREE.Vector3[] = [];
  private currentWaypointIndex: number = 0;
  private waypointMarkers: THREE.Mesh[] = [];
  private debugMarkers: boolean = false;

  private player: Player;

  private sphereGeometry = new THREE.SphereGeometry(5, 5, 5);
  private sphereMaterial = new THREE.MeshBasicMaterial({
    color: 0xff0000,
    transparent: true,
    opacity: 0.5,
  });

  private lightCone: THREE.SpotLight;
  private lightOn: boolean = false;
  private lightBeam: THREE.Object3D;

  constructor(scene: THREE.Scene, world: RAPIER.World, position: THREE.Vector3, globe: Globe, player: Player) {
    super(scene, position, world, "flying_object");
    this.tilt = false;
    this.shootCooldown = 1000;
    this.globe = globe;
    this.globeRadius = globe.getRadius();
    this.player = player;
    this.movementForce = 0.2;
    this.thrustForce = 0.6;

    this.body.setLinearDamping(0.8);
    this.body.setAngularDamping(0.8);
    const loader = new GLTFLoader();

    loader.load("assets/models/baddies/bomber.glb", (gltf) => {
      this.objectMesh = gltf.scene;
      this.object.add(this.objectMesh);
      this.object.position.copy(position);
      this.object.frustumCulled = false;
      scene.add(this.object);
    });

    const colliderDesc = RAPIER.ColliderDesc.ball(1); // Assuming a spherical collider for simplicity
    world.createCollider(colliderDesc, this.body);
    this.globe = globe;
    this.generateWaypoints(5);

    this.lightCone = new THREE.SpotLight(0xffffff); //, 100, 100, Math.PI / 6, 0.5, 0);
    this.lightCone.position.set(0, 0, 0);
    this.object.add(this.lightCone);
    this.lightBeam = new THREE.Object3D();
    for (let i = 0; i < 15; i++) {
      const beamGeometry = new THREE.ConeGeometry(10 + i * 2, 100, 32);
      const beamMaterial = new THREE.MeshPhongMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.3 - i / 60,
        emissive: 0xffff00,
        side: THREE.DoubleSide,
        // wireframe: true,
      });
      const mesh = new THREE.Mesh(beamGeometry, beamMaterial);
      this.lightBeam.add(mesh);
    }

    this.lightBeam.position.set(0, -50, 0);
    // this.lightBeam.rotation.x = Math.PI / 2;
    this.lightBeam.visible = false;
    this.object.add(this.lightBeam);
  }
  onHit() {
    console.log("FylingObject hit");
  }
  update(camera: THREE.Camera) {
    super.update(camera);
    const currentTime = Date.now();
    if (currentTime - this.lastStateChange < this.stateChangeCooldown) return;

    const distanceToPlayer = this.distanceToPoint(this.player.getObject().position);

    switch (this.mode) {
      case Mode.Idle:
        this.handleIdle();
        break;
      case Mode.Loiter:
        this.handleLoiter();
        break;
      case Mode.Chase:
        this.handleChase(distanceToPlayer, currentTime);
        break;
      case Mode.Attack:
        this.handleAttack(distanceToPlayer, currentTime);
        break;
      case Mode.Infect:
        this.handleInfect(currentTime);
        break;
    }
    this.thrust();

    if (this.mode === Mode.Chase && distanceToPlayer < this.shootRange) {
      this.mode = Mode.Attack;
      this.lastStateChange = currentTime;
    } else if (this.mode === Mode.Attack && distanceToPlayer > this.shootRange) {
      this.mode = Mode.Chase;
      this.lastStateChange = currentTime;
    }

    debugManager.set("mode", "mode: " + this.mode);

    // Randomly switch the light on and off
    if (Math.random() < 0.05) {
      // Adjust the probability as needed
      this.toggleLightCone();
    }

    // Update the light beam orientation
    if (this.lightOn) {
      this.updateLightBeamOrientation();
    }
  }

  private generateWaypoints(count: number) {
    for (let i = 0; i < count; i++) {
      const globeRadius = this.globeRadius * 1.2 + Math.random() * 0.2;
      const theta = Math.random() * Math.PI * 2; // Random angle around the equator
      const phi = Math.acos(2 * Math.random() - 1); // Random angle from the poles

      const x = globeRadius * Math.sin(phi) * Math.cos(theta);
      const y = globeRadius * Math.sin(phi) * Math.sin(theta);
      const z = globeRadius * Math.cos(phi);
      const position = vectorPool.getVector(x, y, z);
      this.waypoints.push(position);

      if (this.debugMarkers) {
        // Create and store marker
        const marker = this.createWaypointMarker(position);
        this.waypointMarkers.push(marker);
      }
    }
  }

  private createWaypointMarker(position: THREE.Vector3): THREE.Mesh {
    const marker = new THREE.Mesh(this.sphereGeometry, this.sphereMaterial);
    marker.position.copy(position);
    this.scene.add(marker);
    return marker;
  }

  private handleChase(distanceToPlayer: number, now: number) {
    this.navigateToPoint(this.player.getObject().position);
    debugManager.set("dist", "dist: " + distanceToPlayer);

    if (distanceToPlayer < this.attackRange && now - this.lastStateChange > this.stateChangeCooldown) {
      this.mode = Mode.Attack;
      this.lastStateChange = now;
    }
  }

  private handleIdle() {
    this.hover(60);
  }

  private handleLoiter() {
    if (this.waypoints.length === 0) return;

    const currentWaypoint = this.waypoints[this.currentWaypointIndex];
    this.navigateToPoint(currentWaypoint);
    // Calculate the great circle distance to the waypoint
    const distanceToWaypoint = this.distanceToPoint(currentWaypoint);

    // Move to the next waypoint if close enough
    if (distanceToWaypoint < WAYPOINT_DISTANCE_THRESHOLD) {
      this.currentWaypointIndex = (this.currentWaypointIndex + 1) % this.waypoints.length;
      return; // Early return to recalculate with the new waypoint
    }
  }
  private distanceToPoint(p: THREE.Vector3): number {
    // Normalize the vectors
    const normalizedPosition = this.object.position.clone().normalize();
    const normalizedWaypoint = p.clone().normalize();

    // Calculate the dot product
    const dotProduct = normalizedPosition.dot(normalizedWaypoint);

    // Calculate the angle between the two vectors
    const angle = Math.acos(dotProduct);

    // Calculate the great circle distance
    const distance = this.globeRadius * angle;

    return distance;
  }
  private navigateToPoint(p: THREE.Vector3) {
    // Calculate direction to the waypoint on the great circle
    const normalizedPosition = this.object.position.clone().normalize();
    const normalizedWaypoint = p.clone().normalize();
    const crossProduct = vectorPool.getVector().crossVectors(normalizedPosition, normalizedWaypoint).normalize();
    const directionToWaypoint = vectorPool.getVector().crossVectors(crossProduct, normalizedPosition).normalize();

    // Calculate the angle between the forward direction and the direction to the waypoint
    const forwardDirection = this.getForwardDirection();
    const angleToWaypoint = forwardDirection.angleTo(directionToWaypoint);

    // Determine rotation direction based on the cross product

    if (angleToWaypoint > ROTATION_THRESHOLD) {
      const cross = vectorPool.getVector().crossVectors(forwardDirection, directionToWaypoint);
      this.setRotationDirection(cross.dot(normalizedPosition) > 0 ? 1 : -1);
      vectorPool.releaseVector(cross);
    } else {
      this.setRotationDirection(0);
    }

    // check slightly in front
    const heightAboveSurface = terrainHelper.computeHeightAboveSurface(
      this.object.position.clone().add(this.getForwardDirection().multiplyScalar(2)),
      this.globe.getRadius()
    );
    const pointHeightAboveSurface = terrainHelper.computeHeightAboveSurface(p, this.globe.getRadius());

    // Prevent crashing into the terrain
    if (heightAboveSurface < pointHeightAboveSurface || heightAboveSurface < 50) {
      // Ascend to maintain safe height
      this.setThrusting(true);
    } else {
      // Maintain current altitude
      this.setThrusting(false);
    }
    vectorPool.releaseVector(directionToWaypoint);
    vectorPool.releaseVector(crossProduct);
    // Move forward
    this.setMove(1);
  }

  private handleAttack(distanceToPlayer: number, now: number) {
    this.navigateToPoint(this.player.getObject().position);

    if (distanceToPlayer < this.shootRange && this.hasLineOfSight()) {
      if (now - this.lastShootTime > this.shootCooldown) {
        this.shoot();
        this.lastShootTime = now;
      }
    }

    if (distanceToPlayer > this.attackRange * 1.5) {
      this.mode = Mode.Chase;
      this.lastStateChange = now;
    }
  }

  private hover(idealDistance: number) {
    const distanceFromGround = terrainHelper.computeHeightAboveSurface(this.object.position, this.globe.getRadius());

    if (distanceFromGround < idealDistance) {
      this.setThrusting(true);
    } else if (distanceFromGround > idealDistance) {
      this.setThrusting(false);
    }
  }

  private handleInfect(delta: number) {
    this.hover(20);
    this.move = 1;
    if (Math.random() > 0.99) this.rotationDirection = Math.random() > 0.9 ? (Math.random() > 0.5 ? 1 : -1) : 0;

    // Infecting logic
    this.infectLand();
  }

  private infectLand() {
    // Implement infection logic, e.g., modifying terrain
    if (this.lightOn) {
      this.globe.infect(this.getPosition().clone());
    }
  }

  private hasLineOfSight(): boolean {
    const rayDir = this.player.getObject().position.clone().sub(this.object.position).normalize();
    const ray = new RAPIER.Ray(this.body.translation(), rayDir);
    const hit = this.world.castRay(ray, 1000, true);

    if (!hit) return false;

    const hitBody = hit.collider.parent();
    return hitBody?.userData instanceof Player;
  }

  private toggleLightCone() {
    this.lightOn = !this.lightOn;
    this.lightCone.visible = this.lightOn;
    this.lightBeam.visible = this.lightOn;
  }

  // Method to update the beam's orientation
  // Method to update the beam's orientation
  private updateLightBeamOrientation() {
    const worldCenter = new THREE.Vector3(0, 0, 0);
    const objectPosition = this.object.position.clone();
    const direction = new THREE.Vector3().subVectors(worldCenter, objectPosition).normalize();

    // Calculate the quaternion that rotates defaultDirection to the desired direction
    const quaternion = new THREE.Quaternion().setFromUnitVectors(direction, direction);

    // Apply the rotation to the lightBeam
    this.lightBeam.setRotationFromQuaternion(quaternion);

    // Optional: Adjust the position if necessary
    this.lightBeam.position.set(0, -50, 0); // Ensure it's at the bottom
  }
}
