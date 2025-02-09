import RAPIER from "@dimforge/rapier3d";
import * as THREE from "three";
import { OrbitControls } from "three-stdlib";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise";
import { Moon } from "../entities/Moon";
import { Stars } from "../entities/Stars";
import { Sun } from "../entities/Sun";
import { UFOEntity } from "../entities/UFOEntity";
import { ModelLoader } from "../managers/ModelLoader";

class LowPolyPlanet {
  private noise: SimplexNoise;
  private radius: number;
  private detail: number;
  private scene: THREE.Scene;
  private modelLoader: ModelLoader;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private planet: THREE.Group;
  private clouds: THREE.Group;
  private sun!: Sun;
  private moon!: Moon;
  private controls: OrbitControls;
  private waterMaterial!: THREE.ShaderMaterial;
  private clock: THREE.Clock = new THREE.Clock();
  private orbitalRadius: number;
  private orbitalSpeed: number = 0.1;
  private stars!: Stars;
  private physicsWorld: RAPIER.World;
  private ufo: UFOEntity | null = null;
  private followCamera: boolean = true;

  constructor(radius = 10, detail = 10) {
    this.radius = radius;
    this.detail = detail;
    this.orbitalRadius = radius * 2;
    this.noise = new SimplexNoise();
    this.modelLoader = new ModelLoader(4000);

    // Initialize RAPIER physics world
    this.physicsWorld = new RAPIER.World({ x: 0.0, y: 0.0, z: 0.0 });

    this.scene = this.createScene();
    this.camera = this.createCamera();
    this.renderer = this.createRenderer();
    this.controls = this.createOrbitControls();

    this.planet = new THREE.Group();
    this.clouds = new THREE.Group();

    // Add camera control toggle
    document.addEventListener("keydown", (event) => {
      if (event.code === "Tab") {
        event.preventDefault();
        this.followCamera = !this.followCamera;
        if (!this.followCamera) {
          // Reset orbit controls when switching to free camera
          this.controls.target.set(0, 0, 0);
        }
      }
    });

    this.init().catch(console.error);
  }

  private createScene(): THREE.Scene {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
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
    controls.enabled = false; // Start with controls disabled for UFO camera
    return controls;
  }

  private generateNoise(normalized: THREE.Vector3): number {
    const baseFreq = 0.5;
    const frequencies = [1, 1.5, 2, 3, 4];
    const amplitudes = [0.4, 0.2, 0.15, 0.1, 0.05];

    let totalNoise = 0;
    let totalAmplitude = 0;

    frequencies.forEach((freq, i) => {
      const noiseVal = this.noise.noise3d(normalized.x * baseFreq * freq, normalized.y * baseFreq * freq, normalized.z * baseFreq * freq);
      totalNoise += noiseVal * amplitudes[i];
      totalAmplitude += amplitudes[i];
    });

    const normalizedNoise = (totalNoise / totalAmplitude + 1) * 0.5;
    return Math.pow(normalizedNoise, 0.8);
  }

