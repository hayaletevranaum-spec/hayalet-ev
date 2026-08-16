import assert from "node:assert/strict";
import test from "node:test";

import { createCdpTools } from "../../mcp-server/core/handlers/cdp-handlers.ts";

void test("cdp tool registry includes MCP panel toggle automation tool", () => {
  const entries = createCdpTools();
  const names = entries.map((entry) => (entry as { definition: { name: string } }).definition.name);

  assert.ok(names.includes("hev_toggle_mcp_panel_servers"));
});
