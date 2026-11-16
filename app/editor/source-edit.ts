import { readDiagramStyle } from "../mermaid-style";
import { isFlowchartSource, FLOWCHART_ONLY_MESSAGE } from "../mermaid-source";
import { parseMermaid } from "./diagram-model";
import type { Diagram, SupportedMermaidVersion } from "./diagram-types";
import type { DocumentSession } from "./document-session";
import { detectMermaidVersion } from "./mermaid-version";

export type SourceEditResult =
  | { ok: true; source: string; projectedFlowchart: boolean; cancelled?: false }
  | { ok: false; error: string; cancelled?: boolean };

const cancelled: SourceEditResult = {
  ok: false,
  cancelled: true,
  error: "The diagram changed while this edit was being checked. Apply the edit again if it is still needed.",
};

/** Validate against one document revision, then commit that exact revision. */
export async function commitValidatedSource(
  session: DocumentSession<Diagram>,
  candidate: string,
  validate: (source: string, version: SupportedMermaidVersion) => Promise<string>,
  versionOverride?: SupportedMermaidVersion,
): Promise<SourceEditResult> {
  const ticket = session.beginEdit();
  const diagram = session.getSnapshot();
  if (!isFlowchartSource(candidate)) return { ok: false, error: FLOWCHART_ONLY_MESSAGE };
  const detection = detectMermaidVersion(candidate);
  const versionPreference = versionOverride || diagram.mermaidVersion || "auto";
  if (versionPreference === "10.9.6" && detection.minimum === "11.3.0") {
    return { ok: false, error: "This source requires Mermaid 11.3+; choose Auto-detect or 11.16.0 in Settings" };
  }
  const nextStyle = readDiagramStyle(candidate);
  if (nextStyle.layout === "cose-bilkent") {
    return { ok: false, error: "Cose Bilkent is not supported for flowcharts; choose Dagre, ELK, or Tidy Tree" };
  }

  try {
    const version = versionPreference === "auto" ? detection.recommended : versionPreference;
    const error = await validate(candidate, version);
    if (!session.isCurrent(ticket)) return cancelled;
    if (error) return { ok: false, error };
    const parsedFlowchart = parseMermaid(candidate, diagram);
    const next: Diagram = {
      ...(parsedFlowchart || { ...diagram, nodes: [], edges: [], groups: [] }),
      source: candidate,
      style: nextStyle,
      mermaidVersion: versionOverride || diagram.mermaidVersion,
      detectedMermaidVersion: detection.recommended,
    };
    if (!session.commitEdit(ticket, next)) return cancelled;
    return { ok: true, source: candidate, projectedFlowchart: Boolean(parsedFlowchart) };
  } catch (error) {
    if (!session.isCurrent(ticket)) return cancelled;
    return { ok: false, error: error instanceof Error ? error.message : "Mermaid rejected this source" };
  }
}
