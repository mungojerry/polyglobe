import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader";

interface ModelMeshData {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshPhongMaterial;
  worldMatrix: THREE.Matrix4;
}

interface ModelData {
  meshes: ModelMeshData[];
  scale: number;
}

export class ModelLoader {
  private meshCache: Map<string, ModelMeshData[]>;

  constructor() {
    this.meshCache = new Map();
  }

  public async loadModelForInstancing(filename: string, fileIndex: number, scale: number, noLeadingZero: boolean = false): Promise<ModelData> {
    const fullFilename = `${filename}_${!noLeadingZero ? String(fileIndex).padStart(2, "0") : fileIndex}.fbx`;
    const cacheKey = fullFilename;

    if (this.meshCache.has(cacheKey)) {
      return {
        meshes: this.meshCache.get(cacheKey)!,
        scale,
      };
    }

    const loader = new FBXLoader();
    const fbx = await loader.loadAsync(`${fullFilename}`);
    const meshDatas: ModelMeshData[] = [];

    fbx.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mesh = child as THREE.Mesh;
        const geometry = mesh.geometry;
        mesh.updateWorldMatrix(true, true);

        console.log("Processing mesh:", {
          name: child.name,
          hasMaterials: Array.isArray(mesh.material),
          materialsCount: Array.isArray(mesh.material) ? mesh.material.length : 1,
          geometryGroups: geometry.groups,
          geometryIndex: geometry.index ? geometry.index.count : 0,
          geometryVertices: geometry.attributes.position.count,
        });

        if (Array.isArray(mesh.material)) {
          const materials = mesh.material as THREE.MeshPhongMaterial[];
          const groups = geometry.groups;
          const indexAttr = geometry.index;
          const posAttr = geometry.attributes.position;
          const normAttr = geometry.attributes.normal;
          const uvAttr = geometry.attributes.uv;

          materials.forEach((material, matIndex) => {
            const group = groups.find((g) => g.materialIndex === matIndex);
            if (!group) return;

            // Create new geometry for this material
            const partGeometry = new THREE.BufferGeometry();

            // Get indices for this group
            const indices = [];
            if (indexAttr) {
              for (let i = group.start; i < group.start + group.count; i++) {
                indices.push(indexAttr.getX(i));
              }
            }

            // Track unique vertices and create mapping
            const uniqueVertices = new Map();
            const newIndices: number[] = [];
            const vertices: number[] = [];
            const normals: number[] = [];
            const uvs: number[] = [];

            // Process each index
            indices.forEach((oldIndex) => {
              if (!uniqueVertices.has(oldIndex)) {
                // Add new vertex
                const vertexIndex = vertices.length / 3;
                uniqueVertices.set(oldIndex, vertexIndex);

                // Copy position
                vertices.push(posAttr.getX(oldIndex), posAttr.getY(oldIndex), posAttr.getZ(oldIndex));

                // Copy normal if exists
                if (normAttr) {
                  normals.push(normAttr.getX(oldIndex), normAttr.getY(oldIndex), normAttr.getZ(oldIndex));
                }

                // Copy UV if exists
                if (uvAttr) {
                  uvs.push(uvAttr.getX(oldIndex), uvAttr.getY(oldIndex));
                }
              }

              // Add index to new buffer
              newIndices.push(uniqueVertices.get(oldIndex));
            });

            // Set attributes
            partGeometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
            if (normals.length > 0) {
              partGeometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
            }
            if (uvs.length > 0) {
              partGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
            }
            partGeometry.setIndex(newIndices);

            meshDatas.push({
              geometry: partGeometry,
              material: material.clone(),
              worldMatrix: mesh.matrixWorld.clone(),
            });
          });
        } else {
          console.log("single material");
          // Single material case
          meshDatas.push({
            geometry: geometry.clone(),
            material: (mesh.material as THREE.MeshPhongMaterial).clone(),
            worldMatrix: mesh.matrix.clone(),
          });
        }
      }
    });

    this.meshCache.set(cacheKey, meshDatas);

    return {
      meshes: meshDatas,
      scale,
    };
  }

  public dispose(): void {
    this.meshCache.forEach((meshes) => {
      meshes.forEach((mesh) => {
        mesh.geometry.dispose();
        mesh.material.dispose();
      });
    });
    this.meshCache.clear();
  }
}
