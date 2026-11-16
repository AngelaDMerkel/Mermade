import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/load-typescript.mjs";

const loadCompatibility = () => loadTypeScript(new URL("../app/layout-compatibility.ts", import.meta.url));

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

  assert.equal(layoutCompatibilityError("elk", { ...tree, groupCount: 2 }), "");
  assert.equal(layoutCompatibilityError("tidy-tree", tree), "");
});

test("rejects Tidy Tree subgraphs, cycles, multiple parents, and unverifiable source", async () => {
  const { layoutCompatibilityError } = await loadCompatibility();

  assert.match(layoutCompatibilityError("tidy-tree", { ...tree, groupCount: 1 }), /cannot render Flowchart subgraphs/);
  assert.match(layoutCompatibilityError("tidy-tree", {
    nodes: tree.nodes.slice(0, 3),
    edges: [
      { from: "root", to: "left" },
      { from: "left", to: "right" },
      { from: "right", to: "left" },
    ],
    groupCount: 0,
    sourceIsAuthoritative: false,
  }), /one connected hierarchy/);
  assert.match(layoutCompatibilityError("tidy-tree", {
    nodes: tree.nodes.slice(0, 3),
    edges: [
      { from: "root", to: "right" },
      { from: "left", to: "right" },
    ],
    groupCount: 0,
    sourceIsAuthoritative: false,
  }), /one connected hierarchy/);
  assert.match(layoutCompatibilityError("tidy-tree", { ...tree, sourceIsAuthoritative: true }), /Mermade can verify/);
});
