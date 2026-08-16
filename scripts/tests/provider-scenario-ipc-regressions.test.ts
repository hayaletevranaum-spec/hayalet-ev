import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ProviderTester } from "../../electron/provider-tester/index.ts";
import type { WebviewTag } from "../../electron/provider-tester/types.ts";

const preloadPath = "electron/preload.cjs";
const handlerPath = "electron/handlers/ipc-provider.ts";
const testerPath = "electron/provider-tester/index.ts";
const globalTypesPath = "src/js/global.d.ts";
const scenarioRunnerPath = "electron/provider-tester/scenario-runner.ts";
const testerTypesPath = "electron/provider-tester/types.ts";
const testerUtilsPath = "electron/provider-tester/utils.ts";
const testerInteractivePath = "electron/provider-tester/interactive-tests.ts";
const sharedScenarioPath = "src/js/modules/webview/providers/shared/scenarios.ts";
const pathsPath = "electron/paths.ts";
const opencodeServerManagerPath = "electron/opencode-server-manager.ts";

void test("preload exposes generic provider scenario APIs alongside test compatibility aliases", () => {
  const content = readFileSync(preloadPath, "utf8");

  assert.match(
    content,
    /runProviderScenario:\s*\(params\) => ipcRenderer\.invoke\("run-provider-scenario", params\)/
  );
  assert.match(
    content,
    /cancelProviderScenario:\s*\(params\) => ipcRenderer\.invoke\("cancel-provider-scenario", params\)/
  );
  assert.match(content, /onProviderScenarioProgress:\s*\(callback\) =>/);
  assert.match(
    content,
    /testProvider:\s*\(params\) => ipcRenderer\.invoke\("test-provider", params\)/
  );
});

