export type GanttTaskStatus = "planned" | "active" | "done";
export type GanttWeekday = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

export type GanttSection = {
  kind: "section";
  lineIndex: number;
  label: string;
  order: number;
};

export type GanttTask = {
  kind: "task";
  lineIndex: number;
  label: string;
  sectionLineIndex: number | null;
  sectionLabel: string;
  order: number;
  status: GanttTaskStatus;
  critical: boolean;
  milestone: boolean;
  id: string;
  start: string;
  finish: string;
};

export type GanttItem = GanttSection | GanttTask;

export type GanttDocument = {
  headerLineIndex: number;
  items: GanttItem[];
  sections: GanttSection[];
  tasks: GanttTask[];
};

export type GanttItemDraft = {
  kind: "section" | "task";
  label: string;
  sectionLineIndex: number | null;
  order: number;
  status: GanttTaskStatus;
  critical: boolean;
  milestone: boolean;
  id: string;
  start: string;
  finish: string;
};

export type GanttTaskSchedule = {
  start: Date;
  end: Date;
  durationDays: number;
  milestoneDate?: Date;
};

const TASK_TAGS = new Set(["active", "done", "crit", "milestone"]);
const NON_TASK_STATEMENT = /^(?:title|dateFormat|axisFormat|tickInterval|excludes|includes|inclusiveEndDates|todayMarker|weekday|weekend|click|accTitle|accDescr|vert)\b/i;
const GANTT_WEEKDAYS: GanttWeekday[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const GANTT_DIRECTIVE_ORDER = [
  "title",
  "accTitle",
  "accDescr",
  "dateFormat",
  "axisFormat",
  "tickInterval",
  "weekday",
  "weekend",
  "inclusiveEndDates",
  "excludes",
  "includes",
  "todayMarker",
  "topAxis",
  "vert",
] as const;
const GANTT_DIRECTIVE_NAMES = new Map(GANTT_DIRECTIVE_ORDER.map((name, index) => [name.toLocaleLowerCase(), { name, index }]));

export function ganttWeekdayFromSource(source: string): GanttWeekday {
  const value = source.match(/^\s*weekday\s+(\S+)\s*$/im)?.[1]?.toLocaleLowerCase();
  return GANTT_WEEKDAYS.includes(value as GanttWeekday) ? value as GanttWeekday : "sunday";
}

function ganttDirectiveTokens(source: string, directive: "excludes" | "includes") {
  return source.split(/\r?\n/).flatMap((line) => {
    const value = line.match(new RegExp(`^\\s*${directive}\\s+([^#;]+)`, "i"))?.[1];
    return value ? value.toLocaleLowerCase().split(/[\s,]+/).filter(Boolean) : [];
  });
}

export function ganttExcludesWeekendsFromSource(source: string) {
  return ganttDirectiveTokens(source, "excludes").includes("weekends");
}

export function ganttInclusiveEndDatesFromSource(source: string) {
  return /^\s*inclusiveEndDates\s*$/im.test(source);
}

/** Add or remove Mermaid's standard inclusive explicit-end-date directive. */
export function setGanttInclusiveEndDates(source: string, inclusive: boolean) {
  const lines = source.split(/\r?\n/);
  const directiveLines = lines.flatMap((line, index) => /^\s*inclusiveEndDates\s*$/i.test(line) ? [index] : []);
  if (!inclusive) {
    for (let index = directiveLines.length - 1; index >= 0; index -= 1) lines.splice(directiveLines[index], 1);
    return lines.join("\n");
  }
  if (directiveLines.length) return source;
  const dateFormatLine = lines.findIndex((line) => /^\s*dateFormat\b/i.test(line));
  const ganttLine = lines.findIndex((line) => /^\s*gantt\b/i.test(line));
  const insertionIndex = dateFormatLine >= 0 ? dateFormatLine + 1 : Math.max(0, ganttLine + 1);
  lines.splice(insertionIndex, 0, "    inclusiveEndDates");
  return lines.join("\n");
}

function setGanttDirective(source: string, directive: "tickInterval" | "weekday", value: string) {
  const lines = source.split(/\r?\n/);
  const existing = lines.findIndex((line) => new RegExp(`^\\s*${directive}\\b`, "i").test(line));
  if (existing >= 0) {
    const indent = lines[existing].match(/^\s*/)?.[0] || "    ";
    lines[existing] = `${indent}${directive} ${value}`;
    return lines.join("\n");
  }
  const dateFormatLine = lines.findIndex((line) => /^\s*dateFormat\b/i.test(line));
  const ganttLine = lines.findIndex((line) => /^\s*gantt\b/i.test(line));
  const insertionIndex = dateFormatLine >= 0 ? dateFormatLine + 1 : Math.max(0, ganttLine + 1);
  lines.splice(insertionIndex, 0, `    ${directive} ${value}`);
  return lines.join("\n");
}

/** Configure canonical weekly ticks using Mermaid's standard Gantt directives. */
export function setGanttWeekStart(source: string, weekday: GanttWeekday) {
  return setGanttDirective(setGanttDirective(source, "tickInterval", "1week"), "weekday", weekday);
}

/** Add or remove Mermaid's standard weekend exclusion without losing other excluded dates. */
export function setGanttExcludeWeekends(source: string, excluded: boolean) {
  const lines = source.split(/\r?\n/);
  const exclusionLines = lines.flatMap((line, index) => /^\s*excludes\s+/i.test(line) ? [index] : []);
  if (excluded) {
    if (ganttExcludesWeekendsFromSource(source)) return source;
    if (exclusionLines.length) {
      const index = exclusionLines[0];
      const indent = lines[index].match(/^\s*/)?.[0] || "    ";
      const existing = lines[index].replace(/^\s*excludes\s+/i, "").trim();
      lines[index] = `${indent}excludes weekends${existing ? `, ${existing}` : ""}`;
      return lines.join("\n");
    }
    const ganttLine = lines.findIndex((line) => /^\s*gantt\b/i.test(line));
    const lastConfigLine = lines.reduce((last, line, index) => (
      /^\s*(?:dateFormat|axisFormat|tickInterval|weekday|weekend|includes|inclusiveEndDates|topAxis)\b/i.test(line)
        ? index
        : last
    ), ganttLine);
    lines.splice(Math.max(0, lastConfigLine + 1), 0, "    excludes weekends");
    return lines.join("\n");
  }

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!/^\s*excludes\s+/i.test(lines[index])) continue;
    const indent = lines[index].match(/^\s*/)?.[0] || "    ";
    const remaining = lines[index]
      .replace(/^\s*excludes\s+/i, "")
      .trim()
      .split(/[\s,]+/)
      .filter((token) => token && token.toLocaleLowerCase() !== "weekends");
    if (remaining.length) lines[index] = `${indent}excludes ${remaining.join(", ")}`;
    else lines.splice(index, 1);
  }
  return lines.join("\n");
}

