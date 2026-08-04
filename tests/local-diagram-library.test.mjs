import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadLibrary() {
  const source = await readFile(new URL("../app/local-diagram-library.ts", import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
}

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

test("migrates the legacy single diagram into a versioned local library", async () => {
  const library = await loadLibrary();
  const storage = new MemoryStorage();
  const legacy = { name: "Legacy chart", nodes: [{ id: "a" }], edges: [], groups: [] };
  storage.setItem(library.LEGACY_DIAGRAM_KEY, JSON.stringify(legacy));

  const result = library.initialiseLocalDiagramLibrary(storage, { name: "Fallback" }, "Fallback", 1000);

  assert.equal(result.migrated, true);
  assert.equal(result.storageAvailable, true);
  assert.equal(result.index.documents.length, 1);
  assert.equal(result.index.documents[0].name, "Legacy chart");
  assert.equal(result.document.diagram.name, "Legacy chart");
  assert.equal(storage.getItem(library.LEGACY_DIAGRAM_KEY), null);
  assert.equal("diagram" in JSON.parse(storage.getItem(library.DIAGRAM_LIBRARY_KEY)).documents[0], false, "the index must not duplicate diagram source");
});

test("restores the last active document and repairs a missing active pointer", async () => {
  const library = await loadLibrary();
  const storage = new MemoryStorage();
  const first = library.initialiseLocalDiagramLibrary(storage, { name: "First" }, "First", 1000);
  const secondId = "second";
  const second = { version: 1, id: secondId, name: "Second", createdAt: 2000, updatedAt: 2000, diagram: { name: "Second" } };
  library.writeLocalDiagramDocument(storage, second);
  library.writeLocalDiagramIndex(storage, library.updateLocalDiagramIndex(first.index, second, secondId));

  const restored = library.initialiseLocalDiagramLibrary(storage, { name: "Fallback" }, "Fallback", 3000);
  assert.equal(restored.index.activeId, secondId);
  assert.equal(restored.document.diagram.name, "Second");

  library.removeLocalDiagramDocument(storage, secondId);
  const repaired = library.initialiseLocalDiagramLibrary(storage, { name: "Fallback" }, "Fallback", 4000);
  assert.equal(repaired.index.activeId, first.index.activeId);
  assert.equal(repaired.index.documents.length, 1);
});

test("keeps the most recently edited document first without losing creation dates", async () => {
  const library = await loadLibrary();
  const index = {
    version: 1,
    activeId: "first",
    documents: [
      { id: "first", name: "First", createdAt: 1000, updatedAt: 1000 },
      { id: "second", name: "Second", createdAt: 2000, updatedAt: 2000 },
    ],
  };
  const next = library.updateLocalDiagramIndex(index, { id: "first", name: "Renamed", createdAt: 1000, updatedAt: 3000 });

  assert.deepEqual(next.documents.map((document) => document.id), ["first", "second"]);
  assert.equal(next.documents[0].name, "Renamed");
  assert.equal(next.documents[0].createdAt, 1000);
});

test("continues with an in-memory document when browser storage is unavailable", async () => {
  const library = await loadLibrary();
  const storage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
    removeItem() { throw new Error("blocked"); },
  };
  const result = library.initialiseLocalDiagramLibrary(storage, { name: "Session chart" }, "Session chart", 1000);

  assert.equal(result.storageAvailable, false);
  assert.equal(result.document.diagram.name, "Session chart");
  assert.equal(result.index.documents.length, 1);
});
