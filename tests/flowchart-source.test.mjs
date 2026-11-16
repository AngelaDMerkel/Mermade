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

test("repeated node-label edits preserve square brackets inside quoted Mermaid text", async () => {
  const { updateFlowchartNodeStatement } = await loadFlowchartSourceHelpers();
  const style = "style A fill:#ffffff,stroke:#77737f,color:#24232a,stroke-width:1.5px";
  let source = `flowchart TB
  A["Inventory"]
  ${style}
  A --> B["Done"]`;

  source = updateFlowchartNodeStatement(source, "A", 'A["Inventory ["]', style);
  source = updateFlowchartNodeStatement(source, "A", 'A["Inventory [SKU]"]', style);
  source = updateFlowchartNodeStatement(source, "A", 'A["Inventory [SKU] ready"]', style);

  assert.match(source, /^  A\["Inventory \[SKU\] ready"\]$/m);
  assert.match(source, /^  A --> B\["Done"\]$/m, "the relationship following the declaration must remain intact");
  assert.equal(source.match(/^\s*A\["/gm)?.length, 1, "visual keystrokes must keep one node declaration");
  assert.doesNotMatch(source, /"\]"\]/, "an inner bracket must not leave a trailing shape delimiter");
});

test("node replacement ignores declaration-like text inside a quoted label", async () => {
  const { updateFlowchartNodeStatement } = await loadFlowchartSourceHelpers();
  const source = `flowchart TB
  A["Refer to A[legacy] before continuing"]
  A --> B["Done"]`;

  const updated = updateFlowchartNodeStatement(source, "A", 'A["Refer to A[legacy] and [SKU]"]');

  assert.match(updated, /^  A\["Refer to A\[legacy\] and \[SKU\]"\]$/m);
  assert.match(updated, /^  A --> B\["Done"\]$/m);
  assert.equal(updated.match(/^\s*A\["/gm)?.length, 1);
});

test("repeated relationship-label edits replace the same Mermaid statement", async () => {
  const { updateFlowchartEdgeStatement } = await loadFlowchartSourceHelpers();
  let source = `flowchart TB
  A --> B`;

  source = updateFlowchartEdgeStatement(source, "A", "B", 'A -->|"Y"| B');
  source = updateFlowchartEdgeStatement(source, "A", "B", 'A -->|"Ye"| B');
  source = updateFlowchartEdgeStatement(source, "A", "B", 'A -->|"Yes"| B');

  assert.equal(source.match(/^\s*A\s+-->/gm)?.length, 1);
  assert.match(source, /^\s*A -->\|"Yes"\| B$/m);
  assert.doesNotMatch(source, /-->\|"Y(?:e)?"\|/);
});

test("labels the long rework return relationship at the end of a source document", async () => {
  const { flowchartRelationships, updateFlowchartEdgeStatement } = await loadFlowchartSourceHelpers();
  let source = `flowchart TB
  node41["Manufacturing completed"]
  node72@{ shape: diam, label: "Is this expected labor less than ten minutes? " }
  node75["Plant Manager fulfils the [REWORK] request"]
  node77["Advance Workflow to 'In Production'"]
  node72 --> node75
  node75 --> node77
  node77 --> node41
  node72 --> node41`;

  const target = flowchartRelationships(source).find(({ from, to }) => from === "node72" && to === "node41");
  assert.ok(target, "the exact source-backed return relationship must be recognised");
  source = updateFlowchartEdgeStatement(source, "node72", "node41", 'node72 -->|"Y"| node41', target.sourceOccurrence);
  source = updateFlowchartEdgeStatement(source, "node72", "node41", 'node72 -->|"Yes"| node41', target.sourceOccurrence);

  assert.match(source, /^\s*node72 -->\|"Yes"\| node41$/m);
  assert.equal(source.match(/^\s*node72\s+-->/gm)?.length, 2, "the labelled return and the other node72 relationship must remain distinct");
  assert.doesNotMatch(source, /^\s*node72 --> node41$/m);
});

test("edits the selected occurrence when endpoints have parallel relationships", async () => {
  const { updateFlowchartEdgeStatement } = await loadFlowchartSourceHelpers();
  const source = `flowchart TB
  A -->|"Primary"| B
  A -->|"Fallback"| B`;

  const updated = updateFlowchartEdgeStatement(source, "A", "B", 'A -->|"Revised"| B', 1);

  assert.match(updated, /^\s*A -->\|"Primary"\| B$/m);
  assert.match(updated, /^\s*A -->\|"Revised"\| B$/m);
  assert.doesNotMatch(updated, /Fallback/);
  assert.equal(updated.match(/^\s*A\s+-->/gm)?.length, 2);
});

test("patches labels on dashed and thick relationships without appending copies", async () => {
  const { updateFlowchartEdgeStatement } = await loadFlowchartSourceHelpers();
  const source = `flowchart TB
  A -.->|"Retry"| B
  C ==>|"Priority"| D
  style A fill:#ffffff`;

  const dashed = updateFlowchartEdgeStatement(source, "A", "B", 'A -.->|"Review"| B');
  const updated = updateFlowchartEdgeStatement(dashed, "C", "D", 'C ==>|"Urgent"| D');

  assert.equal(updated.match(/^\s*A\s+-\.->/gm)?.length, 1);
  assert.equal(updated.match(/^\s*C\s+==>/gm)?.length, 1);
  assert.match(updated, /^\s*A -\.->\|"Review"\| B$/m);
  assert.match(updated, /^\s*C ==>\|"Urgent"\| D$/m);
  assert.doesNotMatch(updated, /Retry|Priority/);
});

test("repairs progressive relationship labels appended by earlier Mermade builds", async () => {
  const { repairFlowchartEdgeEditArtifacts } = await loadFlowchartSourceHelpers();
  const source = `flowchart TB
  A -->|"Y"| B
  C -->|"U"| D
  style A fill:#ffffff
  C -->|"U"| D
  A -->|"Ye"| B
  A -->|"Yes"| B`;

  const repaired = repairFlowchartEdgeEditArtifacts(source);

  assert.equal(repaired.removed, 3);
  assert.equal(repaired.source.match(/^\s*A\s+-->/gm)?.length, 1);
  assert.equal(repaired.source.match(/^\s*C\s+-->/gm)?.length, 1);
  assert.match(repaired.source, /^\s*A -->\|"Yes"\| B$/m);
  assert.match(repaired.source, /^\s*C -->\|"U"\| D$/m);
  assert.doesNotMatch(repaired.source, /-->\|"Y(?:e)?"\|/);
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

test("deleting a standalone relationship does not create duplicate bare node statements", async () => {
  const { removeFlowchartItems } = await loadFlowchartSourceHelpers();
  const source = `flowchart TB
  A[Receive purchase order or contract]
  B[Project Management]
  A --> B`;

  const updated = removeFlowchartItems(source, { edges: [{ from: "A", to: "B", sourceOccurrence: 0 }] });

  assert.equal(updated, `flowchart TB
  A[Receive purchase order or contract]
  B[Project Management]`);
  assert.equal(updated.match(/^\s*A(?:\s|\[|$)/gm)?.length, 1);
  assert.equal(updated.match(/^\s*B(?:\s|\[|$)/gm)?.length, 1);
});

test("deleting the shipment staging relationship cannot remove its downstream node", async () => {
  const { flowchartNodeIds, removeFlowchartItems } = await loadFlowchartSourceHelpers();
  const source = `flowchart TB
  node42["Stage Shipment Items in lanes"]
  node43@{ shape: cyl, label: "Upload weights and dimensions spreadsheet to Files in INNERGY" }
  node44["Load Shipment and mark Shipment Items and Shipped in INNERGY"]
  node45["Project Management confirms shipment status"]
  node47["Advance Workflow to 'Staged'"]
  node42 --> node43
  node44 --> node45
  node42 --> node47
  node43 --> node47
  node47 --> node44`;

  const beforeNodes = flowchartNodeIds(source);
  const updated = removeFlowchartItems(source, {
    edges: [{ from: "node42", to: "node47", sourceOccurrence: 0 }],
  });

  assert.doesNotMatch(updated, /^\s*node42 --> node47$/m);
  assert.match(updated, /^\s*node44\["Load Shipment and mark Shipment Items and Shipped in INNERGY"\]$/m);
  assert.match(updated, /^\s*node44 --> node45$/m);
  assert.match(updated, /^\s*node47 --> node44$/m);
  assert.deepEqual(flowchartNodeIds(updated), beforeNodes, "an edge-only deletion must preserve the complete Mermaid node set");
});

test("deleting the second parallel relationship removes its exact source occurrence", async () => {
  const { removeFlowchartItems } = await loadFlowchartSourceHelpers();
  const source = `flowchart TB
  A[Receive purchase order or contract]
  B[Project Management]
  X[Unrelated start]
  Y[Unrelated finish]
  A -->|First| B
  X --> Y
  A -.->|Second| B`;

  const updated = removeFlowchartItems(source, { edges: [{ from: "A", to: "B", sourceOccurrence: 1 }] });

  assert.match(updated, /^  A -->\|First\| B$/m);
  assert.doesNotMatch(updated, /Second/);
  assert.match(updated, /^  X --> Y$/m);
  assert.equal(updated.match(/^\s*A(?:\s|\[|$)/gm)?.length, 2, "the declaration and retained first relationship should be the only A statements");
});

test("uses one relationship model for Mermaid fan-in, fan-out and deletion", async () => {
  const { parseFlowchartRelationshipLine, removeFlowchartItems } = await loadFlowchartSourceHelpers();
  const compact = "  existing & newCustomer --> sales & handoff";
  const relationship = parseFlowchartRelationshipLine(compact);

  assert.deepEqual(
    relationship.edges.map(({ from, to }) => `${from}->${to}`),
    ["existing->sales", "existing->handoff", "newCustomer->sales", "newCustomer->handoff"],
  );

  const source = `flowchart TB
  existing{"Is this an existing Brand partner or a new customer?"}
  newCustomer[New customer]
  sales[Sales populates customer details]
  handoff[Sales handoff]
${compact}`;
  const updated = removeFlowchartItems(source, { edges: [{ from: "existing", to: "sales", sourceOccurrence: 0 }] });

  assert.doesNotMatch(updated, /^\s*existing --> sales$/m);
  assert.match(updated, /^\s*existing --> handoff$/m);
  assert.match(updated, /^\s*newCustomer --> sales$/m);
  assert.match(updated, /^\s*newCustomer --> handoff$/m);
});

test("recognises the documented Mermaid flowchart relationship grammar", async () => {
  const { parseFlowchartRelationshipLine } = await loadFlowchartSourceHelpers();
  const cases = [
    ["A-->|Approved|B", "A", "B", "Approved"],
    ["A -- Review --> B", "A", "B", "Review"],
    ["A -. Retry .-> B;", "A", "B", "Retry"],
    ["A == Priority ==> B", "A", "B", "Priority"],
    ["A ---->|Long path| B", "A", "B", "Long path"],
    ["A e1@--> B", "A", "B", ""],
    ["A o--o B", "A", "B", ""],
    ["A <--> B", "A", "B", ""],
    ["A x--x B", "A", "B", ""],
    ["A ~~~ B", "A", "B", ""],
  ];

  for (const [source, from, to, label] of cases) {
    const relationship = parseFlowchartRelationshipLine(source);
    assert.equal(relationship?.edges.length, 1, source);
    assert.deepEqual(
      { from: relationship.edges[0].from, to: relationship.edges[0].to, label: relationship.edges[0].label },
      { from, to, label },
      source,
    );
  }
});

test("deleting an inline-only relationship retains its node declarations", async () => {
  const { removeFlowchartItems } = await loadFlowchartSourceHelpers();
  const source = `flowchart LR
  A[Start] --> B[Finish]`;

  const updated = removeFlowchartItems(source, { edges: [{ from: "A", to: "B", sourceOccurrence: 0 }] });

  assert.match(updated, /^  A\[Start\]$/m);
  assert.match(updated, /^  B\[Finish\]$/m);
  assert.doesNotMatch(updated, /-->/);
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

test("new identifiers cannot redefine inline, unprojected or grouped source nodes", async () => {
  const { uniqueFlowchartId } = await loadFlowchartSourceHelpers();
  assert.equal(uniqueFlowchartId("flowchart LR; node1[Keep original]", "node"), "node2");
  assert.equal(uniqueFlowchartId("flowchart LR\n node1 & node2 --> group1\n subgraph group2[Team]\n node3\n end", "group"), "group3");
  assert.equal(uniqueFlowchartId("flowchart TB", "node"), "node1");
});
