import assert from "node:assert/strict";
import test from "node:test";

import {
  ASSISTANT_DOCTOR_TOOL,
  ASSISTANT_VERIFY_COMPLETION_TOOL,
  createAssistantTools,
} from "../../mcp-server/tools/assistant-tools.ts";

function parseToolText(result: unknown): Record<string, unknown> {
  const payload = result as { content?: Array<{ type?: string; text?: string }> };
  const text = payload.content?.[0]?.text;
  if (typeof text !== "string") {
    throw new Error("expected string");
  }
  return JSON.parse(text) as Record<string, unknown>;
}

function readToolText(result: unknown): string {
  const payload = result as { content?: Array<{ type?: string; text?: string }> };
  const text = payload.content?.[0]?.text;
  if (typeof text !== "string") {
    throw new Error("expected string");
  }
  return text;
}

void test("assistant MCP tools expose AI-facing doctor and verification names", () => {
  const entries = createAssistantTools(process.cwd());
  const names = entries.map((entry) => (entry.definition as { name: string }).name);

  assert.deepEqual(names, ["hev_assistant_doctor", "hev_assistant_verify_completion"]);
  assert.equal(ASSISTANT_DOCTOR_TOOL.metadata.category, "assistant");
  assert.equal(ASSISTANT_VERIFY_COMPLETION_TOOL.metadata.subcategory, "verification");
  assert.equal(ASSISTANT_DOCTOR_TOOL.inputSchema.properties.response_format.default, "compact");
  assert.equal(ASSISTANT_VERIFY_COMPLETION_TOOL.inputSchema.properties.response_format.default, "compact");
});

void test("assistant doctor defaults to compact output", async () => {
  const doctorEntry = createAssistantTools(process.cwd()).find(
    (entry) => (entry.definition as { name: string }).name === "hev_assistant_doctor"
  );
  assert.ok(doctorEntry);

  const text = readToolText(
    await doctorEntry.handler({
      include_runtime: false,
      include_git: false,
    })
  );

  assert.match(text, /^doctor: status=/);
  assert.doesNotMatch(text, /^\{/);
});

void test("assistant verify completion defaults to compact output", async () => {
  const verifyEntry = createAssistantTools(process.cwd()).find(
    (entry) => (entry.definition as { name: string }).name === "hev_assistant_verify_completion"
  );
  assert.ok(verifyEntry);

  const text = readToolText(
    await verifyEntry.handler({
      changed_files: [],
      evidence: ["npm run mcp:build passed"],
      run_syntax: false,
    })
  );

  assert.match(text, /^verify: status=verified /);
  assert.match(text, /scope=explicit/);
  assert.match(text, /evidence=1/);
});

void test("assistant verify completion can report explicit evidence as json without shell checks", async () => {
  const verifyEntry = createAssistantTools(process.cwd()).find(
    (entry) => (entry.definition as { name: string }).name === "hev_assistant_verify_completion"
  );
  assert.ok(verifyEntry);

  const report = parseToolText(
    await verifyEntry.handler({
      changed_files: [],
      evidence: ["npm run mcp:build passed"],
      run_syntax: false,
      response_format: "json",
    })
  );

  assert.equal(report["success"], true);
  assert.equal(report["readyToReport"], true);
  assert.equal(report["status"], "verified");
  assert.deepEqual((report["verification"] as { candidateFiles: string[] }).candidateFiles, []);
  assert.deepEqual((report["verification"] as { checkedFiles: string[] }).checkedFiles, []);
});

void test("assistant verify completion type-checks script tests with scripts tsconfig", async () => {
  const verifyEntry = createAssistantTools(process.cwd()).find(
    (entry) => (entry.definition as { name: string }).name === "hev_assistant_verify_completion"
  );
  assert.ok(verifyEntry);

  const report = parseToolText(
    await verifyEntry.handler({
      changed_files: ["scripts/tests/repair-room-overlay-regressions.test.ts"],
      evidence: ["script test tsconfig regression"],
      run_syntax: true,
      check_ts: true,
      response_format: "json",
      max_files: 1,
    })
  );

  assert.equal(report["success"], true);
  assert.equal(report["readyToReport"], true);
  assert.equal(report["status"], "verified");
  assert.deepEqual((report["verification"] as { checkedFiles: string[] }).checkedFiles, [
    "scripts/tests/repair-room-overlay-regressions.test.ts",
  ]);
});
