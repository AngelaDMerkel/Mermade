import { detectDiagramType, MERMAID_DIAGRAM_TYPES } from "./mermaid-types";

export type RepairVersion = "11.16.0" | "10.9.6";

export type RepairProposal = {
  id: string;
  title: string;
  description: string;
  confidence: "high" | "medium" | "low";
  category: "syntax" | "version" | "diagram";
  source: string;
  version?: RepairVersion;
};

const HEADER_REPAIRS: Array<[RegExp, string]> = [
  [/^\s*flow\s*chart\b/im, "flowchart"],
  [/^\s*sequence\s+diagram\b/im, "sequenceDiagram"],
  [/^\s*state\s+diagram(?:-v2)?\b/im, "stateDiagram-v2"],
  [/^\s*class\s+diagram(?:-v2)?\b/im, "classDiagram"],
  [/^\s*er\s+diagram\b/im, "erDiagram"],
  [/^\s*git\s+graph\b/im, "gitGraph"],
  [/^\s*quadrant\s+chart\b/im, "quadrantChart"],
];

function add(proposals: RepairProposal[], proposal: RepairProposal) {
  if (!proposals.some((current) => current.source === proposal.source && current.version === proposal.version)) proposals.push(proposal);
}

function stripMarkdownFence(source: string) {
  const match = source.trim().match(/^```(?:mermaid)?\s*\r?\n([\s\S]*?)\r?\n```$/i);
  return match?.[1]?.trim() || source;
}

function normalizeTypography(source: string) {
  return source
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+[→⟶]\s+/g, " --> ")
    .replace(/\u00a0/g, " ");
}

function repairHeader(source: string) {
  for (const [pattern, replacement] of HEADER_REPAIRS) {
    if (pattern.test(source)) return source.replace(pattern, replacement);
  }
  return source;
}

