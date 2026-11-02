import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";

// Browser tests need jsdom's storage, not Node's native Web Storage globals.
const testDom = (globalThis as typeof globalThis & { jsdom?: { window: Window } }).jsdom;
if (testDom) {
  for (const key of ["localStorage", "sessionStorage"] as const) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value: testDom.window[key],
    });
  }
}
