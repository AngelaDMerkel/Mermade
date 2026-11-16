import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/load-typescript.mjs";

const loadLayout = () => loadTypeScript(new URL("../app/flowchart-layout.ts", import.meta.url));

const nodes = [
  { id: "start", width: 150, height: 62 },
  { id: "yes", width: 190, height: 82, groupId: "production" },
  { id: "no", width: 170, height: 62, groupId: "staging" },
  { id: "audit", width: 240, height: 102, groupId: "production" },
  { id: "merge", width: 160, height: 62 },
  { id: "finish", width: 88, height: 88 },
];

const edges = [
  { from: "start", to: "yes" },
  { from: "start", to: "no" },
  { from: "yes", to: "audit" },
  { from: "audit", to: "merge" },
  { from: "no", to: "merge" },
  { from: "merge", to: "finish" },
];

function rectanglesOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

test("lays out every connected flowchart node without overlap", async () => {
  const { layoutFlowchart } = await loadLayout();
  const positions = layoutFlowchart(nodes, edges, "LR");
  assert.equal(positions.size, nodes.length);

  const placed = nodes.map((node) => ({ ...node, ...positions.get(node.id) }));
  for (let index = 0; index < placed.length; index += 1) {
    for (let other = index + 1; other < placed.length; other += 1) {
      assert.equal(rectanglesOverlap(placed[index], placed[other]), false, `${placed[index].id} overlaps ${placed[other].id}`);
    }
  }

  for (const edge of edges) {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    assert.ok(to.rank > from.rank, `${edge.from} should precede ${edge.to}`);
    assert.ok(to.x > from.x, `${edge.from} should be left of ${edge.to}`);
  }
});

test("respects top-to-bottom direction and remains deterministic", async () => {
  const { layoutFlowchart } = await loadLayout();
  const first = layoutFlowchart(nodes, edges, "TB");
  const second = layoutFlowchart(nodes, edges, "TB");
  assert.deepEqual([...first], [...second]);

  for (const edge of edges) {
    assert.ok(first.get(edge.to).y > first.get(edge.from).y, `${edge.from} should be above ${edge.to}`);
  }
});

test("places cycles safely in one rank", async () => {
  const { layoutFlowchart } = await loadLayout();
  const cyclicNodes = nodes.slice(0, 3);
  const positions = layoutFlowchart(cyclicNodes, [
    { from: "start", to: "yes" },
    { from: "yes", to: "no" },
    { from: "no", to: "start" },
  ], "LR");

  assert.equal(new Set([...positions.values()].map((position) => position.rank)).size, 1);
  assert.ok([...positions.values()].flatMap((position) => [position.x, position.y]).every(Number.isFinite));
});

test("long chains and cycles do not exhaust the JavaScript call stack", async () => {
  const { layoutFlowchart } = await loadLayout();
  const large = Array.from({ length: 6_000 }, (_, index) => ({ id: `n${index}`, width: 150, height: 62 }));
  const links = large.slice(1).map((node, index) => ({ from: large[index].id, to: node.id }));
  const chain = layoutFlowchart(large, links, "TB");
  assert.equal(chain.size, large.length);
  for (const edge of links) {
    assert.equal(chain.get(edge.to).rank, chain.get(edge.from).rank + 1);
    assert.ok(chain.get(edge.to).y > chain.get(edge.from).y);
  }
  const cycle = layoutFlowchart(large, [...links, { from: large.at(-1).id, to: large[0].id }], "LR");
  assert.equal(cycle.size, large.length);
  assert.deepEqual(new Set([...cycle.values()].map(({ rank }) => rank)), new Set([0]));
  assert.ok([...cycle.values()].every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)));
});
