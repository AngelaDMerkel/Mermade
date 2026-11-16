import type { Diagram } from "./editor/diagram-types";
import { projectSourceBackedFlowchart } from "./editor/diagram-model";
import { flowchartNodeIds } from "./flowchart-source";
import { bindRenderedFlowchartEdges } from "./rendered-edge-identity";

export function normalizeRenderedSvg(svg: SVGSVGElement) {
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  // Large flowcharts are commonly viewed well below 100% zoom. Keep their
  // relationship strokes at a readable screen width instead of allowing the
  // canvas transform to collapse them into faint sub-pixel lines.
  svg.querySelectorAll<SVGGeometryElement>(".flowchart-link").forEach((edge) => {
    edge.setAttribute("vector-effect", "non-scaling-stroke");
    if (edge.classList.contains("edge-thickness-normal") && !edge.style.strokeWidth) {
      edge.style.strokeWidth = "1.5px";
    }
  });

  svg.querySelectorAll<SVGGeometryElement>(
    ".node > rect, .node > circle, .node > ellipse, .node > polygon, .node > path, "
    + ".node > .label-container rect, .node > .label-container circle, .node > .label-container ellipse, "
    + ".node > .label-container polygon, .node > .label-container path",
  ).forEach((shape) => shape.setAttribute("vector-effect", "non-scaling-stroke"));

  // Compound Mermaid 11 shapes can contain several narrow paths. Give every
  // rendered node a stable rectangular hit area so it remains selectable at
  // the very small zoom levels used by large ELK diagrams.
  svg.querySelectorAll<SVGGElement>(".node").forEach((node) => {
    if (node.querySelector(":scope > .mermade-node-hit")) return;
    try {
      const bounds = node.getBBox();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      const hit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      hit.classList.add("mermade-node-hit");
      hit.setAttribute("x", String(bounds.x));
      hit.setAttribute("y", String(bounds.y));
      hit.setAttribute("width", String(bounds.width));
      hit.setAttribute("height", String(bounds.height));
      hit.setAttribute("vector-effect", "non-scaling-stroke");
      // Mermaid emits diagram-scoped `!important` rules for classDef styles.
      // In particular, `classDef default stroke:...` also matches rectangles
      // injected beneath every node. Keep this editor-only hit target
      // invisible with inline important declarations, which outrank the
      // generated diagram stylesheet without changing the Mermaid source.
      hit.style.setProperty("fill", "transparent", "important");
      hit.style.setProperty("stroke", "transparent", "important");
      hit.style.setProperty("stroke-width", "14px", "important");
      hit.style.setProperty("opacity", "0", "important");
      hit.style.setProperty("pointer-events", "all");
      node.insertBefore(hit, node.firstChild);
    } catch {
      // Detached export SVGs may not expose getBBox; the visible renderer does.
    }
  });
}

