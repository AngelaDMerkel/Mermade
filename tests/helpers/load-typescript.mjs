import { readFile } from "node:fs/promises";
import ts from "typescript";

const modules = new Map();

/** Load pure local TS modules in Node without a production build or browser. */
async function moduleUrl(url) {
  if (modules.has(url.href)) return modules.get(url.href);
  const pending = (async () => {
    const source = await readFile(url, "utf8");
    let javascript = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const imports = [...javascript.matchAll(/from\s+["'](\.[^"']+)["']/g)];
    for (const match of imports) {
      const dependency = await moduleUrl(new URL(`${match[1]}.ts`, url));
      javascript = javascript.replace(match[0], `from "${dependency}"`);
    }
    return `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`;
  })();
  modules.set(url.href, pending);
  return pending;
}

export async function loadTypeScript(url) {
  return import(await moduleUrl(url));
}
