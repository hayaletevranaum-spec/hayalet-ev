import { readFile } from "fs/promises";
import { detectContextAwareDuplicates } from "../duplicate-detector.js";

export async function getContextPreview(
  filePath: string,
  startLine: number,
  endLine: number,
  contextLines: number = 5
): Promise<string> {
  try {
    const content = await readFile(filePath, "utf-8");
    const lines = content.split("\n");
    const totalLines = lines.length;

    const actualStart = Math.max(0, startLine);
    const actualEnd = Math.min(totalLines, endLine);

    const previewStart = Math.max(0, actualStart - contextLines);
    const previewEnd = Math.min(totalLines, actualEnd + contextLines);

    const duplicates = await detectContextAwareDuplicates(filePath, actualStart, actualEnd, 20);

    const duplicateWarnings: string[] = [];
    for (const dup of duplicates) {
      duplicateWarnings.push(
        `⚠️  Line ${dup.line1}: Duplicate detected at line ${dup.line2} (scope: ${dup.scope})`
      );
    }

    const previewLines: string[] = [];
    previewLines.push("\nContext Preview (±" + contextLines + " lines):");
    previewLines.push("─".repeat(50));

    for (let i = previewStart; i < previewEnd; i++) {
      const lineNum = String(i + 1).padStart(4);
      const marker = i >= actualStart && i < actualEnd ? "►" : " ";

      if (i === actualStart) {
        previewLines.push("┌─[CHANGE START]─────────────────────");
      }

      previewLines.push(`${marker}${lineNum} │ ${lines[i] ?? ""}`);

      if (i === actualEnd - 1) {
        previewLines.push("└─[CHANGE END]───────────────────────");
      }
    }

    previewLines.push("─".repeat(50));

    if (duplicateWarnings.length > 0) {
      previewLines.push("\n🚨 DUPLICATE DETECTION:");
      previewLines.push("─".repeat(50));
      duplicateWarnings.forEach((warning) => previewLines.push(warning));
      previewLines.push("─".repeat(50));
    }

    return previewLines.join("\n");
  } catch (error) {
    return `Failed to generate context preview: ${error instanceof Error ? error.message : String(error)}`;
  }
}
