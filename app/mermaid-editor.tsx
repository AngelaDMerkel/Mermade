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
  MousePointer2,
  Plus,
  Redo2,
  RotateCcw,
  Settings2,
  Share2,
  Sparkles,
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

type NodeShape = "rectangle" | "rounded" | "diamond" | "circle" | "hexagon";
type EdgeStyle = "solid" | "dashed" | "thick";

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
};

type DiagramEdge = {
  id: string;
  from: string;
  to: string;
  label: string;
  style: EdgeStyle;
};

type DiagramGroup = { id: string; label: string };

type Diagram = {
  name: string;
  direction: "LR" | "TB";
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  groups: DiagramGroup[];
};

const COLORS = ["#fffdfa", "#f1edff", "#e6f8f1", "#fff1da", "#e9f2ff", "#ffe9ee", "#e8f8fb", "#f2f3f5"];

const initialDiagram: Diagram = {
  name: "Checkout flow",
  direction: "LR",
  groups: [
    { id: "checkout", label: "Checkout" },
    { id: "fulfillment", label: "Fulfillment" },
  ],
  nodes: [
    { id: "cart", label: "Cart", x: 78, y: 276, width: 126, height: 58, shape: "rounded", color: "#fffdfa", textColor: "#24232a" },
    { id: "details", label: "Customer details", x: 292, y: 182, width: 164, height: 62, shape: "rectangle", color: "#f1edff", textColor: "#282332", groupId: "checkout" },
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
  switch (node.shape) {
    case "rounded":
      return `${node.id}(["${label}"])`;
    case "diamond":
      return `${node.id}{"${label}"}`;
    case "circle":
      return `${node.id}(("${label}"))`;
    case "hexagon":
      return `${node.id}{{"${label}"}}`;
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
    const link = edge.style === "dashed" ? "-.->" : edge.style === "thick" ? "==>" : "-->";
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
  const directionLine = lines.find((line) => /^(flowchart|graph)\s+(LR|TB)/.test(line));
  if (!directionLine) return null;

  const direction = directionLine.match(/\s(LR|TB)/)?.[1] as "LR" | "TB";
  const nodes = new Map<string, DiagramNode>();
  const edges: DiagramEdge[] = [];
  const groups: DiagramGroup[] = [];
  const styles = new Map<string, { color: string; textColor: string }>();
  let currentGroup: string | undefined;
  let positionIndex = 0;

  const patterns: Array<[NodeShape, RegExp]> = [
    ["rounded", /^(\w+)\(\["?(.*?)"?\]\)$/],
    ["circle", /^(\w+)\(\("?(.*?)"?\)\)$/],
    ["hexagon", /^(\w+)\{\{"?(.*?)"?\}\}$/],
    ["diamond", /^(\w+)\{"?(.*?)"?\}$/],
    ["rectangle", /^(\w+)\["?(.*?)"?\]$/],
  ];

  const addNode = (id: string, label = id, shape: NodeShape = "rectangle") => {
    if (nodes.has(id)) return;
    const old = previous.nodes.find((node) => node.id === id);
    const col = positionIndex % 4;
    const row = Math.floor(positionIndex / 4);
    positionIndex += 1;
    nodes.set(id, old ? { ...old, label, shape, groupId: currentGroup } : {
      id, label, shape, groupId: currentGroup,
      x: 100 + col * 230, y: 140 + row * 150,
      width: shape === "circle" ? 82 : 150,
      height: shape === "diamond" ? 96 : shape === "circle" ? 82 : 62,
      color: "#fffdfa", textColor: "#24232a",
    });
  };

  lines.forEach((line) => {
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
    const edgeMatch = line.match(/^(\w+)\s+(-->|-\.->|==>)(?:\|"?(.*?)"?\|)?\s+(\w+)$/);
    if (edgeMatch) {
      addNode(edgeMatch[1]);
      addNode(edgeMatch[4]);
      edges.push({ id: `e${edges.length + 1}`, from: edgeMatch[1], to: edgeMatch[4], label: edgeMatch[3] || "", style: edgeMatch[2] === "-.->" ? "dashed" : edgeMatch[2] === "==>" ? "thick" : "solid" });
      return;
    }
    for (const [shape, pattern] of patterns) {
      const match = line.match(pattern);
      if (match) {
        addNode(match[1], match[2], shape);
        return;
      }
    }
  });

  if (!nodes.size) return null;
  styles.forEach((style, id) => {
    const node = nodes.get(id);
    if (node) nodes.set(id, { ...node, ...style });
  });
  return { ...previous, direction, nodes: [...nodes.values()], edges, groups };
}

function IconButton({ label, active, disabled, onClick, children, className = "" }: {
  label: string; active?: boolean; disabled?: boolean; onClick?: () => void; children: React.ReactNode; className?: string;
}) {
  return (
    <button className={`icon-button ${active ? "active" : ""} ${className}`} type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

export function MermaidEditor() {
  const [diagram, setDiagram] = useState<Diagram>(initialDiagram);
  const [selected, setSelected] = useState<string[]>(["approved"]);
  const [zoom, setZoom] = useState(0.92);
  const [tool, setTool] = useState<"select" | "connect">("select");
  const [connectionStart, setConnectionStart] = useState<string | null>(null);
  const [tab, setTab] = useState<"properties" | "style">("properties");
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceDraft, setSourceDraft] = useState("");
  const [sourceDirty, setSourceDirty] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [editingNode, setEditingNode] = useState<string | null>(null);
  const history = useRef<Diagram[]>([]);
  const future = useRef<Diagram[]>([]);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<null | { startX: number; startY: number; nodes: Map<string, { x: number; y: number }> }>(null);
  const edgeCounter = useRef(initialDiagram.edges.length + 1);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const source = useMemo(() => toMermaid(diagram), [diagram]);
  const selectedNode = selected.length === 1 ? diagram.nodes.find((node) => node.id === selected[0]) : undefined;
  const selectedEdge = selected.length === 1 ? diagram.edges.find((edge) => edge.id === selected[0]) : undefined;

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
    } catch { /* local drafts are best-effort */ }
  }, []);

  useEffect(() => {
    localStorage.setItem("mermade-diagram", JSON.stringify(diagram));
  }, [diagram]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!dragRef.current || !boardRef.current) return;
      const dx = (event.clientX - dragRef.current.startX) / zoom;
      const dy = (event.clientY - dragRef.current.startY) / zoom;
      setDiagram((current) => ({ ...current, nodes: current.nodes.map((node) => {
        const origin = dragRef.current?.nodes.get(node.id);
        return origin ? { ...node, x: Math.max(12, origin.x + dx), y: Math.max(12, origin.y + dy) } : node;
      }) }));
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
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
    const node: DiagramNode = { id, label: "New step", x: 455 + Math.random() * 80, y: 420 + Math.random() * 40, width: 150, height: 62, shape, color: "#f1edff", textColor: "#24232a" };
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const editing = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      } else if (!editing && (event.key === "Backspace" || event.key === "Delete")) {
        event.preventDefault();
        deleteSelected();
      } else if (event.key === "Escape") {
        setEditingNode(null);
        setConnectionStart(null);
        setTool("select");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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

  const ungroupSelected = () => {
    const groupIds = new Set(selected);
    commit((current) => ({
      ...current,
      nodes: current.nodes.map((node) => node.groupId && groupIds.has(node.groupId) ? { ...node, groupId: undefined } : node),
      groups: current.groups.filter((group) => !groupIds.has(group.id)),
    }));
    setSelected([]);
  };

  const beginDrag = (event: ReactPointerEvent, id: string) => {
    if (tool === "connect") return;
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

  const selectNode = (event: ReactPointerEvent, id: string) => {
    if (tool === "connect") {
      event.stopPropagation();
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
    const mermaid = (await import("mermaid")).default;
    mermaid.initialize({ startOnLoad: false, theme: "base", securityLevel: "loose", flowchart: { htmlLabels: true, curve: "basis" } });
    const { svg } = await mermaid.render(`mermade-${Date.now()}`, source);
    download(svg, `${diagram.name.toLowerCase().replace(/\W+/g, "-")}.svg`, "image/svg+xml");
    setExportOpen(false);
    notify("SVG exported");
  };

  const applySource = () => {
    const parsed = parseMermaid(sourceDraft, diagram);
    if (!parsed) {
      notify("Could not find a valid flowchart in this source");
      return;
    }
    commit(() => parsed);
    setSourceDirty(false);
    notify("Canvas updated from Mermaid source");
  };

  const fitView = () => setZoom(0.92);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><span>m</span></div>
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
          <button className="secondary-button share-button" type="button" onClick={() => notify("This local draft is ready to share after deployment")}><Share2 size={16} /> Share</button>
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
        <aside className="tool-rail" aria-label="Canvas tools">
          <div className="tool-group">
            <IconButton label="Select (V)" active={tool === "select"} onClick={() => { setTool("select"); setConnectionStart(null); }}><MousePointer2 size={19} /></IconButton>
            <IconButton label="Add node" onClick={() => addNode()}><Plus size={20} /></IconButton>
            <IconButton label="Connect nodes" active={tool === "connect"} onClick={() => { setTool("connect"); setConnectionStart(null); notify("Choose the first node"); }}><Link2 size={19} /></IconButton>
            <IconButton label="Create subgraph" onClick={groupSelected}><Group size={19} /></IconButton>
          </div>
          <div className="tool-separator" />
          <div className="tool-group">
            <IconButton label="Add decision" onClick={() => addNode("diamond")}><CircleDot size={19} /></IconButton>
            <IconButton label="Frame selection" onClick={fitView}><Frame size={19} /></IconButton>
          </div>
          <div className="rail-spacer" />
          <IconButton label="Settings" onClick={() => notify("Editor preferences are saved in this browser")}><Settings2 size={19} /></IconButton>
        </aside>

        <section className={`canvas-viewport ${tool === "connect" ? "is-connecting" : ""}`} onPointerDown={() => { setSelected([]); setEditingNode(null); }}>
          <div className="canvas-titlebar">
            <div><span className="canvas-kicker">Flowchart</span><b>{diagram.name}</b></div>
            <div className="direction-switch" aria-label="Chart direction">
              <button className={diagram.direction === "LR" ? "active" : ""} type="button" onClick={(event) => { event.stopPropagation(); commit((current) => ({ ...current, direction: "LR" })); }}>Left → right</button>
              <button className={diagram.direction === "TB" ? "active" : ""} type="button" onClick={(event) => { event.stopPropagation(); commit((current) => ({ ...current, direction: "TB" })); }}>Top ↓ bottom</button>
            </div>
          </div>
          <div className="canvas-scroll">
            <div ref={boardRef} className="diagram-board" style={{ transform: `scale(${zoom})` }}>
              {diagram.groups.map((group) => {
                const bounds = groupBounds(group.id);
                if (!bounds) return null;
                return (
                  <button key={group.id} type="button" className={`subgraph ${selected.includes(group.id) ? "selected" : ""}`} style={bounds} onPointerDown={(event) => { event.stopPropagation(); setSelected(event.shiftKey ? [...selected, group.id] : [group.id]); }}>
                    <span>{group.label}</span>
                  </button>
                );
              })}
              <svg className="edge-layer" width="1200" height="720" aria-hidden="true">
                <defs>
                  <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker>
                </defs>
                {diagram.edges.map((edge) => {
                  const path = edgePath(edge);
                  if (!path) return null;
                  return (
                    <g key={edge.id} className={`diagram-edge ${edge.style} ${selected.includes(edge.id) ? "selected" : ""}`} onPointerDown={(event) => { event.stopPropagation(); setSelected([edge.id]); }}>
                      <path className="edge-hit" d={path.d} />
                      <path className="edge-line" d={path.d} markerEnd="url(#arrow)" />
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
                  onDoubleClick={(event) => { event.stopPropagation(); setEditingNode(node.id); setSelected([node.id]); }}
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
            </div>
          </div>

          <div className="canvas-hint"><BoxSelect size={15} /> Shift-click to select multiple</div>
          <div className="zoom-controls">
            <IconButton label="Zoom out" onClick={() => setZoom((value) => Math.max(0.5, value - 0.1))}><ZoomOut size={17} /></IconButton>
            <button type="button" onClick={fitView}>{Math.round(zoom * 100)}%</button>
            <IconButton label="Zoom in" onClick={() => setZoom((value) => Math.min(1.5, value + 0.1))}><ZoomIn size={17} /></IconButton>
            <span />
            <IconButton label="Fit to canvas" onClick={fitView}><Maximize2 size={17} /></IconButton>
          </div>
          {tool === "connect" && <div className="mode-banner"><Link2 size={15} /> {connectionStart ? "Now choose a destination" : "Choose a starting node"}</div>}
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
                    <label><span>Shape</span><select value={selectedNode.shape} onChange={(event) => updateNode(selectedNode.id, { shape: event.target.value as NodeShape })}><option value="rectangle">Rectangle</option><option value="rounded">Rounded</option><option value="diamond">Decision</option><option value="circle">Circle</option><option value="hexagon">Hexagon</option></select></label>
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
                  <label><span>Line style</span><select value={selectedEdge.style} onChange={(event) => updateEdge(selectedEdge.id, { style: event.target.value as EdgeStyle })}><option value="solid">Solid arrow</option><option value="dashed">Dashed arrow</option><option value="thick">Thick arrow</option></select></label>
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

      {sourceOpen && (
        <div className="source-backdrop" onPointerDown={() => setSourceOpen(false)}>
          <section className="source-panel" onPointerDown={(event) => event.stopPropagation()}>
            <header><div><Code2 size={18} /><span><b>Mermaid source</b><small>Edit the code or copy it into Markdown</small></span></div><button type="button" onClick={() => setSourceOpen(false)}>Done</button></header>
            <div className="source-editor-wrap"><div className="line-numbers">{sourceDraft.split("\n").map((_, index) => <span key={index}>{index + 1}</span>)}</div><textarea spellCheck={false} value={sourceDraft} onChange={(event) => { setSourceDraft(event.target.value); setSourceDirty(true); }} /></div>
            <footer><span><Check size={14} /> Flowchart source</span><div><button className="secondary-button" type="button" onClick={() => { navigator.clipboard.writeText(sourceDraft); notify("Source copied"); }}><Copy size={15} /> Copy</button><button className="primary-button" type="button" disabled={!sourceDirty} onClick={applySource}><RotateCcw size={15} /> Apply to canvas</button></div></footer>
          </section>
        </div>
      )}
      {toast && <div className="toast"><Check size={15} /> {toast}</div>}
    </main>
  );
}
