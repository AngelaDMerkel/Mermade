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

/**
 * Find the Mermaid source statement most likely represented by a rendered
 * label when the tolerant flowchart projection cannot represent the element.
 */
export function sourceLineForRenderedText(source: string, renderedText: string) {
  const label = comparableText(renderedText);
  if (label.length < 2) return -1;

  const candidates = source.split(/\r?\n/)
    .map((line, index) => ({ line: comparableText(line), index, rawLength: line.length }))
    .filter(({ line }) => line && !line.startsWith("%%") && !line.startsWith("---"));
  const matches = candidates.filter(({ line }) => line.includes(label));
  if (!matches.length) return -1;
  matches.sort((first, second) => first.rawLength - second.rawLength || first.index - second.index);
  return matches[0].index;
}

/** Attach source-line metadata to rendered labels and their nearest SVG group. */
export function decorateRenderedStatements(svg: SVGSVGElement, source: string) {
  const decorated = new Set<Element>();
  const renderedTextOccurrences = new Map<string, number>();
  const sourceLines = source.split(/\r?\n/);
  svg.querySelectorAll<SVGGraphicsElement>("text, foreignObject").forEach((label) => {
    const renderedLabel = comparableText(label.textContent || "");
    let line: number;
    {
      const occurrence = renderedTextOccurrences.get(renderedLabel) ?? 0;
      const matchingLines = renderedLabel.length < 2 ? [] : sourceLines
        .map((candidate, index) => ({ candidate: comparableText(candidate), index }))
        .filter(({ candidate }) => candidate && !candidate.startsWith("%%") && !candidate.startsWith("---") && candidate.includes(renderedLabel))
        .map(({ index }) => index);
      line = matchingLines[occurrence] ?? matchingLines[0] ?? sourceLineForRenderedText(source, label.textContent || "");
      renderedTextOccurrences.set(renderedLabel, occurrence + 1);
    }
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
