import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { createMcpTranslatorSync } from "../../utils/i18n/index.js";
import { logToolError } from "../../utils/mcp-logger.js";
import { DEV_TIMEOUTS } from "@timeouts";
import {
  bufferishToString,
  firstNonEmptyString,
  resolveTypescriptCli,
  runNodeCli,
} from "./command-runner.js";

interface BatchFixOptions {
  file_path: string;
  error_codes?: string[];
  fix_strategy?: "add_guards" | "add_assertions" | "strict_null_check";
  dry_run?: boolean;
  auto_apply?: boolean;
}

interface FixResult {
  success: boolean;
  output: string;
  fixed_count: number;
  preview?: string;
  changes?: Array<{
    line: number;
    before: string;
    after: string;
    error_code: string;
  }>;
}

function resolveTsconfigForFile(filePath: string): string | null {
  const normalizedPath = filePath.replaceAll("\\", "/").replace(/^\.?\//, "");

  if (normalizedPath.startsWith("mcp-server/")) return "mcp-server/tsconfig.mcp.json";
  if (normalizedPath.startsWith("electron/")) return "electron/tsconfig.electron.json";
  if (normalizedPath.startsWith("ghost-agent/electron/"))
    return "ghost-agent/tsconfig.electron.json";
  if (normalizedPath.startsWith("ghost-agent/")) return "ghost-agent/tsconfig.json";
  if (normalizedPath.startsWith("rooms/")) return "rooms/tsconfig.rooms.json";
  if (normalizedPath.startsWith("src/") || normalizedPath.startsWith("shared/")) {
    return "src/tsconfig.json";
  }

  return null;
}

function filterTypeScriptOutputForFile(output: string, filePath: string): string {
  const normalizedPath = filePath.replaceAll("\\", "/").replace(/^\.?\//, "");

  return output
    .split("\n")
    .filter((line) => line.replaceAll("\\", "/").includes(normalizedPath))
    .join("\n");
}

function tsBatchFixerT(key: string, params?: Record<string, string | number | boolean>): string {
  return createMcpTranslatorSync()(`mcpServer.devTools.typescriptBatchFixer.${key}`, params);
}

function tsBatchFixerDefT(key: string, params?: Record<string, string | number | boolean>): string {
  return createMcpTranslatorSync()(
    `mcpServer.devTools.typescriptBatchFixer.definition.${key}`,
    params
  );
}

export function fixTypescriptErrors(options: BatchFixOptions, projectRoot: string): FixResult {
  const {
    file_path: filePath,
    error_codes: errorCodes = ["TS2532", "TS18048", "TS2722"],
    fix_strategy: fixStrategy = "add_guards",
    dry_run: dryRun = true,
    auto_apply: autoApply = false,
  } = options;

  const fullPath = projectRoot !== "" ? join(projectRoot, filePath) : filePath;
  const content = readFileSync(fullPath, "utf-8");
  const lines = content.split("\n");

  const errors = getTypescriptErrors(filePath, projectRoot);
  const targetErrors = errors.filter((err) => errorCodes.includes(err.code));

  if (targetErrors.length === 0) {
    return {
      success: true,
      output: tsBatchFixerT("runtime.noMatchingErrors", { codes: errorCodes.join(", ") }),
      fixed_count: 0,
    };
  }

  const changes: Array<{
    line: number;
    before: string;
    after: string;
    error_code: string;
  }> = [];

  for (const error of targetErrors) {
    const fix = generateFix(error, lines, fixStrategy);
    if (fix) {
      changes.push({
        line: error.line,
        before: lines[error.line - 1] ?? "",
        after: fix.newLine,
        error_code: error.code,
      });
    }
  }

  const preview = generatePreview(changes, filePath);

  if (!dryRun && (autoApply || changes.length > 0)) {
    applyChanges(fullPath, lines, changes);
  }

  return {
    success: true,
    output: formatOutput(changes, dryRun, filePath),
    fixed_count: changes.length,
    preview,
    changes,
  };
}

function getTypescriptErrors(
  filePath: string,
  projectRoot: string
): Array<{ line: number; column: number; code: string; message: string }> {
  try {
    const cwd = projectRoot;
    const tsconfigPath = resolveTsconfigForFile(filePath);
    const tsArgs =
      tsconfigPath !== null ? ["--noEmit", "-p", tsconfigPath] : ["--noEmit", filePath];
    let result = "";

    try {
      result = runNodeCli(resolveTypescriptCli(cwd), tsArgs, {
        cwd,
        encoding: "utf-8",
        timeout: DEV_TIMEOUTS.TYPESCRIPT_CHECK,
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (execError: unknown) {
      const err = execError as { stdout?: unknown; stderr?: unknown };
      const stdout = bufferishToString(err.stdout);
      const stderr = bufferishToString(err.stderr);
      result = firstNonEmptyString(stdout, stderr, String(execError));
      process.stderr.write(
        `[DEBUG] execError caught, stdout length: ${stdout.length}, stderr length: ${stderr.length}\n`
      );
    }

    result = filterTypeScriptOutputForFile(result, filePath);
    process.stderr.write(`[DEBUG] getTypescriptErrors result length: ${result.length}\n`);

    const errors: Array<{
      line: number;
      column: number;
      code: string;
      message: string;
    }> = [];

    result.split("\n").forEach((line) => {
      const match = line.match(/\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)/);
      if (match) {
        errors.push({
          line: parseInt(match[1] ?? "0", 10),
          column: parseInt(match[2] ?? "0", 10),
          code: match[3] ?? "",
          message: match[4] ?? "",
        });
      }
    });

    return errors;
  } catch (error) {
    logToolError("typescript-batch-fixer", error as Error, {});
    return [];
  }
}

function generateFix(
  error: { line: number; column: number; code: string; message: string },
  lines: string[],
  strategy: string
): { newLine: string; insertBefore?: string } | null {
  const lineIndex = error.line - 1;
  const line = lines[lineIndex];

  if (line === undefined) return null;

  switch (error.code) {
    case "TS2532":
    case "TS18048":
      return fixUndefinedError(line, error, strategy);

    case "TS2722":
      return fixOptionalChainingError(line, error, strategy);

    default:
      return null;
  }
}

function fixUndefinedError(
  line: string,
  error: { line: number; column: number; code: string; message: string },
  strategy: string
): { newLine: string; insertBefore?: string } | null {
  const varMatch = error.message.match(/'([^']+)' is possibly/);
  if (!varMatch) return null;

  const varName = varMatch[1] ?? "";
  const indent = line.match(/^\s*/)?.[0] ?? "";

  if (strategy === "add_guards") {
    return {
      newLine: line,
      insertBefore: `${indent}if (!${varName}) return;\n`,
    };
  }

  if (strategy === "add_assertions") {
    return {
      newLine: line.replace(new RegExp(`\\b${varName}\\b`), `${varName}!`),
    };
  }

  return null;
}

function fixOptionalChainingError(
  line: string,
  _error: { line: number; column: number; code: string; message: string },
  strategy: string
): { newLine: string; insertBefore?: string } | null {
  const optionalChainMatch = line.match(/(\w+)\?\.([\w]+)\?\.(\(.*?\))/);
  if (!optionalChainMatch) return null;

  const [, rawObjName, rawMethodName, _args] = optionalChainMatch;
  const objName = rawObjName ?? "obj";
  const methodName = rawMethodName ?? "method";
  const indent = line.match(/^\s*/)?.[0] ?? "";

  if (strategy === "add_guards") {
    const guardLine = `${indent}if (${objName} && ${objName}.${methodName}) {\n`;
    const callLine = line.replace(`${objName}?.${methodName}?.`, `  ${objName}.${methodName}`);
    const closeLine = `${indent}}\n`;

    return {
      newLine: guardLine + callLine + closeLine,
    };
  }

  return null;
}

function applyChanges(
  filePath: string,
  lines: string[],
  changes: Array<{
    line: number;
    before: string;
    after: string;
    error_code: string;
  }>
): void {
  const newLines = [...lines];

  changes.sort((a, b) => b.line - a.line);

  for (const change of changes) {
    newLines[change.line - 1] = change.after;
  }

  writeFileSync(filePath, newLines.join("\n"), "utf-8");
}

function generatePreview(
  changes: Array<{
    line: number;
    before: string;
    after: string;
    error_code: string;
  }>,
  filePath: string
): string {
  if (changes.length === 0) return tsBatchFixerT("runtime.noChanges");

  let preview = `${tsBatchFixerT("runtime.previewTitle")}\n`;
  preview += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  preview += `${tsBatchFixerT("runtime.fileLine", { filePath })}\n`;
  preview += `${tsBatchFixerT("runtime.changeCountLine", { count: changes.length })}\n\n`;

  changes.slice(0, 5).forEach((change, idx) => {
    preview +=
      tsBatchFixerT("runtime.previewChangeHeader", {
        index: idx + 1,
        total: changes.length,
        line: change.line,
        errorCode: change.error_code,
      }) + "\n";
    preview += `${tsBatchFixerT("runtime.beforeLine", { before: change.before.trim() })}\n`;
    preview += `${tsBatchFixerT("runtime.afterLine", { after: change.after.trim() })}\n\n`;
  });

  if (changes.length > 5) {
    preview += `${tsBatchFixerT("runtime.moreChanges", { count: changes.length - 5 })}\n`;
  }

  return preview;
}

function formatOutput(
  changes: Array<{
    line: number;
    before: string;
    after: string;
    error_code: string;
  }>,
  dryRun: boolean,
  filePath: string
): string {
  let output = `${tsBatchFixerT("runtime.title")}\n`;
  output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  output += `${tsBatchFixerT("runtime.fileLine", { filePath })}\n`;
  output += `${tsBatchFixerT("runtime.foundFixableErrors", { count: changes.length })}\n`;
  output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (dryRun) {
    output += `${tsBatchFixerT("runtime.dryRun")}\n`;
    output += `\n${tsBatchFixerT("runtime.applyHint")}\n`;
  } else {
    output += `${tsBatchFixerT("runtime.applied", { count: changes.length })}\n`;
  }

  return output;
}

export const TYPESCRIPT_BATCH_FIXER_TOOL = {
  name: "hev_dev_fix_typescript_batch",
  description: tsBatchFixerDefT("description"),
  inputSchema: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description: tsBatchFixerDefT("filePath"),
      },
      error_codes: {
        type: "array",
        items: { type: "string" },
        description: tsBatchFixerDefT("errorCodes"),
        default: ["TS2532", "TS18048", "TS2722"],
      },
      fix_strategy: {
        type: "string",
        enum: ["add_guards", "add_assertions", "strict_null_check"],
        description: tsBatchFixerDefT("fixStrategy"),
        default: "add_guards",
      },
      dry_run: {
        type: "boolean",
        description: tsBatchFixerDefT("dryRun"),
        default: true,
      },
      auto_apply: {
        type: "boolean",
        description: tsBatchFixerDefT("autoApply"),
        default: false,
      },
    },
    required: ["file_path"],
  },
  metadata: {
    category: "development",
    subcategory: "typescript",
    priority: "high",
    complexity: "complex",
    useCases: [
      tsBatchFixerDefT("useCases.nullUndefined"),
      tsBatchFixerDefT("useCases.batchCodes"),
      tsBatchFixerDefT("useCases.addGuards"),
    ],
    relatedTools: [
      "hev_dev_typescript_dashboard",
      "hev_dev_typescript_type_helper",
      "hev_dev_check_syntax",
    ],
    agentGuidance: tsBatchFixerDefT("agentGuidance"),
    requiresConfirmation: false,
    riskLevel: "medium",
    tags: ["typescript", "auto-fix", "batch", "type-safety"],
  },
};
