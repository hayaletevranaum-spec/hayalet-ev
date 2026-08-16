import { takeAndroidScreenshot } from "../../tools/android-tools.js";
import type { ToolContext, ToolEntry } from "../registry.js";

export function createAndroidTools(context: ToolContext): ToolEntry[] {
  return [
    {
      definition: {
        name: "hev_take_android_screenshot",
        description:
          "Capture a debug screenshot from a connected Android device via ADB screencap.",
        inputSchema: {
          type: "object",
          properties: {
            deviceId: {
              type: "string",
              description:
                "Optional ADB serial. Required when multiple Android devices are connected.",
            },
            savePath: {
              type: "string",
              description:
                "Optional local PNG output path. Relative paths resolve from the project root.",
            },
            adbPath: {
              type: "string",
              description:
                "Optional explicit adb executable path when platform-tools is not on PATH.",
            },
            timeoutMs: {
              type: "number",
              description: "Optional command timeout in milliseconds.",
              default: 15000,
            },
            strategy: {
              type: "string",
              enum: ["auto", "exec-out", "file-pull"],
              description:
                "Capture strategy. auto prefers exec-out and falls back to device file pull.",
              default: "auto",
            },
          },
        },
        metadata: {
          category: "debug",
          subcategory: "android",
          priority: "high",
          complexity: "simple",
          useCases: [
            "Inspect Android companion UI during debugging.",
            "Capture device state without adding app-side MediaProjection permissions.",
            "Verify Android screens from MCP-driven workflows.",
          ],
          relatedTools: ["hev_mcp_health"],
          agentGuidance:
            "Use for debug-only Android screen access. Pass deviceId when adb lists multiple devices.",
          requiresConfirmation: false,
          riskLevel: "low",
          tags: ["android", "adb", "screenshot", "debug"],
        },
      },
      handler: async (args): Promise<unknown> =>
        await takeAndroidScreenshot(context.PROJECT_ROOT, args ?? {}),
    },
  ];
}
