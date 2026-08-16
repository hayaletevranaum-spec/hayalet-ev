import type { ToolResult } from "../types/index-mcp.js";
import type { TranslationParams } from "../../src/types/i18n.js";
import { createMcpTranslatorSync } from "../utils/i18n/index.js";

type McpTranslator = (key: string, params?: TranslationParams) => string;

interface ErrorPattern {
  pattern: RegExp;
  category: string;
  suggestionKey: string;
  checkFiles: (provider?: string) => string[];
  severity: "high" | "medium" | "low";
}

interface MatchResult {
  category: string;
  suggestion: string;
  checkFiles: string[];
  severity: "high" | "medium" | "low";
}

const ERROR_PATTERNS: ErrorPattern[] = [
  {
    pattern: /Cannot read propert(?:y|ies).*of (?:null|undefined)/i,
    category: "domSelector",
    suggestionKey: "suggestions.domSelectorChanged",
    checkFiles: (provider) =>
      provider !== undefined && provider.length > 0
        ? [`src/js/modules/webview/providers/${provider}/config.js`]
        : [],
    severity: "high",
  },
  {
    pattern: /net::ERR_INTERNET_DISCONNECTED/i,
    category: "network",
    suggestionKey: "suggestions.internetDisconnected",
    checkFiles: () => [],
    severity: "high",
  },
  {
    pattern: /net::ERR_NAME_NOT_RESOLVED/i,
    category: "network",
    suggestionKey: "suggestions.dnsResolutionFailed",
    checkFiles: () => [],
    severity: "high",
  },
  {
    pattern: /Timeout|ETIMEDOUT/i,
    category: "timeout",
    suggestionKey: "suggestions.timeout",
    checkFiles: () => ["src/js/constants/timeouts.js"],
    severity: "medium",
  },
  {
    pattern: /ENOENT/i,
    category: "filesystem",
    suggestionKey: "suggestions.fileNotFound",
    checkFiles: () => [],
    severity: "medium",
  },
  {
    pattern: /WebSocket.*close|ECONNRESET/i,
    category: "connection",
    suggestionKey: "suggestions.connectionLost",
    checkFiles: () => [],
    severity: "medium",
  },
  {
    pattern: /Invalid state|already|disposed/i,
    category: "state",
    suggestionKey: "suggestions.invalidState",
    checkFiles: () => ["src/js/modules/webview/lifecycle-manager.js"],
    severity: "low",
  },
];

function getDebugTranslator(): McpTranslator {
  return createMcpTranslatorSync();
}

function debugT(t: McpTranslator, key: string, params?: TranslationParams): string {
  return t(`mcpServer.debugTools.${key}`, params);
}

function isNonEmptyString(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}

function translateSeverity(t: McpTranslator, severity: "high" | "medium" | "low"): string {
  return debugT(t, `severity.${severity}`);
}

function translateCategory(t: McpTranslator, category: string): string {
  return debugT(t, `categories.${category}`);
}

function matchErrorPattern(
  errorMessage: string,
  provider: string | null = null,
  t: McpTranslator
): MatchResult | null {
  for (const pattern of ERROR_PATTERNS) {
    if (pattern.pattern.test(errorMessage)) {
      return {
        category: translateCategory(t, pattern.category),
        suggestion: debugT(t, pattern.suggestionKey),
        checkFiles: pattern.checkFiles(provider ?? undefined),
        severity: pattern.severity,
      };
    }
  }

  return null;
}

