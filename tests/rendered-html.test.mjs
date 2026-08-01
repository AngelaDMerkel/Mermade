import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const html = await readFile(new URL("../.next-test/server/app/index.html", import.meta.url));
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

test("the Next build renders the local Mermaid editor", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Mermade — Visual Mermaid Editor<\/title>/i);
  assert.match(html, /Saved locally/);
  assert.match(html, /aria-label="Canvas tools"/);
  assert.match(html, /aria-label="Canvas view"/);
  assert.match(html, /> Import<\/button>[\s\S]*?> Source<\/button>[\s\S]*?> Export/);
  assert.match(html, /FreeForm<\/button>/);
  assert.match(html, /Mermaid<\/button>/);
  assert.match(
    html,
    /aria-label="Canvas view"[\s\S]*?<button class=""[^>]*>[\s\S]*?FreeForm<\/button>[\s\S]*?<button class="active"[^>]*>[\s\S]*?Mermaid<\/button>/,
  );
  assert.doesNotMatch(html, /codex-preview|chatgpt\.site|Sign in required/i);
});

test("uses British English in authored interface and documentation copy", async () => {
  const [editor, help, types, shapes, layout, readme] = await Promise.all([
    readFile(new URL("../app/mermaid-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/mermaid-help.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/mermaid-types.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/flowchart-shapes.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);

  assert.match(editor, /Base — customisable/);
  assert.match(editor, />Fill colour</);
  assert.match(editor, />Text colour</);
  assert.match(editor, /aria-label="Colour theme"/);
  assert.doesNotMatch(editor, /Base — customizable|>Fill color|>Text color|aria-label="Color theme"/);
  assert.match(help, /Visualise work items/);
  assert.doesNotMatch(help, /\bVisualize\b|\brecognized\b|\bnormalized\b|\bOrganize\b|\bcolor\b/);
  assert.match(types, /label: "Event Modelling"/);
  assert.match(shapes, /label: "Specialised"/);
  assert.match(layout, /<html lang="en-GB">/);
  assert.doesNotMatch(readme, /\bOrganize\b|\borganized\b|\bcolors\b|\bnormalization\b|\bbehavior\b/);
});

test("imports local Mermaid and Markdown files through validated source", async () => {
  const editor = await readFile(new URL("../app/mermaid-editor.tsx", import.meta.url), "utf8");

  assert.match(editor, /accept=\{MERMAID_IMPORT_ACCEPT\}/);
  assert.match(editor, /readImportedMermaid\(await file\.text\(\)\)/);
  assert.match(editor, /validateAndCommitSource\(imported\.source\)/);
  assert.match(editor, /setViewMode\("mermaid"\)/);
});

test("renders discoverable toolbar shortcuts", async () => {
  const response = await render();
  const html = await response.text();

  const shortcuts = [
    ["Select", "V"],
    ["Marquee select", "M"],
    ["Add node", "N"],
    ["Link nodes", "L"],
    ["Create subgraph", "S"],
    ["Add decision", "D"],
  ];

  for (const [label, key] of shortcuts) {
    assert.match(html, new RegExp(`aria-label="${label} \\(${key}\\)"`));
    assert.match(html, new RegExp(`<kbd aria-hidden="true">${key}<\\/kbd>`));
  }

  assert.match(html, /Click to select · Double-click to edit · Scroll to pan · ⌘ scroll to zoom/);
  assert.match(html, /aria-label="Settings"/);
  assert.match(html, /aria-label="Flowchart help"/);
  assert.match(html, /aria-label="Keyboard shortcuts"/);
  assert.match(html, /aria-label="Flowchart help"[\s\S]*?aria-label="Keyboard shortcuts"[\s\S]*?aria-label="Settings"/);
  assert.match(html, /aria-label="Fit chart \(F\)"/);
  assert.doesNotMatch(html, /aria-label="Frame selection"/);
  assert.doesNotMatch(html, /> Share<\/button>/);
});

test("provides dynamic diagram help with external guidance", async () => {
  const editor = await readFile(new URL("../app/mermaid-editor.tsx", import.meta.url), "utf8");

  assert.match(editor, /helpForDiagram\(activeDiagramType\.id\)/);
  assert.match(editor, /id="help-title">\{activeDiagramType\.label\} help/);
  assert.match(editor, /\{activeDiagramType\.template\}/);
  assert.match(editor, />Recommended</);
  assert.match(editor, />Avoid</);
  assert.match(editor, />References</);
  assert.match(editor, /target="_blank" rel="noreferrer"/);
});

test("provides a complete keyboard-shortcuts reference", async () => {
  const editor = await readFile(new URL("../app/mermaid-editor.tsx", import.meta.url), "utf8");

  for (const label of ["Select", "Marquee select", "New node", "New connected node", "Link nodes", "Create subgraph", "Add decision", "Delete selection", "Undo", "Redo", "Pan canvas", "Zoom canvas"]) {
    assert.match(editor, new RegExp(`>${label}<`));
  }
  assert.match(editor, /<kbd>⇧<\/kbd><kbd>N<\/kbd>/);
  assert.match(editor, /id="shortcuts-title">Keyboard shortcuts/);
});

test("keeps undo and redo local to focused source text", async () => {
  const editor = await readFile(new URL("../app/mermaid-editor.tsx", import.meta.url), "utf8");

  assert.match(editor, /const undoSourceDraft = \(\) =>/);
  assert.match(editor, /const redoSourceDraft = \(\) =>/);
  assert.match(editor, /target\.closest\("\.source-panel"\)/);
  assert.match(editor, /if \(!editing && \(event\.metaKey \|\| event\.ctrlKey\) && key === "z"\)/);
  assert.match(editor, /textarea aria-label="Mermaid source"/);
  assert.match(editor, /label="Undo source edit"/);
  assert.match(editor, /label="Redo source edit"/);
});

test("keeps the diagram type picker clickable and compact", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.canvas-titlebar > div:first-child \{[^}]*pointer-events: auto;/);
  assert.match(css, /\.diagram-type-trigger \{[^}]*gap: 3px;/);
  assert.match(css, /\.diagram-type-group button \{[^}]*min-height: 27px;/);
});

test("supports visible marquee selection in Mermaid view", async () => {
  const [editor, css] = await Promise.all([
    readFile(new URL("../app/mermaid-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(editor, /ref=\{mermaidStageRef\}/);
  assert.match(editor, /selectionSurface\.querySelectorAll<HTMLElement>\("\[data-node-id\]"\)/);
  assert.doesNotMatch(editor, /label="Marquee select \(M\)"[^\n]+setViewMode\("free"\)/);
  assert.match(editor, /if \(tool === "marquee"\) event\.preventDefault\(\);/);
  assert.match(css, /\.canvas-viewport\.is-marquee, \.canvas-viewport\.is-marquee \* \{[^}]*user-select: none !important;/);
  assert.match(css, /\.mermaid-render \[data-node-id\]\.selected \{[^}]*drop-shadow\(0 3px 5px rgb\(224 9 95 \/ 22%\)\)/);
  assert.doesNotMatch(css, /\.mermaid-render \[data-node-id\]\.selected \{[^}]*drop-shadow\(0 0/);
  assert.match(css, /stroke-width: 3px !important/);
});

test("keeps rendered Mermaid nodes stable between click and double-click", async () => {
  const editor = await readFile(new URL("../app/mermaid-editor.tsx", import.meta.url), "utf8");

  assert.match(editor, /onDoubleClick=\{editMermaidElement\}/);
  assert.match(editor, /setEditingNode\(nodeId\)/);
  assert.match(editor, /viewMode === "mermaid" && editingNode && selectedNode/);
  assert.match(editor, /\}, \[activeDiagramType\.id, activeMermaidVersion, diagramStyle\.layout, restoreViewAnchor, source, viewMode\]\);/);
  assert.doesNotMatch(editor, /diagram\.nodes, selected, source, viewMode/);
});

test("anchors canvas view switches to the same logical node", async () => {
  const editor = await readFile(new URL("../app/mermaid-editor.tsx", import.meta.url), "utf8");

  assert.match(editor, /type PendingViewAnchor/);
  assert.match(editor, /pendingViewAnchorRef/);
  assert.match(editor, /switchCanvasView\("free"\)/);
  assert.match(editor, /switchCanvasView\("mermaid"\)/);
  assert.match(editor, /restoreViewAnchor\("mermaid"\)/);
  assert.match(editor, /restoreViewAnchor\("free"\)/);
  assert.match(editor, /data-node-id=\{node\.id\}/);
});

test("creates white nodes and supports the connected Shift+N shortcut", async () => {
  const editor = await readFile(new URL("../app/mermaid-editor.tsx", import.meta.url), "utf8");

  assert.match(editor, /label: "New step",[\s\S]*?color: "#ffffff"/);
  assert.match(editor, /from: origin\.id, to: id/);
  assert.match(editor, /addNode\("rectangle", event\.shiftKey\)/);
  assert.match(editor, /Select one node before using Shift\+N/);
});

test("auto-organises pasted flowcharts from their relationships", async () => {
  const editor = await readFile(new URL("../app/mermaid-editor.tsx", import.meta.url), "utf8");

  assert.match(editor, /layoutFlowchart\(parsedNodes, edges, direction\)/);
  assert.match(editor, /label="Organise chart \(O\)"/);
  assert.match(editor, /shouldFitFreeformRef\.current = true/);
});

test("provides diagram-wide Mermaid styling as a third inspector scope", async () => {
  const editor = await readFile(new URL("../app/mermaid-editor.tsx", import.meta.url), "utf8");

  assert.match(editor, />Properties<\/button>/);
  assert.match(editor, />Appearance<\/button>/);
  assert.match(editor, />Style<\/button>/);
  assert.match(editor, /applyDiagramStyle/);
  assert.match(editor, />Layout<\/span>/);
  assert.match(editor, /Base — customisable/);
  assert.match(editor, /redux-dark-color/);
  assert.match(editor, /cose-bilkent/);
  assert.match(editor, /This preset owns its palette/);
  assert.match(editor, /Rendering styles and layouts require Mermaid 11/);
  assert.doesNotMatch(editor, /diagram-style-heading/);
});

test("loads optional Mermaid engines and layout plugins only when requested", async () => {
  const editor = await readFile(new URL("../app/mermaid-editor.tsx", import.meta.url), "utf8");

  assert.match(editor, /diagramTypeId === "zenuml"/);
  assert.match(editor, /layout === "elk" \|\| layout === "tidy-tree"/);
  assert.match(editor, /ensureMermaidFeature/);
  assert.doesNotMatch(editor, /Promise\.all\(\[\s*import\("@mermaid-js\/layout-elk"\)/);
});

test("keeps the workspace chrome visible while the Style pane scrolls", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(css, /\.workspace \{[^}]*grid-template-rows: minmax\(0, 1fr\);[^}]*overflow: hidden;/);
  assert.match(css, /\.inspector \{[^}]*min-height: 0;[^}]*overflow: hidden;/);
  assert.match(css, /\.inspector-body \{[^}]*min-height: 0;[^}]*overflow-y: auto;/);
  assert.match(css, /\.inspector-footer \{[^}]*flex: 0 0 40px;/);
  assert.match(css, /\.rail-help-stack \{[^}]*flex: 0 0 auto;/);
});

test("provides first-launch onboarding and a restartable interface tour", async () => {
  const editor = await readFile(new URL("../app/mermaid-editor.tsx", import.meta.url), "utf8");

  assert.match(editor, /mermade-onboarding-v1/);
  assert.match(editor, />Start Editing<\/button>/);
  assert.match(editor, />Tour<\/button>/);
  assert.match(editor, /https:\/\/github\.com\/AngelaDMerkel\/Mermade/);
  assert.match(editor, /Restart interface tour/);
  assert.match(editor, /TOUR_STEPS/);
});

test("exposes verified layered Mermaid repair options", async () => {
  const editor = await readFile(new URL("../app/mermaid-editor.tsx", import.meta.url), "utf8");

  assert.match(editor, /createRepairProposals/);
  assert.match(editor, /await validateSource\(option\.source, version\)/);
  assert.match(editor, /Repair Mermaid \{statusDiagramType\.label\}/);
  assert.match(editor, />Apply verified fix<\/button>/);
  assert.match(editor, /setInvalidSource\(sourceDraft\)/);
});

test("provides Fit Chart and Organise Chart hotkeys", async () => {
  const editor = await readFile(new URL("../app/mermaid-editor.tsx", import.meta.url), "utf8");

  assert.match(editor, /label="Fit chart \(F\)" shortcut="F"/);
  assert.match(editor, /label="Organise chart \(O\)" shortcut="O"/);
  assert.match(editor, /key === "f"/);
  assert.match(editor, /key === "o"/);
  assert.match(editor, />Fit Chart<\/b><kbd>F<\/kbd>/);
  assert.match(editor, />Organise Chart<\/b><kbd>O<\/kbd>/);
});

test("offers best-practice flowchart shapes before the complete Mermaid catalogue", async () => {
  const editor = await readFile(new URL("../app/mermaid-editor.tsx", import.meta.url), "utf8");

  assert.match(editor, /FLOWCHART_SHAPE_GROUPS\.map/);
  assert.match(editor, /selectedFlowchartShape\(selectedNode\)/);
  assert.match(editor, /flowchartShapePatch\(event\.target\.value\)/);
});

test("normalises specialised Mermaid SVG rendering without changing source", async () => {
  const [editor, rendering] = await Promise.all([
    readFile(new URL("../app/mermaid-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/mermaid-rendering.ts", import.meta.url), "utf8"),
  ]);

  assert.match(rendering, /svg\.setAttribute\("preserveAspectRatio", "xMidYMid meet"\)/);
  assert.match(rendering, /diagramTypeId === "c4"/);
  assert.match(rendering, /viewBox\.x \+ viewBox\.width \/ 2/);
  assert.match(rendering, /title\.setAttribute\("text-anchor", "middle"\)/);
  assert.match(editor, /normalizeSvgMarkup\(svg, activeDiagramType\.id, source\)/);
});

test("ships the approved Mermaid-pink brand assets", async () => {
  const [mark, lockup, titleCard, favicon, ogPng, faviconIco] = await Promise.all([
    readFile(new URL("../public/brand/logo-mark.svg", import.meta.url), "utf8"),
    readFile(new URL("../public/brand/logo-lockup.svg", import.meta.url), "utf8"),
    readFile(new URL("../public/brand/title-card.svg", import.meta.url), "utf8"),
    readFile(new URL("../public/favicon.svg", import.meta.url), "utf8"),
    readFile(new URL("../public/og.png", import.meta.url)),
    readFile(new URL("../public/favicon.ico", import.meta.url)),
  ]);

  for (const svg of [mark, lockup, titleCard, favicon]) {
    assert.match(svg, /#E0095F/);
  }
  assert.match(mark, /<rect[^>]+rx="14"/);
  assert.match(mark, /<circle/);
  assert.match(mark, /M94 78 112 96 94 114 76 96Z/);
  assert.equal(ogPng.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(faviconIco.subarray(0, 4).toString("hex"), "00000100");
});

test("keeps public assets under the GitHub Pages base path", async () => {
  const [config, layout, editor, css, packageText] = await Promise.all([
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/mermaid-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(config, /NEXT_PUBLIC_BASE_PATH: basePath/);
  assert.match(config, /process\.env\.MERMADE_GITHUB_PAGES/);
  assert.doesNotMatch(config, /process\.env\.GITHUB_ACTIONS/);
  assert.match(JSON.parse(packageText).scripts["build:pages"], /MERMADE_GITHUB_PAGES=true/);
  assert.match(layout, /publicBasePath/);
  assert.match(editor, /PUBLIC_BASE_PATH/);
  assert.doesNotMatch(css, /url\(["']\/brand\//);
});

test("uses current Node 24 GitHub Pages actions without a provisioning-only configure step", async () => {
  const workflow = await readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8");

  assert.match(workflow, /actions: read/);
  assert.match(workflow, /actions\/checkout@v6/);
  assert.match(workflow, /actions\/setup-node@v6/);
  assert.match(workflow, /actions\/upload-pages-artifact@v5/);
  assert.match(workflow, /actions\/deploy-pages@v5/);
  assert.match(workflow, /run: npm run lint/);
  assert.match(workflow, /run: npm test/);
  assert.match(workflow, /run: npm run build:pages/);
  assert.doesNotMatch(workflow, /actions\/configure-pages/);
});

test("declares the source-specific PolyForm noncommercial repository licence", async () => {
  const [license, packageJson] = await Promise.all([
    readFile(new URL("../LICENSE", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(license, /PolyForm Noncommercial License 1\.0\.0/);
  assert.match(license, /Required Notice: Copyright © 2026 Colin Alexander Duffy\./);
  assert.equal(JSON.parse(packageJson).license, "PolyForm-Noncommercial-1.0.0");
});
