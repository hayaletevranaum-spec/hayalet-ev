import { readFileSync, writeFileSync, existsSync } from "fs";
import { execFileSync } from "child_process";
import { createMcpTranslatorSync } from "../../utils/i18n/index.js";
import { getContextPreview } from "../../utils/file-utils.js";
import { analyzeScopeImpact, validateBracketBalance } from "./scope-validator.js";
import {
  validateBrackets as prettierValidateBrackets,
  isCodeFile,
} from "../../utils/prettier-validator.js";
import { bufferishToString, firstNonEmptyString, resolveNodeExecutable } from "./command-runner.js";

interface EditLinesResult {
  success: boolean;
  message: string;
  linesAffected?: number;
  preview?: string;
  contextPreview?: string;
  syntaxValid?: boolean;
  syntaxError?: string;
  scopeWarnings?: string[];
  bracketIssues?: string[];
  willBreakScope?: boolean;
}

function lineEditorT(key: string, params?: Record<string, string | number | boolean>): string {
  return createMcpTranslatorSync()(`mcpServer.devTools.lineEditor.${key}`, params);
}

function lineEditorDefT(key: string, params?: Record<string, string | number | boolean>): string {
  return createMcpTranslatorSync()(`mcpServer.devTools.lineEditor.definition.${key}`, params);
}

