import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const integrationTests = new Set(["mermaid-standards.test.mjs", "rendered-html.test.mjs"]);
const files = (await readdir(new URL("../tests/", import.meta.url)))
  .filter((name) => name.endsWith(".test.mjs") && !integrationTests.has(name))
  .sort()
  .map((name) => `tests/${name}`);
const result = spawnSync(process.execPath, ["--test", ...files], { cwd: root, stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
