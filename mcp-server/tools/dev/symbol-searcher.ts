import { readFileSync } from "fs";
import { join } from "path";
import { DEV_CONFIG } from "./shared/config.js";
import { getAllFiles } from "./shared/utils.js";
import { createMcpTranslatorSync } from "../../utils/i18n/index.js";
import { getTsLanguageService } from "../../utils/ts-language-service.js";

type SymbolType = "function" | "class" | "interface" | "type" | "const" | "all";

interface SymbolMatch {
  file: string;
  line: number;
  type: string;
  context: string;
  typeInfo?: string;
}

function symbolSearchDefT(key: string, params?: Record<string, string | number | boolean>): string {
  return createMcpTranslatorSync()(`mcpServer.devTools.symbolSearcher.definition.${key}`, params);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function searchSymbol(
  projectRoot: string,
  symbol: string,
  options: { type?: SymbolType } = {}
): Promise<{ matches: SymbolMatch[]; total: number; method: string }> {
  const symbolType = options.type ?? "all";
  const matches: SymbolMatch[] = [];

  const allFiles = (
    await Promise.all(
      DEV_CONFIG.srcDirs.map(async (srcDir) => await getAllFiles(srcDir, projectRoot))
    )
  ).flat();

  const escapedSymbol = escapeRegex(symbol);
  const patterns: Record<string, RegExp> = {
    function: new RegExp(
      `(?:export\\s+)?(?:async\\s+)?function\\s+(${escapedSymbol})\\s*[(<]`,
      "i"
    ),
    class: new RegExp(`(?:export\\s+)?(?:abstract\\s+)?class\\s+(${escapedSymbol})`, "i"),
    interface: new RegExp(`(?:export\\s+)?interface\\s+(${escapedSymbol})`, "i"),
    type: new RegExp(`(?:export\\s+)?type\\s+(${escapedSymbol})\\s*[=<]`, "i"),
    const: new RegExp(`(?:export\\s+)?(?:const|let|var)\\s+(${escapedSymbol})\\s*[=:]`, "i"),
  };

  const searchPatterns: [string, RegExp][] =
    symbolType === "all"
      ? Object.entries(patterns)
      : [[symbolType, patterns[symbolType] as RegExp]];

  for (const file of allFiles) {
    try {
      const content = readFileSync(join(projectRoot, file), "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        for (const [type, pattern] of searchPatterns) {
          if (pattern.test(line)) {
            matches.push({
              file,
              line: i + 1,
              type,
              context: line.trim().slice(0, 120),
            });
          }
        }
      }
    } catch {
      // NOTE: Ignore unreadable files.
    }
  }

  try {
    const mgr = getTsLanguageService(projectRoot);
    const enrichLimit = Math.min(matches.length, 10);

    for (let i = 0; i < enrichLimit; i++) {
      const m = matches[i];
      if (!m) continue;
      try {
        const content = readFileSync(join(projectRoot, m.file), "utf-8");
        const line = content.split("\n")[m.line - 1] ?? "";
        const col = line.indexOf(symbol);
        if (col >= 0) {
          const typeInfo = mgr.getTypeInfo(m.file, m.line, col + 1);
          if (typeInfo) {
            m.typeInfo = typeInfo.displayString.slice(0, 200);
          }
        }
      } catch {
        // NOTE: Skip enrichment for this match.
      }
    }
  } catch {
    // NOTE: TS API unavailable; regex results are still valid.
  }

  const seen = new Set<string>();
  const unique = matches.filter((m) => {
    const key = `${m.file}:${m.line}:${m.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    matches: unique.slice(0, 100),
    total: unique.length,
    method: unique.some((m) => m.typeInfo !== undefined && m.typeInfo.length > 0)
      ? "hybrid"
      : "regex",
  };
}

export const SYMBOL_SEARCHER_TOOL = {
  name: "hev_dev_search_symbol",
  description: symbolSearchDefT("description"),
  inputSchema: {
    type: "object" as const,
    properties: {
      symbol: {
        type: "string" as const,
        description: symbolSearchDefT("symbol"),
      },
      type: {
        type: "string" as const,
        enum: ["function", "class", "interface", "type", "const", "all"],
        description: symbolSearchDefT("symbolType"),
        default: "all",
      },
    },
    required: ["symbol"],
  },
  metadata: {
    category: "development" as const,
    subcategory: "analysis" as const,
    priority: "medium" as const,
    complexity: "medium" as const,
    useCases: [
      symbolSearchDefT("useCases.findDefinitions"),
      symbolSearchDefT("useCases.locateDeclarations"),
      symbolSearchDefT("useCases.codeNavigation"),
    ],
    relatedTools: [
      "hev_dev_find_references",
      "hev_dev_go_to_definition",
      "hev_dev_type_info",
    ],
    agentGuidance: symbolSearchDefT("agentGuidance"),
    requiresConfirmation: false,
    riskLevel: "low" as const,
    tags: ["search", "symbols", "code-navigation", "definitions"],
  },
};