export async function editLines(
  filePath: string,
  options: {
    operation: "replace" | "delete" | "insert" | "insert_after" | "insert_before" | "show";
    startLine: number;
    endLine?: number;
    content?: string;
    dryRun?: boolean;
    validateSyntax?: boolean;
    validateBrackets?: boolean;
    safeMode?: boolean;
    force?: boolean;
    autoIndent?: boolean;
  },
  projectRoot?: string
): Promise<EditLinesResult> {
  if (!existsSync(filePath)) {
    return { success: false, message: lineEditorT("runtime.fileNotFound", { filePath }) };
  }

  const originalContent = readFileSync(filePath, "utf-8");
  const lines = originalContent.split("\n");
  const start = options.startLine - 1;
  const end = options.endLine ?? start + 1;

  if (start < 0 || start >= lines.length) {
    return {
      success: false,
      message: lineEditorT("runtime.invalidStartLine", { startLine: options.startLine }),
    };
  }

  switch (options.operation) {
    case "show": {
      const showEnd = Math.min(end, lines.length);
      const preview = lines
        .slice(start, showEnd)
        .map((line, i) => `${String(start + i + 1).padStart(4)} | ${line}`)
        .join("\n");
      return {
        success: true,
        message: lineEditorT("runtime.showingLines"),
        preview,
        linesAffected: showEnd - start,
      };
    }

    case "delete": {
      const safeMode = options.safeMode ?? true;
      const validateBrackets = options.validateBrackets !== false;
      const force = options.force === true;

      if (safeMode && !force) {
        const scopeCheck = analyzeScopeImpact(filePath, options.startLine, end);
        if (scopeCheck.willBreakScope) {
          return {
            success: false,
            message: lineEditorT("runtime.scopeRiskDetected"),
            scopeWarnings: scopeCheck.warnings,
            willBreakScope: true,
            linesAffected: 0,
          };
        }
      }

      const newLines = [...lines.slice(0, start), ...lines.slice(end)];

      if (validateBrackets && !force) {
        const newContent = newLines.join("\n");

        if (isCodeFile(filePath)) {
          const prettierCheck = await prettierValidateBrackets(newContent, filePath);
          if (!prettierCheck.balanced) {
            return {
              success: false,
              message: lineEditorT("runtime.syntaxErrorPrettier"),
              bracketIssues: [prettierCheck.error ?? lineEditorT("runtime.unknownSyntaxError")],
              linesAffected: 0,
            };
          }
        } else {
          const bracketCheck = validateBracketBalance(originalContent, newContent);
          if (!bracketCheck.balanced) {
            return {
              success: false,
              message: lineEditorT("runtime.bracketBalanceWillBreak"),
              bracketIssues: bracketCheck.details,
              linesAffected: 0,
            };
          }
        }
      }

      let contextPreview: string | undefined;
      try {
        contextPreview = await getContextPreview(filePath, start, end, 5);
      } catch (err) {
        // NOTE: Intentionally ignored.
      }

      if (options.dryRun !== true) {
        writeFileSync(filePath, newLines.join("\n"), "utf-8");
      }
      return {
        success: true,
        message:
          options.dryRun === true
            ? lineEditorT("runtime.deleteDryRun")
            : lineEditorT("runtime.deletedLines", { count: end - start }),
        linesAffected: end - start,
        ...(contextPreview != null ? { contextPreview } : {}),
      };
    }

    case "insert":
    case "insert_after": {
      if (options.content == null) {
        return { success: false, message: lineEditorT("runtime.contentRequired") };
      }
      const insertLines = options.content.split("\n");
      const newLines = [...lines.slice(0, start + 1), ...insertLines, ...lines.slice(start + 1)];

      if (options.dryRun !== true) {
        writeFileSync(filePath, newLines.join("\n"), "utf-8");
      }

      let contextPreview: string | undefined;
      try {
        contextPreview = await getContextPreview(
          filePath,
          start + 1,
          start + 1 + insertLines.length,
          5
        );
      } catch (err) {
        // NOTE: Intentionally ignored.
      }

      return {
        success: true,
        message:
          options.dryRun === true
            ? lineEditorT("runtime.insertDryRun")
            : lineEditorT("runtime.insertedAfter", { count: insertLines.length }),
        linesAffected: insertLines.length,
        ...(contextPreview != null ? { contextPreview } : {}),
      };
    }

    case "insert_before": {
      if (options.content == null) {
        return { success: false, message: lineEditorT("runtime.contentRequired") };
      }
      const insertLines = options.content.split("\n");
      const newLines = [...lines.slice(0, start), ...insertLines, ...lines.slice(start)];

      if (options.dryRun !== true) {
        writeFileSync(filePath, newLines.join("\n"), "utf-8");
      }

      let contextPreview: string | undefined;
      try {
        contextPreview = await getContextPreview(filePath, start, start + insertLines.length, 5);
      } catch (err) {
        // NOTE: Intentionally ignored.
      }

      return {
        success: true,
        message:
          options.dryRun === true
            ? lineEditorT("runtime.insertDryRun")
            : lineEditorT("runtime.insertedBefore", { count: insertLines.length }),
        linesAffected: insertLines.length,
        ...(contextPreview != null ? { contextPreview } : {}),
      };
    }

    case "replace": {
      if (options.content == null) {
        return { success: false, message: lineEditorT("runtime.contentRequired") };
      }

      const safeMode = options.safeMode ?? true;
      const validateBrackets = options.validateBrackets !== false;
      const force = options.force === true;

      if (safeMode && !force) {
        const replaceLineCount = options.content.split("\n").length;
        const originalLineCount = end - start;
        if (replaceLineCount < originalLineCount) {
          const scopeCheck = analyzeScopeImpact(filePath, options.startLine, end);
          if (scopeCheck.willBreakScope) {
            return {
              success: false,
              message: lineEditorT("runtime.scopeRiskWithWarnings", {
                warnings: scopeCheck.warnings.join("\n"),
              }),
              scopeWarnings: scopeCheck.warnings,
              willBreakScope: true,
              linesAffected: 0,
            };
          }
        }
      }

      const replaceLines = options.content.split("\n");
      const newLines = [...lines.slice(0, start), ...replaceLines, ...lines.slice(end)];

      if (validateBrackets && !force) {
        const newContent = newLines.join("\n");

        if (isCodeFile(filePath)) {
          const prettierCheck = await prettierValidateBrackets(newContent, filePath);
          if (!prettierCheck.balanced) {
            return {
              success: false,
              message: lineEditorT("runtime.syntaxErrorPrettier"),
              bracketIssues: [prettierCheck.error ?? lineEditorT("runtime.unknownSyntaxError")],
              linesAffected: 0,
            };
          }
        } else {
          const bracketCheck = validateBracketBalance(originalContent, newContent);
          if (!bracketCheck.balanced) {
            return {
              success: false,
              message: lineEditorT("runtime.bracketBalanceWillBreak"),
              bracketIssues: bracketCheck.details,
              linesAffected: 0,
            };
          }
        }
      }

      let syntaxValid = true;
      let syntaxError: string | undefined;

      if (
        options.validateSyntax === true &&
        projectRoot != null &&
        /\.(ts|js|tsx|jsx)$/.test(filePath)
      ) {
        const tempContent = newLines.join("\n");
        try {
          execFileSync(resolveNodeExecutable(), ["--check", "--input-type=module"], {
            input: tempContent,
            cwd: projectRoot,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
            timeout: 5000,
          });
          syntaxValid = true;
        } catch (err: unknown) {
          syntaxValid = false;
          const error = err as { stderr?: unknown; message?: string };
          syntaxError = firstNonEmptyString(
            bufferishToString(error.stderr),
            error.message ?? "",
            lineEditorT("runtime.syntaxError")
          );

          if (options.dryRun !== true) {
            return {
              success: false,
              message: lineEditorT("runtime.syntaxDetectedNoChanges"),
              syntaxValid: false,
              syntaxError,
            };
          }
        }
      }

      if (options.dryRun !== true) {
        writeFileSync(filePath, newLines.join("\n"), "utf-8");
      }

      let contextPreview: string | undefined;
      try {
        contextPreview = await getContextPreview(filePath, start, start + replaceLines.length, 5);
      } catch (err) {
        // NOTE: Intentionally ignored.
      }

      return {
        success: true,
        message:
          options.dryRun === true
            ? lineEditorT("runtime.replaceDryRun")
            : lineEditorT("runtime.replacedLines", { count: end - start }),
        linesAffected: end - start,
        ...(contextPreview != null ? { contextPreview } : {}),
        syntaxValid,
        ...(syntaxError != null ? { syntaxError } : {}),
      };
    }

    default:
      return { success: false, message: lineEditorT("runtime.unknownOperation") };
  }
}

