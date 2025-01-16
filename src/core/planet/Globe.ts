import RAPIER from "@dimforge/rapier3d";
import * as THREE from "three";
import { Vector3 } from "three";
import { SimplifyModifier } from "three/examples/jsm/modifiers/SimplifyModifier";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Water } from "../effects/Water";
import { debugManager } from "../managers/debugManager";
import { pseudoRandom } from "../utils/PseudoRandom";
import { generateRandomPosition, ProgressCallback } from "../utils/utils";
import { GlobeChunk } from "./GlobeChunk";
import { GlobeChunkGenerator } from "./GlobeChunkGenerator";
import { Infection } from "./Infection";
import { LandGeometryGenerator } from "./LandGeometryGenerator";
import { BaseNoise } from "./noise/BaseNoise";
import { TerrainNoise } from "./noise/TerrainNoise";
import { TerrainDeformer } from "./TerrainDeformer";
const globeConfig = {
  showWall: false,
  showPoles: false,
  showWater: true,
  radius: 1300,
  detail: 110,
  chunkSize: 20,
};

export class Globe {
  private readonly object: THREE.Object3D;
  public terrainDeformer!: TerrainDeformer;

  public runInfection: boolean = false;
  public onTerrainDeformed: ((position: THREE.Vector3, radius: number) => void) | null = null;
  private chunks: GlobeChunk[][] = [];

  private readonly frustum = new THREE.Frustum();
  private readonly cameraViewProjectionMatrix = new THREE.Matrix4();

  private readonly landMaterial: THREE.MeshPhongMaterial = new THREE.MeshPhongMaterial({
    vertexColors: true,
    shininess: 0,
    reflectivity: 0,
    flatShading: true,
    shadowSide: THREE.FrontSide,
    clipShadows: false,
  });
  private readonly infection: Infection;

  public waterLevel: number = 0;
  public terrainClickAllowed: boolean = false;
  public noise: BaseNoise = new TerrainNoise();

  private landGeometry!: THREE.BufferGeometry;
  private rigidBody!: RAPIER.RigidBody;
  private water!: Water;

  constructor(private camera: THREE.Camera, private world: RAPIER.World) {
    this.object = new THREE.Object3D();

    window.addEventListener("click", (e) => {
      if (this.terrainClickAllowed) this.handleClickTerrain(e);
    });
    this.waterLevel = globeConfig.radius * 1.055;

    if (globeConfig.showWater) this.buildWater();
    if (globeConfig.showWall) this.buildEquatorWall();

    this.object.castShadow = true;
    this.object.receiveShadow = true;
    this.infection = new Infection(this);
  }

  public getWaterLevel() {
    return this.waterLevel;
  }

  /** Initialization */
  public async initializeGlobe(seed: number = new Date().getTime(), onProgress: ProgressCallback) {
    const start = performance.now();
    pseudoRandom.setSeed(seed);

    if (this.landGeometry) {
      this.landGeometry.dispose();
    }
    if (this.rigidBody) {
      this.world.removeRigidBody(this.rigidBody);
      this.rigidBody = null!;
    }

    await this.buildLandGeometry(onProgress);

    // Create simplified geometry for mini-map

    const modifier = new SimplifyModifier();

    this.miniMapGeometry = modifier.modify(this.landGeometry, 40); // Reduce detail by a factor of 10
    this.miniMapGeometry.computeVertexNormals();
    this.buildPhysicsObject();

    const end = performance.now();
    debugManager.set("perf", "Generation time: " + (end - start).toFixed(4) + "ms");
  }

  private miniMapGeometry!: THREE.BufferGeometry;
  public getMiniMapGeometry(): THREE.BufferGeometry {
    return this.miniMapGeometry;
  }

  private buildWater() {
    this.water = new Water(this.waterLevel, Math.round(globeConfig.detail / 3));
    this.object.add(this.water.getObject());
  }