void test("ipc provider handler registers a generic scenario entry point", () => {
  const content = readFileSync(handlerPath, "utf8");

  assert.match(content, /registerHandler\("run-provider-scenario"/);
  assert.match(content, /registerHandler\(\s*"cancel-provider-scenario"/);
  assert.match(content, /registerHandler\("test-provider"/);
  assert.match(content, /activeScenarioRuns = new Map<string, AbortController>\(\)/);
  assert.match(content, /abortSignal:\s*abortController\.signal/);
  assert.match(content, /syncMode: request\.syncMode \?\? "full"/);
  assert.match(content, /defaultUrlOverride/);
  assert.match(
    content,
    /scenarioId === "webview-test" && slot === "ai0" && providerId === "opencode-ui"/
  );
  assert.match(content, /const results = await tester\.runScenario\(scenarioId\);/);
  assert.doesNotMatch(content, /runTestSuite\(/);
});

void test("provider config paths resolve against the projected source tree for packaged mirrors", () => {
  const content = readFileSync(pathsPath, "utf8");

  assert.match(
    content,
    /return join\(cfg\.projectRoot, "src\/js\/modules\/webview\/providers", providerId, "config\.ts"\);/
  );
});

void test("opencode serve startup assigns the project root as the default workspace", () => {
  const content = readFileSync(opencodeServerManagerPath, "utf8");

  assert.match(content, /const workspacePath = Paths\.getProjectRoot\(\)\.trim\(\)/);
  assert.match(content, /args\.push\(workspacePath\)/);
  assert.match(content, /cwd: workspacePath/);
});

void test("provider tester exposes a scenario-oriented entry point", () => {
  const content = readFileSync(testerPath, "utf8");

  assert.match(content, /async runScenario\(/);
  assert.match(content, /scenarioId/);
});

void test("runtime-loaded provider scenario sources avoid tsconfig alias imports", () => {
  const dynamicSourceFiles = [
    testerPath,
    scenarioRunnerPath,
    testerTypesPath,
    testerUtilsPath,
    testerInteractivePath,
    sharedScenarioPath,
  ];

  for (const filePath of dynamicSourceFiles) {
    const content = readFileSync(filePath, "utf8");
    assert.doesNotMatch(content, /from "@timeouts"/, `${filePath} should use runtime-safe imports`);
  }
});

void test("provider tester resolves webview-test from provider config scenario definitions", async () => {
  const executed: string[] = [];

  const fakeWebview = {
    getURL: () => "https://chatgpt.com/c/test",
    loadURL: async () => {},
    executeJavaScript: () => null,
    addEventListener: () => {},
  };

  const config = {
    id: "chatgpt",
    name: "ChatGPT",
    baseUrl: "https://chatgpt.com",
    loginUrl: "https://chatgpt.com/auth/login",
    lastVerified: "2026-03-07",
    selectors: {
      sendButton: "button",
      stopButton: "button.stop",
      inputField: "textarea",
      messageContainer: "main",
    },
    inputType: "direct",
    scrollerSelectors: [],
    scrapeSelectors: {
      preferred: "main",
      fallback: "main",
    },
    fileInputSelectors: [],
    uploadTargetSelectors: [],
    criticalSelectors: [],
    contentContainers: [],
    excludedUrls: [],
    filters: {
      selectors: [],
      hosts: [],
      blockResourceTypes: [],
    },
    telemetry: {
      endpoints: [],
      tokenPaths: [],
    },
    scenarios: {
      webviewTest: {
        id: "webview-test",
        title: "Injected Scenario",
        commands: [
          {
            id: "first-custom-step",
            label: "Injected Reset",
            action: "navigate-default",
            onFail: "abort",
          },
          {
            id: "last-custom-step",
            label: "Injected Capabilities",
            action: "assert-provider-capabilities",
            onFail: "warn",
          },
        ],
      },
    },
  };

  const tester = new ProviderTester(fakeWebview as unknown as WebviewTag, config as never, "ai1");
  const testerOverrides = tester as unknown as Record<string, () => Promise<unknown>>;

  testerOverrides["runResetDefaultPageStep"] = async () => {
    await Promise.resolve();
    executed.push("navigate-default");
    return { status: "pass", message: "reset ok" };
  };
  testerOverrides["runDisabledSendStep"] = async () => {
    await Promise.resolve();
    executed.push("unexpected-disabled-send");
    return { status: "pass", message: "unexpected" };
  };
  testerOverrides["runDragDropStep"] = async () => {
    await Promise.resolve();
    executed.push("unexpected-drag-drop");
    return { status: "pass", message: "unexpected" };
  };
  testerOverrides["runInjectMessageStep"] = async () => {
    await Promise.resolve();
    executed.push("unexpected-inject-message");
    return { status: "pass", message: "unexpected" };
  };
  testerOverrides["runEnabledSendStep"] = async () => {
    await Promise.resolve();
    executed.push("unexpected-enabled-send");
    return { status: "pass", message: "unexpected" };
  };
  testerOverrides["runAttachFileStep"] = async () => {
    await Promise.resolve();
    executed.push("unexpected-attach-file");
    return { status: "pass", message: "unexpected" };
  };
  testerOverrides["runSendThinkingStep"] = async () => {
    await Promise.resolve();
    executed.push("unexpected-send-thinking");
    return { status: "pass", message: "unexpected" };
  };
  testerOverrides["runFinalBubblesStep"] = async () => {
    await Promise.resolve();
    executed.push("unexpected-final-bubbles");
    return { status: "pass", message: "unexpected" };
  };
  testerOverrides["runScrollStep"] = async () => {
    await Promise.resolve();
    executed.push("unexpected-scroll-behavior");
    return { status: "pass", message: "unexpected" };
  };
  testerOverrides["runProviderCapabilitiesStep"] = async () => {
    await Promise.resolve();
    executed.push("assert-provider-capabilities");
    return { status: "warning", message: "capabilities warning" };
  };

  const result = await tester.runScenario("webview-test");

  assert.deepEqual(executed, ["navigate-default", "assert-provider-capabilities"]);
  assert.deepEqual(
    result.commands.map((command) => [command.id, command.name, command.status]),
    [
      ["first-custom-step", "Injected Reset", "pass"],
      ["last-custom-step", "Injected Capabilities", "warning"],
    ]
  );
});

void test("provider tester dispatches generated image archive scenario actions", async () => {
  const executed: string[] = [];
  const fakeWebview = {
    getURL: () => "https://chatgpt.com/c/test",
    loadURL: async () => {},
    executeJavaScript: () => null,
    addEventListener: () => {},
  };

  const config = {
    id: "chatgpt",
    name: "ChatGPT",
    baseUrl: "https://chatgpt.com",
    loginUrl: "https://chatgpt.com/auth/login",
    lastVerified: "2026-03-31",
    selectors: {
      sendButton: "button",
      stopButton: "button.stop",
      inputField: "textarea",
      messageContainer: "main",
      generatedImage: "img.generated",
    },
    inputType: "direct",
    scrollerSelectors: [],
    scrapeSelectors: {
      preferred: "main",
      fallback: "main",
    },
    fileInputSelectors: [],
    uploadTargetSelectors: [],
    criticalSelectors: [],
    contentContainers: [],
    excludedUrls: [],
    filters: {
      selectors: [],
      hosts: [],
      blockResourceTypes: [],
    },
    telemetry: {
      endpoints: [],
      tokenPaths: [],
    },
    scenarios: {
      webviewTest: {
        id: "webview-test",
        title: "Archive Scenario",
        commands: [
          {
            id: "generated-image-archive",
            label: "Generated Image Archive",
            action: "assert-generated-image-archive",
            onFail: "warn",
          },
        ],
      },
    },
  };

  const tester = new ProviderTester(fakeWebview as unknown as WebviewTag, config as never, "ai1");
  const testerOverrides = tester as unknown as Record<string, () => Promise<unknown>>;
  testerOverrides["runGeneratedImageArchiveStep"] = async () => {
    await Promise.resolve();
    executed.push("assert-generated-image-archive");
    return { status: "pass", message: "archive ok" };
  };

  const result = await tester.runScenario("webview-test");

  assert.deepEqual(executed, ["assert-generated-image-archive"]);
  assert.deepEqual(
    result.commands.map((command) => [command.id, command.status]),
    [["generated-image-archive", "pass"]]
  );
});

void test("provider tester uses default URL override for opencode-ui reset step", async () => {
  const loadedUrls: string[] = [];
  const fakeWebview = {
    getURL: () => "/pages/opencode-ui.html?port=4096&resumeSessionId=session-42",
    loadURL: (url: string) => {
      loadedUrls.push(url);
    },
    executeJavaScript: () => null,
    addEventListener: () => {},
  };

  const config = {
    id: "opencode-ui",
    name: "OpenCode UI",
    baseUrl: "http://127.0.0.1:4096",
    loginUrl: null,
    lastVerified: "2026-03-08",
    selectors: {
      sendButton: "#send-btn",
      stopButton: '#send-btn[data-mode="stop"]',
      inputField: "#chat-input",
      messageContainer: "#chat-messages",
    },
    inputType: "direct",
    scrollerSelectors: [],
    scrapeSelectors: {
      preferred: ".ds-message",
      fallback: ".ds-message__bubble",
    },
    fileInputSelectors: [],
    uploadTargetSelectors: [],
    criticalSelectors: [],
    contentContainers: [],
    excludedUrls: [],
    filters: {
      selectors: [],
      hosts: [],
      blockResourceTypes: [],
    },
    telemetry: {
      endpoints: [],
      tokenPaths: [],
    },
    scenarios: {
      webviewTest: {
        id: "webview-test",
        title: "OpenCode UI Scenario",
        commands: [],
      },
    },
  };

  const tester = new ProviderTester(fakeWebview as unknown as WebviewTag, config as never, "ai0", undefined, {
    emitProgress: undefined,
    defaultUrlOverride: "/pages/opencode-ui.html?port=4096&resumeSessionId=session-42",
    navigationObservationDelayMs: 0,
  });
  const testerOverrides = tester as unknown as {
    observeLoadingIndicatorAfterNavigation: () => Promise<"busy" | "idle" | "missing">;
    runResetDefaultPageStep: () => Promise<{ status: string; message: string }>;
  };
  testerOverrides.observeLoadingIndicatorAfterNavigation = async () => {
    await Promise.resolve();
    return "idle" as const;
  };

  const result = await testerOverrides.runResetDefaultPageStep();

  assert.equal(result.status, "pass");
  assert.deepEqual(loadedUrls, ["/pages/opencode-ui.html?port=4096&resumeSessionId=session-42"]);
});

void test("provider tester runs webview-sync sidebar collection actions from provider config", async () => {
  let sidebarOpen = false;
  let currentUrl = "https://chatgpt.com/c/current";
  const loadedUrls: string[] = [];
  const loadingObservations: string[] = [];
  const progressMessages: string[] = [];
  const syncCalls: string[] = [];

  const fakeWebview = {
    getURL: () => currentUrl,
    loadURL: (url: string) => {
      loadedUrls.push(url);
      currentUrl = url;
    },
    executeJavaScript: (script: string) => {
      if (script.includes("syncSidebarProbe")) {
        const wasOpen = sidebarOpen;
        sidebarOpen = true;
        return {
          syncSidebarProbe: true,
          closeVisible: wasOpen,
          openFound: true,
          clickedOpen: !wasOpen,
        };
      }

      if (script.includes("syncHistorySessions")) {
        return {
          syncHistorySessions: true,
          sessions: [
            { title: "First chat", url: "/c/abc" },
            { title: "Second chat", url: "https://chatgpt.com/c/def" },
            { title: "First chat", url: "/c/abc" },
          ],
        };
      }

      return null;
    },
    addEventListener: () => {},
  };

  const config = {
    id: "chatgpt",
    name: "ChatGPT",
    baseUrl: "https://chatgpt.com",
    loginUrl: "https://chatgpt.com/auth/login",
    lastVerified: "2026-03-07",
    selectors: {
      sendButton: "button",
      stopButton: "button.stop",
      inputField: "textarea",
      messageContainer: "main",
    },
    inputType: "direct",
    scrollerSelectors: [],
    scrapeSelectors: {
      preferred: "main",
      fallback: "main",
    },
    fileInputSelectors: [],
    uploadTargetSelectors: [],
    criticalSelectors: [],
    contentContainers: [],
    excludedUrls: [],
    filters: {
      selectors: [],
      hosts: [],
      blockResourceTypes: [],
    },
    telemetry: {
      endpoints: [],
      tokenPaths: [],
    },
    webviewSync: {
      readiness: "verified",
      sidebar: {
        openButtonSelectors: ['button[data-testid="open-sidebar-button"]'],
        closeButtonSelectors: ['button[data-testid="close-sidebar-button"]'],
      },
      history: {
        containerSelectors: ["#history"],
        itemSelectors: ['#history a[href^="/c/"]'],
        titleSelectors: ['span[dir="auto"]'],
      },
    },
    scenarios: {
      webviewSync: {
        id: "webview-sync",
        title: "Injected Sync",
        commands: [
          {
            id: "open-sidebar-click",
            label: "Open Sidebar Click",
            action: "click",
            target: "sync-sidebar-open-button",
            onFail: "abort",
          },
          {
            id: "wait-sidebar-ready",
            label: "Wait Sidebar Ready",
            action: "wait",
            target: "sync-sidebar-ready",
            params: { timeoutMs: 3000 },
            onFail: "abort",
          },
          {
            id: "check-sidebar-ready",
            label: "Check Sidebar Ready",
            action: "check",
            target: "sync-sidebar-ready",
            onFail: "abort",
          },
          {
            id: "collect-session-urls",
            label: "Collect Session Urls",
            action: "collect-session-urls",
            saveAs: "syncSessions",
            onFail: "abort",
          },
          {
            id: "soft-sync-session",
            label: "Soft Sync Session",
            action: "sync-session",
            forEach: "syncSessions",
            params: { mode: "soft" },
            whenSyncModes: ["soft", "full", "clean"],
            onFail: "abort",
          },
          {
            id: "navigate-session",
            label: "Navigate Session",
            action: "navigate",
            forEach: "syncSessions",
            whenSyncModes: ["full", "clean"],
            onFail: "abort",
          },
          {
            id: "sync-session",
            label: "Sync Session",
            action: "sync-session",
            forEach: "syncSessions",
            params: { modeSource: "syncMode" },
            whenSyncModes: ["full", "clean"],
            onFail: "abort",
          },
          {
            id: "refresh-conversation-list",
            label: "Refresh Conversation List",
            action: "refresh-conversation-list",
            onFail: "abort",
          },
        ],
      },
    },
  };

  const tester = new ProviderTester(fakeWebview as unknown as WebviewTag, config as never, "ai1", undefined, {
    emitProgress: (event) => {
      if (
        event.type === "command-start" &&
        (event.commandId?.startsWith("navigate-session") ?? false)
      ) {
        progressMessages.push(event.message ?? "");
      }
    },
    commandStartDelayMs: 0,
    navigationObservationDelayMs: 0,
  });
  const testerOverrides = tester as unknown as {
    observeLoadingIndicatorAfterNavigation: () => Promise<"busy" | "idle" | "missing">;
    runSoftSyncForSession: (session: {
      url: string;
    }) => Promise<{ status: string; message: string }>;
    runFullSyncForSession: (session: {
      url: string;
    }) => Promise<{ status: string; message: string }>;
  };
  testerOverrides.observeLoadingIndicatorAfterNavigation = async () => {
    await Promise.resolve();
    loadingObservations.push("busy");
    return "busy" as const;
  };
  testerOverrides.runSoftSyncForSession = async (session) => {
    await Promise.resolve();
    syncCalls.push(`soft:${session.url}`);
    return { status: "pass", message: "soft ok" };
  };
  testerOverrides.runFullSyncForSession = async (session) => {
    await Promise.resolve();
    syncCalls.push(`full:${session.url}`);
    return { status: "pass", message: "full ok" };
  };
  const result = await tester.runScenario("webview-sync");
  assert.deepEqual(
    result.commands.map((command) => [command.id, command.status]),
    [
      ["open-sidebar-click", "pass"],
      ["wait-sidebar-ready", "pass"],
      ["check-sidebar-ready", "pass"],
      ["collect-session-urls", "pass"],
      ["soft-sync-session-1", "pass"],
      ["soft-sync-session-2", "pass"],
      ["navigate-session-1", "pass"],
      ["navigate-session-2", "pass"],
      ["sync-session-1", "pass"],
      ["sync-session-2", "pass"],
      ["refresh-conversation-list", "pass"],
    ]
  );
  assert.equal(result.failed, 0);
  assert.deepEqual(loadedUrls, ["https://chatgpt.com/c/abc", "https://chatgpt.com/c/def"]);
  assert.deepEqual(syncCalls, [
    "soft:https://chatgpt.com/c/abc",
    "soft:https://chatgpt.com/c/def",
    "full:https://chatgpt.com/c/abc",
    "full:https://chatgpt.com/c/def",
  ]);
  assert.deepEqual(loadingObservations, ["busy", "busy"]);
  assert.match(
    result.results[0]?.message ?? "",
    /Sidebar open button clicked|Sidebar became visible|Sidebar already open|Kenar çubuğu açma butonuna tıklandı|Kenar çubuğu görünür hale geldi|Kenar çubuğu zaten açık/
  );
  assert.match(result.results[1]?.message ?? "", /Sidebar ready|Kenar çubuğu hazır/);
  assert.match(
    result.results[2]?.message ?? "",
    /Sidebar is visible|Sidebar ready check passed|Kenar çubuğu görünür/
  );
  assert.match(
    result.results[3]?.message ?? "",
    /Collected 2 visible sessions|2 görünür session toplandı/
  );
  assert.equal(result.results[4]?.message, "soft ok");
  assert.equal(result.results[5]?.message, "soft ok");
  assert.match(result.results[6]?.message ?? "", /Opened First chat|First chat açıldı/);
  assert.match(
    result.results[6]?.message ?? "",
    /loading indicator settled as busy|loading göstergesi busy durumunda sakinleşti/
  );
  assert.equal(result.results[8]?.message, "full ok");
  assert.match(
    result.results[10]?.message ?? "",
    /Conversation list refreshed|Konuşma listesi yenilendi/
  );
  assert.deepEqual(progressMessages, [
    "Navigate Session 1/2 - First chat",
    "Navigate Session 2/2 - Second chat",
  ]);
  assert.deepEqual(result.results[3]?.details?.sessionPreview, {
    total: 2,
    sessions: [
      { title: "First chat", url: "https://chatgpt.com/c/abc" },
      { title: "Second chat", url: "https://chatgpt.com/c/def" },
    ],
  });
  assert.equal(result.commands.length, 11);
});

void test("provider tester waits for navigation settle delay after loading becomes idle", async () => {
  const fakeWebview = {
    getURL: () => "https://chatgpt.com/c/test",
    loadURL: () => {},
    executeJavaScript: () => null,
    addEventListener: () => {},
  };

  const config = {
    id: "chatgpt",
    name: "ChatGPT",
    baseUrl: "https://chatgpt.com",
    loginUrl: "https://chatgpt.com/auth/login",
    lastVerified: "2026-03-07",
    selectors: {
      sendButton: "button",
      stopButton: "button.stop",
      inputField: "textarea",
      messageContainer: "main",
    },
    inputType: "direct",
    scrollerSelectors: [],
    scrapeSelectors: {
      preferred: "main",
      fallback: "main",
    },
    fileInputSelectors: [],
    uploadTargetSelectors: [],
    criticalSelectors: [],
    contentContainers: [],
    excludedUrls: [],
    filters: {
      selectors: [],
      hosts: [],
      blockResourceTypes: [],
    },
    telemetry: {
      endpoints: [],
      tokenPaths: [],
    },
  };

  const tester = new ProviderTester(
    fakeWebview as unknown as WebviewTag,
    config as never,
    "ai1",
    {} as never,
    {
      emitProgress: undefined,
      navigationObservationDelayMs: 25,
    }
  );
  const testerOverrides = tester as unknown as {
    observeLoadingIndicatorAfterNavigation: () => Promise<"busy" | "idle" | "missing">;
    readShellIndicator: () => Promise<"busy" | "idle" | "missing">;
  };
  const states: Array<"busy" | "idle"> = ["busy", "idle"];
  testerOverrides.readShellIndicator = async () => {
    await Promise.resolve();
    return states.shift() ?? "idle";
  };

  const startedAt = Date.now();
  const state = await testerOverrides.observeLoadingIndicatorAfterNavigation();
  const elapsedMs = Date.now() - startedAt;

  assert.equal(state, "idle");
  assert.ok(elapsedMs >= 110, `expected at least 110ms settle wait, got ${elapsedMs}ms`);
});

void test("provider tester rejects webview-sync for estimated provider configs", async () => {
  const fakeWebview = {
    getURL: () => "https://gemini.google.com/app/test",
    loadURL: async () => {},
    executeJavaScript: () => null,
    addEventListener: () => {},
  };

  const config = {
    id: "gemini",
    name: "Gemini",
    baseUrl: "https://gemini.google.com",
    loginUrl: "https://accounts.google.com",
    lastVerified: "2026-03-07",
    selectors: {
      sendButton: "button",
      stopButton: "button.stop",
      inputField: "textarea",
      messageContainer: "main",
    },
    inputType: "direct",
    scrollerSelectors: [],
    scrapeSelectors: {
      preferred: "main",
      fallback: "main",
    },
    fileInputSelectors: [],
    uploadTargetSelectors: [],
    criticalSelectors: [],
    contentContainers: [],
    excludedUrls: [],
    filters: {
      selectors: [],
      hosts: [],
      blockResourceTypes: [],
    },
    telemetry: {
      endpoints: [],
      tokenPaths: [],
    },
    webviewSync: {
      readiness: "estimated",
      sidebar: {
        openButtonSelectors: ["button"],
        closeButtonSelectors: ["button.close"],
      },
      history: {
        containerSelectors: ["nav"],
        itemSelectors: ["nav a"],
        titleSelectors: ["span"],
      },
    },
    scenarios: {
      webviewSync: {
        id: "webview-sync",
        title: "Estimated Sync",
        commands: [
          {
            id: "open-sidebar-click",
            label: "Open Sidebar Click",
            action: "click",
            target: "sync-sidebar-open-button",
            onFail: "abort",
          },
        ],
      },
    },
  };

  const tester = new ProviderTester(fakeWebview as unknown as WebviewTag, config as never, "ai1");

  await assert.rejects(
    async () => await tester.runScenario("webview-sync"),
    /webview-sync is not verified|webview-sync doğrulanmamış/
  );
});

void test("provider tester runs the selected sync mode after opening each session URL", async () => {
  let sidebarOpen = false;
  let currentUrl = "https://chatgpt.com/c/current";
  const syncCalls: string[] = [];

  const fakeWebview = {
    getURL: () => currentUrl,
    loadURL: (url: string) => {
      currentUrl = url;
    },
    executeJavaScript: (script: string) => {
      if (script.includes("syncSidebarProbe")) {
        const wasOpen = sidebarOpen;
        sidebarOpen = true;
        return {
          syncSidebarProbe: true,
          closeVisible: wasOpen,
          openFound: true,
          clickedOpen: !wasOpen,
        };
      }

      if (script.includes("syncHistorySessions")) {
        return {
          syncHistorySessions: true,
          sessions: [
            { title: "First chat", url: "/c/abc" },
            { title: "Second chat", url: "/c/def" },
          ],
        };
      }

      return null;
    },
    addEventListener: () => {},
  };

  const config = {
    id: "chatgpt",
    name: "ChatGPT",
    baseUrl: "https://chatgpt.com",
    loginUrl: "https://chatgpt.com/auth/login",
    lastVerified: "2026-03-07",
    selectors: {
      sendButton: "button",
      stopButton: "button.stop",
      inputField: "textarea",
      messageContainer: "main",
    },
    inputType: "direct",
    scrollerSelectors: [],
    scrapeSelectors: {
      preferred: "main",
      fallback: "main",
    },
    fileInputSelectors: [],
    uploadTargetSelectors: [],
    criticalSelectors: [],
    contentContainers: [],
    excludedUrls: [],
    filters: {
      selectors: [],
      hosts: [],
      blockResourceTypes: [],
    },
    telemetry: {
      endpoints: [],
      tokenPaths: [],
    },
    webviewSync: {
      readiness: "verified",
      sidebar: {
        openButtonSelectors: ['button[data-testid="open-sidebar-button"]'],
        closeButtonSelectors: ['button[data-testid="close-sidebar-button"]'],
      },
      history: {
        containerSelectors: ["#history"],
        itemSelectors: ['#history a[href^="/c/"]'],
        titleSelectors: ['span[dir="auto"]'],
      },
    },
    scenarios: {
      webviewSync: {
        id: "webview-sync",
        title: "Injected Sync",
        commands: [
          {
            id: "open-sidebar-click",
            label: "Open Sidebar Click",
            action: "click",
            target: "sync-sidebar-open-button",
            onFail: "abort",
          },
          {
            id: "wait-sidebar-ready",
            label: "Wait Sidebar Ready",
            action: "wait",
            target: "sync-sidebar-ready",
            params: { timeoutMs: 3000 },
            onFail: "abort",
          },
          {
            id: "check-sidebar-ready",
            label: "Check Sidebar Ready",
            action: "check",
            target: "sync-sidebar-ready",
            onFail: "abort",
          },
          {
            id: "collect-session-urls",
            label: "Collect Session Urls",
            action: "collect-session-urls",
            saveAs: "syncSessions",
            onFail: "abort",
          },
          {
            id: "soft-sync-session",
            label: "Soft Sync Session",
            action: "sync-session",
            forEach: "syncSessions",
            params: { mode: "soft" },
            whenSyncModes: ["soft", "full", "clean"],
            onFail: "abort",
          },
          {
            id: "navigate-session",
            label: "Navigate Session",
            action: "navigate",
            forEach: "syncSessions",
            whenSyncModes: ["full", "clean"],
            onFail: "abort",
          },
          {
            id: "sync-session",
            label: "Sync Session",
            action: "sync-session",
            forEach: "syncSessions",
            params: { modeSource: "syncMode" },
            whenSyncModes: ["full", "clean"],
            onFail: "abort",
          },
          {
            id: "refresh-conversation-list",
            label: "Refresh Conversation List",
            action: "refresh-conversation-list",
            onFail: "abort",
          },
        ],
      },
    },
  };

  const tester = new ProviderTester(fakeWebview as unknown as WebviewTag, config as never, "ai1", undefined, {
    emitProgress: undefined,
    syncMode: "clean",
    commandStartDelayMs: 0,
    navigationObservationDelayMs: 0,
  });
  const testerOverrides = tester as unknown as {
    observeLoadingIndicatorAfterNavigation: () => Promise<"busy" | "idle" | "missing">;
    runSoftSyncForSession: (session: {
      url: string;
    }) => Promise<{ status: string; message: string }>;
    runFullSyncForSession: (session: {
      url: string;
    }) => Promise<{ status: string; message: string }>;
    runCleanSyncForSession: (session: {
      url: string;
    }) => Promise<{ status: string; message: string }>;
  };
  testerOverrides.observeLoadingIndicatorAfterNavigation = async () => {
    await Promise.resolve();
    return "idle" as const;
  };
  testerOverrides.runSoftSyncForSession = async (session) => {
    await Promise.resolve();
    syncCalls.push(`soft:${session.url}`);
    return { status: "pass", message: "soft ok" };
  };
  testerOverrides.runFullSyncForSession = async (session) => {
    await Promise.resolve();
    syncCalls.push(`full:${session.url}`);
    return { status: "pass", message: "full ok" };
  };
  testerOverrides.runCleanSyncForSession = async (session) => {
    await Promise.resolve();
    syncCalls.push(`clean:${session.url}`);
    return { status: "pass", message: "clean ok" };
  };

  const result = await tester.runScenario("webview-sync");

  assert.deepEqual(syncCalls, [
    "soft:https://chatgpt.com/c/abc",
    "soft:https://chatgpt.com/c/def",
    "clean:https://chatgpt.com/c/abc",
    "clean:https://chatgpt.com/c/def",
  ]);
  assert.equal(
    result.results.filter((entry) => entry.message === "soft ok").length,
    2
  );
  assert.equal(
    result.results.filter((entry) => entry.message === "clean ok").length,
    2
  );
  assert.match(
    result.results.at(-1)?.message ?? "",
    /Conversation list refreshed|Konuşma listesi yenilendi/
  );
});

void test("provider tester skips navigation entirely during soft sync", async () => {
  let sidebarOpen = false;
  let currentUrl = "https://chatgpt.com/c/current";
  const callOrder: string[] = [];

  const fakeWebview = {
    getURL: () => currentUrl,
    loadURL: async (url: string) => {
      currentUrl = url;
      callOrder.push("load:start");
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          callOrder.push("load:resolve");
          resolve();
        }, 10);
      });
    },
    executeJavaScript: (script: string) => {
      if (script.includes("syncSidebarProbe")) {
        const wasOpen = sidebarOpen;
        sidebarOpen = true;
        return {
          syncSidebarProbe: true,
          closeVisible: wasOpen,
          openFound: true,
          clickedOpen: !wasOpen,
        };
      }

      if (script.includes("syncHistorySessions")) {
        return {
          syncHistorySessions: true,
          sessions: [{ title: "First chat", url: "/c/abc" }],
        };
      }

      return null;
    },
    addEventListener: () => {},
  };

  const config = {
    id: "chatgpt",
    name: "ChatGPT",
    baseUrl: "https://chatgpt.com",
    loginUrl: "https://chatgpt.com/auth/login",
    lastVerified: "2026-03-07",
    selectors: {
      sendButton: "button",
      stopButton: "button.stop",
      inputField: "textarea",
      messageContainer: "main",
    },
    inputType: "direct",
    scrollerSelectors: [],
    scrapeSelectors: {
      preferred: "main",
      fallback: "main",
    },
    fileInputSelectors: [],
    uploadTargetSelectors: [],
    criticalSelectors: [],
    contentContainers: [],
    excludedUrls: [],
    filters: {
      selectors: [],
      hosts: [],
      blockResourceTypes: [],
    },
    telemetry: {
      endpoints: [],
      tokenPaths: [],
    },
    webviewSync: {
      readiness: "verified",
      sidebar: {
        openButtonSelectors: ['button[data-testid="open-sidebar-button"]'],
        closeButtonSelectors: ['button[data-testid="close-sidebar-button"]'],
      },
      history: {
        containerSelectors: ["#history"],
        itemSelectors: ['#history a[href^="/c/"]'],
        titleSelectors: ['span[dir="auto"]'],
      },
    },
    scenarios: {
      webviewSync: {
        id: "webview-sync",
        title: "Injected Sync",
        commands: [
          {
            id: "open-sidebar-click",
            label: "Open Sidebar Click",
            action: "click",
            target: "sync-sidebar-open-button",
            onFail: "abort",
          },
          {
            id: "wait-sidebar-ready",
            label: "Wait Sidebar Ready",
            action: "wait",
            target: "sync-sidebar-ready",
            params: { timeoutMs: 3000 },
            onFail: "abort",
          },
          {
            id: "check-sidebar-ready",
            label: "Check Sidebar Ready",
            action: "check",
            target: "sync-sidebar-ready",
            onFail: "abort",
          },
          {
            id: "collect-session-urls",
            label: "Collect Session Urls",
            action: "collect-session-urls",
            saveAs: "syncSessions",
            onFail: "abort",
          },
          {
            id: "soft-sync-session",
            label: "Soft Sync Session",
            action: "sync-session",
            forEach: "syncSessions",
            params: { mode: "soft" },
            whenSyncModes: ["soft", "full", "clean"],
            onFail: "abort",
          },
          {
            id: "navigate-session",
            label: "Navigate Session",
            action: "navigate",
            forEach: "syncSessions",
            whenSyncModes: ["full", "clean"],
            onFail: "abort",
          },
          {
            id: "sync-session",
            label: "Sync Session",
            action: "sync-session",
            forEach: "syncSessions",
            params: { modeSource: "syncMode" },
            whenSyncModes: ["full", "clean"],
            onFail: "abort",
          },
          {
            id: "refresh-conversation-list",
            label: "Refresh Conversation List",
            action: "refresh-conversation-list",
            onFail: "abort",
          },
        ],
      },
    },
  };

  const tester = new ProviderTester(fakeWebview as unknown as WebviewTag, config as never, "ai1", undefined, {
    emitProgress: undefined,
    syncMode: "soft",
    commandStartDelayMs: 0,
    navigationObservationDelayMs: 0,
  });
  const testerOverrides = tester as unknown as {
    runSoftSyncForSession: (session: {
      url: string;
    }) => Promise<{ status: string; message: string }>;
  };
  testerOverrides.runSoftSyncForSession = async () => {
    await Promise.resolve();
    callOrder.push("soft-sync");
    return { status: "pass", message: "soft ok" };
  };

  await tester.runScenario("webview-sync");

  assert.deepEqual(callOrder, ["soft-sync"]);
  assert.equal(currentUrl, "https://chatgpt.com/c/current");
});

void test("provider tester refreshes metadata without changing the current page during soft sync", async () => {
  let sidebarOpen = false;
  let currentUrl = "https://chatgpt.com/c/current";
  const syncCalls: string[] = [];

  const fakeWebview = {
    getURL: () => currentUrl,
    loadURL: (url: string) => {
      currentUrl = url;
    },
    executeJavaScript: (script: string) => {
      if (script.includes("syncSidebarProbe")) {
        const wasOpen = sidebarOpen;
        sidebarOpen = true;
        return {
          syncSidebarProbe: true,
          closeVisible: wasOpen,
          openFound: true,
          clickedOpen: !wasOpen,
        };
      }

      if (script.includes("syncHistorySessions")) {
        return {
          syncHistorySessions: true,
          sessions: [{ title: "First chat", url: "/c/abc" }],
        };
      }

      return null;
    },
    addEventListener: () => {},
  };

  const config = {
    id: "chatgpt",
    name: "ChatGPT",
    baseUrl: "https://chatgpt.com",
    loginUrl: "https://chatgpt.com/auth/login",
    lastVerified: "2026-03-07",
    selectors: {
      sendButton: "button",
      stopButton: "button.stop",
      inputField: "textarea",
      messageContainer: "main",
    },
    inputType: "direct",
    scrollerSelectors: [],
    scrapeSelectors: {
      preferred: "main",
      fallback: "main",
    },
    fileInputSelectors: [],
    uploadTargetSelectors: [],
    criticalSelectors: [],
    contentContainers: [],
    excludedUrls: [],
    filters: {
      selectors: [],
      hosts: [],
      blockResourceTypes: [],
    },
    telemetry: {
      endpoints: [],
      tokenPaths: [],
    },
    webviewSync: {
      readiness: "verified",
      sidebar: {
        openButtonSelectors: ['button[data-testid="open-sidebar-button"]'],
        closeButtonSelectors: ['button[data-testid="close-sidebar-button"]'],
      },
      history: {
        containerSelectors: ["#history"],
        itemSelectors: ['#history a[href^="/c/"]'],
        titleSelectors: ['span[dir="auto"]'],
      },
    },
    scenarios: {
      webviewSync: {
        id: "webview-sync",
        title: "Injected Sync",
        commands: [
          {
            id: "open-sidebar-click",
            label: "Open Sidebar Click",
            action: "click",
            target: "sync-sidebar-open-button",
            onFail: "abort",
          },
          {
            id: "wait-sidebar-ready",
            label: "Wait Sidebar Ready",
            action: "wait",
            target: "sync-sidebar-ready",
            params: { timeoutMs: 3000 },
            onFail: "abort",
          },
          {
            id: "check-sidebar-ready",
            label: "Check Sidebar Ready",
            action: "check",
            target: "sync-sidebar-ready",
            onFail: "abort",
          },
          {
            id: "collect-session-urls",
            label: "Collect Session Urls",
            action: "collect-session-urls",
            saveAs: "syncSessions",
            onFail: "abort",
          },
          {
            id: "soft-sync-session",
            label: "Soft Sync Session",
            action: "sync-session",
            forEach: "syncSessions",
            params: { mode: "soft" },
            whenSyncModes: ["soft", "full", "clean"],
            onFail: "abort",
          },
          {
            id: "navigate-session",
            label: "Navigate Session",
            action: "navigate",
            forEach: "syncSessions",
            whenSyncModes: ["full", "clean"],
            onFail: "abort",
          },
          {
            id: "sync-session",
            label: "Sync Session",
            action: "sync-session",
            forEach: "syncSessions",
            params: { modeSource: "syncMode" },
            whenSyncModes: ["full", "clean"],
            onFail: "abort",
          },
          {
            id: "refresh-conversation-list",
            label: "Refresh Conversation List",
            action: "refresh-conversation-list",
            onFail: "abort",
          },
        ],
      },
    },
  };

  const tester = new ProviderTester(fakeWebview as unknown as WebviewTag, config as never, "ai1", undefined, {
    emitProgress: undefined,
    syncMode: "soft",
    commandStartDelayMs: 0,
    navigationObservationDelayMs: 0,
  });
  const testerOverrides = tester as unknown as {
    runSoftSyncForSession: (session: {
      url: string;
    }) => Promise<{ status: string; message: string }>;
  };
  testerOverrides.runSoftSyncForSession = async (session) => {
    await Promise.resolve();
    syncCalls.push(session.url);
    return { status: "pass", message: "soft ok" };
  };

  const result = await tester.runScenario("webview-sync");

  assert.deepEqual(syncCalls, ["https://chatgpt.com/c/abc"]);
  assert.equal(currentUrl, "https://chatgpt.com/c/current");
  assert.equal(result.commands[4]?.status, "pass");
  assert.equal(result.results[4]?.message, "soft ok");
  assert.match(
    result.results[5]?.message ?? "",
    /Conversation list refreshed|Konuşma listesi yenilendi/
  );
});

void test("renderer global types expose generic provider scenario APIs", () => {
  const content = readFileSync(globalTypesPath, "utf8");

  assert.match(content, /runProviderScenario:/);
  assert.match(content, /cancelProviderScenario:/);
  assert.match(content, /onProviderScenarioProgress:/);
});
