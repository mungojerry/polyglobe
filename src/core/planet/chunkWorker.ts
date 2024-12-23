import * as THREE from "three";
import { vectorPool } from "../utils/vectorPool";

self.onmessage = (event) => {
  const { source, lat, lon, size } = event.data;

  const geometry = extractChunkGeometry(source, lat, lon, size);
  // Serialize the geometry
  const serializedGeometry = geometry.toJSON();
  self.postMessage({ geometry: serializedGeometry });
};

function extractChunkGeometry(source: THREE.BufferGeometry, lat: number, lon: number, size: number): THREE.BufferGeometry {
  // Pre-calculate constants
  const EPS = THREE.MathUtils.degToRad(1.0);
  const LAT_MIN = THREE.MathUtils.degToRad(lat) - EPS;
  const LAT_MAX = THREE.MathUtils.degToRad(lat + size) + EPS;
  const LON_MIN = THREE.MathUtils.degToRad(lon) - EPS;
  const LON_MAX = THREE.MathUtils.degToRad(lon + size) + EPS;

  // Reuse objects from the [`vectorPool`](src/core/utils/vectorPool.ts)
  const tempVec = vectorPool.getVector();
  const spherical = new THREE.Spherical();

  // Get attributes once
  const positionAttr = source.attributes.position;
  const colorAttr = source.attributes.color;
  const indexAttr = source.index;
  const posArray = positionAttr.array;
  const colArray = colorAttr.array;

  // Pre-allocate arrays with exact size needed
  const maxVertices = Math.ceil(positionAttr.count * (size / 360));
  const interleavedData = new Float32Array(maxVertices * 6);
  const vertexMap = new Int32Array(positionAttr.count).fill(-1);
  let vertexCount = 0;

  // Faster vertex processing
  const processVertex = (i: number): boolean => {
    const ix = i * 3;
    tempVec.set(posArray[ix], posArray[ix + 1], posArray[ix + 2]);
    spherical.setFromVector3(tempVec);
    const vertexLat = Math.PI / 2 - spherical.phi;
    const vertexLon = THREE.MathUtils.euclideanModulo(spherical.theta + Math.PI, Math.PI * 2) - Math.PI;

    return vertexLat >= LAT_MIN && vertexLat <= LAT_MAX && vertexLon >= LON_MIN && vertexLon <= LON_MAX;
  };

  // Fast vertex copying
  const copyVertex = (srcIdx: number, destIdx: number): void => {
    const src = srcIdx * 3;
    const dest = destIdx * 6;
    // Copy position
    interleavedData[dest] = posArray[src];
    interleavedData[dest + 1] = posArray[src + 1];
    interleavedData[dest + 2] = posArray[src + 2];
    // Copy color
    interleavedData[dest + 3] = colArray[src];
    interleavedData[dest + 4] = colArray[src + 1];
    interleavedData[dest + 5] = colArray[src + 2];
  };

  // Process vertices and build geometry
  const geometry = new THREE.BufferGeometry();

  if (indexAttr) {
    const indexArray = indexAttr.array;
    const filteredIndices = new Uint32Array(indexArray.length);
    let indexCount = 0;

    // Process indexed geometry
    for (let i = 0; i < indexArray.length; i += 3) {
      const a = indexArray[i];
      const b = indexArray[i + 1];
      const c = indexArray[i + 2];

      if (processVertex(a) || processVertex(b) || processVertex(c)) {
        // Add vertices if not already added
        if (vertexMap[a] === -1) {
          vertexMap[a] = vertexCount;
          copyVertex(a, vertexCount++);
        }
        if (vertexMap[b] === -1) {
          vertexMap[b] = vertexCount;
          copyVertex(b, vertexCount++);
        }
        if (vertexMap[c] === -1) {
          vertexMap[c] = vertexCount;
          copyVertex(c, vertexCount++);
        }

        // Add triangle indices
        filteredIndices[indexCount++] = vertexMap[a];
        filteredIndices[indexCount++] = vertexMap[b];
        filteredIndices[indexCount++] = vertexMap[c];
      }
    }

    geometry.setIndex(new THREE.BufferAttribute(filteredIndices.slice(0, indexCount), 1));
  } else {
    // Process non-indexed geometry
    for (let i = 0; i < positionAttr.count; i++) {
      if (processVertex(i)) {
        vertexMap[i] = vertexCount;
        copyVertex(i, vertexCount++);
      }
    }
  }

  // Create final buffer
  const finalData = new Float32Array(interleavedData.buffer, 0, vertexCount * 6);
  const interleavedBuffer = new THREE.InterleavedBuffer(finalData, 6);
  geometry.setAttribute("position", new THREE.InterleavedBufferAttribute(interleavedBuffer, 3, 0));
  geometry.setAttribute("color", new THREE.InterleavedBufferAttribute(interleavedBuffer, 3, 3));
  geometry.computeVertexNormals();

  // Clean up
  vectorPool.releaseVector(tempVec);

  return geometry;
}
