import assert from "node:assert/strict";
import test from "node:test";

import { ThinkingTracker } from "../../src/js/modules/traffic/thinking-tracker.ts";
import { TrafficManager } from "../../src/js/modules/traffic-manager.ts";
import { AppState } from "../../src/js/modules/app-state.ts";

function makeTrafficState(lastHref = "https://chatgpt.com") {
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

function installTimerCapture(): {
  scheduled: Array<{ fn: () => void; delay: number }>;
  restore: () => void;
} {
  const originalSetTimeout = globalThis.setTimeout;
  const scheduled: Array<{ fn: () => void; delay: number }> = [];

  globalThis.setTimeout = ((fn: (...args: unknown[]) => void, delay?: number) => {
    scheduled.push({ fn: () => { fn(); }, delay: delay ?? 0 });
    return scheduled.length as unknown as ReturnType<typeof setTimeout>;
  }) as typeof globalThis.setTimeout;

  return {
    scheduled,
    restore: () => {
      globalThis.setTimeout = originalSetTimeout;
    },
  };
}

void test("thinking stays idle when stop button is not visible even if send is detected", () => {
  const tracker = new ThinkingTracker({ thinking: { stopButtonDetectionTimeoutMs: 2000 } });
  const now = Date.now();

  const state = {
    status: { thinking: "idle" },
    lastSendSeen: 0,
    stopButtonLastSeen: 0,
    stopButtonDisappearedAt: 0,
    thinkingJustEnded: false,
    thinkingEndedAt: 0,
  };

  const result = tracker.handleProbe(
    "ai1",
    state,
    { lastSend: now, stopVisible: false, sendState: "enabled", voiceMode: false },
    now
  );

  assert.equal(result.indicator, "idle");
});

void test("provider-state thinking transition drives traffic listeners", () => {
  const slot = "ai2";
  const originalState = TrafficManager.state[slot];
  const originalListeners = TrafficManager.listeners;
  const originalRunner = TrafficManager._runners[slot];
  const documentScope = globalThis as unknown as {
    document?: { getElementById: (id: string) => HTMLElement | null };
  };
  const originalDocument = documentScope.document;
  const timerCapture = installTimerCapture();
  const snapshots: unknown[] = [];

  try {
    documentScope.document = { getElementById: () => null };
    TrafficManager.listeners = [];
    TrafficManager._runners[slot] = { startedAt: Date.now(), nextProbeAt: Date.now() };
    TrafficManager.state[slot] = makeTrafficState("https://chatgpt.com/c/provider-state");
    TrafficManager.onUpdate((snapshot) => {
      if (snapshot.provider === slot) {
        const state = snapshot.state as {
          thinkingState?: string;
          status?: { thinking?: string };
        };
        snapshots.push({
          thinkingState: state.thinkingState,
          status: { thinking: state.status?.thinking },
        });
      }
    });

    TrafficManager.applyProviderState(slot, {
      thinkingState: "thinking",
      sendState: "disabled",
    });
    TrafficManager.applyProviderState(slot, {
      thinkingState: "idle",
      sendState: "enabled",
    });

    const state = TrafficManager.state[slot];
    assert.equal(state.status.thinking, "idle");
    assert.equal(state.thinkingState, "idle");
    assert.equal(state.thinkingJustEnded, true);
    assert.equal(typeof state.thinkingEndedAt, "number");
    assert.equal(timerCapture.scheduled.length, 1);
    assert.equal(
      snapshots.some(
        (snapshot) =>
          (snapshot as { thinkingState?: string; status?: { thinking?: string } }).thinkingState ===
            "thinking" ||
          (snapshot as { thinkingState?: string; status?: { thinking?: string } }).status
            ?.thinking === "busy"
      ),
      true
    );
    assert.equal(
      (snapshots[snapshots.length - 1] as { thinkingState?: string } | undefined)?.thinkingState,
      "idle"
    );
  } finally {
    timerCapture.restore();
    if (originalState !== undefined) TrafficManager.state[slot] = originalState;
    TrafficManager.listeners = originalListeners;
    if (originalRunner === undefined) {
      delete TrafficManager._runners[slot];
    } else {
      TrafficManager._runners[slot] = originalRunner;
    }
    documentScope.document = originalDocument as { getElementById: (id: string) => HTMLElement | null; };
  }
});

void test("provider-state ready transition marks loading as just ended", () => {
  const slot = "ai2";
  const originalState = TrafficManager.state[slot];
  const originalListeners = TrafficManager.listeners;
  const originalRunner = TrafficManager._runners[slot];
  const documentScope = globalThis as unknown as {
    document?: { getElementById: (id: string) => HTMLElement | null };
  };
  const originalDocument = documentScope.document;
  const timerCapture = installTimerCapture();
  const snapshots: unknown[] = [];

  try {
    documentScope.document = { getElementById: () => null };
    TrafficManager.listeners = [];
    TrafficManager._runners[slot] = { startedAt: Date.now(), nextProbeAt: Date.now() };
    TrafficManager.state[slot] = {
      ...makeTrafficState("https://chatgpt.com/c/provider-state"),
      status: { loading: "busy", thinking: "idle", send: "busy" },
      loadingActive: true,
      readyState: "loading",
      sendState: "disabled",
    };
    TrafficManager.onUpdate((snapshot) => {
      if (snapshot.provider === slot) {
        const state = snapshot.state as { readyState?: string };
        snapshots.push({ readyState: state.readyState });
      }
    });

    TrafficManager.applyProviderState(slot, {
      readyState: "ready",
      sendState: "enabled",
      thinkingState: "idle",
    });

    const state = TrafficManager.state[slot];
    assert.equal(state.status.loading, "idle");
    assert.equal(state.readyState, "ready");
    assert.equal(state.loadingActive, false);
    assert.equal(state.loadingJustEnded, true);
    assert.equal(typeof state.loadingEndedAt, "number");
    assert.equal(timerCapture.scheduled.length, 1);
    assert.equal(
      (snapshots[snapshots.length - 1] as { readyState?: string } | undefined)?.readyState,
      "ready"
    );
  } finally {
    timerCapture.restore();
    if (originalState !== undefined) TrafficManager.state[slot] = originalState;
    TrafficManager.listeners = originalListeners;
    if (originalRunner === undefined) {
      delete TrafficManager._runners[slot];
    } else {
      TrafficManager._runners[slot] = originalRunner;
    }
    documentScope.document = originalDocument as { getElementById: (id: string) => HTMLElement | null; };
  }
});

void test("thinking is busy only while stop button is visible", () => {
  const tracker = new ThinkingTracker({ thinking: { stopButtonDetectionTimeoutMs: 2000 } });
  const now = Date.now();

  const state = {
    status: { thinking: "idle" },
    lastSendSeen: 0,
    stopButtonLastSeen: 0,
    stopButtonDisappearedAt: 0,
    thinkingJustEnded: false,
    thinkingEndedAt: 0,
  };

  const result = tracker.handleProbe(
    "ai1",
    state,
    { lastSend: now, stopVisible: true, sendState: "disabled", voiceMode: false },
    now
  );

  assert.equal(result.indicator, "busy");
});

void test("thinking ends with timeout reason when stop button stays hidden without send-ready signals", () => {
  const tracker = new ThinkingTracker({ thinking: { stopButtonDetectionTimeoutMs: 2000 } });
  const now = Date.now();

  const state = {
    status: { thinking: "busy" },
    lastSendSeen: 0,
    stopButtonLastSeen: now - 5_000,
    stopButtonDisappearedAt: 0,
    thinkingJustEnded: false,
    thinkingEndedAt: 0,
  };

  const firstProbe = tracker.handleProbe(
    "ai1",
    state,
    { stopVisible: false, sendState: "missing", voiceMode: false, lastSend: now },
    now
  );
  assert.equal(firstProbe.indicator, "busy");
  assert.equal(firstProbe.event, null);

  state.status.thinking = firstProbe.indicator;

  const secondProbe = tracker.handleProbe(
    "ai1",
    state,
    { stopVisible: false, sendState: "missing", voiceMode: false, lastSend: now },
    now + 2_100
  );

  assert.equal(secondProbe.indicator, "idle");
  assert.ok(secondProbe.event != null);
  assert.equal(secondProbe.event.type, "thinking-ended");
  assert.equal(secondProbe.event.reason, "timeout");
});

void test("default-page to conversation navigation triggers loading when skip flag is not set", () => {
  const slot = "ai1";
  const originalGetProvider = AppState.getProviderIdForSlot;
  const originalState = TrafficManager.state[slot];
  const originalSkip = TrafficManager._skipNextLoading[slot];

  try {
    AppState.getProviderIdForSlot = () => "chatgpt";
    TrafficManager.state[slot] = makeTrafficState("https://chatgpt.com");
    TrafficManager._skipNextLoading[slot] = false;

    TrafficManager._handleNavigation(slot, "https://chatgpt.com/c/abc");

    assert.equal(TrafficManager.state[slot].status.loading, "busy");
    assert.equal(TrafficManager.state[slot].loadingActive, true);
  } finally {
    AppState.getProviderIdForSlot = originalGetProvider;
    if (originalState !== undefined) TrafficManager.state[slot] = originalState;
    TrafficManager._skipNextLoading[slot] = originalSkip as boolean;
  }
});

void test("loading is forced to idle when thinking becomes busy during loading", async () => {
  const slot = "ai1";
  const originalGetProvider = AppState.getProviderIdForSlot;
  const originalState = TrafficManager.state[slot];
  const originalSkip = TrafficManager._skipNextLoading[slot];
  const originalWebview = TrafficManager.webviews[slot];
  const documentScope = globalThis as unknown as {
    document?: { getElementById: (id: string) => HTMLElement | null };
  };
  const originalDocument = documentScope.document;

  try {
    AppState.getProviderIdForSlot = () => "chatgpt";
    TrafficManager.state[slot] = makeTrafficState("https://chatgpt.com");
    TrafficManager._skipNextLoading[slot] = false;
    documentScope.document = { getElementById: () => null };

    const now = Date.now();
    const mockWebview = {
      executeJavaScript: async () => {
        await Promise.resolve();
        return {
          href: "https://chatgpt.com/c/abc",
        sendState: "disabled",
        stopVisible: true,
        voiceMode: false,
        lastSend: now,
        scroll: {
          scrollTop: 0,
          scrollHeight: 200,
          clientHeight: 100,

          scrollLeft: 0,
          scrollWidth: 800,
          clientWidth: 400,
        },
        isSameOrigin: true,
        isReady: true,
      };
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      getWebContentsId: () => 1,
      isDestroyed: () => false,
      isLoading: () => false,
      getWebContents: () => ({ isLoading: () => false }),
    };
    TrafficManager.webviews[slot] = mockWebview as unknown as typeof TrafficManager.webviews[typeof slot];

    TrafficManager._handleNavigation(slot, "https://chatgpt.com/c/abc");
    assert.equal(TrafficManager.state[slot].status.loading, "busy");

    await TrafficManager.probe(slot);

    assert.equal(TrafficManager.state[slot].status.thinking, "busy");
    assert.equal(TrafficManager.state[slot].status.loading, "idle");
    assert.equal(TrafficManager.state[slot].loadingActive, false);
  } finally {
    AppState.getProviderIdForSlot = originalGetProvider;
    if (originalState !== undefined) TrafficManager.state[slot] = originalState;
    TrafficManager._skipNextLoading[slot] = originalSkip as boolean;
    documentScope.document = originalDocument as { getElementById: (id: string) => HTMLElement | null; };
    if (originalWebview === undefined) {
      delete TrafficManager.webviews[slot];
    } else {
      TrafficManager.webviews[slot] = originalWebview;
    }
  }
});

void test("non-default navigation keeps loading busy even if thinking is busy", async () => {
  const slot = "ai1";
  const originalGetProvider = AppState.getProviderIdForSlot;
  const originalState = TrafficManager.state[slot];
  const originalSkip = TrafficManager._skipNextLoading[slot];
  const originalWebview = TrafficManager.webviews[slot];
  const documentScope = globalThis as unknown as {
    document?: { getElementById: (id: string) => HTMLElement | null };
  };
  const originalDocument = documentScope.document;

  try {
    AppState.getProviderIdForSlot = () => "chatgpt";
    TrafficManager.state[slot] = makeTrafficState("https://chatgpt.com/c/start");
    TrafficManager._skipNextLoading[slot] = false;
    documentScope.document = { getElementById: () => null };

    const now = Date.now();
    const mockWebview = {
      executeJavaScript: async () => {
        await Promise.resolve();
        return {
          href: "https://chatgpt.com/c/next",
        sendState: "disabled",
        stopVisible: true,
        voiceMode: false,
        lastSend: now,
        scroll: {
          scrollTop: 0,
          scrollHeight: 200,
          clientHeight: 100,

          scrollLeft: 0,
          scrollWidth: 800,
          clientWidth: 400,
        },
        isSameOrigin: true,
        isReady: true,
      };
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      getWebContentsId: () => 1,
      isDestroyed: () => false,
      isLoading: () => false,
      getWebContents: () => ({ isLoading: () => false }),
    };
    TrafficManager.webviews[slot] = mockWebview as unknown as typeof TrafficManager.webviews[typeof slot];

    TrafficManager._handleNavigation(slot, "https://chatgpt.com/c/next");
    assert.equal(TrafficManager.state[slot].status.loading, "busy");

    await TrafficManager.probe(slot);

    assert.equal(TrafficManager.state[slot].status.thinking, "busy");
    assert.equal(TrafficManager.state[slot].status.loading, "busy");
    assert.equal(TrafficManager.state[slot].loadingActive, true);
  } finally {
    AppState.getProviderIdForSlot = originalGetProvider;
    if (originalState !== undefined) TrafficManager.state[slot] = originalState;
    TrafficManager._skipNextLoading[slot] = originalSkip as boolean;
    documentScope.document = originalDocument as { getElementById: (id: string) => HTMLElement | null; };
    if (originalWebview === undefined) {
      delete TrafficManager.webviews[slot];
    } else {
      TrafficManager.webviews[slot] = originalWebview;
    }
  }
});
