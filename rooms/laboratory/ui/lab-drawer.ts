import { escapeHtml } from "../domain/lab-types.js";
import type {
  CapabilityFamilyId,
  LabDecisionIntent,
  LabDecisionState,
  LabDrawerMode,
  LabPipelineBlock,
  LabStoreState,
  LabWorkspaceSurface,
} from "../domain/lab-types.js";
import {
  buildAnalysisPreviewSentence,
  getActiveExecutionIntent,
  getAnalysisActionBlockReason,
  getAnalysisPreparationGroups,
  getCurrentPreflight,
  getDrawerCollapsed,
  getPreflightSeverity,
  getPreflightWarnings,
  getReadyAnalysisPreparationGroups,
  getReadySelectedAnalysisCapabilityIds,
  getSourceReady,
  isLabWorkspaceSurfaceReady,
  resolveDrawerMode,
} from "../runtime/lab-selectors.js";
import { LAB_FALLBACK_I18N } from "./lab-i18n.js";
import type { LabI18n } from "./lab-i18n.js";
import { renderContextPanel, renderPipeline } from "./laboratory-layout.js";
import { translateLabRuntimeText } from "./lab-runtime-i18n.js";
import { renderLabSettingsFields } from "./lab-settings-controls.js";
import { getSelectionTabActive, renderModePills } from "./lab-top-bar.js";
import { buildLabDecisionSnapshot } from "./lab-decision-layer.js";
import { renderExploreMode, renderResultMode } from "./lab-drawer-result-explore.js";

type AnalysisPreparationGroup = ReturnType<typeof getReadyAnalysisPreparationGroups>[number];
type RunningStageStatus = "pending" | "active" | "complete" | "error" | "cancelled";

// ---------------------------------------------------------------------------
// Mode headers
// ---------------------------------------------------------------------------

const MODE_HEADERS: Record<
  LabDrawerMode,
  { eyebrowKey: string; eyebrowFallback: string; titleKey: string; titleFallback: string }
> = {
  setup: {
    eyebrowKey: "mediaAnalysis.drawer.setup.eyebrow",
    eyebrowFallback: "Configuration",
    titleKey: "mediaAnalysis.drawer.setup.title",
    titleFallback: "Analysis Preparation",
  },
  running: {
    eyebrowKey: "mediaAnalysis.drawer.running.eyebrow",
    eyebrowFallback: "Running",
    titleKey: "mediaAnalysis.drawer.running.title",
    titleFallback: "Analysis Progress",
  },
  result: {
    eyebrowKey: "mediaAnalysis.drawer.result.eyebrow",
    eyebrowFallback: "Result",
    titleKey: "mediaAnalysis.drawer.result.title",
    titleFallback: "Decision Surface",
  },
  explore: {
    eyebrowKey: "mediaAnalysis.drawer.explore.eyebrow",
    eyebrowFallback: "Explore",
    titleKey: "mediaAnalysis.drawer.explore.title",
    titleFallback: "Alternatives and Comparison",
  },
};

const MODE_BADGE_TONE: Record<LabDrawerMode, string> = {
  setup: "",
  running: "running",
  result: "success",
  explore: "",
};

