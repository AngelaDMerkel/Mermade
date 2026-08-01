export function normalizeRenderedSvg(svg: SVGSVGElement, diagramTypeId: string, source: string) {
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

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

export function normalizeSvgMarkup(markup: string, diagramTypeId: string, source: string) {
  const container = document.createElement("div");
  container.innerHTML = markup;
  const svg = container.querySelector("svg");
  if (!svg) return markup;
  normalizeRenderedSvg(svg, diagramTypeId, source);
  return svg.outerHTML;
}
