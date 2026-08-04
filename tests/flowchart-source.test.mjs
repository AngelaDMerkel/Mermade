import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadFlowchartSourceHelpers() {
  const source = await readFile(new URL("../app/flowchart-source.ts", import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
}

test("identifies flowcharts the generated model can round-trip losslessly", async () => {
  const { canUseNativeFlowchartEditor } = await loadFlowchartSourceHelpers();
  const source = `---
config:
  theme: 'base'
---
flowchart TB
  subgraph checkout["Checkout"]
    cart@{ shape: rect, label: "Cart" }
    pay{"Approved?"}
  end
  cart -->|"Submit"| pay
  style cart fill:#ffffff,stroke:#77737f,color:#24232a,stroke-width:1.5px`;

  assert.equal(canUseNativeFlowchartEditor(source), true);
});

test("preserves complex valid Mermaid instead of converting it lossily", async () => {
  const { canUseNativeFlowchartEditor } = await loadFlowchartSourceHelpers();
  const unsupportedStatements = [
    "%% preserve this explanation",
    "A --> B --> C",
    "A --> B & C",
    'A -- "Approved" --> B',
    "direction LR",
    "classDef important fill:#fff4dd,stroke:#8c52ff",
    "class A important",
    "style A fill:#fff4dd,stroke:#8c52ff",
    'click A "/details" "Open details"',
  ];

  for (const statement of unsupportedStatements) {
    assert.equal(
      canUseNativeFlowchartEditor(`flowchart TB\n  A[Start]\n  B[Next]\n  C[Done]\n  ${statement}`),
      false,
      `${statement} must remain source-authoritative`,
    );
  }
});

test("preserves flowcharts with frontmatter outside Mermade's style model", async () => {
  const { canUseNativeFlowchartEditor } = await loadFlowchartSourceHelpers();
  const source = `---
title: Checkout lifecycle
config:
  theme: 'base'
---
flowchart LR
  A --> B`;

  assert.equal(canUseNativeFlowchartEditor(source), false);
});

test("rejects nested subgraphs that the native model cannot retain", async () => {
  const { canUseNativeFlowchartEditor } = await loadFlowchartSourceHelpers();
  const source = `flowchart TB
  subgraph outer["Outer"]
    subgraph inner["Inner"]
      A[Step]
    end
  end`;

  assert.equal(canUseNativeFlowchartEditor(source), false);
});

test("patches advanced source without discarding comments, classes, or click directives", async () => {
  const {
    appendFlowchartStatements,
    appendFlowchartSubgraph,
    updateFlowchartDirection,
    updateFlowchartEdgeStatement,
    updateFlowchartNodeStatement,
  } = await loadFlowchartSourceHelpers();
  const source = `flowchart TB
  %% keep this note
  A@{ shape: rect, label: "Start" }
  B[Finish]
  A --> B
  classDef important stroke:#8c52ff
  class A important
  click A "/details" "Open details"`;

  let updated = updateFlowchartDirection(source, "LR");
  updated = updateFlowchartNodeStatement(updated, "A", 'A@{ shape: diam, label: "Ready?" }', "style A fill:#ffffff,stroke:#77737f,color:#24232a,stroke-width:1.5px");
  updated = updateFlowchartEdgeStatement(updated, "A", "B", 'A -->|"Yes"| B');
  updated = appendFlowchartStatements(updated, ['C["New step"]', "B --> C"]);
  updated = appendFlowchartSubgraph(updated, "group1", "Review", ["B", "C"]);

  assert.match(updated, /^flowchart LR/m);
  assert.match(updated, /A@\{ shape: diam, label: "Ready\?" \}/);
  assert.match(updated, /A -->\|"Yes"\| B/);
  assert.match(updated, /subgraph group1\["Review"\]/);
  assert.match(updated, /%% keep this note/);
  assert.match(updated, /classDef important/);
  assert.match(updated, /click A "\/details"/);
});

test("deletes visual items from advanced flowchart source without flattening it", async () => {
  const { removeFlowchartItems } = await loadFlowchartSourceHelpers();
  const source = `flowchart TB
  %% keep this note
  A@{ shape: stadium, label: "Start" } --> B{"Ready?"} --> C[Finish]
  B -->|"Retry"| D[Review]
  classDef important stroke:#8c52ff
  class A,B important
  style B fill:#ffffff,stroke:#77737f,color:#24232a,stroke-width:1.5px
  click B "/details" "Open details"`;

  const updated = removeFlowchartItems(source, { nodeIds: ["B"] });

  assert.match(updated, /%% keep this note/);
  assert.match(updated, /A@\{ shape: stadium, label: "Start" \}/);
  assert.match(updated, /C\[Finish\]/);
  assert.match(updated, /D\[Review\]/);
  assert.match(updated, /classDef important/);
  assert.match(updated, /class A important/);
  assert.doesNotMatch(updated, /\bB(?:\{|\s+-->|\s+fill:|\s+"\/details")/);
});

test("removes one selected relationship while preserving the rest of a chain", async () => {
  const { removeFlowchartItems } = await loadFlowchartSourceHelpers();
  const source = `flowchart LR
  A[Start] --> B[Review] --> C[Finish]`;

  const updated = removeFlowchartItems(source, { edges: [{ from: "A", to: "B" }] });

  assert.match(updated, /^\s*A\[Start\]$/m);
  assert.match(updated, /B\[Review\] --> C\[Finish\]/);
  assert.doesNotMatch(updated, /A\[Start\] --> B\[Review\]/);
});

test("renames and unwraps source-backed subgraphs without deleting their nodes", async () => {
  const { removeFlowchartItems, updateFlowchartSubgraphStatement } = await loadFlowchartSourceHelpers();
  const source = `flowchart TB
  subgraph review["Review"]
    A[Check]
    B[Approve]
  end
  A --> B`;

  const renamed = updateFlowchartSubgraphStatement(source, "review", "Quality review");
  const unwrapped = removeFlowchartItems(renamed, { subgraphIds: ["review"] });

  assert.match(renamed, /subgraph review\["Quality review"\]/);
  assert.doesNotMatch(unwrapped, /subgraph review|^\s*end\s*$/m);
  assert.match(unwrapped, /A\[Check\]/);
  assert.match(unwrapped, /B\[Approve\]/);
  assert.match(unwrapped, /A --> B/);
});

test("moves a source-backed node between existing subgraphs without flattening its syntax", async () => {
  const { moveFlowchartNodeToSubgraph } = await loadFlowchartSourceHelpers();
  const source = `flowchart TB
  subgraph intake["Intake"]
    A@{ shape: stadium, label: "Start" }
  end
  subgraph review["Review"]
    B[Check]
  end
  A --> B
  style A fill:#ffffff,stroke:#77737f,color:#24232a,stroke-width:1.5px`;

  const moved = moveFlowchartNodeToSubgraph(source, "A", "review");

  assert.doesNotMatch(moved, /subgraph intake/);
  assert.match(moved, /subgraph review\["Review"\][\s\S]*B\[Check\][\s\S]*A@\{ shape: stadium, label: "Start" \}[\s\S]*end/);
  assert.match(moved, /A --> B/);
  assert.match(moved, /style A fill:#ffffff/);
});

test("moves a node out of its subgraph while preserving its declaration", async () => {
  const { moveFlowchartNodeToSubgraph } = await loadFlowchartSourceHelpers();
  const source = `flowchart LR
  subgraph review["Review"]
    A{"Approved?"}
  end
  A --> B[Done]`;

  const moved = moveFlowchartNodeToSubgraph(source, "A");

  assert.doesNotMatch(moved, /subgraph review|^\s*end\s*$/m);
  assert.match(moved, /A --> B\[Done\]/);
  assert.match(moved, /^\s*A\{"Approved\?"\}$/m);
});

test("refuses a missing subgraph rather than desynchronising source and canvas", async () => {
  const { moveFlowchartNodeToSubgraph } = await loadFlowchartSourceHelpers();
  assert.equal(moveFlowchartNodeToSubgraph("flowchart LR\n  A --> B", "A", "missing"), null);
});

test("finds source-backed nodes in compact relationships and expanded shapes", async () => {
  const { flowchartNodeIds } = await loadFlowchartSourceHelpers();
  const source = `flowchart TB
  start-node@{ shape: stadium, label: "Start" }-->wait-node@{ shape: delay, label: "Wait" }
  orphan-node@{ shape: lean-l, label: "Orphan" }`;

  assert.deepEqual(
    [...flowchartNodeIds(source)].sort(),
    ["orphan-node", "start-node", "wait-node"],
  );
});

test("deletes compact source-backed relationships and their orphaned node", async () => {
  const { removeFlowchartItems } = await loadFlowchartSourceHelpers();
  const source = `flowchart TB
  start-node@{ shape: stadium, label: "Start" }-->orphan-node@{ shape: delay, label: "Wait" }
  keep-node@{ shape: rect, label: "Keep" }`;

  const updated = removeFlowchartItems(source, { nodeIds: ["orphan-node"] });

  assert.match(updated, /start-node@\{ shape: stadium/);
  assert.match(updated, /keep-node@\{ shape: rect/);
  assert.doesNotMatch(updated, /orphan-node/);
});

test("removes an empty subgraph frame when its final orphan is deleted", async () => {
  const { removeFlowchartItems } = await loadFlowchartSourceHelpers();
  const source = `flowchart TB
  subgraph waiting["Waiting"]
    direction LR
    %% this explanation remains useful
    orphan@{ shape: delay, label: "Wait" }
  end
  keep[Keep]`;

  const updated = removeFlowchartItems(source, { nodeIds: ["orphan"] });

  assert.doesNotMatch(updated, /subgraph waiting|^\s*end\s*$/m);
  assert.doesNotMatch(updated, /^\s*direction\s+LR\s*$/m);
  assert.match(updated, /%% this explanation remains useful/);
  assert.match(updated, /keep\[Keep\]/);
});
