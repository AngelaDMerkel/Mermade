export function updateFlowchartDirection(source: string, direction: "LR" | "TB") {
  return source.replace(/^(\s*)(flowchart(?:-elk)?|graph)(?:\s+(?:LR|RL|TB|TD|BT))?\b/im, `$1$2 ${direction}`);
}

export function appendFlowchartStatements(source: string, statements: string[]) {
  const addition = statements.filter(Boolean).map((statement) => `  ${statement}`).join("\n");
  return addition ? `${source.trimEnd()}\n${addition}` : source;
}

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type SourceRange = { start: number; end: number };

/**
 * Locate declarations for one node without interpreting closing delimiters
 * inside quoted labels. Mermaid deliberately permits troublesome characters
 * such as square brackets inside quotes (`A["Inventory [SKU]"]`), so a
 * delimiter regex cannot safely decide where the node expression ends.
 */
function flowchartNodeDeclarationRanges(source: string, id: string) {
  const ranges: SourceRange[] = [];
  const isIdCharacter = (value: string | undefined) => Boolean(value && /[\w-]/.test(value));
  const closingToken = (index: number) => {
    if (source.startsWith("@{", index)) return { contentStart: index + 2, close: "}" };
    if (source.startsWith("([", index)) return { contentStart: index + 2, close: "])" };
    if (source.startsWith("((", index)) return { contentStart: index + 2, close: "))" };
    if (source.startsWith("{{", index)) return { contentStart: index + 2, close: "}}" };
    if (source.startsWith("[[", index)) return { contentStart: index + 2, close: "]]" };
    if (source.startsWith("[(", index)) return { contentStart: index + 2, close: ")]" };
    if (source.startsWith("[/", index)) return { contentStart: index + 2, close: "/]" };
    if (source.startsWith("[\\", index)) return { contentStart: index + 2, close: "\\]" };
    if (source[index] === "[") return { contentStart: index + 1, close: "]" };
    if (source[index] === "{") return { contentStart: index + 1, close: "}" };
    if (source[index] === "(") return { contentStart: index + 1, close: ")" };
    if (source[index] === ">") return { contentStart: index + 1, close: "]" };
    return null;
  };

  let quoted = false;
  let escaped = false;
  for (let index = 0; index < source.length;) {
    const character = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      index += 1;
      continue;
    }
    if (character === '"') {
      quoted = true;
      index += 1;
      continue;
    }
    if (
      source.startsWith(id, index)
      && !isIdCharacter(source[index - 1])
      && !isIdCharacter(source[index + id.length])
    ) {
      const expression = closingToken(index + id.length);
      if (expression) {
        let expressionQuoted = false;
        let expressionEscaped = false;
        let cursor = expression.contentStart;
        for (; cursor < source.length;) {
          const value = source[cursor];
          if (expressionQuoted) {
            if (expressionEscaped) expressionEscaped = false;
            else if (value === "\\") expressionEscaped = true;
            else if (value === '"') expressionQuoted = false;
            cursor += 1;
            continue;
          }
          if (value === '"') {
            expressionQuoted = true;
            cursor += 1;
            continue;
          }
          if (source.startsWith(expression.close, cursor)) {
            ranges.push({ start: index, end: cursor + expression.close.length });
            index = cursor + expression.close.length;
            break;
          }
          cursor += 1;
        }
        if (cursor < source.length) continue;
      }
    }
    index += 1;
  }
  return ranges;
}

