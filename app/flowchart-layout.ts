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

function stronglyConnectedComponents(
  nodes: FlowchartLayoutNode[],
  outgoing: Map<string, string[]>,
  incoming: Map<string, string[]>,
) {
  // Iterative depth-first traversal keeps long imported chains off the JS call
  // stack. Finish order followed by reverse traversal identifies each cycle.
  const visited = new Set<string>();
  const finishOrder: string[] = [];
  for (const node of nodes) {
    if (visited.has(node.id)) continue;
    visited.add(node.id);
    const pending = [{ id: node.id, next: 0 }];
    while (pending.length) {
      const frame = pending[pending.length - 1];
      const targets = outgoing.get(frame.id)!;
      if (frame.next < targets.length) {
        const target = targets[frame.next++];
        if (!visited.has(target)) {
          visited.add(target);
          pending.push({ id: target, next: 0 });
        }
      } else {
        finishOrder.push(frame.id);
        pending.pop();
      }
    }
  }

  const assigned = new Set<string>();
  const components: string[][] = [];
  for (let index = finishOrder.length - 1; index >= 0; index--) {
    const root = finishOrder[index];
    if (assigned.has(root)) continue;
    assigned.add(root);
    const pending = [root];
    const component: string[] = [];
    while (pending.length) {
      const id = pending.pop()!;
      component.push(id);
      for (const parent of incoming.get(id)!) {
        if (assigned.has(parent)) continue;
        assigned.add(parent);
        pending.push(parent);
      }
    }
    components.push(component);
  }
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

  const seenEdges = new Map(nodes.map((node) => [node.id, new Set<string>()]));
  for (const edge of edges) {
    if (!nodeById.has(edge.from) || !nodeById.has(edge.to) || edge.from === edge.to) continue;
    if (seenEdges.get(edge.from)!.has(edge.to)) continue;
    seenEdges.get(edge.from)!.add(edge.to);
    outgoing.get(edge.from)!.push(edge.to);
    incoming.get(edge.to)!.push(edge.from);
  }

  const components = stronglyConnectedComponents(nodes, outgoing, incoming);
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

  const queue = components.map((_, index) => index).filter((index) => indegree.get(index) === 0);
  const rankByComponent = new Map(components.map((_, index) => [index, 0]));

  for (let index = 0; index < queue.length; index++) {
    const component = queue[index];
    for (const target of componentOutgoing.get(component)!) {
      rankByComponent.set(target, Math.max(rankByComponent.get(target)!, rankByComponent.get(component)! + 1));
      indegree.set(target, indegree.get(target)! - 1);
      if (indegree.get(target) === 0) {
        queue.push(target);
      }
    }
  }

  const rankOf = new Map(nodes.map((node) => [node.id, rankByComponent.get(componentOf.get(node.id)!) ?? 0]));
  const maxRank = Math.max(0, ...rankOf.values());
  const orderedLayers: string[][] = Array.from({ length: maxRank + 1 }, () => []);
  nodes.forEach((node) => orderedLayers[rankOf.get(node.id)!].push(node.id));

  // Repeated barycentric sweeps reduce crossings while retaining deterministic
  // source order when two nodes have the same relationship weight.
  const layerOrder = new Map(orderedLayers.flatMap((layer) => layer.map((id, index) => [id, index] as const)));
  const sortLayer = (rank: number, neighbors: Map<string, string[]>) => {
    const layer = orderedLayers[rank];
    if (layer.length < 2) return;
    const scores = new Map(layer.map((id) => {
      let total = 0;
      let count = 0;
      for (const neighbor of neighbors.get(id)!) {
        if (rankOf.get(neighbor) === rank) continue;
        total += layerOrder.get(neighbor)!;
        count++;
      }
      return [id, count ? total / count : sourceOrder.get(id)!];
    }));
    layer.sort((a, b) => scores.get(a)! - scores.get(b)! || sourceOrder.get(a)! - sourceOrder.get(b)!);
    layer.forEach((id, index) => layerOrder.set(id, index));
  };
  for (let pass = 0; pass < 3; pass += 1) {
    for (let rank = 1; rank <= maxRank; rank += 1) sortLayer(rank, incoming);
    for (let rank = maxRank - 1; rank >= 0; rank -= 1) sortLayer(rank, outgoing);
  }

  const crossSize = (node: FlowchartLayoutNode) => direction === "LR" ? node.height : node.width;
  const mainSize = (node: FlowchartLayoutNode) => direction === "LR" ? node.width : node.height;
  // Build lane/rank membership once; reuse it for measurement and placement.
  // Map insertion order is already the first source occurrence of each lane.
  const lanes = new Map<string, Map<number, FlowchartLayoutNode[]>>();
  for (const node of nodes) {
    const lane = node.groupId ? `group:${node.groupId}` : "ungrouped";
    if (!lanes.has(lane)) lanes.set(lane, new Map());
    const ranks = lanes.get(lane)!;
    const rank = rankOf.get(node.id)!;
    if (!ranks.has(rank)) ranks.set(rank, []);
    ranks.get(rank)!.push(node);
  }
  const occupiedSize = (members: FlowchartLayoutNode[]) => members.reduce((sum, node) => sum + crossSize(node), 0) + Math.max(0, members.length - 1) * NODE_GAP;
  const laneSizes = new Map<string, number>();
  for (const [lane, ranks] of lanes) {
    let size = 82;
    for (const members of ranks.values()) {
      members.sort((a, b) => layerOrder.get(a.id)! - layerOrder.get(b.id)!);
      size = Math.max(size, occupiedSize(members));
    }
    laneSizes.set(lane, size);
  }

  const laneStarts = new Map<string, number>();
  let crossCursor = ORIGIN;
  for (const lane of lanes.keys()) {
    laneStarts.set(lane, crossCursor);
    crossCursor += laneSizes.get(lane)! + LANE_GAP;
  }

  const rankStarts: number[] = [];
  let mainCursor = ORIGIN;
  for (let rank = 0; rank <= maxRank; rank += 1) {
    rankStarts[rank] = mainCursor;
    mainCursor += Math.max(82, ...orderedLayers[rank].map((id) => mainSize(nodeById.get(id)!))) + RANK_GAP;
  }

  const positions = new Map<string, { x: number; y: number; rank: number }>();
  lanes.forEach((ranks, lane) => {
    for (const [rank, members] of [...ranks].sort(([a], [b]) => a - b)) {
      const occupied = occupiedSize(members);
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
