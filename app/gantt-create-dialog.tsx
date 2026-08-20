"use client";

import { CalendarRange, Check, Layers3, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import {
  appendGanttSection,
  canonicaliseGanttMilestone,
  createGanttTask,
  ensureGanttTaskId,
  GanttItemDraft,
  ganttInclusiveEndDatesFromSource,
  ganttTaskSchedule,
  ganttTasksByIdSequence,
  nextGanttTaskId,
  parseGanttSource,
} from "./gantt-source";

type Props = {
  source: string;
  initialSectionLineIndex: number | null;
  initialOrder: number;
  onClose: () => void;
  onCreate: (candidate: string, selectedLine: number) => Promise<{ ok: boolean; error?: string }>;
};

export function GanttCreateDialog({ source, initialSectionLineIndex, initialOrder, onClose, onCreate }: Props) {
  const document = useMemo(() => parseGanttSource(source), [source]);
  const [draft, setDraft] = useState<GanttItemDraft>({
    kind: "task",
    label: "New task",
    sectionLineIndex: initialSectionLineIndex,
    order: initialOrder,
    status: "planned",
    critical: false,
    milestone: false,
    id: nextGanttTaskId(source, initialSectionLineIndex),
    start: "",
    finish: "1d",
  });
  const dependencyTasks = useMemo(
    () => ganttTasksByIdSequence(document.tasks.filter((task) => task.sectionLineIndex === draft.sectionLineIndex)),
    [document.tasks, draft.sectionLineIndex],
  );
  const [scheduleMode, setScheduleMode] = useState<"dates" | "after" | "until">("dates");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [predecessorLineIndex, setPredecessorLineIndex] = useState<number | null>(dependencyTasks.at(-1)?.lineIndex ?? null);
  const [untilTargetLineIndex, setUntilTargetLineIndex] = useState<number | null>(
    document.tasks.find((task) => task.sectionLineIndex === initialSectionLineIndex && task.order >= initialOrder)?.lineIndex
      ?? dependencyTasks[0]?.lineIndex
      ?? null,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sectionTasks = document.tasks.filter((task) => task.sectionLineIndex === draft.sectionLineIndex);
  const maximumOrder = Math.max(1, sectionTasks.length + 1);
  const predecessorSchedule = predecessorLineIndex === null ? null : ganttTaskSchedule(source, predecessorLineIndex);
  const minimumDependencyEnd = predecessorSchedule
    ? new Date(predecessorSchedule.end.valueOf() + (ganttInclusiveEndDatesFromSource(source) ? 0 : 86_400_000)).toISOString().slice(0, 10)
    : undefined;

  const patch = <Key extends keyof GanttItemDraft>(key: Key, value: GanttItemDraft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setError("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      let candidate: string;
      let lineIndex: number;
      if (draft.kind === "section") {
        if (!draft.label.trim()) throw new Error("A section needs a name");
        candidate = appendGanttSection(source, draft.label.trim());
        lineIndex = candidate.split(/\r?\n/).length - 1;
      } else {
        const taskId = draft.id.trim();
        const duplicateTask = taskId ? document.tasks.find((task) => task.id === taskId) : undefined;
        if (duplicateTask) throw new Error(`Task ID “${taskId}” is already used by ${duplicateTask.label}`);
        let candidateSource = source;
        let scheduledDraft = scheduleMode === "dates"
          ? { ...draft, start: startDate, finish: draft.milestone ? "0d" : endDate }
          : { ...draft, start: "", finish: draft.milestone ? "0d" : endDate };
        if (scheduleMode === "dates") {
          if (!startDate) throw new Error(draft.milestone ? "Choose the milestone date" : "Choose a start date");
          if (!draft.milestone && !endDate) throw new Error("Choose an end date");
          if (!draft.milestone && endDate <= startDate) throw new Error("The end date must be after the start date");
        } else if (scheduleMode === "after") {
          if (predecessorLineIndex === null) throw new Error("Choose the task this bar should follow");
          if (!draft.milestone && !endDate) throw new Error("Choose when the new task ends");
          if (!draft.milestone && !predecessorSchedule) throw new Error("The preceding task needs a resolvable date before an end date can be set");
          if (!draft.milestone && minimumDependencyEnd && endDate < minimumDependencyEnd) throw new Error("The end date must be after the preceding task finishes");
          const predecessor = ensureGanttTaskId(source, predecessorLineIndex, taskId ? [taskId] : []);
          candidateSource = predecessor.source;
          scheduledDraft = {
            ...scheduledDraft,
            start: `after ${predecessor.id}`,
            finish: draft.milestone ? "0d" : endDate,
          };
        } else {
          if (!startDate) throw new Error("Choose when the new task starts");
          if (untilTargetLineIndex === null) throw new Error("Choose the task this bar should run until");
          const targetSchedule = ganttTaskSchedule(source, untilTargetLineIndex);
          const targetDate = targetSchedule?.milestoneDate ?? targetSchedule?.start;
          if (targetDate && Date.parse(`${startDate}T00:00:00Z`) >= targetDate.valueOf()) throw new Error("The start date must be before the target task starts");
          const canonicalTarget = canonicaliseGanttMilestone(source, untilTargetLineIndex);
          const target = ensureGanttTaskId(canonicalTarget.source, canonicalTarget.lineIndex, taskId ? [taskId] : []);
          candidateSource = target.source;
          scheduledDraft = { ...scheduledDraft, start: startDate, finish: `until ${target.id}` };
        }
        const created = createGanttTask(candidateSource, scheduledDraft);
        candidate = created.source;
        lineIndex = created.lineIndex;
      }
      const result = await onCreate(candidate, lineIndex);
      if (!result.ok) setError(result.error || "Mermaid rejected this Gantt item");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create this Gantt item");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-backdrop gantt-create-backdrop" onPointerDown={onClose}>
      <form className="gantt-create-dialog" role="dialog" aria-modal="true" aria-labelledby="gantt-create-title" onSubmit={(event) => void submit(event)} onPointerDown={(event) => event.stopPropagation()}>
        <header>
          <div><span className="gantt-create-icon">{draft.kind === "section" ? <Layers3 size={18} /> : <CalendarRange size={18} />}</span><span><b id="gantt-create-title">Add Gantt item</b><small>Create valid Mermaid schedule syntax</small></span></div>
          <button type="button" aria-label="Close Gantt item dialog" onClick={onClose}><X size={16} /></button>
        </header>
        <div className="gantt-create-content field-stack">
          <div className="gantt-kind-switch" aria-label="Gantt item type">
            <button type="button" className={draft.kind === "task" ? "active" : ""} onClick={() => {
              setDraft((current) => ({
                ...current,
                kind: "task",
                id: current.id || nextGanttTaskId(source, current.sectionLineIndex),
              }));
              setError("");
            }}><CalendarRange size={14} /> Task bar</button>
            <button type="button" className={draft.kind === "section" ? "active" : ""} onClick={() => patch("kind", "section")}><Layers3 size={14} /> Section</button>
          </div>
          <label><span>{draft.kind === "section" ? "Section name" : "Task label"}</span><input autoFocus value={draft.label} onChange={(event) => patch("label", event.target.value)} /></label>
          {draft.kind === "task" && <>
            <div className="gantt-create-grid">
              <label><span>Section</span><select value={draft.sectionLineIndex ?? ""} onChange={(event) => {
                const sectionLineIndex = event.target.value === "" ? null : Number(event.target.value);
                const choices = ganttTasksByIdSequence(document.tasks.filter((task) => task.sectionLineIndex === sectionLineIndex));
                setDraft((current) => ({ ...current, sectionLineIndex, order: 1, id: nextGanttTaskId(source, sectionLineIndex) }));
                setPredecessorLineIndex(choices.at(-1)?.lineIndex ?? null);
                setUntilTargetLineIndex(choices[0]?.lineIndex ?? null);
                setError("");
              }}><option value="">No section</option>{document.sections.map((section) => <option key={section.lineIndex} value={section.lineIndex}>{section.label}</option>)}</select></label>
              <label><span>Order</span><select value={Math.min(draft.order, maximumOrder)} onChange={(event) => patch("order", Number(event.target.value))}>{Array.from({ length: maximumOrder }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label>
              <label><span>Status</span><select value={draft.status} onChange={(event) => patch("status", event.target.value as GanttItemDraft["status"])}><option value="planned">Planned</option><option value="active">Active</option><option value="done">Done</option></select></label>
              <label><span>Task ID <small>Automatic</small></span><input value={draft.id} placeholder="plan1" readOnly /></label>
            </div>
            <fieldset className="gantt-schedule-fieldset">
              <legend>Schedule</legend>
              <div className="gantt-schedule-switch" aria-label="Gantt scheduling method">
                <button type="button" className={scheduleMode === "dates" ? "active" : ""} onClick={() => { setScheduleMode("dates"); setError(""); }}>Date range</button>
                <button type="button" className={scheduleMode === "after" ? "active" : ""} disabled={!dependencyTasks.length} onClick={() => {
                  setScheduleMode("after");
                  if (!endDate && minimumDependencyEnd) setEndDate(minimumDependencyEnd);
                  setError("");
                }}>Depends on</button>
                <button type="button" className={scheduleMode === "until" ? "active" : ""} disabled={draft.milestone || !dependencyTasks.length} onClick={() => { setScheduleMode("until"); setError(""); }}>Until task</button>
              </div>
              {scheduleMode === "dates" ? <div className="gantt-create-grid gantt-date-range">
                <label><span>{draft.milestone ? "Milestone date" : "Start date"}</span><input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setError(""); }} /></label>
                {!draft.milestone && <label><span>End date</span><input type="date" min={startDate || undefined} value={endDate} onChange={(event) => { setEndDate(event.target.value); setError(""); }} /></label>}
              </div> : scheduleMode === "after" ? <div className="gantt-create-grid gantt-after-task">
                <label><span>Depends on</span><select value={predecessorLineIndex ?? ""} onChange={(event) => { setPredecessorLineIndex(Number(event.target.value)); setError(""); }}>{dependencyTasks.map((task) => <option key={task.lineIndex} value={task.lineIndex}>{task.id ? `${task.id} · ${task.label}` : `ID will be added · ${task.label}`}</option>)}</select></label>
                {!draft.milestone && <label><span>Ends on</span><input type="date" min={minimumDependencyEnd} value={endDate} onChange={(event) => { setEndDate(event.target.value); setError(""); }} /></label>}
              </div> : <div className="gantt-create-grid gantt-until-task">
                <label><span>Start date</span><input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setError(""); }} /></label>
                <label><span>Runs until</span><select value={untilTargetLineIndex ?? ""} onChange={(event) => { setUntilTargetLineIndex(Number(event.target.value)); setError(""); }}>{dependencyTasks.map((task) => <option key={task.lineIndex} value={task.lineIndex}>{task.id ? `${task.id} · ${task.label}` : `ID will be added · ${task.label}`}</option>)}</select></label>
              </div>}
              {!dependencyTasks.length && <small className="gantt-schedule-help">Add an earlier task before creating a dependency.</small>}
            </fieldset>
            <div className="gantt-create-toggles">
              <label><input type="checkbox" checked={draft.critical} onChange={(event) => patch("critical", event.target.checked)} /><span>Critical task</span></label>
              <label><input type="checkbox" checked={draft.milestone} onChange={(event) => {
                patch("milestone", event.target.checked);
                if (event.target.checked && scheduleMode === "until") setScheduleMode("dates");
              }} /><span>Milestone</span></label>
            </div>
          </>}
          {error && <p className="semantic-error">{error}</p>}
        </div>
        <footer><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={busy}><Check size={15} /> {busy ? "Validating…" : draft.kind === "section" ? "Create section" : "Create task bar"}</button></footer>
      </form>
    </div>
  );
}
