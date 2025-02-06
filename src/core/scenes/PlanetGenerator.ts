import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader";
import { Water } from "../effects/Water";
import { pseudoRandom } from "../utils/PseudoRandom";
import { LandscapeConfig, LandscapeGenerator } from "./LandscaoeGeneration";

interface DeformationConfig {
  radius: number;
  strength: number;
  accumulation: number;
  maxDeformation: number; // New: limit total deformation
  smoothing: number; // New: smoothing factor
}

interface PlanetConfig {
  baseRadius: number;

  atmosphereColor: THREE.Color;
  waterLevel: number;
  landscapeConfig: LandscapeConfig;
}

class PlanetoidGenerator {
  private static readonly DEFAULT_PLANET_CONFIG: PlanetConfig = {
    baseRadius: 8,
    atmosphereColor: new THREE.Color(0x00ff88),
    waterLevel: 0.6,
    landscapeConfig: {
      resolution: 50,
      ridgeNoise: {
        scale: 1.3,
        amplitude: 0.15,
        sharpness: 2.4,
      },
      noiseLayers: [
        { scale: 0.5, amplitude: 0.15 }, // Increased base terrain variation
        { scale: 1.0, amplitude: 0.12 }, // Increased medium detail
        { scale: 2.0, amplitude: 0.08 }, // Increased fine detail
        { scale: 4.0, amplitude: 0.04 }, // Adjusted micro detail
        { scale: 8.0, amplitude: 0.02 }, // More subtle highest frequency
        { scale: 16.0, amplitude: 0.01 }, // Very subtle finest detail
      ],
      waterLevel: 1.03,
      colors: [
        { height: 0.0, color: new THREE.Color(0x001133) }, // Deeper water
        { height: 0.02, color: new THREE.Color(0x0044aa) }, // Shallow water
        { height: 0.05, color: new THREE.Color(0x0066cc) }, // Very shallow water
        { height: 0.06, color: new THREE.Color(0xc2b280) }, // Beach
        { height: 0.15, color: new THREE.Color(0x228b22) }, // Lowland vegetation
        { height: 0.35, color: new THREE.Color(0x064820) }, // Forest
        { height: 0.6, color: new THREE.Color(0x704214) }, // Mountains
        { height: 0.75, color: new THREE.Color(0x4a4a4a) }, // High mountains
        { height: 0.85, color: new THREE.Color(0xd4d4d4) }, // Snow line
        { height: 1.0, color: new THREE.Color(0xffffff) }, // Peak snow
      ],
    },
  };

  private lights!: {
    directional: THREE.DirectionalLight;
    ambient: THREE.AmbientLight;
  };
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private planetMesh!: THREE.Mesh;
  private mousePosition: THREE.Vector2;
  private raycaster: THREE.Raycaster;
  private grassInstancedMesh: THREE.InstancedMesh | null = null;
  private readonly NUM_GRASS = 3000;

  // Deformation configuration with defaults
  private config: PlanetConfig;

  private deformConfig: DeformationConfig = {
    radius: 1,
    strength: 0.9,
    accumulation: 0.5,
    maxDeformation: 2.0,
    smoothing: 0.5,
  };

  private frameId: number | null = null;
  private disposed = false;

  constructor(config?: Partial<PlanetConfig>, deformConfig?: Partial<DeformationConfig>) {
    this.config = { ...PlanetoidGenerator.DEFAULT_PLANET_CONFIG, ...config };
    this.deformConfig = { ...this.deformConfig, ...deformConfig };
    this.mousePosition = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    pseudoRandom.setSeed(100);
    this.initScene();
    this.generatePlanetoid();
  }

  // Public methods to update configuration
  public setDeformationRadius(radius: number): void {
    this.deformConfig.radius = radius;
    if (this.planetMesh) {
      const material = this.planetMesh.material as THREE.ShaderMaterial;
      material.uniforms.deformRadius.value = radius;
    }
  }

  public setDeformationStrength(strength: number): void {
    this.deformConfig.strength = strength;
    if (this.planetMesh) {
      const material = this.planetMesh.material as THREE.ShaderMaterial;
      material.uniforms.deformStrength.value = strength;
    }
  }

  public setAccumulationFactor(accumulation: number): void {
    this.deformConfig.accumulation = accumulation;
  }

  public getConfig(): DeformationConfig {
    return { ...this.deformConfig };
  }

  private initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.z = this.config.baseRadius * 2.5;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(this.renderer.domElement);

    // Setup lights
    this.lights = {
      directional: new THREE.DirectionalLight(0xffffff, 1),
      ambient: new THREE.AmbientLight(0x404040, 0.5),
    };

    this.lights.directional.position.set(10, 10, 10);
    this.scene.add(this.lights.directional);
    this.scene.add(this.lights.ambient);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    // Add resize handler
    window.addEventListener("resize", this.handleResize);

