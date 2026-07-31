"use client";

import {
  ArrowRight,
  BoxSelect,
  Check,
  ChevronDown,
  CircleDot,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Frame,
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
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type NodeShape = "rectangle" | "rounded" | "diamond" | "circle" | "hexagon" | "document" | "framed";
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

type Diagram = {
  name: string;
  direction: "LR" | "TB";
  mermaidVersion?: MermaidVersionPreference;
  detectedMermaidVersion?: SupportedMermaidVersion;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  groups: DiagramGroup[];
};

const COLORS = ["#fffdfa", "#fde8f1", "#e6f8f1", "#fff1da", "#e9f2ff", "#ffe9ee", "#e8f8fb", "#f2f3f5"];
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

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function detectMermaidVersion(source: string) {
  const declaredVersion = source.match(/%%\s*mermaid(?:-|\s+)version\s*[:=]\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/i);
  if (declaredVersion?.[1] && Number(declaredVersion[1]) <= 10) {
    return { recommended: "10.9.6" as const, minimum: "10.x", label: "Declared Mermaid 10.x source" };
  }
  if (/@\{\s*[^}]*\bshape\s*:/m.test(source)) {
    return { recommended: LATEST_MERMAID_VERSION, minimum: "11.3.0", label: "Mermaid 11.3+ expanded-shape syntax" };
  }
  return { recommended: LATEST_MERMAID_VERSION, minimum: "10.0.0", label: "Classic flowchart syntax" };
}

function resolvedMermaidVersion(diagram: Diagram): SupportedMermaidVersion {
  const preference = diagram.mermaidVersion || "auto";
  return preference === "auto" ? (diagram.detectedMermaidVersion || LATEST_MERMAID_VERSION) : preference;
}

async function loadMermaid(version: SupportedMermaidVersion) {
  if (version === "10.9.6") return (await import("mermaid-v10")).default;
  return (await import("mermaid")).default;
}

const initialDiagram: Diagram = {
  name: "Checkout flow",
  direction: "LR",
  mermaidVersion: "auto",
  detectedMermaidVersion: LATEST_MERMAID_VERSION,
  groups: [
    { id: "checkout", label: "Checkout" },
    { id: "fulfillment", label: "Fulfillment" },
  ],
  nodes: [
    { id: "cart", label: "Cart", x: 78, y: 276, width: 126, height: 58, shape: "rounded", color: "#fffdfa", textColor: "#24232a" },
    { id: "details", label: "Customer details", x: 292, y: 182, width: 164, height: 62, shape: "rectangle", color: "#fde8f1", textColor: "#282332", groupId: "checkout" },
    { id: "payment", label: "Payment", x: 292, y: 332, width: 164, height: 62, shape: "rectangle", color: "#e9f2ff", textColor: "#242b36", groupId: "checkout" },
    { id: "approved", label: "Approved?", x: 535, y: 257, width: 110, height: 96, shape: "diamond", color: "#fff1da", textColor: "#332b20" },
    { id: "order", label: "Create order", x: 730, y: 182, width: 160, height: 62, shape: "rectangle", color: "#e6f8f1", textColor: "#1f2e28", groupId: "fulfillment" },
    { id: "email", label: "Send confirmation", x: 730, y: 332, width: 160, height: 62, shape: "rectangle", color: "#e8f8fb", textColor: "#1e2f32", groupId: "fulfillment" },
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
  let positionIndex = 0;

  const legacyPatterns: Array<[NodeShape, RegExp]> = [
    ["rounded", /^(\w+)\(\["?(.*?)"?\]\)$/],
    ["circle", /^(\w+)\(\("?(.*?)"?\)\)$/],
    ["hexagon", /^(\w+)\{\{"?(.*?)"?\}\}$/],
    ["diamond", /^(\w+)\{"?(.*?)"?\}$/],
    ["rectangle", /^(\w+)\["?(.*?)"?\]$/],
  ];

  const shapeFromMermaid = (shape: string): NodeShape => {
    if (shape === "stadium" || shape === "rounded") return "rounded";
    if (shape === "diam" || shape === "diamond") return "diamond";
    if (shape === "circle" || shape === "f-circ") return "circle";
    if (shape === "hex" || shape === "hexagon") return "hexagon";
    if (shape === "doc" || shape === "docs" || shape === "lin-doc") return "document";
    if (shape === "fr-rect" || shape === "div-rect") return "framed";
    return "rectangle";
  };

  const addNode = (id: string, label = id, shape: NodeShape = "rectangle", explicit = false, mermaidShape?: string) => {
    const existing = nodes.get(id);
    if (existing) {
      if (explicit) nodes.set(id, { ...existing, label, shape, mermaidShape, groupId: currentGroup ?? existing.groupId });
      return;
    }
    const old = previous.nodes.find((node) => node.id === id);
    const col = positionIndex % 4;
    const row = Math.floor(positionIndex / 4);
    positionIndex += 1;
    nodes.set(id, old ? { ...old, label, shape, mermaidShape, groupId: currentGroup } : {
      id, label, shape, mermaidShape, groupId: currentGroup,
      x: 100 + col * 230, y: 140 + row * 150,
      width: shape === "circle" ? 82 : 150,
      height: shape === "diamond" ? 96 : shape === "circle" ? 82 : 62,
      color: "#fffdfa", textColor: "#24232a",
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
  return { ...previous, direction, nodes: [...nodes.values()], edges, groups };
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
  const [tab, setTab] = useState<"properties" | "style">("properties");
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceDraft, setSourceDraft] = useState("");
  const [sourceDirty, setSourceDirty] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preferences, setPreferences] = useState<EditorPreferences>(DEFAULT_PREFERENCES);
  const [toast, setToast] = useState("");
  const [editingNode, setEditingNode] = useState<string | null>(null);
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [mermaidSize, setMermaidSize] = useState({ width: 1200, height: 800 });
  const [mermaidRenderError, setMermaidRenderError] = useState("");
  const [marquee, setMarquee] = useState<MarqueeSelection | null>(null);
  const history = useRef<Diagram[]>([]);
  const future = useRef<Diagram[]>([]);
  const boardRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const mermaidViewRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<null | { startX: number; startY: number; nodes: Map<string, { x: number; y: number }> }>(null);
  const marqueeRef = useRef<MarqueeSelection | null>(null);
  const edgeCounter = useRef(initialDiagram.edges.length + 1);
  const mermaidRenderCounter = useRef(0);
  const shouldFitMermaidRef = useRef(true);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const source = useMemo(() => toMermaid(diagram), [diagram]);
  const activeMermaidVersion = resolvedMermaidVersion(diagram);
  const sourceVersionDetection = useMemo(() => detectMermaidVersion(sourceDraft), [sourceDraft]);
  const selectedNode = selected.length === 1 ? diagram.nodes.find((node) => node.id === selected[0]) : undefined;
  const selectedEdge = selected.length === 1 ? diagram.edges.find((edge) => edge.id === selected[0]) : undefined;
  const selectedGroup = selected.length === 1 ? diagram.groups.find((group) => group.id === selected[0]) : undefined;

  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
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
    try {
      const saved = localStorage.getItem("mermade-diagram");
      if (saved) queueMicrotask(() => setDiagram(JSON.parse(saved)));
      const savedPreferences = localStorage.getItem("mermade-preferences");
      if (savedPreferences) queueMicrotask(() => setPreferences({ ...DEFAULT_PREFERENCES, ...JSON.parse(savedPreferences) }));
    } catch { /* local drafts are best-effort */ }
  }, []);

  useEffect(() => {
    localStorage.setItem("mermade-diagram", JSON.stringify(diagram));
  }, [diagram]);

  useEffect(() => {
    localStorage.setItem("mermade-preferences", JSON.stringify(preferences));
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      root.dataset.theme = preferences.theme === "system" ? (media.matches ? "dark" : "light") : preferences.theme;
    };
    applyTheme();
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [preferences]);

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

      if (marqueeRef.current && boardRef.current) {
        const rect = boardRef.current.getBoundingClientRect();
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
      if (!marqueeRef.current || !boardRef.current) return;

      const boardRect = boardRef.current.getBoundingClientRect();
      const finished = {
        ...marqueeRef.current,
        currentX: (event.clientX - boardRect.left) / zoom,
        currentY: (event.clientY - boardRect.top) / zoom,
      };
      const left = Math.min(finished.startX, finished.currentX);
      const top = Math.min(finished.startY, finished.currentY);
      const right = Math.max(finished.startX, finished.currentX);
      const bottom = Math.max(finished.startY, finished.currentY);
      const hasArea = right - left > 3 && bottom - top > 3;
      const hits = hasArea ? diagram.nodes.filter((node) => (
        node.x < right && node.x + node.width > left && node.y < bottom && node.y + node.height > top
      )).map((node) => node.id) : [];

      setSelected((current) => finished.additive ? [...new Set([...current, ...hits])] : hits);
      marqueeRef.current = null;
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
        const mermaid = await loadMermaid(activeMermaidVersion);
        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          securityLevel: "strict",
          flowchart: { htmlLabels: true, curve: "basis", useMaxWidth: false },
        });
        const renderId = `mermade-view-${mermaidRenderCounter.current++}`;
        const { svg } = await mermaid.render(renderId, source);
        if (cancelled) return;

        host.innerHTML = svg;
        const svgElement = host.querySelector("svg");
        const viewBox = svgElement?.viewBox.baseVal;
        const width = Math.max(480, Math.ceil(viewBox?.width || 1200));
        const height = Math.max(320, Math.ceil(viewBox?.height || 800));

        const nodeIds = diagram.nodes.map((node) => node.id).sort((a, b) => b.length - a.length);
        host.querySelectorAll<HTMLElement>(".node").forEach((element) => {
          const id = nodeIds.find((nodeId) => element.id === nodeId || element.id.includes(`-${nodeId}-`) || element.id.endsWith(`-${nodeId}`));
          if (id) element.dataset.nodeId = id;
        });
        const groupIds = diagram.groups.map((group) => group.id).sort((a, b) => b.length - a.length);
        host.querySelectorAll<HTMLElement>(".cluster").forEach((element) => {
          const id = groupIds.find((groupId) => element.id === groupId || element.id.endsWith(`-${groupId}`));
          if (id) element.dataset.groupId = id;
        });
        host.querySelectorAll<HTMLElement>(".edgePaths path").forEach((element, index) => {
          const edge = diagram.edges[index];
          if (!edge) return;
          element.dataset.edgeId = edge.id;
          const hitTarget = element.cloneNode(false) as HTMLElement;
          hitTarget.removeAttribute("id");
          hitTarget.dataset.edgeId = edge.id;
          hitTarget.classList.add("mermaid-edge-hit");
          element.parentNode?.insertBefore(hitTarget, element);
        });
        host.querySelectorAll<HTMLElement>(".edgeLabels .edgeLabel").forEach((element, index) => {
          const edge = diagram.edges[index];
          if (edge) element.dataset.edgeId = edge.id;
        });
        host.querySelectorAll<HTMLElement>("[data-node-id], [data-edge-id], [data-group-id]").forEach((element) => {
          const id = element.dataset.nodeId || element.dataset.edgeId || element.dataset.groupId;
          element.classList.toggle("selected", Boolean(id && selected.includes(id)));
        });

        setMermaidSize({ width, height });
        setMermaidRenderError("");
        if (shouldFitMermaidRef.current && scrollRef.current) {
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
        setMermaidRenderError(error instanceof Error ? error.message : "Unable to render this Mermaid flowchart");
      }
    };

    void renderDiagram();
    return () => { cancelled = true; };
  }, [activeMermaidVersion, diagram.edges, diagram.groups, diagram.nodes, selected, source, viewMode]);

  useEffect(() => {
    if (viewMode !== "mermaid" || !mermaidViewRef.current) return;
    mermaidViewRef.current.querySelectorAll<HTMLElement>("[data-node-id], [data-edge-id], [data-group-id]").forEach((element) => {
      const id = element.dataset.nodeId || element.dataset.edgeId || element.dataset.groupId;
      element.classList.toggle("selected", Boolean(id && selected.includes(id)));
    });
  }, [mermaidSize, selected, viewMode]);

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

  const addNode = (shape: NodeShape = "rectangle") => {
    const idBase = "node";
    let count = diagram.nodes.length + 1;
    while (diagram.nodes.some((node) => node.id === `${idBase}${count}`)) count += 1;
    const id = `${idBase}${count}`;
    const node: DiagramNode = { id, label: "New step", x: 455 + Math.random() * 80, y: 420 + Math.random() * 40, width: 150, height: 62, shape, color: "#fde8f1", textColor: "#24232a" };
    commit((current) => ({ ...current, nodes: [...current.nodes, node] }));
    setSelected([id]);
    setEditingNode(id);
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const editing = target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
      const key = event.key.toLowerCase();

      if ((event.metaKey || event.ctrlKey) && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
        return;
      }
      if (event.key === "Escape") {
        marqueeRef.current = null;
        setMarquee(null);
        setSettingsOpen(false);
        setEditingNode(null);
        setEditingGroup(null);
        setConnectionStart(null);
        setTool("select");
        return;
      }
      if (editing || event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;

      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        deleteSelected();
      } else if (key === "n") {
        event.preventDefault();
        addNode();
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
        setViewMode("free");
        setTool("marquee");
        setConnectionStart(null);
        notify("Drag across the canvas to select nodes");
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
    if (viewMode !== "free" || event.button !== 0 || tool === "connect" || !boardRef.current) return;
    const rect = boardRef.current.getBoundingClientRect();
    const startX = (event.clientX - rect.left) / zoom;
    const startY = (event.clientY - rect.top) / zoom;
    const next: MarqueeSelection = { startX, startY, currentX: startX, currentY: startY, additive: event.shiftKey };

    setEditingNode(null);
    setEditingGroup(null);
    if (!event.shiftKey) setSelected([]);
    marqueeRef.current = next;
    setMarquee(next);
    event.currentTarget.setPointerCapture(event.pointerId);
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

  const editMermaidElement = (event: ReactPointerEvent<HTMLDivElement>) => {
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

  const groupBounds = (groupId: string) => {
    const children = diagram.nodes.filter((node) => node.groupId === groupId);
    if (!children.length) return null;
    const minX = Math.min(...children.map((node) => node.x)) - 32;
    const minY = Math.min(...children.map((node) => node.y)) - 50;
    const maxX = Math.max(...children.map((node) => node.x + node.width)) + 32;
    const maxY = Math.max(...children.map((node) => node.y + node.height)) + 32;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  };

  const edgePath = (edge: DiagramEdge) => {
    const from = diagram.nodes.find((node) => node.id === edge.from);
    const to = diagram.nodes.find((node) => node.id === edge.to);
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
    await navigator.clipboard.writeText(source);
    notify("Mermaid source copied");
    setExportOpen(false);
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
    const mermaid = await loadMermaid(activeMermaidVersion);
    mermaid.initialize({ startOnLoad: false, theme: "base", securityLevel: "strict", flowchart: { htmlLabels: true, curve: "basis" } });
    const { svg } = await mermaid.render(`mermade-${Date.now()}`, source);
    download(svg, `${diagram.name.toLowerCase().replace(/\W+/g, "-")}.svg`, "image/svg+xml");
    setExportOpen(false);
    notify("SVG exported");
  };

  const applySource = () => {
    const detection = detectMermaidVersion(sourceDraft);
    if ((diagram.mermaidVersion || "auto") === "10.9.6" && detection.minimum === "11.3.0") {
      notify("This source requires Mermaid 11.3+; choose Auto-detect or 11.16.0 in Settings");
      return;
    }
    const parsed = parseMermaid(sourceDraft, diagram);
    if (!parsed) {
      notify("Could not find a valid flowchart in this source");
      return;
    }
    commit(() => ({ ...parsed, detectedMermaidVersion: detection.recommended }));
    setSourceDirty(false);
    notify("Canvas updated from Mermaid source");
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true" />
          <div className="brand-name">mermade</div>
          <div className="top-divider" />
          <input className="document-name" aria-label="Diagram name" value={diagram.name} onFocus={checkpoint} onChange={(event) => setDiagram((current) => ({ ...current, name: event.target.value }))} />
          <span className="save-status"><Check size={13} /> Saved locally</span>
        </div>
        <div className="top-actions">
          <div className="history-actions">
            <IconButton label="Undo" onClick={undo}><Undo2 size={17} /></IconButton>
            <IconButton label="Redo" onClick={redo}><Redo2 size={17} /></IconButton>
          </div>
          <button className="secondary-button" type="button" onClick={() => { setSourceOpen(true); setSourceDraft(source); setSourceDirty(false); }}><Code2 size={16} /> Source</button>
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
        <aside className={`tool-rail ${preferences.showShortcutHints ? "" : "hide-shortcuts"}`} aria-label="Canvas tools">
          <div className="tool-group">
            <IconButton label="Select (V)" shortcut="V" active={tool === "select"} onClick={() => { setTool("select"); setConnectionStart(null); }}><MousePointer2 size={19} /></IconButton>
            <IconButton label="Marquee select (M)" shortcut="M" active={tool === "marquee"} onClick={() => { setViewMode("free"); setTool("marquee"); setConnectionStart(null); }}><BoxSelect size={19} /></IconButton>
            <IconButton label="Add node (N)" shortcut="N" onClick={() => addNode()}><Plus size={20} /></IconButton>
            <IconButton label="Link nodes (L)" shortcut="L" active={tool === "connect"} onClick={() => { setTool("connect"); setConnectionStart(null); notify("Choose the first node"); }}><Link2 size={19} /></IconButton>
            <IconButton label="Create subgraph (S)" shortcut="S" onClick={groupSelected}><Group size={19} /></IconButton>
          </div>
          <div className="tool-separator" />
          <div className="tool-group">
            <IconButton label="Add decision (D)" shortcut="D" onClick={() => addNode("diamond")}><CircleDot size={19} /></IconButton>
            <IconButton label="Frame selection" onClick={fitView}><Frame size={19} /></IconButton>
          </div>
          <div className="rail-spacer" />
          <IconButton label="Settings" active={settingsOpen} onClick={() => setSettingsOpen(true)}><Settings2 size={19} /></IconButton>
        </aside>

        <section className={`canvas-viewport ${tool === "connect" ? "is-connecting" : ""} ${tool === "marquee" ? "is-marquee" : ""}`}>
          <div className="canvas-titlebar">
            <div><span className="canvas-kicker">Flowchart</span><b>{diagram.name}</b></div>
            <div className="canvas-view-controls" onPointerDown={(event) => event.stopPropagation()}>
              <div className="direction-switch" aria-label="Chart direction">
                <button className={diagram.direction === "LR" ? "active" : ""} type="button" onClick={(event) => { event.stopPropagation(); commit((current) => ({ ...current, direction: "LR" })); }}>Left → right</button>
                <button className={diagram.direction === "TB" ? "active" : ""} type="button" onClick={(event) => { event.stopPropagation(); commit((current) => ({ ...current, direction: "TB" })); }}>Top ↓ bottom</button>
              </div>
              <div className="view-switch" aria-label="Canvas view">
                <button className={viewMode === "free" ? "active" : ""} type="button" onClick={(event) => { event.stopPropagation(); setViewMode("free"); }}><MousePointer2 size={12} /> Freeform</button>
                <button className={viewMode === "mermaid" ? "active" : ""} type="button" onClick={(event) => { event.stopPropagation(); shouldFitMermaidRef.current = true; setViewMode("mermaid"); }}><Sparkles size={12} /> Mermaid</button>
              </div>
            </div>
          </div>
          <div ref={scrollRef} className="canvas-scroll">
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
                const bounds = groupBounds(group.id);
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
                  className={`diagram-node shape-${node.shape} ${selected.includes(node.id) ? "selected" : ""} ${connectionStart === node.id ? "connection-start" : ""}`}
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
                className="mermaid-stage"
                style={{ left: CANVAS_MARGIN * zoom, top: CANVAS_MARGIN * zoom, width: mermaidSize.width, height: mermaidSize.height, transform: `scale(${zoom})` }}
                onPointerDown={selectMermaidElement}
                onDoubleClick={editMermaidElement}
              >
                <div ref={mermaidViewRef} className="mermaid-render" />
                {mermaidRenderError && <div className="mermaid-render-error"><Code2 size={20} /><b>Mermaid could not render this diagram</b><span>{mermaidRenderError}</span></div>}
              </div>
            )}
            </div>
          </div>

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

          <div className="canvas-hint"><BoxSelect size={15} /> Click to select · Double-click to edit · Scroll to pan · ⌘ scroll to zoom</div>
          <div className="zoom-controls">
            <IconButton label="Zoom out" onClick={() => zoomAtViewportCenter(zoom - 0.1)}><ZoomOut size={17} /></IconButton>
            <button type="button" onClick={fitView}>{Math.round(zoom * 100)}%</button>
            <IconButton label="Zoom in" onClick={() => zoomAtViewportCenter(zoom + 0.1)}><ZoomIn size={17} /></IconButton>
            <span />
            <IconButton label="Fit to canvas" onClick={fitView}><Maximize2 size={17} /></IconButton>
          </div>
          {tool === "connect" && <div className="mode-banner"><Link2 size={15} /> {connectionStart ? "Now choose a destination" : "Choose a starting node"}</div>}
          {tool === "marquee" && <div className="mode-banner"><BoxSelect size={15} /> Drag across nodes · Shift-drag to add</div>}
        </section>

        <aside className="inspector">
          <div className="inspector-tabs">
            <button type="button" className={tab === "properties" ? "active" : ""} onClick={() => setTab("properties")}>Properties</button>
            <button type="button" className={tab === "style" ? "active" : ""} onClick={() => setTab("style")}>Appearance</button>
          </div>
          <div className="inspector-body">
            {selectedNode ? (
              <>
                <div className="selection-heading">
                  <div className={`mini-shape shape-${selectedNode.shape}`} style={{ "--node-color": selectedNode.color } as React.CSSProperties} />
                  <div><span>Node</span><b>{selectedNode.label}</b></div>
                  <IconButton label="Delete node" onClick={deleteSelected}><Trash2 size={16} /></IconButton>
                </div>
                {tab === "properties" ? (
                  <div className="field-stack">
                    <label><span>Text</span><textarea value={selectedNode.label} onFocus={checkpoint} onChange={(event) => updateNode(selectedNode.id, { label: event.target.value }, false)} rows={3} /></label>
                    <label><span>Node ID</span><div className="input-with-prefix"><Code2 size={14} /><input value={selectedNode.id} readOnly /></div></label>
                    <label><span>Shape</span><select value={selectedNode.shape} onChange={(event) => updateNode(selectedNode.id, { shape: event.target.value as NodeShape, mermaidShape: undefined })}><option value="rectangle">Rectangle</option><option value="rounded">Rounded / stadium</option><option value="diamond">Decision</option><option value="circle">Circle</option><option value="hexagon">Hexagon</option><option value="document">Document</option><option value="framed">Framed rectangle</option></select></label>
                    <div className="property-row"><span>Subgraph</span><b>{diagram.groups.find((group) => group.id === selectedNode.groupId)?.label || "None"}</b></div>
                    <button className="wide-action" type="button" onClick={() => { setTool("connect"); setConnectionStart(selectedNode.id); notify("Choose a destination node"); }}><Link2 size={16} /> Add relationship from this node</button>
                  </div>
                ) : (
                  <div className="field-stack">
                    <label><span>Fill color</span><div className="swatches">{COLORS.map((color) => <button key={color} className={selectedNode.color === color ? "selected" : ""} type="button" aria-label={`Use ${color}`} style={{ background: color }} onClick={() => updateNode(selectedNode.id, { color })}>{selectedNode.color === color && <Check size={14} />}</button>)}</div></label>
                    <label><span>Text color</span><div className="color-input"><input type="color" value={selectedNode.textColor} onChange={(event) => updateNode(selectedNode.id, { textColor: event.target.value }, false)} /><input value={selectedNode.textColor} onChange={(event) => updateNode(selectedNode.id, { textColor: event.target.value }, false)} /></div></label>
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
                <h3>Select something</h3>
                <p>Choose a node or relationship to edit its content and appearance.</p>
                <button className="wide-action" type="button" onClick={() => addNode()}><Plus size={16} /> Add your first node</button>
              </div>
            )}
          </div>
          <footer className="inspector-footer"><Sparkles size={14} /><span>Valid Mermaid flowchart</span><span className="status-dot" /></footer>
        </aside>
      </section>

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
                <div className="theme-options" aria-label="Color theme">
                  <button className={preferences.theme === "light" ? "active" : ""} type="button" onClick={() => setPreferences((current) => ({ ...current, theme: "light" }))}><Sun size={17} /><span>Light</span></button>
                  <button className={preferences.theme === "dark" ? "active" : ""} type="button" onClick={() => setPreferences((current) => ({ ...current, theme: "dark" }))}><Moon size={17} /><span>Dark</span></button>
                  <button className={preferences.theme === "system" ? "active" : ""} type="button" onClick={() => setPreferences((current) => ({ ...current, theme: "system" }))}><Monitor size={17} /><span>System</span></button>
                </div>
              </div>
              <div className="settings-section">
                <span className="settings-label">Mermaid compatibility</span>
                <label className="version-setting">
                  <span><b>Rendering engine</b><small>Auto-detect uses the newest compatible bundled version.</small></span>
                  <select aria-label="Mermaid version" value={diagram.mermaidVersion || "auto"} onChange={(event) => setDiagram((current) => ({ ...current, mermaidVersion: event.target.value as MermaidVersionPreference }))}>
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
            <div className="source-editor-wrap"><div className="line-numbers">{sourceDraft.split("\n").map((_, index) => <span key={index}>{index + 1}</span>)}</div><textarea spellCheck={false} value={sourceDraft} onChange={(event) => { setSourceDraft(event.target.value); setSourceDirty(true); }} /></div>
            <footer><span title={`Minimum supported syntax: Mermaid ${sourceVersionDetection.minimum}`}><Check size={14} /> {sourceVersionDetection.label}</span><div><button className="secondary-button" type="button" onClick={() => { navigator.clipboard.writeText(sourceDraft); notify("Source copied"); }}><Copy size={15} /> Copy</button><button className="primary-button" type="button" disabled={!sourceDirty} onClick={applySource}><RotateCcw size={15} /> Apply to canvas</button></div></footer>
          </section>
        </div>
      )}
      {toast && <div className="toast"><Check size={15} /> {toast}</div>}
    </main>
  );
}
