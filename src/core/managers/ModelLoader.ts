import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader";

interface ModelData {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  object: THREE.Object3D;
}

export class ModelLoader {
  private geometryCache: Map<string, THREE.BufferGeometry>;
  private materialCache: Map<string, THREE.Material>;
  private objectCache: Map<string, THREE.Object3D>;

  constructor() {
    this.geometryCache = new Map<string, THREE.BufferGeometry>();
    this.materialCache = new Map<string, THREE.Material>();
    this.objectCache = new Map<string, THREE.Object3D>();
  }

  public async loadModel(filename: string, fileIndex: number): Promise<THREE.Object3D> {
    const fullFilename = `${filename}_${("" + fileIndex).padStart(2, "0")}.fbx`;
    const cacheKey = fullFilename;

    if (this.objectCache.has(cacheKey)) {
      return this.objectCache.get(cacheKey)!.clone();
    }

    const modelData = await this.fetchModel(fullFilename);
    this.cacheModelData(cacheKey, modelData);
    return modelData.object.clone();
  }

  public async loadModelForInstancing(filename: string, fileIndex: number): Promise<ModelData> {
    const fullFilename = `${filename}_${("" + fileIndex).padStart(2, "0")}.fbx`;
    const cacheKey = fullFilename;

    if (this.geometryCache.has(cacheKey) && this.materialCache.has(cacheKey)) {
      return {
        geometry: this.geometryCache.get(cacheKey)!,
        material: this.materialCache.get(cacheKey)!,
        object: this.objectCache.get(cacheKey)!,
      };
    }

    const modelData = await this.fetchModel(fullFilename);
    this.cacheModelData(cacheKey, modelData);
    return modelData;
  }

  private cacheModelData(cacheKey: string, modelData: ModelData): void {
    this.geometryCache.set(cacheKey, modelData.geometry);
    this.materialCache.set(cacheKey, modelData.material);
    this.objectCache.set(cacheKey, modelData.object);
  }

  private async fetchModel(filename: string): Promise<ModelData> {
    return new Promise((resolve, reject) => {
      const loader = new FBXLoader();
      loader.load(
        filename,
        (object) => {
          if (object instanceof THREE.Group) {
            let geometry: THREE.BufferGeometry | undefined;
            let material: THREE.Material | undefined;

            object.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                if (child.material instanceof THREE.MeshPhongMaterial) {
                  child.material.flatShading = true;
                  child.material.shininess = 0.1;
                  child.material.needsUpdate = true;
                }
                // Store the first mesh's geometry and material
                if (!geometry && !material) {
                  geometry = child.geometry;
                  material = child.material;
                }
              }
            });

            if (geometry && material) {
              resolve({
                geometry,
                material,
                object,
              });
            } else {
              reject(new Error("No valid mesh found in FBX model"));
            }
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