export function updateFlowchartNodeStatement(source: string, id: string, syntax: string, style?: string) {
  const escapedId = escapePattern(id);
  const matches = flowchartNodeDeclarationRanges(source, id);
  let next = source;
  const match = matches.at(-1);
  if (match) {
    next = `${source.slice(0, match.start)}${syntax}${source.slice(match.end)}`;
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

export function updateFlowchartSubgraphStatement(source: string, id: string, label: string) {
  const escapedId = escapePattern(id);
  const safeLabel = label.replaceAll('"', "'");
  const declaration = new RegExp(`^(\\s*subgraph\\s+${escapedId})(?:\\["?(.*?)"?\\])?(\\s*)$`, "m");
  return source.replace(declaration, `$1["${safeLabel}"]$3`);
}

type FlowchartEdgeReference = { from: string; to: string; sourceOccurrence?: number };

type FlowchartRemoval = {
  nodeIds?: Iterable<string>;
  edges?: Iterable<FlowchartEdgeReference>;
  subgraphIds?: Iterable<string>;
};

// Mermaid permits compact relationships (`A-->B`), expressive fan-in/fan-out,
// edge IDs, longer links, dotted/thick labels, and circle/cross/bidirectional
// markers. Keep this single grammar shared by visual projection and mutation.
const RELATIONSHIP_CONNECTOR = /((?:[A-Za-z_][\w-]*@)?(?:--\s+"[^"]*"\s+-{2,}>?|--\s+[^|\n]+?\s+-{2,}>?|-\.\s+[^|\n]+?\s+\.+->|==\s+[^|\n]+?\s+={2,}>|[ox<]?(?:-{2,}|={2,}|-\.+-|~{3,})[>ox]?(?:\|"?[^|]*"?\|)?))/g;

function expressionId(expression: string) {
  return expression.trim().match(/^([A-Za-z_][\w-]*)/)?.[1];
}

function connectorLabel(connector: string) {
  const syntax = connector.replace(/^[A-Za-z_][\w-]*@/, "");
  return syntax.match(/\|"?([^|]*?)"?\|/)?.[1]
    ?? syntax.match(/^--\s+"?(.+?)"?\s+-{2,}>?$/)?.[1]
    ?? syntax.match(/^-\.\s+(.+?)\s+\.+->$/)?.[1]
    ?? syntax.match(/^==\s+(.+?)\s+={2,}>$/)?.[1]
    ?? "";
}

export function parseFlowchartRelationshipLine(line: string) {
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

  const edges: Array<FlowchartEdgeReference & { fromExpression: string; toExpression: string; connector: string; label: string }> = [];
  connectors.forEach((connector, index) => {
    const fromExpressions = operands[index].split(/\s*&\s*/).filter(Boolean);
    const toExpressions = operands[index + 1].split(/\s*&\s*/).filter(Boolean);
    for (const fromExpression of fromExpressions) {
      for (const toExpression of toExpressions) {
        const from = expressionId(fromExpression);
        const to = expressionId(toExpression);
        if (from && to) edges.push({ from, to, fromExpression, toExpression, connector: connector[1], label: connectorLabel(connector[1]) });
      }
    }
  });
  return { indentation: line.match(/^\s*/)?.[0] || "", operands, edges };
}

export type FlowchartSourceRelationship = ReturnType<typeof parseFlowchartRelationshipLine> extends infer Parsed
  ? NonNullable<Parsed> extends { edges: Array<infer Edge> }
    ? Edge & { lineIndex: number; sourceOccurrence: number }
    : never
  : never;

/** Return the canonical source-ordered relationship inventory for a flowchart. */
export function flowchartRelationships(source: string) {
  const occurrences = new Map<string, number>();
  const relationships: FlowchartSourceRelationship[] = [];
  source.split(/\r?\n/).forEach((line, lineIndex) => {
    const parsed = parseFlowchartRelationshipLine(line);
    parsed?.edges.forEach((edge) => {
      const key = edgeKey(edge.from, edge.to);
      const sourceOccurrence = occurrences.get(key) || 0;
      occurrences.set(key, sourceOccurrence + 1);
      relationships.push({ ...edge, lineIndex, sourceOccurrence });
    });
  });
  return relationships;
}

/**
 * Patch one exact source-backed relationship. Line-based parsing supports
 * every connector accepted by the tolerant flowchart model, including
 * labelled arrows such as `-->|"Yes"|`; repeated edits must never append a
 * second relationship merely because the first edit introduced a label.
 */
export function updateFlowchartEdgeStatement(source: string, from: string, to: string, syntax: string, occurrence = 0) {
  let matchingOccurrence = 0;
  let updated = false;
  const output: string[] = [];

  for (const line of source.split(/\r?\n/)) {
    const relationship = parseFlowchartRelationshipLine(line);
    if (!relationship || updated) {
      output.push(line);
      continue;
    }

    let targetIndex = -1;
    relationship.edges.forEach((edge, index) => {
      if (targetIndex >= 0 || edge.from !== from || edge.to !== to) return;
      if (matchingOccurrence === occurrence) targetIndex = index;
      matchingOccurrence += 1;
    });
    if (targetIndex < 0) {
      output.push(line);
      continue;
    }

    if (relationship.edges.length === 1) {
      output.push(`${relationship.indentation}${syntax}`);
    } else {
      relationship.edges.forEach((edge, index) => {
        output.push(index === targetIndex
          ? `${relationship.indentation}${syntax}`
          : `${relationship.indentation}${edge.fromExpression} ${edge.connector} ${edge.toExpression}`);
      });
    }
    updated = true;
  }

  return updated ? output.join("\n") : appendFlowchartStatements(source, [syntax]);
}

export type FlowchartEdgeEditRepair = {
  source: string;
  removed: number;
};

function connectorFamily(connector: string) {
  if (connector.startsWith("-.")) return connector.includes(">") ? "dashed-arrow" : "dashed-line";
  if (connector.startsWith("==")) return connector.includes(">") ? "thick-arrow" : "thick-line";
  return connector.includes(">") ? "solid-arrow" : "solid-line";
}

/**
 * Recover the unmistakable partial-label relationships produced by older
 * Mermade builds. Those builds appended each later keystroke after the style
 * block (`Y`, `Ye`, `Yes`) instead of replacing the original relationship.
 * Restrict recovery to duplicate endpoints whose later copies occur after the
 * first style statement and whose labels are identical or progressive.
 */
export function repairFlowchartEdgeEditArtifacts(source: string): FlowchartEdgeEditRepair {
  if (!/^\s*(?:flowchart|graph)\b/im.test(source)) return { source, removed: 0 };
  const lines = source.split(/\r?\n/);
  const firstStyle = lines.findIndex((line) => /^\s*style\s+/.test(line));
  if (firstStyle < 0) return { source, removed: 0 };

  type Candidate = {
    lineIndex: number;
    indentation: string;
    fromExpression: string;
    toExpression: string;
    connector: string;
    label: string;
  };
  const groups = new Map<string, Candidate[]>();
  lines.forEach((line, lineIndex) => {
    const relationship = parseFlowchartRelationshipLine(line);
    if (!relationship || relationship.edges.length !== 1) return;
    const edge = relationship.edges[0];
    const label = connectorLabel(edge.connector);
    if (!label) return;
    const key = `${edge.from}\u0000${edge.to}\u0000${connectorFamily(edge.connector)}`;
    groups.set(key, [...(groups.get(key) || []), {
      lineIndex,
      indentation: relationship.indentation,
      fromExpression: edge.fromExpression,
      toExpression: edge.toExpression,
      connector: edge.connector,
      label,
    }]);
  });

  const replacements = new Map<number, string>();
  const discarded = new Set<number>();
  groups.forEach((candidates) => {
    if (candidates.length < 2 || candidates[0].lineIndex >= firstStyle) return;
    const appended = candidates.slice(1);
    if (!appended.every((candidate) => candidate.lineIndex > firstStyle)) return;
    const progressive = candidates.every((candidate, index) => (
      index === 0 || candidate.label === candidates[index - 1].label || candidate.label.startsWith(candidates[index - 1].label)
    ));
    if (!progressive) return;

    const first = candidates[0];
    const final = candidates.at(-1) as Candidate;
    replacements.set(first.lineIndex, `${first.indentation}${first.fromExpression} ${final.connector} ${first.toExpression}`);
    appended.forEach((candidate) => discarded.add(candidate.lineIndex));
  });

  if (!discarded.size) return { source, removed: 0 };
  return {
    source: lines.filter((_, index) => !discarded.has(index)).map((line, index) => replacements.get(index) ?? line).join("\n"),
    removed: discarded.size,
  };
}

/**
 * Return every node identity represented by a flowchart source document.
 * This deliberately includes nodes referenced only by relationships: Mermaid
 * renders those nodes even when they have no separate declaration.
 */
export function flowchartNodeIds(source: string) {
  const ids = new Set<string>();
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("%%") || trimmed === "---"
      || /^(?:flowchart|graph|subgraph|end|direction|style|classDef|class|click)\b/.test(trimmed)
      || /^(?:config|themeVariables|theme|look|layout|fontFamily|primaryColor|primaryTextColor|lineColor|background|clusterBkg|clusterBorder):/.test(trimmed)) continue;

    const relationship = parseFlowchartRelationshipLine(line);
    if (relationship) {
      relationship.edges.forEach((edge) => {
        ids.add(edge.from);
        ids.add(edge.to);
      });
      continue;
    }

    const id = expressionId(trimmed);
    if (id && new RegExp(`^${escapePattern(id)}(?:\\s*$|\\s*@\\{|\\s*[\\[({>])`).test(trimmed)) ids.add(id);
  }
  return ids;
}

function edgeKey(from: string, to: string) {
  return `${from}\u0000${to}`;
}

function removeEmptySubgraphFrames(output: string[]) {
  const discardedFrames = new Set<number>();
  const frames: Array<{ start: number; meaningful: boolean; directionLines: number[] }> = [];
  output.forEach((line, index) => {
    if (/^\s*subgraph\b/.test(line)) {
      frames.push({ start: index, meaningful: false, directionLines: [] });
      return;
    }
    if (/^\s*end\s*$/.test(line) && frames.length) {
      const frame = frames.pop() as { start: number; meaningful: boolean; directionLines: number[] };
      if (frame.meaningful) {
        if (frames.length) frames[frames.length - 1].meaningful = true;
      } else {
        discardedFrames.add(frame.start);
        discardedFrames.add(index);
        frame.directionLines.forEach((directionIndex) => discardedFrames.add(directionIndex));
      }
      return;
    }
    if (frames.length && /^\s*direction\b/.test(line)) {
      frames[frames.length - 1].directionLines.push(index);
      return;
    }
    if (frames.length && line.trim() && !line.trimStart().startsWith("%%")) {
      frames[frames.length - 1].meaningful = true;
    }
  });
  return output.filter((_, index) => !discardedFrames.has(index));
}

/**
 * Move a node declaration into an existing subgraph, or back to the root when
 * targetSubgraphId is omitted. Standalone declarations are relocated intact so
 * labels, expanded shapes, and source-owned styling remain authoritative.
 */
export function moveFlowchartNodeToSubgraph(source: string, nodeId: string, targetSubgraphId?: string) {
  const escapedNodeId = escapePattern(nodeId);
  const declarationPattern = new RegExp(`^\\s*${escapedNodeId}(?:\\s*$|\\s*@\\{|\\s*[\\[({>])`);
  const declarations: string[] = [];
  const retained = source.split(/\r?\n/).filter((line) => {
    if (parseFlowchartRelationshipLine(line) || !declarationPattern.test(line)) return true;
    declarations.push(line.trim());
    return false;
  });
  const nodeStatements = declarations.length ? declarations : [nodeId];

  if (!targetSubgraphId) {
    const rooted = [...retained, ...nodeStatements.map((statement) => `  ${statement}`)];
    return removeEmptySubgraphFrames(rooted).join("\n");
  }

  const subgraphStack: Array<{ id: string; indentation: string }> = [];
  let targetEnd = -1;
  let targetIndentation = "  ";
  retained.forEach((line, index) => {
    const subgraph = line.match(/^(\s*)subgraph\s+([A-Za-z_][\w-]*)\b/);
    if (subgraph) {
      subgraphStack.push({ id: subgraph[2], indentation: subgraph[1] });
      return;
    }
    if (!/^\s*end\s*$/.test(line) || !subgraphStack.length) return;
    const closed = subgraphStack.pop();
    if (closed?.id === targetSubgraphId) {
      targetEnd = index;
      targetIndentation = `${closed.indentation}  `;
    }
  });
  if (targetEnd < 0) return null;

  retained.splice(targetEnd, 0, ...nodeStatements.map((statement) => `${targetIndentation}${statement}`));
  return removeEmptySubgraphFrames(retained).join("\n");
}

/**
 * Remove visual flowchart selections by patching only their Mermaid statements.
 * Relationship chains are expanded when necessary so unrelated nodes and edges,
 * comments, classes, links, and other advanced source remain authoritative.
 */
export function removeFlowchartItems(source: string, removal: FlowchartRemoval) {
  const nodeIds = new Set(removal.nodeIds || []);
  const subgraphIds = new Set(removal.subgraphIds || []);
  const edgeOccurrences = new Map<string, Set<number>>();
  const fallbackEdgeCounts = new Map<string, number>();
  for (const edge of removal.edges || []) {
    const key = edgeKey(edge.from, edge.to);
    if (edge.sourceOccurrence === undefined) {
      fallbackEdgeCounts.set(key, (fallbackEdgeCounts.get(key) || 0) + 1);
      continue;
    }
    const occurrences = edgeOccurrences.get(key) || new Set<number>();
    occurrences.add(edge.sourceOccurrence);
    edgeOccurrences.set(key, occurrences);
  }

  const lines = source.split(/\r?\n/);
  const encounteredOccurrences = new Map<string, number>();
  const relationshipPlans = new Map<number, {
    relationship: NonNullable<ReturnType<typeof parseFlowchartRelationshipLine>>;
    kept: NonNullable<ReturnType<typeof parseFlowchartRelationshipLine>>["edges"];
    changed: boolean;
  }>();

  // Decide every relationship removal before rewriting the document. Visual
  // relationships carry their source occurrence, so parallel arrows between
  // the same nodes cannot cause the first matching statement to be removed.
  lines.forEach((line, lineIndex) => {
    const relationship = parseFlowchartRelationshipLine(line);
    if (!relationship) return;
    let changed = false;
    const kept = relationship.edges.filter((edge) => {
      const key = edgeKey(edge.from, edge.to);
      const occurrence = encounteredOccurrences.get(key) || 0;
      encounteredOccurrences.set(key, occurrence + 1);

      if (nodeIds.has(edge.from) || nodeIds.has(edge.to)) {
        changed = true;
        return false;
      }
      if (edgeOccurrences.get(key)?.has(occurrence)) {
        changed = true;
        return false;
      }
      const fallbackCount = fallbackEdgeCounts.get(key) || 0;
      if (fallbackCount > 0) {
        changed = true;
        fallbackEdgeCounts.set(key, fallbackCount - 1);
        return false;
      }
      return true;
    });
    relationshipPlans.set(lineIndex, { relationship, kept, changed });
  });

  // Record the nodes that the rewritten source will still represent. A node
  // used only by the removed relationship must be retained, but a node that
  // already has a declaration or another relationship must not gain another
  // bare statement at the deletion site.
  const representedNodeIds = new Set<string>();
  lines.forEach((line, lineIndex) => {
    const plan = relationshipPlans.get(lineIndex);
    if (plan) {
      plan.kept.forEach((edge) => {
        representedNodeIds.add(edge.from);
        representedNodeIds.add(edge.to);
      });
      return;
    }
    const declarationId = expressionId(line);
    if (!declarationId || nodeIds.has(declarationId)) return;
    if (new RegExp(`^\\s*${escapePattern(declarationId)}(?:\\s*$|\\s*@\\{|\\s*[\\[({])`).test(line)) {
      representedNodeIds.add(declarationId);
    }
  });

  const output: string[] = [];
  const subgraphStack: Array<{ removed: boolean }> = [];

  for (const [lineIndex, line] of lines.entries()) {
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

    const plan = relationshipPlans.get(lineIndex);
    if (plan) {
      const { relationship, kept, changed } = plan;
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
        if (!id || nodeIds.has(id) || represented.has(id) || representedNodeIds.has(id)) continue;
        represented.add(id);
        representedNodeIds.add(id);
        output.push(`${relationship.indentation}${expression.trim()}`);
      }
      continue;
    }

    const declarationId = expressionId(line);
    if (declarationId && nodeIds.has(declarationId) && new RegExp(`^\\s*${escapePattern(declarationId)}(?:\\s*$|\\s*@\\{|\\s*[\\[({])`).test(line)) continue;
    output.push(line);
  }

  // Removing the last node from a subgraph otherwise leaves `subgraph … end`,
  // which Mermaid rejects and causes an apparently undeletable orphan. Remove
  // only the empty frame; retain any comments that were inside it.
  return removeEmptySubgraphFrames(output).join("\n");
}

export function appendFlowchartSubgraph(source: string, id: string, label: string, nodeIds: string[]) {
  const safeLabel = label.replaceAll('"', "'");
  return `${source.trimEnd()}\n  subgraph ${id}["${safeLabel}"]\n${nodeIds.map((nodeId) => `    ${nodeId}`).join("\n")}\n  end`;
}

/** Reserve identifiers even in valid syntax the visual projection cannot parse. */
export function uniqueFlowchartId(source: string, prefix: "node" | "group") {
  // Including label/comment tokens is deliberately conservative: skipping a
  // number is harmless, while redefining an unprojected node changes its data.
  // Generated IDs never contain hyphens. Split there too so compact Mermaid
  // connectors (node1-->B, node1---B, node1-.->B) cannot hide a reserved ID.
  const reserved = new Set(source.match(/[A-Za-z_]\w*/g) || []);
  let suffix = 1;
  while (reserved.has(`${prefix}${suffix}`)) suffix++;
  return `${prefix}${suffix}`;
}
