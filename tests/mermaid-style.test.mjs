import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadStyleHelpers() {
  const source = await readFile(new URL("../app/mermaid-style.ts", import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
}

test("writes diagram-wide style as Mermaid frontmatter", async () => {
  const { applyDiagramStyle, DEFAULT_DIAGRAM_STYLE } = await loadStyleHelpers();
  const styled = applyDiagramStyle("flowchart LR\n  A --> B", {
    ...DEFAULT_DIAGRAM_STYLE,
    theme: "base",
    look: "neo",
    layout: "elk",
    fontFamily: "Atkinson Hyperlegible, sans-serif",
    lineColor: "#e0095f",
  });

  assert.match(styled, /^---\nconfig:/);
  assert.match(styled, /  theme: 'base'/);
  assert.match(styled, /  look: 'neo'/);
  assert.match(styled, /  layout: 'elk'/);
  assert.match(styled, /  fontFamily: 'Atkinson Hyperlegible, sans-serif'/);
  assert.match(styled, /    lineColor: '#e0095f'/);
  assert.match(styled, /---\nflowchart LR/);
});

test("custom Base styling does not discard unrelated Mermaid configuration", async () => {
  const { applyDiagramStyle, DEFAULT_DIAGRAM_STYLE, readDiagramStyle } = await loadStyleHelpers();
  const source = `---
title: Existing title
config:
  flowchart:
    curve: linear
  theme: 'base'
  themeVariables:
    lineColor: '#111111'
---
flowchart LR
  A --> B`;
  const once = applyDiagramStyle(source, { ...DEFAULT_DIAGRAM_STYLE, theme: "base", lineColor: "#e0095f" });
  const twice = applyDiagramStyle(once, { ...DEFAULT_DIAGRAM_STYLE, theme: "base", lineColor: "#ffffff" });

  assert.match(twice, /title: Existing title/);
  assert.match(twice, /curve: linear/);
  assert.equal((twice.match(/^  theme:/gm) || []).length, 1);
  assert.equal((twice.match(/^    lineColor:/gm) || []).length, 1);
  assert.equal(readDiagramStyle(twice).theme, "base");
  assert.equal(readDiagramStyle(twice).lineColor, "#ffffff");
});

test("preset themes own their palette while unrelated variables survive", async () => {
  const { applyDiagramStyle, DEFAULT_DIAGRAM_STYLE, readDiagramStyle } = await loadStyleHelpers();
  const source = `---
config:
  theme: 'base'
  themeVariables:
    lineColor: '#111111'
    primaryColor: '#eeeeee'
    fontFamily: 'Legacy nested font'
    noteBkgColor: '#fff4c2'
  flowchart:
    curve: linear
---
flowchart LR
  A --> B`;
  const styled = applyDiagramStyle(source, { ...DEFAULT_DIAGRAM_STYLE, theme: "forest", fontFamily: "Inter" });

  assert.match(styled, /  theme: 'forest'/);
  assert.match(styled, /  fontFamily: 'Inter'/);
  assert.doesNotMatch(styled, /    lineColor:/);
  assert.doesNotMatch(styled, /    primaryColor:/);
  assert.doesNotMatch(styled, /    fontFamily:/);
  assert.match(styled, /    noteBkgColor: '#fff4c2'/);
  assert.match(styled, /curve: linear/);
  assert.equal(readDiagramStyle(styled).theme, "forest");
});
