import { createMcpTranslatorSync } from "../../utils/i18n/index.js";

function toolRegistrationDefT(key: string): string {
  return createMcpTranslatorSync()(`mcpServer.devTools.toolRegistration.definition.${key}`);
}

export const TOOL_REGISTRATION_HELPER_TOOL = {
  name: "hev_dev_register_tool",
  description: toolRegistrationDefT("description"),
  inputSchema: {
    type: "object" as const,
    properties: {
      tool_name: {
        type: "string" as const,
        description: toolRegistrationDefT("toolName"),
      },
      tool_description: {
        type: "string" as const,
        description: toolRegistrationDefT("toolDescription"),
      },
      function_name: {
        type: "string" as const,
        description: toolRegistrationDefT("functionName"),
      },
      tool_constant: {
        type: "string" as const,
        description: toolRegistrationDefT("toolConstant"),
      },
      auto_add_to: {
        type: "array" as const,
        items: { type: "string" as const },
        description: toolRegistrationDefT("autoAddTo"),
        default: ["dev-index", "dev-handlers"],
      },
      test_immediately: {
        type: "boolean" as const,
        description: toolRegistrationDefT("testImmediately"),
        default: true,
      },
      auto_build_restart: {
        type: "boolean" as const,
        description: toolRegistrationDefT("autoBuildRestart"),
        default: true,
      },
      dry_run: {
        type: "boolean" as const,
        description: toolRegistrationDefT("dryRun"),
        default: false,
      },
    },
    required: ["tool_name", "tool_description", "function_name", "tool_constant"],
  },
  metadata: {
    category: "development",
    subcategory: "tooling",
    priority: "medium",
    complexity: "medium",
    useCases: [
      toolRegistrationDefT("useCases.registerTool"),
      toolRegistrationDefT("useCases.autoAdd"),
      toolRegistrationDefT("useCases.streamlineWorkflow"),
    ],
    relatedTools: ["hev_dev_check_syntax", "hev_dev_lint_file"],
    agentGuidance: toolRegistrationDefT("agentGuidance"),
    requiresConfirmation: true,
    riskLevel: "medium",
    tags: ["mcp", "tool-registration", "development"],
  },
};
