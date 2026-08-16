import {
  readFileContent,
  writeFileContent,
  listDirectory,
  deleteFile,
  moveFile,
  READ_FILE_TOOL,
  WRITE_FILE_TOOL,
  LIST_DIRECTORY_TOOL,
  DELETE_FILE_TOOL,
  MOVE_FILE_TOOL,
} from "../../../tools/fs/basic/operations.js";
import { editFileContent, EDIT_FILE_TOOL } from "../../../tools/fs/basic/edit.js";
import { sanitizeContent } from "../../../tools/fs/shared/helpers.js";
import { createMcpTranslator } from "../../../utils/i18n/index.js";
import type { ToolEntry } from "../../registry.js";
import type { TranslationParams } from "../../../../src/types/i18n.js";

type McpTranslator = (key: string, params?: TranslationParams) => string;

function fsT(t: McpTranslator, key: string, params?: TranslationParams): string {
  return t(`mcpServer.fs.${key}`, params);
}

export function createFilesystemBasicTools(): ToolEntry[] {
  return [
    {
      definition: READ_FILE_TOOL,
      handler: async (args): Promise<unknown> => {
        return await readFileContent({
          file_path: (args as { file_path: string }).file_path,
          ...((args as { start_line?: number }).start_line !== undefined
            ? { start_line: (args as { start_line?: number }).start_line as number }
            : {}),
          ...((args as { end_line?: number }).end_line !== undefined
            ? { end_line: (args as { end_line?: number }).end_line as number }
            : {}),
          ...((args as { head?: number }).head !== undefined
            ? { head: (args as { head?: number }).head as number }
            : {}),
          ...((args as { tail?: number }).tail !== undefined
            ? { tail: (args as { tail?: number }).tail as number }
            : {}),
          encoding: (args as { encoding?: "utf8" | "base64" | "latin1" }).encoding ?? "utf8",
        });
      },
    },
    {
      definition: WRITE_FILE_TOOL,
      handler: async (args): Promise<unknown> => {
        const t = await createMcpTranslator();
        const filePath = (args as { file_path?: unknown }).file_path;
        const contentRaw = (args as { content?: unknown }).content;

        if (typeof filePath !== "string" || filePath.trim() === "") {
          return {
            content: [
              {
                type: "text",
                text: fsT(t, "validation.filePathRequiredString"),
              },
            ],
            isError: true,
          };
        }

        if (typeof contentRaw !== "string") {
          return {
            content: [
              {
                type: "text",
                text: fsT(t, "validation.contentRequiredString"),
              },
            ],
            isError: true,
          };
        }

        return await writeFileContent({
          file_path: filePath,
          content: sanitizeContent(contentRaw),
          overwrite: (args as { overwrite?: boolean }).overwrite ?? false,
          encoding: (args as { encoding?: "utf8" | "base64" | "latin1" }).encoding ?? "utf8",
        });
      },
    },
    {
      definition: LIST_DIRECTORY_TOOL,
      handler: async (args): Promise<unknown> => {
        return await listDirectory({
          path: (args as { path: string }).path,
          max_depth: (args as { max_depth?: number }).max_depth ?? 1,
          include_hidden: (args as { include_hidden?: boolean }).include_hidden ?? false,
        });
      },
    },
    {
      definition: DELETE_FILE_TOOL,
      handler: async (args): Promise<unknown> => {
        return await deleteFile({
          file_path: (args as { file_path: string }).file_path,
          recursive: (args as { recursive?: boolean }).recursive ?? false,
        });
      },
    },
    {
      definition: MOVE_FILE_TOOL,
      handler: async (args): Promise<unknown> => {
        return await moveFile({
          source: (args as { source: string }).source,
          destination: (args as { destination: string }).destination,
          overwrite: (args as { overwrite?: boolean }).overwrite ?? false,
        });
      },
    },
    {
      definition: EDIT_FILE_TOOL,
      handler: async (args): Promise<unknown> => {
        const a = args as {
          file_path: string;
          edits: Array<{ old_text?: string; new_text?: string; find?: string; replace?: string }>;
          dry_run?: boolean;
          ignore_whitespace?: boolean;
          all_or_nothing?: boolean;
          match_scope?: "first" | "last" | "all" | number[];
          normalize_eol?: "lf" | "crlf" | "auto" | "preserve";
        };
        const normalizedEdits = a.edits.map((e) => ({
          old_text: e.old_text ?? e.find ?? "",
          new_text: e.new_text ?? e.replace ?? "",
        }));
        return await editFileContent({
          file_path: a.file_path,
          edits: normalizedEdits,
          dry_run: a.dry_run ?? false,
          ignore_whitespace: a.ignore_whitespace ?? false,
          all_or_nothing: a.all_or_nothing ?? false,
          match_scope: a.match_scope ?? "all",
          normalize_eol: a.normalize_eol ?? "auto",
        });
      },
    },
  ];
}
