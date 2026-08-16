import {
  asLabRecord,
  asNonEmptyString,
  escapeHtml,
  ICON_RAIL_SLOTS,
  normalizeLabOperationSettings,
} from "../domain/lab-types.js";
import type {
  LabWorkspaceSurface,
  LabAsset,
  LabStoreState,
  LabAudioFocusSettings,
  LabInteractiveSettings,
  LabOperationCapabilityProjection,
  LabWorkspaceControlTab,
  LabOperationCapabilityId,
  LabIconRailSlotId,
  LabComparisonRoiState,
  LabComparisonSide,
  LabSettingsRecord,
} from "../domain/lab-types.js";
import {
  buildImageComparisonTransformCss,
  readImageComparisonGeometry,
} from "../domain/lab-image-comparison-workbench.js";
import {
  getActiveSelection,
  getAudioFocusSettings,
  getAvailableOperationCapabilities,
  getComparisonInteractiveSettings,
  getEffectivePreviewAudioFocusSettings,
  getInteractiveSettings,
  getMediaViewportState,
  getProjectSource,
  getROIRegions,
  getSourceKind,
  getSourceProbeStatus,
  getSourceRetryBlockReason,
  getWaveformTimelineModel,
  getWorkspaceLockState,
  isLabWorkspaceSurfaceReady,
  isAnyHeavyWorkActive,
  isRunActive,
  isLoadedSourceMatchingMode,
} from "../runtime/lab-selectors.js";
import {
  renderLabWaveformSelectionPanel,
  renderLabWaveformTimeline,
} from "./lab-waveform-timeline.js";
import { renderWorkspaceROIOverlay } from "./workspace-roi-overlay.js";
import { renderWorkspaceInteractiveControls } from "./workspace-interactive-controls.js";
import { renderWorkspaceAudioFocus } from "./workspace-audio-focus.js";
import {
  renderCapabilityCard,
  renderWorkspaceOperationControls,
} from "./workspace-operation-controls.js";
import type {
  LabOperationComparisonState,
  LabOperationScopeState,
} from "./workspace-operation-controls.js";
import { LAB_FALLBACK_I18N } from "./lab-i18n.js";
import type { LabI18n } from "./lab-i18n.js";
import {
  renderInspectorPanel,
  renderPreviewArea,
  renderTimelineArea,
} from "./laboratory-layout.js";
import { isFullSourceWorkspaceSelection } from "../runtime/lab-workspace-selection.js";
import type { LabWaveformTimelineModel } from "./lab-waveform-timeline-types.js";
import {
  buildPreviewFilterState,
  getEffectiveSourceMode,
  renderPreviewMedia,
  renderViewportStatePanel,
} from "./workspace-source-intake.js";
import {
  buildLabAssetMetadataTitle,
  getLabAssetPath,
  getLabAssetPreviewKind,
  getLabAssetPreviewUrl,
} from "./lab-asset-display.js";
export { renderSourceIntake } from "./workspace-source-intake.js";

type WorkspaceSurfaceOptions = {
  copy?: LabI18n;
};

type WorkspaceInspectorPanel = {
  id: LabWorkspaceControlTab;
  label: string;
  markup: string;
};

type ComparisonFindingListItem = {
  findingId: string;
  manifestAssetId: string;
  note: string | null;
  roiSummary: string | null;
  snapshotAssetId: string | null;
  snapshotLabel: string | null;
  title: string;
};

type LabFocusTarget = "preview" | "timeline" | "inspector";
type ProcessableWorkspaceMediaKind = "image" | "video";

function getLabFocusClassName(state: LabStoreState, target: LabFocusTarget) {
  if (state.ui.labFocusLayer === target) {
    return target === "preview" ? "labx-focus-primary" : "labx-focus-secondary";
  }
  return "labx-focus-passive";
}

function getOperationCapabilityIdForAction(
  actionType: string | null | undefined
): LabOperationCapabilityId | null {
  switch (actionType) {
    case null:
    case undefined:
      return null;
    case "extract-clip":
      return "clip-export";
    case "crop-region":
      return "roi-crop";
    case "enhance-visual":
    case "enhance-frame":
      return "enhanced-frame";
    case "clean-audio":
      return "audio-cleanup";
    case "separate-stems":
      return "stem-separation";
    case "stabilize-segment":
      return "segment-stabilization";
    default:
      return null;
  }
}

function renderCenterSkeleton(copy: LabI18n) {
  return `
    <section
      class="labx-center-skeleton"
      data-lab-center-skeleton="true"
      aria-label="${escapeHtml(copy.t("mediaAnalysis.center.loading", "Laboratory center loading"))}"
    >
      <div class="labx-skeleton-block"></div>
      <div class="labx-skeleton-block"></div>
      <p class="labx-center-skeleton__label">${escapeHtml(copy.t("mediaAnalysis.center.loadingLabel", "Ortam hazırlanıyor..."))}</p>
    </section>
  `;
}

function getActiveWorkspaceAsset(state: LabStoreState) {
  const assetId = asNonEmptyString(state.ui.activeWorkspaceAssetId);
  if (assetId === null) {
    return null;
  }
  return (
    state.assets.find(function (asset) {
      return asset.id === assetId;
    }) || null
  );
}

function getComparisonReferenceAsset(state: LabStoreState): LabAsset | null {
  const assetId = asNonEmptyString(state.ui.workspace.comparisonReferenceAssetId);
  if (assetId === null) {
    return null;
  }
  return (
    state.assets.find(function (asset) {
      return asset.id === assetId;
    }) || null
  );
}

