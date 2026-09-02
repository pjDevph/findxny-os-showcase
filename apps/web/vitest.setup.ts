// Node 23 ships an experimental WebStorage that activates without a backing
// file, leaving localStorage with no working methods. jsdom would normally
// install its own, but Node's wins. Replace it with a tiny in-memory Map
// so tests have a working localStorage.
class MemoryStorage implements Storage {
  private readonly store = new Map<string, string>();
  get length(): number { return this.store.size; }
  clear(): void { this.store.clear(); }
  getItem(key: string): string | null { return this.store.get(key) ?? null; }
  key(i: number): string | null { return Array.from(this.store.keys())[i] ?? null; }
  removeItem(key: string): void { this.store.delete(key); }
  setItem(key: string, value: string): void { this.store.set(key, String(value)); }
}

Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), writable: true });
Object.defineProperty(globalThis, "sessionStorage", { value: new MemoryStorage(), writable: true });
