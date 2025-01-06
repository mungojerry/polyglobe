import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader";
import { InstancedMeshData } from "./ObjectManager";
export interface ModelData {
  meshes: InstancedMeshData[];
  scale: number;
}
export class ModelLoader {
  private meshCache: Map<string, InstancedMeshData[]>;
  private maxInstances: number;

  constructor(maxInstances: number = 1000) {
    this.meshCache = new Map();
    this.maxInstances = maxInstances;
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
    const instancedMeshes: InstancedMeshData[] = [];

    fbx.updateWorldMatrix(true, true);

    fbx.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      const mesh = child as THREE.Mesh;
      mesh.updateMatrix();
      mesh.updateWorldMatrix(true, true);

      const geometry = this.ensureIndexedGeometry(mesh.geometry);

      if (Array.isArray(mesh.material)) {
        this.processMultiMaterialMesh(mesh, geometry, scale, instancedMeshes);
      } else {
        this.processSingleMaterialMesh(mesh, geometry, scale, instancedMeshes);
      }
    });

    this.meshCache.set(cacheKey, instancedMeshes);

    return {
      meshes: instancedMeshes,
      scale,
    };
  }

  private createInstancedMesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    worldMatrix: THREE.Matrix4,
    parentMatrix?: THREE.Matrix4
  ): InstancedMeshData {
    const instancedMesh = new THREE.InstancedMesh(geometry, material, this.maxInstances);
    instancedMesh.count = 0; // Start with 0 instances
    instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    return {
      instancedMesh,
      originalWorldMatrix: worldMatrix,
      parentMatrix,
    };
  }
  private ensureIndexedGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    if (!geometry.index) {
      const indices = Array.from({ length: geometry.attributes.position.count }, (_, i) => i);
      geometry.setIndex(indices);
    }
    return geometry;
  }

  private createStandardMaterial(originalMaterial: THREE.Material): THREE.MeshPhongMaterial {
    const material = originalMaterial.clone() as THREE.MeshPhongMaterial;
    material.flatShading = true;
    material.reflectivity = 0;
    material.shininess = 0;
    material.side = THREE.DoubleSide;
    material.transparent = false;
    material.needsUpdate = true;
    return material;
  }

  private processMultiMaterialMesh(mesh: THREE.Mesh, geometry: THREE.BufferGeometry, scale: number, instancedMeshes: InstancedMeshData[]) {
    const materials = mesh.material as THREE.MeshPhongMaterial[];
    const groups = geometry.groups;

    if (groups.length === 0 && materials.length > 0) {
      const verticesPerMaterial = Math.floor(geometry.attributes.position.count / materials.length);
      materials.forEach((_, index) => {
        const start = index * verticesPerMaterial;
        const count = index === materials.length - 1 ? geometry.attributes.position.count - start : verticesPerMaterial;

        geometry.addGroup(start, count, index);
      });
    }

    geometry.groups.forEach((group) => {
      const materialIndex = group.materialIndex ?? 0;
      if (materialIndex >= materials.length) {
        console.warn(`Invalid material index ${materialIndex} for mesh ${mesh.name}`);
        return;
      }

      const material = materials[materialIndex];
      const partGeometry = this.processPartGeometry(geometry, scale, group);

      if (partGeometry.attributes.position.count === 0) {
        console.warn(`Empty geometry created for material ${material.name} in mesh ${mesh.name}`);
        return;
      }

      instancedMeshes.push(
        this.createInstancedMesh(partGeometry, this.createStandardMaterial(material), mesh.matrixWorld.clone(), mesh.parent?.matrixWorld.clone())
      );
    });
  }

  private processSingleMaterialMesh(mesh: THREE.Mesh, geometry: THREE.BufferGeometry, scale: number, instancedMeshes: InstancedMeshData[]) {
    const newGeometry = geometry.clone();
    newGeometry.computeVertexNormals();
    newGeometry.scale(scale, scale, scale);

    instancedMeshes.push(
      this.createInstancedMesh(
        newGeometry,
        this.createStandardMaterial(mesh.material as THREE.Material),
        mesh.matrixWorld.clone(),
        mesh.parent?.matrixWorld.clone()
      )
    );
  }

  private processPartGeometry(
    geometry: THREE.BufferGeometry,
    scale: number,
    group: { start: number; count: number; materialIndex?: number }
  ): THREE.BufferGeometry {
    const indexAttr = geometry.index!; // We ensure this exists in ensureIndexedGeometry
    const posAttr = geometry.attributes.position;
    const normAttr = geometry.attributes.normal;
    const uvAttr = geometry.attributes.uv;

    // Create new geometry for this material group
    const partGeometry = new THREE.BufferGeometry();

    // Create lookup for faster vertex deduplication
    const vertexMap = new Map<string, number>();
    const vertices: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const newIndices: number[] = [];

    // Process indices for this group
    for (let i = group.start; i < group.start + group.count; i++) {
      const oldIndex = indexAttr.getX(i);

      // Create unique key for vertex deduplication
      const key = [
        posAttr.getX(oldIndex),
        posAttr.getY(oldIndex),
        posAttr.getZ(oldIndex),
        normAttr?.getX(oldIndex) ?? 0,
        normAttr?.getY(oldIndex) ?? 0,
        normAttr?.getZ(oldIndex) ?? 0,
        uvAttr?.getX(oldIndex) ?? 0,
        uvAttr?.getY(oldIndex) ?? 0,
      ].join(",");

      let newIndex = vertexMap.get(key);

      if (newIndex === undefined) {
        newIndex = vertices.length / 3;
        vertexMap.set(key, newIndex);

        // Add vertex data
        vertices.push(posAttr.getX(oldIndex), posAttr.getY(oldIndex), posAttr.getZ(oldIndex));

        // Add normal data if available
        if (normAttr) {
          normals.push(normAttr.getX(oldIndex), normAttr.getY(oldIndex), normAttr.getZ(oldIndex));
        }

        // Add UV data if available
        if (uvAttr) {
          uvs.push(uvAttr.getX(oldIndex), uvAttr.getY(oldIndex));
        }
      }

      newIndices.push(newIndex);
    }

    // Set attributes
    partGeometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    if (normals.length > 0) {
      partGeometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    }
    if (uvs.length > 0) {
      partGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    }
    partGeometry.setIndex(newIndices);

    // Final geometry processing
    partGeometry.scale(scale, scale, scale);
    partGeometry.computeVertexNormals();
    partGeometry.computeBoundingSphere();

    return partGeometry;
  }

  public dispose(): void {
    this.meshCache.forEach((meshes) => {
      meshes.forEach((mesh) => {
        mesh.instancedMesh.geometry.dispose();
        if (Array.isArray(mesh.instancedMesh.material)) {
          mesh.instancedMesh.material.forEach((material) => material.dispose());
        } else {
          mesh.instancedMesh.material.dispose();
        }
      });
    });
    this.meshCache.clear();
  }
}
