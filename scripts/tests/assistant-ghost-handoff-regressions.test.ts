import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createGhostHandoffRuntimePatch,
  shouldAutoEnableKeepServersOnClose,
} from "../../src/js/pages/assistant/ghost-handoff.ts";

const assistantHtmlPath = "src/pages/assistant.html";
const assistantControllerPath = "src/js/pages/assistant/assistant.ts";

void test("ghost handoff auto-enables keep-servers toggle when checkbox is unchecked", () => {
  const shouldEnable = shouldAutoEnableKeepServersOnClose(false);

  assert.equal(shouldEnable, true);
});

void test("ghost handoff does not rewrite keep-servers toggle when already enabled", () => {
  const shouldEnable = shouldAutoEnableKeepServersOnClose(true);

  assert.equal(shouldEnable, false);
});

void test("ghost handoff runtime patch switches to preparing ghost mode", () => {
  const patch = createGhostHandoffRuntimePatch("wf-ghost-001");

  assert.deepEqual(patch, {
    workflowSessionId: "wf-ghost-001",
    desiredMode: "ghost-agent",
    phase: "preparing-handoff",
  });
});

void test("ghost handoff patch remains transition-only", () => {
  const patch = createGhostHandoffRuntimePatch("wf-ghost-002");

  assert.equal("provider" in patch, false);
  assert.equal("autoStart" in patch, false);
  assert.equal("port" in patch, false);
});

void test("assistant page leaves ghost-agent handoff to the runtime mode controller", () => {
  const assistantHtml = readFileSync(assistantHtmlPath, "utf8");
  const assistantController = readFileSync(assistantControllerPath, "utf8");

  assert.doesNotMatch(assistantHtml, /assistant-ghost-agent-btn/);
  assert.doesNotMatch(assistantHtml, /data-assistant-mode-option="ghost-agent"/);
  assert.doesNotMatch(assistantController, /assistant-ghost-agent-btn/);
  assert.doesNotMatch(assistantController, /ghostAgentBtn/);
  assert.match(
    readFileSync("src/js/pages/assistant/assistant-runtime.ts", "utf8"),
    /AssistantRuntimeMode = "terminal" \| "soft" \| "ghost-agent"/
  );
});
