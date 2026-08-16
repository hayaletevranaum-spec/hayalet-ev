import assert from "node:assert/strict";
import test from "node:test";

import type { WebviewElement } from "../../src/js/modules/slot/controller-state.ts";
import {
  ensureWebviewMounted,
  markWebviewAttached,
  markWebviewDetached,
} from "../../src/js/modules/slot/webview-handler.ts";

type MockStyle = {
  position: string;
  top: string;
  left: string;
  width: string;
  height: string;
  display: string;
};

type MockWebview = {
  style: MockStyle;
  attrs: Map<string, string>;
  classes: Set<string>;
  classList: {
    add: (value: string) => void;
    remove: (value: string) => void;
    contains: (value: string) => boolean;
  };
  setAttribute: (key: string, value: string) => void;
  getAttribute: (key: string) => string | null;
  removeAttribute: (key: string) => void;
};

type MockMount = {
  contains: (node: unknown) => boolean;
  appendChild: (node: unknown) => void;
  children: unknown[];
};

function createWebview(): MockWebview {
  const attrs = new Map<string, string>();
  const classes = new Set<string>();
  return {
    style: {
      position: "",
      top: "",
      left: "",
      width: "",
      height: "",
      display: "",
    },
    attrs,
    classes,
    classList: {
      add: (value: string) => {
        classes.add(value);
      },
      remove: (value: string) => {
        classes.delete(value);
      },
      contains: (value: string) => classes.has(value),
    },
    setAttribute: (key: string, value: string) => {
      attrs.set(key, value);
    },
    getAttribute: (key: string) => attrs.get(key) ?? null,
    removeAttribute: (key: string) => {
      attrs.delete(key);
    },
  };
}

function withMockDocument<T>(mountById: Record<string, MockMount | null>, fn: () => T): T {
  const previous = globalThis.document;
  const mockDocument = {
    getElementById: (id: string) => mountById[id] ?? null,
  } as unknown as Document;

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: mockDocument,
  });

  try {
    return fn();
  } finally {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: previous,
    });
  }
}

void test("ensureWebviewMounted appends webview to slot mount and applies layout styles", () => {
  const webview = createWebview();
  const mount: MockMount = {
    children: [],
    contains: () => false,
    appendChild: (node: unknown) => {
      mount.children.push(node);
    },
  };

  const moved = withMockDocument({ "ai1-webview-mount": mount }, () =>
    ensureWebviewMounted("ai1", webview as unknown as WebviewElement)
  );

  assert.equal(moved, true);
  assert.equal(mount.children.length, 1);
  assert.equal(webview.classList.contains("webview-frame"), true);
});

void test("markWebviewDetached parks webview and clears src", () => {
  const webview = createWebview();
  webview.setAttribute("src", "https://example.test");

  markWebviewDetached(webview as unknown as WebviewElement);

  assert.equal(webview.getAttribute("data-detached"), "1");
  assert.equal(webview.getAttribute("src"), null);
  assert.equal(webview.classList.contains("is-hidden"), true);
});

void test("markWebviewAttached clears detached flag and makes webview visible", () => {
  const webview = createWebview();
  webview.setAttribute("data-detached", "1");
  webview.style.display = "none";

  markWebviewAttached(webview as unknown as WebviewElement);

  assert.equal(webview.getAttribute("data-detached"), null);
  assert.equal(webview.classList.contains("is-hidden"), false);
  assert.equal(webview.classList.contains("webview-frame"), true);
});
