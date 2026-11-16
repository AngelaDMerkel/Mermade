import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/load-typescript.mjs";

const { FLOWCHART_HELP } = await loadTypeScript(new URL("../app/mermaid-help.ts", import.meta.url));

test("flowchart help includes syntax, practice, tips and pitfalls", () => {
  assert.ok(FLOWCHART_HELP.purpose.length >= 40);
  assert.ok(FLOWCHART_HELP.tips.length >= 2);
  assert.ok(FLOWCHART_HELP.pitfalls.length >= 1);
  assert.ok(FLOWCHART_HELP.resources.some((resource) => resource.url === "https://mermaid.js.org/syntax/flowchart.html"));
  assert.ok(FLOWCHART_HELP.resources.some((resource) => resource.url === "https://asq.org/quality-resources/flowchart"));
});
