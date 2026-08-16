import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readCssWithImports } from "./helpers/css-imports.ts";

function readLabThemeSource() {
  return readCssWithImports("rooms/laboratory/ui/lab-theme.css");
}

function readLabWaveformTimelineSource() {
  return [
    "rooms/laboratory/ui/lab-waveform-timeline-render.ts",
    "rooms/laboratory/ui/lab-waveform-timeline-panels.ts",
  ]
    .map(function (filePath) {
      return readFileSync(filePath, "utf8");
    })
    .join("\n");
}

class ElementStub {
  private innerHtmlValue = "";
  scrollTop = 0;
  dataset: Record<string, string> = {};
  classList = {
    add() {},
    remove() {},
    toggle() {},
  };

  get innerHTML(): string {
    return this.innerHtmlValue;
  }

  set innerHTML(value: string) {
    this.innerHtmlValue = value;
  }

  querySelector(_selector?: string): null {
    return null;
  }

  querySelectorAll(_selector?: string): [] {
    return [];
  }

  addEventListener(): void {}

  removeEventListener(): void {}

  replaceChildren(): void {}
}

class MountedRootElement extends ElementStub {
  layoutWrites: string[] = [];
  mountedQueriesEnabled = false;
  private mountedInnerHtmlValue = "";

  override get innerHTML(): string {
    return this.mountedInnerHtmlValue;
  }

  override set innerHTML(value: string) {
    this.layoutWrites.push(value);
    this.mountedInnerHtmlValue = value;
  }

  clearLayoutWrites(): void {
    this.layoutWrites = [];
  }

  setShellAttribute(name: string, value: string): void {
    const shellMatch = this.mountedInnerHtmlValue.match(/<div class="labx-shell"([^>]*)>/);
    if (!shellMatch) {
      return;
    }
    const shellTag = shellMatch[0];
    const attributePattern = new RegExp(`${name}="[^"]*"`);
    const nextTag = attributePattern.test(shellTag)
      ? shellTag.replace(attributePattern, `${name}="${value}"`)
      : shellTag.replace(/>$/, ` ${name}="${value}">`);
    this.mountedInnerHtmlValue = this.mountedInnerHtmlValue.replace(shellTag, nextTag);
  }

  override querySelector(selector?: string): null {
    if (this.mountedQueriesEnabled !== true) {
      return null;
    }
    if (selector === ".labx-shell" && this.innerHTML.includes('class="labx-shell"')) {
      return new MountedQueryElement(this, selector) as unknown as null;
    }
    return null;
  }
}

class MountedQueryElement extends ElementStub {
  constructor(
    private readonly root: MountedRootElement,
    private readonly selector: string
  ) {
    super();
  }

  getAttribute(name: string): string | null {
    if (this.selector !== ".labx-shell") {
      return null;
    }
    const shellMatch = this.root.innerHTML.match(/<div class="labx-shell"([^>]*)>/);
    const shellAttributes = shellMatch?.[1] ?? "";
    const attributeMatch = shellAttributes.match(new RegExp(`${name}="([^"]*)"`));
    return attributeMatch?.[1] ?? null;
  }

  removeAttribute(): void {}

  hasAttribute(name: string): boolean {
    return this.getAttribute(name) !== null;
  }

  getAttributeNames(): string[] {
    return [];
  }

  insertAdjacentHTML(_position: InsertPosition, html: string): void {
    this.root.innerHTML += html;
  }

