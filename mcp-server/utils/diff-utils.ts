import { readFileSync, existsSync } from "fs";
import { createMcpTranslatorSync } from "./i18n/index.js";

const diffUtilsT = createMcpTranslatorSync();

export interface DiffLine {
  type: "added" | "removed" | "unchanged" | "header";
  lineNumber?: { old?: number; new?: number };
  content: string;
}

export interface DiffResult {
  file1: string;
  file2: string;
  identical: boolean;
  additions: number;
  deletions: number;
  changes: DiffLine[];
  summary: string;
}

export interface ContentDiffResult {
  identical: boolean;
  additions: number;
  deletions: number;
  changes: DiffLine[];
  unified: string;
}

function computeDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const oldLen = oldLines.length;
  const newLen = newLines.length;

  const dp: number[][] = Array.from({ length: oldLen + 1 }, () =>
    Array.from({ length: newLen + 1 }, () => 0)
  );

  for (let i = 1; i <= oldLen; i++) {
    for (let j = 1; j <= newLen; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        const prev = dp[i - 1]?.[j - 1] ?? 0;
        const currentRow = dp[i];
        if (currentRow) currentRow[j] = prev + 1;
      } else {
        const left = dp[i - 1]?.[j] ?? 0;
        const top = dp[i]?.[j - 1] ?? 0;
        const currentRow = dp[i];
        if (currentRow) currentRow[j] = Math.max(left, top);
      }
    }
  }

  let i = oldLen;
  let j = newLen;
  const tempResult: DiffLine[] = [];

  while (i > 0 || j > 0) {
    const oldLine = oldLines[i - 1];
    const newLine = newLines[j - 1];

    if (i > 0 && j > 0 && oldLine === newLine && oldLine !== undefined) {
      tempResult.unshift({
        type: "unchanged",
        lineNumber: { old: i, new: j },
        content: oldLine,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || (dp[i]?.[j - 1] ?? 0) >= (dp[i - 1]?.[j] ?? 0))) {
      tempResult.unshift({
        type: "added",
        lineNumber: { new: j },
        content: newLine ?? "",
      });
      j--;
    } else if (i > 0) {
      tempResult.unshift({
        type: "removed",
        lineNumber: { old: i },
        content: oldLine ?? "",
      });
      i--;
    }
  }

  return tempResult;
}

function toUnifiedFormat(diff: DiffLine[], contextLines: number = 3): string {
  if (diff.length === 0) {
    return "";
  }

  const lines: string[] = [];
  let currentHunk: DiffLine[] = [];
  let lastChangeIndex = -contextLines - 1;

  for (let i = 0; i < diff.length; i++) {
    const line = diff[i];
    if (line == null) continue;

    if (line.type !== "unchanged") {
      const contextStart = Math.max(lastChangeIndex + 1, i - contextLines);

      for (let c = contextStart; c < i; c++) {
        const contextLine = diff[c];
        if (contextLine?.type === "unchanged" && !currentHunk.includes(contextLine)) {
          currentHunk.push(contextLine);
        }
      }

      currentHunk.push(line);
      lastChangeIndex = i;
    } else if (i - lastChangeIndex <= contextLines) {
      currentHunk.push(line);
    } else if (currentHunk.length > 0) {
      lines.push(...formatHunk(currentHunk));
      lines.push("");
      currentHunk = [];
    }
  }

  if (currentHunk.length > 0) {
    lines.push(...formatHunk(currentHunk));
  }

  return lines.join("\n");
}

function formatHunk(hunk: DiffLine[]): string[] {
  const lines: string[] = [];

  if (hunk.length === 0) {
    return lines;
  }

  const oldLineEntry = hunk.find((l) => l.lineNumber?.old != null && l.lineNumber.old > 0);
  const newLineEntry = hunk.find((l) => l.lineNumber?.new != null && l.lineNumber.new > 0);
  const oldStart = oldLineEntry?.lineNumber?.old ?? 1;
  const newStart = newLineEntry?.lineNumber?.new ?? 1;
  const oldCount = hunk.filter((l) => l.type !== "added").length;
  const newCount = hunk.filter((l) => l.type !== "removed").length;

  lines.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);

  for (const line of hunk) {
    switch (line.type) {
      case "added":
        lines.push(`+ ${line.content}`);
        break;
      case "removed":
        lines.push(`- ${line.content}`);
        break;
      case "unchanged":
        lines.push(`  ${line.content}`);
        break;
      case "header":
        lines.push(`  ${line.content}`);
        break;
      default:
        lines.push(`  ${line.content}`);
    }
  }

  return lines;
}