function splitMetadata(value: string) {
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}

function parseIsoDate(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.valueOf()) ? null : date;
}

function durationInDays(value: string) {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(d|w|h)$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  return match[2].toLocaleLowerCase() === "w" ? amount * 7 : match[2].toLocaleLowerCase() === "h" ? amount / 24 : amount;
}

function addDays(date: Date, days: number) {
  return new Date(date.valueOf() + days * 86_400_000);
}

function differenceDays(start: Date, end: Date) {
  return (end.valueOf() - start.valueOf()) / 86_400_000;
}

function isExcludedGanttDate(source: string, date: Date) {
  const includes = new Set(ganttDirectiveTokens(source, "includes"));
  const dateValue = formatIsoDate(date);
  if (includes.has(dateValue)) return false;
  const excludes = new Set(ganttDirectiveTokens(source, "excludes"));
  const weekday = GANTT_WEEKDAYS[(date.getUTCDay() + 6) % 7];
  if (excludes.has(weekday) || excludes.has(dateValue)) return true;
  if (!excludes.has("weekends")) return false;
  const weekendStart = source.match(/^\s*weekend\s+(friday|saturday)\s*$/im)?.[1]?.toLocaleLowerCase() || "saturday";
  return weekendStart === "friday"
    ? weekday === "friday" || weekday === "saturday"
    : weekday === "saturday" || weekday === "sunday";
}

function adjustGanttDurationEnd(source: string, start: Date, nominalEnd: Date) {
  let cursor = addDays(start, 1);
  let end = nominalEnd;
  let iterations = 0;
  while (cursor <= end && iterations < 10_000) {
    if (isExcludedGanttDate(source, cursor)) end = addDays(end, 1);
    cursor = addDays(cursor, 1);
    iterations += 1;
  }
  return end;
}

function ganttDurationDaysBetween(source: string, start: Date, end: Date) {
  let cursor = addDays(start, 1);
  let duration = 0;
  while (cursor <= end) {
    if (!isExcludedGanttDate(source, cursor)) duration += 1;
    cursor = addDays(cursor, 1);
  }
  return Math.max(1, duration);
}

function formatIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Snap a date to the closest Monday or Wednesday project-planning boundary. */
export function snapGanttDate(date: Date) {
  const calendarDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = calendarDate.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const monday = addDays(calendarDate, -daysSinceMonday);
  const candidates = [addDays(monday, -5), monday, addDays(monday, 2), addDays(monday, 7)];
  return candidates.reduce((closest, candidate) => Math.abs(candidate.valueOf() - date.valueOf()) < Math.abs(closest.valueOf() - date.valueOf()) ? candidate : closest);
}

export function parseGanttTaskLine(
  line: string,
  lineIndex: number,
  sectionLineIndex: number | null,
  sectionLabel: string,
  order: number,
): GanttTask | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("%%") || NON_TASK_STATEMENT.test(trimmed)) return null;
  const separator = trimmed.indexOf(":");
  if (separator < 1) return null;
  const label = trimmed.slice(0, separator).trim();
  if (!label) return null;

  const metadata = splitMetadata(trimmed.slice(separator + 1));
  const tags: string[] = [];
  while (metadata.length && TASK_TAGS.has(metadata[0].toLocaleLowerCase())) tags.push(metadata.shift()!.toLocaleLowerCase());

  let id = "";
  let start = "";
  let finish = "";
  if (metadata.length >= 3) {
    [id, start, finish] = metadata;
  } else if (metadata.length === 2) {
    [start, finish] = metadata;
  } else if (metadata.length === 1) {
    [finish] = metadata;
  }

  return {
    kind: "task",
    lineIndex,
    label,
    sectionLineIndex,
    sectionLabel,
    order,
    status: tags.includes("done") ? "done" : tags.includes("active") ? "active" : "planned",
    critical: tags.includes("crit"),
    milestone: tags.includes("milestone"),
    id,
    start,
    finish,
  };
}

export function parseGanttSource(source: string): GanttDocument {
  const lines = source.split(/\r?\n/);
  const headerLineIndex = lines.findIndex((line) => /^\s*gantt\b/i.test(line));
  const items: GanttItem[] = [];
  const sections: GanttSection[] = [];
  const tasks: GanttTask[] = [];
  let sectionLineIndex: number | null = null;
  let sectionLabel = "";
  let taskOrder = 0;

  for (let lineIndex = Math.max(0, headerLineIndex + 1); lineIndex < lines.length; lineIndex += 1) {
    const sectionMatch = lines[lineIndex].trim().match(/^section\s+(.+?)\s*$/i);
    if (sectionMatch) {
      const section: GanttSection = {
        kind: "section",
        lineIndex,
        label: sectionMatch[1].trim(),
        order: sections.length + 1,
      };
      items.push(section);
      sections.push(section);
      sectionLineIndex = lineIndex;
      sectionLabel = section.label;
      taskOrder = 0;
      continue;
    }

    const task = parseGanttTaskLine(lines[lineIndex], lineIndex, sectionLineIndex, sectionLabel, taskOrder + 1);
    if (!task) continue;
    taskOrder += 1;
    items.push(task);
    tasks.push(task);
  }

  return { headerLineIndex, items, sections, tasks };
}

export function ganttItemAtLine(source: string, lineIndex: number) {
  return parseGanttSource(source).items.find((item) => item.lineIndex === lineIndex);
}

export function ganttDraftFromItem(item: GanttItem): GanttItemDraft {
  return item.kind === "section" ? {
    kind: "section",
    label: item.label,
    sectionLineIndex: item.lineIndex,
    order: item.order,
    status: "planned",
    critical: false,
    milestone: false,
    id: "",
    start: "",
    finish: "1d",
  } : { ...item };
}

export function serialiseGanttTask(draft: GanttItemDraft) {
  const label = draft.label.trim();
  const finish = draft.finish.trim();
  const id = draft.id.trim();
  const start = draft.start.trim();
  if (!label) throw new Error("A task bar needs a label");
  if (!finish) throw new Error("Enter an end date or duration, such as 5d");
  if (id && !start) throw new Error("A task with an ID also needs a start date or an ‘after task-id’ dependency");

  const metadata = [
    ...(draft.critical ? ["crit"] : []),
    ...(draft.status === "active" ? ["active"] : draft.status === "done" ? ["done"] : []),
    ...(draft.milestone ? ["milestone"] : []),
    ...(id ? [id, start, finish] : start ? [start, finish] : [finish]),
  ];
  const indent = draft.sectionLineIndex === null ? "    " : "        ";
  return `${indent}${label} :${metadata.join(", ")}`;
}

