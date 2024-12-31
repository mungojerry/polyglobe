import * as THREE from "three";

export class WaterDroplets {
  private material: THREE.ShaderMaterial;
  public plane: THREE.Mesh;

  constructor(private scene: THREE.Scene) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: `
      varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, -0.99, 1.0);
}
      `,
      fragmentShader: `
   uniform float time;
varying vec2 vUv;

void main() {
  vec2 uv = vUv;
  float y = mod(uv.y + time * 0.1, 1.0);
  float alpha = smoothstep(0.45, 0.55, y) * smoothstep(0.55, 0.45, y);
  gl_FragColor = vec4(0.0, 0.5, 1.0, alpha);
}   
      `,
      uniforms: {
        time: { value: 0.0 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    this.plane = new THREE.Mesh(geometry, this.material);
    this.plane.frustumCulled = false;
    this.plane.renderOrder = 999;
    this.scene.add(this.plane);
  }

  update() {
    this.material.uniforms.time.value += 0.01;
  }
}
