import * as THREE from "three";
import { OrbitControls } from "three-stdlib";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise";
import { ModelLoader } from "../managers/ModelLoader";

type MaterialConfig = {
  type: "phong" | "basic";
  color: number;
  flatShading?: boolean;
  reflectivity?: number;
  shininess?: number;
  specular?: number;
  transparent?: boolean;
  opacity?: number;
};

class LowPolyPlanet {
  private noise: SimplexNoise;
  private radius: number;
  private scene: THREE.Scene;
  private modelLoader: ModelLoader;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private planet: THREE.Group;
  private clouds: THREE.Group;
  private sun!: THREE.Mesh;
  private controls: OrbitControls;

  constructor(radius = 10) {
    this.radius = radius;
    this.noise = new SimplexNoise();
    this.modelLoader = new ModelLoader(4000);

    this.scene = this.createScene();
    this.camera = this.createCamera();
    this.renderer = this.createRenderer();
    this.controls = this.createOrbitControls();

    this.planet = new THREE.Group();
    this.clouds = new THREE.Group();

    this.init().catch(console.error);
  }

  private createScene(): THREE.Scene {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a4a4a);
    return scene;
  }

  private createCamera(): THREE.PerspectiveCamera {
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(25, 15, 25);
    camera.lookAt(0, 0, 0);
    return camera;
  }

  private createRenderer(): THREE.WebGLRenderer {
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);
    return renderer;
  }

  private createOrbitControls(): OrbitControls {
    const controls = new OrbitControls(this.camera, this.renderer.domElement);
    controls.enableDamping = true;
    return controls;
  }

  private createMaterial(config: MaterialConfig): THREE.Material {
    const baseConfig = {
      color: config.color,
      flatShading: config.flatShading,
    };

    switch (config.type) {
      case "phong":
        return new THREE.MeshPhongMaterial({
          ...baseConfig,
          reflectivity: config.reflectivity,
          shininess: config.shininess,
          specular: config.specular,
        });
      case "basic":
        return new THREE.MeshBasicMaterial({
          ...baseConfig,
          transparent: config.transparent,
          opacity: config.opacity,
        });
      default:
        throw new Error(`Unsupported material type: ${config.type}`);
    }
  }

  private generateNoise(normalized: THREE.Vector3): number {
    const baseFreq = 0.8;
    const frequencies = [1, 1.5, 2];
    const amplitudes = [0.4, 0.15, 0.05];

    let totalNoise = 0;
    let totalAmplitude = 0;

    frequencies.forEach((freq, i) => {
      const noiseVal = this.noise.noise3d(normalized.x * baseFreq * freq, normalized.y * baseFreq * freq, normalized.z * baseFreq * freq);
      totalNoise += noiseVal * amplitudes[i];
      totalAmplitude += amplitudes[i];
    });

    return (totalNoise / totalAmplitude + 1) * 0.5;
  }

  private createTerrainGeometry(): THREE.IcosahedronGeometry {
    const geometry = new THREE.IcosahedronGeometry(this.radius, 8);
    const positions = geometry.attributes.position.array;

    for (let i = 0; i < positions.length; i += 3) {
      const vertex = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
      const normalized = vertex.normalize();
      const noiseValue = this.generateNoise(normalized);

      if (noiseValue > 0.45) {
        const transitionZone = 0.02;
        const cliffFactor = Math.min(1, (noiseValue - 0.45) / transitionZone);
        const baseCliffHeight = 0.035 * cliffFactor;
        const terrainHeight = (noiseValue - 0.45) * 0.18;
        const totalHeight = baseCliffHeight + terrainHeight;
        vertex.multiplyScalar(this.radius * (1 + totalHeight));
      } else {
        vertex.multiplyScalar(this.radius * 0.98);
      }

      positions.set([vertex.x, vertex.y, vertex.z], i);
    }

    geometry.computeVertexNormals();
    return geometry;
  }

  private async createInstancedVegetation(
    modelPath: string,
    instanceCount: number,
    scale: number,
    variants: number,
    alignVector: THREE.Vector3,
    scaleRange: [number, number]
  ): Promise<void> {
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scaleVec = new THREE.Vector3();

    const models = await Promise.all(Array.from({ length: variants }, (_, i) => this.modelLoader.loadModelForInstancing(modelPath, i + 1, scale, false)));

    let placedCount = 0;
    let attempts = 0;
    const maxAttempts = instanceCount * 3;

    while (placedCount < instanceCount && attempts < maxAttempts) {
      // Generate random position on sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      position.set(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)).multiplyScalar(this.radius);

      // Use normalized position as the surface normal - this ensures correct radial growth
      const surfaceNormal = position.clone().normalize();
      const noiseValue = this.generateNoise(surfaceNormal);

      if (noiseValue > 0.45) {
        const totalHeight = 0.035 * Math.min(1, (noiseValue - 0.45) / 0.02) + (noiseValue - 0.45) * 0.18;
        position.multiplyScalar(1 + totalHeight);

        // Create rotation around world Y axis first
        quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);

        // Then align with the surface normal
        const surfaceNormal = position.clone().normalize();
        const alignRotation = new THREE.Quaternion().setFromUnitVectors(alignVector, surfaceNormal);
        quaternion.premultiply(alignRotation);

        const [min, max] = scaleRange;
        const scaleFactor = min + Math.random() * (max - min);
        scaleVec.set(scaleFactor, scaleFactor, scaleFactor);

        matrix.compose(position, quaternion, scaleVec);

        const model = models[Math.floor(Math.random() * models.length)];
        model.meshes.forEach((mesh) => {
          if (mesh.instancedMesh.count < instanceCount) {
            mesh.instancedMesh.setMatrixAt(mesh.instancedMesh.count, matrix);
            mesh.instancedMesh.count++;

            if (mesh.instancedMesh.count === 1) {
              mesh.instancedMesh.castShadow = true;
              mesh.instancedMesh.receiveShadow = true;
              this.planet.add(mesh.instancedMesh);
            }

            mesh.instancedMesh.instanceMatrix.needsUpdate = true;
          }
        });

        placedCount++;
      }
      attempts++;
    }
  }

  private createCelestialBody(geometry: THREE.BufferGeometry, materialConfig: MaterialConfig): THREE.Mesh {
    const material = this.createMaterial(materialConfig);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    return mesh;
  }

  private createPlanet(): void {
    // Ocean
    const ocean = this.createCelestialBody(new THREE.IcosahedronGeometry(this.radius, 2), {
      type: "phong",
      color: 0x4a9fff,
      reflectivity: 100,
      shininess: 100,
      specular: 0x3366ff,
      flatShading: true,
    });
    ocean.scale.setScalar(0.985);

    // Shore
    const shore = this.createCelestialBody(new THREE.IcosahedronGeometry(this.radius * 0.995, 5), {
      type: "phong",
      color: 0x3d8b99,
      shininess: 40,
      specular: 0x225566,
      flatShading: true,
    });

    // Terrain
    const terrain = this.createCelestialBody(this.createTerrainGeometry(), {
      type: "phong",
      color: 0x7acc6d,
      shininess: 30,
      specular: 0x224422,
      flatShading: true,
    });

    this.planet.add(ocean, shore, terrain);
    this.scene.add(this.planet);
  }

  private createAtmosphere(): void {
    // Sun
    this.sun = new THREE.Mesh(new THREE.IcosahedronGeometry(3, 1), this.createMaterial({ type: "basic", color: 0xffff44 }));
    this.sun.position.set(-20, 10, -15);

    // Sun glow
    [3.3, 3.6, 3.9].forEach((size, i) => {
      const glow = new THREE.Mesh(
        new THREE.IcosahedronGeometry(size, 1),
        this.createMaterial({
          type: "basic",
          color: 0xffff44 + i * 0x4444,
          transparent: true,
          opacity: 0.3 - i * 0.1,
        })
      );
      this.sun.add(glow);
    });

    // Clouds
    const cloudMaterial = this.createMaterial({ type: "phong", color: 0xffffff, flatShading: true });
    const cloudGeometries = [new THREE.DodecahedronGeometry(0.8), new THREE.IcosahedronGeometry(1), new THREE.DodecahedronGeometry(1.2)];

    Array.from({ length: 12 }).forEach(() => {
      const cluster = new THREE.Group();
      const cloudCount = 2 + Math.floor(Math.random());

      Array.from({ length: cloudCount }).forEach(() => {
        const cloud = new THREE.Mesh(cloudGeometries[Math.floor(Math.random() * cloudGeometries.length)], cloudMaterial);
        cloud.position.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
        cluster.add(cloud);
      });

      const spherical = new THREE.Spherical(this.radius * 1.3, Math.random() * Math.PI, Math.random() * Math.PI * 2);
      cluster.position.setFromSpherical(spherical);
      this.clouds.add(cluster);
    });

    this.scene.add(this.sun, this.clouds);
  }

  private setupLighting(): void {
    const ambient = new THREE.AmbientLight(0x666666, 0.4);
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
    sunLight.position.copy(this.sun.position);
    sunLight.castShadow = true;

    sunLight.shadow.mapSize.set(4096, 4096);
    sunLight.shadow.camera = new THREE.OrthographicCamera(-35, 35, 35, -35, 0.1, 100);
    sunLight.shadow.bias = -0.0001;
    sunLight.shadow.normalBias = 0.001;
    sunLight.shadow.radius = 2;

    const rimLight = new THREE.DirectionalLight(0x6699ff, 0.2);
    rimLight.position.copy(sunLight.position).multiplyScalar(-1);

    this.scene.add(ambient, sunLight, rimLight);
  }

  private async init(): Promise<void> {
    this.createPlanet();
    this.createAtmosphere();
    this.setupLighting();

    await Promise.all([
      this.createInstancedVegetation("assets/models/fbx/tree", 1000, 0.12, 6, new THREE.Vector3(0, 1, 0), [0.9, 1.1]),
      this.createInstancedVegetation("assets/models/fbx/Grass", 4000, 0.16, 5, new THREE.Vector3(0, 1, 0), [0.8, 1.2]),
    ]);

    this.animate();
  }

  private animate(): void {
    requestAnimationFrame(() => this.animate());
    this.controls.update();

    this.clouds.children.forEach((cluster, i) => {
      cluster.rotation.y += 0.001 * (i % 2 ? 1 : -1);
      cluster.rotation.x += 0.0005 * (i % 2 ? -1 : 1);
    });

    this.renderer.render(this.scene, this.camera);
  }
}

export default LowPolyPlanet;
