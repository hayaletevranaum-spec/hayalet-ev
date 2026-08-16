import assert from "node:assert/strict";
import test from "node:test";

class FakeClassList {
  private readonly tokens = new Set<string>();

  add(...nextTokens: string[]): void {
    for (const token of nextTokens) {
      if (token !== "") {
        this.tokens.add(token);
      }
    }
  }

  remove(...nextTokens: string[]): void {
    for (const token of nextTokens) {
      this.tokens.delete(token);
    }
  }

  contains(token: string): boolean {
    return this.tokens.has(token);
  }
}

class FakeNode {
  static readonly TEXT_NODE = 3;

  nodeType = 0;
  parentNode: FakeNode | null = null;
  childNodes: FakeNode[] = [];

  get nextSibling(): FakeNode | null {
    if (this.parentNode === null) {
      return null;
    }

    const siblings = this.parentNode.childNodes;
    const index = siblings.indexOf(this);
    return index >= 0 ? (siblings[index + 1] ?? null) : null;
  }

  get textContent(): string {
    return this.childNodes.map((child) => child.textContent).join("");
  }

  set textContent(value: string) {
    this.childNodes = value === "" ? [] : [new FakeTextNode(value)];
    for (const child of this.childNodes) {
      child.parentNode = this;
    }
  }
}

class FakeTextNode extends FakeNode {
  override nodeType = FakeNode.TEXT_NODE;

  constructor(private value: string) {
    super();
  }

  override get textContent(): string {
    return this.value;
  }

  override set textContent(value: string) {
    this.value = value;
  }
}

class FakeDocumentFragment extends FakeNode {
  override nodeType = 11;

  append(...items: (string | FakeNode)[]): void {
    for (const item of items) {
      const node = typeof item === "string" ? new FakeTextNode(item) : item;
      node.parentNode = this;
      this.childNodes.push(node);
    }
  }
}

class FakeHTMLElement extends FakeNode {
  override nodeType = 1;
  dataset: Record<string, string> = {};
  classList = new FakeClassList();
  contentEditable = "inherit";
  title = "";
  value = "";
  private attributes = new Map<string, string>();

  constructor(public readonly tagName: string) {
    super();
  }

  append(...items: (string | FakeNode | FakeDocumentFragment)[]): void {
    for (const item of items) {
      if (item instanceof FakeDocumentFragment) {
        for (const child of item.childNodes) {
          child.parentNode = this;
          this.childNodes.push(child);
        }
        continue;
      }

      const node = typeof item === "string" ? new FakeTextNode(item) : item;
      node.parentNode = this;
      this.childNodes.push(node);
    }
  }

  replaceChildren(...items: (string | FakeNode | FakeDocumentFragment)[]): void {
    this.childNodes = [];
    this.append(...items);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
}

class FakeHTMLSpanElement extends FakeHTMLElement {
  constructor() {
    super("SPAN");
  }
}

class FakeHTMLBRElement extends FakeHTMLElement {
  constructor() {
    super("BR");
  }
}

class FakeHTMLTextAreaElement extends FakeHTMLElement {
  constructor() {
    super("TEXTAREA");
  }
}

class FakeDocument {
  createElement(tagName: string): FakeHTMLElement {
    const normalizedTag = tagName.toLowerCase();
    if (normalizedTag === "span") {
      return new FakeHTMLSpanElement();
    }
    if (normalizedTag === "br") {
      return new FakeHTMLBRElement();
    }
    if (normalizedTag === "textarea") {
      return new FakeHTMLTextAreaElement();
    }
    return new FakeHTMLElement(tagName.toUpperCase());
  }

  createTextNode(value: string): FakeTextNode {
    return new FakeTextNode(value);
  }

  createDocumentFragment(): FakeDocumentFragment {
    return new FakeDocumentFragment();
  }
}

class FakeBroadcastChannel {
  constructor(_name: string) {}

  addEventListener(): void {}

  removeEventListener(): void {}

  postMessage(): void {}

