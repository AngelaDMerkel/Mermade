export type FlowchartVisualShape =
  | "rectangle"
  | "rounded"
  | "diamond"
  | "circle"
  | "hexagon"
  | "document"
  | "framed"
  | "input-output"
  | "database"
  | "event"
  | "delay"
  | "manual-input";

export type FlowchartShapeOption = {
  id: string;
  label: string;
  mermaidShape: string;
  visualShape: FlowchartVisualShape;
};

const common: FlowchartShapeOption[] = [
  { id: "process", label: "Process — Rectangle", mermaidShape: "rect", visualShape: "rectangle" },
  { id: "terminal", label: "Start / End — Stadium", mermaidShape: "stadium", visualShape: "rounded" },
  { id: "decision", label: "Decision — Diamond", mermaidShape: "diam", visualShape: "diamond" },
  { id: "input-output", label: "Input / Output — Parallelogram", mermaidShape: "lean-r", visualShape: "input-output" },
  { id: "document", label: "Document — Wavy rectangle", mermaidShape: "doc", visualShape: "document" },
  { id: "database", label: "Data Store — Cylinder", mermaidShape: "cyl", visualShape: "database" },
  { id: "subprocess", label: "Subprocess — Framed rectangle", mermaidShape: "fr-rect", visualShape: "framed" },
  { id: "connector", label: "Connector — Circle", mermaidShape: "circle", visualShape: "circle" },
];

const specialized: FlowchartShapeOption[] = [
  { id: "event", label: "Event — Rounded rectangle", mermaidShape: "rounded", visualShape: "event" },
  { id: "prepare", label: "Preparation — Hexagon", mermaidShape: "hex", visualShape: "hexagon" },
  { id: "manual-input", label: "Manual Input — Sloped rectangle", mermaidShape: "sl-rect", visualShape: "manual-input" },
  { id: "delay", label: "Delay / Wait — Half-rounded rectangle", mermaidShape: "delay", visualShape: "delay" },
  { id: "documents", label: "Multiple Documents — Stacked documents", mermaidShape: "docs", visualShape: "document" },
  { id: "comment", label: "Comment / Note — Brace", mermaidShape: "brace", visualShape: "rectangle" },
  { id: "display", label: "Display — Curved trapezoid", mermaidShape: "curv-trap", visualShape: "input-output" },
  { id: "junction", label: "Junction — Filled circle", mermaidShape: "f-circ", visualShape: "circle" },
  { id: "fork", label: "Fork / Join — Bar", mermaidShape: "fork", visualShape: "rectangle" },
];

