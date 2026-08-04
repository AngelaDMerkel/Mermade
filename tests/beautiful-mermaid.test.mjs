import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { renderMermaidASCII, renderMermaidSVG } from "beautiful-mermaid";

async function loadAdapter() {
  const [configSource, adapterSource] = await Promise.all([
    readFile(new URL("../app/beautiful-mermaid-config.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/beautiful-mermaid.ts", import.meta.url), "utf8"),
  ]);
  const compilerOptions = { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 };
  const configJavascript = ts.transpileModule(configSource, { compilerOptions }).outputText;
  const configModule = `data:text/javascript;base64,${Buffer.from(configJavascript).toString("base64")}`;
  const adapterJavascript = ts.transpileModule(adapterSource, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replaceAll("./beautiful-mermaid-config", configModule);
  return import(`data:text/javascript;base64,${Buffer.from(adapterJavascript).toString("base64")}`);
}

test("advertises only diagram types supported by Beautiful Mermaid", async () => {
  const { supportsPolishedDiagram } = await loadAdapter();
  for (const id of ["flowchart", "state", "sequence", "class", "er", "xychart"]) {
    assert.equal(supportsPolishedDiagram(id), true, id);
  }
  for (const id of ["c4", "gantt", "mindmap", "pie", "sankey"]) {
    assert.equal(supportsPolishedDiagram(id), false, id);
  }
});

test("uses Beautiful Mermaid's native derived palette contract by default", async () => {
  const { accessiblePolishedTextColour, DEFAULT_POLISHED_STYLE, normalisePolishedStyle, polishedTextRoles, readablePolishedTextColour, themeForPolishedRenderer } = await loadAdapter();
  assert.equal(DEFAULT_POLISHED_STYLE.font, "Inter");
  assert.equal(DEFAULT_POLISHED_STYLE.respectSourceStyles, false);
  assert.equal(DEFAULT_POLISHED_STYLE.styleModel, 4);
  assert.equal(DEFAULT_POLISHED_STYLE.paletteMode, "theme");
  assert.equal(DEFAULT_POLISHED_STYLE.customColours.accent, "#e0095f");

  const adaptive = themeForPolishedRenderer("mermade-auto", {});
  assert.deepEqual(Object.keys(adaptive).sort(), ["bg", "fg"]);
  assert.doesNotMatch(JSON.stringify(adaptive), /accent|surface|border|line|muted/);

  const themes = {
    "zinc-light": { bg: "#FFFFFF", fg: "#27272A" },
    dracula: { bg: "#282a36", fg: "#f8f8f2", accent: "#bd93f9" },
  };
  assert.deepEqual(themeForPolishedRenderer("zinc-light", themes), themes["zinc-light"]);
  assert.deepEqual(themeForPolishedRenderer("dracula", themes), themes.dracula);

  const migrated = normalisePolishedStyle({
    styleModel: 3,
    theme: "mermade-auto",
    font: "Inter, ui-sans-serif, system-ui, sans-serif",
    respectSourceStyles: true,
  });
  assert.equal(migrated.font, "Inter");
  assert.equal(migrated.respectSourceStyles, false);
  assert.equal(migrated.styleModel, 4);
  assert.equal(migrated.paletteMode, "theme");
  assert.equal(Object.keys(migrated.customColours).length, 7);

  const explicitSourceColours = normalisePolishedStyle({ ...migrated, styleModel: 4, respectSourceStyles: true });
  assert.equal(explicitSourceColours.respectSourceStyles, true);
  assert.equal(readablePolishedTextColour("#FFDE59"), "#000000");
  assert.equal(readablePolishedTextColour("rgb(24, 24, 27)"), "#ffffff");
  assert.equal(readablePolishedTextColour("var(--_node-fill)"), null);
  assert.equal(accessiblePolishedTextColour("#f8f8f2", "#282a36"), "#f8f8f2", "already-readable theme text must remain unchanged");
  assert.notEqual(accessiblePolishedTextColour("#657b83", "#fdf6e3"), "#657b83", "Solarized Light text must be raised above its original 4.13:1 contrast");
  assert.equal(accessiblePolishedTextColour("var(--foreground)", "var(--background)"), "var(--foreground)", "adaptive CSS variables must remain live");

  const solarizedRoles = polishedTextRoles({ bg: "#fdf6e3", fg: "#657b83", muted: "#93a1a1" });
  assert.notEqual(solarizedRoles.primary, solarizedRoles.secondary, "theme-muted headings must remain distinct from primary node text");
  assert.notEqual(solarizedRoles.secondary, "#93a1a1", "an unreadable muted role must retain its hue while gaining contrast");
  assert.equal(new Set(Object.values(solarizedRoles)).size >= 2, true, "semantic text roles must not collapse to one foreground colour");
});

test("adapts frontmatter and expanded flowchart nodes without changing canonical source", async () => {
  const { sourceForPolishedRenderer } = await loadAdapter();
  const source = `---
config:
  theme: 'base'
---
flowchart-elk LR
  start@{ shape: stadium, label: "Start" } --> decide@{ shape: diam, label: "Ready?" }
  decide --> finish@{ shape: rect, label: "Finish" }`;

  const adapted = sourceForPolishedRenderer(source);
  assert.match(source, /^---/);
  assert.doesNotMatch(adapted, /^---/);
  assert.match(adapted, /^flowchart LR/m);
  assert.match(adapted, /start\(\["Start"\]\)/);
  assert.match(adapted, /decide\{"Ready\?"\}/);
  assert.match(adapted, /finish\["Finish"\]/);

  const svg = renderMermaidSVG(adapted);
  assert.match(svg, /data-id="start"/);
  assert.match(svg, /data-id="decide"/);
  assert.match(svg, /data-id="finish"/);
  assert.match(svg, /preserveAspectRatio|viewBox=/);
});

test("adapts Mermaid 11 flowchart shapes to Beautiful Mermaid's full shape vocabulary", async () => {
  const { sourceForPolishedRenderer } = await loadAdapter();
  const adapted = sourceForPolishedRenderer(`flowchart LR
    a@{ shape: fr-rect, label: "Subprocess" } --> b@{ shape: trap-b, label: "Manual input" }
    b --> c@{ shape: trap-t, label: "Manual operation" }
    c --> d@{ shape: dbl-circ, label: "Final" }`);

  assert.match(adapted, /a\[\["Subprocess"\]\]/);
  assert.match(adapted, /b\[\/"Manual input"\\\]/);
  assert.match(adapted, /c\[\\"Manual operation"\/\]/);
  assert.match(adapted, /d\(\(\("Final"\)\)\)/);
  assert.doesNotThrow(() => renderMermaidSVG(adapted));
});

test("renders bare flowchart headers and honours final repeated expanded node definitions", async () => {
  const { sourceForPolishedRenderer } = await loadAdapter();
  const source = `flowchart
    n2@{ shape: "stadium", label: "Production" }
    n2 --- n4@{ shape: "diam", label: "Large project?" }
    n7@{ shape: "diam", label: "Inventory work?" }
    n7@{ shape: "diam", label: "Stock work?" } ---|"No"| n9["Standard project"]
    n11@{ shape: "stadium", label: "Production Demand" }
    n11@{ shape: "stadium", label: "Product Demand" } --- n7
    n2@{ shape: "fr-rect", label: "Production" }`;

  const adapted = sourceForPolishedRenderer(source);
  assert.match(adapted, /^flowchart TB/m);
  assert.equal((adapted.match(/n2\[\["Production"\]\]/g) || []).length, 2);
  assert.doesNotMatch(adapted, /n2\(\["Production"\]\)/);
  assert.doesNotMatch(adapted, /Inventory work\?|Production Demand/);
  assert.match(adapted, /Stock work\?/);
  assert.match(adapted, /Product Demand/);

  const svg = renderMermaidSVG(adapted);
  assert.match(svg, /data-id="n2"[^>]*data-shape="subroutine"/);
  assert.match(svg, /Stock work\?/);
  assert.match(svg, /Product Demand/);
});

test("can let the Beautiful palette own presentation without mutating source styles", async () => {
  const { sourceForPolishedRenderer } = await loadAdapter();
  const source = `flowchart LR
    A[Start]:::important --> B[Finish]
    style B fill:#ffffff,stroke:#000000
    classDef important fill:#ff0000,color:#ffffff
    class A important
    linkStyle 0 stroke:#00ff00,stroke-width:4px`;

  const themed = sourceForPolishedRenderer(source);
  assert.doesNotMatch(themed, /classDef|linkStyle|fill:#|stroke:#|:::important|class A important/);
  assert.match(source, /fill:#ffffff/);

  const respected = sourceForPolishedRenderer(source, true);
  assert.match(respected, /classDef important/);
  assert.match(respected, /linkStyle 0/);

  const respectedSvg = renderMermaidSVG(respected);
  assert.match(respectedSvg, /fill="#ff0000"/, "classDef node fill reaches the Beautiful SVG");
  assert.match(respectedSvg, /fill="#ffffff" stroke="#000000"/, "inline node styling reaches the Beautiful SVG");
  assert.match(respectedSvg, /stroke="#00ff00" stroke-width="4px"/, "linkStyle reaches the Beautiful SVG");
});

test("removes Mermade's generated white node styles from the default Beautiful render copy", async () => {
  const { DEFAULT_POLISHED_STYLE, sourceForPolishedRenderer } = await loadAdapter();
  const source = `flowchart TD
    A["Receive order"] --> B{"Approved?"}
    B -->|Yes| C["Ship order"]
    style A fill:#ffffff,stroke:#77737f,color:#24232a,stroke-width:1.5px
    style B fill:#ffffff,stroke:#77737f,color:#24232a,stroke-width:1.5px
    style C fill:#ffffff,stroke:#77737f,color:#24232a,stroke-width:1.5px`;

  const renderCopy = sourceForPolishedRenderer(source, DEFAULT_POLISHED_STYLE.respectSourceStyles);
  assert.doesNotMatch(renderCopy, /style [ABC] fill:#ffffff/);
  assert.match(source, /style A fill:#ffffff/, "canonical Mermaid source remains unchanged");

  const themedSvg = renderMermaidSVG(renderCopy, { bg: "#282a36", fg: "#f8f8f2", accent: "#bd93f9" });
  assert.doesNotMatch(themedSvg, /fill="#ffffff" stroke="#77737f"/);
  assert.match(themedSvg, /--bg:#282a36;--fg:#f8f8f2;--accent:#bd93f9/);
});

test("renders a complex Mermade flowchart through Beautiful without flattening its theme", async () => {
  const { DEFAULT_POLISHED_STYLE, sourceForPolishedRenderer } = await loadAdapter();
  const source = `---
config:
  theme: 'base'
  layout: 'elk'
---
flowchart TD
  subgraph shipping["Shipping"]
    warehouse@{ shape: delay, label: "Warehousing" }
    stage["Stage products"]
    log@{ shape: doc, label: "Log shipment" }
    warehouse --> stage --> log
  end
  subgraph production["Production"]
    start@{ shape: stadium, label: "Production demand" }
    ready@{ shape: diam, label: "Ready to ship?" }
    pack@{ shape: fr-rect, label: "Pack product" }
    change@{ shape: lean-l, label: "Change order" }
    start --> ready
    ready -->|Yes| pack --> warehouse
    ready -->|No| change --> start
  end
  style warehouse fill:#ffffff,stroke:#77737f,color:#24232a,stroke-width:1.5px
  style stage fill:#ffffff,stroke:#77737f,color:#24232a,stroke-width:1.5px
  style log fill:#ffffff,stroke:#77737f,color:#24232a,stroke-width:1.5px
  style start fill:#ffffff,stroke:#77737f,color:#24232a,stroke-width:1.5px
  style ready fill:#ffffff,stroke:#77737f,color:#24232a,stroke-width:1.5px
  style pack fill:#ffffff,stroke:#77737f,color:#24232a,stroke-width:1.5px
  style change fill:#ffffff,stroke:#77737f,color:#24232a,stroke-width:1.5px`;

  const renderCopy = sourceForPolishedRenderer(source, DEFAULT_POLISHED_STYLE.respectSourceStyles);
  const svg = renderMermaidSVG(renderCopy, {
    bg: "#1a1b26",
    fg: "#a9b1d6",
    line: "#3d59a1",
    accent: "#7aa2f7",
    muted: "#565f89",
    transparent: true,
  });

  assert.equal((svg.match(/class="node"/g) || []).length, 7);
  assert.match(svg, /Shipping/);
  assert.match(svg, /Production/);
  assert.match(svg, /--bg:#1a1b26;--fg:#a9b1d6;--line:#3d59a1;--accent:#7aa2f7;--muted:#565f89/);
  assert.doesNotMatch(svg, /fill="#ffffff" stroke="#77737f"/);
});

test("Beautiful Mermaid's specialist SVG renderers cover every supported Beautiful workspace diagram type", () => {
  const samples = [
    ["flowchart", `flowchart LR\n A([Start]) --> B{Ready?}\n B --> C[(Store)]`, /class="node"/],
    ["state", `stateDiagram-v2\n [*] --> Idle\n Idle --> Done: finish\n Done --> [*]`, /data-shape="state-start"/],
    ["sequence", `sequenceDiagram\n Alice->>Bob: Hello\n Bob-->>Alice: Ready`, /class="actor"/],
    ["class", `classDiagram\n Animal <|-- Duck\n Animal: +String name\n Duck: +swim\(\)`, /class="class-node"/],
    ["er", `erDiagram\n CUSTOMER ||--o{ ORDER : places`, /class="entity"/],
    ["xychart", `xychart-beta\n title "Growth"\n x-axis [Jan, Feb, Mar]\n bar [2, 5, 8]\n line [1, 4, 9]`, /xychart-bar-group/],
  ];

  for (const [id, source, distinctiveMarkup] of samples) {
    const svg = renderMermaidSVG(source, {
      bg: "#fffdfa",
      fg: "#27232a",
      accent: "#e0095f",
      surface: "#fff4f8",
      border: "#d9c7cf",
      transparent: true,
      interactive: true,
      componentSpacing: 36,
    });
    assert.match(svg, /viewBox=/, `${id} has a scalable canvas`);
    assert.doesNotMatch(svg, /background:var\(--bg\)/, `${id} remains transparent`);
    assert.match(svg, distinctiveMarkup, `${id} uses its specialist renderer`);
  }
});

test("Beautiful Mermaid constructs spatial Unicode and ASCII canvases for every supported text diagram type", () => {
  const samples = [
    ["flowchart", `flowchart LR\n A([Start]) --> B{Ready?}\n B --> C[(Store)]`],
    ["state", `stateDiagram-v2\n [*] --> Idle\n Idle --> Done: finish\n Done --> [*]`],
    ["sequence", `sequenceDiagram\n Alice->>Bob: Hello\n Bob-->>Alice: Ready`],
    ["class", `classDiagram\n Animal <|-- Duck\n Animal: +String name\n Duck: +swim\(\)`],
    ["er", `erDiagram\n CUSTOMER ||--o{ ORDER : places`],
    ["xychart", `xychart-beta\n title "Growth"\n x-axis [Jan, Feb, Mar]\n bar [2, 5, 8]\n line [1, 4, 9]`],
  ];

  for (const [id, source] of samples) {
    const unicode = renderMermaidASCII(source, { useAscii: false, colorMode: "none" });
    const ascii = renderMermaidASCII(source, { useAscii: true, colorMode: "none" });
    assert.ok(unicode.split("\n").length > 2, `${id} Unicode output has a two-dimensional canvas`);
    assert.ok(ascii.split("\n").length > 2, `${id} ASCII output has a two-dimensional canvas`);
    assert.match(unicode, /[┌┐└┘─│◇○█╭╮╰╯]/, `${id} uses Unicode drawing characters`);
    assert.doesNotMatch(ascii, /[┌┐└┘─│◇○█╭╮╰╯]/, `${id} ASCII output remains terminal-safe`);
  }
});
