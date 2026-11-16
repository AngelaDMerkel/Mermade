export const FLOWCHART_TEMPLATE = "flowchart LR\n  start([Start]) --> finish([Finish])";

export function splitFrontmatter(source: string) {
  const leading = source.match(/^\s*/)?.[0] || "";
  const trimmed = source.slice(leading.length);
  if (!trimmed.startsWith("---")) return { leading, lines: [] as string[], body: trimmed };
  const match = trimmed.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (!match) return { leading, lines: [] as string[], body: trimmed };
  return {
    leading,
    lines: match[1].split(/\r?\n/),
    body: trimmed.slice(match[0].length),
  };
}

export function isFlowchartSource(source: string) {
  const body = splitFrontmatter(source).body;
  const declaration = body.split(/\r?\n/).find((line) => {
    const trimmed = line.trim();
    return trimmed && !trimmed.startsWith("%%");
  })?.trim() || "";
  return /^(?:flowchart(?:-elk)?|graph)\b/i.test(declaration);
}

export const FLOWCHART_ONLY_MESSAGE = "Mermade supports flowcharts only. Use a flowchart or graph declaration. Existing source can still be copied or exported.";

export function requireFlowchartSource(source: string) {
  if (!isFlowchartSource(source)) throw new Error(FLOWCHART_ONLY_MESSAGE);
}
