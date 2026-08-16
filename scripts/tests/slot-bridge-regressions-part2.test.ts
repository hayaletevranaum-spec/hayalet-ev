import assert from "node:assert/strict";
import test from "node:test";

const { slotBridgeHandler, slotBridgeRuntime } =
  await import("../../src/js/modules/commands/slot-bridge.ts");
const { RoomCommandRegistry } = await import("../../src/js/modules/rooms/room-command-registry.ts");
const { SlotController } = await import("../../src/js/modules/slot-controller.ts");
const { AppState } = await import("../../src/js/modules/app-state.ts");

const { SettingsManager } = await import("../../src/js/modules/settings-manager.ts");
const { TrafficManager } = await import("../../src/js/modules/traffic-manager.ts");

type ElectronApiMock = {
  us1SendMessage?: (params: Record<string, unknown>) => Promise<unknown>;
  us1SyncMessages?: (params?: Record<string, unknown>) => Promise<unknown>;
  dbGetMessages?: (query: Record<string, unknown>) => Promise<unknown>;
  dbGetAttachments?: (query: Record<string, unknown>) => Promise<unknown>;
};

type TestWindow = {
  electronAPI?: ElectronApiMock;
  location?: {
    href: string;
    origin: string;
    protocol: string;
  };
  setTimeout?: typeof setTimeout;
};

type SendBatchPayload = {
  targets?: string[];
  text?: string;
  page?: string;
  attachments?: Array<{ name: string; path: string }>;
  waitForCompletion?: boolean;
  clientRequestId?: string;
  brokerMessageId?: string;
};

type SendMessagePayload = {
  provider?: string;
  text?: string;
  page?: string;
  waitForCompletion?: boolean;
  clientRequestId?: string;
  brokerMessageId?: string;
};



function makeReadyTrafficState(lastHref: string) {
  return {
    status: { loading: "idle", thinking: "idle", send: "idle" },
    lastHref,
    lastSendSeen: 0,
    loadingActive: false,
    loadingFromDefaultTransition: false,
    loadingStartTime: 0,
    loadingScrollAppeared: false,
    lastScrollChange: 0,
    lastAutoScrollAt: 0,
    loadingJustEnded: false,
    loadingEndedAt: 0,
    stopButtonLastSeen: 0,
    stopButtonDisappearedAt: 0,
    thinkingJustEnded: false,
    thinkingEndedAt: 0,
    polling: false,
    readyState: "ready",
    sendState: "enabled",
    thinkingState: "idle",
  };
}

type SlotBridgeHarness = {
  appState: {
    getAccountForSlot: (slot: string) => { id: string; provider: string; email: string } | null;
    getArchiveAccountIdForProvider: (provider: string) => string | null;
    getProviderIdForSlot: (slot: string) => string | null;
    hasUs1Identity: () => boolean;
    isAssistantToolsReady: () => boolean;
    isAssigned: (slot: string) => boolean;
    isConnected: (slot: string) => boolean;
    isUs1Connected: () => boolean;
    setAssistantToolsReady: (ready: boolean) => void;
  };
  conversationListManager: {
    entries: Array<Record<string, unknown>>;
    refresh: (options?: Record<string, unknown>) => Promise<void>;
    updateSelection: (
      conversationId: string,
      options?: { provider?: string; silent?: boolean }
    ) => boolean;
  };
  coreEngine: {
    ensureReady: () => Promise<void>;
    setActiveTargets: (targets?: string[]) => void;
    sendBatchInternal: (
      payload?: SendBatchPayload
    ) => Promise<{ success: boolean; message?: string }>;
    sendMessageInternal: (
      payload: SendMessagePayload | null
    ) => Promise<{ success: boolean; message?: string }>;
    setConnection: (
      provider: string,
      connected: boolean,
      opts?: { force?: boolean; url?: string }
    ) => Promise<{ success: boolean; message?: string }>;
  };
  restore: () => void;
  runtime: {
    getConversationListManager: () => Promise<SlotBridgeHarness["conversationListManager"]>;
    getCoreEngine: () => Promise<SlotBridgeHarness["coreEngine"]>;
    getWebviewManager: () => Promise<SlotBridgeHarness["webviewManager"]>;
  };
  slotController: {
    connect: (
      slot: string,
      options?: { force?: boolean; url?: string }
    ) => Promise<{ success: boolean; message?: string }>;
    getState: (slot: string) => unknown;
    isConnected: (slot: string) => boolean;
    navigate: (slot: string, url: string | null) => void;
  };
  webviewManager: {
    syncProvider: (provider: string, opts?: Record<string, unknown>) => Promise<unknown>;
  };
  windowRef: TestWindow;
};

