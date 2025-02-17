export class PseudoRandomNumberGenerator {
  private static instance: PseudoRandomNumberGenerator | null = null;
  private seed: number = 23000;
  private readonly a: number = 1664525; // Multiplier
  private readonly c: number = 1013904223; // Increment
  private readonly m: number = 4294967296; // Modulus (2^32)

  constructor(seed: number) {
    this.seed = seed;
  }

  public static createWithPosition(baseSeed: number, x: number, y: number, z: number): number {
    // Convert floating point coordinates to integers to avoid precision issues
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);

    // Use prime multipliers to give good distribution
    let hash = baseSeed;
    hash = (hash * 16807 + ix * 73856093) >>> 0; // >>> 0 keeps numbers unsigned 32-bit
    hash = (hash * 16807 + iy * 19349663) >>> 0;
    hash = (hash * 16807 + iz * 83492791) >>> 0;

    // Convert to float between 0-1
    return (hash & 0x7fffffff) / 0x7fffffff;
  }

  public static getInstance(seed: number = 0): PseudoRandomNumberGenerator {
    if (this.instance === null) {
      this.instance = new PseudoRandomNumberGenerator(seed);
    }
    return this.instance;
  }

  private next(): number {
    this.seed = (this.a * this.seed + this.c) % this.m;
    return this.seed / this.m; // Returns a number between 0 and 1
  }

  public random(): number {
    return this.next();
  }

  public randomInRange(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min; // Returns a number in the range [min, max]
  }

  public setSeed(newSeed: number): void {
    this.seed = newSeed;
  }

  public getSeed(): number {
    return this.seed;
  }
}

export const pseudoRandom = {
  seed: function (seed: number) {
    // Initialize seed
    let s = seed;
    this.random = () => {
      s = Math.sin(s) * 10000;
      return s - Math.floor(s);
    };
    // Warm up the generator
    for (let i = 0; i < 10; i++) this.random();
  },
  random: () => Math.random(), // Default to Math.random until seeded
};
