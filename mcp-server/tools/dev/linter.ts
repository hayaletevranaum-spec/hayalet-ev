import { createMcpTranslatorSync } from "../../utils/i18n/index.js";
import { createProgress } from "../../utils/progress.js";
import { logToolError } from "../../utils/mcp-logger.js";
import { DEV_TIMEOUTS } from "@timeouts";
import {
  bufferishToString,
  firstNonEmptyString,
  resolveEslintCli,
  runNodeCli,
} from "./command-runner.js";

function linterT(key: string, params?: Record<string, string | number | boolean>): string {
  return createMcpTranslatorSync()(`mcpServer.devTools.linter.${key}`, params);
}

function linterDefT(key: string, params?: Record<string, string | number | boolean>): string {
  return createMcpTranslatorSync()(`mcpServer.devTools.linter.definition.${key}`, params);
}

export function lintFile(
  projectRoot: string,
  filePath: string,
  fix: boolean = false
): { success: boolean; output: string; errorCount: number; warningCount: number } {
  const progress = createProgress({ operation: linterT("progress.operation"), interval: 5000 });

  try {
    const args = [
      filePath,
      "--format",
      "stylish",
      "--cache",
      "--cache-location",
      "node_modules/.cache/eslint",
      ...(fix ? ["--fix"] : []),
    ];
    progress.update(0, linterT("progress.lintingFile", { filePath }));

    try {
      const output = runNodeCli(resolveEslintCli(projectRoot), args, {
        cwd: projectRoot,
        encoding: "utf-8",
        timeout: DEV_TIMEOUTS.LINT,
        maxBuffer: 10 * 1024 * 1024,
      });
      progress.done(linterT("progress.noIssues"));
      return {
        success: true,
        output: output.length > 0 ? output : linterT("runtime.noIssues"),
        errorCount: 0,
        warningCount: 0,
      };
    } catch (err) {
      const error = err as { stdout?: unknown; stderr?: unknown };
      const output = firstNonEmptyString(
        bufferishToString(error.stdout),
        bufferishToString(error.stderr),
        String(err)
      );

      const errorMatch = output.match(/(\d+) errors?/);
      const warningMatch = output.match(/(\d+) warnings?/);
      const errorCount = errorMatch ? parseInt(errorMatch[1] ?? "0") : 0;
      const warningCount = warningMatch ? parseInt(warningMatch[1] ?? "0") : 0;

      progress.fail(linterT("progress.summary", { errorCount, warningCount }));
      return {
        success: false,
        output,
        errorCount,
        warningCount,
      };
    }
  } catch (error) {
    progress.fail((error as Error).message);
    logToolError("hev_dev_lint_file", error as Error, { filePath, fix });
    return {
      success: false,
      output: linterT("runtime.error", { message: (error as Error).message }),
      errorCount: 0,
      warningCount: 0,
    };
  }
}

export const LINTER_TOOL = {
  name: "hev_dev_lint_file",
  description: linterDefT("description"),
  inputSchema: {
    type: "object" as const,
    properties: {
      file_path: {
        type: "string" as const,
        description: linterDefT("filePath"),
      },
      fix: {
        type: "boolean" as const,
        description: linterDefT("fix"),
        default: false,
      },
    },
    required: ["file_path"],
  },
  metadata: {
    category: "development",
    subcategory: "eslint",
    priority: "medium",
    complexity: "simple",
    useCases: [
      linterDefT("useCases.singleFile"),
      linterDefT("useCases.beforeCommit"),
      linterDefT("useCases.autoFix"),
    ],
    relatedTools: ["hev_dev_lint_project", "hev_dev_eslint_dashboard"],
    agentGuidance: linterDefT("agentGuidance"),
    requiresConfirmation: false,
    riskLevel: "low",
    tags: ["eslint", "single-file", "quick", "cache-enabled"],
  },
};
