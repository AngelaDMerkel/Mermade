import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/load-typescript.mjs";

const { DocumentSession } = await loadTypeScript(new URL("../app/editor/document-session.ts", import.meta.url));
const { commitValidatedSource } = await loadTypeScript(new URL("../app/editor/source-edit.ts", import.meta.url));
const { createBlankDiagram, parseMermaid, nodeSyntax } = await loadTypeScript(new URL("../app/editor/diagram-model.ts", import.meta.url));
const valid = async () => "";
function deferred() {
  let resolve;
  const promise = new Promise((complete) => { resolve = complete; });
  return { promise, resolve };
}

test("validated source remains exact, projects relationships, and is one undo step", async () => {
  const original = createBlankDiagram("Original");
  const session = new DocumentSession(original);
  const source = 'flowchart LR\n  %% retain this note\n  A[Start] --> B[Finish]\n  A -.-> B\n  classDef special fill:#eee';
  const result = await commitValidatedSource(session, source, valid);
  assert.equal(result.ok, true);
  assert.equal(session.getSnapshot().source, source);
  assert.equal(session.getSnapshot().name, "Original");
  assert.deepEqual(session.getSnapshot().edges.map((edge) => [edge.id, edge.sourceOccurrence]), [["e1", 0], ["e2", 1]]);
  assert.ok(session.getSnapshot().nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y)));
  session.undo();
  assert.equal(session.getSnapshot(), original);
});

test("slow validation cannot change a newly opened document or its history", async () => {
  const session = new DocumentSession(createBlankDiagram("First"));
  const gate = deferred();
  const pending = commitValidatedSource(session, "flowchart LR\n A --> B", () => gate.promise);
  const second = createBlankDiagram("Second");
  session.reset(second);
  gate.resolve("");
  assert.equal((await pending).cancelled, true);
  assert.equal(session.getSnapshot(), second);
  session.undo();
  assert.equal(session.getSnapshot(), second);
});

test("newer requests win even when older validation finishes last", async () => {
  const session = new DocumentSession(createBlankDiagram());
  const gate = deferred();
  const old = commitValidatedSource(session, "flowchart LR\n A --> B", () => gate.promise);
  const source = "sequenceDiagram\n Alice->>Bob: Hi";
  assert.equal((await commitValidatedSource(session, source, valid)).ok, true);
  gate.resolve("");
  assert.equal((await old).cancelled, true);
  assert.equal(session.getSnapshot().source, source);
  assert.deepEqual(session.getSnapshot().nodes, []);
});

test("intervening edits and draft changes invalidate pending source commits", async () => {
  for (const change of [(session) => session.commit((current) => ({ ...current, name: "Renamed" })), (session) => session.invalidatePendingEdits()]) {
    const session = new DocumentSession(createBlankDiagram());
    const gate = deferred();
    const pending = commitValidatedSource(session, "flowchart LR\n A --> B", () => gate.promise);
    change(session);
    const current = session.getSnapshot();
    gate.resolve("");
    assert.equal((await pending).cancelled, true);
    assert.equal(session.getSnapshot(), current);
  }
});

test("obsolete failures are cancellations, while current parser errors preserve the document", async () => {
  const initial = createBlankDiagram();
  const session = new DocumentSession(initial);
  const error = await commitValidatedSource(session, "flowchart LR\n invalid", async () => "Syntax error");
  assert.equal(error.error, "Syntax error");
  assert.equal(session.getSnapshot(), initial);
  const gate = deferred();
  const pending = commitValidatedSource(session, "flowchart LR\n invalid", () => gate.promise);
  session.reset(createBlankDiagram("Second"));
  gate.resolve("Syntax error");
  assert.equal((await pending).cancelled, true);
});

test("expanded shapes cannot be committed with a Mermaid 10 preference", async () => {
  const session = new DocumentSession({ ...createBlankDiagram(), mermaidVersion: "10.9.6" });
  let calls = 0;
  const result = await commitValidatedSource(session, 'flowchart LR\n A@{ shape: doc, label: "Document" }', async () => { calls++; return ""; });
  assert.equal(result.ok, false);
  assert.match(result.error, /11.3/);
  assert.equal(calls, 0);
});

test("projection keeps stored positions for unchanged source and safe empty labels", () => {
  const source = 'flowchart LR\n A[Start] --> B[Finish]';
  const first = parseMermaid(source, createBlankDiagram());
  first.source = source;
  first.nodes[0].x = 912;
  const projected = parseMermaid(source, first);
  assert.equal(projected.nodes[0].x, 912);
  assert.match(nodeSyntax({ ...projected.nodes[0], label: "" }), /" "/);
});
