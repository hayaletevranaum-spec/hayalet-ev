import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { buildLabDecisionSnapshot, deriveLabDecisionSignalsFromState } from "../../rooms/laboratory/ui/lab-decision-layer.ts";
import { createLabStore } from "../../rooms/laboratory/runtime/lab-store.ts";
import { importLabRootModuleWithDomStub } from "./laboratory-runtime-truth.helpers.ts";
import type { LabDecisionSnapshot, LabRun } from "../../rooms/laboratory/domain/lab-types.ts";

class ElementStub {
  private innerHtmlValue = "";
  scrollTop = 0;
  dataset: Record<string, string> = {};
  classList = {
    add() {},
    remove() {},
    toggle() {},
  };

  get innerHTML(): string {
    return this.innerHtmlValue;
  }

  set innerHTML(value: string) {
    this.innerHtmlValue = value;
  }

  querySelector(_selector?: string): null {
    return null;
  }

  querySelectorAll(_selector?: string): [] {
    return [];
  }

  addEventListener(): void {}

  removeEventListener(): void {}

  replaceChildren(): void {}
}

function captureDebugLogs(run: () => void) {
  const descriptor = Object.getOwnPropertyDescriptor(console, "info");
  const logs: unknown[][] = [];
  Object.defineProperty(console, "info", {
    configurable: true,
    value(...args: unknown[]) {
      logs.push(args);
    },
  });
  try {
    run();
  } finally {
    if (descriptor) {
      Object.defineProperty(console, "info", descriptor);
    } else {
      Reflect.deleteProperty(console, "info");
    }
  }
  return logs;
}

function createObservabilityShell(input: {
  debug: boolean;
  drawerMode?: string;
  existingPanel?: boolean;
  pipelineBlocks?: number;
  regions?: number;
}) {
  let panelRemoved = false;
  let insertedHtml = "";
  const panelAttributes = new Map<string, string>();
  const panel = {
    innerHTML: "",
    remove() {
      panelRemoved = true;
    },
    setAttribute(name: string, value: string) {
      panelAttributes.set(name, value);
    },
  };
  const contextPanel = {
    getAttribute(name: string) {
      return name === "data-drawer-mode" ? (input.drawerMode ?? "setup") : null;
    },
  };
  return {
    get insertedHtml() {
      return insertedHtml;
    },
    get panelAttributes() {
      return panelAttributes;
    },
    get panelInnerHtml() {
      return panel.innerHTML;
    },
    get panelRemoved() {
      return panelRemoved;
    },
    getAttribute(name: string) {
      return name === "data-lab-debug-regions" && input.debug ? "true" : null;
    },
    insertAdjacentHTML(_position: InsertPosition, html: string) {
      insertedHtml = html;
    },
    querySelector(selector: string) {
      if (selector === '[data-lab-debug-panel="true"]') {
        return input.existingPanel === true ? panel : null;
      }
      if (selector === '[data-lab-region="context-panel"], .labx-drawer') {
        return contextPanel;
      }
      return null;
    },
    querySelectorAll(selector: string) {
      if (selector === "[data-lab-region]") {
        return Array.from({ length: input.regions ?? 0 });
      }
      if (selector === ".labx-pipeline-block") {
        return Array.from({ length: input.pipelineBlocks ?? 0 });
      }
      return [];
    },
  };
}

class MountedRootElement extends ElementStub {
  layoutWrites: string[] = [];
  mountedQueriesEnabled = false;
  private mountedInnerHtmlValue = "";

  override get innerHTML(): string {
    return this.mountedInnerHtmlValue;
  }

  override set innerHTML(value: string) {
    this.layoutWrites.push(value);
    this.mountedInnerHtmlValue = value;
  }

  clearLayoutWrites(): void {
    this.layoutWrites = [];
  }