  close(): void {}
}

function installFakeDom(): () => void {
  const globalObj = globalThis as unknown as Record<string, unknown>;
  const originalGlobals: Record<string, unknown> = {
    Node: globalObj['Node'],
    HTMLElement: globalObj['HTMLElement'],
    HTMLBRElement: globalObj['HTMLBRElement'],
    HTMLSpanElement: globalObj['HTMLSpanElement'],
    HTMLTextAreaElement: globalObj['HTMLTextAreaElement'],
    BroadcastChannel: globalObj['BroadcastChannel'],
    document: globalObj['document'],
  };

  Object.assign(globalObj, {
    Node: FakeNode,
    HTMLElement: FakeHTMLElement,
    HTMLBRElement: FakeHTMLBRElement,
    HTMLSpanElement: FakeHTMLSpanElement,
    HTMLTextAreaElement: FakeHTMLTextAreaElement,
    BroadcastChannel: FakeBroadcastChannel,
    document: new FakeDocument(),
  });

  return () => {
    Object.assign(globalObj, originalGlobals);
  };
}

void test("archives protocol editor renders placeholder chips and serializes them back to raw tags", async () => {
  const restoreDom = installFakeDom();
  const { AppState } = await import("../../src/js/modules/app-state.ts");
  const { applyProtocolSelectionView, readProtocolEditorValue } = await import(
    "../../src/js/pages/archives/protocol-editor.ts"
  );
  const appState = AppState as unknown as Record<string, unknown>;
  const originalGetNickname = appState['getNickname'] as (provider: string) => string;
  appState['getNickname'] = (provider: string) =>
    ({
      ai0: "Asistan",
      ai1: "Ada",
      ai2: "Bora",
      us1: "Uzak Kullanici",
    } as Record<string, string>)[provider] ?? (provider).toUpperCase();

  try {
    const protocolEditorTitleEl = new FakeHTMLElement("DIV");
    const protocolEditorEl = new FakeHTMLElement("DIV");
    const protocolTextareaEl = new FakeHTMLTextAreaElement();
    const protocolEmptyEl = new FakeHTMLElement("DIV");
    const protocolSaveBtn = new FakeHTMLElement("BUTTON");
    let latestStatus = "initial";

    applyProtocolSelectionView({
      key: "AI-assistant",
      protocols: {
        "AI-assistant": "Merhaba <AI0>\n<US1> burada.",
      },
      protocolEditorTitleEl: protocolEditorTitleEl as unknown as HTMLElement,
      protocolEditorEl: protocolEditorEl as unknown as HTMLElement,
      protocolTextareaEl: protocolTextareaEl as unknown as HTMLTextAreaElement,
      protocolEmptyEl: protocolEmptyEl as unknown as HTMLElement,
      protocolSaveBtn: protocolSaveBtn as unknown as HTMLElement,
      protocolTagButtonsEl: null,
      setStatus: (text: string) => {
        latestStatus = text;
      },
    });

    assert.equal(protocolEditorTitleEl.textContent, "AI-assistant");
    assert.equal(protocolTextareaEl.value, "Merhaba <AI0>\n<US1> burada.");
    assert.equal(
      protocolEditorEl.childNodes.some(
        (node) => node instanceof FakeHTMLElement && node.dataset["protocolTag"] === "<AI0>"
      ),
      true
    );
    assert.equal(
      protocolEditorEl.childNodes.some(
        (node) => node instanceof FakeHTMLElement && node.dataset["protocolTag"] === "<US1>"
      ),
      true
    );
    assert.equal(
      readProtocolEditorValue({
        protocolEditorEl: protocolEditorEl as unknown as HTMLElement,
        protocolTextareaEl: protocolTextareaEl as unknown as HTMLTextAreaElement,
      }),
      "Merhaba <AI0>\n<US1> burada."
    );
    assert.equal(protocolEmptyEl.classList.contains("is-hidden"), true);
    assert.equal(protocolSaveBtn.classList.contains("is-hidden"), false);
    assert.equal(latestStatus, "");
  } finally {
    (AppState as unknown as Record<string, unknown>)['getNickname'] = originalGetNickname;
    restoreDom();
  }
});

void test("archives protocol locale change reloads protocols when the page is open", async () => {
  const restoreDom = installFakeDom();
  const { handleProtocolLocaleChange } = await import("../../src/js/pages/archives/protocol-locale.ts");
  let loadProtocolsCalls = 0;
  let applyTranslationsCalls = 0;

  try {
    await handleProtocolLocaleChange({
      isOpen: true,
      loadProtocols: async () => {
        loadProtocolsCalls += 1;
      },
      applyTranslations: async () => {
        applyTranslationsCalls += 1;
      },
    });

    assert.equal(loadProtocolsCalls, 1);
    assert.equal(applyTranslationsCalls, 2);
  } finally {
    restoreDom();
  }
});
