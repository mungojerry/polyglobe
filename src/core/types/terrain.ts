export interface TerrainChunk {
  mesh: THREE.Mesh;
  debugMesh: THREE.LineSegments;
  position: THREE.Vector3;
  scalarField: Float32Array;
  temperatures: Float32Array; // Add these new properties
  humidities: Float32Array; // to store climate data
  totalSize: number; // Add this to store dimensions
}
export interface WorkerMessage {
  type: string;
  chunkX: number;
  chunkZ: number;
  field: Float32Array;
  temperatures: Float32Array;
  humidities: Float32Array;
}

// Add these new interfaces at the top with other interfaces
export interface WorkerQueueItem {
  chunkX: number;
  chunkZ: number;
  resolve: (field: Float32Array, temperatures: Float32Array, humidities: Float32Array) => void;
  reject: (error: any) => void;
}

export type Biome = {
  name: string;
  color: THREE.Color;
  temperatureRange: [number, number];
  humidityRange: [number, number];
  terrainScale: number;
  terrainHeight: number;
};

export type TerrainGenerateMessage = {
  type: "generateTerrain";
  chunkX: number;
  chunkZ: number;
  gridSize: number;
  padding: number;
  seed: number;
};
