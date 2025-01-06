import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader";

export interface ModelMeshData {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshPhongMaterial;
  worldMatrix: THREE.Matrix4;
  parentMatrix?: THREE.Matrix4;
}

export interface ModelData {
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

    // Update all world matrices
    fbx.updateWorldMatrix(true, true);

    fbx.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mesh = child as THREE.Mesh;
        const geometry = mesh.geometry;

        // make sure geoemtry is indexed and not non indexed
        if (!geometry.index) {
          const indices = [];
          for (let i = 0; i < geometry.attributes.position.count; i++) {
            indices.push(i);
          }
          geometry.setIndex(indices);
        }
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
            if (!group) {
              console.warn(`Can\'t find material index ${matIndex} for ${material.name}`);
              return;
            }

            // Create new geometry for this material
            const partGeometry = new THREE.BufferGeometry();

            // Get indices for this group
            const indices = [];
            if (indexAttr) {
              for (let i = group.start; i < group.start + group.count; i++) {
                indices.push(indexAttr.getX(i));
              }
            } else {
              console.warn(`Geometry is non indexed: ${material.name}`);
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
            partGeometry.computeVertexNormals();

            partGeometry.computeBoundingSphere();
            console.log(partGeometry.boundingSphere);
            console.log(partGeometry.attributes.position.count);
            partGeometry.scale(scale, scale, scale);
            const newMaterial = material.clone() as THREE.MeshPhongMaterial;
            newMaterial.flatShading = true;
            newMaterial.reflectivity = 0;
            newMaterial.shininess = 0;
            newMaterial.side = THREE.DoubleSide;
            newMaterial.transparent = false;
            newMaterial.needsUpdate = true;
            meshDatas.push({
              geometry: partGeometry,
              material: newMaterial,
              worldMatrix: mesh.matrixWorld.clone(),
              parentMatrix: mesh.parent?.matrixWorld.clone(),
            });
          });
        } else {
          console.log("single material");
          const newMaterial = mesh.material.clone() as THREE.MeshPhongMaterial;
          newMaterial.flatShading = true;
          newMaterial.reflectivity = 0;
          newMaterial.shininess = 0;
          newMaterial.transparent = false;
          newMaterial.side = THREE.DoubleSide;
          newMaterial.needsUpdate = true;

          const newGeometry = geometry.clone();
          newGeometry.computeVertexNormals();
          newGeometry.scale(scale, scale, scale);
          // Single material case
          meshDatas.push({
            geometry: newGeometry,
            material: newMaterial,
            worldMatrix: mesh.matrix.clone(),
            parentMatrix: mesh.parent?.matrixWorld.clone(),
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
