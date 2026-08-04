"use client";

import {
  ArrowRight,
  AlertTriangle,
  BoxSelect,
  Check,
  ChevronDown,
  CircleHelp,
  Diamond,
  Code2,
  Command,
  Copy,
  Download,
  ExternalLink,
  Group,
  Link2,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Monitor,
  Moon,
  MousePointer2,
  Palette,
  Pencil,
  Plus,
  Redo2,
  RotateCcw,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  Undo2,
  Ungroup,
  Upload,
  Workflow,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  ChangeEvent as ReactChangeEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { SemanticVisualEditor } from "./semantic-visual-editor";
import { accessiblePolishedTextColour, DEFAULT_POLISHED_STYLE, normalisePolishedStyle, polishedTextRoles, POLISHED_THEME_OPTIONS, POLISHED_THEME_PREVIEWS, PolishedCustomColours, PolishedStyle, supportsPolishedDiagram } from "./beautiful-mermaid-config";
import { layoutFlowchart } from "./flowchart-layout";
import { appendFlowchartStatements, appendFlowchartSubgraph, canUseNativeFlowchartEditor, flowchartNodeIds, removeFlowchartItems, updateFlowchartDirection, updateFlowchartEdgeStatement, updateFlowchartNodeStatement, updateFlowchartSubgraphStatement } from "./flowchart-source";
import { layoutCompatibilityError } from "./layout-compatibility";
import {
  createLocalDiagramId,
  initialiseLocalDiagramLibrary,
  LocalDiagramIndex,
  LocalDiagramSummary,
  readLocalDiagramDocument,
  removeLocalDiagramDocument,
  updateLocalDiagramIndex,
  writeLocalDiagramDocument,
  writeLocalDiagramIndex,
} from "./local-diagram-library";
import { flowchartShapePatch, FLOWCHART_SHAPE_GROUPS, FlowchartVisualShape, mermaidShapeClass, selectedFlowchartShape, visualShapeForMermaid } from "./flowchart-shapes";
import { diagramNameFromFile, MERMAID_IMPORT_ACCEPT, readImportedMermaid } from "./mermaid-import";
import { helpForDiagram } from "./mermaid-help";
import { decorateRenderedStatements, normalizeRenderedSvg, normalizeSvgMarkup } from "./mermaid-rendering";
import { createRepairProposals, RepairProposal, RepairVersion } from "./mermaid-repair";
import { applyDiagramStyle, DEFAULT_DIAGRAM_STYLE, DiagramStyle, MermaidLayout, MermaidLook, MermaidTheme, readDiagramStyle } from "./mermaid-style";
import { detectDiagramType, MERMAID_DIAGRAM_TYPES, visualModeLabel } from "./mermaid-types";
import { renderTextDiagram, TextDiagramFormat } from "./unicode-export";

type NodeShape = FlowchartVisualShape;
type EdgeStyle = "solid" | "dashed" | "thick";
type ThemeMode = "light" | "dark" | "system";
type SupportedMermaidVersion = "11.16.0" | "10.9.6";
type MermaidVersionPreference = "auto" | SupportedMermaidVersion;
type CanvasView = "free" | "mermaid" | "polished";
type BeautifulPreviewMode = "diagram" | "unicode" | "ascii";

const BEAUTIFUL_DENSITY_PRESETS = [
  { id: "compact", label: "Compact", description: "Dense working diagrams", values: { padding: 24, nodeSpacing: 16, layerSpacing: 28, componentSpacing: 24 } },
  { id: "balanced", label: "Balanced", description: "Everyday presentation", values: { padding: 40, nodeSpacing: 28, layerSpacing: 48, componentSpacing: 36 } },
  { id: "spacious", label: "Spacious", description: "Room for projection", values: { padding: 64, nodeSpacing: 46, layerSpacing: 76, componentSpacing: 58 } },
] as const;

const BEAUTIFUL_COLOUR_ROLES: Array<[keyof PolishedCustomColours, string]> = [
  ["bg", "Background"],
  ["fg", "Foreground"],
  ["accent", "Accent"],
  ["line", "Connectors"],
  ["muted", "Muted text"],
  ["surface", "Node surface"],
  ["border", "Node border"],
];

let beautifulWorkspacePromise: Promise<typeof import("./beautiful-mermaid")> | null = null;

/** Keep the Beautiful adapter and third-party renderer out of the initial workspace bundle. */
function loadBeautifulWorkspace() {
  beautifulWorkspacePromise ??= import("./beautiful-mermaid");
  return beautifulWorkspacePromise;
}

function BeautifulMermaidMark({ size = 14 }: { size?: number }) {
  return (
    <svg className="beautiful-mermaid-mark" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path className="badge-piece badge-piece-top-left" d="M9.75 9.75H2.5V9.5a7 7 0 0 1 7-7h.25z" />
      <path className="badge-piece badge-piece-top-right" d="M14.25 2.5h7.25v.25a7 7 0 0 1-7 7h-.25z" />
      <path className="badge-piece badge-piece-bottom-left" d="M9.75 21.5H9.5a7 7 0 0 1-7-7v-.25h7.25z" />
      <path className="badge-piece badge-piece-bottom-right" d="M14.25 14.25h.25a7 7 0 0 1 7 7v.25h-7.25z" />
    </svg>
  );
}

function OrganiseChartIcon({ size = 19 }: { size?: number }) {
  return (
    <svg className="organise-chart-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="9" y="2" width="6" height="5" rx="1" />
      <path d="M12 7v4H6v5M12 11h6v5" />
      <rect x="3" y="16" width="6" height="5" rx="1" />
      <rect x="15" y="16" width="6" height="5" rx="1" />
    </svg>
  );
}

const SOURCE_LINE_SELECTION_PREFIX = "source-line:";

function sourceLineSelection(index: number) {
  return `${SOURCE_LINE_SELECTION_PREFIX}${index}`;
}

function sourceLineFromSelection(value: string | undefined) {
  if (!value?.startsWith(SOURCE_LINE_SELECTION_PREFIX)) return -1;
  const index = Number(value.slice(SOURCE_LINE_SELECTION_PREFIX.length));
  return Number.isInteger(index) ? index : -1;
}

function renderedSelectionId(element: HTMLElement, diagram: Diagram) {
  const modelId = element.dataset.nodeId || element.dataset.edgeId || element.dataset.groupId;
  const belongsToModel = Boolean(modelId && (
    diagram.nodes.some((node) => node.id === modelId)
    || diagram.edges.some((edge) => edge.id === modelId)
    || diagram.groups.some((group) => group.id === modelId)
  ));
  if (belongsToModel) return modelId;
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

function renderedInteractionElement(target: Element, diagram: Diagram) {
  return renderedModelElement(target, diagram)
    || target.closest<HTMLElement>("[data-node-id], [data-edge-id], [data-group-id]")
    || target.closest<HTMLElement>("[data-source-line]");
}

function toggleRenderedSelection(element: HTMLElement, selected: boolean) {
  element.classList.toggle("selected", selected);
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

type EditorPreferences = {
  theme: ThemeMode;
  showGrid: boolean;
  snapToGrid: boolean;
  showShortcutHints: boolean;
};

type DiagramNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape: NodeShape;
  color: string;
  textColor: string;
  groupId?: string;
  mermaidShape?: string;
};

type DiagramEdge = {
  id: string;
  from: string;
  to: string;
  label: string;
  style: EdgeStyle;
  arrow?: boolean;
};

type DiagramGroup = { id: string; label: string };

type MarqueeSelection = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  additive: boolean;
};

type PendingViewAnchor = {
  nodeId: string;
  viewportX: number;
  viewportY: number;
  targetView: CanvasView;
};

type Diagram = {
  name: string;
  direction: "LR" | "TB";
  source?: string;
  mermaidVersion?: MermaidVersionPreference;
  detectedMermaidVersion?: SupportedMermaidVersion;
  renderProfile?: "dokuwiki";
  style?: DiagramStyle;
  polishedStyle?: PolishedStyle;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  groups: DiagramGroup[];
};

const COLORS = ["#ffffff", "#fffdfa", "#fde8f1", "#e6f8f1", "#fff1da", "#e9f2ff", "#ffe9ee", "#e8f8fb", "#f2f3f5"];
const BOARD_WIDTH = 3200;
const BOARD_HEIGHT = 2200;
const CANVAS_MARGIN = 700;
const MIN_ZOOM = 0.25;
const MIN_FIT_ZOOM = 0.04;
const MAX_ZOOM = 2.4;
const GRID_SIZE = 20;
const LATEST_MERMAID_VERSION: SupportedMermaidVersion = "11.16.0";
const DEFAULT_PREFERENCES: EditorPreferences = {
  theme: "light",
  showGrid: true,
  snapToGrid: false,
  showShortcutHints: true,
};
const ONBOARDING_KEY = "mermade-onboarding-v1";
const GITHUB_URL = "https://github.com/AngelaDMerkel/Mermade";
const PUBLIC_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const MODERN_THEME_OPTIONS: Array<{ value: MermaidTheme; label: string }> = [
  { value: "base", label: "Base — customisable" },
  { value: "default", label: "Default" },
  { value: "neutral", label: "Neutral" },
  { value: "forest", label: "Forest" },
  { value: "dark", label: "Dark" },
  { value: "neo", label: "Neo" },
  { value: "neo-dark", label: "Neo Dark" },
  { value: "redux", label: "Redux" },
  { value: "redux-dark", label: "Redux Dark" },
  { value: "redux-color", label: "Redux Colour" },
  { value: "redux-dark-color", label: "Redux Dark Colour" },
  { value: "null", label: "None" },
];
const LEGACY_THEME_OPTIONS = MODERN_THEME_OPTIONS.filter(({ value }) => ["base", "default", "neutral", "forest", "dark", "null"].includes(value));
const LOOK_OPTIONS: Array<{ value: MermaidLook; label: string }> = [
  { value: "classic", label: "Classic" },
  { value: "handDrawn", label: "Hand drawn" },
  { value: "neo", label: "Neo" },
];
const LAYOUT_OPTIONS: Array<{ value: MermaidLayout; label: string }> = [
  { value: "dagre", label: "Dagre — general purpose" },
  { value: "elk", label: "ELK — complex graphs" },
  { value: "tidy-tree", label: "Tidy Tree — hierarchies" },
  { value: "cose-bilkent", label: "Cose Bilkent — networks" },
];
const LAYOUT_CAPABLE_DIAGRAMS = new Set(["flowchart", "state", "class", "er", "requirement", "mindmap"]);

function layoutOptionsForDiagram(diagramTypeId: string) {
  if (!LAYOUT_CAPABLE_DIAGRAMS.has(diagramTypeId)) return [];
  return LAYOUT_OPTIONS.filter(({ value }) => (
    (value !== "cose-bilkent" || diagramTypeId === "mindmap")
    && (value !== "tidy-tree" || diagramTypeId === "flowchart" || diagramTypeId === "mindmap")
  ));
}

function readStoredObject(key: string) {
  try {
    const value = localStorage.getItem(key);
    if (!value) return null;
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function writeStoredValue(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* local persistence is best-effort */ }
}

type TourStep = {
  id: string;
  target: string;
  title: string;
  description: string;
};

const TOUR_STEPS: TourStep[] = [
  { id: "type", target: '[data-tour="diagram-type"]', title: "Choose a diagram type", description: "Start from any supported Mermaid diagram and switch types from this compact menu." },
  { id: "views", target: '[data-tour="canvas-views"]', title: "Edit visually or as Mermaid", description: "Use Mermaid for the authoritative render, or switch to the diagram’s visual editing mode." },
  { id: "canvas", target: '[data-tour="canvas-navigation"]', title: "Navigate the canvas", description: "Scroll in two dimensions, use ⌘-scroll to zoom, and fit the entire chart whenever you need it." },
  { id: "tools", target: '[data-tour="canvas-tools"]', title: "Build with canvas tools", description: "Create, select, connect, group, and marquee-select nodes. Keyboard hints appear beside the tools." },
  { id: "inspector", target: '[data-tour="inspector"]', title: "Edit details and style", description: "Properties change content, Appearance changes a selection, and Style controls the whole diagram." },
  { id: "source", target: '[data-tour="file-actions"]', title: "Move Mermaid in and out", description: "Import files, edit exact Mermaid source, and export reusable Mermaid or SVG." },
  { id: "help", target: '[data-tour="help-settings"]', title: "Help is always nearby", description: "Find chart guidance, keyboard shortcuts, theme settings, Mermaid versions, and this tour." },
];

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function clampFitZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_FIT_ZOOM, value));
}

function simpleSourceDiff(before: string, after: string) {
  if (before === after) return "No source changes — this repair changes the Mermaid rendering version.";
  const beforeLines = before.split(/\r?\n/);
  const afterLines = after.split(/\r?\n/);
  const removed = beforeLines.filter((line) => !afterLines.includes(line)).map((line) => `− ${line}`);
  const added = afterLines.filter((line) => !beforeLines.includes(line)).map((line) => `+ ${line}`);
  return [...removed.slice(0, 8), ...added.slice(0, 8)].join("\n") || "Source formatting will be normalised.";
}

function detectMermaidVersion(source: string) {
  const declaredVersion = source.match(/%%\s*mermaid(?:-|\s+)version\s*[:=]\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/i);
  if (declaredVersion?.[1] && Number(declaredVersion[1]) <= 10) {
    return { recommended: "10.9.6" as const, minimum: "10.x", label: "Declared Mermaid 10.x source" };
  }
  if (/@\{\s*[^}]*\bshape\s*:/m.test(source)) {
    return { recommended: LATEST_MERMAID_VERSION, minimum: "11.3.0", label: "Mermaid 11.3+ expanded-shape syntax" };
  }
  const detectedType = detectDiagramType(source);
  return { recommended: LATEST_MERMAID_VERSION, minimum: "10.0.0", label: `${detectedType?.label || "Mermaid"} syntax` };
}

function resolvedMermaidVersion(diagram: Diagram): SupportedMermaidVersion {
  const preference = diagram.mermaidVersion || "auto";
  return preference === "auto" ? (diagram.detectedMermaidVersion || LATEST_MERMAID_VERSION) : preference;
}

type MermaidEngine = typeof import("mermaid").default | typeof import("mermaid-v10").default;

const mermaidFeaturePromises = new WeakMap<object, Map<string, Promise<void>>>();

async function ensureMermaidFeature(mermaid: MermaidEngine, feature: string, setup: () => Promise<void>) {
  let features = mermaidFeaturePromises.get(mermaid);
  if (!features) {
    features = new Map();
    mermaidFeaturePromises.set(mermaid, features);
  }
  let pending = features.get(feature);
  if (!pending) {
    pending = setup();
    features.set(feature, pending);
  }
  try {
    await pending;
  } catch (error) {
    features.delete(feature);
    throw error;
  }
}

async function loadMermaid(version: SupportedMermaidVersion, diagramTypeId?: string, layout?: MermaidLayout) {
  const mermaid = version === "10.9.6" ? (await import("mermaid-v10")).default : (await import("mermaid")).default;
  if (version !== "10.9.6" && (layout === "elk" || layout === "tidy-tree")) {
    await ensureMermaidFeature(mermaid, layout, async () => {
      const definitions = layout === "elk"
        ? (await import("@mermaid-js/layout-elk")).default
        : (await import("@mermaid-js/layout-tidy-tree")).default;
      (mermaid as typeof import("mermaid").default).registerLayoutLoaders(definitions);
    });
  }
  if (diagramTypeId === "zenuml") {
    await ensureMermaidFeature(mermaid, "zenuml", async () => {
      const zenuml = (await import("@mermaid-js/mermaid-zenuml")).default;
      await mermaid.registerExternalDiagrams([zenuml as never]);
    });
  }
  return mermaid;
}

async function renderMermaidSvg(mermaid: Awaited<ReturnType<typeof loadMermaid>>, id: string, source: string, renderProfileClass = "") {
  const renderContainer = document.createElement("div");
  renderContainer.className = renderProfileClass;
  renderContainer.style.cssText = "position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none";
  document.body.appendChild(renderContainer);
  try {
    return await mermaid.render(id, source, renderContainer);
  } finally {
    renderContainer.remove();
  }
}

const initialDiagram: Diagram = {
  name: "Checkout flow",
  direction: "LR",
  mermaidVersion: "auto",
  detectedMermaidVersion: LATEST_MERMAID_VERSION,
  style: DEFAULT_DIAGRAM_STYLE,
  groups: [
    { id: "checkout", label: "Checkout" },
    { id: "fulfilment", label: "Fulfilment" },
  ],
  nodes: [
    { id: "cart", label: "Cart", x: 78, y: 276, width: 126, height: 58, shape: "rounded", color: "#fffdfa", textColor: "#24232a" },
    { id: "details", label: "Customer details", x: 292, y: 182, width: 164, height: 62, shape: "rectangle", color: "#fde8f1", textColor: "#282332", groupId: "checkout" },
    { id: "payment", label: "Payment", x: 292, y: 332, width: 164, height: 62, shape: "rectangle", color: "#e9f2ff", textColor: "#242b36", groupId: "checkout" },
    { id: "approved", label: "Approved?", x: 535, y: 257, width: 110, height: 96, shape: "diamond", color: "#fff1da", textColor: "#332b20" },
    { id: "order", label: "Create order", x: 730, y: 182, width: 160, height: 62, shape: "rectangle", color: "#e6f8f1", textColor: "#1f2e28", groupId: "fulfilment" },
    { id: "email", label: "Send confirmation", x: 730, y: 332, width: 160, height: 62, shape: "rectangle", color: "#e8f8fb", textColor: "#1e2f32", groupId: "fulfilment" },
    { id: "done", label: "Done", x: 976, y: 276, width: 76, height: 76, shape: "circle", color: "#24232a", textColor: "#ffffff" },
  ],
  edges: [
    { id: "e1", from: "cart", to: "details", label: "checkout", style: "solid" },
    { id: "e2", from: "cart", to: "payment", label: "", style: "solid" },
    { id: "e3", from: "details", to: "approved", label: "", style: "solid" },
    { id: "e4", from: "payment", to: "approved", label: "", style: "solid" },
    { id: "e5", from: "approved", to: "order", label: "yes", style: "solid" },
    { id: "e6", from: "approved", to: "payment", label: "no", style: "dashed" },
    { id: "e7", from: "order", to: "email", label: "", style: "solid" },
    { id: "e8", from: "email", to: "done", label: "", style: "solid" },
  ],
};

const clone = (diagram: Diagram): Diagram => JSON.parse(JSON.stringify(diagram));

function safeLabel(label: string) {
  return label.replaceAll('"', "'").replaceAll("\n", " ");
}

function nodeSyntax(node: DiagramNode) {
  const label = safeLabel(node.label);
  if (node.mermaidShape) return `${node.id}@{ shape: ${node.mermaidShape}, label: "${label}" }`;
  switch (node.shape) {
    case "rounded":
      return `${node.id}(["${label}"])`;
    case "diamond":
      return `${node.id}{"${label}"}`;
    case "circle":
      return `${node.id}(("${label}"))`;
    case "hexagon":
      return `${node.id}{{"${label}"}}`;
    case "document":
      return `${node.id}@{ shape: doc, label: "${label}" }`;
    case "framed":
      return `${node.id}@{ shape: fr-rect, label: "${label}" }`;
    default:
      return `${node.id}["${label}"]`;
  }
}

function edgeSyntax(edge: DiagramEdge) {
  const link = edge.arrow === false
    ? (edge.style === "dashed" ? "-.-" : edge.style === "thick" ? "===" : "---")
    : (edge.style === "dashed" ? "-.->" : edge.style === "thick" ? "==>" : "-->");
  const label = edge.label ? `|"${safeLabel(edge.label)}"|` : "";
  return `${edge.from} ${link}${label} ${edge.to}`;
}

function nodeStyleSyntax(node: DiagramNode) {
  return `style ${node.id} fill:${node.color},stroke:#77737f,color:${node.textColor},stroke-width:1.5px`;
}

function toMermaid(diagram: Diagram) {
  const lines = [`flowchart ${diagram.direction}`];
  const grouped = new Set<string>();

  diagram.groups.forEach((group) => {
    const children = diagram.nodes.filter((node) => node.groupId === group.id);
    if (!children.length) return;
    lines.push(`  subgraph ${group.id}["${safeLabel(group.label)}"]`);
    children.forEach((node) => {
      grouped.add(node.id);
      lines.push(`    ${nodeSyntax(node)}`);
    });
    lines.push("  end");
  });

  diagram.nodes.filter((node) => !grouped.has(node.id)).forEach((node) => lines.push(`  ${nodeSyntax(node)}`));
  diagram.edges.forEach((edge) => lines.push(`  ${edgeSyntax(edge)}`));
  diagram.nodes.forEach((node) => lines.push(`  ${nodeStyleSyntax(node)}`));
  return lines.join("\n");
}

