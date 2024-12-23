import RAPIER from "@dimforge/rapier3d";
import * as THREE from "three";
import { Vector3 } from "three";
import { mergeVertices } from "three-stdlib";
import { Water } from "../effects/Water";
import { debugManager } from "../managers/debugManager";
import { getTerrainColor, isLand, landBoundary } from "../utils/biomes";
import { pseudoRandom } from "../utils/PseudoRandom";
import { optimizeGeometry, smoothstep } from "../utils/utils";
import { vectorPool } from "../utils/vectorPool";
import { GlobeChunk } from "./GlobeChunk";
import { Infection } from "./Infection";
import { TERRAIN_PRESETS, TerrainPresetEnum } from "./TerrainPresets";
import { VoronoiNoise } from "./VoroniNoise";

const globeConfig = {
  showWall: false,
  showPoles: false,
};

export class Globe {
  private object: THREE.Object3D;
  public RADIUS = 200;
  public DETAIL = 100;
  public runInfection: boolean = false;
  public onTerrainDeformed: ((position: THREE.Vector3, radius: number) => void) | null = null;
  private chunks: GlobeChunk[][] = [];
  private readonly CHUNK_SIZE = 40;
  // private terrainDeformer: TerrainDeformer;
  private frustum = new THREE.Frustum();
  private cameraViewProjectionMatrix = new THREE.Matrix4();
  private landGeometry!: THREE.BufferGeometry;
  public waterLevel: number = 0;
  public terrainClickAllowed: boolean = false;
  private landMaterial: THREE.MeshPhongMaterial = new THREE.MeshPhongMaterial({
    vertexColors: true,
    flatShading: true,
    shininess: 0.6,
    shadowSide: THREE.DoubleSide,
    clipShadows: false,
  });

  private water!: Water;
  public terrainScale = 0.9;
  public noiseGenerators: { [key: string]: VoronoiNoise } = {
    [TerrainPresetEnum.PLAINS]: new VoronoiNoise(TERRAIN_PRESETS[TerrainPresetEnum.PLAINS]),
    [TerrainPresetEnum.SNOW_PEAKS]: new VoronoiNoise(TERRAIN_PRESETS[TerrainPresetEnum.SNOW_PEAKS]),
  };

  constructor(private camera: THREE.Camera, private scene: THREE.Scene, private world: RAPIER.World) {
    this.object = new THREE.Object3D();

    window.addEventListener("click", (e) => {
      if (this.terrainClickAllowed) this.onClickTerrain(e);
    });
    this.waterLevel = this.RADIUS * 1.09;

    this.createGlobe();
    this.generateWater();
    // this.terrainDeformer = new TerrainDeformer(this.land, this.noise);

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

  public infect(p: THREE.Vector3) {
    const chunk = this.getChunkByPosition(p);
    if (chunk) {
      console.log("infect");
      this.infection.infect(p, chunk);
    }
  }
  // Existing updateNoiseVisualization function
  updateNoiseVisualization(generator: VoronoiNoise, canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    if (!context) return;
    const imageData = context.createImageData(canvas.width, canvas.height);
    const data = imageData.data;

    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const phi = (x / canvas.width) * Math.PI * 2;
        const theta = (y / canvas.height) * Math.PI;

        const nx = Math.sin(theta) * Math.cos(phi);
        const ny = Math.cos(theta);
        const nz = Math.sin(theta) * Math.sin(phi);

        const height = generator.getValue(nx, ny, nz);
        const latitude = Math.asin(ny);
        const idx = (y * canvas.width + x) * 4;
        const color = getTerrainColor(height, latitude);
        data[idx] = color.r * 255;
        data[idx + 1] = color.g * 255;
        data[idx + 2] = color.b * 255;
        data[idx + 3] = 255;
      }
    }

