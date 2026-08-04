import { BeautifulTextRoles, polishedTextRoles, PolishedStyle, themeForPolishedRenderer } from "./beautiful-mermaid-config";

export {
  DEFAULT_POLISHED_STYLE,
  accessiblePolishedTextColour,
  normalisePolishedStyle,
  polishedTextRoles,
  POLISHED_DIAGRAM_TYPE_IDS,
  POLISHED_THEME_OPTIONS,
  POLISHED_THEME_PREVIEWS,
  supportsPolishedDiagram,
  themeForPolishedRenderer,
} from "./beautiful-mermaid-config";
export type { BeautifulThemeColours, PolishedCustomColours, PolishedPaletteMode, PolishedStyle, PolishedTheme } from "./beautiful-mermaid-config";

function withoutFrontmatter(source: string) {
  const trimmed = source.trimStart();
  if (!trimmed.startsWith("---")) return trimmed;
  return trimmed.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/, "").trimStart();
}

function legacyNodeSyntax(id: string, shape: string, label: string) {
  const text = label.replaceAll("\\\"", "\"").replaceAll("\"", "'");
  switch (shape.toLowerCase()) {
    case "rounded": return `${id}("${text}")`;
    case "diam":
    case "diamond": return `${id}{"${text}"}`;
    case "stadium": return `${id}(["${text}"])`;
    case "circle": return `${id}(("${text}"))`;
    case "dbl-circ": return `${id}((("${text}")))`;
    case "subproc":
    case "fr-rect": return `${id}[["${text}"]]`;
    case "hex": return `${id}{{"${text}"}}`;
    case "cyl": return `${id}[("${text}")]`;
    case "odd": return `${id}>"${text}"]`;
    case "trap-b": return `${id}[/"${text}"\\]`;
    case "trap-t": return `${id}[\\"${text}"/]`;
    default: return `${id}["${text}"]`;
  }
}

const EXPANDED_FLOWCHART_NODE = /\b([A-Za-z_][\w-]*)@\{([^{}]*)\}/g;

function expandedNodeReplacement(id: string, attributes: string) {
  const shape = attributes.match(/\bshape\s*:\s*["']?([\w-]+)["']?/i)?.[1];
  const label = attributes.match(/\blabel\s*:\s*"((?:\\.|[^"\\])*)"/i)?.[1]
    ?? attributes.match(/\blabel\s*:\s*'((?:\\.|[^'\\])*)'/i)?.[1];
  return shape ? legacyNodeSyntax(id, shape, label ?? id) : `${id}@{${attributes}}`;
}

function adaptExpandedFlowchartNodes(source: string) {
  const finalDefinitions = new Map<string, string>();
  for (const match of source.matchAll(EXPANDED_FLOWCHART_NODE)) {
    finalDefinitions.set(match[1], expandedNodeReplacement(match[1], match[2]));
  }
  return source.replace(EXPANDED_FLOWCHART_NODE, (statement, id: string) => finalDefinitions.get(id) ?? statement);
}

function supplyBeautifulFlowchartDirection(source: string) {
  return source.replace(/^(\s*)(flowchart|graph)\s*$/im, "$1$2 TB");
}

/**
 * Presentation directives are useful in canonical Mermaid mode, but their
 * literal fills and strokes can overwhelm Beautiful Mermaid's derived palette.
 * Remove them only from the render-only copy when the Beautiful palette owns
 * presentation. The source stored by Mermade is never rewritten.
 */
function withoutFlowchartPresentationDirectives(source: string) {
  if (!/^\s*(?:flowchart|graph|stateDiagram(?:-v2)?)\b/im.test(source)) return source;
  return source
    .replace(/(^|[;\n])\s*(?:classDef|style|linkStyle)\b[^;\n]*/gim, "$1")
    .replace(/(^|[;\n])\s*class\s+[\w,-]+\s+[\w-]+\s*(?=;|\n|$)/gim, "$1")
    .replace(/:::[\w-]+/g, "");
}

/**
 * Beautiful Mermaid does not consume Mermaid YAML frontmatter and supports a
 * smaller shape vocabulary. Adapt a render-only copy without changing the
 * canonical source stored by Mermade.
 */
