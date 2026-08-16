import { readFile } from "fs/promises";
import { extname } from "path";
import type { FileContent } from "../../types/index-mcp.js";
import { BINARY_EXTENSIONS, CODE_EXTENSIONS, COLLAPSE_THRESHOLD } from "./constants.js";
import { addLineNumbers, createCollapsedView } from "./collapsed-view.js";
import { parseCodeStructure } from "./parse-structure.js";
import { createMcpTranslatorSync } from "../i18n/index.js";

function fileReadingT(key: string, params?: Record<string, string | number>): string {
  return createMcpTranslatorSync()(`mcpServer.fileUtils.fileReading.${key}`, params);
}

export async function readFileWithCollapse(filePath: string): Promise<FileContent> {
  try {
    const ext = extname(filePath).toLowerCase();

    if (BINARY_EXTENSIONS.has(ext)) {
      return {
        path: filePath,
        content: `[Binary file: ${ext}]`,
        lineCount: 0,
        isCollapsed: false,
      };
    }

    const content = await readFile(filePath, "utf-8");
    const lineCount = content.split("\n").length;
    const shouldCollapse = content.length > COLLAPSE_THRESHOLD && CODE_EXTENSIONS.has(ext);

    if (shouldCollapse) {
      return {
        path: filePath,
        content: createCollapsedView(content, ext),
        lineCount,
        isCollapsed: true,
      };
    }

    return {
      path: filePath,
      content: addLineNumbers(content),
      lineCount,
      isCollapsed: false,
    };
  } catch (error) {
    return {
      path: filePath,
      content: "",
      lineCount: 0,
      isCollapsed: false,
      error: (error as Error).message,
    };
  }
}

export async function expandLineRanges(
  filePath: string,
  ranges: [number, number][]
): Promise<string> {
  const content = await readFile(filePath, "utf-8");
  const lines = content.split("\n");
  const result: string[] = [];

  if (ranges.length === 1 && ranges[0] && (ranges[0][1] === -1 || ranges[0][0] === -1)) {
    return addLineNumbers(content);
  }

  const normalizedRanges = ranges.map(([start, end]) => {
    const normalizedEnd = end === -1 ? lines.length : end;
    return [Math.max(0, start), Math.min(normalizedEnd, lines.length)] as [number, number];
  });

  const includedLines = new Set<number>();
  for (const [start, end] of normalizedRanges) {
    for (let i = start; i < end; i++) {
      includedLines.add(i);
    }
  }

  let lastIncluded = -2;
  for (let i = 0; i < lines.length; i++) {
    if (includedLines.has(i)) {
      if (i > lastIncluded + 1 && lastIncluded >= 0) {
        result.push("     ...");
      }
      result.push(`${String(i).padStart(4)} ${lines[i] ?? ""}`);
      lastIncluded = i;
    }
  }

  return result.join("\n");
}

export async function expandSymbols(filePath: string, patterns: string[]): Promise<string> {
  const content = await readFile(filePath, "utf-8");
  const ext = extname(filePath).toLowerCase();
  const lines = content.split("\n");
  const structures = parseCodeStructure(content, ext);

  const matchedRanges: [number, number][] = [];

  for (const pattern of patterns) {
    const [prefix, name] = pattern.includes(" ") ? pattern.split(" ", 2) : [null, pattern];
    const parts = name.split("/");

    for (const struct of structures) {
      let matches = false;

      if (parts.length === 1) {
        const part = parts[0];
        if (part == null || part === "") continue;
        matches = struct.name === part || struct.name.includes(part);
        if (prefix != null && prefix !== "") {
          const typeMap: Record<string, string[]> = {
            def: ["function", "method"],
            function: ["function"],
            class: ["class"],
            interface: ["interface"],
            type: ["type"],
          };
          matches = matches && (typeMap[prefix]?.includes(struct.type) ?? false);
        }
      } else if (parts.length === 2) {
        const [parentName, childName] = parts;
        if (
          parentName == null ||
          parentName.length === 0 ||
          childName == null ||
          childName.length === 0
        ) {
          continue;
        }
        if (struct.name === parentName || struct.name.includes(parentName)) {
          for (const child of structures) {
            if (
              (child.name === childName || child.name.includes(childName)) &&
              child.startLine > struct.startLine &&
              child.endLine <= struct.endLine
            ) {
              matchedRanges.push([child.startLine, child.endLine + 1]);
            }
          }
        }
        continue;
      }

      if (matches) {
        matchedRanges.push([struct.startLine, struct.endLine + 1]);
      }
    }
  }

  if (matchedRanges.length === 0) {
    const grepMatches: number[] = [];
    for (const pattern of patterns) {
      const searchTerm = pattern.includes(" ") ? pattern.split(" ")[1] : pattern;
      if (searchTerm == null || searchTerm === "") continue;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line?.includes(searchTerm) === true) {
          grepMatches.push(i);
        }
      }
    }

    if (grepMatches.length > 0) {
      for (const lineNum of grepMatches) {
        matchedRanges.push([Math.max(0, lineNum - 2), Math.min(lines.length, lineNum + 3)]);
      }
    }
  }

  if (matchedRanges.length === 0) {
    return fileReadingT("patternNotFound", { patterns: patterns.join(", ") });
  }

  return await expandLineRanges(filePath, matchedRanges);
}