    const water = new Water(2, 40);
    this.scene.add(water.getObject());
  }

  private async generatePlanetoid() {
    const landscapeGeneration = new LandscapeGenerator(this.config.baseRadius, this.config.landscapeConfig);
    const geometry = landscapeGeneration.generateTerrain();

    // Add deformation tracking attribute
    const deformationArray = new Float32Array(geometry.attributes.position.count);
    geometry.setAttribute("deformation", new THREE.BufferAttribute(deformationArray, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        shadowMap: { value: null },
        shadowMatrix: { value: new THREE.Matrix4() },
        radius: { value: this.config.baseRadius },
        deformPoint: { value: new THREE.Vector3(0, 0, 0) },
        deformRadius: { value: this.deformConfig.radius },
        deformStrength: { value: this.deformConfig.strength },
        lightPosition: { value: new THREE.Vector3(10, 10, 10) },
        lightColor: { value: new THREE.Color(0xffffff) },
        shininess: { value: 32.0 },
        specularColor: { value: new THREE.Color(0xffffff) },
        previewDeformation: { value: false },
        landscapeColors: { value: this.config.landscapeConfig.colors.map((color) => color.color) },
        landscapeHeights: { value: this.config.landscapeConfig.colors.map((color) => color.height) },
        time: { value: 0.0 },
        glowColor: { value: new THREE.Color(0x00ff88) },
      },
      vertexShader: /* glsl */ `
attribute float deformation;

uniform float radius;
uniform vec3 deformPoint;
uniform float deformRadius;
uniform float deformStrength;
uniform bool previewDeformation;
uniform float time;

varying vec3 vPosition;
varying vec3 vNormal;
varying float vDeformation;
varying vec3 vWorldPosition;
uniform mat4 shadowMatrix;
    varying vec4 vShadowCoord;
void main() {
    vPosition = position;
    vNormal = normal;
    
    vec3 finalPosition = position;
    float totalDeformation = deformation;  // Start with permanent deformation
    
    // Add preview deformation if active
    if (previewDeformation) {
        float distToDeform = distance(position, deformPoint);
        float deformFactor = smoothstep(deformRadius, 0.0, distToDeform);
        totalDeformation += deformFactor;
        finalPosition += normalize(position) * deformFactor * deformStrength;
    }
    
    // Pass total deformation to fragment shader
    vDeformation = totalDeformation;
    vWorldPosition = (modelMatrix * vec4(finalPosition, 1.0)).xyz;
    vShadowCoord = shadowMatrix * modelMatrix * vec4(finalPosition, 1.0);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(finalPosition, 1.0);
    
}
      `,
      fragmentShader: /* glsl */ `
      
uniform vec3 lightPosition;
uniform vec3 lightColor;
uniform float shininess;
uniform vec3 specularColor;
uniform float time;
uniform vec3 glowColor;
uniform float radius;
varying vec3 vPosition;
varying vec3 vNormal;
varying float vDeformation;
varying vec3 vWorldPosition;
#define COLORS_LENGTH ${this.config.landscapeConfig.colors.length}

uniform sampler2D shadowMap;
varying vec4 vShadowCoord;

uniform vec3 landscapeColors[COLORS_LENGTH];
uniform float landscapeHeights[COLORS_LENGTH];

float getShadow(vec4 shadowCoord) {
  vec3 shadowCoordProj = shadowCoord.xyz / shadowCoord.w;
  shadowCoordProj = shadowCoordProj * 0.5 + 0.5;
  
  float currentDepth = shadowCoordProj.z;
  float shadow = 0.0;
  
  float bias = 0.005;
  vec2 texelSize = vec2(1.0 / 2048.0);
  
  for(int x = -1; x <= 1; x++) {
    for(int y = -1; y <= 1; y++) {
      float pcfDepth = texture2D(shadowMap, shadowCoordProj.xy + vec2(x, y) * texelSize).r;
      shadow += currentDepth - bias > pcfDepth ? 0.5 : 1.0;
    }
  }
  
  shadow /= 9.0;
  return shadow;
}
vec3 getLandscapeColor(float height, float latitude) {
  // If height is below the first height, return the first color
  vec3 baseColor;
  const float PI = 3.1415926535897932384626433832795;
  float polarThreshold = 1.150472; // 60 degrees in radians

  // Find the appropriate color interpolation range
  for (int i = 0; i < landscapeHeights.length() - 1; i++) {
      if (height <= landscapeHeights[i]) {
          // Interpolate between this color and the previous color
          float t = (height - landscapeHeights[i-1]) / (landscapeHeights[i] - landscapeHeights[i-1]);
          baseColor = mix(landscapeColors[i-1], landscapeColors[i], t);
          break;
      }
  }
  
  if(height < landscapeHeights[0]) {
    baseColor = landscapeColors[0];
  }
  if(height >= landscapeHeights[landscapeHeights.length() - 1]) {
    baseColor = landscapeColors[landscapeColors.length() - 1];
  }

  // Apply polar effect
  if(abs(latitude) > polarThreshold) {
    float polarBlend = (abs(latitude) - polarThreshold) / (PI/2.0 - polarThreshold);
    return mix(baseColor, vec3(1.0), polarBlend);
  }

  // If height is above the last height, return the last color
  return baseColor;
}

void main() {
    // Calculate height from center
    float height = (length(vPosition) - radius) / radius;
    
    // Calculate latitude using spherical coordinates
    // This gives us a value from -1 (south pole) to 1 (north pole)
    float latitude = asin(vPosition.y / length(vPosition)) / (3.14159 / radius);
    
    // Get base terrain color from biome function
    vec3 terrainColor = getLandscapeColor(height, latitude);
    
    // Enhanced lighting
    vec3 normal = normalize(vNormal);
    vec3 lightDir = normalize(lightPosition - vWorldPosition);
    vec3 viewDir = normalize(-vPosition);
    vec3 halfDir = normalize(lightDir + viewDir);
    
    // Ambient light
    float ambient = 0.1;
    
    // Diffuse lighting with softer falloff
    float diff = max(dot(normal, lightDir), 0.0);
    diff = ambient + (1.0 - ambient) * diff;
    vec3 diffuse = diff * lightColor;
    
    // Specular with adjusted parameters
    float spec = pow(max(dot(normal, halfDir), 0.0), shininess);
    vec3 specular = spec * specularColor * 0.3;
    
    // Rim lighting (very subtle edge highlight)
    float rim = 1.0 - max(dot(viewDir, normal), 0.0);
    rim = pow(rim, 4.0) * 0.05;
    
    // Deformation effects
    float glowPulse = sin(time * 2.0) * 0.5 + 0.5;
    vec3 glowEffect = glowColor * vDeformation * glowPulse;
    
    // Final color composition
    vec3 finalColor = terrainColor * diffuse + specular + rim * lightColor;
    float shadow = getShadow(vShadowCoord);
    finalColor *= shadow;
    gl_FragColor = vec4(finalColor, 1.0);
}
      `,
      side: THREE.FrontSide,
    });
    this.planetMesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.planetMesh);

    this.setupInteractions();
    await this.loadAndPlaceGrass();
    this.animate();
  }

  private setupInteractions() {
    // Handle mouse movement for preview
    this.renderer.domElement.addEventListener("mousemove", (event) => {
      this.mousePosition.x = (event.clientX / window.innerWidth) * 2 - 1;
      this.mousePosition.y = -(event.clientY / window.innerHeight) * 2 + 1;

      this.raycaster.setFromCamera(this.mousePosition, this.camera);
      const intersects = this.raycaster.intersectObject(this.planetMesh);

      if (intersects.length > 0) {
        const material = this.planetMesh.material as THREE.ShaderMaterial;
        material.uniforms.deformPoint.value = intersects[0].point;
        material.uniforms.previewDeformation.value = true;
      }
    });

    // Handle mouse leave
    this.renderer.domElement.addEventListener("mouseleave", () => {
      const material = this.planetMesh.material as THREE.ShaderMaterial;
      material.uniforms.previewDeformation.value = false;
    });

    // Handle click for permanent deformation
    this.renderer.domElement.addEventListener("click", () => {
      // this.raycaster.setFromCamera(this.mousePosition, this.camera);
      // const intersects = this.raycaster.intersectObject(this.planetMesh);
      // if (intersects.length > 0) {
      //   this.applyPermanentDeformation(intersects[0].point);
      // }
    });
  }

  private applyPermanentDeformation(point: THREE.Vector3) {
    const geometry = this.planetMesh.geometry;
    const positions = geometry.attributes.position.array;
    const deformations = geometry.attributes.deformation.array;
    const currentDeformation = this.deformConfig;

    // Get the direction from the center to the click point
    const clickDirection = point.clone().normalize();

    for (let i = 0; i < positions.length; i += 3) {
      const vertex = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);

      const vertexDirection = vertex.clone().normalize();
      const angle = clickDirection.angleTo(vertexDirection);

      if (angle < Math.PI / 2) {
        const distToDeform = point.distanceTo(vertex);
        const deformFactor = Math.max(0, 1 - distToDeform / currentDeformation.radius);

        if (deformFactor > 0) {
          // Apply position deformation
          vertex.add(vertexDirection.multiplyScalar(deformFactor * currentDeformation.strength * currentDeformation.accumulation));
          positions[i] = vertex.x;
          positions[i + 1] = vertex.y;
          positions[i + 2] = vertex.z;

          // Track deformation amount for this vertex
          const vertexIndex = i / 3;
          deformations[vertexIndex] += deformFactor * currentDeformation.accumulation;
        }
      }
    }

    // Update geometry attributes
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.deformation.needsUpdate = true;
    geometry.computeVertexNormals();

    // Reset preview
    const material = this.planetMesh.material as THREE.ShaderMaterial;
    material.uniforms.previewDeformation.value = false;
  }

  private async loadAndPlaceGrass() {
    const loader = new FBXLoader();
    const fbx = await loader.loadAsync("assets/models/fbx/Grass_01.fbx");
    const grassGeometry = (fbx.children[0] as THREE.Mesh).geometry;
    const grassMaterial = new THREE.MeshPhongMaterial({
      color: 0x3b7f3b,
      shininess: 0,
    });

    this.grassInstancedMesh = new THREE.InstancedMesh(grassGeometry, grassMaterial, this.NUM_GRASS);

    // Get geometry data
    const geometry = this.planetMesh.geometry;
    const positionAttribute = geometry.getAttribute("position");
    const positions = positionAttribute.array;
    const faces: { area: number; vertices: THREE.Vector3[]; normal: THREE.Vector3 }[] = [];
    let totalArea = 0;

    // Handle both indexed and non-indexed geometries
    if (geometry.index) {
      const indices = geometry.index.array;
      for (let i = 0; i < indices.length; i += 3) {
        const a = new THREE.Vector3(positions[indices[i] * 3], positions[indices[i] * 3 + 1], positions[indices[i] * 3 + 2]);
        const b = new THREE.Vector3(positions[indices[i + 1] * 3], positions[indices[i + 1] * 3 + 1], positions[indices[i + 1] * 3 + 2]);
        const c = new THREE.Vector3(positions[indices[i + 2] * 3], positions[indices[i + 2] * 3 + 1], positions[indices[i + 2] * 3 + 2]);

        const normal = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();

        const area = normal.length() / 2;
        totalArea += area;
        faces.push({ area, vertices: [a, b, c], normal });
      }
    } else {
      // Non-indexed geometry
      for (let i = 0; i < positions.length; i += 9) {
        const a = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]);
        const b = new THREE.Vector3(positions[i + 3], positions[i + 4], positions[i + 5]);
        const c = new THREE.Vector3(positions[i + 6], positions[i + 7], positions[i + 8]);

        const normal = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();

        const area = normal.length() / 2;
        totalArea += area;
        faces.push({ area, vertices: [a, b, c], normal });
      }
    }

    // Place grass instances
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3(0.1, 0.1, 0.1);
    const tempVector = new THREE.Vector3();
    const tempQuat = new THREE.Quaternion();

    for (let i = 0; i < this.NUM_GRASS; i++) {
      // Select random face weighted by area
      let random = Math.random() * totalArea;
      let selectedFace;

      for (const face of faces) {
        random -= face.area;
        if (random <= 0) {
          selectedFace = face;
          break;
        }
      }

      // Generate random point in triangle using barycentric coordinates
      const r1 = Math.random();
      const r2 = Math.random();
      const a = Math.sqrt(r1);
      const b = r2 * a;
      const c = 1 - a;

      const position = tempVector
        .set(0, 0, 0)
        .addScaledVector(selectedFace!.vertices[0], 1 - b - c)
        .addScaledVector(selectedFace!.vertices[1], b)
        .addScaledVector(selectedFace!.vertices[2], c);

      // Create orientation quaternion
      tempQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), selectedFace!.normal);
      tempQuat.multiply(new THREE.Quaternion().setFromAxisAngle(position.clone().normalize(), Math.random() * Math.PI * 2));

      // Set instance transform
      matrix.compose(position, tempQuat, scale);
      this.grassInstancedMesh.setMatrixAt(i, matrix);
    }

    this.grassInstancedMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(this.grassInstancedMesh);
  }
  private animate = (): void => {
    if (this.disposed) return;

    this.frameId = requestAnimationFrame(this.animate);
    this.controls.update();

    // Update time uniform for shaders
    const material = this.planetMesh.material as THREE.ShaderMaterial;
    material.uniforms.time.value = performance.now() * 0.001;

    this.renderer.render(this.scene, this.camera);
  };

  public dispose(): void {
    this.disposed = true;
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
    }

    this.renderer.dispose();
    this.planetMesh.geometry.dispose();
    (this.planetMesh.material as THREE.Material).dispose();
    this.controls.dispose();

    if (this.grassInstancedMesh) {
      this.grassInstancedMesh.geometry.dispose();
      (this.grassInstancedMesh.material as THREE.Material).dispose();
    }

    // Remove event listeners
    window.removeEventListener("resize", this.handleResize);
    this.renderer.domElement.remove();
  }

  private handleResize = (): void => {
    if (!this.disposed) {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
  };
}

export default PlanetoidGenerator;