function renderDrawerHeader(mode: LabDrawerMode, copy: LabI18n) {
  const h = MODE_HEADERS[mode];
  const badgeTone = MODE_BADGE_TONE[mode];
  const badgeLabel = copy.t(h.eyebrowKey, h.eyebrowFallback);
  const badge =
    badgeTone !== ""
      ? `<span class="labx-drawer__status-badge" data-badge-tone="${escapeHtml(badgeTone)}">${escapeHtml(badgeLabel)}</span>`
      : `<span class="labx-drawer__status-badge">${escapeHtml(badgeLabel)}</span>`;
  return `
    <div class="labx-drawer__header">
      <h2>${escapeHtml(copy.t(h.titleKey, h.titleFallback))}</h2>
      ${badge}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Decision-driven header
// ---------------------------------------------------------------------------

const DECISION_HEADER_LABELS: Record<LabDecisionIntent, { title: string; subtitle: string }> = {
  idle: { title: "Beklemede", subtitle: "Kaynak yükleyin" },
  "preparing-analysis": { title: "Hazırlanıyor", subtitle: "Kaynak veya seçim bekleniyor" },
  "ready-to-run": { title: "Hazır", subtitle: "Analiz başlatılabilir" },
  "running-analysis": { title: "Analiz Ediliyor", subtitle: "Modüller çalışıyor" },
  "reviewing-results": { title: "Sonuçlar", subtitle: "Analiz tamamlandı" },
  "exploring-alternatives": { title: "Keşif", subtitle: "Alternatifler değerlendiriliyor" },
};

function renderDecisionHeader(
  intent: LabDecisionIntent,
  decisionState: LabDecisionState,
  copy: LabI18n
) {
  const labels = DECISION_HEADER_LABELS[intent];
  const title = copy.t(`mediaAnalysis.decisionHeader.${intent}.title`, labels.title);
  const subtitle = copy.t(`mediaAnalysis.decisionHeader.${intent}.subtitle`, labels.subtitle);
  return `
    <div class="labx-decision-header" data-decision-state="${escapeHtml(decisionState)}">
      <h2 class="labx-decision-header__title">${escapeHtml(title)}</h2>
      <p class="labx-decision-header__subtitle">${escapeHtml(subtitle)}</p>
    </div>
  `;
}

function renderDrawerBody(blocks: LabPipelineBlock[], mode: LabDrawerMode) {
  return `
    <div class="labx-drawer__body">
      ${renderPipeline(blocks, mode)}
    </div>
  `;
}

function getAnalysisModuleLabel(
  module: AnalysisPreparationGroup["modules"][number],
  copy: LabI18n
) {
  if (module.capabilityId === "visual-structure" || module.capabilityId === "visual-forensics") {
    return copy.t(`visualAnalysis.catalog.modules.${module.moduleId}.title`, module.label);
  }
  return copy.t(`audioAnalysis.catalog.modules.${module.moduleId}.title`, module.label);
}

function getReportSectionLabel(module: AnalysisPreparationGroup["modules"][number], copy: LabI18n) {
  return copy.t(
    `mediaAnalysis.drawer.setup.reportSections.${module.capabilityId}`,
    module.reportSection
  );
}

// ---------------------------------------------------------------------------
// Setup mode
// ---------------------------------------------------------------------------

function renderAnalysisPreparationGroupBody(
  group: AnalysisPreparationGroup,
  activeCapabilityIds: CapabilityFamilyId[],
  copy: LabI18n
) {
  return `
    <div
      class="labx-analysis-group"
      data-selected="${group.selected ? "true" : "false"}"
      data-readiness="${escapeHtml(group.readiness)}"
    >
      <div class="labx-analysis-group__modules">
        ${group.modules
          .map(function (module) {
            const moduleLabel = getAnalysisModuleLabel(module, copy);
            const reportSection = getReportSectionLabel(module, copy);
            const blockReason = module.blockReason
              ? translateLabRuntimeText(module.blockReason, copy)
              : "";
            const toolSummary = module.requiredTools.concat(module.optionalTools).join(", ");
            const moduleMeta = [
              module.status,
              module.sourceKinds.join("/"),
              toolSummary === "" ? null : toolSummary,
            ]
              .filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
              .join(" · ");
            return `
              <div
                class="labx-analysis-module"
                data-readiness="${escapeHtml(module.readiness)}"
                data-active="${activeCapabilityIds.includes(module.capabilityId) ? "true" : "false"}"
              >
                <label class="labx-analysis-module__toggle">
                  <input
                    type="checkbox"
                    ${module.enabled ? "checked" : ""}
                    data-lab-action="module-toggle"
                    data-lab-value="${escapeHtml(`${group.capabilityId}::${module.moduleId}`)}"
                  />
                  <span>
                    <strong>${escapeHtml(moduleLabel)}</strong>
                    <small>${escapeHtml(reportSection)}${blockReason !== "" ? ` · ${escapeHtml(blockReason)}` : ""}</small>
                    ${moduleMeta === "" ? "" : `<small>${escapeHtml(moduleMeta)}</small>`}
                  </span>
                </label>
                ${renderLabSettingsFields({
                  fields: module.settingsFields,
                  prefix: `analysisSettings.modules.${module.moduleId}`,
                  resetAction: "analysis-settings-reset",
                  resetLabel: copy.t("mediaAnalysis.settings.reset", "Reset"),
                  resetValue: module.moduleId,
                  settings: module.settings,
                  title: copy.t("mediaAnalysis.drawer.setup.moduleSettings", "Settings"),
                  toggleLabel: copy.t("mediaAnalysis.settings.edit", "Edit"),
                  translate: copy.t,
                })}
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function renderAnalysisPreparationAccordion(
  group: AnalysisPreparationGroup,
  expanded: boolean,
  activeCapabilityIds: CapabilityFamilyId[],
  copy: LabI18n
) {
  const selectionState = group.selectionState;
  const fullySelected = selectionState === "full";
  const partiallySelected = selectionState === "partial";
  const selected = fullySelected || partiallySelected;
  const groupActive = group.modules.some(function (module) {
    return activeCapabilityIds.includes(module.capabilityId);
  });
  const readiness = group.readiness;
  const moduleCount = group.modules.length;
  const enabledModuleCount = group.modules.filter(function (module) {
    return module.enabled;
  }).length;
  const toggleLabel = expanded
    ? copy.t("mediaAnalysis.drawer.setup.collapseGroup", "Collapse")
    : copy.t("mediaAnalysis.drawer.setup.expandGroup", "Expand");

  return `
    <div
      class="labx-drawer__intent-cluster"
      data-selected="${String(selected)}"
      data-selection-state="${escapeHtml(selectionState)}"
      data-expanded="${String(expanded)}"
      data-readiness="${escapeHtml(readiness)}"
      data-active="${String(groupActive)}"
    >
      <div class="labx-drawer__intent-head">
        <label class="labx-drawer__intent-item">
          <input
            type="checkbox"
            ${fullySelected ? "checked" : ""}
            aria-checked="${partiallySelected ? "mixed" : String(fullySelected)}"
            data-lab-indeterminate="${partiallySelected ? "true" : "false"}"
            data-selection-state="${escapeHtml(selectionState)}"
            data-lab-action="analysis-prep-group-toggle"
            data-lab-value="${escapeHtml(group.capabilityId)}"
          />
          <span>
            <strong>${escapeHtml(group.label)}</strong>
            <small>${escapeHtml(group.description)}</small>
          </span>
        </label>
        <button
          class="labx-drawer__intent-toggle"
          type="button"
          data-lab-action="analysis-prep-group-drawer-toggle"
          data-lab-value="${escapeHtml(group.capabilityId)}"
          aria-expanded="${String(expanded)}"
          aria-label="${escapeHtml(toggleLabel)}"
          title="${escapeHtml(toggleLabel)}"
        >
          ${expanded ? "-" : "+"}
        </button>
      </div>
      <div class="labx-drawer__intent-summary">
        <span>${escapeHtml(readiness)}</span>
        ${
          moduleCount > 0
            ? `<span>${escapeHtml(String(enabledModuleCount))}/${escapeHtml(String(moduleCount))}</span>`
            : ""
        }
      </div>
      ${expanded ? renderAnalysisPreparationGroupBody(group, activeCapabilityIds, copy) : ""}
    </div>
  `;
}

function getRunningPlanModuleStatus(state: LabStoreState, moduleId: string) {
  return state.run?.modules[moduleId]?.status ?? "idle";
}

function getRunningPlanStatusLabel(status: string, copy: LabI18n) {
  switch (status) {
    case "running":
      return copy.t("mediaAnalysis.drawer.running.planStatus.running", "Analiz ediliyor");
    case "queued":
      return copy.t("mediaAnalysis.drawer.running.planStatus.queued", "Sırada");
    case "completed":
      return copy.t("mediaAnalysis.drawer.running.planStatus.completed", "Tamamlandı");
    case "failed":
      return copy.t("mediaAnalysis.drawer.running.planStatus.failed", "Hata verdi");
    case "cancelled":
      return copy.t("mediaAnalysis.drawer.running.planStatus.cancelled", "İptal edildi");
    case "skipped":
      return copy.t("mediaAnalysis.drawer.running.planStatus.skipped", "Atlandı");
    default:
      return copy.t("mediaAnalysis.drawer.running.planStatus.ready", "Hazır");
  }
}

function getRunningPlanGroupStatus(group: AnalysisPreparationGroup, state: LabStoreState): string {
  const statuses = group.modules
    .filter(function (module) {
      return module.enabled;
    })
    .map(function (module) {
      return getRunningPlanModuleStatus(state, module.moduleId);
    });
  if (statuses.some((status) => status === "running")) return "running";
  if (statuses.some((status) => status === "queued")) return "queued";
  if (statuses.some((status) => status === "failed")) return "failed";
  if (statuses.some((status) => status === "cancelled")) return "cancelled";
  if (statuses.length > 0 && statuses.every((status) => status === "completed")) return "completed";
  return "ready";
}

function renderRunningPlanGroup(
  group: AnalysisPreparationGroup,
  state: LabStoreState,
  copy: LabI18n
) {
  const enabledModules = group.modules.filter(function (module) {
    return module.enabled;
  });
  const status = getRunningPlanGroupStatus(group, state);
  const active = status === "running" || status === "queued";
  const statusLabel = getRunningPlanStatusLabel(status, copy);

  return `
    <div
      class="labx-drawer__intent-cluster labx-drawer__intent-cluster--locked"
      data-selected="true"
      data-expanded="false"
      data-readiness="${escapeHtml(group.readiness)}"
      data-status="${escapeHtml(status)}"
      data-active="${active ? "true" : "false"}"
    >
      <div class="labx-drawer__intent-head labx-drawer__intent-head--locked">
        <div class="labx-drawer__intent-item labx-drawer__intent-item--static">
          <span>
            <strong>${escapeHtml(group.label)}</strong>
            <small>${escapeHtml(group.description)}</small>
          </span>
        </div>
      </div>
      <div class="labx-drawer__intent-summary">
        <span>${escapeHtml(statusLabel)}</span>
        <span>${escapeHtml(String(enabledModules.length))}/${escapeHtml(String(group.modules.length))}</span>
      </div>
    </div>
  `;
}

function getRunModuleStatusCounts(state: LabStoreState) {
  const run = state.run;
  const moduleIds = run?.moduleOrder ?? [];
  const completedCount = moduleIds.filter(function (moduleId) {
    const status = run?.modules[moduleId]?.status;
    return status === "completed" || status === "ready";
  }).length;
  const activeCount = moduleIds.filter(function (moduleId) {
    const status = run?.modules[moduleId]?.status;
    return status === "running" || status === "queued";
  }).length;
  const failedCount = moduleIds.filter(function (moduleId) {
    return run?.modules[moduleId]?.status === "failed";
  }).length;
  const cancelledCount = moduleIds.filter(function (moduleId) {
    return run?.modules[moduleId]?.status === "cancelled";
  }).length;

  return {
    activeCount,
    cancelledCount,
    completedCount,
    failedCount,
    totalCount: moduleIds.length,
  };
}

function renderRunningPlanFallback(state: LabStoreState, copy: LabI18n) {
  const run = state.run;
  if (run === null || run.moduleOrder.length === 0) {
    return "";
  }

  const counts = getRunModuleStatusCounts(state);
  const active = counts.activeCount > 0;
  const status =
    counts.failedCount > 0
      ? "failed"
      : counts.cancelledCount > 0
        ? "cancelled"
        : active
          ? "running"
          : counts.totalCount > 0 && counts.completedCount === counts.totalCount
            ? "completed"
            : "queued";

  return `
    <div
      class="labx-drawer__intent-cluster labx-drawer__intent-cluster--locked"
      data-selected="true"
      data-expanded="false"
      data-readiness="ready"
      data-status="${escapeHtml(status)}"
      data-active="${active ? "true" : "false"}"
    >
      <div class="labx-drawer__intent-head labx-drawer__intent-head--locked">
        <div class="labx-drawer__intent-item labx-drawer__intent-item--static">
          <span>
            <strong>${escapeHtml(copy.t("mediaAnalysis.drawer.running.moduleFallbackTitle", "Active modules"))}</strong>
            <small>${escapeHtml(copy.t("mediaAnalysis.drawer.running.moduleFallbackSubtitle", "Runtime events are keeping this plan visible."))}</small>
          </span>
        </div>
      </div>
      <div class="labx-drawer__intent-summary">
        <span>${escapeHtml(getRunningPlanStatusLabel(status, copy))}</span>
        <span>${escapeHtml(String(counts.completedCount))}/${escapeHtml(String(counts.totalCount))}</span>
      </div>
    </div>
  `;
}

function renderRunningAnalysisPlan(state: LabStoreState, copy: LabI18n) {
  const selectedCapabilityIds = new Set(state.selectedCapabilities);
  const groupsMarkup = getAnalysisPreparationGroups(state)
    .filter(function (group) {
      return selectedCapabilityIds.has(group.capabilityId) || group.selected;
    })
    .map(function (group) {
      return renderRunningPlanGroup(group, state, copy);
    })
    .join("");
  const bodyMarkup = groupsMarkup !== "" ? groupsMarkup : renderRunningPlanFallback(state, copy);

  return `
    <section
      class="labx-drawer__section labx-drawer__intents labx-drawer__intents--running"
      data-lab-running-plan="true"
      aria-disabled="true"
    >
      <h3>${escapeHtml(copy.t("mediaAnalysis.drawer.setup.analysisTitle", "Analysis Modules"))}</h3>
      ${
        bodyMarkup !== ""
          ? `<div class="labx-drawer__intent-list">${bodyMarkup}</div>`
          : `<p class="labx-drawer__ok">${escapeHtml(copy.t("mediaAnalysis.drawer.running.planResolving", "Analiz planı hazırlanıyor."))}</p>`
      }
    </section>
  `;
}

function getRunningStageStatusLabel(status: RunningStageStatus, copy: LabI18n) {
  const labels: Record<RunningStageStatus, { key: string; fallback: string }> = {
    active: {
      key: "mediaAnalysis.drawer.running.stageStatus.active",
      fallback: "Active",
    },
    cancelled: {
      key: "mediaAnalysis.drawer.running.stageStatus.cancelled",
      fallback: "Cancelled",
    },
    complete: {
      key: "mediaAnalysis.drawer.running.stageStatus.complete",
      fallback: "Complete",
    },
    error: {
      key: "mediaAnalysis.drawer.running.stageStatus.error",
      fallback: "Error",
    },
    pending: {
      key: "mediaAnalysis.drawer.running.stageStatus.pending",
      fallback: "Pending",
    },
  };
  const label = labels[status];
  return copy.t(label.key, label.fallback);
}

function renderRunningStageTracker(state: LabStoreState, copy: LabI18n) {
  const run = state.run;
  const counts = getRunModuleStatusCounts(state);
  const runState = run?.state ?? "running";
  const runFinished =
    runState === "completed" ||
    runState === "ready" ||
    runState === "failed" ||
    runState === "cancelled";
  const runFailed = runState === "failed";
  const runCancelled = runState === "cancelled";
  const moduleStageStatus: RunningStageStatus = runFailed
    ? "error"
    : runCancelled
      ? "cancelled"
      : runFinished
        ? "complete"
        : "active";
  const reportStageStatus: RunningStageStatus =
    runState === "completed" || runState === "ready"
      ? "complete"
      : runFailed
        ? "error"
        : runCancelled
          ? "cancelled"
          : "pending";
  const progressPercent =
    counts.totalCount > 0 ? Math.round((counts.completedCount / counts.totalCount) * 100) : null;
  const progressLabel =
    progressPercent === null
      ? copy.t("mediaAnalysis.drawer.running.progressResolving", "Resolving module plan")
      : copy.t("mediaAnalysis.drawer.running.progressCount", "{done}/{total} modules", {
          done: counts.completedCount,
          total: counts.totalCount,
        });
  const preflightAutoRunEnabled = state.ui.workspace.preflightAutoRunEnabled !== false;
  const stages: Array<{
    id: string;
    label: string;
    detail: string;
    status: RunningStageStatus;
  }> = [
    {
      id: "scope",
      label: copy.t("mediaAnalysis.drawer.running.stages.scope", "Scope"),
      detail:
        run !== null && run.analysisScope !== null
          ? copy.t("mediaAnalysis.drawer.running.stageDetails.scopeLocked", "Locked for this run")
          : copy.t("mediaAnalysis.drawer.running.stageDetails.scopeStarted", "Run started"),
      status: "complete",
    },
    {
      id: "preflight",
      label: copy.t("mediaAnalysis.drawer.running.stages.preflight", "Preflight"),
      detail:
        preflightAutoRunEnabled !== true
          ? copy.t(
              "mediaAnalysis.drawer.running.stageDetails.preflightSkipped",
              "Preflight is passive"
            )
          : counts.totalCount > 0 || runFinished
            ? copy.t("mediaAnalysis.drawer.running.stageDetails.preflightComplete", "Checks passed")
            : copy.t(
                "mediaAnalysis.drawer.running.stageDetails.preflightActive",
                "Preparing tools"
              ),
      status:
        preflightAutoRunEnabled !== true || counts.totalCount > 0 || runFinished
          ? "complete"
          : "active",
    },
    {
      id: "modules",
      label: copy.t("mediaAnalysis.drawer.running.stages.modules", "Modules"),
      detail: progressLabel,
      status: moduleStageStatus,
    },
    {
      id: "report",
      label: copy.t("mediaAnalysis.drawer.running.stages.report", "Report"),
      detail:
        reportStageStatus === "complete"
          ? copy.t("mediaAnalysis.drawer.running.stageDetails.reportComplete", "Report is ready")
          : reportStageStatus === "error"
            ? copy.t("mediaAnalysis.drawer.running.stageDetails.reportError", "Needs review")
            : reportStageStatus === "cancelled"
              ? copy.t("mediaAnalysis.drawer.running.stageDetails.reportCancelled", "Run stopped")
              : copy.t(
                  "mediaAnalysis.drawer.running.stageDetails.reportPending",
                  "Waiting on modules"
                ),
      status: reportStageStatus,
    },
  ];

  return `
    <section class="labx-drawer__section labx-running-stages" data-lab-running-stages="true">
      <div class="labx-running-stages__head">
        <h3>${escapeHtml(copy.t("mediaAnalysis.drawer.running.stagesTitle", "Analysis stages"))}</h3>
        <span>${escapeHtml(progressLabel)}</span>
      </div>
      <ol class="labx-running-stages__list">
        ${stages
          .map(function (stage) {
            return `
              <li data-stage="${escapeHtml(stage.id)}" data-status="${escapeHtml(stage.status)}">
                <span class="labx-running-stages__dot" aria-hidden="true"></span>
                <span>
                  <strong>${escapeHtml(stage.label)}</strong>
                  <small>${escapeHtml(stage.detail)} · ${escapeHtml(getRunningStageStatusLabel(stage.status, copy))}</small>
                </span>
              </li>
            `;
          })
          .join("")}
      </ol>
      <div class="labx-running-stages__progress" data-indeterminate="${progressPercent === null && runFinished !== true ? "true" : "false"}" aria-hidden="true">
        <span style="width:${escapeHtml(String(progressPercent ?? 100))}%"></span>
      </div>
    </section>
  `;
}

function getActiveAnalysisCapabilityIds(state: LabStoreState): CapabilityFamilyId[] {
  const activeExecutionIntent = getActiveExecutionIntent(state);
  if (activeExecutionIntent?.flowKind === "operation-result") {
    return [];
  }
  switch (activeExecutionIntent?.actionType) {
    case "inspect-audio":
      return ["audio-signal", "audio-recovery"];
    case "inspect-motion":
    case "detect-scenes":
    case "detect-objects":
      return ["visual-structure"];
    case "focus-region":
    case "ocr-region":
    case "metadata-audit":
      return ["visual-forensics"];
    case "analyze-segment":
      return ["visual-structure", "visual-forensics", "audio-signal"];
    case "extract-clip":
    case "enhance-visual":
    case "enhance-frame":
    case "crop-region":
    case "clean-audio":
    case "separate-stems":
    case "stabilize-segment":
    case undefined:
      return [];
    default:
      return [];
  }
}

function formatPreflightRuntime(seconds: number | null, copy: LabI18n) {
  if (seconds === null || Number.isFinite(seconds) !== true) {
    return copy.t("mediaAnalysis.drawer.setup.preflightRuntimeUnknown", "Bilinmiyor");
  }
  if (seconds < 60) {
    return copy.t("mediaAnalysis.drawer.setup.preflightRuntimeSeconds", "{seconds} sn", {
      seconds: Math.max(1, Math.round(seconds)),
    });
  }
  return copy.t("mediaAnalysis.drawer.setup.preflightRuntimeMinutes", "{minutes} dk", {
    minutes: Math.max(1, Math.round(seconds / 60)),
  });
}

function renderPreflightDetailRows(state: LabStoreState, copy: LabI18n) {
  const preflight = getCurrentPreflight(state);
  const enabledModules = preflight.enabledModules.length > 0 ? preflight.enabledModules : [];
  const rows = [
    {
      label: copy.t("mediaAnalysis.drawer.setup.preflightStatus", "Durum"),
      value: preflight.rawStatus || preflight.status,
    },
    {
      label: copy.t("mediaAnalysis.drawer.setup.preflightRuntime", "Tahmini sure"),
      value: formatPreflightRuntime(preflight.estimatedRuntime, copy),
    },
    {
      label: copy.t("mediaAnalysis.drawer.setup.preflightModules", "Aktif moduller"),
      value:
        enabledModules.length > 0
          ? enabledModules.join(", ")
          : copy.t("mediaAnalysis.drawer.setup.preflightNoModules", "Yok"),
    },
  ];
  return `<dl class="labx-drawer__preflight-details">${rows
    .map(function (row) {
      return `<div><dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(row.value)}</dd></div>`;
    })
    .join("")}</dl>`;
}

function renderSetupMode(state: LabStoreState, copy: LabI18n) {
  const sourceReady = getSourceReady(state);
  const analysisGroups = getReadyAnalysisPreparationGroups(state);
  const activeAnalysisCapabilityIds = getActiveAnalysisCapabilityIds(state);
  const selectedCapabilityIds = getReadySelectedAnalysisCapabilityIds(state);
  const blockReason = getAnalysisActionBlockReason(state);
  const preflightSeverity = getPreflightSeverity(state);
  const preflightWarnings = getPreflightWarnings(state);
  const previewSentence = buildAnalysisPreviewSentence(state);
  const preflightAutoRunEnabled = state.ui.workspace.preflightAutoRunEnabled !== false;

  const analysisMarkup = sourceReady
    ? `<section class="labx-drawer__section labx-drawer__intents">
        <h3>${escapeHtml(copy.t("mediaAnalysis.drawer.setup.analysisTitle", "Analysis Modules"))}</h3>
        <div class="labx-drawer__intent-list">
          ${
            analysisGroups.length > 0
              ? analysisGroups
                  .map(function (analysisGroup) {
                    const expanded = state.ui.workspace.analysisPrepExpandedCapabilityIds.includes(
                      analysisGroup.capabilityId
                    );
                    return renderAnalysisPreparationAccordion(
                      analysisGroup,
                      expanded,
                      activeAnalysisCapabilityIds,
                      copy
                    );
                  })
                  .join("")
              : `<p class="labx-drawer__empty">${escapeHtml(copy.t("mediaAnalysis.drawer.setup.noReadyAnalyses", "Mevcut araclarla yapilabilen analiz yok."))}</p>`
          }
        </div>
      </section>`
    : "";

  const preflightSection =
    selectedCapabilityIds.length > 0
      ? `<section class="labx-drawer__section labx-drawer__preflight" data-severity="${escapeHtml(preflightSeverity)}">
          <div class="labx-drawer__preflight-head">
            <h3>${escapeHtml(copy.t("mediaAnalysis.drawer.setup.preflightTitle", "Preflight"))}</h3>
            <button
              class="labx-inline-action labx-drawer__preflight-toggle"
              type="button"
              data-lab-action="preflight-auto-run-toggle"
              aria-pressed="${String(preflightAutoRunEnabled)}"
              data-enabled="${preflightAutoRunEnabled ? "true" : "false"}"
            >${escapeHtml(
              preflightAutoRunEnabled
                ? copy.t("mediaAnalysis.drawer.setup.preflightAutoOn", "Aktif")
                : copy.t("mediaAnalysis.drawer.setup.preflightAutoOff", "Pasif")
            )}</button>
          </div>
          ${renderPreflightDetailRows(state, copy)}
          ${
            preflightWarnings.length > 0
              ? `<ul class="labx-drawer__preflight-list">${preflightWarnings
                  .map(function (w) {
                    return `<li>${escapeHtml(w)}</li>`;
                  })
                  .join("")}</ul>`
              : `<p class="labx-drawer__ok">${escapeHtml(copy.t("mediaAnalysis.drawer.setup.preflightOk", "All tools are ready"))}</p>`
          }
        </section>`
      : "";

  const previewMarkup =
    previewSentence !== ""
      ? `<p class="labx-drawer__preview">${escapeHtml(previewSentence)}</p>`
      : "";

  const ctaMarkup = `
    <div class="labx-drawer__cta">
      <button
        class="labx-cta"
        type="button"
        data-lab-action="run-deep-analysis"
        ${blockReason !== null ? "disabled" : ""}
        ${blockReason !== null ? `title="${escapeHtml(blockReason)}"` : ""}
      >
        ${escapeHtml(copy.t("mediaAnalysis.drawer.setup.cta", "Start Analysis"))}
      </button>
      ${previewMarkup}
      ${preflightSeverity === "warning" ? `<p class="labx-drawer__cta-warn">${escapeHtml(copy.t("mediaAnalysis.drawer.setup.partialWarn", "Some tools are missing; results may be partial."))}</p>` : ""}
    </div>
  `;

  const blocks: LabPipelineBlock[] = [
    {
      id: "analysis-prep",
      render() {
        return analysisMarkup;
      },
      type: "section",
      visible() {
        return sourceReady;
      },
    },
    {
      id: "preflight",
      render() {
        return preflightSection;
      },
      type: "status",
      visible() {
        return selectedCapabilityIds.length > 0;
      },
    },
    {
      id: "analysis-cta",
      render() {
        return ctaMarkup;
      },
      type: "action",
    },
  ];

  return renderPipeline(blocks, "setup");
}

// ---------------------------------------------------------------------------
// Running mode
// ---------------------------------------------------------------------------

function renderRunningMode(state: LabStoreState, copy: LabI18n) {
  const cancelPending = state.ui.analysisCancelPending === true;
  const cancelLabel = cancelPending
    ? copy.t("mediaAnalysis.drawer.running.cancelPending", "Analiz iptal ediliyor")
    : copy.t("mediaAnalysis.drawer.running.cancel", "Analizi İptal Et");
  const cancelSub = cancelPending
    ? copy.t("mediaAnalysis.drawer.running.cancelPendingSub", "İptal isteği işleniyor")
    : copy.t("mediaAnalysis.drawer.running.cancelSub", "Çalışan analiz durdurulacak");

  const cancelCta = `
    <div class="labx-drawer__cta">
      <button class="labx-cta labx-cta--danger" type="button" data-lab-action="cancel-analysis" ${cancelPending ? 'disabled aria-busy="true"' : ""}>
        ${escapeHtml(cancelLabel)}
      </button>
      <p class="labx-drawer__cta-sub">${escapeHtml(cancelSub)}</p>
    </div>
  `;

  const blocks: LabPipelineBlock[] = [
    {
      id: "execution-stages",
      render() {
        return renderRunningStageTracker(state, copy);
      },
      type: "status",
    },
    {
      id: "execution-status",
      render() {
        return renderRunningAnalysisPlan(state, copy);
      },
      type: "status",
    },
    {
      id: "cancel-analysis",
      render() {
        return cancelCta;
      },
      type: "action",
    },
  ];

  return renderPipeline(blocks, "running");
}

// ---------------------------------------------------------------------------
// Skeleton (loading)
// ---------------------------------------------------------------------------

function renderDrawerSkeleton() {
  return `
    <div class="labx-drawer-skeleton">
      <div class="labx-skeleton-block" style="height: 2.5rem"></div>
      <div class="labx-skeleton-block" style="height: 8rem"></div>
      <div class="labx-skeleton-block" style="height: 3rem"></div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Public render
// ---------------------------------------------------------------------------

export function renderLabDrawer(
  state: LabStoreState,
  surface: LabWorkspaceSurface,
  copy: LabI18n = LAB_FALLBACK_I18N
) {
  const collapsed = getDrawerCollapsed(state);
  const mode = resolveDrawerMode(state);

  if (collapsed) {
    return renderContextPanel({
      content: renderDrawerBody([], mode),
      drawerMode: mode,
      empty: true,
      hidden: true,
    });
  }

  const decisionSnapshot = buildLabDecisionSnapshot({ mode, state });
  const decisionHeader =
    mode === "setup"
      ? ""
      : renderDecisionHeader(decisionSnapshot.intent, decisionSnapshot.state, copy);

  const modeNav = `<nav class="labx-drawer__mode-nav" aria-label="${escapeHtml(copy.t("mediaAnalysis.topBar.navLabel", "Mode indicators"))}">${renderModePills(state, copy)}</nav>`;

  if (!isLabWorkspaceSurfaceReady(state)) {
    return renderContextPanel({
      content: `
        ${modeNav}
        ${decisionHeader}
        ${renderDrawerHeader(mode, copy)}
        ${renderDrawerBody(
          [
            {
              id: "drawer-skeleton",
              render: renderDrawerSkeleton,
              type: "status",
            },
          ],
          mode
        )}
      `,
      drawerMode: mode,
    });
  }

  let modeContent: string;
  switch (mode) {
    case "setup":
      modeContent = renderSetupMode(state, copy);
      break;
    case "running":
      modeContent = renderRunningMode(state, copy);
      break;
    case "result":
      modeContent = renderResultMode(state, copy);
      break;
    case "explore":
      modeContent = renderExploreMode(state, copy);
      break;
    default:
      modeContent = "";
  }

  const selectionTabActive = getSelectionTabActive(state);
  const selectionBody = selectionTabActive
    ? `<div class="labx-drawer__body labx-drawer__body--selection">${surface.side}</div>`
    : "";

  return renderContextPanel({
    content: `
      ${modeNav}
      ${
        selectionTabActive
          ? selectionBody
          : `${decisionHeader}${renderDrawerHeader(mode, copy)}<div class="labx-drawer__body">${modeContent}</div>`
      }
    `,
    drawerMode: mode,
  });
}
