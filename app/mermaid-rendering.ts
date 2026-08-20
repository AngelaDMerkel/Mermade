import { parseGanttSource } from "./gantt-source";

export function normalizeRenderedSvg(svg: SVGSVGElement, diagramTypeId: string, source: string) {
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  // Large flowcharts are commonly viewed well below 100% zoom. Keep their
  // relationship strokes at a readable screen width instead of allowing the
  // canvas transform to collapse them into faint sub-pixel lines.
  if (diagramTypeId === "flowchart") {
    svg.querySelectorAll<SVGGeometryElement>(".flowchart-link").forEach((edge) => {
      edge.setAttribute("vector-effect", "non-scaling-stroke");
      if (edge.classList.contains("edge-thickness-normal") && !edge.style.strokeWidth) {
        edge.style.strokeWidth = "1.5px";
      }
    });

    svg.querySelectorAll<SVGGeometryElement>(
      ".node > rect, .node > circle, .node > ellipse, .node > polygon, .node > path, "
      + ".node > .label-container rect, .node > .label-container circle, .node > .label-container ellipse, "
      + ".node > .label-container polygon, .node > .label-container path",
    ).forEach((shape) => shape.setAttribute("vector-effect", "non-scaling-stroke"));

    // Compound Mermaid 11 shapes can contain several narrow paths. Give every
    // rendered node a stable rectangular hit area so it remains selectable at
    // the very small zoom levels used by large ELK diagrams.
    svg.querySelectorAll<SVGGElement>(".node").forEach((node) => {
      if (node.querySelector(":scope > .mermade-node-hit")) return;
      try {
        const bounds = node.getBBox();
        if (bounds.width <= 0 || bounds.height <= 0) return;
        const hit = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        hit.classList.add("mermade-node-hit");
        hit.setAttribute("x", String(bounds.x));
        hit.setAttribute("y", String(bounds.y));
        hit.setAttribute("width", String(bounds.width));
        hit.setAttribute("height", String(bounds.height));
        hit.setAttribute("vector-effect", "non-scaling-stroke");
        // Mermaid emits diagram-scoped `!important` rules for classDef styles.
        // In particular, `classDef default stroke:...` also matches rectangles
        // injected beneath every node. Keep this editor-only hit target
        // invisible with inline important declarations, which outrank the
        // generated diagram stylesheet without changing the Mermaid source.
        hit.style.setProperty("fill", "transparent", "important");
        hit.style.setProperty("stroke", "transparent", "important");
        hit.style.setProperty("stroke-width", "14px", "important");
        hit.style.setProperty("opacity", "0", "important");
        hit.style.setProperty("pointer-events", "all");
        node.insertBefore(hit, node.firstChild);
      } catch {
        // Detached export SVGs may not expose getBBox; the visible renderer does.
      }
    });
  }

  // Mermaid's experimental C4 renderer offsets a direct-child title by four
  // diagram margins instead of centring it in the generated viewBox.
  if (diagramTypeId === "c4") {
    const titleText = source.match(/^\s*title\s+(.+?)\s*$/m)?.[1];
    const title = titleText
      ? [...svg.children].find((element) => element.tagName.toLowerCase() === "text" && element.textContent?.trim() === titleText) as SVGTextElement | undefined
      : undefined;
    const viewBox = svg.viewBox.baseVal;
    if (title && viewBox.width > 0) {
      title.setAttribute("x", String(viewBox.x + viewBox.width / 2));
      title.setAttribute("text-anchor", "middle");
    }
  }
}

