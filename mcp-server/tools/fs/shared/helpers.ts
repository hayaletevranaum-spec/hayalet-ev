import fs from "fs";
import path from "path";

// NOTE: Normalize common LLM escape artifacts without touching valid sequences.
export function sanitizeContent(content: string): string {
  if (content === "") return content;

  let result = content;

  result = result.replace(/\\'/g, "'");

  result = result.replace(/\\`/g, "`");

  result = result.replace(/\\\\\\n/g, "\\n");
  result = result.replace(/\\\\\\t/g, "\\t");
  result = result.replace(/\\\\\\r/g, "\\r");

  return result;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function showFileContent(filePath: string, startLine?: number, endLine?: number): string {
  if (!fs.existsSync(filePath)) {
    return `❌ File not found: ${filePath}`;
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  const start = startLine !== undefined ? Math.max(0, startLine) : 0;
  const end = endLine !== undefined ? Math.min(lines.length, endLine) : lines.length;

  let output = "";
  if (startLine !== undefined || endLine !== undefined) {
    const rangeInfo =
      startLine !== undefined && endLine !== undefined
        ? `lines ${startLine + 1}-${end}`
        : startLine !== undefined
          ? `from line ${startLine + 1}`
          : `up to line ${end}`;
    output += `🔍 Showing ${rangeInfo} (${end - start} lines, EXPANDED)\n`;
    output += "─".repeat(60) + "\n";
  }

  for (let i = start; i < end; i++) {
    const lineNum = String(i + 1).padStart(4, " ");
    output += `${lineNum} │ ${lines[i] ?? ""}\n`;
  }

  if (startLine !== undefined || endLine !== undefined) {
    output += "─".repeat(60) + "\n";
    output += `📄 Displayed ${end - start} lines from ${path.basename(filePath)}\n`;
  }

  return output;
}

export function getFileSummary(filePath: string): { lines: number; language: string } {
  if (!fs.existsSync(filePath)) {
    return { lines: 0, language: "unknown" };
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").length;
  const ext = path.extname(filePath).slice(1);

  const languageMap: Record<string, string> = {
    ts: "TypeScript",
    js: "JavaScript",
    tsx: "TypeScript React",
    jsx: "JavaScript React",
    json: "JSON",
    md: "Markdown",
    css: "CSS",
    html: "HTML",
    txt: "Text",
  };

  return {
    lines,
    language: languageMap[ext] ?? ext,
  };
}