  private buildEquatorWall() {
    const sph = new THREE.CircleGeometry(globeConfig.radius * 0.6, 50);
    const spm = new THREE.MeshStandardMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });
    const wall = new THREE.Mesh(sph, spm);
    wall.rotateOnWorldAxis(new Vector3(0, 1, 1), 180 * THREE.MathUtils.DEG2RAD);
    this.object.add(wall);
  }

  /** Chunks */
  public async buildChunks(onProgress: ProgressCallback) {
    this.chunks.flat().forEach((chunk) => chunk.dispose());
    this.chunks = [];
    const globeChunkGenerator = new GlobeChunkGenerator();
    const newChunks = await globeChunkGenerator.generateChunks(this.landGeometry, this.landMaterial, this.object, globeConfig.chunkSize, onProgress);

    this.chunks.push(...newChunks);
  }

  /** Physics */
  private buildPhysicsObject() {
    const fullGeometry = this.landGeometry;
    const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed();
    this.rigidBody = this.world.createRigidBody(rigidBodyDesc);

    const vertices = fullGeometry.attributes.position.array;
    const indices = fullGeometry.index ? fullGeometry.index.array : undefined;
    const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices as Float32Array, indices as Uint32Array);
    this.world.createCollider(colliderDesc, this.rigidBody);
  }

  /** Land generation */
  private async buildLandGeometry(onProgress: ProgressCallback) {
    const landWorker = new LandGeometryGenerator();
    landWorker.addPrefabPlacement(generateRandomPosition(globeConfig.radius * 1), 100);

    landWorker.addPrefabPlacement(generateRandomPosition(globeConfig.radius), 100);
    landWorker.addPrefabPlacement(generateRandomPosition(globeConfig.radius), 100);
    landWorker.addPrefabPlacement(generateRandomPosition(globeConfig.radius), 100);
    landWorker.addPrefabPlacement(generateRandomPosition(globeConfig.radius), 100);
    landWorker.addPrefabPlacement(generateRandomPosition(globeConfig.radius), 100);
    landWorker.addPrefabPlacement(generateRandomPosition(globeConfig.radius), 100);
    landWorker.addPrefabPlacement(generateRandomPosition(globeConfig.radius), 100);
    landWorker.addPrefabPlacement(generateRandomPosition(globeConfig.radius), 100);

    const geometry = await landWorker.generateLand(globeConfig.radius, globeConfig.detail, Math.random(), this.noise, onProgress);

    geometry.computeBoundingSphere();
    this.landGeometry = BufferGeometryUtils.mergeVertices(geometry);
    this.landGeometry.computeVertexNormals();
    this.landMesh = new THREE.Mesh(this.landGeometry, this.landMaterial);

    this.terrainDeformer = new TerrainDeformer(this.landMesh, this.noise);
  }
  public landMesh!: THREE.Mesh;
  /** Terrain queries */
  public deformTerrain(deformPosition: THREE.Vector3, strength: number = 2.5, radius: number = 25) {
    if (!this.terrainDeformer) {
      console.warn("TerrainDeformer not initialized");
      return;
    }

    // Apply deformation to the land geometry
    const modifiedVertices = this.terrainDeformer.flatten(deformPosition, radius);

    if (!modifiedVertices || modifiedVertices.length === 0) {
      console.warn("No vertices were modified during deformation");
      return;
    }

    // Update the land geometry
    const positions = this.landGeometry.attributes.position;
    const colors = this.landGeometry.attributes.color;

    // Apply changes to the main geometry
    for (const vertexData of modifiedVertices) {
      const { position, color, index } = vertexData;
      positions.setXYZ(index, position.x, position.y, position.z);
      colors.setXYZ(index, color.r, color.g, color.b);
    }

    // Mark geometry attributes as needing update
    positions.needsUpdate = true;
    colors.needsUpdate = true;
    this.landGeometry.computeVertexNormals();

    // Find and update affected chunks
    const affectedChunks = new Set<GlobeChunk>();
    for (const vertexData of modifiedVertices) {
      const chunk = this.getChunkByPosition(vertexData.position);
      if (chunk) {
        affectedChunks.add(chunk);
      }
    }

    // Update each affected chunk
    affectedChunks.forEach((chunk) => {
      chunk.updateGeometry(modifiedVertices);
    });

    // Update physics
    this.updatePhysicsCollider();

    // Notify about deformation
    if (this.onTerrainDeformed) {
      this.onTerrainDeformed(deformPosition, radius);
    }
  }

  private updatePhysicsCollider(): void {
    if (this.rigidBody) {
      // Remove old collider
      this.world.removeRigidBody(this.rigidBody);
    }

    // Create new rigid body with updated geometry
    const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed();
    this.rigidBody = this.world.createRigidBody(rigidBodyDesc);

    const vertices = this.landGeometry.attributes.position.array;
    const indices = this.landGeometry.index ? this.landGeometry.index.array : undefined;
    const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices as Float32Array, indices as Uint32Array);
    this.world.createCollider(colliderDesc, this.rigidBody);
  }

  private handleClickTerrain(event: MouseEvent) {
    const mouse = new THREE.Vector2();
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.camera);
    const intersects = raycaster.intersectObjects(this.chunks.flat().map((chunk) => chunk.mesh));

    if (intersects.length > 0) {
      const intersect = intersects[0];
      this.deformTerrain(intersect.point, -2.5);
    }
  }

  /** Chunk queries */
  public getChunkById(id: string): GlobeChunk | undefined {
    return this.chunks.flat().find((chunk) => chunk.mesh.uuid === id);
  }

  public getChunkByPosition(position: THREE.Vector3): GlobeChunk | null {
    const localPos = position.clone().applyMatrix4(new THREE.Matrix4().copy(this.object.matrixWorld).invert());
    const surfacePos = localPos.clone().setLength(globeConfig.radius);
    const { lat, lon } = this.xyzToLatLon(surfacePos);

    for (const row of this.chunks) {
      for (const chunk of row) {
        if (lat >= chunk.latStart && lat < chunk.latEnd && lon >= chunk.lonStart && lon < chunk.lonEnd) {
          return chunk;
        }
      }
    }
    return null;
  }

  public getVisibleChunks(): GlobeChunk[] {
    const visibleChunks: GlobeChunk[] = [];
    this.chunks.forEach((row) => {
      row.forEach((chunk) => {
        if (chunk.mesh.visible) visibleChunks.push(chunk);
      });
    });
    return visibleChunks;
  }

  private xyzToLatLon(position: THREE.Vector3): { lat: number; lon: number } {
    const radius = globeConfig.radius;
    const lat = Math.asin(position.y / radius) * (180 / Math.PI);
    let lon = Math.atan2(position.x, position.z) * (180 / Math.PI);
    lon = ((lon + 180) % 360) - 180;
    return { lat: Math.max(-90, Math.min(90, lat)), lon };
  }

  /** Infection */
  public infect(p: THREE.Vector3) {
    const chunk = this.getChunkByPosition(p);
    if (chunk) {
      this.infection.infect(p, chunk);
    }
  }

  /** Lifecycle */
  public update(camera: THREE.Camera, deltaTime: number) {
    if (this.chunks.length > 0) {
      this.updateChunkVisibility(camera);
      this.chunks.flat().forEach((chunk) => {
        const distanceToCamera = chunk.boundingSphere.center.distanceTo(camera.position);
        chunk.updateLOD(distanceToCamera);
      });
    }
    if (this.water) this.water.animate();
    if (this.runInfection) this.infection.update(deltaTime);
  }

  private updateChunkVisibility(camera: THREE.Camera) {
    camera.updateMatrixWorld();
    this.cameraViewProjectionMatrix.identity().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.cameraViewProjectionMatrix);
    let chunksVisible = 0;
    let numChunks = 0;

    this.chunks.forEach((row) => {
      row.forEach((chunk) => {
        chunk.mesh.visible = this.frustum.intersectsObject(chunk.mesh);
        if (chunk.mesh.visible) chunksVisible++;
        numChunks++;
      });
    });
    debugManager.set("chunks", "Chunks: " + chunksVisible + "/" + numChunks);
  }

  /** Accessors */
  public getObject(): THREE.Object3D {
    return this.object;
  }

  public getRadius(): number {
    return globeConfig.radius;
  }

  public getLandGeometry() {
    return this.landGeometry;
  }
}
