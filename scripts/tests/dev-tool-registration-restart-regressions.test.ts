import assert from "node:assert/strict";
import test from "node:test";

import { TOOL_REGISTRATION_HELPER_TOOL } from "../../mcp-server/tools/dev/tool-registration-helper.ts";

void test("tool registration helper exposes auto build/restart option", () => {
  const schema = TOOL_REGISTRATION_HELPER_TOOL.inputSchema as {
    properties?: Record<string, unknown>;
  };
  const properties: Record<string, unknown> = schema.properties ?? {};

  assert.ok(properties["auto_build_restart"] != null);

  const restartProp = properties["auto_build_restart"] as { default?: unknown };
  assert.equal(restartProp.default, true);
});
