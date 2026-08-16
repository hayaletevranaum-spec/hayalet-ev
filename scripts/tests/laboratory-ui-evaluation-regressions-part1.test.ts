import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { createRoomBuiltArtifact } from "./helpers/room-installed-copy.ts";

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

type MinimalLaboratoryUiEnvironmentOptions = {
  fakeTimers?: boolean;
  roomApi?: "full" | "none";
};

function createMinimalLaboratoryUiEnvironment(options: MinimalLaboratoryUiEnvironmentOptions = {}) {
  const runtimeRoot = new ElementStub();
  let readyPayload: Record<string, unknown> | null = null;
  let timerId = 1;
  const queuedTimers: Array<{ callback: () => void; delay: number; id: number }> = [];

  const descriptors = {
    clearTimeout: Object.getOwnPropertyDescriptor(globalThis, "clearTimeout"),
    document: Object.getOwnPropertyDescriptor(globalThis, "document"),
    navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator"),
    setTimeout: Object.getOwnPropertyDescriptor(globalThis, "setTimeout"),
    window: Object.getOwnPropertyDescriptor(globalThis, "window"),
    HTMLElement: Object.getOwnPropertyDescriptor(globalThis, "HTMLElement"),
  };

  Object.defineProperty(globalThis, "HTMLElement", {
    configurable: true,
    value: ElementStub,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      language: "en-US",
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      documentElement: {
        dataset: {},
        lang: "en",
        style: {
          setProperty() {},
        },
      },
      body: Object.assign(new ElementStub(), {
        style: {
          setProperty() {},
        },
      }),
      addEventListener() {},
      removeEventListener() {},
      getElementById(id: string) {
        return id === "app" ? runtimeRoot : null;
      },
      querySelector() {
        return null;
      },
    },
  });
  if (options.fakeTimers === true) {
    Object.defineProperty(globalThis, "setTimeout", {
      configurable: true,
      value(callback: (...args: unknown[]) => void, delay = 0, ...args: unknown[]) {
        const id = timerId;
        timerId += 1;
        queuedTimers.push({
          callback() {
            callback(...args);
          },
          delay: isNaN(Number(delay)) ? 0 : Number(delay),
          id,
        });
        return id;
      },
    });
    Object.defineProperty(globalThis, "clearTimeout", {
      configurable: true,
      value(id: number) {
        const timerIndex = queuedTimers.findIndex(function (timer) {
          return timer.id === id;
        });
        if (timerIndex >= 0) {
          queuedTimers.splice(timerIndex, 1);
        }
      },
    });
  }
  const windowStub: Record<string, unknown> = {
    addEventListener() {},
    removeEventListener() {},
  };
  if (options.roomApi !== "none") {
    windowStub["roomAPI"] = {
      onHostMessage() {},
      ready(payload: Record<string, unknown>) {
        readyPayload = payload;
      },
      sendEvent() {},
    };
  }
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowStub,
  });

  return {
    flushTimers(maxDelay = Number.POSITIVE_INFINITY) {
      let nextIndex = queuedTimers.findIndex(function (timer) {
        return timer.delay <= maxDelay;
      });
      while (nextIndex >= 0) {
        const [timer] = queuedTimers.splice(nextIndex, 1);
        (timer as NonNullable<typeof timer>).callback();
        nextIndex = queuedTimers.findIndex(function (candidate) {
          return candidate.delay <= maxDelay;
        });
      }
    },
    readyPayload: () => readyPayload,
    restore() {
      Object.entries(descriptors).forEach(([key, descriptor]) => {
        if (descriptor) {
          Object.defineProperty(globalThis, key, descriptor);
        } else {
          Reflect.deleteProperty(globalThis, key);
        }
      });
    },
    runtimeRoot,
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

class MountedActionElement extends ElementStub {
  constructor(action: string, value?: string) {
    super();
    this.dataset["labAction"] = action;
    if (value !== undefined) {
      this.dataset["labValue"] = value;
    }
  }

  closest(selector: string): MountedActionElement | null {
    return selector === "[data-lab-action]" ? this : null;
  }
}

class MountedSelectElement extends ElementStub {
  type = "select-one";

  constructor(
    field: string,
    public value: string
  ) {
    super();
    this.dataset["labField"] = field;
  }
}

function createMountedLaboratoryTransitionEnvironment(options: { animationFrame?: boolean } = {}) {
  const runtimeRoot = new MountedRootElement();
  const listeners = new Map<string, (event: Event) => void>();
  let readyPayload: Record<string, unknown> | null = null;
  let timerId = 1;
  let animationFrameId = 1;
  let storageWriteCount = 0;
  const queuedAnimationFrames: Array<{ callback: (timestamp: number) => void; id: number }> = [];
  const storage = new Map<string, string>();
  storage.set(
    "hayalet-ev:laboratory-refactor:v4",
    JSON.stringify({
      schemaVersion: 4,
      sourceProbeStatus: "completed",
      source: {
        kind: "video",
        mode: "local",
        previewUrl: "file:///tmp/mounted-transition.mp4",
        status: "ready",
        storedFileName: "mounted-transition.mp4",
        storedPath: "/tmp/mounted-transition.mp4",
      },
    })
  );

  const descriptors = {
    clearTimeout: Object.getOwnPropertyDescriptor(globalThis, "clearTimeout"),
    document: Object.getOwnPropertyDescriptor(globalThis, "document"),
    Element: Object.getOwnPropertyDescriptor(globalThis, "Element"),
    HTMLElement: Object.getOwnPropertyDescriptor(globalThis, "HTMLElement"),
    HTMLInputElement: Object.getOwnPropertyDescriptor(globalThis, "HTMLInputElement"),
    HTMLSelectElement: Object.getOwnPropertyDescriptor(globalThis, "HTMLSelectElement"),
    HTMLTextAreaElement: Object.getOwnPropertyDescriptor(globalThis, "HTMLTextAreaElement"),
    navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator"),
    setTimeout: Object.getOwnPropertyDescriptor(globalThis, "setTimeout"),
    window: Object.getOwnPropertyDescriptor(globalThis, "window"),
  };

  Object.defineProperty(globalThis, "Element", {
    configurable: true,
    value: ElementStub,
  });
  Object.defineProperty(globalThis, "HTMLElement", {
    configurable: true,
    value: ElementStub,
  });
  Object.defineProperty(globalThis, "HTMLInputElement", {
    configurable: true,
    value: ElementStub,
  });
  Object.defineProperty(globalThis, "HTMLSelectElement", {
    configurable: true,
    value: MountedSelectElement,
  });
  Object.defineProperty(globalThis, "HTMLTextAreaElement", {
    configurable: true,
    value: ElementStub,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      language: "en-US",
    },
  });
  Object.defineProperty(globalThis, "setTimeout", {
    configurable: true,
    value() {
      const id = timerId;
      timerId += 1;
      return id;
    },
  });
  Object.defineProperty(globalThis, "clearTimeout", {
    configurable: true,
    value() {},
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      documentElement: {
        dataset: {},
        lang: "en",
        style: {
          setProperty() {},
        },
      },
      body: Object.assign(new ElementStub(), {
        style: {
          setProperty() {},
        },
      }),
      addEventListener(type: string, listener: (event: Event) => void) {
        listeners.set(type, listener);
      },
      removeEventListener(type: string) {
        listeners.delete(type);
      },
      getElementById(id: string) {
        return id === "app" ? runtimeRoot : null;
      },
      querySelector() {
        return null;
      },
    },
  });
  const windowStub: Record<string, unknown> = {
    addEventListener() {},
    clearTimeout() {},
    localStorage: {
      getItem(key: string) {
        return storage.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        storageWriteCount += 1;
        storage.set(key, value);
      },
    },
    removeEventListener() {},
    roomAPI: {
      onHostMessage() {},
      ready(payload: Record<string, unknown>) {
        readyPayload = payload;
      },
      sendEvent() {},
    },
    setTimeout() {
      const id = timerId;
      timerId += 1;
      return id;
    },
  };
  if (options.animationFrame === true) {
    windowStub["cancelAnimationFrame"] = function (id: number) {
      const frameIndex = queuedAnimationFrames.findIndex(function (frame) {
        return frame.id === id;
      });
      if (frameIndex >= 0) {
        queuedAnimationFrames.splice(frameIndex, 1);
      }
    };
    windowStub["requestAnimationFrame"] = function (callback: (timestamp: number) => void) {
      const id = animationFrameId;
      animationFrameId += 1;
      queuedAnimationFrames.push({ callback, id });
      return id;
    };
  }
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowStub,
  });

  return {
    animationFrameCount() {
      return queuedAnimationFrames.length;
    },
    flushAnimationFrames() {
      const pendingFrames = queuedAnimationFrames.splice(0);
      pendingFrames.forEach(function (frame) {
        frame.callback(Date.now());
      });
    },
    listener(type: string) {
      return listeners.get(type);
    },
    readyPayload: () => readyPayload,
    resetStorageWriteCount() {
      storageWriteCount = 0;
    },
    restore() {
      Object.entries(descriptors).forEach(([key, descriptor]) => {
        if (descriptor) {
          Object.defineProperty(globalThis, key, descriptor);
        } else {
          Reflect.deleteProperty(globalThis, key);
        }
      });
    },
    storageWriteCount() {
      return storageWriteCount;
    },
    runtimeRoot,
  };
}

