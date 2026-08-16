import assert from "node:assert/strict";
import test from "node:test";

import { addMessage } from "../../src/js/pages/opencode-ui/chat-utils.ts";
import { renderAttachmentTrayHtml } from "../../src/js/pages/opencode-ui/attachments.ts";
import { sendComposerMessage } from "../../src/js/pages/opencode-ui/composer-actions.ts";
import { withHistorySyncFallback } from "../../src/js/pages/opencode-ui/history-actions.ts";
import { t } from "../../src/js/pages/opencode-ui/i18n.ts";
import { initializeRovoInteractionRuntime } from "../../src/js/pages/opencode-ui/interaction-runtime.ts";
import { buildRuntimeErrorNotice } from "../../src/js/pages/opencode-ui/notice-utils.ts";
import { appendRovoInteractionToken } from "../../src/js/modules/rovo-interactions/parser.ts";
import type { RuntimeState } from "../../src/js/pages/opencode-ui/types.ts";

class FakeClassList {
  private readonly tokens = new Set<string>();

  add(...tokens: string[]): void {
    tokens.forEach((token) => {
      token
        .split(/\s+/u)
        .map((part) => part.trim())
        .filter((part) => part !== "")
        .forEach((part) => {
          this.tokens.add(part);
        });
    });
  }

  remove(...tokens: string[]): void {
    tokens.forEach((token) => {
      token
        .split(/\s+/u)
        .map((part) => part.trim())
        .filter((part) => part !== "")
        .forEach((part) => {
          this.tokens.delete(part);
        });
    });
  }

  toggle(token: string, force?: boolean): boolean {
    if (force === true || (force !== false && !this.tokens.has(token))) {
      this.tokens.add(token);
      return true;
    }

    this.tokens.delete(token);
    return false;
  }

  contains(token: string): boolean {
    return this.tokens.has(token);
  }

