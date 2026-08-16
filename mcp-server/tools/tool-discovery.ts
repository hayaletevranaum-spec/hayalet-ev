import type { ToolResult } from "../types/index-mcp.js";
import type { TranslationParams } from "../../src/types/i18n.js";
import { createMcpTranslatorSync } from "../utils/i18n/index.js";

type McpTranslator = (key: string, params?: TranslationParams) => string;

interface RecommendedTool {
  name: string;
  priority: number;
  reasonKey: string;
}

interface IntentPattern {
  patterns: RegExp[];
  category: string;
  tools: RecommendedTool[];
  workflows: string[];
}

const toolDiscoveryDefinitionTranslator = createMcpTranslatorSync();

function getToolDiscoveryTranslator(): McpTranslator {
  return createMcpTranslatorSync();
}

function toolDiscoveryT(t: McpTranslator, key: string, params?: TranslationParams): string {
  return t(`mcpServer.toolDiscovery.${key}`, params);
}

function toolDiscoveryDefinitionT(key: string, params?: TranslationParams): string {
  return toolDiscoveryDefinitionTranslator(`mcpServer.toolDiscovery.definition.${key}`, params);
}

const INTENT_PATTERNS: IntentPattern[] = [
  {
    patterns: [/typescript.*error/i, /ts.*fix/i, /type.*issue/i],
    category: "typescript",
    tools: [
      {
        name: "hev_dev_typescript_dashboard",
        priority: 1,
        reasonKey: "typescriptErrorAnalysis",
      },
      { name: "hev_dev_safe_batch_refactor", priority: 2, reasonKey: "batchRefactorManyErrors" },
      {
        name: "hev_dev_fix_typescript_batch",
        priority: 3,
        reasonKey: "autoFixUndefinedChecks",
      },
      { name: "hev_dev_typescript_type_helper", priority: 4, reasonKey: "complexTypeConflicts" },
    ],
    workflows: ["typescript-fix-large", "typescript-fix-small"],
  },
  {
    patterns: [/edit.*file/i, /change.*code/i, /modify/i, /update.*file/i],
    category: "fileEditing",
    tools: [
      { name: "hev_fs_read", priority: 1, reasonKey: "alwaysReadFileFirst" },
      { name: "hev_dev_edit_lines", priority: 2, reasonKey: "primarySafeEditor" },
      { name: "hev_dev_check_syntax", priority: 3, reasonKey: "mandatoryValidation" },
      { name: "hev_fs_edit", priority: 4, reasonKey: "simpleStringReplacement" },
    ],
    workflows: ["file-edit-safe"],
  },
  {
    patterns: [/refactor/i, /batch.*change/i, /multiple.*file/i],
    category: "refactoring",
    tools: [
      {
        name: "hev_dev_safe_batch_refactor",
        priority: 1,
        reasonKey: "batchRefactorRollback",
      },
      { name: "hev_dev_find_references", priority: 2, reasonKey: "impactAnalysisFirst" },
      { name: "hev_fs_bash", priority: 3, reasonKey: "gitAndTestingOps" },
    ],
    workflows: ["batch-refactor"],
  },
  {
    patterns: [
      /raw.*cdp/i,
      /cdp.*command/i,
      /cdp.*target/i,
      /devtools.*protocol/i,
      /runtime\.evaluate/i,
      /page\.reload/i,
      /debugger\.pause/i,
    ],
    category: "cdpAdvanced",
    tools: [
      { name: "hev_list_cdp_targets", priority: 1, reasonKey: "inspectAvailableTargets" },
      { name: "hev_get_cdp_target_info", priority: 2, reasonKey: "inspectSpecificTarget" },
      { name: "hev_send_cdp_command", priority: 3, reasonKey: "runRawCdpCommand" },
    ],
    workflows: [],
  },
  {
    patterns: [
      /debug/i,
      /error.*electron/i,
      /app.*crash/i,
      /not.*work/i,
      /blank.*ui/i,
      /ui.*stuck/i,
      /network.*fail/i,
      /console.*error/i,
      /layout.*overflow/i,
      /accessibility.*snapshot/i,
    ],
    category: "debugging",
    tools: [
      { name: "hev_debug_ui_report", priority: 1, reasonKey: "uiDebugFirstLook" },
      { name: "hev_debug_network_requests", priority: 2, reasonKey: "networkFailureTriage" },
      { name: "hev_debug_console_events", priority: 3, reasonKey: "consoleRuntimeCapture" },
      { name: "hev_ui_accessibility_snapshot", priority: 4, reasonKey: "accessibilitySnapshot" },
      { name: "hev_ui_layout_audit", priority: 5, reasonKey: "layoutAudit" },
      { name: "hev_read_electron_logs", priority: 6, reasonKey: "checkLogsFirst" },
      { name: "hev_get_error_hints", priority: 7, reasonKey: "debugHints" },
      { name: "hev_check_electron_connection", priority: 8, reasonKey: "verifyCdpConnection" },
    ],
    workflows: ["debug-electron"],
  },
  {
    patterns: [/ui.*action/i, /click.*flow/i, /type.*flow/i, /repro.*ui/i, /smoke.*ui/i],
    category: "uiActionFlow",
    tools: [
      { name: "hev_ui_accessibility_snapshot", priority: 1, reasonKey: "accessibilitySnapshot" },
      { name: "hev_ui_action_flow", priority: 2, reasonKey: "uiActionRepro" },
      { name: "hev_debug_console_events", priority: 3, reasonKey: "consoleRuntimeCapture" },
      { name: "hev_debug_ui_report", priority: 4, reasonKey: "uiDebugFirstLook" },
    ],
    workflows: ["debug-electron"],
  },
  {
    patterns: [/eslint/i, /lint.*error/i, /code.*quality/i],
    category: "eslint",
    tools: [
      { name: "hev_dev_eslint_dashboard", priority: 1, reasonKey: "analyzeLintDistribution" },
      { name: "hev_dev_lint_file", priority: 3, reasonKey: "lintSingleFile" },
    ],
    workflows: ["eslint-fix-large"],
  },
  {
    patterns: [/memory/i, /remember/i, /context.*store/i, /knowledge.*base/i],
    category: "memory",
    tools: [
      { name: "hev_memory_search", priority: 1, reasonKey: "searchSharedMemoryFirst" },
      { name: "hev_memory_write", priority: 2, reasonKey: "storeDurableMemory" },
      { name: "hev_memory_update", priority: 3, reasonKey: "reviseMemorySafely" },
      { name: "hev_memory_stats", priority: 4, reasonKey: "checkMemoryHealth" },
      { name: "hev_memory_prune", priority: 5, reasonKey: "cleanMemoryBloat" },
      {
        name: "hev_memory_bootstrap_policy",
        priority: 6,
        reasonKey: "refreshPolicyMemory",
      },
    ],
    workflows: [],
  },
  {
    patterns: [/read.*file/i, /show.*file/i, /inspect/i, /view/i],
    category: "fileReading",
    tools: [
      { name: "hev_fs_read", priority: 1, reasonKey: "readWithLineNumbers" },
      { name: "hev_fs_list", priority: 2, reasonKey: "searchInFiles" },
      { name: "hev_dev_search_symbol", priority: 3, reasonKey: "findSymbols" },
    ],
    workflows: [],
  },
  {
    patterns: [/test/i, /run.*test/i, /unittest/i],
    category: "testing",
    tools: [
      { name: "hev_dev_test_run", priority: 1, reasonKey: "runTestSuite" },
      { name: "hev_fs_bash", priority: 2, reasonKey: "customTestCommands" },
      { name: "hev_read_electron_logs", priority: 3, reasonKey: "checkTestLogs" },
    ],
    workflows: [],
  },
  {
    patterns: [/large.*file/i, /big.*file/i, /chunk/i, /50kb/i],
    category: "largeFile",
    tools: [
      {
        name: "hev_fs_start_chunked_session",
        priority: 1,
        reasonKey: "startChunkedWrite",
      },
      { name: "hev_fs_write_chunk", priority: 2, reasonKey: "writeChunksSequentially" },
      { name: "hev_fs_finalize_chunked", priority: 3, reasonKey: "finalizeChunkFlow" },
      { name: "hev_fs_chunk_session_status", priority: 4, reasonKey: "checkChunkProgress" },
    ],
    workflows: ["chunk-write"],
  },
  {
    patterns: [/safe.*edit/i, /validated.*edit/i, /bracket.*check/i, /scope.*safe/i],
    category: "safeEditing",
    tools: [
      { name: "hev_fs_read", priority: 1, reasonKey: "alwaysReadFileFirst" },
      { name: "hev_dev_edit_lines", priority: 2, reasonKey: "safeLineEditor" },
      { name: "hev_dev_check_syntax", priority: 3, reasonKey: "verifySyntaxAfterEdit" },
      { name: "hev_fs_edit", priority: 4, reasonKey: "simpleStringReplacement" },
    ],
    workflows: ["file-edit-safe"],
  },
];

