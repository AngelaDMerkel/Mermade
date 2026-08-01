export function normalizeRenderedSvg(svg: SVGSVGElement, diagramTypeId: string, source: string) {
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  // Large flowcharts are commonly viewed well below 100% zoom. Keep their
  // relationship strokes at a readable screen width instead of allowing the
  // canvas transform to collapse them into faint sub-pixel lines.
  if (diagramTypeId === "flowchart") {
    svg.querySelectorAll<SVGGeometryElement>(".flowchart-link").forEach((edge) => {
      edge.setAttribute("vector-effect", "non-scaling-stroke");
      if (edge.classList.contains("edge-thickness-normal") && !edge.style.strokeWidth) {
        edge.style.strokeWidth = "1.5px";
      }
    });
  }

  // Mermaid's experimental C4 renderer offsets a direct-child title by four
  // diagram margins instead of centring it in the generated viewBox.
  if (diagramTypeId === "c4") {
    const titleText = source.match(/^\s*title\s+(.+?)\s*$/m)?.[1];
    const title = titleText
      ? [...svg.children].find((element) => element.tagName.toLowerCase() === "text" && element.textContent?.trim() === titleText) as SVGTextElement | undefined
      : undefined;
    const viewBox = svg.viewBox.baseVal;
    if (title && viewBox.width > 0) {
      title.setAttribute("x", String(viewBox.x + viewBox.width / 2));
      title.setAttribute("text-anchor", "middle");
    }
  }
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
 * label. This is deliberately syntax-agnostic so every registered diagram
 * family can offer a validated statement editor without maintaining a second
 * parser for Mermaid's complete grammar.
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
  svg.querySelectorAll<SVGGraphicsElement>("text, foreignObject").forEach((label) => {
    const line = sourceLineForRenderedText(source, label.textContent || "");
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

export function normalizeSvgMarkup(markup: string, diagramTypeId: string, source: string) {
  const container = document.createElement("div");
  container.innerHTML = markup;
  const svg = container.querySelector("svg");
  if (!svg) return markup;
  normalizeRenderedSvg(svg, diagramTypeId, source);
  return svg.outerHTML;
}
