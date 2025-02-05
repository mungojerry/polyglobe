import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise";

interface CartoonPlanetConfig {
  radius: number;
  segments: number;
  colors: {
    water: string;
    sand: string;
    grass: string;
    trees: string;
    treeStems: string;
    houses: string;
    roofs: string;
    rock: string;
  };
}

class CartoonPlanetGenerator {
  private static readonly DEFAULT_CONFIG: CartoonPlanetConfig = {
    radius: 10,
    segments: 32,
    colors: {
      water: "#4FA4FF", // Bright blue water
      sand: "#FFE0A3", // Warm sand color
      grass: "#90EE90", // Bright green grass
      trees: "#228B22", // Forest green
      treeStems: "#8B4513", // Brown
      houses: "#F5F5F5", // White houses
      roofs: "#CD5C5C", // Indian red roofs
      rock: "#808080", // Gray rocks
    },
  };

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private planetGroup!: THREE.Group;
  private config: CartoonPlanetConfig;

  constructor(config?: Partial<CartoonPlanetConfig>) {
    this.config = { ...CartoonPlanetGenerator.DEFAULT_CONFIG, ...config };
    this.initScene();
    this.generatePlanet();
  }

  private initScene() {
    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#1a1a2e");

    // Camera
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(4, 3, 4);

    // Renderer with cartoon-optimized settings
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(this.renderer.domElement);

    // Lighting for cartoon style
    const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
    mainLight.position.set(5, 5, 5);
    mainLight.castShadow = true;

    const ambientLight = new THREE.AmbientLight(0x404040, 0.8);
    const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x404040, 0.5);

    this.scene.add(mainLight, ambientLight, hemisphereLight);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;