export const LINE_EDITOR_TOOL = {
  name: "hev_dev_edit_lines",
  description: lineEditorDefT("description"),
  inputSchema: {
    type: "object" as const,
    properties: {
      file_path: {
        type: "string" as const,
        description: lineEditorDefT("filePath"),
      },
      operation: {
        type: "string" as const,
        enum: ["replace", "delete", "insert", "insert_after", "insert_before", "show"],
        description: lineEditorDefT("operation"),
      },
      start_line: {
        type: "integer" as const,
        description: lineEditorDefT("startLine"),
      },
      end_line: {
        type: "integer" as const,
        description: lineEditorDefT("endLine"),
      },
      content: {
        type: "string" as const,
        description: lineEditorDefT("content"),
      },
      dry_run: {
        type: "boolean" as const,
        description: lineEditorDefT("dryRun"),
        default: false,
      },
      validate_brackets: {
        type: "boolean" as const,
        description: lineEditorDefT("validateBrackets"),
        default: true,
      },
      safe_mode: {
        type: "boolean" as const,
        description: lineEditorDefT("safeMode"),
        default: true,
      },
      force: {
        type: "boolean" as const,
        description: lineEditorDefT("force"),
        default: false,
      },
    },
    required: ["file_path", "operation", "start_line"],
  },
  metadata: {
    category: "development",
    subcategory: "code-editing",
    priority: "high",
    complexity: "complex",
    useCases: [
      lineEditorDefT("useCases.preciseEditing"),
      lineEditorDefT("useCases.safeReplacement"),
      lineEditorDefT("useCases.scopeAwareDeletion"),
    ],
    relatedTools: ["hev_fs_edit", "hev_fs_read", "hev_dev_check_syntax"],
    agentGuidance: lineEditorDefT("agentGuidance"),
    requiresConfirmation: false,
    riskLevel: "medium",
    tags: ["line-editing", "safe", "scope-aware", "bracket-validation", "precise"],
  },
};
