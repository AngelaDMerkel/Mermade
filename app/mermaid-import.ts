const MERMAID_FENCE = /^\s{0,3}(```|~~~)[\t ]*(?:mermaid|mmd)(?:[\t ]+[^\r\n]*)?\r?\n([\s\S]*?)^\s{0,3}\1\s*$/gim;
const DOKUWIKI_MERMAID = /<mermaid(?:\s+[^>]*)?>\s*(?:raw\s*\r?\n)?([\s\S]*?)<\/mermaid>/gi;

export const MERMAID_IMPORT_ACCEPT = ".mmd,.mermaid,.md,.markdown,.txt,text/plain,text/markdown";

export function readImportedMermaid(content: string) {
  const normalized = content.replace(/^\uFEFF/, "");
  const diagrams = [
    ...[...normalized.matchAll(MERMAID_FENCE)].map((match) => ({ index: match.index, source: match[2], renderProfile: undefined })),
    ...[...normalized.matchAll(DOKUWIKI_MERMAID)].map((match) => ({ index: match.index, source: match[1], renderProfile: "dokuwiki" as const })),
  ]
    .sort((first, second) => first.index - second.index)
    .map((diagram) => ({ ...diagram, source: diagram.source.trim() }))
    .filter((diagram) => Boolean(diagram.source));

  return {
    source: diagrams[0]?.source ?? normalized.trim(),
    renderProfile: diagrams[0]?.renderProfile,
    extractedFromMarkdown: diagrams.length > 0,
    additionalDiagramCount: Math.max(0, diagrams.length - 1),
  };
}

export function diagramNameFromFile(filename: string) {
  return filename.replace(/\.(?:mmd|mermaid|md|markdown|txt)$/i, "").trim() || "Imported diagram";
}
