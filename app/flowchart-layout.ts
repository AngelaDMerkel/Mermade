export type FlowchartLayoutNode = {
  id: string;
  width: number;
  height: number;
  groupId?: string;
};

export type FlowchartLayoutEdge = {
  from: string;
  to: string;
};

export type FlowchartLayoutDirection = "LR" | "TB";

const ORIGIN = 100;
const RANK_GAP = 150;
const NODE_GAP = 76;
const LANE_GAP = 132;

function stronglyConnectedComponents(nodes: FlowchartLayoutNode[], outgoing: Map<string, string[]>) {
  let nextIndex = 0;
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const stacked = new Set<string>();
  const components: string[][] = [];

  const visit = (id: string) => {
    indices.set(id, nextIndex);
    lowLinks.set(id, nextIndex);
    nextIndex += 1;
    stack.push(id);
    stacked.add(id);

    for (const target of outgoing.get(id) ?? []) {
      if (!indices.has(target)) {
        visit(target);
        lowLinks.set(id, Math.min(lowLinks.get(id)!, lowLinks.get(target)!));
      } else if (stacked.has(target)) {
        lowLinks.set(id, Math.min(lowLinks.get(id)!, indices.get(target)!));
      }
    }

    if (lowLinks.get(id) !== indices.get(id)) return;
    const component: string[] = [];
    let member = "";
    do {
      member = stack.pop()!;
      stacked.delete(member);
      component.push(member);
    } while (member !== id);
    components.push(component);
  };

  nodes.forEach((node) => {
    if (!indices.has(node.id)) visit(node.id);
  });
  return components;
}

/**
 * Produces a deterministic layered layout without changing Mermaid source.
 * Cycles are collapsed into one rank, while subgraphs receive separate lanes
 * so their visual bounding boxes do not swallow unrelated nodes.
 */
