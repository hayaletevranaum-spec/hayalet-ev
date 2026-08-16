import {
  tsGetTypeInfo,
  tsGetDefinition,
  tsGetReferences,
  tsGetDiagnostics,
  TS_TYPE_INFO_TOOL,
  TS_GO_TO_DEFINITION_TOOL,
  TS_FIND_REFERENCES_TOOL,
  TS_DIAGNOSTICS_TOOL,
} from "../../../tools/dev/index.js";
import type { ToolEntry } from "../../registry.js";

export function createTsLanguageDevTools(projectRoot: string): ToolEntry[] {
  return [
    {
      definition: TS_TYPE_INFO_TOOL,
      handler: (args): unknown => {
        const a = args as Record<string, unknown>;
        const result = tsGetTypeInfo(
          projectRoot,
          a["file_path"] as string,
          a["line"] as number,
          a["column"] as number
        );
        return { content: [{ type: "text", text: result }] };
      },
    },
    {
      definition: TS_GO_TO_DEFINITION_TOOL,
      handler: (args): unknown => {
        const a = args as Record<string, unknown>;
        const result = tsGetDefinition(
          projectRoot,
          a["file_path"] as string,
          a["line"] as number,
          a["column"] as number
        );
        return { content: [{ type: "text", text: result }] };
      },
    },
    {
      definition: TS_FIND_REFERENCES_TOOL,
      handler: (args): unknown => {
        const a = args as Record<string, unknown>;
        const result = tsGetReferences(
          projectRoot,
          a["file_path"] as string,
          a["line"] as number,
          a["column"] as number
        );
        return { content: [{ type: "text", text: result }] };
      },
    },
    {
      definition: TS_DIAGNOSTICS_TOOL,
      handler: (args): unknown => {
        const a = args as Record<string, unknown>;
        const result = tsGetDiagnostics(projectRoot, a["file_path"] as string);
        return { content: [{ type: "text", text: result }] };
      },
    },
  ];
}
