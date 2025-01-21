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
        uniform vec3 sunPosition;
        uniform vec3 sunColor;
        uniform vec3 moonPosition;
        uniform vec3 moonColor;
        uniform vec3 ambientColor;
        uniform float opacity;
        uniform float dayNightMix;
    
        varying vec2 vUv;
        varying vec3 worldPosition;
        varying vec3 vNormal;

        vec3 calculateLightContribution(vec3 normal, vec3 viewDir, vec3 lightPos, vec3 lightColor, float intensity) {
            vec3 lightDir = normalize(lightPos - worldPosition);
            
            // Specular
            vec3 reflectDir = reflect(-lightDir, normal);
            float spec = pow(max(dot(viewDir, reflectDir), 0.0), 64.0);
            vec3 specular = spec * lightColor * intensity;
            
            // Diffuse
            float diff = max(dot(lightDir, normal), 0.0);
            vec3 diffuse = diff * lightColor * intensity * 0.5;
            
            return diffuse + specular;
        }
    
        void main() {
            // Animated UVs
            vec2 uv1 = vUv * 8.0 + vec2(time * 0.02, time * 0.01);
            vec2 uv2 = vUv * 6.0 + vec2(-time * 0.02, -time * 0.01);
            
            // Sample and transform normals
            vec3 bump1 = normalize(texture2D(waterBump1, uv1).rgb * 2.0 - 1.0);
            vec3 bump2 = normalize(texture2D(waterBump2, uv2).rgb * 2.0 - 1.0);
            
            // Blend normal maps
            vec3 finalNormal = normalize(vNormal + bump1 * 0.8 + bump2 * 0.6);
            
            vec3 viewDirection = normalize(cameraPosition - worldPosition);
            
            // Calculate sun and moon contributions
            vec3 sunContribution = calculateLightContribution(
                finalNormal, 
                viewDirection, 
                sunPosition, 
                sunColor, 
                dayNightMix
            );
            
            vec3 moonContribution = calculateLightContribution(
                finalNormal, 
                viewDirection, 
                moonPosition, 
                moonColor, 
                1.0 - dayNightMix
            );
            
            // Fresnel effect
            float fresnel = pow(1.0 - max(dot(viewDirection, finalNormal), 0.0), 4.0);
            
            // Ambient light
            vec3 ambient = ambientColor * mix(0.2, 0.1, dayNightMix);
            
            // Combine all lighting components
            vec3 finalColor = ambient + sunContribution + moonContribution;
            
            // Add fresnel and water color
            finalColor += fresnel * mix(moonColor * 0.3, sunColor * 0.3, dayNightMix);
            finalColor = mix(finalColor, vec3(0.0, 0.3, 0.5), 0.5);
            
            // Adjust color based on day/night cycle
            finalColor = mix(
                finalColor * 0.7,  // Night color (dimmer)
                finalColor,        // Day color
                dayNightMix
            );
            
            gl_FragColor = vec4(finalColor, opacity);
        }
    `;

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      uniforms: {
        time: { value: 0 },
        sunPosition: { value: new THREE.Vector3(1500, 500, 500) },
        sunColor: { value: new THREE.Color(0xffffff).multiplyScalar(0.8) },
        moonPosition: { value: new THREE.Vector3(-1500, 500, -500) },
        moonColor: { value: new THREE.Color(0x77ccff).multiplyScalar(0.5) },
        ambientColor: { value: new THREE.Color(0x00ddff).multiplyScalar(0.5) },
        opacity: { value: 0.85 },
        dayNightMix: { value: 1.0 },
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

  updateLightPositions(sunPos: THREE.Vector3, moonPos: THREE.Vector3, dayNightMix: number) {
    if (this.material) {
      this.material.uniforms.sunPosition.value.copy(sunPos);
      this.material.uniforms.moonPosition.value.copy(moonPos);
      this.material.uniforms.dayNightMix.value = dayNightMix;
    }
  }

  getObject() {
    return this.sphere;
  }
}
