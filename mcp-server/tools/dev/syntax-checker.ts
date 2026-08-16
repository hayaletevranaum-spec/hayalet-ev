import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";
import { createMcpTranslatorSync } from "../../utils/i18n/index.js";

import { countBracketsContextAware } from "./structure-visualizer.js";
import {
  bufferishToString,
  firstNonEmptyString,
  resolveEslintCli,
  resolveTypescriptCli,
  runNodeCli,
} from "./command-runner.js";

interface SyntaxCheckResult {
  success: boolean;
  output: string;
  errors: Array<{ message: string; line?: number; column?: number; type: string }>;
  bracketsBalanced: boolean;
  bracketDetails?: Array<{ open: number; close: number; type: string }>;
}

function resolveTsconfigForFile(filePath: string): string | null {
  const normalizedPath = filePath.replaceAll("\\", "/").replace(/^\.?\//, "");

  if (normalizedPath.startsWith("mcp-server/")) return "mcp-server/tsconfig.mcp.json";
  if (normalizedPath.startsWith("scripts/")) return "scripts/tsconfig.json";
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

function syntaxCheckerT(key: string, params?: Record<string, string | number | boolean>): string {
  return createMcpTranslatorSync()(`mcpServer.devTools.syntaxChecker.${key}`, params);
}

function syntaxCheckerDefT(
  key: string,
  params?: Record<string, string | number | boolean>
): string {
  return createMcpTranslatorSync()(`mcpServer.devTools.syntaxChecker.definition.${key}`, params);
}

export async function checkSyntax(
  filePath: string,
  options: {
    checkBrackets?: boolean;
    checkEslint?: boolean;
    checkTs?: boolean;
  } = {},
  projectRoot?: string
): Promise<SyntaxCheckResult> {
  const checkBrackets = options.checkBrackets !== false;
  const checkEslint = options.checkEslint !== false;
  const checkTs = options.checkTs !== false;

  const output: string[] = [];
  const errors: Array<{ message: string; line?: number; column?: number; type: string }> = [];

  const fullPath = projectRoot !== undefined ? join(projectRoot, filePath) : filePath;

  if (!existsSync(fullPath)) {
    return {
      success: false,
      output: syntaxCheckerT("runtime.fileNotFound", { filePath }),
      errors: [{ message: syntaxCheckerT("runtime.fileNotFoundShort"), type: "system" }],
      bracketsBalanced: false,
    };
  }

  const content = readFileSync(fullPath, "utf-8");
  const ext = extname(filePath);

  output.push(syntaxCheckerT("runtime.title", { filePath }));
  output.push("─".repeat(50));

  let bracketsBalanced = true;
  const bracketDetails: { open: number; close: number; type: string }[] = [];

  if (checkBrackets) {
    let astParseSuccess = false;
    if ([".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs"].includes(ext)) {
      try {
        const { parse } = await import("@babel/parser");
        parse(content, {
          sourceType: "module",
          plugins: [
            "typescript",
            "jsx",
            "decorators-legacy",
            "classProperties",
            "objectRestSpread",
            "optionalChaining",
            "nullishCoalescingOperator",
          ],
        });
        astParseSuccess = true;
        bracketsBalanced = true;
      } catch {}
    }

    if (astParseSuccess) {
      output.push(syntaxCheckerT("runtime.bracketsOkAst"));
    } else {
      const bracketCounts = countBracketsContextAware(content);

      const brackets = [
        { open: "(", close: ")", name: syntaxCheckerT("runtime.bracketTypes.parentheses") },
        { open: "{", close: "}", name: syntaxCheckerT("runtime.bracketTypes.curly") },
        { open: "[", close: "]", name: syntaxCheckerT("runtime.bracketTypes.square") },
      ];

      for (const bracket of brackets) {
        const openCount = bracketCounts.open[bracket.open]?.length ?? 0;
        const closeCount = bracketCounts.close[bracket.close]?.length ?? 0;

        bracketDetails.push({
          open: openCount,
          close: closeCount,
          type: bracket.name,
        });

        if (openCount !== closeCount) {
          bracketsBalanced = false;
          const diff = Math.abs(openCount - closeCount);
          const missing = openCount > closeCount ? bracket.close : bracket.open;
          errors.push({
            message: syntaxCheckerT("runtime.bracketMismatch", {
              type: bracket.name,
              diff,
              missing,
              direction:
                openCount > closeCount
                  ? syntaxCheckerT("runtime.bracketDirection.missing")
                  : syntaxCheckerT("runtime.bracketDirection.extra"),
            }),
            type: "bracket",
          });
        }
      }

      if (bracketsBalanced) {
        output.push(syntaxCheckerT("runtime.bracketsOk"));
      } else {
        output.push(syntaxCheckerT("runtime.bracketsBroken"));
        for (const detail of bracketDetails) {
          if (detail.open !== detail.close) {
            output.push(
              syntaxCheckerT("runtime.bracketDetail", {
                type: detail.type,
                open: detail.open,
                close: detail.close,
              })
            );
          }
        }
      }
    }
    output.push("─".repeat(50));
  }

  if (checkEslint && projectRoot !== undefined && /\.(ts|js|tsx|jsx)$/.test(ext)) {
    try {
      runNodeCli(
        resolveEslintCli(projectRoot),
        [
          filePath,
          "--format",
          "stylish",
          "--cache",
          "--cache-location",
          "node_modules/.cache/eslint",
        ],
        {
          cwd: projectRoot,
          encoding: "utf-8",
          timeout: 15000,
          maxBuffer: 10 * 1024 * 1024,
        }
      );
      output.push(syntaxCheckerT("runtime.eslintOk"));
    } catch (err: unknown) {
      const error = err as { stdout?: unknown; stderr?: unknown };
      const eslintOutput = firstNonEmptyString(
        bufferishToString(error.stdout),
        bufferishToString(error.stderr),
        String(err)
      );

      const errorMatch = eslintOutput.match(/(\d+) errors?/);
      const warningMatch = eslintOutput.match(/(\d+) warnings?/);
      const errorCount = (errorMatch?.[1] ?? "").length > 0 ? parseInt(errorMatch?.[1] ?? "0") : 0;
      const warningCount =
        (warningMatch?.[1] ?? "").length > 0 ? parseInt(warningMatch?.[1] ?? "0") : 0;

      if (errorCount > 0 || warningCount > 0) {
        output.push(syntaxCheckerT("runtime.eslintSummary", { errorCount, warningCount }));
        errors.push({
          message: `ESLint: ${errorCount} error(s), ${warningCount} warning(s)`,
          type: "eslint",
        });
      }
    }
    output.push("─".repeat(50));
  }

  if (checkTs && projectRoot !== undefined && /\.(ts|tsx)$/.test(ext)) {
    const tsconfigPath = resolveTsconfigForFile(filePath);
    const tsArgs =
      tsconfigPath !== null ? ["--noEmit", "-p", tsconfigPath] : ["--noEmit", filePath];

    try {
      const tsOutput = runNodeCli(resolveTypescriptCli(projectRoot), tsArgs, {
        cwd: projectRoot,
        encoding: "utf-8",
        timeout: 15000,
        maxBuffer: 10 * 1024 * 1024,
      });
      const relevantTsOutput =
        tsconfigPath !== null ? filterTypeScriptOutputForFile(tsOutput, filePath) : tsOutput;

      if (relevantTsOutput.match(/error TS\d+:/g)) {
        const errorCount = relevantTsOutput.match(/error TS\d+:/g)?.length ?? 0;
        output.push(syntaxCheckerT("runtime.typescriptSummary", { errorCount }));
        errors.push({
          message: `TypeScript: ${errorCount} error(s)`,
          type: "typescript",
        });
      } else {
        output.push(syntaxCheckerT("runtime.typescriptOk"));
      }
    } catch (err: unknown) {
      const error = err as { stdout?: unknown; stderr?: unknown };
      const tsOutput = firstNonEmptyString(
        bufferishToString(error.stdout),
        bufferishToString(error.stderr),
        String(err)
      );
      const relevantTsOutput =
        tsconfigPath !== null ? filterTypeScriptOutputForFile(tsOutput, filePath) : tsOutput;
      const tsErrors = relevantTsOutput.match(/error TS\d+:/g);

      if (tsErrors) {
        output.push(syntaxCheckerT("runtime.typescriptSummary", { errorCount: tsErrors.length }));
        errors.push({
          message: `TypeScript: ${tsErrors.length} error(s)`,
          type: "typescript",
        });
      } else {
        output.push(syntaxCheckerT("runtime.typescriptOk"));
      }
    }
    output.push("─".repeat(50));
  }

  const totalErrors = errors.length;
  if (totalErrors === 0) {
    output.push(syntaxCheckerT("runtime.totalNoErrors"));
  } else {
    output.push(syntaxCheckerT("runtime.totalErrors", { totalErrors }));
  }

  return {
    success: totalErrors === 0,
    output: output.join("\n"),
    errors,
    bracketsBalanced,
    bracketDetails,
  };
}

export const SYNTAX_CHECKER_TOOL = {
  name: "hev_dev_check_syntax",
  description: syntaxCheckerDefT("description"),
  inputSchema: {
    type: "object" as const,
    properties: {
      file_path: {
        type: "string" as const,
        description: syntaxCheckerDefT("filePath"),
      },
      check_brackets: {
        type: "boolean" as const,
        description: syntaxCheckerDefT("checkBrackets"),
        default: true,
      },
      check_eslint: {
        type: "boolean" as const,
        description: syntaxCheckerDefT("checkEslint"),
        default: true,
      },
      check_ts: {
        type: "boolean" as const,
        description: syntaxCheckerDefT("checkTs"),
        default: false,
      },
    },
    required: ["file_path"],
  },
  metadata: {
    category: "development",
    subcategory: "validation",
    priority: "high",
    complexity: "medium",
    useCases: [
      syntaxCheckerDefT("useCases.preCommit"),
      syntaxCheckerDefT("useCases.bracketBalance"),
      syntaxCheckerDefT("useCases.combinedCheck"),
    ],
    relatedTools: ["hev_dev_lint_file", "hev_dev_check_syntax", "hev_fs_read"],
    agentGuidance: syntaxCheckerDefT("agentGuidance"),
    requiresConfirmation: false,
    riskLevel: "low",
    tags: ["validation", "syntax", "brackets", "eslint", "typescript", "pre-commit"],
  },
};
