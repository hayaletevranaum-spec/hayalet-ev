import assert from "node:assert/strict";
import test from "node:test";

const { slotBridgeHandler, slotBridgeRuntime } =
  await import("../../src/js/modules/commands/slot-bridge.ts");
const { SlotController } = await import("../../src/js/modules/slot-controller.ts");
const { AppState } = await import("../../src/js/modules/app-state.ts");
const { AssistantProviderRegistry } =
  await import("../../src/js/pages/assistant/provider-registry.ts");
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

type SlotBridgeAttachmentRef = {
  kind: "attachment-ref";
  name: string;
  ref: string;
};

type SlotBridgeFileSystemAttachment = {
  kind: "filesystem";
  name: string;
  path: string;
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
  "SlotBridge sendWait returns archived generated-image replies after full sync",
  { concurrency: false },
  async () => {
    const harness = createHarness();
    let sent = false;
    let sentText = "";
    let sentClientRequestId = "";
    let sentWaitForCompletion = false;

    try {
      harness.coreEngine.sendBatchInternal = async () => {
        throw new Error("sendBatch should not run for text-only sendWait");
      };
      harness.coreEngine.sendMessageInternal = async (payload) => {
        sent = true;
        sentText = payload?.text ?? "";
        sentClientRequestId = payload?.clientRequestId ?? "";
        sentWaitForCompletion = payload?.waitForCompletion === true;
        return { success: true };
      };
      harness.webviewManager.syncProvider = async () => ({
        conversationId: "conv-1",
        generatedImagePendingCount: 0,
      });
      harness.windowRef.electronAPI = {
        dbGetAttachments: async () => ({
          data: sent
            ? [
                {
                  message_id: "assistant-new",
                  original_name: "reply-image.png",
                  mime_type: "image/png",
                  stored_path: "/tmp/reply-image.png",
                  size: 1234,
                },
              ]
            : [],
        }),
        dbGetMessages: async () => ({
          data: sent
            ? [
                { id: "assistant-old", role: "assistant", text: "previous reply" },
                {
                  id: "user-new",
                  role: "user",
                  text: "Ping",
                  client_request_id: sentClientRequestId,
                },
                { id: "assistant-new", role: "assistant", text: "latest reply" },
              ]
            : [{ id: "assistant-old", role: "assistant", text: "previous reply" }],
        }),
      };

      const result = await slotBridgeHandler({
        action: "message.sendWait",
        fromSlot: "ai0",
        payload: { text: "Ping" },
        replyToSlot: "ai1",
        reqId: "req-sendwait-image",
        timeoutMs: 2000,
        toSlot: "ai1",
      });

      assert.equal(result.success, true);
      assert.equal(sentText.includes("<!-- hev-req:req-sendwait-image -->"), false);
      assert.equal(sentClientRequestId.startsWith("slotbridge-implicit:"), true);
      assert.equal(sentWaitForCompletion, true);
      assert.equal(result.reply?.text, "latest reply");
      assert.equal(result.reply.attachments?.[0]?.kind, "generated-image");
      assert.equal(result.reply.attachments[0].path, "/tmp/reply-image.png");
      assert.equal(result.artifacts?.[0]?.mimeType, "image/png");
    } finally {
      harness.restore();
    }
  }
);


