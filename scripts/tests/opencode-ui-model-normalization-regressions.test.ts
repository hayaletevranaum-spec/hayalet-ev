import assert from "node:assert/strict";
import test from "node:test";

import { normalizeModelItems } from "../../src/js/pages/opencode-ui/provider-catalog.ts";

void test("normalizeModelItems supports provider.models object-map payload", () => {
  const payload = {
    providers: [
      {
        id: "openai",
        models: {
          "gpt-5.3-codex": {
            id: "gpt-5.3-codex",
            name: "GPT-5.3 Codex",
          },
          "gpt-5-codex": {
            modelID: "gpt-5-codex",
            name: "GPT-5 Codex",
          },
        },
      },
    ],
  };

  const items = normalizeModelItems(payload);

  assert.equal(items.length, 2);
  assert.deepEqual(items.map((item) => item.value).sort(), [
    "openai:gpt-5-codex",
    "openai:gpt-5.3-codex",
  ]);
});

void test("normalizeModelItems keeps provider and reasoning effort variants", () => {
  const payload = {
    providers: [
      {
        id: "openai",
        models: {
          "gpt-5.3-codex": {
            id: "gpt-5.3-codex",
            name: "GPT-5.3 Codex",
            variants: {
              low: { reasoningEffort: "low" },
              medium: { reasoningEffort: "medium" },
              high: { reasoningEffort: "high" },
              xhigh: { reasoningEffort: "xhigh" },
            },
          },
        },
      },
    ],
  };

  const items = normalizeModelItems(payload);
  assert.equal(items.length, 1);

  const item = items[0] as unknown as { providerId?: string; reasoningEfforts?: string[] };
  assert.equal(item.providerId, "openai");
  assert.deepEqual(item.reasoningEfforts, ["low", "medium", "high", "xhigh"]);
});

void test("normalizeModelItems preserves non-openai variant payloads", () => {
  const payload = {
    providers: [
      {
        id: "google",
        models: {
          "antigravity-claude-opus-4-6-thinking": {
            id: "antigravity-claude-opus-4-6-thinking",
            name: "Claude Opus 4.6 Thinking",
            variants: {
              low: {
                thinkingConfig: {
                  thinkingBudget: 8192,
                },
              },
              max: {
                thinkingConfig: {
                  thinkingBudget: 32768,
                },
              },
            },
          },
          "antigravity-gemini-3-flash": {
            id: "antigravity-gemini-3-flash",
            name: "Gemini 3 Flash",
            variants: {
              minimal: { thinkingLevel: "minimal" },
              medium: { thinkingLevel: "medium" },
            },
          },
        },
      },
    ],
  };

  const items = normalizeModelItems(payload);
  assert.equal(items.length, 2);

  const claudeItem = items.find((item) => item.modelId === "antigravity-claude-opus-4-6-thinking");
  assert.ok(claudeItem);
  assert.deepEqual(
    claudeItem.variantOptions?.map((variant) => [variant.key, variant.subtitle]),
    [
      ["low", "budget:8192"],
      ["max", "budget:32768"],
    ]
  );
  assert.deepEqual(claudeItem.reasoningEfforts, ["low", "max"]);
  assert.deepEqual(claudeItem.variantOptions[1]?.options, {
    thinkingConfig: {
      thinkingBudget: 32768,
    },
  });

  const geminiItem = items.find((item) => item.modelId === "antigravity-gemini-3-flash");
  assert.ok(geminiItem);
  assert.deepEqual(
    geminiItem.variantOptions?.map((variant) => [variant.key, variant.subtitle]),
    [
      ["minimal", "thinking:minimal"],
      ["medium", "thinking:medium"],
    ]
  );
});
