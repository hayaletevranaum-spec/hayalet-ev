import { parseCodeStructure } from "./parse-structure.js";

export function createCollapsedView(content: string, extension: string): string {
  const structures = parseCodeStructure(content, extension);
  if (structures.length === 0) {
    return content;
  }

  const lines = content.split("\n");
  const result: string[] = [];
  const hiddenRanges: Set<number> = new Set();

  for (const struct of structures) {
    if (struct.type === "function" || struct.type === "method") {
      for (let i = struct.startLine + 1; i < struct.endLine; i++) {
        hiddenRanges.add(i);
      }
    }
  }

  let lastWasHidden = false;
  for (let i = 0; i < lines.length; i++) {
    if (hiddenRanges.has(i)) {
      if (!lastWasHidden) {
        result.push(`${String(i).padStart(4)}     ... (collapsed)`);
        lastWasHidden = true;
      }
    } else {
      result.push(`${String(i).padStart(4)} ${lines[i] ?? ""}`);
      lastWasHidden = false;
    }
  }

  return result.join("\n");
}

export function addLineNumbers(content: string): string {
  const lines = content.split("\n");
  return lines.map((line, i) => `${String(i).padStart(4)} ${line}`).join("\n");
}
