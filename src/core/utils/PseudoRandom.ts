class PseudoRandomNumberGenerator {
  private static instance: PseudoRandomNumberGenerator | null = null;
  private seed: number = 23000;
  private readonly a: number = 1664525; // Multiplier
  private readonly c: number = 1013904223; // Increment
  private readonly m: number = 4294967296; // Modulus (2^32)

  private constructor(seed: number) {
    this.seed = seed;
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
}

export const pseudoRandom = PseudoRandomNumberGenerator.getInstance(10182);
