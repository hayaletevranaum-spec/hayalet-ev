import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";
import { createMcpTranslatorSync } from "../../utils/i18n/index.js";
import { logToolError } from "../../utils/mcp-logger.js";
import { DEV_TIMEOUTS } from "@timeouts";
import {
  replaceFunctionCalls,
  renameVariable,
  replaceImportSource,
} from "../../utils/ast-transformer.js";
import { validateWithPrettier } from "../../utils/prettier-validator.js";

function chunkToString(data: unknown): string {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf-8");
  return String(data);
}

type RefactorMode = "string" | "ast";

interface RefactorOperation {
  pattern: string;
  replace_with: string;
  target_lines?: number[];
  mode?: RefactorMode;
  ast_type?: "function_call" | "variable" | "import";
}

interface SafeRefactorOptions {
  file_path: string;
  operations: RefactorOperation[];
  verify_after_each?: boolean;
  auto_rollback_on_error?: boolean;
  dry_run?: boolean;
}

interface RefactorResult {
  success: boolean;
  output: string;
  applied_operations: number;
  failed_operations: number;
  rollback_occurred: boolean;
}

function safeBatchRefactorT(
  key: string,
  params?: Record<string, string | number | boolean>
): string {
  return createMcpTranslatorSync()(`mcpServer.devTools.safeBatchRefactor.${key}`, params);
}

function safeBatchRefactorDefT(
  key: string,
  params?: Record<string, string | number | boolean>
): string {
  return createMcpTranslatorSync()(
    `mcpServer.devTools.safeBatchRefactor.definition.${key}`,
    params
  );
}

export async function safelyRefactorCode(
  options: SafeRefactorOptions,
  projectRoot: string
): Promise<RefactorResult> {
  const {
    file_path: filePath,
    operations,
    verify_after_each: verifyAfterEach = false,
    auto_rollback_on_error: autoRollbackOnError = true,
    dry_run: dryRun = false,
  } = options;
  const { isAbsolute } = await import("path");
  const fullPath = isAbsolute(filePath)
    ? filePath
    : projectRoot !== ""
      ? join(projectRoot, filePath)
      : filePath;
  const originalContent = readFileSync(fullPath, "utf-8");
  let currentContent = originalContent;

  let appliedCount = 0;
  let failedCount = 0;
  let rollbackOccurred = false;

  const results: Array<{ operation: number; success: boolean; error?: string }> = [];

  try {
    const baselineErrors = verifyAfterEach
      ? await getTypeScriptErrorCount(fullPath, projectRoot)
      : 0;

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];

      if (!op) {
        results.push({
          operation: i + 1,
          success: false,
          error: safeBatchRefactorT("runtime.operationUndefined"),
        });
        failedCount++;
        continue;
      }

      const mode = op.mode ?? "string";
      let newContent: string;

      if (mode === "ast") {
        const astResult = applyASTOperation(currentContent, fullPath, op);
        if (!astResult.success) {
          results.push({
            operation: i + 1,
            success: false,
            error: safeBatchRefactorT("runtime.astTransformFailed", {
              error: astResult.error ?? safeBatchRefactorT("common.unknown"),
            }),
          });
          failedCount++;
          if (autoRollbackOnError) {
            rollbackOccurred = true;
          }
          continue;
        }
        newContent = astResult.code ?? currentContent;
      } else {
        newContent = applyOperation(currentContent, op);
      }

      if (newContent === currentContent) {
        results.push({
          operation: i + 1,
          success: false,
          error: safeBatchRefactorT("runtime.noMatchesFound"),
        });
        failedCount++;
        continue;
      }

      if (!dryRun) {
        writeFileSync(fullPath, newContent, "utf-8");
      } else if (verifyAfterEach) {
        writeFileSync(fullPath, newContent, "utf-8");
      }

      if (verifyAfterEach) {
        // eslint-disable-next-line no-await-in-loop
        const newErrors = await getTypeScriptErrorCount(fullPath, projectRoot);

        if (newErrors > baselineErrors && autoRollbackOnError) {
          writeFileSync(fullPath, currentContent, "utf-8");
          results.push({
            operation: i + 1,
            success: false,
            error: safeBatchRefactorT("runtime.errorCountIncreased", {
              baselineErrors,
              newErrors,
            }),
          });
          failedCount++;
          rollbackOccurred = true;
          continue;
        } else if (newErrors <= baselineErrors && dryRun) {
          writeFileSync(fullPath, currentContent, "utf-8");
        }
      }

      currentContent = newContent;
      appliedCount++;
      results.push({ operation: i + 1, success: true });
    }

    if (dryRun) {
      writeFileSync(fullPath, originalContent, "utf-8");
    } else if (appliedCount === 0 && !rollbackOccurred) {
      writeFileSync(fullPath, originalContent, "utf-8");
    }

    return {
      success: appliedCount > 0,
      output: formatOutput(filePath, results, dryRun, rollbackOccurred),
      applied_operations: appliedCount,
      failed_operations: failedCount,
      rollback_occurred: rollbackOccurred,
    };
  } catch (error) {
    if (!dryRun) {
      writeFileSync(fullPath, originalContent, "utf-8");
    }
    logToolError("safe-batch-refactor", error as Error, options, 0);
    return {
      success: false,
      output: safeBatchRefactorT("runtime.emergencyRollback", { message: String(error) }),
      applied_operations: appliedCount,
      failed_operations: operations.length - appliedCount,
      rollback_occurred: true,
    };
  }
}

