import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadGanttSource() {
  const source = await readFile(new URL("../app/gantt-source.ts", import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
}

const SOURCE = `gantt
  title Product launch
  dateFormat YYYY-MM-DD
  section Discovery
  Research :done, research, 2026-08-01, 5d
  Define scope :active, scope, after research, 3d
  section Delivery
  Build release :crit, build, after scope, 8d`;

test("parses standard Mermaid Gantt sections and task metadata", async () => {
  const { parseGanttSource } = await loadGanttSource();
  const parsed = parseGanttSource(SOURCE);

  assert.deepEqual(parsed.sections.map(({ label, order }) => [label, order]), [["Discovery", 1], ["Delivery", 2]]);
  assert.equal(parsed.tasks[0].sectionLabel, "Discovery");
  assert.equal(parsed.tasks[0].status, "done");
  assert.equal(parsed.tasks[0].id, "research");
  assert.equal(parsed.tasks[0].start, "2026-08-01");
  assert.equal(parsed.tasks[0].finish, "5d");
  assert.equal(parsed.tasks[2].critical, true);
});

test("serialises task properties using Mermaid's documented metadata order", async () => {
  const { serialiseGanttTask } = await loadGanttSource();
  assert.equal(serialiseGanttTask({
    kind: "task",
    label: "Ship",
    sectionLineIndex: 6,
    order: 2,
    status: "active",
    critical: true,
    milestone: false,
    id: "ship",
    start: "after build",
    finish: "2d",
  }), "        Ship :crit, active, ship, after build, 2d");
});

test("formats Gantt source with readable hierarchical indentation, directive order and metadata spacing", async () => {
  const { formatGanttSource } = await loadGanttSource();
  const source = [
    "gantt",
    " weekday monday",
    " title   Deployment plan",
    " excludes weekends",
    "\tdateFormat YYYY-MM-DD",
    " tickInterval   1week",
    " section   Billing",
    "Training:active,bill1,2026-09-07,5d",
    "",
    "   %% Keep this note",
  ].join("\n");

  assert.equal(formatGanttSource(source), [
    "gantt",
    "    title Deployment plan",
    "    dateFormat YYYY-MM-DD",
    "    tickInterval 1week",
    "    weekday monday",
    "    excludes weekends",
    "    section Billing",
    "        Training :active, bill1, 2026-09-07, 5d",
    "",
    "        %% Keep this note",
  ].join("\n"));
});

test("moves a task into a selected section and order without rewriting chart settings", async () => {
  const { ganttDraftFromItem, parseGanttSource, updateGanttItem } = await loadGanttSource();
  const parsed = parseGanttSource(SOURCE);
  const research = parsed.tasks[0];
  const delivery = parsed.sections[1];
  const updated = updateGanttItem(SOURCE, research.lineIndex, {
    ...ganttDraftFromItem(research),
    sectionLineIndex: delivery.lineIndex,
    order: 2,
  });
  const result = parseGanttSource(updated.source);

  assert.match(updated.source, /title Product launch/);
  assert.match(updated.source, /dateFormat YYYY-MM-DD/);
  assert.deepEqual(result.tasks.filter((task) => task.sectionLabel === "Delivery").map((task) => task.label), ["Build release", "Research"]);
});

test("creates valid Mermaid-shaped statements instead of placeholder comments", async () => {
  const { appendGanttSection, appendGanttTask, parseGanttSource } = await loadGanttSource();
  const withSection = appendGanttSection("gantt\n  dateFormat YYYY-MM-DD", "Planning");
  const section = parseGanttSource(withSection).sections[0];
  const updated = appendGanttTask(withSection, section.lineIndex, "Outline");

  assert.match(updated.source, /section Planning/);
  assert.match(updated.source, /Outline :1d/);
  assert.doesNotMatch(updated.source, /Replace this comment/);
});

test("derives naturally incrementing task IDs from their section", async () => {
  const { appendGanttSection, ganttSectionIdPrefix, ganttTasksByIdSequence, nextGanttTaskId, parseGanttSource } = await loadGanttSource();
  const source = [
    "gantt",
    "  dateFormat YYYY-MM-DD",
    "  section Shipping",
    "  Pack :ship1, 2026-08-03, 2d",
    "  Dispatch :ship3, 2026-08-05, 2d",
    "  section Billing",
    "  Invoice :bill1, 2026-08-07, 2d",
  ].join("\n");
  const document = parseGanttSource(source);

  assert.equal(ganttSectionIdPrefix("Shipping Operations"), "ship");
  assert.equal(nextGanttTaskId(source, document.sections[0].lineIndex), "ship4");
  assert.equal(nextGanttTaskId(source, document.sections[1].lineIndex), "bill2");

  const withSection = appendGanttSection(source, "Training");
  const training = parseGanttSource(withSection).sections.at(-1);
  assert.equal(nextGanttTaskId(withSection, training.lineIndex), "trai1");

  const sequenceSource = `${source}\n  section Dispatch\n  Later :ship10, 2026-08-10, 1d\n  Earlier :ship2, 2026-08-09, 1d\n  Unidentified :2026-08-11, 1d`;
  const dispatchTasks = parseGanttSource(sequenceSource).tasks.filter((task) => task.sectionLabel === "Dispatch");
  assert.deepEqual(ganttTasksByIdSequence(dispatchTasks).map((task) => task.id), ["ship2", "ship10", ""]);
});

test("converts a selected section into a standard task bar", async () => {
  const { ganttDraftFromItem, parseGanttSource, updateGanttItem } = await loadGanttSource();
  const parsed = parseGanttSource(SOURCE);
  const delivery = parsed.sections[1];
  const discovery = parsed.sections[0];
  const updated = updateGanttItem(SOURCE, delivery.lineIndex, {
    ...ganttDraftFromItem(delivery),
    kind: "task",
    sectionLineIndex: discovery.lineIndex,
    order: 3,
    finish: "1d",
  });
  const result = parseGanttSource(updated.source);

  assert.equal(result.sections.length, 1);
  assert.equal(result.tasks.find((task) => task.label === "Delivery")?.sectionLabel, "Discovery");
  assert.match(updated.source, /Delivery :1d/);
});

test("creates a configured task bar in the requested section and order", async () => {
  const { createGanttTask, parseGanttSource } = await loadGanttSource();
  const document = parseGanttSource(SOURCE);
  const delivery = document.sections[1];
  const created = createGanttTask(SOURCE, {
    kind: "task",
    label: "Release notes",
    sectionLineIndex: delivery.lineIndex,
    order: 1,
    status: "active",
    critical: false,
    milestone: false,
    id: "notes",
    start: "after scope",
    finish: "2d",
  });
  const result = parseGanttSource(created.source);

  assert.deepEqual(result.tasks.filter((task) => task.sectionLabel === "Delivery").map((task) => task.label), ["Release notes", "Build release"]);
  assert.match(created.source, /Release notes :active, notes, after scope, 2d/);
});

test("snaps dragged tasks to Monday and Wednesday week boundaries", async () => {
  const { moveGanttTaskInTime, parseGanttSource, resizeGanttTask, snappedGanttDragDelta } = await loadGanttSource();
  const source = "gantt\n  dateFormat YYYY-MM-DD\n  section Plan\n  Build :build, 2026-08-10, 7d";
  const task = parseGanttSource(source).tasks[0];
  const moved = moveGanttTaskInTime(source, task.lineIndex, 2.2);
  assert.match(moved.source, /Build :build, 2026-08-12, 7d/);

  const resized = resizeGanttTask(moved.source, moved.lineIndex, "end", 4.8);
  assert.match(resized.source, /Build :build, 2026-08-12, 12d/);
  assert.equal(snappedGanttDragDelta(moved.source, moved.lineIndex, "end", 4.8), 5);

  const dependentSource = [
    "gantt",
    "  dateFormat YYYY-MM-DD",
    "  section Plan",
    "  Design :plan1, 2026-08-03, 5d",
    "  Build :plan2, after plan1, 5d",
  ].join("\n");
  const dependent = parseGanttSource(dependentSource).tasks[1];
  const resizedDependent = resizeGanttTask(dependentSource, dependent.lineIndex, "end", 4.8);
  const resizedTask = parseGanttSource(resizedDependent.source).tasks[1];
  assert.equal(resizedTask.start, "after plan1", "resizing the end must preserve a dependency-based start");
  assert.match(resizedDependent.source, /Build :plan2, after plan1, \d+d/);
});

test("moves task bars above and below their siblings", async () => {
  const { moveGanttTaskInOrder, parseGanttSource } = await loadGanttSource();
  const parsed = parseGanttSource(SOURCE);
  const scope = parsed.tasks.find((task) => task.label === "Define scope");
  const moved = moveGanttTaskInOrder(SOURCE, scope.lineIndex, -1);
  assert.deepEqual(parseGanttSource(moved.source).tasks.filter((task) => task.sectionLabel === "Discovery").map((task) => task.label), ["Define scope", "Research"]);
});

test("writes and updates standard Mermaid weekly grid directives", async () => {
  const { ganttWeekdayFromSource, setGanttWeekStart } = await loadGanttSource();
  assert.equal(ganttWeekdayFromSource(SOURCE), "sunday", "Mermaid defaults week intervals to Sunday");

  const monday = setGanttWeekStart(SOURCE, "monday");
  assert.match(monday, /^\s*tickInterval 1week$/m);
  assert.match(monday, /^\s*weekday monday$/m);
  assert.equal(ganttWeekdayFromSource(monday), "monday");

  const thursday = setGanttWeekStart(monday, "thursday");
  assert.equal((thursday.match(/^\s*weekday\b/gm) || []).length, 1);
  assert.match(thursday, /^\s*weekday thursday$/m);
});

test("adds and removes Mermaid weekend exclusions without losing excluded dates", async () => {
  const { ganttExcludesWeekendsFromSource, ganttTaskSchedule, parseGanttSource, resizeGanttTask, setGanttExcludeWeekends } = await loadGanttSource();
  const source = [
    "gantt",
    "  dateFormat YYYY-MM-DD",
    "  excludes 2026-08-14",
    "  section Plan",
    "  Build :plan1, 2026-08-03, 5d",
  ].join("\n");

  const excluded = setGanttExcludeWeekends(source, true);
  assert.equal(ganttExcludesWeekendsFromSource(excluded), true);
  assert.match(excluded, /^\s*excludes weekends, 2026-08-14$/m);

  const task = parseGanttSource(excluded).tasks[0];
  const schedule = ganttTaskSchedule(excluded, task.lineIndex);
  assert.equal(schedule?.end.toISOString().slice(0, 10), "2026-08-10", "a five-day task must skip Saturday and Sunday");
  assert.equal(schedule?.durationDays, 7, "the visual schedule must span the same calendar width Mermaid renders");
  const resized = resizeGanttTask(excluded, task.lineIndex, "end", 2);
  assert.match(resized.source, /Build :plan1, 2026-08-03, 7d/, "resizing must store working days rather than the calendar span");

  const included = setGanttExcludeWeekends(excluded, false);
  assert.equal(ganttExcludesWeekendsFromSource(included), false);
  assert.match(included, /^\s*excludes 2026-08-14$/m);
  assert.doesNotMatch(setGanttExcludeWeekends("gantt\n  excludes weekends\n  section Plan", false), /^\s*excludes\b/m);
});

test("uses Mermaid inclusive end dates and mirrors their rendered boundary", async () => {
  const { ganttInclusiveEndDatesFromSource, ganttTaskSchedule, parseGanttSource, setGanttInclusiveEndDates } = await loadGanttSource();
  const source = [
    "gantt",
    "  dateFormat YYYY-MM-DD",
    "  section Plan",
    "  Working week :plan1, 2026-08-03, 2026-08-07",
  ].join("\n");

  const inclusive = setGanttInclusiveEndDates(source, true);
  assert.equal(ganttInclusiveEndDatesFromSource(inclusive), true);
  assert.match(inclusive, /^\s*inclusiveEndDates$/m);
  const task = parseGanttSource(inclusive).tasks[0];
  assert.equal(ganttTaskSchedule(inclusive, task.lineIndex)?.end.toISOString().slice(0, 10), "2026-08-08");

  const exclusive = setGanttInclusiveEndDates(inclusive, false);
  assert.equal(ganttInclusiveEndDatesFromSource(exclusive), false);
  assert.doesNotMatch(exclusive, /^\s*inclusiveEndDates$/m);
  const exclusiveTask = parseGanttSource(exclusive).tasks[0];
  assert.equal(ganttTaskSchedule(exclusive, exclusiveTask.lineIndex)?.end.toISOString().slice(0, 10), "2026-08-07");
});

test("keeps an explicit dependent end date fixed when weekends are excluded", async () => {
  const { ganttTaskSchedule, parseGanttSource } = await loadGanttSource();
  const source = [
    "gantt",
    "  dateFormat YYYY-MM-DD",
    "  inclusiveEndDates",
    "  excludes weekends",
    "  section Billing",
    "  Review :bill1, 2026-09-07, 2026-09-11",
    "  Training :bill2, after bill1, 2026-09-22",
  ].join("\n");
  const training = parseGanttSource(source).tasks[1];
  const schedule = ganttTaskSchedule(source, training.lineIndex);

  assert.equal(schedule?.start.toISOString().slice(0, 10), "2026-09-12");
  assert.equal(schedule?.end.toISOString().slice(0, 10), "2026-09-23", "weekend exclusions must not extend an explicit end date into October");
});

test("resolves Mermaid until references to the target task's start date", async () => {
  const { ganttTaskSchedule, parseGanttSource } = await loadGanttSource();
  const source = [
    "gantt",
    "  dateFormat YYYY-MM-DD",
    "  section Billing",
    "  Training :bill1, 2026-09-01, until bill2",
    "  Changeover :bill2, 2026-09-22, 1d",
  ].join("\n");
  const training = parseGanttSource(source).tasks[0];
  const schedule = ganttTaskSchedule(source, training.lineIndex);

  assert.equal(schedule?.start.toISOString().slice(0, 10), "2026-09-01");
  assert.equal(schedule?.end.toISOString().slice(0, 10), "2026-09-22", "a forward until reference must end where its target starts");
});

test("reports a milestone's discrete date at Mermaid's rendered midpoint", async () => {
  const { ganttTaskSchedule, parseGanttSource } = await loadGanttSource();
  const source = [
    "gantt",
    "  dateFormat YYYY-MM-DD",
    "  section Billing",
    "  Changeover :milestone, bill1, 2026-09-01, 30d",
    "  Release :milestone, bill2, 2026-10-05, 0d",
  ].join("\n");
  const [changeover, release] = parseGanttSource(source).tasks;

  assert.equal(ganttTaskSchedule(source, changeover.lineIndex)?.milestoneDate?.toISOString().slice(0, 10), "2026-09-16");
  assert.equal(ganttTaskSchedule(source, release.lineIndex)?.milestoneDate?.toISOString().slice(0, 10), "2026-10-05");
  assert.equal(ganttTaskSchedule(source, release.lineIndex)?.durationDays, 0, "zero-duration milestones must remain schedulable");
});

test("canonicalises an until target milestone to its visible Mermaid date", async () => {
  const { canonicaliseGanttMilestone, ganttTaskSchedule, parseGanttSource } = await loadGanttSource();
  const source = [
    "gantt",
    "  dateFormat YYYY-MM-DD",
    "  excludes weekends",
    "  section Billing",
    "  Training :bill1, 2026-08-15, until bill2",
    "  Billing Changeover :milestone, bill2, 2026-09-01, 30d",
  ].join("\n");
  const changeover = parseGanttSource(source).tasks[1];
  const canonical = canonicaliseGanttMilestone(source, changeover.lineIndex);
  const tasks = parseGanttSource(canonical.source).tasks;

  assert.match(canonical.source, /^\s*Billing Changeover :milestone, bill2, 2026-09-22, 0d$/m);
  assert.equal(ganttTaskSchedule(canonical.source, tasks[0].lineIndex)?.end.toISOString().slice(0, 10), "2026-09-22");
});

test("adds a unique task id when a labelled predecessor does not already have one", async () => {
  const { ensureGanttTaskId, parseGanttSource } = await loadGanttSource();
  const source = "gantt\n  dateFormat YYYY-MM-DD\n  section Billing\n  Review :2026-08-10, 5d\n  Conclusion :milestone, 2026-08-17, 0d";
  const review = parseGanttSource(source).tasks[0];
  const identified = ensureGanttTaskId(source, review.lineIndex, ["conclusion"]);

  assert.equal(identified.id, "bill1");
  assert.match(identified.source, /^\s*Review :bill1, 2026-08-10, 5d$/m);
  assert.equal(parseGanttSource(identified.source).tasks[0].id, "bill1");

  const duplicated = "gantt\n  dateFormat YYYY-MM-DD\n  section Shipping\n  Floor matrix :ship4, 2026-08-10, 5d\n  Training :ship4, 2026-08-17, 5d";
  const training = parseGanttSource(duplicated).tasks[1];
  const repaired = ensureGanttTaskId(duplicated, training.lineIndex);
  assert.equal(repaired.id, "ship5");
  assert.match(repaired.source, /^\s*Floor matrix :ship4, 2026-08-10, 5d$/m);
  assert.match(repaired.source, /^\s*Training :ship5, 2026-08-17, 5d$/m);
});

test("renames dependency references when a unique task ID changes", async () => {
  const { ganttDraftFromItem, parseGanttSource, updateGanttItem } = await loadGanttSource();
  const source = [
    "gantt",
    "  dateFormat YYYY-MM-DD",
    "  section Shipping",
    "  Review :ship1, 2026-08-10, 5d",
    "  Approve :ship2, after ship1, 2d",
    "  Publish :ship3, after ship1 ship2, 1d",
    "  click ship1 href \"https://example.com\"",
  ].join("\n");
  const review = parseGanttSource(source).tasks[0];
  const updated = updateGanttItem(source, review.lineIndex, { ...ganttDraftFromItem(review), id: "bill1" });

  assert.match(updated.source, /Approve :ship2, after bill1, 2d/);
  assert.match(updated.source, /Publish :ship3, after bill1 ship2, 1d/);
  assert.match(updated.source, /click bill1 href/);
});

test("renaming a section renumbers its task IDs and preserves dependencies", async () => {
  const { ganttDraftFromItem, parseGanttSource, updateGanttItem } = await loadGanttSource();
  const source = [
    "gantt",
    "  dateFormat YYYY-MM-DD",
    "  section Shipping",
    "  Pack :legacy-pack, 2026-08-10, 2d",
    "  Dispatch :legacy-dispatch, after legacy-pack, 1d",
  ].join("\n");
  const section = parseGanttSource(source).sections[0];
  const updated = updateGanttItem(source, section.lineIndex, {
    ...ganttDraftFromItem(section),
    label: "Billing",
  });

  assert.match(updated.source, /^\s*section Billing$/m);
  assert.match(updated.source, /^\s*Pack :bill1, 2026-08-10, 2d$/m);
  assert.match(updated.source, /^\s*Dispatch :bill2, after bill1, 1d$/m);
});

test("normalises imported IDs by visual section order and repairs ambiguous dependencies", async () => {
  const { normaliseGanttTaskIds, parseGanttSource } = await loadGanttSource();
  const source = [
    "gantt",
    "  dateFormat YYYY-MM-DD",
    "  section Shipping",
    "  Floor matrix :ship4, 2026-08-10, 5d",
    "  Training :ship4, 2026-08-17, 5d",
    "  section Billing",
    "  Review :legacy-review, 2026-08-24, 2d",
    "  Training :ship4, 2026-08-26, 3d",
    "  Conclusion :milestone, conclusion, after ship4, 0d",
  ].join("\n");
  const normalised = normaliseGanttTaskIds(source);
  const tasks = parseGanttSource(normalised.source).tasks;

  assert.deepEqual(tasks.map((task) => task.id), ["ship1", "ship2", "bill1", "bill2", "bill3"]);
  assert.equal(tasks.at(-1).start, "after bill2", "an ambiguous dependency should follow the nearest preceding matching task");
  assert.equal(new Set(tasks.map((task) => task.id)).size, tasks.length);
  assert.equal(normalised.renamed, 5);
});
