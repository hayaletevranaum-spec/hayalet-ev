import {
  memoryBootstrapPolicy,
  memoryPrune,
  memorySearch,
  memoryStats,
  memoryUpdate,
  memoryWrite,
  MEMORY_TOOL_DEFINITIONS,
} from "../../tools/memory-tools.js";
import { createMcpTranslatorSync } from "../../utils/i18n/index.js";
import type { ToolContext, ToolEntry } from "../registry.js";

function getDefinition(name: string): (typeof MEMORY_TOOL_DEFINITIONS)[number] {
  const def = MEMORY_TOOL_DEFINITIONS.find((d) => d.name === name);
  if (!def) throw new Error(`Memory tool definition not found: ${name}`);
  return def;
}

export function createMemoryTools(context: ToolContext): ToolEntry[] {
  const { PROJECT_ROOT } = context;
  const memoryHandlerT = (
    key: string,
    params?: Record<string, string | number | boolean>
  ): string => createMcpTranslatorSync()(`mcpServer.memoryTools.handler.${key}`, params);

  return [
    {
      definition: getDefinition("hev_memory_write"),
      handler: async (args): Promise<unknown> => {
        const result = await memoryWrite(PROJECT_ROOT, args as Parameters<typeof memoryWrite>[1]);
        return {
          content: [
            {
              type: "text",
              text: `${result.message}\n${JSON.stringify(result.memory, null, 2)}`,
            },
          ],
        };
      },
    },
    {
      definition: getDefinition("hev_memory_search"),
      handler: async (args): Promise<unknown> => {
        const searchArgs = args as Parameters<typeof memorySearch>[1];
        const result = await memorySearch(PROJECT_ROOT, searchArgs);
        if (searchArgs.response_format === "prompt_compact") {
          return {
            content: [
              {
                type: "text",
                text: result.prompt_context,
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      },
    },
    {
      definition: getDefinition("hev_memory_update"),
      handler: async (args): Promise<unknown> => {
        const result = await memoryUpdate(PROJECT_ROOT, args as Parameters<typeof memoryUpdate>[1]);
        const text = result.updated
          ? memoryHandlerT("updated", { id: result.id })
          : memoryHandlerT("notFound", { id: result.id });
        return { content: [{ type: "text", text }] };
      },
    },
    {
      definition: getDefinition("hev_memory_prune"),
      handler: async (args): Promise<unknown> => {
        const result = await memoryPrune(PROJECT_ROOT, args as Parameters<typeof memoryPrune>[1]);
        return {
          content: [
            {
              type: "text",
              text: memoryHandlerT("pruned", {
                removed: result.removed,
                maxItems: result.maxItems,
              }),
            },
          ],
        };
      },
    },
    {
      definition: getDefinition("hev_memory_stats"),
      handler: async (args): Promise<unknown> => {
        const result = await memoryStats(PROJECT_ROOT, args as Parameters<typeof memoryStats>[1]);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      },
    },
    {
      definition: getDefinition("hev_memory_bootstrap_policy"),
      handler: async (args): Promise<unknown> => {
        const result = await memoryBootstrapPolicy(
          PROJECT_ROOT,
          args
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      },
    },
  ];
}
