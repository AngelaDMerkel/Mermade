import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
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
  assert.equal(shapes.length, 48, "the complete Mermaid shape catalogue must be tested");

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
        assert.equal(rendered.c4Title.textAnchor, "middle", "C4 title must be centre-aligned");
        assert.ok(Math.abs(rendered.c4Title.x - rendered.c4Title.expectedX) < 0.01, "C4 title must be centred in its viewBox");
      }
    });
  }
});

test("diagram-wide frontmatter style parses and renders for every Mermaid type", { timeout: 120_000 }, async (t) => {
  for (const type of types) {
    await t.test(type.label, async () => {
      const parsed = await page.evaluate((id) => window.mermadeStandards.parseStyledStarter(id), type.id);
      assert.ok(parsed.diagramType, `${type.label} must parse with Mermade style frontmatter`);
      assert.match(parsed.source, /^---\nconfig:/);

      const rendered = await page.evaluate((id) => window.mermadeStandards.renderStyledStarter(id), type.id);
      assert.ok(rendered.viewBox.width > 0 && rendered.viewBox.height > 0, `${type.label} styled render must have a positive viewBox`);
      assert.ok(rendered.contentCount > 0, `${type.label} styled render must contain visible content`);
      assert.equal(rendered.errorCount, 0, `${type.label} styled render must not contain Mermaid errors`);
    });
  }
});

test("every Mermaid 11 theme preset produces valid rendered SVG", { timeout: 120_000 }, async () => {
  const themes = ["default", "base", "dark", "forest", "neutral", "neo", "neo-dark", "redux", "redux-dark", "redux-color", "redux-dark-color", "null"];
  const signatures = new Set();
  for (const theme of themes) {
    const rendered = await page.evaluate((value) => window.mermadeStandards.renderStyleVariant("theme", value), theme);
    assert.equal(rendered.diagramType, "flowchart-v2", `${theme} must parse as a flowchart`);
    assert.ok(rendered.viewBox.width > 0 && rendered.viewBox.height > 0, `${theme} must produce positive SVG geometry`);
    assert.equal(rendered.errorCount, 0, `${theme} must not produce Mermaid error output`);
    signatures.add(rendered.appearanceSignature);
  }
  assert.ok(signatures.size >= 6, "theme presets must produce materially different rendered palettes");
});

test("every Mermaid 11 rendering look produces valid rendered SVG", { timeout: 120_000 }, async () => {
  const looks = ["classic", "handDrawn", "neo"];
  const signatures = new Set();
  for (const look of looks) {
    const rendered = await page.evaluate((value) => window.mermadeStandards.renderStyleVariant("look", value), look);
    assert.ok(rendered.contentCount > 0, `${look} must render visible content`);
    assert.equal(rendered.errorCount, 0, `${look} must not produce Mermaid error output`);
    signatures.add(rendered.appearanceSignature);
  }
  assert.equal(signatures.size, looks.length, "each rendering look must produce distinct SVG styling");
});

test("flowchart relationships remain visible when the canvas is zoomed out", async () => {
  const rendered = await page.evaluate(() => window.mermadeStandards.renderStyleVariant("theme", "base"));

  assert.ok(rendered.edgeCount > 0, "the flowchart fixture must contain relationships");
  assert.equal(rendered.nonScalingEdgeCount, rendered.edgeCount, "every relationship must retain a readable screen-width stroke");
  assert.equal(rendered.readableEdgeCount, rendered.edgeCount, "normal relationships must not collapse into one-pixel lines");
});

test("every available graph layout engine produces valid rendered SVG", { timeout: 120_000 }, async () => {
  const layouts = ["dagre", "elk", "tidy-tree", "cose-bilkent"];
  const signatures = new Set();
  for (const layout of layouts) {
    const rendered = await page.evaluate((value) => window.mermadeStandards.renderStyleVariant("layout", value), layout);
    assert.ok(rendered.bounds.width > 0 && rendered.bounds.height > 0, `${layout} must render visible graph geometry`);
    assert.equal(rendered.errorCount, 0, `${layout} must not produce Mermaid error output`);
    signatures.add(rendered.layoutSignature);
  }
  assert.ok(signatures.size >= 3, "layout controls must select materially different graph arrangements");
});

