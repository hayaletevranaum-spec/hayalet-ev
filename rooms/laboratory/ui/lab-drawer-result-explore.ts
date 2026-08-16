import { escapeHtml } from "../domain/lab-types.js";
import type { LabPipelineBlock, LabStoreState } from "../domain/lab-types.js";
import {
  getLaboratoryRightPanelContext,
  getReportFreshness,
  getWorkspaceDiff,
  isRunComplete,
  isWorkspaceDirty,
} from "../runtime/lab-selectors.js";
import type { LabI18n } from "./lab-i18n.js";
import { renderPipeline } from "./laboratory-layout.js";

// Result mode — Decision Surface
// ---------------------------------------------------------------------------

export function renderResultMode(state: LabStoreState, copy: LabI18n) {
  const context = getLaboratoryRightPanelContext(state);
  const freshness = getReportFreshness(state);
  const dirty = isWorkspaceDirty(state);
  const run = state.run;
  const runWarnings = run?.warnings ?? [];

  const warningsBanner =
    runWarnings.length > 0 && isRunComplete(state)
      ? `<div class="labx-drawer__banner labx-drawer__banner--warning">
        <p>${escapeHtml(copy.t("mediaAnalysis.drawer.result.partialWarn", "Analiz tamamlandı ancak bazı modüller uyarı verdi."))}</p>
        <ul>${runWarnings
          .map(function (w) {
            return `<li>${escapeHtml(w)}</li>`;
          })
          .join("")}</ul>
      </div>`
      : "";

  const tier1 = `
    <div class="labx-right-context__tier-1">
      <div class="labx-right-context__item">
        <span>${escapeHtml(copy.t("mediaAnalysis.rightContext.selection", "Selection"))}</span>
        <strong>${escapeHtml(context.selectionRangeLabel ?? copy.t("mediaAnalysis.rightContext.emptySelection", "No active selection"))}</strong>
      </div>
      <div class="labx-right-context__item">
        <span>${escapeHtml(copy.t("mediaAnalysis.rightContext.activeAction", "Selected action"))}</span>
        <strong>${escapeHtml(context.activeIntentLabel ?? copy.t("mediaAnalysis.rightContext.emptyAction", "No action selected"))}</strong>
      </div>
    </div>
  `;

  const freshnessLabel =
    freshness?.state === "current"
      ? copy.t("mediaAnalysis.drawer.result.fresh", "Güncel")
      : freshness?.state === "stale"
        ? copy.t("mediaAnalysis.drawer.result.stale", "Eski")
        : "";
  const dirtyBadge = dirty
    ? `<span class="labx-drawer__dirty-badge">${escapeHtml(copy.t("mediaAnalysis.drawer.result.dirty", "Workspace farklı"))}</span>`
    : "";

  const reportCta = `
    <div class="labx-drawer__cta">
      <button class="labx-cta" type="button" data-lab-action="open-report-overlay">
        ${escapeHtml(copy.t("mediaAnalysis.drawer.result.reportCta", "Raporu Görüntüle"))}
      </button>
      ${freshnessLabel !== "" ? `<p class="labx-drawer__cta-sub">${escapeHtml(freshnessLabel)} ${dirtyBadge}</p>` : dirtyBadge}
    </div>
  `;

  const exploreCta = `
    <button class="labx-drawer__explore-toggle" type="button" data-lab-action="drawer-explore-toggled">
      ${escapeHtml(copy.t("mediaAnalysis.drawer.result.explore", "Keşif Moduna Geç"))}
    </button>
  `;

  const blocks: LabPipelineBlock[] = [
    {
      id: "run-warnings",
      render() {
        return warningsBanner;
      },
      type: "status",
      visible() {
        return warningsBanner.trim() !== "";
      },
    },
    {
      id: "context-summary",
      render() {
        return tier1;
      },
      type: "section",
    },
    {
      id: "report-action",
      render() {
        return reportCta;
      },
      type: "action",
    },
    {
      id: "explore-toggle",
      render() {
        return exploreCta;
      },
      type: "action",
    },
  ];

  return renderPipeline(blocks, "result");
}

// ---------------------------------------------------------------------------
// Explore mode
// ---------------------------------------------------------------------------

export function renderExploreMode(state: LabStoreState, copy: LabI18n) {
  const diff = getWorkspaceDiff(state);
  const changedKeys = diff?.changedKeys ?? [];

  const comparisonMarkup =
    changedKeys.length > 0
      ? `<section class="labx-drawer__section labx-drawer__comparison">
        <h3>${escapeHtml(copy.t("mediaAnalysis.drawer.explore.comparisonTitle", "Değişiklikler"))}</h3>
        <ul>${changedKeys
          .map(function (k) {
            return `<li>${escapeHtml(k)}</li>`;
          })
          .join("")}</ul>
      </section>`
      : `<section class="labx-drawer__section"><p>${escapeHtml(copy.t("mediaAnalysis.drawer.explore.noDiff", "Parametrelerde değişiklik yok"))}</p></section>`;

  const run = state.run;
  const emptyReason = run?.emptyReason;
  const warningBanner = emptyReason
    ? `<div class="labx-drawer__banner labx-drawer__banner--warning">${escapeHtml(emptyReason)}</div>`
    : "";

  const runWarnings = run?.warnings ?? [];
  const warningsMarkup =
    runWarnings.length > 0
      ? `<div class="labx-drawer__banner labx-drawer__banner--info">
        <p>${escapeHtml(copy.t("mediaAnalysis.drawer.explore.partialWarn", "Analiz tamamlandı ancak bazı modüller uyarı verdi."))}</p>
        <ul>${runWarnings
          .map(function (w) {
            return `<li>${escapeHtml(w)}</li>`;
          })
          .join("")}</ul>
      </div>`
      : "";

  const reanalyzeCta = `
    <div class="labx-drawer__cta">
      <button class="labx-cta" type="button" data-lab-action="run-deep-analysis">
        ${escapeHtml(copy.t("mediaAnalysis.drawer.explore.reanalyze", "Tekrar Analiz Et"))}
      </button>
      <p class="labx-drawer__cta-sub">${escapeHtml(copy.t("mediaAnalysis.drawer.explore.reanalyzeSub", "Güncel parametrelerle yeni analiz başlat"))}</p>
    </div>
  `;

  const backToggle = `
    <button class="labx-drawer__explore-toggle" type="button" data-lab-action="drawer-explore-toggled">
      ${escapeHtml(copy.t("mediaAnalysis.drawer.explore.backToResult", "Sonuç Moduna Dön"))}
    </button>
  `;

  const blocks: LabPipelineBlock[] = [
    {
      id: "empty-warning",
      render() {
        return warningBanner;
      },
      type: "status",
      visible() {
        return warningBanner.trim() !== "";
      },
    },
    {
      id: "run-warnings",
      render() {
        return warningsMarkup;
      },
      type: "status",
      visible() {
        return warningsMarkup.trim() !== "";
      },
    },
    {
      id: "workspace-comparison",
      render() {
        return comparisonMarkup;
      },
      type: "section",
    },
    {
      id: "reanalyze-action",
      render() {
        return reanalyzeCta;
      },
      type: "action",
    },
    {
      id: "result-toggle",
      render() {
        return backToggle;
      },
      type: "action",
    },
  ];

  return renderPipeline(blocks, "explore");
}

// ---------------------------------------------------------------------------
