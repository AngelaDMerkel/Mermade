import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// ELK serialises graph objects containing live DOM nodes. React's metadata on
// those nodes is circular, even when the result is only used for disabled logs.
const roots = ["node_modules/mermaid/dist", "node_modules/mermaid-v10/dist", "node_modules/@mermaid-js/layout-elk/dist", "node_modules/.vite"];
let targets = 0;
let patched = 0;
for (const root of roots) {
  let files;
  try {
    files = await readdir(root, { recursive: true });
  } catch (error) {
    if (error.code === "ENOENT") continue;
    throw error;
  }
  for (const relativePath of files) {
    if (!/\.m?js$/.test(relativePath)) continue;
    const file = join(root, relativePath);
    const source = await readFile(file, "utf8");
    if (!source.includes("elkGraph")) continue;
    const next = source
      .replaceAll("JSON.stringify(elkGraph, null, 2)", '"[ELK graph omitted]"')
      .replaceAll("JSON.stringify(g, null, 2)", '"[ELK layout omitted]"')
      .replaceAll("JSON.parse(JSON.stringify(node))", 'JSON.parse(JSON.stringify(node, (key, value) => key === "domId" || key === "labelNode" ? undefined : value /* ELK DOM fields omitted */))');
    if (next.includes("[ELK graph omitted]") && next.includes("ELK DOM fields omitted")) targets++;
    if (next !== source) {
      await writeFile(file, next);
      patched++;
    }
  }
}
if (!targets) throw new Error("The Mermaid ELK compatibility target was not found; review the installed layout package.");
console.log(patched ? `Patched ${patched} ELK renderer files.` : "ELK compatibility patch already applied.");