function formatGanttDirective(line: string) {
  const trimmed = line.trim();
  const match = trimmed.match(/^(\S+)(?:\s+(.+?))?\s*$/);
  const directive = match ? GANTT_DIRECTIVE_NAMES.get(match[1].toLocaleLowerCase()) : undefined;
  if (!match || !directive) return null;
  return {
    order: directive.index,
    value: `    ${directive.name}${match[2] ? ` ${match[2].trim().replace(/\s+/g, " ")}` : ""}`,
  };
}

/**
 * Format recognised Gantt statements as a stable, YAML-like hierarchy while
 * retaining Mermaid syntax and the existing number of source lines.
 */
export function formatGanttSource(source: string) {
  const document = parseGanttSource(source);
  if (document.headerLineIndex < 0) return source;
  const itemsByLine = new Map(document.items.map((item) => [item.lineIndex, item]));
  const lines = source.split(/\r?\n/);
  const formatted = lines.map((line, lineIndex) => {
    if (lineIndex < document.headerLineIndex) return line.trimEnd();
    const trimmed = line.trim();
    if (lineIndex === document.headerLineIndex) return trimmed;
    if (!trimmed) return "";
    const item = itemsByLine.get(lineIndex);
    if (item?.kind === "task") return serialiseGanttTask(ganttDraftFromItem(item));
    if (item?.kind === "section") return `    section ${item.label}`;
    const directive = formatGanttDirective(trimmed);
    if (directive) return directive.value;
    const withinSection = document.sections.some((section, index) => (
      lineIndex > section.lineIndex
      && lineIndex < (document.sections[index + 1]?.lineIndex ?? lines.length)
    ));
    return `${withinSection && trimmed.startsWith("%%") ? "        " : "    "}${trimmed}`;
  });

  const firstItemLine = document.items[0]?.lineIndex ?? lines.length;
  const directiveSlots = lines
    .map((line, lineIndex) => ({ lineIndex, directive: lineIndex > document.headerLineIndex && lineIndex < firstItemLine ? formatGanttDirective(line) : null }))
    .filter((entry): entry is { lineIndex: number; directive: NonNullable<ReturnType<typeof formatGanttDirective>> } => Boolean(entry.directive));
  const orderedDirectives = [...directiveSlots].sort((left, right) => left.directive.order - right.directive.order || left.lineIndex - right.lineIndex);
  directiveSlots.forEach((slot, index) => {
    formatted[slot.lineIndex] = orderedDirectives[index].directive.value;
  });
  return formatted.join("\n");
}

function sectionEnd(lines: string[], sectionLineIndex: number) {
  for (let index = sectionLineIndex + 1; index < lines.length; index += 1) {
    if (/^\s*section\s+/i.test(lines[index])) return index;
  }
  return lines.length;
}

function insertTask(lines: string[], draft: GanttItemDraft) {
  const parsed = parseGanttSource(lines.join("\n"));
  const targetSection = draft.sectionLineIndex === null
    ? null
    : parsed.sections.find((section) => section.lineIndex === draft.sectionLineIndex);
  const candidates = parsed.tasks.filter((task) => task.sectionLineIndex === (targetSection?.lineIndex ?? null));
  const requestedOrder = Math.max(1, Math.min(draft.order || candidates.length + 1, candidates.length + 1));
  let insertionIndex: number;
  if (candidates[requestedOrder - 1]) {
    insertionIndex = candidates[requestedOrder - 1].lineIndex;
  } else if (targetSection) {
    insertionIndex = sectionEnd(lines, targetSection.lineIndex);
  } else {
    insertionIndex = parsed.sections[0]?.lineIndex ?? lines.length;
  }
  lines.splice(insertionIndex, 0, serialiseGanttTask(draft));
  return insertionIndex;
}

/**
 * Update one visual Gantt item while preserving unrelated directives and comments.
 * The result always uses Mermaid's documented `section Name` or `Task :metadata`
 * statement forms; the caller still validates the complete source with Mermaid.
 */
