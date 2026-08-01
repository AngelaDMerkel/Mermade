import { parseMermaid, renderMermaidASCII } from "beautiful-mermaid";
import { sourceForPolishedRenderer } from "./beautiful-mermaid";
import type { UnicodeExportResult } from "./unicode-export";

type WorkerScope = {
  onmessage: ((event: MessageEvent<{ source: string }>) => void) | null;
  postMessage: (message: { ok: true; result: UnicodeExportResult } | { ok: false; error: string }) => void;
};

const workerScope = self as unknown as WorkerScope;

function nodeMarker(shape: string) {
  if (shape === "diamond") return "◇";
  if (shape === "circle" || shape === "doublecircle") return "○";
  if (shape === "stadium" || shape === "rounded") return "◉";
  if (shape === "state-start") return "●";
  if (shape === "state-end") return "◎";
  return "□";
}

function cleanLabel(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function relationshipMap(source: string): UnicodeExportResult | null {
  const firstLine = source.trim().split(/\r?\n/, 1)[0]?.toLowerCase() || "";
  if (!/^(?:flowchart|graph|statediagram)/.test(firstLine)) return null;

  const graph = parseMermaid(source);
  if (graph.nodes.size <= 24 && graph.edges.length <= 36) return null;

  const outgoing = new Map<string, typeof graph.edges>();
  for (const edge of graph.edges) {
    const edges = outgoing.get(edge.source) || [];
    edges.push(edge);
    outgoing.set(edge.source, edges);
  }

  const lines = [
    `UNICODE RELATIONSHIP MAP · ${graph.direction}`,
    "════════════════════════════════",
    "Large diagrams use a relationship map to keep Unicode export responsive.",
    "",
  ];
  for (const node of graph.nodes.values()) {
    lines.push(`${nodeMarker(node.shape)} ${cleanLabel(node.label)}  [${node.id}]`);
    const edges = outgoing.get(node.id) || [];
    edges.forEach((edge, index) => {
      const target = graph.nodes.get(edge.target);
      const branch = index === edges.length - 1 ? "└" : "├";
      const connector = edge.hasArrowEnd ? "─▶" : "──";
      const label = edge.label ? ` ${cleanLabel(edge.label)} ` : " ";
      lines.push(`  ${branch}${label}${connector} ${cleanLabel(target?.label || edge.target)}  [${edge.target}]`);
    });
    lines.push("");
  }
  return { content: lines.join("\n").trimEnd(), simplified: true };
}

workerScope.onmessage = (event) => {
  try {
    // Presentation directives cannot affect plain text and noticeably increase
    // the work required for heavily styled source.
    const adapted = sourceForPolishedRenderer(event.data.source, false);
    const simplified = relationshipMap(adapted);
    const result = simplified || {
      content: renderMermaidASCII(adapted, { colorMode: "none", useAscii: false }),
      simplified: false,
    };
    workerScope.postMessage({ ok: true, result });
  } catch (error) {
    workerScope.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : "Beautiful Mermaid could not render this diagram as Unicode.",
    });
  }
};
