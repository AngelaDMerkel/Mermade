import type { StorageLike } from "../local-diagram-library";

// Accessing window.localStorage itself can throw, before a storage method runs.
const unavailableStorage: StorageLike = {
  getItem() { return null; },
  setItem() { throw new Error("Browser storage is unavailable"); },
  removeItem() { throw new Error("Browser storage is unavailable"); },
};

export function getBrowserStorage(): StorageLike {
  try {
    return window.localStorage;
  } catch {
    return unavailableStorage;
  }
}
