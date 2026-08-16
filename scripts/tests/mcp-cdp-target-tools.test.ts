import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { ToolEntry } from "../../mcp-server/core/registry.ts";
import { createCdpTools } from "../../mcp-server/core/handlers/cdp-handlers.ts";
import { handleSuggestTool } from "../../mcp-server/tools/tool-discovery.ts";
import {
  getCdpTargetInfo,
  sendCdpCommand,
  uiActionFlow,
} from "../../mcp-server/tools/cdp-tools.ts";

interface TestDef {
  name: string;
  inputSchema: {
    type: string;
    properties?: Record<string, { type?: string; enum?: string[] }>;
  };
}

void test("cdp tool registry includes target-aware CDP tools", () => {
  const entries = createCdpTools();
  const names = entries.map((entry: ToolEntry) => (entry.definition as TestDef).name);

  assert.ok(names.includes("hev_list_cdp_instances"));
  assert.ok(names.includes("hev_list_cdp_targets"));
  assert.ok(names.includes("hev_get_cdp_target_info"));
  assert.ok(names.includes("hev_send_cdp_command"));
  assert.ok(names.includes("hev_debug_ui_report"));
  assert.ok(names.includes("hev_debug_network_requests"));
  assert.ok(names.includes("hev_debug_console_events"));
  assert.ok(names.includes("hev_ui_accessibility_snapshot"));
  assert.ok(names.includes("hev_ui_layout_audit"));
  assert.ok(names.includes("hev_ui_action_flow"));
  assert.ok(names.includes("hev_debug_failure_bundle"));
});

void test("cdp tool schemas expose port-aware multi-instance routing", () => {
  const entries = createCdpTools();
  const definitions = new Map<string, TestDef>(
    entries.map((entry: ToolEntry) => {
      const def = entry.definition as TestDef;
      return [def.name, def] as const;
    })
  );

  const listInstances = definitions.get("hev_list_cdp_instances");
  const checkConnection = definitions.get("hev_check_electron_connection");
  const listTargets = definitions.get("hev_list_cdp_targets");
  const sendCommand = definitions.get("hev_send_command_to_electron");
  const sendRaw = definitions.get("hev_send_cdp_command");
  const screenshot = definitions.get("hev_take_cdp_screenshot");
  const targetInfo = definitions.get("hev_get_cdp_target_info");
  const inspectElement = definitions.get("hev_inspect_element");
  const queryElements = definitions.get("hev_query_elements");
  const toggleMcpPanel = definitions.get("hev_toggle_mcp_panel_servers");
  const uiReport = definitions.get("hev_debug_ui_report");
  const networkRequests = definitions.get("hev_debug_network_requests");
  const consoleEvents = definitions.get("hev_debug_console_events");
  const accessibilitySnapshot = definitions.get("hev_ui_accessibility_snapshot");
  const layoutAudit = definitions.get("hev_ui_layout_audit");
  const actionFlow = definitions.get("hev_ui_action_flow");
  const failureBundle = definitions.get("hev_debug_failure_bundle");

  assert.ok(listInstances !== undefined);
  const listInstancesProps = listInstances.inputSchema.properties;
  assert.ok(listInstancesProps !== undefined);
  assert.equal(listInstancesProps["startPort"]?.type, "number");
  assert.equal(listInstancesProps["endPort"]?.type, "number");
  assert.equal(checkConnection?.inputSchema.properties?.["port"]?.type, "number");
  assert.equal(listTargets?.inputSchema.properties?.["port"]?.type, "number");
  assert.equal(sendCommand?.inputSchema.properties?.["port"]?.type, "number");
  assert.equal(sendRaw?.inputSchema.properties?.["port"]?.type, "number");
  assert.equal(screenshot?.inputSchema.properties?.["port"]?.type, "number");
  assert.equal(targetInfo?.inputSchema.properties?.["port"]?.type, "number");
  assert.equal(inspectElement?.inputSchema.properties?.["port"]?.type, "number");
  assert.equal(queryElements?.inputSchema.properties?.["port"]?.type, "number");
  assert.equal(toggleMcpPanel?.inputSchema.properties?.["port"]?.type, "number");
  assert.equal(uiReport?.inputSchema.properties?.["port"]?.type, "number");
  assert.equal(networkRequests?.inputSchema.properties?.["port"]?.type, "number");
  assert.equal(consoleEvents?.inputSchema.properties?.["port"]?.type, "number");
  assert.equal(accessibilitySnapshot?.inputSchema.properties?.["port"]?.type, "number");
  assert.equal(layoutAudit?.inputSchema.properties?.["port"]?.type, "number");
  assert.equal(actionFlow?.inputSchema.properties?.["port"]?.type, "number");
  assert.equal(failureBundle?.inputSchema.properties?.["port"]?.type, "number");
  if (typeof uiReport !== "undefined") {
    const p = uiReport.inputSchema.properties;
    if (typeof p !== "undefined") {
      assert.equal(p["targetId"]?.type, "string");
    }
  }
  if (typeof networkRequests !== "undefined") {
    const p = networkRequests.inputSchema.properties;
    if (typeof p !== "undefined") {
      assert.equal(p["reload"]?.type, "boolean");
    }
  }
  if (typeof actionFlow !== "undefined") {
    const p = actionFlow.inputSchema.properties;
    if (typeof p !== "undefined") {
      assert.equal(p["actions"]?.type, "array");
    }
  }
});

