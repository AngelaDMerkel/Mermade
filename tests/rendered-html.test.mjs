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
  assert.match(html, /Beautiful<\/button>/);
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

test("keeps imported Mermaid source authoritative until the user changes its style", async () => {
  const [editor, css] = await Promise.all([
    readFile(new URL("../app/mermaid-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(editor, /diagram\.source \?\? applyDiagramStyle\(toMermaid\(diagram\), diagram\.style \|\| DEFAULT_DIAGRAM_STYLE\)/);
  assert.match(editor, /source: current\.source \? applyDiagramStyle\(current\.source, nextStyle\) : undefined/);
  assert.doesNotMatch(editor, /applyDiagramStyle\(diagram\.source \?\? toMermaid\(diagram\)/);
  assert.doesNotMatch(editor, /mermaid\.initialize\(\{[^}]*theme: "base"/);
  assert.match(editor, /renderProfile: imported\.renderProfile/);
  assert.match(editor, /renderMermaidSvg\(mermaid, renderId, source, renderProfileClass\)/);
  assert.match(css, /\.dokuwiki-mermaid \.nodeLabel[^}]*font-size: 12px !important;[^}]*line-height: 1\.5 !important;/);
});

test("renders discoverable toolbar shortcuts", async () => {
  const response = await render();
  const html = await response.text();
  const editor = await readFile(new URL("../app/mermaid-editor.tsx", import.meta.url), "utf8");

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

  assert.match(html, /Click to select · Double-click[\s\S]*?to edit[\s\S]*?· Scroll to pan · ⌘ scroll to zoom/);
  assert.match(html, /aria-label="Settings"/);
  assert.match(html, /aria-label="Flowchart help"/);
  assert.match(html, /aria-label="Keyboard shortcuts"/);
  assert.match(html, /aria-label="Flowchart help"[\s\S]*?aria-label="Keyboard shortcuts"[\s\S]*?aria-label="Settings"/);
  assert.match(html, /aria-label="Fit chart \(F\)"/);
  assert.match(editor, /label="Add decision \(D\)"[\s\S]{0,140}<Diamond size=\{19\}/);
  assert.doesNotMatch(editor, /<CircleDot size=\{19\}/);
  assert.match(html, /aria-label="Fill chart \(Shift\+F\)"/);
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

  for (const label of ["Select", "Marquee select", "New node", "New connected node", "Link nodes", "Create subgraph", "Add decision", "Add connected decision", "Edit selected node", "Delete selection", "Undo", "Redo", "Pan canvas", "Zoom canvas"]) {
    assert.match(editor, new RegExp(`>${label}<`));
  }
  assert.match(editor, /<kbd>⇧<\/kbd><kbd>N<\/kbd>/);
  assert.match(editor, />Edit selected node<\/b><kbd>E<\/kbd>/);
  assert.match(editor, /id="shortcuts-title">Keyboard shortcuts/);
});

test("edits exactly one selected node with E without collapsing multi-selection", async () => {
  const editor = await readFile(new URL("../app/mermaid-editor.tsx", import.meta.url), "utf8");

  assert.match(editor, /if \(key === "e"\) \{[\s\S]{0,120}editSelectedText\(\)/);
  assert.match(editor, /if \(selected\.length !== 1\) \{[\s\S]{0,100}Select one node to edit its text/);
  assert.match(editor, /setEditingNode\(node\.id\)/);
  assert.match(editor, /setEditingSourceLine\(selectedSourceLine\)/);
  assert.doesNotMatch(editor, /if \(selected\.length !== 1\)[\s\S]{0,180}setSelected/);
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
  assert.match(css, /\.mermaid-render \[data-node-id\]\.selected \{ filter: none; \}/);
  assert.match(css, /\.mermaid-render \[data-node-id\]\.selected \.label-container path \{[^}]*stroke: var\(--purple\) !important;[^}]*stroke-width: 3\.5px !important;/);
  assert.match(css, /\.diagram-node\.selected \.node-shape \{[^}]*border-color: var\(--purple\);[^}]*drop-shadow\(1px 0 0 var\(--purple\)\)[^}]*drop-shadow\(0 -1px 0 var\(--purple\)\)/);
  assert.doesNotMatch(css, /\.diagram-node\.selected \.node-shape \{[^}]*rgb\(224 9 95 \/ 15%\)/);
  assert.match(editor, /function toggleRenderedSelection\(element: HTMLElement, selected: boolean\)/);
  assert.match(editor, /shape\.style\.setProperty\("stroke", "var\(--purple\)", "important"\)/);
  assert.match(editor, /shape\.dataset\.mermadeSelectionOutline = JSON\.stringify/);
  assert.match(editor, /delete shape\.dataset\.mermadeSelectionOutline/);
});

test("keeps large ELK flowcharts centred, selectable, and source-deletable", async () => {
  const [editor, rendering, css] = await Promise.all([
    readFile(new URL("../app/mermaid-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/mermaid-rendering.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(editor, /activeDiagramType\.id === "flowchart" \? flowchartNodeIds\(source\) : \[\]/);
  assert.match(editor, /sourceNodeIds\.has\(id\)/);
  assert.match(editor, /left: `max\([^`]+calc\(\(100% - \$\{renderedSize\.width \* zoom\}px\) \/ 2\)\)`/);
  assert.match(rendering, /classList\.add\("mermade-node-hit"\)/);
  assert.match(rendering, /\.node > \.label-container path/);
  assert.match(css, /\.mermade-node-hit \{[^}]*fill: transparent !important;[^}]*pointer-events: all;/);
});

test("keeps rendered Mermaid nodes stable between click and double-click", async () => {
  const editor = await readFile(new URL("../app/mermaid-editor.tsx", import.meta.url), "utf8");

  assert.match(editor, /onDoubleClick=\{editMermaidElement\}/);
  assert.match(editor, /setEditingNode\(modelNode\.id\)/);
  assert.match(editor, /decorateRenderedStatements\(svgElement, source\)/);
  assert.match(editor, /aria-label="Mermaid statement"/);
  assert.match(editor, /await validateAndCommitSource\(lines\.join\("\\n"\)\)/);
  assert.match(editor, /viewMode !== "free" && editingNode && selectedNode/);
  assert.match(editor, /\}, \[activeDiagramType\.id, activeMermaidVersion, currentLayoutCompatibilityError, diagramStyle\.layout, renderProfileClass, restoreViewAnchor, source, viewMode\]\);/);
  assert.doesNotMatch(editor, /diagram\.nodes, selected, source, viewMode/);
});

test("anchors canvas view switches to the same logical node", async () => {
  const editor = await readFile(new URL("../app/mermaid-editor.tsx", import.meta.url), "utf8");

  assert.match(editor, /type PendingViewAnchor/);
  assert.match(editor, /pendingViewAnchorRef/);
  assert.match(editor, /switchCanvasView\("free"\)/);
  assert.match(editor, /switchCanvasView\("mermaid"\)/);
  assert.match(editor, /switchCanvasView\("polished"\)/);
  assert.match(editor, /restoreViewAnchor\("mermaid"\)/);
  assert.match(editor, /restoreViewAnchor\("polished"\)/);
  assert.match(editor, /restoreViewAnchor\("free"\)/);
  assert.match(editor, /data-node-id=\{node\.id\}/);
});

test("switches directly between canvas views with unmodified number keys", async () => {
  const editor = await readFile(new URL("../app/mermaid-editor.tsx", import.meta.url), "utf8");

  assert.match(editor, /if \(key === "1" \|\| key === "2" \|\| key === "3"\)/);
  assert.match(editor, /switchCanvasView\(key === "1" \? "free" : key === "2" \? "mermaid" : "polished"\)/);
  assert.match(editor, /aria-keyshortcuts="1"/);
  assert.match(editor, /aria-keyshortcuts="2"/);
  assert.match(editor, /aria-keyshortcuts="3"/);
  assert.match(editor, />FreeForm canvas<\/b><kbd>1<\/kbd>/);
  assert.match(editor, />Mermaid canvas<\/b><kbd>2<\/kbd>/);
  assert.match(editor, />Beautiful canvas<\/b><kbd>3<\/kbd>/);
  assert.match(editor, /targetView === "polished" && !polishedSupported[\s\S]{0,160}is not yet supported by Beautiful Mermaid/);
});

test("loads Beautiful Mermaid as a compatible third canvas without replacing canonical source", async () => {
  const [editor, adapter, css, packageJson] = await Promise.all([
    readFile(new URL("../app/mermaid-editor.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/beautiful-mermaid.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(editor, /type CanvasView = "free" \| "mermaid" \| "polished"/);
  assert.match(editor, /Beautiful Mermaid renderer/);
  assert.match(editor, /Beautiful view could not render this valid Mermaid diagram/);
  assert.match(editor, /function BeautifulMermaidMark/);
  for (const piece of ["top-left", "top-right", "bottom-left", "bottom-right"]) {
    assert.match(editor, new RegExp(`badge-piece-${piece}`));
  }
  assert.match(editor, /M9\.75 9\.75[\s\S]*M14\.25 2\.5[\s\S]*M9\.75 21\.5[\s\S]*M14\.25 14\.25/);
  assert.doesNotMatch(editor, /M3\.17890888,3\.6 L3\.17890888,0/);
  assert.match(css, /\.beautiful-mermaid-mark \.badge-piece \{[^}]*fill: none;[^}]*stroke: var\(--purple\);[^}]*stroke-width: 1\.2;/);
  assert.doesNotMatch(css, /\.beautiful-mermaid-mark \.badge-piece-(?:top|bottom)-(?:left|right) \{[^}]*fill:/);
  assert.match(adapter, /await import\("beautiful-mermaid"\)/);
  assert.match(adapter, /sourceForPolishedRenderer/);
  assert.match(adapter, /new DOMParser\(\)/);
  assert.match(adapter, /data-mermade-contrast/);
  assert.match(editor, /host\.style\.backgroundColor = svgElement\.style\.getPropertyValue\("--bg"\)\.trim\(\) \|\| "transparent"/);
  assert.equal(JSON.parse(packageJson).dependencies["beautiful-mermaid"], "^1.1.3");
});

test("does not disable spatial flowchart editing merely because advanced source is preserved", async () => {
  const editor = await readFile(new URL("../app/mermaid-editor.tsx", import.meta.url), "utf8");

  assert.match(editor, /const nativeFlowchart = activeDiagramType\.id === "flowchart" && diagram\.nodes\.length > 0/);
  assert.doesNotMatch(editor, /function parseMermaid[\s\S]{0,180}if \(!canUseNativeFlowchartEditor\(source\)\) return null/);
  assert.match(editor, /source: preserveFlowchartSource \? candidate : undefined/);
  assert.match(editor, /updateFlowchartDirection\(current\.source, direction\)/);
  assert.match(editor, /appendFlowchartStatements\(current\.source/);
  assert.match(editor, /removeFlowchartItems\(candidate, \{ nodeIds, edges: selectedEdges, subgraphIds \}\)/);
  assert.match(editor, /updateFlowchartSubgraphStatement\(current\.source, id, label\)/);
  assert.match(editor, /\(\?:-->\|---\)\\\|/);
  assert.match(editor, /toExpression\.split\(\/\\s\+&\\s\+\/\)/);
  assert.doesNotMatch(editor, /toExpression\.split\(\/\\s\*&\\s\*\/\)/);
  assert.doesNotMatch(editor, /Delete source-backed flowchart items/);
  assert.doesNotMatch(editor, /Remove source-backed subgraphs/);
});

test("creates white nodes and supports connected Shift+N and Shift+D shortcuts", async () => {
  const editor = await readFile(new URL("../app/mermaid-editor.tsx", import.meta.url), "utf8");

  assert.match(editor, /label: "New step",[\s\S]*?color: "#ffffff"/);
  assert.match(editor, /from: origin\.id, to: id/);
  assert.match(editor, /addNode\("rectangle", event\.shiftKey\)/);
  assert.match(editor, /addNode\("diamond", event\.shiftKey, "Shift\+D"\)/);
  assert.match(editor, />Add connected decision<\/b><span><kbd>⇧<\/kbd><kbd>D<\/kbd>/);
  assert.match(editor, /connectedShortcut = "Shift\+N"/);
  assert.match(editor, /Select one node before using \$\{connectedShortcut\}/);
});

test("auto-organises pasted flowcharts from their relationships", async () => {
  const editor = await readFile(new URL("../app/mermaid-editor.tsx", import.meta.url), "utf8");

  assert.match(editor, /layoutFlowchart\(parsedNodes, edges, direction\)/);
  assert.match(editor, /label="Organise chart \(O\)"/);
  assert.match(editor, /shouldFitFreeformRef\.current = true/);
});

test("fits exceptionally large Mermaid diagrams without hiding their overall structure", async () => {
  const editor = await readFile(new URL("../app/mermaid-editor.tsx", import.meta.url), "utf8");

  assert.match(editor, /const MIN_FIT_ZOOM = 0\.04/);
  assert.match(editor, /clampFitZoom\(Math\.min\(scroller\.clientWidth \/ \(width \+ 180\), scroller\.clientHeight \/ \(height \+ 180\)/);
  assert.match(editor, /clampFitZoom\(Math\.min\(scroller\.clientWidth \/ \(renderedSize\.width \+ 180\), scroller\.clientHeight \/ \(renderedSize\.height \+ 180\)/);
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

test("guards incompatible Tidy Tree graphs and clears stale failed renders", async () => {
  const editor = await readFile(new URL("../app/mermaid-editor.tsx", import.meta.url), "utf8");

  assert.match(editor, /layoutCompatibilityError\(patch\.layout, activeDiagramType\.id/);
  assert.match(editor, /host\.replaceChildren\(\);[\s\S]*?setMermaidRenderError\(currentLayoutCompatibilityError\)/);
  assert.match(editor, /catch \(error\) \{[\s\S]*?host\.replaceChildren\(\);[\s\S]*?setMermaidRenderError/);
  assert.match(editor, /value !== "tidy-tree" \|\| diagramTypeId === "flowchart" \|\| diagramTypeId === "mindmap"/);
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

test("provides Fit, Fill, and Organise Chart hotkeys", async () => {
  const editor = await readFile(new URL("../app/mermaid-editor.tsx", import.meta.url), "utf8");

  assert.match(editor, /label="Fit chart \(F\)" shortcut="F"/);
  assert.match(editor, /label="Fill chart \(Shift\+F\)" shortcut="⇧F"/);
  assert.match(editor, /label="Organise chart \(O\)" shortcut="O"/);
  assert.match(editor, /function OrganiseChartIcon/);
  assert.match(editor, /className="organise-chart-icon"[\s\S]{0,320}<rect x="9" y="2"[\s\S]{0,220}<rect x="3" y="16"[\s\S]{0,120}<rect x="15" y="16"/);
  assert.match(editor, /<OrganiseChartIcon \/>/);
  assert.match(editor, /key === "f"/);
  assert.match(editor, /if \(event\.shiftKey\) fillView\(\); else fitView\(\);/);
  assert.match(editor, /key === "o"/);
  assert.match(editor, />Fit Chart<\/b><kbd>F<\/kbd>/);
  assert.match(editor, />Fill Chart<\/b><span><kbd>⇧<\/kbd><kbd>F<\/kbd><\/span>/);
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
