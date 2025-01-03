const vertexShader = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const fragmentShader = `
uniform sampler2D tDiffuse;
uniform float time;
uniform float speed;
varying vec2 vUv;

// Improved noise function for better randomization
float hash(vec2 p) {
    float h = dot(p, vec2(127.1, 311.7));
    return fract(sin(h) * 43758.5453123);
}

void main() {
    // Get the original scene color first
    vec4 sceneColor = texture2D(tDiffuse, vUv);
    
    // Center the coordinates
    vec2 center = vUv - 0.5;
    float dist = length(center);
    
    // Convert to polar coordinates
    float angle = atan(center.y, center.x);
    
    // Create base line pattern
    float lines = 40.0; // Number of lines
    float radialCoord = (angle / 6.28318 + 0.5) * lines;
    
    // Add time-based movement and randomization
    float timeOffset = time * 0.5;
    float noise = hash(vec2(floor(radialCoord), timeOffset)) * 0.5;
    radialCoord += noise;
    
    // Create line pattern
    float line = fract(radialCoord);
    
    // Dynamic thickness based on distance from center
    // Lines start thin in center and get thicker towards edges
    float baseThickness = 0.4 + dist * 0.6;
    float thickness = baseThickness * speed * (0.1 + dist * 2.0);
    
    // Smooth line with varying thickness
    float speedLine = smoothstep(0.5 - thickness, 0.5, line) - 
                     smoothstep(0.5, 0.5 + thickness, line);
    
    // Fade lines based on distance and speed
    float fadeOut = smoothstep(1.0, 0.0, dist * 2.0);
    speedLine *= fadeOut * speed;
    
    // Create pure white lines that add to the scene
    vec3 lineColor = vec3(1.0) * speedLine * 0.3; // Reduced intensity
    
    // Output color is original scene plus the lines
    gl_FragColor = vec4(sceneColor.rgb + lineColor, 1.0);
}`;

const SpeedShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    speed: { value: 0.0 },
  },
  vertexShader,
  fragmentShader,
};

export { SpeedShader };
