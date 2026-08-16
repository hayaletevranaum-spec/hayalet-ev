// NOTE: Advanced file edit operations with atomic and conflict detection.

import { readFile, writeFile } from "fs/promises";
import { logToolError } from "../../../utils/mcp-logger.js";
import { createMcpTranslator, createMcpTranslatorSync } from "../../../utils/i18n/index.js";
import { diffContent } from "../../../utils/diff-utils.js";
import { applyEdit } from "./edit/apply.js";
import { detectConflicts } from "./edit/conflict.js";
import { detectEOL, normalizeEOL } from "./edit/eol.js";
import { formatOutput } from "./edit/format-output.js";
import type { EditFileOptions, EditResult, ConflictInfo } from "./edit/types.js";
import { checkBracketBalance } from "./edit/validator.js";
import type { ToolResult } from "../../../types/index-mcp.js";
import type { TranslationParams } from "../../../../src/types/i18n.js";

export type { EOLMode, EditFileOptions, EditResult, FileEdit, MatchScope } from "./edit/types.js";

type McpTranslator = (key: string, params?: TranslationParams) => string;

function editT(t: McpTranslator, key: string, params?: TranslationParams): string {
  return t(`mcpServer.fs.edit.${key}`, params);
}

const editToolDefinitionTranslator = createMcpTranslatorSync();

function editToolDefinitionT(key: string, params?: TranslationParams): string {
  return editToolDefinitionTranslator(`mcpServer.fs.toolDefinitions.edit.${key}`, params);
}

export async function editFileContent(options: EditFileOptions): Promise<ToolResult> {
  const {
    file_path: filePath,
    edits,
    dry_run: dryRun = false,
    ignore_whitespace: ignoreWhitespace = false,
    all_or_nothing: allOrNothing = false,
    match_scope: matchScope = "all",
    normalize_eol: normalizeEol = "auto",
  } = options;

  const startTime = performance.now();
  const t = await createMcpTranslator();

  try {
    if (edits.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `${editT(t, "errors.emptyEdits", { filePath })}\n${editT(t, "errors.emptyEditsHint")}`,
          },
        ],
        isError: true,
      };
    }

    let content: string;
    try {
      content = await readFile(filePath, "utf-8");
    } catch {
      return {
        content: [{ type: "text", text: editT(t, "errors.fileNotFound", { filePath }) }],
        isError: true,
      };
    }

    const lineCount = (content.match(/\n/g) ?? []).length + 1;
    const fileSize = Buffer.byteLength(content, "utf-8");

    const originalEOL = detectEOL(content);
    if (normalizeEol !== "preserve") {
      content = normalizeEOL(content, normalizeEol);
    }

    const originalContent = content;

    const conflicts = detectConflicts(content, edits);
    if (conflicts.length > 0 && allOrNothing) {
      const conflictLines = conflicts.map(
        (c: ConflictInfo) =>
          `  ${editT(t, "output.editPairReason", {
            editA: c.editA + 1,
            editB: c.editB + 1,
            reason:
              c.reasonKey != null
                ? editT(t, c.reasonKey, c.reasonParams)
                : (c.reason ?? editT(t, "output.unknownError")),
          })}`
      );
      return {
        content: [
          {
            type: "text",
            text: `${editT(t, "errors.atomicConflictTitle")}\n${conflictLines.join("\n")}\n\n${editT(t, "errors.atomicConflictHint")}`,
          },
        ],
        isError: true,
      };
    }

    const results: EditResult[] = [];
    let workingContent = content;

    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i];
      if (!edit) continue;
      const result = applyEdit(workingContent, edit, i, ignoreWhitespace, matchScope);
      results.push(result);

      if (result.success && result.newContent !== undefined) {
        workingContent = result.newContent;
      }
    }

    const failCount = results.filter((r) => !r.success).length;

    if (allOrNothing && failCount > 0) {
      const elapsed = Math.round(performance.now() - startTime);
      const failDetails = results
        .filter((r) => !r.success)
        .map((r) => {
          const detail =
            r.errorKey != null
              ? editT(t, r.errorKey, r.errorParams)
              : (r.error ?? editT(t, "output.unknownError"));
          return `  ❌ Edit ${r.index + 1}: ${detail}`;
        })
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `${editT(t, "errors.atomicRollbackTitle", { filePath })}\n⏱️ ${elapsed}ms\n\n${editT(
              t,
              "errors.atomicRollbackSummary",
              {
                failCount,
                totalEdits: edits.length,
              }
            )}\n\n${failDetails}`,
          },
        ],
        isError: true,
      };
    }

    const hasChanges = workingContent !== originalContent;
    const finalContent = hasChanges ? workingContent : originalContent;

    const diffResult = diffContent(originalContent, finalContent, filePath, filePath);
    const diff = diffResult.identical ? editT(t, "output.noDiff") : diffResult.unified;

    const isCodeFile = /\.(ts|tsx|js|jsx|json|css|html|vue|svelte)$/.test(filePath);
    let bracketStatus = "";
    if (isCodeFile && hasChanges) {
      const bracketCheck = checkBracketBalance(finalContent);
      if (bracketCheck.ok) {
        bracketStatus = editT(t, "bracket.statusOk");
      } else {
        const details = (bracketCheck.differences ?? [])
          .map((difference) =>
            editT(t, `bracket.details.${difference.pair}`, {
              count: difference.difference,
              token: difference.missingToken,
              state: editT(t, `bracket.state.${difference.state}`),
            })
          )
          .join(", ");
        bracketStatus = editT(t, "bracket.statusProblem", {
          details: details.length > 0 ? details : editT(t, "output.unknownError"),
        });
      }
    }

    const elapsed = Math.round(performance.now() - startTime);

    if (dryRun) {
      const output = formatOutput({
        mode: "dry-run",
        filePath,
        results,
        diff,
        hasChanges,
        elapsed,
        lineCount,
        fileSize,
        conflicts,
        bracketStatus,
        matchScope: matchScope,
        atomic: allOrNothing,
        translate: (key, params) => editT(t, key, params),
      });
      return { content: [{ type: "text", text: output }] };
    }

    if (hasChanges) {
      let writeContent = finalContent;
      if (normalizeEol === "preserve" || normalizeEol === "auto") {
        if (originalEOL === "crlf" && normalizeEol === "auto") {
          writeContent = writeContent.replace(/(?<!\r)\n/g, "\r\n");
        }
      }
      await writeFile(filePath, writeContent, "utf-8");
    }

    const output = formatOutput({
      mode: "apply",
      filePath,
      results,
      diff,
      hasChanges,
      elapsed,
      lineCount,
      fileSize,
      conflicts,
      bracketStatus,
      matchScope: matchScope,
      atomic: allOrNothing,
      translate: (key, params) => editT(t, key, params),
    });
    return { content: [{ type: "text", text: output }] };
  } catch (error) {
    const err = error as Error;
    logToolError("hev_fs_edit", err, { file_path: filePath, editCount: edits.length });
    return {
      content: [{ type: "text", text: editT(t, "errors.generic", { message: err.message }) }],
      isError: true,
    };
  }
}

