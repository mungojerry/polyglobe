// noise.glsl
#version 300 es
precision highp float;

// Include the Simplex noise implementation
#include "simplexnoise.glsl"

uniform float octaves;
uniform float persistence;
uniform float lacunarity;
uniform float ridgedOffset;
uniform bool ridged;

vec3 domainWarp(vec3 p) {
    float warpStrength = 0.3;
    float wx = snoise(p * 0.5) * warpStrength;
    float wy = snoise(p * 0.5 + vec3(100.0, 0.0, 0.0)) * warpStrength;
    float wz = snoise(p * 0.5 + vec3(0.0, 0.0, 100.0)) * warpStrength;
    return p + vec3(wx, wy, wz);
}

float layeredNoise(vec3 p) {
    // Apply domain warping
    vec3 wp = domainWarp(p);

    float total = 0.0;
    float frequency = 0.35;
    float amplitude = 1.0;
    float maxValue = 0.0;

    for (int i = 0; i < int(octaves); i++) {
        float noiseValue = snoise(wp * frequency);
        if (ridged) {
            noiseValue = abs(noiseValue);
            noiseValue = ridgedOffset - noiseValue;
            noiseValue *= noiseValue;
        }
        total += noiseValue * amplitude;

        maxValue += amplitude;
        amplitude *= persistence;
        frequency *= lacunarity;
    }

    return total / maxValue;
}