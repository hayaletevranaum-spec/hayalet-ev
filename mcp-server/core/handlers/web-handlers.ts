import { webSearch } from "../../tools/web/search.js";
import { webFetchUrl } from "../../tools/web/fetch.js";
import { WEB_TOOL_DEFINITIONS } from "../../tools/web/index.js";
import type { ToolEntry } from "../registry.js";

export function createWebTools(): ToolEntry[] {
  return [
    {
      definition: WEB_TOOL_DEFINITIONS[0],
      handler: async (args): Promise<unknown> => {
        return await webSearch({
          query: (args as { query: string }).query,
          numResults: (args as { num_results?: number }).num_results ?? 10,
          safeSearch: (args as { safe_search?: boolean }).safe_search ?? true,
          region: (args as { region?: string }).region ?? "tr-tr",
          ...((args as { provider?: "searxng" | "duckduckgo" }).provider !== undefined
            ? { provider: (args as { provider?: "searxng" | "duckduckgo" }).provider }
            : {}),
          ...((args as { searxng_base_url?: string }).searxng_base_url !== undefined
            ? { searxngBaseUrl: (args as { searxng_base_url?: string }).searxng_base_url }
            : {}),
        });
      },
    },
    {
      definition: WEB_TOOL_DEFINITIONS[1],
      handler: async (args): Promise<unknown> => {
        return await webFetchUrl({
          url: (args as { url: string }).url,
          maxLength: (args as { max_length?: number }).max_length ?? 10000,
          includeLinks: (args as { include_links?: boolean }).include_links ?? true,
        });
      },
    },
  ];
}
