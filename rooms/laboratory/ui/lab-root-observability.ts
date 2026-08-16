import type { LabDecisionSnapshot } from "../domain/lab-types.js";
import { createRenderedElement, updateRenderedElement } from "./lab-dom-sync.js";

export const LAB_REGION_SELECTORS = {
  contextPanel: ['[data-lab-region="context-panel"]', ".labx-drawer"],
  inspectorPanel: ['[data-lab-region="inspector-panel"]', ".labx-workspace-inspector"],
  leftRail: [
    '[data-lab-region="source-panel"]',
    '[data-lab-region="left-rail-source"]',
    '[data-lab-region="left-rail"]',
    ".labx-source-panel",
    ".labx-left-rail",
  ],
  mainStage: ['[data-lab-region="main-stage"]', ".labx-center-panel"],
  processStrip: ['[data-lab-region="process-strip"]', ".labx-process-strip"],
  topBar: ['[data-lab-region="topbar"]', '[data-lab-region="top-bar"]', ".labx-top-bar"],
} as const;

export const LAB_OVERLAY_SELECTORS = {
  report: "#lab-report-overlay-root",
  tools: ".labx-overlay-root:not(#lab-report-overlay-root)",
} as const;

export type LabRegionKey = keyof typeof LAB_REGION_SELECTORS;

export type LabRegionDescriptor = {
  key: LabRegionKey;
  preserveScroll?: boolean;
  render: () => string;
};

type LabRegionLifecycleEvent = "fallback" | "missing" | "mount" | "update";
type LabOverlayKey = keyof typeof LAB_OVERLAY_SELECTORS;

const LAB_REGION_DEBUG_NAMES: Record<LabRegionKey, string> = {
  contextPanel: "context-panel",
  inspectorPanel: "inspector",
  leftRail: "left-rail",
  mainStage: "main-stage",
  processStrip: "process-strip",
  topBar: "topbar",
};

const LAB_OVERLAY_DEBUG_NAMES: Record<LabOverlayKey, string> = {
  report: "report",
  tools: "tools",
};

const LAB_DEBUG_PANEL_SELECTOR = '[data-lab-debug-panel="true"]';

export function getRegionDebugName(key: LabRegionKey) {
  return LAB_REGION_DEBUG_NAMES[key];
}

function getOverlayDebugName(key: LabOverlayKey) {
  return LAB_OVERLAY_DEBUG_NAMES[key];
}

export function queryRegion(root: ParentNode, selectors: readonly string[]) {
  for (const selector of selectors) {
    const element = root.querySelector(selector);
    if (element instanceof HTMLElement) {
      return element;
    }
  }
  return null;
}

export function syncRegion(input: {
  debugShell?: Element | null;
  documentRef: Document;
  preserveScroll?: boolean;
  regionKey?: LabRegionKey;
  render: () => string;
  root: ParentNode;
  selectors: readonly string[];
}) {
  const currentElement = queryRegion(input.root, input.selectors);
  if (!currentElement) {
    if (input.regionKey) {
      debugLabRegionLifecycle(input.debugShell ?? null, input.regionKey, "missing", {
        selectors: input.selectors,
      });
    }
    return false;
  }
  const nextMarkup = input.render();
  if (nextMarkup.trim() === "") {
    currentElement.innerHTML = "";
    if (input.regionKey) {
      debugLabRegionLifecycle(input.debugShell ?? null, input.regionKey, "update", {
        empty: true,
        selectors: input.selectors,
      });
    }
    return true;
  }
  updateRenderedElement(
    input.documentRef,
    currentElement,
    nextMarkup,
    input.preserveScroll === true
  );
  if (input.regionKey) {
    debugLabRegionLifecycle(input.debugShell ?? null, input.regionKey, "update", {
      empty: false,
      selectors: input.selectors,
    });
  }
  return true;
}

export function shouldFallback(regionsFound: number) {
  return regionsFound < 3;
}

export function syncOverlayRoot(
  documentRef: Document,
  root: HTMLElement,
  overlayKey: LabOverlayKey,
  selector: string,
  render: () => string,
  debugShell?: Element | null
) {
  const nextMarkup = render();
  const currentElement = root.querySelector(selector);
  const nextElement = createRenderedElement(documentRef, nextMarkup);
  if (!currentElement) {
    debugLabOverlay(debugShell ?? null, overlayKey, "missing", { selector });
  }
  if (!nextElement) {
    debugLabOverlay(debugShell ?? null, overlayKey, "invalid", { selector });
  }
  if (currentElement instanceof HTMLElement) {
    updateRenderedElement(documentRef, currentElement, nextMarkup);
    return true;
  }
  if (nextElement instanceof HTMLElement) {
    root.appendChild(nextElement);
    return true;
  }
  return false;
}

export function isLabRegionDebugEnabled(shell: Element | null | undefined) {
  return shell?.getAttribute("data-lab-debug-regions") === "true";
}

