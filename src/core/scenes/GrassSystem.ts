import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader";

export class GrassSystem {
  private grassMeshes: THREE.InstancedMesh[] = [];

  private readonly INSTANCES_PER_TYPE = 10000;
  private dummy = new THREE.Object3D();
  private grassPositions: THREE.Vector3[] = [];
  private grassTypes = ["assets/models/nature/Grass.fbx", "assets/models/nature/Grass_2.fbx", "assets/models/nature/Grass_Short.fbx"];
  private loader: FBXLoader;
  constructor(private scene: THREE.Scene) {
    this.loader = new FBXLoader();
    this.createDebugGrass();
    // this.loadGrassModels(); // Temporarily disable FBX loading
  }

  private createDebugGrass() {
    // Create a simple grass blade geometry
    this.loader.load(`${this.grassTypes[1]}`, (object) => {
      let geometry: THREE.BufferGeometry | undefined = undefined;
      object.traverse((child) => {
        if (child instanceof THREE.Mesh && !geometry) {
          geometry = child.geometry;
        }
      });

      if (!geometry) return;
      console.log("doing it");
      const material = new THREE.MeshStandardMaterial({
        color: 0x3b7a32,
        side: THREE.DoubleSide,
        alphaTest: 0.5,
        metalness: 0,
        roughness: 1,
      });
      console.log(geometry);

      // Create one instanced mesh for testing
      const instancedMesh = new THREE.InstancedMesh(geometry, material, this.INSTANCES_PER_TYPE);
      instancedMesh.scale.setScalar(10);
      instancedMesh.frustumCulled = true;
      instancedMesh.castShadow = true;
      instancedMesh.receiveShadow = true;

      this.grassMeshes[0] = instancedMesh;
      this.scene.add(instancedMesh);
    });
  }

  public updateInstances(vertices: Float32Array, colors: Float32Array, planetRadius: number, waterLevel: number) {
    console.log("Updating grass instances...");
    this.grassPositions = [];
    const vertexCount = vertices.length / 3;

    // Sample every Nth vertex for better distribution
    const samplingRate = 10;
    for (let i = 0; i < vertexCount; i += samplingRate) {
      const pos = new THREE.Vector3(vertices[i * 3], vertices[i * 3 + 1], vertices[i * 3 + 2]);

      const height = pos.length();
      if (height > planetRadius * waterLevel) {
        const vertexColor = new THREE.Color(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]);

        if (this.isGrassColor(vertexColor)) {
          this.grassPositions.push(pos);
        }
      }
    }

    console.log(`Found ${this.grassPositions.length} potential grass positions`);
    this.initializeInstances();
  }

  private manhattanDistanceTo(color1: THREE.Color, color2: THREE.Color): number {
    return Math.abs(color1.r - color2.r) + Math.abs(color1.g - color2.g) + Math.abs(color1.b - color2.b);
  }

  private isGrassColor(color: THREE.Color): boolean {
    const grassColor = new THREE.Color(0x339933);
    const threshold = 0.3; // Increased threshold
    return this.manhattanDistanceTo(grassColor, color) < threshold;
  }

  private initializeInstances() {
    if (this.grassPositions.length === 0) {
      console.warn("No grass positions found!");
      return;
    }

    this.grassMeshes.forEach((instancedMesh, typeIndex) => {
      if (!instancedMesh) return;

      const positionsPerMesh = Math.min(this.INSTANCES_PER_TYPE, Math.floor(this.grassPositions.length));

      console.log(`Initializing ${positionsPerMesh} grass instances for type ${typeIndex}`);
      instancedMesh.count = positionsPerMesh;

      for (let i = 0; i < positionsPerMesh; i++) {
        const position = this.grassPositions[i % this.grassPositions.length];

        // Orient grass along surface normal
        this.dummy.position.copy(position);
        // this.dummy.lookAt(new THREE.Vector3(0, 0, 0));
        // this.dummy.rotateX(Math.PI / 2);

        // Random rotation and scale
        this.dummy.rotateY(Math.random() * Math.PI * 2);
        const scale = 10.5 + Math.random() * 0.5; // Increased scale for visibility
        this.dummy.scale.set(scale, scale, scale);

        this.dummy.updateMatrix();
        instancedMesh.setMatrixAt(i, this.dummy.matrix);
      }

      instancedMesh.instanceMatrix.needsUpdate = true;
    });
  }
}
