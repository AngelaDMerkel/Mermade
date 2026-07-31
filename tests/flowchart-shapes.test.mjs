import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadShapes() {
  const source = await readFile(new URL("../app/flowchart-shapes.ts", import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
}

test("prioritizes eight semantically named common flowchart shapes", async () => {
  const { FLOWCHART_SHAPE_GROUPS } = await loadShapes();
  const common = FLOWCHART_SHAPE_GROUPS[0];

  assert.equal(common.label, "Common — recommended");
  assert.equal(common.options.length, 8);
  assert.deepEqual(common.options.map((option) => option.label), [
    "Process — Rectangle",
    "Start / End — Stadium",
    "Decision — Diamond",
    "Input / Output — Parallelogram",
    "Document — Wavy rectangle",
    "Data Store — Cylinder",
    "Subprocess — Framed rectangle",
    "Connector — Circle",
  ]);
});

test("exposes every Mermaid expanded shape exactly once", async () => {
  const { FLOWCHART_SHAPES } = await loadShapes();
  assert.equal(FLOWCHART_SHAPES.length, 48);
  assert.equal(new Set(FLOWCHART_SHAPES.map((option) => option.id)).size, FLOWCHART_SHAPES.length);
  assert.equal(new Set(FLOWCHART_SHAPES.map((option) => option.mermaidShape)).size, FLOWCHART_SHAPES.length);
});

test("maps selections to valid Mermaid shape metadata and FreeForm silhouettes", async () => {
  const { flowchartShapePatch, mermaidShapeClass, selectedFlowchartShape, visualShapeForMermaid } = await loadShapes();
  assert.deepEqual(flowchartShapePatch("database"), { shape: "database", mermaidShape: "cyl" });
  assert.equal(selectedFlowchartShape({ shape: "database", mermaidShape: "cyl" }), "database");
  assert.equal(visualShapeForMermaid("subprocess"), "framed");
  assert.equal(visualShapeForMermaid("manual-input"), "manual-input");
  assert.equal(mermaidShapeClass("fr-rect"), "mermaid-shape-fr-rect");
});

test("gives every Mermaid flowchart shape a distinct FreeForm canvas selector", async () => {
  const [{ FLOWCHART_SHAPES, mermaidShapeClass }, css, editor] = await Promise.all([
    loadShapes(),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/mermaid-editor.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(editor, /mermaidShapeClass\(node\.mermaidShape\)/);
  for (const shape of FLOWCHART_SHAPES) {
    const className = mermaidShapeClass(shape.mermaidShape);
    assert.match(css, new RegExp(`\\.${className}\\s|\\.${className}\\.`), shape.label);
  }
});
