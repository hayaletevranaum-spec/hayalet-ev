import { search, SafeSearchType } from "duck-duck-scrape";
import { logToolError } from "../../utils/mcp-logger.js";
import { createMcpTranslator, createMcpTranslatorSync } from "../../utils/i18n/index.js";
import type { ToolResult } from "../../types/index-mcp.js";

export interface WebSearchResult {
  title: string;
  url: string;
  description: string;
  source?: string;
}

type SearchProvider = "searxng" | "duckduckgo";

export interface WebSearchOptions {
  query: string;
  numResults?: number;
  safeSearch?: boolean;
  region?: string;
  timeRange?: "day" | "week" | "month" | "year";
  provider?: SearchProvider;
  searxngBaseUrl?: string;
}

interface SearxngResult {
  title?: string;
  url?: string;
  content?: string;
}

interface SearxngResponse {
  results?: SearxngResult[];
}

type WebTranslator = (key: string, params?: Record<string, string | number | boolean>) => string;

const webSearchDefinitionTranslator = createMcpTranslatorSync();

function webSearchDefT(key: string, params?: Record<string, string | number | boolean>): string {
  return webSearchDefinitionTranslator(`mcpServer.webTools.definition.search.${key}`, params);
}

function webSearchT(
  t: WebTranslator,
  key: string,
  params?: Record<string, string | number | boolean>
): string {
  return t(`mcpServer.webTools.search.${key}`, params);
}

const DEFAULT_PROVIDER: SearchProvider = "searxng";
const DEFAULT_SEARXNG_BASE_URL = "https://search.wdpserver.com";
const FALLBACK_SEARXNG_BASE_URLS = [
  "https://search.wdpserver.com",
  "https://search.inetol.net",
  "https://searxng.site",
  "https://searx.tiekoetter.com",
];

function resolveProvider(input?: string): SearchProvider {
  const raw = (input ?? process.env["WEB_SEARCH_PROVIDER"] ?? DEFAULT_PROVIDER)
    .toLowerCase()
    .trim();

  if (raw === "ddg" || raw === "duckduckgo") {
    return "duckduckgo";
  }

  return "searxng";
}

function resolveSearxngBaseUrl(input?: string): string {
  const raw = (input ?? process.env["SEARXNG_BASE_URL"] ?? DEFAULT_SEARXNG_BASE_URL).trim();
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

function buildSearxngCandidates(input?: string): string[] {
  const primary = resolveSearxngBaseUrl(input);
  const all = [primary, ...FALLBACK_SEARXNG_BASE_URLS];
  return [...new Set(all.map((url) => (url.endsWith("/") ? url.slice(0, -1) : url)))];
}

function mapRegionToSearxngLanguage(region: string): string {
  const lower = region.toLowerCase();

  if (lower.startsWith("tr")) return "tr";
  if (lower.startsWith("de")) return "de";
  if (lower.startsWith("fr")) return "fr";
  if (lower.startsWith("es")) return "es";

  return "en";
}

const RATE_LIMIT = {
  maxRequests: 30,
  windowMs: 60 * 1000,
  retryAfterMs: 2000,
};

const requestLog: number[] = [];
let lastRequestTime = 0;

function checkRateLimit(): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();

  const windowStart = now - RATE_LIMIT.windowMs;
  while (requestLog.length > 0 && requestLog[0] !== undefined && requestLog[0] < windowStart) {
    requestLog.shift();
  }

  if (requestLog.length >= RATE_LIMIT.maxRequests) {
    const oldestRequest = requestLog[0];
    if (oldestRequest !== undefined) {
      const retryAfter = oldestRequest + RATE_LIMIT.windowMs - now;
      return { allowed: false, retryAfter };
    }
  }

  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < RATE_LIMIT.retryAfterMs) {
    const retryAfter = RATE_LIMIT.retryAfterMs - timeSinceLastRequest;
    return { allowed: false, retryAfter };
  }

  return { allowed: true };
}

function recordRequest(): void {
  const now = Date.now();
  requestLog.push(now);
  lastRequestTime = now;
}

async function searchWithDuckDuckGo(options: WebSearchOptions): Promise<ToolResult> {
  const { query, numResults = 10, safeSearch = true, region = "tr-tr" } = options;
  const t = await createMcpTranslator();

  const rateLimitCheck = checkRateLimit();
  if (!rateLimitCheck.allowed) {
    const waitSeconds = Math.ceil((rateLimitCheck.retryAfter ?? 0) / 1000);
    return {
      content: [
        {
          type: "text",
          text: webSearchT(t, "errors.rateLimit", { waitSeconds }),
        },
      ],
      isError: true,
    };
  }

  recordRequest();

  const searchResult = await search(query, {
    safeSearch: safeSearch ? SafeSearchType.STRICT : SafeSearchType.OFF,
    region,
  });

  const formattedResults: WebSearchResult[] = searchResult.results
    .slice(0, numResults)
    .map((result) => ({
      title: result.title.length > 0 ? result.title : webSearchT(t, "results.untitled"),
      url: result.url.length > 0 ? result.url : "",
      description: result.description.length > 0 ? result.description : "",
      source: new URL(result.url.length > 0 ? result.url : "http://localhost").hostname,
    }));

  if (formattedResults.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: webSearchT(t, "errors.noResults", { query }),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: formatSearchResults(t, "duckduckgo", query, formattedResults, numResults),
      },
    ],
  };
}

