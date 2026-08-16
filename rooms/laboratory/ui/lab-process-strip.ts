import { escapeHtml } from "../domain/lab-types.js";
import type { LabStoreState } from "../domain/lab-types.js";
import {
  getExecutionJourneyStep,
  getLaboratoryProcessSummary,
  getRunElapsedSeconds,
  getSourceReady,
  getUserActions,
  isRunActive,
  isRunComplete,
} from "../runtime/lab-selectors.js";

import { LAB_FALLBACK_I18N } from "./lab-i18n.js";
import type { LabI18n } from "./lab-i18n.js";

function getCurrentRunFromState(state: LabStoreState) {
  return state.run;
}

const PIPELINE_STEPS = ["select", "plan", "evaluate", "decide", "stage"] as const;
const PIPELINE_LABELS_TR = ["Seçim", "Plan", "Değerlendirme", "Karar", "Staging"];

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function getDotState(
  stepIndex: number,
  journeyStep: number,
  runFailed: boolean,
  failedAtStep: number,
  warningSteps: Set<number>,
  showActive: boolean
): "hollow" | "done" | "active" | "warning" | "error" {
  if (runFailed && stepIndex === failedAtStep) return "error";
  if (warningSteps.has(stepIndex)) return "warning";
  if (stepIndex < journeyStep) return "done";
  if (showActive === true && stepIndex === journeyStep) return "active";
  return "hollow";
}

function getStripTaskLabel(state: LabStoreState, copy: LabI18n): string {
  const summary = getLaboratoryProcessSummary(state);
  const run = getCurrentRunFromState(state);

  if (run?.state === "failed") {
    return run.error ?? copy.t("mediaAnalysis.strip.failed", "Başarısız");
  }
  if (run?.state === "cancelled") {
    return copy.t("mediaAnalysis.strip.cancelled", "İptal edildi");
  }
  if (run?.emptyReason) {
    return `${copy.t("mediaAnalysis.strip.empty", "Sonuç boş")}: ${run.emptyReason}`;
  }
  if ((run?.warnings ?? []).length > 0 && isRunComplete(state) && !isRunActive(state)) {
    return copy.t("mediaAnalysis.strip.partial", "Tamamlandı (uyarılarla)");
  }
  if (isRunComplete(state) && !isRunActive(state)) {
    return copy.t("mediaAnalysis.strip.complete", "Tamamlandı");
  }

  switch (summary.state) {
    case "idle":
      return getSourceReady(state)
        ? copy.t("mediaAnalysis.strip.idle", "Hazır")
        : copy.t("mediaAnalysis.strip.idleNoSource", "Hazır — kaynak bekleniyor");
    case "processing":
      return summary.activeTaskLabel ?? copy.t("mediaAnalysis.strip.processing", "İşleniyor…");
    case "analyzing":
      return summary.activeTaskLabel ?? copy.t("mediaAnalysis.strip.analyzing", "Analiz ediliyor…");
    case "staging":
      return (
        summary.activeTaskLabel ?? copy.t("mediaAnalysis.strip.staging", "Staging hazırlanıyor…")
      );
    default:
      return "";
  }
}

function getStripState(state: LabStoreState): string {
  const run = getCurrentRunFromState(state);
  if (run?.state === "failed") return "error";
  if (run?.state === "cancelled") return "cancelled";
  if ((run?.warnings ?? []).length > 0 && isRunComplete(state) && !isRunActive(state))
    return "partial";
  if (isRunComplete(state) && !isRunActive(state)) return "complete";
  const summary = getLaboratoryProcessSummary(state);
  return summary.state;
}

function renderActionOutputNames(state: LabStoreState, assetIds: string[] | undefined) {
  if (!Array.isArray(assetIds) || assetIds.length === 0) {
    return "";
  }
  const names = assetIds.map(function (assetId) {
    return (
      state.assets.find(function (asset) {
        return asset.id === assetId;
      })?.name ?? assetId
    );
  });
  const visible = names.slice(0, 2).join(", ");
  const overflow = names.length > 2 ? ` +${String(names.length - 2)}` : "";
  return `${visible}${overflow}`;
}

