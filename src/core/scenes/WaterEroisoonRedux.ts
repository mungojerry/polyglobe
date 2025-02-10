import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise";
import { MarchingCubes } from "three/examples/jsm/objects/MarchingCubes.js";
import { pseudoRandom } from "../utils/PseudoRandom";

export class ProceduralTerrainRedux {
  scene!: THREE.Scene;
  camera!: THREE.PerspectiveCamera;
  renderer!: THREE.WebGLRenderer;
  controls!: OrbitControls;
  light!: THREE.DirectionalLight;
  terrain!: THREE.Mesh;
  geometry!: THREE.PlaneGeometry;
  vertices!: Float32Array;
  noise!: SimplexNoise;
  material!: THREE.MeshStandardMaterial;

  colors!: Float32Array;
  size: number = 100;
  divisions: number = 200;

  private waterSystem!: THREE.Points;
  private waterGeometry!: THREE.BufferGeometry;
  private waterDroplets: {
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    water: number;
  }[] = [];
  private maxWaterDroplets: number = 10000;
  private waterEvaporationRate: number = 0.0001; // Water loss
  private waterLevels: number[][] = [];
  private gridSize: number = 200; // Match with divisions
  private waterMesh!: MarchingCubes;
  private settledDroplets: { position: THREE.Vector3; radius: number }[] = [];

  constructor() {
    this.initScene();
    this.createTerrain();
    this.initWaterGrid();
    this.initWaterSystem();
    this.setupEventListeners();
    this.animate();
  }

  private addWaterAtPoint(x: number, z: number) {
    if (this.waterDroplets.length >= this.maxWaterDroplets) {
      this.waterDroplets.shift();
    }

    this.waterDroplets.push({
      position: new THREE.Vector3(x, 30, z),
      velocity: new THREE.Vector3(0, -1, 0),
      water: 1.0, // Full water volume
    });
  }