void test(
  "SlotBridge message.send auto-connects assigned AI targets before dispatch",
  { concurrency: false },
  async () => {
    const harness = createHarness();
    let connected = false;
    const connectionCalls: string[] = [];
    let sentProvider = "";
    let sentText = "";

    try {
      harness.slotController.getState = () => ({
        state: connected ? "connected" : "assigned",
        domReady: connected,
        urlExcluded: false,
      });
      harness.slotController.isConnected = () => connected;
      harness.appState.isAssigned = () => true;
      harness.appState.isConnected = () => connected;
      harness.coreEngine.setConnection = async (provider, nextConnected) => {
        connectionCalls.push(`${provider}:${String(nextConnected)}`);
        connected = nextConnected === true;
        return { success: true };
      };
      harness.coreEngine.sendBatchInternal = async () => {
        throw new Error("sendBatch should not run for single-target text sends");
      };
      harness.coreEngine.sendMessageInternal = async (payload) => {
        sentProvider = payload?.provider ?? "";
        sentText = payload?.text ?? "";
        return { success: true };
      };

      const result = await slotBridgeHandler({
        action: "message.send",
        fromSlot: "user",
        payload: { text: "Auto-connect now" },
        toSlot: "ai1",
      });

      assert.equal(result.success, true);
      assert.deepEqual(connectionCalls, ["ai1:true"]);
      assert.equal(sentProvider, "ai1");
      assert.equal(sentText.startsWith("Auto-connect now"), true);
    } finally {
      harness.restore();
    }
  }
);


void test(
  "SlotBridge message.send rejects connected AI slots until the first traffic probe completes",
  { concurrency: false },
  async () => {
    const harness = createHarness({ immediateTimers: true });
    let sendCalled = false;

    try {
      TrafficManager.state["ai1"] = {
        ...makeReadyTrafficState("https://chatgpt.com/ai1"),
        lastHref: "",
      };
      harness.coreEngine.sendBatchInternal = async () => {
        throw new Error("sendBatch should not run for single-target text sends");
      };
      harness.coreEngine.sendMessageInternal = async () => {
        sendCalled = true;
        return { success: true };
      };

      const result = await slotBridgeHandler({
        action: "message.send",
        fromSlot: "user",
        payload: { text: "Wait for probe" },
        toSlot: "ai1",
      });

      assert.equal(result.success, false);
      assert.equal(result.code, "TARGET_NOT_READY");
      assert.equal(sendCalled, false);
    } finally {
      harness.restore();
    }
  }
);


void test(
  "SlotBridge retry send is idempotent with the same clientRequestId",
  { concurrency: false },
  async () => {
    const harness = createHarness();
    let sendCount = 0;
    let seenBrokerMessageId = "";

    try {
      harness.coreEngine.sendBatchInternal = async () => {
        throw new Error("sendBatch should not run for single-target text sends");
      };
      harness.coreEngine.sendMessageInternal = async (payload) => {
        sendCount += 1;
        seenBrokerMessageId =
          typeof payload?.brokerMessageId === "string" ? payload.brokerMessageId : "";
        return { success: true };
      };

      const first = await slotBridgeHandler({
        action: "message.send",
        clientRequestId: "client-req-1",
        fromSlot: "user",
        payload: { text: "Only once" },
        toSlot: "ai1",
      });
      const second = await slotBridgeHandler({
        action: "message.send",
        clientRequestId: "client-req-1",
        fromSlot: "user",
        payload: { text: "Only once" },
        toSlot: "ai1",
      });

      assert.equal(first.success, true);
      assert.equal(second.success, true);
      assert.equal(sendCount, 1);
      assert.equal(first.clientRequestId, "client-req-1");
      assert.equal(second.clientRequestId, "client-req-1");
      assert.equal(typeof first.brokerMessageId, "string");
      assert.equal(first.brokerMessageId, second.brokerMessageId);
      assert.equal(first.brokerMessageId, seenBrokerMessageId);
    } finally {
      harness.restore();
    }
  }
);