function comparableText(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/["'`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

/**
 * Find the Mermaid source statement most likely represented by a rendered
 * label. This is deliberately syntax-agnostic so every registered diagram
 * family can offer a validated statement editor without maintaining a second
 * parser for Mermaid's complete grammar.
 */
export function sourceLineForRenderedText(source: string, renderedText: string) {
  const label = comparableText(renderedText);
  if (label.length < 2) return -1;

  // A Gantt dependency may repeat another task's label or ID (`after research`).
  // Prefer the exact task-title/section-name field before generic containment,
  // otherwise the shortest dependency statement can steal the rendered label.
  if (/^\s*gantt\b/im.test(source)) {
    const exactGanttLine = source.split(/\r?\n/).findIndex((line) => {
      const trimmed = line.trim();
      const section = trimmed.match(/^section\s+(.+?)\s*$/i);
      if (section) return comparableText(section[1]) === label;
      const separator = trimmed.indexOf(":");
      return separator > 0 && comparableText(trimmed.slice(0, separator)) === label;
    });
    if (exactGanttLine >= 0) return exactGanttLine;
  }

  const candidates = source.split(/\r?\n/)
    .map((line, index) => ({ line: comparableText(line), index, rawLength: line.length }))
    .filter(({ line }) => line && !line.startsWith("%%") && !line.startsWith("---"));
  const matches = candidates.filter(({ line }) => line.includes(label));
  if (!matches.length) return -1;
  matches.sort((first, second) => first.rawLength - second.rawLength || first.index - second.index);
  return matches[0].index;
}

/** Attach source-line metadata to rendered labels and their nearest SVG group. */
export function decorateRenderedStatements(svg: SVGSVGElement, source: string) {
  const decorated = new Set<Element>();
  const isGantt = /^\s*gantt\b/im.test(source);
  const ganttDocument = isGantt ? parseGanttSource(source) : null;
  const ganttTaskLines = new Map<string, number[]>();
  const ganttSectionLines = new Map<string, number[]>();
  const ganttBars = isGantt ? [...svg.querySelectorAll<SVGElement>("rect.task")] : [];
  const ganttBarsById = new Map<string, SVGElement[]>();
  const ganttTasksById = new Map<string, NonNullable<typeof ganttDocument>["tasks"]>();
  const assignedGanttBars = new Set<SVGElement>();
  const renderedTextOccurrences = new Map<string, number>();
  const sourceLines = source.split(/\r?\n/);
  ganttDocument?.tasks.forEach((task) => ganttTaskLines.set(comparableText(task.label), [...(ganttTaskLines.get(comparableText(task.label)) || []), task.lineIndex]));
  ganttDocument?.tasks.forEach((task) => {
    if (task.id) ganttTasksById.set(task.id, [...(ganttTasksById.get(task.id) ?? []), task]);
  });
  ganttDocument?.sections.forEach((section) => ganttSectionLines.set(comparableText(section.label), [...(ganttSectionLines.get(comparableText(section.label)) || []), section.lineIndex]));
  ganttBars.forEach((bar) => {
    if (!bar.id) return;
    ganttBarsById.set(bar.id, [...(ganttBarsById.get(bar.id) || []), bar]);
  });
  svg.querySelectorAll<SVGGraphicsElement>("text, foreignObject").forEach((label) => {
    const renderedLabel = comparableText(label.textContent || "");
    const isGanttTaskLabel = label instanceof SVGTextElement && [...label.classList].some((name) => name.startsWith("taskText"));
    const textBarId = isGanttTaskLabel && label.id.endsWith("-text") ? label.id.slice(0, -5) : "";
    const taskFromUniqueId = textBarId
      ? [...ganttTasksById.entries()]
        .filter(([id, tasks]) => tasks.length === 1 && textBarId.endsWith(`-${id}`))
        .sort(([left], [right]) => right.length - left.length)[0]?.[1][0]
      : undefined;
    const taskLinesForLabel = isGanttTaskLabel ? ganttTaskLines.get(renderedLabel) : undefined;
    if (taskFromUniqueId && taskLinesForLabel) {
      const preferredIndex = taskLinesForLabel.indexOf(taskFromUniqueId.lineIndex);
      if (preferredIndex >= 0) taskLinesForLabel.splice(preferredIndex, 1);
    }
    const taskLine = isGanttTaskLabel ? taskFromUniqueId?.lineIndex ?? taskLinesForLabel?.shift() : undefined;
    const sectionLine = label instanceof SVGTextElement && label.classList.contains("sectionTitle")
      ? ganttSectionLines.get(renderedLabel)?.shift()
      : undefined;
    let line = taskLine ?? sectionLine;
    if (line === undefined) {
      const occurrence = renderedTextOccurrences.get(renderedLabel) ?? 0;
      const matchingLines = renderedLabel.length < 2 ? [] : sourceLines
        .map((candidate, index) => ({ candidate: comparableText(candidate), index }))
        .filter(({ candidate }) => candidate && !candidate.startsWith("%%") && !candidate.startsWith("---") && candidate.includes(renderedLabel))
        .map(({ index }) => index);
      line = matchingLines[occurrence] ?? matchingLines[0] ?? sourceLineForRenderedText(source, label.textContent || "");
      renderedTextOccurrences.set(renderedLabel, occurrence + 1);
    }
    if (line < 0) return;
    if (isGantt && isGanttTaskLabel) {
      label.dataset.sourceLine = String(line);
      decorated.add(label);
      const textId = label.id;
      const barId = textId.endsWith("-text") ? textId.slice(0, -5) : "";
      // Mermaid can emit duplicate SVG ids when otherwise-renderable Gantt
      // source reuses a task id. An id selector always returns the first bar,
      // so consume matching bars by occurrence and then fall back to rendered
      // task order. This keeps every label attached to its own visual bar.
      const matchingBars = barId ? ganttBarsById.get(barId) : undefined;
      let bar = matchingBars?.find((candidate) => !assignedGanttBars.has(candidate));
      bar ??= ganttBars.find((candidate) => !assignedGanttBars.has(candidate));
      if (bar) {
        bar.dataset.sourceLine = String(line);
        assignedGanttBars.add(bar);
        decorated.add(bar);
      }
      return;
    }
    if (isGantt && label instanceof SVGTextElement && label.classList.contains("sectionTitle")) {
      label.dataset.sourceLine = String(line);
      decorated.add(label);
      return;
    }
    const target = label.closest("g") || label;
    if (!(target instanceof SVGElement)) return;
    target.dataset.sourceLine = String(line);
    label.dataset.sourceLine = String(line);
    decorated.add(target);
    decorated.add(label);
  });
  return decorated.size;
}

export function normalizeSvgMarkup(markup: string, diagramTypeId: string, source: string) {
  const container = document.createElement("div");
  container.innerHTML = markup;
  const svg = container.querySelector("svg");
  if (!svg) return markup;
  normalizeRenderedSvg(svg, diagramTypeId, source);
  return svg.outerHTML;
}