export function debugConsole(message: string, payload: Record<string, unknown>) {
  if (typeof console === "undefined" || typeof console.info !== "function") {
    return;
  }
  console.info(message, payload);
}

export function debugLabRegionLifecycle(
  shell: Element | null | undefined,
  regionKey: LabRegionKey,
  event: LabRegionLifecycleEvent,
  detail: Record<string, unknown> = {}
) {
  if (isLabRegionDebugEnabled(shell) !== true) {
    return;
  }
  const region = getRegionDebugName(regionKey);
  const eventLabel = event === "mount" ? "mounted" : event === "update" ? "updated" : event;
  debugConsole(`[lab][region] ${region} -> ${eventLabel}`, {
    event,
    key: regionKey,
    region,
    ...detail,
  });
}

export function debugLabFallback(
  shell: Element | null | undefined,
  regionsFound: number,
  missingRegions: string[]
) {
  if (isLabRegionDebugEnabled(shell) !== true) {
    return;
  }
  debugConsole(`[lab][fallback] triggered -> regionsFound: ${String(regionsFound)}`, {
    missing: missingRegions,
    regionsFound,
  });
}

function debugLabOverlay(
  shell: Element | null | undefined,
  overlayKey: LabOverlayKey,
  event: "invalid" | "missing",
  detail: Record<string, unknown> = {}
) {
  if (isLabRegionDebugEnabled(shell) !== true) {
    return;
  }
  const overlay = getOverlayDebugName(overlayKey);
  debugConsole(`[lab][overlay] ${overlay} -> ${event}`, {
    event,
    overlay,
    ...detail,
  });
}

function readDebugPanelSnapshot(shell: Element, decisionSnapshot?: LabDecisionSnapshot | null) {
  const contextPanel = shell.querySelector('[data-lab-region="context-panel"], .labx-drawer');
  const pipelineBlockCount = shell.querySelectorAll(".labx-pipeline-block").length;
  const drawerMode =
    decisionSnapshot?.mode ?? contextPanel?.getAttribute("data-drawer-mode") ?? "unknown";
  return {
    activeBlockCount: decisionSnapshot?.activeBlocks.length ?? pipelineBlockCount,
    decisionIntent: decisionSnapshot?.intent ?? "idle",
    decisionState: decisionSnapshot?.state ?? "idle",
    drawerMode,
    pipelineBlockCount,
    regionCount: shell.querySelectorAll("[data-lab-region]").length,
  };
}

function renderLabDebugPanelMarkup(snapshot: ReturnType<typeof readDebugPanelSnapshot>) {
  return `
    <div
      class="labx-debug-panel"
      data-lab-debug-panel="true"
      data-region-count="${String(snapshot.regionCount)}"
      data-pipeline-block-count="${String(snapshot.pipelineBlockCount)}"
      data-active-block-count="${String(snapshot.activeBlockCount)}"
      data-drawer-mode="${snapshot.drawerMode}"
      data-decision-intent="${snapshot.decisionIntent}"
      data-decision-state="${snapshot.decisionState}"
      aria-hidden="true"
    >
      <span>mode ${snapshot.drawerMode}</span>
      <span>intent ${snapshot.decisionIntent}</span>
      <span>blocks ${String(snapshot.activeBlockCount)}</span>
      <span>state ${snapshot.decisionState}</span>
    </div>
  `;
}

export function syncLabDebugPanel(
  shell: HTMLElement | null | undefined,
  decisionSnapshot?: LabDecisionSnapshot | null
) {
  if (!shell) {
    return;
  }
  const panel = shell.querySelector<HTMLElement>(LAB_DEBUG_PANEL_SELECTOR);
  if (isLabRegionDebugEnabled(shell) !== true) {
    panel?.remove();
    return;
  }
  const snapshot = readDebugPanelSnapshot(shell, decisionSnapshot);
  const markup = renderLabDebugPanelMarkup(snapshot);
  if (panel) {
    panel.setAttribute("data-region-count", String(snapshot.regionCount));
    panel.setAttribute("data-pipeline-block-count", String(snapshot.pipelineBlockCount));
    panel.setAttribute("data-active-block-count", String(snapshot.activeBlockCount));
    panel.setAttribute("data-drawer-mode", snapshot.drawerMode);
    panel.setAttribute("data-decision-intent", snapshot.decisionIntent);
    panel.setAttribute("data-decision-state", snapshot.decisionState);
    panel.innerHTML = `
      <span>mode ${snapshot.drawerMode}</span>
      <span>intent ${snapshot.decisionIntent}</span>
      <span>blocks ${String(snapshot.activeBlockCount)}</span>
      <span>state ${snapshot.decisionState}</span>
    `;
    return;
  }
  shell.insertAdjacentHTML("beforeend", markup);
}

export const __testOnlyLabRootObservability = {
  debugLabFallback,
  debugLabOverlay,
  debugLabRegionLifecycle,
  isLabRegionDebugEnabled,
  queryRegion,
  shouldFallback,
  syncOverlayRoot,
  syncLabDebugPanel,
  syncRegion,
};