export function updateGanttItem(source: string, originalLineIndex: number, draft: GanttItemDraft) {
  const original = ganttItemAtLine(source, originalLineIndex);
  if (!original) throw new Error("The selected Gantt item is no longer present");
  if (!draft.label.trim()) throw new Error(draft.kind === "section" ? "A section needs a name" : "A task bar needs a label");

  const lines = source.split(/\r?\n/);
  const originalId = original.kind === "task" ? original.id : "";
  const nextId = draft.kind === "task" ? draft.id.trim() : "";
  const shouldRenameReferences = Boolean(
    originalId
      && nextId
      && originalId !== nextId
      && parseGanttSource(source).tasks.filter((task) => task.id === originalId).length === 1,
  );
  const finish = (result: { source: string; lineIndex: number }) => shouldRenameReferences
    ? { ...result, source: renameGanttTaskReferences(result.source, originalId, nextId) }
    : result;
  if (draft.kind === "section") {
    lines[originalLineIndex] = `    section ${draft.label.trim()}`;
    const renamedSource = original.kind === "section"
      ? renameGanttSectionTaskIds(lines.join("\n"), originalLineIndex, draft.label.trim())
      : lines.join("\n");
    return { source: renamedSource, lineIndex: originalLineIndex };
  }

  if (original.kind === "section") {
    lines.splice(originalLineIndex, 1);
    const adjustedDraft = {
      ...draft,
      sectionLineIndex: draft.sectionLineIndex !== null && draft.sectionLineIndex > originalLineIndex
        ? draft.sectionLineIndex - 1
        : draft.sectionLineIndex,
    };
    const lineIndex = insertTask(lines, adjustedDraft);
    return finish({ source: lines.join("\n"), lineIndex });
  }

  const sourceSectionLineIndex = original.sectionLineIndex;
  const requestedSectionLineIndex = draft.sectionLineIndex;
  const sameSection = sourceSectionLineIndex === requestedSectionLineIndex;
  if (sameSection && original.order === draft.order) {
    lines[originalLineIndex] = serialiseGanttTask(draft);
    return finish({ source: lines.join("\n"), lineIndex: originalLineIndex });
  }

  lines.splice(originalLineIndex, 1);
  const adjustedDraft = {
    ...draft,
    sectionLineIndex: requestedSectionLineIndex !== null && requestedSectionLineIndex > originalLineIndex
      ? requestedSectionLineIndex - 1
      : requestedSectionLineIndex,
  };
  const lineIndex = insertTask(lines, adjustedDraft);
  return finish({ source: lines.join("\n"), lineIndex });
}

/** Keep standard Mermaid dependency and click references valid after an ID change. */
function renameGanttTaskReferences(source: string, originalId: string, nextId: string) {
  return renameGanttTaskReferencesFromMap(source, new Map([[originalId, nextId]]));
}

function renameGanttTaskReferencesFromMap(source: string, renames: Map<string, string>) {
  return source.split(/\r?\n/).map((line) => {
    const withDependencies = line.replace(/\b(after|until)\s+([^,]+)/gi, (_statement, directive: string, ids: string) => {
      const renamedIds = ids.split(/(\s+)/).map((token) => renames.get(token) ?? token).join("");
      return `${directive} ${renamedIds}`;
    });
    return withDependencies.replace(/^(\s*click\s+)(\S+)/i, (_statement, prefix: string, id: string) => `${prefix}${renames.get(id) ?? id}`);
  }).join("\n");
}

function renameGanttSectionTaskIds(source: string, sectionLineIndex: number, sectionLabel: string) {
  const document = parseGanttSource(source);
  const sectionTasks = document.tasks.filter((task) => task.sectionLineIndex === sectionLineIndex);
  const eligibleTasks = sectionTasks.filter((task) => task.start);
  if (!eligibleTasks.length) return source;

  const prefix = ganttSectionIdPrefix(sectionLabel);
  const usedIds = new Set(document.tasks
    .filter((task) => task.sectionLineIndex !== sectionLineIndex)
    .map((task) => task.id)
    .filter(Boolean));
  let sequence = 1;
  for (const id of usedIds) {
    const match = id.match(new RegExp(`^${prefix}(\\d+)$`, "i"));
    if (match) sequence = Math.max(sequence, Number(match[1]) + 1);
  }

  const idCounts = new Map<string, number>();
  for (const task of document.tasks) {
    if (task.id) idCounts.set(task.id, (idCounts.get(task.id) ?? 0) + 1);
  }
  const renames = new Map<string, string>();
  const lines = source.split(/\r?\n/);
  for (const task of eligibleTasks) {
    let id = `${prefix}${sequence++}`;
    while (usedIds.has(id)) id = `${prefix}${sequence++}`;
    usedIds.add(id);
    lines[task.lineIndex] = serialiseGanttTask({ ...ganttDraftFromItem(task), id });
    if (task.id && idCounts.get(task.id) === 1) renames.set(task.id, id);
  }
  return renameGanttTaskReferencesFromMap(lines.join("\n"), renames);
}

export function ganttSectionIdPrefix(label: string) {
  const firstWord = label
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .match(/[a-z0-9]+/)?.[0] || "task";
  const prefix = firstWord.slice(0, 4);
  return /^[a-z]/.test(prefix) ? prefix : "task";
}

