import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise";

interface DeformationConfig {
  radius: number;
  strength: number;
  accumulation: number;
}

class PlanetoidGenerator {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private planetMesh: THREE.Mesh;
  private simplex: SimplexNoise;
  private mousePosition: THREE.Vector2;
  private raycaster: THREE.Raycaster;

  // Deformation configuration with defaults
  private deformConfig: DeformationConfig = {
    radius: 0.5,
    strength: 0.2,
    accumulation: 1.0,
  };

  constructor(private resolution: number = 140, config?: Partial<DeformationConfig>) {
    this.mousePosition = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();

    // Apply any custom config values
    if (config) {
      this.deformConfig = { ...this.deformConfig, ...config };
    }

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
    this.camera.position.z = 5;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    // Add resize handler
    window.addEventListener("resize", () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  private generatePlanetoid() {
    this.simplex = new SimplexNoise();
    const geometry = new THREE.IcosahedronGeometry(2, this.resolution);

    // Add deformation tracking attribute
    const deformationArray = new Float32Array(geometry.attributes.position.count);
    geometry.setAttribute("deformation", new THREE.BufferAttribute(deformationArray, 1));
    const positions = geometry.attributes.position.array;

    // Generate initial noise on CPU (same as before)
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];
      const noise = this.generateMultiOctaveNoise(x, y, z);
      positions[i] *= 1 + noise * 0.3;
      positions[i + 1] *= 1 + noise * 0.3;
      positions[i + 2] *= 1 + noise * 0.3;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();

    const material = new THREE.ShaderMaterial({
      uniforms: {
        radius: { value: 2.0 },
        deformPoint: { value: new THREE.Vector3(0, 0, 0) },
        deformRadius: { value: this.deformConfig.radius },
        deformStrength: { value: this.deformConfig.strength },
        lightPosition: { value: new THREE.Vector3(10, 10, 10) },
        lightColor: { value: new THREE.Color(0xffffff) },
        shininess: { value: 32.0 },
        specularColor: { value: new THREE.Color(0xffffff) },
        previewDeformation: { value: false },
        time: { value: 0.0 },
        glowColor: { value: new THREE.Color(0x00ff88) },
      },
      vertexShader: `
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
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(finalPosition, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 lightPosition;
        uniform vec3 lightColor;
        uniform float shininess;
        uniform vec3 specularColor;
        uniform float time;
        uniform vec3 glowColor;
        
        varying vec3 vPosition;
        varying vec3 vNormal;
        varying float vDeformation;
        varying vec3 vWorldPosition;
        
        void main() {
            // Base terrain color based on height
            float height = length(vPosition) - 2.0;
            vec3 terrainColor;
            if (height < 0.1) {
                terrainColor = vec3(0.1, 0.3, 0.7); // Deep Ocean
            } else if (height < 0.2) {
                terrainColor = vec3(0.4, 0.6, 0.8); // Shore
            } else if (height < 0.4) {
                terrainColor = vec3(0.2, 0.7, 0.3); // Grassland
            } else if (height < 0.6) {
                terrainColor = vec3(0.5, 0.5, 0.5); // Mountains
            } else {
                terrainColor = vec3(1.0, 1.0, 1.0); // Snow Peaks
            }
            
            // Basic lighting
            vec3 normal = normalize(vNormal);
            vec3 lightDir = normalize(lightPosition - vWorldPosition);
            vec3 viewDir = normalize(-vPosition);
            vec3 reflectDir = reflect(-lightDir, normal);
            
            float diff = max(dot(normal, lightDir), 0.0);
            vec3 diffuse = diff * lightColor;
            
            float spec = pow(max(dot(viewDir, reflectDir), 0.0), shininess);
            vec3 specular = spec * specularColor;
            
            // Deformation effects only where deformation exists
            float glowPulse = sin(time * 2.0) * 0.5 + 0.5;
            vec3 glowEffect = glowColor * vDeformation * glowPulse;
            
            // Final color
            vec3 finalColor = terrainColor * (diffuse + specular);
            // Only add glow where there's deformation
            if (vDeformation > 0.0) {
                finalColor = mix(finalColor, glowColor, vDeformation * 0.3);
                finalColor += glowEffect * 0.2;
            }
            
            gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
      side: THREE.DoubleSide,
    });
    this.planetMesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.planetMesh);

    this.setupInteractions();
    this.animate();
  }

  private generateMultiOctaveNoise(x: number, y: number, z: number, octaves: number = 6): number {
    let noise = 0;
    let amplitude = 0.5;
    let frequency = 1;
    let persistance = 0.4;
    let lacunarity = 2.0;

    for (let i = 0; i < octaves; i++) {
      const sampleX = x * frequency;
      const sampleY = y * frequency;
      const sampleZ = z * frequency;
      const perlin = this.simplex.noise3d(sampleX, sampleY, sampleZ);
      noise += perlin * amplitude;
      amplitude *= persistance;
      frequency *= lacunarity;
    }

    return noise;
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
      this.raycaster.setFromCamera(this.mousePosition, this.camera);
      const intersects = this.raycaster.intersectObject(this.planetMesh);

      if (intersects.length > 0) {
        this.applyPermanentDeformation(intersects[0].point);
      }
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

  private animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  // Clean up method
  public dispose() {
    this.renderer.dispose();
    this.planetMesh.geometry.dispose();
    (this.planetMesh.material as THREE.Material).dispose();
    this.controls.dispose();
  }
}

export default PlanetoidGenerator;
