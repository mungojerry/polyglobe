import { SimplexNoise } from "three/examples/jsm/math/SimplexNoise";
import { PseudoRandomNumberGenerator } from "./PseudoRandom";

export class NoiseTable {
  private static readonly TABLE_SIZE = 256;
  private static readonly TABLE_SCALE = 1004.0; // Controls how "zoomed in" the noise is

  static generateTable(seed: number): Float32Array {
    const size = this.TABLE_SIZE;
    const totalSize = size * size * size;
    const table = new Float32Array(totalSize);

    const noise = new SimplexNoise(new PseudoRandomNumberGenerator(seed));

    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        for (let z = 0; z < size; z++) {
          const nx = (x / size) * this.TABLE_SCALE;
          const ny = (y / size) * this.TABLE_SCALE;
          const nz = (z / size) * this.TABLE_SCALE;

          const index = x * size * size + y * size + z;
          table[index] = noise.noise3d(nx, ny, nz);
        }
      }
    }

    return table;
  }

  static sampleNoise(table: Float32Array, x: number, y: number, z: number): number {
    const size = this.TABLE_SIZE;

    // Wrap coordinates
    const ix = Math.floor(x) & (size - 1);
    const iy = Math.floor(y) & (size - 1);
    const iz = Math.floor(z) & (size - 1);

    // Get fractional parts for interpolation
    const fx = x - Math.floor(x);
    const fy = y - Math.floor(y);
    const fz = z - Math.floor(z);

    // Trilinear interpolation
    const index000 = ix * size * size + iy * size + iz;
    const index001 = ix * size * size + iy * size + ((iz + 1) & (size - 1));
    const index010 = ix * size * size + ((iy + 1) & (size - 1)) * size + iz;
    const index011 = ix * size * size + ((iy + 1) & (size - 1)) * size + ((iz + 1) & (size - 1));
    const index100 = ((ix + 1) & (size - 1)) * size * size + iy * size + iz;
    const index101 = ((ix + 1) & (size - 1)) * size * size + iy * size + ((iz + 1) & (size - 1));
    const index110 = ((ix + 1) & (size - 1)) * size * size + ((iy + 1) & (size - 1)) * size + iz;
    const index111 = ((ix + 1) & (size - 1)) * size * size + ((iy + 1) & (size - 1)) * size + ((iz + 1) & (size - 1));

    return this.trilinearInterpolation(
      table[index000],
      table[index001],
      table[index010],
      table[index011],
      table[index100],
      table[index101],
      table[index110],
      table[index111],
      fx,
      fy,
      fz
    );
  }

  private static trilinearInterpolation(
    v000: number,
    v001: number,
    v010: number,
    v011: number,
    v100: number,
    v101: number,
    v110: number,
    v111: number,
    x: number,
    y: number,
    z: number
  ): number {
    const x1 = this.smoothstep(x);
    const y1 = this.smoothstep(y);
    const z1 = this.smoothstep(z);

    return this.lerp(
      this.lerp(this.lerp(v000, v001, z1), this.lerp(v010, v011, z1), y1),
      this.lerp(this.lerp(v100, v101, z1), this.lerp(v110, v111, z1), y1),
      x1
    );
  }

  private static smoothstep(t: number): number {
    return t * t * (3 - 2 * t);
  }

  private static lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }
}