function createHarness(
  options: { immediateTimers?: boolean; nowStepMs?: number } = {}
): SlotBridgeHarness {
  const globalWithWindow = globalThis as { window?: TestWindow };
  const originalWindow = globalWithWindow.window;
  const originalDateNow = Date.now;
  const originalTrafficStates = {
    ai0: TrafficManager.state["ai0"],
    ai1: TrafficManager.state["ai1"],
    ai2: TrafficManager.state["ai2"],
    us1: TrafficManager.state["us1"],
  };

  const coreEngine: SlotBridgeHarness["coreEngine"] = {
    ensureReady: async () => {},
    setActiveTargets: async () => {},
    sendBatchInternal: async () => await Promise.resolve({ success: true }),
    sendMessageInternal: async () => await Promise.resolve({ success: true }),
    setConnection: async () => await Promise.resolve({ success: true }),
  };
  const webviewManager: SlotBridgeHarness["webviewManager"] = {
    syncProvider: async () => await Promise.resolve(null),
  };
  const conversationListManager: SlotBridgeHarness["conversationListManager"] = {
    entries: [],
    refresh: async () => {},
    updateSelection: () => true,
  };
  const slotController = SlotController as unknown as SlotBridgeHarness["slotController"];
  const appState = AppState as unknown as SlotBridgeHarness["appState"];
  const runtime = slotBridgeRuntime as unknown as SlotBridgeHarness["runtime"];

  const originalGetConversationListManager = runtime.getConversationListManager;
  const originalGetCoreEngine = runtime.getCoreEngine;
  const originalGetWebviewManager = runtime.getWebviewManager;
  const originalGetState = slotController.getState;
  const originalIsConnected = slotController.isConnected;
  const originalConnect = slotController.connect;
  const originalNavigate = slotController.navigate;
  const originalGetAccountForSlot = appState.getAccountForSlot;
  const originalGetArchiveAccountIdForProvider = appState.getArchiveAccountIdForProvider;
  const originalGetProviderIdForSlot = appState.getProviderIdForSlot;
  const originalHasUs1Identity = appState.hasUs1Identity;
  const originalIsAssistantToolsReady = appState.isAssistantToolsReady;
  const originalIsAssigned = appState.isAssigned;
  const originalAppStateIsConnected = appState.isConnected;
  const originalAppStateIsUs1Connected = appState.isUs1Connected;
  const originalSetAssistantToolsReady = appState.setAssistantToolsReady;

  let now = 0;
  const immediateSetTimeout = ((callback: TimerHandler, _delay?: number, ...args: unknown[]) => {
    if (typeof callback === "function") {
      (callback as (...args: unknown[]) => void)(...args);
    }
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as unknown as typeof setTimeout;

  globalWithWindow.window = {
    electronAPI: {},
    location: {
      href: "http://localhost:5174/",
      origin: "http://localhost:5174",
      protocol: "http:",
    },
    setTimeout: options.immediateTimers === true ? immediateSetTimeout : setTimeout,
  };

  if (options.immediateTimers === true) {
    Date.now = () => {
      now += options.nowStepMs ?? 100;
      return now;
    };
  }

  runtime.getConversationListManager = async () => await Promise.resolve(conversationListManager);
  runtime.getCoreEngine = async () => await Promise.resolve(coreEngine);
  runtime.getWebviewManager = async () => await Promise.resolve(webviewManager);
  slotController.getState = () => ({
    state: "connected",
    domReady: true,
    urlExcluded: false,
  });
  slotController.isConnected = () => true;
  slotController.connect = async () => await Promise.resolve({ success: true });
  slotController.navigate = () => {};
  appState.getAccountForSlot = (slot: string) => ({
    id: `acct-${slot}`,
    provider: slot,
    email: `${slot}@example.test`,
  });
  appState.getArchiveAccountIdForProvider = () => "acct-1";
  appState.getProviderIdForSlot = (slot: string) => slot;
  appState.hasUs1Identity = () => true;
  appState.isAssistantToolsReady = () => true;
  appState.isAssigned = () => true;
  appState.isConnected = () => true;
  appState.isUs1Connected = () => true;
  appState.setAssistantToolsReady = () => {};

  TrafficManager.state["ai0"] = makeReadyTrafficState("https://chatgpt.com/ai0");
  TrafficManager.state["ai1"] = makeReadyTrafficState("https://chatgpt.com/ai1");
  TrafficManager.state["ai2"] = makeReadyTrafficState("https://chatgpt.com/ai2");
  TrafficManager.state["us1"] = makeReadyTrafficState("https://mail.example.test/us1");

  return {
    appState,
    conversationListManager,
    coreEngine,
    restore: () => {
      runtime.getConversationListManager = originalGetConversationListManager;
      runtime.getCoreEngine = originalGetCoreEngine;
      runtime.getWebviewManager = originalGetWebviewManager;
      slotController.getState = originalGetState;
      slotController.isConnected = originalIsConnected;
      slotController.connect = originalConnect;
      slotController.navigate = originalNavigate;
      appState.getAccountForSlot = originalGetAccountForSlot;
      appState.getArchiveAccountIdForProvider = originalGetArchiveAccountIdForProvider;
      appState.getProviderIdForSlot = originalGetProviderIdForSlot;
      appState.hasUs1Identity = originalHasUs1Identity;
      appState.isAssistantToolsReady = originalIsAssistantToolsReady;
      appState.isAssigned = originalIsAssigned;
      appState.isConnected = originalAppStateIsConnected;
      appState.isUs1Connected = originalAppStateIsUs1Connected;
      appState.setAssistantToolsReady = originalSetAssistantToolsReady;
      TrafficManager.state["ai0"] = originalTrafficStates["ai0"]!;
      TrafficManager.state["ai1"] = originalTrafficStates["ai1"]!;
      TrafficManager.state["ai2"] = originalTrafficStates["ai2"]!;
      TrafficManager.state["us1"] = originalTrafficStates["us1"]!;
      Date.now = originalDateNow;

      if (originalWindow === undefined) {
        delete globalWithWindow.window;
      } else {
        globalWithWindow.window = originalWindow;
      }
    },
    runtime,
    slotController,
    webviewManager,
    windowRef: globalWithWindow.window,
  };
}

void test(
  "SlotBridge session.sync can include archived messages without re-running transport sync",
  { concurrency: false },
  async () => {
    const harness = createHarness();
    let syncCalls = 0;

    try {
      harness.windowRef.electronAPI = {
        us1SyncMessages: async () => {
          syncCalls += 1;
          return {
            success: true,
            localSessionId: "us1-session-2",
            conversationId: "conv-us1-2",
          };
        },
        dbGetMessages: async (query = {}) => {
          assert.equal(query["conversationId"], "conv-us1-2");
          return {
            data: [{ id: "assistant-1", role: "assistant", text: "mail reply" }],
          };
        },
      };

      const liveResult = await slotBridgeHandler({
        action: "session.sync",
        payload: {
          includeMessages: true,
        },
        sessionRef: { id: "us1-session-1" },
        toSlot: "us1",
      });
      assert.equal(liveResult.success, true);
      assert.equal(syncCalls, 1);
      assert.equal(Array.isArray((liveResult.data as Record<string, unknown>)["messages"]), true);

      const cachedResult = await slotBridgeHandler({
        action: "session.sync",
        payload: {
          includeMessages: true,
          skipTransportSync: true,
        },
        sessionRef: { conversationId: "conv-us1-2" },
        toSlot: "us1",
      });

      assert.equal(cachedResult.success, true);
      assert.equal(syncCalls, 1);
      assert.equal(
        (
          (cachedResult.data as Record<string, unknown>)["messages"] as Array<
            Record<string, unknown>
          >
        )[0]?.["text"],
        "mail reply"
      );
    } finally {
      harness.restore();
    }
  }
);


void test(
  "SlotBridge session.open honors connectPolicy never without forcing auto-connect",
  { concurrency: false },
  async () => {
    const harness = createHarness();
    const connectionCalls: string[] = [];

    try {
      harness.slotController.getState = () => ({
        state: "assigned",
        domReady: false,
        urlExcluded: false,
      });
      harness.slotController.isConnected = () => false;
      harness.appState.isAssigned = () => true;
      harness.appState.isConnected = () => false;
      harness.coreEngine.setConnection = async (provider, nextConnected) => {
        connectionCalls.push(`${provider}:${String(nextConnected)}`);
        return { success: true };
      };

      const result = await slotBridgeHandler({
        action: "session.open",
        connectPolicy: "never",
        payload: { title: "Strict session" },
        toSlot: "ai1",
      });

      assert.equal(result.success, false);
      assert.equal(result.code, "TARGET_UNREACHABLE");
      assert.deepEqual(connectionCalls, []);
    } finally {
      harness.restore();
    }
  }
);


void test(
  "SlotBridge session.switch honors connectPolicy require-ready without forcing auto-connect",
  { concurrency: false },
  async () => {
    const harness = createHarness();
    const connectionCalls: string[] = [];

    try {
      harness.slotController.getState = () => ({
        state: "assigned",
        domReady: false,
        urlExcluded: false,
      });
      harness.slotController.isConnected = () => false;
      harness.appState.isAssigned = () => true;
      harness.appState.isConnected = () => false;
      harness.coreEngine.setConnection = async (provider, nextConnected) => {
        connectionCalls.push(`${provider}:${String(nextConnected)}`);
        return { success: true };
      };
      harness.conversationListManager.refresh = async () => {
        throw new Error("refresh should not run when require-ready fails");
      };

      const result = await slotBridgeHandler({
        action: "session.switch",
        connectPolicy: "require-ready",
        sessionRef: { conversationId: "conv-ai1-strict" },
        toSlot: "ai1",
      });

      assert.equal(result.success, false);
      assert.equal(result.code, "TARGET_NOT_READY");
      assert.deepEqual(connectionCalls, []);
    } finally {
      harness.restore();
    }
  }
);


void test(
  "SlotBridge session.switch supports US1 targets and resolves local session ids after refresh",
  { concurrency: false },
  async () => {
    const harness = createHarness();
    const refreshCalls: Array<Record<string, unknown>> = [];
    const selectionCalls: Array<{ conversationId: string; provider?: string; silent?: boolean }> =
      [];

    try {
      harness.appState.hasUs1Identity = () => true;
      harness.appState.isUs1Connected = () => true;
      harness.conversationListManager.refresh = async (options = {}) => {
        refreshCalls.push(options);
        harness.conversationListManager.entries = [
          {
            id: "conv-us1-1",
            localSessionId: "us1-local-1",
            provider: "us1",
          },
        ];
      };
      harness.conversationListManager.updateSelection = (conversationId, options = {}) => {
        selectionCalls.push({
          conversationId,
          ...(options.provider !== undefined ? { provider: options.provider } : {}),
          ...(options.silent !== undefined ? { silent: options.silent } : {}),
        });
        return conversationId === "conv-us1-1";
      };

      const result = await slotBridgeHandler({
        action: "session.switch",
        sessionRef: {
          id: "us1-local-1",
        },
        toSlot: "us1",
      });

      assert.equal(result.success, true);
      assert.deepEqual(refreshCalls, [{ provider: "us1", silent: true }]);
      assert.deepEqual(selectionCalls, [
        {
          conversationId: "conv-us1-1",
          provider: "us1",
          silent: false,
        },
      ]);
      assert.equal(result.session?.id, "us1-local-1");
      assert.equal(result.session.conversationId, "conv-us1-1");
    } finally {
      harness.restore();
    }
  }
);


void test(
  "SlotBridge session.open creates local LLM session URLs for AI slots",
  { concurrency: false },
  async () => {
    const harness = createHarness();
    const navigations: Array<{ slot: string; url: string | null }> = [];

    try {
      harness.appState.getProviderIdForSlot = (slot: string) => (slot === "ai1" ? "llm" : slot);
      harness.slotController.navigate = (slot, url) => {
        navigations.push({ slot, url });
      };

      const result = await slotBridgeHandler({
        action: "session.open",
        sessionRef: {
          id: "llm-session-1",
        },
        toSlot: "ai1",
      });

      assert.equal(result.success, true);
      assert.equal(result.session?.id, "llm-session-1");
      assert.deepEqual(navigations, [
        {
          slot: "ai1",
          url: "http://127.0.0.1:9876/?session=llm-session-1",
        },
      ]);
    } finally {
      harness.restore();
    }
  }
);


void test(
  "SlotBridge session.sync runs manual webview sync for AI slots",
  { concurrency: false },
  async () => {
    const harness = createHarness();
    const syncCalls: Array<{ provider: string; opts?: Record<string, unknown> }> = [];

    try {
      harness.appState.getProviderIdForSlot = (slot: string) => (slot === "ai1" ? "llm" : slot);
      harness.webviewManager.syncProvider = async (provider, opts) => {
        syncCalls.push({ provider, ...(opts !== undefined ? { opts } : {}) });
        return {
          success: true,
          conversationId: "conv-llm-1",
          count: 2,
          webUrl: "http://127.0.0.1:9876/?session=llm-session-1",
        };
      };
      harness.windowRef.electronAPI = {
        dbGetMessages: async (query = {}) => {
          assert.equal(query["conversationId"], "conv-llm-1");
          return {
            data: [{ id: "assistant-1", role: "assistant", text: "local reply" }],
          };
        },
      };

      const result = await slotBridgeHandler({
        action: "session.sync",
        payload: {
          includeMessages: true,
        },
        sessionRef: {
          id: "llm-session-1",
        },
        toSlot: "ai1",
      });

      const data = result.data as Record<string, unknown>;

      assert.equal(result.success, true);
      assert.deepEqual(syncCalls, [{ provider: "ai1", opts: { from: "manual" } }]);
      assert.equal(result.session?.id, "llm-session-1");
      assert.equal(result.session.conversationId, "conv-llm-1");
      assert.equal(data["localSessionId"], "llm-session-1");
      assert.equal(
        (data["messages"] as Array<Record<string, unknown>>)[0]?.["text"],
        "local reply"
      );
    } finally {
      harness.restore();
    }
  }
);


void test(
  "SlotBridge session.sync stores project AI session bindings from synced session data",
  { concurrency: false },
  async () => {
    const harness = createHarness();
    const originalGetSnapshot = SettingsManager.getSnapshot;
    const originalPatch = SettingsManager.patch;
    let settings: Record<string, unknown> = { projectAiSessions: [] };

    try {
      SettingsManager.getSnapshot = () => settings as ReturnType<typeof SettingsManager.getSnapshot>;
      SettingsManager.patch = async (fnOrPartial) => {
        const next = JSON.parse(JSON.stringify(settings)) as Record<string, unknown>;
        if (typeof fnOrPartial === "function") {
          fnOrPartial(next);
        } else {
          Object.assign(next, fnOrPartial);
        }
        settings = next;
        return true;
      };
      harness.appState.getAccountForSlot = () => ({
        id: "acct-grok",
        provider: "grok",
        email: "grok@example.test",
      });
      harness.appState.getProviderIdForSlot = () => "grok";
      harness.webviewManager.syncProvider = async () => ({
        success: true,
        conversationId: "conv-grok-1",
        webUrl: "https://grok.example/chat?session=grok-local-1",
      });

      const result = await slotBridgeHandler({
        action: "session.sync",
        toSlot: "ai2",
        projectRef: {
          roomId: "repair-room",
          projectId: "repair-session-1",
        },
      });

      const bindings = settings["projectAiSessions"] as Array<Record<string, unknown>>;
      const binding = bindings[0] ?? {};
      const sessionRef = binding["sessionRef"] as Record<string, unknown>;
      const data = result.data as Record<string, unknown>;
      const projectSession = data["projectSession"] as Record<string, unknown>;

      assert.equal(result.success, true);
      assert.equal(result.session?.id, "grok-local-1");
      assert.equal(result.session.conversationId, "conv-grok-1");
      assert.equal(bindings.length, 1);
      assert.equal(binding["projectId"], "repair-session-1");
      assert.equal(binding["roomId"], "repair-room");
      assert.equal(binding["slot"], "ai2");
      assert.equal(binding["accountId"], "acct-grok");
      assert.equal(binding["providerId"], "grok");
      assert.equal(binding["webUrl"], "https://grok.example/chat?session=grok-local-1");
      assert.equal(sessionRef["id"], "grok-local-1");
      assert.equal(sessionRef["conversationId"], "conv-grok-1");
      assert.equal((projectSession["binding"] as Record<string, unknown>)["accountId"], "acct-grok");
    } finally {
      SettingsManager.getSnapshot = originalGetSnapshot;
      SettingsManager.patch = originalPatch;
      harness.restore();
    }
  }
);


void test(
  "SlotBridge session.switch restores a saved project session when the selected account matches",
  { concurrency: false },
  async () => {
    const harness = createHarness();
    const originalGetSnapshot = SettingsManager.getSnapshot;
    const originalPatch = SettingsManager.patch;
    let selectedConversationId = "";
    let refreshProvider = "";
    let settings: Record<string, unknown> = {
      projectAiSessions: [
        {
          projectId: "repair-session-2",
          roomId: "repair-room",
          slot: "ai2",
          accountId: "acct-grok",
          providerId: "grok",
          sessionRef: { conversationId: "conv-saved-2" },
        },
      ],
    };

    try {
      SettingsManager.getSnapshot = () => settings as ReturnType<typeof SettingsManager.getSnapshot>;
      SettingsManager.patch = async (fnOrPartial) => {
        const next = JSON.parse(JSON.stringify(settings)) as Record<string, unknown>;
        if (typeof fnOrPartial === "function") {
          fnOrPartial(next);
        } else {
          Object.assign(next, fnOrPartial);
        }
        settings = next;
        return true;
      };
      harness.appState.getAccountForSlot = () => ({
        id: "acct-grok",
        provider: "grok",
        email: "grok@example.test",
      });
      harness.appState.getProviderIdForSlot = () => "grok";
      harness.conversationListManager.refresh = async (options = {}) => {
        refreshProvider = (options["provider"] as string | undefined) ?? "";
      };
      harness.conversationListManager.updateSelection = (conversationId) => {
        selectedConversationId = conversationId;
        return true;
      };

      const result = await slotBridgeHandler({
        action: "session.switch",
        toSlot: "ai2",
        projectRef: {
          roomId: "repair-room",
          projectId: "repair-session-2",
        },
      });

      const projectSession = (result.data as Record<string, unknown>)[
        "projectSession"
      ] as Record<string, unknown>;

      assert.equal(result.success, true);
      assert.equal(refreshProvider, "ai2");
      assert.equal(selectedConversationId, "conv-saved-2");
      assert.equal(result.session?.conversationId, "conv-saved-2");
      assert.equal(projectSession["restored"], true);
    } finally {
      SettingsManager.getSnapshot = originalGetSnapshot;
      SettingsManager.patch = originalPatch;
      harness.restore();
    }
  }
);


void test(
  "SlotBridge message.send activates a saved project session before dispatch",
  { concurrency: false },
  async () => {
    const harness = createHarness();
    const originalGetSnapshot = SettingsManager.getSnapshot;
    const originalPatch = SettingsManager.patch;
    const callOrder: string[] = [];
    let selectedConversationId = "";
    let settings: Record<string, unknown> = {
      projectAiSessions: [
        {
          projectId: "repair-session-activate",
          roomId: "repair-room",
          slot: "ai2",
          accountId: "acct-grok",
          providerId: "grok",
          sessionRef: { conversationId: "conv-activate" },
        },
      ],
    };

    try {
      SettingsManager.getSnapshot = () => settings as ReturnType<typeof SettingsManager.getSnapshot>;
      SettingsManager.patch = async (fnOrPartial) => {
        const next = JSON.parse(JSON.stringify(settings)) as Record<string, unknown>;
        if (typeof fnOrPartial === "function") {
          fnOrPartial(next);
        } else {
          Object.assign(next, fnOrPartial);
        }
        settings = next;
        return true;
      };
      harness.appState.getAccountForSlot = () => ({
        id: "acct-grok",
        provider: "grok",
        email: "grok@example.test",
      });
      harness.appState.getProviderIdForSlot = () => "grok";
      harness.conversationListManager.updateSelection = (conversationId) => {
        selectedConversationId = conversationId;
        callOrder.push(`switch:${conversationId}`);
        return true;
      };
      harness.coreEngine.sendBatchInternal = async () => {
        throw new Error("sendBatch should not run for single-target text sends");
      };
      harness.coreEngine.sendMessageInternal = async () => {
        callOrder.push(`send:${selectedConversationId}`);
        return { success: true };
      };
      (harness.windowRef as any).confirm = () => true;

      const result = await slotBridgeHandler({
        action: "message.send",
        payload: { text: "Continue project" },
        projectRef: {
          roomId: "repair-room",
          projectId: "repair-session-activate",
        },
        toSlot: "ai2",
      });

      assert.equal(result.success, true);
      assert.deepEqual(callOrder, ["switch:conv-activate", "send:conv-activate"]);
      assert.equal(result.session?.conversationId, "conv-activate");
    } finally {
      SettingsManager.getSnapshot = originalGetSnapshot;
      SettingsManager.patch = originalPatch;
      harness.restore();
    }
  }
);


void test(
  "SlotBridge project session restore warns without switching when the selected account differs",
  { concurrency: false },
  async () => {
    const harness = createHarness();
    const originalGetSnapshot = SettingsManager.getSnapshot;
    const originalPatch = SettingsManager.patch;
    let updateSelectionCalled = false;
    const settings: Record<string, unknown> = {
      projectAiSessions: [
        {
          projectId: "repair-session-3",
          roomId: "repair-room",
          slot: "ai2",
          accountId: "acct-grok",
          providerId: "grok",
          sessionRef: { conversationId: "conv-saved-3" },
        },
      ],
    };

    try {
      SettingsManager.getSnapshot = () => settings as ReturnType<typeof SettingsManager.getSnapshot>;
      SettingsManager.patch = async () => true;
      harness.appState.getAccountForSlot = () => ({
        id: "acct-other",
        provider: "grok",
        email: "other@example.test",
      });
      harness.appState.getProviderIdForSlot = () => "grok";
      harness.conversationListManager.updateSelection = () => {
        updateSelectionCalled = true;
        return true;
      };

      const result = await slotBridgeHandler({
        action: "session.switch",
        toSlot: "ai2",
        projectRef: {
          roomId: "repair-room",
          projectId: "repair-session-3",
        },
      });

      const data = result.data as Record<string, unknown>;
      const projectSession = data["projectSession"] as Record<string, unknown>;
      const warning = projectSession["warning"] as Record<string, unknown>;

      assert.equal(result.success, true);
      assert.equal(data["projectSessionSkipped"], true);
      assert.equal(updateSelectionCalled, false);
      assert.equal(warning["code"], "PROJECT_ACCOUNT_MISMATCH");
      assert.equal(warning["expectedAccountId"], "acct-grok");
      assert.equal(warning["actualAccountId"], "acct-other");
    } finally {
      SettingsManager.getSnapshot = originalGetSnapshot;
      SettingsManager.patch = originalPatch;
      harness.restore();
    }
  }
);


void test(
  "SlotBridge room.command keeps explicit payload when args contains raw room args",
  { concurrency: false },
  async () => {
    const registry = RoomCommandRegistry as unknown as {
      run: (commandName: string, payload?: Record<string, unknown>) => Promise<unknown>;
    };
    const originalRun = registry.run;
    const runCalls: Array<{ commandName: string; payload: Record<string, unknown> }> = [];

    try {
      registry.run = async (commandName, payload = {}) => {
        runCalls.push({ commandName, payload });
        return { success: true, handled: true };
      };

      const result = await slotBridgeHandler({
        action: "room.command",
        fromSlot: "us1",
        args: '{"matchId":"backgammon_1","turnIndex":0,"boardHashBeforeMove":".........","cell":1}',
        payload: {
          commandName: "GameRoomBackgammonRemoteMove",
          roomId: "game-room",
          matchId: "backgammon_1",
          turnIndex: 0,
          boardHashBeforeMove: ".........",
          cell: 1,
        },
      });

      assert.equal(result.success, true);
      assert.equal(runCalls.length, 1);
      assert.equal(runCalls[0]?.commandName, "GameRoomBackgammonRemoteMove");
      assert.deepEqual(runCalls[0].payload["roomPayload"], {
        roomId: "game-room",
        matchId: "backgammon_1",
        turnIndex: 0,
        boardHashBeforeMove: ".........",
        cell: 1,
      });
      assert.equal(
        runCalls[0].payload["args"],
        '{"matchId":"backgammon_1","turnIndex":0,"boardHashBeforeMove":".........","cell":1}'
      );
      assert.deepEqual(result.data, { success: true, handled: true });
    } finally {
      registry.run = originalRun;
    }
  }
);


void test(
  "SlotBridge room.command forwards US1 transport metadata to room handlers",
  { concurrency: false },
  async () => {
    const registry = RoomCommandRegistry as unknown as {
      run: (commandName: string, payload?: Record<string, unknown>) => Promise<unknown>;
    };
    const originalRun = registry.run;
    const runCalls: Array<{ commandName: string; payload: Record<string, unknown> }> = [];

    try {
      registry.run = async (commandName, payload = {}) => {
        runCalls.push({ commandName, payload });
        return { success: true, handled: true };
      };

      const result = await slotBridgeHandler({
        action: "room.command",
        fromSlot: "us1",
        remoteUserId: "remote-user@example.test",
        localSessionId: "us1-session-1",
        transportMessageId: "<remote-move@example.test>",
        payload: {
          commandName: "GameRoomBackgammonRemoteMove",
          roomId: "game-room",
          matchId: "backgammon_1",
          turnIndex: 0,
          boardHashBeforeMove: ".........",
          cell: 1,
        },
      });

      assert.equal(result.success, true);
      assert.equal(runCalls.length, 1);
      assert.equal(runCalls[0]?.commandName, "GameRoomBackgammonRemoteMove");
      assert.equal(runCalls[0].payload["remoteUserId"], "remote-user@example.test");
      assert.equal(runCalls[0].payload["localSessionId"], "us1-session-1");
      assert.equal(runCalls[0].payload["transportMessageId"], "<remote-move@example.test>");
      assert.deepEqual(runCalls[0].payload["roomPayload"], {
        roomId: "game-room",
        matchId: "backgammon_1",
        turnIndex: 0,
        boardHashBeforeMove: ".........",
        cell: 1,
      });
      assert.deepEqual(result.data, { success: true, handled: true });
    } finally {
      registry.run = originalRun;
    }
  }
);

