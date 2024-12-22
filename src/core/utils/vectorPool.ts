import * as THREE from "three";
class VectorPool {
  private static instance: VectorPool;
  private vectorPool: THREE.Vector3[] = [];

  private constructor() {}

  public static getInstance(): VectorPool {
    if (!VectorPool.instance) {
      VectorPool.instance = new VectorPool();
    }
    return VectorPool.instance;
  }

  public getVector(x = 0, y = 0, z = 0): THREE.Vector3 {
    const vector = this.vectorPool.pop() || new THREE.Vector3();
    vector.set(x, y, z);
    return vector;
  }

  public releaseVector(v: THREE.Vector3) {
    this.vectorPool.push(v.set(0, 0, 0));
  }
}

export const vectorPool = VectorPool.getInstance();
