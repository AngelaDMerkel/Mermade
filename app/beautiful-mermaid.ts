export const POLISHED_DIAGRAM_TYPE_IDS = new Set(["flowchart", "state", "sequence", "class", "er", "xychart"]);

export const POLISHED_THEME_OPTIONS = [
  ["mermade-auto", "Mermade — adapts to app"],
  ["zinc-light", "Zinc Light"],
  ["zinc-dark", "Zinc Dark"],
  ["tokyo-night", "Tokyo Night"],
  ["tokyo-night-storm", "Tokyo Night Storm"],
  ["tokyo-night-light", "Tokyo Night Light"],
  ["catppuccin-mocha", "Catppuccin Mocha"],
  ["catppuccin-latte", "Catppuccin Latte"],
  ["nord", "Nord"],
  ["nord-light", "Nord Light"],
  ["dracula", "Dracula"],
  ["github-light", "GitHub Light"],
  ["github-dark", "GitHub Dark"],
  ["solarized-light", "Solarized Light"],
  ["solarized-dark", "Solarized Dark"],
  ["one-dark", "One Dark"],
] as const;

export type PolishedTheme = typeof POLISHED_THEME_OPTIONS[number][0];

export type PolishedStyle = {
  styleModel: 2;
  theme: PolishedTheme;
  font: string;
  padding: number;
  nodeSpacing: number;
  layerSpacing: number;
  componentSpacing: number;
  transparent: boolean;
  respectSourceStyles: boolean;
  interactive: boolean;
};

export const DEFAULT_POLISHED_STYLE: PolishedStyle = {
  styleModel: 2,
  theme: "mermade-auto",
  font: "Inter",
  padding: 40,
  nodeSpacing: 28,
  layerSpacing: 48,
  componentSpacing: 36,
  transparent: true,
  respectSourceStyles: true,
  interactive: true,
};

const MERMADE_ADAPTIVE_THEME = {
  bg: "var(--mermade-polished-bg, #fffdfa)",
  fg: "var(--mermade-polished-fg, #27232a)",
} as const;

type BeautifulThemeColours = {
  bg: string;
  fg: string;
  line?: string;
  accent?: string;
  muted?: string;
  surface?: string;
  border?: string;
};

const LEGACY_DEFAULT_FONT = "Inter, ui-sans-serif, system-ui, sans-serif";

/**
 * Version one of Mermade's Beautiful settings overrode Beautiful Mermaid's
 * native palette and suppressed supported source directives by default.
 * Migrate that stored shape once; subsequent explicit choices are retained.
 */
export function normalisePolishedStyle(style?: Partial<PolishedStyle> & { styleModel?: number }): PolishedStyle {
  const legacy = Boolean(style && style.styleModel !== 2);
  return {
    ...DEFAULT_POLISHED_STYLE,
    ...style,
    styleModel: 2,
    font: !style?.font || style.font === LEGACY_DEFAULT_FONT ? DEFAULT_POLISHED_STYLE.font : style.font,
    respectSourceStyles: legacy ? true : (style?.respectSourceStyles ?? DEFAULT_POLISHED_STYLE.respectSourceStyles),
  };
}

export function themeForPolishedRenderer(theme: PolishedTheme, themes: Record<string, BeautifulThemeColours>): BeautifulThemeColours {
  return theme === "mermade-auto" ? MERMADE_ADAPTIVE_THEME : (themes[theme] || MERMADE_ADAPTIVE_THEME);
}

export function supportsPolishedDiagram(diagramTypeId: string) {
  return POLISHED_DIAGRAM_TYPE_IDS.has(diagramTypeId);
}

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
export function sourceForPolishedRenderer(source: string, respectSourceStyles = true) {
  const withoutYaml = withoutFrontmatter(source).replace(/^(\s*)flowchart-elk\b/im, "$1flowchart");
  const adapted = supplyBeautifulFlowchartDirection(adaptExpandedFlowchartNodes(withoutYaml));
  return respectSourceStyles ? adapted : withoutFlowchartPresentationDirectives(adapted);
}

function sanitiseSvgMarkup(markup: string) {
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
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  svg.setAttribute("data-renderer", "beautiful-mermaid");
  return svg.outerHTML;
}

export async function renderPolishedSvg(source: string, style: PolishedStyle) {
  const { renderMermaidSVG, THEMES } = await import("beautiful-mermaid");
  const theme = themeForPolishedRenderer(style.theme, THEMES);
  return sanitiseSvgMarkup(renderMermaidSVG(sourceForPolishedRenderer(source, style.respectSourceStyles), {
    ...theme,
    font: style.font,
    padding: style.padding,
    nodeSpacing: style.nodeSpacing,
    layerSpacing: style.layerSpacing,
    componentSpacing: style.componentSpacing,
    transparent: style.transparent,
    interactive: style.interactive,
  }));
}

export async function renderPolishedAscii(source: string) {
  const { renderMermaidASCII } = await import("beautiful-mermaid");
  return renderMermaidASCII(sourceForPolishedRenderer(source), { colorMode: "none" });
}
