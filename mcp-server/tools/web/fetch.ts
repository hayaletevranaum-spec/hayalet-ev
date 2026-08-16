// NOTE: Fetch and parse web content using the shared scraper utilities.

import { fetchAndParse } from "../../utils/web-scraper.js";
import type { ScrapedContent } from "../../utils/web-scraper.js";
import { createMcpTranslator, createMcpTranslatorSync } from "../../utils/i18n/index.js";
import { logToolError } from "../../utils/mcp-logger.js";
import type { ToolResult } from "../../types/index-mcp.js";

export interface WebFetchOptions {
  url: string;
  maxLength?: number;
  includeLinks?: boolean;
}

export interface WebFetchResult {
  title: string;
  url: string;
  description: string;
  content: string;
  markdown: string;
  wordCount: number;
  language?: string;
}

type WebTranslator = (key: string, params?: Record<string, string | number | boolean>) => string;

type UrlValidationResult =
  | { valid: true }
  | {
      valid: false;
      errorKey: string;
      errorParams?: Record<string, string | number | boolean>;
    };

const webFetchDefinitionTranslator = createMcpTranslatorSync();

function webFetchDefT(key: string, params?: Record<string, string | number | boolean>): string {
  return webFetchDefinitionTranslator(`mcpServer.webTools.definition.${key}`, params);
}

function webFetchT(
  t: WebTranslator,
  key: string,
  params?: Record<string, string | number | boolean>
): string {
  return t(`mcpServer.webTools.fetch.${key}`, params);
}

const ALLOWED_PROTOCOLS = ["http:", "https:"];
const BLOCKED_DOMAINS = ["localhost", "127.0.0.1", "0.0.0.0", "[::1]"];

// NOTE: Reject unsupported protocols and local addresses before fetching remote content.
function validateUrl(url: string): UrlValidationResult {
  try {
    const parsed = new URL(url);

    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      return {
        valid: false,
        errorKey: "errors.unsupportedProtocol",
        errorParams: { protocol: parsed.protocol },
      };
    }

    const hostname = parsed.hostname.toLowerCase();
    if (
      BLOCKED_DOMAINS.some((blocked) => hostname === blocked || hostname.endsWith(`.${blocked}`))
    ) {
      return {
        valid: false,
        errorKey: "errors.localAddressBlocked",
      };
    }

    return { valid: true };
  } catch {
    return { valid: false, errorKey: "errors.invalidUrl" };
  }
}

export async function webFetchUrl(options: WebFetchOptions): Promise<ToolResult> {
  const { url, maxLength = 10000, includeLinks = true } = options;
  const t = await createMcpTranslator();

  const validation = validateUrl(url);
  if (!validation.valid) {
    return {
      content: [
        {
          type: "text",
          text: webFetchT(t, "errors.validationFailed", {
            message: webFetchT(t, validation.errorKey, validation.errorParams),
          }),
        },
      ],
      isError: true,
    };
  }

  try {
    const scraped = await fetchAndParse(url, {
      maxLength,
      includeLinks,
      timeout: 15000,
    });

    return {
      content: [
        {
          type: "text",
          text: formatFetchedContent(scraped, maxLength, t),
        },
      ],
    };
  } catch (error) {
    const err = error as Error;
    logToolError("hev_web_fetch_url", err, { url, maxLength });

    return {
      content: [
        {
          type: "text",
          text: webFetchT(t, "errors.fetchFailed", { message: err.message }),
        },
      ],
      isError: true,
    };
  }
}

function formatFetchedContent(
  scraped: ScrapedContent,
  maxLength: number,
  t: WebTranslator
): string {
  const lines: string[] = [
    webFetchT(t, "content.title", { title: scraped.title }),
    webFetchT(t, "content.url", { url: scraped.url }),
    "",
    "═".repeat(60),
    "",
  ];

  if (scraped.description !== "") {
    lines.push(webFetchT(t, "content.description", { description: scraped.description }));
    lines.push("");
  }

  if (scraped.language != null && scraped.language !== "") {
    lines.push(webFetchT(t, "content.language", { language: scraped.language }));
    lines.push("");
  }

  lines.push("─".repeat(60));
  lines.push("");

  const displayContent = scraped.markdown !== "" ? scraped.markdown : scraped.content;

  const wasTruncated = displayContent.length >= maxLength;
  const finalContent = wasTruncated
    ? displayContent.slice(0, maxLength).trim() + "\n\n" + webFetchT(t, "content.truncated")
    : displayContent;

  lines.push(finalContent);

  if (wasTruncated) {
    lines.push("");
    lines.push(
      webFetchT(t, "content.truncatedHint", {
        wordCount: scraped.wordCount,
        maxLength,
      })
    );
  }

  lines.push("");
  lines.push("═".repeat(60));
  lines.push(webFetchT(t, "content.wordCount", { wordCount: scraped.wordCount }));

  return lines.join("\n");
}

export const WEB_FETCH_URL_TOOL = {
  name: "hev_web_fetch_url",
  description: webFetchDefT("fetchUrl.description"),
  inputSchema: {
    type: "object" as const,
    properties: {
      url: {
        type: "string",
        description: webFetchDefT("fetchUrl.url"),
      },
      max_length: {
        type: "integer",
        description: webFetchDefT("fetchUrl.maxLength"),
        default: 10000,
      },
      include_links: {
        type: "boolean",
        description: webFetchDefT("fetchUrl.includeLinks"),
        default: true,
      },
    },
    required: ["url"],
  },
  metadata: {
    category: "web",
    subcategory: "fetch",
    priority: "high",
    complexity: "medium",
    useCases: [
      webFetchDefT("fetchUrl.useCases.pageAnalysis"),
      webFetchDefT("fetchUrl.useCases.documentation"),
      webFetchDefT("fetchUrl.useCases.errorResearch"),
      webFetchDefT("fetchUrl.useCases.blogSummary"),
    ],
    relatedTools: ["hev_web_search"],
    agentGuidance: webFetchDefT("fetchUrl.agentGuidance"),
    requiresConfirmation: false,
    riskLevel: "medium",
    tags: ["web", "fetch", "scrape", "content", "markdown"],
  },
};
