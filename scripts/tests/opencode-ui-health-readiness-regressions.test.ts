import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

void test("opencode-ui health readiness treats empty mcp snapshot as settled", () => {
  const content = readFileSync("src/js/pages/opencode-ui/health.ts", "utf8");

  assert.match(content, /if \(!mcpServers \|\| typeof mcpServers !== "object"\) {\s*return true;\s*}/);
  assert.match(content, /if \(entries\.length === 0\) {\s*return true;\s*}/);
});

void test("opencode-ui mcp readiness does not block on pending user review", () => {
  const content = readFileSync("src/js/pages/opencode-ui/health.ts", "utf8");

  assert.doesNotMatch(content, /"pending user review"/);
});
