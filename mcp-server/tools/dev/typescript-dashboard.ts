import { execFileSync } from "child_process";
import _fs from "fs";
import { createMcpTranslatorSync } from "../../utils/i18n/index.js";
import { logToolError } from "../../utils/mcp-logger.js";

interface DashboardOptions {
  sort_by?: "count" | "severity" | "file";
  group_by?: "error_code" | "file" | "category";
  show_trend?: boolean;
  limit?: number;
}

interface DashboardResult {
  success: boolean;
  output: string;
  total_errors: number;
  by_error_code: Record<string, number>;
  by_file: Record<string, number>;
  top_files: Array<{ file: string; count: number }>;
  top_errors: Array<{ code: string; count: number; description: string }>;
}

const ERROR_DESCRIPTIONS: Record<string, string> = {
  TS2722: "cannotInvokePossiblyUndefined",
  TS2532: "objectPossiblyUndefined",
  TS18048: "possiblyUndefined",
  TS2345: "typeMismatch",
  TS2339: "propertyDoesNotExist",
  TS2749: "valueUsedAsType",
  TS2304: "cannotFindName",
  TS2322: "typeNotAssignable",
  TS2305: "moduleMissingExport",
  TS2306: "fileNotModule",
};

const ERROR_CATEGORIES: Record<string, string> = {
  TS2722: "undefinedSafety",
  TS2532: "undefinedSafety",
  TS18048: "undefinedSafety",
  TS2345: "typeSafety",
  TS2322: "typeSafety",
  TS2339: "typeSafety",
  TS2749: "typeUsage",
  TS2304: "moduleImport",
  TS2305: "moduleImport",
  TS2306: "moduleImport",
};

function tsDashboardT(key: string, params?: Record<string, string | number | boolean>): string {
  return createMcpTranslatorSync()(`mcpServer.devTools.typescriptDashboard.${key}`, params);
}

function tsDashboardDefT(key: string, params?: Record<string, string | number | boolean>): string {
  return createMcpTranslatorSync()(
    `mcpServer.devTools.typescriptDashboard.definition.${key}`,
    params
  );
}

function resolveNpmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function buildCheckTypesCommand(): { command: string; args: string[] } {
  const npmExecPath = process.env["npm_execpath"]?.trim();
  return npmExecPath !== undefined && npmExecPath !== ""
    ? { command: process.execPath, args: [npmExecPath, "run", "check-types"] }
    : { command: resolveNpmCommand(), args: ["run", "check-types"] };
}

function bufferishToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf-8");
  return "";
}

