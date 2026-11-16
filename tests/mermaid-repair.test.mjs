import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/load-typescript.mjs";

const loadRepairHelpers = () => loadTypeScript(new URL("../app/mermaid-repair.ts", import.meta.url));

test("offers deterministic repairs for fenced and typographic Mermaid source", async () => {
  const { createRepairProposals } = await loadRepairHelpers();
  const proposals = createRepairProposals("```mermaid\nflowchart LR\n  A → B\n```", "11.16.0");

  assert.ok(proposals.some((proposal) => proposal.id === "remove-markdown-fence"));
  assert.ok(proposals.some((proposal) => proposal.id === "normalize-punctuation"));
  assert.ok(proposals.some((proposal) => proposal.source.includes("A --> B")));
});

test("removes site wrapper markup from otherwise valid Mermaid", async () => {
  const { createRepairProposals } = await loadRepairHelpers();
  const source = "flowchart TB\n  A --> B\n</mermaid>";
  const proposals = createRepairProposals(source, "11.16.0");
  const repair = proposals.find((proposal) => proposal.id === "remove-mermaid-wrapper");

  assert.equal(repair?.source, "flowchart TB\n  A --> B");
});

test("removes DokuWiki raw mode with its Mermaid wrapper", async () => {
  const { createRepairProposals } = await loadRepairHelpers();
  const source = "<mermaid>\nraw\nflowchart TB\n  A --> B\n</mermaid>";
  const proposals = createRepairProposals(source, "11.16.0");
  const repair = proposals.find((proposal) => proposal.id === "remove-mermaid-wrapper");

  assert.equal(repair?.source, "flowchart TB\n  A --> B");
});

test("repairs visually blank flowchart nodes without inventing text", async () => {
  const { createRepairProposals, repairEmptyFlowchartNodeLabels } = await loadRepairHelpers();
  const source = 'flowchart TB\n  n80[""]\n  n81@{ shape: rect, label: "" }\n  n80 --> n81';
  const repaired = repairEmptyFlowchartNodeLabels(source);
  const proposals = createRepairProposals(source, "11.16.0");

  assert.equal(repaired, 'flowchart TB\n  n80[" "]\n  n81@{ shape: rect, label: " " }\n  n80 --> n81');
  assert.ok(proposals.some((proposal) => proposal.id === "repair-empty-flowchart-labels" && proposal.source === repaired));
});

test("offers diagram-specific declaration and subgraph repairs", async () => {
  const { createRepairProposals } = await loadRepairHelpers();
  const declaration = createRepairProposals("A --> B", "11.16.0");
  const subgraph = createRepairProposals("flowchart LR\nsubgraph Team\nA --> B", "11.16.0");

  assert.ok(declaration.some((proposal) => proposal.id === "add-flowchart-declaration"));
  assert.ok(subgraph.some((proposal) => proposal.id === "close-subgraphs" && proposal.source.endsWith("end")));
});

test("offers both engine switching and legacy shape conversion", async () => {
  const { createRepairProposals } = await loadRepairHelpers();
  const proposals = createRepairProposals('flowchart LR\n  A@{ shape: stadium, label: "Start" }', "10.9.6");

  assert.ok(proposals.some((proposal) => proposal.id === "use-newest-mermaid" && proposal.version === "11.16.0"));
  assert.ok(proposals.some((proposal) => proposal.id === "convert-expanded-shapes" && proposal.source.includes('A(["Start"])')));
});


test("does not offer repairs that convert unsupported charts into flowcharts", async () => {
  const { createRepairProposals } = await loadRepairHelpers();
  for (const source of ["sequenceDiagram\n Alice->>Bob: Hi", "stateDiagram-v2\n A --> B", "gantt\n title Plan", "pie\n \"A\": 1"]) {
    assert.deepEqual(createRepairProposals(source, "11.16.0"), []);
  }
});