  setShellAttribute(name: string, value: string): void {
    const shellMatch = this.mountedInnerHtmlValue.match(/<div class="labx-shell"([^>]*)>/);
    if (!shellMatch) {
      return;
    }
    const shellTag = shellMatch[0];
    const attributePattern = new RegExp(`${name}="[^"]*"`);
    const nextTag = attributePattern.test(shellTag)
      ? shellTag.replace(attributePattern, `${name}="${value}"`)
      : shellTag.replace(/>$/, ` ${name}="${value}">`);
    this.mountedInnerHtmlValue = this.mountedInnerHtmlValue.replace(shellTag, nextTag);
  }

  override querySelector(selector?: string): null {
    if (this.mountedQueriesEnabled !== true) {
      return null;
    }
    if (selector === ".labx-shell" && this.innerHTML.includes('class="labx-shell"')) {
      return new MountedQueryElement(this, selector) as unknown as null;
    }
    return null;
  }
}

class MountedQueryElement extends ElementStub {
  constructor(
    private readonly root: MountedRootElement,
    private readonly selector: string
  ) {
    super();
  }

  getAttribute(name: string): string | null {
    if (this.selector !== ".labx-shell") {
      return null;
    }
    const shellMatch = this.root.innerHTML.match(/<div class="labx-shell"([^>]*)>/);
    const shellAttributes = shellMatch?.[1] ?? "";
    const attributeMatch = shellAttributes.match(new RegExp(`${name}="([^"]*)"`));
    return attributeMatch?.[1] ?? null;
  }

  removeAttribute(): void {}

  hasAttribute(name: string): boolean {
    return this.getAttribute(name) !== null;
  }

  getAttributeNames(): string[] {
    return [];
  }

  insertAdjacentHTML(_position: InsertPosition, html: string): void {
    this.root.innerHTML += html;
  }

  setAttribute(name: string, value: string): void {
    if (this.selector === ".labx-shell") {
      this.root.setShellAttribute(name, value);
    }
  }
}
void test("laboratory decision snapshot mirrors current UI state without driving behavior", () => {
  const store = createLabStore();
  const emptySnapshot = buildLabDecisionSnapshot({
    shell: null,
    state: store.getState(),
    timestamp: 1,
  });
  assert.equal(emptySnapshot.mode, "setup");
  assert.equal(emptySnapshot.intent, "preparing-analysis");
  assert.equal(emptySnapshot.state, "idle");
  assert.deepEqual(emptySnapshot.triggers, []);

  store.dispatch({
    type: "source-config-patched",
    patch: { kind: "video", mode: "local", storedPath: "/tmp/source.mp4" },
  });
  store.dispatch({ type: "source-probe-completed", action: "source-pick-local" });
  store.dispatch({ type: "workspace-timeline-updated", startMs: 1000, endMs: 3000 });

  const readyShell = {
    querySelectorAll(selector: string) {
      if (selector !== ".labx-pipeline-block") {
        return [];
      }
      return [
        {
          getAttribute(name: string) {
            return name === "data-block-id" ? "analysis-prep" : null;
          },
        },
        {
          getAttribute(name: string) {
            return name === "data-block-id" ? "preflight" : null;
          },
        },
        {
          getAttribute(name: string) {
            return name === "data-block-id" ? "analysis-cta" : null;
          },
        },
      ];
    },
  };
  const readySnapshot = buildLabDecisionSnapshot({
    shell: readyShell as unknown as ParentNode,
    state: store.getState(),
    timestamp: 2,
  });

  assert.equal(readySnapshot.mode, "setup");
  assert.equal(readySnapshot.intent, "ready-to-run");
  assert.equal(readySnapshot.state, "ready");
  assert.deepEqual(readySnapshot.triggers, ["has-selection", "has-source"]);
  assert.deepEqual(readySnapshot.activeBlocks, ["analysis-prep", "preflight", "analysis-cta"]);
});

