import * as THREE from "three";
import { edgeTable, triTable } from "../scenes/MCDefs";
import { CUBE_CORNER_OFFSETS, DEGENERATE_EPSILON, EDGE_TO_VERTEX, INTERPOLATION_EPSILON } from "../scenes/constants";
import { GeometryBuffers, GeometryWorkerInput, GeometryWorkerOutput } from "../types/geometry";

const tempVectors: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

function interpolateVertex(v1: THREE.Vector3, v2: THREE.Vector3, val1: number, val2: number, isoLevel: number, cubeSize: number): THREE.Vector3 {
  const BIAS = 1e-10;
  const d1 = val1 - isoLevel;
  const d2 = val2 - isoLevel;

  const snapToGrid = (v: number) => {
    const snapThreshold = 1e-4;
    const remainder = v % cubeSize;
    if (Math.abs(remainder) < snapThreshold) {
      return Math.round(v / cubeSize) * cubeSize;
    }
    if (Math.abs(remainder - cubeSize) < snapThreshold) {
      return Math.ceil(v / cubeSize) * cubeSize;
    }
    return v;
  };

  if (d1 * d2 < 0) {
    const t = d1 / (d1 - d2);
    const x = snapToGrid(v1.x + (v2.x - v1.x) * t);
    const y = snapToGrid(v1.y + (v2.y - v1.y) * t);
    const z = snapToGrid(v1.z + (v2.z - v1.z) * t);
    return new THREE.Vector3(x, y, z);
  }

  if (Math.abs(d1) < INTERPOLATION_EPSILON || Math.abs(d2) < INTERPOLATION_EPSILON) {
    const midX = snapToGrid((v1.x + v2.x) * 0.5);
    const midY = snapToGrid((v1.y + v2.y) * 0.5);
    const midZ = snapToGrid((v1.z + v2.z) * 0.5);
    return new THREE.Vector3(midX, midY, midZ);
  }

  const t = Math.max(0, Math.min(1, (isoLevel - val1) / (val2 - val1 + BIAS)));
  const x = snapToGrid(v1.x + (v2.x - v1.x) * t);
  const y = snapToGrid(v1.y + (v2.y - v1.y) * t);
  const z = snapToGrid(v1.z + (v2.z - v1.z) * t);
  return new THREE.Vector3(x, y, z);
}

function isValidTriangle(v1: THREE.Vector3, v2: THREE.Vector3, v3: THREE.Vector3): boolean {
  if ([v1, v2, v3].some((v) => !Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z))) {
    return false;
  }

  const edge1 = new THREE.Vector3().subVectors(v2, v1);
  const edge2 = new THREE.Vector3().subVectors(v3, v1);
  const edge3 = new THREE.Vector3().subVectors(v3, v2);

  if (edge1.lengthSq() < DEGENERATE_EPSILON || edge2.lengthSq() < DEGENERATE_EPSILON || edge3.lengthSq() < DEGENERATE_EPSILON) {
    return false;
  }

  const normal = new THREE.Vector3().crossVectors(edge1, edge2);
  const areaSquared = normal.lengthSq() * 0.25;

  if (areaSquared < DEGENERATE_EPSILON) {
    return false;
  }

  const perimeter = edge1.length() + edge2.length() + edge3.length();
  const perimeterSq = perimeter * perimeter;
  if (areaSquared / perimeterSq < DEGENERATE_EPSILON) {
    return false;
  }

  return true;
}

function getBiomeColor(temperature: number, humidity: number, height: number, gridSize: number): THREE.Color {
  const heightNorm = Math.min(1, Math.max(0, height / gridSize));
  let baseColor: THREE.Color;

  if (heightNorm > 0.8) {
    baseColor = new THREE.Color(0xffffff);
  } else if (heightNorm > 0.6) {
    baseColor = new THREE.Color(0x666666);
  } else if (heightNorm > 0.2) {
    baseColor = new THREE.Color(0x567d46);
  } else {
    baseColor = new THREE.Color(0xe2c484);
    if (heightNorm < 0.02) {
      const wetSandColor = new THREE.Color(0xc2b280);
      baseColor.lerp(wetSandColor, 1 - heightNorm / 0.02);
    }
  }

  return baseColor;
}

