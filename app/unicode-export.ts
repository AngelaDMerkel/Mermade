export type UnicodeExportResult = {
  content: string;
  simplified: boolean;
};

type UnicodeWorkerMessage =
  | { ok: true; result: UnicodeExportResult }
  | { ok: false; error: string };

function semanticSourceLines(source: string) {
  const withoutFrontmatter = source.trimStart().startsWith("---")
    ? source.trimStart().replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/, "")
    : source;
  return withoutFrontmatter
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line
      && !line.startsWith("%%")
      && !/^(?:style|classDef|class|linkStyle|click)\b/i.test(line));
}

export function createUnicodeSourceOutline(source: string, reason = "The spatial Unicode renderer could not complete this diagram safely.") {
  const lines = semanticSourceLines(source);
  const declaration = lines.shift() || "Mermaid diagram";
  const body = lines.length ? lines.map((line) => `  ${line}`).join("\n") : "  (No semantic statements found)";
  return [
    "UNICODE MERMAID OUTLINE",
    "═══════════════════════",
    declaration,
    "",
    reason,
    "",
    body,
  ].join("\n");
}

export function renderUnicodeDiagram(source: string, timeoutMs = 8_000): Promise<UnicodeExportResult> {
  if (typeof Worker === "undefined") {
    return Promise.resolve({ content: createUnicodeSourceOutline(source), simplified: true });
  }

  return new Promise((resolve) => {
    const worker = new Worker(new URL("./unicode-renderer.worker.ts", import.meta.url), {
      type: "module",
      name: "mermade-unicode-renderer",
    });
    let settled = false;

    const finish = (result: UnicodeExportResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      worker.terminate();
      resolve(result);
    };

    const timer = window.setTimeout(() => finish({
      content: createUnicodeSourceOutline(source, "This diagram was too complex for the spatial Unicode renderer, so Mermade preserved its semantic statements instead."),
      simplified: true,
    }), timeoutMs);

    worker.onmessage = (event: MessageEvent<UnicodeWorkerMessage>) => {
      if (event.data.ok) finish(event.data.result);
      else finish({ content: createUnicodeSourceOutline(source, event.data.error), simplified: true });
    };
    worker.onerror = () => finish({
      content: createUnicodeSourceOutline(source, "The Unicode rendering worker failed, so Mermade preserved the diagram's semantic statements instead."),
      simplified: true,
    });
    worker.postMessage({ source });
  });
}