async function searchWithSearxng(options: WebSearchOptions): Promise<ToolResult> {
  const { query, numResults = 10, safeSearch = true, region = "tr-tr" } = options;
  const t = await createMcpTranslator();
  const language = mapRegionToSearxngLanguage(region);
  const candidates = buildSearxngCandidates(options.searxngBaseUrl);

  let lastError = webSearchT(t, "errors.searxngEndpoint");

  for (const baseUrl of candidates) {
    try {
      const url = new URL(`${baseUrl}/search`);
      url.searchParams.set("q", query);
      url.searchParams.set("format", "json");
      url.searchParams.set("language", language);
      url.searchParams.set("safesearch", safeSearch ? "1" : "0");

      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        lastError = `${baseUrl} -> HTTP ${response.status}`;
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const payload = (await response.json()) as SearxngResponse;
      const formattedResults: WebSearchResult[] = (payload.results ?? [])
        .slice(0, numResults)
        .map((result) => ({
          title:
            (result.title ?? "").length > 0
              ? (result.title ?? "")
              : webSearchT(t, "results.untitled"),
          url: result.url ?? "",
          description: result.content ?? "",
          source: new URL((result.url ?? "").length > 0 ? (result.url ?? "") : "http://localhost")
            .hostname,
        }));

      if (formattedResults.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: webSearchT(t, "errors.noResults", { query }),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: formatSearchResults(t, "searxng", query, formattedResults, numResults),
          },
        ],
      };
    } catch (error) {
      lastError = `${baseUrl} -> ${(error as Error).message}`;
    }
  }

  throw new Error(lastError);
}

export async function webSearch(options: WebSearchOptions): Promise<ToolResult> {
  const provider = resolveProvider(options.provider);
  const t = await createMcpTranslator();

  try {
    if (provider === "duckduckgo") {
      return await searchWithDuckDuckGo(options);
    }

    return await searchWithSearxng(options);
  } catch (error) {
    const err = error as Error;
    logToolError("hev_web_search", err, {
      query: options.query,
      numResults: options.numResults,
      provider,
    });

    if (provider === "searxng") {
      return {
        content: [
          {
            type: "text",
            text: webSearchT(t, "errors.searxngSearchFailed", { message: err.message }),
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: webSearchT(t, "errors.searchFailed", { message: err.message }),
        },
      ],
      isError: true,
    };
  }
}

function formatSearchResults(
  t: WebTranslator,
  provider: SearchProvider,
  query: string,
  results: WebSearchResult[],
  requestedCount: number
): string {
  const lines: string[] = [
    webSearchT(t, "results.title", { query }),
    webSearchT(t, "results.provider", { provider }),
    webSearchT(t, "results.count", {
      count: results.length,
      suffix: results.length < requestedCount ? webSearchT(t, "results.allShownSuffix") : "",
    }),
    "",
    "═".repeat(60),
    "",
  ];

  results.forEach((result, index) => {
    lines.push(`${index + 1}. ${result.title}`);
    lines.push(`   🌐 ${result.url}`);
    lines.push(`   📝 ${truncateText(result.description, 200)}`);
    lines.push("");
  });

  lines.push("═".repeat(60));
  lines.push("");
  lines.push(webSearchT(t, "results.fetchHintTitle"));
  lines.push(webSearchT(t, "results.fetchHintCommand", { url: results[0]?.url ?? "URL" }));

  return lines.join("\n");
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + "...";
}

export const WEB_SEARCH_TOOL = {
  name: "hev_web_search",
  description: webSearchDefT("description"),
  inputSchema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: webSearchDefT("query"),
      },
      num_results: {
        type: "integer",
        description: webSearchDefT("numResults"),
        default: 10,
        minimum: 1,
        maximum: 20,
      },
      safe_search: {
        type: "boolean",
        description: webSearchDefT("safeSearch"),
        default: true,
      },
      region: {
        type: "string",
        description: webSearchDefT("region"),
        default: "tr-tr",
      },
      provider: {
        type: "string",
        description: webSearchDefT("provider"),
      },
      searxng_base_url: {
        type: "string",
        description: webSearchDefT("searxngBaseUrl"),
      },
    },
    required: ["query"],
  },
  metadata: {
    category: "web",
    subcategory: "search",
    priority: "high",
    complexity: "medium",
    useCases: [
      webSearchDefT("useCases.currentInformation"),
      webSearchDefT("useCases.apiDocumentation"),
      webSearchDefT("useCases.errorResearch"),
      webSearchDefT("useCases.packageInfo"),
    ],
    relatedTools: ["hev_web_fetch_url"],
    agentGuidance: webSearchDefT("agentGuidance"),
    requiresConfirmation: false,
    riskLevel: "low",
    tags: ["web", "search", "searxng", "free", "no-docker"],
  },
};