void test("laboratory UI shell evaluates under minimal runtime stubs", async () => {
  const environment = createMinimalLaboratoryUiEnvironment({
    fakeTimers: true,
  });
  const buildArtifact = await createRoomBuiltArtifact("laboratory");

  try {
    await import(
      `${pathToFileURL(resolve(buildArtifact.rootDir, "ui/index.js")).href}?smoke=${Date.now()}`
    );

    assert.match(environment.runtimeRoot.innerHTML, /class="labx-shell"/);
    assert.match(environment.runtimeRoot.innerHTML, /data-ready="false"/);
    assert.match(environment.runtimeRoot.innerHTML, /data-lab-boot-overlay="true"/);
    assert.match(environment.runtimeRoot.innerHTML, /class="labx-boot-panel"/);
    assert.match(environment.runtimeRoot.innerHTML, /data-lab-center-skeleton="true"/);
    assert.match(environment.runtimeRoot.innerHTML, /labx-center-skeleton__label/);
    assert.match(environment.runtimeRoot.innerHTML, /labx-drawer-skeleton/);
    assert.deepEqual(environment.readyPayload(), {
      feature: "media-analysis",
      room: "laboratory",
      stage: "ui-ready",
    });
  } finally {
    await buildArtifact.cleanup();
    environment.restore();
  }
});

