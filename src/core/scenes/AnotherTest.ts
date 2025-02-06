import * as THREE from "three";
import { OrbitControls } from "three-stdlib";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise";
import { ModelLoader } from "../managers/ModelLoader";

class LowPolyPlanet {
  private noise: SimplexNoise;
  private radius: number;
  private scene: THREE.Scene;
  private modelLoader: ModelLoader;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private planet: THREE.Group;
  private clouds: THREE.Group;
  private sun!: THREE.Mesh; // Using definite assignment assertion
  private controls: OrbitControls;

  constructor(radius = 10) {
    this.radius = radius;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a4a4a);
    this.noise = new SimplexNoise();
    this.modelLoader = new ModelLoader(4000); // Support up to 4000 instances for grass (trees use 2000)
    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    this.planet = new THREE.Group();
    this.clouds = new THREE.Group();

    // Start initialization
    this.init().catch(console.error);
  }

  private async createPlanet() {
    // Create ocean sphere (base)
    const oceanGeometry = new THREE.IcosahedronGeometry(this.radius, 2);
    const oceanMaterial = new THREE.MeshPhongMaterial({
      color: 0x4a9fff,
      flatShading: true,
      reflectivity: 100,

      shininess: 100, // Reduced shininess for more diffuse look
      specular: 0x3366ff, // Added blue-tinted specular highlight
    });
    const ocean = new THREE.Mesh(oceanGeometry, oceanMaterial);
    ocean.receiveShadow = true;

    // Create shore ring for distinct water-land boundary with vertical transition
    const shoreGeometry = new THREE.IcosahedronGeometry(this.radius * 0.995, 5); // Slightly higher and more detailed
    const shoreMaterial = new THREE.MeshPhongMaterial({
      color: 0x3d8b99, // Darker blue-green for shore
      flatShading: true,
      shininess: 40,
      specular: 0x225566,
    });
    const shore = new THREE.Mesh(shoreGeometry, shoreMaterial);

    // Create terrain
    const terrainGeometry = new THREE.IcosahedronGeometry(this.radius, 8);
    const positions = terrainGeometry.attributes.position.array;

    // Create landmasses with sharp features
    for (let i = 0; i < positions.length; i += 3) {
      const vertex = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
      const normalized = vertex.normalize();

      // Multi-octave Simplex noise with gentler settings
      const baseFreq = 0.8; // Much lower base frequency for broader features
      const frequencies = [1, 1.5, 2]; // More gradual frequency progression
      const amplitudes = [0.4, 0.15, 0.05]; // Reduced amplitudes for smoother terrain

      let totalNoise = 0;
      let totalAmplitude = 0;

      // Accumulate noise from multiple frequencies
      frequencies.forEach((freq, i) => {
        const noiseVal = this.noise.noise3d(normalized.x * baseFreq * freq, normalized.y * baseFreq * freq, normalized.z * baseFreq * freq);
        totalNoise += noiseVal * amplitudes[i];
        totalAmplitude += amplitudes[i];
      });

      // Normalize and adjust the noise value
      const normalizedNoise = (totalNoise / totalAmplitude + 1) * 0.5;

      // Create terrain features with more vertical cliff at water boundary
      if (normalizedNoise > 0.45) {
        // Create steep cliff at water boundary
        const transitionZone = 0.02; // Narrow zone for vertical transition
        const cliffFactor = Math.min(1, (normalizedNoise - 0.45) / transitionZone); // Sharp transition
        const baseCliffHeight = 0.035 * cliffFactor; // Increased base height with sharp falloff
        const terrainHeight = (normalizedNoise - 0.45) * 0.18; // Existing terrain variation
        const totalHeight = baseCliffHeight + terrainHeight;
        vertex.multiplyScalar(this.radius * (1 + totalHeight));
        positions[i] = vertex.x;
        positions[i + 1] = vertex.y;
        positions[i + 2] = vertex.z;
      } else {
        // Underwater vertices
        vertex.multiplyScalar(this.radius * 0.98);
        positions[i] = vertex.x;
        positions[i + 1] = vertex.y;
        positions[i + 2] = vertex.z;
      }
    }

    terrainGeometry.computeVertexNormals();

    const terrainMaterial = new THREE.MeshPhongMaterial({
      color: 0x7acc6d,
      flatShading: true,
      shininess: 30, // Lower shininess for more matte look
      specular: 0x224422, // Subtle green tint in highlights
    });

    const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
    terrain.receiveShadow = true;
    shore.receiveShadow = true;

    this.planet.add(ocean);
    this.planet.add(shore);
    this.planet.add(terrain);
    this.scene.add(this.planet);

    // Ensure the planet group and all its children can receive shadows
    this.planet.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.receiveShadow = true;
      }
    });

    // Adjust ocean level slightly
    ocean.scale.setScalar(0.985); // Make ocean slightly lower for better shore visibility
  }

  private createClouds() {
    const cloudGeometries = [new THREE.DodecahedronGeometry(0.8, 0), new THREE.IcosahedronGeometry(1, 0), new THREE.DodecahedronGeometry(1.2, 0)];

    const cloudMaterial = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      flatShading: true,
    });

    // Create cloud clusters
    for (let i = 0; i < 12; i++) {
      const cloudCluster = new THREE.Group();

      // Create 2-3 clouds per cluster
      const numClouds = 2 + Math.floor(Math.random());

      for (let j = 0; j < numClouds; j++) {
        const geometry = cloudGeometries[Math.floor(Math.random() * cloudGeometries.length)];
        const cloud = new THREE.Mesh(geometry, cloudMaterial);

        // Position within cluster
        cloud.position.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);

        cloudCluster.add(cloud);
      }

      // Position cluster around planet
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 2;
      const distance = this.radius * 1.3;

      cloudCluster.position.set(distance * Math.sin(theta) * Math.cos(phi), distance * Math.sin(theta) * Math.sin(phi), distance * Math.cos(theta));

      this.clouds.add(cloudCluster);
    }

    this.scene.add(this.clouds);
  }

  private createSun() {
    const sunGeometry = new THREE.IcosahedronGeometry(3, 1);
    const sunMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff44, // Slightly adjusted yellow for better appearance
    });

    this.sun = new THREE.Mesh(sunGeometry, sunMaterial);
    this.sun.position.set(-20, 10, -15);
    this.scene.add(this.sun);

    // Enhanced sun glow with multiple layers
    const glowColors = [0xffff44, 0xffff88, 0xffffaa];
    const glowSizes = [3.3, 3.6, 3.9];
    const glowOpacities = [0.3, 0.2, 0.1];

    glowColors.forEach((color, i) => {
      const glowGeometry = new THREE.IcosahedronGeometry(glowSizes[i], 1);
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: glowOpacities[i],
      });
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      this.sun.add(glow);
    });
  }

  private createVehicles() {
    const vehicleGeometry = new THREE.ConeGeometry(0.3, 1, 4);
    const vehicleMaterials = [
      new THREE.MeshPhongMaterial({ color: 0xff4444, flatShading: true }), // Red
      new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true }), // White
    ];

    // Add vehicles around planet
    for (let i = 0; i < 4; i++) {
      const vehicle = new THREE.Mesh(vehicleGeometry, vehicleMaterials[i % 2]);

      const theta = (i / 4) * Math.PI * 2;
      const distance = this.radius * 1.2;

      vehicle.position.set(distance * Math.cos(theta), distance * Math.sin(theta) * 0.5, distance * Math.sin(theta));

      // Orient vehicles to face tangent to planet
      vehicle.lookAt(0, 0, 0);
      vehicle.rotateX(Math.PI / 2);

      this.scene.add(vehicle);
    }
  }

  private setupScene(): void {
    // Enhanced lighting setup
    const ambientLight = new THREE.AmbientLight(0x666666, 0.4); // Slightly brighter ambient for better visibility
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.5); // Even stronger light for better shadows
    sunLight.position.copy(this.sun.position);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 4096;
    sunLight.shadow.mapSize.height = 4096;
    sunLight.shadow.camera.near = 0.1;
    sunLight.shadow.camera.far = 100;
    // Adjust shadow camera to match sun position and cover all trees
    const shadowCameraSize = 35;
    sunLight.shadow.camera.left = -shadowCameraSize;
    sunLight.shadow.camera.right = shadowCameraSize;
    sunLight.shadow.camera.top = shadowCameraSize;
    sunLight.shadow.camera.bottom = -shadowCameraSize;
    sunLight.shadow.bias = -0.0001; // Smaller bias for more precise shadows
    sunLight.shadow.normalBias = 0.001; // Reduced normal bias
    sunLight.shadow.radius = 2; // Slightly softer shadows

    // Add shadow camera helper for debugging
    const shadowHelper = new THREE.CameraHelper(sunLight.shadow.camera);
    this.scene.add(shadowHelper);

    // Add rim light for better edge definition
    const rimLight = new THREE.DirectionalLight(0x6699ff, 0.2); // Further reduced for better shadow contrast
    rimLight.position.set(-sunLight.position.x, -sunLight.position.y, -sunLight.position.z);

    this.scene.add(ambientLight);
    this.scene.add(sunLight);
    this.scene.add(rimLight);

    // Camera setup
    this.camera.position.set(25, 15, 25);
    this.camera.lookAt(0, 0, 0);
  }

  private async init(): Promise<void> {
    this.createPlanet();
    this.createClouds();
    this.createSun();
    this.createVehicles();
    this.setupScene();
    await Promise.all([this.addTrees(), this.addGrass()]);
    this.animate();
  }

  private async addTrees(): Promise<void> {
    const NUM_TREES = 2000;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    // Load tree models
    const treeVariants = await Promise.all([
      this.modelLoader.loadModelForInstancing("assets/models/fbx/tree", 1, 0.12, false), // Increased tree size
      this.modelLoader.loadModelForInstancing("assets/models/fbx/tree", 2, 0.12, false),
      this.modelLoader.loadModelForInstancing("assets/models/fbx/tree", 3, 0.12, false),
      this.modelLoader.loadModelForInstancing("assets/models/fbx/tree", 4, 0.12, false),
      this.modelLoader.loadModelForInstancing("assets/models/fbx/tree", 5, 0.12, false),
      this.modelLoader.loadModelForInstancing("assets/models/fbx/tree", 6, 0.12, false),
    ]);

    let instanceCount = 0;
    let attempts = 0;
    const maxAttempts = NUM_TREES * 3;

    while (instanceCount < NUM_TREES && attempts < maxAttempts) {
      // Generate random point on sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      const surfaceNormal = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
      position.copy(surfaceNormal).multiplyScalar(this.radius);
      const normalized = surfaceNormal;

      let totalNoise = 0;
      let totalAmplitude = 0;
      const baseFreq = 0.8;
      const frequencies = [1, 1.5, 2];
      const amplitudes = [0.4, 0.15, 0.05];

      frequencies.forEach((freq, i) => {
        const noiseVal = this.noise.noise3d(normalized.x * baseFreq * freq, normalized.y * baseFreq * freq, normalized.z * baseFreq * freq);
        totalNoise += noiseVal * amplitudes[i];
        totalAmplitude += amplitudes[i];
      });

      const normalizedNoise = (totalNoise / totalAmplitude + 1) * 0.5;

      // Only place tree if point is on land
      if (normalizedNoise > 0.45) {
        // Calculate height at this point
        const transitionZone = 0.02;
        const cliffFactor = Math.min(1, (normalizedNoise - 0.45) / transitionZone);
        const baseCliffHeight = 0.035 * cliffFactor;
        const terrainHeight = (normalizedNoise - 0.45) * 0.18;
        const totalHeight = baseCliffHeight + terrainHeight;

        // Position tree on terrain surface
        position.multiplyScalar(1 + totalHeight);

        // Calculate initial rotation to align tree's Y-axis with surface normal
        const initialDirection = new THREE.Vector3(0, 1, 0); // Assuming tree's up direction is Y
        quaternion.setFromUnitVectors(initialDirection, normalized);

        // Apply random rotation around the surface normal (tree's Y-axis)
        const randomAngle = 0; //Math.random() * Math.PI * 2;
        const randomRotation = new THREE.Quaternion().setFromAxisAngle(normalized, randomAngle);
        quaternion.multiply(randomRotation);

        // Select random tree variant
        const treeVariant = treeVariants[Math.floor(Math.random() * treeVariants.length)];

        // Random scale variation (smaller range for more natural look)
        const treeScale = 0.9 + Math.random() * 0.2;
        scale.set(treeScale, treeScale, treeScale);

        // Set matrix for this instance
        matrix.compose(position, quaternion, scale);

        // Add instance to each mesh in the tree model
        treeVariant.meshes.forEach((meshData) => {
          if (meshData.instancedMesh.count < NUM_TREES) {
            meshData.instancedMesh.setMatrixAt(meshData.instancedMesh.count, matrix);
            meshData.instancedMesh.count++;

            // Add to scene if this is the first instance
            if (meshData.instancedMesh.count === 1) {
              meshData.instancedMesh.castShadow = true;
              meshData.instancedMesh.receiveShadow = true;
              this.planet.add(meshData.instancedMesh);
            }

            // Update instance matrix buffer
            meshData.instancedMesh.instanceMatrix.needsUpdate = true;

            // Force shadow update
            meshData.instancedMesh.updateMatrix();
            meshData.instancedMesh.updateMatrixWorld(true);
          }
        });
        instanceCount++;
      }

      attempts++;
    }

    // Update all instance matrices after all instances are added
    treeVariants.forEach((variant) => {
      variant.meshes.forEach((meshData) => {
        if (meshData.instancedMesh.count > 0) {
          meshData.instancedMesh.instanceMatrix.needsUpdate = true;
          meshData.instancedMesh.updateMatrix();
          meshData.instancedMesh.updateMatrixWorld(true);
        }
      });
    });
  }

  private async addGrass(): Promise<void> {
    const NUM_GRASS = 4000;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    // Load grass models
    const grassVariants = await Promise.all([
      this.modelLoader.loadModelForInstancing("assets/models/fbx/Grass", 1, 0.16, false),
      this.modelLoader.loadModelForInstancing("assets/models/fbx/Grass", 2, 0.16, false),
      this.modelLoader.loadModelForInstancing("assets/models/fbx/Grass", 3, 0.16, false),
      this.modelLoader.loadModelForInstancing("assets/models/fbx/Grass", 4, 0.16, false),
      this.modelLoader.loadModelForInstancing("assets/models/fbx/Grass", 5, 0.16, false),
    ]);

    let instanceCount = 0;
    let attempts = 0;
    const maxAttempts = NUM_GRASS * 3;

    while (instanceCount < NUM_GRASS && attempts < maxAttempts) {
      // Generate random point on sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      const surfaceNormal = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
      position.copy(surfaceNormal).multiplyScalar(this.radius);
      const normalized = surfaceNormal;

      let totalNoise = 0;
      let totalAmplitude = 0;
      const baseFreq = 0.8;
      const frequencies = [1, 1.5, 2];
      const amplitudes = [0.4, 0.15, 0.05];

      frequencies.forEach((freq, i) => {
        const noiseVal = this.noise.noise3d(normalized.x * baseFreq * freq, normalized.y * baseFreq * freq, normalized.z * baseFreq * freq);
        totalNoise += noiseVal * amplitudes[i];
        totalAmplitude += amplitudes[i];
      });

      const normalizedNoise = (totalNoise / totalAmplitude + 1) * 0.5;

      // Only place grass if point is on land
      if (normalizedNoise > 0.45) {
        // Calculate height at this point
        const transitionZone = 0.02;
        const cliffFactor = Math.min(1, (normalizedNoise - 0.45) / transitionZone);
        const baseCliffHeight = 0.035 * cliffFactor;
        const terrainHeight = (normalizedNoise - 0.45) * 0.18;
        const totalHeight = baseCliffHeight + terrainHeight;

        // Position grass on terrain surface
        position.multiplyScalar(1 + totalHeight);

        // Calculate initial rotation to align grass's Y-axis with surface normal
        const initialDirection = new THREE.Vector3(0, 0, 1);
        quaternion.setFromUnitVectors(initialDirection, normalized);

        // Apply random rotation around the surface normal
        const randomAngle = Math.random() * Math.PI * 2;
        const randomRotation = new THREE.Quaternion().setFromAxisAngle(normalized, randomAngle);
        quaternion.multiply(randomRotation);

        // Select random grass variant
        const grassVariant = grassVariants[Math.floor(Math.random() * grassVariants.length)];

        // Random scale variation
        const grassScale = 0.8 + Math.random() * 0.4;
        scale.set(grassScale, grassScale, grassScale);

        // Set matrix for this instance
        matrix.compose(position, quaternion, scale);

        // Add instance to each mesh in the grass model
        grassVariant.meshes.forEach((meshData) => {
          if (meshData.instancedMesh.count < NUM_GRASS) {
            meshData.instancedMesh.setMatrixAt(meshData.instancedMesh.count, matrix);
            meshData.instancedMesh.count++;

            // Add to scene if this is the first instance
            if (meshData.instancedMesh.count === 1) {
              meshData.instancedMesh.castShadow = true;
              meshData.instancedMesh.receiveShadow = true;
              this.planet.add(meshData.instancedMesh);
            }

            // Update instance matrix buffer
            meshData.instancedMesh.instanceMatrix.needsUpdate = true;

            // Force shadow update
            meshData.instancedMesh.updateMatrix();
            meshData.instancedMesh.updateMatrixWorld(true);
          }
        });
        instanceCount++;
      }

      attempts++;
    }

    // Update all instance matrices after all instances are added
    grassVariants.forEach((variant) => {
      variant.meshes.forEach((meshData) => {
        if (meshData.instancedMesh.count > 0) {
          meshData.instancedMesh.instanceMatrix.needsUpdate = true;
          meshData.instancedMesh.updateMatrix();
          meshData.instancedMesh.updateMatrixWorld(true);
        }
      });
    });
  }

  private animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    // Rotate planet
    // this.planet.rotation.y += 0.002;

    // Animate clouds
    this.clouds.children.forEach((cluster, i) => {
      cluster.rotation.y += 0.001 * (i % 2 ? 1 : -1);
      cluster.rotation.x += 0.0005 * (i % 2 ? -1 : 1);
    });

    this.renderer.render(this.scene, this.camera);
  }
}

export default LowPolyPlanet;
