import { asLabRecord, asNonEmptyString, escapeHtml } from "../domain/lab-types.js";
import type { LabRecord, LabStoreState } from "../domain/lab-types.js";
import { renderStatusChip } from "./components/status-chip.js";
import { getToolLifecycleStage } from "../runtime/lab-selectors.js";
import { LAB_FALLBACK_I18N } from "./lab-i18n.js";
import type { LabI18n } from "./lab-i18n.js";

type LabToolDescriptorRecord = LabRecord & {
  availability?: unknown;
  displayName?: unknown;
  estimatedDownloadSize?: unknown;
  estimatedInstalledSize?: unknown;
  installPackages?: unknown;
  installStrategy?: unknown;
  installerType?: unknown;
  plannedReason?: unknown;
  readinessImpact?: unknown;
  setupHint?: unknown;
  stageSupport?: unknown;
  supportedPythonVersions?: unknown;
  toolId?: unknown;
  usedBy?: unknown;
  venvDir?: unknown;
};

type LabToolEntryRecord = LabRecord & {
  binaryPath?: unknown;
  busy?: unknown;
  installDir?: unknown;
  installed?: unknown;
  lastCheckedAt?: unknown;
  lastError?: unknown;
  latestReleaseName?: unknown;
  latestVersion?: unknown;
  toolId?: unknown;
  updateAvailable?: unknown;
  version?: unknown;
};

type LabToolProgressItem = {
  action: string | null;
  bytesReceived: number | null;
  bytesTotal: number | null;
  canCancel: boolean;
  detail: string;
  detailLines: string[];
  id: string;
  lastLine: string | null;
  packageName: string | null;
  percent: number | null;
  phaseCount: number | null;
  phaseIndex: number | null;
  phaseLabel: string | null;
  phasePercent: number | null;
  stage: string | null;
  title: string;
  toolId: string | null;
};

type LabToolManagerStats = {
  busyCount: number;
  catalogCount: number;
  installedCount: number;
  updateCount: number;
};

type LabToolUpdateChoice = {
  displayName: string;
  latestLabel: string;
  toolId: string;
  versionLabel: string;
};

const STAGE_LABELS: Record<string, string> = {
  source: "Kaynak",
  edit: "Düzene",
  profile: "Profil",
  process: "İşlem",
  report: "Rapor",
};

function isSettingsManagedTool(toolId: string | null): boolean {
  return toolId === "transcript-runtime";
}

function toToolDescriptorRecord(value: unknown): LabToolDescriptorRecord {
  return asLabRecord(value);
}

function toToolEntryRecord(value: unknown): LabToolEntryRecord {
  return asLabRecord(value);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(function (entry) {
      return asNonEmptyString(entry);
    })
    .filter((entry): entry is string => entry !== null);
}

function getSupportedPythonLabel(descriptor: LabToolDescriptorRecord): string | null {
  const versions = toStringArray(descriptor.supportedPythonVersions);
  return versions.length > 0 ? `Python ${versions.join(", ")}` : null;
}

function getPythonRuntimeLabel(descriptor: LabToolDescriptorRecord, copy: LabI18n): string | null {
  if (asNonEmptyString(descriptor.installerType) !== "python-venv-pip") {
    return null;
  }

  return getSupportedPythonLabel(descriptor) !== null
    ? copy.t("mediaAnalysis.toolManager.labels.managedPythonRuntime", "Laboratory-managed Python")
    : copy.t("mediaAnalysis.toolManager.labels.systemPythonRuntime", "System Python bootstrap");
}

function toToolCopyKeyPart(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized === "" ? null : normalized;
}

function translateToolDescriptorText(
  toolId: string | null,
  field: "plannedReason" | "readinessImpact",
  fallback: string,
  copy: LabI18n
): string {
  const toolKey = toToolCopyKeyPart(toolId);
  if (toolKey === null) {
    return fallback;
  }
  return copy.t(`mediaAnalysis.toolManager.toolDetails.${toolKey}.${field}`, fallback);
}

function translateUsedByLabel(entry: string, copy: LabI18n): string {
  const key = toToolCopyKeyPart(entry);
  if (key === null) {
    return entry;
  }
  return copy.t(`mediaAnalysis.toolManager.usedBy.${key}`, entry);
}