function inferDiagramTypeId(source: string, fallbackId: string) {
  const detected = detectDiagramType(source);
  if (detected) return detected.id;
  const text = source.toLowerCase();
  if (/\bparticipant\b|--?>>|--?>/.test(source) && /:\s*\S/.test(source)) return "sequence";
  if (/\bclass\s+\w+|<\|--|\*--|o--/.test(source)) return "class";
  if (/\|[|o}{]--[|o}{]|\bentity\b/.test(source)) return "er";
  if (/\bdateformat\b|\bsection\b[\s\S]*\b\d+d\b/.test(text)) return "gantt";
  if (/\bcommit\b|\bcheckout\b|\bbranch\b/.test(text)) return "gitGraph";
  if (/\bstate\b|\[\*\]\s*-->/.test(source)) return "state";
  if (/\bperson\(|\bsystem\(|\brel\(/i.test(source)) return "c4";
  if (/\bsubgraph\b|-->|---|-\.->|==>/.test(source)) return "flowchart";
  return fallbackId;
}

function addDiagramDeclaration(source: string, typeId: string) {
  if (detectDiagramType(source)) return source;
  const type = MERMAID_DIAGRAM_TYPES.find((candidate) => candidate.id === typeId);
  const declaration = type?.template.split(/\r?\n/)[0];
  return declaration ? `${declaration}\n${source.trimStart()}` : source;
}

function balanceFlowchartSubgraphs(source: string) {
  const body = source.split(/\r?\n/);
  const opens = body.filter((line) => /^\s*subgraph\b/i.test(line)).length;
  const closes = body.filter((line) => /^\s*end\s*$/i.test(line)).length;
  if (opens <= closes) return source;
  return `${source.trimEnd()}\n${Array.from({ length: opens - closes }, () => "end").join("\n")}`;
}

function convertExpandedShapesToLegacy(source: string) {
  return source.replace(/(\b\w+)@\{\s*shape\s*:\s*["']?([\w-]+)["']?\s*,\s*label\s*:\s*"((?:\\.|[^"])*)"\s*\}/g, (_match, id: string, shape: string, label: string) => {
    const safe = label.replaceAll('"', "'");
    if (["stadium", "terminal", "pill"].includes(shape)) return `${id}(["${safe}"])`;
    if (["diam", "diamond", "decision"].includes(shape)) return `${id}{"${safe}"}`;
    if (["circle"].includes(shape)) return `${id}(("${safe}"))`;
    if (["hex", "hexagon", "prepare"].includes(shape)) return `${id}{{"${safe}"}}`;
    return `${id}["${safe}"]`;
  });
}

export function createRepairProposals(source: string, selectedVersion: RepairVersion, fallbackTypeId = "flowchart") {
  const proposals: RepairProposal[] = [];
  const withoutFence = stripMarkdownFence(source);
  if (withoutFence !== source) add(proposals, {
    id: "remove-markdown-fence",
    title: "Remove the Markdown code fence",
    description: "Keep the Mermaid diagram itself and remove the surrounding ```mermaid wrapper.",
    confidence: "high",
    category: "syntax",
    source: withoutFence,
  });

  const normalized = normalizeTypography(withoutFence);
  if (normalized !== withoutFence) add(proposals, {
    id: "normalize-punctuation",
    title: "Normalise pasted punctuation",
    description: "Replace smart quotes, non-breaking spaces, and visual arrows with Mermaid syntax.",
    confidence: "high",
    category: "syntax",
    source: normalized,
  });

  const repairedHeader = repairHeader(normalized);
  if (repairedHeader !== normalized) add(proposals, {
    id: "repair-declaration",
    title: "Correct the diagram declaration",
    description: "Use Mermaid’s exact case-sensitive declaration for this chart type.",
    confidence: "high",
    category: "diagram",
    source: repairedHeader,
  });

  const inferredTypeId = inferDiagramTypeId(repairedHeader, fallbackTypeId);
  const withDeclaration = addDiagramDeclaration(repairedHeader, inferredTypeId);
  if (withDeclaration !== repairedHeader) {
    const label = MERMAID_DIAGRAM_TYPES.find((type) => type.id === inferredTypeId)?.label || "diagram";
    add(proposals, {
      id: `add-${inferredTypeId}-declaration`,
      title: `Add the ${label} declaration`,
      description: `The content resembles a ${label}; add its required first line.`,
      confidence: inferredTypeId === fallbackTypeId ? "medium" : "high",
      category: "diagram",
      source: withDeclaration,
    });
  }

  if (inferredTypeId === "flowchart") {
    const balanced = balanceFlowchartSubgraphs(withDeclaration);
    if (balanced !== withDeclaration) add(proposals, {
      id: "close-subgraphs",
      title: "Close unfinished subgraphs",
      description: "Add the missing `end` statements required by the flowchart’s subgraph blocks.",
      confidence: "high",
      category: "diagram",
      source: balanced,
    });
  }

  const requiresV11 = /@\{\s*[^}]*\bshape\s*:/m.test(source);
  if (selectedVersion === "10.9.6" && requiresV11) {
    add(proposals, {
      id: "use-newest-mermaid",
      title: "Render with Mermaid 11.16.0",
      description: "Expanded node shapes require Mermaid 11.3 or newer; keep the source unchanged and use the newest bundled engine.",
      confidence: "high",
      category: "version",
      source,
      version: "11.16.0",
    });
    const legacy = convertExpandedShapesToLegacy(source);
    if (legacy !== source) add(proposals, {
      id: "convert-expanded-shapes",
      title: "Convert shapes for Mermaid 10",
      description: "Replace expanded shape syntax with the closest legacy node shapes while retaining labels and relationships.",
      confidence: "medium",
      category: "version",
      source: legacy,
      version: "10.9.6",
    });
  }

  const combinedBase = addDiagramDeclaration(repairHeader(normalizeTypography(stripMarkdownFence(source))), inferredTypeId);
  const combined = inferredTypeId === "flowchart" ? balanceFlowchartSubgraphs(combinedBase) : combinedBase;
  if (combined !== source) add(proposals, {
    id: "apply-safe-repairs",
    title: "Apply all safe repairs",
    description: "Combine the high-confidence formatting, declaration, and diagram-structure corrections.",
    confidence: "high",
    category: "syntax",
    source: combined,
  });

  return proposals;
}
