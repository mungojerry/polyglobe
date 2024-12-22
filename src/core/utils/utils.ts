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
