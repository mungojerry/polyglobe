export class ObjectPool<T> {
  private objects: T[];
  public activeObjects: T[];
  private createObject: () => T;
  private expandAmount: number;

  constructor(initialSize: number, createFn: () => T, expandAmount: number = Math.floor(initialSize * 0.5)) {
    this.createObject = createFn;
    this.expandAmount = expandAmount;
    this.activeObjects = [];
    this.objects = Array(initialSize)
      .fill(null)
      .map(() => this.createObject());
  }

  acquire(): T {
    const object = this.objects.shift();

    if (object) {
      this.activeObjects.push(object);
      return object;
    }

    // Expand pool if no inactive objects found
    this.expand();
    const newObject = this.objects.shift();
    if (!newObject) {
      throw new Error("Failed to acquire object from pool");
    }
    this.activeObjects.push(newObject);
    return newObject;
  }

  release(object: T): void {
    const index = this.activeObjects.indexOf(object);
    if (index === -1) {
      throw new Error("Attempting to release an object that isn't active");
    }
    this.objects.push(object);
    this.activeObjects.splice(index, 1); // More efficient than filter
  }

  private expand(): void {
    const newObjects = Array(this.expandAmount)
      .fill(null)
      .map(() => this.createObject());
    this.objects.push(...newObjects);
  }

  clear(): void {
    this.activeObjects.forEach((obj) => this.objects.push(obj));
    this.activeObjects = [];
  }

  getActiveCount(): number {
    return this.activeObjects.length;
  }

  getTotalCount(): number {
    return this.objects.length + this.activeObjects.length;
  }

  isActive(object: T): boolean {
    return this.activeObjects.includes(object);
  }
}