export function handleSuggestTool(args: Record<string, unknown>): ToolResult {
  const t = getToolDiscoveryTranslator();
  const intent = (args["intent"] as string | undefined) ?? "";

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null;

  const context = isRecord(args["context"]) ? args["context"] : undefined;

  if (intent === "") {
    return {
      content: [
        {
          type: "text",
          text: toolDiscoveryT(t, "errors.emptyIntent"),
        },
      ],
      isError: true,
    };
  }

  const matchedPattern = INTENT_PATTERNS.find((pattern) =>
    pattern.patterns.some((compiledPattern) => compiledPattern.test(intent))
  );

  if (!matchedPattern) {
    return {
      content: [
        {
          type: "text",
          text: [
            toolDiscoveryT(t, "fallback.title", { intent }),
            "",
            toolDiscoveryT(t, "fallback.genericTitle"),
            `1. ${toolDiscoveryT(t, "fallback.fileOperations")}`,
            `2. ${toolDiscoveryT(t, "fallback.devTools")}`,
            `3. ${toolDiscoveryT(t, "fallback.debugging")}`,
            "",
            toolDiscoveryT(t, "fallback.listToolsHint"),
          ].join("\n"),
        },
      ],
    };
  }

  const categoryLabel = toolDiscoveryT(t, `categories.${matchedPattern.category}`);
  let response = `${toolDiscoveryT(t, "response.title", { category: categoryLabel })}\n\n`;

  matchedPattern.tools.forEach((tool) => {
    response += `${tool.priority}. **${tool.name}**\n`;
    response += `   ${toolDiscoveryT(t, "response.reasonLine", {
      reason: toolDiscoveryT(t, `reasons.${tool.reasonKey}`),
    })}\n\n`;
  });

  if (context) {
    response += `\n${toolDiscoveryT(t, "contextAdjustment.title")}\n\n`;

    const errorCount = context["errorCount"];
    if (typeof errorCount === "number") {
      if (errorCount > 100) {
        response += `${toolDiscoveryT(t, "contextAdjustment.highErrorCount", { errorCount })}\n`;
      } else if (errorCount < 20) {
        response += `${toolDiscoveryT(t, "contextAdjustment.lowErrorCount", { errorCount })}\n`;
      }
    }

    const fileType = context["fileType"];
    if (typeof fileType === "string" && fileType !== "") {
      response += `${toolDiscoveryT(t, "contextAdjustment.fileType", { fileType })}\n`;
    }
  }

  return {
    content: [{ type: "text", text: response }],
  };
}

