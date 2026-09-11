import { formatGanttSource, normaliseGanttTaskIds } from "../gantt-source";
import { readDiagramStyle } from "../mermaid-style";
import { detectDiagramType } from "../mermaid-types";
import { parseMermaid } from "./diagram-model";
import type { Diagram, SupportedMermaidVersion } from "./diagram-types";
import type { DocumentSession } from "./document-session";
import { detectMermaidVersion } from "./mermaid-version";

export type SourceEditResult =
  | { ok: true; source: string; diagramTypeId: string; projectedFlowchart: boolean; cancelled?: false }
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
  const candidateType = detectDiagramType(candidate);
  const preparedCandidate = candidateType?.id === "gantt" ? formatGanttSource(normaliseGanttTaskIds(candidate).source) : candidate;
  const detection = detectMermaidVersion(preparedCandidate);
  const versionPreference = versionOverride || diagram.mermaidVersion || "auto";
  if (versionPreference === "10.9.6" && detection.minimum === "11.3.0") {
    return { ok: false, error: "This source requires Mermaid 11.3+; choose Auto-detect or 11.16.0 in Settings" };
  }
  const detectedType = detectDiagramType(preparedCandidate);
  if (!detectedType) return { ok: false, error: "This Mermaid diagram type is not registered in Mermade" };
  const nextStyle = readDiagramStyle(preparedCandidate);
  if (nextStyle.layout === "cose-bilkent" && detectedType.id !== "mindmap") {
    return { ok: false, error: "Cose Bilkent currently renders only Mindmaps reliably in Mermaid 11.16; choose Dagre, ELK, or Tidy Tree for this diagram" };
  }

  try {
    const version = versionPreference === "auto" ? detection.recommended : versionPreference;
    const error = await validate(preparedCandidate, version);
    if (!session.isCurrent(ticket)) return cancelled;
    if (error) return { ok: false, error };
    const parsedFlowchart = detectedType.id === "flowchart" ? parseMermaid(preparedCandidate, diagram) : null;
    const next: Diagram = {
      ...(parsedFlowchart || { ...diagram, nodes: [], edges: [], groups: [] }),
      source: preparedCandidate,
      style: nextStyle,
      mermaidVersion: versionOverride || diagram.mermaidVersion,
      detectedMermaidVersion: detection.recommended,
    };
    if (!session.commitEdit(ticket, next)) return cancelled;
    return { ok: true, source: preparedCandidate, diagramTypeId: detectedType.id, projectedFlowchart: Boolean(parsedFlowchart) };
  } catch (error) {
    if (!session.isCurrent(ticket)) return cancelled;
    return { ok: false, error: error instanceof Error ? error.message : "Mermaid rejected this source" };
  }
}