  setAttribute(name: string, value: string): void {
    if (this.selector === ".labx-shell") {
      this.root.setShellAttribute(name, value);
    }
  }
}
void test("laboratory center workbench attaches media viewport and timeline as one surface", () => {
  const labTypesSource = readFileSync("rooms/laboratory/domain/lab-types.ts", "utf8");
  const workspaceSurfaceSource = readFileSync("rooms/laboratory/ui/workspace-surface.ts", "utf8");
  const workspaceSourceIntakeSource = readFileSync(
    "rooms/laboratory/ui/workspace-source-intake.ts",
    "utf8"
  );
  const laboratoryLayoutSource = readFileSync("rooms/laboratory/ui/laboratory-layout.ts", "utf8");
  const centerPanelSource = readFileSync("rooms/laboratory/ui/lab-center-panel.ts", "utf8");
  const topBarSource = readFileSync("rooms/laboratory/ui/lab-top-bar.ts", "utf8");
  const drawerSource = readFileSync("rooms/laboratory/ui/lab-drawer.ts", "utf8");
  const processStripSource = readFileSync("rooms/laboratory/ui/lab-process-strip.ts", "utf8");
  const timelineSource = readLabWaveformTimelineSource();
  const themeSource = readLabThemeSource();

  assert.match(labTypesSource, /export type LabPipelineBlock = \{/);
  assert.match(labTypesSource, /type: "section" \| "action" \| "status" \| "output";/);
  assert.match(laboratoryLayoutSource, /export function renderLaboratoryLayout/);
  assert.match(laboratoryLayoutSource, /export function renderMainStage/);
  assert.doesNotMatch(laboratoryLayoutSource, /export function renderLeftRail/);
  assert.match(laboratoryLayoutSource, /export function renderPreviewArea/);
  assert.match(laboratoryLayoutSource, /export function renderTimelineArea/);
  assert.match(laboratoryLayoutSource, /export function renderPipeline/);
  assert.match(laboratoryLayoutSource, /function getPipelineDebugShell\(/);
  assert.match(laboratoryLayoutSource, /\[lab\]\[pipeline\]/);
  assert.match(laboratoryLayoutSource, /data-block-id="\$\{escapeHtml\(block\.id\)\}"/);
  assert.match(laboratoryLayoutSource, /data-block-type="\$\{escapeHtml\(block\.type\)\}"/);
  assert.match(laboratoryLayoutSource, /data-block-mode="\$\{escapeHtml\(mode\)\}"/);
  assert.match(laboratoryLayoutSource, /export function renderContextPanel/);
  assert.match(laboratoryLayoutSource, /export function renderInspectorPanel/);
  assert.match(centerPanelSource, /renderMainStage\(surface\.main\)/);
  assert.match(
    laboratoryLayoutSource,
    /class="labx-center-panel labx-main-stage" data-lab-region="main-stage"/
  );
  assert.match(topBarSource, /class="labx-top-bar" data-lab-region="topbar"/);
  assert.match(topBarSource, /export function renderLabLeftRail/);
  assert.match(topBarSource, /class="labx-top-bar__center labx-top-bar__center--empty"/);
  assert.doesNotMatch(
    topBarSource,
    /class="labx-top-bar__center" data-lab-region="left-rail-source"/
  );
  assert.doesNotMatch(laboratoryLayoutSource, /data-lab-region="left-rail-source"/);
  assert.match(drawerSource, /renderContextPanel/);
  assert.match(drawerSource, /if \(collapsed\) \{[\s\S]*renderContextPanel\(\{[\s\S]*hidden: true/);
  assert.match(
    laboratoryLayoutSource,
    /class="labx-drawer labx-context-panel" data-lab-region="context-panel"/
  );
  assert.match(laboratoryLayoutSource, /data-empty="\$\{empty\}"/);
  assert.match(processStripSource, /data-lab-region="process-strip"/);
  assert.match(workspaceSurfaceSource, /class="labx-media-workbench"/);
  assert.match(workspaceSurfaceSource, /data-lab-region="main-stage-inner"/);
  assert.match(workspaceSurfaceSource, /renderPreviewArea\(/);
  assert.match(
    workspaceSurfaceSource,
    /renderTimelineArea\(durationMs > 0 && !comparisonPreviewActive \? renderLabWaveformTimeline\(timelineModel\) : ""\)/
  );
  assert.match(workspaceSurfaceSource, /renderInspectorPanel\(/);
  assert.match(
    workspaceSurfaceSource,
    /panels\.length === 0[\s\S]*renderInspectorPanel\(\{[\s\S]*empty: true,[\s\S]*hidden: true/
  );
  assert.match(laboratoryLayoutSource, /data-lab-region="preview-area"/);
  assert.match(laboratoryLayoutSource, /data-lab-region="inspector-panel"/);
  assert.match(laboratoryLayoutSource, /data-timeline-empty="true"/);
  assert.match(laboratoryLayoutSource, /hidden aria-hidden="true"/);
  assert.match(workspaceSurfaceSource, /class="labx-workspace-stage"/);
  assert.match(workspaceSurfaceSource, /renderWorkspaceInspectorDrawer/);
  assert.match(laboratoryLayoutSource, /data-lab-workspace-inspector="true"/);
  assert.match(workspaceSurfaceSource, /data-lab-action="workspace-controls-drawer-toggle"/);
  assert.match(workspaceSurfaceSource, /data-lab-action="workspace-controls-tab-select"/);
  assert.doesNotMatch(drawerSource, /renderDrawerWorkspaceControls/);
  assert.doesNotMatch(drawerSource, /data-lab-drawer-workspace-controls="true"/);
  assert.match(workspaceSurfaceSource, /data-lab-media-workbench="true"/);
  assert.doesNotMatch(laboratoryLayoutSource, /data-preview-mode/);
  assert.doesNotMatch(workspaceSurfaceSource, /data-preview-mode/);
  assert.match(workspaceSurfaceSource, /data-lab-workspace-comparison-stage="true"/);
  assert.match(
    workspaceSurfaceSource,
    /data-lab-workspace-comparison-stage="true"[\s\S]*data-lab-selection-roi-stage="true"/
  );
  assert.match(workspaceSurfaceSource, /renderMediaStage\("primary"/);
  assert.match(workspaceSurfaceSource, /renderMediaStage\("reference"/);
  assert.match(workspaceSurfaceSource, /renderComparisonOverlay\(side\)/);
  assert.match(workspaceSurfaceSource, /buildPreviewFilterState\(input\.settings\.primary/);
  assert.match(workspaceSurfaceSource, /buildPreviewFilterState\(input\.settings\.reference/);
  assert.match(workspaceSurfaceSource, /data-lab-comparison-roi-side="\$\{side\}"/);
  assert.match(workspaceSurfaceSource, /data-active="\$\{getActiveFlag\(side\)\}"/);
  assert.match(workspaceSurfaceSource, /data-active-side="\$\{input\.activeSide\}"/);
  assert.match(workspaceSurfaceSource, /data-lab-preserve-media="workspace-comparison-primary"/);
  assert.match(workspaceSurfaceSource, /data-lab-preserve-media="workspace-comparison-reference"/);
  assert.match(
    workspaceSourceIntakeSource,
    /const controls = options\.controls === true \? "controls" : "";/
  );
  assert.match(workspaceSurfaceSource, /data-lab-selection-roi-controls-reserve="0"/);
  assert.match(timelineSource, /data-lab-action="timeline-toggle-playback"/);
  assert.match(
    timelineSource,
    /class="labx-timeline labx-timeline-area\$\{focusClassName\}" id="lab-timeline" data-lab-region="timeline-area"/
  );
  assert.match(timelineSource, /data-lab-role="timeline-volume"/);
  assert.match(timelineSource, /data-lab-role="timeline-bookmark-note"/);
  assert.match(timelineSource, /data-lab-action="timeline-add-bookmark"/);
  assert.match(timelineSource, /data-lab-action="timeline-remove-bookmark"/);
  assert.match(timelineSource, /labx-timeline__pin-popover/);
  assert.match(timelineSource, /transportVolume/);
  assert.doesNotMatch(timelineSource, /labx-timeline__range-info/);
  assert.doesNotMatch(timelineSource, /labx-timeline__numeric/);
  assert.doesNotMatch(timelineSource, /Start \(ms\)|End \(ms\)/);
  assert.doesNotMatch(themeSource, /\.labx-timeline__numeric/);
  assert.match(
    themeSource,
    /\.labx-shell\[data-lab-debug-regions="true"\] \[data-lab-region\]\s*\{/
  );
  assert.match(themeSource, /\.labx-pipeline-block\s*\{\s*display:\s*block;/);
  assert.match(
    themeSource,
    /\.labx-shell\[data-lab-debug-regions="true"\] \.labx-pipeline-block\s*\{[\s\S]*outline:\s*var\(--lab-shell-px-1\) dashed var\(--lab-shell-color-11\);/
  );
  const debugPanelRule =
    themeSource.match(
      /\.labx-shell\[data-lab-debug-regions="true"\] \.labx-debug-panel\s*\{([\s\S]*?)\}/
    )?.[1] ?? "";
  assert.match(debugPanelRule, /position:\s*(absolute|fixed);/);
  assert.match(debugPanelRule, /pointer-events:\s*none;/);
  assert.doesNotMatch(debugPanelRule, /grid-area:/);
  assert.doesNotMatch(debugPanelRule, /margin:/);
  assert.doesNotMatch(themeSource, /^\.labx-pipeline-block\s*\{[^}]*outline:/m);
  assert.match(
    themeSource,
    /\.labx-drawer\[hidden\],[\s\S]*\.labx-workspace-inspector\[hidden\]\s*\{[\s\S]*display:\s*none;/
  );
  assert.match(themeSource, /\[data-lab-region="topbar"\]/);
  assert.match(themeSource, /\[data-lab-region="main-stage-inner"\]/);
  assert.match(themeSource, /\[data-lab-region="process-strip"\]/);
  assert.doesNotMatch(themeSource, /^\[data-lab-region\]\s*\{/m);
  assert.doesNotMatch(workspaceSurfaceSource, /renderWorkspaceBookmarks|workspace-bookmarks/);
  assert.match(
    workspaceSurfaceSource,
    /class="labx-workspace-stage"[\s\S]*class="labx-media-workbench"[\s\S]*renderPreviewArea\(\{ content: previewMarkup, focusClassName: previewFocusClassName \}\)[\s\S]*renderTimelineArea\(durationMs > 0 && !comparisonPreviewActive \? renderLabWaveformTimeline\(timelineModel\) : ""\)/
  );
  assert.match(workspaceSurfaceSource, /renderCapabilityCard\([\s\S]*\{ hideTitle: true \}/);
  assert.doesNotMatch(
    workspaceSurfaceSource,
    /class="labx-workspace-stage"[\s\S]*\$\{inspectorMarkup\}/
  );
  assert.match(
    workspaceSurfaceSource,
    /return \{ inspector: inspectorMarkup, main, side: selectionPanelMarkup \};/
  );
  assert.doesNotMatch(workspaceSurfaceSource, /renderWorkspaceHypothesis/);
  assert.match(
    themeSource,
    /\.labx-media-workbench\s*\{[\s\S]*gap:\s*0;[\s\S]*min-height:\s*0;[\s\S]*border:\s*var\(--lab-workspace-px-1\) solid var\(--lab-border-default\);[\s\S]*border-radius:\s*var\(--lab-radius-lg\);/
  );
  assert.match(
    themeSource,
    /\.labx-workspace-preview\s*\{[\s\S]*min-height:\s*0;[\s\S]*height:\s*100%;[\s\S]*border:\s*var\(--lab-workspace-px-1\) solid transparent;[\s\S]*border-radius:\s*0;[\s\S]*box-shadow:\s*none;/
  );
  assert.match(
    themeSource,
    /\.labx-focus-primary,[\s\S]*\.labx-focus-secondary,[\s\S]*\.labx-focus-passive\s*\{[\s\S]*opacity var\(--lab-duration-base\) var\(--lab-ease-out\),[\s\S]*filter var\(--lab-duration-base\) var\(--lab-ease-out\),[\s\S]*box-shadow var\(--lab-duration-base\) var\(--lab-ease-out\);/
  );
  assert.match(
    themeSource,
    /\.labx-workspace-preview\.labx-focus-primary\s*\{[\s\S]*border:\s*var\(--lab-workspace-px-1\) solid var\(--lab-accent\);[\s\S]*box-shadow:[\s\S]*0 0 0 var\(--lab-workspace-px-1\) var\(--lab-accent-soft\),[\s\S]*var\(--lab-glow-accent\);/
  );
  assert.match(
    themeSource,
    /\.labx-workspace-preview\.labx-focus-passive\s*\{[\s\S]*opacity:\s*0\.85;[\s\S]*filter:\s*brightness\(0\.85\);/
  );
  assert.match(themeSource, /\.labx-timeline\.labx-focus-secondary\s*\{[\s\S]*opacity:\s*1;/);
  assert.match(themeSource, /\.labx-timeline\.labx-focus-passive\s*\{[\s\S]*opacity:\s*0\.7;/);
  assert.match(
    themeSource,
    /\.labx-timeline\[hidden\],[\s\S]*\.labx-timeline-area--empty\s*\{[\s\S]*display:\s*none;/
  );
  assert.match(
    themeSource,
    /\.labx-timeline\[data-timeline-locked="true"\]\.labx-focus-secondary\s*\{[\s\S]*opacity:\s*1;/
  );
  assert.match(
    themeSource,
    /\.labx-timeline\[data-timeline-locked="true"\]\.labx-focus-passive\s*\{[\s\S]*opacity:\s*0\.7;/
  );
  assert.match(
    themeSource,
    /\.labx-workspace-inspector\.labx-focus-secondary\s*\{[\s\S]*opacity:\s*1;/
  );
  assert.match(
    themeSource,
    /\.labx-workspace-inspector\.labx-focus-passive\s*\{[\s\S]*opacity:\s*0\.5;/
  );
  assert.match(
    themeSource,
    /@media \(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*transition:\s*none;/
  );
  assert.match(
    themeSource,
    /\.labx-workspace-stage\s*\{[\s\S]*position:\s*relative;[\s\S]*flex:\s*1 1 auto;[\s\S]*min-height:\s*0;/
  );
  assert.match(
    themeSource,
    /\.labx-workspace-inspector\s*\{[\s\S]*position:\s*relative;[\s\S]*z-index:\s*1;[\s\S]*width:\s*100%;[\s\S]*height:\s*100%;/
  );
  assert.match(
    themeSource,
    /\.labx-workspace-inspector\[data-open="false"\]\s*\.labx-workspace-inspector__body\s*\{[\s\S]*display:\s*none;/
  );
  assert.doesNotMatch(themeSource, /\.labx-audio-focus__header\s*\{/);
  assert.match(
    themeSource,
    /\.labx-media-workbench\s*>\s*\.labx-timeline\s*\{[\s\S]*padding:\s*0 0 var\(--lab-workspace-rem-0-45\);[\s\S]*border-width:\s*0;[\s\S]*border-radius:\s*0;[\s\S]*box-shadow:\s*none;/
  );
  assert.match(
    themeSource,
    /\.labx-timeline__track\s*\{[\s\S]*height:\s*var\(--lab-workspace-rem-3-5\);/
  );
  assert.match(themeSource, /\.labx-timeline__controls\s*\{[\s\S]*display:\s*grid;/);
  assert.match(themeSource, /\.labx-timeline__controls-row\s*\{[\s\S]*flex-wrap:\s*nowrap;/);
  assert.match(themeSource, /\.labx-timeline__transport\s*\{/);
  assert.match(themeSource, /\.labx-timeline__volume\s*\{/);
  assert.match(themeSource, /\.labx-timeline__speed\s*\{/);
  assert.match(themeSource, /\.labx-timeline__bookmark\s*\{/);
  assert.match(themeSource, /\.labx-timeline__selection-group\s*\{/);
  assert.match(
    themeSource,
    /\.labx-timeline__pin-popover\s*\{[\s\S]*bottom:\s*calc\(100% \+ var\(--lab-timeline-roi-rem-0-35\)\);/
  );
  assert.match(themeSource, /\.labx-timeline__pin-remove\s*\{/);
  assert.doesNotMatch(themeSource, /\.labx-timeline__range-info\s*\{/);
  assert.doesNotMatch(themeSource, /\.labx-bookmarks\s*\{/);
  assert.doesNotMatch(themeSource, /\.labx-timeline__header\s*\{/);
  assert.doesNotMatch(themeSource, /\.labx-timeline__sync\s*\{/);
  assert.doesNotMatch(themeSource, /\.labx-dual-preview-transport\s*\{/);
  assert.match(
    themeSource,
    /\.labx-media-workbench \.labx-preview-media--workspace-video,[\s\S]*\.labx-media-workbench \.labx-preview-media--workspace-image\s*\{[\s\S]*height:\s*100%;[\s\S]*max-height:\s*100%;/
  );
  assert.match(
    themeSource,
    /\.labx-preview-filter-wrap\s*\{[\s\S]*position:\s*relative;[\s\S]*width:\s*100%;[\s\S]*height:\s*100%;[\s\S]*max-height:\s*100%;[\s\S]*overflow:\s*hidden;/
  );
  assert.match(
    themeSource,
    /\.labx-channel-filter\s*\{[\s\S]*position:\s*absolute;[\s\S]*width:\s*0;[\s\S]*height:\s*0;[\s\S]*overflow:\s*hidden;[\s\S]*pointer-events:\s*none;/
  );
  assert.match(
    themeSource,
    /\.labx-preview-filter-wrap\s*>\s*\.labx-preview-media--workspace-video\s*\{[\s\S]*position:\s*absolute;[\s\S]*inset:\s*0;[\s\S]*height:\s*100%;[\s\S]*object-fit:\s*contain;/
  );
});

void test("laboratory process strip owns heartbeat and expanded runtime detail rendering", () => {
  const labRootSource = readFileSync("rooms/laboratory/ui/lab-root.ts", "utf8");
  const processStripSource = readFileSync("rooms/laboratory/ui/lab-process-strip.ts", "utf8");
  const themeSource = readLabThemeSource();

  assert.match(labRootSource, /processStripHeartbeatInterval/);
  assert.match(labRootSource, /setInterval\(function \(\) \{\s*render\(\);/);
  assert.match(labRootSource, /shell\.dataset\["processView"\]/);
  assert.match(processStripSource, /data-lab-process-expanded="true"/);
  assert.match(processStripSource, /class="labx-strip-detail-toggle"/);
  assert.doesNotMatch(processStripSource, /class="labx-strip-expand"/);
  assert.doesNotMatch(processStripSource, /class="labx-strip-cancel"/);
  assert.match(processStripSource, /getUserActions\(state\)\.slice\(0, 5\)/);
  assert.match(processStripSource, /state\.run\?\.rawLog/);
  assert.match(
    themeSource,
    /\.labx-shell\[data-process-view="expanded"\]\s*\{[\s\S]*grid-template-rows:\s*var\(--lab-topbar-height\)\s+minmax\(\s*0,\s*1fr\s*\)\s+var\(--lab-shell-px-200\);/
  );
  assert.match(
    themeSource,
    /\.labx-process-strip\s*\{[\s\S]*flex-direction:\s*column;[\s\S]*height:\s*100%;/
  );
  assert.match(
    themeSource,
    /\.labx-strip-expanded\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*minmax\(0, 35fr\) minmax\(0, 65fr\);[\s\S]*background:\s*var\(--lab-surface-1\);/
  );
  assert.match(
    themeSource,
    /\.labx-strip-expanded section\s*\{[\s\S]*background:\s*var\(--lab-status-shell-color-06\);/
  );
  assert.match(
    themeSource,
    /\.labx-strip-expanded__list li,[\s\S]*\.labx-strip-expanded__log li\s*\{[\s\S]*background:\s*var\(--lab-status-shell-color-08\);/
  );
  assert.match(
    themeSource,
    /\.labx-strip-expanded__log li\s*\{[\s\S]*font-family:\s*var\(--lab-font-mono\);[\s\S]*line-height:\s*var\(--lab-leading-snug\);[\s\S]*white-space:\s*normal;/
  );
});

void test("laboratory theme defines the multi-region shell grid and drawer layout contract", () => {
  const baseSource = readFileSync("rooms/laboratory/ui/styles/base.css", "utf8");
  const themeSource = readLabThemeSource();
  const sourceImportSource = readFileSync(
    "rooms/laboratory/ui/styles/lab-source-import.css",
    "utf8"
  );

  const tokenSource = readFileSync("rooms/laboratory/ui/styles/lab-tokens.css", "utf8");

  assert.match(baseSource, /@import "\.\/lab-tokens\.css";/);
  assert.match(baseSource, /@import "\.\/lab-primitives\.css";/);
  assert.match(tokenSource, /--labx-bg-main:\s*var\(--lab-surface-1\);/);
  assert.match(tokenSource, /--labx-bg-elevated:\s*var\(--lab-surface-2\);/);
  assert.match(tokenSource, /--labx-text-primary:\s*var\(--lab-text-strong\);/);
  assert.match(tokenSource, /--labx-text-muted:\s*var\(--lab-text-dim\);/);
  assert.match(tokenSource, /--labx-danger:\s*var\(--lab-error\);/);
  assert.match(
    themeSource,
    /\.labx-shell\s*\{[\s\S]*grid-template-columns:\s*minmax\(var\(--lab-shell-rem-14\), var\(--lab-shell-rem-18\)\)\s+minmax\(\s*0,\s*1fr\s*\)\s+minmax\(var\(--lab-shell-rem-18\), var\(--lab-shell-rem-24\)\);[\s\S]*grid-template-rows:\s*var\(--lab-topbar-height\)\s+minmax\(\s*0,\s*1fr\s*\)\s+var\(--lab-strip-height\);/
  );
  assert.match(
    themeSource,
    /\.labx-shell\s*\{[\s\S]*grid-template-areas:\s*"topbar topbar\s+topbar"\s*"panel\s+center\s+context"\s*"panel\s+strip\s+context";/
  );
  assert.match(
    themeSource,
    /\.labx-shell\[data-source-panel-collapsed="true"\]\s*\{[\s\S]*grid-template-columns:\s*0\s+minmax\(\s*0,\s*1fr\s*\)\s+minmax\(var\(--lab-shell-rem-18\), var\(--lab-shell-rem-24\)\);/
  );
  assert.match(
    themeSource,
    /\.labx-shell\[data-drawer-collapsed="true"\]\s*\{[\s\S]*grid-template-columns:\s*minmax\(var\(--lab-shell-rem-14\), var\(--lab-shell-rem-18\)\)\s+minmax\(\s*0,\s*1fr\s*\)\s+0;/
  );
  assert.match(
    themeSource,
    /\.labx-shell\[data-source-panel-collapsed="true"\]\[data-drawer-collapsed="true"\]\s*\{[\s\S]*grid-template-columns:\s*0\s+minmax\(\s*0,\s*1fr\s*\)\s+0;/
  );
  assert.doesNotMatch(themeSource, /\.labx-drawer--collapsed/);
  assert.doesNotMatch(themeSource, /\.labx-drawer__expand-btn/);
  assert.match(themeSource, /\.labx-center-skeleton__label\s*\{/);
  assert.match(themeSource, /\.labx-boot-overlay\s*\{[\s\S]*pointer-events:\s*auto;/);
  assert.match(
    themeSource,
    /\.labx-boot-panel\s*\{[\s\S]*border-radius:\s*var\(--lab-radius-lg\);/
  );
  assert.match(themeSource, /@keyframes labx-skeleton-breathe/);
  assert.doesNotMatch(themeSource, /\.labx-shell\[data-ready="false"\]::after/);
  assert.doesNotMatch(themeSource, /\.labx-shell\[data-ready="false"\]\s+\.labx-center-panel/);
  assert.doesNotMatch(themeSource, /labx-boot-breathe/);
  assert.match(
    themeSource,
    /\.labx-top-bar\s*\{\s*grid-area:\s*topbar;\s*\}[\s\S]*\.labx-source-panel\s*\{\s*grid-area:\s*panel;\s*\}[\s\S]*\.labx-center-panel\s*\{\s*grid-area:\s*center;\s*\}[\s\S]*\.labx-drawer\s*\{\s*grid-area:\s*context;\s*\}[\s\S]*\.labx-process-strip\s*\{\s*grid-area:\s*strip;\s*\}/
  );
  assert.doesNotMatch(themeSource, /\.labx-shell\[data-layout-kind="import-only"\]/);
  assert.doesNotMatch(sourceImportSource, /\.labx-import-/);
  assert.doesNotMatch(sourceImportSource, /\.labx-strategy-/);
  assert.doesNotMatch(sourceImportSource, /\.labx-pw-/);
  assert.doesNotMatch(sourceImportSource, /\.labx-import-review/);
  assert.match(
    sourceImportSource,
    /\.labx-project-import__youtube-preview\s*\{[\s\S]*display:\s*grid;/
  );
  assert.match(sourceImportSource, /\.labx-project-import__progress\s*\{[\s\S]*display:\s*grid;/);
  assert.match(
    sourceImportSource,
    /\.labx-project-import__yt-controls\s*\{[\s\S]*display:\s*grid;/
  );
  assert.match(
    sourceImportSource,
    /\.labx-project-import__yt-field\s*\{[\s\S]*grid-template-columns:\s*minmax\(var\(--lab-source-import-rem-7-5\), 0\.42fr\) minmax\(0, 1fr\);/
  );
  assert.doesNotMatch(sourceImportSource, /\.labx-advanced-settings/);
});

void test("laboratory micro inspection UI exposes roi focus precedence and lens affordances in the preview shell", () => {
  const overlaySource = readFileSync("rooms/laboratory/ui/workspace-roi-overlay.ts", "utf8");
  const surfaceSource = readFileSync("rooms/laboratory/ui/workspace-surface.ts", "utf8");
  const timelineSelectionSource = readFileSync(
    "rooms/laboratory/ui/timeline/timeline-selection.ts",
    "utf8"
  );

  assert.match(
    overlaySource,
    /data-lab-selection-roi="true"[\s\S]*data-lab-selection-roi-ignore="true"/
  );
  assert.doesNotMatch(overlaySource, /labx-roi-selection-toolbar/);
  assert.doesNotMatch(overlaySource, /data-lab-selection-inspection-mode=/);
  assert.match(timelineSelectionSource, /data-lab-selection-roi-focus-toggle="true"/);
  assert.match(timelineSelectionSource, /data-lab-selection-roi-capture="true"/);
  assert.match(surfaceSource, /data-lab-preview-inspection-stage="true"/);
  assert.match(surfaceSource, /data-lab-preview-inspection-content="true"/);
  assert.match(timelineSelectionSource, /Selection micro zoom/);
  assert.match(timelineSelectionSource, /model\.selectionMicroZoomOpen !== true/);
  assert.match(timelineSelectionSource, /id="lab-audio-viz-inspection"/);
});

void test("laboratory selection preview exposes soft execution intent affordances without run semantics", () => {
  const timelineSelectionSource = readFileSync(
    "rooms/laboratory/ui/timeline/timeline-selection.ts",
    "utf8"
  );

  assert.match(timelineSelectionSource, /Selected action/);
  assert.match(timelineSelectionSource, /data-lab-execution-intent-accept=/);
  assert.match(timelineSelectionSource, /data-lab-execution-intent-dismiss=/);
  assert.match(timelineSelectionSource, /data-lab-execution-intent-queue=/);
  assert.match(timelineSelectionSource, /data-lab-execution-intent-clear="true"/);
  assert.match(timelineSelectionSource, /mediaAnalysis\.timeline\.actionSelected/);
  assert.match(timelineSelectionSource, /mediaAnalysis\.timeline\.wantThis/);
  assert.match(timelineSelectionSource, /mediaAnalysis\.timeline\.notNow/);
  assert.match(timelineSelectionSource, /mediaAnalysis\.timeline\.queueForLater/);
  assert.doesNotMatch(timelineSelectionSource, />Run</);
});

void test("laboratory execution detail helper panels are removed from the selection timeline surface", () => {
  const timelineSource = readLabWaveformTimelineSource();
  const rootSource = readFileSync("rooms/laboratory/ui/lab-root.ts", "utf8");
  const binderSource = readFileSync(
    "rooms/laboratory/ui/lab-selection-suggestion-binder.ts",
    "utf8"
  );
  const drawerResultExploreSource = readFileSync(
    "rooms/laboratory/ui/lab-drawer-result-explore.ts",
    "utf8"
  );
  const themeSource = readLabThemeSource();

  const removedTimelinePatterns = [
    /data-lab-execution-plan/,
    /data-lab-execution-simulation/,
    /data-lab-execution-readiness/,
    /data-lab-execution-payload-preview/,
    /data-lab-execution-reflection/,
    /data-lab-execution-alternatives/,
    /data-lab-execution-candidate/,
    /data-lab-execution-commitment/,
    /data-lab-execution-staging/,
    /data-lab-execution-details/,
    /renderExecutionPlan/,
    /renderExecutionSimulation/,
    /renderExecutionReadiness/,
    /renderExecutionPayloadPreview/,
    /renderExecutionReflection/,
    /renderExecutionAlternatives/,
    /renderExecutionCandidate/,
    /renderExecutionCommitment/,
    /renderExecutionStaging/,
    /renderCollapsibleExecutionPanel/,
    /executionPanels/,
    /executionDetails/,
  ];

  removedTimelinePatterns.forEach(function (pattern) {
    assert.doesNotMatch(timelineSource, pattern);
  });

  assert.match(timelineSource, /renderExecutionIntentStrip/);
  assert.match(timelineSource, /renderSuggestionPreview/);
  assert.match(binderSource, /data-lab-execution-intent-accept/);
  assert.match(binderSource, /data-lab-execution-intent-dismiss/);
  assert.match(binderSource, /data-lab-execution-intent-queue/);
  assert.match(binderSource, /data-lab-execution-intent-clear/);
  assert.doesNotMatch(
    binderSource,
    /data-lab-execution-commitment-set|workspace-execution-commitment-set|data-lab-execution-commitment-revoke|workspace-execution-commitment-revoked/
  );
  assert.doesNotMatch(
    rootSource,
    /data-lab-execution-details-open|activeOverlay|collapsedPanels|createLabExecutionDispatcher|getExecutionDispatchCandidate/
  );
  assert.doesNotMatch(
    drawerResultExploreSource,
    /buildExecutionBridge|data-lab-drawer-alternatives|formatDecisionCoherenceAdvisory|formatExecutionReadinessSignalAdvisory|getActiveExecutionAlternatives/
  );
  assert.doesNotMatch(
    themeSource,
    /lab-execution-collapsible|lab-execution-details|lab-execution-plan|lab-execution-simulation|lab-execution-readiness|lab-execution-payload|lab-execution-reflection|lab-execution-candidate|lab-execution-commitment|lab-execution-staging/
  );
});