    context.putImageData(imageData, 0, 0);
  }

  // New function to update all noise visualizations
  updateAllNoiseVisualizations() {
    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.position = "absolute";
    container.style.top = "20px";
    container.style.right = "20px";
    container.style.display = "flex";
    container.style.flexWrap = "wrap";

    document.body.appendChild(container);

    Object.values(this.noiseGenerators).forEach((generator) => {
      const noiseContainer = document.createElement("div");
      noiseContainer.style.display = "flex-col";

      const text = document.createElement("div");
      text.innerHTML = generator.name;
      text.style.color = "#ff5555";
      text.style.fontWeight = "bold";

      noiseContainer.appendChild(text);

      const canvas = document.createElement("canvas");
      canvas.width = 80; // Small image width
      canvas.height = 80; // Small image height
      canvas.style.margin = "5px";
      canvas.style.border = "2px solid black";
      this.updateNoiseVisualization(generator, canvas);
      noiseContainer.appendChild(canvas);
      container.appendChild(noiseContainer);
    });
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
    this.initChunks(this.landGeometry);
    const end = performance.now();
    debugManager.set("perf", "Generation time: " + (end - start).toFixed(4) + "ms");
  }
  private infection: Infection;
  private rigidBody!: RAPIER.RigidBody;
  private createPhysicsObject() {
    const fullGeometry = this.landGeometry;

    // Create physics body first
    const rigidBodyDesc = RAPIER.RigidBodyDesc.fixed();
    this.rigidBody = this.world.createRigidBody(rigidBodyDesc);

    const vertices = fullGeometry.attributes.position.array;
    const indices = fullGeometry.index ? fullGeometry.index.array : undefined;

    const colliderDesc = RAPIER.ColliderDesc.trimesh(vertices as Float32Array, indices as Uint32Array);
    this.world.createCollider(colliderDesc, this.rigidBody);
  }

  // initChunks: Create chunks by looping over lat & lon
  private initChunks(sourceGeometry: THREE.BufferGeometry) {
    // Clear existing chunks
    this.chunks.forEach((row) => {
      row.forEach((chunk) => {
        chunk.dispose();
        this.object.remove(chunk.mesh);
      });
    });
    this.chunks = [];

    for (let lat = -90; lat < 90; lat += this.CHUNK_SIZE) {
      const row: GlobeChunk[] = [];
      for (let lon = -180; lon < 180; lon += this.CHUNK_SIZE) {
        const chunkGeo = this.extractChunkGeometry(sourceGeometry, lat, lon, this.CHUNK_SIZE);
        const chunk = new GlobeChunk(chunkGeo, this.landMaterial.clone());

        // Store chunk boundaries for getChunkByPosition
        chunk.latStart = lat;
        chunk.latEnd = lat + this.CHUNK_SIZE;
        chunk.lonStart = lon;
        chunk.lonEnd = lon + this.CHUNK_SIZE;

        chunk.mesh.receiveShadow = true;
        row.push(chunk);
        this.object.add(chunk.mesh);
      }
      this.chunks.push(row);
    }
  }

  private extractChunkGeometry(source: THREE.BufferGeometry, lat: number, lon: number, size: number): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const positionAttr = source.attributes.position;
    const colorAttr = source.attributes.color;
    const indexAttr = source.index;

    // Track vertices and build interleaved data
    const vertexMap = new Int32Array(positionAttr.count).fill(-1);
    const interleavedData = new Float32Array(positionAttr.count * 6);
    let vertexCount = 0;

    // Sphere bounds checking
    const EPS = THREE.MathUtils.degToRad(1.0);
    const LAT_MIN = THREE.MathUtils.degToRad(lat) - EPS;
    const LAT_MAX = THREE.MathUtils.degToRad(lat + size) + EPS;
    const LON_MIN = THREE.MathUtils.degToRad(lon) - EPS;
    const LON_MAX = THREE.MathUtils.degToRad(lon + size) + EPS;

    const spherical = new THREE.Spherical();
    const tempVec = new THREE.Vector3();
    const posArray = positionAttr.array;
    const colArray = colorAttr.array;

    // First pass: Mark vertices in bounds
    for (let i = 0; i < positionAttr.count; i++) {
      tempVec.set(posArray[i * 3], posArray[i * 3 + 1], posArray[i * 3 + 2]);
      spherical.setFromVector3(tempVec);
      const vertexLat = Math.PI / 2 - spherical.phi;
      const vertexLon = THREE.MathUtils.euclideanModulo(spherical.theta + Math.PI, Math.PI * 2) - Math.PI;

      if (vertexLat >= LAT_MIN && vertexLat <= LAT_MAX && vertexLon >= LON_MIN && vertexLon <= LON_MAX) {
        vertexMap[i] = vertexCount;
        const outIndex = vertexCount * 6;
        for (let j = 0; j < 3; j++) {
          interleavedData[outIndex + j] = posArray[i * 3 + j];
          interleavedData[outIndex + 3 + j] = colArray[i * 3 + j];
        }
        vertexCount++;
      }
    }

    // Second pass: Process triangles
    if (indexAttr) {
      const indexArray = indexAttr.array;
      const filteredIndices = new Uint32Array(indexArray.length);
      let indexCount = 0;

      // Helper to add vertices that weren't in bounds but complete triangles
      function addVertex(index: number): number {
        const outIndex = vertexCount * 6;
        for (let j = 0; j < 3; j++) {
          interleavedData[outIndex + j] = posArray[index * 3 + j];
          interleavedData[outIndex + 3 + j] = colArray[index * 3 + j];
        }
        return vertexCount++;
      }

      for (let i = 0; i < indexArray.length; i += 3) {
        const a = indexArray[i];
        const b = indexArray[i + 1];
        const c = indexArray[i + 2];

        if (vertexMap[a] !== -1 || vertexMap[b] !== -1 || vertexMap[c] !== -1) {
          if (vertexMap[a] === -1) vertexMap[a] = addVertex(a);
          if (vertexMap[b] === -1) vertexMap[b] = addVertex(b);
          if (vertexMap[c] === -1) vertexMap[c] = addVertex(c);

          filteredIndices[indexCount++] = vertexMap[a];
          filteredIndices[indexCount++] = vertexMap[b];
          filteredIndices[indexCount++] = vertexMap[c];
        }
      }

      geometry.setIndex(new THREE.BufferAttribute(filteredIndices.slice(0, indexCount), 1));
    }

    // Create final attributes
    const finalData = new Float32Array(interleavedData.buffer, 0, vertexCount * 6);
    const interleavedBuffer = new THREE.InterleavedBuffer(finalData, 6);
    geometry.setAttribute("position", new THREE.InterleavedBufferAttribute(interleavedBuffer, 3, 0));
    geometry.setAttribute("color", new THREE.InterleavedBufferAttribute(interleavedBuffer, 3, 3));
    geometry.computeVertexNormals();

    return geometry;
  }

  // Then modify generateLand() to use it:
  private generateLand() {
    const landGeometry = new THREE.IcosahedronGeometry(this.RADIUS + 0.1, this.DETAIL);
    const positionAttribute = landGeometry.attributes.position;
    const vertexCount = positionAttribute.count;

    // Create buffers with fallback
    const vertices = new Float32Array(vertexCount * 3 * 4);
    const colors = new Float32Array(vertexCount * 3 * 4);
    const indices = new Uint32Array(vertexCount * 4);
    const positionArray = positionAttribute.array;
    // Batch process vertices
    for (let i = 0; i < vertexCount; i++) {
      // Direct array access is faster than push()
      const idx = i * 3;

      const x = positionArray[idx];
      const y = positionArray[idx + 1];
      const z = positionArray[idx + 2];

      const length = Math.sqrt(x * x + y * y + z * z);
      const nx = x / length;
      const ny = y / length;
      const nz = z / length;

      const latitude = Math.asin(ny);

      const height = this.getHeight(nx, ny, nz);
      const elevation = this.elevationMultiplier(height);

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
    newGeometry.computeVertexNormals(); // Ensure normals are computed

    if (this.landGeometry) {
      this.landGeometry.dispose();
    }

    this.landGeometry = mergeVertices(optimizeGeometry(newGeometry));
  }

  public getSurfaceNormal(position: THREE.Vector3): THREE.Vector3 {
    // Get the normal attribute buffer
    const normalAttr = this.landGeometry.attributes.normal;

    // Find closest vertex index (you'll need to implement this based on your geometry)
    const closestIndex = this.findClosestVertexIndex(position);

    // Get normal from buffer (3 components per vertex)
    const nx = normalAttr.array[closestIndex * 3];
    const ny = normalAttr.array[closestIndex * 3 + 1];
    const nz = normalAttr.array[closestIndex * 3 + 2];

    // Return as normalized Vector3
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

  public getHeight(x: number, y: number, z: number): number {
    const BASE_HEIGHT = 0.2; // Ensures minimum elevation above water

    let height = BASE_HEIGHT;
    let totalWeight = 0;

    // Iterate through all terrain types in noiseGenerators
    for (const [terrainType, generator] of Object.entries(this.noiseGenerators)) {
      const preset = TERRAIN_PRESETS[terrainType as TerrainPresetEnum];
      const noiseValue = generator.getValue(x * preset.cellSize, y * preset.cellSize, z * preset.cellSize);
      const weight = preset.amplitude; // Use amplitude as weight for blending
      height += noiseValue * weight;
      totalWeight += weight;
    }

    // Normalize the height by the total weight to ensure proper blending
    if (totalWeight > 0) {
      height = (BASE_HEIGHT + (height - BASE_HEIGHT) / totalWeight) * this.terrainScale;
    }

    return height;
  }

  public getHeightPrecise(x: number, y: number, z: number, latitude: number): number {
    const BASE_HEIGHT = 0.2; // Ensures minimum elevation above water
    const MOUNTAIN_SCALE = 1.2;
    const HILLS_SCALE = 0.8;

    // Get noise values with adjusted scales
    const biomeNoise = this.noiseGenerators.PLAINS.getValue(x * 0.3, y * 0.3, z * 0.3);
    const snowNoise = this.noiseGenerators.SNOW_PEAKS.getValue(x, y, z) * MOUNTAIN_SCALE;
    const mountainNoise = this.noiseGenerators.MOUNTAINS.getValue(x, y, z) * MOUNTAIN_SCALE;
    const hillsNoise = this.noiseGenerators.HILLS.getValue(x, y, z) * HILLS_SCALE;

    // Adjust biome weights
    const mountainWeight = smoothstep(0.4, 0.6, (biomeNoise + 1) * 0.5);
    const hillWeight = smoothstep(0.2, 0.4, (biomeNoise + 1) * 0.5);

    // Calculate height with base elevation
    let height = BASE_HEIGHT;

    if (mountainWeight > 0) {
      height += snowNoise * mountainWeight;
    }
    if (hillWeight > 0) {
      height += this.blendTerrains(hillsNoise, mountainNoise, hillWeight);
    }
    if (mountainWeight === 0 && hillWeight === 0) {
      height += Math.max(0, hillsNoise * 0.6); // Ensure minimal height for plains
    }

    // Apply latitude-based adjustment
    const latitudeInfluence = Math.cos(latitude * 2) * 0.2;
    height *= 1 + latitudeInfluence;

    // Normalize and scale
    return Math.max(BASE_HEIGHT, height * this.terrainScale);
  }

  private blendTerrains(a: number, b: number, t: number): number {
    return a * t + b * (1 - t);
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
    // Get normalized direction from center to position
    const direction = worldPos.clone().normalize();

    // Get height at this point using noise
    const noise = this.getHeight(direction.x, direction.y, direction.z);
    const elevation = this.elevationMultiplier(noise); // Same factor as in generateLand
    // Scale direction by radius and elevation
    return direction.multiplyScalar(this.RADIUS * elevation);
  }

  private elevationMultiplier(noise: number) {
    return 1 + noise * 0.3;
  }

  public getHeightAboveSurface(v: THREE.Vector3, testUnderWater: boolean = false): number {
    // Get normalized direction from center to position
    const direction = v.clone().normalize();

    // Get height at this point using noise
    const noise = this.getHeight(direction.x, direction.y, direction.z);

    const noiseAboveWater = !testUnderWater && isLand(noise) ? noise : landBoundary;
    const elevation = this.elevationMultiplier(noiseAboveWater); // Same elevation factor as in generateLand

    // Calculate the height above the globe's radius
    const surfacePosition = direction.multiplyScalar(this.RADIUS * elevation);
    const height = v.distanceTo(surfacePosition);

    return height;
  }

  public getHeightOfSurface(v: THREE.Vector3): number {
    // Get normalized direction from center to position
    const direction = v.clone().normalize();

    // Get height at this point using noise
    const noise = this.getHeight(direction.x, direction.y, direction.z);
    const elevation = this.elevationMultiplier(noise); // Same elevation factor as in generateLand

    // Calculate the height above the globe's radius
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
    // this.terrainDeformer.deformTerrain(deformPosition, strength, radius);
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
    // Project the position onto the globe's surface
    // Convert world coordinates to local coordinates
    const localPosition = position.clone().applyMatrix4(new THREE.Matrix4().copy(this.object.matrixWorld).invert());

    // Then project onto surface
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
    // Only render visible chunks

    this.updateChunkVisibility(camera);
    this.water && this.water.animate();
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
}