void test("laboratory boot overlay unlocks from local ready without a room API bridge", async () => {
  const environment = createMinimalLaboratoryUiEnvironment({
    fakeTimers: true,
    roomApi: "none",
  });
  const buildArtifact = await createRoomBuiltArtifact("laboratory");

  try {
    await import(
      `${pathToFileURL(resolve(buildArtifact.rootDir, "ui/index.js")).href}?localBoot=${Date.now()}`
    );

    assert.match(environment.runtimeRoot.innerHTML, /data-ready="false"/);
    assert.match(environment.runtimeRoot.innerHTML, /data-lab-boot-overlay="true"/);
    assert.equal(environment.readyPayload(), null);

    environment.flushTimers(999);

    assert.match(environment.runtimeRoot.innerHTML, /data-ready="true"/);
    assert.doesNotMatch(environment.runtimeRoot.innerHTML, /data-lab-boot-overlay="true"/);
    assert.match(environment.runtimeRoot.innerHTML, /data-lab-center-skeleton="true"/);
    assert.match(environment.runtimeRoot.innerHTML, /labx-drawer-skeleton/);
    assert.doesNotMatch(environment.runtimeRoot.innerHTML, /lab-project-workspace-root/);
    assert.doesNotMatch(environment.runtimeRoot.innerHTML, /data-overlay="project-workspace"/);
  } finally {
    await buildArtifact.cleanup();
    environment.restore();
  }
});

void test("laboratory boot overlay waits for host data when a room API bridge exists", async () => {
  const environment = createMinimalLaboratoryUiEnvironment({
    fakeTimers: true,
  });
  const buildArtifact = await createRoomBuiltArtifact("laboratory");

  try {
    await import(
      `${pathToFileURL(resolve(buildArtifact.rootDir, "ui/index.js")).href}?bridgeBoot=${Date.now()}`
    );

    assert.deepEqual(environment.readyPayload(), {
      feature: "media-analysis",
      room: "laboratory",
      stage: "ui-ready",
    });

    environment.flushTimers(999);

    assert.match(environment.runtimeRoot.innerHTML, /data-ready="false"/);
    assert.match(environment.runtimeRoot.innerHTML, /data-lab-boot-overlay="true"/);
    assert.match(environment.runtimeRoot.innerHTML, /data-lab-center-skeleton="true"/);
    assert.match(environment.runtimeRoot.innerHTML, /labx-drawer-skeleton/);
  } finally {
    await buildArtifact.cleanup();
    environment.restore();
  }
});