function getModuleStatusLabel(status: string | null | undefined, copy: LabI18n) {
  if (status === null || status === undefined) {
    return copy.t("mediaAnalysis.strip.moduleStatus.waiting", "Bekliyor");
  }

  switch (status) {
    case "running":
      return copy.t("mediaAnalysis.strip.moduleStatus.running", "İnceleniyor");
    case "queued":
      return copy.t("mediaAnalysis.strip.moduleStatus.queued", "Sırada");
    case "completed":
    case "ready":
      return copy.t("mediaAnalysis.strip.moduleStatus.completed", "Tamamlandı");
    case "failed":
      return copy.t("mediaAnalysis.strip.moduleStatus.failed", "Kontrol gerekiyor");
    case "cancelled":
      return copy.t("mediaAnalysis.strip.moduleStatus.cancelled", "İptal edildi");
    case "skipped":
      return copy.t("mediaAnalysis.strip.moduleStatus.skipped", "Atlandı");
    default:
      return copy.t("mediaAnalysis.strip.moduleStatus.waiting", "Bekliyor");
  }
}

function renderProcessSummaryRows(state: LabStoreState, copy: LabI18n) {
  const run = state.run;
  if (run && run.moduleOrder.length > 0) {
    return `<ul class="labx-strip-expanded__list">
      ${run.moduleOrder
        .slice(0, 6)
        .map(function (moduleId) {
          const moduleState = run.modules[moduleId];
          const title = moduleState?.title || moduleState?.id || moduleId;
          return `<li data-status="${escapeHtml(moduleState?.status ?? "idle")}"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(getModuleStatusLabel(moduleState?.status, copy))}</span></li>`;
        })
        .join("")}
    </ul>`;
  }

  const recentActions = getUserActions(state).slice(0, 5);
  if (recentActions.length === 0) {
    return `<p>${escapeHtml(copy.t("mediaAnalysis.strip.noRecentActions", "Son işlem yok"))}</p>`;
  }

  return `<ul class="labx-strip-expanded__list">
    ${recentActions
      .map(function (action) {
        const output = renderActionOutputNames(state, action.resultAssetIds);
        return `<li data-status="${escapeHtml(action.status)}"><strong>${escapeHtml(action.label)}</strong><span>${escapeHtml(action.message ?? action.status)}</span>${output !== "" ? `<em>${escapeHtml(output)}</em>` : ""}</li>`;
      })
      .join("")}
  </ul>`;
}

function renderRawLogRows(state: LabStoreState, copy: LabI18n) {
  const rawLog = Array.isArray(state.run?.rawLog) ? state.run.rawLog : [];
  const visibleRawLog = rawLog.slice(0, state.ui.eventFeedExpanded ? 40 : 12);
  if (visibleRawLog.length === 0) {
    return `<p>${escapeHtml(copy.t("mediaAnalysis.strip.noRawLog", "Ham log yok"))}</p>`;
  }

  return `<ul class="labx-strip-expanded__log">
    ${visibleRawLog
      .map(function (entry) {
        const line = entry.rawLine || entry.detail || entry.message;
        return `<li data-severity="${escapeHtml(entry.severity)}" title="${escapeHtml(line)}">${escapeHtml(line)}</li>`;
      })
      .join("")}
  </ul>`;
}

function renderExpandedStrip(state: LabStoreState, copy: LabI18n, forcedOpen: boolean) {
  if (forcedOpen !== true && state.ui.workspace.processViewActive !== true) {
    return "";
  }

  return `
    <div class="labx-strip-expanded" data-lab-process-expanded="true">
      <section>
        <strong>${escapeHtml(copy.t("mediaAnalysis.strip.analysisSummary", "Analiz özeti"))}</strong>
        ${renderProcessSummaryRows(state, copy)}
      </section>
      <section>
        <strong>${escapeHtml(copy.t("mediaAnalysis.strip.rawLog", "Ham log"))}</strong>
        ${renderRawLogRows(state, copy)}
      </section>
    </div>
  `;
}

function getCancelledJourneyStep(run: LabStoreState["run"], fallback: number) {
  if (!run || run.state !== "cancelled" || run.moduleOrder.length === 0) {
    return fallback;
  }
  const completedCount = run.moduleOrder.filter(function (moduleId) {
    const status = run.modules[moduleId]?.status;
    return status === "completed" || status === "ready";
  }).length;
  if (completedCount === 0) {
    return 0;
  }
  return Math.max(
    1,
    Math.min(
      PIPELINE_STEPS.length,
      Math.round((completedCount / run.moduleOrder.length) * PIPELINE_STEPS.length)
    )
  );
}

