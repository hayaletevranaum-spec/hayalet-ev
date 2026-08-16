import { escapeHtml, formatDateTime } from "../domain/lab-types.js";
import type {
  LabAiReport,
  LabArtifactProjection,
  LabFindingProjection,
  LabModuleTraceEntry,
  LabRecord,
  LabStoreState,
  LabUserReport,
} from "../domain/lab-types.js";
import {
  getCurrentReports,
  getCurrentRun,
  getReportFreshness,
  getReportOverlayOpen,
  getRunSnapshotSummary,
  getWorkspaceDiff,
  isRunActive,
} from "../runtime/lab-selectors.js";
import { renderStatusChip } from "./components/status-chip.js";
import {
  buildLabAssetMetadataTitle,
  getLabAssetPath,
  getLabAssetPathLeaf,
  toLabAssetDisplayUrl,
} from "./lab-asset-display.js";
import { LAB_FALLBACK_I18N } from "./lab-i18n.js";
import type { LabI18n } from "./lab-i18n.js";
import { translateLabRuntimeText } from "./lab-runtime-i18n.js";

function formatTimelineMs(ms: number | null): string {
  if (ms === null) {
    return "—";
  }
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${String(hours)}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatDiffLabel(
  key: "timeline" | "hypothesis",
  copy: LabI18n = LAB_FALLBACK_I18N
): string {
  switch (key) {
    case "timeline":
      return copy.t("mediaAnalysis.reportOverlay.diff.timeline", "Timeline");
    case "hypothesis":
      return copy.t("mediaAnalysis.reportOverlay.diff.hypothesis", "Hypothesis");
    default:
      return key;
  }
}

function renderSnapshotSummary(state: LabStoreState, copy: LabI18n = LAB_FALLBACK_I18N) {
  const snapshotSummary = getRunSnapshotSummary(state);
  if (!snapshotSummary) {
    return "";
  }

  const workspaceDiff = getWorkspaceDiff(state);
  const timelineSummary =
    snapshotSummary.timelineStartMs !== null || snapshotSummary.timelineEndMs !== null
      ? `${formatTimelineMs(snapshotSummary.timelineStartMs)} - ${formatTimelineMs(snapshotSummary.timelineEndMs)}`
      : copy.t("mediaAnalysis.reportOverlay.snapshot.fullSource", "Full source");
  const diffBadges =
    workspaceDiff && workspaceDiff.changedKeys.length > 0
      ? `<div class="labx-workspace-diff-badges">${workspaceDiff.changedKeys
          .map(function (key) {
            return `<span class="labx-workspace-diff-badge">${escapeHtml(formatDiffLabel(key, copy))}</span>`;
          })
          .join("")}</div>`
      : "";

  return `
    <div class="labx-report-section">
      <div class="labx-process-snapshot__head">
        <h3 class="labx-report-section__title">${escapeHtml(copy.t("mediaAnalysis.reportOverlay.snapshot.title", "Snapshot Summary"))}</h3>
        ${diffBadges}
      </div>
      <div class="labx-process-snapshot__grid">
        <div class="labx-process-snapshot__item">
          <span>${escapeHtml(copy.t("mediaAnalysis.reportOverlay.snapshot.focus", "Focus"))}</span>
          <strong>${escapeHtml(snapshotSummary.focus || copy.t("mediaAnalysis.reportOverlay.snapshot.unspecified", "Unspecified"))}</strong>
        </div>
        <div class="labx-process-snapshot__item">
          <span>${escapeHtml(copy.t("mediaAnalysis.reportOverlay.snapshot.timeline", "Timeline"))}</span>
          <strong>${escapeHtml(timelineSummary)}</strong>
        </div>
      </div>
      ${
        snapshotSummary.hypothesis
          ? `<p class="labx-process-snapshot__hypothesis">${escapeHtml(snapshotSummary.hypothesis)}</p>`
          : ""
      }
      ${
        workspaceDiff && workspaceDiff.workspaceDirty
          ? `<p class="labx-workspace-diff-hint">${escapeHtml(copy.t("mediaAnalysis.reportOverlay.snapshot.liveWorkspaceChanged", "Live workspace changed in {keys}. Report still reflects the frozen snapshot.", { keys: workspaceDiff.changedKeys.map((key) => formatDiffLabel(key, copy)).join(", ") }))}</p>`
          : `<p class="labx-workspace-diff-hint">${escapeHtml(copy.t("mediaAnalysis.reportOverlay.snapshot.frozen", "Report reflects the frozen run snapshot."))}</p>`
      }
    </div>
  `;
}

function renderConfidenceBadge(confidence: string, copy: LabI18n = LAB_FALLBACK_I18N) {
  const level = confidence === "high" ? "high" : confidence === "medium" ? "medium" : "low";
  const label = copy.t(
    `mediaAnalysis.reportOverlay.confidence.${level}`,
    level === "high" ? "Yüksek" : level === "medium" ? "Orta" : "Düşük"
  );
  return `<span class="labx-confidence-gauge" data-level="${level}">${escapeHtml(label)}</span>`;
}

function renderUserReportFindings(
  findings: LabUserReport["topFindings"],
  copy: LabI18n = LAB_FALLBACK_I18N
) {
  if (findings.length === 0) {
    return `<div class="labx-process-empty">${escapeHtml(copy.t("mediaAnalysis.reportOverlay.empty.noFindings", "Bulgu yok"))}</div>`;
  }
  return findings
    .map(function (f) {
      const evidenceHtml =
        f.evidence.length > 0
          ? `<div class="labx-report-finding__evidence">${f.evidence
              .map(function (e) {
                return `<span class="labx-report-evidence-tag">${escapeHtml(e)}</span>`;
              })
              .join("")}</div>`
          : "";
      return `
        <div class="labx-report-finding">
          <div class="labx-report-finding__title">
            <strong>${escapeHtml(f.title)}</strong>
            ${renderConfidenceBadge(f.confidence, copy)}
          </div>
          <div class="labx-report-finding__detail">${escapeHtml(f.detail)}</div>
          ${evidenceHtml}
        </div>
      `;
    })
    .join("");
}

function renderCorrelationClusters(
  clusters:
    LabUserReport["topCorrelationClusters"] | LabAiReport["correlationClusters"] | undefined,
  copy: LabI18n = LAB_FALLBACK_I18N
) {
  if (!Array.isArray(clusters) || clusters.length === 0) {
    return "";
  }
  return `
    <div class="labx-report-section">
      <h3 class="labx-report-section__title">${escapeHtml(copy.t("mediaAnalysis.reportOverlay.correlation.title", "Correlation"))}</h3>
      ${clusters
        .map(function (cluster) {
          return `
            <div class="labx-report-finding">
              <div class="labx-report-finding__title">
                <strong>${escapeHtml(cluster.title)}</strong>
                ${renderConfidenceBadge(cluster.confidence, copy)}
                <span class="labx-report-evidence-tag">${escapeHtml(String(cluster.score))}</span>
              </div>
              <div class="labx-report-finding__detail">${escapeHtml(cluster.detail)}</div>
              <div class="labx-report-finding__evidence">
                ${cluster.signalTypes
                  .map(function (signalType) {
                    return `<span class="labx-report-evidence-tag">${escapeHtml(signalType)}</span>`;
                  })
                  .join("")}
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderNarrativeCues(
  cues: LabUserReport["narrativeCues"] | LabAiReport["narrativeCues"] | undefined,
  copy: LabI18n = LAB_FALLBACK_I18N
) {
  if (!Array.isArray(cues) || cues.length === 0) {
    return "";
  }
  return `
    <div class="labx-report-section">
      <h3 class="labx-report-section__title">${escapeHtml(copy.t("mediaAnalysis.reportOverlay.narrative.title", "Narrative Cues"))}</h3>
      <div class="labx-report-manifest">
        ${cues
          .map(function (cue) {
            const tags = [cue.confidence, cue.temporalBasis]
              .filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
              .map(function (entry) {
                return `<span class="labx-report-evidence-tag">${escapeHtml(entry)}</span>`;
              })
              .join("");
            return `
              <div class="labx-report-manifest__entry">
                <span>${escapeHtml(cue.source)}</span>
                <strong>${escapeHtml(cue.phrase)}</strong>
                ${tags}
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function renderForensicNotes(
  notes: LabUserReport["forensicNotes"] | LabAiReport["forensicNotes"] | undefined,
  copy: LabI18n = LAB_FALLBACK_I18N
) {
  if (!Array.isArray(notes) || notes.length === 0) {
    return "";
  }
  return `
    <div class="labx-report-section">
      <h3 class="labx-report-section__title">${escapeHtml(copy.t("mediaAnalysis.reportOverlay.forensics.title", "Forensic Notes"))}</h3>
      ${notes
        .map(function (note) {
          return `<div class="labx-report-warning"><strong>${escapeHtml(note.label)}</strong>: ${escapeHtml(note.detail)}</div>`;
        })
        .join("")}
    </div>
  `;
}

function renderDecisionSummary(
  summary: LabUserReport["decisionSummary"] | LabAiReport["decisionSummary"] | undefined,
  copy: LabI18n = LAB_FALLBACK_I18N
) {
  if (!summary) {
    return "";
  }
  return `
    <div class="labx-report-section">
      <h3 class="labx-report-section__title">${escapeHtml(copy.t("mediaAnalysis.reportOverlay.triage.title", "Triage Decision"))}</h3>
      <div class="labx-report-manifest">
        <div class="labx-report-manifest__entry"><span>${escapeHtml(copy.t("mediaAnalysis.reportOverlay.triage.anomaly", "Anomaly"))}</span><strong>${escapeHtml(summary.anomaly)}</strong></div>
        <div class="labx-report-manifest__entry"><span>${escapeHtml(copy.t("mediaAnalysis.reportOverlay.triage.manipulation", "Manipulation suspicion"))}</span><strong>${escapeHtml(summary.manipulationSuspicion)}</strong></div>
        <div class="labx-report-manifest__entry"><span>${escapeHtml(copy.t("mediaAnalysis.reportOverlay.triage.followUp", "Follow-up"))}</span><strong>${escapeHtml(summary.needsFollowUp ? "required" : "not required")}</strong></div>
      </div>
      <p class="labx-report-summary">${escapeHtml(summary.likelyTechnicalExplanation)}</p>
      <p class="labx-report-section__hint">${escapeHtml(summary.rationale)}</p>
    </div>
  `;
}

function renderEvidenceStrength(
  entries: LabUserReport["evidenceStrength"] | LabAiReport["evidenceStrength"] | undefined,
  copy: LabI18n = LAB_FALLBACK_I18N
) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return "";
  }
  return `
    <div class="labx-report-section">
      <h3 class="labx-report-section__title">${escapeHtml(copy.t("mediaAnalysis.reportOverlay.evidenceStrength.title", "Evidence Strength"))}</h3>
      ${entries
        .map(function (entry) {
          const tags = entry.evidence
            .concat(entry.counterEvidence)
            .slice(0, 5)
            .map(function (item) {
              return `<span class="labx-report-evidence-tag">${escapeHtml(item)}</span>`;
            })
            .join("");
          return `<div class="labx-report-finding"><div class="labx-report-finding__title"><strong>${escapeHtml(entry.label)}</strong><span class="labx-report-evidence-tag">${escapeHtml(entry.strength)}</span></div><div class="labx-report-finding__detail">${escapeHtml(entry.detail)}</div>${tags === "" ? "" : `<div class="labx-report-finding__evidence">${tags}</div>`}</div>`;
        })
        .join("")}
    </div>
  `;
}

function renderCounterEvidenceLedger(
  ledger: LabUserReport["counterEvidenceLedger"] | LabAiReport["counterEvidenceLedger"] | undefined,
  copy: LabI18n = LAB_FALLBACK_I18N
) {
  if (!ledger || !Array.isArray(ledger.entries) || ledger.entries.length === 0) {
    return "";
  }
  return `
    <div class="labx-report-section">
      <h3 class="labx-report-section__title">${escapeHtml(copy.t("mediaAnalysis.reportOverlay.counterEvidence.title", "Counter Evidence"))}</h3>
      <p class="labx-report-section__hint">${escapeHtml(ledger.summary)}</p>
      ${ledger.entries
        .map(function (entry) {
          return `<div class="labx-report-warning"><strong>${escapeHtml(entry.label)}</strong> <span class="labx-report-evidence-tag">${escapeHtml(entry.status)}</span>: ${escapeHtml(entry.detail)}</div>`;
        })
        .join("")}
    </div>
  `;
}

function renderSuspiciousFrames(report: LabUserReport, copy: LabI18n = LAB_FALLBACK_I18N) {
  if (!Array.isArray(report.suspiciousFrames) || report.suspiciousFrames.length === 0) {
    return "";
  }
  return `
    <div class="labx-report-section">
      <h3 class="labx-report-section__title">${escapeHtml(copy.t("mediaAnalysis.reportOverlay.user.suspiciousFrames", "Şüpheli Kareler"))}</h3>
      <p class="labx-report-section__hint">${escapeHtml(copy.t("mediaAnalysis.reportOverlay.user.suspiciousFramesHint", "Otomatik tespit edilen dikkat çekici kareler"))}</p>
      ${report.suspiciousFrames
        .map(function (frame) {
          return `
            <div class="labx-report-suspicious-frame">
              <img src="${escapeHtml(frame.previewUrl)}" alt="${escapeHtml(frame.label)}" loading="lazy" />
              <span class="labx-report-suspicious-frame__label">${escapeHtml(frame.label)}</span>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderHypothesisResult(report: LabUserReport, copy: LabI18n = LAB_FALLBACK_I18N) {
  if (!report.hypothesisResult) {
    return "";
  }
  return `
    <div class="labx-report-section">
      <h3 class="labx-report-section__title">${escapeHtml(copy.t("mediaAnalysis.reportOverlay.user.hypothesisResult", "Hipotez Sonucu"))}</h3>
      <p class="labx-report-summary">${escapeHtml(report.hypothesisResult)}</p>
    </div>
  `;
}

function renderModuleSummary(report: LabUserReport, copy: LabI18n = LAB_FALLBACK_I18N) {
  if (!Array.isArray(report.moduleSummary) || report.moduleSummary.length === 0) {
    return "";
  }
  return `
    <div class="labx-report-section">
      <h3 class="labx-report-section__title">${escapeHtml(copy.t("mediaAnalysis.reportOverlay.user.moduleSummary", "Modül Özeti"))}</h3>
      <div class="labx-report-manifest">
        ${report.moduleSummary
          .map(function (mod) {
            return `
              <div class="labx-report-manifest__entry">
                <span>${escapeHtml(mod.title || mod.id)}</span>
                <strong>${escapeHtml(mod.status)}</strong>
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function renderUserReport(report: LabUserReport, copy: LabI18n = LAB_FALLBACK_I18N) {
  return `
    ${renderDecisionSummary(report.decisionSummary, copy)}
    ${renderEvidenceStrength(report.evidenceStrength, copy)}
    ${renderCounterEvidenceLedger(report.counterEvidenceLedger, copy)}
    ${renderForensicNotes(report.forensicNotes, copy)}

    <div class="labx-report-section">
      <h3 class="labx-report-section__title">${escapeHtml(copy.t("mediaAnalysis.reportOverlay.user.summary", "Özet"))}</h3>
      <div class="labx-report-summary">${escapeHtml(report.summary)}</div>
      <div style="margin-top: 0.45rem; display: flex; gap: 0.45rem; align-items: center;">
        ${renderStatusChip(copy.t("mediaAnalysis.reportOverlay.user.confidence", "Güven"), "neutral")}
        ${renderConfidenceBadge(report.confidence, copy)}
        <span style="color: var(--labx-text-dim); font-size: 0.74rem;">${escapeHtml(copy.t("mediaAnalysis.reportOverlay.user.elapsedSeconds", "{seconds} sn", { seconds: report.elapsedSeconds }))}</span>
      </div>
    </div>

    <div class="labx-report-section">
      <h3 class="labx-report-section__title">${escapeHtml(copy.t("mediaAnalysis.reportOverlay.user.findings", "Bulgular"))}</h3>
      ${renderUserReportFindings(report.topFindings, copy)}
    </div>

    ${renderCorrelationClusters(report.topCorrelationClusters, copy)}
    ${renderNarrativeCues(report.narrativeCues, copy)}
    ${renderSuspiciousFrames(report, copy)}
    ${renderHypothesisResult(report, copy)}
    ${renderModuleSummary(report, copy)}
  `;
}

function getTraceStatusIcon(status: string) {
  switch (status) {
    case "completed":
      return "✓";
    case "failed":
      return "✕";
    case "running":
      return "▸";
    default:
      return "·";
  }
}

function renderManifest(manifest: LabRecord) {
  const keys = Object.keys(manifest);
  if (keys.length === 0) {
    return "";
  }
  return `
    <div class="labx-report-manifest">
      ${keys
        .map(function (key) {
          const val = manifest[key];
          return `
            <div class="labx-report-manifest__entry">
              <span>${escapeHtml(key)}</span>
              <strong>${escapeHtml(String(val ?? "--"))}</strong>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderModuleTraceTimeline(
  trace: LabModuleTraceEntry[] | undefined,
  copy: LabI18n = LAB_FALLBACK_I18N
) {
  if (!trace || trace.length === 0) {
    return `<div class="labx-process-empty">${escapeHtml(copy.t("mediaAnalysis.reportOverlay.empty.noTimeline", "Zaman çizelgesi yok"))}</div>`;
  }
  return (Array.isArray(trace) ? trace.slice(0, 20) : [])
    .map(function (entry) {
      const icon = getTraceStatusIcon(entry.status);
      return `
        <div class="labx-report-timeline-entry">
          <span class="labx-report-timeline-entry__status" data-status="${escapeHtml(entry.status)}">${icon}</span>
          <span class="labx-report-timeline-entry__time">${escapeHtml(formatDateTime(entry.timestamp))}</span>
	          <span>${escapeHtml(translateLabRuntimeText(entry.message || entry.stage, copy))}</span>
        </div>
      `;
    })
    .join("");
}

function renderTechnicalFindings(
  findings: LabFindingProjection[],
  copy: LabI18n = LAB_FALLBACK_I18N
) {
  if (findings.length === 0) {
    return `<div class="labx-process-empty">${escapeHtml(copy.t("mediaAnalysis.reportOverlay.empty.noFindings", "Bulgu yok"))}</div>`;
  }
  return findings
    .map(function (f) {
      const evidenceHtml =
        f.artifactIds.length > 0
          ? `<div class="labx-report-finding__evidence">${f.artifactIds
              .map(function (aId) {
                return `<span class="labx-report-evidence-tag">${escapeHtml(aId)}</span>`;
              })
              .join("")}</div>`
          : "";
      return `
        <div class="labx-report-finding">
          <div class="labx-report-finding__title">
            <strong>${escapeHtml(f.title)}</strong>
            ${renderConfidenceBadge(f.confidence, copy)}
            <span class="labx-report-evidence-tag">${escapeHtml(f.kind)}</span>
            ${f.code ? `<span class="labx-report-evidence-tag">${escapeHtml(f.code)}</span>` : ""}
          </div>
          <div class="labx-report-finding__detail">${escapeHtml(f.detail)}</div>
          ${evidenceHtml}
        </div>
      `;
    })
    .join("");
}

function renderArtifactList(artifacts: LabArtifactProjection[], copy: LabI18n = LAB_FALLBACK_I18N) {
  if (artifacts.length === 0) {
    return `<div class="labx-process-empty">${escapeHtml(copy.t("mediaAnalysis.reportOverlay.empty.noArtifacts", "Artefakt yok"))}</div>`;
  }
  return `
    <div class="labx-report-manifest">
      ${artifacts
        .map(function (art) {
          return `
            <div class="labx-report-manifest__entry">
              <span>${escapeHtml(art.kind)}</span>
              <strong>${escapeHtml(art.fileName || art.id)}</strong>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderAiReport(report: LabAiReport, copy: LabI18n = LAB_FALLBACK_I18N) {
  const warnings = Array.isArray(report.warnings) ? report.warnings : [];
  const errors = Array.isArray(report.errors) ? report.errors : [];
  const degraded = Array.isArray(report.degradedConditions) ? report.degradedConditions : [];
  const moduleTrace = Array.isArray(report.moduleTrace) ? report.moduleTrace : [];
  const findings = Array.isArray(report.findings) ? report.findings : [];
  const artifacts = Array.isArray(report.artifacts) ? report.artifacts : [];
  const correlationClusters = Array.isArray(report.correlationClusters)
    ? report.correlationClusters
    : [];
  const narrativeCues = Array.isArray(report.narrativeCues) ? report.narrativeCues : [];
  const forensicNotes = Array.isArray(report.forensicNotes) ? report.forensicNotes : [];

  const warningsHtml =
    warnings.length > 0
      ? warnings
          .map(function (w) {
            return `<div class="labx-report-warning">${escapeHtml(w)}</div>`;
          })
          .join("")
      : "";
  const errorsHtml =
    errors.length > 0
      ? errors
          .map(function (e) {
            return `<div class="labx-report-error">${escapeHtml(e)}</div>`;
          })
          .join("")
      : "";
  const degradedHtml =
    degraded.length > 0
      ? degraded
          .map(function (d) {
            return `<div class="labx-report-warning">${escapeHtml(d)}</div>`;
          })
          .join("")
      : "";

  return `
    ${renderDecisionSummary(report.decisionSummary, copy)}
    ${renderEvidenceStrength(report.evidenceStrength, copy)}
    ${renderCounterEvidenceLedger(report.counterEvidenceLedger, copy)}
    ${renderForensicNotes(forensicNotes, copy)}

    <div class="labx-report-section">
      <h3 class="labx-report-section__title">${escapeHtml(copy.t("mediaAnalysis.reportOverlay.ai.manifest", "Manifest"))}</h3>
      ${renderManifest(report.manifest)}
    </div>

    <div class="labx-report-section">
      <h3 class="labx-report-section__title">${escapeHtml(copy.t("mediaAnalysis.reportOverlay.ai.moduleTimeline", "Modül Zaman Çizelgesi"))}</h3>
      ${renderModuleTraceTimeline(moduleTrace, copy)}
    </div>

    ${renderCorrelationClusters(correlationClusters, copy)}
    ${renderNarrativeCues(narrativeCues, copy)}

    <div class="labx-report-section">
      <h3 class="labx-report-section__title">${escapeHtml(copy.t("mediaAnalysis.reportOverlay.ai.technicalFindings", "Bulgular (Teknik)"))}</h3>
      ${renderTechnicalFindings(findings, copy)}
    </div>

    <div class="labx-report-section">
      <h3 class="labx-report-section__title">${escapeHtml(copy.t("mediaAnalysis.reportOverlay.ai.artifacts", "Artefaktlar"))}</h3>
      ${renderArtifactList(artifacts, copy)}
    </div>

    ${degradedHtml ? `<div class="labx-report-section"><h3 class="labx-report-section__title">${escapeHtml(copy.t("mediaAnalysis.reportOverlay.ai.degraded", "Kısıtlamalar"))}</h3>${degradedHtml}</div>` : ""}
    ${warningsHtml ? `<div class="labx-report-section"><h3 class="labx-report-section__title">${escapeHtml(copy.t("mediaAnalysis.reportOverlay.ai.warnings", "Uyarılar"))}</h3>${warningsHtml}</div>` : ""}
    ${errorsHtml ? `<div class="labx-report-section"><h3 class="labx-report-section__title">${escapeHtml(copy.t("mediaAnalysis.reportOverlay.ai.errors", "Hatalar"))}</h3>${errorsHtml}</div>` : ""}
  `;
}

function getActiveDocumentOverlayAsset(state: LabStoreState) {
  const assetId = state.ui.activeDocumentOverlayAssetId;
  if (assetId === null) {
    return null;
  }
  return (
    state.assets.find(function (asset) {
      return asset.id === assetId;
    }) || null
  );
}

function renderDocumentOverlay(
  asset: NonNullable<ReturnType<typeof getActiveDocumentOverlayAsset>>,
  copy: LabI18n
) {
  const path = getLabAssetPath(asset);
  const fileName = getLabAssetPathLeaf(asset) || asset.name;
  const src = path === null ? null : toLabAssetDisplayUrl(path);
  const title = buildLabAssetMetadataTitle(asset);
  const downloadMarkup =
    path === null
      ? ""
      : `<button class="labx-inline-action" type="button" data-lab-action="asset-download" data-lab-value="${escapeHtml(asset.id)}">${escapeHtml(copy.t("mediaAnalysis.documentOverlay.actions.download", "İndir"))}</button>`;

  return `
    <button
      class="labx-overlay-backdrop"
      type="button"
      aria-label="${escapeHtml(copy.t("mediaAnalysis.documentOverlay.closeAria", "Belgeyi kapat"))}"
      data-lab-action="close-report-overlay"
    ></button>
    <section
      class="labx-report-overlay labx-document-overlay"
      data-lab-document-overlay="true"
      data-lab-document-asset-id="${escapeHtml(asset.id)}"
      role="dialog"
      aria-modal="true"
      aria-label="${escapeHtml(copy.t("mediaAnalysis.documentOverlay.ariaLabel", "Artefakt görüntüleyici"))}"
    >
      <div class="labx-report-overlay__header">
        <div>
          <p class="labx-card__eyebrow">${escapeHtml(copy.t("mediaAnalysis.documentOverlay.eyebrow", "Artefakt"))}</p>
          <h2 class="labx-report-overlay__title">${escapeHtml(asset.name)}</h2>
          <span class="labx-report-freshness">${escapeHtml(fileName)}</span>
        </div>
        <div class="labx-inline-actions">
          ${downloadMarkup}
          <button class="labx-inline-action" type="button" data-lab-action="close-report-overlay">${escapeHtml(copy.t("mediaAnalysis.documentOverlay.actions.close", "Kapat"))}</button>
        </div>
      </div>
      <div class="labx-report-document" title="${escapeHtml(title)}">
        ${
          src === null
            ? `<div class="labx-process-empty">${escapeHtml(copy.t("mediaAnalysis.documentOverlay.empty.noFile", "Dosya yolu mevcut değil"))}</div>`
            : `<iframe class="labx-report-document-frame" data-lab-document-frame="true" src="${escapeHtml(src)}" title="${escapeHtml(asset.name)}"></iframe>`
        }
      </div>
    </section>
  `;
}

export function renderReportOverlay(state: LabStoreState, copy: LabI18n = LAB_FALLBACK_I18N) {
  const isOpen = getReportOverlayOpen(state);
  const documentAsset = getActiveDocumentOverlayAsset(state);
  const reports = getCurrentReports(state);
  const run = getCurrentRun(state);
  const reportView = state.ui.reportView;

  const userTabActive = reportView === "user";
  const aiTabActive = reportView === "ai";

  const contentHtml =
    userTabActive && reports.user
      ? renderUserReport(reports.user, copy)
      : aiTabActive && reports.ai
        ? renderAiReport(reports.ai, copy)
        : `<div class="labx-process-empty">${escapeHtml(reports.emptyReason ? translateLabRuntimeText(reports.emptyReason, copy) : copy.t("mediaAnalysis.reportOverlay.empty.noReport", "Rapor mevcut değil"))}</div>`;

  const runIdSuffix = run && typeof run.id === "string" ? run.id.slice(-6) || "—" : "—";
  const freshness = getReportFreshness(state);
  const runActive = isRunActive(state);
  const freshnessLabel =
    freshness?.state === "current"
      ? copy.t("mediaAnalysis.reportFreshness.current", "\u2713 Güncel")
      : freshness?.state === "previous-run"
        ? runActive
          ? copy.t(
              "mediaAnalysis.reportFreshness.previousRunActive",
              "\u2298 Önceki çalışma \u00b7 Analiz devam ediyor"
            )
          : copy.t("mediaAnalysis.reportFreshness.previousRun", "\u2298 Önceki çalışma")
        : freshness?.state === "stale"
          ? copy.t(
              "mediaAnalysis.reportFreshness.stale",
              "\u2298 Eski çalışma \u00b7 Son analiz başarısız"
            )
          : "";
  const freshnessMeta =
    freshness && freshness.workspaceDirty
      ? `${freshnessLabel} \u00b7 ${copy.t("mediaAnalysis.reportFreshness.workspaceDirty", "Workspace farklı")}`
      : freshnessLabel;

  return `
    <div class="labx-overlay-root" data-open="${isOpen ? "true" : "false"}" id="lab-report-overlay-root">
      ${
        isOpen
          ? documentAsset !== null
            ? renderDocumentOverlay(documentAsset, copy)
            : `
            <button
              class="labx-overlay-backdrop"
              type="button"
              aria-label="${escapeHtml(copy.t("mediaAnalysis.reportOverlay.closeAria", "Raporu kapat"))}"
              data-lab-action="close-report-overlay"
            ></button>
            <section class="labx-report-overlay" role="dialog" aria-modal="true" aria-label="${escapeHtml(copy.t("mediaAnalysis.reportOverlay.ariaLabel", "Analiz Raporu"))}">
              <div class="labx-report-overlay__header">
                <div>
                  <p class="labx-card__eyebrow">${escapeHtml(copy.t("mediaAnalysis.reportOverlay.eyebrow", "Analiz Sonucu"))}</p>
                  <h2 class="labx-report-overlay__title">${escapeHtml(copy.t("mediaAnalysis.reportOverlay.title", "Rapor #{id}", { id: runIdSuffix }))}</h2>
                  ${
                    freshnessMeta
                      ? `<span class="labx-report-freshness" data-freshness="${escapeHtml(freshness?.state || "")}" data-workspace-dirty="${freshness?.workspaceDirty === true ? "true" : "false"}">${escapeHtml(freshnessMeta)}</span>`
                      : ""
                  }
                </div>
                <div class="labx-inline-actions">
                  <button class="labx-inline-action" type="button" data-lab-action="report-export-json">${escapeHtml(copy.t("mediaAnalysis.reportOverlay.actions.exportJson", "JSON Export"))}</button>
                  <button class="labx-inline-action" type="button" data-lab-action="report-export-pdf">${escapeHtml(copy.t("mediaAnalysis.reportOverlay.actions.exportPdf", "PDF Export"))}</button>
                  <button class="labx-inline-action" type="button" data-lab-action="close-report-overlay">${escapeHtml(copy.t("mediaAnalysis.reportOverlay.actions.close", "Kapat"))}</button>
                </div>
              </div>
              <div class="labx-report-tabs">
                <button
                  class="labx-report-tab ${userTabActive ? "labx-report-tab--active" : ""}"
                  type="button"
                  data-lab-action="report-tab-switch"
                  data-lab-value="user"
                >${escapeHtml(copy.t("mediaAnalysis.reportOverlay.tabs.user", "Kullanıcı Raporu"))}</button>
                <button
                  class="labx-report-tab ${aiTabActive ? "labx-report-tab--active" : ""}"
                  type="button"
                  data-lab-action="report-tab-switch"
                  data-lab-value="ai"
                >${escapeHtml(copy.t("mediaAnalysis.reportOverlay.tabs.ai", "Teknik Rapor"))}</button>
              </div>
              ${renderSnapshotSummary(state, copy)}
              ${contentHtml}
            </section>
          `
          : ""
      }
    </div>
  `;
}
