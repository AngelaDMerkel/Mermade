export type MermaidTheme = "default" | "base" | "dark" | "forest" | "neutral" | "neo" | "neo-dark" | "redux" | "redux-dark" | "redux-color" | "redux-dark-color" | "null";
export type MermaidLook = "classic" | "handDrawn" | "neo";
export type MermaidLayout = "dagre" | "elk" | "tidy-tree" | "cose-bilkent";

export type DiagramStyle = {
  theme: MermaidTheme;
  look: MermaidLook;
  layout: MermaidLayout;
  fontFamily: string;
  primaryColor: string;
  primaryTextColor: string;
  lineColor: string;
  background: string;
  clusterBkg: string;
  clusterBorder: string;
};

export const DEFAULT_DIAGRAM_STYLE: DiagramStyle = {
  theme: "base",
  look: "classic",
  layout: "dagre",
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  primaryColor: "#ffffff",
  primaryTextColor: "#24232a",
  lineColor: "#77737f",
  background: "#fffdfa",
  clusterBkg: "#fff7fa",
  clusterBorder: "#d8bdc8",
};

const STYLE_VARIABLES: Array<keyof Pick<DiagramStyle, "primaryColor" | "primaryTextColor" | "lineColor" | "background" | "clusterBkg" | "clusterBorder">> = [
  "primaryColor",
  "primaryTextColor",
  "lineColor",
  "background",
  "clusterBkg",
  "clusterBorder",
];
const LEGACY_NESTED_VARIABLES = ["fontFamily"];

function yamlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function unquote(value: string) {
  const trimmed = value.trim();
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1).replaceAll("''", "'");
  }
  return trimmed;
}

function frontmatterParts(source: string) {
  const leading = source.match(/^\s*/)?.[0] || "";
  const trimmed = source.slice(leading.length);
  if (!trimmed.startsWith("---")) return { leading, lines: [] as string[], body: trimmed };
  const match = trimmed.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (!match) return { leading, lines: [] as string[], body: trimmed };
  return {
    leading,
    lines: match[1].split(/\r?\n/),
    body: trimmed.slice(match[0].length),
  };
}

function sectionEnd(lines: string[], start: number, indent: number) {
  let index = start + 1;
  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const nextIndent = line.match(/^ */)?.[0].length || 0;
    if (nextIndent <= indent) break;
  }
  return index;
}

function ensureMapping(lines: string[], key: string, indent: number, withinStart = 0, withinEnd = lines.length) {
  const pattern = new RegExp(`^ {${indent}}${key}:\\s*$`);
  const found = lines.findIndex((line, index) => index >= withinStart && index < withinEnd && pattern.test(line));
  if (found >= 0) return found;
  lines.splice(withinEnd, 0, `${" ".repeat(indent)}${key}:`);
  return withinEnd;
}

function upsertScalar(lines: string[], key: string, value: string, indent: number, withinStart: number, withinEnd: number) {
  const pattern = new RegExp(`^ {${indent}}${key}:`);
  const found = lines.findIndex((line, index) => index > withinStart && index < withinEnd && pattern.test(line));
  const next = `${" ".repeat(indent)}${key}: ${yamlString(value)}`;
  if (found >= 0) lines[found] = next;
  else lines.splice(withinEnd, 0, next);
}

function removeScalar(lines: string[], key: string, indent: number, withinStart: number, withinEnd: number) {
  const pattern = new RegExp(`^ {${indent}}${key}:`);
  for (let index = withinEnd - 1; index > withinStart; index -= 1) {
    if (pattern.test(lines[index])) lines.splice(index, 1);
  }
}

export function applyDiagramStyle(source: string, style: DiagramStyle) {
  const parts = frontmatterParts(source);
  const lines = [...parts.lines];
  const configStart = ensureMapping(lines, "config", 0);
  let configEnd = sectionEnd(lines, configStart, 0);

  upsertScalar(lines, "theme", style.theme, 2, configStart, configEnd);
  configEnd = sectionEnd(lines, configStart, 0);
  upsertScalar(lines, "look", style.look, 2, configStart, configEnd);
  configEnd = sectionEnd(lines, configStart, 0);
  upsertScalar(lines, "layout", style.layout, 2, configStart, configEnd);
  configEnd = sectionEnd(lines, configStart, 0);
  upsertScalar(lines, "fontFamily", style.fontFamily, 2, configStart, configEnd);
  configEnd = sectionEnd(lines, configStart, 0);

  const variablesPattern = /^  themeVariables:\s*$/;
  let variablesStart = lines.findIndex((line, index) => index > configStart && index < configEnd && variablesPattern.test(line));
  if (style.theme === "base") {
    variablesStart = variablesStart >= 0 ? variablesStart : ensureMapping(lines, "themeVariables", 2, configStart + 1, configEnd);
    for (const key of LEGACY_NESTED_VARIABLES) {
      const variablesEnd = sectionEnd(lines, variablesStart, 2);
      removeScalar(lines, key, 4, variablesStart, variablesEnd);
    }
    for (const key of STYLE_VARIABLES) {
      const variablesEnd = sectionEnd(lines, variablesStart, 2);
      upsertScalar(lines, key, style[key], 4, variablesStart, variablesEnd);
    }
  } else if (variablesStart >= 0) {
    for (const key of [...STYLE_VARIABLES, ...LEGACY_NESTED_VARIABLES]) {
      const variablesEnd = sectionEnd(lines, variablesStart, 2);
      removeScalar(lines, key, 4, variablesStart, variablesEnd);
    }
    const variablesEnd = sectionEnd(lines, variablesStart, 2);
    const remaining = lines.slice(variablesStart + 1, variablesEnd).some((line) => line.trim() && !line.trimStart().startsWith("#"));
    if (!remaining) lines.splice(variablesStart, variablesEnd - variablesStart);
  }

  return `${parts.leading}---\n${lines.join("\n")}\n---\n${parts.body.trimStart()}`;
}

export function readDiagramStyle(source: string): DiagramStyle {
  const { lines } = frontmatterParts(source);
  if (!lines.length) return { ...DEFAULT_DIAGRAM_STYLE };
  const read = (key: string) => {
    const match = lines.map((line) => line.trim()).find((line) => line.startsWith(`${key}:`))?.match(/^[^:]+:\s*(.*)$/);
    return match ? unquote(match[1]) : undefined;
  };
  const theme = read("theme");
  const look = read("look");
  const layout = read("layout");
  return {
    ...DEFAULT_DIAGRAM_STYLE,
    ...(theme && ["default", "base", "dark", "forest", "neutral", "neo", "neo-dark", "redux", "redux-dark", "redux-color", "redux-dark-color", "null"].includes(theme) ? { theme: theme as MermaidTheme } : {}),
    ...(look && ["classic", "handDrawn", "neo"].includes(look) ? { look: look as MermaidLook } : {}),
    ...(layout && ["dagre", "elk", "tidy-tree", "cose-bilkent"].includes(layout) ? { layout: layout as MermaidLayout } : {}),
    ...(read("fontFamily") ? { fontFamily: read("fontFamily") as string } : {}),
    ...Object.fromEntries(STYLE_VARIABLES.flatMap((key) => {
      const value = read(key);
      return value ? [[key, value]] : [];
    })),
  };
}
