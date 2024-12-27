import RAPIER from "@dimforge/rapier3d";
import * as THREE from "three";
import { Vector3 } from "three";
import { Water } from "../effects/Water";
import { debugManager } from "../managers/debugManager";
import { pseudoRandom } from "../utils/PseudoRandom";
import { ProgressCallback } from "../utils/utils";
import { vectorPool } from "../utils/vectorPool";
import { ChunkGenerator } from "./ChunkGenerator";
import { GlobeChunk } from "./GlobeChunk";
import { Infection } from "./Infection";
import { LandGeometryGenerator } from "./LangGeometryGenerator";
import { VoronoiNoise } from "./noise/VoroniNoise";
import { TerrainGenerator } from "./TerrainGenerator";

const globeConfig = {
  showWall: false,
  showPoles: false,
};

export class Globe {
  private readonly object: THREE.Object3D;
  public readonly RADIUS = 200;
  public readonly DETAIL = 100;
  public runInfection: boolean = false;
  public onTerrainDeformed: ((position: THREE.Vector3, radius: number) => void) | null = null;
  private readonly chunks: GlobeChunk[][] = [];
  private readonly CHUNK_SIZE = 20;
  private readonly frustum = new THREE.Frustum();
  private readonly cameraViewProjectionMatrix = new THREE.Matrix4();
  private readonly landMaterial: THREE.MeshPhongMaterial = new THREE.MeshPhongMaterial({
    vertexColors: true,
    flatShading: true,
    shininess: 0.6,
    shadowSide: THREE.DoubleSide,
    clipShadows: false,
  });
  private readonly infection: Infection;

  public waterLevel: number = 0;
  public terrainClickAllowed: boolean = false;
  public noise: VoronoiNoise = new VoronoiNoise();

  private landGeometry!: THREE.BufferGeometry;
  private tempLandMesh!: THREE.Mesh;
  private rigidBody!: RAPIER.RigidBody;
  private water!: Water;
  private terrainGenerator: TerrainGenerator = new TerrainGenerator(this.noise);

  constructor(private camera: THREE.Camera, private world: RAPIER.World) {
    this.object = new THREE.Object3D();

    window.addEventListener("click", (e) => {
      if (this.terrainClickAllowed) this.handleClickTerrain(e);
    });
    this.waterLevel = this.RADIUS * 1.09;

    this.buildWater();

    if (globeConfig.showWall) this.buildEquatorWall();
    this.object.castShadow = true;
    this.object.receiveShadow = true;
    this.infection = new Infection(this);
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

    // const globeObject = this.getObject();
    // globeObject.traverse((obj) => {
    //   if (obj instanceof THREE.Mesh) {
    //     obj.castShadow = true;
    //     obj.receiveShadow = true;
    //   }
    // });

    this.buildPhysicsObject();

    const end = performance.now();
    debugManager.set("perf", "Generation time: " + (end - start).toFixed(4) + "ms");
  }

  private buildWater() {
    this.water = new Water(this.waterLevel, Math.round(this.DETAIL / 3));
    this.object.add(this.water.getObject());
  }

  private buildEquatorWall() {
    const sph = new THREE.CircleGeometry(this.RADIUS * 0.6, 50);
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
    const chunkGenerator = new ChunkGenerator();
    const newChunks = await chunkGenerator.generateChunks(this.landGeometry, this.landMaterial, this.object, this.CHUNK_SIZE, onProgress);

    this.chunks.push(...newChunks);
    this.discardTemporaryMesh();
  }

  private discardTemporaryMesh() {
    this.object.remove(this.tempLandMesh);
    this.tempLandMesh.geometry.dispose();
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
    const geometry = await landWorker.generateLand(this.RADIUS, this.DETAIL, Math.random(), this.noise, this.terrainGenerator, onProgress);
    console.log("##############");
    console.log(geometry);
    this.landGeometry = geometry;
    this.tempLandMesh = new THREE.Mesh(geometry, this.landMaterial);
    this.object.add(this.tempLandMesh);
  }

  /** Terrain data */
  public computeSurfaceHeight(x: number, y: number, z: number): number {
    return this.terrainGenerator.computeSurfaceHeight(x, y, z);
  }