function parseMermaid(source: string, previous: Diagram): Diagram | null {
  const lines = source.split("\n").map((line) => line.trim()).filter(Boolean);
  const header = lines.find((line) => /^(flowchart|graph)(?:\s+(LR|RL|TB|TD|BT))?$/.test(line));
  if (!header) return null;

  const sourceDirection = header.match(/\s(LR|RL|TB|TD|BT)$/)?.[1];
  const direction: "LR" | "TB" = sourceDirection === "LR" || sourceDirection === "RL" ? "LR" : "TB";
  const nodes = new Map<string, DiagramNode>();
  const edges: DiagramEdge[] = [];
  const groups: DiagramGroup[] = [];
  const styles = new Map<string, { color: string; textColor: string }>();
  let currentGroup: string | undefined;

  const legacyPatterns: Array<[NodeShape, RegExp]> = [
    ["rounded", /^([A-Za-z_][\w-]*)\(\["?(.*?)"?\]\)$/],
    ["circle", /^([A-Za-z_][\w-]*)\(\("?(.*?)"?\)\)$/],
    ["hexagon", /^([A-Za-z_][\w-]*)\{\{"?(.*?)"?\}\}$/],
    ["diamond", /^([A-Za-z_][\w-]*)\{"?(.*?)"?\}$/],
    ["rectangle", /^([A-Za-z_][\w-]*)\["?(.*?)"?\]$/],
  ];

  const shapeFromMermaid = (shape: string): NodeShape => {
    return visualShapeForMermaid(shape);
  };

  const addNode = (id: string, label = id, shape: NodeShape = "rectangle", explicit = false, mermaidShape?: string) => {
    const estimatedLines = Math.max(1, Math.ceil(label.length / 34));
    const dimensions = shape === "circle"
      ? { width: 88, height: 88 }
      : shape === "diamond"
        ? { width: Math.min(190, Math.max(126, 92 + label.length * 2)), height: Math.min(138, Math.max(102, 70 + estimatedLines * 19)) }
        : { width: Math.min(280, Math.max(150, 92 + Math.min(label.length, 34) * 4.5)), height: Math.min(128, Math.max(62, 32 + estimatedLines * 20)) };
    const existing = nodes.get(id);
    if (existing) {
      if (explicit) nodes.set(id, { ...existing, ...dimensions, label, shape, mermaidShape, groupId: currentGroup ?? existing.groupId });
      return;
    }
    const old = previous.nodes.find((node) => node.id === id);
    nodes.set(id, old ? { ...old, ...dimensions, label, shape, mermaidShape, groupId: currentGroup } : {
      id, label, shape, mermaidShape, groupId: currentGroup,
      x: 0, y: 0,
      ...dimensions,
      color: "#ffffff", textColor: "#24232a",
    });
  };

  const parseNode = (value: string, explicit = true) => {
    const text = value.trim();
    const expanded = text.match(/^([A-Za-z_][\w-]*)@\{\s*(.*?)\s*\}$/);
    if (expanded) {
      const shape = expanded[2].match(/\bshape\s*:\s*["']?([\w-]+)["']?/)?.[1] || "rect";
      const label = expanded[2].match(/\blabel\s*:\s*"((?:\\.|[^"])*)"/)?.[1]?.replaceAll('\\"', '"') || expanded[1];
      addNode(expanded[1], label, shapeFromMermaid(shape), explicit, shape);
      return expanded[1];
    }
    for (const [shape, pattern] of legacyPatterns) {
      const match = text.match(pattern);
      if (match) {
        addNode(match[1], match[2], shape, explicit);
        return match[1];
      }
    }
    const plain = text.match(/^([A-Za-z_][\w-]*)$/);
    if (plain) {
      addNode(plain[1], plain[1], "rectangle", false);
      return plain[1];
    }
    return null;
  };

  const addParsedEdge = (fromExpression: string, connector: string, toExpression: string, label = "") => {
    const from = parseNode(fromExpression);
    const targets = toExpression.split(/\s+&\s+/).map((target) => parseNode(target)).filter((id): id is string => Boolean(id));
    if (!from || !targets.length) return;
    for (const to of targets) {
      edges.push({
        id: `e${edges.length + 1}`,
        from,
        to,
        label,
        style: connector.startsWith("-.") ? "dashed" : connector.startsWith("==") ? "thick" : "solid",
        arrow: connector.includes(">"),
      });
    }
  };

  const parseEdgeLine = (line: string) => {
    const connectorPattern = /(--\s*"([^"]*)"\s*-->|(?:-->|---)\|"?([^|]*?)"?\||-\.->|-\.-|==>|===|-->|---)/g;
    const connectors = [...line.matchAll(connectorPattern)];
    if (!connectors.length) return false;
    const operands: string[] = [];
    let start = 0;
    for (const connector of connectors) {
      operands.push(line.slice(start, connector.index).trim());
      start = (connector.index || 0) + connector[0].length;
    }
    operands.push(line.slice(start).trim());
    if (operands.length !== connectors.length + 1) return false;
    connectors.forEach((connector, index) => addParsedEdge(
      operands[index],
      connector[1],
      operands[index + 1],
      connector[2] || connector[3] || "",
    ));
    return true;
  };

  lines.forEach((line) => {
    if (line === header || line.startsWith("%%") || /^direction\s+(LR|RL|TB|TD|BT)$/.test(line)) return;
    const groupMatch = line.match(/^subgraph\s+([A-Za-z_][\w-]*)\["?(.*?)"?\]$/);
    if (groupMatch) {
      currentGroup = groupMatch[1];
      groups.push({ id: groupMatch[1], label: groupMatch[2] });
      return;
    }
    if (line === "end") {
      currentGroup = undefined;
      return;
    }
    const styleMatch = line.match(/^style\s+([A-Za-z_][\w-]*)\s+fill:(#[\da-fA-F]{6}).*color:(#[\da-fA-F]{6})/);
    if (styleMatch) {
      styles.set(styleMatch[1], { color: styleMatch[2], textColor: styleMatch[3] });
      return;
    }
    if (parseEdgeLine(line)) return;
    parseNode(line);
  });

  if (!nodes.size) return null;
  styles.forEach((style, id) => {
    const node = nodes.get(id);
    if (node) nodes.set(id, { ...node, ...style });
  });
  const parsedNodes = [...nodes.values()];
  const positions = layoutFlowchart(parsedNodes, edges, direction);
  const preserveStoredPositions = previous.source === source && previous.nodes.length > 0;
  return {
    ...previous,
    direction,
    nodes: parsedNodes.map((node) => {
      const stored = preserveStoredPositions ? previous.nodes.find((candidate) => candidate.id === node.id) : undefined;
      return { ...node, ...(stored ? { x: stored.x, y: stored.y } : positions.get(node.id)) };
    }),
    edges,
    groups,
  };
}

function restoreStoredDiagram(value: unknown): Diagram | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const restored = value as Partial<Diagram>;
  if (!Array.isArray(restored.nodes) || !Array.isArray(restored.edges) || !Array.isArray(restored.groups)) return null;
  const diagram = restored as Diagram;
  const restoredFlowchart = diagram.source && detectDiagramType(diagram.source)?.id === "flowchart"
    ? parseMermaid(diagram.source, diagram)
    : null;
  return {
    ...(restoredFlowchart ? { ...restoredFlowchart, source: diagram.source } : diagram),
    name: typeof diagram.name === "string" && diagram.name.trim() ? diagram.name : "Untitled diagram",
    style: { ...DEFAULT_DIAGRAM_STYLE, ...(diagram.style || {}) },
    polishedStyle: normalisePolishedStyle(diagram.polishedStyle),
  };
}

function createBlankDiagram(name = "Untitled diagram"): Diagram {
  return {
    name,
    direction: "LR",
    mermaidVersion: "auto",
    detectedMermaidVersion: LATEST_MERMAID_VERSION,
    style: { ...DEFAULT_DIAGRAM_STYLE },
    polishedStyle: normalisePolishedStyle(DEFAULT_POLISHED_STYLE),
    nodes: [],
    edges: [],
    groups: [],
  };
}

function uniqueLocalDiagramName(name: string, documents: LocalDiagramSummary[]) {
  const existing = new Set(documents.map((document) => document.name.trim().toLocaleLowerCase()));
  if (!existing.has(name.toLocaleLowerCase())) return name;
  let suffix = 2;
  while (existing.has(`${name} ${suffix}`.toLocaleLowerCase())) suffix += 1;
  return `${name} ${suffix}`;
}

function formatLocalDiagramDate(value: number) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function IconButton({ label, shortcut, active, disabled, onClick, children, className = "" }: {
  label: string; shortcut?: string; active?: boolean; disabled?: boolean; onClick?: () => void; children: React.ReactNode; className?: string;
}) {
  return (
    <button className={`icon-button ${active ? "active" : ""} ${className}`} type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      {children}
      {shortcut && <kbd aria-hidden="true">{shortcut}</kbd>}
    </button>
  );
}

