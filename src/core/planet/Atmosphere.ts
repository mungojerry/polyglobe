import * as THREE from "three";

export class Atmosphere {
    private mesh: THREE.Mesh;
    private material: THREE.ShaderMaterial;
    private static readonly atmosphereShader = {
        vertexShader: `
            varying vec3 vNormal;
            varying vec3 vPosition;
            varying vec3 vWorldPosition;
            
            void main() {
                vNormal = normalize(normalMatrix * normal);
                vPosition = position;
                vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 sunPosition;
            uniform vec3 moonPosition;
            uniform float sunIntensity;
            uniform float moonIntensity;
            
            varying vec3 vNormal;
            varying vec3 vPosition;
            varying vec3 vWorldPosition;
            
            const vec3 sunsetColor = vec3(1.0, 0.6, 0.3);
            const vec3 dayColor = vec3(0.4, 0.6, 1.0);
            const vec3 nightColor = vec3(0.1, 0.1, 0.2);
            
            float rayleighPhase(float cosTheta) {
                return 0.75 * (1.0 + cosTheta * cosTheta);
            }
            
            void main() {
                vec3 viewDirection = normalize(vWorldPosition - cameraPosition);
                
                // Calculate sun scattering
                float sunCos = dot(viewDirection, normalize(sunPosition));
                float sunScattering = pow(max(0.0, sunCos), 4.0) * sunIntensity;
                float sunPhase = rayleighPhase(sunCos);
                
                // Calculate moon scattering
                float moonCos = dot(viewDirection, normalize(moonPosition));
                float moonScattering = pow(max(0.0, moonCos), 3.0) * moonIntensity * 0.5;
                float moonPhase = rayleighPhase(moonCos);
                
                // Calculate atmosphere density based on view angle with surface
                float atmosphereDensity = pow(1.0 - abs(dot(viewDirection, vNormal)), 1.5);
                
                // Blend between day and night colors
                vec3 baseColor = mix(
                    nightColor,
                    mix(dayColor, sunsetColor, pow(1.0 - sunIntensity, 3.0)),
                    sunIntensity
                );
                
                // Apply scattering and density
                vec3 sunScatterColor = mix(baseColor, sunsetColor, sunScattering * sunPhase);
                vec3 moonScatterColor = mix(nightColor, vec3(0.6, 0.6, 0.8), moonScattering * moonPhase);
                
                // Combine effects
                vec3 finalColor = mix(moonScatterColor, sunScatterColor, sunIntensity);
                finalColor = mix(finalColor * 0.5, finalColor, atmosphereDensity);
                
                // Apply height-based fade for horizon effect
                float heightFade = 1.0 - pow(abs(dot(vNormal, vec3(0.0, 1.0, 0.0))), 0.3);
                finalColor *= heightFade;
                
                // Enhance overall brightness and opacity
                float alpha = atmosphereDensity * mix(0.6, 0.8, sunIntensity + moonIntensity);
                gl_FragColor = vec4(finalColor * 1.2, alpha);
            }
        `
    };

    constructor(radius: number) {
        // Create larger atmosphere sphere
        const geometry = new THREE.SphereGeometry(radius * 1.05, 64, 64);
        
        this.material = new THREE.ShaderMaterial({
            uniforms: {
                sunPosition: { value: new THREE.Vector3(1, 0.5, 0) },
                moonPosition: { value: new THREE.Vector3(-1, 0.5, 0) },
                sunIntensity: { value: 1.0 },
                moonIntensity: { value: 0.3 }
            },
            vertexShader: Atmosphere.atmosphereShader.vertexShader,
            fragmentShader: Atmosphere.atmosphereShader.fragmentShader,
            transparent: true,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });

        this.mesh = new THREE.Mesh(geometry, this.material);
        // Add a slight scale to create depth
        this.mesh.scale.multiplyScalar(1.02);
    }

    public getObject(): THREE.Object3D {
        return this.mesh;
    }

    public update(sunPosition: THREE.Vector3, moonPosition: THREE.Vector3) {
        this.material.uniforms.sunPosition.value.copy(sunPosition);
        this.material.uniforms.moonPosition.value.copy(moonPosition);
    }

    public setSunIntensity(intensity: number) {
        this.material.uniforms.sunIntensity.value = intensity;
    }

    public setMoonIntensity(intensity: number) {
        this.material.uniforms.moonIntensity.value = intensity;
    }
}