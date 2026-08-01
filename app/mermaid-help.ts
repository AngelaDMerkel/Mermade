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

const uml = guide("OMG UML 2.5.1 specification", "https://www.omg.org/spec/UML/2.5.1", "Standard");
const sysml = guide("OMG SysML v1 diagram guidance", "https://www.omg.org/sysml/sysmlv1/", "Standard");
const asqFlowchart = guide("ASQ flowchart guidance", "https://asq.org/quality-resources/flowchart");
const c4 = guide("C4 diagram guidance", "https://c4model.com/diagrams", "Method guide");
const datawrapper = guide("Datawrapper chart selection guide", "https://www.datawrapper.de/blog/chart-types-guide", "Best practice");

export const MERMAID_HELP: Record<string, MermaidHelpContent> = {
  flowchart: {
    purpose: "Show a process, decision path, workflow, or movement of information from one step to another.",
    tips: ["Use semantic shapes consistently: terminators for starts and ends, rectangles for actions, and diamonds for decisions.", "Label decision branches with explicit outcomes and keep the main path visually dominant."],
    pitfalls: ["Avoid crossing connectors and oversized labels; split a dense process into named subgraphs."],
    resources: [mermaid("flowchart"), asqFlowchart],
  },
  state: {
    purpose: "Describe the states an object or system can occupy and the events that cause transitions.",
    tips: ["Name stable states with nouns or conditions and transitions with triggering events.", "Include initial and final states when the lifecycle has clear boundaries."],
    pitfalls: ["Do not use a state diagram as a general task flow; every transition should represent a meaningful state change."],
    resources: [mermaid("stateDiagram"), uml],
  },
  class: {
    purpose: "Model software or domain structure through classes, attributes, operations, and typed relationships.",
    tips: ["Keep each diagram focused on one bounded context or subsystem.", "Use inheritance, composition, and aggregation only when their semantics are intentional."],
    pitfalls: ["Avoid turning the diagram into a complete code listing; show only details needed by its audience."],
    resources: [mermaid("classDiagram"), uml],
  },
  er: {
    purpose: "Model data entities, their attributes, and cardinality-based relationships.",
    tips: ["Use singular entity names and state cardinality at both ends of every relationship.", "Resolve many-to-many relationships with an associative entity when designing a relational schema."],
    pitfalls: ["Do not mix logical business entities with physical table details unless the diagram is explicitly a physical model."],
    resources: [mermaid("entityRelationshipDiagram"), guide("IBM entity-relationship diagram guide", "https://www.ibm.com/think/topics/entity-relationship-diagram", "Method guide")],
  },
  requirement: {
    purpose: "Trace requirements to related requirements, system elements, verification, and satisfaction relationships.",
    tips: ["Give every requirement a stable identifier and testable statement.", "Show derivation, satisfaction, and verification links deliberately rather than using generic relationships."],
    pitfalls: ["Avoid vague, compound requirements that cannot be verified independently."],
    resources: [mermaid("requirementDiagram"), sysml],
  },
  c4: {
    purpose: "Communicate software architecture at a chosen level: context, container, component, dynamic, or deployment.",
    tips: ["Choose one abstraction level and state it clearly in the title.", "Give every element a type, short description, and meaningful relationship label."],
    pitfalls: ["Do not mix context, container, and component detail on the same diagram."],
    resources: [mermaid("c4"), c4, guide("C4 diagram review checklist", "https://c4model.com/diagrams/checklist", "Method guide")],
  },
  mindmap: {
    purpose: "Explore or communicate a topic as a hierarchy radiating from a central idea.",
    tips: ["Use short phrases and one concept per branch.", "Keep sibling branches at a similar level of abstraction."],
    pitfalls: ["Avoid long sentences and cross-links that obscure the hierarchy."],
    resources: [mermaid("mindmap"), guide("Tony Buzan mind-mapping method", "https://www.tonybuzan.com/about/mind-mapping/", "Method guide")],
  },
  block: {
    purpose: "Arrange system blocks and connections with explicit control over columns and composition.",
    tips: ["Use blocks for stable system parts and label connectors by what they carry or mean.", "Group related blocks and keep the decomposition level consistent."],
    pitfalls: ["Avoid treating spatial proximity as a relationship; connect or group elements explicitly."],
    resources: [mermaid("block"), sysml],
  },
  architecture: {
    purpose: "Show services, resources, groups, and the directional connections in a technical architecture.",
    tips: ["Name services by responsibility and resources by the capability they provide.", "Use groups for trust boundaries, deployment zones, or owned subsystems."],
    pitfalls: ["Avoid mixing conceptual architecture and deployment topology without clear boundaries."],
    resources: [mermaid("architecture"), c4],
  },
  wardley: {
    purpose: "Map a value chain against component evolution to support strategic situational awareness.",
    tips: ["Start from a clear user need and trace dependencies downward.", "Position evolution independently from visibility; challenge both axes with stakeholders."],
    pitfalls: ["A Wardley map is not a project timeline or a conventional architecture diagram."],
    resources: [mermaid("wardley"), guide("Learn Wardley Mapping", "https://learnwardleymapping.com/", "Method guide")],
  },
  treeView: {
    purpose: "Represent nested files, categories, or other parent-child hierarchies as an expandable tree.",
    tips: ["Use concise sibling labels and a single, obvious root.", "Order children predictably and keep indentation consistent."],
    pitfalls: ["Do not use a tree when an item can naturally have multiple parents; use a graph instead."],
    resources: [mermaid("treeView"), guide("WAI-ARIA tree view pattern", "https://www.w3.org/WAI/ARIA/apg/patterns/treeview/", "Standard")],
  },
  swimlane: {
    purpose: "Show a process while making responsibility, role, or system boundaries explicit through lanes.",
    tips: ["Define lanes by accountable role or system, not by individual task.", "Keep the primary flow in one direction and label every handoff."],
    pitfalls: ["Too many lanes hide the process; combine roles that have the same responsibility."],
    resources: [mermaid("swimlanes"), asqFlowchart],
  },
  sequence: {
    purpose: "Show time-ordered messages exchanged between participants in an interaction or scenario.",
    tips: ["Keep time flowing top to bottom and name messages as actions.", "Use activation, alternatives, loops, and notes only where they clarify the scenario."],
    pitfalls: ["Avoid combining many unrelated scenarios; create one diagram per coherent interaction."],
    resources: [mermaid("sequenceDiagram"), uml],
  },
  journey: {
    purpose: "Describe a person's experience across stages, including tasks, actors, and satisfaction scores.",
    tips: ["Anchor the journey to one persona, goal, and scenario.", "Base stages and scores on research, then highlight pain points and opportunities."],
    pitfalls: ["Do not present an assumed internal process as if it were a researched user journey."],
    resources: [mermaid("userJourney"), guide("Nielsen Norman Group: Journey Mapping 101", "https://www.nngroup.com/articles/journey-mapping-101/", "Method guide")],
  },
  gantt: {
    purpose: "Plan and communicate tasks, durations, dependencies, milestones, and project timing.",
    tips: ["Use dependencies to express sequencing and milestones for decision points.", "Keep task granularity consistent and update dates as the plan changes."],
    pitfalls: ["Avoid false precision and unreadable plans with hundreds of tiny tasks."],
    resources: [mermaid("gantt"), guide("Atlassian Gantt chart guide", "https://www.atlassian.com/agile/project-management/gantt-chart", "Method guide")],
  },
  gitGraph: {
    purpose: "Explain commits, branches, merges, and release history in a Git workflow.",
    tips: ["Show only commits that matter to the story being told.", "Use branch names and tags that match the real repository conventions."],
    pitfalls: ["Do not mistake a simplified Git graph for a complete or live repository history."],
    resources: [mermaid("gitgraph"), guide("Pro Git: Branching", "https://git-scm.com/book/en/v2/Git-Branching-Branches-in-a-Nutshell", "Method guide")],
  },
  timeline: {
    purpose: "Present dated or ordered events as a concise chronological narrative.",
    tips: ["Choose a consistent time scale and include only events relevant to the message.", "Use sections to separate eras, workstreams, or themes."],
    pitfalls: ["Avoid uneven granularity that visually equates a day with a decade without explanation."],
    resources: [mermaid("timeline"), datawrapper],
  },
  zenuml: {
    purpose: "Write sequence-style interactions using a code-like syntax with nesting and method calls.",
    tips: ["Use meaningful participant and method names.", "Keep nesting shallow enough that the interaction remains scannable."],
    pitfalls: ["Avoid implementation detail that does not help explain the interaction contract."],
    resources: [mermaid("zenuml"), uml],
  },
  packet: {
    purpose: "Lay out bit fields in a protocol packet, register, or binary data structure.",
    tips: ["Use exact inclusive bit ranges and label reserved fields explicitly.", "Keep field boundaries aligned to the protocol specification."],
    pitfalls: ["Overlapping or missing bit ranges make the visual misleading even when the syntax renders."],
    resources: [mermaid("packet"), guide("IETF RFC 8200 packet format examples", "https://www.rfc-editor.org/rfc/rfc8200.html", "Standard")],
  },
  kanban: {
    purpose: "Visualise work items moving through a pull-based workflow.",
    tips: ["Make workflow policies and work-in-progress limits explicit.", "Design columns around real states of work, not departments."],
    pitfalls: ["A board without flow policies or WIP control is only a task list."],
    resources: [mermaid("kanban"), guide("The Kanban Guide", "https://kanbanguides.org/", "Method guide")],
  },
  eventmodeling: {
    purpose: "Describe how information changes over time using events, commands, views, and automation.",
    tips: ["Begin with a plausible chronological story of state-changing events.", "Trace information from user intent through events to the views users need."],
    pitfalls: ["Do not label observations or read-only actions as state-changing events."],
    resources: [mermaid("eventmodeling"), guide("Event Modelling method", "https://eventmodeling.org/posts/what-is-event-modeling/", "Method guide")],
  },
  railroad: {
    purpose: "Explain a grammar or valid token sequence as paths through a railroad diagram.",
    tips: ["Keep productions small and link complex non-terminals to separate diagrams.", "Use repetition and alternatives consistently with the grammar source."],
    pitfalls: ["Do not let the visual grammar diverge from the parser's normative grammar."],
    resources: [mermaid("railroad"), guide("W3C EBNF notation", "https://www.w3.org/TR/xml/#sec-notation", "Standard")],
  },
  railroadEbnf: {
    purpose: "Visualise grammar productions written in Extended Backus–Naur Form.",
    tips: ["Define one production per statement and keep terminals visually distinct.", "Factor repeated or deeply nested expressions into named non-terminals."],
    pitfalls: ["EBNF dialects vary; document the exact operators accepted by the target parser."],
    resources: [mermaid("railroad"), guide("W3C EBNF notation", "https://www.w3.org/TR/xml/#sec-notation", "Standard")],
  },
  railroadAbnf: {
    purpose: "Visualise protocol or language grammar written in Augmented Backus–Naur Form.",
    tips: ["Preserve ABNF core-rule meanings and numeric terminal notation.", "Keep rule names and incremental alternatives consistent with the source specification."],
    pitfalls: ["ABNF is case-insensitive for rule names; avoid implying otherwise through inconsistent styling."],
    resources: [mermaid("railroad"), guide("RFC 5234: ABNF", "https://www.rfc-editor.org/rfc/rfc5234.html", "Standard")],
  },
  railroadPeg: {
    purpose: "Visualise parsing expression grammar rules with ordered choice and repetition.",
    tips: ["Remember that alternatives are ordered, not symmetric.", "Name reusable expressions and keep lookahead predicates explicit."],
    pitfalls: ["Reordering PEG alternatives can change the recognised language."],
    resources: [mermaid("railroad"), guide("Parsing Expression Grammars paper", "https://bford.info/pub/lang/peg.pdf", "Method guide")],
  },
  pie: {
    purpose: "Show a small number of categories as proportions of one meaningful whole.",
    tips: ["Use few slices, order them deliberately, and show values or percentages.", "Ensure every category uses the same denominator and the whole is meaningful."],
    pitfalls: ["Use a bar chart when values are close, numerous, negative, or do not sum to a whole."],
    resources: [mermaid("pie"), datawrapper],
  },
  quadrantChart: {
    purpose: "Position items against two independent dimensions to support comparison or prioritisation.",
    tips: ["Define both axes precisely and use a consistent scoring method.", "Treat quadrant boundaries as decision aids, not objective truths."],
    pitfalls: ["Do not use correlated or ambiguous axes; placement will look precise without being meaningful."],
    resources: [mermaid("quadrantChart"), guide("Atlassian prioritisation matrix guide", "https://www.atlassian.com/team-playbook/plays/prioritization-matrix", "Method guide")],
  },
  sankey: {
    purpose: "Show how quantities flow between stages, with link width proportional to magnitude.",
    tips: ["Use consistent units and preserve flow totals where the system is conservative.", "Order nodes to minimise crossings and make the dominant paths easy to follow."],
    pitfalls: ["Do not compare link widths that use different units or unexplained losses."],
    resources: [mermaid("sankey"), datawrapper],
  },
  xychart: {
    purpose: "Compare numeric or categorical values with bars or show trends with lines on shared axes.",
    tips: ["Label axes and units, and choose bounds that do not distort the comparison.", "Use lines for ordered trends and bars for discrete comparisons."],
    pitfalls: ["Avoid truncated bar-chart axes and mixing series with incompatible scales."],
    resources: [mermaid("xychart"), datawrapper],
  },
  radar: {
    purpose: "Compare several profiles across the same set of normalised dimensions.",
    tips: ["Use the same scale and direction for every axis.", "Limit the number of dimensions and series, and show underlying values where possible."],
    pitfalls: ["Area can exaggerate differences; use a table or bars when precise comparison matters."],
    resources: [mermaid("radar"), guide("Datawrapper radar chart cautions", "https://www.datawrapper.de/blog/radar-chart-personalities", "Best practice")],
  },
  treemap: {
    purpose: "Show part-to-whole values in a hierarchy using nested rectangle areas.",
    tips: ["Size every leaf with the same metric and use colour for a separate, clearly explained variable.", "Keep hierarchy shallow and label the largest or most important areas directly."],
    pitfalls: ["Small area differences are hard to compare; use bars when ranking accuracy matters."],
    resources: [mermaid("treemap"), datawrapper],
  },
  venn: {
    purpose: "Show logical overlap and exclusivity among a small number of sets.",
    tips: ["Define each set clearly and label every meaningful intersection.", "Use two or three sets unless the relationships remain exceptionally simple."],
    pitfalls: ["Do not imply quantitative area accuracy unless the layout is explicitly proportional."],
    resources: [mermaid("venn"), guide("AMSI sets and Venn diagrams guide", "https://amsi.org.au/teacher_modules/pdfs/Sets_and_venn_diagrams.pdf", "Method guide")],
  },
  ishikawa: {
    purpose: "Organise potential causes of a defined effect for root-cause exploration.",
    tips: ["Write one specific effect at the head and brainstorm cause categories with the people doing the work.", "Drill from symptoms towards controllable contributing causes and validate them with evidence."],
    pitfalls: ["The diagram generates hypotheses; it does not prove which cause is responsible."],
    resources: [mermaid("ishikawa"), guide("ASQ fishbone diagram guidance", "https://asq.org/quality-resources/fishbone", "Method guide")],
  },
  cynefin: {
    purpose: "Classify situations by the nature of cause and effect so the response matches the context.",
    tips: ["Classify the situation collaboratively before choosing an intervention.", "Treat domains as contexts for action, not permanent labels for teams or people."],
    pitfalls: ["Do not reduce complex situations to best-practice checklists or confuse complicated with complex."],
    resources: [mermaid("cynefin"), guide("The Cynefin Framework", "https://thecynefin.co/about-us/about-cynefin-framework/", "Method guide")],
  },
};

export function helpForDiagram(id: string): MermaidHelpContent {
  return MERMAID_HELP[id] || MERMAID_HELP.flowchart;
}
