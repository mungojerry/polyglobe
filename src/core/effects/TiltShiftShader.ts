import * as THREE from "three";

const TiltShiftShader = {
  uniforms: {
    tDiffuse: { value: null },
    focusPos: { value: new THREE.Vector2(0.5, 0.5) },
    amount: { value: 0.003 },
    angle: { value: Math.PI / 4 },
    brightness: { value: 1.2 },
    luminanceThreshold: { value: 0.8 }, // Threshold for preserving bright areas
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
    uniform vec2 focusPos;
    uniform float amount;
    uniform float angle;
    uniform float brightness;
    uniform float luminanceThreshold;
    varying vec2 vUv;
    
    float getLuminance(vec3 color) {
      return dot(color, vec3(0.299, 0.587, 0.114));
    }
    
    void main() {
      vec2 uv = vUv;
      vec2 offset = vec2(cos(angle), sin(angle)) * amount;
      
      // Sample original color
      vec4 originalColor = texture2D(tDiffuse, uv);
      float luminance = getLuminance(originalColor.rgb);
      
      // Calculate blur amount based on distance from focus point and luminance
      float distFromFocus = length(focusPos - uv);
      float blurAmount = distFromFocus * amount;
      
      // Reduce blur amount for bright areas
      float brightnessFactor = smoothstep(luminanceThreshold, 1.0, luminance);
      blurAmount *= (1.0 - brightnessFactor * 0.8); // Preserve 80% of bright areas
      
      // Sample blur colors with weighted distribution
      vec4 blur = vec4(0.0);
      vec2 blurOffset1 = offset * blurAmount;
      vec2 blurOffset2 = vec2(-offset.y, offset.x) * blurAmount;
      
      // Center sample
      blur += originalColor * 0.4;
      
      // Cross pattern samples
      vec4 sample1 = texture2D(tDiffuse, uv + blurOffset1);
      vec4 sample2 = texture2D(tDiffuse, uv - blurOffset1);
      vec4 sample3 = texture2D(tDiffuse, uv + blurOffset2);
      vec4 sample4 = texture2D(tDiffuse, uv - blurOffset2);
      
      // Weight samples based on their luminance
      float weight1 = 1.0 - smoothstep(luminanceThreshold, 1.0, getLuminance(sample1.rgb));
      float weight2 = 1.0 - smoothstep(luminanceThreshold, 1.0, getLuminance(sample2.rgb));
      float weight3 = 1.0 - smoothstep(luminanceThreshold, 1.0, getLuminance(sample3.rgb));
      float weight4 = 1.0 - smoothstep(luminanceThreshold, 1.0, getLuminance(sample4.rgb));
      
      blur += sample1 * weight1 * 0.15;
      blur += sample2 * weight2 * 0.15;
      blur += sample3 * weight3 * 0.15;
      blur += sample4 * weight4 * 0.15;
      
      // Blend between original and blur based on distance from focus
      float blend = smoothstep(0.0, 1.0, distFromFocus);
      vec4 finalColor = mix(originalColor, blur, blend);
      
      // Preserve bright areas
      finalColor = mix(finalColor, originalColor, brightnessFactor);
      
      // Apply brightness compensation
      gl_FragColor = finalColor * brightness;
    }
  `,
};

export { TiltShiftShader };