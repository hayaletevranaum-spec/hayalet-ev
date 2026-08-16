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

interface LintProjectOptions {
  pattern?: string;
  fix?: boolean;
  max_warnings?: number;
  cache?: boolean;
  format?: "stylish" | "compact" | "json" | "codeframe";
}

interface LintProjectResult {
  success: boolean;
  output: string;
  error_count: number;
  warning_count: number;
  fixable_error_count: number;
  fixable_warning_count: number;
  files_checked: number;
  files_with_issues: number;
}

function lintProjectT(key: string, params?: Record<string, string | number | boolean>): string {
  return createMcpTranslatorSync()(`mcpServer.devTools.lintProject.${key}`, params);
}

function lintProjectDefT(key: string, params?: Record<string, string | number | boolean>): string {
  return createMcpTranslatorSync()(`mcpServer.devTools.lintProject.definition.${key}`, params);
}

export function lintProject(
  options: LintProjectOptions = {},
  projectRoot: string
): LintProjectResult {
  const {
    pattern = "**/*.{js,ts,jsx,tsx}",
    fix = false,
    max_warnings: maxWarnings = -1,
    cache = true,
    format = "stylish",
  } = options;

  const progress = createProgress({
    operation: lintProjectT("progress.operation"),
    interval: 5000,
  });

  try {
    const cwd = projectRoot;
    progress.update(0, lintProjectT("progress.scanning"));

    const patterns = pattern.split(/\s+/u).filter((item) => item.length > 0);
    const args = [
      ...patterns,
      "--format",
      format,
      ...(cache ? ["--cache"] : []),
      ...(fix ? ["--fix"] : []),
      ...(maxWarnings >= 0 ? ["--max-warnings", String(maxWarnings)] : []),
    ];

    progress.update(25, lintProjectT("progress.running"));

    try {
      const output = runNodeCli(resolveEslintCli(cwd), args, {
        cwd,
        encoding: "utf-8",
        timeout: DEV_TIMEOUTS.LINT * 5,
        maxBuffer: 10 * 1024 * 1024,
      });

      progress.done(lintProjectT("progress.noIssues"));

      return {
        success: true,
        output: output.length > 0 ? output : lintProjectT("runtime.allFilesClean"),
        error_count: 0,
        warning_count: 0,
        fixable_error_count: 0,
        fixable_warning_count: 0,
        files_checked: countFilesFromOutput(output),
        files_with_issues: 0,
      };
    } catch (err) {
      const error = err as { stdout?: unknown; stderr?: unknown };
      const output = firstNonEmptyString(
        bufferishToString(error.stdout),
        bufferishToString(error.stderr),
        String(err)
      );

      progress.update(75, lintProjectT("progress.parsing"));

      const stats = parseEslintOutput(output);

      progress.fail(
        lintProjectT("progress.summary", {
          errorCount: stats.error_count,
          warningCount: stats.warning_count,
          filesWithIssues: stats.files_with_issues,
        })
      );

      return {
        success: false,
        output,
        ...stats,
      };
    }
  } catch (error) {
    progress.fail((error as Error).message);
    logToolError("hev_dev_lint_project", error as Error, { pattern, fix });

    return {
      success: false,
      output: lintProjectT("runtime.error", { message: (error as Error).message }),
      error_count: 0,
      warning_count: 0,
      fixable_error_count: 0,
      fixable_warning_count: 0,
      files_checked: 0,
      files_with_issues: 0,
    };
  }
}

function parseEslintOutput(output: string): {
  error_count: number;
  warning_count: number;
  fixable_error_count: number;
  fixable_warning_count: number;
  files_checked: number;
  files_with_issues: number;
} {
  const problemMatch = output.match(/(\d+)\s+problems?\s+\((\d+)\s+errors?,\s+(\d+)\s+warnings?\)/);
  const errorMatch = output.match(/(\d+)\s+errors?/);
  const warningMatch = output.match(/(\d+)\s+warnings?/);
  const fixableMatch = output.match(
    /(\d+)\s+errors?\s+and\s+(\d+)\s+warnings?\s+potentially\s+fixable/
  );

  const fileMatches = output.match(/^\/.+\.(js|ts|jsx|tsx)$/gm);
  const filesWithIssues = fileMatches ? fileMatches.length : 0;

  const filesCheckedMatch = output.match(/(\d+)\s+files?\s+linted/);
  const filesChecked = filesCheckedMatch ? parseInt(filesCheckedMatch[1] ?? "0") : filesWithIssues;

  return {
    error_count: problemMatch
      ? parseInt(problemMatch[2] ?? "0")
      : errorMatch
        ? parseInt(errorMatch[1] ?? "0")
        : 0,
    warning_count: problemMatch
      ? parseInt(problemMatch[3] ?? "0")
      : warningMatch
        ? parseInt(warningMatch[1] ?? "0")
        : 0,
    fixable_error_count: fixableMatch ? parseInt(fixableMatch[1] ?? "0") : 0,
    fixable_warning_count: fixableMatch ? parseInt(fixableMatch[2] ?? "0") : 0,
    files_checked: filesChecked,
    files_with_issues: filesWithIssues,
  };
}

function countFilesFromOutput(output: string): number {
  const match = output.match(/(\d+)\s+files?\s+linted/);
  return match ? parseInt(match[1] ?? "0") : 0;
}

export const LINT_PROJECT_TOOL = {
  name: "hev_dev_lint_project",
  description: lintProjectDefT("description"),
  inputSchema: {
    type: "object" as const,
    properties: {
      pattern: {
        type: "string" as const,
        description: lintProjectDefT("pattern"),
        default: "**/*.{js,ts,jsx,tsx}",
      },
      fix: {
        type: "boolean" as const,
        description: lintProjectDefT("fix"),
        default: false,
      },
      max_warnings: {
        type: "number" as const,
        description: lintProjectDefT("maxWarnings"),
        default: -1,
      },
      cache: {
        type: "boolean" as const,
        description: lintProjectDefT("cache"),
        default: true,
      },
      format: {
        type: "string" as const,
        enum: ["stylish", "compact", "json", "codeframe"],
        description: lintProjectDefT("format"),
        default: "stylish",
      },
    },
  },
  metadata: {
    category: "development",
    subcategory: "eslint",
    priority: "high",
    complexity: "medium",
    useCases: [
      lintProjectDefT("useCases.projectWide"),
      lintProjectDefT("useCases.batchLinting"),
      lintProjectDefT("useCases.codeQuality"),
    ],
    relatedTools: ["hev_dev_eslint_dashboard"],
    agentGuidance: lintProjectDefT("agentGuidance"),
    requiresConfirmation: false,
    riskLevel: "low",
    tags: ["eslint", "linting", "batch", "project-wide"],
  },
};
