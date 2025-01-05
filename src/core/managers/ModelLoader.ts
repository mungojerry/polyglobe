import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader";

interface ModelData {
  meshes: Array<{
    geometry: THREE.BufferGeometry;
    material: THREE.Material;
    worldMatrix: THREE.Matrix4;
  }>;
  object: THREE.Object3D;
  scale: number;
}

export class ModelLoader {
  private meshCache: Map<string, Array<{ geometry: THREE.BufferGeometry; material: THREE.Material; worldMatrix: THREE.Matrix4 }>>;
  private objectCache: Map<string, THREE.Object3D>;

  constructor() {
    this.meshCache = new Map();
    this.objectCache = new Map();
  }

  public async loadModelForInstancing(filename: string, fileIndex: number, scale: number, noLeadingZero: boolean = false): Promise<ModelData> {
    const fullFilename = `${filename}_${!noLeadingZero ? ("" + fileIndex).padStart(2, "0") : fileIndex}.fbx`;
    const cacheKey = fullFilename;

    if (this.meshCache.has(cacheKey) && this.objectCache.has(cacheKey)) {
      return {
        meshes: this.meshCache.get(cacheKey)!,
        object: this.objectCache.get(cacheKey)!,
        scale,
      };
    }

    const modelData = await this.fetchModel(fullFilename, scale);
    this.cacheModelData(cacheKey, modelData);
    return modelData;
  }

  private cacheModelData(cacheKey: string, modelData: ModelData): void {
    this.meshCache.set(cacheKey, modelData.meshes);
    this.objectCache.set(cacheKey, modelData.object);
  }

  // private async fetchModel(filename: string, scale: number): Promise<ModelData> {
  //   return new Promise((resolve, reject) => {
  //     const loader = new FBXLoader();
  //     loader.load(
  //       filename,
  //       (object) => {
  //         // Collect all geometries and materials
  //         const geometries: THREE.BufferGeometry[] = [];
  //         const materials: THREE.Material[] = [];

  //         object.traverse((child) => {
  //           if (child instanceof THREE.Mesh) {
  //             // Clone geometry to avoid sharing
  //             const geom = child.geometry.clone();

  //             // Apply mesh's transform to geometry
  //             geom.applyMatrix4(child.matrixWorld);
  //             geometries.push(geom);

  //             // Store material
  //             if (Array.isArray(child.material)) {
  //               materials.push(...child.material);
  //             } else {
  //               materials.push(child.material);
  //             }
  //           }
  //         });

  //         if (geometries.length === 0) {
  //           reject(new Error("No meshes found in FBX"));
  //           return;
  //         }

  //         // Merge all geometries
  //         const mergedGeometry = BufferGeometryUtils.mergeGeometries(geometries);

  //         // Create material
  //         const material = materials[0].clone() as THREE.MeshPhongMaterial;
  //         // material.transparent = false;
  //         material.opacity = 1;
  //         material.shininess = 0;
  //         material.flatShading = true;
  //         material.reflectivity = 0;

  //         material.vertexColors = false;
  //         material.side = THREE.DoubleSide;
  //         material.needsUpdate = true;

  //         // Create merged mesh
  //         const mergedMesh = new THREE.Mesh(mergedGeometry, material);
  //         mergedMesh.scale.setScalar(scale);
  //         mergedMesh.updateMatrix();

  //         resolve({
  //           geometry: mergedGeometry,
  //           material: material,
  //           object: mergedMesh,
  //           scale,
  //         });
  //       },
  //       undefined,
  //       reject
  //     );
  //   });
  // }

  private async fetchModel(filename: string, scale: number): Promise<ModelData> {
    return new Promise((resolve, reject) => {
      const loader = new FBXLoader();
      loader.load(
        filename,
        (object) => {
          const meshData: Array<{
            geometry: THREE.BufferGeometry;
            material: THREE.Material;
            worldMatrix: THREE.Matrix4;
          }> = [];

          object.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              const geometry = child.geometry.clone();
              const material = child.material instanceof Array ? child.material[0].clone() : child.material.clone();

              material.transparent = false;
              material.opacity = 1;
              material.side = THREE.DoubleSide;
              material.needsUpdate = true;

              child.updateWorldMatrix(true, false);
              const worldMatrix = child.matrixWorld.clone();

              meshData.push({
                geometry,
                material,
                worldMatrix,
              });
            }
          });

          object.scale.setScalar(scale);
          object.updateMatrixWorld(true);

          resolve({
            meshes: meshData,
            object: object,
            scale,
          });
        },
        undefined,
        reject
      );
    });
  }
}
