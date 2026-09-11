import type { FlowchartVisualShape } from "../flowchart-shapes";
import type { DiagramStyle } from "../mermaid-style";
import type { PolishedStyle } from "../beautiful-mermaid-config";

export type NodeShape = FlowchartVisualShape;
export type EdgeStyle = "solid" | "dashed" | "thick";
export type SupportedMermaidVersion = "11.16.0" | "10.9.6";
export type MermaidVersionPreference = "auto" | SupportedMermaidVersion;
export type DiagramNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape: NodeShape;
  color: string;
  textColor: string;
  groupId?: string;
  mermaidShape?: string;
};

export type DiagramEdge = {
  id: string;
  from: string;
  to: string;
  label: string;
  style: EdgeStyle;
  arrow?: boolean;
  sourceOccurrence?: number;
};

export type DiagramGroup = { id: string; label: string };

export type Diagram = {
  name: string;
  direction: "LR" | "TB";
  source?: string;
  mermaidVersion?: MermaidVersionPreference;
  detectedMermaidVersion?: SupportedMermaidVersion;
  renderProfile?: "dokuwiki";
  style?: DiagramStyle;
  polishedStyle?: PolishedStyle;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  groups: DiagramGroup[];
};

