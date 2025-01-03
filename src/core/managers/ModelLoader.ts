import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader";

interface ModelData {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  object: THREE.Object3D;
  scale: number;
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

  public async loadModelForInstancing(filename: string, fileIndex: number, scale: number, noLeadingZero: boolean = false): Promise<ModelData> {
    const fullFilename = `${filename}_${!noLeadingZero ? ("" + fileIndex).padStart(2, "0") : fileIndex}.fbx`;
    const cacheKey = fullFilename;

    if (this.geometryCache.has(cacheKey) && this.materialCache.has(cacheKey)) {
      return {
        geometry: this.geometryCache.get(cacheKey)!,
        material: this.materialCache.get(cacheKey)!,
        object: this.objectCache.get(cacheKey)!,
        scale,
      };
    }

    const modelData = await this.fetchModel(fullFilename, scale);
    this.cacheModelData(cacheKey, modelData);
    return modelData;
  }

  private cacheModelData(cacheKey: string, modelData: ModelData): void {
    this.geometryCache.set(cacheKey, modelData.geometry);
    this.materialCache.set(cacheKey, modelData.material);
    this.objectCache.set(cacheKey, modelData.object);
  }

  private async fetchModel(filename: string, scale: number): Promise<ModelData> {
    return new Promise((resolve, reject) => {
      const loader = new FBXLoader();
      loader.load(
        filename,
        (object) => {
          // if (object instanceof THREE.Group) {
          let geometry: THREE.BufferGeometry | undefined;
          let material: THREE.Material | undefined;

          // First apply scale to the entire object
          object.scale.set(scale, scale, scale);

          object.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.castShadow = true;
              child.receiveShadow = true;

              // Apply material properties that work in FBXViewerScene
              if (child.material) {
                child.material.transparent = false;
                child.material.opacity = 1;
                child.material.shininess = 0;
                child.material.vertexColors = false;
                child.material.flatShading = true;
                child.material.reflectivity = 0;
                child.material.needsUpdate = true;
              }

              // Store the first mesh's geometry and material
              if (!geometry && !material) {
                geometry = child.geometry;
                material = child.material;
              }
            }
          });

          if (!geometry || !material) {
            console.warn("No valid geometry/material found in model");
          }

          if (geometry && material) {
            resolve({
              geometry,
              material,
              object,
              scale,
            });
          } else {
            reject(new Error("No valid mesh found in FBX model"));
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
