export class ObjectPool<T> {
  private pool: T[] = [];
  private acquired: Set<T> = new Set();
  private factory: () => T;
  private batchSize: number;

  constructor(factory: () => T, initialSize: number = 10, batchSize: number = 10) {
    this.factory = factory;
    this.batchSize = batchSize;
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(this.factory());
    }
  }

  acquire(): T {
    if (this.pool.length === 0) {
      this.growPool();
    }
    const obj = this.pool.pop()!;
    this.acquired.add(obj);
    return obj;
  }

  release(obj: T): void {
    if (this.acquired.has(obj)) {
      this.acquired.delete(obj);
      this.pool.push(obj);
    }
  }

  releaseAll(): void {
    this.acquired.forEach((obj) => this.pool.push(obj));
    this.acquired.clear();
  }

  private growPool(): void {
    for (let i = 0; i < this.batchSize; i++) {
      this.pool.push(this.factory());
    }
  }

  size(): number {
    return this.pool.length;
  }

  acquiredSize(): number {
    return this.acquired.size;
  }
}
