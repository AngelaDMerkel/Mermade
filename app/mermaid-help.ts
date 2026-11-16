export type MermaidHelpResourceKind = "Official syntax" | "Standard" | "Best practice" | "Method guide";

export type MermaidHelpResource = {
  label: string;
  url: string;
  kind: MermaidHelpResourceKind;
};

export type MermaidHelpContent = {
  purpose: string;
  tips: string[];
  pitfalls: string[];
  resources: MermaidHelpResource[];
};

const mermaid = (path: string): MermaidHelpResource => ({
  label: "Mermaid syntax reference",
  url: `https://mermaid.js.org/syntax/${path}.html`,
  kind: "Official syntax",
});

const guide = (label: string, url: string, kind: MermaidHelpResourceKind = "Best practice"): MermaidHelpResource => ({ label, url, kind });

const asqFlowchart = guide("ASQ flowchart guidance", "https://asq.org/quality-resources/flowchart");
export const FLOWCHART_HELP: MermaidHelpContent = {
    purpose: "Show a process, decision path, workflow, or movement of information from one step to another.",
    tips: ["Use semantic shapes consistently: terminators for starts and ends, rectangles for actions, and diamonds for decisions.", "Label decision branches with explicit outcomes and keep the main path visually dominant."],
    pitfalls: ["Avoid crossing connectors and oversized labels; split a dense process into named subgraphs."],
    resources: [mermaid("flowchart"), asqFlowchart],

};
