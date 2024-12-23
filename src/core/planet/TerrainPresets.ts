export type TerrainPreset = {
  name: string;
  cellSize: number;
  jitter: number;
  amplitude: number;
  blendFactor: number;
  octaves: number;
  persistence: number;
  lacunarity: number;
  warpStrength: number;
  ridgeOffset: number;
  turbulence: number;
};

export enum TerrainPresetEnum {
  PLAINS = "PLAINS",
  SNOW_PEAKS = "SNOW_PEAKS",
}
export const TERRAIN_PRESETS: { [key in TerrainPresetEnum]: TerrainPreset } = {
  [TerrainPresetEnum.PLAINS]: {
    name: "Plains",
    cellSize: 1.0,
    jitter: 0.5,
    amplitude: 1.0,
    blendFactor: 0.85,
    octaves: 4,
    persistence: 0.5,
    lacunarity: 2.0,
    warpStrength: 0.1,
    ridgeOffset: 1.0,
    turbulence: 0.5,
  },
  [TerrainPresetEnum.SNOW_PEAKS]: {
    name: "Snow Peaks",
    cellSize: 1.0,
    jitter: 0.45,
    amplitude: 1.0,
    blendFactor: 0.85,
    octaves: 4,
    persistence: 0.5,
    lacunarity: 1.0,
    warpStrength: 0.1,
    ridgeOffset: 1.0,
    turbulence: 0.5,
  },
};
