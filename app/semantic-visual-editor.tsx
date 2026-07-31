"use client";

import { ArrowDown, ArrowUp, Check, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { MermaidDiagramType } from "./mermaid-types";
import { visualModeLabel } from "./mermaid-types";

type Props = {
  source: string;
  type: MermaidDiagramType;
  onCommit: (candidate: string) => Promise<{ ok: boolean; error?: string }>;
};

function declarationIndex(lines: string[], type: MermaidDiagramType) {
  return lines.findIndex((line) => type.declaration.test(line.trim()));
}

export function SemanticVisualEditor({ source, type, onCommit }: Props) {
  const [lines, setLines] = useState(() => source.split("\n"));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const headerIndex = useMemo(() => declarationIndex(lines, type), [lines, type]);
  const statementIndexes = useMemo(() => lines.map((_, index) => index).filter((index) => index !== headerIndex), [headerIndex, lines]);
  const dirty = lines.join("\n") !== source;
  const mode = visualModeLabel(type.family);

  const updateLine = (index: number, value: string) => {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? value : line));
    setError("");
  };

  const moveLine = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= lines.length || target === headerIndex) return;
    setLines((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setError("");
  };

  const deleteLine = (index: number) => {
    setLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
    setError("");
  };

  const addStatement = () => {
    setLines((current) => [...current, `  %% Replace this comment with a valid ${type.label} statement`]);
    setError("");
  };

  const apply = async () => {
    setBusy(true);
    setError("");
    const result = await onCommit(lines.join("\n"));
    setBusy(false);
    if (!result.ok) setError(result.error || "Mermaid rejected this edit");
  };

  return (
    <section className={`semantic-editor family-${type.family}`} aria-label={`${mode} editor for ${type.label}`}>
      <header>
        <div><span>{mode} editing</span><b>{type.label}</b></div>
        <div className="semantic-validity"><Check size={14} /> The saved source is valid Mermaid</div>
      </header>
      <div className="semantic-editor-body">
        <div className="semantic-declaration"><span>Diagram declaration</span><code>{headerIndex >= 0 ? lines[headerIndex] : type.label}</code></div>
        <div className="semantic-statements">
          {statementIndexes.map((index) => (
            <article key={`${index}-${statementIndexes.length}`} className="semantic-statement">
              <span className="semantic-line-number">{index + 1}</span>
              <textarea
                aria-label={`Mermaid statement on line ${index + 1}`}
                rows={Math.max(1, Math.min(4, lines[index].split("\n").length))}
                value={lines[index]}
                onChange={(event) => updateLine(index, event.target.value)}
              />
              <div className="semantic-line-actions">
                <button type="button" aria-label={`Move line ${index + 1} up`} onClick={() => moveLine(index, -1)}><ArrowUp size={14} /></button>
                <button type="button" aria-label={`Move line ${index + 1} down`} onClick={() => moveLine(index, 1)}><ArrowDown size={14} /></button>
                <button type="button" aria-label={`Delete line ${index + 1}`} onClick={() => deleteLine(index)}><Trash2 size={14} /></button>
              </div>
            </article>
          ))}
          <button className="semantic-add" type="button" onClick={addStatement}><Plus size={15} /> Add statement</button>
        </div>
      </div>
      <footer>
        <div className={error ? "semantic-error" : "semantic-help"}>{error || "Changes are validated by Mermaid before replacing the saved source."}</div>
        <div>
          <button type="button" disabled={!dirty || busy} onClick={() => setLines(source.split("\n"))}><RotateCcw size={14} /> Reset</button>
          <button className="primary-button" type="button" disabled={!dirty || busy} onClick={apply}><Check size={14} /> {busy ? "Validating…" : "Validate & apply"}</button>
        </div>
      </footer>
    </section>
  );
}
