import { DEFAULT_POLISHED_STYLE, normalisePolishedStyle } from "../beautiful-mermaid-config";
import { layoutFlowchart } from "../flowchart-layout";
import { parseFlowchartRelationshipLine, repairFlowchartEdgeEditArtifacts } from "../flowchart-source";
import { visualShapeForMermaid } from "../flowchart-shapes";
import { repairEmptyFlowchartNodeLabels } from "../mermaid-repair";
import { DEFAULT_DIAGRAM_STYLE } from "../mermaid-style";
import { isFlowchartSource, splitFrontmatter } from "../mermaid-source";
import type { Diagram, DiagramNode, DiagramEdge, DiagramGroup, NodeShape } from "./diagram-types";
import { LATEST_MERMAID_VERSION } from "./mermaid-version";

/** The visual graph is a projection; source-backed documents retain their exact Mermaid source. */
export function hasDuplicateRelationshipIds(diagram: Diagram) {
  const ids = diagram.edges.map((edge) => edge.id);
  return new Set(ids).size !== ids.length;
}

export function projectSourceBackedFlowchart(diagram: Diagram, source = diagram.source) {
  if (!source || !isFlowchartSource(source)) return diagram;
  const sourceBacked = { ...diagram, source };
  const projected = parseMermaid(source, sourceBacked);
  return { ...(projected || { ...sourceBacked, nodes: [], edges: [], groups: [] }), source };
}

