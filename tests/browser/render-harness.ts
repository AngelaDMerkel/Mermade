import zenuml from "@mermaid-js/mermaid-zenuml";
import mermaid from "mermaid";
import { FLOWCHART_SHAPES } from "../../app/flowchart-shapes";
import { normalizeRenderedSvg } from "../../app/mermaid-rendering";
import { MERMAID_DIAGRAM_TYPES } from "../../app/mermaid-types";

type RenderMeasurement = {
  id: string;
  label: string;
  viewBox: { x: number; y: number; width: number; height: number };
  bounds: { x: number; y: number; width: number; height: number };
  preserveAspectRatio: string;
  contentCount: number;
  textCount: number;
  shapeCount: number;
  errorCount: number;
  c4Title?: { x: number; expectedX: number; textAnchor: string };
};

const byId = new Map(MERMAID_DIAGRAM_TYPES.map((type) => [type.id, type]));
const shapeById = new Map(FLOWCHART_SHAPES.map((shape) => [shape.id, shape]));
let renderSequence = 0;

function typeFor(id: string) {
  const type = byId.get(id);
  if (!type) throw new Error(`Unknown Mermaid diagram type: ${id}`);
  return type;
}

function finiteBox(box: DOMRect | SVGRect) {
  return { x: box.x, y: box.y, width: box.width, height: box.height };
}

function combinedBounds(elements: SVGGraphicsElement[]) {
  const points: Array<{ x: number; y: number }> = [];

  for (const element of elements) {
    const box = element.getBBox();
    const matrix = element.getCTM();
    if (!matrix || ![box.x, box.y, box.width, box.height].every(Number.isFinite)) continue;
    for (const [x, y] of [
      [box.x, box.y],
      [box.x + box.width, box.y],
      [box.x, box.y + box.height],
      [box.x + box.width, box.y + box.height],
    ]) {
      points.push({
        x: matrix.a * x + matrix.c * y + matrix.e,
        y: matrix.b * x + matrix.d * y + matrix.f,
      });
    }
  }

  if (!points.length) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

async function parseStarter(id: string) {
  const type = typeFor(id);
  const result = await mermaid.parse(type.template);
  return { id: type.id, label: type.label, diagramType: result.diagramType };
}

async function renderSource(id: string, label: string, diagramTypeId: string, source: string): Promise<RenderMeasurement> {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-100000px;top:0;visibility:hidden;width:1600px;height:1200px";
  document.body.append(host);

  try {
    const renderId = `standards-${id}-${++renderSequence}`;
    const { svg: markup } = await mermaid.render(renderId, source, host);
    host.innerHTML = markup;
    const svg = host.querySelector("svg");
    if (!svg) throw new Error(`${label} did not produce an SVG element`);

    normalizeRenderedSvg(svg, diagramTypeId, source);

    const content = [...svg.querySelectorAll<SVGGraphicsElement>(
      "text, foreignObject, rect, circle, ellipse, path, polygon, polyline, line",
    )].filter((element) => !element.closest("defs, marker, clipPath, mask, pattern"));
    const text = content.filter((element) => element.matches("text, foreignObject"));
    const shapes = content.filter((element) => !element.matches("text, foreignObject"));
    const errorCount = svg.querySelectorAll(".error-icon, .error-text, [data-mermaid-error]").length;
    const viewBox = svg.viewBox.baseVal;
    const bounds = combinedBounds(content);
    const titleText = source.match(/^\s*title\s+(.+?)\s*$/m)?.[1];
    const title = diagramTypeId === "c4" && titleText
      ? [...svg.children].find((element) => element.tagName.toLowerCase() === "text" && element.textContent?.trim() === titleText) as SVGTextElement | undefined
      : undefined;

    return {
      id,
      label,
      viewBox: finiteBox(viewBox),
      bounds: finiteBox(bounds),
      preserveAspectRatio: svg.getAttribute("preserveAspectRatio") ?? "",
      contentCount: content.length,
      textCount: text.length,
      shapeCount: shapes.length,
      errorCount,
      c4Title: title ? {
        x: Number(title.getAttribute("x")),
        expectedX: viewBox.x + viewBox.width / 2,
        textAnchor: title.getAttribute("text-anchor") ?? "",
      } : undefined,
    };
  } finally {
    host.remove();
  }
}

async function renderStarter(id: string) {
  const type = typeFor(id);
  return renderSource(type.id, type.label, type.id, type.template);
}

function shapeSource(id: string) {
  const shape = shapeById.get(id);
  if (!shape) throw new Error(`Unknown Mermaid flowchart shape: ${id}`);
  return { shape, source: `flowchart LR\n  sample@{ shape: ${shape.mermaidShape}, label: "${shape.label}" }` };
}

async function parseShape(id: string) {
  const { shape, source } = shapeSource(id);
  const result = await mermaid.parse(source);
  return { id: shape.id, label: shape.label, diagramType: result.diagramType };
}

async function renderShape(id: string) {
  const { shape, source } = shapeSource(id);
  return renderSource(shape.id, shape.label, "flowchart", source);
}

await mermaid.registerExternalDiagrams([zenuml]);
mermaid.initialize({
  startOnLoad: false,
  theme: "base",
  securityLevel: "strict",
  flowchart: { htmlLabels: true, curve: "basis" },
});

Object.assign(window, {
  mermadeStandards: {
    ready: true,
    types: MERMAID_DIAGRAM_TYPES.map(({ id, label, family }) => ({ id, label, family })),
    shapes: FLOWCHART_SHAPES.map(({ id, label, mermaidShape }) => ({ id, label, mermaidShape })),
    parseStarter,
    renderStarter,
    parseShape,
    renderShape,
  },
});