void test("laboratory decision signals follow UI readiness instead of raw source presence", () => {
  const store = createLabStore();
  store.dispatch({
    type: "source-config-patched",
    patch: {
      kind: "video",
      mode: "local",
      routeLabel: "youtube",
      storedPath: "/tmp/source.mp4",
    },
  });
  store.dispatch({ type: "source-probe-completed", action: "source-pick-local" });
  store.dispatch({ type: "workspace-timeline-updated", startMs: 1000, endMs: 3000 });

  const snapshot = buildLabDecisionSnapshot({
    state: store.getState(),
    timestamp: 3,
  });

  assert.deepEqual(snapshot.triggers, ["has-selection"]);
  assert.equal(snapshot.intent, "preparing-analysis");
  assert.equal(snapshot.state, "idle");
  assert.deepEqual(deriveLabDecisionSignalsFromState(store.getState()), ["has-selection"]);
});

void test("laboratory decision signals keep explore intent separate from result payload presence", () => {
  const store = createLabStore();
  store.dispatch({
    type: "source-config-patched",
    patch: { kind: "video", mode: "local", storedPath: "/tmp/source.mp4" },
  });
  store.dispatch({ type: "source-probe-completed", action: "source-pick-local" });
  store.dispatch({ type: "workspace-timeline-updated", startMs: 1000, endMs: 3000 });

  const state = store.getState();
  state.run = {
    analysisScope: null,
    artifacts: [],
    comparisonVariants: [],
    confidence: null,
    emptyReason: "No reportable findings.",
    endedAt: Date.now() - 1000,
    error: null,
    events: [],
    findings: [],
    hypothesisSummary: null,
    id: "run-empty-result",
    liveFindings: [],
    moduleOrder: [],
    moduleTrace: [],
    modules: {},
    previewArtifacts: [],
    progress: 100,
    rawLog: [],
    startedAt: Date.now() - 2000,
    state: "completed",
    targetLabel: null,
    warnings: [],
  } satisfies LabRun;

  const snapshot = buildLabDecisionSnapshot({
    state,
    timestamp: 4,
  });

  assert.equal(snapshot.mode, "explore");
  assert.equal(snapshot.intent, "exploring-alternatives");
  assert.equal(snapshot.state, "done");
  assert.deepEqual(snapshot.triggers, ["has-selection", "has-source"]);
});

