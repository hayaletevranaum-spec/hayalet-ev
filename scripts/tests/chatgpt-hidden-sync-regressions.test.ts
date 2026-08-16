import assert from "node:assert/strict";
import test from "node:test";

import { scrapeMessages } from "../../src/js/modules/webview/providers/chatgpt/scraper.ts";

type MockMessageNode = {
  innerText: string;
  textContent: string;
  id?: string;
  className?: string;
  getAttribute: (name: string) => string | null;
  closest: (selector: string) => MockMessageNode | null;
  querySelectorAll: (selector: string) => unknown[];
  querySelector: (selector: string) => unknown;
  getBoundingClientRect: () => { left: number };
  contains: (node: unknown) => boolean;
  matches: (selector: string) => boolean;
};

function withMockDom(
  node: MockMessageNode,
  fn: () => void,
  options?: {
    windowConfig?: unknown;
    querySelectorAll?: (selector: string) => unknown[];
  }
): void {
  const previousWindow = (globalThis as { window?: unknown }).window;
  const previousDocument = (globalThis as { document?: unknown }).document;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      innerWidth: 1280,
      __app_provider_config:
        options?.windowConfig ?? {
          scrapeSelectors: {
            preferred: "[data-message-author-role]",
            fallback: ".message-bubble, .markdown.prose",
          },
        },
    },
  });

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      querySelectorAll: (selector: string) =>
        options?.querySelectorAll?.(selector) ?? [node],
    },
  });

  try {
    fn();
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: previousWindow,
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: previousDocument,
    });
  }
}

void test("chatgpt scraper reads message text when innerText is empty in hidden render state", () => {
  const node: MockMessageNode = {
    innerText: "",
    textContent: "Hidden page response",
    getAttribute: (name: string) => (name === "data-message-author-role" ? "assistant" : null),
    closest: () => null,
    querySelectorAll: () => [],
    querySelector: () => null,
    getBoundingClientRect: () => ({ left: 0 }),
    contains: () => false,
    matches: (selector: string) => selector === '[data-message-author-role="assistant"]',
  };

  withMockDom(node, () => {
    const messages = scrapeMessages();

    assert.equal(messages.length, 1);
    assert.equal(messages[0]!.role, "assistant");
    assert.equal(messages[0]!.text, "Hidden page response");
  });
});

void test("chatgpt scraper falls back to default image selectors for image-only assistant turns", () => {
  const previousHtmlImageElement = (globalThis as { HTMLImageElement?: unknown }).HTMLImageElement;

  class MockHtmlImageElement {
    alt: string;
    currentSrc: string;
    private srcValue: string;

    constructor(src: string, alt: string) {
      this.srcValue = src;
      this.currentSrc = src;
      this.alt = alt;
    }

    getAttribute(name: string): string | null {
      if (name === "src") return this.srcValue;
      if (name === "alt") return this.alt;
      return null;
    }
  }

  Object.defineProperty(globalThis, "HTMLImageElement", {
    configurable: true,
    value: MockHtmlImageElement,
  });

  const imageNode = new MockHtmlImageElement(
    "https://chatgpt.com/backend-api/estuary/content?id=file_test",
    "Uretilen gorsel: Kirmizi elma"
  );
  const imageCloneNode = new MockHtmlImageElement(
    "https://chatgpt.com/backend-api/estuary/content?id=file_test",
    ""
  );
  const containerRoot = {
    querySelector: (selector: string) => (selector === "img" ? imageNode : null),
  };
  const overlayRoot = {
    querySelector: (selector: string) => (selector === "img" ? imageCloneNode : null),
  };

  const userNode: MockMessageNode = {
    innerText: "Draw a red apple",
    textContent: "Draw a red apple",
    id: "user-1",
    className: "",
    getAttribute: (name: string) => {
      if (name === "data-message-author-role") return "user";
      if (name === "id") return "user-1";
      return null;
    },
    closest: () => null,
    querySelectorAll: () => [],
    querySelector: () => null,
    getBoundingClientRect: () => ({ left: 900 }),
    contains: () => false,
    matches: (selector: string) => selector.includes('[data-message-author-role="user"]'),
  };

  const assistantImageNode: MockMessageNode = {
    innerText: "",
    textContent: "",
    id: "assistant-turn-1",
    className: "agent-turn",
    getAttribute: (name: string) => {
      if (name === "id") return "assistant-turn-1";
      return null;
    },
    closest: () => null,
    querySelectorAll: (selector: string) => {
      if (selector === "img") {
        return [imageNode, imageCloneNode];
      }
      if (selector.includes("/backend-api/estuary/content?id=file_")) {
        return [containerRoot, imageNode, imageCloneNode, overlayRoot];
      }
      return [];
    },
    querySelector: (selector: string) => {
      if (selector === "img") {
        return imageNode;
      }
      return null;
    },
    getBoundingClientRect: () => ({ left: 0 }),
    contains: (node: unknown) => node === imageNode,
    matches: (selector: string) => selector.includes(".agent-turn"),
  };

  withMockDom(
    assistantImageNode,
    () => {
      const messages = scrapeMessages();

    assert.equal(messages.length, 2);
    assert.equal(messages[0]!.role, "user");
    assert.equal(messages[1]!.role, "assistant");
    assert.equal(messages[1]!.text, "Kirmizi elma");
    assert.equal(messages[1]!.generatedImages!.length, 1);
    assert.equal(messages[1]!.generatedImages![0]!.imageIndex, 0);
    assert.equal(
      messages[1]!.generatedImages![0]!.currentSrc,
        "https://chatgpt.com/backend-api/estuary/content?id=file_test"
      );
    },
    {
      windowConfig: undefined,
      querySelectorAll: (selector: string) => {
        if (
          selector.includes(".agent-turn") ||
          selector.includes('[data-message-author-role="user"]')
        ) {
          return [userNode, assistantImageNode];
        }
        return [];
      },
    }
  );

  Object.defineProperty(globalThis, "HTMLImageElement", {
    configurable: true,
    value: previousHtmlImageElement,
  });
});
