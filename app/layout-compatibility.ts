import type { MermaidLayout } from "./mermaid-style";

export type LayoutCompatibilityGraph = {
  nodes: Array<{ id: string }>;
  edges: Array<{ from: string; to: string }>;
  groupCount: number;
  sourceIsAuthoritative: boolean;
};

const TIDY_TREE_SHAPE_MESSAGE = "Tidy Tree requires one connected hierarchy with no cycles and one parent per node; choose Dagre or ELK for this graph";

export function layoutCompatibilityError(
  layout: MermaidLayout,
  diagramTypeId: string,
  graph: LayoutCompatibilityGraph,
) {
  if (layout !== "tidy-tree") return "";
  if (diagramTypeId === "mindmap") return "";
  if (diagramTypeId !== "flowchart") {
    return "Tidy Tree currently supports Mindmaps and tree-shaped Flowcharts; choose Dagre or ELK for this diagram";
  }
  if (graph.groupCount > 0) {
    return "Tidy Tree cannot render Flowchart subgraphs; remove the subgraphs or choose Dagre or ELK";
  }
  if (graph.sourceIsAuthoritative || graph.nodes.length === 0) {
    return "Tidy Tree is available only when Mermade can verify a tree-shaped Flowchart; choose Dagre or ELK for this source";
  }

  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  if (nodeIds.size !== graph.nodes.length) return TIDY_TREE_SHAPE_MESSAGE;
  if (graph.nodes.length === 1 && graph.edges.length === 0) return "";
  if (graph.edges.length !== graph.nodes.length - 1) return TIDY_TREE_SHAPE_MESSAGE;

  const incoming = new Map([...nodeIds].map((id) => [id, 0]));
  const outgoing = new Map([...nodeIds].map((id) => [id, [] as string[]]));
  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to) || edge.from === edge.to) return TIDY_TREE_SHAPE_MESSAGE;
    incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }

  const roots = [...nodeIds].filter((id) => incoming.get(id) === 0);
  if (roots.length !== 1 || [...nodeIds].some((id) => id !== roots[0] && incoming.get(id) !== 1)) {
    return TIDY_TREE_SHAPE_MESSAGE;
  }

  const visited = new Set<string>();
  const pending = [roots[0]];
  while (pending.length) {
    const id = pending.pop() as string;
    if (visited.has(id)) return TIDY_TREE_SHAPE_MESSAGE;
    visited.add(id);
    pending.push(...(outgoing.get(id) || []));
  }

  return visited.size === nodeIds.size ? "" : TIDY_TREE_SHAPE_MESSAGE;
}