export function nextGanttTaskId(source: string, sectionLineIndex: number | null, excludeLineIndex = -1, reservedIds: string[] = []) {
  const document = parseGanttSource(source);
  const section = sectionLineIndex === null ? null : document.sections.find((candidate) => candidate.lineIndex === sectionLineIndex);
  const prefix = section ? ganttSectionIdPrefix(section.label) : "task";
  const usedIds = new Set([
    ...document.tasks.filter((task) => task.lineIndex !== excludeLineIndex).map((task) => task.id).filter(Boolean),
    ...reservedIds.map((id) => id.trim()).filter(Boolean),
  ]);
  let sequence = 1;
  for (const id of usedIds) {
    const match = id.match(new RegExp(`^${prefix}(\\d+)$`, "i"));
    if (match) sequence = Math.max(sequence, Number(match[1]) + 1);
  }
  let candidate = `${prefix}${sequence}`;
  while (usedIds.has(candidate)) candidate = `${prefix}${++sequence}`;
  return candidate;
}

/** Present dependency choices in their human task-ID sequence (`ship2` before `ship10`). */
export function ganttTasksByIdSequence(tasks: GanttTask[]) {
  return [...tasks].sort((left, right) => {
    if (!left.id && !right.id) return left.lineIndex - right.lineIndex;
    if (!left.id) return 1;
    if (!right.id) return -1;
    return left.id.localeCompare(right.id, undefined, { numeric: true, sensitivity: "base" });
  });
}

/**
 * Make every schedulable Gantt task identity follow its visual section/order.
 * Ambiguous imported dependencies are attached to the nearest matching task in
 * the direction implied by `after` or `until`.
 */
export function normaliseGanttTaskIds(source: string) {
  const document = parseGanttSource(source);
  const sectionByLine = new Map(document.sections.map((section) => [section.lineIndex, section]));
  const nextSequence = new Map<string, number>();
  const usedIds = new Set<string>();
  const assignments: Array<{ lineIndex: number; oldId: string; newId: string }> = [];

  for (const task of document.tasks) {
    if (!task.start) continue;
    const section = task.sectionLineIndex === null ? undefined : sectionByLine.get(task.sectionLineIndex);
    const prefix = section ? ganttSectionIdPrefix(section.label) : "task";
    let sequence = nextSequence.get(prefix) ?? 1;
    let newId = `${prefix}${sequence}`;
    while (usedIds.has(newId)) newId = `${prefix}${++sequence}`;
    nextSequence.set(prefix, sequence + 1);
    usedIds.add(newId);
    assignments.push({ lineIndex: task.lineIndex, oldId: task.id, newId });
  }

  if (!assignments.length) return { source, renamed: 0 };
  const assignmentsByOldId = new Map<string, typeof assignments>();
  for (const assignment of assignments) {
    if (!assignment.oldId) continue;
    assignmentsByOldId.set(assignment.oldId, [...(assignmentsByOldId.get(assignment.oldId) ?? []), assignment]);
  }

  const resolveReference = (oldId: string, lineIndex: number, direction: "after" | "until") => {
    const candidates = assignmentsByOldId.get(oldId);
    if (!candidates?.length) return oldId;
    if (direction === "after") {
      return candidates.filter((candidate) => candidate.lineIndex < lineIndex).at(-1)?.newId ?? candidates[0].newId;
    }
    return candidates.find((candidate) => candidate.lineIndex > lineIndex)?.newId ?? candidates.at(-1)!.newId;
  };

  const lines = source.split(/\r?\n/);
  for (const assignment of assignments) {
    const task = document.tasks.find((candidate) => candidate.lineIndex === assignment.lineIndex)!;
    lines[assignment.lineIndex] = serialiseGanttTask({ ...ganttDraftFromItem(task), id: assignment.newId });
  }
  const clickOccurrences = new Map<string, number>();
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    lines[lineIndex] = lines[lineIndex].replace(/\b(after|until)\s+([^,]+)/gi, (_statement, directive: "after" | "until", ids: string) => {
      const normalisedIds = ids.split(/(\s+)/).map((token) => /^\s+$/.test(token) ? token : resolveReference(token, lineIndex, directive.toLocaleLowerCase() as "after" | "until")).join("");
      return `${directive} ${normalisedIds}`;
    });
    lines[lineIndex] = lines[lineIndex].replace(/^(\s*click\s+)(\S+)/i, (_statement, prefix: string, oldId: string) => {
      const candidates = assignmentsByOldId.get(oldId);
      if (!candidates?.length) return `${prefix}${oldId}`;
      const occurrence = clickOccurrences.get(oldId) ?? 0;
      clickOccurrences.set(oldId, occurrence + 1);
      return `${prefix}${candidates[Math.min(occurrence, candidates.length - 1)].newId}`;
    });
  }
  return {
    source: lines.join("\n"),
    renamed: assignments.filter((assignment) => assignment.oldId !== assignment.newId).length,
  };
}

