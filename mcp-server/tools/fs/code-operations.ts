// NOTE: Code-specific helpers for targeted expansion.

import { readFile } from "fs/promises";
import { expandSymbols, expandLineRanges, addLineNumbers } from "../../utils/file-utils.js";
import { createMcpTranslatorSync } from "../../utils/i18n/index.js";
import { logToolError } from "../../utils/mcp-logger.js";

function codeOpsDefT(key: string, params?: Record<string, string | number | boolean>): string {
  return createMcpTranslatorSync()(`mcpServer.fsCodeTools.definition.${key}`, params);
}

export async function expandCodeChunks(
  filePath: string,
  lineRanges: [number, number][] = [],
  patterns: string[] = []
): Promise<{ content: string; error?: string }> {
  try {
    // NOTE: Prefer symbol expansion when patterns are provided.
    if (patterns.length > 0) {
      const content = await expandSymbols(filePath, patterns);
      return { content };
    }

    // NOTE: Fall back to explicit line ranges.
    if (lineRanges.length > 0) {
      const content = await expandLineRanges(filePath, lineRanges);
      return { content };
    }

    const fileContent = await readFile(filePath, "utf-8");
    return { content: addLineNumbers(fileContent) };
  } catch (error) {
    logToolError("hev_fs_expand_code_chunks", error as Error, { filePath, lineRanges, patterns });
    return { content: "", error: (error as Error).message };
  }
}

export const EXPAND_CODE_CHUNKS_TOOL = {
  name: "hev_fs_expand_code_chunks",
  description: codeOpsDefT("expand.description"),
  inputSchema: {
    type: "object" as const,
    properties: {
      file_path: { type: "string", description: codeOpsDefT("common.filePath") },
      line_ranges: {
        type: "array",
        items: { type: "array", items: { type: "integer" } },
        description: codeOpsDefT("expand.lineRanges"),
        default: [],
      },
      patterns: {
        type: "array",
        items: { type: "string" },
        description: codeOpsDefT("expand.patterns"),
        default: [],
      },
    },
    required: ["file_path"],
  },
  metadata: {
    category: "filesystem",
    subcategory: "code-operations",
    priority: "medium",
    complexity: "simple",
    useCases: [
      codeOpsDefT("expand.useCases.inspectCode"),
      codeOpsDefT("expand.useCases.expandRanges"),
      codeOpsDefT("expand.useCases.expandSymbols"),
    ],
    relatedTools: ["hev_fs_read", "hev_fs_edit"],
    agentGuidance: codeOpsDefT("expand.agentGuidance"),
    requiresConfirmation: false,
    riskLevel: "low",
    tags: ["filesystem", "code", "expand", "symbols", "ranges"],
  },
};