void test("laboratory observability helpers are debug gated and structured", async () => {
  const labRootModule = await importLabRootModuleWithDomStub<{
    __testOnlyLabRootObservability: {
      debugLabFallback: (
        shell: Element | null,
        regionsFound: number,
        missingRegions: string[]
      ) => void;
      debugLabOverlay: (
        shell: Element | null,
        overlayKey: "report" | "tools",
        event: "invalid" | "missing",
        detail?: Record<string, unknown>
      ) => void;
      debugLabRegionLifecycle: (
        shell: Element | null,
        regionKey:
          | "contextPanel"
          | "inspectorPanel"
          | "leftRail"
          | "mainStage"
          | "processStrip"
          | "topBar",
        event: "fallback" | "missing" | "mount" | "update",
        detail?: Record<string, unknown>
      ) => void;
      isLabRegionDebugEnabled: (shell: Element | null) => boolean;
      syncLabDebugPanel: (
        shell: HTMLElement | null,
        decisionSnapshot?: LabDecisionSnapshot | null
      ) => void;
    };
  }>();
  const observability = labRootModule.__testOnlyLabRootObservability;
  const debugShell = createObservabilityShell({
    debug: true,
    drawerMode: "result",
    pipelineBlocks: 4,
    regions: 9,
  });
  const quietShell = createObservabilityShell({ debug: false, existingPanel: true });

  const debugLogs = captureDebugLogs(function () {
    observability.debugLabRegionLifecycle(debugShell as unknown as Element, "topBar", "mount");
    observability.debugLabRegionLifecycle(
      debugShell as unknown as Element,
      "inspectorPanel",
      "update"
    );
    observability.debugLabFallback(debugShell as unknown as Element, 2, [
      "inspector",
      "context-panel",
    ]);
    observability.debugLabOverlay(debugShell as unknown as Element, "tools", "missing", {
      selector: ".labx-overlay-root",
    });
  });

  assert.deepEqual(
    debugLogs.map(function (entry) {
      return entry[0];
    }),
    [
      "[lab][region] topbar -> mounted",
      "[lab][region] inspector -> updated",
      "[lab][fallback] triggered -> regionsFound: 2",
      "[lab][overlay] tools -> missing",
    ]
  );
  assert.deepEqual(debugLogs[2]?.[1], {
    missing: ["inspector", "context-panel"],
    regionsFound: 2,
  });

  const quietLogs = captureDebugLogs(function () {
    observability.debugLabRegionLifecycle(quietShell as unknown as Element, "topBar", "mount");
    observability.debugLabFallback(quietShell as unknown as Element, 2, ["topbar"]);
    observability.debugLabOverlay(quietShell as unknown as Element, "tools", "missing");
  });
  assert.equal(quietLogs.length, 0);
  assert.equal(observability.isLabRegionDebugEnabled(debugShell as unknown as Element), true);
  assert.equal(observability.isLabRegionDebugEnabled(quietShell as unknown as Element), false);

  observability.syncLabDebugPanel(debugShell as unknown as HTMLElement);
  assert.match(debugShell.insertedHtml, /data-lab-debug-panel="true"/);
  assert.match(debugShell.insertedHtml, /data-region-count="9"/);
  assert.match(debugShell.insertedHtml, /data-pipeline-block-count="4"/);
  assert.match(debugShell.insertedHtml, /data-active-block-count="4"/);
  assert.match(debugShell.insertedHtml, /data-drawer-mode="result"/);
  assert.match(debugShell.insertedHtml, /data-decision-intent="idle"/);
  assert.match(debugShell.insertedHtml, /data-decision-state="idle"/);
  assert.match(debugShell.insertedHtml, /<span>mode result<\/span>/);
  assert.match(debugShell.insertedHtml, /<span>intent idle<\/span>/);
  assert.match(debugShell.insertedHtml, /<span>blocks 4<\/span>/);
  assert.match(debugShell.insertedHtml, /<span>state idle<\/span>/);
  assert.doesNotMatch(debugShell.insertedHtml, /triggers|has-selection|has-source/);

  const updateShell = createObservabilityShell({
    debug: true,
    drawerMode: "setup",
    existingPanel: true,
    pipelineBlocks: 4,
    regions: 9,
  });
  observability.syncLabDebugPanel(updateShell as unknown as HTMLElement, {
    activeBlocks: ["analysis-prep", "preflight", "analysis-cta"],
    intent: "ready-to-run",
    mode: "setup",
    state: "ready",
    timestamp: 12,
    triggers: ["has-selection", "has-source"],
  });
  assert.equal(updateShell.panelAttributes.get("data-active-block-count"), "3");
  assert.equal(updateShell.panelAttributes.get("data-decision-intent"), "ready-to-run");
  assert.equal(updateShell.panelAttributes.get("data-decision-state"), "ready");
  assert.match(updateShell.panelInnerHtml, /<span>mode setup<\/span>/);
  assert.match(updateShell.panelInnerHtml, /<span>intent ready-to-run<\/span>/);
  assert.match(updateShell.panelInnerHtml, /<span>blocks 3<\/span>/);
  assert.match(updateShell.panelInnerHtml, /<span>state ready<\/span>/);
  assert.doesNotMatch(updateShell.panelInnerHtml, /triggers|has-selection|has-source/);

  observability.syncLabDebugPanel(quietShell as unknown as HTMLElement);
  assert.equal(quietShell.panelRemoved, true);
});

