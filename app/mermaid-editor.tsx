"use client";

import {
  ArrowRight,
  AlertTriangle,
  BoxSelect,
  Check,
  ChevronDown,
  CircleHelp,
  CircleDot,
  Code2,
  Command,
  Copy,
  Download,
  ExternalLink,
  Group,
  Link2,
  Maximize2,
  Monitor,
  Moon,
  MousePointer2,
  Plus,
  Redo2,
  RotateCcw,
  Settings2,
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
  useMemo,
  useRef,
  useState,
} from "react";
import { SemanticVisualEditor } from "./semantic-visual-editor";
import { layoutFlowchart } from "./flowchart-layout";
import { flowchartShapePatch, FLOWCHART_SHAPE_GROUPS, FlowchartVisualShape, mermaidShapeClass, selectedFlowchartShape, visualShapeForMermaid } from "./flowchart-shapes";
import { diagramNameFromFile, MERMAID_IMPORT_ACCEPT, readImportedMermaid } from "./mermaid-import";
import { helpForDiagram } from "./mermaid-help";
import { normalizeRenderedSvg, normalizeSvgMarkup } from "./mermaid-rendering";
import { createRepairProposals, RepairProposal, RepairVersion } from "./mermaid-repair";
import { applyDiagramStyle, DEFAULT_DIAGRAM_STYLE, DiagramStyle, MermaidLayout, MermaidLook, MermaidTheme, readDiagramStyle } from "./mermaid-style";
import { detectDiagramType, MERMAID_DIAGRAM_TYPES, visualModeLabel } from "./mermaid-types";

type NodeShape = FlowchartVisualShape;
type EdgeStyle = "solid" | "dashed" | "thick";
type ThemeMode = "light" | "dark" | "system";
type SupportedMermaidVersion = "11.16.0" | "10.9.6";
type MermaidVersionPreference = "auto" | SupportedMermaidVersion;

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
  targetView: "free" | "mermaid";
};

type Diagram = {
  name: string;
  direction: "LR" | "TB";
  source?: string;
  mermaidVersion?: MermaidVersionPreference;
  detectedMermaidVersion?: SupportedMermaidVersion;
  style?: DiagramStyle;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  groups: DiagramGroup[];
};

const COLORS = ["#ffffff", "#fffdfa", "#fde8f1", "#e6f8f1", "#fff1da", "#e9f2ff", "#ffe9ee", "#e8f8fb", "#f2f3f5"];
const BOARD_WIDTH = 3200;
const BOARD_HEIGHT = 2200;
const CANVAS_MARGIN = 700;
const MIN_ZOOM = 0.25;
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
  return LAYOUT_OPTIONS.filter(({ value }) => value !== "cose-bilkent" || diagramTypeId === "mindmap");
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

