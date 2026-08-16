import assert from "node:assert/strict";
import test from "node:test";

import { buildMessageRequestBody } from "../../src/js/pages/opencode-ui/composer-actions.ts";
import {
  buildInteractionSystemPrompt,
  clearConsumedInteractionMode,
} from "../../src/js/pages/opencode-ui/interaction-mode.ts";
import {
  extractAssistantMessageContent,
  extractLatestAssistantTextPart,
} from "../../src/js/pages/opencode-ui/message-content.ts";

void test("buildMessageRequestBody sends model as provider+model object", () => {
  const body = buildMessageRequestBody({
    text: "merhaba",
    modelId: "gpt-5.3-codex",
    providerId: "openai",
    agentId: "sisyphus",
  });

  assert.deepEqual(body, {
    parts: [{ type: "text", text: "merhaba" }],
    model: {
      providerID: "openai",
      modelID: "gpt-5.3-codex",
    },
    agent: "sisyphus",
  });
});

void test("buildMessageRequestBody adds reasoning effort when selected", () => {
  const body = buildMessageRequestBody({
    text: "test",
    modelId: "gpt-5.3-codex",
    providerId: "openai",
    reasoningEffort: "xhigh",
  });

  assert.deepEqual(body, {
    parts: [{ type: "text", text: "test" }],
    model: {
      providerID: "openai",
      modelID: "gpt-5.3-codex",
      options: {
        reasoningEffort: "xhigh",
      },
    },
  });
});

void test("buildMessageRequestBody preserves provider-specific variant options", () => {
  const body = buildMessageRequestBody({
    text: "anthropic thinking test",
    modelId: "antigravity-claude-opus-4-6-thinking",
    providerId: "google",
    reasoningEffort: "max",
    modelOptions: {
      thinkingConfig: {
        thinkingBudget: 32768,
      },
    },
  });

  assert.deepEqual(body, {
    parts: [{ type: "text", text: "anthropic thinking test" }],
    model: {
      providerID: "google",
      modelID: "antigravity-claude-opus-4-6-thinking",
      options: {
        thinkingConfig: {
          thinkingBudget: 32768,
        },
      },
    },
  });
});

void test("buildMessageRequestBody appends staged attachments as file parts", () => {
  const body = buildMessageRequestBody({
    text: "ekleri incele",
    modelId: null,
    providerId: null,
    attachments: [
      {
        id: "att_1",
        name: "note.txt",
        mimeType: "text/plain",
        base64: "bm90ZQ==",
        size: 4,
        source: "clipboard",
      },
    ],
  });

  assert.deepEqual(body, {
    parts: [
      { type: "text", text: "ekleri incele" },
      {
        type: "file",
        filename: "note.txt",
        name: "note.txt",
        mime: "text/plain",
        media_type: "text/plain",
        url: "data:text/plain;base64,bm90ZQ==",
        data: "bm90ZQ==",
        base64: "bm90ZQ==",
      },
    ],
  });
});

void test("buildMessageRequestBody includes invisible system prompt when provided", () => {
  const body = buildMessageRequestBody({
    text: "plani derinlestir",
    modelId: null,
    providerId: null,
    system: "local interaction prompt",
  });

  assert.deepEqual(body, {
    parts: [{ type: "text", text: "plani derinlestir" }],
    system: "local interaction prompt",
  });
});

void test("buildInteractionSystemPrompt includes selected pack metadata and question bank", () => {
  const prompt = buildInteractionSystemPrompt({
    mode: "plan-harder-local",
    protocolText: "# protocol",
    manifestText: '{"id":"plan-harder-local"}',
    promptText: "# prompt",
    questionsText: '{"questions":[{"id":"scope"}]}',
  });

  assert.match(prompt, /The user manually selected the interaction mode `plan-harder-local`/);
  assert.match(prompt, /payload `packId` to `plan-harder-local`/);
  assert.match(prompt, /=== Pack Questions ===/);
  assert.match(prompt, /"id": "scope"/);
});

void test("extractLatestAssistantTextPart ignores reasoning and step parts", () => {
  const text = extractLatestAssistantTextPart({
    parts: [
      { type: "step-start", snapshot: "abc123" },
      { type: "reasoning", text: "hidden" },
      { type: "text", text: "visible [rovo-ui:v1:token]" },
      { type: "step-finish", reason: "stop" },
    ],
  });

  assert.equal(text, "visible [rovo-ui:v1:token]");
});

void test("extractAssistantMessageContent keeps structured assistant parts as semantic blocks", () => {
  const content = extractAssistantMessageContent({
    parts: [
      { type: "reasoning", text: "Inspect the message timeline." },
      { type: "patch", files: ["/workspace/project/src/js/pages/opencode-ui/chat-utils.ts"] },
    ],
  });

  assert.equal(content.blocks.length, 2);
  assert.equal(content.blocks[0]?.kind, "reasoning");
  assert.equal(content.blocks[1]?.kind, "patch");
  assert.equal(content.blocks[1].items?.[0], "chat-utils.ts");
  assert.match(content.text, /Inspect the message timeline/u);
});

void test("clearConsumedInteractionMode resets only the mode that was used", () => {
  const runtime = { activeInteractionMode: "plan-harder-local" as const };

  assert.equal(clearConsumedInteractionMode(runtime, "change-approval"), false);
  assert.equal(runtime.activeInteractionMode, "plan-harder-local");
  assert.equal(clearConsumedInteractionMode(runtime, "plan-harder-local"), true);
  assert.equal(runtime.activeInteractionMode, "off");
});
