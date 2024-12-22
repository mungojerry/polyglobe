import * as THREE from "three";

const TiltShiftShader = {
  uniforms: {
    tDiffuse: { value: null },
    focusPos: { value: new THREE.Vector2(0.5, 0.5) },
    amount: { value: 0.005 },
    angle: { value: Math.PI / 4 },
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
    varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      vec2 offset = vec2(cos(angle), sin(angle)) * amount;
      vec4 color = texture2D(tDiffuse, uv);
      color += texture2D(tDiffuse, uv + offset * (focusPos.y - uv.y));
      color += texture2D(tDiffuse, uv - offset * (focusPos.y - uv.y));
      color += texture2D(tDiffuse, uv + offset * (focusPos.x - uv.x));
      color += texture2D(tDiffuse, uv - offset * (focusPos.x - uv.x));
      gl_FragColor = color / 5.0;
    }
  `,
};

export { TiltShiftShader };
