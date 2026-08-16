import { expandCodeChunks } from "../../../tools/fs/code-operations.js";
import { executeBash } from "../../../tools/fs/bash-executor.js";
import { createMcpTranslator } from "../../../utils/i18n/index.js";
import {
  startChunkedSession,
  writeChunk,
  finalizeChunked,
  getSessionStatus,
  cancelSession,
  SAFE_CHUNK_TOOL_DEFINITIONS,
} from "../../../tools/safe-chunk-tools.js";
import { sanitizeContent } from "../../../tools/fs/shared/helpers.js";
import { EXPAND_CODE_CHUNKS_TOOL, BASH_EXECUTOR_TOOL } from "../../../tools/fs/index.js";
import type { ToolEntry } from "../../registry.js";
import type { TranslationParams } from "../../../../src/types/i18n.js";

type McpTranslator = (key: string, params?: TranslationParams) => string;

function fsT(t: McpTranslator, key: string, params?: TranslationParams): string {
  return t(`mcpServer.fs.${key}`, params);
}

export function createFilesystemMiscTools(projectRoot: string): ToolEntry[] {
  return [
    {
      definition: EXPAND_CODE_CHUNKS_TOOL,
      handler: async (args): Promise<unknown> => {
        const result = await expandCodeChunks(
          (args as { file_path: string }).file_path,
          (args as { line_ranges?: [number, number][] }).line_ranges ?? [],
          (args as { patterns?: string[] }).patterns ?? []
        );
        return { content: [{ type: "text", text: result.error ?? result.content }] };
      },
    },
    {
      definition: SAFE_CHUNK_TOOL_DEFINITIONS[0],
      handler: (args): unknown => {
        const result = startChunkedSession(
          (args as { file_path: string }).file_path,
          (args as { total_chunks: number }).total_chunks,
          projectRoot
        );
        return { content: [{ type: "text", text: result.message }] };
      },
    },
    {
      definition: SAFE_CHUNK_TOOL_DEFINITIONS[1],
      handler: async (args): Promise<unknown> => {
        const t = await createMcpTranslator();
        const result = await writeChunk(
          (args as { session_id: string }).session_id,
          (args as { chunk_index: number }).chunk_index,
          sanitizeContent((args as { content: string }).content),
          projectRoot
        );
        let msg = result.message;
        if (result.warnings && result.warnings.length > 0) {
          msg += `\n\n${fsT(t, "misc.warningsTitle")}\n${result.warnings.join("\n")}`;
        }
        return { content: [{ type: "text", text: msg }] };
      },
    },
    {
      definition: SAFE_CHUNK_TOOL_DEFINITIONS[2],
      handler: async (args): Promise<unknown> => {
        const result = await finalizeChunked(
          (args as { session_id: string }).session_id,
          projectRoot,
          (args as { verify_checksum?: string }).verify_checksum
        );
        return { content: [{ type: "text", text: result.message }] };
      },
    },
    {
      definition: SAFE_CHUNK_TOOL_DEFINITIONS[3],
      handler: (args): unknown => {
        const result = getSessionStatus((args as { session_id: string }).session_id);
        return { content: [{ type: "text", text: result.message }] };
      },
    },
    {
      definition: SAFE_CHUNK_TOOL_DEFINITIONS[4],
      handler: async (args): Promise<unknown> => {
        const result = await cancelSession(
          (args as { session_id: string }).session_id,
          projectRoot
        );
        return { content: [{ type: "text", text: result.message }] };
      },
    },
    {
      definition: BASH_EXECUTOR_TOOL,
      handler: async (args): Promise<unknown> => {
        const t = await createMcpTranslator();
        const timeout = (args as { timeout?: number }).timeout;
        const result = await executeBash((args as { command: string }).command, projectRoot, timeout, {
          detachLongRunning: timeout === undefined,
        });
        let output = "";
        if (typeof result.stdout === "string" && result.stdout.length > 0) output += result.stdout;
        if (typeof result.stderr === "string" && result.stderr.length > 0) {
          output +=
            (output.length > 0 ? "\n" : "") + `${fsT(t, "misc.stderrTitle")}\n${result.stderr}`;
        }
        if (output.length === 0) {
          output = fsT(t, "misc.commandCompleted", { exitCode: result.exitCode });
        }
        if (result.timedOut === true) output = `${fsT(t, "misc.commandTimedOut")}\n${output}`;
        if (typeof result.pid === "number")
          output += `\n${fsT(t, "misc.pidLine", { pid: result.pid })}`;
        return {
          content: [{ type: "text", text: output }],
          isError: result.exitCode !== 0,
        };
      },
    },
  ];
}