export function diffFiles(file1: string, file2: string): DiffResult {
  if (!existsSync(file1)) {
    return {
      file1,
      file2,
      identical: false,
      additions: 0,
      deletions: 0,
      changes: [],
      summary: diffUtilsT("mcpServer.fs.diffUtils.fileNotFound", { filePath: file1 }),
    };
  }

  if (!existsSync(file2)) {
    return {
      file1,
      file2,
      identical: false,
      additions: 0,
      deletions: 0,
      changes: [],
      summary: diffUtilsT("mcpServer.fs.diffUtils.fileNotFound", { filePath: file2 }),
    };
  }

  const content1 = readFileSync(file1, "utf-8");
  const content2 = readFileSync(file2, "utf-8");

  const lines1 = content1.split("\n");
  const lines2 = content2.split("\n");

  const diff = computeDiff(lines1, lines2);
  const additions = diff.filter((d) => d.type === "added").length;
  const deletions = diff.filter((d) => d.type === "removed").length;
  const identical = additions === 0 && deletions === 0;

  let summary: string;
  if (identical) {
    summary = diffUtilsT("mcpServer.fs.diffUtils.filesIdentical");
  } else {
    summary = diffUtilsT("mcpServer.fs.diffUtils.diffSummary", { additions, deletions }) + "\n\n";
    summary += toUnifiedFormat(diff);
  }

  return {
    file1,
    file2,
    identical,
    additions,
    deletions,
    changes: diff.filter((d) => d.type !== "unchanged"),
    summary,
  };
}

export function diffContent(
  content1: string,
  content2: string,
  label1: string = "a",
  label2: string = "b"
): ContentDiffResult {
  const lines1 = content1.split("\n");
  const lines2 = content2.split("\n");

  const diff = computeDiff(lines1, lines2);
  const additions = diff.filter((d) => d.type === "added").length;
  const deletions = diff.filter((d) => d.type === "removed").length;
  const identical = additions === 0 && deletions === 0;

  let unified = "";
  if (!identical) {
    unified = `--- ${label1}\n+++ ${label2}\n`;
    unified += toUnifiedFormat(diff);
  }

  return {
    identical,
    additions,
    deletions,
    changes: diff.filter((d) => d.type !== "unchanged"),
    unified,
  };
}

export function showFileContent(filePath: string, startLine?: number, endLine?: number): string {
  if (!existsSync(filePath)) {
    return diffUtilsT("mcpServer.fs.diffUtils.fileNotFound", { filePath });
  }

  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  const start = startLine != null && startLine > 0 ? Math.max(1, startLine) : 1;
  const end = endLine != null && endLine > 0 ? Math.min(lines.length, endLine) : lines.length;

  const result: string[] = [];
  const lineNumWidth = String(end).length;

  for (let i = start - 1; i < end; i++) {
    const lineNum = String(i + 1).padStart(lineNumWidth, " ");
    result.push(`${lineNum} │ ${lines[i] ?? ""}`);
  }

  return result.join("\n");
}

export function getFileSummary(filePath: string): {
  lines: number;
  words: number;
  chars: number;
  language: string;
} {
  if (!existsSync(filePath)) {
    return { lines: 0, words: 0, chars: 0, language: "unknown" };
  }

  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n").length;
  const words = content.split(/\s+/).filter((w) => w.length > 0).length;
  const chars = content.length;

  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const languageMap: Record<string, string> = {
    ts: "TypeScript",
    tsx: "TypeScript (React)",
    js: "JavaScript",
    jsx: "JavaScript (React)",
    py: "Python",
    rs: "Rust",
    go: "Go",
    java: "Java",
    cpp: "C++",
    c: "C",
    css: "CSS",
    html: "HTML",
    json: "JSON",
    yaml: "YAML",
    yml: "YAML",
    md: "Markdown",
    sh: "Shell",
  };

  const language = languageMap[ext] ?? ext.toUpperCase();

  return { lines, words, chars, language };
}

