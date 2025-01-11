export class LRUCache<K, V> {
  private cache: Map<K, V>;
  private keyOrder: K[];
  private readonly capacity: number;

  constructor(capacity: number) {
    this.cache = new Map<K, V>();
    this.keyOrder = [];
    this.capacity = capacity;
  }

  public get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move key to most recently used position
      const index = this.keyOrder.indexOf(key);
      this.keyOrder.splice(index, 1);
      this.keyOrder.push(key);
    }
    return value;
  }

  public set(key: K, value: V): void {
    if (this.cache.has(key)) {
      // Update existing key
      this.cache.set(key, value);
      const index = this.keyOrder.indexOf(key);
      this.keyOrder.splice(index, 1);
      this.keyOrder.push(key);
    } else {
      // Add new key
      if (this.cache.size >= this.capacity) {
        // Remove least recently used item
        const lruKey = this.keyOrder.shift();
        if (lruKey !== undefined) {
          this.cache.delete(lruKey);
        }
      }
      this.cache.set(key, value);
      this.keyOrder.push(key);
    }
  }

  public clear(): void {
    this.cache.clear();
    this.keyOrder = [];
  }

  public size(): number {
    return this.cache.size;
  }
}
