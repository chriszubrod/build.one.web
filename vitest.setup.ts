// Vitest setup — runs before every test file. Polyfills the browser
// APIs that jsdom doesn't ship by default but our cleanup code touches.

/** jsdom does not implement CSS.escape; react-aria selection code requires it. */
const cssEscape = (ident: string) => ident.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
if (typeof globalThis.CSS === "undefined") {
  Object.defineProperty(globalThis, "CSS", { value: { escape: cssEscape }, configurable: true });
} else if (typeof globalThis.CSS.escape !== "function") {
  globalThis.CSS.escape = cssEscape;
}

// Real IndexedDB via fake-indexeddb so idb-keyval round-trips work.
import "fake-indexeddb/auto";

// Minimal in-memory localStorage shim. jsdom 29's localStorage object
// in vitest 4 appears to expose only [Symbol.toStringTag] without the
// Storage methods; we replace it with a plain object backed by Map.
const storageBacking = new Map<string, string>();
const storageShim: Storage = {
  getItem: (key) => (storageBacking.has(key) ? storageBacking.get(key)! : null),
  setItem: (key, value) => {
    storageBacking.set(key, String(value));
  },
  removeItem: (key) => {
    storageBacking.delete(key);
  },
  clear: () => {
    storageBacking.clear();
  },
  key: (i) => Array.from(storageBacking.keys())[i] ?? null,
  get length() {
    return storageBacking.size;
  },
};
Object.defineProperty(globalThis, "localStorage", {
  value: storageShim,
  configurable: true,
  writable: true,
});
Object.defineProperty(globalThis, "sessionStorage", {
  value: storageShim,
  configurable: true,
  writable: true,
});