function generateChunkGeometry(data: GeometryWorkerInput): GeometryBuffers {
  const triangles: THREE.Vector3[][] = [];
  const { scalarField, temperatures, humidities, totalSize, gridSize, cubeSize, isoLevel } = data;

  // Pre-calculate triangles
  for (let x = 0; x < totalSize - 1; x++) {
    for (let y = 0; y < totalSize - 1; y++) {
      for (let z = 0; z < totalSize - 1; z++) {
        // Get cube corners and values
        const corners = CUBE_CORNER_OFFSETS.map((offset) => new THREE.Vector3((x + offset.x) * cubeSize, (y + offset.y) * cubeSize, (z + offset.z) * cubeSize));

        const values = (() => {
          const getIndex = (x: number, y: number, z: number) => {
            x = Math.min(Math.max(x, 0), totalSize - 1);
            y = Math.min(Math.max(y, 0), totalSize - 1);
            z = Math.min(Math.max(z, 0), totalSize - 1);
            return (x * totalSize + y) * totalSize + z;
          };

          return [
            scalarField[getIndex(x, y, z)],
            scalarField[getIndex(x + 1, y, z)],
            scalarField[getIndex(x, y, z + 1)],
            scalarField[getIndex(x + 1, y, z + 1)],
            scalarField[getIndex(x, y + 1, z)],
            scalarField[getIndex(x + 1, y + 1, z)],
            scalarField[getIndex(x, y + 1, z + 1)],
            scalarField[getIndex(x + 1, y + 1, z + 1)],
          ];
        })();

        let cubeIndex = 0;
        for (let i = 0; i < 8; i++) {
          if (values[i] < isoLevel) {
            cubeIndex |= 1 << i;
          }
        }

        if (edgeTable[cubeIndex] === 0) continue;

        const tableTris = triTable[cubeIndex];
        if (!tableTris || tableTris.length === 0) continue;

        for (let i = 0; i < tableTris.length - 1; i += 3) {
          const vertices = [];
          let allValid = true;

          for (let j = 0; j < 3; j++) {
            const edgeIndex = tableTris[i + j];
            const [v1Index, v2Index] = EDGE_TO_VERTEX[edgeIndex];
            const vertex = interpolateVertex(corners[v1Index], corners[v2Index], values[v1Index], values[v2Index], isoLevel, cubeSize);

            if (!Number.isFinite(vertex.x) || !Number.isFinite(vertex.y) || !Number.isFinite(vertex.z)) {
              allValid = false;
              break;
            }
            vertices.push(vertex);
          }

          if (allValid && isValidTriangle(vertices[0], vertices[1], vertices[2])) {
            triangles.push(vertices);
          }
        }
      }
    }
  }

  // Create buffers
  const vertexCount = triangles.length * 3;
  const buffers: GeometryBuffers = {
    positions: new Float32Array(vertexCount * 3),
    normals: new Float32Array(vertexCount * 3),
    colors: new Float32Array(vertexCount * 3),
    indices: new Uint32Array(vertexCount),
    vertexCount,
  };

  // Fill buffers
  triangles.forEach((vertices, i) => {
    const baseIndex = i * 9;
    const indexBase = i * 3;

    vertices.forEach((vertex, j) => {
      const vIndex = baseIndex + j * 3;

      // Position
      buffers.positions[vIndex] = vertex.x;
      buffers.positions[vIndex + 1] = vertex.y;
      buffers.positions[vIndex + 2] = vertex.z;
      // Color
      const color = getBiomeColor(0.5, 0.5, vertex.y, gridSize);
      buffers.colors[vIndex] = color.r;
      buffers.colors[vIndex + 1] = color.g;
      buffers.colors[vIndex + 2] = color.b;

      // Index
      buffers.indices[indexBase + j] = indexBase + j;
    });
  });

  return buffers;
}

self.onmessage = (e: MessageEvent<GeometryWorkerInput>) => {
  if (e.data.type === "generateGeometry") {
    const buffers = generateChunkGeometry(e.data);
    const response: GeometryWorkerOutput = {
      type: "geometryGenerated",
      buffers,
    };
    self.postMessage(response, { transfer: [buffers.positions.buffer, buffers.normals.buffer, buffers.colors.buffer, buffers.indices.buffer] });
  }
};