void test(
  "SlotBridge forwards explicit US1 remote routing to the server without mutating settings",
  { concurrency: false },
  async () => {
    const harness = createHarness();
    const originalPatch = SettingsManager.patch;
    const sendCalls: Array<Record<string, unknown>> = [];

    try {
      SettingsManager.patch = async () => {
        throw new Error("Settings patch should not run for US1 remote selection");
      };
      harness.windowRef.electronAPI = {
        us1SendMessage: async (params = {}) => {
          sendCalls.push({ ...params });
          return {
            success: true,
            remoteUserId: "beta@example.com",
            localSessionId: "beta-session",
            conversationId: "conv-beta",
          };
        },
      };

      const result = await slotBridgeHandler({
        action: "message.send",
        fromSlot: "user",
        toSlot: "us1",
        remoteUserId: "beta@example.com",
        payload: { text: "Ping beta" },
      });

      assert.equal(result.success, true);
      assert.equal(sendCalls.length, 1);
      assert.equal(sendCalls[0]?.["remoteUserId"], "beta@example.com");
      assert.match(((sendCalls[0]["text"] as string | undefined) ?? ""), /Ping beta/);
    } finally {
      SettingsManager.patch = originalPatch;
      harness.restore();
    }
  }
);


void test(
  "SlotBridge message.send auto-connects AI0 through assistant readiness before dispatch",
  { concurrency: false },
  async () => {
    const harness = createHarness({ immediateTimers: true });
    const originalGetAdapter = AssistantProviderRegistry.getAdapter;
    let connected = false;
    let readyChecks = 0;
    let sentProvider = "";
    let sentText = "";

    try {
      harness.slotController.getState = () => ({
        state: connected ? "connected" : "assigned",
        domReady: connected,
        urlExcluded: false,
      });
      harness.slotController.isConnected = () => connected;
      harness.slotController.connect = async () => {
        connected = true;
        return { success: true };
      };
      harness.appState.getProviderIdForSlot = () => "opencode-ui";
      harness.appState.isAssigned = () => true;
      harness.appState.isConnected = () => connected;
      harness.appState.isAssistantToolsReady = () => {
        readyChecks += 1;
        return connected && readyChecks > 2;
      };
      AssistantProviderRegistry.getAdapter = () =>
        ({
          id: "opencode-ui",
          name: "OpenCode UI",
          getServerStatus: () => ({ running: true }),
          startServer: () => ({
            success: true,
            url: "/pages/opencode-ui.html?port=4096",
          }),
          stopServer: () => ({ success: true }),
          waitForReady: () => true,
        }) as unknown as ReturnType<typeof AssistantProviderRegistry.getAdapter>;
      harness.coreEngine.sendBatchInternal = async () => {
        throw new Error("sendBatch should not run for single-target text sends");
      };
      harness.coreEngine.sendMessageInternal = async (payload) => {
        sentProvider = payload?.provider ?? "";
        sentText = payload?.text ?? "";
        return { success: true };
      };

      const result = await slotBridgeHandler({
        action: "message.send",
        fromSlot: "user",
        payload: { text: "Wake AI0" },
        toSlot: "ai0",
      });

      assert.equal(result.success, true);
      assert.equal(sentProvider, "ai0");
      assert.equal(sentText.startsWith("Wake AI0"), true);
      assert.equal(connected, true);
      assert.equal(readyChecks > 2, true);
    } finally {
      AssistantProviderRegistry.getAdapter = originalGetAdapter;
      harness.restore();
    }
  }
);