  private createTerrainGeometry(): THREE.IcosahedronGeometry {
    const geometry = new THREE.IcosahedronGeometry(this.radius, this.detail);
    const positions = geometry.attributes.position.array;

    for (let i = 0; i < positions.length; i += 3) {
      const vertex = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
      const normalized = vertex.normalize();
      const noiseValue = this.generateNoise(normalized);

      if (noiseValue > 0.45) {
        const transitionZone = 0.02;
        const cliffFactor = Math.min(1, (noiseValue - 0.45) / transitionZone);
        const baseCliffHeight = 0.05 * cliffFactor;
        const terrainHeight = Math.pow((noiseValue - 0.45) * 2, 1.5) * 0.2;
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
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      position.set(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta)).multiplyScalar(this.radius);

      const surfaceNormal = position.clone().normalize();
      const noiseValue = this.generateNoise(surfaceNormal);

      if (noiseValue > 0.5) {
        const totalHeight = 0.035 * Math.min(1, (noiseValue - 0.45) / 0.02) + (noiseValue - 0.45) * 0.18;
        position.multiplyScalar(1 + totalHeight);

        quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI * 2);

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
              mesh.instancedMesh.frustumCulled = true;
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

  private createCelestialBody(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    return mesh;
  }

  private createPlanet(): void {
    const oceanGeometry = new THREE.IcosahedronGeometry(this.radius, this.detail);
    const terrainGeometry = this.createTerrainGeometry();

    const waterPositions = oceanGeometry.attributes.position.array;
    const landPositions = terrainGeometry.attributes.position.array;
    const distances = new Float32Array(waterPositions.length / 3);

    let minFound = Infinity;
    let maxFound = -Infinity;

    for (let i = 0; i < waterPositions.length; i += 3) {
      let minDist = Infinity;
      const waterVertex = new THREE.Vector3(waterPositions[i], waterPositions[i + 1], waterPositions[i + 2]);

      for (let j = 0; j < landPositions.length; j += 3) {
        const landVertex = new THREE.Vector3(landPositions[j], landPositions[j + 1], landPositions[j + 2]);
        const dist = waterVertex.distanceTo(landVertex);
        minDist = Math.min(minDist, dist);
      }

      distances[i / 3] = minDist;
      minFound = Math.min(minFound, minDist);
      maxFound = Math.max(maxFound, minDist);
    }

    for (let i = 0; i < distances.length; i++) {
      distances[i] = Math.max(0, Math.min(1, (distances[i] - minFound) / (maxFound - minFound)));
    }

    oceanGeometry.setAttribute("distanceToShore", new THREE.BufferAttribute(distances, 1));

    this.waterMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        oceanColor: { value: new THREE.Color(0x4a9fff) },
        foamColor: { value: new THREE.Color(0xffffff) },
        radius: { value: this.radius },
      },
      vertexShader: `
        uniform float time;
        attribute float distanceToShore;
        varying float vDistanceToShore;
        varying vec3 vViewPosition;
        varying vec3 vNormal;
        
        void main() {
            vDistanceToShore = distanceToShore;
            
            vec3 newPosition = position + normal * (sin(position.x * 2.0 + time) * 0.03 + 
                                                sin(position.z * 2.0 + time * 1.5) * 0.03) * 
                                                (1.0 - distanceToShore);
            
            vNormal = normalMatrix * normal;
            vec4 mvPosition = modelViewMatrix * vec4(newPosition, 1.0);
            vViewPosition = -mvPosition.xyz;
            
            gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform vec3 oceanColor;
        uniform vec3 foamColor;
        varying float vDistanceToShore;
        varying vec3 vViewPosition;
        varying vec3 vNormal;
        
        float circularNoise(vec2 p) {
            vec2 center = vec2(0.5);
            float dist = distance(p, center);
            float angle = atan(p.y - center.y, p.x - center.x);
            
            float noiseScale = 10.0;
            float timeScale = time * -0.3;
            
            float wave = sin(dist * noiseScale + timeScale) * 
                        cos(angle * 3.0 + timeScale * 1.5) * 
                        (1.0 - abs(dist - 0.5));
            
            return wave * 0.5 + 0.5;
        }
        
        void main() {
            float shoreWidth = 0.4;
            float shoreMask = smoothstep(0.0, shoreWidth, vDistanceToShore);
            
            vec2 waveCoord = vec2(
                cos(vDistanceToShore * 20.0 - time * 0.2),
                sin(vDistanceToShore * 20.0 - time * 0.3)
            );
            
            float wavePattern = circularNoise(waveCoord * 0.5 + 0.5);
            
            float foam = shoreMask * wavePattern;
            foam = smoothstep(0.4, 0.9, foam);
            
            vec3 viewDir = normalize(vViewPosition);
            vec3 normal = normalize(vNormal);
            vec3 reflectionDir = reflect(-viewDir, normal);
            float specular = pow(max(dot(reflectionDir, viewDir), 0.0), 50.0);
            
            vec3 baseColor = mix(oceanColor, foamColor, foam);
            vec3 finalColor = baseColor + vec3(specular * 0.8);
            
            float alpha = mix(0.6, 1.0, foam + specular * 0.2);
            
            gl_FragColor = vec4(finalColor, alpha);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide,
    });

    const ocean = new THREE.Mesh(oceanGeometry, this.waterMaterial);
    ocean.scale.setScalar(1.06);
    ocean.receiveShadow = true;

    const terrain = this.createCelestialBody(
      terrainGeometry,
      new THREE.MeshPhongMaterial({
        color: 0x7acc6d,
        shininess: 30,
        reflectivity: 100,
        opacity: 1,
        transparent: false,
        specular: 0x224422,
        flatShading: true,
      })
    );

    this.planet.add(ocean, terrain);
    this.scene.add(this.planet);
  }

  private createAtmosphere(): void {
    this.sun = new Sun(this.scene, this.orbitalRadius);
    this.moon = new Moon(this.scene, this.orbitalRadius);

    const cloudMaterial = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      flatShading: true,
    });
    const cloudGeometries = [new THREE.DodecahedronGeometry(0.8), new THREE.IcosahedronGeometry(1), new THREE.DodecahedronGeometry(1.2)];

    Array.from({ length: 20 }).forEach(() => {
      const cluster = new THREE.Group();
      const cloudCount = 2 + Math.floor(Math.random());

      Array.from({ length: cloudCount }).forEach(() => {
        const cloud = new THREE.Mesh(cloudGeometries[Math.floor(Math.random() * cloudGeometries.length)], cloudMaterial);
        cloud.position.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
        cluster.add(cloud);
      });

      const spherical = new THREE.Spherical(this.radius * 1.5, Math.random() * Math.PI, Math.random() * Math.PI * 2);
      cluster.position.setFromSpherical(spherical);
      this.clouds.add(cluster);
    });

    this.scene.add(this.clouds);

    this.stars = new Stars(this.radius * 5);
    this.scene.add(this.stars.getObject());
  }

  private createAtmosphereGlow(): void {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255, 165, 0, 1)");
    gradient.addColorStop(1, "rgba(255, 165, 0, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: true,
    });

    const glowSprite = new THREE.Sprite(spriteMaterial);
    const glowScale = this.radius * 2.7;
    glowSprite.scale.set(glowScale, glowScale, 1);
    glowSprite.position.set(0, 0, -0.1);
    glowSprite.renderOrder = -10;

    this.planet.add(glowSprite);
  }

  private setupLighting(): void {
    const ambient = new THREE.AmbientLight(0x666666, 0.4);
    this.scene.add(ambient);
  }

  private async init(): Promise<void> {
    this.createPlanet();
    this.createAtmosphereGlow();
    this.createAtmosphere();
    this.setupLighting();

    // Create and position the UFO
    this.ufo = new UFOEntity(this.scene, new THREE.Vector3(0, this.radius + 5, 0), this.physicsWorld);

    // Lock pointer for UFO control
    this.renderer.domElement.addEventListener("click", () => {
      this.renderer.domElement.requestPointerLock();
    });

    await Promise.all([
      this.createInstancedVegetation("assets/models/fbx/tree", 300, 0.12, 16, new THREE.Vector3(0, 1, 0), [0.9, 1.1]),
      this.createInstancedVegetation("assets/models/fbx/Grass", 14000, 0.16, 5, new THREE.Vector3(0, 1, 0), [0.8, 1.2]),
      this.createInstancedVegetation("assets/models/fbx/Rock", 400, 0.16, 5, new THREE.Vector3(0, 1, 0), [0.8, 1.2]),
      this.createInstancedVegetation("assets/models/fbx/BigRock", 100, 0.16, 3, new THREE.Vector3(0, 1, 0), [0.8, 1.2]),
      this.createInstancedVegetation("assets/models/fbx/Reeds", 100, 0.16, 1, new THREE.Vector3(0, 1, 0), [0.6, 0.7]),
      this.createInstancedVegetation("assets/models/fbx/House", 3, 0.16, 1, new THREE.Vector3(0, 1, 0), [1, 1]),
    ]);

    this.animate();
  }

  private animate(): void {
    requestAnimationFrame(() => this.animate());

    // Step the physics world
    this.physicsWorld.step();

    // Update UFO and camera
    if (this.ufo) {
      this.ufo.update(this.camera);

      if (this.followCamera) {
        // Get UFO position and up vector
        const ufoPos = this.ufo.getPosition();
        const ufoUp = this.ufo.getUp();

        // Calculate camera position behind and above UFO
        const offset = new THREE.Vector3(0, 2, 8);
        const cameraPos = ufoPos.clone().add(offset);

        // Update camera position and orientation
        this.camera.position.copy(cameraPos);
        this.camera.lookAt(ufoPos);

        // Align camera with planet's up direction
        const planetUp = ufoPos.clone().normalize();
        this.camera.up.copy(planetUp);
      } else {
        this.controls.enabled = true;
        this.controls.update();
      }
    }

    // Update water animation time
    if (this.waterMaterial) {
      this.waterMaterial.uniforms.time.value = this.clock.getElapsedTime();
    }

    const time = this.clock.getElapsedTime() * this.orbitalSpeed;

    // Update sun and moon positions
    this.sun.update(time);
    this.moon.update(time);

    // Animate clouds
    this.clouds.children.forEach((cluster, i) => {
      cluster.rotation.y += 0.001 * (i % 2 ? 1 : -1);
      cluster.rotation.x += 0.0005 * (i % 2 ? -1 : 1);
    });

    this.renderer.render(this.scene, this.camera);
  }
}

export default LowPolyPlanet;
