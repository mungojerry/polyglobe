import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise";
import { PseudoRandomNumberGenerator } from "../utils/PseudoRandom";
import { edgeTable, triTable } from "./MCDefs";

function visualizeScalarFieldSlice(field: number[][][], yIndex: number): void {
  // Create a canvas that's as big as the X-Z plane of the scalar field
  const width = field.length;
  const height = field[0][0]?.length || 0;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.style.position = "absolute";
  canvas.style.top = "0";
  canvas.style.left = "0";
  canvas.style.zIndex = "100";
  canvas.style.width = "256px";
  canvas.style.height = "256px";

  canvas.style.border = "1px solid black ";
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    console.error("Could not get canvas context.");
    return;
  }

  // Create an image data object to manipulate pixel values
  const imageData = ctx.createImageData(width, height);

  // Loop over the X-Z plane at the specified y-index
  for (let x = 0; x < width; x++) {
    for (let z = 0; z < height; z++) {
      // Clamp yIndex within bounds
      const y = Math.min(Math.max(yIndex, 0), field[x].length - 1);
      let value = field[x][y][z];
      // Normalize value to [0, 255] for grayscale (adjust normalization as needed)
      const grayscale = Math.floor(255 * Math.min(1, Math.max(0, value)));

      const index = (x + z * width) * 4;
      imageData.data[index] = grayscale; // red
      imageData.data[index + 1] = grayscale; // green
      imageData.data[index + 2] = grayscale; // blue
      imageData.data[index + 3] = 255; // alpha
    }
  }

  ctx.putImageData(imageData, 0, 0);
}
const EPSILON = 0.00000001; //1e-5 / 10;

type Biome = {
  name: string;
  color: THREE.Color;
  temperatureRange: [number, number];
  humidityRange: [number, number];
  terrainScale: number;
  terrainHeight: number;
};
const BIOMES: Biome[] = [
  {
    name: "plains",
    color: new THREE.Color(0x91b165), // Softer, more natural green
    temperatureRange: [0.3, 0.6],
    humidityRange: [0.4, 0.7],
    terrainScale: 0.03,
    terrainHeight: 16,
  },
  {
    name: "desert",
    color: new THREE.Color(0xd6c087), // Warmer, sandy color
    temperatureRange: [0.7, 1.0],
    humidityRange: [0.0, 0.3],
    terrainScale: 0.02,
    terrainHeight: 12,
  },
  {
    name: "mountain",
    color: new THREE.Color(0x9b928a), // Warmer grey for rocks
    temperatureRange: [0.0, 0.3],
    humidityRange: [0.0, 0.4],
    terrainScale: 0.04,
    terrainHeight: 28,
  },
  {
    name: "forest",
    color: new THREE.Color(0x4a6b3d), // Rich forest green
    temperatureRange: [0.4, 0.7],
    humidityRange: [0.6, 1.0],
    terrainScale: 0.04,
    terrainHeight: 18,
  },
];