void test("laboratory boot overlay fallback waits for idle before unlocking bridge loads", async () => {
  const environment = createMinimalLaboratoryUiEnvironment({
    fakeTimers: true,
  });
  const buildArtifact = await createRoomBuiltArtifact("laboratory");

  try {
    await import(
      `${pathToFileURL(resolve(buildArtifact.rootDir, "ui/index.js")).href}?fallbackBoot=${Date.now()}`
    );

    environment.flushTimers(7999);

    assert.match(environment.runtimeRoot.innerHTML, /data-ready="false"/);
    assert.match(environment.runtimeRoot.innerHTML, /data-lab-boot-overlay="true"/);

    environment.flushTimers(8000);

    assert.match(environment.runtimeRoot.innerHTML, /data-ready="true"/);
    assert.doesNotMatch(environment.runtimeRoot.innerHTML, /data-lab-boot-overlay="true"/);
  } finally {
    await buildArtifact.cleanup();
    environment.restore();
  }
});

void test("laboratory shell routes host traffic through lab-root orchestration seams", () => {
  const uiIndexSource = readFileSync("rooms/laboratory/ui/index.ts", "utf8");
  const labRootSource = readFileSync("rooms/laboratory/ui/lab-root.ts", "utf8");
  const labLayoutSource = readFileSync("rooms/laboratory/ui/lab-layout.ts", "utf8");
  const hostBridgeSource = readFileSync("rooms/laboratory/runtime/lab-host-bridge.ts", "utf8");

  assert.match(uiIndexSource, /import "\.\/lab-root\.js";/);
  assert.match(labRootSource, /return renderWorkspaceSurface\(state, \{/);
  assert.doesNotMatch(labRootSource, /state\.bootReady && state\.ui\.labMode/);
  assert.match(
    labRootSource,
    /runtimeRoot\.innerHTML = renderLabLayout\(state, surface, copy, \{\s*bootOverlayActive: isBootOverlayActive\(state\),\s*\}\);/
  );
  assert.match(labLayoutSource, /inspectorPanel: ""/);
  assert.match(labRootSource, /renderLabBootOverlay\(copy\)/);
  assert.match(labRootSource, /getLabLayoutKind\(state, \{/);
  assert.match(labRootSource, /currentLayoutKind !== nextLayoutKind/);
  assert.doesNotMatch(labRootSource, /nextLayoutKind === "import-only"/);
  assert.match(labRootSource, /function syncBootOverlay\(/);
  assert.match(labRootSource, /const BOOT_OVERLAY_SETTLE_MS = 450;/);
  assert.match(labRootSource, /const BOOT_OVERLAY_FALLBACK_READY_MS = 8000;/);
  assert.match(labRootSource, /const BOOT_OVERLAY_FAILSAFE_MS = 20000;/);
  assert.match(labRootSource, /let bootBootstrapSeen = false;/);
  assert.match(labRootSource, /function getBootOverlayBootstrapStatus\(state: LabStoreState\)/);
  assert.match(labRootSource, /function hasRoomReadyBridge\(\)/);
  assert.match(labRootSource, /function requestBootOverlayInteractiveUnlock\(\)/);
  assert.match(labRootSource, /requestIdleCallback/);
  assert.match(labRootSource, /function scheduleStoreSideEffects\(state: LabStoreState\)/);
  assert.match(
    labRootSource,
    /requestAnimationFrame\(function \(\) \{\s*storeSideEffectsFrame = null;\s*runStoreSideEffects\(\);/
  );
  assert.match(labRootSource, /function flushStoreSideEffects\(\)/);
  assert.match(labRootSource, /windowRef\.addEventListener\("beforeunload", handleBeforeUnload\);/);
  assert.match(
    labRootSource,
    /store\.subscribe\(function \(state\) \{\s*scheduleStoreSideEffects\(state\);/
  );
  assert.match(labRootSource, /const bootstrapStatus = getBootOverlayBootstrapStatus\(state\);/);
  assert.match(labRootSource, /bootstrapStatus === "ready" \|\| bootstrapStatus === "error"/);
  assert.match(labRootSource, /!hasRoomReadyBridge\(\)/);
  assert.doesNotMatch(labRootSource, /state\.roomReadySent \|\| !hasRoomReadyBridge\(\)/);
  assert.match(
    labRootSource,
    /shell\.dataset\["ready"\] = isBootOverlayActive\(state\) \? "false" : "true";/
  );
  assert.match(labRootSource, /bootBootstrapSeen = true;/);
  assert.match(labRootSource, /scheduleBootOverlayUnlock\(state\);/);
  assert.match(labRootSource, /renderToolManagementOverlay\(state, copy\)/);
  assert.match(labRootSource, /emit:\s*eventBus\.emit,/);
  assert.match(
    labRootSource,
    /roomAPI\.ready\(\{\s*feature:\s*"media-analysis",\s*room:\s*"laboratory",\s*stage:\s*"ui-ready"/
  );
  assert.doesNotMatch(labRootSource, /BOOT_MESSAGES/);
  assert.doesNotMatch(labRootSource, /startBootMessages/);
  assert.doesNotMatch(labRootSource, /stopBootMessages/);
  assert.match(labLayoutSource, /renderToolManagementOverlay\(state, copy\)/);
  assert.match(labLayoutSource, /data-lab-boot-overlay="true"/);
  assert.match(hostBridgeSource, /type === "source-state"/);
  assert.match(hostBridgeSource, /type:\s*"source-snapshot-received"/);
  assert.match(hostBridgeSource, /type === "lab-event"/);
  assert.doesNotMatch(hostBridgeSource, /buildLifecycleEventsFromHostEvent/);
});

void test("laboratory mounted shell keeps chrome when YouTube is selected as a source mode", async () => {
  const environment = createMountedLaboratoryTransitionEnvironment();

  try {
    await import(
      `${pathToFileURL(resolve("rooms/laboratory/ui/lab-root.ts")).href}?mountedImport=${Date.now()}`
    );

    assert.deepEqual(environment.readyPayload(), {
      feature: "media-analysis",
      room: "laboratory",
      stage: "ui-ready",
    });
    assert.match(environment.runtimeRoot.innerHTML, /data-layout-kind="laboratory"/);
    assert.match(environment.runtimeRoot.innerHTML, /data-ready="false"/);
    assert.match(environment.runtimeRoot.innerHTML, /class="labx-top-bar"/);
    assert.match(environment.runtimeRoot.innerHTML, /class="labx-drawer labx-context-panel"/);
    assert.match(environment.runtimeRoot.innerHTML, /class="labx-process-strip"/);

    environment.runtimeRoot.mountedQueriesEnabled = true;

    const clickListener = environment.listener("click");
    assert.ok(clickListener);
    clickListener({
      target: new MountedActionElement("analysis-prep-group-drawer-toggle", "audio-signal"),
    } as unknown as Event);
    assert.match(environment.runtimeRoot.innerHTML, /data-lab-value="audio-signal"/);
    assert.match(
      environment.runtimeRoot.innerHTML,
      /data-lab-value="audio-signal"[\s\S]*aria-expanded="true"/
    );

    clickListener({
      target: new MountedActionElement("analysis-prep-group-drawer-toggle", "audio-signal"),
    } as unknown as Event);
    assert.match(
      environment.runtimeRoot.innerHTML,
      /data-lab-value="audio-signal"[\s\S]*aria-expanded="false"/
    );

    const changeListener = environment.listener("change");
    assert.ok(changeListener);
    changeListener({
      target: new MountedSelectElement("source.mode", "youtube"),
    } as unknown as Event);

    assert.match(environment.runtimeRoot.innerHTML, /data-layout-kind="laboratory"/);
    assert.match(environment.runtimeRoot.innerHTML, /class="labx-top-bar"/);
    assert.match(environment.runtimeRoot.innerHTML, /class="labx-drawer labx-context-panel"/);
    assert.match(environment.runtimeRoot.innerHTML, /class="labx-process-strip"/);
    assert.doesNotMatch(environment.runtimeRoot.innerHTML, /class="labx-import-workspace"/);
    assert.doesNotMatch(
      environment.runtimeRoot.innerHTML,
      /data-lab-action="exit-youtube-import-mode"/
    );
  } finally {
    environment.restore();
  }
});