void test(
  "SlotBridge sendWait succeeds when the awaited archived reply only contains attachments",
  { concurrency: false },
  async () => {
    const harness = createHarness({ immediateTimers: true });
    const sendBatchCalls: SendBatchPayload[] = [];
    let sent = false;

    try {
      harness.coreEngine.sendBatchInternal = async (payload) => {
        sendBatchCalls.push(payload ?? {});
        return { success: true };
      };
      harness.coreEngine.sendMessageInternal = async () => {
        sent = true;
        return { success: true };
      };
      harness.webviewManager.syncProvider = async () => ({
        conversationId: "conv-attachment-only",
        generatedImagePendingCount: 0,
      });
      harness.windowRef.electronAPI = {
        dbGetAttachments: async () => ({
          data: sent
            ? [
                {
                  message_id: "assistant-new",
                  original_name: "only-attachment.png",
                  mime_type: "image/png",
                  stored_path: "/tmp/only-attachment.png",
                  size: 512,
                },
              ]
            : [],
        }),
        dbGetMessages: async () => ({
          data: sent
            ? [
                { id: "assistant-old", role: "assistant", text: "previous" },
                { id: "assistant-new", role: "assistant", text: "" },
              ]
            : [{ id: "assistant-old", role: "assistant", text: "previous" }],
        }),
      };

      const result = await slotBridgeHandler({
        action: "message.sendWait",
        fromSlot: "ai0",
        payload: { text: "Need artifact" },
        reqId: "req-sendwait-attachment-only",
        timeoutMs: 2000,
        toSlot: "ai1",
      });

      assert.equal(result.success, true);
      assert.equal(result.reply?.text, "");
      assert.equal(result.reply.attachments?.[0]?.path, "/tmp/only-attachment.png");
      assert.equal(result.artifacts?.[0]?.name, "only-attachment.png");
      assert.equal(sendBatchCalls.length, 1);
      assert.deepEqual(sendBatchCalls[0]?.targets, ["ai0"]);
      assert.equal(sendBatchCalls[0].page, "slot-bridge:reply:ai1");
      assert.equal(sendBatchCalls[0].text?.includes("<!-- hev-sender:ai1 -->"), true);
      assert.deepEqual(sendBatchCalls[0].attachments, [
        {
          name: "only-attachment.png",
          path: "/tmp/only-attachment.png",
        },
      ]);
    } finally {
      harness.restore();
    }
  }
);


void test(
  "SlotBridge sendWait reads ai0 replies directly from sync results when archive DB is empty",
  { concurrency: false },
  async () => {
    const harness = createHarness({ immediateTimers: true });
    let targetSent = false;
    let sentText = "";
    let sentClientRequestId = "";
    let sentWaitForCompletion = false;

    try {
      harness.coreEngine.sendBatchInternal = async () => {
        throw new Error("sendBatch should not run for text-only sendWait");
      };
      harness.coreEngine.sendMessageInternal = async (payload) => {
        if (payload?.provider === "ai0") {
          targetSent = true;
          sentText = payload.text ?? "";
          sentClientRequestId = payload.clientRequestId ?? "";
          sentWaitForCompletion = payload.waitForCompletion === true;
        }
        return { success: true };
      };
      harness.webviewManager.syncProvider = async () => ({
        conversationId: "conv-ai0",
        generatedImagePendingCount: 0,
        messages: targetSent
          ? [{ id: "assistant-new", role: "assistant", text: "fresh ai0 reply" }]
          : [{ id: "assistant-old", role: "assistant", text: "previous ai0 reply" }],
      });
      harness.windowRef.electronAPI = {
        dbGetAttachments: async () => ({ data: [] }),
        dbGetMessages: async () => ({ data: [] }),
      };

      const result = await slotBridgeHandler({
        action: "message.sendWait",
        fromSlot: "ai1",
        payload: { text: "Ping ai0" },
        reqId: "req-sendwait-ai0-live-reply",
        timeoutMs: 10000,
        toSlot: "ai0",
      });

      assert.equal(result.success, true);
      assert.equal(sentText.includes("<!-- hev-req:req-sendwait-ai0-live-reply -->"), false);
      assert.equal(sentClientRequestId.startsWith("slotbridge-implicit:"), true);
      assert.equal(sentWaitForCompletion, true);
      assert.equal(result.reply?.text, "fresh ai0 reply");
      assert.equal(result.reply.conversationId, "conv-ai0");
    } finally {
      harness.restore();
    }
  }
);


