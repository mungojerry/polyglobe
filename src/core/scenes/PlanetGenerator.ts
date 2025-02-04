import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise";

class PlanetoidGenerator {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private planetMesh: THREE.Mesh;
  private simplex: SimplexNoise;
  constructor(private resolution: number = 128) {
    this.initScene();
    this.generatePlanetoid();
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
  }

  private generatePlanetoid() {
    this.simplex = new SimplexNoise();
    const geometry = new THREE.SphereGeometry(2, this.resolution, this.resolution);
    const positions = geometry.attributes.position.array;

    // Generate noise on CPU
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
        deformRadius: { value: 0.5 },
        deformStrength: { value: 0.2 },
        lightPosition: { value: new THREE.Vector3(10, 10, 10) },
        lightColor: { value: new THREE.Color(0xffffff) },
        shininess: { value: 32.0 },
        specularColor: { value: new THREE.Color(0xffffff) },
      },
      vertexShader: `
            uniform float radius;
            uniform vec3 deformPoint;
            uniform float deformRadius;
            uniform float deformStrength;

            varying vec3 vPosition;
            varying float vHeight;
            varying vec3 vNormal;

            void main() {
                vPosition = position;
                vNormal = normal;

                // Sphere normalization
                vec3 basePosition = position;

                // Deformation calculation
                float distToDeform = distance(position, deformPoint);
                float deformFactor = smoothstep(deformRadius, 0.0, distToDeform);

                // Final vertex position
                vec3 deformedPosition = basePosition + (normalize(basePosition) * deformFactor * deformStrength);

                vHeight = length(deformedPosition) - radius;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(deformedPosition, 1.0);
            }
        `,
      fragmentShader: `
            uniform vec3 lightPosition;
            uniform vec3 lightColor;
            uniform float shininess;
            uniform vec3 specularColor;

            varying vec3 vPosition;
            varying float vHeight;
            varying vec3 vNormal;

            void main() {
                vec3 color;
                if (vHeight < 0.1) {
                    color = vec3(0.1, 0.3, 0.7); // Deep Ocean
                } else if (vHeight < 0.2) {
                    color = vec3(0.4, 0.6, 0.8); // Shore
                } else if (vHeight < 0.4) {
                    color = vec3(0.2, 0.7, 0.3); // Grassland
                } else if (vHeight < 0.6) {
                    color = vec3(0.5, 0.5, 0.5); // Mountains
                } else {
                    color = vec3(1.0, 1.0, 1.0); // Snow Peaks
                }

                // Lighting calculations
                vec3 normal = normalize(vNormal);
                vec3 lightDir = normalize(lightPosition - vPosition);
                vec3 viewDir = normalize(-vPosition); // Assuming the camera is at the origin
                vec3 reflectDir = reflect(-lightDir, normal);

                float diff = max(dot(normal, lightDir), 0.0);
                vec3 diffuse = diff * lightColor;

                float spec = pow(max(dot(viewDir, reflectDir), 0.0), shininess);
                vec3 specular = spec * specularColor;

                vec3 finalColor = color * (diffuse + specular);
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
    let amplitude = 0.91;
    let frequency = 1;
    let persistance = 0.5;
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
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    this.renderer.domElement.addEventListener("mousemove", (event) => {
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

      raycaster.setFromCamera(mouse, this.camera);
      const intersects = raycaster.intersectObject(this.planetMesh);

      if (intersects.length > 0) {
        const point = intersects[0].point;
        this.updateDeformationUniforms(point);
      }
    });
  }

  private updateDeformationUniforms(point: THREE.Vector3) {
    const material = this.planetMesh.material as THREE.ShaderMaterial;
    material.uniforms.deformPoint.value = point;
  }

  private animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

export default PlanetoidGenerator;