async function renderMermaidSvg(mermaid: Awaited<ReturnType<typeof loadMermaid>>, id: string, source: string) {
  const renderContainer = document.createElement("div");
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
  diagram.edges.forEach((edge) => {
    const link = edge.arrow === false
      ? (edge.style === "dashed" ? "-.-" : edge.style === "thick" ? "===" : "---")
      : (edge.style === "dashed" ? "-.->" : edge.style === "thick" ? "==>" : "-->");
    const label = edge.label ? `|"${safeLabel(edge.label)}"|` : "";
    lines.push(`  ${edge.from} ${link}${label} ${edge.to}`);
  });
  diagram.nodes.forEach((node) => {
    lines.push(`  style ${node.id} fill:${node.color},stroke:#77737f,color:${node.textColor},stroke-width:1.5px`);
  });
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
    ["rounded", /^(\w+)\(\["?(.*?)"?\]\)$/],
    ["circle", /^(\w+)\(\("?(.*?)"?\)\)$/],
    ["hexagon", /^(\w+)\{\{"?(.*?)"?\}\}$/],
    ["diamond", /^(\w+)\{"?(.*?)"?\}$/],
    ["rectangle", /^(\w+)\["?(.*?)"?\]$/],
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
    const expanded = text.match(/^(\w+)@\{\s*(.*?)\s*\}$/);
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
    const plain = text.match(/^(\w+)$/);
    if (plain) {
      addNode(plain[1], plain[1], "rectangle", false);
      return plain[1];
    }
    return null;
  };

  lines.forEach((line) => {
    if (line === header || line.startsWith("%%") || /^direction\s+(LR|RL|TB|TD|BT)$/.test(line)) return;
    const groupMatch = line.match(/^subgraph\s+(\w+)\["?(.*?)"?\]$/);
    if (groupMatch) {
      currentGroup = groupMatch[1];
      groups.push({ id: groupMatch[1], label: groupMatch[2] });
      return;
    }
    if (line === "end") {
      currentGroup = undefined;
      return;
    }
    const styleMatch = line.match(/^style\s+(\w+)\s+fill:(#[\da-fA-F]{6}).*color:(#[\da-fA-F]{6})/);
    if (styleMatch) {
      styles.set(styleMatch[1], { color: styleMatch[2], textColor: styleMatch[3] });
      return;
    }
    const edgeMatch = line.match(/^(.+?)\s+(-\.->|-\.-|==>|===|-->|---)(?:\|"?(.*?)"?\|)?\s+(.+)$/);
    if (edgeMatch) {
      const from = parseNode(edgeMatch[1]);
      const to = parseNode(edgeMatch[4]);
      if (!from || !to) return;
      edges.push({
        id: `e${edges.length + 1}`,
        from,
        to,
        label: edgeMatch[3] || "",
        style: edgeMatch[2].startsWith("-.") ? "dashed" : edgeMatch[2].startsWith("==") ? "thick" : "solid",
        arrow: edgeMatch[2].endsWith(">"),
      });
      return;
    }
    parseNode(line);
  });

  if (!nodes.size) return null;
  styles.forEach((style, id) => {
    const node = nodes.get(id);
    if (node) nodes.set(id, { ...node, ...style });
  });
  const parsedNodes = [...nodes.values()];
  const positions = layoutFlowchart(parsedNodes, edges, direction);
  return {
    ...previous,
    direction,
    nodes: parsedNodes.map((node) => ({ ...node, ...positions.get(node.id) })),
    edges,
    groups,
  };
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
  const [viewMode, setViewMode] = useState<"free" | "mermaid">("mermaid");
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [preferences, setPreferences] = useState<EditorPreferences>(DEFAULT_PREFERENCES);
  const [storageReady, setStorageReady] = useState(false);
  const [toast, setToast] = useState("");
  const [editingNode, setEditingNode] = useState<string | null>(null);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [mermaidSize, setMermaidSize] = useState({ width: 1200, height: 800 });
  const [mermaidRenderError, setMermaidRenderError] = useState("");
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
  const dragRef = useRef<null | { startX: number; startY: number; nodes: Map<string, { x: number; y: number }> }>(null);
  const marqueeRef = useRef<MarqueeSelection | null>(null);
  const marqueeSurfaceRef = useRef<HTMLDivElement | null>(null);
  const edgeCounter = useRef(initialDiagram.edges.length + 1);
  const mermaidRenderCounter = useRef(0);
  const selectedRef = useRef(selected);
  const shouldFitMermaidRef = useRef(true);
  const shouldFitFreeformRef = useRef(false);
  const pendingViewAnchorRef = useRef<PendingViewAnchor | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typeMenuRef = useRef<HTMLDivElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const sourceLastEditAtRef = useRef(0);
  const diagramRef = useRef(diagram);

  const diagramStyle = diagram.style || DEFAULT_DIAGRAM_STYLE;
  const source = useMemo(() => applyDiagramStyle(diagram.source ?? toMermaid(diagram), diagram.style || DEFAULT_DIAGRAM_STYLE), [diagram]);
  const activeDiagramType = useMemo(() => detectDiagramType(source) || MERMAID_DIAGRAM_TYPES[0], [source]);
  const activeHelp = useMemo(() => helpForDiagram(activeDiagramType.id), [activeDiagramType.id]);
  const visualModeName = visualModeLabel(activeDiagramType.family);
  const visualEditingHelp = activeDiagramType.family === "freeform"
    ? "FreeForm exposes nodes and relationships spatially. Mermaid view remains available for the exact rendered result and source-level control."
    : activeDiagramType.family === "structured"
      ? "Structured editing preserves the ordered statements and interactions that define this diagram. Mermaid view shows the exact rendered result."
      : "Data editing keeps labels, values, axes, and series explicit while Mermaid view shows the exact rendered result.";
  const nativeFlowchart = activeDiagramType.id === "flowchart" && diagram.source === undefined;
  const activeMermaidVersion = resolvedMermaidVersion(diagram);
  const modernStyleFeatures = activeMermaidVersion !== "10.9.6";
  const availableLayoutOptions = layoutOptionsForDiagram(activeDiagramType.id);
  const layoutSupported = modernStyleFeatures && LAYOUT_CAPABLE_DIAGRAMS.has(activeDiagramType.id);
  const sourceVersionDetection = useMemo(() => detectMermaidVersion(sourceDraft), [sourceDraft]);
  const selectedNode = selected.length === 1 ? diagram.nodes.find((node) => node.id === selected[0]) : undefined;
  const selectedEdge = selected.length === 1 ? diagram.edges.find((edge) => edge.id === selected[0]) : undefined;
  const selectedGroup = selected.length === 1 ? diagram.groups.find((group) => group.id === selected[0]) : undefined;
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

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    diagramRef.current = diagram;
  }, [diagram]);

  const restoreViewAnchor = useCallback((targetView: "free" | "mermaid") => {
    const pending = pendingViewAnchorRef.current;
    const scroller = scrollRef.current;
    if (!pending || pending.targetView !== targetView || !scroller) return false;
    const root = targetView === "free" ? boardRef.current : mermaidViewRef.current;
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
    const savedDiagram = readStoredObject("mermade-diagram");
    const savedPreferences = readStoredObject("mermade-preferences");
    let showWelcome = true;
    try { showWelcome = !localStorage.getItem(ONBOARDING_KEY); } catch { /* private browsing can block storage */ }
    queueMicrotask(() => {
      if (savedDiagram && Array.isArray(savedDiagram.nodes) && Array.isArray(savedDiagram.edges) && Array.isArray(savedDiagram.groups)) {
        const restored = savedDiagram as unknown as Diagram;
        setDiagram({ ...restored, style: { ...DEFAULT_DIAGRAM_STYLE, ...(restored.style || {}) } });
      }
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
    if (!storageReady) return;
    const timer = window.setTimeout(() => writeStoredValue("mermade-diagram", JSON.stringify(diagram)), 180);
    return () => window.clearTimeout(timer);
  }, [diagram, storageReady]);

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
      try {
        const mermaid = await loadMermaid(activeMermaidVersion, activeDiagramType.id, diagramStyle.layout);
        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          securityLevel: "strict",
          flowchart: { htmlLabels: true, curve: "basis", useMaxWidth: false },
        });
        const renderId = `mermade-view-${mermaidRenderCounter.current++}`;
        // Use a temporary non-React container. Block Diagram measures live DOM,
        // while its debug serialisation cannot traverse React's circular metadata.
        const { svg } = await renderMermaidSvg(mermaid, renderId, source);
        if (cancelled) return;

        host.innerHTML = svg;
        const svgElement = host.querySelector("svg");
        if (svgElement) normalizeRenderedSvg(svgElement, activeDiagramType.id, source);
        const viewBox = svgElement?.viewBox.baseVal;
        const width = Math.max(480, Math.ceil(viewBox?.width || 1200));
        const height = Math.max(320, Math.ceil(viewBox?.height || 800));

        const renderedDiagram = diagramRef.current;
        const nodeIds = renderedDiagram.nodes.map((node) => node.id).sort((a, b) => b.length - a.length);
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
        host.querySelectorAll<HTMLElement>("[data-node-id], [data-edge-id], [data-group-id]").forEach((element) => {
          const id = element.dataset.nodeId || element.dataset.edgeId || element.dataset.groupId;
          element.classList.toggle("selected", Boolean(id && selectedRef.current.includes(id)));
        });

        setMermaidSize({ width, height });
        setMermaidRenderError("");
        if (pendingViewAnchorRef.current?.targetView === "mermaid") {
          requestAnimationFrame(() => requestAnimationFrame(() => restoreViewAnchor("mermaid")));
        } else if (shouldFitMermaidRef.current && scrollRef.current) {
          shouldFitMermaidRef.current = false;
          const scroller = scrollRef.current;
          const nextZoom = clampZoom(Math.min(scroller.clientWidth / (width + 180), scroller.clientHeight / (height + 180), 1.35));
          setZoom(nextZoom);
          requestAnimationFrame(() => {
            scroller.scrollLeft = (CANVAS_MARGIN + width / 2) * nextZoom - scroller.clientWidth / 2;
            scroller.scrollTop = (CANVAS_MARGIN + height / 2) * nextZoom - scroller.clientHeight / 2;
          });
        }
      } catch (error) {
        if (cancelled) return;
        setMermaidRenderError(error instanceof Error ? error.message : "Unable to render this Mermaid diagram");
      }
    };

    const timer = window.setTimeout(() => void renderDiagram(), 60);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeDiagramType.id, activeMermaidVersion, diagramStyle.layout, restoreViewAnchor, source, viewMode]);

  useEffect(() => {
    if (viewMode !== "mermaid" || !mermaidViewRef.current) return;
    mermaidViewRef.current.querySelectorAll<HTMLElement>("[data-node-id], [data-edge-id], [data-group-id]").forEach((element) => {
      const id = element.dataset.nodeId || element.dataset.edgeId || element.dataset.groupId;
      element.classList.toggle("selected", Boolean(id && selected.includes(id)));
    });
  }, [mermaidSize, selected, viewMode]);

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
    const apply = (current: Diagram) => ({ ...current, nodes: current.nodes.map((node) => node.id === id ? { ...node, ...patch } : node) });
    if (save) commit(apply); else setDiagram(apply);
  };

  const updateEdge = (id: string, patch: Partial<DiagramEdge>, save = true) => {
    const apply = (current: Diagram) => ({ ...current, edges: current.edges.map((edge) => edge.id === id ? { ...edge, ...patch } : edge) });
    if (save) commit(apply); else setDiagram(apply);
  };

  const addNode = (shape: NodeShape = "rectangle", connectFromSelection = false) => {
    const origin = connectFromSelection && selected.length === 1
      ? diagram.nodes.find((node) => node.id === selected[0])
      : undefined;
    if (connectFromSelection && !origin) {
      notify("Select one node before using Shift+N");
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
    commit((current) => ({ ...current, nodes: [...current.nodes, node], edges: edge ? [...current.edges, edge] : current.edges }));
    setSelected([id]);
    setEditingNode(id);
    if (edge) notify("Connected step created");
  };

  const deleteSelected = () => {
    if (!selected.length) return;
    const ids = new Set(selected);
    commit((current) => ({
      ...current,
      nodes: current.nodes.filter((node) => !ids.has(node.id)),
      edges: current.edges.filter((edge) => !ids.has(edge.id) && !ids.has(edge.from) && !ids.has(edge.to)),
      groups: current.groups.filter((group) => !ids.has(group.id)),
    }));
    setSelected([]);
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

    if (viewMode === "mermaid") {
      const nextZoom = clampZoom(Math.min(scroller.clientWidth / (mermaidSize.width + 180), scroller.clientHeight / (mermaidSize.height + 180), 1.35));
      setZoom(nextZoom);
      requestAnimationFrame(() => {
        scroller.scrollLeft = (CANVAS_MARGIN + mermaidSize.width / 2) * nextZoom - scroller.clientWidth / 2;
        scroller.scrollTop = (CANVAS_MARGIN + mermaidSize.height / 2) * nextZoom - scroller.clientHeight / 2;
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
        setConnectionStart(null);
        setTool("select");
        return;
      }
      if (editing || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;

      if (!nativeFlowchart && ["n", "v", "l", "s", "d", "m"].includes(key)) {
        event.preventDefault();
        notify(`${visualModeName} diagrams use diagram-specific statement controls`);
        return;
      }

      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        deleteSelected();
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
        addNode("diamond");
      } else if (key === "m") {
        event.preventDefault();
        setTool("marquee");
        setConnectionStart(null);
        notify("Drag across the canvas to select nodes");
      } else if (key === "f") {
        event.preventDefault();
        fitView();
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
    }));
    setSelected([]);
  };

  const beginCanvasPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!nativeFlowchart || event.button !== 0 || tool === "connect") return;
    if (viewMode === "mermaid" && tool !== "marquee") return;
    const selectionSurface = viewMode === "mermaid" ? mermaidStageRef.current : boardRef.current;
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
      commit((current) => ({ ...current, edges: [...current.edges, newEdge] }));
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
    if (tool === "marquee") return;
    const element = (event.target as Element).closest<HTMLElement>("[data-node-id], [data-edge-id], [data-group-id]");
    if (!element) {
      setSelected([]);
      setEditingNode(null);
      setEditingGroup(null);
      return;
    }
    event.stopPropagation();
    const nodeId = element.dataset.nodeId;
    if (tool === "connect" && nodeId) {
      connectNode(nodeId);
      return;
    }
    const id = nodeId || element.dataset.edgeId || element.dataset.groupId;
    if (!id) return;
    setSelected(event.shiftKey ? (selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]) : [id]);
  };

  const editMermaidElement = (event: React.MouseEvent<HTMLDivElement>) => {
    const element = (event.target as Element).closest<HTMLElement>("[data-node-id], [data-group-id]");
    const nodeId = element?.dataset.nodeId;
    const groupId = element?.dataset.groupId;
    if (!nodeId && !groupId) return;
    event.stopPropagation();
    if (nodeId) {
      setSelected([nodeId]);
      setEditingNode(nodeId);
      setEditingGroup(null);
    } else if (groupId) {
      setSelected([groupId]);
      setEditingGroup(groupId);
      setEditingNode(null);
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
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportSvg = async () => {
    try {
      const mermaid = await loadMermaid(activeMermaidVersion, activeDiagramType.id, diagramStyle.layout);
      mermaid.initialize({ startOnLoad: false, theme: "base", securityLevel: "strict", flowchart: { htmlLabels: true, curve: "basis" } });
      const { svg } = await renderMermaidSvg(mermaid, `mermade-${Date.now()}`, source);
      download(normalizeSvgMarkup(svg, activeDiagramType.id, source), `${diagram.name.toLowerCase().replace(/\W+/g, "-")}.svg`, "image/svg+xml");
      setExportOpen(false);
      notify("SVG exported");
    } catch (error) {
      notify(error instanceof Error ? `SVG export failed: ${error.message}` : "SVG export failed");
    }
  };

  const validateSource = async (candidate: string, version: SupportedMermaidVersion) => {
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
  };

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
      if (parsedFlowchart) shouldFitFreeformRef.current = true;
      commit((current) => parsedFlowchart ? {
        ...parsedFlowchart,
        name: current.name,
        source: undefined,
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
      shouldFitMermaidRef.current = true;
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Mermaid rejected this source" };
    }
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

      setDiagram((current) => ({ ...current, name: diagramNameFromFile(file.name) }));
      setSourceDraft(imported.source);
      setSourceDirty(false);
      setSourceOpen(false);
      setExportOpen(false);
      setViewMode("mermaid");
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

    const result = await validateAndCommitSource(nextType.template);
    if (!result.ok) {
      notify(result.error || `Mermaid could not create the ${nextType.label}`);
      return;
    }
    setSourceDraft(nextType.template);
    setSourceDirty(false);
    setViewMode("mermaid");
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

  const switchCanvasView = (targetView: "free" | "mermaid") => {
    if (targetView === viewMode) return;
    const scroller = scrollRef.current;
    const root = viewMode === "free" ? boardRef.current : mermaidViewRef.current;
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
    if (targetView === "free") shouldFitFreeformRef.current = false;
    setViewMode(targetView);
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
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" style={{ backgroundImage: `url(${PUBLIC_BASE_PATH}/brand/logo-mark.svg)` }} aria-hidden="true" />
          <div className="brand-name">mermade</div>
          <div className="top-divider" />
          <input className="document-name" aria-label="Diagram name" value={diagram.name} onFocus={checkpoint} onChange={(event) => setDiagram((current) => ({ ...current, name: event.target.value }))} />
          <span className="save-status"><Check size={13} /> Saved locally</span>
        </div>
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
                <button type="button" onClick={exportSvg}><ExternalLink size={16} /><span><b>Vector image</b><small>Download SVG</small></span></button>
              </div>
            )}
          </div>
        </div>
      </header>

      <section className="workspace">
        <aside className={`tool-rail ${preferences.showShortcutHints ? "" : "hide-shortcuts"}`} aria-label="Canvas tools" data-tour="canvas-tools">
          <div className="tool-group">
            <IconButton label="Select (V)" shortcut="V" disabled={!nativeFlowchart} active={nativeFlowchart && tool === "select"} onClick={() => { setTool("select"); setConnectionStart(null); }}><MousePointer2 size={19} /></IconButton>
            <IconButton label="Marquee select (M)" shortcut="M" disabled={!nativeFlowchart} active={nativeFlowchart && tool === "marquee"} onClick={() => { setTool("marquee"); setConnectionStart(null); }}><BoxSelect size={19} /></IconButton>
            <IconButton label="Add node (N)" shortcut="N" disabled={!nativeFlowchart} onClick={() => addNode()}><Plus size={20} /></IconButton>
            <IconButton label="Link nodes (L)" shortcut="L" disabled={!nativeFlowchart} active={nativeFlowchart && tool === "connect"} onClick={() => { setTool("connect"); setConnectionStart(null); notify("Choose the first node"); }}><Link2 size={19} /></IconButton>
            <IconButton label="Create subgraph (S)" shortcut="S" disabled={!nativeFlowchart} onClick={groupSelected}><Group size={19} /></IconButton>
          </div>
          <div className="tool-separator" />
          <div className="tool-group">
            <IconButton label="Add decision (D)" shortcut="D" disabled={!nativeFlowchart} onClick={() => addNode("diamond")}><CircleDot size={19} /></IconButton>
            <IconButton label="Fit chart (F)" shortcut="F" onClick={fitView}><Maximize2 size={19} /></IconButton>
            <IconButton label="Organise chart (O)" shortcut="O" disabled={!nativeFlowchart} onClick={organizeFlowchart}><Workflow size={19} /></IconButton>
          </div>
          <div className="rail-spacer" />
          <div className="rail-help-stack" data-tour="help-settings">
            <IconButton label={`${activeDiagramType.label} help`} active={helpOpen} onClick={() => { setHelpOpen((open) => !open); setShortcutsOpen(false); setSettingsOpen(false); }}><CircleHelp size={19} /></IconButton>
            <IconButton label="Keyboard shortcuts" active={shortcutsOpen} onClick={() => { setShortcutsOpen((open) => !open); setSettingsOpen(false); setHelpOpen(false); }}><Command size={19} /></IconButton>
            <IconButton label="Settings" active={settingsOpen} onClick={() => { setSettingsOpen(true); setShortcutsOpen(false); setHelpOpen(false); }}><Settings2 size={19} /></IconButton>
          </div>
        </aside>

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
            <div className="canvas-view-controls" data-tour="canvas-views" onPointerDown={(event) => event.stopPropagation()}>
              {nativeFlowchart && <div className="direction-switch" aria-label="Chart direction">
                <button className={diagram.direction === "LR" ? "active" : ""} type="button" onClick={(event) => { event.stopPropagation(); commit((current) => ({ ...current, direction: "LR" })); }}>Left → right</button>
                <button className={diagram.direction === "TB" ? "active" : ""} type="button" onClick={(event) => { event.stopPropagation(); commit((current) => ({ ...current, direction: "TB" })); }}>Top ↓ bottom</button>
              </div>}
              <div className="view-switch" aria-label="Canvas view">
                <button className={viewMode === "free" ? "active" : ""} type="button" onClick={(event) => { event.stopPropagation(); switchCanvasView("free"); }}><MousePointer2 size={12} /> {visualModeName}</button>
                <button className={viewMode === "mermaid" ? "active" : ""} type="button" onClick={(event) => { event.stopPropagation(); switchCanvasView("mermaid"); }}><Sparkles size={12} /> Mermaid</button>
              </div>
            </div>
          </div>
          {viewMode === "free" && !nativeFlowchart ? (
            <SemanticVisualEditor key={`${activeDiagramType.id}:${source}`} source={source} type={activeDiagramType} onCommit={validateAndCommitSource} />
          ) : <div ref={scrollRef} className="canvas-scroll">
            <div
              className={`diagram-surface ${preferences.showGrid ? "" : "hide-grid"}`}
              onPointerDown={beginCanvasPointer}
              style={{
                width: ((viewMode === "free" ? BOARD_WIDTH : mermaidSize.width) + CANVAS_MARGIN * 2) * zoom,
                height: ((viewMode === "free" ? BOARD_HEIGHT : mermaidSize.height) + CANVAS_MARGIN * 2) * zoom,
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
                className="mermaid-stage"
                style={{ left: CANVAS_MARGIN * zoom, top: CANVAS_MARGIN * zoom, width: mermaidSize.width, height: mermaidSize.height, transform: `scale(${zoom})` }}
                onPointerDown={selectMermaidElement}
                onDoubleClick={editMermaidElement}
              >
                <div ref={mermaidViewRef} className="mermaid-render" />
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
                {mermaidRenderError && <div className="mermaid-render-error"><Code2 size={20} /><b>Mermaid could not render this diagram</b><span>{mermaidRenderError}</span></div>}
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
                onChange={(event) => setDiagram((current) => ({ ...current, groups: current.groups.map((group) => group.id === selectedGroup.id ? { ...group, label: event.target.value } : group) }))}
                onBlur={() => setEditingGroup(null)}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === "Escape") setEditingGroup(null); }}
              />
            </div>
          )}

          {(viewMode === "mermaid" || nativeFlowchart) && <><div className="canvas-hint"><BoxSelect size={15} /> Click to select · Double-click to edit · Scroll to pan · ⌘ scroll to zoom</div>
          <div className="zoom-controls" data-tour="canvas-navigation">
            <IconButton label="Zoom out" onClick={() => zoomAtViewportCenter(zoom - 0.1)}><ZoomOut size={17} /></IconButton>
            <button type="button" onClick={fitView}>{Math.round(zoom * 100)}%</button>
            <IconButton label="Zoom in" onClick={() => zoomAtViewportCenter(zoom + 0.1)}><ZoomIn size={17} /></IconButton>
            <span />
            <IconButton label="Fit to canvas" onClick={fitView}><Maximize2 size={17} /></IconButton>
          </div></>}
          {nativeFlowchart && tool === "connect" && <div className="mode-banner"><Link2 size={15} /> {connectionStart ? "Now choose a destination" : "Choose a starting node"}</div>}
          {nativeFlowchart && tool === "marquee" && <div className="mode-banner"><BoxSelect size={15} /> Drag across nodes · Shift-drag to add</div>}
        </section>

        <aside className="inspector" data-tour="inspector">
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
                <label><span>Name</span><input value={diagram.groups.find((group) => group.id === selected[0])?.label || ""} onFocus={checkpoint} onChange={(event) => setDiagram((current) => ({ ...current, groups: current.groups.map((group) => group.id === selected[0] ? { ...group, label: event.target.value } : group) }))} /></label>
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