function clampProgress(value: unknown): number | null {
  if (typeof value !== "number" || Number.isFinite(value) !== true) {
    return null;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatBytes(value: number | null): string | null {
  if (value === null || Number.isFinite(value) !== true) {
    return null;
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let nextValue = Math.max(0, value);
  let unitIndex = 0;
  while (nextValue >= 1000 && unitIndex < units.length - 1) {
    nextValue /= 1000;
    unitIndex += 1;
  }
  const unit = units[unitIndex] || "B";
  const rounded = nextValue >= 10 || unitIndex === 0 ? Math.round(nextValue) : nextValue.toFixed(1);
  return `${rounded} ${unit}`;
}

function isToolLifecycleAction(action: string | null): boolean {
  return action === "tool-install" || action === "tool-update" || action === "tool-check-updates";
}

function isActiveProgressStage(stage: string | null): boolean {
  return (
    stage === null ||
    stage === "queued" ||
    stage === "running" ||
    stage === "downloading" ||
    stage === "extracting" ||
    stage === "stdout" ||
    stage === "stderr"
  );
}

function getToolDisplayName(
  descriptors: LabToolDescriptorRecord[],
  toolId: string | null,
  fallback: string
): string {
  if (toolId === null) {
    return fallback;
  }
  const descriptor = descriptors.find(function (entry) {
    return asNonEmptyString(entry.toolId) === toolId;
  });
  return asNonEmptyString(descriptor?.displayName) || toolId;
}

function getProgressActionLabel(action: string | null, copy: LabI18n): string {
  switch (action) {
    case null:
      return copy.t("mediaAnalysis.toolManager.progress.actions.generic", "Araç işlemi");
    case "tool-install":
      return copy.t("mediaAnalysis.toolManager.progress.actions.install", "Kurulum");
    case "tool-update":
      return copy.t("mediaAnalysis.toolManager.progress.actions.update", "Güncelleme");
    case "tool-check-updates":
      return copy.t(
        "mediaAnalysis.toolManager.progress.actions.checkUpdates",
        "Güncelleme kontrolü"
      );
    default:
      return copy.t("mediaAnalysis.toolManager.progress.actions.generic", "Araç işlemi");
  }
}

function getProgressStageLabel(stage: string | null, copy: LabI18n): string {
  switch (stage) {
    case null:
      return copy.t("mediaAnalysis.toolManager.progress.stage.tracking", "İzleniyor");
    case "queued":
      return copy.t("mediaAnalysis.toolManager.progress.stage.queued", "Kuyrukta");
    case "running":
      return copy.t("mediaAnalysis.toolManager.progress.stage.running", "Çalışıyor");
    case "downloading":
      return copy.t("mediaAnalysis.toolManager.progress.stage.downloading", "İndiriliyor");
    case "extracting":
      return copy.t("mediaAnalysis.toolManager.progress.stage.extracting", "Açılıyor");
    case "stdout":
    case "stderr":
      return copy.t("mediaAnalysis.toolManager.progress.stage.output", "Çıktı");
    case "completed":
      return copy.t("mediaAnalysis.toolManager.progress.stage.completed", "Tamamlandı");
    case "failed":
      return copy.t("mediaAnalysis.toolManager.progress.stage.failed", "Hata");
    case "cancelled":
      return copy.t("mediaAnalysis.toolManager.progress.stage.cancelled", "İptal edildi");
    default:
      return copy.t("mediaAnalysis.toolManager.progress.stage.tracking", "İzleniyor");
  }
}

function getSnapshotToolJobs(
  state: LabStoreState,
  descriptors: LabToolDescriptorRecord[],
  copy: LabI18n
): LabToolProgressItem[] {
  const snapshot = asLabRecord(state.snapshot);
  const jobs = Array.isArray(snapshot["jobs"]) ? (snapshot["jobs"] as unknown[]) : [];

  return jobs
    .map(function (entry) {
      const job = asLabRecord(entry);
      const action = asNonEmptyString(job["action"]);
      const toolId = asNonEmptyString(job["toolId"]);
      if (isToolLifecycleAction(action) !== true && toolId === null) {
        return null;
      }
      if (isToolLifecycleAction(action) !== true) {
        return null;
      }

      const stage = asNonEmptyString(job["stage"]);
      const toolLabel = getToolDisplayName(
        descriptors,
        toolId,
        copy.t("mediaAnalysis.toolManager.progress.unknownTool", "Araç")
      );
      const jobId = asNonEmptyString(job["jobId"]) || `${action}:${toolId || "tool"}`;
      const detailLines = toStringArray(job["detailLines"]);
      const bytesReceived = asFiniteNumber(job["bytesReceived"]);
      const bytesTotal = asFiniteNumber(job["bytesTotal"]);
      return {
        action,
        bytesReceived,
        bytesTotal,
        canCancel:
          isActiveProgressStage(stage) &&
          (action === "tool-install" || action === "tool-update") &&
          jobId.startsWith(`${action}:`) !== true,
        detail:
          asNonEmptyString(job["phaseLabel"]) ||
          asNonEmptyString(job["message"]) ||
          copy.t(
            "mediaAnalysis.toolManager.progress.fallbackDetail",
            "İşlem ayrıntısı bekleniyor."
          ),
        detailLines,
        id: jobId,
        lastLine: asNonEmptyString(job["lastLine"]),
        packageName: asNonEmptyString(job["packageName"]),
        percent: clampProgress(job["percent"]),
        phaseCount: asFiniteNumber(job["phaseCount"]),
        phaseIndex: asFiniteNumber(job["phaseIndex"]),
        phaseLabel: asNonEmptyString(job["phaseLabel"]),
        phasePercent: clampProgress(job["phasePercent"]),
        stage,
        title: `${toolLabel} · ${getProgressActionLabel(action, copy)}`,
        toolId,
      };
    })
    .filter((entry): entry is LabToolProgressItem => entry !== null)
    .sort(function (left, right) {
      const leftActive = isActiveProgressStage(left.stage) ? 0 : 1;
      const rightActive = isActiveProgressStage(right.stage) ? 0 : 1;
      if (leftActive !== rightActive) {
        return leftActive - rightActive;
      }
      return left.title.localeCompare(right.title, copy.locale || "tr");
    });
}

function getBusyToolFallbackItems(
  state: LabStoreState,
  descriptors: LabToolDescriptorRecord[],
  jobs: LabToolProgressItem[],
  copy: LabI18n
): LabToolProgressItem[] {
  const activeToolIds = new Set(
    jobs
      .map(function (job) {
        return job.toolId;
      })
      .filter((toolId): toolId is string => toolId !== null)
  );

  return descriptors
    .map(function (descriptor): LabToolProgressItem | null {
      const toolId = asNonEmptyString(descriptor.toolId);
      if (toolId === null || activeToolIds.has(toolId)) {
        return null;
      }
      const entry = getToolEntry(state, toolId);
      if (entry.busy !== true) {
        return null;
      }
      const toolLabel = getToolDisplayName(descriptors, toolId, toolId);
      return {
        action: null,
        bytesReceived: null,
        bytesTotal: null,
        canCancel: false,
        detail: copy.t(
          "mediaAnalysis.toolManager.progress.fallbackDetail",
          "İşlem ayrıntısı bekleniyor."
        ),
        detailLines: [],
        id: `busy:${toolId}`,
        lastLine: null,
        packageName: null,
        percent: null,
        phaseCount: null,
        phaseIndex: null,
        phaseLabel: null,
        phasePercent: null,
        stage: "running",
        title: `${toolLabel} · ${getProgressActionLabel(null, copy)}`,
        toolId,
      };
    })
    .filter((entry): entry is LabToolProgressItem => entry !== null);
}

function getToolProgressItems(
  state: LabStoreState,
  descriptors: LabToolDescriptorRecord[],
  copy: LabI18n
): LabToolProgressItem[] {
  const snapshotJobs = getSnapshotToolJobs(state, descriptors, copy);
  return snapshotJobs.concat(getBusyToolFallbackItems(state, descriptors, snapshotJobs, copy));
}

function renderToolProgressCard(item: LabToolProgressItem, copy: LabI18n): string {
  const active = isActiveProgressStage(item.stage);
  const progressValue =
    item.stage === "completed" ? 100 : item.percent === null ? null : item.percent;
  const progressStyle =
    progressValue === null
      ? ""
      : ` style="width: ${escapeHtml(String(Math.max(4, progressValue)))}%;"`;
  const ariaValue =
    progressValue === null ? "" : ` aria-valuenow="${escapeHtml(String(progressValue))}"`;
  const percentLabel =
    progressValue === null
      ? copy.t("mediaAnalysis.toolManager.progress.pendingPercent", "Hazırlanıyor")
      : copy.t("mediaAnalysis.toolManager.progress.percent", "{percent}%", {
          percent: progressValue,
        });
  const transferLabel =
    item.bytesReceived !== null && item.bytesTotal !== null
      ? `${formatBytes(item.bytesReceived) || "--"} / ${formatBytes(item.bytesTotal) || "--"}`
      : item.bytesTotal !== null
        ? copy.t("mediaAnalysis.toolManager.progress.packageSize", "Paket boyutu {size}", {
            size: formatBytes(item.bytesTotal) || "--",
          })
        : null;
  const phaseLabel =
    item.phaseLabel !== null && item.phaseIndex !== null && item.phaseCount !== null
      ? copy.t("mediaAnalysis.toolManager.progress.phase", "Aşama {index}/{count}: {label}", {
          index: item.phaseIndex,
          count: item.phaseCount,
          label: item.phaseLabel,
        })
      : item.phaseLabel;
  const detailRows = [
    phaseLabel,
    item.packageName !== null
      ? copy.t("mediaAnalysis.toolManager.progress.package", "Paket: {name}", {
          name: item.packageName,
        })
      : null,
    transferLabel,
    item.lastLine !== null
      ? copy.t("mediaAnalysis.toolManager.progress.lastOutput", "Son çıktı: {line}", {
          line: item.lastLine,
        })
      : null,
  ].filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
  const extraLines = item.detailLines
    .filter(function (line) {
      return detailRows.some((row) => row.includes(line)) !== true;
    })
    .slice(-3);
  const detailMarkup =
    detailRows.length > 0 || extraLines.length > 0
      ? `<div class="labx-tool-progress-card__details">
          ${detailRows
            .map(function (line) {
              return `<span>${escapeHtml(line)}</span>`;
            })
            .join("")}
          ${extraLines
            .map(function (line) {
              return `<code>${escapeHtml(line)}</code>`;
            })
            .join("")}
        </div>`
      : "";
  const cancelButton =
    item.canCancel === true
      ? `<button class="labx-tool-progress-card__cancel" type="button" data-lab-action="tool-job-cancel" data-lab-value="${escapeHtml(item.id)}">
          ${escapeHtml(copy.t("mediaAnalysis.toolManager.progress.cancel", "İptal"))}
        </button>`
      : "";

  return `
    <article class="labx-tool-progress-card" data-stage="${escapeHtml(item.stage || "tracking")}">
      <div class="labx-tool-progress-card__head">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(getProgressStageLabel(item.stage, copy))}</span>
      </div>
      <div
        class="labx-tool-progress-card__bar"
        role="progressbar"
        aria-label="${escapeHtml(item.title)}"
        aria-valuemin="0"
        aria-valuemax="100"
        data-indeterminate="${active && progressValue === null ? "true" : "false"}"
        ${ariaValue}
      >
        <span${progressStyle}></span>
      </div>
      <div class="labx-tool-progress-card__meta">
        <span>${escapeHtml(item.detail)}</span>
        <strong>${escapeHtml(percentLabel)}</strong>
      </div>
      ${detailMarkup}
      ${cancelButton}
    </article>
  `;
}

function renderToolManagerStats(stats: LabToolManagerStats, copy: LabI18n): string {
  return `
    <div class="labx-tool-manager-stats labx-tool-manager-stats--rail" aria-label="${escapeHtml(copy.t("mediaAnalysis.toolManager.stats.catalog", "Araç kataloğu"))}">
      <span>${escapeHtml(copy.t("mediaAnalysis.toolManager.stats.catalog", "Araç kataloğu"))}: <strong>${escapeHtml(String(stats.catalogCount))}</strong></span>
      <span>${escapeHtml(copy.t("mediaAnalysis.toolManager.stats.installed", "Kurulu araç"))}: <strong>${escapeHtml(String(stats.installedCount))}</strong></span>
      <span>${escapeHtml(copy.t("mediaAnalysis.toolManager.stats.updates", "Güncelleme bekleyen"))}: <strong>${escapeHtml(String(stats.updateCount))}</strong></span>
    </div>
  `;
}

function getUpdateChoices(
  state: LabStoreState,
  descriptors: LabToolDescriptorRecord[]
): LabToolUpdateChoice[] {
  return descriptors
    .map(function (descriptor): LabToolUpdateChoice | null {
      const toolId = asNonEmptyString(descriptor.toolId);
      if (toolId === null || isSettingsManagedTool(toolId)) {
        return null;
      }
      const entry = getToolEntry(state, toolId);
      if (entry.updateAvailable !== true) {
        return null;
      }
      return {
        displayName: asNonEmptyString(descriptor.displayName) || toolId,
        latestLabel:
          asNonEmptyString(entry.latestVersion) ||
          asNonEmptyString(entry.latestReleaseName) ||
          "--",
        toolId,
        versionLabel: asNonEmptyString(entry.version) || "--",
      };
    })
    .filter((entry): entry is LabToolUpdateChoice => entry !== null);
}

function renderToolUpdateSelection(
  state: LabStoreState,
  descriptors: LabToolDescriptorRecord[],
  stats: LabToolManagerStats,
  copy: LabI18n
): string {
  const choices = getUpdateChoices(state, descriptors);
  const disabled = stats.busyCount > 0 ? "disabled" : "";

  return `
    <div class="labx-tool-update-selection">
      <div class="labx-tool-update-selection__header">
        <strong>${escapeHtml(copy.t("mediaAnalysis.toolManager.updates.title", "Güncelleme listesi"))}</strong>
      </div>
      ${
        choices.length > 0
          ? `<div class="labx-tool-update-selection__list">${choices
              .map(function (choice) {
                const versionPair = copy.t(
                  "mediaAnalysis.toolManager.updates.versionPair",
                  "{current} -> {latest}",
                  {
                    current: choice.versionLabel,
                    latest: choice.latestLabel,
                  }
                );
                return `
                  <label class="labx-tool-update-choice">
                    <input type="checkbox" data-lab-update-choice value="${escapeHtml(choice.toolId)}" checked ${disabled} />
                    <span>
                      <strong>${escapeHtml(choice.displayName)}</strong>
                      <small>${escapeHtml(versionPair)}</small>
                    </span>
                  </label>
                `;
              })
              .join("")}</div>`
          : `<div class="labx-tool-update-selection__empty">
              <strong>${escapeHtml(copy.t("mediaAnalysis.toolManager.updates.empty", "Güncelleme bekleyen araç yok."))}</strong>
              <p>${escapeHtml(copy.t("mediaAnalysis.toolManager.updates.emptyDetail", "Kontrol tamamlandığında bulunan güncellemeler burada seçili görünür."))}</p>
            </div>`
      }
      <button
        class="labx-inline-action labx-inline-action--primary labx-tool-update-selection__action"
        type="button"
        data-lab-action="tool-update-selected"
        ${choices.length === 0 || stats.busyCount > 0 ? "disabled" : ""}
      >
        ${escapeHtml(copy.t("mediaAnalysis.toolManager.actions.updateSelected", "Güncelle"))}
      </button>
    </div>
  `;
}

function renderToolProgressRail(
  state: LabStoreState,
  descriptors: LabToolDescriptorRecord[],
  stats: LabToolManagerStats,
  copy: LabI18n = LAB_FALLBACK_I18N
): string {
  const progressItems = getToolProgressItems(state, descriptors, copy);
  const activeCount = progressItems.filter(function (item) {
    return isActiveProgressStage(item.stage);
  }).length;

  return `
    <aside class="labx-tool-progress-rail" aria-label="${escapeHtml(copy.t("mediaAnalysis.toolManager.progress.ariaLabel", "Kurulum ve güncelleme ilerlemesi"))}">
      ${renderToolManagerStats(stats, copy)}
      <div class="labx-tool-progress-rail__header">
        <p class="labx-card__eyebrow">${escapeHtml(copy.t("mediaAnalysis.toolManager.progress.eyebrow", "İşlem takibi"))}</p>
        <h3 class="labx-card__title">${escapeHtml(copy.t("mediaAnalysis.toolManager.progress.title", "Kurulum ve güncelleme"))}</h3>
        <span>${escapeHtml(copy.t("mediaAnalysis.toolManager.progress.activeCount", "{count} aktif", { count: activeCount }))}</span>
      </div>
      ${
        progressItems.length > 0
          ? `<div class="labx-tool-progress-rail__list">${progressItems
              .map(function (item) {
                return renderToolProgressCard(item, copy);
              })
              .join("")}</div>`
          : ""
      }
      ${renderToolUpdateSelection(state, descriptors, stats, copy)}
    </aside>
  `;
}

function getToolRegistry(state: LabStoreState): LabToolDescriptorRecord[] {
  const snapshot = asLabRecord(state.snapshot);
  const registry = Array.isArray(snapshot["toolRegistry"])
    ? (snapshot["toolRegistry"] as unknown[]).map(toToolDescriptorRecord)
    : [];

  if (registry.length > 0) {
    return registry.slice().sort(function (left, right) {
      const leftLabel = asNonEmptyString(left.displayName) || asNonEmptyString(left.toolId) || "";
      const rightLabel =
        asNonEmptyString(right.displayName) || asNonEmptyString(right.toolId) || "";
      return leftLabel.localeCompare(rightLabel, "tr");
    });
  }

  const tools = asLabRecord(asLabRecord(state.toolState)["tools"]);
  return Object.keys(tools)
    .map(function (toolId) {
      return {
        toolId,
        displayName: toolId,
      };
    })
    .sort(function (left, right) {
      const leftLabel = asNonEmptyString(left.displayName) || asNonEmptyString(left.toolId) || "";
      const rightLabel =
        asNonEmptyString(right.displayName) || asNonEmptyString(right.toolId) || "";
      return leftLabel.localeCompare(rightLabel, "tr");
    });
}

function getToolEntry(state: LabStoreState, toolId: string): LabToolEntryRecord {
  const tools = asLabRecord(asLabRecord(state.toolState)["tools"]);
  return {
    installed: false,
    version: null,
    latestVersion: null,
    latestReleaseName: null,
    binaryPath: null,
    installDir: null,
    lastCheckedAt: null,
    updateAvailable: false,
    busy: false,
    lastError: null,
    ...toToolEntryRecord(tools[toolId]),
    toolId,
  };
}

function getInstallStrategy(descriptor: LabToolDescriptorRecord): string {
  const availability = asNonEmptyString(descriptor.availability) || "installable";
  const strategy = asNonEmptyString(descriptor.installStrategy);
  if (availability === "planned" || strategy === "planned") {
    return "planned";
  }
  if (availability === "system-command" && asNonEmptyString(descriptor.installerType) === null) {
    return "system-command";
  }
  return "automatic";
}

function getSupportLevel(descriptor: LabToolDescriptorRecord, stageId: string): string {
  return asNonEmptyString(asLabRecord(descriptor.stageSupport)[stageId]) || "unsupported";
}

function getStageLabel(stageId: string, copy: LabI18n = LAB_FALLBACK_I18N): string {
  return copy.t(`mediaAnalysis.stages.${stageId}`, STAGE_LABELS[stageId] || stageId);
}

function getSupportLabel(
  supportLevel: string,
  stageId: string,
  copy: LabI18n = LAB_FALLBACK_I18N
): string {
  const stageLabel = getStageLabel(stageId, copy);
  switch (supportLevel) {
    case "required":
      return copy.t("mediaAnalysis.toolManager.support.requiredForStage", "{stage} için zorunlu", {
        stage: stageLabel,
      });
    case "optional":
      return copy.t(
        "mediaAnalysis.toolManager.support.optionalForStage",
        "{stage} için opsiyonel",
        {
          stage: stageLabel,
        }
      );
    default:
      return copy.t("mediaAnalysis.toolManager.support.roomWide", "Genel");
  }
}

function formatLastCheckedAt(value: unknown): string | null {
  const rawValue = asNonEmptyString(value);
  if (rawValue === null) {
    return null;
  }
  const date = new Date(rawValue);
  if (Number.isNaN(date.getTime())) {
    return rawValue;
  }
  return date.toLocaleString("tr-TR", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  });
}

function getSystemCommandVerificationHint(
  descriptor: LabToolDescriptorRecord,
  entry: LabToolEntryRecord,
  copy: LabI18n = LAB_FALLBACK_I18N
): string | null {
  if (
    asNonEmptyString(descriptor.availability) !== "system-command" ||
    asNonEmptyString(descriptor.installerType) !== null
  ) {
    return null;
  }
  const checkedAt = formatLastCheckedAt(entry.lastCheckedAt);
  if (checkedAt === null) {
    return null;
  }
  const version = asNonEmptyString(entry.version);
  const location = asNonEmptyString(entry.binaryPath) || asNonEmptyString(entry.installDir);
  if (entry.installed === true) {
    const detail = [version === null ? null : `sürüm ${version}`, location].filter(
      (item): item is string => item !== null
    );
    return copy.t(
      "mediaAnalysis.toolManager.lifecycle.systemCommandVerified",
      "Son doğrulama başarılı ({checkedAt}){detail}.",
      {
        checkedAt,
        detail: detail.length === 0 ? "" : `: ${detail.join(", ")}`,
      }
    );
  }
  return copy.t(
    "mediaAnalysis.toolManager.lifecycle.systemCommandMissing",
    "Son doğrulama ({checkedAt}): araç bulunamadı.",
    {
      checkedAt,
    }
  );
}

function getStatusChip(
  descriptor: LabToolDescriptorRecord,
  entry: LabToolEntryRecord,
  copy: LabI18n = LAB_FALLBACK_I18N
) {
  const availability = asNonEmptyString(descriptor.availability) || "installable";
  const installStrategy = getInstallStrategy(descriptor);
  const chips = [
    entry.busy === true
      ? renderStatusChip(copy.t("mediaAnalysis.toolManager.status.busy", "Çalışıyor"), "running")
      : entry.installed === true
        ? renderStatusChip(
            entry.updateAvailable === true
              ? copy.t("mediaAnalysis.toolManager.status.updateAvailable", "Güncelleme var")
              : copy.t("mediaAnalysis.toolManager.status.installed", "Kurulu"),
            entry.updateAvailable === true ? "warning" : "success"
          )
        : availability === "planned" || installStrategy === "planned"
          ? renderStatusChip(
              copy.t("mediaAnalysis.toolManager.status.planned", "Planlı"),
              "neutral"
            )
          : renderStatusChip(
              copy.t("mediaAnalysis.toolManager.status.notReady", "Hazır değil"),
              "neutral"
            ),
  ].filter(function (entryMarkup) {
    return entryMarkup !== "";
  });

  return chips.join("");
}

function getLifecycleHint(
  descriptor: LabToolDescriptorRecord,
  entry: LabToolEntryRecord,
  copy: LabI18n = LAB_FALLBACK_I18N
): string | null {
  const toolId = asNonEmptyString(descriptor.toolId) || asNonEmptyString(entry.toolId);
  if (isSettingsManagedTool(toolId)) {
    return copy.t(
      "mediaAnalysis.toolManager.lifecycle.settingsManaged",
      "Speech Runtime lifecycle is managed in main Settings. Laboratory only reflects the current runtime probe and active language/model readiness."
    );
  }
  if (typeof entry.lastError === "string" && entry.lastError.trim() !== "") {
    return copy.t("mediaAnalysis.toolManager.lifecycle.lastError", "Son hata: {error}", {
      error: entry.lastError.trim(),
    });
  }
  const verificationHint = getSystemCommandVerificationHint(descriptor, entry, copy);
  if (verificationHint !== null) {
    const setupHint =
      typeof descriptor.setupHint === "string" && descriptor.setupHint.trim() !== ""
        ? descriptor.setupHint.trim()
        : null;
    return setupHint === null ? verificationHint : `${verificationHint} ${setupHint}`;
  }
  const checkedAt = formatLastCheckedAt(entry.lastCheckedAt);
  if (entry.installed === true && checkedAt !== null) {
    if (entry.updateAvailable === true) {
      return copy.t(
        "mediaAnalysis.toolManager.lifecycle.updateAvailable",
        "Güncelleme bulundu ({checkedAt}). Güncelle butonu hazır.",
        {
          checkedAt,
        }
      );
    }
    return null;
  }
  if (
    asNonEmptyString(descriptor.availability) === "system-command" &&
    asNonEmptyString(descriptor.installerType) === null &&
    typeof descriptor.setupHint === "string" &&
    descriptor.setupHint.trim() !== ""
  ) {
    return descriptor.setupHint.trim();
  }
  if (typeof descriptor.readinessImpact === "string" && descriptor.readinessImpact.trim() !== "") {
    return translateToolDescriptorText(
      toolId,
      "readinessImpact",
      descriptor.readinessImpact.trim(),
      copy
    );
  }
  if (typeof descriptor.plannedReason === "string" && descriptor.plannedReason.trim() !== "") {
    return translateToolDescriptorText(
      toolId,
      "plannedReason",
      descriptor.plannedReason.trim(),
      copy
    );
  }
  return copy.t(
    "mediaAnalysis.toolManager.lifecycle.default",
    "Araç durumu room-local registry üzerinden izlenir."
  );
}

function renderToolActions(
  descriptor: LabToolDescriptorRecord,
  entry: LabToolEntryRecord,
  copy: LabI18n = LAB_FALLBACK_I18N
): string {
  const toolId = asNonEmptyString(descriptor.toolId) || asNonEmptyString(entry.toolId) || "";
  if (toolId === "") {
    return "";
  }

  if (isSettingsManagedTool(toolId)) {
    return `
      <button class="labx-inline-action" type="button" disabled>
        ${escapeHtml(copy.t("mediaAnalysis.toolManager.actions.settingsManaged", "Settings'ten yönetilir"))}
      </button>
    `;
  }

  const availability = asNonEmptyString(descriptor.availability) || "installable";
  const installStrategy = getInstallStrategy(descriptor);
  const disabled = entry.busy === true ? "disabled" : "";

  if (availability === "planned" || installStrategy === "planned") {
    return `
      <button class="labx-inline-action" type="button" disabled>
        ${escapeHtml(copy.t("mediaAnalysis.toolManager.actions.planned", "Planlı"))}
      </button>
    `;
  }

  if (installStrategy === "system-command") {
    return `
      <button class="labx-inline-action ${entry.installed === true ? "" : "labx-inline-action--primary"}" type="button" data-lab-action="tools-refresh" ${disabled}>
        ${escapeHtml(copy.t("mediaAnalysis.toolManager.actions.verifySystemCommand", "Doğrula"))}
      </button>
    `;
  }

  if (entry.installed === true) {
    return "";
  }

  return `
    <button class="labx-inline-action labx-inline-action--primary" type="button" data-lab-action="tool-install-review" data-lab-value="${escapeHtml(toolId)}" ${disabled}>
      ${escapeHtml(copy.t("mediaAnalysis.toolManager.actions.install", "Kur"))}
    </button>
  `;
}

function truncateLocationPath(path: string): string {
  if (path === "--" || path.trim() === "") return path;
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(function (p) {
    return p !== "";
  });
  if (parts.length <= 2) return path;
  return `\u2026/${parts.slice(-2).join("/")}`;
}

function truncateErrorMessage(error: string): string {
  const newlineIdx = error.indexOf("\n");
  const firstLine = (newlineIdx >= 0 ? error.slice(0, newlineIdx) : error).trim();
  if (firstLine.length <= 110) return firstLine;
  return `${firstLine.slice(0, 107)}\u2026`;
}

function renderUsedBy(descriptor: LabToolDescriptorRecord, copy: LabI18n): string {
  const usedBy = toStringArray(descriptor.usedBy);
  if (usedBy.length === 0) {
    return "";
  }

  return `
    <div class="labx-selection-strip">
	      ${usedBy
          .map(function (entry) {
            return `<span class="labx-selection-badge">${escapeHtml(translateUsedByLabel(entry, copy))}</span>`;
          })
          .join("")}
    </div>
  `;
}

function renderToolCard(
  state: LabStoreState,
  descriptor: LabToolDescriptorRecord,
  stageId: string,
  copy: LabI18n = LAB_FALLBACK_I18N
): string {
  const toolId = asNonEmptyString(descriptor.toolId);
  if (toolId === null) {
    return "";
  }

  const entry = getToolEntry(state, toolId);
  const displayName = asNonEmptyString(descriptor.displayName) || toolId;
  const supportLevel = getSupportLevel(descriptor, stageId);
  const versionLabel = asNonEmptyString(entry.version) || "--";
  const latestLabel =
    asNonEmptyString(entry.latestVersion) || asNonEmptyString(entry.latestReleaseName) || "--";
  const locationLabel =
    asNonEmptyString(entry.binaryPath) || asNonEmptyString(entry.installDir) || "--";
  const checkedAtLabel = formatLastCheckedAt(entry.lastCheckedAt) || "--";

  const hasError = typeof entry.lastError === "string" && entry.lastError.trim() !== "";
  const lifecycleHint = getLifecycleHint(descriptor, entry, copy);
  const lifecycleMarkup = hasError
    ? `<p class="labx-module-card__error-hint">${escapeHtml(truncateErrorMessage(entry.lastError as string))}</p>`
    : lifecycleHint === null
      ? ""
      : `<p class="labx-panel-hint">${escapeHtml(lifecycleHint)}</p>`;
  const truncatedLocation = truncateLocationPath(locationLabel);
  const pythonRuntimeLabel = getPythonRuntimeLabel(descriptor, copy);
  const supportedPythonLabel = getSupportedPythonLabel(descriptor);
  const actionMarkup = renderToolActions(descriptor, entry, copy).trim();

  return `
    <article class="labx-module-card" data-selected="${entry.installed === true ? "true" : "false"}" data-active="${supportLevel === "required" ? "true" : "false"}" data-has-error="${hasError ? "true" : "false"}">
      <div class="labx-module-card__head">
        <div>
          <strong>${escapeHtml(displayName)}</strong>
        </div>
        <div class="labx-chip-row">
          ${getStatusChip(descriptor, entry, copy)}
        </div>
      </div>
      ${lifecycleMarkup}
      ${renderUsedBy(descriptor, copy)}
      <div class="labx-module-card__meta-details">
        <div class="labx-summary-list">
          <div><span>${escapeHtml(copy.t("mediaAnalysis.toolManager.labels.stageSupport", "Aşama desteği"))}</span><strong>${escapeHtml(getSupportLabel(supportLevel, stageId, copy))}</strong></div>
          <div><span>${escapeHtml(copy.t("mediaAnalysis.toolManager.labels.installedVersion", "Kurulu sürüm"))}</span><strong>${escapeHtml(versionLabel)}</strong></div>
          <div><span>${escapeHtml(copy.t("mediaAnalysis.toolManager.labels.latestVersion", "Son sürüm"))}</span><strong>${escapeHtml(latestLabel)}</strong></div>
          <div><span>${escapeHtml(copy.t("mediaAnalysis.toolManager.labels.lastCheckedAt", "Son kontrol"))}</span><strong>${escapeHtml(checkedAtLabel)}</strong></div>
          <div><span>${escapeHtml(copy.t("mediaAnalysis.toolManager.labels.location", "Konum"))}</span><strong class="labx-summary-list__path" title="${escapeHtml(locationLabel)}">${escapeHtml(truncatedLocation)}</strong></div>
          ${
            pythonRuntimeLabel === null
              ? ""
              : `<div><span>${escapeHtml(copy.t("mediaAnalysis.toolManager.labels.pythonRuntime", "Python runtime"))}</span><strong>${escapeHtml(pythonRuntimeLabel)}</strong></div>`
          }
          ${
            supportedPythonLabel === null
              ? ""
              : `<div><span>${escapeHtml(copy.t("mediaAnalysis.toolManager.labels.requiredPython", "Gerekli Python"))}</span><strong>${escapeHtml(supportedPythonLabel)}</strong></div>`
          }
        </div>
      </div>
      ${actionMarkup === "" ? "" : `<div class="labx-module-card__actions">${actionMarkup}</div>`}
    </article>
  `;
}

function renderToolSection(
  state: LabStoreState,
  stageId: string,
  descriptors: LabToolDescriptorRecord[],
  copy: LabI18n = LAB_FALLBACK_I18N
): string {
  return `
    <section class="labx-list-stack">
      <div class="labx-module-catalog">${descriptors
        .map(function (descriptor) {
          return renderToolCard(state, descriptor, stageId, copy);
        })
        .join("")}</div>
    </section>
  `;
}

function renderInstallPackageList(descriptor: LabToolDescriptorRecord, copy: LabI18n): string {
  const packages = toStringArray(descriptor.installPackages);
  if (packages.length === 0) {
    return `<span>${escapeHtml(copy.t("mediaAnalysis.toolManager.installReview.noPackages", "Paket listesi runtime tarafından çözülecek."))}</span>`;
  }
  return packages
    .map(function (entry) {
      return `<span class="labx-selection-badge">${escapeHtml(entry)}</span>`;
    })
    .join("");
}

function renderToolInstallConfirmation(
  state: LabStoreState,
  descriptors: LabToolDescriptorRecord[],
  copy: LabI18n
): string {
  const toolId = asNonEmptyString(state.ui.toolInstallReviewToolId);
  if (toolId === null) {
    return "";
  }

  const descriptor = descriptors.find(function (entry) {
    return asNonEmptyString(entry.toolId) === toolId;
  });
  if (descriptor === undefined) {
    return "";
  }

  const entry = getToolEntry(state, toolId);
  const availability = asNonEmptyString(descriptor.availability) || "installable";
  const installStrategy = getInstallStrategy(descriptor);
  if (
    entry.busy === true ||
    entry.installed === true ||
    availability === "planned" ||
    installStrategy === "planned" ||
    installStrategy === "system-command"
  ) {
    return "";
  }

  const displayName = asNonEmptyString(descriptor.displayName) || toolId;
  const downloadSize =
    asNonEmptyString(descriptor.estimatedDownloadSize) ||
    copy.t("mediaAnalysis.toolManager.installReview.unknownEstimate", "Kesin değil");
  const installedSize =
    asNonEmptyString(descriptor.estimatedInstalledSize) ||
    copy.t("mediaAnalysis.toolManager.installReview.unknownEstimate", "Kesin değil");
  const target = asNonEmptyString(descriptor.venvDir) || "--";
  const renderedTarget = target.replace("${roomStorageDir}/", "room-storage/");
  const pythonRuntimeLabel = getPythonRuntimeLabel(descriptor, copy);
  const supportedPythonLabel = getSupportedPythonLabel(descriptor);

  return `
    <div class="labx-tool-install-confirm-layer" role="presentation">
      <button
        class="labx-tool-install-confirm-layer__backdrop"
        type="button"
        aria-label="${escapeHtml(copy.t("mediaAnalysis.toolManager.installReview.dismiss", "Vazgeç"))}"
        data-lab-action="tool-install-dismiss"
      ></button>
      <section class="labx-tool-install-confirm" role="dialog" aria-modal="true" aria-label="${escapeHtml(copy.t("mediaAnalysis.toolManager.installReview.ariaLabel", "Kurulum onayı"))}">
        <div class="labx-tool-install-confirm__head">
          <p class="labx-card__eyebrow">${escapeHtml(copy.t("mediaAnalysis.toolManager.installReview.eyebrow", "Kurulum öncesi"))}</p>
          <h3>${escapeHtml(copy.t("mediaAnalysis.toolManager.installReview.title", "{tool} kurulacak", { tool: displayName }))}</h3>
          <p>${escapeHtml(copy.t("mediaAnalysis.toolManager.installReview.body", "Bu işlem Laboratory bünyesinde yönetilen Python ile izole bir araç ortamı hazırlayıp gerekli paketleri kuracak."))}</p>
        </div>
        <div class="labx-tool-install-confirm__grid">
          <div><span>${escapeHtml(copy.t("mediaAnalysis.toolManager.installReview.download", "İndirilecek veri"))}</span><strong>${escapeHtml(downloadSize)}</strong></div>
          <div><span>${escapeHtml(copy.t("mediaAnalysis.toolManager.installReview.disk", "Disk kullanımı"))}</span><strong>${escapeHtml(installedSize)}</strong></div>
          <div><span>${escapeHtml(copy.t("mediaAnalysis.toolManager.installReview.target", "Hedef"))}</span><strong title="${escapeHtml(target)}">${escapeHtml(truncateLocationPath(renderedTarget))}</strong></div>
          ${
            pythonRuntimeLabel === null
              ? ""
              : `<div><span>${escapeHtml(copy.t("mediaAnalysis.toolManager.installReview.pythonRuntime", "Python runtime"))}</span><strong>${escapeHtml(pythonRuntimeLabel)}</strong></div>`
          }
          ${
            supportedPythonLabel === null
              ? ""
              : `<div><span>${escapeHtml(copy.t("mediaAnalysis.toolManager.installReview.requiredPython", "Gerekli Python"))}</span><strong>${escapeHtml(supportedPythonLabel)}</strong></div>`
          }
        </div>
        <div class="labx-tool-install-confirm__steps">
          <span>${escapeHtml(copy.t("mediaAnalysis.toolManager.installReview.steps", "Yapılacak işlemler"))}</span>
          <ol>
            <li>${escapeHtml(copy.t("mediaAnalysis.toolManager.installReview.stepRuntime", "Room-local Python runtime oluşturulur veya bozuksa onarılır."))}</li>
            <li>${escapeHtml(copy.t("mediaAnalysis.toolManager.installReview.stepTooling", "pip, setuptools ve wheel güncellenir."))}</li>
            <li>${escapeHtml(copy.t("mediaAnalysis.toolManager.installReview.stepPackages", "Python paketleri indirilip kurulur."))}</li>
            <li>${escapeHtml(copy.t("mediaAnalysis.toolManager.installReview.stepProbe", "Kurulum import probe ile doğrulanır."))}</li>
          </ol>
        </div>
        <div class="labx-tool-install-confirm__packages" aria-label="${escapeHtml(copy.t("mediaAnalysis.toolManager.installReview.packages", "Paketler"))}">
          ${renderInstallPackageList(descriptor, copy)}
        </div>
        <div class="labx-tool-install-confirm__actions">
          <button class="labx-inline-action labx-inline-action--ghost" type="button" data-lab-action="tool-install-dismiss">
            ${escapeHtml(copy.t("mediaAnalysis.toolManager.installReview.dismiss", "Vazgeç"))}
          </button>
          <button class="labx-inline-action labx-inline-action--primary" type="button" data-lab-action="tool-install-confirm" data-lab-value="${escapeHtml(toolId)}">
            ${escapeHtml(copy.t("mediaAnalysis.toolManager.installReview.confirm", "Kurulumu başlat"))}
          </button>
        </div>
      </section>
    </div>
  `;
}

export function renderToolManagementOverlay(
  state: LabStoreState,
  copy: LabI18n = LAB_FALLBACK_I18N
) {
  const isOpen = state.ui.toolManagerOpen === true;
  const descriptors = getToolRegistry(state);
  const stageId = getToolLifecycleStage(state);
  const roomManagedDescriptors = descriptors.filter(function (descriptor) {
    return isSettingsManagedTool(asNonEmptyString(descriptor.toolId)) !== true;
  });
  const busyCount = descriptors.filter(function (descriptor) {
    const toolId = asNonEmptyString(descriptor.toolId);
    return toolId !== null && getToolEntry(state, toolId).busy === true;
  }).length;
  const roomManagedInstalledCount = roomManagedDescriptors.filter(function (descriptor) {
    const toolId = asNonEmptyString(descriptor.toolId);
    return toolId !== null && getToolEntry(state, toolId).installed === true;
  }).length;
  const installedCount = descriptors.filter(function (descriptor) {
    const toolId = asNonEmptyString(descriptor.toolId);
    return toolId !== null && getToolEntry(state, toolId).installed === true;
  }).length;
  const updateCount = descriptors.filter(function (descriptor) {
    const toolId = asNonEmptyString(descriptor.toolId);
    return toolId !== null && getToolEntry(state, toolId).updateAvailable === true;
  }).length;

  return `
    <div class="labx-overlay-root" data-open="${isOpen ? "true" : "false"}">
      ${
        isOpen
          ? `
            <button
              class="labx-overlay-backdrop"
              type="button"
              aria-label="${escapeHtml(copy.t("mediaAnalysis.toolManager.closeAria", "Araç yönetimini kapat"))}"
              data-lab-action="dismiss-tool-manager"
            ></button>
            <section class="labx-module-overlay" role="dialog" aria-modal="true" aria-label="${escapeHtml(copy.t("mediaAnalysis.toolManager.ariaLabel", "Araç Yönetimi"))}">
              <div class="labx-module-overlay__header">
                <div>
	                  <h2 class="labx-module-overlay__title">${escapeHtml(copy.t("mediaAnalysis.toolManager.title", "Araç Yönetimi"))}</h2>
                </div>
                <div class="labx-inline-actions">
                  <button
                    class="labx-inline-action labx-inline-action--primary"
                    type="button"
                    data-lab-action="tool-check-all-updates"
                    ${roomManagedInstalledCount === 0 || busyCount > 0 ? "disabled" : ""}
                  >
                    ${escapeHtml(copy.t("mediaAnalysis.toolManager.actions.checkAllUpdates", "Güncellemeleri kontrol et"))}
                  </button>
                  <button
                    class="labx-inline-action"
                    type="button"
                    data-lab-action="tools-refresh"
                    ${busyCount > 0 ? "disabled" : ""}
                  >
                    ${escapeHtml(copy.t("mediaAnalysis.toolManager.actions.refresh", "Yenile"))}
                  </button>
                  <button class="labx-inline-action labx-inline-action--ghost" type="button" data-lab-action="close-tool-manager">
                    ${escapeHtml(copy.t("mediaAnalysis.toolManager.actions.close", "Kapat"))}
                  </button>
                </div>
              </div>
              <div class="labx-tool-manager-layout">
	                ${renderToolProgressRail(state, descriptors, { busyCount, catalogCount: descriptors.length, installedCount, updateCount }, copy)}
	                <div class="labx-tool-manager-main">
	                  ${renderToolSection(state, stageId, descriptors, copy)}
	                </div>
              </div>
              ${renderToolInstallConfirmation(state, descriptors, copy)}
            </section>
          `
          : ""
      }
    </div>
  `;
}