void test(
  "SlotBridge sendWait forwards replies back to replyToSlot for cross-slot AI routing",
  { concurrency: false },
  async () => {
    const harness = createHarness();
    let sent = false;
    const sendMessageCalls: Array<{ provider?: string; text?: string; page?: string }> = [];

    try {
      harness.coreEngine.sendBatchInternal = async () => {
        throw new Error("sendBatch should not run for text-only reply forwarding");
      };
      harness.coreEngine.sendMessageInternal = async (payload) => {
        sendMessageCalls.push(payload ?? {});
        if (payload?.provider === "ai2") {
          sent = true;
        }
        return { success: true };
      };
      harness.webviewManager.syncProvider = async () => ({
        conversationId: "conv-bridge-forward",
        generatedImagePendingCount: 0,
      });
      harness.windowRef.electronAPI = {
        dbGetAttachments: async () => ({ data: [] }),
        dbGetMessages: async () => ({
          data: sent
            ? [
                { id: "assistant-old", role: "assistant", text: "old" },
                { id: "assistant-new", role: "assistant", text: "reply for ai1" },
              ]
            : [{ id: "assistant-old", role: "assistant", text: "old" }],
        }),
      };

      const result = await slotBridgeHandler({
        action: "message.sendWait",
        fromSlot: "ai1",
        payload: { text: "Relay to ai2" },
        replyToSlot: "ai1",
        reqId: "req-forward",
        timeoutMs: 2000,
        toSlot: "ai2",
      });

      assert.equal(result.success, true);
      assert.equal(sendMessageCalls.length, 2);
      assert.equal(sendMessageCalls[0]?.provider, "ai2");
      assert.equal(sendMessageCalls[1]?.provider, "ai1");
      assert.equal(sendMessageCalls[1].text?.includes("<!-- hev-sender:ai2 -->"), true);
      assert.deepEqual(result.data, {
        replyForwardSlot: "ai1",
        replyForwarded: true,
      });
    } finally {
      harness.restore();
    }
  }
);


void test(
  "SlotBridge sendWait returns TARGET_TIMEOUT when no new archived reply arrives",
  { concurrency: false },
  async () => {
    const harness = createHarness({ immediateTimers: true });

    try {
      harness.coreEngine.sendBatchInternal = async () => {
        throw new Error("sendBatch should not run for text-only sendWait");
      };
      harness.coreEngine.sendMessageInternal = async () => ({ success: true });
      harness.webviewManager.syncProvider = async () => ({
        conversationId: "conv-timeout",
        generatedImagePendingCount: 0,
      });
      harness.windowRef.electronAPI = {
        dbGetAttachments: async () => ({ data: [] }),
        dbGetMessages: async () => ({
          data: [{ id: "assistant-old", role: "assistant", text: "stale reply" }],
        }),
      };

      const result = await slotBridgeHandler({
        action: "message.sendWait",
        fromSlot: "ai0",
        payload: { text: "Still waiting" },
        reqId: "req-timeout",
        timeoutMs: 1000,
        toSlot: "ai1",
      });

      assert.equal(result.success, false);
      assert.equal(result.code, "TARGET_TIMEOUT");
    } finally {
      harness.restore();
    }
  }
);


