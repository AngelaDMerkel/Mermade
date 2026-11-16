import { isFlowchartSource } from "../mermaid-source";
import type { Diagram, SupportedMermaidVersion } from "./diagram-types";

export const LATEST_MERMAID_VERSION: SupportedMermaidVersion = "11.16.0";

export function detectMermaidVersion(source: string) {
  const declaredVersion = source.match(/%%\s*mermaid(?:-|\s+)version\s*[:=]\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/i);
  if (declaredVersion?.[1] && Number(declaredVersion[1]) <= 10) {
    return { recommended: "10.9.6" as const, minimum: "10.x", label: "Declared Mermaid 10.x source" };
  }
  if (/@\{\s*[^}]*\bshape\s*:/m.test(source)) {
    return { recommended: LATEST_MERMAID_VERSION, minimum: "11.3.0", label: "Mermaid 11.3+ expanded-shape syntax" };
  }
  return { recommended: LATEST_MERMAID_VERSION, minimum: "10.0.0", label: `${isFlowchartSource(source) ? "Flowchart" : "Unsupported"} syntax` };
}

export function resolvedMermaidVersion(diagram: Diagram): SupportedMermaidVersion {
  const preference = diagram.mermaidVersion || "auto";
  return preference === "auto" ? (diagram.detectedMermaidVersion || LATEST_MERMAID_VERSION) : preference;
}