test("portable diagram style remains valid in the bundled Mermaid 10 engine", async () => {
  const parsed = await page.evaluate(() => window.mermadeStandards.parseLegacyStyledFlowchart());
  assert.ok(parsed.parsed, "styled source must parse with Mermaid 10.9.6");
  assert.match(parsed.source, /theme: 'base'/);
});

test("double-clicking an unselected Mermaid flowchart node opens text editing", { timeout: 60_000 }, async () => {
  await browser?.close();
  await server?.close();
  browser = undefined;
  page = undefined;
  server = undefined;

  appServer = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "0"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...process.env, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let appServerOutput = "";
  const port = await new Promise((resolve, reject) => {
    let detectedPort;
    const timeout = setTimeout(() => reject(new Error(`Mermade interaction server did not start\n${appServerOutput}`)), 30_000);
    const inspect = (chunk) => {
      appServerOutput += chunk.toString();
      const match = appServerOutput.match(/Local:\s+http:\/\/(?:localhost|127\.0\.0\.1):(\d+)/i);
      if (match) detectedPort = Number(match[1]);
      if (!detectedPort || !/Ready in/i.test(appServerOutput)) return;
      clearTimeout(timeout);
      resolve(detectedPort);
    };
    appServer.stdout.on("data", inspect);
    appServer.stderr.on("data", inspect);
    appServer.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Mermade interaction server exited with ${code}\n${appServerOutput}`));
    });
  });

  const appUrl = `http://127.0.0.1:${port}`;
  const readinessDeadline = Date.now() + 30_000;
  let readinessError;
  for (;;) {
    if (appServer.exitCode !== null || appServer.signalCode) {
      throw new Error(`Mermade interaction server exited before accepting connections\n${appServerOutput}`);
    }
    try {
      const response = await fetch(appUrl, { signal: AbortSignal.timeout(2_000) });
      await response.arrayBuffer();
      if (response.ok) break;
      readinessError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      readinessError = error;
    }
    if (Date.now() >= readinessDeadline) {
      const reason = readinessError instanceof Error ? readinessError.message : String(readinessError);
      throw new Error(`Mermade interaction server did not accept connections: ${reason}\n${appServerOutput}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  browser = await chromium.launch({
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" }),
    headless: true,
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(appUrl);
  const welcome = page.locator(".welcome-dialog");
  await welcome.waitFor({ state: "visible" });
  assert.equal(await welcome.locator("h1").textContent(), "Make Mermaid diagrams without losing the Mermaid.");
  assert.equal(await welcome.locator('a[href="https://github.com/AngelaDMerkel/Mermade"]').count(), 1);
  await welcome.getByRole("button", { name: "Tour" }).click();
  for (let index = 0; index < 7; index += 1) {
    const card = page.locator(".tour-card");
    await card.waitFor({ state: "visible" });
    assert.match(await card.getAttribute("aria-label"), new RegExp(`Tour step ${index + 1} of 7`));
    await card.getByRole("button", { name: index === 6 ? "Finish" : "Next" }).click();
  }
  await page.reload();
  assert.equal(await page.locator(".welcome-dialog").count(), 0, "welcome should only appear on first launch");
  await page.locator(".mermaid-render svg").waitFor({ state: "visible" });

  const node = page.locator('[data-node-id="cart"]').first();
  await node.waitFor({ state: "visible" });
  await node.dblclick();

  const editor = page.locator(".mermaid-inline-editor input");
  await editor.waitFor({ state: "visible" });
  assert.equal(await editor.inputValue(), "Cart");
});

test("every registered diagram supports its intended canvas modes", { timeout: 300_000 }, async (t) => {
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Source", exact: true }).click();
  const originalSource = await page.getByRole("textbox", { name: "Mermaid source" }).inputValue();
  await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();

  const polishedTypes = new Set(["flowchart", "state", "sequence", "class", "er", "xychart"]);
  const modeNames = { freeform: "FreeForm", structured: "Structured", data: "Data" };

  try {
    for (const type of types) {
      await t.test(type.label, async () => {
        await page.getByRole("button", { name: "Source", exact: true }).click();
        await page.getByRole("textbox", { name: "Mermaid source" }).fill(type.template);
        await page.getByRole("button", { name: "Apply to canvas" }).click();
        await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();

        const mermaidButton = page.locator(".view-switch button").filter({ hasText: "Mermaid" });
        await mermaidButton.click();
        const mermaidCanvas = page.locator(".mermaid-render:not(.polished-render)");
        await mermaidCanvas.locator(":scope > svg").waitFor({ state: "visible" });
        assert.equal(await page.locator(".mermaid-render-error").count(), 0, `${type.label} Mermaid canvas must render`);

        await page.getByRole("button", { name: "Source", exact: true }).click();
        const declaration = type.template.split(/\s/)[0];
        assert.ok((await page.getByRole("textbox", { name: "Mermaid source" }).inputValue()).includes(declaration), `${type.label} Mermaid canvas must retain editable canonical source`);
        await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();

        const visualMode = modeNames[type.family];
        await page.locator(".view-switch button").filter({ hasText: visualMode }).click();
        if (type.id === "flowchart") {
          await page.locator(".diagram-board .diagram-node").first().waitFor({ state: "visible" });
        } else {
          const visualEditor = page.getByRole("region", { name: `${visualMode} editor for ${type.label}` });
          await visualEditor.waitFor({ state: "visible" });
          await visualEditor.getByRole("button", { name: "Add statement" }).click();
          await visualEditor.getByRole("button", { name: "Validate & apply" }).click();
          await page.getByRole("region", { name: `${visualMode} editor for ${type.label}` }).waitFor({ state: "visible" });
          assert.equal(await page.locator(".semantic-error").count(), 0, `${type.label} visual edit must remain valid Mermaid`);
        }

        const polishedButton = page.locator(".view-switch button").filter({ hasText: "Beautiful" });
        assert.equal(await polishedButton.isEnabled(), polishedTypes.has(type.id), `${type.label} Beautiful availability must match Beautiful Mermaid`);
        if (polishedTypes.has(type.id)) {
          await polishedButton.click();
          const polishedCanvas = page.locator(".polished-render");
          await polishedCanvas.locator(":scope > svg").waitFor({ state: "visible" });
          assert.equal(await page.locator(".mermaid-render-error").count(), 0, `${type.label} Beautiful canvas must render`);
          await page.getByRole("button", { name: "Source", exact: true }).click();
          assert.ok((await page.getByRole("textbox", { name: "Mermaid source" }).inputValue()).includes(declaration), `${type.label} Beautiful canvas must retain editable canonical source`);
          await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();
        }
      });
    }
  } finally {
    await page.getByRole("button", { name: "Source", exact: true }).click();
    await page.getByRole("textbox", { name: "Mermaid source" }).fill(originalSource);
    await page.getByRole("button", { name: "Apply to canvas" }).click();
    await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();
    await page.locator(".view-switch button").filter({ hasText: "Mermaid" }).click();
    await page.locator(".mermaid-render:not(.polished-render) svg").waitFor({ state: "visible" });
  }
});

test("ELK renders in React and Tidy Tree rejects incompatible subgraphs", { timeout: 60_000 }, async () => {
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Style", exact: true }).click();
  const layoutSelect = page
    .locator(".diagram-style-panel label")
    .filter({ hasText: "Layout" })
    .locator("select");
  const previousSvgId = await page.locator(".mermaid-render svg").getAttribute("id");

  await layoutSelect.selectOption("elk");
  await page.waitForFunction((previousId) => {
    const svg = document.querySelector(".mermaid-render svg");
    return Boolean(svg?.id && svg.id !== previousId && !document.querySelector(".mermaid-render-error"));
  }, previousSvgId);

  assert.equal(await page.locator(".mermaid-render-error").count(), 0, "ELK must render without an error in hydrated React");
  assert.ok(await page.locator(".mermaid-render .node").count() >= 7, "ELK must render the complete flowchart");

  await layoutSelect.selectOption("tidy-tree");
  await page
    .locator(".toast")
    .filter({ hasText: "Tidy Tree cannot render Flowchart subgraphs" })
    .waitFor({ state: "visible" });

  assert.equal(await layoutSelect.inputValue(), "elk", "an incompatible Tidy Tree selection must not replace the working layout");
  assert.equal(await page.locator(".mermaid-render-error").count(), 0, "the last successful render must remain error-free");

  const elkSvgId = await page.locator(".mermaid-render svg").getAttribute("id");
  await layoutSelect.selectOption("dagre");
  await page.waitForFunction((previousId) => {
    const svg = document.querySelector(".mermaid-render svg");
    return Boolean(svg?.id && svg.id !== previousId && !document.querySelector(".mermaid-render-error"));
  }, elkSvgId);
  await page.locator(".inspector-tabs").getByRole("button", { name: "Properties" }).click();
});

test("FreeForm nodes retain their exact Mermaid shape class", async () => {
  await page.keyboard.press("Escape");
  await page.locator(".view-switch button").filter({ hasText: "FreeForm" }).click();
  await page.locator('.diagram-node[data-node-id="cart"]').click();
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

test("Beautiful view lazy-renders a selectable, styled flowchart", { timeout: 60_000 }, async () => {
  await page.locator(".view-switch button").filter({ hasText: "Beautiful" }).click();
  await page.locator(".polished-render svg").waitFor({ state: "visible" });

  assert.equal(await page.locator(".mermaid-render-error").count(), 0, "the supported starter must render without a Beautiful error");
  const rootStyle = await page.locator(".polished-render svg").getAttribute("style");
  assert.match(rootStyle || "", /--bg:[^;]+;--fg:/, "the adaptive theme must provide Beautiful Mermaid's two-colour contract");
  assert.doesNotMatch(rootStyle || "", /--(?:line|accent|muted|surface|border):/, "the adaptive theme must leave Beautiful Mermaid's derived palette intact");
  assert.match(await page.locator(".polished-render svg style").textContent(), /font-family: 'Inter'/, "the Beautiful font must be a valid family name");
  assert.ok(await page.locator(".polished-render [data-node-id]").count() >= 7, "the complete starter flowchart must remain interactive");
  assert.equal(await page.locator('.polished-render [data-node-id="details"] > rect').getAttribute("fill"), "#fde8f1", "supported source styles must reach the Beautiful SVG by default");
  const node = page.locator('.polished-render [data-node-id="cart"]');
  await node.click();
  assert.match(await node.getAttribute("class"), /selected/);

  await page.getByRole("button", { name: "Style", exact: true }).click();
  const theme = page.locator(".diagram-style-panel label").filter({ hasText: "Beautiful theme" }).locator("select");
  await theme.selectOption("dracula");
  await page.waitForFunction(() => Boolean(document.querySelector('.polished-render svg[style*="#282a36"]')));
  assert.equal(await page.locator(".polished-render svg").getAttribute("preserveAspectRatio"), "xMidYMid meet");

  await page.locator(".view-switch button").filter({ hasText: "Mermaid" }).click();
  await page.locator(".mermaid-render:not(.polished-render) svg").waitFor({ state: "visible" });
  await page.locator(".inspector-tabs").getByRole("button", { name: "Properties" }).click();
});

test("Zinc Dark keeps source-coloured nodes readable on a matching preview canvas", { timeout: 60_000 }, async () => {
  await page.getByRole("button", { name: "Source", exact: true }).click();
  const sourceEditor = page.getByRole("textbox", { name: "Mermaid source" });
  const originalSource = await sourceEditor.inputValue();
  try {
    await sourceEditor.fill(`flowchart LR
  A["Bright source node"] --> B["Theme node"]
  style A fill:#FFDE59`);
    await page.locator(".source-panel").getByRole("button", { name: "Apply to canvas" }).click();
    await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();
    await page.locator(".view-switch button").filter({ hasText: "Beautiful" }).click();
    await page.getByRole("button", { name: "Style", exact: true }).click();
    await page.getByRole("combobox", { name: "Beautiful theme" }).selectOption("zinc-dark");
    const adjustedText = page.locator('.polished-render text[data-mermade-contrast="auto"]').filter({ hasText: "Bright source node" });
    await adjustedText.waitFor({ state: "visible" });

    assert.equal(await adjustedText.evaluate((element) => getComputedStyle(element).fill), "rgb(0, 0, 0)");
    assert.equal(await page.locator(".polished-render").evaluate((element) => getComputedStyle(element).backgroundColor), "rgb(24, 24, 27)");
  } finally {
    await page.getByRole("combobox", { name: "Beautiful theme" }).selectOption("mermade-auto");
    await page.getByRole("button", { name: "Source", exact: true }).click();
    await page.getByRole("textbox", { name: "Mermaid source" }).fill(originalSource);
    await page.locator(".source-panel").getByRole("button", { name: "Apply to canvas" }).click();
    await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();
    await page.locator(".view-switch button").filter({ hasText: "Mermaid" }).click();
  }
});

test("Unicode export downloads UTF-8 text without blocking on large flowcharts", { timeout: 60_000 }, async () => {
  await page.getByRole("button", { name: "Source", exact: true }).click();
  const sourceEditor = page.getByRole("textbox", { name: "Mermaid source" });
  const originalSource = await sourceEditor.inputValue();
  await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();

  const downloadUnicode = async () => {
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Unicode diagram/ }).click();
    const download = await downloadPromise;
    return readFile(await download.path(), "utf8");
  };

  try {
    const ordinary = await downloadUnicode();
    assert.equal(ordinary.charCodeAt(0), 0xfeff, "Unicode text must carry an explicit UTF-8 BOM");
    assert.match(ordinary, /[┌┐└┘─│◇○]/, "ordinary diagrams must use Beautiful Mermaid's spatial Unicode renderer");

    const lines = ["flowchart TB"];
    for (let index = 0; index < 30; index += 1) lines.push(`n${index}[\"Step ${index}\"]`);
    for (let index = 0; index < 29; index += 1) lines.push(`n${index} --> n${index + 1}`);
    await page.getByRole("button", { name: "Source", exact: true }).click();
    await page.getByRole("textbox", { name: "Mermaid source" }).fill(lines.join("\n"));
    await page.getByRole("button", { name: "Apply to canvas" }).click();
    await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();

    const started = Date.now();
    const large = await downloadUnicode();
    assert.ok(Date.now() - started < 10_000, "large Unicode export must remain responsive");
    assert.match(large, /UNICODE RELATIONSHIP MAP/);
    assert.match(large, /Step 0[\s\S]*Step 1/);
  } finally {
    await page.getByRole("button", { name: "Source", exact: true }).click();
    await page.getByRole("textbox", { name: "Mermaid source" }).fill(originalSource);
    const restore = page.getByRole("button", { name: "Apply to canvas" });
    if (await restore.isEnabled()) await restore.click();
    await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();
  }
});

test("source text uses focused undo before it is applied", async () => {
  await page.locator(".secondary-button").filter({ hasText: "Source" }).click();
  const sourceEditor = page.getByRole("textbox", { name: "Mermaid source" });
  const original = await sourceEditor.inputValue();
  await sourceEditor.evaluate((element) => element.setSelectionRange(element.value.length, element.value.length));
  await sourceEditor.type("\n%% undo-check");
  assert.match(await sourceEditor.inputValue(), /undo-check/);
  await sourceEditor.press("Meta+z");
  assert.equal(await sourceEditor.inputValue(), original);
  await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();
});

test("invalid pasted source offers and applies only verified repair options", async () => {
  await page.locator(".secondary-button").filter({ hasText: "Source" }).click();
  const sourceEditor = page.locator(".source-editor-wrap textarea");
  await sourceEditor.fill("```mermaid\nflowchart LR\n  A --> B\n```");
  await page.locator(".source-panel .primary-button").filter({ hasText: "Apply to canvas" }).click();

  const repairButton = page.locator(".inspector-footer button").filter({ hasText: "Repair Mermaid" });
  await repairButton.waitFor({ state: "visible" });
  await repairButton.click();
  const repair = page.locator(".repair-option").filter({ hasText: "Remove the Markdown code fence" });
  await repair.waitFor({ state: "visible" });
  await repair.getByRole("button", { name: "Apply verified fix" }).click();
  await page.locator(".inspector-footer").filter({ hasText: "Valid Mermaid Flowchart" }).waitFor({ state: "visible" });
  await page.locator(".view-switch button").filter({ hasText: "Mermaid" }).click();
  await page.locator(".mermaid-render svg").waitFor({ state: "visible" });
});

test("Tidy Tree renders a compatible hierarchy in React", { timeout: 60_000 }, async () => {
  await page.getByRole("button", { name: "Style", exact: true }).click();
  const layoutSelect = page
    .locator(".diagram-style-panel label")
    .filter({ hasText: "Layout" })
    .locator("select");
  const previousSvgId = await page.locator(".mermaid-render svg").getAttribute("id");

  await layoutSelect.selectOption("tidy-tree");
  await page.waitForFunction((previousId) => {
    const svg = document.querySelector(".mermaid-render svg");
    return Boolean(svg?.id && svg.id !== previousId && !document.querySelector(".mermaid-render-error"));
  }, previousSvgId);

  assert.equal(await page.locator(".mermaid-render-error").count(), 0, "Tidy Tree must render a verified hierarchy without an error");
  assert.equal(await page.locator(".mermaid-render .node").count(), 2, "Tidy Tree must render both hierarchy nodes");
});

test("advanced flowcharts retain the spatial canvas, direction controls, and tools", { timeout: 60_000 }, async () => {
  const advancedSource = `flowchart TB
  %% preserve this explanation
  A@{ shape: stadium, label: "Start" }
  B@{ shape: diam, label: "Ready?" }
  C["PB&S"]
  A --> B --> C
  classDef important stroke:#8c52ff
  class B important
  click B "/details" "Open details"`;

  await page.locator(".secondary-button").filter({ hasText: "Source" }).click();
  await page.locator(".source-editor-wrap textarea").fill(advancedSource);
  await page.locator(".source-panel .primary-button").filter({ hasText: "Apply to canvas" }).click();
  await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();

  const direction = page.locator('.direction-switch[aria-label="Chart direction"]');
  await direction.waitFor({ state: "visible" });
  assert.equal(await direction.getByRole("button").count(), 2);
  for (const label of ["Select (V)", "Marquee select (M)", "Add node (N)", "Link nodes (L)", "Create subgraph (S)", "Add decision (D)", "Organise chart (O)"]) {
    assert.equal(await page.getByRole("button", { name: label }).isEnabled(), true, `${label} must remain enabled`);
  }

  await direction.getByRole("button", { name: "Left → right" }).click();
  await page.locator(".view-switch button").filter({ hasText: "FreeForm" }).click();
  await page.locator(".diagram-board").waitFor({ state: "visible" });
  assert.equal(await page.locator(".semantic-editor").count(), 0, "a complex flowchart must not be sent to the generic statement editor");
  assert.equal(await page.locator(".diagram-board .diagram-node").count(), 3);
  assert.equal(await page.locator(".diagram-board .diagram-edge").count(), 2, "chained relationships must remain spatially represented");

  await page.getByRole("button", { name: "Add node (N)" }).click();
  assert.equal(await page.locator(".diagram-board .diagram-node").count(), 4, "node creation must work on protected source");
  await page.locator(".view-switch button").filter({ hasText: "Mermaid" }).click();
  await page.locator(".mermaid-render svg").waitFor({ state: "visible" });
  assert.equal(await page.locator(".mermaid-render-error").count(), 0, "source-preserving canvas edits must remain valid Mermaid");
  await page.locator(".secondary-button").filter({ hasText: "Source" }).click();
  const updatedSource = await page.locator(".source-editor-wrap textarea").inputValue();
  assert.match(updatedSource, /^flowchart LR/m);
  assert.match(updatedSource, /click B "\/details" "Open details"/);
  assert.match(updatedSource, /node4\["New step"\]/);
});
