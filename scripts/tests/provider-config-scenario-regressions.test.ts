import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { config as chatgptConfig } from "../../src/js/modules/webview/providers/chatgpt/config.ts";
import { config as geminiConfig } from "../../src/js/modules/webview/providers/gemini/config.ts";
import { config as grokConfig } from "../../src/js/modules/webview/providers/grok/config.ts";
import { config as opencodeConfig } from "../../src/js/modules/webview/providers/opencode/config.ts";
import { config as opencodeUiConfig } from "../../src/js/modules/webview/providers/opencode-ui/config.ts";

const configs = [chatgptConfig, geminiConfig, grokConfig, opencodeConfig, opencodeUiConfig];

void test("provider configs expose webview-test scenario metadata", () => {
  for (const config of configs) {
    assert.equal(config.scenarios.webviewTest.id, "webview-test");
    assert.ok(
      (config.scenarios.webviewTest.commands.length ) >= 5,
      `${config.id} should seed webview-test commands`
    );
  }
});

void test("webview-test scenario commands keep stable preset actions", () => {
  const scenario = chatgptConfig.scenarios.webviewTest;

  assert.deepEqual(
    scenario.commands.slice(0, 8).map((command) => [command.id, command.action]),
    [
      ["reset-default-page", "navigate-default"],
      ["sidebar-open", "assert-sidebar-open"],
      ["session-list", "assert-session-list"],
      ["sidebar-close", "assert-sidebar-close"],
      ["prepare-input", "prepare-input"],
      ["disabled-send", "assert-disabled-send"],
      ["drag-drop-surface", "assert-drag-drop-surface"],
      ["inject-count-message", "inject-prompt"],
    ]
  );

  assert.deepEqual(
    scenario.commands.slice(-5).map((command) => [command.id, command.action]),
    [
      ["image-final-bubbles", "assert-final-bubbles"],
      ["generated-image", "assert-generated-image"],
      ["generated-image-archive", "assert-generated-image-archive"],
      ["scroll-behavior", "assert-scroll-behavior"],
      ["provider-capabilities", "assert-provider-capabilities"],
    ]
  );
});

void test("provider config scenario imports stay compatible with tsconfig typecheck", () => {
  const configFiles = [
    "chatgpt/config.ts",
    "gemini/config.ts",
    "grok/config.ts",
    "opencode/config.ts",
    "opencode-ui/config.ts",
  ];

  for (const file of configFiles) {
    const source = fs.readFileSync(
      new URL(`../../src/js/modules/webview/providers/${file}`, import.meta.url),
      "utf8"
    );

    assert.match(
      source,
      /from "\.\.\/shared\/scenarios\.ts";/,
      `${file} should import shared scenarios with a .ts extension`
    );
  }
});

void test("chatgpt, grok, and gemini expose a webview-sync scenario scaffold", () => {
  const syncConfigs = [chatgptConfig, geminiConfig, grokConfig];

  for (const config of syncConfigs) {
    assert.equal(config.scenarios.webviewSync.id, "webview-sync");
    assert.deepEqual(
      config.scenarios.webviewSync.commands.map((command) => command.action),
      [
        "click",
        "wait",
        "check",
        "collect-session-urls",
        "sync-session",
        "navigate",
        "sync-session",
        "refresh-conversation-list",
      ]
    );
    assert.ok(config.webviewSync.sidebar.openButtonSelectors.length > 0);
    assert.ok(config.webviewSync.history.itemSelectors.length > 0);
    assert.ok(config.webviewSync.history.titleSelectors.length > 0);
  }
});

void test("gemini marks webview-sync DOM selectors as estimated until real captures arrive", () => {
  assert.equal(geminiConfig.webviewSync.readiness, "estimated");
  assert.equal(chatgptConfig.webviewSync.readiness, "verified");
  assert.equal(grokConfig.webviewSync.readiness, "verified");
});
