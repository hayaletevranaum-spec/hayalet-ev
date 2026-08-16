import { ensureLabFaceLandmarkRuntimeBound } from "./lab-face-landmark-runtime.js";
import {
  createLabImageComparisonAnnotationOverlayDataUrl,
  ensureLabImageComparisonDrawingBound,
  syncLabImageComparisonDrawingUi,
} from "./lab-image-comparison-drawing.js";

type LabImageComparisonToolbarTool = "move" | "resize" | "zoom" | "face-landmarks" | "draw";

type ToolConfig = {
  id: LabImageComparisonToolbarTool;
  label: string;
  svg: string;
};

const TOOL_CONFIGS: readonly ToolConfig[] = [
  {
    id: "move",
    label: "Taşı",
    svg: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v20"/><path d="M2 12h20"/><path d="m12 2-3 3"/><path d="m12 2 3 3"/><path d="m12 22-3-3"/><path d="m12 22 3-3"/><path d="m2 12 3-3"/><path d="m2 12 3 3"/><path d="m22 12-3-3"/><path d="m22 12 3 3"/></svg>`,
  },
  {
    id: "resize",
    label: "Boyutlandır",
    svg: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H3v5"/><path d="M16 21h5v-5"/><path d="M3 8l6-6"/><path d="m21 16-6 6"/><path d="M14 3h7v7"/><path d="M10 21H3v-7"/></svg>`,
  },
  {
    id: "zoom",
    label: "Yakınlaştır",
    svg: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/><path d="M11 8v6"/><path d="M8 11h6"/></svg>`,
  },
  {
    id: "face-landmarks",
    label: "Yüz Landmark",
    svg: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H6a3 3 0 0 0-3 3v2"/><path d="M16 3h2a3 3 0 0 1 3 3v2"/><path d="M8 21H6a3 3 0 0 1-3-3v-2"/><path d="M16 21h2a3 3 0 0 0 3-3v-2"/><circle cx="9" cy="10" r="1"/><circle cx="15" cy="10" r="1"/><circle cx="12" cy="13" r="1"/><path d="M9 16c1.8 1.2 4.2 1.2 6 0"/></svg>`,
  },
  {
    id: "draw",
    label: "Çizim",
    svg: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z"/><path d="m13.5 8 3 3"/><path d="M4 20h6"/></svg>`,
  },
];

const COMPARISON_EXPORT_SELECTOR = '[data-lab-comparison-export="side-by-side"]';
const SINGLE_IMAGE_STAGE_SELECTOR = '[data-lab-preview-inspection-topology="single-image"]';
const WORKSPACE_TIMELINE_SELECTOR = ".labx-media-workbench > .labx-timeline";
const QUICK_EXPORT_FLAG_FIELD = "operationSettings.image-comparison.drawingQuickExport";
const QUICK_EXPORT_OVERLAY_FIELD = "operationSettings.image-comparison.annotationOverlayDataUrl";

let activeTool: LabImageComparisonToolbarTool | null = null;
let bound = false;
let forwardingBaseSlotClick = false;
let syncQueued = false;
let comparisonObserver: MutationObserver | null = null;
const singleImageSuppressedTimelines = new WeakSet<HTMLElement>();

function getToolConfig(tool: LabImageComparisonToolbarTool) {
  const config = TOOL_CONFIGS.find(function (candidate) {
    return candidate.id === tool;
  });
  if (!config) {
    throw new Error(`Unknown lab image comparison tool: ${tool}`);
  }
  return config;
}

function getBaseComparisonButton() {
  return document.querySelector<HTMLButtonElement>(
    '.labx-icon-rail__btn[data-lab-value="image-comparison"]'
  );
}

function getComparisonPopover() {
  return document.querySelector<HTMLElement>(
    '.labx-icon-rail-popover[data-slot="image-comparison"]'
  );
}

function createToolButton(config: ToolConfig) {
  const button = document.createElement("button");
  button.className = "labx-icon-rail__btn labx-image-comparison-toolbar__btn";
  button.type = "button";
  button.dataset["labComparisonToolbarTool"] = config.id;
  button.dataset["active"] = "false";
  button.setAttribute("aria-label", config.label);
  button.title = config.label;
  button.innerHTML = config.svg;
  return button;
}