export const initialDiagram: Diagram = {
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

export const clone = (diagram: Diagram): Diagram => JSON.parse(JSON.stringify(diagram));

export function safeLabel(label: string) {
  const escaped = label.replaceAll('"', "'").replaceAll("\n", " ");
  return escaped.trim() ? escaped : " ";
}

export function nodeSyntax(node: DiagramNode) {
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

export function edgeSyntax(edge: DiagramEdge) {
  const link = edge.arrow === false
    ? (edge.style === "dashed" ? "-.-" : edge.style === "thick" ? "===" : "---")
    : (edge.style === "dashed" ? "-.->" : edge.style === "thick" ? "==>" : "-->");
  const label = edge.label ? `|"${safeLabel(edge.label)}"|` : "";
  return `${edge.from} ${link}${label} ${edge.to}`;
}

export function nodeStyleSyntax(node: DiagramNode) {
  return `style ${node.id} fill:${node.color},stroke:#77737f,color:${node.textColor},stroke-width:1.5px`;
}

export function toMermaid(diagram: Diagram) {
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

export function parseMermaid(source: string, previous: Diagram): Diagram | null {
  const lines = splitFrontmatter(source).body.split("\n").map((line) => line.trim()).filter(Boolean);
  const header = lines.find((line) => /^(flowchart(?:-elk)?|graph)(?:\s+(LR|RL|TB|TD|BT))?$/.test(line));
  if (!header) return null;

  const sourceDirection = header.match(/\s(LR|RL|TB|TD|BT)$/)?.[1];
  const direction: "LR" | "TB" = sourceDirection === "LR" || sourceDirection === "RL" ? "LR" : "TB";
  const previousNodes = new Map(previous.nodes.map((node) => [node.id, node]));
  const nodes = new Map<string, DiagramNode>();
  const edges: DiagramEdge[] = [];
  const groups: DiagramGroup[] = [];
  const styles = new Map<string, { color: string; textColor: string }>();
  const edgeOccurrences = new Map<string, number>();
  let currentGroup: string | undefined;

  const legacyPatterns: Array<[NodeShape, RegExp]> = [
    ["rounded", /^([A-Za-z_][\w-]*)\(\["?(.*?)"?\]\)$/],
    ["circle", /^([A-Za-z_][\w-]*)\(\("?(.*?)"?\)\)$/],
    ["hexagon", /^([A-Za-z_][\w-]*)\{\{"?(.*?)"?\}\}$/],
    ["diamond", /^([A-Za-z_][\w-]*)\{"?(.*?)"?\}$/],
    ["rectangle", /^([A-Za-z_][\w-]*)\["?(.*?)"?\]$/],
  ];

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
    const old = previousNodes.get(id);
    nodes.set(id, old ? { ...old, ...dimensions, label, shape, mermaidShape, groupId: currentGroup } : {
      id, label, shape, mermaidShape, groupId: currentGroup,
      x: 0, y: 0,
      ...dimensions,
      color: "#ffffff", textColor: "#24232a",
    });
  };

  const parseNode = (value: string, explicit = true) => {
    const text = value.trim().replace(/;$/, "").trimEnd();
    const expanded = text.match(/^([A-Za-z_][\w-]*)@\{\s*(.*?)\s*\}$/);
    if (expanded) {
      const shape = expanded[2].match(/\bshape\s*:\s*["']?([\w-]+)["']?/)?.[1] || "rect";
      const label = expanded[2].match(/\blabel\s*:\s*"((?:\\.|[^"])*)"/)?.[1]?.replaceAll('\\"', '"') || expanded[1];
      addNode(expanded[1], label, visualShapeForMermaid(shape), explicit, shape);
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
    const to = parseNode(toExpression);
    if (!from || !to) return;
    const endpointKey = `${from}\u0000${to}`;
    const sourceOccurrence = edgeOccurrences.get(endpointKey) || 0;
    edgeOccurrences.set(endpointKey, sourceOccurrence + 1);
    edges.push({
      id: `e${edges.length + 1}`,
      from,
      to,
      label,
      style: connector.includes("==") ? "thick" : /-\.+/.test(connector) ? "dashed" : "solid",
      arrow: connector.includes(">"),
      sourceOccurrence,
    });
  };

  const parseEdgeLine = (line: string) => {
    const relationship = parseFlowchartRelationshipLine(line);
    if (!relationship) return false;
    relationship.edges.forEach((edge) => addParsedEdge(edge.fromExpression, edge.connector, edge.toExpression, edge.label));
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
  const preserveStoredPositions = previous.source === source && previousNodes.size > 0;
  const needsLayout = !preserveStoredPositions || parsedNodes.some((node) => !previousNodes.has(node.id));
  const positions = needsLayout ? layoutFlowchart(parsedNodes, edges, direction) : new Map();
  return {
    ...previous,
    direction,
    nodes: parsedNodes.map((node) => {
      const stored = preserveStoredPositions ? previousNodes.get(node.id) : undefined;
      return { ...node, ...(stored ? { x: stored.x, y: stored.y } : positions.get(node.id)) };
    }),
    edges,
    groups,
  };
}

export function restoreStoredDiagram(value: unknown): Diagram | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const restored = value as Partial<Diagram>;
  if (!Array.isArray(restored.nodes) || !Array.isArray(restored.edges) || !Array.isArray(restored.groups)) return null;
  const diagram = restored as Diagram;
  let projected = diagram;
  if (diagram.source) {
    if (isFlowchartSource(diagram.source)) {
      const validLabels = repairEmptyFlowchartNodeLabels(diagram.source);
      const repaired = repairFlowchartEdgeEditArtifacts(validLabels);
      // Rebuild identities from authoritative source once; cached positions and
      // appearance are inputs, never a second representation of the document.
      projected = projectSourceBackedFlowchart(diagram, repaired.source);
    } else {
      projected = { ...diagram, nodes: [], edges: [], groups: [] };
    }
  }
  return {
    ...projected,
    name: typeof diagram.name === "string" && diagram.name.trim() ? diagram.name : "Untitled diagram",
    style: { ...DEFAULT_DIAGRAM_STYLE, ...(diagram.style || {}) },
    polishedStyle: normalisePolishedStyle(diagram.polishedStyle),
  };
}

export function createBlankDiagram(name = "Untitled diagram"): Diagram {
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

