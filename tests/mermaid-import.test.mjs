import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/load-typescript.mjs";

const loadImportHelpers = () => loadTypeScript(new URL("../app/mermaid-import.ts", import.meta.url));

test("imports plain Mermaid files", async () => {
  const { readImportedMermaid, diagramNameFromFile } = await loadImportHelpers();
  const imported = readImportedMermaid("\uFEFFflowchart LR\n  A --> B\n");

  assert.equal(imported.source, "flowchart LR\n  A --> B");
  assert.equal(imported.extractedFromMarkdown, false);
  assert.equal(imported.renderProfile, undefined);
  assert.equal(imported.additionalDiagramCount, 0);
  assert.equal(diagramNameFromFile("checkout-flow.mmd"), "checkout-flow");
});

test("extracts the first fenced Mermaid diagram from Markdown", async () => {
  const { readImportedMermaid } = await loadImportHelpers();
  const imported = readImportedMermaid(`# Process notes

Some documentation.

\`\`\`mermaid
sequenceDiagram
  Alice->>Bob: Hello
\`\`\`

~~~mmd
flowchart LR
  A --> B
~~~`);

  assert.equal(imported.source, "sequenceDiagram\n  Alice->>Bob: Hello");
  assert.equal(imported.extractedFromMarkdown, true);
  assert.equal(imported.renderProfile, undefined);
  assert.equal(imported.additionalDiagramCount, 1);
});

test("extracts DokuWiki Mermaid raw blocks without changing their source", async () => {
  const { readImportedMermaid } = await loadImportHelpers();
  const imported = readImportedMermaid(`# Smartone Wiki

The flowchart below summarises the company process.

<mermaid>
raw
flowchart TB
  n58{"Approved?"}
  n68["Project Management advances to 'Initial Engineering'"]
  n70["Engineering populates the Bill of Materials"]
  n58 --> n68 --> n70
  style n68 fill:#FFDE59,stroke:#8c52ff
</mermaid>`);

  assert.equal(imported.source, `flowchart TB
  n58{"Approved?"}
  n68["Project Management advances to 'Initial Engineering'"]
  n70["Engineering populates the Bill of Materials"]
  n58 --> n68 --> n70
  style n68 fill:#FFDE59,stroke:#8c52ff`);
  assert.equal(imported.extractedFromMarkdown, true);
  assert.equal(imported.renderProfile, "dokuwiki");
  assert.equal(imported.additionalDiagramCount, 0);
});
