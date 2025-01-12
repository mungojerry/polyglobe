export interface Poolable {
  reset(): void;
  active: boolean;
}

export class ObjectPool<T extends Poolable> {
  private objects: T[];
  private createObject: () => T;
  private expandAmount: number;

  constructor(initialSize: number, createFn: () => T, expandAmount: number = Math.floor(initialSize * 0.5)) {
    this.createObject = createFn;
    this.expandAmount = expandAmount;
    this.objects = Array(initialSize).fill(null).map(() => this.createObject());
  }

  acquire(): T {
    // Find first inactive object
    const object = this.objects.find(obj => !obj.active);
    
    if (object) {
      object.active = true;
      return object;
    }

    // Expand pool if no inactive objects found
    this.expand();
    const newObject = this.objects[this.objects.length - 1];
    newObject.active = true;
    return newObject;
  }

  release(object: T): void {
    object.reset();
  }

  private expand(): void {
    const newObjects = Array(this.expandAmount)
      .fill(null)
      .map(() => this.createObject());
    this.objects.push(...newObjects);
  }

  clear(): void {
    this.objects.forEach(obj => obj.reset());
  }

  getActiveCount(): number {
    return this.objects.filter(obj => obj.active).length;
  }

  getTotalCount(): number {
    return this.objects.length;
  }
}