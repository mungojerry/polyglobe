import RAPIER from "@dimforge/rapier3d";
import * as THREE from "three";
import { Vector3 } from "three";
import { mergeVertices } from "three-stdlib";
import { Water } from "../effects/Water";
import { debugManager } from "../managers/debugManager";
import { getTerrainColor, isLand, landBoundary } from "../utils/biomes";
import { pseudoRandom } from "../utils/PseudoRandom";
import { optimizeGeometry } from "../utils/utils";
import { vectorPool } from "../utils/vectorPool";
import { Atmosphere } from "./Atmosphere";
import { GlobeChunk } from "./GlobeChunk";
import { Infection } from "./Infection";
import { TERRAIN_PRESETS, TerrainPresetEnum } from "./TerrainPresets";
import { VoronoiNoise } from "./VoroniNoise";

import ChunkWorker from "./chunkWorker?worker";

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
  private readonly dayNightCycleSpeed = 0.05;

  public waterLevel: number = 0;
  public terrainClickAllowed: boolean = false;
  public terrainScale = 0.9;
  public noiseGenerators: VoronoiNoise[] = [
    new VoronoiNoise(TERRAIN_PRESETS[TerrainPresetEnum.PLAINS]),
    new VoronoiNoise(TERRAIN_PRESETS[TerrainPresetEnum.SNOW_PEAKS]),
  ];

  private landGeometry!: THREE.BufferGeometry;
  private tempLandMesh!: THREE.Mesh;
  private rigidBody!: RAPIER.RigidBody;
  private water!: Water;
  private atmosphere!: Atmosphere;

  constructor(private camera: THREE.Camera, private world: RAPIER.World) {
    this.object = new THREE.Object3D();

    window.addEventListener("click", (e) => {
      if (this.terrainClickAllowed) this.onClickTerrain(e);
    });
    this.waterLevel = this.RADIUS * 1.09;

    this.createGlobe();
    this.generateWater();
    this.generateAtmosphere();

    if (globeConfig.showWall) this.addEquatorWall();
    this.object.castShadow = true;
    this.object.receiveShadow = true;
    this.infection = new Infection(this);

    const globeObject = this.getObject();
    globeObject.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
  }

  private generateAtmosphere() {
    this.atmosphere = new Atmosphere(this.RADIUS);
    this.object.add(this.atmosphere.getObject());
  }

  public infect(p: THREE.Vector3) {
    const chunk = this.getChunkByPosition(p);
    if (chunk) {
      this.infection.infect(p, chunk);
    }
  }

  public createGlobe(seed: number = new Date().getTime()) {
    const start = performance.now();
    pseudoRandom.setSeed(seed);
    if (this.landGeometry) {
      this.landGeometry.dispose();
    }

    if (this.rigidBody) {
      this.world.removeRigidBody(this.rigidBody);
      this.rigidBody = null!;
    }

    this.generateLand();
    this.createPhysicsObject();
    this.initChunks();

    const end = performance.now();
    debugManager.set("perf", "Generation time: " + (end - start).toFixed(4) + "ms");
  }

  private removeTemporaryGeometry() {
    this.object.remove(this.tempLandMesh);
    this.tempLandMesh.geometry.dispose();
  }

  private createPhysicsObject() {
    const fullGeometry = this.landGeometry;

    const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed();
    this.rigidBody = this.world.createRigidBody(rigidBodyDesc);

    const vertices = fullGeometry.attributes.position.array;
    const indices = fullGeometry.index ? fullGeometry.index.array : undefined;

    const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices as Float32Array, indices as Uint32Array);
    this.world.createCollider(colliderDesc, this.rigidBody);
  }

  private initChunks() {
    const start = performance.now();
    const workerPromises = [];

    for (let lat = -90; lat < 90; lat += this.CHUNK_SIZE) {
      const row: GlobeChunk[] = [];
      for (let lon = -180; lon < 180; lon += this.CHUNK_SIZE) {
        const worker = new ChunkWorker();
        worker.postMessage({ source: this.landGeometry, lat, lon, size: this.CHUNK_SIZE });

        const promise = new Promise<void>((resolve) => {
          worker.onmessage = (event) => {
            const serializedGeometry = event.data.geometry;

            // Reconstruct the geometry from the serialized data
            const loader = new THREE.BufferGeometryLoader();
            const geometry = loader.parse(serializedGeometry);
            geometry.computeBoundsTree();

            const chunk = new GlobeChunk(geometry, this.landMaterial.clone());
            chunk.latStart = lat;
            chunk.latEnd = lat + this.CHUNK_SIZE;
            chunk.lonStart = lon;
            chunk.lonEnd = lon + this.CHUNK_SIZE;
            chunk.mesh.layers.enable(1);
            row.push(chunk);
            this.object.add(chunk.mesh);
            worker.terminate();
            resolve();
          };
        });

        workerPromises.push(promise);
      }
      this.chunks.push(row);
    }

    Promise.all(workerPromises).then(() => {
      this.removeTemporaryGeometry();
      debugManager.set("initChunks", "initChunks: " + (performance.now() - start).toFixed(4));
    });
  }

  public getChunkById(id: string): GlobeChunk | undefined {
    return this.chunks.flat().find((chunk) => chunk.mesh.uuid === id);
  }

  private generateLand() {
    const landGeometry = new THREE.IcosahedronGeometry(this.RADIUS + 0.2, this.DETAIL);
    const positionAttribute = landGeometry.attributes.position;
    const vertexCount = positionAttribute.count;

    const vertices = new Float32Array(vertexCount * 3 * 4);
    const colors = new Float32Array(vertexCount * 3 * 4);
    const indices = new Uint32Array(vertexCount * 4);
    const positionArray = positionAttribute.array;
    const getHeight = this.getHeight.bind(this);
    const elevationMultiplier = this.elevationMultiplier.bind(this);
    for (let i = 0; i < vertexCount; i++) {
      const idx = i * 3;

      const x = positionArray[idx];
      const y = positionArray[idx + 1];
      const z = positionArray[idx + 2];

      const length = Math.sqrt(x * x + y * y + z * z);
      const nx = x / length;
      const ny = y / length;
      const nz = z / length;

      const latitude = Math.asin(ny);

      const height = getHeight(nx, ny, nz);
      const elevation = elevationMultiplier(height);

      vertices[idx] = x * elevation;
      vertices[idx + 1] = y * elevation;
      vertices[idx + 2] = z * elevation;

      const color = getTerrainColor(height, latitude);
      colors[idx] = color.r;
      colors[idx + 1] = color.g;
      colors[idx + 2] = color.b;

      indices[i] = i;
    }

    const newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    newGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    newGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
    newGeometry.computeVertexNormals();

    if (this.landGeometry) {
      this.landGeometry.dispose();
    }

    this.landGeometry = mergeVertices(optimizeGeometry(newGeometry));
    this.tempLandMesh = new THREE.Mesh(this.landGeometry, this.landMaterial);
    this.object.add(this.tempLandMesh);
  }

  public getSurfaceNormal(position: THREE.Vector3): THREE.Vector3 {
    const normalAttr = this.landGeometry.attributes.normal;
    const closestIndex = this.findClosestVertexIndex(position);
    const nx = normalAttr.array[closestIndex * 3];
    const ny = normalAttr.array[closestIndex * 3 + 1];
    const nz = normalAttr.array[closestIndex * 3 + 2];
    return new THREE.Vector3(nx, ny, nz).normalize();
  }

  private findClosestVertexIndex(position: THREE.Vector3): number {
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

  private generateWater() {
    this.water = new Water(this.waterLevel, Math.round(this.DETAIL / 3));
    this.object.add(this.water.getObject());
  }

  private readonly BASE_HEIGHT = 0.2;

  public getHeight(x: number, y: number, z: number): number {
    let height = this.BASE_HEIGHT;
    let totalWeight = 0;

    this.noiseGenerators.forEach((generator) => {
      const { cellSize, amplitude } = generator.config;

      const noiseValue = generator.getValue(x * cellSize, y * cellSize, z * cellSize);
      height += noiseValue * amplitude;
      totalWeight += amplitude;
    });

    if (totalWeight > 0) {
      height = (this.BASE_HEIGHT + (height - this.BASE_HEIGHT) / totalWeight) * this.terrainScale;
    }

    return height;
  }

  public isLand(position: THREE.Vector3): boolean {
    const direction = position.clone().normalize();
    const noise = this.getHeight(direction.x, direction.y, direction.z);
    return isLand(noise);
  }

  public getTerrainSlope(position: THREE.Vector3): number {
    const surfaceNormal = this.getSurfaceNormal(position);
    const up = position.clone().normalize();
    const steepness = 1 - surfaceNormal.dot(up);
    return steepness;
  }

  public getPositionOnSurface(worldPos: THREE.Vector3): THREE.Vector3 | null {
    const direction = worldPos.clone().normalize();
    const noise = this.getHeight(direction.x, direction.y, direction.z);
    const elevation = this.elevationMultiplier(noise);
    return direction.multiplyScalar(this.RADIUS * elevation);
  }

  private elevationMultiplier(noise: number) {
    return 1 + noise * 0.3;
  }

  public getHeightAboveSurface(v: THREE.Vector3, testUnderWater: boolean = false): number {
    const direction = v.clone().normalize();
    const noise = this.getHeight(direction.x, direction.y, direction.z);
    const noiseAboveWater = !testUnderWater && isLand(noise) ? noise : landBoundary;
    const elevation = this.elevationMultiplier(noiseAboveWater);
    const surfacePosition = direction.multiplyScalar(this.RADIUS * elevation);
    const height = v.distanceTo(surfacePosition);
    return height;
  }

  public getHeightOfSurface(v: THREE.Vector3): number {
    const direction = v.clone().normalize();
    const noise = this.getHeight(direction.x, direction.y, direction.z);
    const elevation = this.elevationMultiplier(noise);
    const surfacePosition = direction.multiplyScalar(this.RADIUS * elevation);
    const height = v.distanceTo(surfacePosition);
    return height;
  }

  public getObject(): THREE.Object3D {
    return this.object;
  }

  public getRadius(): number {
    return this.RADIUS;
  }

  deformTerrain(deformPosition: THREE.Vector3, strength: number = 2.5, radius: number = 25): void {
    if (this.onTerrainDeformed) {
      this.onTerrainDeformed(deformPosition, radius);
    }
  }

  onClickTerrain(event: MouseEvent) {
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

  public getChunkByPosition(position: THREE.Vector3): GlobeChunk | null {
    const localPosition = position.clone().applyMatrix4(new THREE.Matrix4().copy(this.object.matrixWorld).invert());
    const surfacePos = localPosition.clone().setLength(this.RADIUS);
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

  private xyzToLatLon(position: THREE.Vector3): { lat: number; lon: number } {
    const radius = this.RADIUS;
    const lat = Math.asin(position.y / radius) * (180 / Math.PI);
    let lon = Math.atan2(position.x, position.z) * (180 / Math.PI);
    lon = ((lon + 180) % 360) - 180;
    return { lat: Math.max(-90, Math.min(90, lat)), lon };
  }

  public getVisibleChunks(): GlobeChunk[] {
    let visibleChunks: GlobeChunk[] = [];
    this.chunks.forEach((row) => {
      row.forEach((chunk) => {
        if (chunk.mesh.visible) visibleChunks.push(chunk);
      });
    });
    return visibleChunks;
  }

  public getLandGeometry() {
    return this.landGeometry;
  }

  private addEquatorWall() {
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

  update(camera: THREE.Camera, deltaTime: number) {
    this.updateChunkVisibility(camera);
    this.water && this.water.animate();
    if (this.runInfection) this.infection.update(deltaTime);

    // Update atmosphere and water with sun/moon positions
    const time = performance.now() * 0.001;
    const orbitRadius = this.RADIUS * 3;
    const sunPosition = new THREE.Vector3(
      Math.cos(time * this.dayNightCycleSpeed) * orbitRadius,
      Math.sin(time * this.dayNightCycleSpeed) * orbitRadius * 0.3,
      Math.sin(time * this.dayNightCycleSpeed) * orbitRadius
    );
    const moonPosition = new THREE.Vector3(
      -Math.cos(time * this.dayNightCycleSpeed) * orbitRadius,
      Math.sin(time * this.dayNightCycleSpeed + Math.PI) * orbitRadius * 0.3,
      -Math.sin(time * this.dayNightCycleSpeed) * orbitRadius
    );

    // Update atmosphere
    this.atmosphere.update(sunPosition, moonPosition);

    // Calculate day/night cycle
    const dayNightCycle = (Math.sin(time * this.dayNightCycleSpeed) + 1) * 0.5;
    this.atmosphere.setSunIntensity(Math.pow(dayNightCycle, 0.5));
    this.atmosphere.setMoonIntensity(Math.pow(1 - dayNightCycle, 0.5) * 0.5);

    // Update water reflections
    this.water.updateLightPositions(sunPosition, moonPosition, dayNightCycle);
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
}
