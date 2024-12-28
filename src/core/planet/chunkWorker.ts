import * as THREE from "three";
import { BufferAttribute, BufferGeometry, InterleavedBuffer, InterleavedBufferAttribute, MathUtils, Spherical, Vector3 } from "three";
// Create a minimal vector pool for worker
const workerVectorPool = {
  vector: new Vector3(),
  getVector: function (x = 0, y = 0, z = 0) {
    this.vector.set(x, y, z);
    return this.vector;
  },
};
let geometryObj: THREE.BufferGeometry;
self.onmessage = (event) => {
  try {
    const { source, lat, lon, size } = event.data;
    const loader = new THREE.BufferGeometryLoader();
    if (!geometryObj) geometryObj = loader.parse(source);
    const geometry = extractChunkGeometry(geometryObj, lat, lon, size, (progress) => {
      self.postMessage({ type: "progress", progress });
    });

    // Serialize the geometry
    const serializedGeometry = geometry.toJSON();
    self.postMessage({
      type: "complete",
      geometry: serializedGeometry,
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      error: error instanceof Error ? error.message : "Unknown error in chunk worker",
    });
  }
};

function extractChunkGeometry(source: BufferGeometry, lat: number, lon: number, size: number, onProgress: (progress: number) => void): BufferGeometry {
  try {
    // Pre-calculate constants
    const EPS = MathUtils.degToRad(1.0);
    const LAT_MIN = MathUtils.degToRad(lat) - EPS;
    const LAT_MAX = MathUtils.degToRad(lat + size) + EPS;
    const LON_MIN = MathUtils.degToRad(lon) - EPS;
    const LON_MAX = MathUtils.degToRad(lon + size) + EPS;

    // Reuse objects
    const tempVec = workerVectorPool.getVector();
    const spherical = new Spherical();

    // Get attributes once
    const positionAttr = source.attributes.position;
    const colorAttr = source.attributes.color;
    const indexAttr = source.index;
    const posArray = positionAttr.array as Float32Array;
    const colArray = colorAttr.array as Float32Array;

    // Pre-allocate arrays with exact size needed
    const maxVertices = Math.ceil(positionAttr.count * (size / 360));
    const interleavedData = new Float32Array(maxVertices * 6);
    const vertexMap = new Int32Array(positionAttr.count).fill(-1);
    let vertexCount = 0;

    // Process vertices
    const processVertex = (i: number): boolean => {
      const ix = i * 3;
      tempVec.set(posArray[ix], posArray[ix + 1], posArray[ix + 2]);
      spherical.setFromVector3(tempVec);
      const vertexLat = Math.PI / 2 - spherical.phi;
      const vertexLon = MathUtils.euclideanModulo(spherical.theta + Math.PI, Math.PI * 2) - Math.PI;

      return vertexLat >= LAT_MIN && vertexLat <= LAT_MAX && vertexLon >= LON_MIN && vertexLon <= LON_MAX;
    };

    // Copy vertex data
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

    // Create geometry
    const geometry = new BufferGeometry();

    if (indexAttr) {
      const indexArray = indexAttr.array as Uint32Array;
      const filteredIndices = new Uint32Array(indexArray.length);
      let indexCount = 0;

      // Process indexed geometry

      for (let i = 0; i < indexArray.length; i += 3) {
        if (i % 300 === 0) {
          onProgress((i / indexArray.length) * 80);
        }

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

      onProgress(85);
      geometry.setIndex(new BufferAttribute(filteredIndices.slice(0, indexCount), 1));
    } else {
      // Process non-indexed geometry
      for (let i = 0; i < positionAttr.count; i++) {
        if (i % 100 === 0) {
          onProgress((i / positionAttr.count) * 80);
        }

        if (processVertex(i)) {
          vertexMap[i] = vertexCount;
          copyVertex(i, vertexCount++);
        }
      }
    }

    onProgress(90);

    // Create final buffer
    const finalData = new Float32Array(interleavedData.buffer, 0, vertexCount * 6);
    const interleavedBuffer = new InterleavedBuffer(finalData, 6);
    geometry.setAttribute("position", new InterleavedBufferAttribute(interleavedBuffer, 3, 0));
    geometry.setAttribute("color", new InterleavedBufferAttribute(interleavedBuffer, 3, 3));

    onProgress(95);

    geometry.computeVertexNormals();
    onProgress(100);

    return geometry;
  } catch (error) {
    console.error("Error in extractChunkGeometry:", error);
    throw error;
  }
}