const DEFAULT_BIOME: Biome = BIOMES[0];

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
  private gridSize = 37; // Changed from 32 to ensure overlap
  private cubeSize = 1;
  private isoLevel = 0.5; // Changed from 0.4 for better surface generation
  private raycaster = new THREE.Raycaster();
  private temperatureNoise: SimplexNoise;
  private humidityNoise: SimplexNoise;

  private chunks: Map<string, TerrainChunk> = new Map();
  private viewDistance = 5; // Number of chunks visible in each direction
  private currentCenterChunk: THREE.Vector2 = new THREE.Vector2();

  constructor() {
    console.log(edgeTable);
    console.log(triTable);

    // Check some known cases
    console.log("Case 1:", triTable[1]); // Should have valid indices and end with -1
    console.log("Case 3:", triTable[3]);
    console.log("Case 255:", triTable[255]); // Should be empty case (all vertices inside)
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 32, 64);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    document.body.appendChild(this.renderer.domElement);

    // this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    // this.controls.enableDamping = true;
    // this.controls.dampingFactor = 0.05;

    this.light = new THREE.DirectionalLight(0xffffff, 1);
    this.light.position.set(50, 100, 50);
    this.light.castShadow = true;
    this.scene.add(this.light);

    const ambientLight = new THREE.AmbientLight(0x404040, 0.3);
    this.scene.add(ambientLight);

    const hemisphereLight = new THREE.HemisphereLight(0xffffbb, 0x080820, 0.5);
    this.scene.add(hemisphereLight);

    this.material = new THREE.MeshPhongMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      flatShading: true,
      wireframe: true,
      color: 0xffffff,
    });

    const groundGeometry = new THREE.PlaneGeometry(1000, 1000);
    const groundMaterial = new THREE.MeshBasicMaterial({
      color: 0xff00ff,
      side: THREE.DoubleSide,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = Math.PI / 2;
    ground.position.y = -10;
    this.scene.add(ground);
    this.setupEventListeners();
    this.simplex = new SimplexNoise(new PseudoRandomNumberGenerator(2343));
    this.temperatureNoise = new SimplexNoise(new PseudoRandomNumberGenerator(234443));
    this.humidityNoise = new SimplexNoise(new PseudoRandomNumberGenerator(234245));
    this.currentCenterChunk = this.getChunkCoordinates(this.camera.position);
    this.updateChunks(this.currentCenterChunk.x, this.currentCenterChunk.y);

    this.animate();
  }

  private getChunkCoordinates(position: THREE.Vector3): THREE.Vector2 {
    const chunkX = Math.floor(position.x / ((this.gridSize - 2) * this.cubeSize));
    const chunkZ = Math.floor(position.z / ((this.gridSize - 2) * this.cubeSize));
    return new THREE.Vector2(chunkX, chunkZ);
  }

  private getChunkKey(x: number, z: number): string {
    return `${x},${z}`;
  }

  private updateChunks(cameraChunkX: number, cameraChunkZ: number): void {
    // Remove out-of-range chunks
    for (const [_, chunk] of this.chunks) {
      const { x, z } = chunk.position;
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
      // Remove both the mesh and its grid helper
      const children = this.scene.children.filter((child) => child.position.equals(chunk.mesh.position) && child instanceof THREE.LineSegments);
      children.forEach((child) => {
        this.scene.remove(child);
        if (child instanceof THREE.LineSegments) {
          child.geometry.dispose();
          child.material.dispose();
        }
      });

      this.scene.remove(chunk.mesh);
      chunk.mesh.geometry.dispose();
      this.chunks.delete(key);
    }
  }

  private createChunk(chunkX: number, chunkZ: number): TerrainChunk {
    // Ensure consistent positioning across chunk boundaries
    const chunkSize = (this.gridSize - 2) * this.cubeSize;
    const position = new THREE.Vector3(chunkX * chunkSize, 0, chunkZ * chunkSize);

    const scalarField = this.createScalarField(chunkX, chunkZ);
    visualizeScalarFieldSlice(scalarField, Math.floor(this.gridSize / 2)); // Visualize the slice at the middle y-index
    const geometry = this.generateChunkGeometry(scalarField, position);

    // Add validation for degenerate geometry
    if (geometry.attributes.position.count === 0) {
      console.warn(`Empty geometry generated at chunk ${chunkX},${chunkZ}`);
      // Generate a small placeholder geometry to avoid rendering issues
      return this.createPlaceholderChunk(position);
    }

    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.position.copy(position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;

    const chunk: TerrainChunk = { mesh, position, scalarField };
    this.chunks.set(this.getChunkKey(chunkX, chunkZ), chunk);
    this.scene.add(mesh);

    // Add grid visualization
    const gridHelper = this.createGridVisualizer(position);
    this.scene.add(gridHelper);

    return chunk;
  }

  private createGridVisualizer(position: THREE.Vector3): THREE.LineSegments {
    const size = this.gridSize * this.cubeSize;
    const geometry = new THREE.BoxGeometry(size, size, size);
    // Convert BoxGeometry to wireframe
    const edges = new THREE.EdgesGeometry(geometry);
    const material = new THREE.LineBasicMaterial({
      color: 0xff0000, // Red color for visibility
      linewidth: 1,
    });
    const box = new THREE.LineSegments(edges, material);

    // Adjust position to align with chunk
    box.position.copy(position);
    // Center the box on the chunk
    box.position.x += size / 2;
    box.position.y += size / 2;
    box.position.z += size / 2;

    return box;
  }

  private createPlaceholderChunk(position: THREE.Vector3): TerrainChunk {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0.5, 0.5, 0.5);
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.position.copy(position);
    mesh.visible = false; // Hide placeholder geometry

    // Create empty scalar field
    const scalarField: number[][][] = Array(this.gridSize)
      .fill(0)
      .map(() =>
        Array(this.gridSize)
          .fill(0)
          .map(() => Array(this.gridSize).fill(1))
      );

    return { mesh, position, scalarField };
  }

  private createScalarField(chunkX: number, chunkZ: number): number[][][] {
    const field: number[][][] = [];
    const overlap = 1;
    const offsetX = chunkX * (this.gridSize - 1 - overlap);
    const offsetZ = chunkZ * (this.gridSize - 1 - overlap);

    for (let x = 0; x < this.gridSize; x++) {
      field[x] = [];
      for (let y = 0; y < this.gridSize; y++) {
        field[x][y] = [];
        for (let z = 0; z < this.gridSize; z++) {
          // Use EPSILON to ensure consistent sampling across chunk boundaries
          const worldX = x + offsetX + EPSILON;
          const worldY = y + EPSILON;
          const worldZ = z + offsetZ + EPSILON;

          let value = this.generateNoiseValue(worldX, worldY, worldZ);
          // Ensure value is never exactly equal to isoLevel
          if (Math.abs(value - this.isoLevel) < EPSILON) {
            value += EPSILON;
          }
          field[x][y][z] = value;
        }
      }
    }
    return field;
  }

  private generateChunkGeometry(scalarField: number[][][], chunkPosition: THREE.Vector3): THREE.BufferGeometry {
    // Arrays for unique vertex data
    const positions: number[] = [];
    const normalsAccum: THREE.Vector3[] = [];
    const colorsAccum: THREE.Color[] = [];
    const indices: number[] = [];

    // A map from vertex key (position rounded) to index
    const vertexMap: { [key: string]: number } = {};

    // Helper: get a unique key for a vertex based on position
    const getVertexKey = (v: THREE.Vector3): string => {
      const precision = 5; // adjust as needed
      return `${v.x.toFixed(precision)}_${v.y.toFixed(precision)}_${v.z.toFixed(precision)}`;
    };
    // Compute per-vertex colors
    const getColor = (vertex: THREE.Vector3): THREE.Color => {
      const worldX = chunkPosition.x + vertex.x;
      const worldZ = chunkPosition.z + vertex.z;
      const temperature = this.getTemperature(worldX, worldZ);
      const humidity = this.getHumidity(worldX, worldZ);
      return this.getBiomeColor(temperature, humidity, vertex.y);
    };

    const isValid = (v: THREE.Vector3) =>
      Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z) && !Number.isNaN(v.x) && !Number.isNaN(v.y) && !Number.isNaN(v.z);

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

    // We'll also accumulate face normals into vertex normals
    const addVertex = (v: THREE.Vector3, color: THREE.Color, faceNormal: THREE.Vector3): number => {
      const key = getVertexKey(v);
      if (vertexMap.hasOwnProperty(key)) {
        const idx = vertexMap[key];
        // Accumulate face normal
        normalsAccum[idx].add(faceNormal);
        return idx;
      } else {
        const idx = positions.length / 3;
        positions.push(v.x, v.y, v.z);
        normalsAccum.push(faceNormal.clone());
        colorsAccum.push(color.clone());
        vertexMap[key] = idx;
        return idx;
      }
    };

    // Iterate cubes in scalar field
    for (let x = 0; x < this.gridSize - 1; x++) {
      for (let y = 0; y < this.gridSize - 1; y++) {
        for (let z = 0; z < this.gridSize - 1; z++) {
          const corners = this.getCubeCorners(x, y, z);
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

          if (Number(edgeTable[cubeIndex]) === 0) continue;
          const triangles = triTable[cubeIndex];
          if (!triangles || triangles.length === 0) continue;

          for (let i = 0; i < triangles.length - 1; i += 3) {
            // Compute vertices
            const triangleVertices = [triangles[i], triangles[i + 1], triangles[i + 2]].map((edgeIndex) => {
              const [v1Index, v2Index] = edgeToVertex[edgeIndex];
              return this.interpolateVertex(corners[v1Index], corners[v2Index], values[v1Index], values[v2Index]);
            });
            let [v1, v2, v3] = triangleVertices;

            if (v1.equals(v2) || v2.equals(v3) || v3.equals(v1)) {
              // con//sole.warn("Skipping degenerate triangle due to identical vertices.");
              continue;
            }

            if (!isValid(v1) || !isValid(v2) || !isValid(v3)) continue;

            // Compute face normal (flat)
            const edge1 = new THREE.Vector3().subVectors(v2, v1);
            const edge2 = new THREE.Vector3().subVectors(v3, v1);
            const faceNormal = new THREE.Vector3().crossVectors(edge1, edge2);
            if (faceNormal.lengthSq() < EPSILON) {
              //  console.warn("Skipping degenerate triangle");
              //   console.log(`Cube Index: ${cubeIndex}, Triangle Indices: [${triangles[i]}, ${triangles[i + 1]}, ${triangles[i + 2]}]`);
              continue;
            }

            faceNormal.normalize();

            const c1 = getColor(v1);
            const c2 = getColor(v2);
            const c3 = getColor(v3);

            // Add (or reuse) vertices and record triangle indices
            const idx1 = addVertex(v1, c1, faceNormal);
            const idx2 = addVertex(v2, c2, faceNormal);
            const idx3 = addVertex(v3, c3, faceNormal);
            indices.push(idx1, idx2, idx3);
          }
        }
      }
    }

    // Normalize accumulated normals
    const normals: number[] = [];
    normalsAccum.forEach((vec) => {
      if (vec.lengthSq() < EPSILON) {
        vec.set(0, 1, 0); // Default upward normal if zero-length
      } else {
        vec.normalize();
      }
      normals.push(vec.x, vec.y, vec.z);
    });

    // Prepare color array
    const colors: number[] = [];
    colorsAccum.forEach((c) => {
      colors.push(c.r, c.g, c.b);
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(indices);
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
  }

  private generateNoiseValue(x: number, y: number, z: number): number {
    const temperature = this.getTemperature(x, z);
    const humidity = this.getHumidity(x, z);
    const biome = this.getBiome(temperature, humidity);

    const scale = biome.terrainScale;
    const baseHeight = biome.terrainHeight;
    const persistence = 0.6; // Increased from 0.5 for more variation
    const octaves = 7; // Increased from 6 for more detail

    // Add a small offset for consistency
    const eps = 0.00001;
    x += eps;
    y += eps;
    z += eps;

    let noiseValue = this.generateRidgedNoise(x, y, z, scale, octaves, persistence);

    // Add turbulence for more interesting mountain shapes
    const turbulence = Math.abs(this.simplex.noise3d(x * 0.1, y * 0.1, z * 0.1));
    noiseValue = noiseValue * (1 + turbulence * 0.5);

    // return (noiseValue * 0.5 + 0.5) * heightFallo

    // Enhance mountain peaks with a power function if using mountain biome
    if (biome.name === "mountain") {
      noiseValue = Math.pow(noiseValue, 0.8);
    }

    // Create a height-based falloff that's more dramatic for mountains
    const heightFalloff =
      biome.name === "mountain"
        ? Math.max(0, 1 - Math.pow(y / baseHeight, 1.2)) // Less falloff for mountains
        : Math.max(0, 1 - Math.pow(y / baseHeight, 1.5));
    const STABILIZATION_EPSILON = 0.01;
    if (Math.abs(noiseValue - this.isoLevel) < STABILIZATION_EPSILON) {
      noiseValue = this.isoLevel + (noiseValue > this.isoLevel ? STABILIZATION_EPSILON : -STABILIZATION_EPSILON);
    }

    return (noiseValue * 0.5 + 0.5) * heightFalloff;
  }

  // Helper: Create and scale the 8 corners of a cube at grid coordinates (x,y,z)
  private getCubeCorners(x: number, y: number, z: number): THREE.Vector3[] {
    const corners = [
      new THREE.Vector3(x, y, z),
      new THREE.Vector3(x + 1, y, z),
      new THREE.Vector3(x, y, z + 1),
      new THREE.Vector3(x + 1, y, z + 1),
      new THREE.Vector3(x, y + 1, z),
      new THREE.Vector3(x + 1, y + 1, z),
      new THREE.Vector3(x, y + 1, z + 1),
      new THREE.Vector3(x + 1, y + 1, z + 1),
    ];
    return corners.map((v) => v.multiplyScalar(this.cubeSize));
  }

  // Helper: Compute ridged multifractal noise over multiple octaves.
  private generateRidgedNoise(x: number, y: number, z: number, scale: number, octaves: number, persistence: number): number {
    let amplitude = 1.0;
    let frequency = 1.0;
    let noiseValue = 0;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      const n = Math.abs(this.simplex.noise3d(x * scale * frequency, y * scale * frequency, z * scale * frequency));
      // Invert noise for a ridged effect
      noiseValue += (1.0 - n) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2; // Slightly higher frequency multiplier
    }

    return noiseValue / maxValue;
  }

  private getTemperature(x: number, z: number): number {
    const scale = 0.02; // Reduced scale for smoother transitions
    return (this.temperatureNoise.noise3d(x * scale, 0, z * scale) + 1) * 0.5;
  }

  private getHumidity(x: number, z: number): number {
    const scale = 0.015; // Even smoother humidity transitions
    return (this.humidityNoise.noise3d(x * scale, 0, z * scale) + 1) * 0.5;
  }

  private getBiome(temperature: number, humidity: number): Biome {
    for (const biome of BIOMES) {
      if (
        temperature >= biome.temperatureRange[0] &&
        temperature <= biome.temperatureRange[1] &&
        humidity >= biome.humidityRange[0] &&
        humidity <= biome.humidityRange[1]
      ) {
        return biome;
      }
    }
    return DEFAULT_BIOME;
  }

  private getBiomeColor(temperature: number, humidity: number, height: number): THREE.Color {
    // Calculate biome influence factors for smoother transitions
    let totalWeight = 0;
    const biomeWeights = BIOMES.map((b) => {
      const tCenter = (b.temperatureRange[0] + b.temperatureRange[1]) / 2;
      const hCenter = (b.humidityRange[0] + b.humidityRange[1]) / 2;

      // Calculate distance from current point to biome center
      const tDist = 1 - Math.min(1, Math.abs(temperature - tCenter) / 0.3);
      const hDist = 1 - Math.min(1, Math.abs(humidity - hCenter) / 0.3);

      // Combined weight with smooth falloff
      const weight = Math.max(0.0001, Math.pow(tDist * hDist, 2)); // Ensure weight is never zero
      totalWeight += weight;
      return { biome: b, weight };
    });

    // Blend colors based on weights
    const blendedColor = new THREE.Color(0, 0, 0);
    biomeWeights.forEach(({ biome: b, weight }) => {
      const normalizedWeight = weight / totalWeight;
      const biomeColor = b.color.clone();
      blendedColor.add(biomeColor.multiplyScalar(normalizedWeight));
    });

    // Apply height-based shading and variations
    const heightFactor = Math.min(1, Math.max(0, height / 32)); // Clamp height factor between 0 and 1

    // Add slight color variations based on height
    if (heightFactor > 0.7) {
      // Mountain peaks
      blendedColor.lerp(new THREE.Color(0xc0c0c0), Math.min(1, (heightFactor - 0.7) / 0.3));
    } else if (heightFactor < 0.2) {
      // Lower areas
      blendedColor.lerp(new THREE.Color(0x385321), Math.min(1, 0.3 * (1 - heightFactor / 0.2)));
    }

    // Apply ambient occlusion effect for valleys with clamping
    const valleyDarkening = Math.min(1, Math.max(0.3, 0.7 + 0.3 * heightFactor));
    blendedColor.multiplyScalar(valleyDarkening);

    // Ensure color components stay in valid range
    blendedColor.r = Math.min(1, Math.max(0.01, blendedColor.r));
    blendedColor.g = Math.min(1, Math.max(0.01, blendedColor.g));
    blendedColor.b = Math.min(1, Math.max(0.01, blendedColor.b));

    return blendedColor;
  }

  private interpolateVertex(v1: THREE.Vector3, v2: THREE.Vector3, val1: number, val2: number): THREE.Vector3 {
    // Handle near-zero denominator
    if (Math.abs(val2 - val1) < EPSILON) {
      return v1.clone().add(v2).multiplyScalar(0.5);
    }

    let t = (this.isoLevel - val1) / (val2 - val1);
    t = Math.max(0, Math.min(1, t)); // Clamp to [0,1]

    // Use more precise interpolation
    return new THREE.Vector3(v1.x + t * (v2.x - v1.x), v1.y + t * (v2.y - v1.y), v1.z + t * (v2.z - v1.z));
  }
  private setupEventListeners(): void {
    window.addEventListener("mousedown", (event) => this.onMouseDown(event));
    window.addEventListener("mouseup", (event) => this.onMouseUp(event));
    window.addEventListener("mousemove", (event) => this.onMouseMove(event));
    window.addEventListener("resize", () => this.onWindowResize());
    window.addEventListener("keydown", (event) => this.onKeyDown(event));
  }
  private onKeyDown(event: KeyboardEvent): void {
    if (event.key === "w") {
      this.material.wireframe = !this.material.wireframe;
      this.material.needsUpdate = true;
    }
  }
  private onWindowResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private mouseDown = false;
  private onMouseDown(event: MouseEvent): void {
    this.mouseDown = true;
  }
  private onMouseUp(event: MouseEvent): void {
    this.mouseDown = false;
  }
  private onMouseMove(event: MouseEvent): void {
    if (this.mouseDown) {
      const mouse = new THREE.Vector2((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);

      const meshes = Array.from(this.chunks.values()).map((chunk) => chunk.mesh);
      this.raycaster.setFromCamera(mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(meshes);

      if (intersects.length > 0) {
        const point = intersects[0].point;
        this.sculptTerrain(point);
      }
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

    const newGeometry = this.generateChunkGeometry(chunk.scalarField, chunk.position);
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
    // if (!this.mouseDown) {
    //   this.controls.update();
    // }
    this.renderer.render(this.scene, this.camera);
  }
}