function createComparisonExportButton() {
  const button = document.createElement("button");
  button.className =
    "labx-icon-rail__btn labx-image-comparison-toolbar__btn labx-image-comparison-toolbar__btn--export";
  button.type = "button";
  button.dataset["labAction"] = "workspace-comparison-moment-capture";
  button.dataset["labComparisonExport"] = "side-by-side";
  button.dataset["active"] = "false";
  button.setAttribute("aria-label", "Yan Yana Dışa Aktar");
  button.title = "Yan Yana Dışa Aktar";
  button.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/><rect x="3" y="4" width="5" height="5" rx="1"/><rect x="16" y="4" width="5" height="5" rx="1"/></svg>`;
  return button;
}

function ensureQuickExportStateFields(group: HTMLElement) {
  let flag = group.querySelector<HTMLInputElement>(`[data-lab-field="${QUICK_EXPORT_FLAG_FIELD}"]`);
  if (flag === null) {
    flag = document.createElement("input");
    flag.type = "checkbox";
    flag.hidden = true;
    flag.dataset["labField"] = QUICK_EXPORT_FLAG_FIELD;
    group.append(flag);
  }
  let overlay = group.querySelector<HTMLInputElement>(
    `[data-lab-field="${QUICK_EXPORT_OVERLAY_FIELD}"]`
  );
  if (overlay === null) {
    overlay = document.createElement("input");
    overlay.type = "hidden";
    overlay.dataset["labField"] = QUICK_EXPORT_OVERLAY_FIELD;
    group.append(overlay);
  }
  return { flag, overlay };
}

function setQuickExportState(group: HTMLElement, active: boolean, overlayDataUrl: string) {
  const fields = ensureQuickExportStateFields(group);
  fields.flag.checked = active;
  fields.flag.dispatchEvent(new Event("input", { bubbles: true }));
  fields.overlay.value = overlayDataUrl;
  fields.overlay.dispatchEvent(new Event("input", { bubbles: true }));
}

function prepareComparisonExport(button: HTMLElement) {
  const group = button.parentElement;
  if (group === null) {
    return;
  }
  const overlayDataUrl = createLabImageComparisonAnnotationOverlayDataUrl() || "";
  setQuickExportState(group, true, overlayDataUrl);
  queueMicrotask(function () {
    if (group.isConnected) {
      setQuickExportState(group, false, "");
    }
  });
}

function removeToolbarButtons() {
  document
    .querySelectorAll<HTMLElement>(
      `[data-lab-comparison-toolbar-tool], ${COMPARISON_EXPORT_SELECTOR}`
    )
    .forEach(function (button) {
      button.remove();
    });
}

function ensureToolButtons(baseButton: HTMLButtonElement) {
  const group = baseButton.parentElement;
  if (group === null) {
    return;
  }
  ensureQuickExportStateFields(group);
  let anchor: Element = baseButton;
  TOOL_CONFIGS.forEach(function (config) {
    let button = group.querySelector<HTMLButtonElement>(
      `[data-lab-comparison-toolbar-tool="${config.id}"]`
    );
    if (button === null) {
      button = createToolButton(config);
      anchor.insertAdjacentElement("afterend", button);
    } else if (button.previousElementSibling !== anchor) {
      anchor.insertAdjacentElement("afterend", button);
    }
    button.dataset["active"] = activeTool === config.id ? "true" : "false";
    anchor = button;
  });

  let exportButton = group.querySelector<HTMLButtonElement>(COMPARISON_EXPORT_SELECTOR);
  if (exportButton === null) {
    exportButton = createComparisonExportButton();
    anchor.insertAdjacentElement("afterend", exportButton);
  } else if (exportButton.previousElementSibling !== anchor) {
    anchor.insertAdjacentElement("afterend", exportButton);
  }
}

function syncSingleImageTimelineVisibility() {
  const timeline = document.querySelector<HTMLElement>(WORKSPACE_TIMELINE_SELECTOR);
  if (timeline === null) {
    return;
  }
  const singleImageActive = document.querySelector(SINGLE_IMAGE_STAGE_SELECTOR) !== null;
  if (singleImageActive) {
    singleImageSuppressedTimelines.add(timeline);
    if (!timeline.hidden) {
      timeline.hidden = true;
    }
    if (timeline.getAttribute("aria-hidden") !== "true") {
      timeline.setAttribute("aria-hidden", "true");
    }
    return;
  }
  if (!singleImageSuppressedTimelines.has(timeline)) {
    return;
  }
  singleImageSuppressedTimelines.delete(timeline);
  const naturallyHidden =
    timeline.dataset["timelineEmpty"] === "true" ||
    timeline.classList.contains("labx-timeline-area--empty");
  timeline.hidden = naturallyHidden;
  if (naturallyHidden) {
    timeline.setAttribute("aria-hidden", "true");
  } else {
    timeline.removeAttribute("aria-hidden");
  }
}

function syncPopoverPresentation(baseButton: HTMLButtonElement) {
  const popover = getComparisonPopover();
  if (activeTool === null) {
    baseButton.dataset["active"] =
      popover === null ? baseButton.dataset["active"] || "false" : "true";
    popover?.removeAttribute("data-comparison-tool");
    return;
  }
  baseButton.dataset["active"] = "false";
  if (popover === null) {
    return;
  }
  popover.dataset["comparisonTool"] = activeTool;
  const title = popover.querySelector<HTMLElement>(".labx-icon-rail-popover__title");
  const nextTitle = getToolConfig(activeTool).label;
  if (title !== null && title.textContent !== nextTitle) {
    title.textContent = nextTitle;
  }
}

function syncToolbar() {
  syncQueued = false;
  // NOTE: sync writes its own DOM (toolbar buttons, drawing panel, overlays); discard those
  // records so the document-wide MutationObserver does not re-enter an endless sync loop.
  try {
    syncSingleImageTimelineVisibility();
    const baseButton = getBaseComparisonButton();
    if (baseButton === null || baseButton.disabled || baseButton.dataset["disabled"] === "true") {
      removeToolbarButtons();
      activeTool = null;
      syncLabImageComparisonDrawingUi(false);
      return;
    }
    ensureToolButtons(baseButton);
    syncPopoverPresentation(baseButton);
    syncLabImageComparisonDrawingUi(activeTool === "draw");
  } finally {
    comparisonObserver?.takeRecords();
  }
}

function queueSync() {
  if (syncQueued || typeof queueMicrotask !== "function") {
    if (!syncQueued) {
      syncToolbar();
    }
    return;
  }
  syncQueued = true;
  queueMicrotask(syncToolbar);
}

function isToolbarTool(value: string | undefined): value is LabImageComparisonToolbarTool {
  return (
    value === "move" ||
    value === "resize" ||
    value === "zoom" ||
    value === "face-landmarks" ||
    value === "draw"
  );
}

function openTool(tool: LabImageComparisonToolbarTool, event: Event) {
  event.preventDefault();
  event.stopImmediatePropagation();
  activeTool = tool;
  const baseButton = getBaseComparisonButton();
  const comparisonPopoverAlreadyOpen = getComparisonPopover() !== null;
  if (baseButton !== null && !comparisonPopoverAlreadyOpen) {
    forwardingBaseSlotClick = true;
    baseButton.click();
    forwardingBaseSlotClick = false;
    activeTool = tool;
  }
  queueSync();
}

function handleClick(event: Event) {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  const toolButton = target.closest<HTMLElement>("[data-lab-comparison-toolbar-tool]");
  if (toolButton !== null) {
    const tool = toolButton.dataset["labComparisonToolbarTool"];
    if (isToolbarTool(tool)) {
      openTool(tool, event);
    }
    return;
  }
  const exportButton = target.closest<HTMLElement>(COMPARISON_EXPORT_SELECTOR);
  if (exportButton !== null) {
    prepareComparisonExport(exportButton);
    activeTool = null;
    queueSync();
    return;
  }
  if (forwardingBaseSlotClick) {
    return;
  }
  const railButton = target.closest<HTMLElement>(".labx-icon-rail__btn");
  const closeButton = target.closest<HTMLElement>(".labx-icon-rail-popover__close");
  if (railButton !== null || closeButton !== null) {
    activeTool = null;
    queueSync();
  }
}

export function getActiveLabImageComparisonToolbarTool(): LabImageComparisonToolbarTool | null {
  return activeTool;
}

export function ensureLabImageComparisonToolbarBound() {
  if (bound || typeof document === "undefined" || typeof MutationObserver === "undefined") {
    return;
  }
  bound = true;
  ensureLabFaceLandmarkRuntimeBound();
  ensureLabImageComparisonDrawingBound();
  document.addEventListener("click", handleClick, true);
  comparisonObserver = new MutationObserver(queueSync);
  comparisonObserver.observe(document.documentElement, {
    attributeFilter: ["data-lab-preview-inspection-topology", "hidden"],
    attributes: true,
    childList: true,
    subtree: true,
  });
  queueSync();
}
