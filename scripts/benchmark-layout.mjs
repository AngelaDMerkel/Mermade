import { loadTypeScript } from '../tests/helpers/load-typescript.mjs';
const { layoutFlowchart } = await loadTypeScript(new URL('../app/flowchart-layout.ts', import.meta.url));
for (const [label, size, width] of [['chain', 1000, 1], ['grouped', 600, 20]]) {
  const nodes = Array.from({length: size}, (_, i) => ({id: `n${i}`, width: 150, height: 62, ...(width > 1 ? {groupId: `g${i % 5}`} : {})}));
  const edges = nodes.slice(width).map((node, i) => ({from: `n${i}`, to: node.id}));
  const durations = [];
  for (let repeat = 0; repeat < 4; repeat++) {
    const start = performance.now();
    layoutFlowchart(nodes, edges, 'LR');
    const duration = performance.now() - start;
    if (repeat) durations.push(duration);
  }
  durations.sort((a,b) => a-b);
  console.log(`${label} ${size}: ${durations[1].toFixed(1)} ms median`);
}