/** Give a visually selected predecessor a valid unique Mermaid task id. */
export function ensureGanttTaskId(source: string, lineIndex: number, reservedIds: string[] = []) {
  const task = ganttItemAtLine(source, lineIndex);
  if (!task || task.kind !== "task") throw new Error("The selected predecessor is no longer present");
  const document = parseGanttSource(source);
  const reserved = new Set(reservedIds.map((id) => id.trim()).filter(Boolean));
  const idIsUnique = task.id
    && !reserved.has(task.id)
    && !document.tasks.some((candidate) => candidate.lineIndex !== lineIndex && candidate.id === task.id);
  if (idIsUnique) return { source, lineIndex, id: task.id };
  const usedIds = new Set([
    ...document.tasks.filter((candidate) => candidate.lineIndex !== lineIndex).map((candidate) => candidate.id).filter(Boolean),
    ...reserved,
  ]);
  const id = nextGanttTaskId(source, task.sectionLineIndex, lineIndex, [...usedIds]);

  const schedule = ganttTaskSchedule(source, lineIndex);
  const start = task.start || schedule?.start.toISOString().slice(0, 10) || "";
  if (!start) throw new Error(`Add a start date to ${task.label} before using it as a dependency`);
  const updated = updateGanttItem(source, lineIndex, {
    ...ganttDraftFromItem(task),
    id,
    start,
  });
  return { ...updated, id };
}

/** Convert a duration-backed milestone to the single date Mermaid actually draws. */
export function canonicaliseGanttMilestone(source: string, lineIndex: number) {
  const task = ganttItemAtLine(source, lineIndex);
  if (!task || task.kind !== "task" || !task.milestone) return { source, lineIndex };
  const milestoneDate = ganttTaskSchedule(source, lineIndex)?.milestoneDate;
  if (!milestoneDate) return { source, lineIndex };
  const date = formatIsoDate(milestoneDate);
  if (task.start === date && task.finish.trim() === "0d") return { source, lineIndex };
  return updateGanttItem(source, lineIndex, { ...ganttDraftFromItem(task), start: date, finish: "0d" });
}

export function appendGanttSection(source: string, label = "New section") {
  const suffix = source.endsWith("\n") ? "" : "\n";
  return `${source}${suffix}    section ${label}`;
}

export function appendGanttTask(source: string, sectionLineIndex: number | null = null, label = "New task") {
  const lines = source.split(/\r?\n/);
  const lineIndex = insertTask(lines, {
    kind: "task",
    label,
    sectionLineIndex,
    order: Number.MAX_SAFE_INTEGER,
    status: "planned",
    critical: false,
    milestone: false,
    id: "",
    start: "",
    finish: "1d",
  });
  return { source: lines.join("\n"), lineIndex };
}

export function createGanttTask(source: string, draft: GanttItemDraft) {
  const lines = source.split(/\r?\n/);
  const lineIndex = insertTask(lines, { ...draft, kind: "task" });
  return { source: lines.join("\n"), lineIndex };
}

