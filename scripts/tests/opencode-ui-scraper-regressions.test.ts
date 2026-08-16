import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { scrapeMessages } from "../../src/js/modules/webview/providers/opencode-ui/scraper.ts";

type MockNode = {
  classList?: {
    contains: (token: string) => boolean;
  };
  innerText?: string;
  textContent?: string;
  querySelector: (selector: string) => unknown;
};

function createBubble(text: string): MockNode {
  return {
    innerText: text,
    textContent: text,
    querySelector: () => null,
  };
}

function createMessage(role: "user" | "assistant", text: string): MockNode {
  const bubble = createBubble(text);
  return {
    classList: {
      contains(token: string): boolean {
        return token === `ds-message--${role}`;
      },
    },
    innerText: text,
    textContent: text,
    querySelector(selector: string): unknown {
      return selector === ".ds-message__bubble" ? bubble : null;
    },
  };
}

function withMockDocument(querySelectorAll: (selector: string) => unknown[], fn: () => void): void {
  const previousDocument = (globalThis as { document?: unknown }).document;

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      querySelectorAll,
    },
  });

  try {
    fn();
  } finally {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: previousDocument,
    });
  }
}

void test("opencode-ui scraper reads ds-message chat turns in visual order", () => {
  const nodes = [
    createMessage("user", "First question"),
    createMessage("assistant", "First answer"),
    createMessage("user", "Second question"),
  ];

  withMockDocument((selector) => {
    if (selector === ".ds-message") {
      return nodes;
    }
    return [];
  }, () => {
    const messages = scrapeMessages();

    assert.deepEqual(messages, [
      { index: 0, role: "user", text: "First question" },
      { index: 1, role: "assistant", text: "First answer" },
      { index: 2, role: "user", text: "Second question" },
    ]);
  });
});

void test("opencode-ui scraper keeps its fallback helpers local for injected execution", () => {
  const source = readFileSync("src/js/modules/webview/providers/opencode-ui/scraper.ts", "utf8");

  assert.doesNotMatch(source, /^import\s/m);
  assert.match(source, /export function scrapeMessages\(\): ScrapedMessage\[] \{\s+function readMessageText/s);
  assert.match(source, /function scrapeLegacyMessages\(\): ScrapedMessage\[] \{/);
});

void test("opencode-ui scraper falls back to legacy opencode selectors when ds-message nodes are absent", () => {
  const legacyUser = {
    innerText: "Legacy user",
    textContent: "Legacy user",
  };
  const legacyAssistant = {
    innerText: "Legacy assistant",
    textContent: "Legacy assistant",
  };

  withMockDocument((selector) => {
    if (selector === ".ds-message") {
      return [];
    }
    if (selector === '[data-component="user-message"] [data-slot="user-message-text"]') {
      return [legacyUser];
    }
    if (selector === '[data-slot="session-turn-summary-section"] [data-component="markdown"]') {
      return [legacyAssistant];
    }
    if (selector === '[data-slot="session-turn-message-content"]') {
      return [];
    }
    return [];
  }, () => {
    const messages = scrapeMessages();

    assert.deepEqual(messages, [
      { index: 0, role: "user", text: "Legacy user" },
      { index: 1, role: "assistant", text: "Legacy assistant" },
    ]);
  });
});
