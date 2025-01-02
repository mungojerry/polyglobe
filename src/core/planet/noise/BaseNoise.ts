export interface BaseNoise {
  getValue(x: number, y: number, z: number): number;
  clearCache(): void;
  getConfig(): any;
}