  private computeElevationMultiplier(noise: number) {
    return this.terrainGenerator.computeElevationMultiplier(noise);
  }

  /** Terrain queries */
  public getSurfaceNormal(position: THREE.Vector3): THREE.Vector3 {
    const normalAttr = this.landGeometry.attributes.normal;
    const closestIndex = this.getClosestVertexIndex(position);
    const nx = normalAttr.array[closestIndex * 3];
    const ny = normalAttr.array[closestIndex * 3 + 1];
    const nz = normalAttr.array[closestIndex * 3 + 2];
    return new THREE.Vector3(nx, ny, nz).normalize();
  }

  private getClosestVertexIndex(position: THREE.Vector3): number {
    const vertices = this.landGeometry.attributes.position;
    let minDist = Infinity;
    let closestIndex = 0;

    for (let i = 0; i < vertices.count; i++) {
      const vx = vertices.array[i * 3];
      const vy = vertices.array[i * 3 + 1];
      const vz = vertices.array[i * 3 + 2];
      const v = vectorPool.getVector(vx, vy, vz);
      const dist = position.distanceToSquared(v);
      if (dist < minDist) {
        minDist = dist;
        closestIndex = i;
      }
      vectorPool.releaseVector(v);
    }
    return closestIndex;
  }

  public isLand(position: THREE.Vector3): boolean {
    const dir = position.clone().normalize();
    const noiseValue = this.computeSurfaceHeight(dir.x, dir.y, dir.z);
    return this.terrainGenerator.isLandHeight(noiseValue);
  }

  public computeTerrainSlope(position: THREE.Vector3): number {
    const surfaceNormal = this.getSurfaceNormal(position);
    const up = position.clone().normalize();
    return 1 - surfaceNormal.dot(up);
  }

  public computePositionOnSurface(worldPos: THREE.Vector3): THREE.Vector3 | null {
    const dir = worldPos.clone().normalize();
    const noise = this.computeSurfaceHeight(dir.x, dir.y, dir.z);
    const elevation = this.computeElevationMultiplier(noise);
    return dir.multiplyScalar(this.RADIUS * elevation);
  }

  public computeHeightAboveSurface(v: THREE.Vector3, testUnderWater: boolean = false): number {
    const dir = v.clone().normalize();
    const noiseValue = this.terrainGenerator.computeSurfaceHeight(dir.x, dir.y, dir.z);
    const validNoise = !testUnderWater && this.terrainGenerator.isLandHeight(noiseValue) ? noiseValue : this.terrainGenerator.getTerrainBoundary();

    const elevation = this.computeElevationMultiplier(validNoise);
    const surfacePos = dir.multiplyScalar(this.RADIUS * elevation);
    return v.distanceTo(surfacePos);
  }

  public computeAbsoluteHeightOfSurface(v: THREE.Vector3): number {
    const dir = v.clone().normalize();
    const noise = this.computeSurfaceHeight(dir.x, dir.y, dir.z);
    const elevation = this.computeElevationMultiplier(noise);
    const surfacePos = dir.multiplyScalar(this.RADIUS * elevation);
    return v.distanceTo(surfacePos);
  }

  /** Basic interactions */
  public deformTerrain(deformPosition: THREE.Vector3, strength: number = 2.5, radius: number = 25) {
    if (this.onTerrainDeformed) {
      this.onTerrainDeformed(deformPosition, radius);
    }
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
    const surfacePos = localPos.clone().setLength(this.RADIUS);
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
    const radius = this.RADIUS;
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
    this.updateChunkVisibility(camera);
    if (this.water) this.water.animate();
    if (this.runInfection) this.infection.update(deltaTime);
  }

  private updateChunkVisibility(camera: THREE.Camera) {
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
    debugManager.set("chucnks", "Chunks: " + chunksVisible + "/" + numChunks);
  }

  /** Accessors */
  public getObject(): THREE.Object3D {
    return this.object;
  }

  public getRadius(): number {
    return this.RADIUS;
  }

  public getLandGeometry() {
    return this.landGeometry;
  }
}