export function sourceForPolishedRenderer(source: string, respectSourceStyles = false) {
  const withoutYaml = withoutFrontmatter(source).replace(/^(\s*)flowchart-elk\b/im, "$1flowchart");
  const adapted = supplyBeautifulFlowchartDirection(adaptExpandedFlowchartNodes(withoutYaml));
  return respectSourceStyles ? adapted : withoutFlowchartPresentationDirectives(adapted);
}

function sanitiseSvgMarkup(markup: string, textRoles: BeautifulTextRoles) {
  const document = new DOMParser().parseFromString(markup, "image/svg+xml");
  const svg = document.documentElement;
  if (svg.tagName.toLowerCase() !== "svg" || document.querySelector("parsererror")) {
    throw new Error("Beautiful Mermaid returned invalid SVG");
  }
  svg.querySelectorAll("script, foreignObject, iframe, object, embed").forEach((element) => element.remove());
  svg.querySelectorAll("*").forEach((element) => {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith("on") || ((name === "href" || name.endsWith(":href")) && value.startsWith("javascript:"))) {
        element.removeAttribute(attribute.name);
      }
    }
  });
  // Retain Beautiful Mermaid's primary, secondary, muted, and faint hierarchy,
  // but use contrast-checked values for text. Graphical marks continue to use
  // the palette's original line and muted colours.
  svg.querySelectorAll("style").forEach((style) => {
    style.textContent = (style.textContent || "")
      .replace(/--_text:\s*[^;]+;/g, `--_text: ${textRoles.primary};`)
      .replace(/--_text-sec:\s*[^;]+;/g, `--_text-sec: ${textRoles.secondary};`)
      .replace(/--_text-muted:\s*[^;]+;/g, `--_text-muted: ${textRoles.muted};`)
      .replace(/--_text-faint:\s*[^;]+;/g, `--_text-faint: ${textRoles.faint};`);
  });
  svg.querySelectorAll<SVGElement>(".node").forEach((node) => {
    const shape = node.querySelector<SVGElement>(":scope > rect, :scope > polygon, :scope > path, :scope > circle, :scope > ellipse");
    const readableText = readablePolishedTextColour(shape?.getAttribute("fill") || "");
    if (!readableText) return;
    node.querySelectorAll<SVGTextElement>("text").forEach((label) => {
      if (!/^var\(--_text(?:\)|[-_])/.test(label.getAttribute("fill") || "")) return;
      label.setAttribute("fill", readableText);
      label.setAttribute("data-mermade-contrast", "auto");
    });
  });
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("data-renderer", "beautiful-mermaid");
  return svg.outerHTML;
}

function colourChannels(colour: string) {
  const value = colour.trim();
  const hex = value.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
  if (hex) {
    const expanded = hex.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex;
    return [0, 2, 4].map((index) => Number.parseInt(expanded.slice(index, index + 2), 16));
  }
  const rgb = value.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  return rgb ? rgb.slice(1, 4).map((channel) => Math.max(0, Math.min(255, Number(channel)))) : null;
}

function relativeLuminance(channels: number[]) {
  const linear = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

export function readablePolishedTextColour(fill: string) {
  const channels = colourChannels(fill);
  if (!channels) return null;
  return relativeLuminance(channels) > 0.179 ? "#000000" : "#ffffff";
}

export async function renderPolishedSvg(source: string, style: PolishedStyle) {
  const { renderMermaidSVG, THEMES } = await import("beautiful-mermaid");
  const selectedTheme = style.paletteMode === "custom" ? style.customColours : themeForPolishedRenderer(style.theme, THEMES);
  const textRoles = polishedTextRoles(selectedTheme);
  const theme = { ...selectedTheme, fg: textRoles.primary };
  return sanitiseSvgMarkup(renderMermaidSVG(sourceForPolishedRenderer(source, style.respectSourceStyles), {
    ...theme,
    font: style.font,
    padding: style.padding,
    nodeSpacing: style.nodeSpacing,
    layerSpacing: style.layerSpacing,
    componentSpacing: style.componentSpacing,
    transparent: style.transparent,
    interactive: style.interactive,
  }), textRoles);
}

export async function renderPolishedAscii(source: string, useAscii = true) {
  const { renderMermaidASCII } = await import("beautiful-mermaid");
  return renderMermaidASCII(sourceForPolishedRenderer(source), { colorMode: "none", useAscii });
}