export const EDIT_FILE_TOOL = {
  name: "hev_fs_edit",
  description: editToolDefinitionT("description"),
  inputSchema: {
    type: "object" as const,
    properties: {
      file_path: {
        type: "string",
        description: editToolDefinitionT("filePath"),
      },
      edits: {
        type: "array",
        description: editToolDefinitionT("edits"),
        items: {
          type: "object",
          properties: {
            old_text: {
              type: "string",
              description: editToolDefinitionT("oldText"),
            },
            new_text: {
              type: "string",
              description: editToolDefinitionT("newText"),
            },
          },
          required: ["old_text", "new_text"],
        },
      },
      dry_run: {
        type: "boolean",
        description: editToolDefinitionT("dryRun"),
        default: false,
      },
      all_or_nothing: {
        type: "boolean",
        description: editToolDefinitionT("allOrNothing"),
        default: false,
      },
      match_scope: {
        oneOf: [
          {
            type: "string",
            enum: ["first", "last", "all"],
            description: editToolDefinitionT("matchScopeEnum"),
          },
          {
            type: "array",
            items: { type: "integer", minimum: 0 },
            description: editToolDefinitionT("matchScopeIndexes"),
          },
        ],
        description: editToolDefinitionT("matchScope"),
        default: "all",
      },
      ignore_whitespace: {
        type: "boolean",
        description: editToolDefinitionT("ignoreWhitespace"),
        default: false,
      },
      normalize_eol: {
        type: "string",
        enum: ["lf", "crlf", "auto", "preserve"],
        description: editToolDefinitionT("normalizeEol"),
        default: "auto",
      },
    },
    required: ["file_path", "edits"],
  },
  metadata: {
    category: "filesystem",
    subcategory: "basic",
    priority: "high",
    complexity: "complex",
    useCases: [
      editToolDefinitionT("useCases.partialFileEdits"),
      editToolDefinitionT("useCases.multilineEdits"),
      editToolDefinitionT("useCases.batchReplace"),
      editToolDefinitionT("useCases.refactoring"),
      editToolDefinitionT("useCases.atomicEdits"),
      editToolDefinitionT("useCases.scopedReplace"),
    ],
    relatedTools: ["hev_fs_write", "hev_dev_edit_lines", "hev_dev_check_syntax"],
    agentGuidance: editToolDefinitionT("agentGuidance"),
    requiresConfirmation: false,
    riskLevel: "medium",
    tags: ["file", "edit", "modify", "replace", "patch", "atomic", "scope"],
  },
};