export function ganttTaskSchedule(source: string, lineIndex: number): GanttTaskSchedule | null {
  const dateFormat = source.match(/^\s*dateFormat\s+(.+?)\s*$/im)?.[1]?.trim();
  if (dateFormat && dateFormat !== "YYYY-MM-DD") return null;
  const document = parseGanttSource(source);
  const schedules = new Map<number, GanttTaskSchedule>();
  const schedulesById = new Map<string, GanttTaskSchedule>();
  const inclusiveEndDates = ganttInclusiveEndDatesFromSource(source);

  // Mermaid resolves forward `until task-id` references iteratively. Mirror
  // that behaviour so visual properties and drag geometry use the same dates.
  for (let pass = 0; pass <= document.tasks.length; pass += 1) {
    let changed = false;
    for (let taskIndex = 0; taskIndex < document.tasks.length; taskIndex += 1) {
      const task = document.tasks[taskIndex];
      if (schedules.has(task.lineIndex)) continue;
      let start = parseIsoDate(task.start);
      if (!start && /^after\s+/i.test(task.start)) {
        const dependencies = task.start.replace(/^after\s+/i, "").trim().split(/\s+/);
        const ends = dependencies.map((id) => schedulesById.get(id)?.end).filter((date): date is Date => Boolean(date));
        if (ends.length) start = new Date(Math.max(...ends.map((date) => date.valueOf())));
      } else if (!start && taskIndex > 0) {
        const previous = schedules.get(document.tasks[taskIndex - 1].lineIndex);
        start = previous?.end ? new Date(previous.end) : null;
      }
      if (!start) continue;

      let end = parseIsoDate(task.finish);
      if (end && inclusiveEndDates) end = addDays(end, 1);
      const duration = durationInDays(task.finish);
      if (!end && duration !== null) end = adjustGanttDurationEnd(source, start, addDays(start, duration));
      if (!end && /^until\s+/i.test(task.finish)) {
        const target = schedulesById.get(task.finish.replace(/^until\s+/i, "").trim());
        end = target?.start ? new Date(target.start) : null;
      }
      if (!end || end < start || (!task.milestone && end <= start)) continue;
      const schedule: GanttTaskSchedule = {
        start,
        end,
        durationDays: differenceDays(start, end),
        ...(task.milestone ? { milestoneDate: new Date((start.valueOf() + end.valueOf()) / 2) } : {}),
      };
      schedules.set(task.lineIndex, schedule);
      if (task.id) schedulesById.set(task.id, schedule);
      changed = true;
    }
    if (!changed) break;
  }
  return schedules.get(lineIndex) ?? null;
}

export function moveGanttTaskInTime(source: string, lineIndex: number, deltaDays: number) {
  const task = ganttItemAtLine(source, lineIndex);
  const schedule = ganttTaskSchedule(source, lineIndex);
  if (!task || task.kind !== "task" || !schedule) throw new Error("This task needs a YYYY-MM-DD schedule before it can be dragged");
  const nextStart = snapGanttDate(addDays(schedule.start, deltaDays));
  const shift = differenceDays(schedule.start, nextStart);
  const explicitEnd = parseIsoDate(task.finish);
  return updateGanttItem(source, lineIndex, {
    ...ganttDraftFromItem(task),
    start: formatIsoDate(nextStart),
    finish: explicitEnd ? formatIsoDate(addDays(explicitEnd, shift)) : task.finish,
  });
}

/** Return the exact snapped delta used by both the drag preview and commit. */
export function snappedGanttDragDelta(source: string, lineIndex: number, mode: "move" | "start" | "end", deltaDays: number) {
  const schedule = ganttTaskSchedule(source, lineIndex);
  if (!schedule) return 0;
  const anchor = mode === "end" ? schedule.end : schedule.start;
  const requested = snapGanttDate(addDays(anchor, deltaDays));
  if (mode === "start" && requested >= schedule.end) return 0;
  if (mode === "end" && requested <= schedule.start) return 0;
  return differenceDays(anchor, requested);
}

export function resizeGanttTask(source: string, lineIndex: number, edge: "start" | "end", deltaDays: number) {
  const task = ganttItemAtLine(source, lineIndex);
  const schedule = ganttTaskSchedule(source, lineIndex);
  if (!task || task.kind !== "task" || !schedule) throw new Error("This task needs a YYYY-MM-DD schedule before its duration can be dragged");
  const snappedDelta = snappedGanttDragDelta(source, lineIndex, edge, deltaDays);
  const requested = addDays(edge === "start" ? schedule.start : schedule.end, snappedDelta);
  const start = edge === "start" && requested < schedule.end ? requested : schedule.start;
  const end = edge === "end" && requested > schedule.start ? requested : schedule.end;
  const durationDays = ganttDurationDaysBetween(source, start, end);
  return updateGanttItem(source, lineIndex, {
    ...ganttDraftFromItem(task),
    start: edge === "start" ? formatIsoDate(start) : task.start,
    finish: `${durationDays}d`,
  });
}

export function moveGanttTaskInOrder(source: string, lineIndex: number, direction: -1 | 1) {
  const task = ganttItemAtLine(source, lineIndex);
  if (!task || task.kind !== "task") throw new Error("Select a Gantt task bar to change its order");
  const siblings = parseGanttSource(source).tasks.filter((candidate) => candidate.sectionLineIndex === task.sectionLineIndex);
  const nextOrder = Math.max(1, Math.min(siblings.length, task.order + direction));
  if (nextOrder === task.order) return { source, lineIndex };
  return updateGanttItem(source, lineIndex, { ...ganttDraftFromItem(task), order: nextOrder });
}