function buildAssetLookup(assets: LabAsset[]) {
  const lookup = new Map<string, LabAsset>();
  assets.forEach(function (asset) {
    lookup.set(asset.id, asset);
  });
  return lookup;
}

function readComparisonRoiSummary(metadata: Record<string, unknown>) {
  const directSummary = asNonEmptyString(metadata["roiSummary"]);
  if (directSummary !== null) {
    return directSummary;
  }
  const captureContext = asLabRecord(metadata["captureContext"]);
  return asNonEmptyString(captureContext["roiSummary"]);
}

function getComparisonFindingListItems(state: LabStoreState): ComparisonFindingListItem[] {
  const assetById = buildAssetLookup(state.assets);
  return state.assets
    .map(function (asset) {
      const metadata = asLabRecord(asset.metadata);
      if (asNonEmptyString(metadata["artifactKind"]) !== "comparison-finding-manifest") {
        return null;
      }
      const findingId = asNonEmptyString(metadata["findingId"]) || asset.id;
      const note = asNonEmptyString(metadata["note"]);
      const snapshotAssetId = asNonEmptyString(metadata["snapshotAssetId"]);
      const snapshotAsset =
        snapshotAssetId === null ? null : assetById.get(snapshotAssetId) || null;
      return {
        findingId,
        manifestAssetId: asset.id,
        note,
        roiSummary: readComparisonRoiSummary(metadata),
        snapshotAssetId,
        snapshotLabel: snapshotAsset?.name || snapshotAssetId,
        title: note ? note.split(/\r?\n/)[0]?.slice(0, 72) || note : asset.name,
      } satisfies ComparisonFindingListItem;
    })
    .filter((entry): entry is ComparisonFindingListItem => entry !== null)
    .slice(-5)
    .reverse();
}