export function layoutFlowchart(
  nodes: FlowchartLayoutNode[],
  edges: FlowchartLayoutEdge[],
  direction: FlowchartLayoutDirection,
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const sourceOrder = new Map(nodes.map((node, index) => [node.id, index]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
  const incoming = new Map(nodes.map((node) => [node.id, [] as string[]]));

  for (const edge of edges) {
    if (!nodeById.has(edge.from) || !nodeById.has(edge.to) || edge.from === edge.to) continue;
    if (!outgoing.get(edge.from)!.includes(edge.to)) outgoing.get(edge.from)!.push(edge.to);
    if (!incoming.get(edge.to)!.includes(edge.from)) incoming.get(edge.to)!.push(edge.from);
  }

  const components = stronglyConnectedComponents(nodes, outgoing);
  const componentOf = new Map<string, number>();
  components.forEach((component, index) => component.forEach((id) => componentOf.set(id, index)));
  const componentOutgoing = new Map(components.map((_, index) => [index, new Set<number>()]));
  const indegree = new Map(components.map((_, index) => [index, 0]));

  for (const edge of edges) {
    const from = componentOf.get(edge.from);
    const to = componentOf.get(edge.to);
    if (from === undefined || to === undefined || from === to || componentOutgoing.get(from)!.has(to)) continue;
    componentOutgoing.get(from)!.add(to);
    indegree.set(to, indegree.get(to)! + 1);
  }

  const componentOrder = (component: number) => Math.min(...components[component].map((id) => sourceOrder.get(id)!));
  const queue = components.map((_, index) => index)
    .filter((index) => indegree.get(index) === 0)
    .sort((a, b) => componentOrder(a) - componentOrder(b));
  const rankByComponent = new Map(components.map((_, index) => [index, 0]));

  while (queue.length) {
    const component = queue.shift()!;
    for (const target of componentOutgoing.get(component)!) {
      rankByComponent.set(target, Math.max(rankByComponent.get(target)!, rankByComponent.get(component)! + 1));
      indegree.set(target, indegree.get(target)! - 1);
      if (indegree.get(target) === 0) {
        queue.push(target);
        queue.sort((a, b) => componentOrder(a) - componentOrder(b));
      }
    }
  }

  const rankOf = new Map(nodes.map((node) => [node.id, rankByComponent.get(componentOf.get(node.id)!) ?? 0]));
  const maxRank = Math.max(0, ...rankOf.values());
  const orderedLayers = Array.from({ length: maxRank + 1 }, (_, rank) => (
    nodes.filter((node) => rankOf.get(node.id) === rank).map((node) => node.id)
  ));

  // Repeated barycentric sweeps reduce crossings while retaining deterministic
  // source order when two nodes have the same relationship weight.
  const orderIndex = () => new Map(orderedLayers.flatMap((layer) => layer.map((id, index) => [id, index] as const)));
  const sortLayer = (rank: number, neighbors: Map<string, string[]>) => {
    const positions = orderIndex();
    orderedLayers[rank].sort((a, b) => {
      const score = (id: string) => {
        const relevant = (neighbors.get(id) ?? []).filter((neighbor) => rankOf.get(neighbor) !== rank);
        return relevant.length ? relevant.reduce((sum, neighbor) => sum + (positions.get(neighbor) ?? 0), 0) / relevant.length : sourceOrder.get(id)!;
      };
      return score(a) - score(b) || sourceOrder.get(a)! - sourceOrder.get(b)!;
    });
  };
  for (let pass = 0; pass < 3; pass += 1) {
    for (let rank = 1; rank <= maxRank; rank += 1) sortLayer(rank, incoming);
    for (let rank = maxRank - 1; rank >= 0; rank -= 1) sortLayer(rank, outgoing);
  }

  const layerOrder = orderIndex();
  const laneKeys = [...new Set(nodes.map((node) => node.groupId ? `group:${node.groupId}` : "ungrouped"))]
    .sort((a, b) => {
      const first = (key: string) => Math.min(...nodes.filter((node) => (node.groupId ? `group:${node.groupId}` : "ungrouped") === key).map((node) => sourceOrder.get(node.id)!));
      return first(a) - first(b);
    });
  const crossSize = (node: FlowchartLayoutNode) => direction === "LR" ? node.height : node.width;
  const mainSize = (node: FlowchartLayoutNode) => direction === "LR" ? node.width : node.height;
  const nodesInLaneRank = (lane: string, rank: number) => nodes
    .filter((node) => (node.groupId ? `group:${node.groupId}` : "ungrouped") === lane && rankOf.get(node.id) === rank)
    .sort((a, b) => layerOrder.get(a.id)! - layerOrder.get(b.id)!);

  const laneSizes = new Map(laneKeys.map((lane) => {
    const size = Math.max(0, ...Array.from({ length: maxRank + 1 }, (_, rank) => {
      const members = nodesInLaneRank(lane, rank);
      return members.reduce((sum, node) => sum + crossSize(node), 0) + Math.max(0, members.length - 1) * NODE_GAP;
    }));
    return [lane, Math.max(size, 82)] as const;
  }));

  const laneStarts = new Map<string, number>();
  let crossCursor = ORIGIN;
  laneKeys.forEach((lane) => {
    laneStarts.set(lane, crossCursor);
    crossCursor += laneSizes.get(lane)! + LANE_GAP;
  });

  const rankStarts: number[] = [];
  let mainCursor = ORIGIN;
  for (let rank = 0; rank <= maxRank; rank += 1) {
    rankStarts[rank] = mainCursor;
    const members = nodes.filter((node) => rankOf.get(node.id) === rank);
    mainCursor += Math.max(82, ...members.map(mainSize)) + RANK_GAP;
  }

  const positions = new Map<string, { x: number; y: number; rank: number }>();
  laneKeys.forEach((lane) => {
    for (let rank = 0; rank <= maxRank; rank += 1) {
      const members = nodesInLaneRank(lane, rank);
      const occupied = members.reduce((sum, node) => sum + crossSize(node), 0) + Math.max(0, members.length - 1) * NODE_GAP;
      let memberCross = laneStarts.get(lane)! + (laneSizes.get(lane)! - occupied) / 2;
      for (const node of members) {
        const main = rankStarts[rank];
        positions.set(node.id, direction === "LR"
          ? { x: main, y: memberCross, rank }
          : { x: memberCross, y: main, rank });
        memberCross += crossSize(node) + NODE_GAP;
      }
    }
  });

  return positions;
}
