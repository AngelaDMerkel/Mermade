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

async function applyValidSourceAndWait() {
  const apply = page.getByRole("button", { name: "Apply to canvas" });
  await apply.click();
  await page.waitForFunction(() => document.querySelector(".source-panel .primary-button")?.hasAttribute("disabled"));
}

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

test("each flowchart declaration passes the real Mermaid parser", { timeout: 120_000 }, async (t) => {
  assert.ok(types.length > 0, "the flowchart fixtures must not be empty");

  for (const type of types) {
    await t.test(type.label, async () => {
      const parsed = await page.evaluate((id) => window.mermadeStandards.parseStarter(id), type.id);
      assert.equal(parsed.id, type.id);
      assert.ok(parsed.diagramType, `${type.label} must report a Mermaid parser type`);
    });
  }
});

test("each flowchart declaration meets the SVG rendering standard", { timeout: 120_000 }, async (t) => {
  assert.ok(types.length > 0, "the flowchart fixtures must not be empty");

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

    });
  }
});

test("repeated flowchart labels retain separate source-line identities", async () => {
  const sourceLines = await page.evaluate(() => window.mermadeStandards.inspectRepeatedFlowchartLabelSelection());
  assert.deepEqual(sourceLines, ["1", "2"]);
});

test("diagram-wide frontmatter style parses and renders for each flowchart declaration", { timeout: 120_000 }, async (t) => {
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
  const layouts = ["dagre", "elk", "tidy-tree"];
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
  for (let index = 0; index < 6; index += 1) {
    const card = page.locator(".tour-card");
    await card.waitFor({ state: "visible" });
    assert.match(await card.getAttribute("aria-label"), new RegExp(`Tour step ${index + 1} of 6`));
    await card.getByRole("button", { name: index === 5 ? "Finish" : "Next" }).click();
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
  assert.equal(
    await node.locator(":scope > .mermade-node-hit").evaluate((element) => getComputedStyle(element).stroke),
    "rgba(0, 0, 0, 0)",
    "the enlarged node hit target must remain invisible while its node is selected",
  );
});

test("visual node labels preserve square brackets as quoted Mermaid text", { timeout: 60_000 }, async () => {
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Source", exact: true }).click();
  const originalSource = await page.getByRole("textbox", { name: "Mermaid source" }).inputValue();
  const source = [
    "flowchart TB",
    '  A["Inventory"]',
    '  B["Done"]',
    "  A --> B",
  ].join("\n");
  try {
    await page.getByRole("textbox", { name: "Mermaid source" }).fill(source);
    await applyValidSourceAndWait();
    await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();
    await page.locator(".view-switch button").filter({ hasText: "Mermaid" }).click();

    const node = page.locator('.mermaid-render .node[data-node-id="A"]');
    await node.waitFor({ state: "visible" });
    await node.click();
    assert.match(await page.locator(".selection-heading").textContent(), /Inventory/);
    await page.getByRole("button", { name: "Properties", exact: true }).click();
    const text = page.locator(".inspector-body .field-stack textarea").first();
    await text.waitFor({ state: "visible" });
    await text.fill("Inventory ");
    await text.pressSequentially("[SKU]");
    assert.equal(await text.inputValue(), "Inventory [SKU]");
    await page.waitForFunction(() => [...document.querySelectorAll(".mermaid-render .nodeLabel")]
      .some((label) => label.textContent === "Inventory [SKU]"));
    assert.equal(await page.locator(".mermaid-render-error").count(), 0, "bracketed node text must continue rendering");

    await page.getByRole("button", { name: "Source", exact: true }).click();
    const updated = await page.getByRole("textbox", { name: "Mermaid source" }).inputValue();
    assert.match(updated, /^\s*A\["Inventory \[SKU\]"\]$/m, "Mermade must retain the brackets inside one quoted node declaration");
    assert.equal(updated.match(/^\s*A\["/gm)?.length, 1);
    assert.doesNotMatch(updated, /"\]"\]/, "visual keystrokes must not leave duplicated shape delimiters");
    assert.match(updated, /^\s*A --> B$/m);
  } finally {
    if (await page.locator(".source-panel").count() === 0) await page.getByRole("button", { name: "Source", exact: true }).click();
    await page.getByRole("textbox", { name: "Mermaid source" }).fill(originalSource);
    await applyValidSourceAndWait();
    await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();
  }
});

test("Mermaid relationship identities keep paths, labels and replacement selection isolated", { timeout: 60_000 }, async () => {
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Source", exact: true }).click();
  const originalSource = await page.getByRole("textbox", { name: "Mermaid source" }).inputValue();
  const source = [
    "---",
    "config:",
    "  layout: elk",
    "---",
    "flowchart TB",
    "  node41{Is the required quantity below the threshold?}",
    "  node9{Is this Product container in the Product Library?}",
    "  node10[Stamp in the correct Products in Takeoff]",
    "  node11[Manually enter the correct Shipment Items]",
    "  node13[Create a Buyout Pull Sheet]",
    "  node7[Engineering]",
    "  node9 -->|Yes| node10",
    "  node9 -->|No| node11",
    "  node10 --> node13",
    "  node41 -->|Yes| node9",
    "  node11 --> node13",
    "  node41 --> node7",
  ].join("\n");
  try {
    await page.getByRole("textbox", { name: "Mermaid source" }).fill(source);
    await applyValidSourceAndWait();
    await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();
    await page.getByRole("button", { name: "Source", exact: true }).click();
    assert.equal(
      await page.getByRole("textbox", { name: "Mermaid source" }).inputValue(),
      source,
      "validated pasted Mermaid must remain the exact authoritative document rather than being regenerated from the visual model",
    );
    await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();
    await page.locator(".view-switch button").filter({ hasText: "Mermaid" }).click();

    const identityReport = await page.evaluate(() => {
      const paths = [...document.querySelectorAll(".mermaid-render .edgePaths path:not(.mermaid-edge-hit)")];
      const labels = [...document.querySelectorAll(".mermaid-render .edgeLabels > .edgeLabel")];
      const modelIdForRenderedIdentity = new Map(paths.map((path) => [path.dataset.id, path.dataset.edgeId]));
      return {
        paths: paths.length,
        hitTargets: document.querySelectorAll(".mermaid-render .edgePaths path.mermaid-edge-hit").length,
        directLabels: labels.filter((label) => label.dataset.edgeId).length,
        nestedLabelsWithEdgeId: document.querySelectorAll(".mermaid-render .edgeLabels > .edgeLabel .edgeLabel[data-edge-id]").length,
        uniquePathIdentities: new Set(paths.map((path) => path.dataset.edgeId)).size,
        mismatchedLabels: labels.filter((label) => {
          const renderedIdentity = label.querySelector("[data-id]")?.getAttribute("data-id");
          return renderedIdentity && modelIdForRenderedIdentity.get(renderedIdentity) !== label.dataset.edgeId;
        }).length,
      };
    });
    assert.equal(identityReport.hitTargets, identityReport.paths, "each relationship path must have one wide selectable hit target");
    assert.equal(identityReport.directLabels, identityReport.paths, "each relationship path must have one top-level label identity");
    assert.equal(identityReport.nestedLabelsWithEdgeId, 0, "nested Mermaid HTML labels must not consume relationship identities");
    assert.equal(identityReport.uniquePathIdentities, identityReport.paths, "separate source relationships must retain separate model identities");
    assert.equal(identityReport.mismatchedLabels, 0, "each label must bind through Mermaid's own relationship identity rather than DOM order");

    const longRelationship = page.locator('.mermaid-render .edgePaths path[data-id="L_node41_node7_0"]:not(.mermaid-edge-hit)');
    const shortRelationship = page.locator('.mermaid-render .edgePaths path[data-id="L_node10_node13_0"]:not(.mermaid-edge-hit)');
    const longRelationshipId = await longRelationship.getAttribute("data-edge-id");
    const shortRelationshipId = await shortRelationship.getAttribute("data-edge-id");
    assert.ok(longRelationshipId && shortRelationshipId && longRelationshipId !== shortRelationshipId);

    await longRelationship.dispatchEvent("pointerdown", { bubbles: true, button: 0 });
    assert.deepEqual(
      await page.locator(".mermaid-render .edgePaths path.mermade-selected:not(.mermaid-edge-hit)").evaluateAll((elements) => elements.map((element) => element.dataset.edgeId)),
      [longRelationshipId],
      "the long threshold relationship must be the only visual selection",
    );

    // A renderer update can replace identity metadata before React reconciles
    // its selection. The namespaced visual marker must still be cleared from
    // that formerly selected segment when another relationship is chosen.
    await longRelationship.evaluate((element) => element.removeAttribute("data-edge-id"));
    await shortRelationship.dispatchEvent("pointerdown", { bubbles: true, button: 0 });
    assert.equal(await longRelationship.evaluate((element) => element.classList.contains("mermade-selected")), false);
    assert.deepEqual(
      await page.locator(".mermaid-render .edgePaths path.mermade-selected:not(.mermaid-edge-hit)").evaluateAll((elements) => elements.map((element) => element.dataset.edgeId)),
      [shortRelationshipId],
      "selecting node10 → node13 must replace, rather than accumulate with, node41 → node7",
    );
    assert.match(await page.locator(".selection-heading").textContent(), /node10\s*→\s*node13/);

    await page.keyboard.press("e");
    const relationshipLabel = page.getByLabel("Label", { exact: true });
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-keyshortcuts") === "E");
    await relationshipLabel.pressSequentially("Source-backed edit");
    assert.equal(await relationshipLabel.inputValue(), "Source-backed edit", "E must put keyboard focus into the selected relationship label");
    await page.waitForFunction(() => [...document.querySelectorAll(".mermaid-render .edgeLabels > .edgeLabel")]
      .some((label) => label.textContent === "Source-backed edit"));
    await page.getByRole("button", { name: "Source", exact: true }).click();
    const visuallyEditedSource = await page.getByRole("textbox", { name: "Mermaid source" }).inputValue();
    assert.match(visuallyEditedSource, /^  node10 -->\|"Source-backed edit"\| node13$/m);
    assert.ok(
      visuallyEditedSource.indexOf('  node41 -->|"Yes"| node9') < visuallyEditedSource.indexOf("  node11 --> node13"),
      "a visual relationship edit must patch the authoritative source without reconstructing its statement order",
    );
    await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();

    const deletionTarget = page.locator('.mermaid-render .edgePaths path[data-id="L_node41_node7_0"]:not(.mermaid-edge-hit)');
    await deletionTarget.dispatchEvent("pointerdown", { bubbles: true, button: 0 });
    assert.match(await page.locator(".selection-heading").textContent(), /node41\s*→\s*node7/);
    await page.getByRole("button", { name: "Delete relationship" }).click();
    await page.getByRole("button", { name: "Source", exact: true }).click();
    const sourceAfterDeletion = await page.getByRole("textbox", { name: "Mermaid source" }).inputValue();
    assert.doesNotMatch(sourceAfterDeletion, /^\s*node41 --> node7$/m, "the selected relationship must be removed");
    assert.match(sourceAfterDeletion, /^\s*node41 -->\|"?Yes"?\| node9$/m, "another relationship from the same node must remain");
    assert.match(sourceAfterDeletion, /^\s*node11 --> node13$/m, "an unrelated relationship must remain");
    assert.doesNotMatch(sourceAfterDeletion, /^\s*node41\s*$/m, "deletion must not append a duplicate bare source node");
    assert.doesNotMatch(sourceAfterDeletion, /^\s*node7\s*$/m, "deletion must not append a duplicate bare target node");
    await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();
  } finally {
    if (await page.locator(".source-panel").count() === 0) await page.getByRole("button", { name: "Source", exact: true }).click();
    await page.getByRole("textbox", { name: "Mermaid source" }).fill(originalSource);
    await applyValidSourceAndWait();
    await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();
  }
});

test("the rework return relationship accepts a visual label without changing another edge", { timeout: 60_000 }, async () => {
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Source", exact: true }).click();
  const originalSource = await page.getByRole("textbox", { name: "Mermaid source" }).inputValue();
  const source = [
    "flowchart TB",
    '  node40@{ shape: fr-rect, label: "Production" }',
    '  node41["Manufacturing completed"]',
    '  node69@{ shape: diam, label: "Is there any rework?" }',
    '  node71@{ shape: diam, label: "Does the Rework require additional Materials?" }',
    '  node72@{ shape: diam, label: "Is this expected labor less than ten minutes? " }',
    '  node73["Yes"]',
    '  node70["Create a Rework Work Order"]',
    '  node74@{ shape: lean-r, label: "Set the Critical Date" }',
    '  node75["Plant Manager fulfils the [REWORK] request"]',
    '  node76["Create required Material Labels"]',
    '  node77["Advance Workflow to \'In Production\'"]',
    "  node40 --> node41",
    "  node40 --> node69",
    '  node69 -->|"No"| node41',
    "  node69 --> node71",
    '  node71 -->|"No"| node72',
    '  node71 -->|"Yes"| node73',
    '  node73 -->|"Yes"| node70',
    '  node72 -->|"No"| node70',
    "  node70 --> node74",
    "  node74 --> node75",
    "  node75 --> node76",
    "  node76 --> node77",
    "  node77 --> node41",
    "  node72 --> node41",
  ].join("\n");
  try {
    await page.getByRole("textbox", { name: "Mermaid source" }).fill(source);
    await applyValidSourceAndWait();
    await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();
    await page.locator(".view-switch button").filter({ hasText: "Mermaid" }).click();

    const node = page.locator('.mermaid-render [data-node-id="node72"]').first();
    await node.waitFor({ state: "attached" });
    await node.dispatchEvent("pointerdown", { bubbles: true, button: 0 });
    await page.getByRole("button", { name: "Edit outgoing relationship node72 to node41" }).click();
    assert.match(await page.locator(".selection-heading").textContent(), /node72\s*→\s*node41/);
    const label = page.getByLabel("Label", { exact: true });
    await label.pressSequentially("Yes");
    assert.equal(await label.inputValue(), "Yes");
    await page.waitForFunction(() => [...document.querySelectorAll(".mermaid-render .edgeLabels > .edgeLabel")]
      .some((element) => element.textContent === "Yes"));

    await page.getByRole("button", { name: "Source", exact: true }).click();
    const updated = await page.getByRole("textbox", { name: "Mermaid source" }).inputValue();
    assert.match(updated, /^\s*node72 -->\|"Yes"\| node41$/m);
    assert.match(updated, /^\s*node72 -->\|"No"\| node70$/m, "the other node72 relationship must remain unchanged");
    assert.equal(updated.match(/^\s*node72\s+-->/gm)?.length, 2);
  } finally {
    if (await page.locator(".source-panel").count() === 0) await page.getByRole("button", { name: "Source", exact: true }).click();
    await page.getByRole("textbox", { name: "Mermaid source" }).fill(originalSource);
    await applyValidSourceAndWait();
    await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();
  }
});

test("compact Mermaid fan-in and fan-out relationships remain individually deletable", { timeout: 60_000 }, async () => {
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Source", exact: true }).click();
  const originalSource = await page.getByRole("textbox", { name: "Mermaid source" }).inputValue();
  const source = [
    "flowchart TB",
    '  existing{"Is this an existing Brand partner or a new customer?"}',
    "  newCustomer[New customer]",
    "  sales[Sales populates customer details]",
    "  handoff[Sales handoff]",
    "  existing & newCustomer --> sales & handoff",
  ].join("\n");
  try {
    await page.getByRole("textbox", { name: "Mermaid source" }).fill(source);
    await applyValidSourceAndWait();
    await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();
    await page.locator(".view-switch button").filter({ hasText: "Mermaid" }).click();
    await page.locator('.mermaid-render .edgePaths path[data-id="L_existing_sales_0"]:not(.mermaid-edge-hit)').waitFor({ state: "attached" });

    const relationships = await page.locator(".mermaid-render .edgePaths path:not(.mermaid-edge-hit)").evaluateAll((paths) => paths.map((path) => ({
      rendered: path.dataset.id,
      model: path.dataset.edgeId,
    })));
    assert.equal(relationships.length, 4, "Mermaid should render all four compact relationships");
    assert.equal(relationships.filter(({ model }) => model).length, 4, `every rendered relationship must have an exact model identity: ${JSON.stringify(relationships)}`);
    assert.equal(new Set(relationships.map(({ model }) => model)).size, 4, "compact relationships must never share selection identities");

    const target = page.locator('.mermaid-render .edgePaths path[data-id="L_existing_sales_0"]:not(.mermaid-edge-hit)');
    await target.dispatchEvent("pointerdown", { bubbles: true, button: 0 });
    assert.match(await page.locator(".selection-heading").textContent(), /existing\s*→\s*sales/);
    await page.getByRole("button", { name: "Delete relationship" }).click();
    await page.getByRole("button", { name: "Source", exact: true }).click();
    const updated = await page.getByRole("textbox", { name: "Mermaid source" }).inputValue();
    assert.doesNotMatch(updated, /^\s*existing --> sales$/m);
    assert.match(updated, /^\s*existing --> handoff$/m);
    assert.match(updated, /^\s*newCustomer --> sales$/m);
    assert.match(updated, /^\s*newCustomer --> handoff$/m);
  } finally {
    if (await page.locator(".source-panel").count() === 0) await page.getByRole("button", { name: "Source", exact: true }).click();
    await page.getByRole("textbox", { name: "Mermaid source" }).fill(originalSource);
    await applyValidSourceAndWait();
    await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();
  }
});

test("shipment relationship deletion preserves nodes and immediately rebuilds visual identities", { timeout: 60_000 }, async () => {
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Source", exact: true }).click();
  const originalSource = await page.getByRole("textbox", { name: "Mermaid source" }).inputValue();
  const source = [
    "flowchart TB",
    '  node42["Stage Shipment Items in lanes"]',
    '  node43@{ shape: cyl, label: "Upload weights and dimensions spreadsheet to Files in INNERGY" }',
    '  node44["Load Shipment and mark Shipment Items and Shipped in INNERGY"]',
    '  node45["Project Management confirms shipment status"]',
    '  node47["Advance Workflow to \'Staged\'"]',
    "  node42 --> node43",
    "  node44 --> node45",
    "  node42 --> node47",
    "  node43 --> node47",
    "  node47 --> node44",
  ].join("\n");
  try {
    await page.getByRole("textbox", { name: "Mermaid source" }).fill(source);
    await applyValidSourceAndWait();
    await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();
    await page.locator(".view-switch button").filter({ hasText: "Mermaid" }).click();

    const stagingRelationship = page.locator('.mermaid-render .edgePaths path[data-id="L_node42_node47_0"]:not(.mermaid-edge-hit)');
    await stagingRelationship.waitFor({ state: "attached" });
    const stagingHitTarget = page.locator('.mermaid-render .edgePaths path.mermaid-edge-hit[data-id="L_node42_node47_0"]');
    assert.ok(
      await stagingHitTarget.evaluate((element) => {
        const stage = element.closest(".mermaid-stage");
        const scale = stage ? new DOMMatrixReadOnly(getComputedStyle(stage).transform).a : 1;
        return Number.parseFloat(getComputedStyle(element).strokeWidth) * scale >= 15;
      }),
      "relationship hit areas must stay at least 15 screen pixels wide when a chart is fitted",
    );
    await stagingRelationship.dispatchEvent("pointerdown", { bubbles: true, button: 0 });
    assert.match(await page.locator(".selection-heading").textContent(), /node42\s*→\s*node47/);
    await page.getByRole("button", { name: "Delete relationship" }).click();

    await page.getByRole("button", { name: "Source", exact: true }).click();
    const updated = await page.getByRole("textbox", { name: "Mermaid source" }).inputValue();
    assert.doesNotMatch(updated, /^\s*node42 --> node47$/m, "only the selected staging relationship should be removed");
    assert.match(updated, /^\s*node44\["Load Shipment and mark Shipment Items and Shipped in INNERGY"\]$/m, "the downstream node declaration must remain");
    assert.match(updated, /^\s*node44 --> node45$/m, "the downstream node's outgoing relationship must remain");
    assert.match(updated, /^\s*node47 --> node44$/m, "the downstream node's incoming relationship must remain");
    await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();

    // The deleted relationship was in the middle of the source relationship
    // list. The following rendered identity therefore receives a new visual
    // id and proves that React state was re-projected from Mermaid immediately.
    const downstreamRelationship = page.locator('.mermaid-render .edgePaths path[data-id="L_node47_node44_0"]:not(.mermaid-edge-hit)');
    await downstreamRelationship.waitFor({ state: "attached" });
    await downstreamRelationship.dispatchEvent("pointerdown", { bubbles: true, button: 0 });
    assert.match(
      await page.locator(".selection-heading").textContent(),
      /node47\s*→\s*node44/,
      "the next selection must resolve through the rebuilt Mermaid projection rather than stale edge numbering",
    );
  } finally {
    if (await page.locator(".source-panel").count() === 0) await page.getByRole("button", { name: "Source", exact: true }).click();
    await page.getByRole("textbox", { name: "Mermaid source" }).fill(originalSource);
    await applyValidSourceAndWait();
    await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();
  }
});

test("restoring a source-backed flowchart rebuilds stale duplicate relationship ids", { timeout: 60_000 }, async () => {
  const sourceBacked = await page.evaluate(() => {
    const index = JSON.parse(localStorage.getItem("mermade-diagram-library-v1") || "null");
    if (!index?.activeId) return false;
    const key = `mermade-diagram-document-v1:${index.activeId}`;
    const document = JSON.parse(localStorage.getItem(key) || "null");
    return Boolean(document?.diagram?.source && document.diagram.edges.length >= 2);
  });
  assert.equal(sourceBacked, true, "the test diagram must be persisted as source-backed Mermaid");

  // Corrupt the cache at the start of the next document, after the current
  // page's pagehide flush has completed but before Mermade restores it.
  await page.addInitScript(() => {
    if (sessionStorage.getItem("mermade-duplicate-edge-regression")) return;
    sessionStorage.setItem("mermade-duplicate-edge-regression", "done");
    const index = JSON.parse(localStorage.getItem("mermade-diagram-library-v1") || "null");
    if (!index?.activeId) return;
    const key = `mermade-diagram-document-v1:${index.activeId}`;
    const document = JSON.parse(localStorage.getItem(key) || "null");
    if (!document?.diagram?.source || document.diagram.edges.length < 2) return;
    document.diagram.edges[1].id = document.diagram.edges[0].id;
    localStorage.setItem(key, JSON.stringify(document));
  });

  await page.reload();
  await page.locator(".mermaid-render svg").waitFor({ state: "visible" });
  const identities = await page.evaluate(() => {
    const paths = [...document.querySelectorAll(".mermaid-render .edgePaths path:not(.mermaid-edge-hit)")];
    return {
      paths: paths.length,
      unique: new Set(paths.map((path) => path.dataset.edgeId)).size,
      unbound: paths.filter((path) => !path.dataset.edgeId).length,
      relationships: paths.map((path) => ({ rendered: path.dataset.id, model: path.dataset.edgeId })),
    };
  });

  assert.ok(identities.paths > 1);
  assert.equal(identities.unbound, 0, "every restored Mermaid relationship must remain selectable");
  assert.equal(identities.unique, identities.paths, `no two source relationships may share one selection identity: ${JSON.stringify(identities.relationships)}`);
});

test("local diagram switcher creates, searches, switches, duplicates and deletes isolated charts", { timeout: 60_000 }, async () => {
  await page.keyboard.press("Escape");
  const nameInput = page.getByRole("textbox", { name: "Diagram name" });
  const originalName = await nameInput.inputValue();
  const waitForSaved = () => page.waitForFunction(() => document.querySelector(".save-status")?.textContent?.includes("Saved locally"));
  const openLibrary = async () => {
    await page.locator(".save-status").click();
    await page.getByRole("dialog", { name: "Local diagrams" }).waitFor({ state: "visible" });
  };

  await openLibrary();
  await page.getByRole("dialog", { name: "Local diagrams" }).getByRole("button", { name: "New" }).click();
  await nameInput.fill("Library test diagram");
  await waitForSaved();

  await openLibrary();
  await page.getByRole("dialog", { name: "Local diagrams" }).getByRole("button", { name: "Duplicate" }).click();
  await waitForSaved();
  assert.equal(await nameInput.inputValue(), "Library test diagram copy");

  await openLibrary();
  const library = page.getByRole("dialog", { name: "Local diagrams" });
  await library.getByRole("searchbox", { name: "Search local diagrams" }).fill(originalName);
  assert.equal(await library.getByRole("option", { name: new RegExp(`^${originalName}`) }).count(), 1);
  assert.equal(await library.getByRole("option", { name: /^Library test diagram/ }).count(), 0);
  await library.getByRole("option", { name: new RegExp(`^${originalName}`) }).click();
  assert.equal(await nameInput.inputValue(), originalName);

  await page.keyboard.press("Control+z");
  assert.equal(await nameInput.inputValue(), originalName, "undo must not cross a local diagram boundary");

  await openLibrary();
  await page.getByRole("dialog", { name: "Local diagrams" }).getByRole("option", { name: /^Library test diagram copy/ }).click();
  await openLibrary();
  await page.getByRole("dialog", { name: "Local diagrams" }).getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog", { name: "Delete local diagram" }).getByRole("button", { name: "Delete" }).click();

  if (await nameInput.inputValue() !== "Library test diagram") {
    await openLibrary();
    await page.getByRole("dialog", { name: "Local diagrams" }).getByRole("option", { name: /^Library test diagram Edited/ }).click();
  }
  await openLibrary();
  await page.getByRole("dialog", { name: "Local diagrams" }).getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog", { name: "Delete local diagram" }).getByRole("button", { name: "Delete" }).click();

  if (await nameInput.inputValue() !== originalName) {
    await openLibrary();
    await page.getByRole("dialog", { name: "Local diagrams" }).getByRole("option", { name: new RegExp(`^${originalName}`) }).click();
  }
  assert.equal(await nameInput.inputValue(), originalName);
});

test("blocked browser storage still allows creating and switching session diagrams", { timeout: 30_000 }, async () => {
  const isolated = await browser.newPage();
  const errors = [];
  isolated.on("pageerror", (error) => errors.push(error.message));
  try {
    await isolated.addInitScript(() => {
      Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Blocked", "SecurityError"); } });
    });
    await isolated.goto(page.url());
    await isolated.locator(".welcome-dialog").getByRole("button", { name: "Start Editing" }).click();
    const name = isolated.getByRole("textbox", { name: "Diagram name" });
    const original = await name.inputValue();
    await isolated.locator(".save-status").click();
    await isolated.getByRole("dialog", { name: "Local diagrams" }).getByRole("button", { name: "New" }).click();
    await name.fill("Session only");
    await isolated.locator(".save-status.unavailable").waitFor();
    await isolated.locator(".save-status").click();
    await isolated.getByRole("option", { name: new RegExp(`^${original}`) }).click();
    assert.equal(await name.inputValue(), original);
    assert.deepEqual(errors, []);
  } finally {
    await isolated.close();
  }
});

test("an import that finishes reading after a document switch cannot replace the new diagram", { timeout: 30_000 }, async () => {
  const isolated = await browser.newPage();
  try {
    await isolated.addInitScript(() => {
      const read = File.prototype.text;
      File.prototype.text = async function () {
        window.fileReadStarted = true;
        await new Promise((resolve) => { window.releaseFileRead = resolve; });
        const value = await read.call(this);
        window.fileReadFinished = true;
        return value;
      };
    });
    await isolated.goto(page.url());
    await isolated.locator(".welcome-dialog").getByRole("button", { name: "Start Editing" }).click();
    await isolated.locator('input[type="file"]').setInputFiles({
      name: "Pending import.mmd", mimeType: "text/plain", buffer: Buffer.from("flowchart LR\n Old --> Imported"),
    });
    await isolated.waitForFunction(() => window.fileReadStarted);
    await isolated.locator(".save-status").click();
    await isolated.getByRole("dialog", { name: "Local diagrams" }).getByRole("button", { name: "New" }).click();
    await isolated.getByRole("textbox", { name: "Diagram name" }).fill("New document");
    await isolated.evaluate(() => window.releaseFileRead());
    await isolated.waitForFunction(() => window.fileReadFinished);
    await isolated.getByRole("button", { name: "Source", exact: true }).click();
    assert.equal(await isolated.getByRole("textbox", { name: "Diagram name" }).inputValue(), "New document");
    assert.doesNotMatch(await isolated.getByRole("textbox", { name: "Mermaid source" }).inputValue(), /Old|Imported/);
  } finally {
    await isolated.close();
  }
});

test("unsupported source edits and imports preserve the current flowchart", { timeout: 60_000 }, async () => {
  const context = await browser.newContext();
  const isolated = await context.newPage();
  try {
    await isolated.addInitScript(() => localStorage.setItem("mermade-onboarding-v1", "complete"));
    await isolated.goto(page.url());
    await isolated.getByRole("button", { name: "Source", exact: true }).click();
    const editor = isolated.getByRole("textbox", { name: "Mermaid source" });
    const original = await editor.inputValue();
    await editor.fill("sequenceDiagram\n Alice->>Bob: Hello");
    await isolated.getByRole("button", { name: "Apply to canvas" }).click();
    await isolated.locator(".inspector-footer.invalid").waitFor();
    await isolated.getByRole("button", { name: "Export", exact: false }).first().click();
    const download = isolated.waitForEvent("download");
    await isolated.getByRole("button", { name: "Mermaid file" }).click();
    assert.equal(await readFile(await (await download).path(), "utf8"), original);
    await isolated.locator('input[type="file"]').setInputFiles({ name: "unsupported.mmd", mimeType: "text/plain", buffer: Buffer.from("gantt\n title Plan") });
    await isolated.locator(".inspector-footer.invalid").waitFor();
    assert.equal(await isolated.getByRole("textbox", { name: "Diagram name" }).inputValue(), "Checkout flow");
    await isolated.getByRole("button", { name: "Export", exact: false }).first().click();
    const importedDownload = isolated.waitForEvent("download");
    await isolated.getByRole("button", { name: "Mermaid file" }).click();
    assert.equal(await readFile(await (await importedDownload).path(), "utf8"), original);
    assert.equal(await isolated.getByRole("button", { name: "Diagram type", exact: true }).count(), 0);
  } finally {
    await context.close();
  }
});

test("older non-flowchart documents remain recoverable without being rendered or rewritten", { timeout: 60_000 }, async () => {
  const context = await browser.newContext();
  const isolated = await context.newPage();
  const source = "gantt\n  title Preserve me\n  dateFormat YYYY-MM-DD\n  Work :2026-01-01, 5d";
  try {
    await isolated.addInitScript((source) => {
      localStorage.setItem("mermade-onboarding-v1", "complete");
      localStorage.setItem("mermade-diagram", JSON.stringify({ name: "Old plan", direction: "LR", source, nodes: [{ id: "Alice", label: "Stale node", x: 0, y: 0, width: 100, height: 60, shape: "rectangle", color: "#ffffff", textColor: "#24232a" }], edges: [], groups: [] }));
    }, source);
    await isolated.goto(page.url());
    await isolated.getByRole("heading", { name: "Unsupported chart" }).waitFor();
    assert.equal(await isolated.getByRole("button", { name: "Add node (N)" }).isDisabled(), true);
    assert.equal(await isolated.getByRole("button", { name: "FreeForm" }).isDisabled(), true);
    await isolated.keyboard.press("1");
    await isolated.keyboard.press("e");
    await isolated.keyboard.press("Delete");
    assert.equal(await isolated.locator(".mermaid-inline-editor").count(), 0);
    assert.equal(await isolated.locator(".diagram-board").count(), 0);
    assert.equal(await isolated.locator(".mermaid-render svg").count(), 0);
    await isolated.getByRole("button", { name: "Source", exact: true }).click();
    assert.equal(await isolated.getByRole("textbox", { name: "Mermaid source" }).inputValue(), source);
    await isolated.locator(".source-panel").getByRole("button", { name: "Done" }).click();
    await isolated.getByRole("button", { name: "Export", exact: false }).first().click();
    const download = isolated.waitForEvent("download");
    await isolated.getByRole("button", { name: "Mermaid file" }).click();
    assert.equal(await readFile(await (await download).path(), "utf8"), source);
    const persisted = await isolated.evaluate(() => {
      const index = JSON.parse(localStorage.getItem("mermade-diagram-library-v1"));
      return JSON.parse(localStorage.getItem(`mermade-diagram-document-v1:${index.activeId}`)).diagram.source;
    });
    assert.equal(persisted, source);
  } finally {
    await context.close();
  }
});

test("adding a node preserves existing identities in unprojected inline source", { timeout: 60_000 }, async (t) => {
  for (const [original, label, count] of [
    ["flowchart LR; node1[Keep original]", "Keep original", 2],
    ["flowchart LR; node1-->B", "node1", 3],
  ]) {
    await t.test(original, async () => {
      const context = await browser.newContext();
      const isolated = await context.newPage();
      try {
        await isolated.addInitScript(() => localStorage.setItem("mermade-onboarding-v1", "complete"));
        await isolated.goto(page.url());
        await isolated.getByRole("button", { name: "Source", exact: true }).click();
        await isolated.getByRole("textbox", { name: "Mermaid source" }).fill(original);
        await isolated.getByRole("button", { name: "Apply to canvas" }).click();
        await isolated.waitForFunction(() => document.querySelector(".source-panel .primary-button")?.hasAttribute("disabled"));
        await isolated.locator(".source-panel").getByRole("button", { name: "Done" }).click();
        await isolated.getByRole("button", { name: "Add node (N)" }).click();
        await isolated.keyboard.press("Escape");
        await isolated.waitForFunction((expected) => document.querySelectorAll(".mermaid-render .node").length === expected, count);
        assert.ok((await isolated.locator(".mermaid-render .node").allTextContents()).some((text) => text.includes(label)));
        await isolated.getByRole("button", { name: "Source", exact: true }).click();
        const source = await isolated.getByRole("textbox", { name: "Mermaid source" }).inputValue();
        assert.ok(source.startsWith(original));
        assert.match(source, /node2\["New step"\]/);
        assert.doesNotMatch(source, /node1\["New step"\]/);
      } finally { await context.close(); }
    });
  }
});

test("a selected node can move into and out of an existing subgraph", { timeout: 60_000 }, async () => {
  await page.keyboard.press("Escape");
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Editor", exact: true }).click();
  await page.locator(".view-switch button").filter({ hasText: "Mermaid" }).click();
  await page.locator('.mermaid-render [data-node-id="approved"]').first().click();

  const subgraph = page.getByRole("combobox", { name: "Subgraph" });
  assert.deepEqual(await subgraph.locator("option").allTextContents(), ["None", "Checkout", "Fulfilment"]);
  await subgraph.selectOption("checkout");
  assert.equal(await subgraph.inputValue(), "checkout");

  await page.getByRole("button", { name: "Source", exact: true }).click();
  const groupedSource = await page.getByRole("textbox", { name: "Mermaid source" }).inputValue();
  assert.match(groupedSource, /subgraph checkout\["Checkout"\][\s\S]*approved\{"Approved\?"\}[\s\S]*end/);
  await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();

  await subgraph.selectOption("");
  assert.equal(await subgraph.inputValue(), "");
  await page.getByRole("button", { name: "Source", exact: true }).click();
  const ungroupedSource = await page.getByRole("textbox", { name: "Mermaid source" }).inputValue();
  assert.doesNotMatch(ungroupedSource.match(/subgraph checkout[\s\S]*?\n\s*end/)?.[0] || "", /approved\{"Approved\?"\}/);
  assert.match(ungroupedSource, /^\s*approved\{"Approved\?"\}$/m);
  await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();
});

test("flowcharts support Mermaid, FreeForm and Beautiful views", { timeout: 300_000 }, async (t) => {
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Source", exact: true }).click();
  const originalSource = await page.getByRole("textbox", { name: "Mermaid source" }).inputValue();
  await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();

  const beautifulTypes = new Set(types.map((type) => type.id));
  try {
    for (const type of types) {
      await t.test(type.label, async () => {
        await page.getByRole("button", { name: "Source", exact: true }).click();
        await page.getByRole("textbox", { name: "Mermaid source" }).fill(type.template);
        await applyValidSourceAndWait();
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

        const visualMode = "FreeForm";
        await page.locator(".view-switch button").filter({ hasText: visualMode }).click();
        await page.locator(".diagram-board .diagram-node").first().waitFor({ state: "visible" });

        const workspaceSwitcher = page.getByRole("navigation", { name: "Workspace" });
        assert.equal(await workspaceSwitcher.count(), beautifulTypes.has(type.id) ? 1 : 0, `${type.label} must show workspace options only when Beautiful Mermaid is compatible`);
        if (beautifulTypes.has(type.id)) {
          const beautifulWorkspaceButton = workspaceSwitcher.getByRole("button", { name: "Beautiful", exact: true });
          assert.equal(await beautifulWorkspaceButton.isEnabled(), true, `${type.label} must expose its compatible Beautiful workspace`);
          await beautifulWorkspaceButton.click();
          const beautifulPreview = page.locator(".polished-render");
          await beautifulPreview.locator(':scope > svg[data-renderer="beautiful-mermaid"]').waitFor({ state: "visible" });
          assert.equal(await page.locator(".mermaid-render-error").count(), 0, `${type.label} Beautiful workspace must render`);
          assert.equal(await page.locator(".beautiful-inspector").count(), 1, `${type.label} must expose presentation controls in Beautiful`);
          assert.equal(await page.getByRole("button", { name: "Add node (N)" }).count(), 0, "Beautiful must not expose structural canvas tools");
          await page.getByRole("button", { name: "Source", exact: true }).click();
          assert.ok((await page.getByRole("textbox", { name: "Mermaid source" }).inputValue()).includes(declaration), `${type.label} Beautiful workspace must retain editable canonical source`);
          await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();
          await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Editor", exact: true }).click();
        }
      });
    }
  } finally {
    await page.getByRole("button", { name: "Source", exact: true }).click();
    await page.getByRole("textbox", { name: "Mermaid source" }).fill(originalSource);
    await applyValidSourceAndWait();
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

test("Beautiful workspace lazy-renders a styled, source-safe flowchart", { timeout: 60_000 }, async () => {
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Beautiful", exact: true }).click();
  await page.locator('.polished-render svg[data-renderer="beautiful-mermaid"]').waitFor({ state: "visible" });

  assert.equal(await page.locator(".mermaid-render-error").count(), 0, "the supported starter must render without a Beautiful error");
  assert.match(await page.locator(".polished-render svg style").textContent(), /font-family: 'Inter'/, "the Beautiful font must be a valid family name");
  assert.ok(await page.locator(".polished-render [data-node-id]").count() >= 7, "the complete starter flowchart must remain intact");
  assert.equal(await page.getByRole("checkbox", { name: "Source colour overrides" }).isChecked(), false, "the Beautiful palette must own presentation by default");
  assert.notEqual(await page.locator('.polished-render [data-node-id="details"] > rect').getAttribute("fill"), "#fde8f1", "Mermade's generated node colours must not flatten the selected Beautiful theme");
  const node = page.locator('.polished-render [data-node-id="cart"]');
  await node.click();
  assert.doesNotMatch((await node.getAttribute("class")) || "", /selected/, "presentation preview clicks must not enter structural editing");

  await page.locator(".beautiful-theme-grid").getByRole("button", { name: "Dracula", exact: true }).click();
  await page.waitForFunction(() => Boolean(document.querySelector('.polished-render svg[style*="#282a36"]')));
  assert.equal(await page.locator(".polished-render svg").getAttribute("preserveAspectRatio"), "xMidYMid meet");

  await page.locator(".beautiful-theme-grid").getByRole("button", { name: /Mermade · adapts to app/ }).click();
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Editor", exact: true }).click();
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
    await applyValidSourceAndWait();
    await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();
    await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Beautiful", exact: true }).click();
    const sourceColourOverrides = page.getByRole("checkbox", { name: "Source colour overrides" });
    if (!(await sourceColourOverrides.isChecked())) await sourceColourOverrides.check();
    await page.locator(".beautiful-theme-grid").getByRole("button", { name: "Zinc Dark", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".polished-render svg")?.getAttribute("style")?.includes("--bg:#18181B"));
    const transparentBackground = page.getByRole("checkbox", { name: "Transparent export" });
    if (await transparentBackground.isChecked()) await transparentBackground.uncheck();
    await page.waitForFunction(() => {
      const surface = document.querySelector(".beautiful-surface");
      return surface && getComputedStyle(surface).backgroundColor === "rgb(24, 24, 27)";
    });
    const adjustedText = page.locator('.polished-render text[data-mermade-contrast="auto"]').filter({ hasText: "Bright source node" });
    await adjustedText.waitFor({ state: "visible" });

    assert.equal(await adjustedText.evaluate((element) => getComputedStyle(element).fill), "rgb(0, 0, 0)");
    assert.equal(await page.locator(".beautiful-surface").evaluate((element) => getComputedStyle(element).backgroundColor), "rgb(24, 24, 27)");
    assert.equal(await page.locator(".beautiful-inspector").evaluate((element) => getComputedStyle(element).backgroundColor), "rgb(24, 24, 27)");
    assert.equal(await page.locator(".beautiful-tool-rail").evaluate((element) => getComputedStyle(element).backgroundColor), "rgb(24, 24, 27)");
  } finally {
    await page.locator(".beautiful-theme-grid").getByRole("button", { name: /Mermade · adapts to app/ }).click();
    const transparentBackground = page.getByRole("checkbox", { name: "Transparent export" });
    if (!(await transparentBackground.isChecked())) await transparentBackground.check();
    const sourceColourOverrides = page.getByRole("checkbox", { name: "Source colour overrides" });
    if (await sourceColourOverrides.isChecked()) await sourceColourOverrides.uncheck();
    await page.getByRole("button", { name: "Source", exact: true }).click();
    await page.getByRole("textbox", { name: "Mermaid source" }).fill(originalSource);
    await applyValidSourceAndWait();
    await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();
    await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Editor", exact: true }).click();
    await page.locator(".view-switch button").filter({ hasText: "Mermaid" }).click();
  }
});

test("every Beautiful theme keeps diagram text readable", { timeout: 60_000 }, async () => {
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Beautiful", exact: true }).click();
  const themes = [
    ["Zinc Light", "#ffffff"], ["Zinc Dark", "#18181b"], ["Tokyo Night", "#1a1b26"],
    ["Tokyo Night Storm", "#24283b"], ["Tokyo Night Light", "#d5d6db"], ["Catppuccin Mocha", "#1e1e2e"],
    ["Catppuccin Latte", "#eff1f5"], ["Nord", "#2e3440"], ["Nord Light", "#eceff4"], ["Dracula", "#282a36"],
    ["GitHub Light", "#ffffff"], ["GitHub Dark", "#0d1117"], ["Solarized Light", "#fdf6e3"],
    ["Solarized Dark", "#002b36"], ["One Dark", "#282c34"],
  ];

  try {
    for (const [label, background] of themes) {
      await page.locator(".beautiful-theme-grid").getByRole("button", { name: label, exact: true }).click();
      await page.waitForFunction((expected) => document.querySelector(".polished-render svg")?.style.getPropertyValue("--bg").toLowerCase() === expected, background);
      const contrastReport = await page.locator(".polished-render svg").evaluate((svg) => {
        const channels = (value) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
        const luminance = (value) => {
          const linear = channels(value).map((channel) => {
            const normalised = channel / 255;
            return normalised <= 0.04045 ? normalised / 12.92 : ((normalised + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
        };
        const backgroundValue = getComputedStyle(svg.closest(".beautiful-surface")).backgroundColor;
        const backgroundLuminance = luminance(backgroundValue);
        const entries = [...svg.querySelectorAll("text")].map((text) => {
          const foregroundLuminance = luminance(getComputedStyle(text).fill);
          return {
            label: text.textContent,
            fill: getComputedStyle(text).fill,
            contrast: (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05),
          };
        });
        const svgStyle = getComputedStyle(svg);
        const textRoles = ["--_text", "--_text-sec", "--_text-muted", "--_text-faint"]
          .map((name) => svgStyle.getPropertyValue(name).trim());
        const appShell = document.querySelector(".beautiful-app-shell");
        const topbar = document.querySelector(".topbar");
        const status = document.querySelector(".save-status");
        const primaryAction = document.querySelector(".topbar .primary-button");
        const secondaryAction = document.querySelector(".topbar .secondary-button");
        const activeWorkspace = document.querySelector(".workspace-switcher button.active");
        const toRgb = (hex) => {
          const value = hex.replace("#", "");
          const expanded = value.length === 3 ? [...value].map((digit) => digit + digit).join("") : value;
          return `rgb(${[0, 2, 4].map((index) => Number.parseInt(expanded.slice(index, index + 2), 16)).join(", ")})`;
        };
        const appStyle = getComputedStyle(appShell);
        const themeBackground = appStyle.getPropertyValue("--beautiful-theme-bg").trim();
        const themeForeground = appStyle.getPropertyValue("--beautiful-theme-fg").trim();
        const secondaryText = appStyle.getPropertyValue("--beautiful-text-secondary").trim();
        const header = {
          background: getComputedStyle(topbar).backgroundColor,
          colour: getComputedStyle(topbar).color,
          statusColour: getComputedStyle(status).color,
          primaryBackground: getComputedStyle(primaryAction).backgroundColor,
          primaryColour: getComputedStyle(primaryAction).color,
          secondaryBackground: getComputedStyle(secondaryAction).backgroundColor,
          activeWorkspaceBackground: getComputedStyle(activeWorkspace).backgroundColor,
          expectedBackground: toRgb(themeBackground),
          expectedForeground: toRgb(themeForeground),
          expectedSecondary: toRgb(secondaryText),
        };
        return { minimum: Math.min(...entries.map((entry) => entry.contrast)), backgroundValue, entries, textRoles, header };
      });
      assert.ok(contrastReport.minimum >= 4.45, `${label} text contrast must remain readable on ${contrastReport.backgroundValue}; received ${contrastReport.minimum.toFixed(2)}:1 (${JSON.stringify(contrastReport.entries.filter((entry) => entry.contrast < 4.45))})`);
      assert.notEqual(contrastReport.textRoles[0], contrastReport.textRoles[1], `${label} must distinguish primary node text from secondary headings`);
      assert.ok(new Set(contrastReport.textRoles).size >= 2, `${label} must retain semantic text colour roles`);
      assert.equal(contrastReport.header.colour, contrastReport.header.expectedForeground, `${label} title-bar text must use the primary theme role`);
      assert.equal(contrastReport.header.statusColour, contrastReport.header.expectedSecondary, `${label} title-bar status must use the secondary role`);
      assert.equal(contrastReport.header.primaryBackground, contrastReport.header.expectedForeground, `${label} title-bar primary action must use the theme foreground`);
      assert.equal(contrastReport.header.primaryColour, contrastReport.header.expectedBackground, `${label} title-bar primary action must invert to the theme background`);
      assert.equal(contrastReport.header.secondaryBackground, contrastReport.header.background, `${label} title-bar secondary actions must use its raised surface`);
      assert.equal(contrastReport.header.activeWorkspaceBackground, contrastReport.header.expectedBackground, `${label} active workspace tab must use the panel surface`);
    }
  } finally {
    await page.locator(".beautiful-theme-grid").getByRole("button", { name: /Mermade · adapts to app/ }).click();
    await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Editor", exact: true }).click();
    assert.equal(await page.locator(".beautiful-app-shell").count(), 0, "the Editor workspace must restore its own title-bar palette");
  }
});

test("Beautiful visually previews Unicode and ASCII", { timeout: 60_000 }, async () => {
  await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Beautiful", exact: true }).click();
  try {
    await page.locator(".beautiful-theme-grid").getByRole("button", { name: "Dracula", exact: true }).click();
    await page.getByRole("tab", { name: "Unicode", exact: true }).click();
    const unicodePreview = page.getByRole("tabpanel", { name: "UNICODE text preview" });
    await unicodePreview.locator("pre").waitFor({ state: "visible" });
    assert.match(await unicodePreview.locator("pre").textContent(), /[┌┐└┘─│◇○]/, "the Unicode preview must show spatial box drawing");
    assert.ok(await unicodePreview.locator("pre code span").count() > 0, "the browser preview must use Beautiful Mermaid's themed character roles");
    assert.equal(await page.locator(".zoom-controls > button").filter({ hasText: "100%" }).count(), 1, "text diagrams must open at a readable one-to-one scale");

    await page.getByRole("tab", { name: "Unicode", exact: true }).click();
    assert.equal(await unicodePreview.locator("pre").isVisible(), true, "clicking the active preview must not clear its completed result");

    await page.getByRole("tab", { name: "ASCII", exact: true }).click();
    const asciiPreview = page.getByRole("tabpanel", { name: "ASCII text preview" });
    await asciiPreview.locator("pre").waitFor({ state: "visible" });
    const ascii = await asciiPreview.locator("pre").textContent();
    assert.match(ascii, /[+|>-]/, "the ASCII preview must show terminal-safe drawing characters");
    assert.doesNotMatch(ascii, /[┌┐└┘─│◇○]/, "pure ASCII must not contain Unicode drawing characters");

    await page.getByRole("tab", { name: "Diagram", exact: true }).click();
    await page.locator('.polished-render svg[data-renderer="beautiful-mermaid"]').waitFor({ state: "visible" });
  } finally {
    await page.locator(".beautiful-theme-grid").getByRole("button", { name: /Mermade · adapts to app/ }).click();
    await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Editor", exact: true }).click();
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
    for (let index = 0; index < 25; index += 1) lines.push(`n${index}[\"Step ${index}\"]`);
    for (let index = 0; index < 24; index += 1) lines.push(`n${index} --> n${index + 1}`);
    await page.getByRole("button", { name: "Source", exact: true }).click();
    await page.getByRole("textbox", { name: "Mermaid source" }).fill(lines.join("\n"));
    await applyValidSourceAndWait();
    await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();

    const started = Date.now();
    const large = await downloadUnicode();
    assert.ok(Date.now() - started < 10_000, "large Unicode export must remain responsive");
    assert.doesNotMatch(large, /RELATIONSHIP MAP/, "large diagrams must retain Beautiful Mermaid's spatial canvas");
    assert.match(large, /[┌┐└┘─│◇○]/);
    assert.match(large, /Step 0[\s\S]*Step 1/);
  } finally {
    await page.getByRole("button", { name: "Source", exact: true }).click();
    await page.getByRole("textbox", { name: "Mermaid source" }).fill(originalSource);
    const restore = page.getByRole("button", { name: "Apply to canvas" });
    if (await restore.isEnabled()) await applyValidSourceAndWait();
    await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();
  }
});

test("dense vertical flowcharts render as spatial ASCII rather than Mermaid source", { timeout: 60_000 }, async () => {
  await page.getByRole("button", { name: "Source", exact: true }).click();
  const sourceEditor = page.getByRole("textbox", { name: "Mermaid source" });
  const originalSource = await sourceEditor.inputValue();
  const lines = ["flowchart TB"];
  for (let index = 0; index < 20; index += 1) lines.push(`n${index}["Production step ${index}"]`);
  for (let index = 0; index < 19; index += 1) lines.push(`n${index} --> n${index + 1}`);
  lines.push("n2 -->|Review| n7", "n4 -->|Rework| n10", "n8 -->|Approved| n15");

  try {
    await sourceEditor.fill(lines.join("\n"));
    await applyValidSourceAndWait();
    await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();
    await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Beautiful", exact: true }).click();
    await page.getByRole("tab", { name: "ASCII", exact: true }).click();

    const preview = page.getByRole("tabpanel", { name: "ASCII text preview" });
    await preview.locator("pre").waitFor({ state: "visible" });
    const ascii = await preview.locator("pre").textContent();
    assert.match(ascii, /Production step 0/);
    assert.match(ascii, /[+|>-]/, "the result must contain an ASCII drawing");
    assert.doesNotMatch(ascii, /flowchart\s+TB|n0\[|MERMAID OUTLINE/, "the preview must never expose source as an ASCII diagram");
    await page.waitForFunction(() => {
      const scroller = document.querySelector(".canvas-scroll");
      const chart = scroller?.querySelector(".beautiful-text-preview pre");
      if (!(scroller instanceof HTMLElement) || !(chart instanceof HTMLElement)) return false;
      const viewport = scroller.getBoundingClientRect();
      const drawing = chart.getBoundingClientRect();
      return Math.abs(drawing.left + drawing.width / 2 - (viewport.left + viewport.width / 2)) < 4
        && Math.abs(drawing.top + drawing.height / 2 - (viewport.top + viewport.height / 2)) < 4;
    });
    const canvasGeometry = await page.locator(".canvas-scroll").evaluate((scroller) => {
      const chart = scroller.querySelector(".beautiful-text-preview pre");
      if (!(chart instanceof HTMLElement)) throw new Error("ASCII chart is missing");
      const viewport = scroller.getBoundingClientRect();
      const drawing = chart.getBoundingClientRect();
      const style = getComputedStyle(chart.parentElement);
      return {
        centreDeltaX: Math.abs(drawing.left + drawing.width / 2 - (viewport.left + viewport.width / 2)),
        centreDeltaY: Math.abs(drawing.top + drawing.height / 2 - (viewport.top + viewport.height / 2)),
        hasHorizontalCanvas: scroller.scrollWidth > scroller.clientWidth,
        isHorizontallyCentred: scroller.scrollLeft > 0,
        overflow: style.overflow,
        borderWidth: style.borderWidth,
      };
    });
    assert.equal(canvasGeometry.overflow, "visible", "the text chart must not be clipped by a preview box");
    assert.equal(canvasGeometry.borderWidth, "0px", "the text chart must use the open canvas without a bounding border");
    assert.equal(canvasGeometry.hasHorizontalCanvas, true, "a wide text chart must create a freely scrollable canvas");
    assert.equal(canvasGeometry.isHorizontallyCentred, true, "the initial canvas position must centre a wide chart");
    assert.ok(canvasGeometry.centreDeltaX < 4, `ASCII chart is ${canvasGeometry.centreDeltaX}px off-centre horizontally`);
    assert.ok(canvasGeometry.centreDeltaY < 4, `ASCII chart is ${canvasGeometry.centreDeltaY}px off-centre vertically`);
  } finally {
    await page.getByRole("navigation", { name: "Workspace" }).getByRole("button", { name: "Editor", exact: true }).click();
    await page.getByRole("button", { name: "Source", exact: true }).click();
    await page.getByRole("textbox", { name: "Mermaid source" }).fill(originalSource);
    const restore = page.getByRole("button", { name: "Apply to canvas" });
    if (await restore.isEnabled()) await applyValidSourceAndWait();
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

test("empty flowchart node text is repaired to valid visually blank Mermaid", async () => {
  await page.locator(".secondary-button").filter({ hasText: "Source" }).click();
  await page.locator(".source-editor-wrap textarea").fill('flowchart TB\n  n80[""]\n  n81["Visible"]\n  n80 --> n81');
  await page.locator(".source-panel .primary-button").filter({ hasText: "Apply to canvas" }).click();

  const repairButton = page.locator(".inspector-footer button").filter({ hasText: "Repair Mermaid" });
  await repairButton.waitFor({ state: "visible" });
  await repairButton.click();
  const repair = page.locator(".repair-option").filter({ hasText: "Repair empty node labels" });
  await repair.waitFor({ state: "visible" });
  await repair.getByRole("button", { name: "Apply verified fix" }).click();
  await page.locator(".inspector-footer").filter({ hasText: "Valid Mermaid Flowchart" }).waitFor({ state: "visible" });
  await page.locator(".mermaid-render svg").waitFor({ state: "visible" });
  assert.equal(await page.locator(".mermaid-render-error").count(), 0);

  await page.locator(".secondary-button").filter({ hasText: "Source" }).click();
  assert.match(await page.locator(".source-editor-wrap textarea").inputValue(), /n80\[" "\]/);
  await page.locator(".source-panel").getByRole("button", { name: "Done" }).click();
});

test("Tidy Tree renders a compatible hierarchy in React", { timeout: 60_000 }, async () => {
  const context = await browser.newContext();
  const isolated = await context.newPage();
  try {
    await isolated.addInitScript(() => {
      localStorage.setItem("mermade-onboarding-v1", "complete");
      localStorage.setItem("mermade-diagram", JSON.stringify({
        name: "Generated hierarchy", direction: "LR", groups: [],
        nodes: ["start", "finish"].map((id, index) => ({ id, label: id, x: index * 250, y: 100, width: 150, height: 62, shape: "rectangle", color: "#ffffff", textColor: "#24232a" })),
        edges: [{ id: "e1", from: "start", to: "finish", label: "", style: "solid" }],
      }));
    });
    await isolated.goto(page.url());
    await isolated.locator(".mermaid-render svg").waitFor();
    await isolated.getByRole("button", { name: "Style", exact: true }).click();
    const layoutSelect = isolated.locator(".diagram-style-panel label").filter({ hasText: "Layout" }).locator("select");
    const previousSvgId = await isolated.locator(".mermaid-render svg").getAttribute("id");
    await layoutSelect.selectOption("tidy-tree");
    await isolated.waitForFunction((previousId) => {
      const svg = document.querySelector(".mermaid-render svg");
      return Boolean(svg?.id && svg.id !== previousId && !document.querySelector(".mermaid-render-error"));
    }, previousSvgId);
    assert.equal(await isolated.locator(".mermaid-render-error").count(), 0);
    assert.equal(await isolated.locator(".mermaid-render .node").count(), 2);
  } finally {
    await context.close();
  }
});

test("advanced flowcharts retain the spatial canvas, direction controls, and tools", { timeout: 60_000 }, async () => {
  const advancedSource = `flowchart TB
  %% preserve this explanation
  A@{ shape: stadium, label: "Start" }
  B@{ shape: diam, label: "Ready?" }
  C["PB&S"]
  A --> B --> C
  classDef default stroke:#8c52ff
  classDef important stroke:#8c52ff
  class B important
  click B "/details" "Open details"`;

  await page.locator(".secondary-button").filter({ hasText: "Source" }).click();
  await page.locator(".source-editor-wrap textarea").fill(advancedSource);
  await applyValidSourceAndWait();
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
  const hitTargetStrokes = await page.locator(".mermaid-render .mermade-node-hit").evaluateAll((elements) =>
    [...new Set(elements.map((element) => getComputedStyle(element).stroke))]);
  assert.deepEqual(hitTargetStrokes, ["rgba(0, 0, 0, 0)"], "source-defined class styles must not reveal editor hit targets");
  await page.locator(".secondary-button").filter({ hasText: "Source" }).click();
  const updatedSource = await page.locator(".source-editor-wrap textarea").inputValue();
  assert.match(updatedSource, /^flowchart LR/m);
  assert.match(updatedSource, /click B "\/details" "Open details"/);
  assert.match(updatedSource, /node\d+\["New step"\]/);
});