void test(
  "SlotBridge message.send resolves archive attachment refs and hard-rejects retired attachment actions",
  { concurrency: false },
  async () => {
    const harness = createHarness();
    let batchAttachments: Array<{ name: string; path: string }> = [];

    try {
      harness.coreEngine.sendBatchInternal = async (payload) => {
        batchAttachments = payload?.attachments ?? [];
        return { success: true };
      };
      harness.coreEngine.sendMessageInternal = async () => {
        throw new Error("sendMessage should not run for file.send");
      };
      harness.webviewManager.syncProvider = async () => ({ conversationId: "conv-archive" });
      harness.windowRef.electronAPI = {
        dbGetAttachments: async () => ({
          data: [
            {
              message_id: "msg-archive",
              original_name: "archive-image.png",
              mime_type: "image/png",
              stored_path: "/tmp/archive-image.png",
            },
          ],
        }),
        dbGetMessages: async () => ({ data: [] }),
      };

      const okResult = await slotBridgeHandler({
        action: "message.send",
        attachments: [
          {
            kind: "attachment-ref",
            name: "archive-image.png",
            ref: "archive:ai1:conv-archive:msg-archive:archive-image.png",
          } as SlotBridgeAttachmentRef,
        ],
        fromSlot: "ai1",
        toSlot: "ai2",
      });

      assert.equal(okResult.success, true);
      assert.deepEqual(batchAttachments, [
        { name: "archive-image.png", path: "/tmp/archive-image.png" },
      ]);

      const blockedResult = await slotBridgeHandler({
        action: "message.send",
        attachments: [
          {
            kind: "filesystem",
            name: "raw-local.txt",
            path: "/tmp/raw-local.txt",
          } as SlotBridgeFileSystemAttachment,
        ],
        fromSlot: "ai1",
        toSlot: "ai2",
      });

      assert.equal(blockedResult.success, false);
      assert.equal(blockedResult.code, "ATTACHMENT_REFERENCE_REQUIRED");
      assert.match(String(blockedResult.message), /Attachment reference required/i);

      const retiredResult = await slotBridgeHandler({
        action: "file.send",
        attachments: [
          {
            kind: "attachment-ref",
            name: "archive-image.png",
            ref: "archive:ai1:conv-archive:msg-archive:archive-image.png",
          } as SlotBridgeAttachmentRef,
        ],
        fromSlot: "ai1",
        toSlot: "ai2",
      });

      assert.equal(retiredResult.success, false);
      assert.equal(retiredResult.code, "ACTION_RETIRED");
      assert.match(String(retiredResult.message), /file\.send was removed/i);

      const retiredAttachmentResult = await slotBridgeHandler({
        action: "message.sendWithAttachments",
        attachments: [
          {
            kind: "attachment-ref",
            name: "archive-image.png",
            ref: "archive:ai1:conv-archive:msg-archive:archive-image.png",
          } as SlotBridgeAttachmentRef,
        ],
        fromSlot: "ai1",
        toSlot: "ai2",
      });

      assert.equal(retiredAttachmentResult.success, false);
      assert.equal(retiredAttachmentResult.code, "ACTION_RETIRED");
      assert.match(
        String(retiredAttachmentResult.message),
        /message\.sendWithAttachments was removed/i
      );
    } finally {
      harness.restore();
    }
  }
);


void test(
  "SlotBridge session.sync returns US1 mailbox data through the canonical bridge action",
  { concurrency: false },
  async () => {
    const harness = createHarness();

    try {
      harness.windowRef.electronAPI = {
        us1SyncMessages: async (payload = {}) => {
          assert.equal(payload["localSessionId"], "us1-session-1");
          assert.equal(payload["consumeRoomCommands"], true);
          return {
            success: true,
            localSessionId: "us1-session-2",
            conversationId: "conv-us1-2",
            fetchedCount: 2,
            processedCount: 1,
            roomEvents: [{ eventType: "invite" }],
            roomCommands: [{ commandName: "GameRoomBackgammonRemoteMove" }],
            roomInviteInbox: [{ inviteId: "invite-1" }],
          };
        },
      };

      const result = await slotBridgeHandler({
        action: "session.sync",
        fromSlot: "room-ui",
        toSlot: "us1",
        sessionRef: {
          id: "us1-session-1",
        },
        payload: {
          consumeRoomCommands: true,
        },
      });

      const data =
        result.data !== null &&
        typeof result.data === "object" &&
        Array.isArray(result.data) === false
          ? (result.data as Record<string, unknown>)
          : {};

      assert.equal(result.success, true);
      assert.equal(result.session?.id, "us1-session-2");
      assert.equal(result.session.conversationId, "conv-us1-2");
      assert.equal(data["fetchedCount"], 2);
      assert.equal(data["processedCount"], 1);
      assert.deepEqual(data["roomEvents"], [{ eventType: "invite" }]);
      assert.deepEqual(data["roomCommands"], [{ commandName: "GameRoomBackgammonRemoteMove" }]);
      assert.deepEqual(data["roomInviteInbox"], [{ inviteId: "invite-1" }]);
    } finally {
      harness.restore();
    }
  }
);