function comparableText(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/["'`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

/** Resolve repeated labels in source order, normalising source only once per SVG. */
export function createRenderedLabelResolver(source: string) {
  const candidates = source.split(/\r?\n/)
    .map((line, index) => ({ line: comparableText(line), index }))
    .filter(({ line }) => line && !line.startsWith("%%") && !line.startsWith("---"));
  const labels = new Map<string, { lines: number[]; occurrence: number }>();
  return (renderedText: string) => {
    const label = comparableText(renderedText);
    if (label.length < 2) return -1;
    let match = labels.get(label);
    if (!match) {
      match = { lines: candidates.filter(({ line }) => line.includes(label)).map(({ index }) => index), occurrence: 0 };
      labels.set(label, match);
    }
    return match.lines[match.occurrence++] ?? match.lines[0] ?? -1;
  };
}

/** Attach source-line metadata to rendered labels and their nearest SVG group. */
export function decorateRenderedStatements(svg: SVGSVGElement, source: string) {
  const decorated = new Set<Element>();
  const resolveLabel = createRenderedLabelResolver(source);
  svg.querySelectorAll<SVGGraphicsElement>("text, foreignObject").forEach((label) => {
    const line = resolveLabel(label.textContent || "");
    if (line < 0) return;
    const target = label.closest("g") || label;
    if (!(target instanceof SVGElement)) return;
    target.dataset.sourceLine = String(line);
    label.dataset.sourceLine = String(line);
    decorated.add(target);
    decorated.add(label);
  });
  return decorated.size;
}

export function normalizeSvgMarkup(markup: string) {
  const container = document.createElement("div");
  container.innerHTML = markup;
  const svg = container.querySelector("svg");
  if (!svg) return markup;
  normalizeRenderedSvg(svg);
  return svg.outerHTML;
}

export function bindRenderedFlowchart(host: HTMLElement, diagram: Diagram, source: string, selectedIds: readonly string[]) {
  const svg = host.querySelector("svg");
  if (svg) {
    normalizeRenderedSvg(svg);
    decorateRenderedStatements(svg, source);
  }
  // Bind interaction identities from the exact Mermaid document that
  // produced this SVG. The persisted visual projection may briefly be
  // stale during restoration or Fast Refresh, but it must never make
  // two source relationships share one selectable identity.
  const renderedDiagram = projectSourceBackedFlowchart(diagram, source);
  const nodeIds = [...new Set([
    ...renderedDiagram.nodes.map((node) => node.id),
    ...flowchartNodeIds(source),
  ])].sort((a, b) => b.length - a.length);
  host.querySelectorAll<HTMLElement>(".node").forEach((element) => {
    const id = nodeIds.find((nodeId) => element.id === nodeId || element.id.includes(`-${nodeId}-`) || element.id.endsWith(`-${nodeId}`));
    if (id) element.dataset.nodeId = id;
  });
  const groupIds = renderedDiagram.groups.map((group) => group.id).sort((a, b) => b.length - a.length);
  host.querySelectorAll<HTMLElement>(".cluster").forEach((element) => {
    const id = groupIds.find((groupId) => element.id === groupId || element.id.endsWith(`-${groupId}`));
    if (id) element.dataset.groupId = id;
  });
  bindRenderedFlowchartEdges(host, renderedDiagram.edges);
  syncRenderedSelection(host, selectedIds);
}

const SOURCE_LINE_SELECTION_PREFIX = "source-line:";

export function sourceLineSelection(index: number) {
  return `${SOURCE_LINE_SELECTION_PREFIX}${index}`;
}

export function sourceLineFromSelection(value: string | undefined) {
  if (!value?.startsWith(SOURCE_LINE_SELECTION_PREFIX)) return -1;
  const index = Number(value.slice(SOURCE_LINE_SELECTION_PREFIX.length));
  return Number.isInteger(index) ? index : -1;
}

export function renderedSelectionId(element: HTMLElement) {
  const modelId = element.dataset.nodeId || element.dataset.edgeId || element.dataset.groupId;
  // Source-authoritative flowcharts can render valid Mermaid nodes that the
  // tolerant FreeForm model does not understand. Keep their Mermaid identity
  // so visual deletion can remove the node and every relationship referencing
  // it, rather than selecting only the declaration line beneath the pointer.
  if (modelId) return modelId;
  const line = Number(element.dataset.sourceLine);
  if (element.dataset.sourceLine !== undefined && Number.isInteger(line)) return sourceLineSelection(line);
  return undefined;
}

function renderedModelElement(target: Element, diagram: Diagram) {
  let element: Element | null = target;
  while (element) {
    const dataset = (element as HTMLElement).dataset;
    if (
      (dataset.nodeId && diagram.nodes.some((node) => node.id === dataset.nodeId))
      || (dataset.edgeId && diagram.edges.some((edge) => edge.id === dataset.edgeId))
      || (dataset.groupId && diagram.groups.some((group) => group.id === dataset.groupId))
    ) return element as HTMLElement;
    element = element.parentElement;
  }
  return null;
}

export function renderedInteractionElement(target: Element, diagram: Diagram) {
  return renderedModelElement(target, diagram)
    || target.closest<HTMLElement>("[data-node-id], [data-edge-id], [data-group-id]")
    || target.closest<HTMLElement>("[data-source-line]");
}

function toggleRenderedSelection(element: HTMLElement, selected: boolean) {
  element.classList.toggle("mermade-selected", selected);
  if (!element.dataset.nodeId) return;
  element.querySelectorAll<SVGElement>(
    ":scope > rect:not(.mermade-node-hit), :scope > circle, :scope > ellipse, :scope > polygon, :scope > path, "
    + ":scope > .label-container rect, :scope > .label-container circle, :scope > .label-container ellipse, "
    + ":scope > .label-container polygon, :scope > .label-container path",
  ).forEach((shape) => {
    const storedOutline = shape.dataset.mermadeSelectionOutline;
    if (selected) {
      if (storedOutline === undefined) {
        shape.dataset.mermadeSelectionOutline = JSON.stringify([
          shape.style.getPropertyValue("stroke"),
          shape.style.getPropertyPriority("stroke"),
          shape.style.getPropertyValue("stroke-width"),
          shape.style.getPropertyPriority("stroke-width"),
        ]);
      }
      shape.style.setProperty("stroke", "var(--purple)", "important");
      shape.style.setProperty("stroke-width", "3.5px", "important");
      return;
    }
    if (storedOutline === undefined) return;
    const [stroke, strokePriority, strokeWidth, strokeWidthPriority] = JSON.parse(storedOutline) as string[];
    if (stroke) shape.style.setProperty("stroke", stroke, strokePriority); else shape.style.removeProperty("stroke");
    if (strokeWidth) shape.style.setProperty("stroke-width", strokeWidth, strokeWidthPriority); else shape.style.removeProperty("stroke-width");
    delete shape.dataset.mermadeSelectionOutline;
  });
}

export function syncRenderedSelection(host: HTMLElement, selectedIds: readonly string[]) {
  const selectedSet = new Set(selectedIds);
  // Include Mermade-selected elements even if Mermaid replaced or changed
  // their identity metadata. This prevents a formerly selected path from
  // retaining a visual highlight after the authoritative selection changes.
  const elements = host.querySelectorAll<HTMLElement>(
    ".mermade-selected, [data-node-id], [data-edge-id], [data-group-id], [data-source-line]",
  );
  elements.forEach((element) => {
    const id = renderedSelectionId(element);
    toggleRenderedSelection(element, Boolean(id && selectedSet.has(id)));
  });
}
