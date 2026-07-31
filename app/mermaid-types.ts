export type VisualModeFamily = "freeform" | "structured" | "data";

export type MermaidDiagramType = {
  id: string;
  label: string;
  family: VisualModeFamily;
  declaration: RegExp;
  template: string;
};

export const MERMAID_DIAGRAM_TYPES: MermaidDiagramType[] = [
  { id: "flowchart", label: "Flowchart", family: "freeform", declaration: /^(?:flowchart(?:-elk)?|graph)\b/i, template: "flowchart LR\n  start([Start]) --> finish([Finish])" },
  { id: "state", label: "State Diagram", family: "freeform", declaration: /^stateDiagram(?:-v2)?\b/i, template: "stateDiagram-v2\n  [*] --> Ready\n  Ready --> [*]" },
  { id: "class", label: "Class Diagram", family: "freeform", declaration: /^classDiagram(?:-v2)?\b/i, template: "classDiagram\n  class User\n  User : +String name" },
  { id: "er", label: "Entity Relationship", family: "freeform", declaration: /^erDiagram\b/i, template: "erDiagram\n  CUSTOMER ||--o{ ORDER : places" },
  { id: "requirement", label: "Requirement Diagram", family: "freeform", declaration: /^requirement(?:Diagram)?\b/i, template: "requirementDiagram\n  requirement example {\n    id: 1\n    text: Example requirement\n    risk: low\n    verifymethod: test\n  }" },
  { id: "c4", label: "C4 Diagram", family: "freeform", declaration: /^C4(?:Context|Container|Component|Dynamic|Deployment)\b/, template: "C4Context\n  title System context\n  Person(user, \"User\")\n  System(system, \"System\")\n  Rel(user, system, \"Uses\")" },
  { id: "mindmap", label: "Mindmap", family: "freeform", declaration: /^mindmap\b/i, template: "mindmap\n  root((Project))\n    Research\n    Build" },
  { id: "block", label: "Block Diagram", family: "freeform", declaration: /^block(?:-beta)?\b/i, template: "block-beta\n  columns 2\n  A[\"Input\"]\n  B[\"Output\"]\n  A --> B" },
  { id: "architecture", label: "Architecture", family: "freeform", declaration: /^architecture(?:-beta)?\b/i, template: "architecture-beta\n  service api(server)[API]\n  service db(database)[Database]\n  api:R --> L:db" },
  { id: "wardley", label: "Wardley Map", family: "freeform", declaration: /^wardley-beta\b/i, template: "wardley-beta\n  title Service map\n  anchor User [0.90, 0.95]\n  component Service [0.65, 0.70]\n  User -> Service" },
  { id: "treeView", label: "TreeView", family: "freeform", declaration: /^treeView-beta\b/i, template: "treeView-beta\n  project/\n    src/\n      index.ts\n    README.md" },

  { id: "swimlane", label: "Swimlanes", family: "structured", declaration: /^swimlane-beta\b/i, template: "swimlane-beta LR\n  subgraph Customer\n    request[Request]\n  end\n  subgraph Team\n    deliver[Deliver]\n  end\n  request --> deliver" },
  { id: "sequence", label: "Sequence Diagram", family: "structured", declaration: /^sequenceDiagram\b/i, template: "sequenceDiagram\n  Alice->>Bob: Hello\n  Bob-->>Alice: Hi" },
  { id: "journey", label: "User Journey", family: "structured", declaration: /^journey\b/i, template: "journey\n  title User journey\n  section Start\n    Open project: 5: User" },
  { id: "gantt", label: "Gantt", family: "structured", declaration: /^gantt\b/i, template: "gantt\n  title Project plan\n  dateFormat YYYY-MM-DD\n  section Plan\n    First task :a1, 2026-01-01, 3d" },
  { id: "gitGraph", label: "Git Graph", family: "structured", declaration: /^gitGraph\b/i, template: "gitGraph\n  commit id: \"Start\"\n  branch feature\n  checkout feature\n  commit id: \"Work\"" },
  { id: "timeline", label: "Timeline", family: "structured", declaration: /^timeline\b/i, template: "timeline\n  title Project timeline\n  2026 : Start\n  2027 : Finish" },
  { id: "zenuml", label: "ZenUML", family: "structured", declaration: /^zenuml\b/i, template: "zenuml\n  Controller.Get(id) {\n    result = Service.Get(id)\n    return result\n  }" },
  { id: "packet", label: "Packet", family: "structured", declaration: /^packet(?:-beta)?\b/i, template: "packet-beta\n  0-15: \"Source Port\"\n  16-31: \"Destination Port\"" },
  { id: "kanban", label: "Kanban", family: "structured", declaration: /^kanban\b/i, template: "kanban\n  todo[Todo]\n    task1[First task]\n  done[Done]" },
  { id: "eventmodeling", label: "Event Modeling", family: "structured", declaration: /^eventmodeling\b/i, template: "eventmodeling\n  tf 01 ui CartUI\n  tf 02 cmd AddItem\n  tf 03 evt ItemAdded" },
  { id: "railroad", label: "Railroad", family: "structured", declaration: /^railroad-beta\b/i, template: "railroad-beta\n  expression = sequence(terminal(\"if\"), nonterminal(\"condition\"));" },
  { id: "railroadEbnf", label: "Railroad EBNF", family: "structured", declaration: /^railroad-ebnf-beta\b/i, template: "railroad-ebnf-beta\n  expression = term, { (\"+\" | \"-\"), term };" },
  { id: "railroadAbnf", label: "Railroad ABNF", family: "structured", declaration: /^railroad-abnf-beta\b/i, template: "railroad-abnf-beta\n  digit = %x30-39;" },
  { id: "railroadPeg", label: "Railroad PEG", family: "structured", declaration: /^railroad-peg-beta\b/i, template: "railroad-peg-beta\n  expression <- term ((\"+\" / \"-\") term)*;" },

  { id: "pie", label: "Pie Chart", family: "data", declaration: /^pie\b/i, template: "pie showData\n  title Distribution\n  \"First\" : 60\n  \"Second\" : 40" },
  { id: "quadrantChart", label: "Quadrant Chart", family: "data", declaration: /^quadrantChart\b/i, template: "quadrantChart\n  title Priority map\n  x-axis Low effort --> High effort\n  y-axis Low impact --> High impact\n  Example: [0.35, 0.75]" },
  { id: "sankey", label: "Sankey", family: "data", declaration: /^sankey(?:-beta)?\b/i, template: "sankey-beta\n  Source,Process,60\n  Process,Result,60" },
  { id: "xychart", label: "XY Chart", family: "data", declaration: /^xychart(?:-beta)?\b/i, template: "xychart-beta\n  title \"Trend\"\n  x-axis [Jan, Feb, Mar]\n  y-axis \"Value\" 0 --> 100\n  line [20, 55, 80]" },
  { id: "radar", label: "Radar", family: "data", declaration: /^radar-beta\b/i, template: "radar-beta\n  axis Speed, Quality, Cost\n  curve Current{70, 85, 55}\n  max 100" },
  { id: "treemap", label: "Treemap", family: "data", declaration: /^treemap(?:-beta)?\b/i, template: "treemap-beta\n  \"Project\"\n    \"Design\": 40\n    \"Build\": 60" },
  { id: "venn", label: "Venn", family: "data", declaration: /^venn-beta\b/i, template: "venn-beta\n  title \"Team overlap\"\n  set Frontend\n  set Backend\n  union Frontend,Backend[\"Shared\"]" },
  { id: "ishikawa", label: "Ishikawa", family: "data", declaration: /^ishikawa(?:-beta)?\b/i, template: "ishikawa-beta\n  Delivery delay\n    Process\n      Manual handoff\n    People\n      Limited capacity" },
  { id: "cynefin", label: "Cynefin", family: "data", declaration: /^cynefin-beta\b/i, template: "cynefin-beta\n  title Work classification\n  complex\n    \"Discovery\"\n  complicated\n    \"Expert review\"\n  clear\n    \"Standard task\"\n  chaotic\n    \"Incident\"" },
];

function withoutFrontmatter(source: string) {
  const trimmed = source.trimStart();
  if (!trimmed.startsWith("---")) return trimmed;
  return trimmed.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/, "").trimStart();
}

export function detectDiagramType(source: string) {
  const body = withoutFrontmatter(source);
  const declaration = body.split(/\r?\n/).find((line) => {
    const trimmed = line.trim();
    return trimmed && !trimmed.startsWith("%%");
  })?.trim() || "";
  return MERMAID_DIAGRAM_TYPES.find((type) => type.declaration.test(declaration));
}

export function visualModeLabel(family: VisualModeFamily) {
  if (family === "structured") return "Structured";
  if (family === "data") return "Data";
  return "FreeForm";
}