  toString(): string {
    return Array.from(this.tokens).join(" ");
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

class FakeHTMLElement {
  readonly children: FakeHTMLElement[] = [];
  readonly classList = new FakeClassList();
  readonly style: Record<string, string> = {};
  readonly dataset: Record<string, string> = {};
  id = "";
  title = "";
  value = "";
  type = "";
  disabled = false;
  src = "";
  alt = "";
  parentElement: FakeHTMLElement | null = null;
  private readonly attributes = new Map<string, string>();
  private textValue = "";
  private innerHtmlValue: string | null = null;

  constructor(readonly tagName: string) {}

  get className(): string {
    return this.classList.toString();
  }

  set className(value: string) {
    this.classList.remove(this.classList.toString());
    this.classList.add(value);
  }

  get childElementCount(): number {
    return this.children.length;
  }

  get textContent(): string {
    const childText = this.children.map((child) => child.textContent).join("");
    return `${this.textValue}${childText}`;
  }

  set textContent(value: string) {
    this.children.splice(0, this.children.length);
    this.innerHtmlValue = null;
    this.textValue = value;
  }

  get innerText(): string {
    return this.textContent;
  }

  get innerHTML(): string {
    if (this.innerHtmlValue !== null) {
      return this.innerHtmlValue;
    }

    if (this.children.length > 0) {
      return this.children.map((child) => child.innerHTML).join("");
    }

    return escapeHtml(this.textValue);
  }

  set innerHTML(value: string) {
    this.children.splice(0, this.children.length);
    this.textValue = "";
    this.innerHtmlValue = value;
  }

  append(...items: Array<FakeHTMLElement | string>): void {
    items.forEach((item) => {
      if (typeof item === "string") {
        this.textValue += item;
        return;
      }

      this.appendChild(item);
    });
  }

  appendChild(child: FakeHTMLElement): FakeHTMLElement {
    this.innerHtmlValue = null;
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  remove(): void {
    if (this.parentElement == null) {
      return;
    }

    const siblings = this.parentElement.children;
    const index = siblings.indexOf(this);
    if (index >= 0) {
      siblings.splice(index, 1);
    }
    this.parentElement = null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
    if (name === "id") {
      this.id = value;
    }
  }

  getAttribute(name: string): string | null {
    if (name === "id" && this.id !== "") {
      return this.id;
    }
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  addEventListener(): void {}

  contains(target: FakeHTMLElement): boolean {
    if (target === this) {
      return true;
    }

    return this.children.some((child) => child.contains(target));
  }

  querySelector(selector: string): FakeHTMLElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): FakeHTMLElement[] {
    const selectors = selector
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item !== "");
    if (selectors.length === 0) {
      return [];
    }

    const matches: FakeHTMLElement[] = [];
    const visit = (node: FakeHTMLElement): void => {
      if (selectors.some((part) => matchesSelector(node, part))) {
        matches.push(node);
      }
      node.children.forEach((child) => {
        visit(child);
      });
    };

    this.children.forEach((child) => {
      visit(child);
    });
    return matches;
  }
}

class FakeHTMLInputElement extends FakeHTMLElement {}
class FakeHTMLTextAreaElement extends FakeHTMLElement {
  rows = 2;
}
class FakeHTMLButtonElement extends FakeHTMLElement {}
class FakeHTMLImageElement extends FakeHTMLElement {}

class FakeDocument {
  readonly body = new FakeHTMLElement("BODY");
  visibilityState: "visible" | "hidden" = "visible";

  createElement(tagName: string): FakeHTMLElement {
    const normalized = tagName.toLowerCase();
    if (normalized === "input") {
      return new FakeHTMLInputElement(tagName.toUpperCase());
    }
    if (normalized === "textarea") {
      return new FakeHTMLTextAreaElement(tagName.toUpperCase());
    }
    if (normalized === "button") {
      return new FakeHTMLButtonElement(tagName.toUpperCase());
    }
    if (normalized === "img") {
      return new FakeHTMLImageElement(tagName.toUpperCase());
    }
    return new FakeHTMLElement(tagName.toUpperCase());
  }

  getElementById(id: string): FakeHTMLElement | null {
    return findById(this.body, id);
  }

  addEventListener(): void {}

  removeEventListener(): void {}
}

function matchesSelector(element: FakeHTMLElement, selector: string): boolean {
  if (selector.startsWith(".")) {
    return element.classList.contains(selector.slice(1));
  }

  if (selector.startsWith("#")) {
    return element.id === selector.slice(1);
  }

  return element.tagName.toLowerCase() === selector.toLowerCase();
}

function findById(root: FakeHTMLElement, id: string): FakeHTMLElement | null {
  if (root.id === id) {
    return root;
  }

  for (const child of root.children) {
    const match = findById(child, id);
    if (match != null) {
      return match;
    }
  }

  return null;
}

function installFakeDom(options: {
  electronApi?: Record<string, unknown>;
} = {}): {
  document: FakeDocument;
  restore: () => void;
} {
  const document = new FakeDocument();
  const originalDescriptors = {
    window: Object.getOwnPropertyDescriptor(globalThis, "window"),
    document: Object.getOwnPropertyDescriptor(globalThis, "document"),
    navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator"),
    HTMLElement: Object.getOwnPropertyDescriptor(globalThis, "HTMLElement"),
    HTMLInputElement: Object.getOwnPropertyDescriptor(globalThis, "HTMLInputElement"),
    HTMLTextAreaElement: Object.getOwnPropertyDescriptor(globalThis, "HTMLTextAreaElement"),
    HTMLButtonElement: Object.getOwnPropertyDescriptor(globalThis, "HTMLButtonElement"),
    HTMLImageElement: Object.getOwnPropertyDescriptor(globalThis, "HTMLImageElement"),
  };

  const fakeWindow = {
    document,
    location: {
      href: "http://127.0.0.1:4096/opencode-ui",
      search: "",
    },
    navigator: {
      clipboard: {
        writeText: async () => {},
      },
    },
    electronAPI: options.electronApi ?? {},
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  Object.defineProperties(globalThis, {
    window: {
      configurable: true,
      writable: true,
      value: fakeWindow,
    },
    document: {
      configurable: true,
      writable: true,
      value: document,
    },
    navigator: {
      configurable: true,
      writable: true,
      value: fakeWindow.navigator,
    },
    HTMLElement: {
      configurable: true,
      writable: true,
      value: FakeHTMLElement,
    },
    HTMLInputElement: {
      configurable: true,
      writable: true,
      value: FakeHTMLInputElement,
    },
    HTMLTextAreaElement: {
      configurable: true,
      writable: true,
      value: FakeHTMLTextAreaElement,
    },
    HTMLButtonElement: {
      configurable: true,
      writable: true,
      value: FakeHTMLButtonElement,
    },
    HTMLImageElement: {
      configurable: true,
      writable: true,
      value: FakeHTMLImageElement,
    },
  });

  return {
    document,
    restore: () => {
      for (const [key, descriptor] of Object.entries(originalDescriptors)) {
        if (descriptor != null) {
          Object.defineProperty(globalThis, key, descriptor);
          continue;
        }

        Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}

function mountChatShell(document: FakeDocument): {
  chatMessages: FakeHTMLElement;
  chatInput: FakeHTMLTextAreaElement;
  sendButton: FakeHTMLButtonElement;
} {
  const chatMessages = document.createElement("div");
  chatMessages.id = "chat-messages";
  document.body.appendChild(chatMessages);

  const chatEmpty = document.createElement("div");
  chatEmpty.id = "chat-empty";
  chatMessages.appendChild(chatEmpty);

  const chatInput = document.createElement("textarea") as FakeHTMLTextAreaElement;
  chatInput.id = "chat-input";
  document.body.appendChild(chatInput);

  const sendButton = document.createElement("button");
  sendButton.id = "send-btn";
  document.body.appendChild(sendButton);

  const previewArea = document.createElement("div");
  previewArea.id = "clipboard-preview-area";
  document.body.appendChild(previewArea);

  return { chatMessages, chatInput, sendButton };
}

function createRuntime(): RuntimeState {
  return {
    baseUrl: "http://127.0.0.1:4096",
    dbPath: "",
    activeSessionId: "ses_chat_dom",
    sessionTab: "active",
    submittingSessionId: null,
    activeModelKey: null,
    activeReasoningEffort: null,
    activeAgentId: null,
    activeInteractionMode: "off",
    modelMetaByKey: {},
    modelItems: [],
    providerItems: [],
    modelPreferences: {
      hiddenProviders: [],
      hiddenModels: [],
      favoriteModels: [],
      defaultModelKey: null,
      lastSelectedModelKey: null,
      disabledProviders: [],
      disabledModels: [],
    },
    endpointDefaultModelKeys: [],
    isSubmitting: false,
    lastRenderedMessageCount: 0,
    lastRenderedSnapshotKey: "",
    stagedAttachments: [],
  };
}

void test("addMessage renders assistant notice, historic preview card, and semantic blocks", () => {
  const { document, restore } = installFakeDom();
  const { chatMessages } = mountChatShell(document);

  try {
    addMessage(
      "assistant",
      "",
      undefined,
      [
        {
          name: "screen.png",
          fileName: "screen.png",
          media_type: "image/png",
          url: "https://example.test/assets/screen.png",
          source: "history",
        },
      ],
      {
        blocks: [
          {
            kind: "reasoning",
            title: t("message.reasoningTitle"),
            text: "Inspect session payload before rendering.",
          },
          {
            kind: "patch",
            title: t("message.patchTitle"),
            meta: t("message.patchFilesLabel"),
            items: ["src/js/pages/opencode-ui/chat-utils.ts"],
          },
        ],
        notices: [
          {
            tone: "warning",
            title: t("message.runtimeNotice.limitTitle"),
            detail: "The usage limit has been reached",
            meta: t("message.toolStateRetryMeta"),
          },
        ],
      }
    );

    const reasoningSection = chatMessages.querySelector(".ds-message-section--reasoning");
    const patchSection = chatMessages.querySelector(".ds-message-section--patch");
    const noticeTitle = chatMessages.querySelector(".ds-message-notice__title");
    const previewImage = chatMessages.querySelector(".ds-attachment-card__image");

    assert.ok(reasoningSection);
    assert.match(reasoningSection.textContent , /Inspect session payload/u);
    assert.ok(patchSection);
    assert.match(patchSection.textContent , /chat-utils\.ts/u);
    assert.equal(noticeTitle?.textContent, t("message.runtimeNotice.limitTitle"));
    assert.equal(previewImage?.src, "https://example.test/assets/screen.png");
  } finally {
    restore();
  }
});

void test("addMessage keeps the change-approval interaction card render path active", async () => {
  const { document, restore } = installFakeDom({
    electronApi: {
      loadSettings: () => ({
        assistantSlot: {
          accountId: "opencode_ui_opencode_at_opencode_com",
        },
      }),
      opencodeServeStatus: () => ({ running: true }),
      assistantRuntimeRead: () => ({
        success: true,
        state: { desiredMode: "soft", phase: "idle" },
      }),
      rovoInteractionContextRead: () => ({
        success: true,
        appMode: "app",
        effectiveMode: "app",
      }),
    },
  });
  const { chatMessages } = mountChatShell(document);

  try {
    await initializeRovoInteractionRuntime({
      draftText: () => {},
      submitText: async () => {},
      showToast: () => {},
    });

    const message = appendRovoInteractionToken("Approval fallback", {
      id: "approval-card",
      version: 1,
      type: "change-approval",
      title: "Change Approval",
      fallbackText: "Approval fallback",
      issue: "Revise the assistant message renderer",
      solution: "Keep reasoning and patch parts as semantic blocks",
      canonicalReply: "evet",
    });

    addMessage("assistant", message, undefined, undefined, {
      blocks: [
        {
          kind: "reasoning",
          title: t("message.reasoningTitle"),
          text: "This block should stay hidden behind the interaction card.",
        },
      ],
    });

    const approvalCard = chatMessages.querySelector(".rovo-interaction--approval");
    assert.ok(approvalCard);
    assert.match(approvalCard.textContent , /Revise the assistant message renderer/u);
  } finally {
    restore();
  }
});

void test("renderAttachmentTrayHtml keeps image preview cards instead of fallback chips", () => {
  const { restore } = installFakeDom();

  try {
    const html = renderAttachmentTrayHtml([
      {
        id: "att_img",
        name: "preview.png",
        mimeType: "image/png",
        base64: "YWJj",
        size: 3,
        source: "clipboard",
      },
    ]);

    assert.match(html, /ds-attachment-card__image/u);
    assert.match(html, /data:image\/png;base64,YWJj/u);
  } finally {
    restore();
  }
});

void test("buildRuntimeErrorNotice recognizes Turkish retry-limit phrases", () => {
  const notice = buildRuntimeErrorNotice(
    "Kullanım sınırına ulaşıldı, istek otomatik olarak yeniden deneniyor.",
    {
      defaultTitleKey: "chat.sendFailedTitle",
    }
  );

  assert.equal(notice.title, t("message.runtimeNotice.limitTitle"));
  assert.equal(notice.meta, t("message.toolStateRetryMeta"));
});

void test("sendComposerMessage keeps the Rovo card path when history sync falls back", async () => {
  const tokenizedReply = appendRovoInteractionToken("Approval fallback", {
    id: "approval-fallback-card",
    version: 1,
    type: "change-approval",
    title: "Change Approval",
    fallbackText: "Approval fallback",
    issue: "Keep the fallback interaction card visible",
    solution: "Use withHistorySyncFallback when the session store lags",
    canonicalReply: "evet",
  });
  const { document, restore } = installFakeDom({
    electronApi: {
      opencodeUiApiProxy: () => ({
        success: true,
        data: {
          parts: [{ type: "text", text: tokenizedReply }],
        },
      }),
      loadSettings: () => ({
        assistantSlot: {
          accountId: "opencode_ui_opencode_at_opencode_com",
        },
      }),
      opencodeServeStatus: () => ({ running: true }),
      assistantRuntimeRead: () => ({
        success: true,
        state: { desiredMode: "soft", phase: "idle" },
      }),
      rovoInteractionContextRead: () => ({
        success: true,
        appMode: "app",
        effectiveMode: "app",
      }),
    },
  });
  const { chatMessages, chatInput } = mountChatShell(document);
  chatInput.value = "Ship the fallback card";

  try {
    await initializeRovoInteractionRuntime({
      draftText: () => {},
      submitText: async () => {},
      showToast: () => {},
    });

    const runtime = createRuntime();

    await sendComposerMessage({
      runtime,
      byId: <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null,
      showToast: () => {},
      ensureActiveSession: async () => "ses_chat_dom",
      loadSessionListAndRender: async () => {},
      withHistorySyncFallback: async (fallbackMessage) => {
        await withHistorySyncFallback(
          {
            runtime,
            byId: <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null,
            initialUsageText: "Disk DB",
            clearChatArea: () => {},
            renderTodoPanel: () => {},
            renderFilesPanel: () => {},
            updateUsagePlaceholders: () => {},
            updateUsageFromSession: () => {},
            addMessage,
            createHistoricAssistantToolHost: () => null,
            renderHistoricToolCall: () => {},
            readSessionFromDisk: async () => null,
            scrollChatToBottom: () => {},
            buildSessionSnapshotKey: () => "0",
            wait: async () => {},
          },
          fallbackMessage
        );
      },
      scrollChatToBottom: () => {},
    });

    const approvalCard = chatMessages.querySelector(".rovo-interaction--approval");
    assert.ok(approvalCard);
    assert.match(approvalCard.textContent , /Keep the fallback interaction card visible/u);
  } finally {
    restore();
  }
});

void test("sendComposerMessage renders a notice bubble for request-time limit failures", async () => {
  const { document, restore } = installFakeDom({
    electronApi: {
      opencodeUiApiProxy: () => ({
        success: false,
        data: {
          message: "The usage limit has been reached",
        },
      }),
    },
  });
  const { chatMessages, chatInput } = mountChatShell(document);
  chatInput.value = "Retry this request";

  try {
    const runtime = createRuntime();

    await sendComposerMessage({
      runtime,
      byId: <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null,
      showToast: () => {},
      ensureActiveSession: async () => "ses_chat_dom",
      loadSessionListAndRender: async () => {},
      withHistorySyncFallback: async () => {},
      scrollChatToBottom: () => {},
    });

    const notices = chatMessages.querySelectorAll(".ds-message-notice__title");
    const detail = chatMessages.querySelector(".ds-message-notice__detail");

    assert.equal(notices.length, 1);
    assert.equal(notices[0]?.textContent, t("message.runtimeNotice.limitTitle"));
    assert.match(detail?.textContent ?? "", /usage limit has been reached/u);
    assert.equal(chatInput.value, "Retry this request");
  } finally {
    restore();
  }
});