function renderComparisonFindingMiniList(items: ComparisonFindingListItem[], copy: LabI18n) {
  if (items.length === 0) {
    return "";
  }
  return `
    <section class="labx-comparison-findings" data-lab-comparison-finding-list="true">
      <div class="labx-comparison-findings__header">
        <span>${escapeHtml(copy.t("mediaAnalysis.operations.comparison.savedFindings", "Kayıtlı bulgular"))}</span>
        <strong>${escapeHtml(String(items.length))}</strong>
      </div>
      <div class="labx-comparison-findings__list">
        ${items
          .map(function (item) {
            const detail =
              item.roiSummary ||
              item.snapshotLabel ||
              copy.t("mediaAnalysis.operations.comparison.findingNoRoi", "ROI bağlamı yok");
            return `
              <button
                class="labx-comparison-finding"
                type="button"
                data-lab-action="workspace-comparison-finding-focus"
                data-lab-value="${escapeHtml(item.findingId)}"
                data-lab-comparison-finding-id="${escapeHtml(item.findingId)}"
                data-lab-comparison-manifest-id="${escapeHtml(item.manifestAssetId)}"
                ${item.snapshotAssetId === null ? "" : `data-lab-comparison-snapshot-id="${escapeHtml(item.snapshotAssetId)}"`}
              >
                <span class="labx-comparison-finding__title">${escapeHtml(item.title)}</span>
                <span class="labx-comparison-finding__meta">${escapeHtml(detail)}</span>
              </button>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderComparisonPreview(input: {
  activeSide: LabComparisonSide;
  comparisonRois: LabComparisonRoiState;
  copy: LabI18n;
  mode: string;
  mutationLocked: boolean;
  primaryLabel: string;
  primaryUrl: string;
  referenceLabel: string;
  referenceUrl: string;
  settings: Record<LabComparisonSide, LabInteractiveSettings>;
  toolSettings: LabSettingsRecord;
  roiFocusActive: boolean;
  splitPercent: number;
}) {
  const split = Math.max(5, Math.min(95, Math.round(input.splitPercent)));
  const geometry = readImageComparisonGeometry(input.toolSettings);
  const requestedMode =
    input.mode === "stacked" ? "stacked" : input.mode === "split" ? "split" : "paired";
  const mode = geometry.compositeMode === "none" ? requestedMode : "split";
  const filterStateBySide: Record<LabComparisonSide, ReturnType<typeof buildPreviewFilterState>> = {
    primary: buildPreviewFilterState(input.settings.primary, {
      filterId: "labx-ch-isolate-primary",
    }),
    reference: buildPreviewFilterState(input.settings.reference, {
      filterId: "labx-ch-isolate-reference",
    }),
  };
  const transformCssBySide: Record<LabComparisonSide, string> = {
    primary: buildImageComparisonTransformCss(geometry.transforms.primary),
    reference: buildImageComparisonTransformCss(geometry.transforms.reference),
  };
  const comparisonTransformStyle = `--lab-comparison-primary-transform:${transformCssBySide.primary};--lab-comparison-reference-transform:${transformCssBySide.reference};`;
  function getActiveFlag(side: LabComparisonSide) {
    return input.activeSide === side ? "true" : "false";
  }
  function getImageStyle(side: LabComparisonSide) {
    if (input.activeSide !== side) {
      return "";
    }
    const filterCss = filterStateBySide[side].filterCss.trim();
    if (filterCss === "") {
      return "";
    }
    const normalized = filterCss.endsWith(";") ? filterCss : `${filterCss};`;
    return ` style="${normalized}"`;
  }
  function renderMarkers(side: LabComparisonSide) {
    return geometry.markers
      .filter(function (marker) {
        return marker.enabled && marker.side === side;
      })
      .map(function (marker) {
        return `<span class="labx-workspace-comparison__marker" data-marker-id="${String(marker.id)}" data-marker-side="${side}" style="left:${String(marker.x)}%;top:${String(marker.y)}%"><span>${String(marker.id)}</span></span>`;
      })
      .join("");
  }
  function renderCenterGuide() {
    return geometry.centerGuide
      ? `<span class="labx-workspace-comparison__center-guide" aria-hidden="true"></span>`
      : "";
  }
  function renderComparisonOverlay(side: LabComparisonSide) {
    return renderWorkspaceROIOverlay(
      {
        legacyRegions: [],
        mutationLocked: input.mutationLocked,
        overlayId: `lab-roi-overlay-${side}`,
        roiFocusActive: input.roiFocusActive === true && input.activeSide === side,
        selectionRoi: input.comparisonRois[side],
        selectionRoiEnabled: true,
        sourceKind: "image",
      },
      input.copy
    );
  }

  function renderMediaStage(
    side: LabComparisonSide,
    label: string,
    url: string,
    imageClassName = "labx-workspace-comparison__image"
  ) {
    return `
      <div
        class="labx-workspace-comparison__media-stage"
        data-lab-selection-roi-stage="true"
        data-lab-selection-roi-controls-reserve="0"
        data-lab-comparison-roi-side="${side}"
        data-active="${getActiveFlag(side)}"
      >
        <span class="labx-workspace-comparison__media-frame" data-lab-selection-roi-frame="true">
          <img class="${imageClassName}" data-lab-preserve-media="workspace-comparison-${side}" src="${escapeHtml(url)}" alt="${escapeHtml(label)}"${getImageStyle(side)} />
          ${renderCenterGuide()}
          ${renderMarkers(side)}
          ${renderComparisonOverlay(side)}
        </span>
      </div>
    `;
  }

  const leftSide: LabComparisonSide =
    geometry.compositeMode === "reference-left-primary-right" ? "reference" : "primary";
  const splitPrimaryClass = leftSide === "primary" ? " labx-workspace-comparison__image--left" : "";
  const splitReferenceClass =
    leftSide === "reference" ? " labx-workspace-comparison__image--left" : "";
  const comparisonMarkup =
    mode === "split"
      ? `
      <div class="labx-workspace-comparison" data-mode="split" data-composite-mode="${escapeHtml(geometry.compositeMode)}" style="${comparisonTransformStyle}--lab-comparison-split:${String(split)}%">
        <div
          class="labx-workspace-comparison__split"
          data-lab-selection-roi-stage="true"
          data-lab-selection-roi-controls-reserve="0"
          data-lab-comparison-roi-side="${input.activeSide}"
          data-active-side="${input.activeSide}"
        >
          <img class="labx-workspace-comparison__image${splitReferenceClass}" data-lab-preserve-media="workspace-comparison-reference" src="${escapeHtml(input.referenceUrl)}" alt="${escapeHtml(input.referenceLabel)}"${getImageStyle("reference")} />
          <img class="labx-workspace-comparison__image${splitPrimaryClass}" data-lab-preserve-media="workspace-comparison-primary" src="${escapeHtml(input.primaryUrl)}" alt="${escapeHtml(input.primaryLabel)}"${getImageStyle("primary")} />
          ${geometry.centerGuide ? `<span class="labx-workspace-comparison__divider" aria-hidden="true"></span>` : ""}
          ${renderMarkers("primary")}
          ${renderMarkers("reference")}
          ${renderComparisonOverlay(input.activeSide)}
        </div>
        <div class="labx-workspace-comparison__labels">
          <span>A ${escapeHtml(input.primaryLabel)}</span>
          <span>B ${escapeHtml(input.referenceLabel)}</span>
        </div>
      </div>
    `
      : `
    <div class="labx-workspace-comparison" data-mode="${escapeHtml(mode)}" data-composite-mode="none" style="${comparisonTransformStyle}">
      <figure class="labx-workspace-comparison__pane" data-side="primary" data-active="${getActiveFlag("primary")}">
        ${renderMediaStage("primary", input.primaryLabel, input.primaryUrl)}
        <figcaption>A ${escapeHtml(input.primaryLabel)}</figcaption>
      </figure>
      <figure class="labx-workspace-comparison__pane" data-side="reference" data-active="${getActiveFlag("reference")}">
        ${renderMediaStage("reference", input.referenceLabel, input.referenceUrl)}
        <figcaption>B ${escapeHtml(input.referenceLabel)}</figcaption>
      </figure>
    </div>
  `;

  return `
    <div
      class="labx-workspace-preview__single-stage labx-workspace-preview__single-stage--comparison"
      data-lab-workspace-comparison-stage="true"
      data-lab-preview-inspection-stage="true"
      data-lab-preview-inspection-topology="comparison-${escapeHtml(mode)}"
      data-lab-roi-focus-active="${input.roiFocusActive ? "true" : "false"}"
    >
      <div class="labx-workspace-preview__inspection-viewport" data-lab-preview-inspection-viewport="true">
        <div class="labx-workspace-preview__inspection-content" data-lab-preview-inspection-content="true">
          ${filterStateBySide.primary.svgFilter}
          ${filterStateBySide.reference.svgFilter}
          ${comparisonMarkup}
        </div>
      </div>
    </div>
  `;
}

function getWorkspaceAssetContentKind(
  asset: NonNullable<ReturnType<typeof getActiveWorkspaceAsset>>
) {
  const assetPath = getLabAssetPath(asset);
  const previewUrl = getLabAssetPreviewUrl(asset);
  return getLabAssetPreviewKind(asset, previewUrl || assetPath, {
    usesThumbnail: assetPath === null,
  });
}

function getWorkspaceAssetSourceKind(
  previewKind: ReturnType<typeof getWorkspaceAssetContentKind>,
  fallback: string
) {
  return previewKind === "video" || previewKind === "audio" || previewKind === "image"
    ? previewKind
    : fallback;
}

function renderInlineReportPreview(
  state: LabStoreState,
  asset: NonNullable<ReturnType<typeof getActiveWorkspaceAsset>>,
  copy: LabI18n
) {
  const metadata = asLabRecord(asset.metadata);
  const reportView = asNonEmptyString(metadata["reportView"]);
  const report =
    reportView === "ai" ? state.reports.ai : reportView === "user" ? state.reports.user : null;
  if (report === null) {
    return "";
  }
  return `
    <article class="labx-workspace-document" data-lab-workspace-asset-kind="report">
      <header class="labx-workspace-document__header">
        <span class="labx-card__eyebrow">${escapeHtml(copy.t("mediaAnalysis.assets.groups.report", "Raporlar"))}</span>
        <strong>${escapeHtml(asset.name)}</strong>
      </header>
      <pre class="labx-workspace-document__content">${escapeHtml(JSON.stringify(report, null, 2))}</pre>
    </article>
  `;
}

function getProcessableWorkspaceMediaKind(
  previewKind: ReturnType<typeof getWorkspaceAssetContentKind> | null,
  previewUrl: string | null
): ProcessableWorkspaceMediaKind | null {
  if (previewUrl === null) {
    return null;
  }
  return previewKind === "image" || previewKind === "video" ? previewKind : null;
}

function renderSingleInspectionStage(input: {
  mediaMarkup: string;
  roiFocusActive: boolean;
  roiOverlayMarkup: string;
  sourceKind: ProcessableWorkspaceMediaKind;
  workspaceAsset?: NonNullable<ReturnType<typeof getActiveWorkspaceAsset>> | null;
  workspaceAssetKind?: string | null;
}) {
  const workspaceAsset = input.workspaceAsset ?? null;
  const assetAttrs =
    workspaceAsset === null
      ? ""
      : ` data-lab-workspace-asset-id="${escapeHtml(workspaceAsset.id)}" data-lab-workspace-asset-kind="${escapeHtml(input.workspaceAssetKind ?? input.sourceKind)}" title="${escapeHtml(buildLabAssetMetadataTitle(workspaceAsset))}"`;
  return `
    <div
      class="labx-workspace-preview__single-stage"
      data-lab-selection-roi-stage="true"
      data-lab-selection-roi-controls-reserve="0"
      data-lab-preview-inspection-stage="true"
      data-lab-preview-inspection-topology="single-${escapeHtml(input.sourceKind)}"
      data-lab-roi-focus-active="${input.roiFocusActive ? "true" : "false"}"${assetAttrs}
    >
      <div class="labx-workspace-preview__inspection-viewport" data-lab-preview-inspection-viewport="true">
        <div class="labx-workspace-preview__inspection-content" data-lab-preview-inspection-content="true">
          ${input.mediaMarkup}
          ${input.roiOverlayMarkup}
        </div>
      </div>
    </div>
  `;
}

function renderWorkspaceAssetProcessableMedia(
  previewKind: ProcessableWorkspaceMediaKind,
  previewUrl: string,
  settings: LabInteractiveSettings,
  copy: LabI18n
) {
  return renderPreviewMedia(previewKind, previewUrl, settings, copy);
}

function renderWorkspaceAssetContent(
  state: LabStoreState,
  asset: NonNullable<ReturnType<typeof getActiveWorkspaceAsset>>,
  sourceKind: string,
  settings: LabInteractiveSettings,
  copy: LabI18n
) {
  const previewUrl = getLabAssetPreviewUrl(asset);
  const previewKind = getWorkspaceAssetContentKind(asset);
  const title = escapeHtml(buildLabAssetMetadataTitle(asset));
  const sourceLikeKind = getWorkspaceAssetSourceKind(previewKind, sourceKind);
  if (previewUrl !== null && previewKind !== "document" && previewKind !== "unsupported") {
    return `
      <div class="labx-workspace-content" data-lab-workspace-asset-id="${escapeHtml(asset.id)}" data-lab-workspace-asset-kind="${escapeHtml(previewKind)}" title="${title}">
        ${renderPreviewMedia(sourceLikeKind, previewUrl, settings, copy)}
      </div>
    `;
  }
  if (previewUrl !== null && previewKind === "document") {
    return `
      <iframe
        class="labx-preview-media labx-workspace-document-frame"
        data-lab-workspace-asset-id="${escapeHtml(asset.id)}"
        src="${escapeHtml(previewUrl)}"
        title="${escapeHtml(asset.name)}"
      ></iframe>
    `;
  }
  if (asset.type === "report") {
    const inlineReport = renderInlineReportPreview(state, asset, copy);
    if (inlineReport !== "") {
      return inlineReport;
    }
  }
  return `
    <div class="labx-empty-state labx-workspace-empty" data-lab-workspace-asset-id="${escapeHtml(asset.id)}" title="${title}">
      <strong class="labx-empty-state__title">${escapeHtml(asset.name)}</strong>
      <p>${escapeHtml(copy.t("mediaAnalysis.assetContent.unavailable", "Content unavailable"))}</p>
    </div>
  `;
}

const ICON_RAIL_SVGS: Record<LabIconRailSlotId, string> = {
  "roi-select": `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8V5a3 3 0 0 1 3-3h3"/><path d="M16 2h3a3 3 0 0 1 3 3v3"/><path d="M22 16v3a3 3 0 0 1-3 3h-3"/><path d="M8 22H5a3 3 0 0 1-3-3v-3"/></svg>`,
  "audio-focus": `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`,
  "frame-export": `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>`,
  "clip-export": `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/></svg>`,
  "enhanced-frame": `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z"/></svg>`,
  "image-comparison": `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="7" height="14" rx="1.5"/><rect x="14" y="5" width="7" height="14" rx="1.5"/><path d="M10 12h4"/><path d="m12 10 2 2-2 2"/></svg>`,
  "before-after": `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/></svg>`,
  "audio-extract": `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>`,
  "band-pass": `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
  denoise: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>`,
  "stem-separate": `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>`,
  stabilize: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2"/><line x1="12" y1="2" x2="12" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>`,
  "visual-adjust": `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>`,
};

type IconRailContentContext = {
  activeOperationCapabilityId: LabOperationCapabilityId | null;
  audioFocus: LabAudioFocusSettings;
  audioPreviewTarget: "audio" | "video";
  comparison: LabOperationComparisonState | null;
  comparisonPairActive: boolean;
  effectivePreviewAudioFocus: LabAudioFocusSettings;
  hasAudio: boolean;
  hasVisualControls: boolean;
  interactiveSettings: LabInteractiveSettings;
  operationCapabilities: LabOperationCapabilityProjection[];
  operationScope: LabOperationScopeState;
};

function renderIconRail(input: {
  activeSlotId: LabIconRailSlotId | null;
  content: IconRailContentContext;
  copy: LabI18n;
  locked: boolean;
  pinned: boolean;
}) {
  const { activeSlotId, content, copy, locked, pinned } = input;

  function isSlotVisible(slot: (typeof ICON_RAIL_SLOTS)[number]) {
    if (slot.content === "audio-focus") {
      return content.hasAudio;
    }
    if (slot.content === "visual-adjust") {
      return content.hasVisualControls;
    }
    if (slot.capabilityId === null) {
      return false;
    }
    if (slot.capabilityId === "image-comparison" && content.comparisonPairActive !== true) {
      return false;
    }
    return content.operationCapabilities.some(function (capability) {
      return (
        capability.id === slot.capabilityId &&
        capability.actionId !== null &&
        capability.planned !== true
      );
    });
  }

  function isSlotEnabled(slot: (typeof ICON_RAIL_SLOTS)[number]) {
    return isSlotVisible(slot);
  }

  const realtimeSlots = ICON_RAIL_SLOTS.filter(function (s) {
    return s.group === "realtime" && isSlotVisible(s);
  });
  const postProcessSlots = ICON_RAIL_SLOTS.filter(function (s) {
    return s.group === "post-process" && isSlotVisible(s);
  });

  function renderSlotButton(slot: (typeof ICON_RAIL_SLOTS)[number]) {
    const enabled = isSlotEnabled(slot);
    const disabled = locked || !enabled;
    const active = activeSlotId === slot.id && enabled;
    const label = copy.t(`mediaAnalysis.iconRail.${slot.id}`, slot.id);
    const svg = ICON_RAIL_SVGS[slot.id];
    return `<button
      class="labx-icon-rail__btn"
      type="button"
      data-lab-action="icon-rail-slot-select"
      data-lab-value="${escapeHtml(slot.id)}"
      data-active="${active ? "true" : "false"}"
      data-draft="${slot.draft ? "true" : "false"}"
      data-disabled="${disabled ? "true" : "false"}"
      aria-disabled="${disabled ? "true" : "false"}"
      aria-label="${escapeHtml(label)}"
      title="${escapeHtml(label)}"
      ${disabled ? "disabled" : ""}
    >${svg}${slot.draft ? `<span class="labx-icon-rail__draft-badge">${escapeHtml(copy.t("mediaAnalysis.iconRail.draft", "Draft"))}</span>` : ""}</button>`;
  }

  function renderGroup(slots: (typeof ICON_RAIL_SLOTS)[number][]) {
    return slots.map(renderSlotButton).join("");
  }

  const activeSlot =
    ICON_RAIL_SLOTS.find(function (s) {
      return s.id === activeSlotId && isSlotEnabled(s);
    }) ?? null;
  const popoverMarkup =
    activeSlot !== null ? renderIconRailPopover({ content, copy, pinned, slot: activeSlot }) : "";

  return `
    <aside class="labx-icon-rail" data-lab-region="icon-rail" data-pinned="${pinned ? "true" : "false"}" data-has-active="${activeSlot !== null ? "true" : "false"}" data-locked="${locked ? "true" : "false"}">
      <div class="labx-icon-rail__group" data-group="realtime">${renderGroup(realtimeSlots)}</div>
      <div class="labx-icon-rail__divider"></div>
      <div class="labx-icon-rail__group" data-group="post-process">${renderGroup(postProcessSlots)}</div>
      ${popoverMarkup}
    </aside>
  `;
}

function renderIconRailPopoverBody(
  slot: (typeof ICON_RAIL_SLOTS)[number],
  content: IconRailContentContext,
  copy: LabI18n
): string {
  if (slot.content === "audio-focus") {
    if (!content.hasAudio) {
      return "";
    }
    return renderWorkspaceAudioFocus(
      content.audioFocus,
      {
        previewTarget: content.audioPreviewTarget,
        temporalAudioFocus: content.effectivePreviewAudioFocus,
      },
      copy
    );
  }

  if (slot.content === "visual-adjust") {
    if (!content.hasVisualControls) {
      return "";
    }
    return renderWorkspaceInteractiveControls(content.interactiveSettings, copy);
  }

  if (slot.capabilityId === null) {
    return "";
  }
  const capability = content.operationCapabilities.find(function (c) {
    return c.id === slot.capabilityId;
  });
  if (!capability) {
    return "";
  }
  return renderCapabilityCard(
    capability,
    content.activeOperationCapabilityId,
    copy,
    content.operationScope,
    content.comparison,
    { hideTitle: true }
  );
}

function renderIconRailPopover(input: {
  content: IconRailContentContext;
  copy: LabI18n;
  pinned: boolean;
  slot: (typeof ICON_RAIL_SLOTS)[number];
}) {
  const { content, copy, pinned, slot } = input;
  const title = copy.t(`mediaAnalysis.iconRail.${slot.id}`, slot.id);
  const draftNotice = slot.draft
    ? `<p class="labx-icon-rail-popover__draft">${escapeHtml(copy.t("mediaAnalysis.iconRail.draft", "Taslak"))}</p>`
    : "";
  const bodyContent = renderIconRailPopoverBody(slot, content, copy);

  return `
    <div class="labx-icon-rail-popover" data-slot="${escapeHtml(slot.id)}" data-content="${escapeHtml(slot.content)}" data-pinned="${pinned ? "true" : "false"}">
      <div class="labx-icon-rail-popover__header">
        <span class="labx-icon-rail-popover__title">${escapeHtml(title)}</span>
        <button
          class="labx-icon-rail-popover__pin"
          type="button"
          data-lab-action="inspector-pin-toggle"
          aria-label="${escapeHtml(copy.t("mediaAnalysis.iconRail.pin", pinned ? "Sabitlemeyi kaldır" : "Sabitle"))}"
          data-pinned="${pinned ? "true" : "false"}"
        >${
          pinned
            ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>`
            : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>`
        }</button>
        <button
          class="labx-icon-rail-popover__close"
          type="button"
          data-lab-action="icon-rail-slot-select"
          data-lab-value=""
          aria-label="${escapeHtml(copy.t("mediaAnalysis.iconRail.close", "Kapat"))}"
        >&times;</button>
      </div>
      <div class="labx-icon-rail-popover__body">
        ${draftNotice}
        ${bodyContent}
      </div>
    </div>
  `;
}

function renderWorkspaceInspectorDrawer(input: {
  activeTab: LabWorkspaceControlTab;
  copy: LabI18n;
  focusClassName: string;
  open: boolean;
  panels: WorkspaceInspectorPanel[];
}) {
  const { copy, open, panels } = input;
  const toggleLabel = copy.t("mediaAnalysis.workspaceInspector.toggle", "Kontroller");
  const ariaLabel = copy.t(
    "mediaAnalysis.workspaceInspector.ariaLabel",
    "Çalışma alanı kontrolleri"
  );
  if (panels.length === 0) {
    return renderInspectorPanel({
      activeTab: input.activeTab,
      ariaLabel,
      content: "",
      empty: true,
      focusClassName: input.focusClassName,
      hidden: true,
      open: false,
    });
  }
  const activeTab = panels.some(function (panel) {
    return panel.id === input.activeTab;
  })
    ? input.activeTab
    : panels[0]?.id || "audio";

  return renderInspectorPanel({
    activeTab,
    ariaLabel,
    content: `
      <button
        class="labx-workspace-inspector__toggle"
        type="button"
        data-lab-action="workspace-controls-drawer-toggle"
        aria-expanded="${open ? "true" : "false"}"
      >
        <span>${escapeHtml(toggleLabel)}</span>
        <span class="labx-workspace-inspector__toggle-icon" aria-hidden="true">${open ? "›" : "‹"}</span>
      </button>
      <div class="labx-workspace-inspector__body" aria-hidden="${open ? "false" : "true"}">
        <div class="labx-workspace-inspector__tabs" role="tablist" aria-label="${escapeHtml(copy.t("mediaAnalysis.workspaceInspector.tabs", "Kontrol sekmeleri"))}">
          ${panels
            .map(function (panel) {
              const selected = panel.id === activeTab;
              return `<button
                class="labx-workspace-inspector__tab"
                type="button"
                role="tab"
                aria-selected="${selected ? "true" : "false"}"
                data-selected="${selected ? "true" : "false"}"
                data-lab-action="workspace-controls-tab-select"
                data-lab-value="${escapeHtml(panel.id)}"
              >${escapeHtml(panel.label)}</button>`;
            })
            .join("")}
        </div>
        <div class="labx-workspace-inspector__panels">
          ${panels
            .map(function (panel) {
              const selected = panel.id === activeTab;
              return `<section
                class="labx-workspace-inspector__panel"
                data-inspector-panel="${escapeHtml(panel.id)}"
                role="tabpanel"
                ${selected ? "" : "hidden"}
              >
                ${panel.markup}
              </section>`;
            })
            .join("")}
        </div>
      </div>
    `,
    focusClassName: input.focusClassName,
    open,
  });
}

export function renderWorkspaceSurface(
  state: LabStoreState,
  options: WorkspaceSurfaceOptions = {}
): LabWorkspaceSurface {
  const copy = options.copy ?? LAB_FALLBACK_I18N;
  if (!isLabWorkspaceSurfaceReady(state)) {
    return {
      inspector: renderWorkspaceInspectorDrawer({
        activeTab: state.ui.workspace.controlsDrawerTab,
        copy,
        focusClassName: "",
        open: false,
        panels: [],
      }),
      main: renderCenterSkeleton(copy),
      side: "",
    };
  }

  const source = getProjectSource(state);
  const sourceKind = getSourceKind(state);
  const sourceMode = getEffectiveSourceMode(state, sourceKind);
  const workspaceAsset = getActiveWorkspaceAsset(state);
  const comparisonReferenceAsset = getComparisonReferenceAsset(state);
  const workspaceAssetPreviewKind =
    workspaceAsset === null ? null : getWorkspaceAssetContentKind(workspaceAsset);
  const activePreviewKind = workspaceAssetPreviewKind ?? sourceKind;
  const activeMediaKind =
    activePreviewKind === "video" || activePreviewKind === "audio" || activePreviewKind === "image"
      ? activePreviewKind
      : "document";
  const probeStatus = getSourceProbeStatus(state);
  const viewportState = getMediaViewportState(state);
  const lockState = getWorkspaceLockState(state);
  const previewUrl = asNonEmptyString(source["previewUrl"]);
  const workspaceAssetPreviewUrl =
    workspaceAsset === null ? null : getLabAssetPreviewUrl(workspaceAsset);
  const processableWorkspaceMediaKind = getProcessableWorkspaceMediaKind(
    workspaceAssetPreviewKind,
    workspaceAssetPreviewUrl
  );
  const settings = getInteractiveSettings(state);
  const comparisonSettings = getComparisonInteractiveSettings(state);
  const operationSettings = asLabRecord(asLabRecord(state.workbench)["operationSettings"]);
  const imageComparisonSettings = normalizeLabOperationSettings(
    "image-comparison",
    operationSettings["image-comparison"]
  );
  const audioFocus = getAudioFocusSettings(state);
  const effectivePreviewAudioFocus = getEffectivePreviewAudioFocusSettings(state);
  const roiRegions = getROIRegions(state);
  const activeSelection = getActiveSelection(state);
  const activeSelectionIsFullSource = isFullSourceWorkspaceSelection(activeSelection);
  const timeline = getWaveformTimelineModel(state);
  const timelineModel: LabWaveformTimelineModel = {
    ...timeline,
    copy,
    focusClassName: getLabFocusClassName(state, "timeline"),
    selectionPanelPlacement: "side",
  };
  const roiFocusActive = timeline.roiFocusActive === true;
  const hasAudio = activeMediaKind === "audio" || activeMediaKind === "video";
  const sourceReady =
    viewportState === "active" &&
    probeStatus === "completed" &&
    isLoadedSourceMatchingMode(source, sourceMode);
  const workspaceAssetReady =
    workspaceAsset !== null &&
    workspaceAssetPreviewKind !== null &&
    workspaceAssetPreviewKind !== "unsupported";
  const previewReady = workspaceAsset === null ? sourceReady : workspaceAssetReady;
  const hasVisualControls =
    previewReady && (activeMediaKind === "video" || activeMediaKind === "image");
  const operationCapabilities = previewReady ? getAvailableOperationCapabilities(state) : [];
  const comparisonFindingItems = getComparisonFindingListItems(state);
  const activeOperationCapabilityId = getOperationCapabilityIdForAction(
    timeline.activeExecutionIntent?.actionType
  );
  const operationScope: LabOperationScopeState = {
    hasRoi: activeSelection?.roi !== undefined,
    hasTimeRange:
      activeMediaKind !== "image" &&
      ((activeSelection !== null &&
        activeSelection.endMs > activeSelection.startMs &&
        !activeSelectionIsFullSource) ||
        (timeline.startMs !== null &&
          timeline.endMs !== null &&
          timeline.endMs > timeline.startMs)),
  };
  const comparisonReferencePreviewUrl =
    comparisonReferenceAsset === null ? null : getLabAssetPreviewUrl(comparisonReferenceAsset);
  const primaryComparisonPreviewUrl =
    activeMediaKind !== "image"
      ? null
      : workspaceAsset !== null
        ? workspaceAssetPreviewUrl
        : previewUrl;
  const primaryComparisonLabel =
    workspaceAsset?.name ||
    asNonEmptyString(source["name"]) ||
    asNonEmptyString(source["title"]) ||
    copy.t("mediaAnalysis.operations.comparison.activeImageFallback", "Aktif resim");
  const comparisonState: LabOperationComparisonState = {
    activeSide: state.ui.workspace.comparisonRois.activeSide,
    findingNote: state.ui.workspace.comparisonFindingNote,
    primaryLabel: activeMediaKind === "image" ? primaryComparisonLabel : null,
    primaryRoi: state.ui.workspace.comparisonRois.primary,
    referenceLabel: comparisonReferenceAsset?.name || null,
    referenceRoi: state.ui.workspace.comparisonRois.reference,
    splitPercent: state.ui.workspace.comparisonSplitPercent,
    viewMode: state.ui.workspace.comparisonViewMode,
  };
  const comparisonPreviewActive =
    previewReady &&
    activeMediaKind === "image" &&
    primaryComparisonPreviewUrl !== null &&
    comparisonReferencePreviewUrl !== null;
  const durationMs = previewReady ? timelineModel.durationMs : 0;
  const inspectorPanels: WorkspaceInspectorPanel[] = [
    hasAudio && previewReady
      ? {
          id: "audio",
          label: copy.t("mediaAnalysis.audioFocus.eyebrow", "Ses Odağı"),
          markup: renderWorkspaceAudioFocus(
            audioFocus,
            {
              previewTarget: activeMediaKind === "video" ? "video" : "audio",
              temporalAudioFocus: effectivePreviewAudioFocus,
            },
            copy
          ),
        }
      : null,
    hasVisualControls
      ? {
          id: "visual",
          label: copy.t("mediaAnalysis.interactiveControls.title", "Görsel Ayarlar"),
          markup: renderWorkspaceInteractiveControls(settings, copy),
        }
      : null,
    operationCapabilities.length > 0
      ? {
          id: "operations",
          label: copy.t("mediaAnalysis.operations.tab", "Operations"),
          markup: [
            renderComparisonFindingMiniList(comparisonFindingItems, copy),
            renderWorkspaceOperationControls(
              operationCapabilities,
              activeOperationCapabilityId,
              copy,
              operationScope,
              comparisonState
            ),
          ].join(""),
        }
      : null,
  ].filter((panel): panel is WorkspaceInspectorPanel => panel !== null);
  const inspectorMarkup = renderWorkspaceInspectorDrawer({
    activeTab: state.ui.workspace.controlsDrawerTab,
    copy,
    focusClassName: getLabFocusClassName(state, "inspector"),
    open: state.ui.workspace.controlsDrawerOpen,
    panels: inspectorPanels,
  });
  const singleInspectionKind =
    processableWorkspaceMediaKind ??
    (workspaceAsset === null && sourceReady && (sourceKind === "video" || sourceKind === "image")
      ? sourceKind
      : null);
  const roiOverlayMarkup =
    singleInspectionKind !== null
      ? renderWorkspaceROIOverlay(
          {
            legacyRegions: roiRegions,
            roiFocusActive,
            selectionRoi: activeSelection?.roi ?? null,
            selectionRoiEnabled: true,
            mutationLocked: lockState.roi,
            sourceKind: singleInspectionKind,
          },
          copy
        )
      : "";
  const previewMediaMarkup =
    workspaceAsset !== null
      ? processableWorkspaceMediaKind !== null && workspaceAssetPreviewUrl !== null
        ? renderWorkspaceAssetProcessableMedia(
            processableWorkspaceMediaKind,
            workspaceAssetPreviewUrl,
            settings,
            copy
          )
        : renderWorkspaceAssetContent(state, workspaceAsset, sourceKind, settings, copy)
      : viewportState === "active"
        ? renderPreviewMedia(sourceKind, sourceReady ? previewUrl : null, settings, copy)
        : renderViewportStatePanel(
            viewportState === "loading" || viewportState === "error" ? viewportState : "empty",
            getSourceRetryBlockReason(state),
            copy
          );
  const previewMarkup = comparisonPreviewActive
    ? renderComparisonPreview({
        activeSide: state.ui.workspace.comparisonRois.activeSide,
        comparisonRois: state.ui.workspace.comparisonRois,
        copy,
        mode: state.ui.workspace.comparisonViewMode,
        mutationLocked: lockState.roi,
        primaryLabel: primaryComparisonLabel,
        primaryUrl: primaryComparisonPreviewUrl,
        referenceLabel:
          comparisonReferenceAsset?.name ||
          copy.t("mediaAnalysis.operations.comparison.referenceFallback", "Referans"),
        referenceUrl: comparisonReferencePreviewUrl,
        settings: comparisonSettings,
        toolSettings: imageComparisonSettings,
        roiFocusActive,
        splitPercent: state.ui.workspace.comparisonSplitPercent,
      })
    : singleInspectionKind !== null
      ? renderSingleInspectionStage({
          mediaMarkup: previewMediaMarkup,
          roiFocusActive,
          roiOverlayMarkup,
          sourceKind: singleInspectionKind,
          workspaceAsset,
          workspaceAssetKind: workspaceAssetPreviewKind,
        })
      : previewMediaMarkup;
  const selectionPanelMarkup = renderLabWaveformSelectionPanel(timelineModel);
  const previewFocusClassName = getLabFocusClassName(state, "preview");
  const runActive = isRunActive(state);
  const heavyWorkActive = isAnyHeavyWorkActive(state);
  const iconRailMarkup = previewReady
    ? renderIconRail({
        activeSlotId: state.ui.workspace.activeIconRailSlot,
        content: {
          activeOperationCapabilityId,
          audioFocus,
          audioPreviewTarget: activeMediaKind === "video" ? "video" : "audio",
          comparison: comparisonState,
          comparisonPairActive: comparisonPreviewActive,
          effectivePreviewAudioFocus,
          hasAudio,
          hasVisualControls,
          interactiveSettings: settings,
          operationCapabilities,
          operationScope,
        },
        copy,
        locked: heavyWorkActive,
        pinned: state.ui.workspace.inspectorPinned,
      })
    : "";

  const main = `
    <section class="labx-workspace-main" id="lab-workspace-main" data-analysis-locked="${runActive ? "true" : "false"}" aria-disabled="${runActive ? "true" : "false"}">
      <div class="labx-workspace-stage" data-lab-workspace-stage="true">
        <div class="labx-media-workbench" data-lab-region="main-stage-inner" data-lab-media-workbench="true" data-analysis-locked="${runActive ? "true" : "false"}"${runActive ? " inert" : ""}>
          ${renderPreviewArea({ content: previewMarkup, focusClassName: previewFocusClassName })}
          ${renderTimelineArea(durationMs > 0 && !comparisonPreviewActive ? renderLabWaveformTimeline(timelineModel) : "")}
        </div>
        ${iconRailMarkup}
      </div>
    </section>
  `;

  return { inspector: inspectorMarkup, main, side: selectionPanelMarkup };
}
