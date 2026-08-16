import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  flattenSelectors,
  parseProviderConfig,
} from "../../mcp-server/utils/provider-config.ts";
import { config as grokConfig } from "../../src/js/modules/webview/providers/grok/config.ts";

void test("grok input selector includes ProseMirror composer root", () => {
  assert.equal(grokConfig.selectors.inputField.includes(".ProseMirror"), true);
  assert.equal(grokConfig.selectors.inputField.includes('contenteditable="true"'), true);
});

void test("grok critical selectors include current TR/EN placeholder nodes", () => {
  assert.equal(grokConfig.criticalSelectors.includes('p[data-placeholder="Ask Grok"]'), true);
  assert.equal(grokConfig.criticalSelectors.includes('p[data-placeholder="Grok\'a Sor"]'), true);
});

void test("priority-sensitive DOM consumers use runtime selector candidate resolution", () => {
  const messageSender = readFileSync("src/js/modules/webview/message-sender.ts", "utf8");
  const messageInjection = readFileSync(
    "src/js/modules/webview/methods/message/injection.ts",
    "utf8"
  );
  const messageXdotools = readFileSync(
    "src/js/modules/webview/methods/message/xdotools.ts",
    "utf8"
  );
  const fileInjection = readFileSync("src/js/modules/webview/methods/file/injection.ts", "utf8");
  const fileDragdrop = readFileSync("src/js/modules/webview/methods/file/dragdrop.ts", "utf8");
  const probeBuilder = readFileSync("src/js/modules/traffic/probe-script-builder.ts", "utf8");

  assert.ok(messageSender.includes("resolveSelectorCandidates("));
  assert.ok(messageInjection.includes("getRuntimeSelectorCandidates("));
  assert.ok(messageXdotools.includes("getRuntimeSelectorCandidates("));
  assert.ok(fileInjection.includes("getRuntimeSelectorCandidates("));
  assert.ok(fileDragdrop.includes("getRuntimeSelectorCandidates("));
  assert.ok(probeBuilder.includes("resolveSelectorCandidates("));
});

void test("mcp provider config parser preserves selector matrix metadata while keeping flat output", () => {
  const parsed = parseProviderConfig(process.cwd(), "grok");

  assert.ok(parsed, "grok provider config should parse");
  assert.equal(typeof parsed.selectors["sendButton"], "string");
  assert.equal(typeof parsed.selectorMatrix?.selectors?.["sendButton"]?.tr, "string");
  assert.equal(typeof parsed.selectorMatrix?.selectors?.["sendButton"]?.en, "string");

  const flattened = flattenSelectors(parsed);
  assert.equal(
    flattened.some(
      (item) =>
        item.category === "selectorMatrix" &&
        item.key === "sendButton.tr" &&
        item.selector === grokConfig.selectorMatrix.selectors["sendButton"].tr
    ),
    true
  );
});
