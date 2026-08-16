import {
  safelyRefactorCode,
  smartInsertCode,
  SAFE_BATCH_REFACTOR_TOOL,
  SMART_SEARCH_INSERT_TOOL,
} from "../../../tools/dev/index.js";
import type { ToolEntry } from "../../registry.js";

export function createRefactorDevTools(projectRoot: string): ToolEntry[] {
  return [
    {
      definition: SAFE_BATCH_REFACTOR_TOOL,
      handler: async (args): Promise<unknown> => {
        const a = args as Record<string, unknown>;
        const operations = (a["operations"] as Array<Record<string, unknown>>).map((op) => ({
          pattern: op["pattern"] as string,
          replace_with: op["replace_with"] as string,
          ...((op["target_lines"] as number[] | undefined) !== undefined
            ? { target_lines: op["target_lines"] as number[] }
            : {}),
          ...((op["mode"] as "string" | "ast" | undefined) !== undefined
            ? { mode: op["mode"] as "string" | "ast" }
            : {}),
          ...((op["ast_type"] as "function_call" | "variable" | "import" | undefined) !== undefined
            ? { ast_type: op["ast_type"] as "function_call" | "variable" | "import" }
            : {}),
        }));
        const result = await safelyRefactorCode(
          {
            file_path: a["file_path"] as string,
            operations,
            ...((a["verify_after_each"] as boolean | undefined) !== undefined
              ? { verify_after_each: a["verify_after_each"] as boolean }
              : {}),
            ...((a["auto_rollback_on_error"] as boolean | undefined) !== undefined
              ? { auto_rollback_on_error: a["auto_rollback_on_error"] as boolean }
              : {}),
            ...((a["dry_run"] as boolean | undefined) !== undefined
              ? { dry_run: a["dry_run"] as boolean }
              : {}),
          },
          projectRoot
        );
        return {
          content: [{ type: "text", text: result.success ? "✅ Refactored" : "❌ Failed" }],
        };
      },
    },
    {
      definition: SMART_SEARCH_INSERT_TOOL,
      handler: (args): unknown => {
        const a = args as Record<string, unknown>;
        const result = smartInsertCode({
          file_path: a["file_path"] as string,
          anchor: a["anchor"] as string,
          position: a["position"] as "before" | "after" | "inside_start" | "inside_end",
          code: a["code"] as string,
          ...((a["dry_run"] as boolean | undefined) !== undefined
            ? { dry_run: a["dry_run"] as boolean }
            : {}),
        });
        return {
          content: [{ type: "text", text: result.success ? "✅ Inserted" : "❌ Failed" }],
        };
      },
    },
  ];
}
