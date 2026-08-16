import {
  debugConsoleEvents,
  debugFailureBundle,
  debugNetworkRequests,
  debugUiReport,
  getCdpTargetInfo,
  inspectElement,
  queryElements,
  uiAccessibilitySnapshot,
  uiLayoutAudit,
} from "../../../tools/cdp-tools.js";
import { createMcpTranslatorSync } from "../../../utils/i18n/index.js";
import type { ToolEntry } from "../../registry.js";

const cdpToolDefinitionTranslator = createMcpTranslatorSync();

function cdpToolT(key: string): string {
  return cdpToolDefinitionTranslator(`mcpServer.fs.toolDefinitions.cdp.${key}`);
}

export function createCdpInspectionTools(): ToolEntry[] {
  return [
    {
      definition: {
        name: "hev_debug_ui_report",
        description: cdpToolT("debugUiReport.description"),
        inputSchema: {
          type: "object",
          properties: {
            targetId: { type: "string", description: cdpToolT("common.targetId") },
            port: { type: "number", description: cdpToolT("common.port") },
            sampleMs: {
              type: "number",
              description: cdpToolT("debugUiReport.sampleMs"),
              default: 1000,
            },
            limit: { type: "number", description: cdpToolT("common.limit"), default: 30 },
            includeScreenshot: {
              type: "boolean",
              description: cdpToolT("debugUiReport.includeScreenshot"),
              default: true,
            },
            screenshotPath: {
              type: "string",
              description: cdpToolT("debugUiReport.screenshotPath"),
            },
          },
        },
        metadata: {
          category: "electron",
          subcategory: "cdp-debug",
          priority: "critical",
          complexity: "medium",
          useCases: [
            cdpToolT("debugUiReport.useCases.firstLook"),
            cdpToolT("debugUiReport.useCases.blankUi"),
            cdpToolT("debugUiReport.useCases.failureTriage"),
          ],
          relatedTools: [
            "hev_debug_network_requests",
            "hev_debug_console_events",
            "hev_ui_accessibility_snapshot",
            "hev_ui_layout_audit",
            "hev_ui_action_flow",
          ],
          agentGuidance: cdpToolT("debugUiReport.agentGuidance"),
          requiresConfirmation: false,
          riskLevel: "low",
          tags: ["cdp", "debug", "ui-report", "triage"],
        },
      },
      handler: async (args) => await debugUiReport(args ?? {}),
    },
    {
      definition: {
        name: "hev_debug_network_requests",
        description: cdpToolT("debugNetworkRequests.description"),
        inputSchema: {
          type: "object",
          properties: {
            targetId: { type: "string", description: cdpToolT("common.targetId") },
            port: { type: "number", description: cdpToolT("common.port") },
            sampleMs: {
              type: "number",
              description: cdpToolT("debugNetworkRequests.sampleMs"),
              default: 1000,
            },
            limit: { type: "number", description: cdpToolT("common.limit"), default: 40 },
            reload: {
              type: "boolean",
              description: cdpToolT("debugNetworkRequests.reload"),
              default: false,
            },
          },
        },
        metadata: {
          category: "electron",
          subcategory: "cdp-debug",
          priority: "high",
          complexity: "medium",
          useCases: [
            cdpToolT("debugNetworkRequests.useCases.failedRequests"),
            cdpToolT("debugNetworkRequests.useCases.blankUi"),
            cdpToolT("debugNetworkRequests.useCases.reloadCapture"),
          ],
          relatedTools: ["hev_debug_ui_report", "hev_debug_console_events"],
          agentGuidance: cdpToolT("debugNetworkRequests.agentGuidance"),
          requiresConfirmation: false,
          riskLevel: "low",
          tags: ["cdp", "network", "requests", "debug"],
        },
      },
      handler: async (args) => await debugNetworkRequests(args ?? {}),
    },
    {
      definition: {
        name: "hev_debug_console_events",
        description: cdpToolT("debugConsoleEvents.description"),
        inputSchema: {
          type: "object",
          properties: {
            targetId: { type: "string", description: cdpToolT("common.targetId") },
            port: { type: "number", description: cdpToolT("common.port") },
            sampleMs: {
              type: "number",
              description: cdpToolT("debugConsoleEvents.sampleMs"),
              default: 1000,
            },
            limit: { type: "number", description: cdpToolT("common.limit"), default: 50 },
          },
        },
        metadata: {
          category: "electron",
          subcategory: "cdp-debug",
          priority: "high",
          complexity: "simple",
          useCases: [
            cdpToolT("debugConsoleEvents.useCases.runtimeErrors"),
            cdpToolT("debugConsoleEvents.useCases.stackTraces"),
            cdpToolT("debugConsoleEvents.useCases.actionCorrelation"),
          ],
          relatedTools: ["hev_debug_ui_report", "hev_ui_action_flow"],
          agentGuidance: cdpToolT("debugConsoleEvents.agentGuidance"),
          requiresConfirmation: false,
          riskLevel: "low",
          tags: ["cdp", "console", "runtime", "debug"],
        },
      },
      handler: async (args) => await debugConsoleEvents(args ?? {}),
    },
    {
      definition: {
        name: "hev_ui_accessibility_snapshot",
        description: cdpToolT("uiAccessibilitySnapshot.description"),
        inputSchema: {
          type: "object",
          properties: {
            targetId: { type: "string", description: cdpToolT("common.targetId") },
            port: { type: "number", description: cdpToolT("common.port") },
            limit: { type: "number", description: cdpToolT("common.limit"), default: 80 },
          },
        },
        metadata: {
          category: "electron",
          subcategory: "cdp-debug",
          priority: "high",
          complexity: "simple",
          useCases: [
            cdpToolT("uiAccessibilitySnapshot.useCases.visibleControls"),
            cdpToolT("uiAccessibilitySnapshot.useCases.modalState"),
            cdpToolT("uiAccessibilitySnapshot.useCases.selectorFreeInspection"),
          ],
          relatedTools: ["hev_debug_ui_report", "hev_ui_action_flow", "hev_query_elements"],
          agentGuidance: cdpToolT("uiAccessibilitySnapshot.agentGuidance"),
          requiresConfirmation: false,
          riskLevel: "low",
          tags: ["cdp", "accessibility", "snapshot", "ui"],
        },
      },
      handler: async (args) => await uiAccessibilitySnapshot(args ?? {}),
    },
    {
      definition: {
        name: "hev_ui_layout_audit",
        description: cdpToolT("uiLayoutAudit.description"),
        inputSchema: {
          type: "object",
          properties: {
            targetId: { type: "string", description: cdpToolT("common.targetId") },
            port: { type: "number", description: cdpToolT("common.port") },
            limit: { type: "number", description: cdpToolT("common.limit"), default: 20 },
          },
        },
        metadata: {
          category: "electron",
          subcategory: "cdp-debug",
          priority: "high",
          complexity: "medium",
          useCases: [
            cdpToolT("uiLayoutAudit.useCases.overflow"),
            cdpToolT("uiLayoutAudit.useCases.overlap"),
            cdpToolT("uiLayoutAudit.useCases.mobileDesktop"),
          ],
          relatedTools: ["hev_debug_ui_report", "hev_inspect_element", "hev_take_cdp_screenshot"],
          agentGuidance: cdpToolT("uiLayoutAudit.agentGuidance"),
          requiresConfirmation: false,
          riskLevel: "low",
          tags: ["cdp", "layout", "overflow", "ui"],
        },
      },
      handler: async (args) => await uiLayoutAudit(args ?? {}),
    },
    {
      definition: {
        name: "hev_debug_failure_bundle",
        description: cdpToolT("debugFailureBundle.description"),
        inputSchema: {
          type: "object",
          properties: {
            targetId: { type: "string", description: cdpToolT("common.targetId") },
            port: { type: "number", description: cdpToolT("common.port") },
            sampleMs: {
              type: "number",
              description: cdpToolT("debugUiReport.sampleMs"),
              default: 1000,
            },
            limit: { type: "number", description: cdpToolT("common.limit"), default: 30 },
            screenshotPath: {
              type: "string",
              description: cdpToolT("debugFailureBundle.screenshotPath"),
            },
          },
        },
        metadata: {
          category: "electron",
          subcategory: "cdp-debug",
          priority: "high",
          complexity: "medium",
          useCases: [
            cdpToolT("debugFailureBundle.useCases.testFailure"),
            cdpToolT("debugFailureBundle.useCases.shareableEvidence"),
          ],
          relatedTools: ["hev_debug_ui_report", "hev_take_cdp_screenshot"],
          agentGuidance: cdpToolT("debugFailureBundle.agentGuidance"),
          requiresConfirmation: false,
          riskLevel: "low",
          tags: ["cdp", "failure", "bundle", "debug"],
        },
      },
      handler: async (args) => await debugFailureBundle(args ?? {}),
    },
    {
      definition: {
        name: "hev_get_cdp_target_info",
        description: cdpToolT("getCdpTargetInfo.description"),
        inputSchema: {
          type: "object",
          properties: {
            targetId: { type: "string", description: cdpToolT("getCdpTargetInfo.targetId") },
            port: { type: "number", description: cdpToolT("getCdpTargetInfo.port") },
          },
          required: ["targetId"],
        },
        metadata: {
          category: "electron",
          subcategory: "cdp-inspection",
          priority: "medium",
          complexity: "simple",
          useCases: [
            cdpToolT("getCdpTargetInfo.useCases.targetInspection"),
            cdpToolT("getCdpTargetInfo.useCases.domainReference"),
            cdpToolT("getCdpTargetInfo.useCases.targetVerification"),
          ],
          relatedTools: ["hev_list_cdp_targets", "hev_send_cdp_command"],
          agentGuidance: cdpToolT("getCdpTargetInfo.agentGuidance"),
          requiresConfirmation: false,
          riskLevel: "low",
          tags: ["cdp", "target", "inspection", "reference"],
        },
      },
      handler: async (args) => await getCdpTargetInfo(args ?? {}),
    },
    {
      definition: {
        name: "hev_inspect_element",
        description: cdpToolT("inspectElement.description"),
        inputSchema: {
          type: "object",
          properties: {
            selector: { type: "string", description: cdpToolT("inspectElement.selector") },
            port: { type: "number", description: cdpToolT("inspectElement.port") },
          },
          required: ["selector"],
        },
        metadata: {
          category: "electron",
          subcategory: "cdp-inspection",
          priority: "high",
          complexity: "simple",
          useCases: [
            cdpToolT("inspectElement.useCases.elementDebugging"),
            cdpToolT("inspectElement.useCases.layoutInspection"),
            cdpToolT("inspectElement.useCases.visibilityCheck"),
          ],
          relatedTools: ["hev_query_elements", "hev_send_command_to_electron"],
          agentGuidance: cdpToolT("inspectElement.agentGuidance"),
          requiresConfirmation: false,
          riskLevel: "low",
          tags: ["cdp", "inspect", "element", "debugging"],
        },
      },
      handler: async (args) => await inspectElement(args ?? {}),
    },
    {
      definition: {
        name: "hev_query_elements",
        description: cdpToolT("queryElements.description"),
        inputSchema: {
          type: "object",
          properties: {
            selector: { type: "string", description: cdpToolT("queryElements.selector") },
            port: { type: "number", description: cdpToolT("queryElements.port") },
            limit: {
              type: "number",
              description: cdpToolT("queryElements.limit"),
              default: 20,
            },
          },
          required: ["selector"],
        },
        metadata: {
          category: "electron",
          subcategory: "cdp-inspection",
          priority: "medium",
          complexity: "simple",
          useCases: [
            cdpToolT("queryElements.useCases.multipleElementsSearch"),
            cdpToolT("queryElements.useCases.elementCounting"),
            cdpToolT("queryElements.useCases.selectorValidation"),
          ],
          relatedTools: ["hev_inspect_element", "hev_send_command_to_electron"],
          agentGuidance: cdpToolT("queryElements.agentGuidance"),
          requiresConfirmation: false,
          riskLevel: "low",
          tags: ["cdp", "query", "elements", "search"],
        },
      },
      handler: async (args) => await queryElements(args ?? {}),
    },
  ];
}
