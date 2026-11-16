export const FLOWCHART_TEMPLATE = "flowchart LR\n  start([Start]) --> finish([Finish])";

function withoutFrontmatter(source: string) {
  const trimmed = source.trimStart();
  if (!trimmed.startsWith("---")) return trimmed;
  return trimmed.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/, "").trimStart();
}

export function isFlowchartSource(source: string) {
  const body = withoutFrontmatter(source);
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
