import * as THREE from "three";
import { getTerrainColor, isLand, landBoundary } from "../utils/biomes";
import { vectorPool } from "../utils/VectorPool";
import { BaseNoise } from "./noise/BaseNoise";
export class TerrainHelper {
  private static instance: TerrainHelper;
  private noise!: BaseNoise;
  private landGeometry!: THREE.BufferGeometry;
  constructor() {}
  public setDefaults(noise: BaseNoise, landGeometry: THREE.BufferGeometry) {
    this.noise = noise;
    this.landGeometry = landGeometry;
  }
  public static getInstance(): TerrainHelper {
    if (!TerrainHelper.instance) {
      TerrainHelper.instance = new TerrainHelper();
    }
    return TerrainHelper.instance;
  }
  public computeSurfaceHeight(x: number, y: number, z: number): number {
    const surfaceHeight = 0.4 + this.noise.getValue(x, y, z) * 0.7;
    return surfaceHeight;
  }

  public computeElevationMultiplier(noiseValue: number): number {
    const normalizedHeight = (noiseValue + 1) * 0.5;
    const curve = Math.pow(normalizedHeight, 1.5);
    return 0.7 + curve * 0.6;
  }

  public getTerrainBoundary(): number {
    return landBoundary;
  }

  public getTerrainColorValue(height: number, latitude: number) {
    return getTerrainColor(height, latitude);
  }

  public computeHeightAboveSurface(v: THREE.Vector3, radius: number, testUnderWater: boolean = false): number {
    const dir = vectorPool.getVector().copy(v).normalize();
    const noiseValue = this.computeSurfaceHeight(dir.x, dir.y, dir.z);
    const validNoise = !testUnderWater && isLand(noiseValue) ? noiseValue : this.getTerrainBoundary();
    const elevation = this.computeElevationMultiplier(validNoise);

    dir.multiplyScalar(radius * elevation);
    const distance = v.distanceTo(dir);
    vectorPool.releaseVector(dir);
    return distance;
  }

  public isLand(position: THREE.Vector3): boolean {
    const dir = position.clone();
    const noise = this.computeSurfaceHeight(dir.x, dir.y, dir.z);
    return isLand(noise);
  }

  public computeTerrainSlope(position: THREE.Vector3): number {
    const surfaceNormal = this.getSurfaceNormal(position);
    const up = position.clone().normalize();
    const result = 1 - surfaceNormal.dot(up);
    vectorPool.releaseVector(surfaceNormal);
    return result;
  }

  public computePositionOnSurface(worldPos: THREE.Vector3, radius: number): THREE.Vector3 | null {
    const dir = worldPos.clone().normalize();
    const noise = this.computeSurfaceHeight(dir.x, dir.y, dir.z);
    const elevation = this.computeElevationMultiplier(noise);
    return dir.multiplyScalar(radius * elevation);
  }

  public getSurfaceNormal(position: THREE.Vector3): THREE.Vector3 {
    const normalAttr = this.landGeometry.attributes.normal;
    const closestIndex = this.getClosestVertexIndex(position);
    const normal = vectorPool
      .getVector(normalAttr.array[closestIndex * 3], normalAttr.array[closestIndex * 3 + 1], normalAttr.array[closestIndex * 3 + 2])
      .normalize();
    return normal;
  }

  private getClosestVertexIndex(position: THREE.Vector3): number {
    const vertices = this.landGeometry.attributes.position;
    let minDist = Infinity;
    let closestIndex = 0;

    for (let i = 0; i < vertices.count; i++) {
      const vx = vertices.array[i * 3];
      const vy = vertices.array[i * 3 + 1];
      const vz = vertices.array[i * 3 + 2];
      const v = vectorPool.getVector(vx, vy, vz);
      const dist = position.distanceToSquared(v);
      if (dist < minDist) {
        minDist = dist;
        closestIndex = i;
      }
      vectorPool.releaseVector(v);
    }
    return closestIndex;
  }
}

export const terrainHelper = TerrainHelper.getInstance();