void test("laboratory observability runtime paths log region fallback and overlay health without replacing shell", async () => {
  class RuntimeHarnessElement extends ElementStub {
    appendedChildren: RuntimeHarnessElement[] = [];
    attributes = new Map<string, string>();
    childNodes: RuntimeHarnessElement[] = [];
    className = "";
    outerHtmlWrites: string[] = [];
    parentElement: RuntimeHarnessElement | null = null;
    private readonly queries = new Map<string, RuntimeHarnessElement | null>();

    constructor(
      readonly tagName = "DIV",
      attributes: Record<string, string> = {}
    ) {
      super();
      Object.entries(attributes).forEach(([key, value]) => {
        this.setAttribute(key, value);
      });
      this.className = attributes["class"] ?? "";
    }

    appendChild(child: RuntimeHarnessElement): RuntimeHarnessElement {
      child.parentElement = this;
      this.appendedChildren.push(child);
      this.childNodes.push(child);
      return child;
    }

    cloneNode(): RuntimeHarnessElement {
      return new RuntimeHarnessElement(this.tagName, Object.fromEntries(this.attributes));
    }

    get outerHTML(): string {
      return this.innerHTML;
    }

    set outerHTML(value: string) {
      this.outerHtmlWrites.push(value);
      this.innerHTML = value;
    }

    getAttribute(name: string): string | null {
      return this.attributes.get(name) ?? null;
    }

    getAttributeNames(): string[] {
      return Array.from(this.attributes.keys());
    }

    hasAttribute(name: string): boolean {
      return this.attributes.has(name);
    }

    override querySelector(selector?: string): null {
      if (selector == null || selector === "") return null;
      return (this.queries.get(selector) as unknown as null) ?? null;
    }

    remove(): void {
      this.parentElement?.childNodes.splice(this.parentElement.childNodes.indexOf(this), 1);
    }

    removeAttribute(name: string): void {
      this.attributes.delete(name);
    }

    replaceWith(next: RuntimeHarnessElement): void {
      this.outerHtmlWrites.push(next.outerHTML);
    }

    setAttribute(name: string, value: string): void {
      this.attributes.set(name, value);
      if (name === "class") {
        this.className = value;
      }
    }

    setQuery(selector: string, element: RuntimeHarnessElement | null): void {
      this.queries.set(selector, element);
    }
  }

  class RuntimeHarnessTemplate {
    content: { firstElementChild: RuntimeHarnessElement | null } = {
      firstElementChild: null,
    };

    set innerHTML(markup: string) {
      const trimmed = markup.trim();
      const tag = /^<([a-z0-9-]+)/i.exec(trimmed)?.[1]?.toUpperCase() ?? "";
      if (tag === "") {
        this.content.firstElementChild = null;
        return;
      }
      const className = /\sclass="([^"]*)"/.exec(trimmed)?.[1] ?? "";
      this.content.firstElementChild = new RuntimeHarnessElement(tag, { class: className });
      this.content.firstElementChild.innerHTML = trimmed;
    }
  }

  type LabRootObservabilityRuntime = {
    __testOnlyLabRootObservability: {
      queryRegion: (root: ParentNode, selectors: readonly string[]) => HTMLElement | null;
      shouldFallback: (regionsFound: number) => boolean;
      syncOverlayRoot: (
        documentRef: Document,
        root: HTMLElement,
        overlayKey: "report" | "tools",
        selector: string,
        render: () => string,
        debugShell?: Element | null
      ) => boolean;
      syncRegion: (input: {
        debugShell?: Element | null;
        documentRef: Document;
        preserveScroll?: boolean;
        regionKey?:
          | "contextPanel"
          | "inspectorPanel"
          | "leftRail"
          | "mainStage"
          | "processStrip"
          | "topBar";
        render: () => string;
        root: ParentNode;
        selectors: readonly string[];
      }) => boolean;
    };
  };

  const labRootModule = await importLabRootModuleWithDomStub<LabRootObservabilityRuntime>();
  const observability = labRootModule.__testOnlyLabRootObservability;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "HTMLElement");
  const documentRef = {
    createElement(tagName: string) {
      if (tagName === "template") {
        return new RuntimeHarnessTemplate();
      }
      return new RuntimeHarnessElement(tagName.toUpperCase());
    },
  } as unknown as Document;

  Object.defineProperty(globalThis, "HTMLElement", {
    configurable: true,
    value: RuntimeHarnessElement,
  });
  try {
    const root = new RuntimeHarnessElement("DIV");
    const debugShell = new RuntimeHarnessElement("DIV", {
      "data-lab-debug-regions": "true",
    });
    const topbar = new RuntimeHarnessElement("SECTION", {
      class: "labx-top-bar",
      "data-lab-region": "topbar",
    });
    topbar.scrollTop = 17;
    topbar.parentElement = root;
    root.setQuery('[data-lab-region="topbar"]', topbar);

    const regionLogs = captureDebugLogs(function () {
      const updated = observability.syncRegion({
        debugShell: debugShell as unknown as Element,
        documentRef,
        preserveScroll: true,
        regionKey: "topBar",
        render() {
          return '<article class="labx-top-bar">updated</article>';
        },
        root: root as unknown as ParentNode,
        selectors: ['[data-lab-region="topbar"]', ".labx-top-bar"],
      });
      const missing = observability.syncRegion({
        debugShell: debugShell as unknown as Element,
        documentRef,
        regionKey: "inspectorPanel",
        render() {
          return '<aside class="labx-workspace-inspector">missing</aside>';
        },
        root: root as unknown as ParentNode,
        selectors: ['[data-lab-region="inspector-panel"]', ".labx-workspace-inspector"],
      });

      assert.equal(updated, true);
      assert.equal(missing, false);
    });

    assert.equal(observability.queryRegion(root as unknown as ParentNode, ['[data-lab-region="topbar"]']), topbar);
    assert.equal(topbar.outerHtmlWrites.length, 1);
    assert.match(topbar.outerHtmlWrites[0] ?? "", /class="labx-top-bar"/);
    assert.deepEqual(
      regionLogs.map(function (entry) {
        return entry[0];
      }),
      ["[lab][region] topbar -> updated", "[lab][region] inspector -> missing"]
    );

    assert.equal(observability.shouldFallback(2), true);
    assert.equal(observability.shouldFallback(3), false);

    const overlayRoot = new RuntimeHarnessElement("DIV");
    const existingOverlay = new RuntimeHarnessElement("DIV", { class: "labx-overlay-root" });
    existingOverlay.parentElement = overlayRoot;
    overlayRoot.setQuery(".labx-overlay-root", existingOverlay);

    const overlayLogs = captureDebugLogs(function () {
      const updatedOverlay = observability.syncOverlayRoot(
        documentRef,
        overlayRoot as unknown as HTMLElement,
        "tools",
        ".labx-overlay-root",
        function () {
          return '<aside class="labx-overlay-root">updated</aside>';
        },
        debugShell as unknown as Element
      );
      const invalidOverlay = observability.syncOverlayRoot(
        documentRef,
        overlayRoot as unknown as HTMLElement,
        "report",
        "#lab-report-overlay-root",
        function () {
          return "";
        },
        debugShell as unknown as Element
      );

      assert.equal(updatedOverlay, true);
      assert.equal(invalidOverlay, false);
    });

    assert.equal(existingOverlay.outerHtmlWrites.length, 1);
    assert.equal(overlayRoot.outerHtmlWrites.length, 0);
    assert.equal(overlayRoot.appendedChildren.length, 0);
    assert.deepEqual(
      overlayLogs.map(function (entry) {
        return entry[0];
      }),
      ["[lab][overlay] report -> missing", "[lab][overlay] report -> invalid"]
    );

    const quietShell = new RuntimeHarnessElement("DIV");
    const quietLogs = captureDebugLogs(function () {
      observability.syncRegion({
        debugShell: quietShell as unknown as Element,
        documentRef,
        regionKey: "processStrip",
        render() {
          return '<div class="labx-process-strip"></div>';
        },
        root: root as unknown as ParentNode,
        selectors: ['[data-lab-region="process-strip"]'],
      });
      observability.syncOverlayRoot(
        documentRef,
        overlayRoot as unknown as HTMLElement,
        "report",
        "#lab-report-overlay-root",
        function () {
          return "";
        },
        quietShell as unknown as Element
      );
    });
    assert.equal(quietLogs.length, 0);
  } finally {
    if (descriptor) {
      Object.defineProperty(globalThis, "HTMLElement", descriptor);
    } else {
      Reflect.deleteProperty(globalThis, "HTMLElement");
    }
  }
});