void test("tool discovery recommends advanced CDP tools for raw CDP intents", () => {
  const result = handleSuggestTool({ intent: "send raw cdp command to a target" });
  const text = result.content[0]?.type === "text" ? result.content[0].text : "";

  assert.match(text, /hev_list_cdp_targets/);
  assert.match(text, /hev_get_cdp_target_info/);
  assert.match(text, /hev_send_cdp_command/);
});

void test("tool discovery recommends interpreted UI debug tools for UI failure intents", () => {
  const result = handleSuggestTool({ intent: "debug blank ui with console error and network fail" });
  const text = result.content[0]?.type === "text" ? result.content[0].text : "";

  assert.match(text, /hev_debug_ui_report/);
  assert.match(text, /hev_debug_network_requests/);
  assert.match(text, /hev_debug_console_events/);
  assert.match(text, /hev_ui_accessibility_snapshot/);
  assert.match(text, /hev_ui_layout_audit/);
});

void test("tool discovery recommends UI action flow for repro intents", () => {
  const result = handleSuggestTool({ intent: "run ui action click flow to repro bug" });
  const text = result.content[0]?.type === "text" ? result.content[0].text : "";

  assert.match(text, /hev_ui_accessibility_snapshot/);
  assert.match(text, /hev_ui_action_flow/);
  assert.match(text, /hev_debug_console_events/);
});

void test("target info requires a target id", async () => {
  const result = await getCdpTargetInfo({});

  assert.equal(result.isError, true);
});

void test("raw CDP command requires domain and method", async () => {
  const result = await sendCdpCommand({});

  assert.equal(result.isError, true);
});

void test("ui action flow requires at least one action", async () => {
  const result = await uiActionFlow({});

  assert.equal(result.isError, true);
});

void test("packaged electron defaults to the next CDP port while dev keeps 9222", async () => {
  const projectRoot = process.cwd();
  const mainSource = await readFile(join(projectRoot, "electron", "main.ts"), "utf8");
  const packagedWrapperSource = await readFile(
    join(projectRoot, "electron", "packaged-wrapper-main.ts"),
    "utf8"
  );

  assert.match(mainSource, /process\.env\["CDP_PORT"\] \?\? \(app\.isPackaged \? 9223 : 9222\)/);
  assert.match(packagedWrapperSource, /return cdpPort !== "" \? cdpPort : "9223"/);
  assert.match(
    packagedWrapperSource,
    /args\.push\(`--remote-debugging-port=\$\{resolvePackagedCdpPort\(\)\}`\)/
  );
});