export function generateTypescriptDashboard(
  options: DashboardOptions = {},
  projectRoot: string
): DashboardResult {
  const {
    sort_by: _sortBy = "count",
    group_by: _groupBy = "error_code",
    show_trend: showTrend = false,
    limit = 10,
  } = options;

  try {
    const cwd = projectRoot;
    const startTime = Date.now();

    const checkTypes = buildCheckTypesCommand();
    let result: string;
    try {
      result = execFileSync(checkTypes.command, checkTypes.args, {
        cwd,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (error) {
      const failure = error as { stdout?: unknown; stderr?: unknown };
      result = `${bufferishToString(failure.stdout)}\n${bufferishToString(failure.stderr)}`;
    }

    const errors = parseTypescriptErrors(result);

    const byErrorCode: Record<string, number> = {};
    const byFile: Record<string, number> = {};

    errors.forEach((err) => {
      byErrorCode[err.code] = (byErrorCode[err.code] ?? 0) + 1;
      byFile[err.file] = (byFile[err.file] ?? 0) + 1;
    });

    const topErrors = Object.entries(byErrorCode)
      .map(([code, count]) => ({
        code,
        count,
        description: tsDashboardT(
          `runtime.errorDescriptions.${ERROR_DESCRIPTIONS[code] ?? "unknown"}`,
          ERROR_DESCRIPTIONS[code] !== undefined ? undefined : { code }
        ),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    const topFiles = Object.entries(byFile)
      .map(([file, count]) => ({ file, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    const executionTime = ((Date.now() - startTime) / 1000).toFixed(2);

    const allFiles = Object.keys(byFile).length;
    const filesWithErrors = allFiles;

    const allFolders = new Set(errors.map((e) => e.file.split("/").slice(0, -1).join("/"))).size;
    const foldersWithErrors = allFolders;

    const output = formatDashboard({
      total: errors.length,
      topErrors,
      topFiles,
      byErrorCode,
      byFile,
      showTrend,
      executionTime,
      allFiles,
      filesWithErrors,
      allFolders,
      foldersWithErrors,
      projectRoot: cwd,
    });

    return {
      success: true,
      output,
      total_errors: errors.length,
      by_error_code: byErrorCode,
      by_file: byFile,
      top_files: topFiles,
      top_errors: topErrors,
    };
  } catch (error) {
    logToolError("typescript-dashboard", error as Error, {});
    return {
      success: false,
      output: tsDashboardT("runtime.error", { message: String(error) }),
      total_errors: 0,
      by_error_code: {},
      by_file: {},
      top_files: [],
      top_errors: [],
    };
  }
}

function parseTypescriptErrors(
  output: string
): Array<{ file: string; line: number; column: number; code: string; message: string }> {
  const errors: Array<{
    file: string;
    line: number;
    column: number;
    code: string;
    message: string;
  }> = [];

  output.split("\n").forEach((line) => {
    const match = line.match(/^(.+?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)$/);
    if (match) {
      errors.push({
        file: match[1] ?? "",
        line: parseInt(match[2] ?? "0", 10),
        column: parseInt(match[3] ?? "0", 10),
        code: match[4] ?? "",
        message: match[5] ?? "",
      });
    }
  });

  return errors;
}

function formatDashboard(data: {
  total: number;
  topErrors: Array<{ code: string; count: number; description: string }>;
  topFiles: Array<{ file: string; count: number }>;
  byErrorCode: Record<string, number>;
  byFile: Record<string, number>;
  showTrend: boolean;
  executionTime?: string;
  allFiles?: number;
  filesWithErrors?: number;
  allFolders?: number;
  foldersWithErrors?: number;
  projectRoot: string;
}): string {
  const statsLine =
    data.executionTime != null && data.allFiles !== undefined && data.allFolders !== undefined
      ? tsDashboardT("runtime.statsLine", {
          executionTime: data.executionTime,
          allFolders: data.allFolders,
          foldersWithErrors: data.foldersWithErrors ?? 0,
          allFiles: data.allFiles,
          filesWithErrors: data.filesWithErrors ?? 0,
        }) + "\n"
      : "";

  let output = "";

  output += `${tsDashboardT("runtime.title")}\n`;
  output += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
  output += `${tsDashboardT("runtime.totalErrors", { total: data.total })}\n`;
  if (statsLine !== "") output += statsLine;
  output += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";

  output += `${tsDashboardT("runtime.topErrorCodesTitle")}\n`;
  data.topErrors.forEach((err, idx) => {
    const percentage = ((err.count / data.total) * 100).toFixed(1);
    const bar = generateBar(err.count, data.total);
    output +=
      tsDashboardT("runtime.errorCodeLine", {
        index: idx + 1,
        code: err.code,
        description: err.description,
        count: err.count,
        bar,
        percentage,
      }) + "\n";
  });
  output += "\n";

  output += `${tsDashboardT("runtime.topFilesTitle")}\n`;
  data.topFiles.forEach((file, idx) => {
    const shortPath = file.file.replace(data.projectRoot, ".");
    output +=
      tsDashboardT("runtime.topFileLine", {
        index: idx + 1,
        shortPath,
        count: file.count,
      }) + "\n";
  });
  output += "\n";

  output += `${tsDashboardT("runtime.byCategoryTitle")}\n`;
  const byCategory: Record<string, number> = {};
  Object.entries(data.byErrorCode).forEach(([code, count]) => {
    const category = ERROR_CATEGORIES[code] ?? "other";
    byCategory[category] = (byCategory[category] ?? 0) + count;
  });
  Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .forEach(([category, count]) => {
      output +=
        tsDashboardT("runtime.categoryLine", {
          category: tsDashboardT(`runtime.categories.${category}`),
          count,
        }) + "\n";
    });
  output += "\n";

  output += `${tsDashboardT("runtime.recommendedActionsTitle")}\n`;
  if (data.topErrors[0]) {
    const topError = data.topErrors[0];
    output +=
      tsDashboardT("runtime.focusTopError", {
        code: topError.code,
        description: topError.description,
      }) + "\n";
    output += tsDashboardT("runtime.errorsInCategory", { count: topError.count }) + "\n";

    if (["TS2722", "TS2532", "TS18048"].includes(topError.code)) {
      output += `\n${tsDashboardT("runtime.fixerTitle")}\n`;
      output += `${tsDashboardT("runtime.fixerErrorCodes", { code: topError.code })}\n`;
      output += `${tsDashboardT("runtime.fixerStrategy")}\n`;
    }
  }

  return output;
}

function generateBar(count: number, total: number, width: number = 10): string {
  const percentage = count / total;
  const filled = Math.round(percentage * width);
  const empty = width - filled;
  return "█".repeat(filled) + "░".repeat(empty);
}

export const TYPESCRIPT_DASHBOARD_TOOL = {
  name: "hev_dev_typescript_dashboard",
  description: tsDashboardDefT("description"),
  inputSchema: {
    type: "object",
    properties: {
      sort_by: {
        type: "string",
        enum: ["count", "severity", "file"],
        description: tsDashboardDefT("sortBy"),
        default: "count",
      },
      group_by: {
        type: "string",
        enum: ["error_code", "file", "category"],
        description: tsDashboardDefT("groupBy"),
        default: "error_code",
      },
      show_trend: {
        type: "boolean",
        description: tsDashboardDefT("showTrend"),
        default: false,
      },
      limit: {
        type: "number",
        description: tsDashboardDefT("limit"),
        default: 10,
      },
    },
  },
  metadata: {
    category: "development",
    subcategory: "typescript",
    priority: "high",
    complexity: "medium",
    useCases: [
      tsDashboardDefT("useCases.byCategory"),
      tsDashboardDefT("useCases.commonCodes"),
      tsDashboardDefT("useCases.projectOverview"),
    ],
    relatedTools: ["hev_dev_fix_typescript_batch", "hev_dev_typescript_type_helper"],
    agentGuidance: tsDashboardDefT("agentGuidance"),
    requiresConfirmation: false,
    riskLevel: "low",
    tags: ["typescript", "analytics", "dashboard", "error-analysis"],
  },
};
