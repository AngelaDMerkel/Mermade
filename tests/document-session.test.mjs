import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/load-typescript.mjs";

const { DocumentSession } = await loadTypeScript(new URL("../app/editor/document-session.ts", import.meta.url));

test("consecutive commits use the current document and undo each distinct edit", () => {
  const session = new DocumentSession({ value: 0 });
  session.commit((current) => ({ value: current.value + 1 }));
  session.commit((current) => ({ value: current.value + 1 }));
  assert.equal(session.getSnapshot().value, 2);
  session.undo();
  assert.equal(session.getSnapshot().value, 1);
  session.undo();
  assert.equal(session.getSnapshot().value, 0);
  session.redo();
  session.redo();
  assert.equal(session.getSnapshot().value, 2);
});

test("a drag checkpoint groups updates and a new edit discards redo", () => {
  const session = new DocumentSession({ x: 0 });
  session.checkpoint();
  session.set({ x: 10 });
  session.set({ x: 20 });
  session.undo();
  assert.equal(session.getSnapshot().x, 0);
  session.redo();
  assert.equal(session.getSnapshot().x, 20);
  session.undo();
  session.set({ x: 30 });
  session.redo();
  assert.equal(session.getSnapshot().x, 30);
});

test("no-op commits preserve redo and the undo history is bounded", () => {
  const session = new DocumentSession(0, 2);
  session.commit(1);
  session.commit(2);
  session.commit(3);
  session.undo();
  session.commit((current) => current);
  session.redo();
  assert.equal(session.getSnapshot(), 3);
  session.undo();
  session.undo();
  session.undo();
  assert.equal(session.getSnapshot(), 1);
});

test("document reset clears history and invalidates edits even when reopening the same object", () => {
  const initial = { value: 0 };
  const session = new DocumentSession(initial);
  session.commit({ value: 1 });
  const ticket = session.beginEdit();
  session.reset(initial);
  assert.equal(session.commitEdit(ticket, { value: 9 }), false);
  session.undo();
  session.redo();
  assert.equal(session.getSnapshot(), initial);
});

test("latest requests win, tickets are consumed, and failed updaters leave history intact", () => {
  const session = new DocumentSession(0);
  const old = session.beginEdit();
  const latest = session.beginEdit();
  assert.equal(session.commitEdit(old, 1), false);
  assert.equal(session.commitEdit(latest, 2), true);
  assert.equal(session.commitEdit(latest, 3), false);
  assert.throws(() => session.commit(() => { throw new Error("failed"); }));
  session.undo();
  assert.equal(session.getSnapshot(), 0);
});

test("subscribers see each current snapshot and can unsubscribe", () => {
  const session = new DocumentSession(0);
  const seen = [];
  const unsubscribe = session.subscribe(() => seen.push(session.getSnapshot()));
  session.commit(1);
  session.undo();
  unsubscribe();
  session.redo();
  assert.deepEqual(seen, [1, 0]);
});
