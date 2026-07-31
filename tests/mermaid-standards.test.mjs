import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { createServer } from "vite";

let browser;
let page;
let server;
let appServer;
let shapes;
let types;

before(async () => {
  server = await createServer({
    configFile: false,
    logLevel: "silent",
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { host: "127.0.0.1", port: 0, strictPort: false },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("Vite standards server did not bind a TCP port");

  browser = await chromium.launch({
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" }),
    headless: true,
  });
  page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  await page.goto(`http://127.0.0.1:${address.port}/tests/browser/render-harness.html`);
  await page.waitForFunction(() => window.mermadeStandards?.ready === true);
  types = await page.evaluate(() => window.mermadeStandards.types);
  shapes = await page.evaluate(() => window.mermadeStandards.shapes);
});

test("every selectable flowchart shape parses and renders", { timeout: 120_000 }, async (t) => {
  assert.equal(shapes.length, 48, "the complete Mermaid shape catalog must be tested");

  for (const shape of shapes) {
    await t.test(shape.label, async () => {
      const parsed = await page.evaluate((id) => window.mermadeStandards.parseShape(id), shape.id);
      assert.equal(parsed.diagramType, "flowchart-v2", `${shape.label} must parse as a flowchart`);

      const rendered = await page.evaluate((id) => window.mermadeStandards.renderShape(id), shape.id);
      const numbers = [...Object.values(rendered.viewBox), ...Object.values(rendered.bounds)];
      assert.ok(numbers.every(Number.isFinite), `${shape.label} geometry must contain only finite numbers`);
      assert.ok(rendered.viewBox.width > 0 && rendered.viewBox.height > 0, `${shape.label} must have a positive SVG viewBox`);
      assert.ok(rendered.bounds.width > 0 && rendered.bounds.height > 0, `${shape.label} must have visible rendered bounds`);
      assert.ok(rendered.contentCount > 0 && rendered.shapeCount > 0, `${shape.label} must render visible shape content`);
      assert.equal(rendered.errorCount, 0, `${shape.label} must not contain Mermaid error output`);
    });
  }
});

after(async () => {
  await browser?.close();
  await server?.close();
  appServer?.kill("SIGTERM");
});

test("every Mermaid type starter passes the real Mermaid parser", { timeout: 120_000 }, async (t) => {
  assert.ok(types.length > 0, "the shared Mermaid type registry must not be empty");

  for (const type of types) {
    await t.test(type.label, async () => {
      const parsed = await page.evaluate((id) => window.mermadeStandards.parseStarter(id), type.id);
      assert.equal(parsed.id, type.id);
      assert.ok(parsed.diagramType, `${type.label} must report a Mermaid parser type`);
    });
  }
});

test("every Mermaid type starter meets the SVG rendering standard", { timeout: 120_000 }, async (t) => {
  assert.ok(types.length > 0, "the shared Mermaid type registry must not be empty");

  for (const type of types) {
    await t.test(type.label, async () => {
      const rendered = await page.evaluate((id) => window.mermadeStandards.renderStarter(id), type.id);
      const numbers = [...Object.values(rendered.viewBox), ...Object.values(rendered.bounds)];

      assert.ok(numbers.every(Number.isFinite), `${type.label} geometry must contain only finite numbers`);
      assert.ok(rendered.viewBox.width > 0 && rendered.viewBox.height > 0, `${type.label} must have a positive SVG viewBox`);
      assert.ok(rendered.bounds.width > 0 && rendered.bounds.height > 0, `${type.label} must have visible rendered bounds`);
      assert.ok(rendered.contentCount > 0, `${type.label} must not render an empty SVG`);
      assert.ok(rendered.textCount > 0, `${type.label} must render visible diagram text`);
      assert.ok(rendered.shapeCount > 0, `${type.label} must render diagram geometry`);
      assert.equal(rendered.errorCount, 0, `${type.label} must not contain Mermaid error output`);
      assert.equal(rendered.preserveAspectRatio, "xMidYMid meet", `${type.label} must scale without distortion`);

      if (type.id === "c4") {
        assert.ok(rendered.c4Title, "C4 must render its title as a direct SVG text element");
        assert.equal(rendered.c4Title.textAnchor, "middle", "C4 title must be center-aligned");
        assert.ok(Math.abs(rendered.c4Title.x - rendered.c4Title.expectedX) < 0.01, "C4 title must be centered in its viewBox");
      }
    });
  }
});

test("double-clicking an unselected Mermaid flowchart node opens text editing", { timeout: 60_000 }, async () => {
  await browser?.close();
  await server?.close();
  browser = undefined;
  page = undefined;
  server = undefined;

  appServer = spawn(process.execPath, ["node_modules/vinext/dist/cli.js", "dev", "--host", "127.0.0.1", "--port", "0"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...process.env, WRANGLER_LOG_PATH: ".wrangler/wrangler-interactions.log" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const port = await new Promise((resolve, reject) => {
    let output = "";
    const timeout = setTimeout(() => reject(new Error(`Mermade interaction server did not start\n${output}`)), 30_000);
    const inspect = (chunk) => {
      output += chunk.toString();
      const match = output.match(/Local:\s+http:\/\/(?:localhost|127\.0\.0\.1):(\d+)/);
      if (!match) return;
      clearTimeout(timeout);
      resolve(Number(match[1]));
    };
    appServer.stdout.on("data", inspect);
    appServer.stderr.on("data", inspect);
    appServer.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Mermade interaction server exited with ${code}\n${output}`));
    });
  });

  browser = await chromium.launch({
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" }),
    headless: true,
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(`http://localhost:${port}`);
  await page.locator(".mermaid-render svg").waitFor({ state: "visible" });

  const node = page.locator('[data-node-id="cart"]').first();
  await node.waitFor({ state: "visible" });
  await node.dblclick();

  const editor = page.locator(".mermaid-inline-editor input");
  await editor.waitFor({ state: "visible" });
  assert.equal(await editor.inputValue(), "Cart");
});

test("FreeForm nodes retain their exact Mermaid shape class", async () => {
  await page.keyboard.press("Escape");
  await page.locator(".view-switch button").filter({ hasText: "FreeForm" }).click();
  const shapeSelect = page.locator(".field-stack label").filter({ hasText: "Shape" }).locator("select");

  await shapeSelect.selectOption("cloud");
  await page.locator('.diagram-node.mermaid-shape-cloud').waitFor({ state: "visible" });
  await shapeSelect.selectOption("fork");
  await page.locator('.diagram-node.mermaid-shape-fork').waitFor({ state: "visible" });
});

test("view switching preserves the selected node's viewport position", async () => {
  const positionNode = async (selector, x, y) => page.evaluate(({ selector, x, y }) => {
    const scroller = document.querySelector(".canvas-scroll");
    const node = document.querySelector(selector);
    if (!(scroller instanceof HTMLElement) || !(node instanceof HTMLElement || node instanceof SVGElement)) throw new Error("Canvas node not found");
    const scrollerRect = scroller.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    scroller.scrollLeft += nodeRect.left + nodeRect.width / 2 - (scrollerRect.left + scrollerRect.width * x);
    scroller.scrollTop += nodeRect.top + nodeRect.height / 2 - (scrollerRect.top + scrollerRect.height * y);
  }, { selector, x, y });
  const relativePosition = async (selector) => page.evaluate((selector) => {
    const scroller = document.querySelector(".canvas-scroll");
    const node = document.querySelector(selector);
    if (!(scroller instanceof HTMLElement) || !(node instanceof HTMLElement || node instanceof SVGElement)) throw new Error("Canvas node not found");
    const scrollerRect = scroller.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    return {
      x: (nodeRect.left + nodeRect.width / 2 - scrollerRect.left) / scrollerRect.width,
      y: (nodeRect.top + nodeRect.height / 2 - scrollerRect.top) / scrollerRect.height,
    };
  }, selector);

  const freeSelector = '.diagram-node[data-node-id="cart"]';
  const mermaidSelector = '.mermaid-render [data-node-id="cart"]';
  await positionNode(freeSelector, 0.3, 0.68);
  const before = await relativePosition(freeSelector);

  await page.locator(".view-switch button").filter({ hasText: "Mermaid" }).click();
  await page.locator(mermaidSelector).waitFor({ state: "visible" });
  await page.waitForFunction(({ selector, before }) => {
    const scroller = document.querySelector(".canvas-scroll");
    const node = document.querySelector(selector);
    if (!(scroller instanceof HTMLElement) || !(node instanceof HTMLElement || node instanceof SVGElement)) return false;
    const scrollerRect = scroller.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const x = (nodeRect.left + nodeRect.width / 2 - scrollerRect.left) / scrollerRect.width;
    const y = (nodeRect.top + nodeRect.height / 2 - scrollerRect.top) / scrollerRect.height;
    return Math.abs(x - before.x) < 0.025 && Math.abs(y - before.y) < 0.025;
  }, { selector: mermaidSelector, before });
  const inMermaid = await relativePosition(mermaidSelector);
  assert.ok(Math.abs(inMermaid.x - before.x) < 0.025);
  assert.ok(Math.abs(inMermaid.y - before.y) < 0.025);

  await page.locator(".view-switch button").filter({ hasText: "FreeForm" }).click();
  await page.locator(freeSelector).waitFor({ state: "visible" });
  await page.waitForFunction(({ selector, before }) => {
    const scroller = document.querySelector(".canvas-scroll");
    const node = document.querySelector(selector);
    if (!(scroller instanceof HTMLElement) || !(node instanceof HTMLElement || node instanceof SVGElement)) return false;
    const scrollerRect = scroller.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const x = (nodeRect.left + nodeRect.width / 2 - scrollerRect.left) / scrollerRect.width;
    const y = (nodeRect.top + nodeRect.height / 2 - scrollerRect.top) / scrollerRect.height;
    return Math.abs(x - before.x) < 0.025 && Math.abs(y - before.y) < 0.025;
  }, { selector: freeSelector, before });
});
