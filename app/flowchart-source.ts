const FLOWCHART_HEADER = /^(?:flowchart|graph)(?:\s+(?:LR|RL|TB|TD|BT))?$/;
const SUBGRAPH = /^subgraph\s+(\w+)\["?(.*?)"?\]$/;
const NATIVE_STYLE = /^style\s+\w+\s+fill:#[\da-fA-F]{6},stroke:#77737f,color:#[\da-fA-F]{6},stroke-width:1\.5px$/;
const NATIVE_EDGE = /^(.+?)\s+(-\.->|-\.-|==>|===|-->|---)(?:\|"?(.*?)"?\|)?\s+(.+)$/;

const NATIVE_NODE_PATTERNS = [
  /^\w+@\{\s*shape:\s*[\w-]+,\s*label:\s*"[^"]*"\s*\}$/,
  /^\w+\(\["?.*?"?\]\)$/,
  /^\w+\(\("?.*?"?\)\)$/,
  /^\w+\{\{"?.*?"?\}\}$/,
  /^\w+\{"?.*?"?\}$/,
  /^\w+\["?.*?"?\]$/,
  /^\w+$/,
];

function isNativeNodeExpression(value: string) {
  const expression = value.trim();
  return NATIVE_NODE_PATTERNS.some((pattern) => pattern.test(expression));
}

function hasOnlyNativeFrontmatter(lines: string[]) {
  if (!lines.length) return true;
  if (lines[0] !== "---" || lines.at(-1) !== "---") return false;

  const supportedKeys = /^(?:config|themeVariables):$|^(?:theme|look|layout|fontFamily|primaryColor|primaryTextColor|lineColor|background|clusterBkg|clusterBorder):\s*.+$/;
  return lines.slice(1, -1).every((line) => supportedKeys.test(line));
}

/**
 * Mermade's generated node/edge model supports a smaller grammar than Mermaid
 * itself. Return true only when that model can replace the source losslessly.
 * A false result keeps the original source authoritative, while the tolerant
 * parser may still provide the established spatial FreeForm canvas.
 */
export function canUseNativeFlowchartEditor(source: string) {
  const lines = source.split("\n").map((line) => line.trim()).filter(Boolean);
  const headerIndex = lines.findIndex((line) => FLOWCHART_HEADER.test(line));
  if (headerIndex < 0 || !hasOnlyNativeFrontmatter(lines.slice(0, headerIndex))) return false;

  let groupOpen = false;
  for (const line of lines.slice(headerIndex + 1)) {
    if (SUBGRAPH.test(line)) {
      if (groupOpen) return false;
      groupOpen = true;
      continue;
    }

    if (line === "end") {
      if (!groupOpen) return false;
      groupOpen = false;
      continue;
    }

    if (NATIVE_STYLE.test(line) || isNativeNodeExpression(line)) continue;

    const edge = line.match(NATIVE_EDGE);
    if (edge && isNativeNodeExpression(edge[1]) && isNativeNodeExpression(edge[4])) continue;

    return false;
  }

  return !groupOpen;
}

export function updateFlowchartDirection(source: string, direction: "LR" | "TB") {
  return source.replace(/^(\s*)(flowchart|graph)(?:\s+(?:LR|RL|TB|TD|BT))?\b/im, `$1$2 ${direction}`);
}

export function appendFlowchartStatements(source: string, statements: string[]) {
  const addition = statements.filter(Boolean).map((statement) => `  ${statement}`).join("\n");
  return addition ? `${source.trimEnd()}\n${addition}` : source;
}

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function updateFlowchartNodeStatement(source: string, id: string, syntax: string, style?: string) {
  const escapedId = escapePattern(id);
  const declaration = new RegExp(`\\b${escapedId}(?:@\\{[^{}]*\\}|\\(\\[[^\\n]*?\\]\\)|\\(\\([^\\n]*?\\)\\)|\\{\\{[^\\n]*?\\}\\}|\\{[^\\n]*?\\}|\\[[^\\n]*?\\])`, "g");
  const matches = [...source.matchAll(declaration)];
  let next = source;
  const match = matches.at(-1);
  if (match?.index !== undefined) {
    next = `${source.slice(0, match.index)}${syntax}${source.slice(match.index + match[0].length)}`;
  } else {
    next = appendFlowchartStatements(source, [syntax]);
  }

  if (!style) return next;
  const lines = next.split("\n");
  const stylePattern = new RegExp(`^\\s*style\\s+${escapedId}\\b`);
  const styleIndex = lines.findLastIndex((line) => stylePattern.test(line));
  if (styleIndex >= 0) lines[styleIndex] = `  ${style}`;
  else lines.push(`  ${style}`);
  return lines.join("\n");
}

export function updateFlowchartEdgeStatement(source: string, from: string, to: string, syntax: string) {
  const escapedFrom = escapePattern(from);
  const escapedTo = escapePattern(to);
  const directEdge = new RegExp(`\\b${escapedFrom}\\b\\s+(?:(?:--\\s*"[^"]*"\\s*-->)|(?:---\\|"?[^|]*"?\\|)|(?:-\\.->|-\\.-|==>|===|-->|---))\\s+\\b${escapedTo}\\b`);
  return directEdge.test(source) ? source.replace(directEdge, syntax) : appendFlowchartStatements(source, [syntax]);
}

export function updateFlowchartSubgraphStatement(source: string, id: string, label: string) {
  const escapedId = escapePattern(id);
  const safeLabel = label.replaceAll('"', "'");
  const declaration = new RegExp(`^(\\s*subgraph\\s+${escapedId})(?:\\["?(.*?)"?\\])?(\\s*)$`, "m");
  return source.replace(declaration, `$1["${safeLabel}"]$3`);
}

