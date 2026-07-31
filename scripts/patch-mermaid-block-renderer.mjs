import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const searchRoots = [
  "node_modules/mermaid/dist",
  "node_modules/mermaid-v10/dist",
  "node_modules/.vite",
];
let patched = 0;
let alreadySafe = 0;

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
      );

    if (next !== source) {
      await writeFile(file, next);
      patched += 1;
    } else if (source.includes("[Block layout omitted]")) {
      alreadySafe += 1;
    }
  }
}

if (patched === 0 && alreadySafe === 0) {
  throw new Error("The Mermaid Block Diagram compatibility target was not found; review the installed Mermaid versions.");
}

console.log(patched > 0 ? `Patched ${patched} Mermaid renderer files.` : "Mermaid Block Diagram compatibility patch already applied.");