void test("laboratory shell persists workspace-facing state and exposes tool lifecycle controls", () => {
  const labRootSource = readFileSync("rooms/laboratory/ui/lab-root.ts", "utf8");
  const toolOverlaySource = readFileSync("rooms/laboratory/ui/tool-management-overlay.ts", "utf8");
  const workspaceSurfaceSource = readFileSync("rooms/laboratory/ui/workspace-surface.ts", "utf8");
  const workspaceSourceIntakeSource = readFileSync(
    "rooms/laboratory/ui/workspace-source-intake.ts",
    "utf8"
  );
  const drawerSource = readFileSync("rooms/laboratory/ui/lab-drawer.ts", "utf8");
  const drawerResultExploreSource = readFileSync(
    "rooms/laboratory/ui/lab-drawer-result-explore.ts",
    "utf8"
  );
  const sourcePanelSource = readFileSync("rooms/laboratory/ui/lab-source-panel.ts", "utf8");
  const topBarSource = readFileSync("rooms/laboratory/ui/lab-top-bar.ts", "utf8");

  assert.match(labRootSource, /schemaVersion:\s*4,/);
  assert.match(
    labRootSource,
    /analysisPrepExpandedCapabilityIds:\s*_analysisPrepExpandedCapabilityIds,\s*\.\.\.workspace/
  );
  assert.match(labRootSource, /workspace,/);
  assert.match(
    labRootSource,
    /state\.run\.state === "running" \|\| state\.run\.state === "queued"/
  );
  assert.match(toolOverlaySource, /mediaAnalysis\.toolManager\.ariaLabel/);
  assert.match(toolOverlaySource, /data-lab-action="tool-check-all-updates"/);
  assert.match(toolOverlaySource, /data-lab-action="tool-update-selected"/);
  assert.match(toolOverlaySource, /data-lab-action="tool-install-review"/);
  assert.match(toolOverlaySource, /data-lab-action="tool-install-confirm"/);
  assert.match(toolOverlaySource, /data-lab-action="tool-job-cancel"/);
  assert.doesNotMatch(drawerSource, /renderSourceIntake\(state, copy\)/);
  assert.doesNotMatch(drawerSource, /renderLabProjectAssetsPanel/);
  assert.equal(existsSync("rooms/laboratory/ui/lab-project-assets-panel.ts"), false);
  assert.equal(existsSync("rooms/laboratory/ui/project-navigation.ts"), false);
  assert.equal(existsSync("rooms/laboratory/ui/asset-grid.ts"), false);
  assert.equal(existsSync("rooms/laboratory/ui/project-workspace-overlay.ts"), false);
  assert.match(sourcePanelSource, /renderProjectImportProgress\(state, copy\)/);
  assert.match(sourcePanelSource, /data-lab-field="project\.id"/);
  assert.doesNotMatch(labRootSource, /projectWorkspace|renderProjectWorkspaceOverlay/);
  assert.match(topBarSource, /data-lab-field="workspace\.hypothesis"/);
  assert.match(drawerResultExploreSource, /data-lab-action="run-deep-analysis"/);
  assert.match(drawerSource, /buildAnalysisPreviewSentence\(state\)/);
  assert.match(drawerResultExploreSource, /getLaboratoryRightPanelContext/);
  assert.doesNotMatch(
    drawerResultExploreSource,
    /buildExecutionBridge|formatDecisionCoherenceAdvisory|formatExecutionReadinessSignalAdvisory|getActiveExecutionAlternatives|data-lab-drawer-alternatives/
  );
  assert.match(workspaceSourceIntakeSource, /Source setup controls/);
  assert.doesNotMatch(workspaceSurfaceSource, /renderLabTopbarActions\(state, copy\)/);
  assert.doesNotMatch(workspaceSurfaceSource, /renderGlobalProcessSummary\(state, copy\)/);
});

