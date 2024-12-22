import * as THREE from "three";

export class Water {
  private sphere: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private waterBump1: THREE.Texture;
  private waterBump2: THREE.Texture;

  constructor(private radius: number, private detail: number) {
    // Load textures
    const textureLoader = new THREE.TextureLoader();
    this.waterBump1 = textureLoader.load("assets/textures/waterbump1.jpg");
    this.waterBump2 = textureLoader.load("assets/textures/waterbump2.jpg");

    this.waterBump1.minFilter = THREE.LinearMipMapLinearFilter;
    this.waterBump1.magFilter = THREE.LinearFilter;
    this.waterBump1.anisotropy = 16;

    this.waterBump2.minFilter = THREE.LinearMipMapLinearFilter;
    this.waterBump2.magFilter = THREE.LinearFilter;
    this.waterBump2.anisotropy = 16;

    // Set texture repeat
    this.waterBump1.wrapS = this.waterBump1.wrapT = THREE.RepeatWrapping;
    this.waterBump2.wrapS = this.waterBump2.wrapT = THREE.RepeatWrapping;
    this.waterBump1.repeat.set(8, 8);
    this.waterBump2.repeat.set(8, 8);

    const geometry = new THREE.IcosahedronGeometry(this.radius, this.detail);
    const vertexShader = `
            varying vec2 vUv;
            varying vec3 worldPosition;
            varying vec3 vNormal;

            void main() {
                vUv = uv;
                worldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
                vNormal = normalMatrix * normal;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;

    const fragmentShader = `
        uniform sampler2D waterBump1;
        uniform sampler2D waterBump2;
        uniform float time;
        uniform vec3 lightPosition;
        uniform vec3 lightColor;
        uniform vec3 ambientColor;
        uniform float opacity;
    
        varying vec2 vUv;
        varying vec3 worldPosition;
        varying vec3 vNormal;
    
        void main() {
            // Animated UVs
            vec2 uv1 = vUv * 8.0 + vec2(time * 0.02, time * 0.01);
            vec2 uv2 = vUv * 6.0 + vec2(-time * 0.02, -time * 0.01);
            
            // Sample and transform normals
            vec3 bump1 = normalize(texture2D(waterBump1, uv1).rgb * 2.0 - 1.0);
            vec3 bump2 = normalize(texture2D(waterBump2, uv2).rgb * 2.0 - 1.0);
            
            // Blend normal maps
            vec3 finalNormal = normalize(vNormal + bump1 * 10.8 + bump2 *10.6);
            
            // Lighting calculation
            vec3 viewDirection = normalize(cameraPosition - worldPosition);
            vec3 lightDir = normalize(lightPosition - worldPosition);
            
            // Fresnel
            float fresnel = pow(1.0 - max(dot(viewDirection, finalNormal), 0.0), 4.0);
            
            // Specular
            vec3 reflectDir = reflect(-lightDir, finalNormal);
            float spec = pow(max(dot(viewDirection, reflectDir), 0.0), 32.0);
            
            // Reduce Specular Intensity
            vec3 specular = spec * lightColor * 0.7; 
            
            // Final Color Components
            vec3 diffuse = max(dot(lightDir, finalNormal), 0.0) * lightColor * 0.5; // Reduced diffuse intensity
            vec3 ambient = ambientColor * 0.2; // Reduced ambient intensity
            
            // Combine all components with Fresnel
            vec3 finalColor = ambient + diffuse + specular + fresnel * 0.3;
            
            // Apply a subtle color tint to simulate realistic water color
            finalColor = mix(finalColor, vec3(0.0, 0.3, 0.5), 0.5);
            
            gl_FragColor = vec4(finalColor, opacity);
        }
    `;

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      uniforms: {
        time: { value: 0 },
        lightPosition: { value: new THREE.Vector3(1500, 500, 500) },
        lightColor: { value: new THREE.Color(0xffffff).multiplyScalar(0.8) }, // Reduced light intensity
        ambientColor: { value: new THREE.Color(0x00ddff).multiplyScalar(0.5) },
        opacity: { value: 0.96 },
        waterBump1: { value: this.waterBump1 },
        waterBump2: { value: this.waterBump2 },
      },
    });

    geometry.computeVertexNormals();
    this.sphere = new THREE.Mesh(geometry, this.material);
    this.sphere.castShadow = true;
    this.sphere.receiveShadow = true;
  }

  animate() {
    if (this.material) {
      this.material.uniforms!.time.value += 0.015;
    }
    (this.sphere.material as THREE.ShaderMaterial).needsUpdate = true;
  }

  getObject() {
    return this.sphere;
  }
}