type FlowchartEdgeReference = { from: string; to: string };

type FlowchartRemoval = {
  nodeIds?: Iterable<string>;
  edges?: Iterable<FlowchartEdgeReference>;
  subgraphIds?: Iterable<string>;
};

const RELATIONSHIP_CONNECTOR = /\s+(--\s*"[^"]*"\s*-->|(?:---|-->)\|"?[^|]*"?\||-\.->|-\.-|==>|===|-->|---)\s+/g;

function expressionId(expression: string) {
  return expression.trim().match(/^([A-Za-z_][\w-]*)/)?.[1];
}

function relationshipLine(line: string) {
  const connectors = [...line.matchAll(RELATIONSHIP_CONNECTOR)];
  if (!connectors.length) return null;

  const operands: string[] = [];
  let start = line.search(/\S|$/);
  for (const connector of connectors) {
    operands.push(line.slice(start, connector.index).trim());
    start = (connector.index || 0) + connector[0].length;
  }
  operands.push(line.slice(start).trim());
  if (operands.length !== connectors.length + 1) return null;

  const edges: Array<FlowchartEdgeReference & { fromExpression: string; toExpression: string; connector: string }> = [];
  connectors.forEach((connector, index) => {
    const fromExpressions = operands[index].split(/\s*&\s*/).filter(Boolean);
    const toExpressions = operands[index + 1].split(/\s*&\s*/).filter(Boolean);
    for (const fromExpression of fromExpressions) {
      for (const toExpression of toExpressions) {
        const from = expressionId(fromExpression);
        const to = expressionId(toExpression);
        if (from && to) edges.push({ from, to, fromExpression, toExpression, connector: connector[1] });
      }
    }
  });
  return { indentation: line.match(/^\s*/)?.[0] || "", operands, edges };
}

function edgeKey(from: string, to: string) {
  return `${from}\u0000${to}`;
}

/**
 * Remove visual flowchart selections by patching only their Mermaid statements.
 * Relationship chains are expanded when necessary so unrelated nodes and edges,
 * comments, classes, links, and other advanced source remain authoritative.
 */
export function removeFlowchartItems(source: string, removal: FlowchartRemoval) {
  const nodeIds = new Set(removal.nodeIds || []);
  const subgraphIds = new Set(removal.subgraphIds || []);
  const edgeCounts = new Map<string, number>();
  for (const edge of removal.edges || []) {
    const key = edgeKey(edge.from, edge.to);
    edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
  }

  const output: string[] = [];
  const subgraphStack: Array<{ removed: boolean }> = [];

  for (const line of source.split(/\r?\n/)) {
    const subgraph = line.match(/^\s*subgraph\s+([A-Za-z_][\w-]*)\b/);
    if (subgraph) {
      const removed = subgraphIds.has(subgraph[1]);
      subgraphStack.push({ removed });
      if (!removed) output.push(line);
      continue;
    }
    if (/^\s*end\s*$/.test(line) && subgraphStack.length) {
      const context = subgraphStack.pop();
      if (!context?.removed) output.push(line);
      continue;
    }

    const styleOrClick = line.match(/^\s*(?:style|click)\s+([A-Za-z_][\w-]*)\b/);
    if (styleOrClick && nodeIds.has(styleOrClick[1])) continue;

    const classStatement = line.match(/^(\s*class\s+)([A-Za-z_][\w,-]*)(\s+\S.*)$/);
    if (classStatement) {
      const remaining = classStatement[2].split(",").filter((id) => !nodeIds.has(id));
      if (!remaining.length) continue;
      output.push(`${classStatement[1]}${remaining.join(",")}${classStatement[3]}`);
      continue;
    }

    const relationship = relationshipLine(line);
    if (relationship) {
      let changed = false;
      const kept = relationship.edges.filter((edge) => {
        if (nodeIds.has(edge.from) || nodeIds.has(edge.to)) {
          changed = true;
          return false;
        }
        const key = edgeKey(edge.from, edge.to);
        const count = edgeCounts.get(key) || 0;
        if (count > 0) {
          changed = true;
          edgeCounts.set(key, count - 1);
          return false;
        }
        return true;
      });

      if (!changed) {
        output.push(line);
        continue;
      }

      const represented = new Set<string>();
      for (const edge of kept) {
        represented.add(edge.from);
        represented.add(edge.to);
        output.push(`${relationship.indentation}${edge.fromExpression} ${edge.connector} ${edge.toExpression}`);
      }
      for (const expression of relationship.operands.flatMap((operand) => operand.split(/\s*&\s*/))) {
        const id = expressionId(expression);
        if (!id || nodeIds.has(id) || represented.has(id)) continue;
        represented.add(id);
        output.push(`${relationship.indentation}${expression.trim()}`);
      }
      continue;
    }

    const declarationId = expressionId(line);
    if (declarationId && nodeIds.has(declarationId) && new RegExp(`^\\s*${escapePattern(declarationId)}(?:\\s*$|\\s*@\\{|\\s*[\\[({])`).test(line)) continue;
    output.push(line);
  }

  return output.join("\n");
}

export function appendFlowchartSubgraph(source: string, id: string, label: string, nodeIds: string[]) {
  const safeLabel = label.replaceAll('"', "'");
  return `${source.trimEnd()}\n  subgraph ${id}["${safeLabel}"]\n${nodeIds.map((nodeId) => `    ${nodeId}`).join("\n")}\n  end`;
}
