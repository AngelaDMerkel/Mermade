import type { MermaidLayout } from "../mermaid-style";
import { readDiagramStyle } from "../mermaid-style";
import { requireFlowchartSource } from "../mermaid-source";
import type { SupportedMermaidVersion } from "./diagram-types";
import { createSerialTaskQueue } from "./serial-task-queue";

type MermaidEngine = typeof import("mermaid").default | typeof import("mermaid-v10").default;

const mermaidFeaturePromises = new WeakMap<object, Map<string, Promise<void>>>();

async function ensureMermaidFeature(mermaid: MermaidEngine, feature: string, setup: () => Promise<void>) {
  let features = mermaidFeaturePromises.get(mermaid);
  if (!features) {
    features = new Map();
    mermaidFeaturePromises.set(mermaid, features);
  }
  let pending = features.get(feature);
  if (!pending) {
    pending = setup();
    features.set(feature, pending);
  }
  try {
    await pending;
  } catch (error) {
    features.delete(feature);
    throw error;
  }
}

async function loadMermaid(version: SupportedMermaidVersion, layout?: MermaidLayout) {
  const mermaid = version === "10.9.6" ? (await import("mermaid-v10")).default : (await import("mermaid")).default;
  if (version !== "10.9.6" && (layout === "elk" || layout === "tidy-tree")) {
    await ensureMermaidFeature(mermaid, layout, async () => {
      const definitions = layout === "elk"
        ? (await import("@mermaid-js/layout-elk")).default
        : (await import("@mermaid-js/layout-tidy-tree")).default;
      (mermaid as typeof import("mermaid").default).registerLayoutLoaders(definitions);
    });
  }
  return mermaid;
}

// Mermaid engines expose mutable singleton configuration. Its internal render
// queue does not cover our initialize calls, so initialise and execute together.
const run = createSerialTaskQueue();

type RenderOptions = {
  version: SupportedMermaidVersion;
  id: string;
  source: string;
  renderProfileClass?: string;
  renderWidth?: number;
};

export function renderMermaidSvg({ version, id, source, renderProfileClass = "", renderWidth = 1200 }: RenderOptions) {
  return run(async () => {
    requireFlowchartSource(source);
    const mermaid = await loadMermaid(version, readDiagramStyle(source).layout);
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      flowchart: { htmlLabels: true, curve: "basis", useMaxWidth: false },
    });
    // A non-React, attached container is required for live DOM measurements.
    const renderContainer = document.createElement("div");
    renderContainer.className = renderProfileClass;
    renderContainer.style.cssText = `position:fixed;left:-100000px;top:0;width:${renderWidth}px;visibility:hidden;pointer-events:none`;
    document.body.appendChild(renderContainer);
    try {
      return await mermaid.render(id, source, renderContainer);
    } finally {
      renderContainer.remove();
    }
  });
}

export function validateSource(candidate: string, version: SupportedMermaidVersion): Promise<string> {
  return run(async () => {
    try {
      requireFlowchartSource(candidate);
      const mermaid = await loadMermaid(version, readDiagramStyle(candidate).layout);
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
      await mermaid.parse(candidate);
      return "";
    } catch (error) {
      return error instanceof Error ? error.message : "Mermaid rejected this source";
    }
  });
}
