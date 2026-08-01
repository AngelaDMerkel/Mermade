import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const searchRoots = [
  "node_modules/mermaid/dist",
  "node_modules/mermaid-v10/dist",
  "node_modules/@mermaid-js/layout-elk/dist",
  "node_modules/.vite",
];
let patched = 0;
let blockTargets = 0;
let elkTargets = 0;

for (const searchRoot of searchRoots) {
  const dist = join(process.cwd(), searchRoot);
  let files;
  try {
    files = await readdir(dist, { recursive: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") continue;
    throw error;
  }
  for (const relativePath of files) {
    if (!/\.(?:m?js)$/.test(relativePath)) continue;
    const file = join(dist, relativePath);
    const source = await readFile(file, "utf8");
    if (source.includes("[Block layout omitted]")) blockTargets += 1;
    if (source.includes("[ELK graph omitted]") && source.includes("ELK DOM fields omitted")) elkTargets += 1;
    const next = source
      .replaceAll(
        'JSON.stringify(child.size, (key, value) => key === "node" ? undefined : value)',
        '"[DOM measurement omitted]"',
      )
      .replaceAll(
        "JSON.stringify(child.size)",
        '"[DOM measurement omitted]"',
      )
      .replaceAll(
        'JSON.stringify(root, (key, value) => key === "node" ? undefined : value, 2)',
        '"[Block layout omitted]"',
      )
      .replaceAll(
        'JSON.stringify(root2, (key, value) => key === "node" ? undefined : value, 2)',
        '"[Block layout omitted]"',
      )
      .replaceAll(
        "JSON.stringify(root, null, 2)",
        '"[Block layout omitted]"',
      )
      .replaceAll(
        "JSON.stringify(root2, null, 2)",
        '"[Block layout omitted]"',
      )
      .replaceAll(
        "JSON.stringify(elkGraph, null, 2)",
        '"[ELK graph omitted]"',
      )
      .replaceAll(
        "JSON.stringify(g, null, 2)",
        '"[ELK layout omitted]"',
      )
      .replaceAll(
        "JSON.parse(JSON.stringify(node))",
        'JSON.parse(JSON.stringify(node, (key, value) => key === "domId" || key === "labelNode" ? undefined : value /* ELK DOM fields omitted */))',
      );

    if (next !== source) {
      await writeFile(file, next);
      patched += 1;
      if (next.includes("[Block layout omitted]")) blockTargets += 1;
      if (next.includes("[ELK graph omitted]") && next.includes("ELK DOM fields omitted")) elkTargets += 1;
    }
  }
}

if (blockTargets === 0) {
  throw new Error("The Mermaid Block Diagram compatibility target was not found; review the installed Mermaid versions.");
}
if (elkTargets === 0) {
  throw new Error("The Mermaid ELK compatibility target was not found; review the installed layout package.");
}

console.log(patched > 0 ? `Patched ${patched} Mermaid renderer files.` : "Mermaid renderer compatibility patches already applied.");