    window.addEventListener("resize", this.handleResize.bind(this));
  }

  private generatePlanet() {
    this.planetGroup = new THREE.Group();

    // Create base terrain chunks
    this.createTerrainChunks();

    // Add water sphere
    this.addWater();

    // Add features
    this.addTrees();
    this.addHouses();

    this.scene.add(this.planetGroup);
    this.animate();
  }

  private createTerrainChunks() {
    const simplex = new SimplexNoise();
    const chunks = 12; // Number of terrain chunks
    const radius = this.config.radius;

    for (let i = 0; i < chunks; i++) {
      const angle = (i / chunks) * Math.PI * 2; // Angle for this chunk

      // Create a chunk of terrain
      const chunkGeometry = new THREE.BufferGeometry();
      const vertices = [];
      const colors = [];

      // Parameters for terrain generation
      const widthSegments = 16; // Number of segments along the width
      const heightSegments = 8; // Number of segments along the height
      const heightScale = 0.2; // Scale of terrain height variations

      // Generate vertices for the chunk
      for (let y = 0; y <= heightSegments; y++) {
        const v = y / heightSegments; // Normalized height (0 to 1)
        const lat = Math.PI * v; // Latitude (0 to PI)

        for (let x = 0; x <= widthSegments; x++) {
          const u = x / widthSegments; // Normalized width (0 to 1)
          const lon = angle + (u * Math.PI * 2) / chunks; // Longitude (angle-based)

          // Base spherical coordinates
          const xPos = Math.sin(lat) * Math.cos(lon);
          const yPos = Math.cos(lat);
          const zPos = Math.sin(lat) * Math.sin(lon);

          // Apply noise for terrain height
          const noise = simplex.noise3d(xPos, yPos, zPos) * heightScale;
          const height = radius + noise * radius;

          // Vertex position
          vertices.push(xPos * height, yPos * height, zPos * height);

          // Color based on height (stylized)
          const color = new THREE.Color();
          if (height < radius * 1.02) {
            color.set(this.config.colors.water); // Water
          } else if (height < radius * 1.05) {
            color.set(this.config.colors.sand); // Sand
          } else if (height < radius * 1.1) {
            color.set(this.config.colors.grass); // Grass
          } else {
            color.set(this.config.colors.rock); // Rock
          }
          colors.push(color.r, color.g, color.b);
        }
      }

      // Create faces
      const indices = [];
      for (let y = 0; y < heightSegments; y++) {
        for (let x = 0; x < widthSegments; x++) {
          const a = x + y * (widthSegments + 1);
          const b = a + 1;
          const c = a + (widthSegments + 1);
          const d = c + 1;

          indices.push(a, c, b); // First triangle
          indices.push(b, c, d); // Second triangle
        }
      }

      // Set geometry attributes
      chunkGeometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      chunkGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      chunkGeometry.setIndex(indices);
      chunkGeometry.computeVertexNormals();

      // Create material with vertex colors
      const material = new THREE.MeshToonMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
      });

      const chunkMesh = new THREE.Mesh(chunkGeometry, material);

      // Add chunk to planet group
      this.planetGroup.add(chunkMesh);
    }
  }

  private addStylizedTree(position: THREE.Vector3, scale: number = 1) {
    const treeGroup = new THREE.Group();

    // Create three-layer tree crown (pyramid style)
    const crownMaterial = new THREE.MeshToonMaterial({ color: this.config.colors.trees });

    for (let i = 0; i < 3; i++) {
      const size = 0.3 - i * 0.05;
      const height = 0.25;
      const crown = new THREE.Mesh(new THREE.ConeGeometry(size * scale, height * scale, 4), crownMaterial);
      crown.position.y = (0.2 + i * 0.15) * scale;
      treeGroup.add(crown);
    }

    // Add trunk
    const trunkGeometry = new THREE.BoxGeometry(0.05 * scale, 0.2 * scale, 0.05 * scale);
    const trunkMaterial = new THREE.MeshToonMaterial({ color: this.config.colors.treeStems });
    const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
    treeGroup.add(trunk);

    // Position tree
    treeGroup.position.copy(position);
    const up = position.clone().normalize();
    treeGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);

    return treeGroup;
  }

  private addStylizedHouse(position: THREE.Vector3, scale: number = 1) {
    const houseGroup = new THREE.Group();

    // Create house base
    const baseGeometry = new THREE.BoxGeometry(0.2 * scale, 0.15 * scale, 0.15 * scale);
    const baseMaterial = new THREE.MeshToonMaterial({ color: this.config.colors.houses });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);

    // Create roof
    const roofGeometry = new THREE.ConeGeometry(0.15 * scale, 0.1 * scale, 4);
    const roofMaterial = new THREE.MeshToonMaterial({ color: this.config.colors.roofs });
    const roof = new THREE.Mesh(roofGeometry, roofMaterial);
    roof.position.y = 0.125 * scale;
    roof.rotation.y = Math.PI / 4;

    houseGroup.add(base, roof);

    // Position house
    houseGroup.position.copy(position);
    const up = position.clone().normalize();
    houseGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);

    return houseGroup;
  }

  private addTrees() {
    const radius = this.config.radius;
    const simplex = new SimplexNoise();

    // Add trees in clusters
    for (let i = 0; i < 8; i++) {
      const centerPhi = Math.random() * Math.PI * 2;
      const centerTheta = Math.random() * Math.PI;

      // Create cluster of trees
      for (let j = 0; j < 5; j++) {
        const phi = centerPhi + (Math.random() - 0.5) * 0.5;
        const theta = centerTheta + (Math.random() - 0.5) * 0.5;

        const position = new THREE.Vector3().setFromSphericalCoords(radius + 0.1, theta, phi);

        // Only place tree if noise value is appropriate
        const noise = simplex.noise3d(position.x * 0.5, position.y * 0.5, position.z * 0.5);
        if (noise > 0) {
          const scale = 0.8 + Math.random() * 0.4;
          const tree = this.addStylizedTree(position, scale);
          this.planetGroup.add(tree);
        }
      }
    }
  }

  private addHouses() {
    const radius = this.config.radius;
    const simplex = new SimplexNoise();

    // Add houses in small settlements
    for (let i = 0; i < 5; i++) {
      const centerPhi = Math.random() * Math.PI * 2;
      const centerTheta = Math.random() * Math.PI;

      // Create small settlement
      for (let j = 0; j < 3; j++) {
        const phi = centerPhi + (Math.random() - 0.5) * 0.3;
        const theta = centerTheta + (Math.random() - 0.5) * 0.3;

        const position = new THREE.Vector3().setFromSphericalCoords(radius + 0.1, theta, phi);

        const noise = simplex.noise3d(position.x * 0.5, position.y * 0.5, position.z * 0.5);
        if (noise > -0.2) {
          const scale = 0.8 + Math.random() * 0.4;
          const house = this.addStylizedHouse(position, scale);
          this.planetGroup.add(house);
        }
      }
    }
  }

  private addWater() {
    const waterGeometry = new THREE.IcosahedronGeometry(this.config.radius * 0.95, 3);
    const waterMaterial = new THREE.MeshPhysicalMaterial({
      color: this.config.colors.water,
      transparent: true,
      opacity: 0.8,
      roughness: 0.2,
      transmission: 0.5,
      thickness: 0.5,
      clearcoat: 0.3,
    });

    const water = new THREE.Mesh(waterGeometry, waterMaterial);
    this.planetGroup.add(water);
  }

  private animate = () => {
    requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  private handleResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  public dispose() {
    this.renderer.dispose();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach((material) => material.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
    this.controls.dispose();
    this.renderer.domElement.remove();
  }
}

export default CartoonPlanetGenerator;
