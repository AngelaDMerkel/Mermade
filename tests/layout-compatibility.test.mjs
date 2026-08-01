import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadCompatibility() {
  const source = await readFile(new URL("../app/layout-compatibility.ts", import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
}

const tree = {
  nodes: [{ id: "root" }, { id: "left" }, { id: "right" }, { id: "leaf" }],
  edges: [
    { from: "root", to: "left" },
    { from: "root", to: "right" },
    { from: "left", to: "leaf" },
  ],
  groupCount: 0,
  sourceIsAuthoritative: false,
};

test("allows ELK graphs and supported Tidy Tree hierarchies", async () => {
  const { layoutCompatibilityError } = await loadCompatibility();

  assert.equal(layoutCompatibilityError("elk", "flowchart", { ...tree, groupCount: 2 }), "");
  assert.equal(layoutCompatibilityError("tidy-tree", "flowchart", tree), "");
  assert.equal(layoutCompatibilityError("tidy-tree", "mindmap", { nodes: [], edges: [], groupCount: 0, sourceIsAuthoritative: true }), "");
});

test("rejects Tidy Tree subgraphs, cycles, multiple parents, and unverifiable source", async () => {
  const { layoutCompatibilityError } = await loadCompatibility();

  assert.match(layoutCompatibilityError("tidy-tree", "flowchart", { ...tree, groupCount: 1 }), /cannot render Flowchart subgraphs/);
  assert.match(layoutCompatibilityError("tidy-tree", "flowchart", {
    nodes: tree.nodes.slice(0, 3),
    edges: [
      { from: "root", to: "left" },
      { from: "left", to: "right" },
      { from: "right", to: "left" },
    ],
    groupCount: 0,
    sourceIsAuthoritative: false,
  }), /one connected hierarchy/);
  assert.match(layoutCompatibilityError("tidy-tree", "flowchart", {
    nodes: tree.nodes.slice(0, 3),
    edges: [
      { from: "root", to: "right" },
      { from: "left", to: "right" },
    ],
    groupCount: 0,
    sourceIsAuthoritative: false,
  }), /one connected hierarchy/);
  assert.match(layoutCompatibilityError("tidy-tree", "flowchart", { ...tree, sourceIsAuthoritative: true }), /Mermade can verify/);
  assert.match(layoutCompatibilityError("tidy-tree", "state", tree), /supports Mindmaps and tree-shaped Flowcharts/);
});