export interface PatchApplyResult {
  success: boolean;
  appliedLines: number;
  failedHunks: number;
  message: string;
  content?: string;
}

interface PatchHunkLine {
  type: "context" | "add" | "remove";
  content: string;
}

interface PatchHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: PatchHunkLine[];
}

export function applyUnifiedPatch(originalContent: string, patch: string): PatchApplyResult {
  if (patch.trim() === "") {
    return {
      success: false,
      appliedLines: 0,
      failedHunks: 0,
      message: diffUtilsT("mcpServer.fs.diffUtils.patchEmpty"),
    };
  }

  const patchLines = patch.split("\n");
  const hunks: PatchHunk[] = [];

  let index = 0;
  while (index < patchLines.length) {
    const line = patchLines[index];
    if (line == null || line === "") break;

    if (line.startsWith("@@")) {
      const match = /@@ -(\d+),(\d+) \+(\d+),(\d+) @@/.exec(line);
      if (match == null) {
        return {
          success: false,
          appliedLines: 0,
          failedHunks: hunks.length,
          message: diffUtilsT("mcpServer.fs.diffUtils.invalidHunkHeader", { line }),
        };
      }

      const hunk: PatchHunk = {
        oldStart: Number(match[1] ?? 0),
        oldCount: Number(match[2] ?? 0),
        newStart: Number(match[3] ?? 0),
        newCount: Number(match[4] ?? 0),
        lines: [],
      };

      index += 1;
      while (index < patchLines.length && patchLines[index]?.startsWith("@@") !== true) {
        const hunkLine = patchLines[index];
        if (hunkLine == null || hunkLine === "") break;
        if (hunkLine.startsWith("+")) {
          hunk.lines.push({ type: "add", content: hunkLine.slice(1) });
        } else if (hunkLine.startsWith("-")) {
          hunk.lines.push({ type: "remove", content: hunkLine.slice(1) });
        } else if (hunkLine.startsWith(" ")) {
          hunk.lines.push({ type: "context", content: hunkLine.slice(1) });
        } else if (hunkLine.trim() === "") {
          hunk.lines.push({ type: "context", content: "" });
        }
        index += 1;
      }

      hunks.push(hunk);
      continue;
    }

    index += 1;
  }

  const originalLines = originalContent.split("\n");
  const updatedLines = [...originalLines];

  let appliedLines = 0;
  let failedHunks = 0;

  for (const hunk of hunks) {
    const startIndex = Math.max(hunk.oldStart - 1, 0);
    let cursor = startIndex;
    let valid = true;

    for (const line of hunk.lines) {
      if (line.type === "context") {
        if (updatedLines[cursor] !== line.content) {
          valid = false;
          break;
        }
        cursor += 1;
      }
    }

    if (!valid) {
      failedHunks += 1;
      continue;
    }

    cursor = startIndex;
    const newContent: string[] = [];

    for (const line of hunk.lines) {
      if (line.type === "context") {
        newContent.push(updatedLines[cursor] ?? "");
        cursor += 1;
        continue;
      }
      if (line.type === "remove") {
        cursor += 1;
        appliedLines += 1;
        continue;
      }
      newContent.push(line.content);
      appliedLines += 1;
    }

    updatedLines.splice(startIndex, cursor - startIndex, ...newContent);
  }

  if (failedHunks > 0) {
    return {
      success: false,
      appliedLines,
      failedHunks,
      message: diffUtilsT("mcpServer.fs.diffUtils.patchApplyFailed", { failedHunks }),
      content: updatedLines.join("\n"),
    };
  }

  return {
    success: true,
    appliedLines,
    failedHunks: 0,
    message: diffUtilsT("mcpServer.fs.diffUtils.patchApplied", { appliedLines }),
    content: updatedLines.join("\n"),
  };
}
