import * as THREE from "three";

// Pre-compute and merge geometries where possible
export function optimizeGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.attributes.position.needsUpdate = false;
  return geometry.clone().toNonIndexed();
}

// Add helper function for smooth transition
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function generateRandomPosition(minDistance: number): THREE.Vector3 {
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);

  const x = minDistance * Math.sin(phi) * Math.cos(theta);
  const y = minDistance * Math.sin(phi) * Math.sin(theta);
  const z = minDistance * Math.cos(phi);

  return new THREE.Vector3(x, y, z);
}

export type ProgressCallback = (progress: number) => void;

export function getModelKey(filename: string, fileIndex: number): string {
  return `${filename}_${fileIndex}`;
}

export async function yieldToMainThread(time: number = 0) {
  await new Promise((resolve) => setTimeout(resolve, time));
}