function getPipelineStepIndexForStage(stage: string | null) {
  const normalized = (stage || "").trim().toLowerCase();
  const directIndex = PIPELINE_STEPS.findIndex(function (step) {
    return step === normalized;
  });
  if (directIndex >= 0) {
    return directIndex;
  }
  if (normalized === "source" || normalized === "intake") {
    return 0;
  }
  if (normalized === "planning" || normalized === "preflight") {
    return 1;
  }
  if (normalized === "process" || normalized === "analysis" || normalized === "analyzing") {
    return 2;
  }
  if (normalized === "decision" || normalized === "report") {
    return 3;
  }
  if (normalized === "staging" || normalized === "completed") {
    return 4;
  }
  return -1;
}

function getPipelineStepIndexForModule(
  run: NonNullable<LabStoreState["run"]>,
  moduleId: string | null
) {
  if (moduleId === null || run.moduleOrder.length === 0) {
    return -1;
  }
  const moduleIndex = run.moduleOrder.indexOf(moduleId);
  if (moduleIndex < 0) {
    return -1;
  }
  return Math.max(
    0,
    Math.min(
      PIPELINE_STEPS.length - 1,
      Math.floor((moduleIndex / Math.max(1, run.moduleOrder.length)) * PIPELINE_STEPS.length)
    )
  );
}

function warningMentionsModule(warning: string, moduleId: string, moduleTitle: string | null) {
  const normalizedWarning = warning.toLowerCase();
  return (
    normalizedWarning.includes(moduleId.toLowerCase()) ||
    (moduleTitle !== null && normalizedWarning.includes(moduleTitle.toLowerCase()))
  );
}

function getWarningStepIndexes(
  run: LabStoreState["run"],
  runPartial: boolean,
  journeyStep: number
) {
  const steps = new Set<number>();
  if (!run || run.warnings.length === 0) {
    return steps;
  }

  run.moduleTrace.forEach(function (entry) {
    const message = [entry.message, entry.detail].filter(Boolean).join(" ");
    const traceMatchesWarning =
      entry.status.toLowerCase().includes("warning") ||
      run.warnings.some(function (warning) {
        return message !== "" && warning.toLowerCase().includes(message.toLowerCase());
      });
    if (traceMatchesWarning !== true) {
      return;
    }
    const stageStep = getPipelineStepIndexForStage(entry.stage);
    if (stageStep >= 0) {
      steps.add(stageStep);
      return;
    }
    const moduleStep = getPipelineStepIndexForModule(run, entry.moduleId);
    if (moduleStep >= 0) {
      steps.add(moduleStep);
    }
  });

  run.moduleOrder.forEach(function (moduleId) {
    const moduleState = run.modules[moduleId];
    if (!moduleState) {
      return;
    }
    const title = moduleState.title ?? null;
    const mentioned = run.warnings.some(function (warning) {
      return warningMentionsModule(warning, moduleId, title);
    });
    if (mentioned || moduleState.status === "skipped" || moduleState.status === "stale") {
      const moduleStep = getPipelineStepIndexForModule(run, moduleId);
      if (moduleStep >= 0) {
        steps.add(moduleStep);
      }
    }
  });

  if (runPartial && steps.size === 0) {
    steps.add(Math.max(0, Math.min(PIPELINE_STEPS.length - 1, journeyStep)));
  }
  return steps;
}

