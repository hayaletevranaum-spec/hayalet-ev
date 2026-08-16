import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { createMcpTranslatorSync } from "../../utils/i18n/index.js";
import { logToolError } from "../../utils/mcp-logger.js";

interface SmartInsertOptions {
  file_path: string;
  anchor: string;
  position: "before" | "after" | "inside_start" | "inside_end";
  code: string;
  dry_run?: boolean;
}

interface SmartInsertResult {
  success: boolean;
  output: string;
  preview?: string;
  inserted_at?: number;
}

function smartInsertT(key: string, params?: Record<string, string | number | boolean>): string {
  return createMcpTranslatorSync()(`mcpServer.devTools.smartInsert.${key}`, params);
}

function smartInsertDefT(key: string, params?: Record<string, string | number | boolean>): string {
  return createMcpTranslatorSync()(`mcpServer.devTools.smartInsert.definition.${key}`, params);
}

export function smartInsertCode(
  options: SmartInsertOptions,
  projectRoot?: string
): SmartInsertResult {
  const { file_path: filePath, anchor, position, code, dry_run: dryRun = true } = options;

  const fullPath = projectRoot !== undefined ? join(projectRoot, filePath) : filePath;

  try {
    const content = readFileSync(fullPath, "utf-8");
    const lines = content.split("\\n");

    const insertionLine = findInsertionPoint(lines, anchor, position);

    if (!insertionLine) {
      return {
        success: false,
        output: smartInsertT("runtime.anchorNotFound", { anchor }),
      };
    }

    const indent = getIndentation(lines[insertionLine.targetLine] ?? "");
    const formattedCode = formatCodeWithIndent(code, indent);

    lines.splice(insertionLine.insertAt, 0, formattedCode);

    const preview = generatePreview(lines, insertionLine.insertAt, formattedCode);

    if (!dryRun) {
      writeFileSync(fullPath, lines.join("\\n"), "utf-8");
    }

    return {
      success: true,
      output: formatOutput(filePath, insertionLine.insertAt, dryRun),
      preview,
      inserted_at: insertionLine.insertAt,
    };
  } catch (error) {
    logToolError("smart-search-insert", error as Error, {});
    return {
      success: false,
      output: smartInsertT("runtime.error", { message: String(error) }),
    };
  }
}

function findInsertionPoint(
  lines: string[],
  anchor: string,
  position: string
): { targetLine: number; insertAt: number } | null {
  const lowerAnchor = anchor.toLowerCase();

  if (lowerAnchor.includes("last if block") || lowerAnchor.includes("last if statement")) {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i]?.trim().startsWith("if (") === true) {
        let braceCount = 0;
        for (let j = i; j < lines.length; j++) {
          braceCount += (lines[j]?.match(/{/g) ?? []).length;
          braceCount -= (lines[j]?.match(/}/g) ?? []).length;
          if (braceCount === 0 && j > i) {
            return { targetLine: j, insertAt: position === "after" ? j + 1 : i };
          }
        }
      }
    }
  }

  const afterFunctionMatch = lowerAnchor.match(/after function (\\w+)/);
  if (afterFunctionMatch) {
    const funcName = afterFunctionMatch[1] ?? "";
    for (let i = 0; i < lines.length; i++) {
      if (
        lines[i]?.includes(`function ${funcName}`) === true ||
        lines[i]?.includes(`${funcName}(`) === true
      ) {
        let braceCount = 0;
        for (let j = i; j < lines.length; j++) {
          braceCount += (lines[j]?.match(/{/g) ?? []).length;
          braceCount -= (lines[j]?.match(/}/g) ?? []).length;
          if (braceCount === 0 && j > i) {
            return { targetLine: j, insertAt: j + 1 };
          }
        }
      }
    }
  }

  if (lowerAnchor.includes("end of file")) {
    return { targetLine: lines.length - 1, insertAt: lines.length };
  }

  const lineMatch = lowerAnchor.match(/line (\\d+)/);
  if (lineMatch) {
    const lineNum = parseInt(lineMatch[1] ?? "0", 10);
    return { targetLine: lineNum - 1, insertAt: position === "after" ? lineNum : lineNum - 1 };
  }

  return null;
}

function getIndentation(line: string): string {
  return line.match(/^\\s*/)?.[0] ?? "";
}

function formatCodeWithIndent(code: string, indent: string): string {
  return code
    .split("\\n")
    .map((line) => `${indent}${line}`)
    .join("\\n");
}

function generatePreview(lines: string[], insertAt: number, code: string): string {
  let preview = `${smartInsertT("runtime.previewTitle")}\\n`;
  preview += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\n`;
  preview += `${smartInsertT("runtime.insertionPointLine", { line: insertAt + 1 })}\\n\\n`;

  const start = Math.max(0, insertAt - 3);
  const end = Math.min(lines.length, insertAt + 3);

  for (let i = start; i < end; i++) {
    if (i === insertAt) {
      preview += `+ ${code}\\n`;
    }
    const marker = i === insertAt - 1 ? "→" : " ";
    preview += `${marker} ${i + 1} │ ${lines[i] ?? ""}\\n`;
  }

  return preview;
}

function formatOutput(filePath: string, line: number, dryRun: boolean): string {
  let output = `${smartInsertT("runtime.title")}\\n`;
  output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\n`;
  output += `${smartInsertT("runtime.fileLine", { filePath })}\\n`;
  output += `${smartInsertT("runtime.lineLine", { line: line + 1 })}\\n`;
  output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\n\\n`;

  if (dryRun) {
    output += `${smartInsertT("runtime.dryRun")}\\n`;
  } else {
    output += `${smartInsertT("runtime.success")}\\n`;
  }

  return output;
}

export const SMART_SEARCH_INSERT_TOOL = {
  name: "hev_dev_smart_insert",
  description: smartInsertDefT("description"),
  inputSchema: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description: smartInsertDefT("filePath"),
      },
      anchor: {
        type: "string",
        description: smartInsertDefT("anchor"),
      },
      position: {
        type: "string",
        enum: ["before", "after", "inside_start", "inside_end"],
        description: smartInsertDefT("position"),
        default: "after",
      },
      code: {
        type: "string",
        description: smartInsertDefT("code"),
      },
      dry_run: {
        type: "boolean",
        description: smartInsertDefT("dryRun"),
        default: true,
      },
    },
    required: ["file_path", "anchor", "code"],
  },
  metadata: {
    category: "development",
    subcategory: "code-editing",
    priority: "medium",
    complexity: "medium",
    useCases: [
      smartInsertDefT("useCases.naturalLanguage"),
      smartInsertDefT("useCases.anchorBased"),
      smartInsertDefT("useCases.humanReadable"),
    ],
    relatedTools: ["hev_fs_edit", "hev_dev_edit_lines"],
    agentGuidance: smartInsertDefT("agentGuidance"),
    requiresConfirmation: false,
    riskLevel: "medium",
    tags: ["insert", "natural-language", "smart-positioning", "anchor-based"],
  },
};
