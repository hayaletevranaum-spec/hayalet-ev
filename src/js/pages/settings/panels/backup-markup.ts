import { AppI18n } from "../../../modules/i18n/index.js";

interface BackupScopeDefinition {
  id: string;
  category: string;
  riskLevel: string;
  requiresColdRestore: boolean;
  restartTargets: string[];
}

interface BackupPresetDefinition {
  id: string;
  scopeIds: string[];
}

interface BackupListItem {
  filePath: string;
  createdAt: string | null;
  label: string | null;
  selectedScopes: string[];
  totalBytes: number | null;
  restoreMode: string | null;
  invalid?: boolean;
}

interface BackupPreviewResult {
  selectedScopes: string[];
  requiresColdRestore: boolean;
  restartTargets: string[];
  riskLevel: string;
  fileCount: number;
  overwrittenFilesCount: number;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function backupText(key: string): string {
  return AppI18n.t(`shell.backup.${key}`);
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || Number.isFinite(bytes) === false) {
    return "—";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string | null): string {
  if (value === null || value.trim() === "") {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function buildBackupSummaryMarkup(
  selectedScopes: BackupScopeDefinition[],
  preview: BackupPreviewResult | null
): string {
  const restartTargets = [...new Set(selectedScopes.flatMap((scope) => scope.restartTargets))];
  return [
    `<div class="room-manager-chip">${escapeHtml(backupText("summary.selectedScopes"))}: <strong>${String(
      selectedScopes.length
    )}</strong></div>`,
    `<div class="room-manager-chip">${escapeHtml(backupText("summary.requiresColdRestore"))}: <strong>${escapeHtml(
      selectedScopes.some((scope) => scope.requiresColdRestore)
        ? backupText("summary.yes")
        : backupText("summary.no")
    )}</strong></div>`,
    `<div class="room-manager-chip">${escapeHtml(backupText("summary.restartTargets"))}: <strong>${escapeHtml(
      restartTargets.length > 0 ? restartTargets.join(", ") : backupText("summary.none")
    )}</strong></div>`,
    preview !== null
      ? `<div class="room-manager-chip">${escapeHtml(backupText("summary.previewFiles"))}: <strong>${String(
          preview.fileCount
        )}</strong></div>`
      : "",
  ].join("");
}

export function buildBackupScopesMarkup(
  scopes: BackupScopeDefinition[],
  selectedScopeIds: Set<string>,
  presets: BackupPresetDefinition[]
): string {
  const grouped = new Map<string, BackupScopeDefinition[]>();
  for (const scope of scopes) {
    const bucket = grouped.get(scope.category) ?? [];
    bucket.push(scope);
    grouped.set(scope.category, bucket);
  }

  const presetMarkup = presets
    .map(
      (preset) =>
        `<button class="btn btn-ghost btn-sm" type="button" data-backup-preset="${escapeHtml(
          preset.id
        )}">${escapeHtml(backupText(`presets.${preset.id}`))}</button>`
    )
    .join("");

  const groupMarkup = [...grouped.entries()]
    .map(([category, categoryScopes]) => {
      const scopeMarkup = categoryScopes
        .map((scope) => {
          const checked = selectedScopeIds.has(scope.id) ? "checked" : "";
          return [
            '<label class="backup-scope-row">',
            `  <input type="checkbox" data-backup-scope="${escapeHtml(scope.id)}" ${checked}>`,
            '  <span class="backup-scope-body">',
            `    <span class="backup-scope-label">${escapeHtml(backupText(`scopes.${scope.id}.label`))}</span>`,
            `    <span class="backup-scope-note">${escapeHtml(
              backupText(`scopes.${scope.id}.note`)
            )} · ${escapeHtml(backupText(`risk.${scope.riskLevel}`))}</span>`,
            "  </span>",
            "</label>",
          ].join("");
        })
        .join("");

      return [
        '<section class="backup-scope-group">',
        `  <div class="room-manager-section-title">${escapeHtml(
          backupText(`categories.${category}`)
        )}</div>`,
        `  <div class="backup-scope-list">${scopeMarkup}</div>`,
        "</section>",
      ].join("");
    })
    .join("");

  return [
    `<div class="backup-preset-row">${presetMarkup}</div>`,
    `<div class="backup-scope-groups">${groupMarkup}</div>`,
  ].join("");
}

export function buildBackupListMarkup(
  backups: BackupListItem[],
  selectedFilePath: string | null,
  importedFilePath: string | null
): string {
  const rows = [...backups];
  const existingPaths = new Set(backups.map((item) => item.filePath));
  if (
    importedFilePath !== null &&
    rows.some((item) => item.filePath === importedFilePath) === false
  ) {
    rows.unshift({
      filePath: importedFilePath,
      createdAt: null,
      label: backupText("list.externalBundle"),
      selectedScopes: [],
      totalBytes: null,
      restoreMode: null,
    });
  }

  if (rows.length === 0) {
    return `<div class="room-manager-empty">${escapeHtml(backupText("list.empty"))}</div>`;
  }

  return rows
    .map((item) => {
      const isSelected = item.filePath === selectedFilePath;
      const isExternalOnly =
        item.filePath === importedFilePath && existingPaths.has(item.filePath) === false;
      return [
        '<div class="backup-bundle-item">',
        `  <button class="backup-bundle-row${isSelected ? " is-selected" : ""}" type="button" data-backup-file="${escapeHtml(
          item.filePath
        )}">`,
        '    <span class="backup-bundle-row-head">',
        `      <span class="backup-bundle-title">${escapeHtml(item.label ?? backupText("list.untitled"))}</span>`,
        `      <span class="room-manager-state-badge" data-state="${escapeHtml(
          item.invalid === true ? "invalid" : "ready"
        )}">${escapeHtml(
          item.invalid === true ? backupText("list.invalid") : backupText("list.ready")
        )}</span>`,
        "    </span>",
        `    <span class="backup-bundle-meta">${escapeHtml(formatDate(item.createdAt))}</span>`,
        `    <span class="backup-bundle-meta">${escapeHtml(
          item.selectedScopes.length > 0
            ? item.selectedScopes.join(", ")
            : backupText("list.scopeUnknown")
        )}</span>`,
        `    <span class="backup-bundle-meta">${escapeHtml(formatBytes(item.totalBytes))}</span>`,
        `    <span class="backup-bundle-path">${escapeHtml(item.filePath)}</span>`,
        "  </button>",
        isExternalOnly
          ? ""
          : `  <button class="btn btn-danger btn-xs backup-bundle-delete" type="button" data-backup-delete="${escapeHtml(
              item.filePath
            )}">${escapeHtml(backupText("list.deleteButton"))}</button>`,
        "</div>",
      ].join("");
    })
    .join("");
}

export function buildBackupPreviewMarkup(
  preview: BackupPreviewResult | null,
  selectedFilePath: string | null
): string {
  if (selectedFilePath === null) {
    return `<div class="room-manager-empty">${escapeHtml(backupText("preview.empty"))}</div>`;
  }
  if (preview === null) {
    return `<div class="room-manager-empty">${escapeHtml(backupText("preview.loading"))}</div>`;
  }

  const warnings = [];
  if (preview.requiresColdRestore) {
    warnings.push(backupText("preview.coldRestoreWarning"));
  }
  if (preview.riskLevel === "very-high") {
    warnings.push(backupText("preview.dataWarning"));
  }

  return [
    '<div class="backup-preview-grid">',
    `  <div class="backup-preview-item"><span>${escapeHtml(backupText("preview.fileCount"))}</span><strong>${String(
      preview.fileCount
    )}</strong></div>`,
    `  <div class="backup-preview-item"><span>${escapeHtml(
      backupText("preview.overwrites")
    )}</span><strong>${String(preview.overwrittenFilesCount)}</strong></div>`,
    `  <div class="backup-preview-item"><span>${escapeHtml(backupText("preview.risk"))}</span><strong>${escapeHtml(
      backupText(`risk.${preview.riskLevel}`)
    )}</strong></div>`,
    `  <div class="backup-preview-item"><span>${escapeHtml(
      backupText("preview.restartTargets")
    )}</span><strong>${escapeHtml(
      preview.restartTargets.length > 0
        ? preview.restartTargets.join(", ")
        : backupText("summary.none")
    )}</strong></div>`,
    "</div>",
    warnings.length > 0
      ? `<div class="backup-preview-warning">${warnings.map((warning) => `<div>${escapeHtml(warning)}</div>`).join("")}</div>`
      : "",
  ].join("");
}