export const TOOL_DISCOVERY_DEFINITIONS = [
  {
    name: "hev_suggest_tool",
    description: toolDiscoveryDefinitionT("description"),
    inputSchema: {
      type: "object",
      properties: {
        intent: {
          type: "string",
          description: toolDiscoveryDefinitionT("intent"),
        },
        context: {
          type: "object",
          description: toolDiscoveryDefinitionT("context"),
          properties: {
            fileType: { type: "string", description: toolDiscoveryDefinitionT("fileType") },
            errorCount: { type: "number", description: toolDiscoveryDefinitionT("errorCount") },
            operation: {
              type: "string",
              enum: ["read", "write", "debug", "test", "refactor"],
              description: toolDiscoveryDefinitionT("operation"),
            },
          },
        },
      },
      required: ["intent"],
    },
    metadata: {
      category: "core",
      subcategory: "discovery",
      priority: "critical",
      complexity: "simple",
      useCases: [
        toolDiscoveryDefinitionT("useCases.decideTool"),
        toolDiscoveryDefinitionT("useCases.findPath"),
      ],
      relatedTools: ["hev_list_tools"],
      agentGuidance: toolDiscoveryDefinitionT("agentGuidance"),
      requiresConfirmation: false,
      riskLevel: "low",
      tags: ["discovery", "recommendation", "intent"],
    },
  },
];