function normalizeWhitespace(str: string): string {
  return str.replace(/\s+/g, " ").trim();
}

function matchesPattern(line: string, pattern: string, useRegex: boolean): boolean {
  if (useRegex) {
    const regex = new RegExp(pattern);
    return regex.test(line);
  }

  return normalizeWhitespace(line).includes(normalizeWhitespace(pattern));
}

function replaceInLine(
  line: string,
  pattern: string,
  replacement: string,
  useRegex: boolean
): string {
  const indent = line.match(/^\s*/)?.[0] ?? "";

  if (useRegex) {
    const regex = new RegExp(pattern);
    return line.replace(regex, replacement);
  }

  const normalizedLine = normalizeWhitespace(line);
  const normalizedPattern = normalizeWhitespace(pattern);

  if (!normalizedLine.includes(normalizedPattern)) {
    return line;
  }

  const trimmedLine = line.trim();
  const trimmedPattern = pattern.trim();

  const escapedPattern = trimmedPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(escapedPattern.replace(/\s+/g, "\\s+"), "g");

  const replaced = trimmedLine.replace(regex, replacement.trim());

  if (replaced === trimmedLine) {
    return line;
  }

  return indent + replaced;
}

function applyOperation(content: string, op: RefactorOperation): string {
  const lines = content.split("\\n");

  const hasRegexOperators = /\.\*|\.\+|\^|\$|\||\(\?[:=!]/.test(op.pattern);
  const isRegexPattern = hasRegexOperators;

  let replacementCount = 0;
  const MAX_REPLACEMENTS = 1000;

  if (op.target_lines && op.target_lines.length > 0) {
    op.target_lines.forEach((lineNum) => {
      if (lineNum > 0 && lineNum <= lines.length && replacementCount < MAX_REPLACEMENTS) {
        const oldLine = lines[lineNum - 1] ?? "";

        if (matchesPattern(oldLine, op.pattern, isRegexPattern)) {
          const newLine = replaceInLine(oldLine, op.pattern, op.replace_with, isRegexPattern);
          if (oldLine !== newLine) {
            lines[lineNum - 1] = newLine;
            replacementCount++;
          }
        }
      }
    });
  } else {
    for (let i = 0; i < lines.length && replacementCount < MAX_REPLACEMENTS; i++) {
      const oldLine = lines[i] ?? "";

      if (matchesPattern(oldLine, op.pattern, isRegexPattern)) {
        const newLine = replaceInLine(oldLine, op.pattern, op.replace_with, isRegexPattern);
        if (oldLine !== newLine) {
          lines[i] = newLine;
          replacementCount++;
        }
      }
    }
  }

  const result = lines.join("\\n");

  if (result.length > content.length * 2) {
    process.stderr.write(`${safeBatchRefactorT("runtime.fileSizeDoubledLog")}\n`);
    return content;
  }

  return result;
}

async function getTypeScriptErrorCount(filePath: string, projectRoot: string): Promise<number> {
  return await new Promise((resolve) => {
    const cwd = projectRoot;
    const tsc = spawn("npx", ["tsc", "--noEmit", "--incremental"], {
      cwd,
      timeout: DEV_TIMEOUTS.TYPESCRIPT_CHECK,
    });

    let stderrOutput = "";

    tsc.stderr.on("data", (data: unknown) => {
      stderrOutput += chunkToString(data);
    });

    tsc.on("close", () => {
      const errors = stderrOutput
        .split("\n")
        .filter((line) => line.includes(filePath) && line.includes("error TS")).length;
      resolve(errors);
    });

    tsc.on("error", () => {
      resolve(0);
    });
  });
}

function applyASTOperation(
  content: string,
  filePath: string,
  op: RefactorOperation
): { success: boolean; code?: string; error?: string } {
  if (op.ast_type === undefined) {
    return {
      success: false,
      error: safeBatchRefactorT("runtime.astTypeRequired"),
    };
  }

  try {
    let result;

    switch (op.ast_type) {
      case "function_call":
        result = replaceFunctionCalls(content, filePath, op.pattern, op.replace_with);
        break;

      case "variable":
        result = renameVariable(content, filePath, op.pattern, op.replace_with);
        break;

      case "import":
        result = replaceImportSource(content, filePath, op.pattern, op.replace_with);
        break;

      default:
        return {
          success: false,
          error: safeBatchRefactorT("runtime.unknownAstType"),
        };
    }

    if (!result.success) {
      return {
        success: false,
        ...(result.error != null && result.error !== "" ? { error: result.error } : {}),
      };
    }

    if (result.modified === true && result.code != null && result.code !== "") {
      validateWithPrettier(result.code, filePath)
        .then((validation) => {
          if (!validation.valid) {
            process.stderr.write(
              `${safeBatchRefactorT("runtime.prettierValidationWarning", {
                error: validation.error ?? safeBatchRefactorT("common.unknown"),
              })}\n`
            );
          }
        })
        .catch(() => {});
    }

    return {
      success: true,
      ...(result.code != null && result.code !== "" ? { code: result.code } : {}),
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message,
    };
  }
}

function formatOutput(
  filePath: string,
  results: Array<{ operation: number; success: boolean; error?: string }>,
  dryRun: boolean,
  rollbackOccurred: boolean
): string {
  let output = `${safeBatchRefactorT("runtime.title")}\\n`;
  output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\n`;
  output += `${safeBatchRefactorT("runtime.fileLine", { filePath })}\\n`;
  output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\n\\n`;

  results.forEach((result) => {
    const icon = result.success ? "✅" : "❌";
    output += `${safeBatchRefactorT("runtime.operationLine", {
      icon,
      operation: result.operation,
      status: result.success
        ? safeBatchRefactorT("runtime.applied")
        : safeBatchRefactorT("runtime.failedWithReason", {
            reason: result.error ?? safeBatchRefactorT("common.unknown"),
          }),
    })}\\n`;
  });

  output += `\\n`;

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  output += `${safeBatchRefactorT("runtime.summaryTitle")}\\n`;
  output += `   ${safeBatchRefactorT("runtime.summarySuccess", { successCount })}\\n`;
  output += `   ${safeBatchRefactorT("runtime.summaryFailed", { failCount })}\\n`;

  if (rollbackOccurred) {
    output += `\\n${safeBatchRefactorT("runtime.rollbackOccurred")}\\n`;
  }

  if (dryRun) {
    output += `\\n${safeBatchRefactorT("runtime.dryRun")}\\n`;
  }

  return output;
}

export const SAFE_BATCH_REFACTOR_TOOL = {
  name: "hev_dev_safe_batch_refactor",
  description: safeBatchRefactorDefT("description"),
  inputSchema: {
    type: "object",
    properties: {
      file_path: {
        type: "string",
        description: safeBatchRefactorDefT("filePath"),
      },
      operations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            pattern: { type: "string", description: safeBatchRefactorDefT("pattern") },
            replace_with: { type: "string", description: safeBatchRefactorDefT("replaceWith") },
            target_lines: {
              type: "array",
              items: { type: "number" },
              description: safeBatchRefactorDefT("targetLines"),
            },
          },
          required: ["pattern", "replace_with"],
        },
        description: safeBatchRefactorDefT("operations"),
      },
      verify_after_each: {
        type: "boolean",
        description: safeBatchRefactorDefT("verifyAfterEach"),
        default: true,
      },
      auto_rollback_on_error: {
        type: "boolean",
        description: safeBatchRefactorDefT("autoRollbackOnError"),
        default: true,
      },
      dry_run: {
        type: "boolean",
        description: safeBatchRefactorDefT("dryRun"),
        default: false,
      },
    },
    required: ["file_path", "operations"],
  },
  metadata: {
    category: "development",
    subcategory: "refactoring",
    priority: "high",
    complexity: "complex",
    useCases: [
      safeBatchRefactorDefT("useCases.multiStep"),
      safeBatchRefactorDefT("useCases.rollback"),
      safeBatchRefactorDefT("useCases.verified"),
    ],
    relatedTools: ["hev_fs_edit", "hev_dev_edit_lines", "hev_dev_check_syntax"],
    agentGuidance: safeBatchRefactorDefT("agentGuidance"),
    requiresConfirmation: false,
    riskLevel: "medium",
    tags: ["refactoring", "batch", "verification", "rollback", "safety"],
  },
};
