import * as THREE from "three";

const UnderWaterShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    waterColor: { value: new THREE.Color(0x004488) }, // Darker, more natural blue
    distortionAmount: { value: 0.015 }, // Slightly reduced distortion
    blurAmount: { value: 0.002 }, // Reduced blur for better clarity
    causticsIntensity: { value: 0.15 }, // Controllable caustics strength
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform vec3 waterColor;
    uniform float distortionAmount;
    uniform float blurAmount;
    uniform float causticsIntensity;
    varying vec2 vUv;

    // Noise function
    float random(vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }

    // Value noise
    float noise(vec2 st) {
      vec2 i = floor(st);
      vec2 f = fract(st);
      
      float a = random(i);
      float b = random(i + vec2(1.0, 0.0));
      float c = random(i + vec2(0.0, 1.0));
      float d = random(i + vec2(1.0, 1.0));

      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }
    
    void main() {
      // Create multi-layered distortion
      vec2 distortedUv = vUv;
      
      // Large slow waves
      float slowTime = time * 0.2;
      vec2 largeWaves = vec2(
        sin(distortedUv.y * 3.0 + slowTime) * 0.3 +
        sin(distortedUv.x * 2.5 + slowTime * 0.8) * 0.2,
        
        cos(distortedUv.x * 2.8 + slowTime * 1.2) * 0.3 +
        cos(distortedUv.y * 3.2 + slowTime * 0.9) * 0.2
      );
      
      // Medium frequency waves
      vec2 mediumWaves = vec2(
        sin(distortedUv.y * 8.0 + time * 1.1) * 0.15 +
        sin(distortedUv.x * 7.0 + time * 0.9) * 0.15,
        
        cos(distortedUv.x * 7.5 + time * 1.2) * 0.15 +
        cos(distortedUv.y * 8.5 + time) * 0.15
      );
      
      // Add noise-based distortion
      float noiseScale = 4.0;
      vec2 noiseUv = vUv * noiseScale + time * 0.1;
      vec2 noiseDistortion = vec2(
        noise(noiseUv + vec2(0.0, time * 0.1)),
        noise(noiseUv + vec2(time * 0.1, 0.0))
      ) * 0.3;
      
      // Combine all distortions with varying strengths
      distortedUv += (largeWaves + mediumWaves + noiseDistortion) * distortionAmount;
      
      // Sample colors with blur
      vec4 blur = vec4(0.0);
      float totalWeight = 0.0;
      
      // 3x3 blur kernel
      for(float x = -2.0; x <= 2.0; x += 2.0) {
        for(float y = -2.0; y <= 2.0; y += 2.0) {
          vec2 offset = vec2(x, y) * blurAmount;
          float weight = 1.0 - length(offset) * 0.5;
          blur += texture2D(tDiffuse, distortedUv + offset) * weight;
          totalWeight += weight;
        }
      }
      
      // Normalize blur
      blur /= totalWeight;
      
      // Create organic caustics using noise
      float caustics = 0.0;
      for(float i = 1.0; i <= 3.0; i++) {
        float scale = pow(2.0, i);
        vec2 causticsUv = distortedUv * scale + time * (0.1 / i);
        
        // Use noise for more organic caustics
        float noiseVal = noise(causticsUv);
        float pattern = noise(vec2(noiseVal * 4.0 + time * 0.2 * i, 
                                 noiseVal * 4.0 - time * 0.15 * i));
        
        caustics += pattern * (0.3 / i);
      }
      caustics = smoothstep(0.2, 0.8, caustics);

      // Create a depth-aware water color blend
      float depth = length(vUv - 0.5) * 2.0;
      float waterStrength = smoothstep(0.0, 1.0, depth) * 0.3 + 0.1;
      
      // Mix colors with depth-aware water tint
      vec3 finalColor = mix(blur.rgb, waterColor, waterStrength);
      
      // Add caustics with depth attenuation
      float causticsStrength = (1.0 - depth * 0.5) * causticsIntensity;
      finalColor += waterColor * caustics * causticsStrength;
      
      // Add subtle color variations based on noise
      vec3 deepColor = waterColor * 0.7;  // Darker water color for depth
      float colorNoise = noise(distortedUv * 2.0 + time * 0.05) * 0.1;
      finalColor = mix(finalColor, deepColor, colorNoise);
      
      // Apply depth-based vignette
      float vignette = 1.0 - smoothstep(0.5, 1.5, length(vUv - 0.5));
      finalColor *= mix(0.7, 1.0, vignette);
      
      gl_FragColor = vec4(finalColor, 1.0);
    }
  `,
};

export { UnderWaterShader };
