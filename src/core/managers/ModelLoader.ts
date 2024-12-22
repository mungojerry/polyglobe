import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader";

interface CachedModel {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

export class ModelLoader {
  private cache: Map<string, CachedModel>;

  constructor() {
    this.cache = new Map<string, CachedModel>();
  }

  public async loadModel(name: string, filename: string, fileIndex: number): Promise<CachedModel> {
    const fullFilename = `${filename}_${("" + fileIndex).padStart(2, "0")}.fbx`;
    const cacheKey = `${name}_${fileIndex}`;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const model = await this.fetchModel(fullFilename);
    this.cache.set(cacheKey, model);
    return model;
  }

  private async fetchModel(filename: string): Promise<CachedModel> {
    return new Promise((resolve, reject) => {
      const loader = new FBXLoader();
      loader.load(
        filename,
        (object) => {
          if (object instanceof THREE.Group) {
            const mesh = object.children[0] as THREE.Mesh;
            const geometry = mesh.geometry as THREE.BufferGeometry;
            const material = mesh.material as THREE.Material;
            resolve({ geometry, material });
          } else {
            reject(new Error("Loaded object is not a valid FBX model"));
          }
        },
        undefined,
        (error) => {
          reject(error);
        }
      );
    });
  }
}