export function renderLabProcessStrip(state: LabStoreState, copy: LabI18n = LAB_FALLBACK_I18N) {
  const summary = getLaboratoryProcessSummary(state);
  const journeyStep = getExecutionJourneyStep(state);
  const elapsed = getRunElapsedSeconds(state);
  const runActive = isRunActive(state);
  const runComplete = isRunComplete(state) && !runActive;
  const run = getCurrentRunFromState(state);
  const runFailed = run?.state === "failed";
  const runPartial = (run?.warnings ?? []).length > 0 && runComplete;
  const failedAtStep = runFailed ? Math.max(0, journeyStep) : -1;
  const warningSteps = getWarningStepIndexes(run, runPartial, journeyStep);
  const stripState = getStripState(state);
  const taskLabel = getStripTaskLabel(state, copy);

  const progressPercent =
    summary.totalCount > 0 ? Math.round((summary.completedCount / summary.totalCount) * 100) : 0;
  const showProgress = runActive || runComplete || runFailed;
  const showElapsed = runActive || runComplete;
  const indeterminateProgress = runActive && summary.totalCount === 0;

  const dotsMarkup = PIPELINE_STEPS.map(function (key, i) {
    const label = copy.t(`mediaAnalysis.strip.steps.${key}`, PIPELINE_LABELS_TR[i] ?? key);
    const effectiveJourney =
      run?.state === "cancelled"
        ? getCancelledJourneyStep(run, Math.max(0, journeyStep))
        : runComplete
          ? PIPELINE_STEPS.length
          : journeyStep;
    const dotState = getDotState(
      i,
      effectiveJourney,
      runFailed === true,
      failedAtStep,
      warningSteps,
      run?.state !== "cancelled"
    );
    return `
      <div class="labx-strip-step" data-step="${escapeHtml(key)}" data-dot="${dotState}">
        <span class="labx-strip-step__dot" aria-hidden="true"></span>
        <span class="labx-strip-step__label">${escapeHtml(label)}</span>
      </div>
    `;
  }).join(`<span class="labx-strip-step__connector" aria-hidden="true"></span>`);

  const progressMarkup = showProgress
    ? `
      <div class="labx-strip-progress">
        <div class="labx-strip-progress__bar" data-progress-mode="${indeterminateProgress ? "indeterminate" : "measured"}">
          <div
            class="labx-strip-progress__fill"
            style="width:${String(indeterminateProgress ? 100 : runFailed ? progressPercent : runComplete ? 100 : progressPercent)}%"
            data-tone="${runFailed ? "error" : runPartial ? "warning" : runComplete ? "success" : "running"}"
          ></div>
        </div>
        ${summary.totalCount > 0 ? `<span class="labx-strip-progress__pct">${String(progressPercent)}%</span>` : ""}
      </div>
    `
    : "";

  const elapsedMarkup = showElapsed
    ? `<span class="labx-strip-elapsed">${escapeHtml(formatElapsed(elapsed))}</span>`
    : "";

  const retryMarkup = runFailed
    ? `<button class="labx-strip-retry" type="button" data-lab-action="run-deep-analysis">${escapeHtml(copy.t("mediaAnalysis.strip.retry", "Tekrar Dene"))}</button>`
    : "";
  const processViewForced = runActive;
  const processViewActive = processViewForced || state.ui.workspace.processViewActive === true;
  const toggleLabel = processViewActive
    ? copy.t("mediaAnalysis.strip.hideDetails", "Detayları Gizle")
    : copy.t("mediaAnalysis.strip.showDetails", "Detayları Göster");
  const toggleMarkup = `<button class="labx-strip-detail-toggle" type="button" data-lab-action="workspace-process-view-toggled" aria-expanded="${processViewActive ? "true" : "false"}"${processViewForced ? ' disabled aria-disabled="true"' : ""}>${escapeHtml(toggleLabel)}</button>`;

  return `
    <footer
      class="labx-process-strip"
      data-lab-region="process-strip"
      data-strip-state="${escapeHtml(stripState)}"
      data-process-view="${processViewActive ? "expanded" : "compact"}"
      data-process-view-forced="${processViewForced ? "true" : "false"}"
      aria-label="${escapeHtml(copy.t("mediaAnalysis.strip.ariaLabel", "Process state"))}"
    >
      <div class="labx-strip-main">
        <div class="labx-strip-pipeline">
          ${dotsMarkup}
        </div>
        <div class="labx-strip-info">
          <span class="labx-strip-task">${escapeHtml(taskLabel)}</span>
          ${progressMarkup}
          ${elapsedMarkup}
        </div>
        <div class="labx-strip-actions">
          ${retryMarkup}
          ${toggleMarkup}
        </div>
      </div>
      ${renderExpandedStrip(state, copy, processViewForced)}
    </footer>
  `;
}
