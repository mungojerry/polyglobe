export type GeometryBuffers = {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  vertexCount: number;
};

export type GeometryWorkerInput = {
  type: "generateGeometry";
  scalarField: Float32Array;
  temperatures: Float32Array;
  humidities: Float32Array;
  totalSize: number;
  gridSize: number;
  cubeSize: number;
  isoLevel: number;
  padding: number;
};

export type GeometryWorkerOutput = {
  type: "geometryGenerated";
  buffers: GeometryBuffers;
};