export function getErrorHints(args: Record<string, unknown>): ToolResult {
  const t = getDebugTranslator();
  const { errorMessage, provider } = args as { errorMessage?: string; provider?: string };

  if (!isNonEmptyString(errorMessage)) {
    return {
      content: [{ type: "text", text: debugT(t, "errors.errorMessageRequired") }],
      isError: true,
    };
  }

  for (const pattern of ERROR_PATTERNS) {
    if (pattern.pattern.test(errorMessage)) {
      const hint = {
        category: translateCategory(t, pattern.category),
        suggestion: debugT(t, pattern.suggestionKey),
        checkFiles: pattern.checkFiles(provider),
        severity: pattern.severity,
      };

      const lines = [
        debugT(t, "analysis.title"),
        "",
        debugT(t, "analysis.message", { errorMessage }),
        "",
        debugT(t, "analysis.category", { category: hint.category }),
        debugT(t, "analysis.severity", { severity: translateSeverity(t, hint.severity) }),
        "",
        debugT(t, "analysis.suggestionTitle"),
        hint.suggestion,
      ];

      if (hint.checkFiles.length > 0) {
        lines.push(
          "",
          debugT(t, "analysis.filesTitle"),
          ...hint.checkFiles.map((filePath) => `- ${filePath}`)
        );
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
      };
    }
  }

  return {
    content: [
      {
        type: "text",
        text: [
          debugT(t, "analysis.title"),
          "",
          debugT(t, "analysis.message", { errorMessage }),
          "",
          debugT(t, "analysis.noKnownPattern"),
          "",
          debugT(t, "analysis.genericSuggestionsTitle"),
          `- ${debugT(t, "analysis.genericSuggestions.inspectLogs")}`,
          `- ${debugT(t, "analysis.genericSuggestions.checkStackTrace")}`,
          `- ${debugT(t, "analysis.genericSuggestions.debugRelatedCode")}`,
        ].join("\n"),
      },
    ],
  };
}

export function collectErrorContext(args: Record<string, unknown>): ToolResult {
  const t = getDebugTranslator();
  const { command, errorMessage, logSnippet, provider, fileContext, hint } = args as {
    command?: string;
    errorMessage?: string;
    logSnippet?: string;
    provider?: string;
    fileContext?: string[];
    hint?: string;
  };

  if (!isNonEmptyString(errorMessage) && !isNonEmptyString(logSnippet)) {
    return {
      content: [{ type: "text", text: debugT(t, "errors.errorMessageOrLogSnippetRequired") }],
      isError: true,
    };
  }

  const matched = isNonEmptyString(errorMessage)
    ? matchErrorPattern(errorMessage, provider ?? null, t)
    : null;
  const nextChecks: string[] = [];

  if (matched !== null && matched.checkFiles.length > 0) {
    nextChecks.push(...matched.checkFiles);
  }

  if (fileContext && fileContext.length > 0) {
    nextChecks.push(...fileContext);
  }

  const output = [
    debugT(t, "contextSummary.title"),
    "",
    isNonEmptyString(errorMessage)
      ? debugT(t, "contextSummary.error", { errorMessage })
      : undefined,
    isNonEmptyString(command) ? debugT(t, "contextSummary.command", { command }) : undefined,
    isNonEmptyString(provider) ? debugT(t, "contextSummary.provider", { provider }) : undefined,
    isNonEmptyString(logSnippet)
      ? debugT(t, "contextSummary.logSnippet", { logSnippet })
      : undefined,
    isNonEmptyString(hint) ? debugT(t, "contextSummary.extraNote", { hint }) : undefined,
    matched !== null
      ? debugT(t, "contextSummary.category", {
          category: matched.category,
          severity: translateSeverity(t, matched.severity),
        })
      : debugT(t, "contextSummary.unknownCategory"),
    matched !== null && matched.suggestion.length > 0
      ? debugT(t, "contextSummary.suggestion", { suggestion: matched.suggestion })
      : debugT(t, "contextSummary.defaultSuggestion"),
    nextChecks.length > 0
      ? [
          debugT(t, "contextSummary.checkpointsTitle"),
          ...nextChecks.map((item) => `- ${item}`),
        ].join("\n")
      : debugT(t, "contextSummary.noCheckpoints"),
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");

  return {
    content: [{ type: "text", text: output }],
  };
}
