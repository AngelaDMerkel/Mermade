"use client";

import { CalendarRange, Check, Flag, Layers3 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  canonicaliseGanttMilestone,
  ganttDraftFromItem,
  ensureGanttTaskId,
  GanttItem,
  GanttItemDraft,
  ganttInclusiveEndDatesFromSource,
  ganttTaskSchedule,
  ganttTasksByIdSequence,
  nextGanttTaskId,
  parseGanttSource,
  updateGanttItem,
} from "./gantt-source";

type Props = {
  source: string;
  item: GanttItem;
  panel?: "properties" | "appearance";
  onCommit: (candidate: string, selectedLine: number) => Promise<{ ok: boolean; error?: string }>;
};

export function GanttItemProperties({ source, item, panel = "properties", onCommit }: Props) {
  const initialSchedule = item.kind === "task" ? ganttTaskSchedule(source, item.lineIndex) : null;
  const initialStartDate = item.kind === "task" && item.milestone && initialSchedule?.milestoneDate
    ? initialSchedule.milestoneDate.toISOString().slice(0, 10)
    : item.kind === "task" && /^\d{4}-\d{2}-\d{2}$/.test(item.start)
      ? item.start
      : initialSchedule?.start.toISOString().slice(0, 10) || "";
  const initialEndDate = item.kind === "task" && /^\d{4}-\d{2}-\d{2}$/.test(item.finish)
    ? item.finish
    : initialSchedule?.end.toISOString().slice(0, 10) || "";
  const initialScheduleMode: "dates" | "after" | "until" | "advanced" = item.kind !== "task"
    ? "dates"
    : /^until\s+\S+$/i.test(item.finish)
      ? "until"
      : /^after\s+\S+(?:\s+\S+)*$/i.test(item.start)
      ? "after"
      : initialStartDate && (initialEndDate || item.milestone)
        ? "dates"
        : "advanced";
  const [draft, setDraft] = useState<GanttItemDraft>(() => {
    const initial = ganttDraftFromItem(item);
    if (item.kind !== "section") return { ...initial, id: initial.id || nextGanttTaskId(source, item.sectionLineIndex, item.lineIndex) };
    const previousSection = parseGanttSource(source).sections.filter((section) => section.lineIndex < item.lineIndex).at(-1);
    const sectionLineIndex = previousSection?.lineIndex ?? null;
    return {
      ...initial,
      sectionLineIndex,
      order: Number.MAX_SAFE_INTEGER,
      id: nextGanttTaskId(source, sectionLineIndex),
    };
  });
  const [scheduleMode, setScheduleMode] = useState<"dates" | "after" | "until" | "advanced">(initialScheduleMode);
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const initialPredecessorId = item.kind === "task" ? item.start.replace(/^after\s+/i, "").trim().split(/\s+/)[0] || "" : "";
  const initialUntilTargetId = item.kind === "task" ? item.finish.replace(/^until\s+/i, "").trim().split(/\s+/)[0] || "" : "";
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const document = useMemo(() => parseGanttSource(source), [source]);
  const dependencyTasks = ganttTasksByIdSequence(document.tasks.filter(
    (task) => task.lineIndex !== item.lineIndex && task.sectionLineIndex === draft.sectionLineIndex,
  ));
  const [predecessorLineIndex, setPredecessorLineIndex] = useState<number | null>(dependencyTasks.find((task) => task.id === initialPredecessorId)?.lineIndex ?? dependencyTasks[0]?.lineIndex ?? null);
  const [untilTargetLineIndex, setUntilTargetLineIndex] = useState<number | null>(dependencyTasks.find((task) => task.id === initialUntilTargetId)?.lineIndex ?? dependencyTasks[0]?.lineIndex ?? null);
  const sectionTasks = document.tasks.filter((task) => task.sectionLineIndex === draft.sectionLineIndex);
  const maximumOrder = Math.max(1, sectionTasks.length + (item.kind === "task" && item.sectionLineIndex === draft.sectionLineIndex ? 0 : 1));
  const predecessorSchedule = predecessorLineIndex === null ? null : ganttTaskSchedule(source, predecessorLineIndex);
  const minimumDependencyEnd = predecessorSchedule
    ? new Date(predecessorSchedule.end.valueOf() + (ganttInclusiveEndDatesFromSource(source) ? 0 : 86_400_000)).toISOString().slice(0, 10)
    : undefined;

  const patch = <Key extends keyof GanttItemDraft>(key: Key, value: GanttItemDraft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setError("");
  };

  const apply = async () => {
    setBusy(true);
    setError("");
    try {
      const taskId = draft.id.trim();
      const duplicateTask = taskId ? document.tasks.find((task) => task.id === taskId && task.lineIndex !== item.lineIndex) : undefined;
      let candidateSource = source;
      let scheduledDraft = draft;
      if (duplicateTask) {
        if (item.kind !== "task" || taskId !== item.id) throw new Error(`Task ID “${taskId}” is already used by ${duplicateTask.label}`);
        const identified = ensureGanttTaskId(source, item.lineIndex);
        candidateSource = identified.source;
        scheduledDraft = { ...scheduledDraft, id: identified.id };
      }
      if (draft.kind === "task" && scheduleMode === "dates") {
        if (!startDate) throw new Error(draft.milestone ? "Choose the milestone date" : "Choose a start date");
        if (!draft.milestone && !endDate) throw new Error("Choose an end date");
        if (!draft.milestone && endDate <= startDate) throw new Error("The end date must be after the start date");
        const canonicalMilestone = !draft.milestone || (draft.start === startDate && draft.finish.trim() === "0d");
        const unchanged = initialScheduleMode === "dates"
          && startDate === initialStartDate
          && (draft.milestone || endDate === initialEndDate)
          && canonicalMilestone;
        scheduledDraft = unchanged ? scheduledDraft : { ...scheduledDraft, start: startDate, finish: draft.milestone ? "0d" : endDate };
      } else if (draft.kind === "task" && scheduleMode === "after") {
        if (predecessorLineIndex === null) throw new Error("Choose the task this bar should follow");
        if (!draft.milestone && !endDate) throw new Error("Choose when the task ends");
        if (!draft.milestone && !predecessorSchedule) throw new Error("The preceding task needs a resolvable date before an end date can be set");
        if (!draft.milestone && minimumDependencyEnd && endDate < minimumDependencyEnd) throw new Error("The end date must be after the preceding task finishes");
        const predecessor = ensureGanttTaskId(candidateSource, predecessorLineIndex, scheduledDraft.id ? [scheduledDraft.id] : []);
        candidateSource = predecessor.source;
        scheduledDraft = { ...scheduledDraft, start: `after ${predecessor.id}`, finish: draft.milestone ? "0d" : endDate };
      } else if (draft.kind === "task" && scheduleMode === "until") {
        if (!draft.start.trim()) throw new Error("Enter a start date or an ‘after task-id’ dependency");
        if (untilTargetLineIndex === null) throw new Error("Choose the task this bar should run until");
        const targetSchedule = ganttTaskSchedule(candidateSource, untilTargetLineIndex);
        const targetDate = targetSchedule?.milestoneDate ?? targetSchedule?.start;
        const explicitStart = /^\d{4}-\d{2}-\d{2}$/.test(draft.start) ? Date.parse(`${draft.start}T00:00:00Z`) : null;
        if (explicitStart !== null && targetDate && explicitStart >= targetDate.valueOf()) throw new Error("The start date must be before the target task starts");
        const canonicalTarget = canonicaliseGanttMilestone(candidateSource, untilTargetLineIndex);
        const target = ensureGanttTaskId(canonicalTarget.source, canonicalTarget.lineIndex, scheduledDraft.id ? [scheduledDraft.id] : []);
        candidateSource = target.source;
        scheduledDraft = { ...scheduledDraft, finish: `until ${target.id}` };
      }
      const updated = updateGanttItem(candidateSource, item.lineIndex, scheduledDraft);
      const result = await onCommit(updated.source, updated.lineIndex);
      if (!result.ok) setError(result.error || "Mermaid rejected this Gantt edit");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update this Gantt item");
    } finally {
      setBusy(false);
    }
  };

  const applyAppearance = async () => {
    if (item.kind !== "task") return;
    setBusy(true);
    setError("");
    try {
      const updated = updateGanttItem(source, item.lineIndex, {
        ...ganttDraftFromItem(item),
        status: draft.status,
        critical: draft.critical,
      });
      const result = await onCommit(updated.source, updated.lineIndex);
      if (!result.ok) setError(result.error || "Mermaid rejected this Gantt appearance");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update this Gantt appearance");
    } finally {
      setBusy(false);
    }
  };

  if (panel === "appearance") {
    return (
      <div className="field-stack gantt-item-properties gantt-item-appearance">
        <div className="selection-heading">
          <div className="edge-symbol"><Flag size={18} /></div>
          <div><span>Gantt appearance</span><b>{draft.label || (draft.kind === "section" ? "Untitled section" : "Untitled task")}</b></div>
        </div>
        {draft.kind === "task" ? <>
          <label><span>Task state</span><select value={draft.status} onChange={(event) => patch("status", event.target.value as GanttItemDraft["status"])}>
            <option value="planned">Planned</option>
            <option value="active">Active</option>
            <option value="done">Done</option>
          </select></label>
          <label className="toggle-row"><span>Critical emphasis</span><input type="checkbox" checked={draft.critical} onChange={(event) => patch("critical", event.target.checked)} /></label>
          <div className={`gantt-appearance-preview status-${draft.status} ${draft.critical ? "is-critical" : ""}`}>
            <span>{draft.label || "Task preview"}</span><i />
          </div>
          <p className="gantt-property-help"><Flag size={13} /> Uses Mermaid&apos;s portable <code>active</code>, <code>done</code>, and <code>crit</code> task tags. Diagram colours are controlled in Config.</p>
          {error && <p className="semantic-error">{error}</p>}
          <button className="primary-button wide gantt-apply" type="button" disabled={busy} onClick={() => void applyAppearance()}><Check size={15} /> {busy ? "Validating…" : "Apply Gantt appearance"}</button>
        </> : <div className="gantt-appearance-empty">
          <Layers3 size={19} />
          <b>Sections inherit the diagram style</b>
          <p>Use Config to change the theme, typography, and chart-wide colours.</p>
        </div>}
      </div>
    );
  }

  return (
    <div className="field-stack gantt-item-properties">
      <div className="selection-heading">
        <div className="edge-symbol">{draft.kind === "section" ? <Layers3 size={18} /> : <CalendarRange size={18} />}</div>
        <div><span>Gantt item</span><b>{draft.label || (draft.kind === "section" ? "Untitled section" : "Untitled task")}</b></div>
      </div>

      <label><span>Item type</span><select value={draft.kind} onChange={(event) => {
        const kind = event.target.value as GanttItemDraft["kind"];
        setDraft((current) => ({
          ...current,
          kind,
          id: kind === "task" ? current.id || nextGanttTaskId(source, current.sectionLineIndex, item.lineIndex) : current.id,
        }));
        setError("");
      }}>
        <option value="task">Task bar</option>
        <option value="section">Section</option>
      </select></label>
      <label><span>{draft.kind === "section" ? "Section name" : "Task label"}</span><input value={draft.label} onChange={(event) => patch("label", event.target.value)} /></label>

      {draft.kind === "task" && <>
        <label><span>Section</span><select value={draft.sectionLineIndex ?? ""} onChange={(event) => {
          const nextSection = event.target.value === "" ? null : Number(event.target.value);
          const choices = ganttTasksByIdSequence(document.tasks.filter(
            (task) => task.lineIndex !== item.lineIndex && task.sectionLineIndex === nextSection,
          ));
          setDraft((current) => ({
            ...current,
            sectionLineIndex: nextSection,
            order: 1,
            id: nextGanttTaskId(source, nextSection, item.kind === "task" ? item.lineIndex : -1),
          }));
          setPredecessorLineIndex(choices[0]?.lineIndex ?? null);
          setUntilTargetLineIndex(choices[0]?.lineIndex ?? null);
          setError("");
        }}>
          <option value="">No section</option>
          {document.sections.filter((section) => section.lineIndex !== (item.kind === "section" ? item.lineIndex : -1)).map((section) => <option key={section.lineIndex} value={section.lineIndex}>{section.label}</option>)}
        </select></label>
        <label><span>Order in section</span><select value={Math.min(draft.order, maximumOrder)} onChange={(event) => patch("order", Number(event.target.value))}>
          {Array.from({ length: maximumOrder }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}
        </select></label>
        <label className="toggle-row"><span>Milestone</span><input type="checkbox" checked={draft.milestone} onChange={(event) => {
          patch("milestone", event.target.checked);
          if (event.target.checked) {
            setScheduleMode("dates");
          }
        }} /></label>
        <label><span>Task ID <small>Automatic</small></span><input value={draft.id} placeholder="plan1" readOnly /></label>
        <fieldset className="gantt-schedule-fieldset">
          <legend>Schedule</legend>
          <div className="gantt-schedule-switch" aria-label="Gantt scheduling method">
            <button type="button" className={scheduleMode === "dates" ? "active" : ""} onClick={() => { setScheduleMode("dates"); setError(""); }}>Date range</button>
            <button type="button" className={scheduleMode === "after" ? "active" : ""} disabled={!dependencyTasks.length} onClick={() => {
              setScheduleMode("after");
              setPredecessorLineIndex((current) => dependencyTasks.some((task) => task.lineIndex === current) ? current : dependencyTasks[0]?.lineIndex ?? null);
              if (!endDate && minimumDependencyEnd) setEndDate(minimumDependencyEnd);
              setError("");
            }}>Depends on</button>
            {!draft.milestone && <button type="button" className={scheduleMode === "until" ? "active" : ""} disabled={!dependencyTasks.length} onClick={() => {
              setScheduleMode("until");
              setDraft((current) => ({ ...current, start: current.start || initialStartDate }));
              setUntilTargetLineIndex((current) => dependencyTasks.some((task) => task.lineIndex === current) ? current : dependencyTasks[0]?.lineIndex ?? null);
              setError("");
            }}>Until task</button>}
            {!draft.milestone && <button type="button" className={scheduleMode === "advanced" ? "active" : ""} onClick={() => { setScheduleMode("advanced"); setError(""); }}>Advanced</button>}
          </div>
          {scheduleMode === "dates" ? <div className="gantt-create-grid gantt-date-range">
            <label><span>{draft.milestone ? "Milestone date" : "Start date"}</span><input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setError(""); }} /></label>
            {!draft.milestone && <label><span>End date</span><input type="date" min={startDate || undefined} value={endDate} onChange={(event) => { setEndDate(event.target.value); setError(""); }} /></label>}
          </div> : scheduleMode === "after" ? <div className="gantt-create-grid gantt-after-task">
            <label><span>Depends on</span><select value={predecessorLineIndex ?? ""} onChange={(event) => { setPredecessorLineIndex(Number(event.target.value)); setError(""); }}>{dependencyTasks.map((task) => <option key={task.lineIndex} value={task.lineIndex}>{task.id ? `${task.id} · ${task.label}` : `ID will be added · ${task.label}`}</option>)}</select></label>
            {!draft.milestone && <label><span>Ends on</span><input type="date" min={minimumDependencyEnd} value={endDate} onChange={(event) => { setEndDate(event.target.value); setError(""); }} /></label>}
          </div> : scheduleMode === "until" ? <div className="gantt-create-grid gantt-until-task">
            <label><span>Start or dependency</span><input value={draft.start} placeholder="2026-09-01 or after bill1" onChange={(event) => patch("start", event.target.value)} /></label>
            <label><span>Runs until</span><select value={untilTargetLineIndex ?? ""} onChange={(event) => { setUntilTargetLineIndex(Number(event.target.value)); setError(""); }}>{dependencyTasks.map((task) => <option key={task.lineIndex} value={task.lineIndex}>{task.id ? `${task.id} · ${task.label}` : `ID will be added · ${task.label}`}</option>)}</select></label>
          </div> : <div className="gantt-create-grid gantt-advanced-schedule">
            <label><span>Start or dependency</span><input value={draft.start} placeholder="after design" onChange={(event) => patch("start", event.target.value)} /></label>
            <label><span>End or duration</span><input value={draft.finish} placeholder="5d or until release" onChange={(event) => patch("finish", event.target.value)} /></label>
          </div>}
          {!dependencyTasks.length && <small className="gantt-schedule-help">No other task is available for a dependency.</small>}
        </fieldset>
        <p className="gantt-property-help"><Flag size={13} /> Date ranges write explicit Mermaid dates. Dependencies use the standard <code>after task-id</code> form.</p>
      </>}

      {error && <p className="semantic-error">{error}</p>}
      <button className="primary-button wide gantt-apply" type="button" disabled={busy} onClick={() => void apply()}><Check size={15} /> {busy ? "Validating…" : "Apply Gantt properties"}</button>
    </div>
  );
}