const completeCatalog: FlowchartShapeOption[] = [
  { id: "bang", label: "Bang — Bang", mermaidShape: "bang", visualShape: "rectangle" },
  { id: "card", label: "Card — Notched rectangle", mermaidShape: "notch-rect", visualShape: "rectangle" },
  { id: "cloud", label: "Cloud — Cloud", mermaidShape: "cloud", visualShape: "rounded" },
  { id: "collate", label: "Collate — Hourglass", mermaidShape: "hourglass", visualShape: "diamond" },
  { id: "communication", label: "Communication Link — Bolt", mermaidShape: "bolt", visualShape: "rectangle" },
  { id: "comment-right", label: "Comment Right — Brace", mermaidShape: "brace-r", visualShape: "rectangle" },
  { id: "comment-both", label: "Comment Both Sides — Braces", mermaidShape: "braces", visualShape: "rectangle" },
  { id: "output-input", label: "Output / Input — Lean left", mermaidShape: "lean-l", visualShape: "input-output" },
  { id: "data-store", label: "Data Store — Parallel lines", mermaidShape: "datastore", visualShape: "framed" },
  { id: "direct-storage", label: "Direct Access Storage — Horizontal cylinder", mermaidShape: "h-cyl", visualShape: "database" },
  { id: "disk-storage", label: "Disk Storage — Lined cylinder", mermaidShape: "lin-cyl", visualShape: "database" },
  { id: "divided-process", label: "Divided Process — Divided rectangle", mermaidShape: "div-rect", visualShape: "framed" },
  { id: "extract", label: "Extract — Triangle", mermaidShape: "tri", visualShape: "diamond" },
  { id: "internal-storage", label: "Internal Storage — Window pane", mermaidShape: "win-pane", visualShape: "framed" },
  { id: "lined-document", label: "Lined Document — Lined document", mermaidShape: "lin-doc", visualShape: "document" },
  { id: "lined-process", label: "Lined Process — Lined rectangle", mermaidShape: "lin-rect", visualShape: "framed" },
  { id: "loop-limit", label: "Loop Limit — Notched pentagon", mermaidShape: "notch-pent", visualShape: "hexagon" },
  { id: "manual-file", label: "Manual File — Flipped triangle", mermaidShape: "flip-tri", visualShape: "diamond" },
  { id: "manual-operation", label: "Manual Operation — Trapezoid", mermaidShape: "trap-t", visualShape: "manual-input" },
  { id: "multi-process", label: "Multiple Processes — Stacked rectangles", mermaidShape: "st-rect", visualShape: "framed" },
  { id: "odd", label: "Odd — Asymmetric", mermaidShape: "odd", visualShape: "rectangle" },
  { id: "paper-tape", label: "Paper Tape — Flag", mermaidShape: "flag", visualShape: "document" },
  { id: "priority", label: "Priority Action — Trapezoid", mermaidShape: "trap-b", visualShape: "manual-input" },
  { id: "start", label: "Start — Small circle", mermaidShape: "sm-circ", visualShape: "circle" },
  { id: "stop-double", label: "Stop — Double circle", mermaidShape: "dbl-circ", visualShape: "circle" },
  { id: "stop-framed", label: "Stop — Framed circle", mermaidShape: "fr-circ", visualShape: "circle" },
  { id: "stored-data", label: "Stored Data — Bow-tie rectangle", mermaidShape: "bow-rect", visualShape: "database" },
  { id: "summary", label: "Summary — Crossed circle", mermaidShape: "cross-circ", visualShape: "circle" },
  { id: "tagged-document", label: "Tagged Document — Tagged document", mermaidShape: "tag-doc", visualShape: "document" },
  { id: "tagged-process", label: "Tagged Process — Tagged rectangle", mermaidShape: "tag-rect", visualShape: "rectangle" },
  { id: "text", label: "Text Block — No border", mermaidShape: "text", visualShape: "rectangle" },
];

export const FLOWCHART_SHAPE_GROUPS = [
  { label: "Common — recommended", options: common },
  { label: "Specialised", options: specialized },
  { label: "All Mermaid shapes", options: completeCatalog },
];

export const FLOWCHART_SHAPES = FLOWCHART_SHAPE_GROUPS.flatMap((group) => group.options);

const fallbackShapeByVisual: Record<FlowchartVisualShape, string> = {
  rectangle: "rect",
  rounded: "stadium",
  diamond: "diam",
  circle: "circle",
  hexagon: "hex",
  document: "doc",
  framed: "fr-rect",
  "input-output": "lean-r",
  database: "cyl",
  event: "rounded",
  delay: "delay",
  "manual-input": "sl-rect",
};

export function visualShapeForMermaid(shape: string): FlowchartVisualShape {
  return FLOWCHART_SHAPES.find((option) => option.mermaidShape === shape)?.visualShape
    ?? ({
      database: "database",
      cylinder: "database",
      db: "database",
      decision: "diamond",
      diamond: "diamond",
      question: "diamond",
      event: "event",
      "manual-input": "manual-input",
      "sloped-rectangle": "manual-input",
      "in-out": "input-output",
      "lean-right": "input-output",
      display: "input-output",
      "half-rounded-rectangle": "delay",
      terminal: "rounded",
      pill: "rounded",
      subproc: "framed",
      subprocess: "framed",
      subroutine: "framed",
      document: "document",
      prepare: "hexagon",
      hexagon: "hexagon",
      junction: "circle",
    } satisfies Record<string, FlowchartVisualShape>)[shape]
    ?? "rectangle";
}

export function selectedFlowchartShape(node: { shape: FlowchartVisualShape; mermaidShape?: string }) {
  return FLOWCHART_SHAPES.find((option) => option.mermaidShape === node.mermaidShape)?.id
    ?? FLOWCHART_SHAPES.find((option) => option.mermaidShape === fallbackShapeByVisual[node.shape])?.id
    ?? "process";
}

export function flowchartShapePatch(optionId: string) {
  const option = FLOWCHART_SHAPES.find((candidate) => candidate.id === optionId) ?? common[0];
  return { shape: option.visualShape, mermaidShape: option.mermaidShape };
}

export function mermaidShapeClass(shape?: string) {
  return shape ? `mermaid-shape-${shape.replace(/[^a-z0-9-]/gi, "-").toLowerCase()}` : "";
}
