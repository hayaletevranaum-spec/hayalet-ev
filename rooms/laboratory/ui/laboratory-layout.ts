import { escapeHtml } from "../domain/lab-types.js";
import type { LabDrawerMode, LabPipelineBlock } from "../domain/lab-types.js";

function getPipelineDebugShell() {
  if (typeof globalThis.document === "undefined") {
    return null;
  }
  const querySelector = globalThis.document.querySelector;
  if (typeof querySelector !== "function") {
    return null;
  }
  return globalThis.document.querySelector('.labx-shell[data-lab-debug-regions="true"]');
}

function debugPipelineBlock(mode: LabDrawerMode, block: LabPipelineBlock, index: number) {
  if (
    getPipelineDebugShell() === null ||
    typeof console === "undefined" ||
    typeof console.info !== "function"
  ) {
    return;
  }
  console.info(`[lab][pipeline] ${mode} -> ${block.id} (#${String(index)})`, {
    blockId: block.id,
    index,
    mode,
    type: block.type,
  });
}

export function renderLaboratoryLayout(input: {
  bootOverlay?: string;
  contextPanel?: string;
  inspectorPanel?: string;
  leftRail?: string;
  mainStage: string;
  processStrip?: string;
  shellAttributes: string;
  topBar?: string;
}) {
  return `
    <div class="labx-shell" data-lab-layout-container="laboratory-layout" ${input.shellAttributes}>
      ${input.topBar ?? ""}
      ${input.leftRail ?? ""}
      ${input.mainStage}
      ${input.contextPanel ?? ""}
      ${input.inspectorPanel ?? ""}
      ${input.processStrip ?? ""}
      ${input.bootOverlay ?? ""}
    </div>
  `;
}

export function renderMainStage(content: string) {
  return `<main class="labx-center-panel labx-main-stage" data-lab-region="main-stage">${content}</main>`;
}

export function renderPreviewArea(input: { content: string; focusClassName: string }) {
  const focusClassName =
    input.focusClassName.trim() !== "" ? ` ${escapeHtml(input.focusClassName.trim())}` : "";
  return `
    <div class="labx-workspace-preview labx-preview-area${focusClassName}" id="lab-workspace-preview" data-lab-region="preview-area">
      ${input.content}
    </div>
  `;
}

export function renderTimelineArea(timelineMarkup = "") {
  if (timelineMarkup.trim() !== "") {
    return timelineMarkup;
  }
  return `
    <div class="labx-timeline labx-timeline-area labx-timeline-area--empty" id="lab-timeline" data-lab-region="timeline-area" data-duration="0" data-waveform-mode="source-audio" data-timeline-locked="true" data-timeline-empty="true" hidden aria-hidden="true"></div>
  `;
}

export function renderPipeline(blocks: LabPipelineBlock[], mode: LabDrawerMode) {
  let renderedIndex = 0;
  return blocks
    .flatMap(function (block) {
      if (block.visible && !block.visible()) {
        return [];
      }
      const content = block.render();
      if (content.trim() === "") {
        return [];
      }
      const currentIndex = renderedIndex;
      renderedIndex += 1;
      debugPipelineBlock(mode, block, currentIndex);
      return [
        `
          <div class="labx-pipeline-block" data-block-id="${escapeHtml(block.id)}" data-block-type="${escapeHtml(block.type)}" data-block-mode="${escapeHtml(mode)}">
            ${content}
          </div>
        `,
      ];
    })
    .join("");
}

export function renderContextPanel(input: {
  content: string;
  drawerMode: LabDrawerMode;
  empty?: boolean;
  hidden?: boolean;
}) {
  const hiddenAttributes = input.hidden === true ? ' hidden aria-hidden="true"' : "";
  const empty = input.empty === true || input.content.trim() === "" ? "true" : "false";
  return `
    <aside class="labx-drawer labx-context-panel" data-lab-region="context-panel" data-drawer-mode="${escapeHtml(input.drawerMode)}" data-empty="${empty}"${hiddenAttributes}>
      ${input.content}
    </aside>
  `;
}

export function renderInspectorPanel(input: {
  activeTab: string;
  ariaLabel: string;
  content: string;
  empty?: boolean;
  focusClassName: string;
  hidden?: boolean;
  open: boolean;
}) {
  const focusClassName =
    input.focusClassName.trim() !== "" ? ` ${escapeHtml(input.focusClassName.trim())}` : "";
  const hiddenAttributes = input.hidden === true ? ' hidden aria-hidden="true"' : "";
  const empty = input.empty === true || input.content.trim() === "" ? "true" : "false";
  return `
    <aside
      class="labx-workspace-inspector labx-inspector-panel${focusClassName}"
      data-lab-region="inspector-panel"
      data-lab-workspace-inspector="true"
      data-empty="${empty}"
      data-open="${input.open ? "true" : "false"}"
      data-active-tab="${escapeHtml(input.activeTab)}"
      aria-label="${escapeHtml(input.ariaLabel)}"
      ${hiddenAttributes}
    >
      ${input.content}
    </aside>
  `;
}
