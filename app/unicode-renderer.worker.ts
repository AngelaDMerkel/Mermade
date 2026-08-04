import { parseMermaid, renderMermaidASCII } from "beautiful-mermaid";
import { sourceForPolishedRenderer } from "./beautiful-mermaid";
import type { TextDiagramFormat, TextDiagramTheme, UnicodeExportResult } from "./unicode-export";

type WorkerScope = {
  onmessage: ((event: MessageEvent<{ source: string; format: TextDiagramFormat; theme?: TextDiagramTheme }>) => void) | null;
  postMessage: (message: { ok: true; result: UnicodeExportResult } | { ok: false; error: string }) => void;
};

const workerScope = self as unknown as WorkerScope;

function mixHex(foreground: string, background: string, percentage: number) {
  const parse = (colour: string) => {
    const hex = colour.replace("#", "");
    return hex.length === 3
      ? [...hex].map((value) => Number.parseInt(value + value, 16))
      : [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  };
  const foregroundChannels = parse(foreground);
  const backgroundChannels = parse(background);
  const amount = percentage / 100;
  return `#${foregroundChannels.map((channel, index) => Math.round(channel * amount + backgroundChannels[index] * (1 - amount)).toString(16).padStart(2, "0")).join("")}`;
}

/** Match Beautiful Mermaid's published DiagramColors → AsciiTheme bridge. */
function asciiTheme(theme: TextDiagramTheme) {
  const line = theme.line || mixHex(theme.fg, theme.bg, 50);
  const border = theme.border || mixHex(theme.fg, theme.bg, 20);
  return {
    fg: theme.fg,
    bg: theme.bg,
    line,
    border,
    arrow: theme.accent || mixHex(theme.fg, theme.bg, 85),
    accent: theme.accent,
    corner: line,
    junction: border,
  };
}

/**
 * Beautiful Mermaid's grid router can become pathologically slow for tall,
 * densely connected graphs. Its LR router handles the same graph faithfully
 * and quickly, so adapt only the text-rendering copy when that known shape is
 * detected. Canonical Mermaid source and SVG direction remain untouched.
 */
function sourceForSpatialTextRenderer(source: string) {
  if (!/^\s*(?:flowchart|graph)\s+(?:TB|TD)\b/im.test(source)) return { source, layoutAdapted: false };
  const graph = parseMermaid(source);
  const denseVerticalGraph = graph.nodes.size >= 18 && graph.edges.length >= graph.nodes.size;
  const exceptionallyLargeGraph = graph.nodes.size >= 26;
  const groupedVerticalGraph = graph.subgraphs.length > 0 && graph.nodes.size >= 15;
  if (!denseVerticalGraph && !exceptionallyLargeGraph && !groupedVerticalGraph) return { source, layoutAdapted: false };
  return {
    source: source.replace(/^(\s*)(flowchart|graph)\s+(?:TB|TD)\b/im, "$1$2 LR"),
    layoutAdapted: true,
  };
}

workerScope.onmessage = (event) => {
  try {
    // Presentation directives cannot affect plain text and noticeably increase
    // the work required for heavily styled source.
    const adapted = sourceForPolishedRenderer(event.data.source, false);
    const textLayout = sourceForSpatialTextRenderer(adapted);
    const format = event.data.format || "unicode";
    const useAscii = format === "ascii";
    const options = { useAscii, paddingX: 5, paddingY: 5, boxBorderPadding: 1 } as const;
    const content = renderMermaidASCII(textLayout.source, { ...options, colorMode: "none" });
    const result = {
      content,
      ...(event.data.theme ? {
        html: renderMermaidASCII(textLayout.source, {
          ...options,
          colorMode: "html",
          theme: asciiTheme(event.data.theme),
        }),
      } : {}),
      simplified: false,
      layoutAdapted: textLayout.layoutAdapted,
    };
    workerScope.postMessage({ ok: true, result });
  } catch (error) {
    workerScope.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : "Beautiful Mermaid could not render this diagram as Unicode.",
    });
  }
};
