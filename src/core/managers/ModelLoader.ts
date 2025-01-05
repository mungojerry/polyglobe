import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils";

interface ModelData {
  meshes: Array<{
    geometry: THREE.BufferGeometry;
    material: THREE.MeshPhongMaterial;
    worldMatrix: THREE.Matrix4;
  }>;
  scale: number;
}

export class ModelLoader {
  private meshCache: Map<string, Array<{ geometry: THREE.BufferGeometry; material: THREE.MeshPhongMaterial; worldMatrix: THREE.Matrix4 }>>;

  constructor() {
    this.meshCache = new Map();
  }

  public async loadModelForInstancing(filename: string, fileIndex: number, scale: number, noLeadingZero: boolean = false): Promise<ModelData> {
    const fullFilename = `${filename}_${!noLeadingZero ? String(fileIndex).padStart(2, "0") : fileIndex}.fbx`;
    const cacheKey = fullFilename;

    console.log(`Attempting to load model: ${fullFilename}`);

    if (this.meshCache.has(cacheKey)) {
      return {
        meshes: this.meshCache.get(cacheKey)!,
        scale,
      };
    }

    const modelData = await this.fetchModel(fullFilename, scale);
    this.cacheModelData(cacheKey, modelData);
    return modelData;
  }

  private cacheModelData(cacheKey: string, modelData: ModelData): void {
    this.meshCache.set(cacheKey, modelData.meshes);
  }

  private async fetchModel(filename: string, scale: number): Promise<ModelData> {
    return new Promise((resolve, reject) => {
      const loader = new FBXLoader();

      const onProgress = (event: ProgressEvent) => {
        if (event.lengthComputable) {
          const percentComplete = (event.loaded / event.total) * 100;
          console.log(`Loading progress: ${Math.round(percentComplete)}%`);
        }
      };

      loader.load(
        filename,
        (object) => {
          console.log(`Loading model: ${filename}`, {
            children: object.children.length,
            meshes: object.children.filter((c) => c instanceof THREE.Mesh).length,
          });
          const geometries: THREE.BufferGeometry[] = [];
          const combinedGeometry = new THREE.BufferGeometry();
          const materials: THREE.Material[] = [];

          // Normalize the model scale first
          const normalizeScale = 1 / Math.max(...object.scale.toArray(), Number.EPSILON); // Prevent division by zero
          object.scale.setScalar(normalizeScale * scale); // Apply the requested scale
          object.updateMatrixWorld(true);

          object.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              const geometry = new THREE.BufferGeometry().copy(child.geometry);
              geometry.applyMatrix4(child.matrixWorld);

              // Check for UVs
              const hasUV = geometry.attributes.uv !== undefined;
              console.log(`Mesh "${child.name}" has UVs: ${hasUV}`);

              // Handle multiple materials
              const childMaterials = Array.isArray(child.material) ? child.material.map((m) => m.clone()) : [child.material.clone()];

              childMaterials.forEach((material) => {
                // Ensure the material is MeshPhongMaterial
                const phongMaterial = new THREE.MeshPhongMaterial();
                phongMaterial.copy(material as THREE.MeshPhongMaterial);

                // Preserve maps only if UVs are present
                if (hasUV) {
                  if ((child.material as THREE.MeshPhongMaterial).map) {
                    phongMaterial.map = (child.material as THREE.MeshPhongMaterial).map;
                  }
                  if ((child.material as THREE.MeshPhongMaterial).normalMap) {
                    phongMaterial.normalMap = (child.material as THREE.MeshPhongMaterial).normalMap;
                  }
                } else {
                  // Remove maps if UVs are missing to prevent shader errors
                  phongMaterial.map = null;
                  phongMaterial.normalMap = null;
                  phongMaterial.emissiveMap = null;
                  phongMaterial.bumpMap = null;
                  phongMaterial.envMap = null;
                  phongMaterial.lightMap = null;
                  phongMaterial.alphaMap = null;
                  phongMaterial.displacementMap = null;

                  console.warn(`UVs missing: Skipping texture assignments for material "${material.name}".`);
                }

                phongMaterial.reflectivity = 0;
                phongMaterial.side = THREE.FrontSide;
                phongMaterial.needsUpdate = true;
                materials.push(phongMaterial);
              });
              geometries.push(geometry);
            }
          });

          const bufferGeometry = mergeGeometries(geometries);
          bufferGeometry.scale(scale, scale, scale);

          resolve({
            meshes: [{ geometry: bufferGeometry, material: materials[0] as THREE.MeshPhongMaterial, worldMatrix: new THREE.Matrix4() }],
            scale,
          });
        },
        onProgress,
        (error: any) => {
          console.error(`Error loading model ${filename}:`, error);
          reject(new Error(`Failed to load model ${filename}: ${error.message}`));
        }
      );
    });
  }

  public dispose(): void {
    // Clean up resources
    this.meshCache.forEach((meshes) => {
      meshes.forEach((mesh) => {
        mesh.geometry.dispose();
        mesh.material.dispose();
      });
    });
    this.meshCache.clear();
  }
}