  private initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 50, 100);

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

    const ambientLight = new THREE.AmbientLight(0x404040);
    this.scene.add(ambientLight);

    const hemisphereLight = new THREE.HemisphereLight(0xffffbb, 0x080820, 0.5);
    this.scene.add(hemisphereLight);
  }

  private createTerrain() {
    this.geometry = new THREE.PlaneGeometry(this.size, this.size, this.divisions + 1, this.divisions + 1);
    this.geometry.rotateX(-Math.PI / 2);

    pseudoRandom.setSeed(101010);
    this.noise = new SimplexNoise(pseudoRandom);
    this.vertices = this.geometry.attributes.position.array as Float32Array;
    const vertexCount = this.vertices.length / 3;
    this.colors = new Float32Array(vertexCount * 3);

    const warpStrength = 1.0;
    const jitterAmount = 0.5;
    const randomOffsetX = Math.random() * 1000;
    const randomOffsetZ = Math.random() * 1000;

    for (let i = 0; i < this.vertices.length; i += 3) {
      let x = this.vertices[i];
      let y = this.vertices[i + 1];
      let z = this.vertices[i + 2];

      x += (Math.random() - 0.5) * jitterAmount;
      z += (Math.random() - 0.5) * jitterAmount;

      const warpX = this.noise.noise3d(x * 0.2, y * 0.2, z * 0.2) * warpStrength;
      const warpZ = this.noise.noise3d(x * 0.2 + 1000, y * 0.2, z * 0.2) * warpStrength;
      const warpedX = x + warpX;
      const warpedZ = z + warpZ;

      let height = 0;
      let amplitude = 1;
      let frequency = 0.01;

      for (let o = 0; o < 5; o++) {
        const noiseValue = this.noise.noise3d(
          warpedX * frequency + o * 500 + randomOffsetX,
          y * frequency + o * 250,
          warpedZ * frequency + o * 750 + randomOffsetZ
        );
        height += noiseValue * amplitude;
        amplitude *= 0.55;
        frequency *= 2;
      }

      const mountainNoise = this.noise.noise3d(warpedX * 0.05, y * 0.05, warpedZ * 0.05) * 4;
      height += Math.max(0, mountainNoise) * 2.5;

      height += this.noise.noise3d(warpedX * 0.2, y * 0.2, warpedZ * 0.2) * 1.0;

      this.vertices[i + 1] = height;
      this.updateTerrainColor(i, height);
    }

    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.vertices, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
    this.geometry.computeVertexNormals();

    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.8,
      metalness: 0.2,
    });

    this.terrain = new THREE.Mesh(this.geometry, this.material);
    this.terrain.castShadow = true;
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
  }

  private updateTerrainColor(index: number, height: number) {
    const normalizedHeight = (height + 4) / 12;

    const WATER = [0.0, 0.3, 0.6];
    const BEACH = [0.96, 0.87, 0.7];
    const GRASS = [0.27, 0.75, 0.35];
    const FOREST = [0.13, 0.55, 0.13];
    const ROCK = [0.5, 0.45, 0.35];
    const SNOW = [1.0, 1.0, 1.0];

    let color: number[] = WATER;

    if (normalizedHeight < 0.1) {
      color = WATER;
    } else if (normalizedHeight < 0.25) {
      const t = (normalizedHeight - 0.1) / (0.25 - 0.1);
      color = this.lerpColor(WATER, BEACH, t);
    } else if (normalizedHeight < 0.45) {
      const t = (normalizedHeight - 0.25) / (0.45 - 0.25);
      color = this.lerpColor(BEACH, GRASS, t);
    } else if (normalizedHeight < 0.6) {
      const t = (normalizedHeight - 0.45) / (0.6 - 0.45);
      color = this.lerpColor(GRASS, FOREST, t);
    } else if (normalizedHeight < 0.8) {
      const t = (normalizedHeight - 0.6) / (0.8 - 0.6);
      color = this.lerpColor(FOREST, ROCK, t);
    } else {
      const t = Math.min((normalizedHeight - 0.8) / 0.2, 1);
      color = this.lerpColor(ROCK, SNOW, t);
    }

    if (this.colors) {
      this.colors[index] = color[0];
      this.colors[index + 1] = color[1];
      this.colors[index + 2] = color[2];
    }
  }

  private lerpColor(a: number[], b: number[], t: number): number[] {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  private setupEventListeners() {
    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    this.renderer.domElement.addEventListener("mousedown", (event) => {
      const mouse = new THREE.Vector2((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1);

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, this.camera);

      const intersects = raycaster.intersectObject(this.terrain);

      if (intersects.length > 0) {
        const point = intersects[0].point;

        // Create multiple water droplets
        for (let i = 0; i < 10; i++) {
          const offsetX = (Math.random() - 0.5) * 2;
          const offsetZ = (Math.random() - 0.5) * 2;
          this.addWaterAtPoint(point.x + offsetX, point.z + offsetZ);
        }
      }
    });
  }

  private initWaterGrid() {
    // Initialize water level grid
    this.waterLevels = Array(this.gridSize)
      .fill(0)
      .map(() => Array(this.gridSize).fill(0));
  }

  private initWaterSystem() {
    // Create marching cubes mesh for water surface
    const resolution = 64;
    this.waterMesh = new MarchingCubes(
      resolution,
      new THREE.MeshPhongMaterial({
        color: 0x0055ff,
        transparent: true,
        opacity: 0.6,
        shininess: 80,
      }),
      true,
      true
    );

    this.waterMesh.position.set(0, 0, 0);
    this.waterMesh.scale.set(this.size, this.size / 2, this.size);
    this.waterMesh.isolation = 1.0;

    this.scene.add(this.waterMesh);

    // Create particle system for active droplets
    this.waterGeometry = new THREE.BufferGeometry();
    const waterMaterial = new THREE.PointsMaterial({
      color: 0x0066ff,
      size: 0.3,
      transparent: true,
      opacity: 0.5,
    });

    this.waterSystem = new THREE.Points(this.waterGeometry, waterMaterial);
    this.scene.add(this.waterSystem);
  }

  private updateWaterSystem() {
    const positions: number[] = [];

    this.waterDroplets.forEach((droplet) => {
      let { x, y, z } = droplet.position;
      const groundHeight = this.getTerrainHeightAtPoint(x, z);

      if (y > groundHeight) {
        droplet.velocity.y -= 0.01;
        y += droplet.velocity.y;
      } else {
        const offsets = [
          { dx: 0.5, dz: 0 },
          { dx: -0.5, dz: 0 },
          { dx: 0, dz: 0.5 },
          { dx: 0, dz: -0.5 },
        ];

        let lowestPoint = { height: groundHeight, dx: 0, dz: 0 };
        offsets.forEach(({ dx, dz }) => {
          const neighborHeight = this.getTerrainHeightAtPoint(x + dx, z + dz);
          if (neighborHeight < lowestPoint.height) {
            lowestPoint = { height: neighborHeight, dx, dz };
          }
        });

        // Check if droplet should settle
        const isMovingSlow = Math.abs(droplet.velocity.x) < 0.01 && Math.abs(droplet.velocity.z) < 0.01;
        const isAtMinimum = lowestPoint.height >= groundHeight - 0.01;

        if (isMovingSlow && isAtMinimum) {
          // Convert to settled droplet
          this.settledDroplets.push({
            position: new THREE.Vector3(x, groundHeight + 0.1, z),
            radius: 0.5 + Math.random() * 0.5,
          });
          droplet.water = 0;
        } else {
          const slope = groundHeight - lowestPoint.height;
          droplet.velocity.x = THREE.MathUtils.lerp(droplet.velocity.x, lowestPoint.dx * slope, 0.3);
          droplet.velocity.z = THREE.MathUtils.lerp(droplet.velocity.z, lowestPoint.dz * slope, 0.3);
        }

        x += droplet.velocity.x;
        z += droplet.velocity.z;
        y = Math.max(y, groundHeight + 0.1);

        droplet.velocity.x *= 0.98;
        droplet.velocity.z *= 0.98;
      }

      droplet.position.set(x, y, z);
      if (droplet.water > 0) {
        positions.push(x, y, z);
      }
    });

    // Update active droplets
    this.waterDroplets = this.waterDroplets.filter((d) => d.water > 0);
    this.waterGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.waterGeometry.attributes.position.needsUpdate = true;

    // Update water surface
    this.waterMesh.reset();
    this.settledDroplets.forEach((droplet) => {
      const { x, y, z } = droplet.position;
      // Convert world position to marching cubes grid space
      const gridX = ((x + this.size / 2) / this.size) * this.waterMesh.resolution;
      const gridY = (y / (this.size / 2)) * this.waterMesh.resolution;
      const gridZ = ((z + this.size / 2) / this.size) * this.waterMesh.resolution;

      // Add metaball influence
      this.waterMesh.addBall(gridX, gridY, gridZ, droplet.radius * 3, 0.5);
    });
  }

  private spreadWater(gridX: number, gridZ: number) {
    const currentHeight = this.getTerrainHeightAtPoint(
      (gridX / (this.gridSize - 1)) * this.size - this.size / 2,
      (gridZ / (this.gridSize - 1)) * this.size - this.size / 2
    );
    const currentWaterLevel = this.waterLevels[gridX][gridZ];
    const totalHeight = currentHeight + currentWaterLevel;

    const neighbors = [
      { dx: -1, dz: 0 },
      { dx: 1, dz: 0 },
      { dx: 0, dz: -1 },
      { dx: 0, dz: 1 },
    ];

    neighbors.forEach(({ dx, dz }) => {
      const newX = gridX + dx;
      const newZ = gridZ + dz;

      if (newX >= 0 && newX < this.gridSize && newZ >= 0 && newZ < this.gridSize) {
        const neighborHeight = this.getTerrainHeightAtPoint(
          (newX / this.gridSize) * this.size - this.size / 2,
          (newZ / this.gridSize) * this.size - this.size / 2
        );
        const neighborWaterLevel = this.waterLevels[newX][newZ];
        const neighborTotal = neighborHeight + neighborWaterLevel;

        if (totalHeight > neighborTotal) {
          // Transfer water to lower neighbor
          const transfer = Math.min((totalHeight - neighborTotal) * 0.5, currentWaterLevel);
          this.waterLevels[gridX][gridZ] -= transfer;
          this.waterLevels[newX][newZ] += transfer;
        }
      }
    });
  }

  private getTerrainHeightAtPoint(x: number, z: number): number {
    const warpStrength = 1.0;
    const fixedOffsetX = 101010; // Fixed offset to stabilize height evaluation
    const fixedOffsetZ = 202020; // Fixed offset to stabilize height evaluation

    const warpX = this.noise.noise3d(x * 0.2, 0, z * 0.2) * warpStrength;
    const warpZ = this.noise.noise3d(x * 0.2 + 1000, 0, z * 0.2) * warpStrength;
    const warpedX = x + warpX;
    const warpedZ = z + warpZ;

    let height = 0;
    let amplitude = 1;
    let frequency = 0.01;

    for (let o = 0; o < 5; o++) {
      const noiseValue = this.noise.noise3d(
        warpedX * frequency + o * 500 + fixedOffsetX,
        0 * frequency + o * 250,
        warpedZ * frequency + o * 750 + fixedOffsetZ
      );
      height += noiseValue * amplitude;
      amplitude *= 0.55;
      frequency *= 2;
    }

    const mountainNoise = this.noise.noise3d(warpedX * 0.05, 0, warpedZ * 0.05) * 4;
    height += Math.max(0, mountainNoise) * 2.5;
    height += this.noise.noise3d(warpedX * 0.2, 0, warpedZ * 0.2) * 1.0;

    return height;
  }

  animate() {
    requestAnimationFrame(this.animate.bind(this));

    this.updateWaterSystem();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {}
}
