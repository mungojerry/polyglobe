import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";

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
          // Collect all geometries and materials
          const geometries: THREE.BufferGeometry[] = [];
          const materials: THREE.Material[] = [];

          object.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              // Clone geometry to avoid sharing
              const geom = child.geometry.clone();

              // Apply mesh's transform to geometry
              geom.applyMatrix4(child.matrixWorld);
              geometries.push(geom);

              // Store material
              if (Array.isArray(child.material)) {
                materials.push(...child.material);
              } else {
                materials.push(child.material);
              }
            }
          });

          if (geometries.length === 0) {
            reject(new Error("No meshes found in FBX"));
            return;
          }

          // Merge all geometries
          const mergedGeometry = BufferGeometryUtils.mergeGeometries(geometries);

          // Create material
          const material = materials[0].clone() as THREE.MeshPhongMaterial;
          // material.transparent = false;
          material.opacity = 1;
          material.shininess = 0;
          material.flatShading = true;
          material.reflectivity = 0;

          material.vertexColors = false;
          material.side = THREE.FrontSide;
          material.needsUpdate = true;

          // Create merged mesh
          const mergedMesh = new THREE.Mesh(mergedGeometry, material);
          mergedMesh.scale.setScalar(scale);
          mergedMesh.updateMatrix();

          resolve({
            geometry: mergedGeometry,
            material: material,
            object: mergedMesh,
            scale,
          });
        },
        undefined,
        reject
      );
    });
  }
}
