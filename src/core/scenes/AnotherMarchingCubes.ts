import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise";
import { pseudoRandom } from "../utils/PseudoRandom";
import { edgeTable, triTable } from "./MCDefs";

interface TerrainChunk {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  scalarField: number[][][];
}

export class InfiniteLandscape {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  light: THREE.DirectionalLight;
  private material: THREE.MeshPhongMaterial;
  private simplex: SimplexNoise;
  private gridSize = 32;
  private cubeSize = 1;
  private isoLevel = 0.4; // Changed from 0.7
  private raycaster = new THREE.Raycaster();

  private chunks: Map<string, TerrainChunk> = new Map();
  private viewDistance = 3; // Number of chunks visible in each direction
  private currentCenterChunk: THREE.Vector2 = new THREE.Vector2();

  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 32, 64);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    document.body.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;

    this.light = new THREE.DirectionalLight(0xffffff, 1);
    this.light.position.set(50, 100, 50);
    this.light.castShadow = true;
    this.scene.add(this.light);

    const ambientLight = new THREE.AmbientLight(0x404040, 0.3);
    this.scene.add(ambientLight);

    const hemisphereLight = new THREE.HemisphereLight(0xffffbb, 0x080820, 0.5);
    this.scene.add(hemisphereLight);

    this.material = new THREE.MeshPhongMaterial({
      color: 0x55aa55,
      side: THREE.FrontSide,
      flatShading: true,
    });

    const groundGeometry = new THREE.PlaneGeometry(1000, 1000);
    const groundMaterial = new THREE.MeshBasicMaterial({
      color: 0x666666,
      side: THREE.DoubleSide,
      wireframe: true,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = Math.PI / 2;
    ground.position.y = -10;
    this.scene.add(ground);
    this.setupEventListeners();
    this.simplex = new SimplexNoise(pseudoRandom);
    // Initialize chunks around camera's starting position
    this.currentCenterChunk = this.getChunkCoordinates(this.camera.position);
    this.updateChunks(this.currentCenterChunk.x, this.currentCenterChunk.y);

    this.animate();
  }

  private getChunkCoordinates(position: THREE.Vector3): THREE.Vector2 {
    const chunkX = Math.floor(position.x / ((this.gridSize - 1) * this.cubeSize));
    const chunkZ = Math.floor(position.z / ((this.gridSize - 1) * this.cubeSize));
    return new THREE.Vector2(chunkX, chunkZ);
  }

  private getChunkKey(x: number, z: number): string {
    return `${x},${z}`;
  }

  private updateChunks(cameraChunkX: number, cameraChunkZ: number): void {
    // Remove out-of-range chunks
    for (const [key, chunk] of this.chunks) {
      const [x, z] = key.split(",").map(Number);
      const distance = Math.max(Math.abs(x - cameraChunkX), Math.abs(z - cameraChunkZ));
      if (distance > this.viewDistance) {
        this.removeChunk(x, z);
      }
    }

    // Add new in-range chunks
    for (let x = cameraChunkX - this.viewDistance; x <= cameraChunkX + this.viewDistance; x++) {
      for (let z = cameraChunkZ - this.viewDistance; z <= cameraChunkZ + this.viewDistance; z++) {
        const key = this.getChunkKey(x, z);
        if (!this.chunks.has(key)) {
          this.createChunk(x, z);
        }
      }
    }
  }

  private removeChunk(chunkX: number, chunkZ: number): void {
    const key = this.getChunkKey(chunkX, chunkZ);
    const chunk = this.chunks.get(key);
    if (chunk) {
      this.scene.remove(chunk.mesh);
      chunk.mesh.geometry.dispose();
      this.chunks.delete(key);
    }
  }

  private createChunk(chunkX: number, chunkZ: number): TerrainChunk {
    const position = new THREE.Vector3(chunkX * (this.gridSize - 1) * this.cubeSize, 0, chunkZ * (this.gridSize - 1) * this.cubeSize);

    const scalarField = this.createScalarField(chunkX, chunkZ);

    const geometry = this.generateChunkGeometry(scalarField);
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.position.copy(position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;

    const chunk: TerrainChunk = { mesh, position, scalarField };
    this.chunks.set(this.getChunkKey(chunkX, chunkZ), chunk);
    this.scene.add(mesh);

    return chunk;
  }

  private createScalarField(chunkX: number, chunkZ: number): number[][][] {
    const field: number[][][] = [];
    const offsetX = chunkX * (this.gridSize - 1);
    const offsetZ = chunkZ * (this.gridSize - 1);

    for (let x = 0; x < this.gridSize; x++) {
      field[x] = [];
      for (let y = 0; y < this.gridSize; y++) {
        field[x][y] = [];
        for (let z = 0; z < this.gridSize; z++) {
          field[x][y][z] = this.generateNoiseValue(x + offsetX, y, z + offsetZ);
        }
      }
    }
    return field;
  }

  private generateChunkGeometry(scalarField: number[][][]): THREE.BufferGeometry {
    const vertices: number[] = [];
    const normals: number[] = [];

    // Correct edge to vertex mapping according to standard MC implementation
    const edgeToVertex = [
      [0, 1],
      [1, 3],
      [2, 3],
      [0, 2], // bottom face
      [4, 5],
      [5, 7],
      [6, 7],
      [4, 6], // top face
      [0, 4],
      [1, 5],
      [3, 7],
      [2, 6], // vertical edges
    ];

    for (let x = 0; x < this.gridSize - 1; x++) {
      for (let y = 0; y < this.gridSize - 1; y++) {
        for (let z = 0; z < this.gridSize - 1; z++) {
          const corners = [
            new THREE.Vector3(x, y, z),
            new THREE.Vector3(x + 1, y, z),
            new THREE.Vector3(x, y, z + 1),
            new THREE.Vector3(x + 1, y, z + 1),
            new THREE.Vector3(x, y + 1, z),
            new THREE.Vector3(x + 1, y + 1, z),
            new THREE.Vector3(x, y + 1, z + 1),
            new THREE.Vector3(x + 1, y + 1, z + 1),
          ].map((v) => v.multiplyScalar(this.cubeSize));

          const values = [
            scalarField[x][y][z],
            scalarField[x + 1][y][z],
            scalarField[x][y][z + 1],
            scalarField[x + 1][y][z + 1],
            scalarField[x][y + 1][z],
            scalarField[x + 1][y + 1][z],
            scalarField[x][y + 1][z + 1],
            scalarField[x + 1][y + 1][z + 1],
          ];

          let cubeIndex = 0;
          for (let i = 0; i < 8; i++) {
            if (values[i] < this.isoLevel) {
              cubeIndex |= 1 << i;
            }
          }

          if (edgeTable[cubeIndex] === 0) continue;

          const triangles = triTable[cubeIndex];
          for (let i = 0; triangles[i] !== -1; i += 3) {
            const vertexIndices = [triangles[i], triangles[i + 1], triangles[i + 2]].map((edgeIndex) => {
              const [v1Index, v2Index] = edgeToVertex[edgeIndex];
              return this.interpolateVertex(corners[v1Index], corners[v2Index], values[v1Index], values[v2Index]);
            });

            const [v1, v2, v3] = vertexIndices;

            // Calculate face normal
            const normal = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(v2, v1), new THREE.Vector3().subVectors(v3, v1)).normalize();

            // Add vertices and normals
            vertices.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z, v3.x, v3.y, v3.z);

            for (let j = 0; j < 3; j++) {
              normals.push(normal.x, normal.y, normal.z);
            }
          }
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    return geometry;
  }

  private generateNoiseValue(x: number, y: number, z: number): number {
    const baseHeight = 16;
    const scale = 0.03;
    const persistence = 0.5;
    const octaves = 4;

    let amplitude = 1.0;
    let frequency = 1.0;
    let noiseValue = 0;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      noiseValue += this.simplex.noise3d(x * scale * frequency, y * scale * frequency, z * scale * frequency) * amplitude;

      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }

    noiseValue = noiseValue / maxValue;

    // Create a height-based falloff that's more dramatic
    const heightFalloff = Math.max(0, 1 - Math.pow(y / baseHeight, 1.5));
    return (noiseValue * 0.5 + 0.5) * heightFalloff;
  }

  private getCubeVertices(x: number, y: number, z: number): THREE.Vector3[] {
    // Standard marching cubes vertex order
    return [
      new THREE.Vector3(x, y, z), // 0
      new THREE.Vector3(x + 1, y, z), // 1
      new THREE.Vector3(x + 1, y + 1, z), // 2
      new THREE.Vector3(x, y + 1, z), // 3
      new THREE.Vector3(x, y, z + 1), // 4
      new THREE.Vector3(x + 1, y, z + 1), // 5
      new THREE.Vector3(x + 1, y + 1, z + 1), // 6
      new THREE.Vector3(x, y + 1, z + 1), // 7
    ].map((v) => v.multiplyScalar(this.cubeSize));
  }

  private getCubeValues(x: number, y: number, z: number, scalarField: number[][][]): number[] {
    // Match vertex order with getCubeVertices
    return [
      scalarField[x][y][z], // 0
      scalarField[x + 1][y][z], // 1
      scalarField[x + 1][y + 1][z], // 2
      scalarField[x][y + 1][z], // 3
      scalarField[x][y][z + 1], // 4
      scalarField[x + 1][y][z + 1], // 5
      scalarField[x + 1][y + 1][z + 1], // 6
      scalarField[x][y + 1][z + 1], // 7
    ];
  }

  private interpolateVertex(v1: THREE.Vector3, v2: THREE.Vector3, val1: number, val2: number): THREE.Vector3 {
    const denominator = val2 - val1;
    const t = denominator !== 0 ? (this.isoLevel - val1) / denominator : 0;
    return new THREE.Vector3(v1.x + t * (v2.x - v1.x), v1.y + t * (v2.y - v1.y), v1.z + t * (v2.z - v1.z));
  }

  private setupEventListeners(): void {
    window.addEventListener("click", (event) => this.onMouseClick(event));
    window.addEventListener("resize", () => this.onWindowResize());
  }

  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private onMouseClick(event: MouseEvent): void {
    const mouse = new THREE.Vector2((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);

    const meshes = Array.from(this.chunks.values()).map((chunk) => chunk.mesh);
    this.raycaster.setFromCamera(mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(meshes);

    if (intersects.length > 0) {
      const point = intersects[0].point;
      this.sculptTerrain(point);
    }
  }

  private sculptTerrain(point: THREE.Vector3): void {
    const radius = 2;
    const strength = 0.3;

    const chunkX = Math.floor(point.x / ((this.gridSize - 1) * this.cubeSize));
    const chunkZ = Math.floor(point.z / ((this.gridSize - 1) * this.cubeSize));
    const key = this.getChunkKey(chunkX, chunkZ);
    const chunk = this.chunks.get(key);

    if (!chunk) return;

    const localX = point.x - chunk.position.x;
    const localY = point.y - chunk.position.y;
    const localZ = point.z - chunk.position.z;

    const gridX = Math.floor(localX / this.cubeSize);
    const gridY = Math.floor(localY / this.cubeSize);
    const gridZ = Math.floor(localZ / this.cubeSize);

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const px = gridX + dx;
          const py = gridY + dy;
          const pz = gridZ + dz;

          if (px < 0 || px >= this.gridSize || py < 0 || py >= this.gridSize || pz < 0 || pz >= this.gridSize) continue;

          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (distance > radius) continue;

          const influence = 1 - distance / radius;
          chunk.scalarField[px][py][pz] += strength * influence;
        }
      }
    }

    const newGeometry = this.generateChunkGeometry(chunk.scalarField);
    chunk.mesh.geometry.dispose();
    chunk.mesh.geometry = newGeometry;
  }

  public animate(): void {
    requestAnimationFrame(this.animate.bind(this));
    const cameraPosition = this.camera.position;
    const newCenter = this.getChunkCoordinates(cameraPosition);

    if (!newCenter.equals(this.currentCenterChunk)) {
      this.currentCenterChunk.copy(newCenter);
      this.updateChunks(newCenter.x, newCenter.y);
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
