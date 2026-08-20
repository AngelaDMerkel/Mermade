export type RenderedEdgeIdentity = {
  id: string;
  from: string;
  to: string;
  sourceOccurrence?: number;
};

function mermaidIdentity(element: Element) {
  const ownIdentity = element.getAttribute("data-id");
  if (ownIdentity?.startsWith("L_")) return ownIdentity;

  const nestedIdentity = element.querySelector("[data-id]")?.getAttribute("data-id");
  if (nestedIdentity?.startsWith("L_")) return nestedIdentity;

  const domId = element.id;
  const relationshipIndex = domId.lastIndexOf("-L_");
  return relationshipIndex >= 0 ? domId.slice(relationshipIndex + 1) : undefined;
}

/**
 * Mermaid emits a stable `L_from_to_occurrence` identity on every rendered
 * flowchart relationship. Bind the visual path and its label through that
 * identity rather than assuming Mermaid preserves the source/model array
 * order across renderers and layouts.
 */
export function bindRenderedFlowchartEdges(host: HTMLElement, edges: RenderedEdgeIdentity[]) {
  host.querySelectorAll(".mermaid-edge-hit").forEach((element) => element.remove());
  host.querySelectorAll<HTMLElement>("[data-edge-id]").forEach((element) => delete element.dataset.edgeId);

  const modelByMermaidIdentity = new Map<string, RenderedEdgeIdentity>();
  const occurrenceByEndpoints = new Map<string, number>();
  edges.forEach((edge) => {
    const endpointKey = `${edge.from}\u0000${edge.to}`;
    const occurrence = edge.sourceOccurrence ?? occurrenceByEndpoints.get(endpointKey) ?? 0;
    occurrenceByEndpoints.set(endpointKey, Math.max(occurrenceByEndpoints.get(endpointKey) || 0, occurrence + 1));
    modelByMermaidIdentity.set(`L_${edge.from}_${edge.to}_${occurrence}`, edge);
  });

  const assignedModelIds = new Set<string>();
  const modelIdByRenderedIdentity = new Map<string, string>();
  const pathModelIds: Array<string | undefined> = [];
  const paths = [...host.querySelectorAll<SVGPathElement>(".edgePaths path:not(.mermaid-edge-hit)")];

  paths.forEach((path) => {
    const renderedIdentity = mermaidIdentity(path);
    const identityEdge = renderedIdentity ? modelByMermaidIdentity.get(renderedIdentity) : undefined;
    const edge = identityEdge && !assignedModelIds.has(identityEdge.id) ? identityEdge : undefined;
    const modelId = edge?.id;
    pathModelIds.push(modelId);
    if (!modelId) return;

    assignedModelIds.add(modelId);
    path.dataset.edgeId = modelId;
    if (renderedIdentity) modelIdByRenderedIdentity.set(renderedIdentity, modelId);

    const hitTarget = path.cloneNode(false) as SVGPathElement;
    hitTarget.removeAttribute("id");
    hitTarget.classList.remove("mermade-selected");
    hitTarget.dataset.edgeId = modelId;
    hitTarget.classList.add("mermaid-edge-hit");
    path.parentNode?.insertBefore(hitTarget, path);
  });

  // Mermaid's HTML labels contain a nested `.edgeLabel`; only the direct SVG
  // wrapper is one label container. Its child carries the same stable `L_…`
  // identity as the path, including for empty labels.
  host.querySelectorAll<SVGGElement>(".edgeLabels > .edgeLabel").forEach((label) => {
    const renderedIdentity = mermaidIdentity(label);
    const modelId = renderedIdentity ? modelIdByRenderedIdentity.get(renderedIdentity) : undefined;
    if (modelId) label.dataset.edgeId = modelId;
  });

  return {
    pathCount: pathModelIds.length,
    boundPathCount: pathModelIds.filter(Boolean).length,
    identityCount: modelIdByRenderedIdentity.size,
    unmatchedRenderedIdentities: paths
      .map((path) => mermaidIdentity(path))
      .filter((identity): identity is string => Boolean(identity && !modelIdByRenderedIdentity.has(identity))),
  };
}