export function MermaidEditor() {
  const [diagram, setDiagram] = useState<Diagram>(initialDiagram);
  const [selected, setSelected] = useState<string[]>(["approved"]);
  const [viewMode, setViewMode] = useState<CanvasView>("mermaid");
  const [zoom, setZoom] = useState(0.92);
  const [tool, setTool] = useState<"select" | "connect" | "marquee">("select");
  const [connectionStart, setConnectionStart] = useState<string | null>(null);
  const [tab, setTab] = useState<"properties" | "appearance" | "style">("properties");
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceDraft, setSourceDraft] = useState("");
  const [sourceDirty, setSourceDirty] = useState(false);
  const [sourcePast, setSourcePast] = useState<string[]>([]);
  const [sourceFuture, setSourceFuture] = useState<string[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [unicodeExporting, setUnicodeExporting] = useState(false);
  const [beautifulPreviewMode, setBeautifulPreviewMode] = useState<BeautifulPreviewMode>("diagram");
  const [beautifulTextPreview, setBeautifulTextPreview] = useState("");
  const [beautifulTextHtml, setBeautifulTextHtml] = useState("");
  const [beautifulTextError, setBeautifulTextError] = useState("");
  const [beautifulTextLayoutAdapted, setBeautifulTextLayoutAdapted] = useState(false);
  const [beautifulTextLoading, setBeautifulTextLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [localDiagramMenuOpen, setLocalDiagramMenuOpen] = useState(false);
  const [localDiagramSearch, setLocalDiagramSearch] = useState("");
  const [pendingLocalDeleteId, setPendingLocalDeleteId] = useState<string | null>(null);
  const [localStorageStatus, setLocalStorageStatus] = useState<"saving" | "saved" | "unavailable">("saved");
  const [localDiagramIndex, setLocalDiagramIndex] = useState<LocalDiagramIndex>({ version: 1, activeId: "", documents: [] });
  const [preferences, setPreferences] = useState<EditorPreferences>(DEFAULT_PREFERENCES);
  const [storageReady, setStorageReady] = useState(false);
  const [toast, setToast] = useState("");
  const [editingNode, setEditingNode] = useState<string | null>(null);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editingSourceLine, setEditingSourceLine] = useState<number | null>(null);
  const [editingSourceStatement, setEditingSourceStatement] = useState("");
  const [editingSourceBusy, setEditingSourceBusy] = useState(false);
  const [mermaidSize, setMermaidSize] = useState({ width: 1200, height: 800 });
  const [mermaidRenderRevision, setMermaidRenderRevision] = useState(0);
  const [mermaidRenderError, setMermaidRenderError] = useState("");
  const [polishedSize, setPolishedSize] = useState({ width: 1200, height: 800 });
  const [beautifulTextSize, setBeautifulTextSize] = useState({ width: 240, height: 120 });
  const [polishedRenderRevision, setPolishedRenderRevision] = useState(0);
  const [polishedRenderError, setPolishedRenderError] = useState("");
  const [invalidSource, setInvalidSource] = useState("");
  const [syntaxError, setSyntaxError] = useState("");
  const [repairOpen, setRepairOpen] = useState(false);
  const [repairLoading, setRepairLoading] = useState(false);
  const [repairOptions, setRepairOptions] = useState<RepairProposal[]>([]);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [tourRect, setTourRect] = useState<DOMRect | null>(null);
  const [marquee, setMarquee] = useState<MarqueeSelection | null>(null);
  const history = useRef<Diagram[]>([]);
  const future = useRef<Diagram[]>([]);
  const boardRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mermaidStageRef = useRef<HTMLDivElement>(null);
  const mermaidViewRef = useRef<HTMLDivElement>(null);
  const polishedViewRef = useRef<HTMLDivElement>(null);
  const beautifulTextPreRef = useRef<HTMLPreElement>(null);
  const dragRef = useRef<null | { startX: number; startY: number; nodes: Map<string, { x: number; y: number }> }>(null);
  const marqueeRef = useRef<MarqueeSelection | null>(null);
  const marqueeSurfaceRef = useRef<HTMLDivElement | null>(null);
  const edgeCounter = useRef(initialDiagram.edges.length + 1);
  const mermaidRenderCounter = useRef(0);
  const selectedRef = useRef(selected);
  const shouldFitMermaidRef = useRef(true);
  const shouldFitPolishedRef = useRef(true);
  const shouldFitFreeformRef = useRef(false);
  const pendingViewAnchorRef = useRef<PendingViewAnchor | null>(null);
  const lastEditorViewRef = useRef<Exclude<CanvasView, "polished">>("mermaid");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typeMenuRef = useRef<HTMLDivElement>(null);
  const localDiagramMenuRef = useRef<HTMLDivElement>(null);
  const documentNameRef = useRef<HTMLInputElement>(null);
  const localDiagramIndexRef = useRef<LocalDiagramIndex>({ version: 1, activeId: "", documents: [] });
  const localDiagramCacheRef = useRef(new Map<string, Diagram>());
  const importInputRef = useRef<HTMLInputElement>(null);
  const sourceLastEditAtRef = useRef(0);
  const diagramRef = useRef(diagram);

  const diagramStyle = diagram.style || DEFAULT_DIAGRAM_STYLE;
  const polishedStyle = useMemo(() => normalisePolishedStyle(diagram.polishedStyle), [diagram.polishedStyle]);
  const beautifulWorkspaceStyle = useMemo(() => {
    const palette = polishedStyle.paletteMode === "custom"
      ? polishedStyle.customColours
      : POLISHED_THEME_PREVIEWS[polishedStyle.theme];
    const adaptive = polishedStyle.paletteMode === "theme" && polishedStyle.theme === "mermade-auto";
    const readableForeground = accessiblePolishedTextColour(palette.fg, palette.bg);
    const textRoles = polishedTextRoles(palette);
    return {
      "--beautiful-theme-bg": adaptive ? "var(--mermade-polished-bg)" : palette.bg,
      "--beautiful-theme-fg": adaptive ? "var(--mermade-polished-fg)" : readableForeground,
      "--beautiful-theme-accent": palette.accent,
      "--beautiful-text-secondary": adaptive ? "var(--mermade-polished-fg)" : textRoles.secondary,
      "--beautiful-text-muted": adaptive ? "var(--mermade-polished-fg)" : textRoles.muted,
      "--beautiful-text-faint": adaptive ? "var(--mermade-polished-fg)" : textRoles.faint,
      ...(palette.line ? { "--beautiful-theme-line": palette.line } : {}),
      ...(palette.muted ? { "--beautiful-theme-muted": palette.muted } : {}),
      ...(palette.surface ? { "--beautiful-theme-surface": palette.surface } : {}),
      ...(palette.border ? { "--beautiful-theme-border": palette.border } : {}),
    } as React.CSSProperties;
  }, [polishedStyle]);
  const beautifulTextTheme = useMemo(() => {
    const adaptive = polishedStyle.paletteMode === "theme" && polishedStyle.theme === "mermade-auto";
    if (adaptive) return undefined;
    const palette = polishedStyle.paletteMode === "custom"
      ? polishedStyle.customColours
      : POLISHED_THEME_PREVIEWS[polishedStyle.theme];
    return {
      bg: palette.bg,
      fg: accessiblePolishedTextColour(palette.fg, palette.bg),
      line: palette.line,
      accent: palette.accent,
      border: palette.border,
    };
  }, [polishedStyle]);
  const source = useMemo(() => diagram.source ?? applyDiagramStyle(toMermaid(diagram), diagram.style || DEFAULT_DIAGRAM_STYLE), [diagram]);
  const renderProfileClass = diagram.source && diagram.renderProfile === "dokuwiki" ? "dokuwiki-mermaid" : "";
  const activeDiagramType = useMemo(() => detectDiagramType(source) || MERMAID_DIAGRAM_TYPES[0], [source]);
  const activeHelp = useMemo(() => helpForDiagram(activeDiagramType.id), [activeDiagramType.id]);
  const visualModeName = visualModeLabel(activeDiagramType.family);
  const polishedSupported = supportsPolishedDiagram(activeDiagramType.id);
  const renderedSize = viewMode === "polished"
    ? (beautifulPreviewMode === "diagram" ? polishedSize : beautifulTextSize)
    : mermaidSize;
  const visualEditingHelp = activeDiagramType.family === "freeform"
    ? "FreeForm exposes nodes and relationships spatially. Mermaid view remains available for the exact rendered result and source-level control."
    : activeDiagramType.family === "structured"
      ? "Structured editing preserves the ordered statements and interactions that define this diagram. Mermaid view shows the exact rendered result."
      : "Data editing keeps labels, values, axes, and series explicit while Mermaid view shows the exact rendered result.";
  const nativeFlowchart = activeDiagramType.id === "flowchart" && diagram.nodes.length > 0;
  const filteredLocalDiagrams = useMemo(() => {
    const query = localDiagramSearch.trim().toLocaleLowerCase();
    return query
      ? localDiagramIndex.documents.filter((document) => document.name.toLocaleLowerCase().includes(query))
      : localDiagramIndex.documents;
  }, [localDiagramIndex.documents, localDiagramSearch]);
  const activeLocalDiagram = localDiagramIndex.documents.find((document) => document.id === localDiagramIndex.activeId);
  const localStorageStatusLabel = localStorageStatus === "saving"
    ? "Saving…"
    : localStorageStatus === "unavailable"
      ? "Storage unavailable or full"
      : "Saved locally";
  const activeMermaidVersion = resolvedMermaidVersion(diagram);
  const modernStyleFeatures = activeMermaidVersion !== "10.9.6";
  const availableLayoutOptions = layoutOptionsForDiagram(activeDiagramType.id);
  const layoutSupported = modernStyleFeatures && LAYOUT_CAPABLE_DIAGRAMS.has(activeDiagramType.id);
  const currentLayoutCompatibilityError = useMemo(() => layoutCompatibilityError(
    diagramStyle.layout,
    activeDiagramType.id,
    {
      nodes: diagram.nodes,
      edges: diagram.edges,
      groupCount: diagram.groups.length,
      sourceIsAuthoritative: diagram.source !== undefined,
    },
  ), [activeDiagramType.id, diagram.edges, diagram.groups.length, diagram.nodes, diagram.source, diagramStyle.layout]);
  const sourceVersionDetection = useMemo(() => detectMermaidVersion(sourceDraft), [sourceDraft]);
  const selectedNode = selected.length === 1 ? diagram.nodes.find((node) => node.id === selected[0]) : undefined;
  const selectedEdge = selected.length === 1 ? diagram.edges.find((edge) => edge.id === selected[0]) : undefined;
  const selectedGroup = selected.length === 1 ? diagram.groups.find((group) => group.id === selected[0]) : undefined;
  const selectedSourceLine = sourceLineFromSelection(selected[0]);
  const selectedSourceStatement = selectedSourceLine >= 0 ? source.split(/\r?\n/)[selectedSourceLine] : undefined;
  const statusSource = invalidSource || source;
  const statusDiagramType = detectDiagramType(statusSource) || activeDiagramType;
  const diagramError = syntaxError || mermaidRenderError;
  const nodeById = useMemo(() => new Map(diagram.nodes.map((node) => [node.id, node])), [diagram.nodes]);
  const groupBoundsById = useMemo(() => {
    const extents = new Map<string, { minX: number; minY: number; maxX: number; maxY: number }>();
    for (const node of diagram.nodes) {
      if (!node.groupId) continue;
      const current = extents.get(node.groupId);
      extents.set(node.groupId, current ? {
        minX: Math.min(current.minX, node.x),
        minY: Math.min(current.minY, node.y),
        maxX: Math.max(current.maxX, node.x + node.width),
        maxY: Math.max(current.maxY, node.y + node.height),
      } : { minX: node.x, minY: node.y, maxX: node.x + node.width, maxY: node.y + node.height });
    }
    const bounds = new Map<string, { x: number; y: number; width: number; height: number }>();
    for (const group of diagram.groups) {
      const extent = extents.get(group.id);
      if (!extent) continue;
      const minX = extent.minX - 32;
      const minY = extent.minY - 50;
      const maxX = extent.maxX + 32;
      const maxY = extent.maxY + 32;
      bounds.set(group.id, { x: minX, y: minY, width: maxX - minX, height: maxY - minY });
    }
    return bounds;
  }, [diagram.groups, diagram.nodes]);

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  }, []);

  const replaceLocalDiagramIndex = useCallback((next: LocalDiagramIndex) => {
    localDiagramIndexRef.current = next;
    setLocalDiagramIndex(next);
  }, []);

  const persistLocalDiagram = useCallback((id: string, value: Diagram, makeActive = true) => {
    const currentIndex = localDiagramIndexRef.current;
    const previous = currentIndex.documents.find((document) => document.id === id);
    const now = Date.now();
    const summary: LocalDiagramSummary = {
      id,
      name: value.name.trim() || "Untitled diagram",
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    const nextIndex = updateLocalDiagramIndex(currentIndex, summary, makeActive ? id : currentIndex.activeId);
    localDiagramCacheRef.current.set(id, clone(value));
    const stored = writeLocalDiagramDocument(localStorage, {
      version: 1,
      ...summary,
      diagram: value,
    }) && writeLocalDiagramIndex(localStorage, nextIndex);
    replaceLocalDiagramIndex(nextIndex);
    setLocalStorageStatus(stored ? "saved" : "unavailable");
    return stored;
  }, [replaceLocalDiagramIndex]);

  const resetEditorForLocalDiagram = useCallback((next: Diagram) => {
    history.current = [];
    future.current = [];
    diagramRef.current = next;
    setDiagram(next);
    setSelected(next.nodes[0] ? [next.nodes[0].id] : []);
    edgeCounter.current = Math.max(0, ...next.edges.map((edge) => Number(edge.id.match(/^e(\d+)$/)?.[1]) || 0)) + 1;
    setConnectionStart(null);
    setEditingNode(null);
    setEditingGroup(null);
    setEditingSourceLine(null);
    setSourceOpen(false);
    setSourceDraft("");
    setSourceDirty(false);
    setSourcePast([]);
    setSourceFuture([]);
    setExportOpen(false);
    setInvalidSource("");
    setSyntaxError("");
    setMermaidRenderError("");
    setPolishedRenderError("");
    setRepairOpen(false);
    setRepairOptions([]);
    shouldFitMermaidRef.current = true;
    shouldFitPolishedRef.current = true;
    shouldFitFreeformRef.current = true;
    const targetSource = next.source ?? applyDiagramStyle(toMermaid(next), next.style || DEFAULT_DIAGRAM_STYLE);
    const targetType = detectDiagramType(targetSource);
    if (viewMode === "polished" && targetType && !supportsPolishedDiagram(targetType.id)) {
      setViewMode("mermaid");
      lastEditorViewRef.current = "mermaid";
    }
  }, [viewMode]);

  const activateLocalDiagram = useCallback((id: string, persistCurrent = true) => {
    const currentId = localDiagramIndexRef.current.activeId;
    if (id === currentId) {
      setLocalDiagramMenuOpen(false);
      return;
    }
    if (persistCurrent && currentId) persistLocalDiagram(currentId, diagramRef.current);
    const stored = localDiagramCacheRef.current.get(id)
      ?? readLocalDiagramDocument<Diagram>(localStorage, id)?.diagram;
    const restored = restoreStoredDiagram(stored);
    if (!restored) {
      notify("That local diagram could not be opened");
      return;
    }
    localDiagramCacheRef.current.set(id, clone(restored));
    const nextIndex = { ...localDiagramIndexRef.current, activeId: id };
    const indexStored = writeLocalDiagramIndex(localStorage, nextIndex);
    replaceLocalDiagramIndex(nextIndex);
    if (!indexStored) setLocalStorageStatus("unavailable");
    resetEditorForLocalDiagram(restored);
    setLocalDiagramMenuOpen(false);
    setPendingLocalDeleteId(null);
    notify(`Opened ${restored.name}`);
  }, [notify, persistLocalDiagram, replaceLocalDiagramIndex, resetEditorForLocalDiagram]);

  const createLocalDiagram = useCallback(() => {
    const currentId = localDiagramIndexRef.current.activeId;
    if (currentId) persistLocalDiagram(currentId, diagramRef.current);
    const name = uniqueLocalDiagramName("Untitled diagram", localDiagramIndexRef.current.documents);
    const next = createBlankDiagram(name);
    const id = createLocalDiagramId();
    persistLocalDiagram(id, next);
    resetEditorForLocalDiagram(next);
    setLocalDiagramMenuOpen(false);
    setPendingLocalDeleteId(null);
    notify("Created a new local diagram");
    requestAnimationFrame(() => documentNameRef.current?.select());
  }, [notify, persistLocalDiagram, resetEditorForLocalDiagram]);

  const duplicateLocalDiagram = useCallback(() => {
    const currentId = localDiagramIndexRef.current.activeId;
    if (currentId) persistLocalDiagram(currentId, diagramRef.current);
    const baseName = `${diagramRef.current.name.trim() || "Untitled diagram"} copy`;
    const name = uniqueLocalDiagramName(baseName, localDiagramIndexRef.current.documents);
    const next = { ...clone(diagramRef.current), name };
    const id = createLocalDiagramId();
    persistLocalDiagram(id, next);
    resetEditorForLocalDiagram(next);
    setLocalDiagramMenuOpen(false);
    setPendingLocalDeleteId(null);
    notify("Duplicated the local diagram");
  }, [notify, persistLocalDiagram, resetEditorForLocalDiagram]);

  const renameLocalDiagram = useCallback(() => {
    setLocalDiagramMenuOpen(false);
    setPendingLocalDeleteId(null);
    requestAnimationFrame(() => {
      documentNameRef.current?.focus();
      documentNameRef.current?.select();
    });
  }, []);

  const deleteLocalDiagram = useCallback((id: string) => {
    const currentIndex = localDiagramIndexRef.current;
    const deleted = currentIndex.documents.find((document) => document.id === id);
    const remaining = currentIndex.documents.filter((document) => document.id !== id);
    removeLocalDiagramDocument(localStorage, id);
    localDiagramCacheRef.current.delete(id);

    if (remaining.length) {
      const activeId = id === currentIndex.activeId ? remaining[0].id : currentIndex.activeId;
      const nextIndex: LocalDiagramIndex = { version: 1, activeId, documents: remaining };
      const stored = writeLocalDiagramIndex(localStorage, nextIndex);
      replaceLocalDiagramIndex(nextIndex);
      if (!stored) setLocalStorageStatus("unavailable");
      if (id === currentIndex.activeId) {
        const nextValue = localDiagramCacheRef.current.get(activeId)
          ?? readLocalDiagramDocument<Diagram>(localStorage, activeId)?.diagram;
        const restored = restoreStoredDiagram(nextValue);
        if (restored) resetEditorForLocalDiagram(restored);
      }
    } else {
      replaceLocalDiagramIndex({ version: 1, activeId: "", documents: [] });
      const next = createBlankDiagram();
      persistLocalDiagram(createLocalDiagramId(), next);
      resetEditorForLocalDiagram(next);
    }
    setPendingLocalDeleteId(null);
    setLocalDiagramMenuOpen(false);
    notify(`Deleted ${deleted?.name || "the local diagram"}`);
  }, [notify, persistLocalDiagram, replaceLocalDiagramIndex, resetEditorForLocalDiagram]);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    diagramRef.current = diagram;
  }, [diagram]);

  const restoreViewAnchor = useCallback((targetView: CanvasView) => {
    const pending = pendingViewAnchorRef.current;
    const scroller = scrollRef.current;
    if (!pending || pending.targetView !== targetView || !scroller) return false;
    const root = targetView === "free"
      ? boardRef.current
      : targetView === "polished"
        ? polishedViewRef.current
        : mermaidViewRef.current;
    const element = root?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(pending.nodeId)}"]`);
    if (!element) return false;

    const scrollerRect = scroller.getBoundingClientRect();
    const nodeRect = element.getBoundingClientRect();
    const nodeX = nodeRect.left + nodeRect.width / 2 - scrollerRect.left;
    const nodeY = nodeRect.top + nodeRect.height / 2 - scrollerRect.top;
    scroller.scrollLeft += nodeX - pending.viewportX * scrollerRect.width;
    scroller.scrollTop += nodeY - pending.viewportY * scrollerRect.height;
    pendingViewAnchorRef.current = null;
    return true;
  }, []);

  const checkpoint = useCallback(() => {
    history.current.push(clone(diagram));
    if (history.current.length > 60) history.current.shift();
    future.current = [];
  }, [diagram]);

  const commit = useCallback((update: (current: Diagram) => Diagram) => {
    checkpoint();
    setDiagram((current) => update(current));
  }, [checkpoint]);

  const undo = useCallback(() => {
    const previous = history.current.pop();
    if (!previous) return;
    future.current.push(clone(diagram));
    setDiagram(previous);
  }, [diagram]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    history.current.push(clone(diagram));
    setDiagram(next);
  }, [diagram]);

  useEffect(() => {
    const savedPreferences = readStoredObject("mermade-preferences");
    let showWelcome = true;
    let restored = clone(initialDiagram);
    let index: LocalDiagramIndex;
    let storageAvailable = false;
    try {
      const library = initialiseLocalDiagramLibrary(localStorage, restored, restored.name);
      restored = restoreStoredDiagram(library.document?.diagram) ?? restored;
      index = library.index;
      storageAvailable = library.storageAvailable;
    } catch {
      const now = Date.now();
      const id = createLocalDiagramId(now);
      index = { version: 1, activeId: id, documents: [{ id, name: restored.name, createdAt: now, updatedAt: now }] };
    }
    try { showWelcome = !localStorage.getItem(ONBOARDING_KEY); } catch { /* private browsing can block storage */ }
    queueMicrotask(() => {
      diagramRef.current = restored;
      localDiagramIndexRef.current = index;
      localDiagramCacheRef.current.set(index.activeId, clone(restored));
      setDiagram(restored);
      setSelected(restored.nodes[0] ? [restored.nodes[0].id] : []);
      setLocalDiagramIndex(index);
      setLocalStorageStatus(storageAvailable ? "saved" : "unavailable");
      if (savedPreferences) setPreferences({ ...DEFAULT_PREFERENCES, ...savedPreferences } as EditorPreferences);
      if (showWelcome) setWelcomeOpen(true);
      setStorageReady(true);
    });
  }, []);

  useEffect(() => {
    if (tourStep === null) return;
    const step = TOUR_STEPS[tourStep];
    const target = step ? document.querySelector<HTMLElement>(step.target) : null;
    if (!target) {
      const frame = requestAnimationFrame(() => setTourStep(tourStep < TOUR_STEPS.length - 1 ? tourStep + 1 : null));
      return () => cancelAnimationFrame(frame);
    }
    const update = () => setTourRect(target.getBoundingClientRect());
    update();
    const observer = new ResizeObserver(update);
    observer.observe(target);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [tourStep]);

  useEffect(() => {
    if (!typeMenuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!typeMenuRef.current?.contains(event.target as Node)) setTypeMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setTypeMenuOpen(false);
    };
    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [typeMenuOpen]);

  useEffect(() => {
    if (!localDiagramMenuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!localDiagramMenuRef.current?.contains(event.target as Node)) {
        setLocalDiagramMenuOpen(false);
        setPendingLocalDeleteId(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLocalDiagramMenuOpen(false);
        setPendingLocalDeleteId(null);
      }
    };
    window.addEventListener("pointerdown", closeOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [localDiagramMenuOpen]);

  useEffect(() => {
    const activeId = localDiagramIndexRef.current.activeId;
    if (!storageReady || !activeId) return;
    localDiagramCacheRef.current.set(activeId, clone(diagram));
    setLocalStorageStatus("saving");
    const timer = window.setTimeout(() => persistLocalDiagram(activeId, diagram), 180);
    return () => window.clearTimeout(timer);
  }, [diagram, persistLocalDiagram, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    const flushLocalDiagram = () => {
      const currentIndex = localDiagramIndexRef.current;
      const id = currentIndex.activeId;
      if (!id) return;
      const previous = currentIndex.documents.find((document) => document.id === id);
      const now = Date.now();
      const summary: LocalDiagramSummary = {
        id,
        name: diagramRef.current.name.trim() || "Untitled diagram",
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
      };
      const nextIndex = updateLocalDiagramIndex(currentIndex, summary, id);
      writeLocalDiagramDocument(localStorage, { version: 1, ...summary, diagram: diagramRef.current });
      writeLocalDiagramIndex(localStorage, nextIndex);
    };
    window.addEventListener("pagehide", flushLocalDiagram);
    return () => window.removeEventListener("pagehide", flushLocalDiagram);
  }, [storageReady]);

  useEffect(() => {
    if (storageReady) {
      writeStoredValue("mermade-preferences", JSON.stringify(preferences));
    }
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      root.dataset.theme = preferences.theme === "system" ? (media.matches ? "dark" : "light") : preferences.theme;
    };
    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [preferences, storageReady]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    requestAnimationFrame(() => {
      scroller.scrollLeft = CANVAS_MARGIN * zoom + 10;
      scroller.scrollTop = CANVAS_MARGIN * zoom + 70;
    });
    // The initial view is positioned once; later navigation belongs to the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (dragRef.current) {
        const dx = (event.clientX - dragRef.current.startX) / zoom;
        const dy = (event.clientY - dragRef.current.startY) / zoom;
        setDiagram((current) => ({ ...current, nodes: current.nodes.map((node) => {
          const origin = dragRef.current?.nodes.get(node.id);
          if (!origin) return node;
          const x = Math.max(12, origin.x + dx);
          const y = Math.max(12, origin.y + dy);
          return {
            ...node,
            x: preferences.snapToGrid ? Math.round(x / GRID_SIZE) * GRID_SIZE : x,
            y: preferences.snapToGrid ? Math.round(y / GRID_SIZE) * GRID_SIZE : y,
          };
        }) }));
      }

      if (marqueeRef.current && marqueeSurfaceRef.current) {
        const rect = marqueeSurfaceRef.current.getBoundingClientRect();
        const next = {
          ...marqueeRef.current,
          currentX: (event.clientX - rect.left) / zoom,
          currentY: (event.clientY - rect.top) / zoom,
        };
        marqueeRef.current = next;
        setMarquee(next);
      }
    };
    const onUp = (event: PointerEvent) => {
      dragRef.current = null;
      const selectionSurface = marqueeSurfaceRef.current;
      if (!marqueeRef.current || !selectionSurface) return;

      const surfaceRect = selectionSurface.getBoundingClientRect();
      const finished = {
        ...marqueeRef.current,
        currentX: (event.clientX - surfaceRect.left) / zoom,
        currentY: (event.clientY - surfaceRect.top) / zoom,
      };
      const left = Math.min(finished.startX, finished.currentX);
      const top = Math.min(finished.startY, finished.currentY);
      const right = Math.max(finished.startX, finished.currentX);
      const bottom = Math.max(finished.startY, finished.currentY);
      const hasArea = right - left > 3 && bottom - top > 3;
      let hits: string[] = [];

      if (hasArea && selectionSurface === mermaidStageRef.current) {
        const selectionLeft = surfaceRect.left + left * zoom;
        const selectionTop = surfaceRect.top + top * zoom;
        const selectionRight = surfaceRect.left + right * zoom;
        const selectionBottom = surfaceRect.top + bottom * zoom;
        hits = [...selectionSurface.querySelectorAll<HTMLElement>("[data-node-id]")]
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            return rect.left < selectionRight && rect.right > selectionLeft && rect.top < selectionBottom && rect.bottom > selectionTop;
          })
          .map((element) => element.dataset.nodeId)
          .filter((id): id is string => Boolean(id));
      } else if (hasArea) {
        hits = diagram.nodes.filter((node) => (
          node.x < right && node.x + node.width > left && node.y < bottom && node.y + node.height > top
        )).map((node) => node.id);
      }

      setSelected((current) => finished.additive ? [...new Set([...current, ...hits])] : [...new Set(hits)]);
      marqueeRef.current = null;
      marqueeSurfaceRef.current = null;
      setMarquee(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [diagram.nodes, preferences.snapToGrid, zoom]);

  useEffect(() => {
    if (viewMode !== "mermaid" || !mermaidViewRef.current) return;
    const host = mermaidViewRef.current;
    let cancelled = false;

    const renderDiagram = async () => {
      if (currentLayoutCompatibilityError) {
        host.replaceChildren();
        setMermaidRenderError(currentLayoutCompatibilityError);
        return;
      }
      try {
        const mermaid = await loadMermaid(activeMermaidVersion, activeDiagramType.id, diagramStyle.layout);
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          flowchart: { htmlLabels: true, curve: "basis", useMaxWidth: false },
        });
        const renderId = `mermade-view-${mermaidRenderCounter.current++}`;
        // Use a temporary non-React container. Block Diagram measures live DOM,
        // while its debug serialisation cannot traverse React's circular metadata.
        const { svg } = await renderMermaidSvg(mermaid, renderId, source, renderProfileClass);
        if (cancelled) return;

        host.innerHTML = svg;
        const svgElement = host.querySelector("svg");
        if (svgElement) {
          normalizeRenderedSvg(svgElement, activeDiagramType.id, source);
          decorateRenderedStatements(svgElement, source);
        }
        const viewBox = svgElement?.viewBox.baseVal;
        const width = Math.max(480, Math.ceil(viewBox?.width || 1200));
        const height = Math.max(320, Math.ceil(viewBox?.height || 800));

        const renderedDiagram = diagramRef.current;
        const nodeIds = [...new Set([
          ...renderedDiagram.nodes.map((node) => node.id),
          ...(activeDiagramType.id === "flowchart" ? flowchartNodeIds(source) : []),
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
        host.querySelectorAll<HTMLElement>(".edgePaths path").forEach((element, index) => {
          const edge = renderedDiagram.edges[index];
          if (!edge) return;
          element.dataset.edgeId = edge.id;
          const hitTarget = element.cloneNode(false) as HTMLElement;
          hitTarget.removeAttribute("id");
          hitTarget.dataset.edgeId = edge.id;
          hitTarget.classList.add("mermaid-edge-hit");
          element.parentNode?.insertBefore(hitTarget, element);
        });
        host.querySelectorAll<HTMLElement>(".edgeLabels .edgeLabel").forEach((element, index) => {
          const edge = renderedDiagram.edges[index];
          if (edge) element.dataset.edgeId = edge.id;
        });
        host.querySelectorAll<HTMLElement>("[data-node-id], [data-edge-id], [data-group-id], [data-source-line]").forEach((element) => {
          const id = renderedSelectionId(element, diagramRef.current);
          toggleRenderedSelection(element, Boolean(id && selectedRef.current.includes(id)));
        });

        setMermaidSize({ width, height });
        setMermaidRenderRevision((revision) => revision + 1);
        setMermaidRenderError("");
        if (pendingViewAnchorRef.current?.targetView !== "mermaid" && shouldFitMermaidRef.current && scrollRef.current) {
          shouldFitMermaidRef.current = false;
          const scroller = scrollRef.current;
          const nextZoom = clampFitZoom(Math.min(scroller.clientWidth / (width + 180), scroller.clientHeight / (height + 180), 1.35));
          setZoom(nextZoom);
          requestAnimationFrame(() => {
            scroller.scrollLeft = (CANVAS_MARGIN + width / 2) * nextZoom - scroller.clientWidth / 2;
            scroller.scrollTop = (CANVAS_MARGIN + height / 2) * nextZoom - scroller.clientHeight / 2;
          });
        }
      } catch (error) {
        if (cancelled) return;
        host.replaceChildren();
        setMermaidRenderError(error instanceof Error ? error.message : "Unable to render this Mermaid diagram");
      }
    };

    const timer = window.setTimeout(() => void renderDiagram(), 60);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeDiagramType.id, activeMermaidVersion, currentLayoutCompatibilityError, diagramStyle.layout, renderProfileClass, restoreViewAnchor, source, viewMode]);

  useEffect(() => {
    if (viewMode !== "polished" || beautifulPreviewMode !== "diagram" || !polishedSupported || !polishedViewRef.current) return;
    const host = polishedViewRef.current;
    let cancelled = false;

    const renderDiagram = async () => {
      try {
        const { renderPolishedSvg } = await loadBeautifulWorkspace();
        const svg = await renderPolishedSvg(source, polishedStyle);
        if (cancelled) return;

        host.innerHTML = svg;
        const svgElement = host.querySelector("svg");
        if (svgElement) {
          decorateRenderedStatements(svgElement, source);
          const previewBackground = svgElement.style.getPropertyValue("--bg").trim() || "#fffdfa";
          host.style.backgroundColor = polishedStyle.transparent ? "transparent" : previewBackground;
        }
        const viewBox = svgElement?.viewBox.baseVal;
        const width = Math.max(480, Math.ceil(viewBox?.width || 1200));
        const height = Math.max(320, Math.ceil(viewBox?.height || 800));

        host.querySelectorAll<HTMLElement>(".node[data-id], .class-node[data-id], .entity[data-id], .actor[data-id]").forEach((element) => {
          if (element.dataset.id) element.dataset.nodeId = element.dataset.id;
        });
        host.querySelectorAll<HTMLElement>(".subgraph[data-id]").forEach((element) => {
          if (element.dataset.id) element.dataset.groupId = element.dataset.id;
        });
        host.querySelectorAll<HTMLElement>(".edge").forEach((element, index) => {
          const edge = diagramRef.current.edges[index];
          if (edge) element.dataset.edgeId = edge.id;
        });
        host.querySelectorAll<HTMLElement>("[data-node-id], [data-edge-id], [data-group-id], [data-source-line]").forEach((element) => {
          toggleRenderedSelection(element, false);
        });

        setPolishedSize({ width, height });
        setPolishedRenderRevision((revision) => revision + 1);
        setPolishedRenderError("");
        if (pendingViewAnchorRef.current?.targetView !== "polished" && shouldFitPolishedRef.current && scrollRef.current) {
          shouldFitPolishedRef.current = false;
          const scroller = scrollRef.current;
          const nextZoom = clampFitZoom(Math.min(scroller.clientWidth / (width + 180), scroller.clientHeight / (height + 180), 1.35));
          setZoom(nextZoom);
          requestAnimationFrame(() => {
            scroller.scrollLeft = (CANVAS_MARGIN + width / 2) * nextZoom - scroller.clientWidth / 2;
            scroller.scrollTop = (CANVAS_MARGIN + height / 2) * nextZoom - scroller.clientHeight / 2;
          });
        }
      } catch (error) {
        if (cancelled) return;
        host.replaceChildren();
        host.style.removeProperty("background-color");
        setPolishedRenderError(error instanceof Error ? error.message : "Unable to render this diagram in the Beautiful workspace");
      }
    };

    const timer = window.setTimeout(() => void renderDiagram(), 60);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [beautifulPreviewMode, polishedStyle, polishedSupported, source, viewMode]);

  useEffect(() => {
    if (viewMode !== "polished" || (beautifulPreviewMode !== "unicode" && beautifulPreviewMode !== "ascii")) return;
    let cancelled = false;
    const loadingFrame = requestAnimationFrame(() => {
      if (!cancelled) setBeautifulTextLoading(true);
    });
    void renderTextDiagram(source, beautifulPreviewMode, 20_000, beautifulTextTheme).then((result) => {
      if (cancelled) return;
      setBeautifulTextError(result.error || "");
      setBeautifulTextPreview(result.error ? "" : result.content);
      setBeautifulTextHtml(result.error ? "" : (result.html || ""));
      setBeautifulTextLayoutAdapted(Boolean(result.layoutAdapted));
    }).finally(() => {
      if (!cancelled) setBeautifulTextLoading(false);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(loadingFrame);
    };
  }, [beautifulPreviewMode, beautifulTextTheme, source, viewMode]);

  useLayoutEffect(() => {
    if (viewMode !== "polished" || beautifulPreviewMode === "diagram" || beautifulTextLoading || beautifulTextError || !beautifulTextPreview) return;
    const frame = requestAnimationFrame(() => {
      const preview = beautifulTextPreRef.current;
      if (!preview) return;
      const next = {
        width: Math.max(1, Math.ceil(preview.scrollWidth)),
        height: Math.max(1, Math.ceil(preview.scrollHeight)),
      };
      setBeautifulTextSize((current) => current.width === next.width && current.height === next.height ? current : next);
    });
    return () => cancelAnimationFrame(frame);
  }, [beautifulPreviewMode, beautifulTextError, beautifulTextLoading, beautifulTextPreview, beautifulTextHtml, viewMode]);

  useLayoutEffect(() => {
    if (!mermaidRenderRevision || viewMode !== "mermaid" || pendingViewAnchorRef.current?.targetView !== "mermaid") return;
    const frame = requestAnimationFrame(() => restoreViewAnchor("mermaid"));
    return () => cancelAnimationFrame(frame);
  }, [mermaidRenderRevision, restoreViewAnchor, viewMode]);

  useLayoutEffect(() => {
    if (!polishedRenderRevision || viewMode !== "polished" || pendingViewAnchorRef.current?.targetView !== "polished") return;
    const frame = requestAnimationFrame(() => restoreViewAnchor("polished"));
    return () => cancelAnimationFrame(frame);
  }, [polishedRenderRevision, restoreViewAnchor, viewMode]);

  useEffect(() => {
    if (viewMode !== "mermaid") return;
    const host = mermaidViewRef.current;
    if (!host) return;
    host.querySelectorAll<HTMLElement>("[data-node-id], [data-edge-id], [data-group-id], [data-source-line]").forEach((element) => {
      const id = renderedSelectionId(element, diagramRef.current);
      toggleRenderedSelection(element, Boolean(id && selected.includes(id)));
    });
  }, [mermaidSize, polishedSize, selected, viewMode]);

  useEffect(() => {
    if (viewMode !== "free" || pendingViewAnchorRef.current?.targetView !== "free") return;
    const frame = requestAnimationFrame(() => restoreViewAnchor("free"));
    return () => cancelAnimationFrame(frame);
  }, [diagram.nodes, restoreViewAnchor, viewMode]);

  useEffect(() => {
    if (!shouldFitFreeformRef.current || viewMode !== "free" || !nativeFlowchart || !diagram.nodes.length || !scrollRef.current) return;
    shouldFitFreeformRef.current = false;
    const scroller = scrollRef.current;
    const minX = Math.min(...diagram.nodes.map((node) => node.x)) - 90;
    const minY = Math.min(...diagram.nodes.map((node) => node.y)) - 90;
    const maxX = Math.max(...diagram.nodes.map((node) => node.x + node.width)) + 90;
    const maxY = Math.max(...diagram.nodes.map((node) => node.y + node.height)) + 90;
    const nextZoom = clampZoom(Math.min(scroller.clientWidth / (maxX - minX), scroller.clientHeight / (maxY - minY), 1.2));
    setZoom(nextZoom);
    requestAnimationFrame(() => {
      scroller.scrollLeft = (CANVAS_MARGIN + (minX + maxX) / 2) * nextZoom - scroller.clientWidth / 2;
      scroller.scrollTop = (CANVAS_MARGIN + (minY + maxY) / 2) * nextZoom - scroller.clientHeight / 2;
    });
  }, [diagram.nodes, nativeFlowchart, viewMode]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    const onWheel = (event: WheelEvent) => {
      if (!event.metaKey && !event.ctrlKey) return;
      event.preventDefault();

      const rect = scroller.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;
      const boardX = (scroller.scrollLeft + pointerX) / zoom;
      const boardY = (scroller.scrollTop + pointerY) / zoom;
      const delta = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 18 : event.deltaY;
      const nextZoom = clampZoom(zoom * Math.exp(-delta * 0.002));

      if (Math.abs(nextZoom - zoom) < 0.001) return;
      setZoom(nextZoom);
      requestAnimationFrame(() => {
        scroller.scrollLeft = boardX * nextZoom - pointerX;
        scroller.scrollTop = boardY * nextZoom - pointerY;
      });
    };

    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", onWheel);
  }, [zoom]);

  const updateNode = (id: string, patch: Partial<DiagramNode>, save = true) => {
    const apply = (current: Diagram) => {
      const nodes = current.nodes.map((node) => node.id === id ? { ...node, ...patch } : node);
      const updated = nodes.find((node) => node.id === id);
      return {
        ...current,
        nodes,
        source: current.source && updated
          ? updateFlowchartNodeStatement(current.source, id, nodeSyntax(updated), nodeStyleSyntax(updated))
          : current.source,
      };
    };
    if (save) commit(apply); else setDiagram(apply);
  };

  const updateEdge = (id: string, patch: Partial<DiagramEdge>, save = true) => {
    const apply = (current: Diagram) => {
      const previous = current.edges.find((edge) => edge.id === id);
      const edges = current.edges.map((edge) => edge.id === id ? { ...edge, ...patch } : edge);
      const updated = edges.find((edge) => edge.id === id);
      return {
        ...current,
        edges,
        source: current.source && previous && updated
          ? updateFlowchartEdgeStatement(current.source, previous.from, previous.to, edgeSyntax(updated))
          : current.source,
      };
    };
    if (save) commit(apply); else setDiagram(apply);
  };

  const updateGroup = (id: string, label: string, save = true) => {
    const apply = (current: Diagram) => ({
      ...current,
      groups: current.groups.map((group) => group.id === id ? { ...group, label } : group),
      source: current.source ? updateFlowchartSubgraphStatement(current.source, id, label) : current.source,
    });
    if (save) commit(apply); else setDiagram(apply);
  };

  const addNode = (shape: NodeShape = "rectangle", connectFromSelection = false, connectedShortcut = "Shift+N") => {
    const origin = connectFromSelection && selected.length === 1
      ? diagram.nodes.find((node) => node.id === selected[0])
      : undefined;
    if (connectFromSelection && !origin) {
      notify(`Select one node before using ${connectedShortcut}`);
      return;
    }

    const idBase = "node";
    let count = diagram.nodes.length + 1;
    while (diagram.nodes.some((node) => node.id === `${idBase}${count}`)) count += 1;
    const id = `${idBase}${count}`;
    const node: DiagramNode = {
      id,
      label: "New step",
      x: origin ? origin.x + (diagram.direction === "LR" ? origin.width + 120 : 0) : 455 + Math.random() * 80,
      y: origin ? origin.y + (diagram.direction === "TB" ? origin.height + 100 : 0) : 420 + Math.random() * 40,
      width: 150,
      height: 62,
      shape,
      color: "#ffffff",
      textColor: "#24232a",
    };
    const edge: DiagramEdge | undefined = origin
      ? { id: `e${edgeCounter.current++}`, from: origin.id, to: id, label: "", style: "solid" }
      : undefined;
    commit((current) => ({
      ...current,
      nodes: [...current.nodes, node],
      edges: edge ? [...current.edges, edge] : current.edges,
      source: current.source
        ? appendFlowchartStatements(current.source, [nodeSyntax(node), nodeStyleSyntax(node), ...(edge ? [edgeSyntax(edge)] : [])])
        : current.source,
    }));
    setSelected([id]);
    setEditingNode(id);
    if (edge) notify("Connected step created");
  };

  const deleteSelected = async () => {
    if (!selected.length) return;
    const ids = new Set(selected);
    const selectedEdges = diagram.edges.filter((edge) => ids.has(edge.id));
    const subgraphIds = diagram.groups.filter((group) => ids.has(group.id)).map((group) => group.id);
    const edgeIds = new Set(selectedEdges.map((edge) => edge.id));
    const groupIds = new Set(subgraphIds);
    const sourceNodeIds = diagram.source && activeDiagramType.id === "flowchart"
      ? flowchartNodeIds(diagram.source)
      : new Set<string>();
    const nodeIds = [...new Set([
      ...diagram.nodes.filter((node) => ids.has(node.id)).map((node) => node.id),
      ...selected.filter((id) => !id.startsWith(SOURCE_LINE_SELECTION_PREFIX)
        && !edgeIds.has(id)
        && !groupIds.has(id)
        && sourceNodeIds.has(id)),
    ])];
    const sourceLines = selected.map(sourceLineFromSelection).filter((line) => line >= 0);
    let candidate = diagram.source;
    if (candidate !== undefined && sourceLines.length) {
      const removedLines = new Set(sourceLines);
      candidate = candidate.split(/\r?\n/).filter((_, index) => !removedLines.has(index)).join("\n");
    }
    if (candidate !== undefined) {
      candidate = removeFlowchartItems(candidate, { nodeIds, edges: selectedEdges, subgraphIds });
      const error = await validateSource(candidate, activeMermaidVersion);
      if (error) {
        notify(`Mermaid could not safely delete that selection: ${error}`);
        return;
      }
    }

    commit((current) => ({
      ...current,
      edges: current.edges.filter((edge) => !ids.has(edge.id) && !ids.has(edge.from) && !ids.has(edge.to)),
      groups: current.groups.filter((group) => !ids.has(group.id)),
      source: candidate,
      nodes: current.nodes
        .filter((node) => !ids.has(node.id))
        .map((node) => node.groupId && ids.has(node.groupId) ? { ...node, groupId: undefined } : node),
    }));
    setSelected([]);
    notify("Selection deleted from the canvas and Mermaid source");
  };

  const groupSelected = () => {
    const nodeIds = selected.filter((id) => diagram.nodes.some((node) => node.id === id));
    if (nodeIds.length < 2) {
      notify("Select two or more nodes to create a subgraph");
      return;
    }
    const id = `group${diagram.groups.length + 1}`;
    commit((current) => ({
      ...current,
      groups: [...current.groups, { id, label: "New subgraph" }],
      nodes: current.nodes.map((node) => nodeIds.includes(node.id) ? { ...node, groupId: id } : node),
      source: current.source ? appendFlowchartSubgraph(current.source, id, "New subgraph", nodeIds) : current.source,
    }));
    setSelected([id]);
    notify("Subgraph created");
  };

  const openSourceEditor = (candidate = source, dirty = false) => {
    setSourceDraft(candidate);
    setSourceDirty(dirty);
    setSourcePast([]);
    setSourceFuture([]);
    sourceLastEditAtRef.current = 0;
    setSourceOpen(true);
  };

  const changeSourceDraft = (next: string) => {
    const now = Date.now();
    if (sourceLastEditAtRef.current === 0 || now - sourceLastEditAtRef.current > 900) {
      setSourcePast((current) => [...current.slice(-79), sourceDraft]);
    }
    sourceLastEditAtRef.current = now;
    setSourceFuture([]);
    setSourceDraft(next);
    setSourceDirty(next !== source);
  };

  const undoSourceDraft = () => {
    const previous = sourcePast.at(-1);
    if (previous === undefined) return;
    setSourcePast((current) => current.slice(0, -1));
    setSourceFuture((current) => [sourceDraft, ...current].slice(0, 80));
    setSourceDraft(previous);
    setSourceDirty(previous !== source);
    sourceLastEditAtRef.current = 0;
  };

  const redoSourceDraft = () => {
    const next = sourceFuture[0];
    if (next === undefined) return;
    setSourceFuture((current) => current.slice(1));
    setSourcePast((current) => [...current.slice(-79), sourceDraft]);
    setSourceDraft(next);
    setSourceDirty(next !== source);
    sourceLastEditAtRef.current = 0;
  };

  const organizeFlowchart = () => {
    if (!nativeFlowchart || !diagram.nodes.length) return;
    const positions = layoutFlowchart(diagram.nodes, diagram.edges, diagram.direction);
    shouldFitFreeformRef.current = true;
    commit((current) => ({
      ...current,
      nodes: current.nodes.map((node) => ({ ...node, ...positions.get(node.id) })),
    }));
    notify("Flowchart organised from its relationships");
  };

  const fitView = () => {
    const scroller = scrollRef.current;
    if (!scroller || (viewMode === "free" && !diagram.nodes.length)) {
      setZoom(1);
      return;
    }

    if (viewMode !== "free") {
      const nextZoom = clampFitZoom(Math.min(scroller.clientWidth / (renderedSize.width + 180), scroller.clientHeight / (renderedSize.height + 180), 1.35));
      setZoom(nextZoom);
      requestAnimationFrame(() => {
        scroller.scrollLeft = (CANVAS_MARGIN + renderedSize.width / 2) * nextZoom - scroller.clientWidth / 2;
        scroller.scrollTop = (CANVAS_MARGIN + renderedSize.height / 2) * nextZoom - scroller.clientHeight / 2;
      });
      return;
    }

    const minX = Math.min(...diagram.nodes.map((node) => node.x)) - 90;
    const minY = Math.min(...diagram.nodes.map((node) => node.y)) - 90;
    const maxX = Math.max(...diagram.nodes.map((node) => node.x + node.width)) + 90;
    const maxY = Math.max(...diagram.nodes.map((node) => node.y + node.height)) + 90;
    const nextZoom = clampZoom(Math.min(scroller.clientWidth / (maxX - minX), scroller.clientHeight / (maxY - minY), 1.35));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    setZoom(nextZoom);
    requestAnimationFrame(() => {
      scroller.scrollLeft = (CANVAS_MARGIN + centerX) * nextZoom - scroller.clientWidth / 2;
      scroller.scrollTop = (CANVAS_MARGIN + centerY) * nextZoom - scroller.clientHeight / 2;
    });
  };

  const fillView = () => {
    const scroller = scrollRef.current;
    if (!scroller || (viewMode === "free" && !diagram.nodes.length)) {
      setZoom(1);
      return;
    }

    if (viewMode !== "free") {
      const nextZoom = clampFitZoom(Math.min(scroller.clientWidth / (renderedSize.width + 120), MAX_ZOOM));
      setZoom(nextZoom);
      requestAnimationFrame(() => {
        scroller.scrollLeft = (CANVAS_MARGIN + renderedSize.width / 2) * nextZoom - scroller.clientWidth / 2;
        scroller.scrollTop = (CANVAS_MARGIN + renderedSize.height / 2) * nextZoom - scroller.clientHeight / 2;
      });
      return;
    }

    const minX = Math.min(...diagram.nodes.map((node) => node.x)) - 60;
    const minY = Math.min(...diagram.nodes.map((node) => node.y)) - 60;
    const maxX = Math.max(...diagram.nodes.map((node) => node.x + node.width)) + 60;
    const maxY = Math.max(...diagram.nodes.map((node) => node.y + node.height)) + 60;
    const nextZoom = clampFitZoom(Math.min(scroller.clientWidth / (maxX - minX), MAX_ZOOM));

    setZoom(nextZoom);
    requestAnimationFrame(() => {
      scroller.scrollLeft = (CANVAS_MARGIN + (minX + maxX) / 2) * nextZoom - scroller.clientWidth / 2;
      scroller.scrollTop = (CANVAS_MARGIN + (minY + maxY) / 2) * nextZoom - scroller.clientHeight / 2;
    });
  };

  useEffect(() => {
    if (viewMode !== "polished" || beautifulPreviewMode === "diagram") return;
    if (beautifulTextLoading || beautifulTextError || !beautifulTextPreview) return;
    let centreFrame = 0;
    const zoomFrame = requestAnimationFrame(() => {
      setZoom(1);
      centreFrame = requestAnimationFrame(() => {
        const scroller = scrollRef.current;
        if (!scroller) return;
        scroller.scrollLeft = Math.max(0, CANVAS_MARGIN + beautifulTextSize.width / 2 - scroller.clientWidth / 2);
        scroller.scrollTop = Math.max(0, CANVAS_MARGIN + beautifulTextSize.height / 2 - scroller.clientHeight / 2);
      });
    });
    return () => {
      cancelAnimationFrame(zoomFrame);
      cancelAnimationFrame(centreFrame);
    };
  }, [beautifulPreviewMode, beautifulTextError, beautifulTextLoading, beautifulTextPreview, beautifulTextSize, viewMode]);

  const editSelectedText = () => {
    if (selected.length !== 1) {
      notify("Select one node to edit its text");
      return;
    }
    const node = diagram.nodes.find((candidate) => candidate.id === selected[0]);
    if (node) {
      setEditingGroup(null);
      setEditingSourceLine(null);
      setEditingNode(node.id);
      return;
    }
    if (viewMode !== "free" && selectedSourceStatement !== undefined) {
      setEditingNode(null);
      setEditingGroup(null);
      setEditingSourceLine(selectedSourceLine);
      setEditingSourceStatement(selectedSourceStatement);
      return;
    }
    notify("Select one node to edit its text");
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const editing = target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
      const key = event.key.toLowerCase();

      if (sourceOpen && target.closest(".source-panel") && (event.metaKey || event.ctrlKey) && (key === "z" || key === "y")) {
        event.preventDefault();
        if (key === "y" || event.shiftKey) redoSourceDraft(); else undoSourceDraft();
        return;
      }
      if (!editing && (event.metaKey || event.ctrlKey) && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
        return;
      }
      if (event.key === "Escape") {
        marqueeRef.current = null;
        marqueeSurfaceRef.current = null;
        setMarquee(null);
        setSettingsOpen(false);
        setShortcutsOpen(false);
        setHelpOpen(false);
        setRepairOpen(false);
        setTourStep(null);
        if (welcomeOpen) {
          writeStoredValue(ONBOARDING_KEY, "complete");
          setWelcomeOpen(false);
        }
        setEditingNode(null);
        setEditingGroup(null);
        setEditingSourceLine(null);
        setConnectionStart(null);
        setTool("select");
        return;
      }
      if (editing || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;

      if (key === "1" || key === "2" || key === "3") {
        event.preventDefault();
        if (key === "3") switchWorkspace("beautiful");
        else switchCanvasView(key === "1" ? "free" : "mermaid");
        return;
      }

      if (viewMode === "polished" && (key === "e" || ["n", "v", "l", "s", "d", "m"].includes(key)
        || event.key === "Backspace" || event.key === "Delete")) {
        event.preventDefault();
        notify("Return to the Editor workspace to change diagram structure");
        return;
      }

      if (key === "e") {
        event.preventDefault();
        editSelectedText();
        return;
      }

      if (!nativeFlowchart && ["n", "v", "l", "s", "d", "m"].includes(key)) {
        event.preventDefault();
        notify(`${visualModeName} diagrams use diagram-specific statement controls`);
        return;
      }

      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        void deleteSelected();
      } else if (key === "n") {
        event.preventDefault();
        addNode("rectangle", event.shiftKey);
      } else if (key === "v") {
        event.preventDefault();
        setTool("select");
        setConnectionStart(null);
      } else if (key === "l") {
        event.preventDefault();
        setTool("connect");
        setConnectionStart(null);
        notify("Choose the first node");
      } else if (key === "s") {
        event.preventDefault();
        groupSelected();
      } else if (key === "d") {
        event.preventDefault();
        addNode("diamond", event.shiftKey, "Shift+D");
      } else if (key === "m") {
        event.preventDefault();
        setTool("marquee");
        setConnectionStart(null);
        notify("Drag across the canvas to select nodes");
      } else if (key === "f") {
        event.preventDefault();
        if (event.shiftKey) fillView(); else fitView();
      } else if (key === "o") {
        event.preventDefault();
        if (nativeFlowchart) organizeFlowchart();
        else notify("Organise Chart is currently available for flowcharts");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const ungroupSelected = () => {
    const groupIds = new Set(selected);
    commit((current) => ({
      ...current,
      nodes: current.nodes.map((node) => node.groupId && groupIds.has(node.groupId) ? { ...node, groupId: undefined } : node),
      groups: current.groups.filter((group) => !groupIds.has(group.id)),
      source: current.source ? removeFlowchartItems(current.source, { subgraphIds: groupIds }) : current.source,
    }));
    setSelected([]);
  };

  const beginCanvasPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!nativeFlowchart || event.button !== 0 || tool === "connect") return;
    if (viewMode !== "free" && tool !== "marquee") return;
    const selectionSurface = viewMode !== "free" ? mermaidStageRef.current : boardRef.current;
    if (!selectionSurface) return;
    if (tool === "marquee") event.preventDefault();
    const rect = selectionSurface.getBoundingClientRect();
    const startX = (event.clientX - rect.left) / zoom;
    const startY = (event.clientY - rect.top) / zoom;
    const next: MarqueeSelection = { startX, startY, currentX: startX, currentY: startY, additive: event.shiftKey };

    setEditingNode(null);
    setEditingGroup(null);
    if (!event.shiftKey) setSelected([]);
    marqueeRef.current = next;
    marqueeSurfaceRef.current = selectionSurface;
    setMarquee(next);
  };

  const beginDrag = (event: ReactPointerEvent, id: string) => {
    if (tool !== "select") return;
    event.stopPropagation();
    const nextSelection = event.shiftKey ? (selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]) : (selected.includes(id) ? selected : [id]);
    setSelected(nextSelection);
    checkpoint();
    const movingIds = nextSelection.includes(id) ? nextSelection : [id];
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      nodes: new Map(diagram.nodes.filter((node) => movingIds.includes(node.id)).map((node) => [node.id, { x: node.x, y: node.y }])),
    };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const connectNode = (id: string) => {
    if (!connectionStart) {
      setConnectionStart(id);
      notify("Choose the destination node");
    } else if (connectionStart !== id) {
      const newEdge: DiagramEdge = { id: `e${edgeCounter.current++}`, from: connectionStart, to: id, label: "", style: "solid" };
      commit((current) => ({
        ...current,
        edges: [...current.edges, newEdge],
        source: current.source ? appendFlowchartStatements(current.source, [edgeSyntax(newEdge)]) : current.source,
      }));
      setConnectionStart(null);
      setTool("select");
      setSelected([newEdge.id]);
      notify("Relationship created");
    }
  };

  const selectNode = (event: ReactPointerEvent, id: string) => {
    if (tool === "connect") {
      event.stopPropagation();
      connectNode(id);
    }
  };

  const clickNode = (event: React.MouseEvent<HTMLDivElement>, id: string) => {
    if (tool !== "select") return;
    event.stopPropagation();
    if (!selected.includes(id)) {
      setSelected(event.shiftKey ? [...selected, id] : [id]);
    }
  };

  const selectMermaidElement = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (tool === "marquee" && nativeFlowchart) return;
    const element = renderedInteractionElement(event.target as Element, diagram);
    if (!element) {
      setSelected([]);
      setEditingNode(null);
      setEditingGroup(null);
      setEditingSourceLine(null);
      return;
    }
    event.stopPropagation();
    const nodeId = element.dataset.nodeId;
    if (tool === "connect" && nodeId && diagram.nodes.some((node) => node.id === nodeId)) {
      connectNode(nodeId);
      return;
    }
    const id = renderedSelectionId(element, diagram);
    if (!id) return;
    setSelected(event.shiftKey ? (selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]) : [id]);
  };

  const editMermaidElement = (event: React.MouseEvent<HTMLDivElement>) => {
    const element = renderedInteractionElement(event.target as Element, diagram);
    if (!element) {
      event.stopPropagation();
      openSourceEditor();
      return;
    }
    const nodeId = element?.dataset.nodeId;
    const groupId = element?.dataset.groupId;
    const sourceLine = Number(element?.dataset.sourceLine);
    const modelNode = nodeId ? diagram.nodes.find((node) => node.id === nodeId) : undefined;
    const modelGroup = groupId ? diagram.groups.find((group) => group.id === groupId) : undefined;
    if (!modelNode && !modelGroup && (element.dataset.sourceLine === undefined || !Number.isInteger(sourceLine))) {
      event.stopPropagation();
      openSourceEditor();
      return;
    }
    event.stopPropagation();
    if (modelNode) {
      setSelected([modelNode.id]);
      setEditingNode(modelNode.id);
      setEditingGroup(null);
      setEditingSourceLine(null);
    } else if (modelGroup) {
      setSelected([modelGroup.id]);
      setEditingGroup(modelGroup.id);
      setEditingNode(null);
      setEditingSourceLine(null);
    } else {
      const statement = source.split(/\r?\n/)[sourceLine];
      if (statement === undefined) return;
      setSelected([sourceLineSelection(sourceLine)]);
      setEditingNode(null);
      setEditingGroup(null);
      setEditingSourceLine(sourceLine);
      setEditingSourceStatement(statement);
    }
  };

  const edgePath = (edge: DiagramEdge) => {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to) return null;
    const x1 = from.x + from.width / 2;
    const y1 = from.y + from.height / 2;
    const x2 = to.x + to.width / 2;
    const y2 = to.y + to.height / 2;
    const dx = Math.abs(x2 - x1);
    const curve = Math.max(38, dx * 0.42);
    return { d: `M ${x1} ${y1} C ${x1 + (x2 >= x1 ? curve : -curve)} ${y1}, ${x2 - (x2 >= x1 ? curve : -curve)} ${y2}, ${x2} ${y2}`, x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
  };

  const copySource = async () => {
    try {
      await navigator.clipboard.writeText(source);
      notify("Mermaid source copied");
      setExportOpen(false);
    } catch {
      notify("The browser could not copy the Mermaid source");
    }
  };

  const copySourceDraft = async () => {
    try {
      await navigator.clipboard.writeText(sourceDraft);
      notify("Source copied");
    } catch {
      notify("The browser could not copy the Mermaid source");
    }
  };

  const download = (content: string, filename: string, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  const exportSvg = async () => {
    try {
      const mermaid = await loadMermaid(activeMermaidVersion, activeDiagramType.id, diagramStyle.layout);
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", flowchart: { htmlLabels: true, curve: "basis" } });
      const { svg } = await renderMermaidSvg(mermaid, `mermade-${Date.now()}`, source, renderProfileClass);
      download(normalizeSvgMarkup(svg, activeDiagramType.id, source), `${diagram.name.toLowerCase().replace(/\W+/g, "-")}.svg`, "image/svg+xml");
      setExportOpen(false);
      notify("SVG exported");
    } catch (error) {
      notify(error instanceof Error ? `SVG export failed: ${error.message}` : "SVG export failed");
    }
  };

  const exportPolishedSvg = async () => {
    if (!polishedSupported) return;
    try {
      const { renderPolishedSvg } = await loadBeautifulWorkspace();
      const svg = await renderPolishedSvg(source, polishedStyle);
      download(svg, `${diagram.name.toLowerCase().replace(/\W+/g, "-")}-beautiful.svg`, "image/svg+xml");
      setExportOpen(false);
      notify("Beautiful SVG exported");
    } catch (error) {
      notify(error instanceof Error ? `Beautiful export failed: ${error.message}` : "Beautiful export failed");
    }
  };

  const exportPolishedText = async (format: TextDiagramFormat = "unicode") => {
    if (!polishedSupported || unicodeExporting) return;
    setUnicodeExporting(true);
    try {
      const result = await renderTextDiagram(source, format);
      if (result.error) throw new Error(result.error);
      download(`\uFEFF${result.content}`, `${diagram.name.toLowerCase().replace(/\W+/g, "-")}-${format}.txt`, "text/plain;charset=utf-8");
      setExportOpen(false);
      notify(result.layoutAdapted ? `${format.toUpperCase()} diagram exported with a wide text layout` : `${format.toUpperCase()} diagram exported`);
    } catch (error) {
      notify(error instanceof Error ? `${format.toUpperCase()} export failed: ${error.message}` : `${format.toUpperCase()} export failed`);
    } finally {
      setUnicodeExporting(false);
    }
  };

  const copyBeautifulPreview = async () => {
    if (!beautifulTextPreview || beautifulTextError) return;
    try {
      await navigator.clipboard.writeText(beautifulTextPreview);
      notify(`${beautifulPreviewMode.toUpperCase()} copied`);
    } catch {
      notify("The browser could not copy this text preview");
    }
  };

  const downloadBeautifulPreview = () => {
    if (!beautifulTextPreview || beautifulTextError) return;
    download(`\uFEFF${beautifulTextPreview}`, `${diagram.name.toLowerCase().replace(/\W+/g, "-")}-${beautifulPreviewMode}.txt`, "text/plain;charset=utf-8");
    notify(`${beautifulPreviewMode.toUpperCase()} downloaded`);
  };

  async function validateSource(candidate: string, version: SupportedMermaidVersion) {
    try {
      const candidateType = detectDiagramType(candidate);
      const candidateStyle = readDiagramStyle(candidate);
      const mermaid = await loadMermaid(version, candidateType?.id, candidateStyle.layout);
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
      await mermaid.parse(candidate);
      return "";
    } catch (error) {
      return error instanceof Error ? error.message : "Mermaid rejected this source";
    }
  }

  const validateAndCommitSource = async (candidate: string, versionOverride?: SupportedMermaidVersion) => {
    const detection = detectMermaidVersion(candidate);
    const versionPreference = versionOverride || diagram.mermaidVersion || "auto";
    if (versionPreference === "10.9.6" && detection.minimum === "11.3.0") {
      return { ok: false, error: "This source requires Mermaid 11.3+; choose Auto-detect or 11.16.0 in Settings" };
    }

    const detectedType = detectDiagramType(candidate);
    if (!detectedType) return { ok: false, error: "This Mermaid diagram type is not registered in Mermade" };
    const nextStyle = readDiagramStyle(candidate);
    if (nextStyle.layout === "cose-bilkent" && detectedType.id !== "mindmap") {
      return { ok: false, error: "Cose Bilkent currently renders only Mindmaps reliably in Mermaid 11.16; choose Dagre, ELK, or Tidy Tree for this diagram" };
    }

    try {
      const version = versionPreference === "auto" ? detection.recommended : versionPreference;
      const mermaid = await loadMermaid(version, detectedType.id, nextStyle.layout);
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
      await mermaid.parse(candidate);

      const parsedFlowchart = detectedType.id === "flowchart" ? parseMermaid(candidate, diagram) : null;
      const preserveFlowchartSource = Boolean(parsedFlowchart && !canUseNativeFlowchartEditor(candidate));
      if (parsedFlowchart) shouldFitFreeformRef.current = true;
      shouldFitMermaidRef.current = true;
      shouldFitPolishedRef.current = true;
      setTool("select");
      setConnectionStart(null);
      setEditingNode(null);
      setEditingGroup(null);
      setEditingSourceLine(null);
      commit((current) => parsedFlowchart ? {
        ...parsedFlowchart,
        name: current.name,
        source: preserveFlowchartSource ? candidate : undefined,
        style: nextStyle,
        mermaidVersion: versionOverride || current.mermaidVersion,
        detectedMermaidVersion: detection.recommended,
      } : {
        ...current,
        source: candidate,
        style: nextStyle,
        mermaidVersion: versionOverride || current.mermaidVersion,
        nodes: [],
        edges: [],
        groups: [],
        detectedMermaidVersion: detection.recommended,
      });
      setSelected([]);
      setInvalidSource("");
      setSyntaxError("");
      if (viewMode === "polished" && !supportsPolishedDiagram(detectedType.id)) {
        lastEditorViewRef.current = "mermaid";
        setViewMode("mermaid");
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Mermaid rejected this source" };
    }
  };

  const applyRenderedStatementEdit = async () => {
    if (editingSourceLine === null) return;
    const lines = source.split(/\r?\n/);
    if (lines[editingSourceLine] === undefined) {
      setEditingSourceLine(null);
      return;
    }
    lines[editingSourceLine] = editingSourceStatement;
    setEditingSourceBusy(true);
    const result = await validateAndCommitSource(lines.join("\n"));
    setEditingSourceBusy(false);
    if (!result.ok) {
      notify(result.error || "Mermaid rejected this statement");
      return;
    }
    setEditingSourceLine(null);
    notify("Mermaid statement updated");
  };

  const applySource = async () => {
    const result = await validateAndCommitSource(sourceDraft);
    if (!result.ok) {
      setInvalidSource(sourceDraft);
      setSyntaxError(result.error || "Mermaid rejected this source");
      setSourceOpen(false);
      notify("Mermaid found invalid syntax — repair options are available");
      return;
    }
    setSourceDirty(false);
    setSourcePast([]);
    setSourceFuture([]);
    sourceLastEditAtRef.current = 0;
    notify("Diagram updated from valid Mermaid source");
  };

  const updateDiagramStyle = (patch: Partial<DiagramStyle>) => {
    if (patch.layout) {
      const compatibilityError = layoutCompatibilityError(patch.layout, activeDiagramType.id, {
        nodes: diagram.nodes,
        edges: diagram.edges,
        groupCount: diagram.groups.length,
        sourceIsAuthoritative: diagram.source !== undefined,
      });
      if (compatibilityError) {
        notify(compatibilityError);
        return;
      }
    }
    commit((current) => {
      const nextStyle = { ...(current.style || DEFAULT_DIAGRAM_STYLE), ...patch };
      return {
        ...current,
        style: nextStyle,
        source: current.source ? applyDiagramStyle(current.source, nextStyle) : undefined,
      };
    });
    shouldFitMermaidRef.current = Boolean(patch.layout || patch.look);
  };

  const updatePolishedStyle = (patch: Partial<PolishedStyle>) => {
    commit((current) => ({
      ...current,
      polishedStyle: {
        ...normalisePolishedStyle(current.polishedStyle),
        ...patch,
      },
    }));
    shouldFitPolishedRef.current = ["padding", "nodeSpacing", "layerSpacing", "componentSpacing"]
      .some((key) => key in patch);
  };

  const updatePolishedColour = (role: keyof PolishedCustomColours, value: string) => {
    updatePolishedStyle({
      paletteMode: "custom",
      customColours: { ...polishedStyle.customColours, [role]: value },
    });
  };

  const activeBeautifulDensity = BEAUTIFUL_DENSITY_PRESETS.find(({ values }) =>
    Object.entries(values).every(([key, value]) => polishedStyle[key as keyof PolishedStyle] === value),
  )?.id;

  const openRepairOptions = async () => {
    const candidate = invalidSource || source;
    setRepairOpen(true);
    setRepairLoading(true);
    setRepairOptions([]);
    const generated = createRepairProposals(candidate, activeMermaidVersion as RepairVersion, statusDiagramType.id);
    const alternateVersion: SupportedMermaidVersion = activeMermaidVersion === "11.16.0" ? "10.9.6" : "11.16.0";
    if (await validateSource(candidate, alternateVersion) === "" && await validateSource(candidate, activeMermaidVersion) !== "") {
      generated.unshift({
        id: "switch-compatible-engine",
        title: `Render with Mermaid ${alternateVersion}`,
        description: "The source is valid in the other bundled Mermaid engine. Switch versions without rewriting it.",
        confidence: "high",
        category: "version",
        source: candidate,
        version: alternateVersion,
      });
    }
    const validated: RepairProposal[] = [];
    for (const option of generated) {
      const version = option.version || activeMermaidVersion;
      if (await validateSource(option.source, version) === "") validated.push(option);
    }
    setRepairOptions(validated.filter((option, index) => validated.findIndex((candidateOption) => candidateOption.source === option.source && candidateOption.version === option.version) === index));
    setRepairLoading(false);
  };

  const applyRepair = async (repair: RepairProposal) => {
    const result = await validateAndCommitSource(repair.source, repair.version);
    if (!result.ok) {
      setSyntaxError(result.error || "Mermaid rejected the proposed repair");
      notify("The repair was not applied because Mermaid rejected it");
      return;
    }
    setSourceDraft(repair.source);
    setSourceDirty(false);
    setRepairOpen(false);
    notify("Repair applied and verified by Mermaid");
  };

  const importDiagram = async (event: ReactChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      notify("Choose a Mermaid file smaller than 5 MB");
      return;
    }

    try {
      const imported = readImportedMermaid(await file.text());
      if (!imported.source) {
        notify(`${file.name} does not contain Mermaid source`);
        return;
      }
      const result = await validateAndCommitSource(imported.source);
      if (!result.ok) {
        setInvalidSource(imported.source);
        setSyntaxError(result.error || "Invalid Mermaid source");
        setSourceDraft(imported.source);
        setSourceDirty(true);
        notify(`Imported ${file.name}; Mermaid found syntax that can be reviewed for repair`);
        return;
      }

      setDiagram((current) => ({ ...current, name: diagramNameFromFile(file.name), renderProfile: imported.renderProfile }));
      setSourceDraft(imported.source);
      setSourceDirty(false);
      setSourceOpen(false);
      setExportOpen(false);
      setViewMode("mermaid");
      lastEditorViewRef.current = "mermaid";
      notify(imported.additionalDiagramCount
        ? `Imported ${file.name}; using the first Mermaid diagram`
        : `Imported ${file.name}`);
    } catch {
      notify(`Could not read ${file.name}`);
    }
  };

  const changeDiagramType = async (nextTypeId: string) => {
    const nextType = MERMAID_DIAGRAM_TYPES.find((type) => type.id === nextTypeId);
    if (!nextType || nextType.id === activeDiagramType.id) return;
    const remainInBeautiful = viewMode === "polished" && supportsPolishedDiagram(nextType.id);

    const result = await validateAndCommitSource(nextType.template);
    if (!result.ok) {
      notify(result.error || `Mermaid could not create the ${nextType.label}`);
      return;
    }
    setSourceDraft(nextType.template);
    setSourceDirty(false);
    setViewMode(remainInBeautiful ? "polished" : "mermaid");
    if (!remainInBeautiful) lastEditorViewRef.current = "mermaid";
    notify(`${nextType.label} starter created`);
  };

  const changeMermaidVersion = async (preference: MermaidVersionPreference) => {
    const version = preference === "auto" ? detectMermaidVersion(source).recommended : preference;
    const error = await validateSource(source, version);
    if (error) {
      notify(`The current source cannot render with Mermaid ${version}`);
      return;
    }
    setDiagram((current) => ({ ...current, mermaidVersion: preference }));
  };

  const changeFlowchartDirection = (direction: "LR" | "TB") => {
    shouldFitFreeformRef.current = true;
    commit((current) => {
      const positions = layoutFlowchart(current.nodes, current.edges, direction);
      return {
        ...current,
        direction,
        nodes: current.nodes.map((node) => ({ ...node, ...positions.get(node.id) })),
        source: current.source ? updateFlowchartDirection(current.source, direction) : current.source,
      };
    });
    shouldFitMermaidRef.current = true;
  };

  function switchCanvasView(targetView: CanvasView) {
    if (targetView === viewMode) return;
    if (targetView === "polished" && !polishedSupported) {
      notify(`${activeDiagramType.label} is not yet supported by Beautiful Mermaid`);
      return;
    }
    const scroller = scrollRef.current;
    const root = viewMode === "free"
      ? boardRef.current
      : viewMode === "polished"
        ? polishedViewRef.current
        : mermaidViewRef.current;
    if (scroller && root) {
      const scrollerRect = scroller.getBoundingClientRect();
      const candidates = [...root.querySelectorAll<HTMLElement>("[data-node-id]")];
      const selectedId = selected.find((id) => candidates.some((candidate) => candidate.dataset.nodeId === id));
      const viewportCenterX = scrollerRect.left + scrollerRect.width / 2;
      const viewportCenterY = scrollerRect.top + scrollerRect.height / 2;
      const anchor = selectedId
        ? candidates.find((candidate) => candidate.dataset.nodeId === selectedId)
        : candidates.sort((first, second) => {
          const firstRect = first.getBoundingClientRect();
          const secondRect = second.getBoundingClientRect();
          const firstDistance = Math.hypot(firstRect.left + firstRect.width / 2 - viewportCenterX, firstRect.top + firstRect.height / 2 - viewportCenterY);
          const secondDistance = Math.hypot(secondRect.left + secondRect.width / 2 - viewportCenterX, secondRect.top + secondRect.height / 2 - viewportCenterY);
          return firstDistance - secondDistance;
        })[0];

      if (anchor?.dataset.nodeId) {
        const anchorRect = anchor.getBoundingClientRect();
        pendingViewAnchorRef.current = {
          nodeId: anchor.dataset.nodeId,
          viewportX: (anchorRect.left + anchorRect.width / 2 - scrollerRect.left) / scrollerRect.width,
          viewportY: (anchorRect.top + anchorRect.height / 2 - scrollerRect.top) / scrollerRect.height,
          targetView,
        };
      }
    }
    if (targetView === "mermaid") shouldFitMermaidRef.current = false;
    if (targetView === "polished") shouldFitPolishedRef.current = false;
    if (targetView === "free") shouldFitFreeformRef.current = false;
    if (targetView !== "polished") lastEditorViewRef.current = targetView;
    if (targetView === "polished") {
      setTool("select");
      setConnectionStart(null);
      setEditingNode(null);
      setEditingGroup(null);
      setEditingSourceLine(null);
    }
    setViewMode(targetView);
  }

  const switchWorkspace = (workspace: "editor" | "beautiful") => {
    switchCanvasView(workspace === "beautiful" ? "polished" : lastEditorViewRef.current);
  };

  const zoomAtViewportCenter = (nextValue: number) => {
    const scroller = scrollRef.current;
    const nextZoom = clampZoom(nextValue);
    if (!scroller) {
      setZoom(nextZoom);
      return;
    }
    const centerX = (scroller.scrollLeft + scroller.clientWidth / 2) / zoom;
    const centerY = (scroller.scrollTop + scroller.clientHeight / 2) / zoom;
    setZoom(nextZoom);
    requestAnimationFrame(() => {
      scroller.scrollLeft = centerX * nextZoom - scroller.clientWidth / 2;
      scroller.scrollTop = centerY * nextZoom - scroller.clientHeight / 2;
    });
  };

  return (
    <main className={`app-shell ${viewMode === "polished" ? "beautiful-app-shell" : ""}`} style={viewMode === "polished" ? beautifulWorkspaceStyle : undefined}>
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" style={{ backgroundImage: `url(${PUBLIC_BASE_PATH}/brand/logo-mark.svg)` }} aria-hidden="true" />
          <div className="brand-name">mermade</div>
          <div className="top-divider" />
          <input ref={documentNameRef} className="document-name" aria-label="Diagram name" value={diagram.name} onFocus={checkpoint} onChange={(event) => setDiagram((current) => ({ ...current, name: event.target.value }))} />
          <div className="local-diagram-switcher" ref={localDiagramMenuRef}>
            <button
              className={`save-status ${localStorageStatus}`}
              type="button"
              aria-label={`Local diagrams: ${localStorageStatusLabel}`}
              aria-expanded={localDiagramMenuOpen}
              aria-haspopup="dialog"
              onClick={() => {
                setExportOpen(false);
                setTypeMenuOpen(false);
                setPendingLocalDeleteId(null);
                setLocalDiagramSearch("");
                setLocalDiagramMenuOpen((open) => !open);
              }}
            >
              {localStorageStatus === "saving"
                ? <LoaderCircle className="save-status-spinner" size={13} />
                : localStorageStatus === "unavailable"
                  ? <AlertTriangle size={13} />
                  : <Check size={13} />}
              <span>{localStorageStatusLabel}</span>
              <ChevronDown size={12} />
            </button>
            {localDiagramMenuOpen && (
              <div className="local-diagram-menu" role="dialog" aria-label="Local diagrams">
                <header>
                  <span><b>Local diagrams</b><small>Stored in this browser</small></span>
                  <button type="button" onClick={createLocalDiagram}><Plus size={15} /> New</button>
                </header>
                <label className="local-diagram-search">
                  <Search size={14} />
                  <input
                    autoFocus
                    type="search"
                    aria-label="Search local diagrams"
                    placeholder="Search diagrams"
                    value={localDiagramSearch}
                    onChange={(event) => setLocalDiagramSearch(event.target.value)}
                  />
                </label>
                <div className="local-diagram-list" role="listbox" aria-label="Saved diagrams">
                  {filteredLocalDiagrams.map((document) => (
                    <button
                      key={document.id}
                      type="button"
                      role="option"
                      aria-selected={document.id === localDiagramIndex.activeId}
                      className={document.id === localDiagramIndex.activeId ? "selected" : ""}
                      onClick={() => activateLocalDiagram(document.id)}
                    >
                      <span><b>{document.name}</b><small>Edited {formatLocalDiagramDate(document.updatedAt)}</small></span>
                      {document.id === localDiagramIndex.activeId && <Check size={15} />}
                    </button>
                  ))}
                  {!filteredLocalDiagrams.length && <p>No local diagrams match that search.</p>}
                </div>
                {activeLocalDiagram && (
                  <footer className="local-diagram-actions">
                    <button type="button" onClick={renameLocalDiagram}><Pencil size={14} /> Rename</button>
                    <button type="button" onClick={duplicateLocalDiagram}><Copy size={14} /> Duplicate</button>
                    <button className="danger" type="button" onClick={() => setPendingLocalDeleteId(activeLocalDiagram.id)}><Trash2 size={14} /> Delete</button>
                  </footer>
                )}
                {pendingLocalDeleteId && (
                  <div className="local-diagram-confirm" role="alertdialog" aria-label="Delete local diagram">
                    <span><b>Delete this diagram?</b><small>This cannot be undone.</small></span>
                    <div>
                      <button type="button" onClick={() => setPendingLocalDeleteId(null)}>Cancel</button>
                      <button className="danger" type="button" onClick={() => deleteLocalDiagram(pendingLocalDeleteId)}>Delete</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <nav className="workspace-switcher" aria-label="Workspace">
          <button type="button" className={viewMode !== "polished" ? "active" : ""} aria-pressed={viewMode !== "polished"} onClick={() => switchWorkspace("editor")}><MousePointer2 size={13} /> Editor</button>
          <button
            type="button"
            className={viewMode === "polished" ? "active beautiful" : "beautiful"}
            aria-pressed={viewMode === "polished"}
            aria-keyshortcuts="3"
            disabled={!polishedSupported}
            title={polishedSupported ? "Beautiful workspace (3)" : `Beautiful Mermaid does not yet support ${activeDiagramType.label}`}
            onClick={() => switchWorkspace("beautiful")}
          ><BeautifulMermaidMark size={14} /> Beautiful</button>
        </nav>
        <div className="top-actions" data-tour="file-actions">
          <div className="history-actions">
            <IconButton label="Undo" onClick={undo}><Undo2 size={17} /></IconButton>
            <IconButton label="Redo" onClick={redo}><Redo2 size={17} /></IconButton>
          </div>
          <input ref={importInputRef} type="file" accept={MERMAID_IMPORT_ACCEPT} hidden onChange={(event) => void importDiagram(event)} />
          <button className="secondary-button" type="button" onClick={() => importInputRef.current?.click()}><Upload size={16} /> Import</button>
          <button className="secondary-button" type="button" onClick={() => openSourceEditor()}><Code2 size={16} /> Source</button>
          <div className="export-wrap">
            <button className="primary-button" type="button" onClick={() => setExportOpen((open) => !open)}><Download size={16} /> Export <ChevronDown size={14} /></button>
            {exportOpen && (
              <div className="export-menu">
                <button type="button" onClick={copySource}><Copy size={16} /><span><b>Copy Mermaid</b><small>Paste into Markdown</small></span></button>
                <button type="button" onClick={() => { download(source, `${diagram.name}.mmd`, "text/plain"); setExportOpen(false); }}><Code2 size={16} /><span><b>Mermaid file</b><small>Download .mmd source</small></span></button>
                <button type="button" onClick={exportSvg}><ExternalLink size={16} /><span><b>Mermaid vector</b><small>Download Mermaid SVG</small></span></button>
                {polishedSupported && <button type="button" onClick={exportPolishedSvg}><BeautifulMermaidMark size={16} /><span><b>Beautiful vector</b><small>Download Beautiful Mermaid SVG</small></span></button>}
                {polishedSupported && <button type="button" disabled={unicodeExporting} onClick={() => void exportPolishedText("unicode")}><Code2 size={16} /><span><b>{unicodeExporting ? "Preparing text…" : "Unicode diagram"}</b><small>{unicodeExporting ? "Rendering away from the canvas" : "Download box-drawing text"}</small></span></button>}
                {polishedSupported && <button type="button" disabled={unicodeExporting} onClick={() => void exportPolishedText("ascii")}><Code2 size={16} /><span><b>ASCII diagram</b><small>Download plain terminal text</small></span></button>}
              </div>
            )}
          </div>
        </div>
      </header>

      <section className={`workspace ${viewMode === "polished" ? "beautiful-workspace" : "editor-workspace"}`}>
        {viewMode === "polished" ? <aside className={`tool-rail beautiful-tool-rail ${preferences.showShortcutHints ? "" : "hide-shortcuts"}`} aria-label="Beautiful workspace tools">
          <div className="tool-group">
            <IconButton label="Fit chart (F)" shortcut="F" onClick={fitView}><Minimize2 size={19} /></IconButton>
            <IconButton label="Fill chart (Shift+F)" shortcut="⇧F" onClick={fillView}><Maximize2 size={19} /></IconButton>
          </div>
          <div className="tool-separator" />
          <div className="tool-group">
            <IconButton label="Edit Mermaid source" onClick={() => openSourceEditor()}><Code2 size={19} /></IconButton>
            <IconButton label="Export Beautiful SVG" onClick={() => void exportPolishedSvg()}><Download size={19} /></IconButton>
          </div>
          <div className="rail-spacer" />
          <div className="rail-help-stack">
            <IconButton label={`${activeDiagramType.label} help`} active={helpOpen} onClick={() => { setHelpOpen((open) => !open); setShortcutsOpen(false); setSettingsOpen(false); }}><CircleHelp size={19} /></IconButton>
            <IconButton label="Keyboard shortcuts" active={shortcutsOpen} onClick={() => { setShortcutsOpen((open) => !open); setSettingsOpen(false); setHelpOpen(false); }}><Command size={19} /></IconButton>
            <IconButton label="Settings" active={settingsOpen} onClick={() => { setSettingsOpen(true); setShortcutsOpen(false); setHelpOpen(false); }}><Settings2 size={19} /></IconButton>
          </div>
        </aside> : <aside className={`tool-rail ${preferences.showShortcutHints ? "" : "hide-shortcuts"}`} aria-label="Canvas tools" data-tour="canvas-tools">
          <div className="tool-group">
            <IconButton label="Select (V)" shortcut="V" disabled={!nativeFlowchart} active={nativeFlowchart && tool === "select"} onClick={() => { setTool("select"); setConnectionStart(null); }}><MousePointer2 size={19} /></IconButton>
            <IconButton label="Marquee select (M)" shortcut="M" disabled={!nativeFlowchart} active={nativeFlowchart && tool === "marquee"} onClick={() => { setTool("marquee"); setConnectionStart(null); }}><BoxSelect size={19} /></IconButton>
            <IconButton label="Add node (N)" shortcut="N" disabled={!nativeFlowchart} onClick={() => addNode()}><Plus size={20} /></IconButton>
            <IconButton label="Link nodes (L)" shortcut="L" disabled={!nativeFlowchart} active={nativeFlowchart && tool === "connect"} onClick={() => { setTool("connect"); setConnectionStart(null); notify("Choose the first node"); }}><Link2 size={19} /></IconButton>
            <IconButton label="Create subgraph (S)" shortcut="S" disabled={!nativeFlowchart} onClick={groupSelected}><Group size={19} /></IconButton>
          </div>
          <div className="tool-separator" />
          <div className="tool-group">
            <IconButton label="Add decision (D)" shortcut="D" disabled={!nativeFlowchart} onClick={() => addNode("diamond")}><Diamond size={19} /></IconButton>
            <IconButton label="Fit chart (F)" shortcut="F" onClick={fitView}><Minimize2 size={19} /></IconButton>
            <IconButton label="Fill chart (Shift+F)" shortcut="⇧F" onClick={fillView}><Maximize2 size={19} /></IconButton>
            <IconButton label="Organise chart (O)" shortcut="O" disabled={!nativeFlowchart} onClick={organizeFlowchart}><OrganiseChartIcon /></IconButton>
          </div>
          <div className="rail-spacer" />
          <div className="rail-help-stack" data-tour="help-settings">
            <IconButton label={`${activeDiagramType.label} help`} active={helpOpen} onClick={() => { setHelpOpen((open) => !open); setShortcutsOpen(false); setSettingsOpen(false); }}><CircleHelp size={19} /></IconButton>
            <IconButton label="Keyboard shortcuts" active={shortcutsOpen} onClick={() => { setShortcutsOpen((open) => !open); setSettingsOpen(false); setHelpOpen(false); }}><Command size={19} /></IconButton>
            <IconButton label="Settings" active={settingsOpen} onClick={() => { setSettingsOpen(true); setShortcutsOpen(false); setHelpOpen(false); }}><Settings2 size={19} /></IconButton>
          </div>
        </aside>}

        <section className={`canvas-viewport ${tool === "connect" ? "is-connecting" : ""} ${tool === "marquee" ? "is-marquee" : ""}`}>
          <div className="canvas-titlebar">
            <div ref={typeMenuRef} className={`diagram-type-picker ${typeMenuOpen ? "open" : ""}`} data-tour="diagram-type" onPointerDown={(event) => event.stopPropagation()}>
              <button
                className="diagram-type-trigger"
                type="button"
                aria-label="Diagram type"
                aria-haspopup="listbox"
                aria-expanded={typeMenuOpen}
                onClick={() => setTypeMenuOpen((open) => !open)}
              >
                <span>{activeDiagramType.label}</span><ChevronDown size={13} />
              </button>
              {typeMenuOpen && <div className="diagram-type-menu" role="listbox" aria-label="Choose diagram type">
                {(["freeform", "structured", "data"] as const).map((family) => <div key={family} className="diagram-type-group" role="group" aria-label={`${visualModeLabel(family)} diagrams`}>
                  <span>{visualModeLabel(family)}</span>
                  {MERMAID_DIAGRAM_TYPES.filter((type) => type.family === family).map((type) => <button
                    key={type.id}
                    type="button"
                    role="option"
                    aria-selected={type.id === activeDiagramType.id}
                    className={type.id === activeDiagramType.id ? "selected" : ""}
                    onClick={() => { setTypeMenuOpen(false); void changeDiagramType(type.id); }}
                  >
                    {type.label}{type.id === activeDiagramType.id && <Check size={13} />}
                  </button>)}
                </div>)}
              </div>}
            </div>
            {viewMode === "polished" ? <div className="beautiful-preview-controls" onPointerDown={(event) => event.stopPropagation()}>
              <div className="beautiful-output-switch" role="tablist" aria-label="Beautiful output preview">
                {([["diagram", "Diagram"], ["unicode", "Unicode"], ["ascii", "ASCII"]] as Array<[BeautifulPreviewMode, string]>).map(([mode, label]) => <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={beautifulPreviewMode === mode}
                  className={beautifulPreviewMode === mode ? "active" : ""}
                  onClick={() => {
                    setBeautifulPreviewMode(mode);
                    if (mode === "unicode" || mode === "ascii") {
                      setBeautifulTextSize({ width: 240, height: 120 });
                      setBeautifulTextLoading(true);
                      setBeautifulTextPreview("");
                      setBeautifulTextHtml("");
                      setBeautifulTextError("");
                      setBeautifulTextLayoutAdapted(false);
                    }
                  }}
                >{label}</button>)}
              </div>
              {beautifulPreviewMode !== "diagram" && <div className="beautiful-text-actions">
                {beautifulTextLayoutAdapted && <span>Wide text layout</span>}
                <button type="button" aria-label={`Copy ${beautifulPreviewMode.toUpperCase()} diagram`} disabled={beautifulTextLoading || Boolean(beautifulTextError) || !beautifulTextPreview} onClick={() => void copyBeautifulPreview()}><Copy size={14} /></button>
                <button type="button" aria-label={`Download ${beautifulPreviewMode.toUpperCase()} diagram`} disabled={beautifulTextLoading || Boolean(beautifulTextError) || !beautifulTextPreview} onClick={downloadBeautifulPreview}><Download size={14} /></button>
              </div>}
            </div> : <div className="canvas-view-controls" data-tour="canvas-views" onPointerDown={(event) => event.stopPropagation()}>
              {nativeFlowchart && <div className="direction-switch" aria-label="Chart direction">
                <button className={diagram.direction === "LR" ? "active" : ""} type="button" onClick={(event) => { event.stopPropagation(); changeFlowchartDirection("LR"); }}>Left → right</button>
                <button className={diagram.direction === "TB" ? "active" : ""} type="button" onClick={(event) => { event.stopPropagation(); changeFlowchartDirection("TB"); }}>Top ↓ bottom</button>
              </div>}
              <div className="view-switch" aria-label="Canvas view">
                <button className={viewMode === "free" ? "active" : ""} type="button" aria-keyshortcuts="1" title={`${visualModeName} canvas (1)`} onClick={(event) => { event.stopPropagation(); switchCanvasView("free"); }}><MousePointer2 size={12} /> {visualModeName}</button>
                <button className={viewMode === "mermaid" ? "active" : ""} type="button" aria-keyshortcuts="2" title="Mermaid canvas (2)" onClick={(event) => { event.stopPropagation(); switchCanvasView("mermaid"); }}><Sparkles size={12} /> Mermaid</button>
              </div>
            </div>}
          </div>
          {viewMode === "free" && !nativeFlowchart ? (
            <SemanticVisualEditor key={`${activeDiagramType.id}:${source}`} source={source} type={activeDiagramType} onCommit={validateAndCommitSource} />
          ) : <div ref={scrollRef} className="canvas-scroll">
            <div
              className={`diagram-surface ${preferences.showGrid && viewMode !== "polished" ? "" : "hide-grid"} ${viewMode === "polished" ? `beautiful-surface ${polishedStyle.transparent ? "is-transparent" : "is-opaque"}` : ""}`}
              onPointerDown={viewMode === "polished" ? undefined : beginCanvasPointer}
              style={{
                width: ((viewMode === "free" ? BOARD_WIDTH : renderedSize.width) + CANVAS_MARGIN * 2) * zoom,
                height: ((viewMode === "free" ? BOARD_HEIGHT : renderedSize.height) + CANVAS_MARGIN * 2) * zoom,
                "--grid-size": `${20 * zoom}px`,
              } as React.CSSProperties}
            >
            {viewMode === "free" ? (
            <div ref={boardRef} className="diagram-board" style={{ left: CANVAS_MARGIN * zoom, top: CANVAS_MARGIN * zoom, width: BOARD_WIDTH, height: BOARD_HEIGHT, transform: `scale(${zoom})` }}>
              {diagram.groups.map((group) => {
                const bounds = groupBoundsById.get(group.id);
                if (!bounds) return null;
                return (
                  <button key={group.id} type="button" className={`subgraph ${selected.includes(group.id) ? "selected" : ""}`} style={bounds} onPointerDown={(event) => { if (tool === "marquee") return; event.stopPropagation(); setSelected(event.shiftKey ? [...selected, group.id] : [group.id]); }}>
                    <span>{group.label}</span>
                  </button>
                );
              })}
              <svg className="edge-layer" width={BOARD_WIDTH} height={BOARD_HEIGHT} aria-hidden="true">
                <defs>
                  <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker>
                </defs>
                {diagram.edges.map((edge) => {
                  const path = edgePath(edge);
                  if (!path) return null;
                  return (
                    <g key={edge.id} className={`diagram-edge ${edge.style} ${selected.includes(edge.id) ? "selected" : ""}`} onPointerDown={(event) => { if (tool === "marquee") return; event.stopPropagation(); setSelected([edge.id]); }}>
                      <path className="edge-hit" d={path.d} />
                      <path className="edge-line" d={path.d} markerEnd={edge.arrow === false ? undefined : "url(#arrow)"} />
                      {edge.label && <g transform={`translate(${path.x}, ${path.y})`}><rect x={-32} y={-12} width={64} height={24} rx={8} /><text textAnchor="middle" dominantBaseline="middle">{edge.label}</text></g>}
                    </g>
                  );
                })}
              </svg>
              {diagram.nodes.map((node) => (
                <div
                  key={node.id}
                  data-node-id={node.id}
                  className={`diagram-node shape-${node.shape} ${mermaidShapeClass(node.mermaidShape)} ${selected.includes(node.id) ? "selected" : ""} ${connectionStart === node.id ? "connection-start" : ""}`}
                  style={{ left: node.x, top: node.y, width: node.width, height: node.height, "--node-color": node.color, "--node-text": node.textColor } as React.CSSProperties}
                  onPointerDown={(event) => beginDrag(event, node.id)}
                  onPointerUp={(event) => selectNode(event, node.id)}
                  onClick={(event) => clickNode(event, node.id)}
                  onDoubleClick={(event) => { event.stopPropagation(); setEditingGroup(null); setEditingNode(node.id); setSelected([node.id]); }}
                >
                  <div className="node-shape"><span>{node.label}</span></div>
                  {selected.includes(node.id) && tool === "select" && <><i className="handle nw" /><i className="handle ne" /><i className="handle sw" /><i className="handle se" /></>}
                  {editingNode === node.id && (
                    <input
                      autoFocus
                      className="inline-node-input"
                      value={node.label}
                      onFocus={checkpoint}
                      onChange={(event) => updateNode(node.id, { label: event.target.value }, false)}
                      onBlur={() => setEditingNode(null)}
                      onKeyDown={(event) => { if (event.key === "Enter") setEditingNode(null); }}
                      onPointerDown={(event) => event.stopPropagation()}
                    />
                  )}
                </div>
              ))}
              {marquee && (
                <div
                  className="marquee-selection"
                  style={{
                    left: Math.min(marquee.startX, marquee.currentX),
                    top: Math.min(marquee.startY, marquee.currentY),
                    width: Math.abs(marquee.currentX - marquee.startX),
                    height: Math.abs(marquee.currentY - marquee.startY),
                  }}
                />
              )}
            </div>
            ) : (
              <div
                ref={mermaidStageRef}
                className={`mermaid-stage ${viewMode === "polished" ? "polished-stage" : ""}`}
                style={{
                  left: `max(${CANVAS_MARGIN * zoom}px, calc((100% - ${renderedSize.width * zoom}px) / 2))`,
                  top: `max(${CANVAS_MARGIN * zoom}px, calc((100% - ${renderedSize.height * zoom}px) / 2))`,
                  width: renderedSize.width,
                  height: renderedSize.height,
                  transform: `scale(${zoom})`,
                }}
                onPointerDown={viewMode === "polished" ? undefined : selectMermaidElement}
                onDoubleClick={viewMode === "polished" ? undefined : editMermaidElement}
              >
                {viewMode === "polished"
                  ? beautifulPreviewMode === "diagram"
                    ? <div key="beautiful-render" ref={polishedViewRef} className="mermaid-render polished-render" />
                    : <div className="beautiful-text-preview" role="tabpanel" aria-label={`${beautifulPreviewMode.toUpperCase()} text preview`}>
                      {beautifulTextLoading
                        ? <div className="beautiful-text-loading"><Sparkles size={17} /> Rendering {beautifulPreviewMode.toUpperCase()}…</div>
                        : beautifulTextError
                          ? <div className="beautiful-text-error"><AlertTriangle size={18} /><b>Text diagram could not be rendered</b><span>{beautifulTextError}</span></div>
                        : <pre ref={beautifulTextPreRef}>{beautifulTextHtml
                          ? <code dangerouslySetInnerHTML={{ __html: beautifulTextHtml }} />
                          : <code>{beautifulTextPreview}</code>}
                        </pre>}
                    </div>
                  : <div key="mermaid-render" ref={mermaidViewRef} className={`mermaid-render ${renderProfileClass}`} />}
                {viewMode !== "polished" && marquee && (
                  <div
                    className="marquee-selection"
                    style={{
                      left: Math.min(marquee.startX, marquee.currentX),
                      top: Math.min(marquee.startY, marquee.currentY),
                      width: Math.abs(marquee.currentX - marquee.startX),
                      height: Math.abs(marquee.currentY - marquee.startY),
                    }}
                  />
                )}
                {viewMode === "mermaid" && mermaidRenderError && <div className="mermaid-render-error"><Code2 size={20} /><b>Mermaid could not render this diagram</b><span>{mermaidRenderError}</span></div>}
                {viewMode === "polished" && beautifulPreviewMode === "diagram" && polishedRenderError && <div className="mermaid-render-error"><BeautifulMermaidMark size={20} /><b>Beautiful could not present this valid Mermaid diagram</b><span>{polishedRenderError}</span></div>}
                {viewMode === "polished" && beautifulPreviewMode === "diagram" && !polishedRenderError && <div className="polished-credit"><BeautifulMermaidMark size={12} /> Beautiful Mermaid renderer</div>}
              </div>
            )}
            </div>
          </div>}

          {viewMode === "mermaid" && editingNode && selectedNode && (
            <div className="mermaid-inline-editor">
              <span>Edit node text</span>
              <input
                autoFocus
                value={selectedNode.label}
                onFocus={checkpoint}
                onChange={(event) => updateNode(selectedNode.id, { label: event.target.value }, false)}
                onBlur={() => setEditingNode(null)}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === "Escape") setEditingNode(null); }}
              />
            </div>
          )}

          {viewMode === "mermaid" && editingGroup && selectedGroup && (
            <div className="mermaid-inline-editor">
              <span>Edit subgraph text</span>
              <input
                autoFocus
                value={selectedGroup.label}
                onFocus={checkpoint}
                onChange={(event) => updateGroup(selectedGroup.id, event.target.value, false)}
                onBlur={() => setEditingGroup(null)}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === "Escape") setEditingGroup(null); }}
              />
            </div>
          )}

          {viewMode === "mermaid" && editingSourceLine !== null && (
            <form className="mermaid-inline-editor mermaid-statement-editor" onSubmit={(event) => { event.preventDefault(); void applyRenderedStatementEdit(); }}>
              <span>Mermaid statement · line {editingSourceLine + 1}</span>
              <input
                autoFocus
                aria-label="Mermaid statement"
                value={editingSourceStatement}
                onChange={(event) => setEditingSourceStatement(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Escape") setEditingSourceLine(null); }}
              />
              <button className="primary-button" type="submit" disabled={editingSourceBusy}>{editingSourceBusy ? "Validating…" : "Apply"}</button>
            </form>
          )}

          {(viewMode !== "free" || nativeFlowchart) && <><div className={`canvas-hint ${viewMode === "polished" ? "beautiful-canvas-hint" : ""}`}>{viewMode === "polished" ? <><BeautifulMermaidMark size={14} /> Presentation workspace · Edit structure in Editor or Source · Scroll to pan · ⌘ scroll to zoom</> : <><BoxSelect size={15} /> Click to select · Double-click {nativeFlowchart ? "to edit" : "diagram text to edit its Mermaid statement"} · Scroll to pan · ⌘ scroll to zoom</>}</div>
          <div className="zoom-controls" data-tour="canvas-navigation">
            <IconButton label="Zoom out" onClick={() => zoomAtViewportCenter(zoom - 0.1)}><ZoomOut size={17} /></IconButton>
            <button type="button" onClick={fitView}>{Math.round(zoom * 100)}%</button>
            <IconButton label="Zoom in" onClick={() => zoomAtViewportCenter(zoom + 0.1)}><ZoomIn size={17} /></IconButton>
            <span />
            <IconButton label="Fit to canvas" onClick={fitView}><Minimize2 size={17} /></IconButton>
          </div></>}
          {nativeFlowchart && tool === "connect" && <div className="mode-banner"><Link2 size={15} /> {connectionStart ? "Now choose a destination" : "Choose a starting node"}</div>}
          {nativeFlowchart && tool === "marquee" && <div className="mode-banner"><BoxSelect size={15} /> Drag across nodes · Shift-drag to add</div>}
        </section>

        <aside className={`inspector ${viewMode === "polished" ? "beautiful-inspector" : ""}`} data-tour="inspector">
          {viewMode === "polished" ? <>
            <header className="beautiful-inspector-header">
              <div><span className="beautiful-inspector-mark"><BeautifulMermaidMark size={19} /></span><span><b>Beautiful workspace</b><small>Presentation renderer</small></span></div>
              <button type="button" onClick={() => switchWorkspace("editor")}><MousePointer2 size={13} /> Editor</button>
            </header>
            <div className="beautiful-inspector-body">
              <section className="beautiful-control-section palette-section">
                <header><span><Palette size={14} /> Palette</span><small>Two-colour mono or enriched themes</small></header>
                <div className="beautiful-segmented" aria-label="Beautiful palette source">
                  <button type="button" className={polishedStyle.paletteMode === "theme" ? "active" : ""} onClick={() => updatePolishedStyle({ paletteMode: "theme" })}>Themes</button>
                  <button type="button" className={polishedStyle.paletteMode === "custom" ? "active" : ""} onClick={() => updatePolishedStyle({ paletteMode: "custom" })}>Custom</button>
                </div>
                {polishedStyle.paletteMode === "theme" ? <div className="beautiful-theme-grid">
                  {POLISHED_THEME_OPTIONS.map(([value, label]) => {
                    const preview = POLISHED_THEME_PREVIEWS[value];
                    return <button key={value} type="button" className={polishedStyle.theme === value ? "selected" : ""} onClick={() => updatePolishedStyle({ theme: value, paletteMode: "theme" })}>
                      <span className="beautiful-theme-preview" style={{ "--theme-bg": preview.bg, "--theme-fg": preview.fg, "--theme-accent": preview.accent } as React.CSSProperties}><i /><i /><i /></span>
                      <b>{label.replace(/^Mermade — /, "Mermade · ")}</b>
                      {polishedStyle.theme === value && <Check size={12} />}
                    </button>;
                  })}
                </div> : <div className="beautiful-colour-grid">
                  {BEAUTIFUL_COLOUR_ROLES.map(([role, label]) => <label key={role}><span>{label}</span><div><input type="color" value={polishedStyle.customColours[role]} aria-label={`${label} colour`} onChange={(event) => updatePolishedColour(role, event.target.value)} /><input value={polishedStyle.customColours[role]} onChange={(event) => updatePolishedColour(role, event.target.value)} /></div></label>)}
                </div>}
              </section>

              <section className="beautiful-control-section layout-section">
                <header><span><SlidersHorizontal size={14} /> Layout density</span><small>Beautiful Mermaid&apos;s ELK spacing</small></header>
                <div className="beautiful-density-grid">
                  {BEAUTIFUL_DENSITY_PRESETS.map((preset) => <button key={preset.id} type="button" className={activeBeautifulDensity === preset.id ? "selected" : ""} onClick={() => updatePolishedStyle(preset.values)}><b>{preset.label}</b><small>{preset.description}</small></button>)}
                </div>
                <div className="beautiful-range-list">
                  {([
                    ["padding", "Canvas padding", 8, 160],
                    ["nodeSpacing", "Node spacing", 8, 160],
                    ["layerSpacing", "Layer spacing", 8, 200],
                    ["componentSpacing", "Component spacing", 8, 200],
                  ] as Array<["padding" | "nodeSpacing" | "layerSpacing" | "componentSpacing", string, number, number]>).map(([key, label, min, max]) => <label key={key}><span>{label}<output>{polishedStyle[key]} px</output></span><input type="range" min={min} max={max} step="2" value={polishedStyle[key]} onChange={(event) => updatePolishedStyle({ [key]: Number(event.target.value) })} /></label>)}
                </div>
              </section>

              <section className="beautiful-control-section output-section">
                <header><span><Sparkles size={14} /> Rendering</span><small>Preview-only choices; source stays unchanged</small></header>
                <label className="beautiful-control-row"><span><b>Source colour overrides</b><small>Let Mermaid style directives override this palette</small></span><input type="checkbox" checked={polishedStyle.respectSourceStyles} onChange={(event) => updatePolishedStyle({ respectSourceStyles: event.target.checked })} /></label>
                <label className="beautiful-control-row"><span><b>Transparent export</b><small>Keep the SVG background transparent</small></span><input type="checkbox" checked={polishedStyle.transparent} onChange={(event) => updatePolishedStyle({ transparent: event.target.checked })} /></label>
                {activeDiagramType.id === "xychart" && <label className="beautiful-control-row"><span><b>Interactive data tips</b><small>Show values while hovering</small></span><input type="checkbox" checked={polishedStyle.interactive} onChange={(event) => updatePolishedStyle({ interactive: event.target.checked })} /></label>}
                <label className="beautiful-font-field"><span>Font family</span><input value={polishedStyle.font} onChange={(event) => updatePolishedStyle({ font: event.target.value })} /></label>
              </section>

              <section className="beautiful-control-section beautiful-actions-section">
                <button className="primary-button" type="button" onClick={() => void exportPolishedSvg()}><Download size={15} /> Export Beautiful SVG</button>
                <button className="secondary-button" type="button" disabled={unicodeExporting} onClick={() => void exportPolishedText("unicode")}><Code2 size={15} /> {unicodeExporting ? "Preparing text…" : "Export Unicode"}</button>
                <button className="secondary-button" type="button" disabled={unicodeExporting} onClick={() => void exportPolishedText("ascii")}><Code2 size={15} /> Export ASCII</button>
                <button className="beautiful-reset" type="button" onClick={() => updatePolishedStyle(DEFAULT_POLISHED_STYLE)}><RotateCcw size={13} /> Reset Beautiful settings</button>
              </section>
            </div>
            <footer className="beautiful-inspector-footer"><BeautifulMermaidMark size={13} /><span>{activeDiagramType.label} rendered from canonical Mermaid</span><span className="status-dot" /></footer>
          </> : <>
          <div className="inspector-tabs">
            <button type="button" className={tab === "properties" ? "active" : ""} onClick={() => setTab("properties")}>Properties</button>
            <button type="button" className={tab === "appearance" ? "active" : ""} onClick={() => setTab("appearance")}>Appearance</button>
            <button type="button" className={tab === "style" ? "active" : ""} onClick={() => setTab("style")}>Style</button>
          </div>
          <div className="inspector-body">
            {tab === "style" ? (
              <div className="diagram-style-panel">
                <div className="field-stack">
                  <label><span>Theme</span><select value={diagramStyle.theme} onChange={(event) => updateDiagramStyle({ theme: event.target.value as MermaidTheme })}>
                    {(modernStyleFeatures ? MODERN_THEME_OPTIONS : LEGACY_THEME_OPTIONS).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    {!modernStyleFeatures && !LEGACY_THEME_OPTIONS.some(({ value }) => value === diagramStyle.theme) && <option value={diagramStyle.theme} disabled>{diagramStyle.theme} — Mermaid 11 only</option>}
                  </select></label>
                  <label><span>Rendering style</span><select value={diagramStyle.look} disabled={!modernStyleFeatures} onChange={(event) => updateDiagramStyle({ look: event.target.value as MermaidLook })}>{LOOK_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                  <label><span>Layout</span><select value={diagramStyle.layout} disabled={!layoutSupported} onChange={(event) => updateDiagramStyle({ layout: event.target.value as MermaidLayout })}>{availableLayoutOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}{!availableLayoutOptions.some(({ value }) => value === diagramStyle.layout) && <option value={diagramStyle.layout} disabled>{diagramStyle.layout} — unavailable for {activeDiagramType.label}</option>}</select></label>
                  {!modernStyleFeatures && <p className="style-compatibility-note">Rendering styles and layouts require Mermaid 11. This project is currently using Mermaid 10.</p>}
                  {modernStyleFeatures && !layoutSupported && <p className="style-compatibility-note">{activeDiagramType.label} controls its own layout, so Mermaid layout engines do not apply to this diagram type.</p>}
                  {modernStyleFeatures && currentLayoutCompatibilityError && <p className="style-compatibility-note">{currentLayoutCompatibilityError}.</p>}
                  <label><span>Font family</span><input value={diagramStyle.fontFamily} onChange={(event) => updateDiagramStyle({ fontFamily: event.target.value })} /></label>
                  {diagramStyle.theme === "base" ? <div className="diagram-color-grid">
                    {([
                      ["primaryColor", "Primary fill"], ["primaryTextColor", "Primary text"], ["lineColor", "Lines"],
                      ["background", "Background"], ["clusterBkg", "Subgraph fill"], ["clusterBorder", "Subgraph border"],
                    ] as Array<[keyof DiagramStyle, string]>).map(([key, label]) => <label key={key}><span>{label}</span><div className="color-input"><input type="color" value={diagramStyle[key]} onChange={(event) => updateDiagramStyle({ [key]: event.target.value })} /><input value={diagramStyle[key]} onChange={(event) => updateDiagramStyle({ [key]: event.target.value })} /></div></label>)}
                  </div> : <p className="style-palette-note">This preset owns its palette. Choose <b>Base</b> to customise diagram colours.</p>}
                  <button className="wide-action" type="button" onClick={() => updateDiagramStyle(DEFAULT_DIAGRAM_STYLE)}><RotateCcw size={15} /> Reset diagram style</button>
                </div>
              </div>
            ) : selectedSourceStatement !== undefined ? (
              <div className="field-stack rendered-statement-properties">
                <div className="selection-heading"><div className="edge-symbol"><Code2 size={18} /></div><div><span>Mermaid statement</span><b>Line {selectedSourceLine + 1}</b></div></div>
                <label><span>Source</span><textarea value={selectedSourceStatement} rows={4} readOnly /></label>
                <button className="wide-action" type="button" onClick={() => { setEditingSourceLine(selectedSourceLine); setEditingSourceStatement(selectedSourceStatement); }}><Code2 size={15} /> Edit validated statement</button>
                <p className="style-compatibility-note">Changes are accepted only after the selected Mermaid engine validates the complete diagram.</p>
              </div>
            ) : selectedNode ? (
              <>
                <div className="selection-heading">
                  <div className={`mini-shape shape-${selectedNode.shape} ${mermaidShapeClass(selectedNode.mermaidShape)}`} style={{ "--node-color": selectedNode.color } as React.CSSProperties} />
                  <div><span>Node</span><b>{selectedNode.label}</b></div>
                  <IconButton label="Delete node" onClick={deleteSelected}><Trash2 size={16} /></IconButton>
                </div>
                {tab === "properties" ? (
                  <div className="field-stack">
                    <label><span>Text</span><textarea value={selectedNode.label} onFocus={checkpoint} onChange={(event) => updateNode(selectedNode.id, { label: event.target.value }, false)} rows={3} /></label>
                    <label><span>Node ID</span><div className="input-with-prefix"><Code2 size={14} /><input value={selectedNode.id} readOnly /></div></label>
                    <label><span>Shape</span><select value={selectedFlowchartShape(selectedNode)} onChange={(event) => updateNode(selectedNode.id, flowchartShapePatch(event.target.value))}>
                      {FLOWCHART_SHAPE_GROUPS.map((group) => <optgroup key={group.label} label={group.label}>
                        {group.options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                      </optgroup>)}
                    </select></label>
                    <div className="property-row"><span>Subgraph</span><b>{diagram.groups.find((group) => group.id === selectedNode.groupId)?.label || "None"}</b></div>
                    <button className="wide-action" type="button" onClick={() => { setTool("connect"); setConnectionStart(selectedNode.id); notify("Choose a destination node"); }}><Link2 size={16} /> Add relationship from this node</button>
                  </div>
                ) : (
                  <div className="field-stack">
                    <label><span>Fill colour</span><div className="swatches">{COLORS.map((color) => <button key={color} className={selectedNode.color === color ? "selected" : ""} type="button" aria-label={`Use ${color}`} style={{ background: color }} onClick={() => updateNode(selectedNode.id, { color })}>{selectedNode.color === color && <Check size={14} />}</button>)}</div></label>
                    <label><span>Text colour</span><div className="color-input"><input type="color" value={selectedNode.textColor} onChange={(event) => updateNode(selectedNode.id, { textColor: event.target.value }, false)} /><input value={selectedNode.textColor} onChange={(event) => updateNode(selectedNode.id, { textColor: event.target.value }, false)} /></div></label>
                    <div className="style-preview" style={{ background: selectedNode.color, color: selectedNode.textColor }}>Aa <span>Live preview</span></div>
                  </div>
                )}
              </>
            ) : selectedEdge ? (
              <>
                <div className="selection-heading"><div className="edge-symbol"><ArrowRight size={20} /></div><div><span>Relationship</span><b>{selectedEdge.from} → {selectedEdge.to}</b></div><IconButton label="Delete relationship" onClick={deleteSelected}><Trash2 size={16} /></IconButton></div>
                <div className="field-stack">
                  <label><span>Label</span><input value={selectedEdge.label} placeholder="Optional label" onFocus={checkpoint} onChange={(event) => updateEdge(selectedEdge.id, { label: event.target.value }, false)} /></label>
                  <label><span>Line style</span><select value={selectedEdge.style} onChange={(event) => updateEdge(selectedEdge.id, { style: event.target.value as EdgeStyle })}><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="thick">Thick</option></select></label>
                  <label><span>End marker</span><select value={selectedEdge.arrow === false ? "line" : "arrow"} onChange={(event) => updateEdge(selectedEdge.id, { arrow: event.target.value === "arrow" })}><option value="arrow">Arrow</option><option value="line">Plain line</option></select></label>
                  <div className="relation-summary"><span>{diagram.nodes.find((node) => node.id === selectedEdge.from)?.label}</span><ArrowRight size={18} /><span>{diagram.nodes.find((node) => node.id === selectedEdge.to)?.label}</span></div>
                </div>
              </>
            ) : selected.length > 1 ? (
              <div className="multi-selection">
                <div className="multi-icon"><BoxSelect size={22} /></div>
                <h3>{selected.length} items selected</h3>
                <p>Move them together or turn the selected nodes into a Mermaid subgraph.</p>
                <button className="primary-button wide" type="button" onClick={groupSelected}><Group size={16} /> Create subgraph</button>
                <button className="wide-action danger" type="button" onClick={deleteSelected}><Trash2 size={16} /> Delete selection</button>
              </div>
            ) : selected.length === 1 && diagram.groups.some((group) => group.id === selected[0]) ? (
              <div className="field-stack">
                <div className="selection-heading"><div className="multi-icon compact"><Group size={18} /></div><div><span>Subgraph</span><b>{diagram.groups.find((group) => group.id === selected[0])?.label}</b></div></div>
                <label><span>Name</span><input value={diagram.groups.find((group) => group.id === selected[0])?.label || ""} onFocus={checkpoint} onChange={(event) => updateGroup(selected[0], event.target.value, false)} /></label>
                <button className="wide-action" type="button" onClick={ungroupSelected}><Ungroup size={16} /> Remove subgraph</button>
              </div>
            ) : (
              <div className="empty-inspector">
                <div className="empty-orbit"><MousePointer2 size={22} /></div>
                <h3>{nativeFlowchart ? "Select something" : activeDiagramType.label}</h3>
                <p>{nativeFlowchart ? "Choose a node or relationship to edit its content and appearance." : `${visualModeName} editing preserves the diagram's Mermaid-specific structure.`}</p>
                {nativeFlowchart
                  ? <button className="wide-action" type="button" onClick={() => addNode()}><Plus size={16} /> Add your first node</button>
                  : <button className="wide-action" type="button" onClick={() => openSourceEditor()}><Code2 size={16} /> Edit Mermaid source</button>}
              </div>
            )}
          </div>
          <footer className={`inspector-footer ${diagramError ? "invalid" : ""}`}>
            {diagramError ? <button type="button" onClick={() => void openRepairOptions()} title={diagramError}><AlertTriangle size={14} /><span>Repair Mermaid {statusDiagramType.label}</span><span className="status-dot" /></button> : <><Sparkles size={14} /><span>Valid Mermaid {activeDiagramType.label}</span><span className="status-dot" /></>}
          </footer>
          </>}
        </aside>
      </section>

      {welcomeOpen && (
        <div className="welcome-backdrop">
          <section className="welcome-dialog" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
            <div className="welcome-brand" aria-label="Mermade"><span style={{ backgroundImage: `url(${PUBLIC_BASE_PATH}/brand/logo-mark.svg)` }} /><b>mermade</b></div>
            <span className="welcome-eyebrow">Visual Mermaid editing, kept local</span>
            <h1 id="welcome-title">Make Mermaid diagrams without losing the Mermaid.</h1>
            <p>Edit the rendered chart, work spatially when the diagram supports it, or change exact source. Your projects and preferences stay in this browser.</p>
            <div className="welcome-actions">
              <button className="primary-button" type="button" autoFocus onClick={() => { writeStoredValue(ONBOARDING_KEY, "complete"); setWelcomeOpen(false); }}>Start Editing</button>
              <button className="secondary-button" type="button" onClick={() => { writeStoredValue(ONBOARDING_KEY, "complete"); setWelcomeOpen(false); setTourStep(0); }}>Tour</button>
            </div>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer">View Mermade on GitHub <ExternalLink size={14} /></a>
          </section>
        </div>
      )}

      {tourStep !== null && tourRect && (
        <div className="tour-layer" aria-live="polite">
          <div className="tour-spotlight" style={{ left: tourRect.left - 7, top: tourRect.top - 7, width: tourRect.width + 14, height: tourRect.height + 14 }} />
          <section
            className="tour-card"
            role="dialog"
            aria-label={`Tour step ${tourStep + 1} of ${TOUR_STEPS.length}`}
            style={{
              left: Math.max(16, Math.min(tourRect.left, window.innerWidth - 356)),
              top: tourRect.bottom + 18 + 220 < window.innerHeight ? tourRect.bottom + 18 : Math.max(16, tourRect.top - 230),
            }}
          >
            <span>{tourStep + 1} of {TOUR_STEPS.length}</span>
            <h2>{TOUR_STEPS[tourStep].title}</h2>
            <p>{TOUR_STEPS[tourStep].description}</p>
            <div className="tour-progress" aria-hidden="true">{TOUR_STEPS.map((step, index) => <i key={step.id} className={index <= tourStep ? "active" : ""} />)}</div>
            <footer>
              <button type="button" onClick={() => setTourStep(null)}>Exit tour</button>
              <div>{tourStep > 0 && <button type="button" onClick={() => setTourStep(tourStep - 1)}>Back</button>}<button className="primary-button" type="button" onClick={() => setTourStep(tourStep === TOUR_STEPS.length - 1 ? null : tourStep + 1)}>{tourStep === TOUR_STEPS.length - 1 ? "Finish" : "Next"}</button></div>
            </footer>
          </section>
        </div>
      )}

      {repairOpen && (
        <div className="settings-backdrop" onPointerDown={() => setRepairOpen(false)}>
          <section className="repair-panel" role="dialog" aria-modal="true" aria-labelledby="repair-title" onPointerDown={(event) => event.stopPropagation()}>
            <header><div><AlertTriangle size={19} /><span><b id="repair-title">Repair Mermaid {statusDiagramType.label}</b><small>Every option is verified before it is offered</small></span></div><button type="button" onClick={() => setRepairOpen(false)}>Done</button></header>
            <div className="repair-content">
              <div className="repair-error"><b>Mermaid reported</b><span>{diagramError || "The selected Mermaid engine could not render this diagram."}</span></div>
              {repairLoading ? <div className="repair-loading"><Sparkles size={18} /><span>Testing safe repairs with Mermaid…</span></div> : repairOptions.length ? repairOptions.map((option) => (
                <article className="repair-option" key={`${option.id}:${option.version || "source"}`}>
                  <div className="repair-option-heading"><span className={`repair-confidence ${option.confidence}`}>{option.confidence} confidence</span><span>{option.category === "syntax" ? "Syntax" : option.category === "version" ? "Version" : "Diagram-specific"}</span></div>
                  <h3>{option.title}</h3><p>{option.description}</p>
                  <details><summary>Review source changes</summary><pre>{simpleSourceDiff(invalidSource || source, option.source)}</pre></details>
                  <button className="primary-button" type="button" onClick={() => void applyRepair(option)}>Apply verified fix</button>
                </article>
              )) : <div className="repair-empty"><AlertTriangle size={20} /><h3>No safe automatic repair found</h3><p>Mermade will not guess when it cannot produce syntax that the selected Mermaid engine verifies.</p><button className="secondary-button" type="button" onClick={() => { setRepairOpen(false); openSourceEditor(invalidSource || source, true); }}>Open source editor</button></div>}
            </div>
          </section>
        </div>
      )}

      {helpOpen && (
        <div className="settings-backdrop" onPointerDown={() => setHelpOpen(false)}>
          <section className="help-panel" role="dialog" aria-modal="true" aria-labelledby="help-title" onPointerDown={(event) => event.stopPropagation()}>
            <header>
              <div><CircleHelp size={19} /><span><b id="help-title">{activeDiagramType.label} help</b><small>{visualModeName} editing · Mermaid {activeMermaidVersion}</small></span></div>
              <button type="button" onClick={() => setHelpOpen(false)}>Done</button>
            </header>
            <div className="help-content">
              <section className="help-overview-card purpose">
                <header><Workflow size={14} /><span>When to use</span></header>
                <div><p>{activeHelp.purpose}</p></div>
              </section>
              <section className="help-overview-card editing">
                <header><MousePointer2 size={14} /><span>Editing in Mermade</span></header>
                <div>
                  <p>{visualEditingHelp}</p>
                  <button className="wide-action" type="button" onClick={() => { setHelpOpen(false); setTourStep(0); writeStoredValue(ONBOARDING_KEY, "complete"); }}>Restart interface tour</button>
                </div>
              </section>
              <section className="help-section help-quick-start">
                <span>Quick start</span>
                <pre><code>{activeDiagramType.template}</code></pre>
              </section>
              <div className="help-guidance-grid">
                <section className="help-guidance-card recommended">
                  <header><Check size={14} /><span>Recommended</span></header>
                  <div>{activeHelp.tips.map((tip, index) => <p key={tip}><i>{index + 1}</i><span>{tip}</span></p>)}</div>
                </section>
                <section className="help-guidance-card avoid">
                  <header><AlertTriangle size={14} /><span>Avoid</span></header>
                  <div>{activeHelp.pitfalls.map((pitfall) => <p key={pitfall}><i>!</i><span>{pitfall}</span></p>)}</div>
                </section>
              </div>
              <section className="help-section">
                <span>References</span>
                <div className="help-resources">
                  {activeHelp.resources.map((resource) => (
                    <a key={resource.url} href={resource.url} target="_blank" rel="noreferrer">
                      <span><small>{resource.kind}</small><b>{resource.label}</b></span><ExternalLink size={15} />
                    </a>
                  ))}
                </div>
                <p className="help-reference-note">Standards are labelled separately from best-practice and method guidance.</p>
              </section>
            </div>
          </section>
        </div>
      )}

      {shortcutsOpen && (
        <div className="settings-backdrop" onPointerDown={() => setShortcutsOpen(false)}>
          <section className="shortcuts-panel" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" onPointerDown={(event) => event.stopPropagation()}>
            <header>
              <div><Command size={19} /><span><b id="shortcuts-title">Keyboard shortcuts</b><small>Move faster around the canvas</small></span></div>
              <button type="button" onClick={() => setShortcutsOpen(false)}>Done</button>
            </header>
            <div className="shortcuts-content">
              <div className="shortcuts-section">
                <span>Canvas tools</span>
                <div className="shortcuts-list">
                  <div><b>Select</b><kbd>V</kbd></div>
                  <div><b>Marquee select</b><kbd>M</kbd></div>
                  <div><b>New node</b><kbd>N</kbd></div>
                  <div><b>New connected node</b><span><kbd>⇧</kbd><kbd>N</kbd></span></div>
                  <div><b>Link nodes</b><kbd>L</kbd></div>
                  <div><b>Create subgraph</b><kbd>S</kbd></div>
                  <div><b>Add decision</b><kbd>D</kbd></div>
                  <div><b>Add connected decision</b><span><kbd>⇧</kbd><kbd>D</kbd></span></div>
                  <div><b>Edit selected node</b><kbd>E</kbd></div>
                </div>
              </div>
              <div className="shortcuts-section">
                <span>Canvas views</span>
                <div className="shortcuts-list">
                  <div><b>FreeForm canvas</b><kbd>1</kbd></div>
                  <div><b>Mermaid canvas</b><kbd>2</kbd></div>
                  <div><b>Beautiful workspace</b><kbd>3</kbd></div>
                </div>
              </div>
              <div className="shortcuts-section">
                <span>Edit and navigate</span>
                <div className="shortcuts-list">
                  <div><b>Delete selection</b><kbd>⌫</kbd></div>
                  <div><b>Cancel or close</b><kbd>Esc</kbd></div>
                  <div><b>Undo</b><span><kbd>⌘</kbd><kbd>Z</kbd></span></div>
                  <div><b>Redo</b><span><kbd>⌘</kbd><kbd>⇧</kbd><kbd>Z</kbd></span></div>
                  <div><b>Pan canvas</b><kbd>Scroll</kbd></div>
                  <div><b>Zoom canvas</b><span><kbd>⌘</kbd><kbd>Scroll</kbd></span></div>
                  <div><b>Fit Chart</b><kbd>F</kbd></div>
                  <div><b>Fill Chart</b><span><kbd>⇧</kbd><kbd>F</kbd></span></div>
                  <div><b>Organise Chart</b><kbd>O</kbd></div>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {settingsOpen && (
        <div className="settings-backdrop" onPointerDown={() => setSettingsOpen(false)}>
          <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title" onPointerDown={(event) => event.stopPropagation()}>
            <header>
              <div><Settings2 size={19} /><span><b id="settings-title">Editor settings</b><small>Saved locally in this browser</small></span></div>
              <button type="button" onClick={() => setSettingsOpen(false)}>Done</button>
            </header>
            <div className="settings-content">
              <div className="settings-section">
                <span className="settings-label">Appearance</span>
                <div className="theme-options" aria-label="Colour theme">
                  <button className={preferences.theme === "light" ? "active" : ""} type="button" onClick={() => setPreferences((current) => ({ ...current, theme: "light" }))}><Sun size={17} /><span>Light</span></button>
                  <button className={preferences.theme === "dark" ? "active" : ""} type="button" onClick={() => setPreferences((current) => ({ ...current, theme: "dark" }))}><Moon size={17} /><span>Dark</span></button>
                  <button className={preferences.theme === "system" ? "active" : ""} type="button" onClick={() => setPreferences((current) => ({ ...current, theme: "system" }))}><Monitor size={17} /><span>System</span></button>
                </div>
              </div>
              <div className="settings-section">
                <span className="settings-label">Mermaid compatibility</span>
                <label className="version-setting">
                  <span><b>Rendering engine</b><small>Auto-detect uses the newest compatible bundled version.</small></span>
                  <select aria-label="Mermaid version" value={diagram.mermaidVersion || "auto"} onChange={(event) => void changeMermaidVersion(event.target.value as MermaidVersionPreference)}>
                    <option value="auto">Auto-detect (recommended)</option>
                    <option value="11.16.0">Mermaid 11.16.0 — latest</option>
                    <option value="10.9.6">Mermaid 10.9.6 — legacy</option>
                  </select>
                </label>
                <div className="version-status"><Check size={13} /><span>Currently rendering with Mermaid {activeMermaidVersion}</span></div>
              </div>
              <div className="settings-section">
                <span className="settings-label">Canvas and controls</span>
                <div className="settings-list">
                  <div className="settings-row"><div><b>Show canvas grid</b><span>Display the alignment grid behind diagrams.</span></div><button className={`toggle ${preferences.showGrid ? "on" : ""}`} type="button" role="switch" aria-label="Show canvas grid" aria-checked={preferences.showGrid} onClick={() => setPreferences((current) => ({ ...current, showGrid: !current.showGrid }))}><i /></button></div>
                  <div className="settings-row"><div><b>Snap nodes to grid</b><span>Align nodes to 20-pixel increments while dragging.</span></div><button className={`toggle ${preferences.snapToGrid ? "on" : ""}`} type="button" role="switch" aria-label="Snap nodes to grid" aria-checked={preferences.snapToGrid} onClick={() => setPreferences((current) => ({ ...current, snapToGrid: !current.snapToGrid }))}><i /></button></div>
                  <div className="settings-row"><div><b>Show shortcut labels</b><span>Keep keyboard hints visible on the left toolbar.</span></div><button className={`toggle ${preferences.showShortcutHints ? "on" : ""}`} type="button" role="switch" aria-label="Show shortcut labels" aria-checked={preferences.showShortcutHints} onClick={() => setPreferences((current) => ({ ...current, showShortcutHints: !current.showShortcutHints }))}><i /></button></div>
                </div>
              </div>
            </div>
            <footer><button type="button" onClick={() => setPreferences(DEFAULT_PREFERENCES)}>Reset preferences</button><span>Changes apply immediately</span></footer>
          </section>
        </div>
      )}

      {sourceOpen && (
        <div className="source-backdrop" onPointerDown={() => setSourceOpen(false)}>
          <section className="source-panel" onPointerDown={(event) => event.stopPropagation()}>
            <header><div><Code2 size={18} /><span><b>Mermaid source</b><small>Edit the code or copy it into Markdown</small></span></div><button type="button" onClick={() => setSourceOpen(false)}>Done</button></header>
            <div className="source-editor-wrap"><div className="line-numbers">{sourceDraft.split("\n").map((_, index) => <span key={index}>{index + 1}</span>)}</div><textarea aria-label="Mermaid source" spellCheck={false} value={sourceDraft} onChange={(event) => changeSourceDraft(event.target.value)} /></div>
            <footer><span title={`Minimum supported syntax: Mermaid ${sourceVersionDetection.minimum}`}><Check size={14} /> {sourceVersionDetection.label}</span><div><IconButton label="Undo source edit" disabled={!sourcePast.length} onClick={undoSourceDraft}><Undo2 size={15} /></IconButton><IconButton label="Redo source edit" disabled={!sourceFuture.length} onClick={redoSourceDraft}><Redo2 size={15} /></IconButton><button className="secondary-button" type="button" onClick={() => void copySourceDraft()}><Copy size={15} /> Copy</button><button className="primary-button" type="button" disabled={!sourceDirty} onClick={applySource}><RotateCcw size={15} /> Apply to canvas</button></div></footer>
          </section>
        </div>
      )}
      {toast && <div className="toast"><Check size={15} /> {toast}</div>}
    </main>
  );
}
