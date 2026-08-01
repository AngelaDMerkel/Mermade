import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function transpileUrl(url) {
  const source = await readFile(url, "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`;
}

async function loadRepairHelpers() {
  const typesUrl = await transpileUrl(new URL("../app/mermaid-types.ts", import.meta.url));
  const source = await readFile(new URL("../app/mermaid-repair.ts", import.meta.url), "utf8");
  const rewritten = source.replace('from "./mermaid-types"', `from "${typesUrl}"`);
  const javascript = ts.transpileModule(rewritten, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
}

test("offers deterministic repairs for fenced and typographic Mermaid source", async () => {
  const { createRepairProposals } = await loadRepairHelpers();
  const proposals = createRepairProposals("```mermaid\nflowchart LR\n  A → B\n```", "11.16.0", "flowchart");

  assert.ok(proposals.some((proposal) => proposal.id === "remove-markdown-fence"));
  assert.ok(proposals.some((proposal) => proposal.id === "normalize-punctuation"));
  assert.ok(proposals.some((proposal) => proposal.source.includes("A --> B")));
});

test("offers diagram-specific declaration and subgraph repairs", async () => {
  const { createRepairProposals } = await loadRepairHelpers();
  const declaration = createRepairProposals("A --> B", "11.16.0", "flowchart");
  const subgraph = createRepairProposals("flowchart LR\nsubgraph Team\nA --> B", "11.16.0", "flowchart");

  assert.ok(declaration.some((proposal) => proposal.id === "add-flowchart-declaration"));
  assert.ok(subgraph.some((proposal) => proposal.id === "close-subgraphs" && proposal.source.endsWith("end")));
});

test("offers both engine switching and legacy shape conversion", async () => {
  const { createRepairProposals } = await loadRepairHelpers();
  const proposals = createRepairProposals('flowchart LR\n  A@{ shape: stadium, label: "Start" }', "10.9.6", "flowchart");

  assert.ok(proposals.some((proposal) => proposal.id === "use-newest-mermaid" && proposal.version === "11.16.0"));
  assert.ok(proposals.some((proposal) => proposal.id === "convert-expanded-shapes" && proposal.source.includes('A(["Start"])')));
});
