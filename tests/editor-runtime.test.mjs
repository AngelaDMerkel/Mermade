import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/load-typescript.mjs";

const { createSerialTaskQueue } = await loadTypeScript(new URL("../app/editor/serial-task-queue.ts", import.meta.url));
const { getBrowserStorage } = await loadTypeScript(new URL("../app/editor/browser-storage.ts", import.meta.url));

test("renderer jobs cannot reconfigure an in-flight job and failures do not block subsequent jobs", async () => {
  const run = createSerialTaskQueue();
  const events = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const first = run(async () => { events.push("first start"); await gate; events.push("first end"); });
  const second = run(async () => { events.push("second"); throw new Error("bad diagram"); });
  const rejected = assert.rejects(second, /bad diagram/);
  const third = run(async () => { events.push("third"); return "svg"; });
  await Promise.resolve();
  assert.deepEqual(events, ["first start"]);
  release();
  await first;
  await rejected;
  assert.equal(await third, "svg");
  assert.deepEqual(events, ["first start", "first end", "second", "third"]);
});

test("a blocked localStorage getter is handled before library operations run", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { get localStorage() { throw new Error("blocked"); } } });
  try {
    const storage = getBrowserStorage();
    assert.equal(storage.getItem("diagram"), null);
    assert.throws(() => storage.setItem("diagram", "value"), /unavailable/);
    assert.throws(() => storage.removeItem("diagram"), /unavailable/);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else delete globalThis.window;
  }
});


test("unsupported charts never reach Mermaid rendering or parsing", async () => {
  const { renderMermaidSvg, validateSource } = await loadTypeScript(new URL("../app/editor/mermaid-runtime.ts", import.meta.url));
  const source = "sequenceDiagram\n A->>B: Hi";
  for (const version of ["11.16.0", "10.9.6"]) {
    assert.match(await validateSource(source, version), /supports flowcharts only/);
    await assert.rejects(renderMermaidSvg({ source, version, id: "unsupported" }), /supports flowcharts only/);
  }
});
