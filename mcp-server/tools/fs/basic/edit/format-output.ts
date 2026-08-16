import type { EditMatchInfo, FormatOptions } from "./types.js";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function formatOutput(opts: FormatOptions): string {
  const {
    mode,
    filePath,
    results,
    diff,
    hasChanges,
    elapsed,
    lineCount,
    fileSize,
    conflicts,
    bracketStatus,
    matchScope,
    atomic,
    translate,
  } = opts;

  const successCount = results.filter((r) => r.success).length;
  const totalReplacements = results.reduce((sum, r) => sum + r.replacements, 0);

  const icon = mode === "dry-run" ? "🔍" : "✅";
  const modeLabel =
    mode === "dry-run" ? translate("output.modeDryRun") : translate("output.modeApply");

  const lines: string[] = [
    `${icon} ${modeLabel}: ${filePath} (${formatFileSize(fileSize)}, ${translate("output.lineCount", { count: lineCount })})`,
    `⏱️ ${elapsed}ms`,
    "",
    "═".repeat(60),
    translate("output.summary", {
      successCount,
      totalEdits: results.length,
      totalReplacements,
      atomicSuffix: atomic ? ` • ${translate("output.atomicEnabled")}` : "",
    }),
    "",
  ];

  if (conflicts.length > 0) {
    lines.push(`⚠️ ${translate("output.conflictsDetected", { count: conflicts.length })}`);
    for (const c of conflicts) {
      const reason =
        c.reasonKey != null
          ? translate(c.reasonKey, c.reasonParams)
          : (c.reason ?? translate("output.unknownError"));
      lines.push(
        `  ${translate("output.editPairReason", {
          editA: c.editA + 1,
          editB: c.editB + 1,
          reason,
        })}`
      );
    }
    lines.push("");
  }

  for (const result of results) {
    const status = result.success ? "✅" : "❌";
    const matchInfo =
      result.matches && result.matches.length > 0
        ? result.matches.map((m: EditMatchInfo) => `L${m.line}`).join(", ")
        : "";
    const scopeLabel = Array.isArray(matchScope)
      ? translate("output.scopeIndexes", { indexes: matchScope.join(",") })
      : matchScope !== "all"
        ? translate("output.scopeValue", { value: matchScope })
        : "";

    const oldText = result.edit.old_text;
    const preview = oldText.slice(0, 50).replace(/\n/g, "\\n");
    const truncated = oldText.length > 50 ? "..." : "";

    let detail = `${status} Edit ${result.index + 1}: `;
    if (result.success) {
      detail += translate("output.replacements", { count: result.replacements });
      if (matchInfo !== "") detail += ` [${matchInfo}]`;
      if (scopeLabel !== "") detail += ` (${scopeLabel})`;
    } else {
      detail +=
        result.errorKey != null
          ? translate(result.errorKey, result.errorParams)
          : (result.error ?? translate("output.unknownError"));
    }
    lines.push(detail);
    const newText = result.edit.new_text;
    const newPreview = newText.slice(0, 50).replace(/\n/g, "\\n");
    const newTruncated = newText.length > 50 ? "..." : "";
    lines.push(`   "${preview}${truncated}" → "${newPreview}${newTruncated}"`);
    lines.push("");
  }

  lines.push("─".repeat(60));
  if (mode === "dry-run") {
    lines.push(translate("output.previewTitle"));
  } else {
    lines.push(translate("output.appliedTitle"));
  }
  lines.push(diff);
  lines.push("");

  if (bracketStatus !== "") {
    lines.push(bracketStatus);
  }

  if (mode === "dry-run") {
    lines.push(hasChanges ? translate("output.noChangesDryRun") : translate("output.noChanges"));
    lines.push(translate("output.dryRunHint"));
  }

  if (/\.(ts|tsx)$/.test(filePath) && mode === "apply" && hasChanges) {
    lines.push(translate("output.tsCheckHint"));
  }

  return lines.join("\n");
}
