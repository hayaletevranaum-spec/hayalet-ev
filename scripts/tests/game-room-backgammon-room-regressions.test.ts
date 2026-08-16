import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";

import { validateRoomManifest } from "../../src/types/rooms.ts";
import { loadWorkspaceScriptForVm } from "./helpers/room-workspace-script.ts";

const requiredFiles = [
  "rooms/game-room/manifest.json",
  "rooms/game-room/host/index.ts",
  "rooms/game-room/host/runtime.ts",
  "rooms/game-room/ui/index.html",
  "rooms/game-room/ui/context-runtime.ts",
  "rooms/game-room/ui/index.ts",
  "rooms/game-room/ui/game-room-ui-bootstrap.ts",
  "rooms/game-room/ui/game-room-ui-state-message-runtime.ts",
  "rooms/game-room/ui/game-room-ui-runtime.ts",
  "rooms/game-room/ui/style.css",
  "rooms/game-room/shared/host/feature-meta.ts",
  "rooms/game-room/shared/host/text.ts",
  "rooms/game-room/shared/host/context-state.ts",
  "rooms/game-room/shared/host/activation.ts",
  "rooms/game-room/shared/host/command-registry.ts",
  "rooms/game-room/shared/host/command-args.ts",
  "rooms/game-room/shared/ui/feature-contract.ts",
  "rooms/game-room/shared/ui/scroll-runtime.ts",
  "rooms/game-room/shared/types/room-shell-contracts.ts",
  "rooms/game-room/main-functions/backgammon/host/runtime.ts",
  "rooms/game-room/shared/styles/base.css",
  "rooms/game-room/i18n/en.json",
  "rooms/game-room/i18n/tr.json",
  "rooms/game-room/main-functions/backgammon/protocols/game-room-backgammon-user-start.md",
  "rooms/game-room/main-functions/backgammon/protocols/game-room-backgammon-ai-start.md",
  "rooms/game-room/main-functions/backgammon/host/copy.ts",
  "rooms/game-room/main-functions/backgammon/host/runtime-match.ts",
  "rooms/game-room/main-functions/backgammon/host/runtime-sync.ts",
  "rooms/game-room/main-functions/backgammon/host/state-core.ts",
  "rooms/game-room/main-functions/backgammon/host/state-invites.ts",
  "rooms/game-room/main-functions/backgammon/host/state-room-runtime.ts",
  "rooms/game-room/main-functions/backgammon/host/state.ts",
  "rooms/game-room/main-functions/backgammon/host/us1-invite-runtime.ts",
  "rooms/game-room/main-functions/backgammon/host/us1-sync-runtime.ts",
  "rooms/game-room/main-functions/backgammon/host/us1-runtime.ts",
  "rooms/game-room/main-functions/backgammon/ui/state-runtime.ts",
  "rooms/game-room/main-functions/backgammon/ui/backgammon-stage-runtime.ts",
  "rooms/game-room/main-functions/backgammon/ui/render-runtime.ts",
  "rooms/game-room/main-functions/backgammon/ui/module.ts",
  "rooms/game-room/main-functions/backgammon/styles.css",
  "rooms/game-room/main-functions/backgammon/styles/layout.css",
  "rooms/game-room/main-functions/backgammon/styles/presentation.css",
  "rooms/game-room/main-functions/backgammon/styles/board.css",
  "rooms/game-room/main-functions/backgammon/styles/scene-view.css",
  "rooms/game-room/shared/assets/room-background.webp",
  "rooms/game-room/shared/vendor/konva.min.js",
  "rooms/game-room/main-functions/backgammon/assets/backgammon-view.webp",
];

type BackgammonUiStateHarness = {
  state: {
    game: Record<string, unknown>;
    context: {
      slots: Record<string, Record<string, unknown>>;
      user: {
        nickname: string;
      };
    };
    preferences: {
      target: string;
      starter: string;
      inviteMessage: string;
    };
    lastCommandMessage: string;
    locale: string;
  };
  runtime: {
    createGameState: () => Record<string, unknown>;
    getCurrentStatus: () => string;
    syncPreferencesFromGame: () => void;
  };
};

type ScheduledFrameCallback = (timestamp: number) => void;
type ScheduledTimerCallback = () => void;
type ScheduledTimerHandle = {
  callback: ScheduledTimerCallback;
  cleared: boolean;
};
type GameRoomUiCoalescingHarness = {
  flushFrame: () => void;
  flushTimer: () => void;
  getFrameCount: () => number;
  getRenderAttempts: () => number;
  getTimerCount: () => number;
  runtime: {
    handleHostMessage(message: unknown): void;
  };
  setRenderFailure(enabled: boolean): void;
  setRenderHook(callback: (() => void) | null): void;
  state: {
    game: Record<string, unknown>;
    lastCommandMessage: string;
  };
};

class MinimalFakeElement {
  children: Array<MinimalFakeElement | string> = [];
  alt = "";
  className = "";
  dataset: Record<string, string> = {};
  disabled = false;
  id = "";
  innerHTML = "";
  loading = "";
  placeholder = "";
  readonly listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  replaceChildrenCount = 0;
  rows = 0;
  src = "";
  tagName = "DIV";
  textContent = "";
  title = "";
  type = "";
  value = "";

  constructor(tagName = "div", className = "", textContent = "") {
    this.tagName = tagName.toUpperCase();
    this.className = className;
    this.textContent = textContent;
  }

  addEventListener(eventName: string, handler: (...args: unknown[]) => void): void {
    const listeners = this.listeners[eventName] ?? [];
    listeners.push(handler);
    this.listeners[eventName] = listeners;
  }

  append(...children: Array<MinimalFakeElement | string>): void {
    this.children.push(...children);
  }

  click(): void {
    const event = {
      currentTarget: this,
      target: this,
      preventDefault: () => undefined,
    };
    (this.listeners["click"] ?? []).forEach((handler) => { handler(event); });
  }

  querySelector(selector: string): MinimalFakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): MinimalFakeElement[] {
    const matches: MinimalFakeElement[] = [];
    if (this.matchesSelector(selector)) {
      matches.push(this);
    }
    this.children.forEach((child) => {
      if (typeof child !== "string") {
        matches.push(...child.querySelectorAll(selector));
      }
    });
    return matches;
  }

  replaceChildren(...children: Array<MinimalFakeElement | string>): void {
    this.replaceChildrenCount += 1;
    this.children = [];
    this.append(...children);
  }

  setAttribute(name: string, value: string): void {
    if (name === "class") {
      this.className = value;
      return;
    }
    if (name === "id") {
      this.id = value;
      return;
    }
    this.dataset[name] = value;
  }

  private matchesSelector(selector: string): boolean {
    if (selector.startsWith(".")) {
      const className = selector.slice(1);
      return this.className.split(/\s+/).includes(className);
    }
    if (selector.startsWith("#")) {
      return this.id === selector.slice(1);
    }
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }
}

class MinimalFakeDocument {
  title = "";
  readonly app = new MinimalFakeElement();

  constructor() {
    this.app.id = "app";
  }

  getElementById(id: string): MinimalFakeElement | null {
    return id === "app" ? this.app : null;
  }

  querySelector(selector: string): MinimalFakeElement | null {
    return this.app.querySelector(selector);
  }

  createElement(tagName: string): MinimalFakeElement {
    return new MinimalFakeElement(tagName);
  }
}

type FakeStagePoint = { x: number; y: number };

class FakeStageHost {
  children: unknown[] = [];
  clientHeight = 600;
  clientWidth = 980;

  getBoundingClientRect(): { width: number; height: number } {
    return { width: this.clientWidth, height: this.clientHeight };
  }

  replaceChildren(...children: unknown[]): void {
    this.children = children;
  }
}

class FakeKonvaNode {
  children: FakeKonvaNode[] = [];
  destroyed = false;
  destroyChildrenCount = 0;
  drawCount = 0;
  batchDrawCount = 0;
  tweenCount = 0;
  readonly handlers: Record<string, Array<(event: unknown) => void>> = {};
  private parent: FakeKonvaNode | null = null;
  private positionValue: FakeStagePoint;
  private scaleValue: FakeStagePoint;
  private widthValue: number;
  private heightValue: number;

  constructor(config: Record<string, unknown> = {}) {
    this.positionValue = {
      x: typeof config["x"] === "number" ? config["x"] : 0,
      y: typeof config["y"] === "number" ? config["y"] : 0,
    };
    this.scaleValue = {
      x: typeof config["scaleX"] === "number" ? config["scaleX"] : 1,
      y: typeof config["scaleY"] === "number" ? config["scaleY"] : 1,
    };
    this.widthValue = typeof config["width"] === "number" ? config["width"] : 0;
    this.heightValue = typeof config["height"] === "number" ? config["height"] : 0;
  }

  add(...nodes: FakeKonvaNode[]): void {
    nodes.forEach((node) => {
      node.parent = this;
      this.children.push(node);
    });
  }

  batchDraw(): void {
    this.batchDrawCount += 1;
  }

  destroy(): void {
    this.destroyed = true;
  }

  destroyChildren(): void {
    this.destroyChildrenCount += 1;
    this.children = [];
  }

  draw(): void {
    this.drawCount += 1;
  }

  height(): number;
  height(value: number): void;
  height(value?: number): number | void {
    if (value === undefined) {
      return this.heightValue;
    }
    this.heightValue = value;
    return;
  }

  moveToTop(): void {
    if (this.parent === null) {
      return;
    }
    const siblings = this.parent.children;
    const index = siblings.indexOf(this);
    if (index < 0) {
      return;
    }
    siblings.splice(index, 1);
    siblings.push(this);
  }

  on(eventName: string, handler: (event: unknown) => void): void {
    const handlers = this.handlers[eventName] ?? [];
    handlers.push(handler);
    this.handlers[eventName] = handlers;
  }

  position(): FakeStagePoint;
  position(value: FakeStagePoint): void;
  position(value?: FakeStagePoint): FakeStagePoint | void {
    if (value === undefined) {
      return this.positionValue;
    }
    this.positionValue = value;
    return;
  }

  scale(): FakeStagePoint;
  scale(value: FakeStagePoint): void;
  scale(value?: FakeStagePoint): FakeStagePoint | void {
    if (value === undefined) {
      return this.scaleValue;
    }
    this.scaleValue = value;
    return;
  }

  to(): void {
    this.tweenCount += 1;
  }

  trigger(eventName: string): void {
    (this.handlers[eventName] ?? []).forEach((handler) => { handler({ target: this }); });
  }

  width(): number;
  width(value: number): void;
  width(value?: number): number | void {
    if (value === undefined) {
      return this.widthValue;
    }
    this.widthValue = value;
    return;
  }
}

class FakeKonvaStage extends FakeKonvaNode {
  static instances: FakeKonvaStage[] = [];

  constructor(config: { container: FakeStageHost; height: number; width: number }) {
    super(config);
    FakeKonvaStage.instances.push(this);
  }
}

class FakeKonvaLayer extends FakeKonvaNode {
  static instances: FakeKonvaLayer[] = [];

  constructor(config: Record<string, unknown> = {}) {
    super(config);
    FakeKonvaLayer.instances.push(this);
  }
}

class FakeKonvaGroup extends FakeKonvaNode {}

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  private readonly callback: () => void;

  constructor(callback: () => void) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }

  disconnect(): void {
    return undefined;
  }

  observe(): void {
    return undefined;
  }

  trigger(): void {
    this.callback();
  }
}

function resetFakeKonva(): void {
  FakeKonvaStage.instances = [];
  FakeKonvaLayer.instances = [];
  FakeResizeObserver.instances = [];
}

function findClickableKonvaNodes(node: FakeKonvaNode): FakeKonvaNode[] {
  const matches = node.handlers["click tap"] && node.handlers["click tap"].length > 0 ? [node] : [];
  node.children.forEach((child) => {
    matches.push(...findClickableKonvaNodes(child));
  });
  return matches;
}

function createBackgammonUiStateHarness(): BackgammonUiStateHarness {
  const windowObject: {
    GameRoomUiFactories?: {
      createBackgammonUiStateRuntime?: (
        deps: Record<string, unknown>
      ) => BackgammonUiStateHarness["runtime"];
    };
  } = {};
  const context = {
    window: windowObject,
    globalThis: windowObject,
  };
  vm.createContext(context);
  vm.runInNewContext(
    loadWorkspaceScriptForVm("rooms/game-room/main-functions/backgammon/ui/state-runtime.ts"),
    context
  );

  const createSlot = (slotId: string) => ({
    slotId,
    nickname: slotId.toUpperCase(),
    assigned: true,
    connected: slotId !== "us1",
    ready: true,
  });
  const state = {
    game: {} as Record<string, unknown>,
    context: {
      slots: {
        ai1: createSlot("ai1"),
        ai2: createSlot("ai2"),
        us1: {
          ...createSlot("us1"),
          connected: false,
        },
      },
      user: {
        nickname: "User",
      },
    },
    preferences: {
      target: "ai1",
      starter: "user",
      inviteMessage: "",
    },
    lastCommandMessage: "",
    locale: "tr",
  };

  const runtimeFactory = windowObject.GameRoomUiFactories?.createBackgammonUiStateRuntime;
  assert.equal(typeof runtimeFactory, "function");
  const runtime = (runtimeFactory as (deps: Record<string, unknown>) => BackgammonUiStateHarness["runtime"])({
    getState: () => state,
    roomId: "game-room",
    featureId: "backgammon",
    createSlot,
    createInviteEntry: () => ({
      roomId: "game-room",
      featureId: "backgammon",
      inviteId: "",
      remoteUserId: "",
      nickname: "US1",
      senderEmail: "",
      note: "",
      starter: "user",
      localSessionId: "",
      conversationId: "",
      sentAt: null,
    }),
    normalizeSlot: (_candidate: unknown, slotId: string) => createSlot(slotId),
    text: () => "",
    sendRoomCommand: () => undefined,
  });

  state.game = runtime.createGameState();
  return { state, runtime };
}

function createGameRoomUiCoalescingHarness(
  scheduler: "raf" | "timeout" | "raf-timeout" = "raf"
): GameRoomUiCoalescingHarness {
  const document = new MinimalFakeDocument();
  const frames: ScheduledFrameCallback[] = [];
  const timers: ScheduledTimerHandle[] = [];
  let renderAttempts = 0;
  let failRender = false;
  let renderHook: (() => void) | null = null;
  const state = {
    translations: {},
    context: {
      room: {
        name: "Game Room",
      },
    },
    preferences: {
      target: "ai1",
    },
    game: {} as Record<string, unknown>,
    teamTetris: {},
    lastCommandMessage: "",
  };
  const stateRef = { current: state };
  const windowObject: Record<string, unknown> = {};
  const context: Record<string, unknown> = {
    Date,
    document,
    navigator: { language: "en-US" },
    window: windowObject,
  };
  context["globalThis"] = context;
  if (scheduler === "raf" || scheduler === "raf-timeout") {
    context["requestAnimationFrame"] = (callback: ScheduledFrameCallback) => {
      frames.push(callback);
      return frames.length;
    };
  }
  if (scheduler === "timeout" || scheduler === "raf-timeout") {
    context["setTimeout"] = (callback: ScheduledTimerCallback) => {
      const handle: ScheduledTimerHandle = {
        callback,
        cleared: false,
      };
      timers.push(handle);
      return handle;
    };
    context["clearTimeout"] = (handle: ScheduledTimerHandle) => {
      handle.cleared = true;
    };
  }

  windowObject["GameRoomUiBootstrapRuntime"] = {
    createGameRoomUiBootstrapRuntime() {
      return {
        roomId: "game-room",
        featureId: "backgammon",
        teamTetrisFeatureId: "team-tetris",
        contextRuntime: {
          normalizeContext: () => state.context,
        },
        scrollRuntime: {
          capture: () => ({}),
          restore: () => undefined,
        },
        stateRef,
        getState: () => state,
        backgammonUi: {
          sanitizeGameState: (candidate: unknown) =>
            candidate != null && typeof candidate === "object" && Array.isArray(candidate) === false
              ? (candidate as Record<string, unknown>)
              : {},
          syncPreferencesFromGame: () => undefined,
          renderBootstrap: () => undefined,
          renderBackgammon: () => {
            renderAttempts += 1;
            renderHook?.();
            if (failRender) {
              throw new Error("render failed");
            }
          },
        },
        teamTetrisUi: {
          getTestBridge: () => ({}),
          sanitizeTeamTetrisState: () => ({}),
          syncTeamTetrisPreferencesFromState: () => undefined,
          syncTeamTetrisDraftFromState: () => undefined,
          renderTeamTetris: () => undefined,
        },
        bootstrapText: (key: string) => key,
        applyPresentationMode: () => undefined,
        applyLocale: () => undefined,
        getActiveFeatureId: () => "backgammon",
        getFeatureLabel: () => "Tavla",
      };
    },
  };

  vm.createContext(context);
  vm.runInNewContext(
    loadWorkspaceScriptForVm("rooms/game-room/ui/game-room-ui-state-message-runtime.ts"),
    context
  );
  vm.runInNewContext(
    loadWorkspaceScriptForVm("rooms/game-room/ui/game-room-ui-runtime.ts"),
    context
  );

  const runtimeRegistry = windowObject["GameRoomUiRuntime"] as Record<string, unknown> | undefined;
  const createRuntime = runtimeRegistry?.["createGameRoomUiRuntime"] as (() => GameRoomUiCoalescingHarness["runtime"]) | undefined;
  assert.equal(typeof createRuntime, "function");
  const runtime = (createRuntime as () => GameRoomUiCoalescingHarness["runtime"])();

  return {
    flushFrame(): void {
      const callback = frames.shift();
      assert.equal(typeof callback, "function");
      (callback as (...args: unknown[]) => unknown)(16);
    },
    flushTimer(): void {
      let handle = timers.shift();
      while (handle?.cleared === true) {
        handle = timers.shift();
      }
      assert.equal(typeof handle?.callback, "function");
      (handle as NonNullable<typeof handle>).callback();
    },
    getFrameCount: () => frames.length,
    getRenderAttempts: () => renderAttempts,
    getTimerCount: () => timers.filter((handle) => handle.cleared !== true).length,
    runtime,
    setRenderFailure(enabled: boolean): void {
      failRender = enabled;
    },
    setRenderHook(callback: (() => void) | null): void {
      renderHook = callback;
    },
    state,
  };
}

void test("game-room workspace keeps the required Tavla package files", () => {
  requiredFiles.forEach((filePath) => {
    assert.equal(existsSync(filePath), true, filePath);
  });
});

void test("game-room manifest validates with the Tavla-first room contract", () => {
  const manifest = JSON.parse(readFileSync("rooms/game-room/manifest.json", "utf8")) as Record<string, unknown>;
  const validation = validateRoomManifest(manifest);

  assert.equal(validation.valid, true);
  assert.equal(validation.manifest?.id, "game-room");
  assert.equal(validation.manifest.defaultFeatureId, "backgammon");
  assert.deepEqual(
    validation.manifest.features.map((feature) => feature.id),
    ["backgammon", "team-tetris"]
  );
  assert.equal(validation.manifest.runtime.uiEntry, "ui/index.html");
  assert.equal(validation.manifest.runtime.hostEntry, "host/index.js");
  assert.equal(validation.manifest.scene?.characterRosterPreset, "connected-plus-user");
  assert.equal(validation.manifest.scene.characters?.length, 3);
  assert.equal(validation.manifest.scene.chrome?.pageShellVariant, "immersive-stage");
});

void test("game-room Tavla UI keeps the local idle target selection during snapshot sync", () => {
  const { state, runtime } = createBackgammonUiStateHarness();
  state.preferences.target = "us1";
  state.preferences.starter = "ai";
  Object.assign(state.game, {
    active: false,
    result: "idle",
    pendingInvite: null,
    inviteId: null,
    remoteUserId: null,
    selectedTarget: "ai1",
    starter: "user",
  });

  runtime.syncPreferencesFromGame();

  assert.equal(state.preferences.target, "us1");
  assert.equal(state.preferences.starter, "ai");
});

void test("game-room Tavla UI syncs the host target once the match state becomes authoritative", () => {
  const { state, runtime } = createBackgammonUiStateHarness();
  state.preferences.target = "ai1";
  state.preferences.starter = "user";
  Object.assign(state.game, {
    active: true,
    result: "pending",
    pendingInvite: null,
    inviteId: "invite-1",
    remoteUserId: "remote-user-1",
    selectedTarget: "us1",
    starter: "ai",
  });

  runtime.syncPreferencesFromGame();

  assert.equal(state.preferences.target, "us1");
  assert.equal(state.preferences.starter, "ai");
});

void test("game-room Tavla UI prioritizes command-result messages over stale game status text", () => {
  const { state, runtime } = createBackgammonUiStateHarness();
  Object.assign(state.game, {
    active: true,
    result: "pending",
    status: "Waiting for the remote move.",
  });
  state.lastCommandMessage = "A duplicate remote move was ignored.";

  assert.equal(runtime.getCurrentStatus(), "A duplicate remote move was ignored.");
});

void test("game-room Tavla render keeps the board stage host stable across rail rerenders", () => {
  const document = new MinimalFakeDocument();
  const stageHosts: unknown[] = [];
  const createSlot = (slotId: string) => ({
    slotId,
    nickname: slotId.toUpperCase(),
    assigned: true,
    connected: true,
    ready: true,
    dispatchable: true,
  });
  const state = {
    presentation: {
      mode: "classic",
    },
    lastCommandMessage: "",
    preferences: {
      target: "ai2",
      starter: "user",
      inviteMessage: "",
      invitesTab: "incoming",
    },
    context: {
      room: {
        name: "Game Room",
      },
      user: {
        nickname: "User",
        avatar: null,
      },
      slots: {
        ai1: {
          ...createSlot("ai1"),
          connected: false,
          ready: false,
          dispatchable: false,
        },
        ai2: createSlot("ai2"),
        us1: {
          ...createSlot("us1"),
          connected: false,
          dispatchable: false,
        },
      },
    },
    game: {
      pendingInvite: null,
      inviteInbox: [],
      matchHistory: [],
      active: false,
      blockedReason: "",
      awaitingMoveFrom: null,
      user: {
        nickname: "User",
      },
      board: Array.from({ length: 24 }, (_value, index) => ({
        point: index + 1,
        owner: "",
        count: 0,
      })),
      bar: {
        user: 0,
        ai: 0,
      },
      off: {
        user: 0,
        ai: 0,
      },
      dice: [],
      legalMoves: [],
      result: "idle",
      scorePoints: 1,
    },
  };
  const windowObject: Record<string, unknown> = {
    GameRoomUiFactories: {
      createBackgammonStageRuntime: () => ({
        destroy: () => undefined,
        renderBackgammonStage: (host: unknown) => {
          stageHosts.push(host);
        },
      }),
    },
  };
  const context = {
    document,
    window: windowObject,
    globalThis: windowObject,
  };
  vm.createContext(context);
  vm.runInNewContext(
    loadWorkspaceScriptForVm("rooms/game-room/main-functions/backgammon/ui/render-runtime.ts"),
    context
  );

  const registry = windowObject["GameRoomUiFactories"] as Record<string, unknown>;
  const createRenderRuntime = registry["createBackgammonUiRenderRuntime"] as ((deps: Record<string, unknown>) => { renderBackgammon(root: MinimalFakeElement): void }) | undefined;
  assert.equal(typeof createRenderRuntime, "function");
  const renderRuntime = (createRenderRuntime as (deps: Record<string, unknown>) => { renderBackgammon(root: MinimalFakeElement): void })({
    getState: () => state,
    featureId: "backgammon",
    bootstrapText: (key: string) => key,
    text: (path: string[]) => path.at(-1) ?? "",
    createElement: (tagName: string, className = "", textContent = "") =>
      new MinimalFakeElement(tagName, className, textContent),
    render: () => undefined,
    isRoomApiAvailable: () => true,
    getFeatureLabel: () => "Tavla",
    stateRuntime: {
      onAcceptInvite: () => undefined,
      onRejectInvite: () => undefined,
      formatInviteMeta: () => "",
      getSelectedTarget: () => state.preferences.target,
      getDisplayOpponent: () => state.context.slots.ai2,
      getSlotOrder: () => [
        state.context.slots.ai1,
        state.context.slots.ai2,
        state.context.slots.us1,
      ],
      getSlotStatusLabel: () => "Ready",
      getStarterLabelForCurrentTarget: (starter: string) => starter,
      onStart: () => undefined,
      onReset: () => undefined,
      getCurrentStatus: () => "",
      getTurnLabel: () => "",
      getResultLabel: () => "",
      getDiceLabel: () => "",
      getBearOffLabel: () => "",
      getBarLabel: () => "",
      onLegalMove: () => undefined,
      onCancelOutgoingInvite: () => undefined,
      getMatchHistory: () => [],
      getMatchHistoryResultLabel: () => "",
      getMatchHistoryResultTone: () => "neutral",
      formatMatchHistoryDate: () => "",
    },
  });

  renderRuntime.renderBackgammon(document.app);
  const rootReplaceCountAfterInitialRender = document.app.replaceChildrenCount;
  const initialSlotCards = document.app.querySelectorAll(".backgammon-slot-card");
  assert.equal(initialSlotCards[0]?.dataset["selected"], "false");
  assert.equal(initialSlotCards[1]?.dataset["selected"], "true");

  initialSlotCards[0].click();

  assert.equal(state.preferences.target, "ai1");
  assert.equal(document.app.querySelector(".backgammon-button--primary")?.disabled, false);
  assert.equal(stageHosts.length, 1);
  assert.equal(document.app.replaceChildrenCount, rootReplaceCountAfterInitialRender);

  const updatedSlotCards = document.app.querySelectorAll(".backgammon-slot-card");
  assert.equal(updatedSlotCards[0]?.dataset["selected"], "true");
  assert.equal(updatedSlotCards[1]?.dataset["selected"], "false");

  const starterButtons = document.app.querySelectorAll(".backgammon-choice-button");
  starterButtons[1]?.click();
  assert.equal(state.preferences.starter, "ai");
  assert.equal(stageHosts.length, 1);
  assert.equal(document.app.replaceChildrenCount, rootReplaceCountAfterInitialRender);

  const inviteTabs = document.app.querySelectorAll(".backgammon-tab");
  inviteTabs[1]?.click();
  assert.equal(state.preferences.invitesTab, "outgoing");
  assert.equal(stageHosts.length, 1);
  assert.equal(document.app.replaceChildrenCount, rootReplaceCountAfterInitialRender);

  renderRuntime.renderBackgammon(document.app);

  assert.equal(stageHosts.length, 2);
  assert.equal(stageHosts[0], stageHosts[1]);
  assert.equal(document.app.replaceChildrenCount, rootReplaceCountAfterInitialRender);

  Object.assign(state.game, {
    active: true,
    awaitingMoveFrom: "user",
  });
  renderRuntime.renderBackgammon(document.app);

  assert.equal(document.app.replaceChildrenCount, rootReplaceCountAfterInitialRender);
  assert.equal(document.app.querySelector(".backgammon-stage")?.dataset["awaiting"], "user");
});

void test("game-room Tavla Konva stage reuses layers for selection-only redraws", () => {
  resetFakeKonva();
  const windowObject: Record<string, unknown> = {
    GameRoomUiFactories: {},
    Konva: {
      Stage: FakeKonvaStage,
      Layer: FakeKonvaLayer,
      Group: FakeKonvaGroup,
      Rect: FakeKonvaNode,
      Line: FakeKonvaNode,
      Circle: FakeKonvaNode,
      Text: FakeKonvaNode,
    },
  };
  const context = {
    document: { documentElement: {} },
    getComputedStyle: () => ({
      getPropertyValue: () => "",
    }),
    globalThis: windowObject,
    window: windowObject,
  };
  vm.createContext(context);
  vm.runInNewContext(
    loadWorkspaceScriptForVm(
      "rooms/game-room/main-functions/backgammon/ui/backgammon-stage-runtime.ts"
    ),
    context
  );

  const registry = windowObject["GameRoomUiFactories"] as Record<string, unknown>;
  const createStageRuntime = registry["createBackgammonStageRuntime"];
  assert.equal(typeof createStageRuntime, "function");
  const legalMoves = [
    {
      id: "move-1",
      label: "1-2-3",
      diceUsed: [1, 1],
      moves: [
        {
          from: { type: "point", point: 1 },
          to: { type: "point", point: 2 },
          die: 1,
          hit: false,
        },
        {
          from: { type: "point", point: 2 },
          to: { type: "point", point: 3 },
          die: 1,
          hit: false,
        },
      ],
    },
  ];
  const board = Array.from({ length: 24 }, (_value, index) => ({
    point: index + 1,
    owner: index === 0 ? "user" : "",
    count: index === 0 ? 1 : 0,
  }));
  const game = {
    active: true,
    awaitingMoveFrom: "user",
    blockedReason: "",
    board,
    bar: { user: 0, ai: 0 },
    off: { user: 0, ai: 0 },
    dice: [1, 1],
    legalMoves,
    turnIndex: 1,
    turnToken: "turn-1",
    boardHash: "board-1",
  };
  const selectedMoveIds: string[] = [];
  const stageRuntime = (
    createStageRuntime as (deps: Record<string, unknown>) => {
      renderBackgammonStage(host: FakeStageHost, options: Record<string, unknown>): void;
    }
  )({
    createElement: (tagName: string, className = "", textContent = "") =>
      new MinimalFakeElement(tagName, className, textContent),
    getState: () => ({ game }),
    stateRuntime: {
      onLegalMove: (moveId: string) => {
        selectedMoveIds.push(moveId);
      },
    },
    text: (path: string[]) => path.at(-1) ?? "",
  });
  const host = new FakeStageHost();

  stageRuntime.renderBackgammonStage(host, {
    canUserMove: true,
    game,
    players: {
      user: { name: "User", avatar: null, active: true },
      opponent: { name: "AI", avatar: null, active: false },
    },
  });

  assert.equal(FakeKonvaLayer.instances.length, 4);
  const [boardLayer, highlightLayer, checkerLayer, uiLayer] = FakeKonvaLayer.instances;
  assert.ok(boardLayer);
  assert.ok(highlightLayer);
  assert.ok(checkerLayer);
  assert.ok(uiLayer);
  const checkerClearsAfterInitialRender = checkerLayer.destroyChildrenCount;
  const highlightClearsAfterInitialRender = highlightLayer.destroyChildrenCount;
  const uiClearsAfterInitialRender = uiLayer.destroyChildrenCount;
  const sourceChecker = findClickableKonvaNodes(checkerLayer)[0];
  assert.ok(sourceChecker);
  assert.equal(sourceChecker.handlers["mouseover"], undefined);
  assert.equal(sourceChecker.handlers["mouseout"], undefined);

  sourceChecker.trigger("click tap");

  assert.equal(FakeKonvaLayer.instances.length, 4);
  assert.equal(FakeKonvaLayer.instances[0], boardLayer);
  assert.equal(FakeKonvaLayer.instances[1], highlightLayer);
  assert.equal(FakeKonvaLayer.instances[2], checkerLayer);
  assert.equal(FakeKonvaLayer.instances[3], uiLayer);
  assert.equal(boardLayer.destroyed, false);
  assert.equal(highlightLayer.destroyed, false);
  assert.equal(checkerLayer.destroyed, false);
  assert.equal(uiLayer.destroyed, false);
  assert.equal(checkerLayer.destroyChildrenCount, checkerClearsAfterInitialRender);
  assert.ok(highlightLayer.destroyChildrenCount > highlightClearsAfterInitialRender);
  assert.ok(uiLayer.destroyChildrenCount > uiClearsAfterInitialRender);

  const targetArea = findClickableKonvaNodes(uiLayer)[0];
  assert.ok(targetArea);
  targetArea.trigger("click tap");

  assert.equal(selectedMoveIds.length, 0);
  assert.ok(checkerLayer.destroyChildrenCount > checkerClearsAfterInitialRender);
  assert.equal(FakeKonvaLayer.instances.length, 4);
});

void test("game-room Tavla Konva stage coalesces resize redraws and skips unchanged sizes", () => {
  resetFakeKonva();
  const frames: Array<() => void> = [];
  const windowObject: Record<string, unknown> = {
    GameRoomUiFactories: {},
    Konva: {
      Stage: FakeKonvaStage,
      Layer: FakeKonvaLayer,
      Group: FakeKonvaGroup,
      Rect: FakeKonvaNode,
      Line: FakeKonvaNode,
      Circle: FakeKonvaNode,
      Text: FakeKonvaNode,
    },
  };
  const context = {
    ResizeObserver: FakeResizeObserver,
    document: { documentElement: {} },
    getComputedStyle: () => ({
      getPropertyValue: () => "",
    }),
    requestAnimationFrame: (callback: ScheduledFrameCallback) => {
      frames.push(() => { callback(16); });
      return frames.length;
    },
    globalThis: {
      requestAnimationFrame: (callback: ScheduledFrameCallback) => {
        frames.push(() => { callback(16); });
        return frames.length;
      },
    },
    window: windowObject,
  };
  vm.createContext(context);
  vm.runInNewContext(
    loadWorkspaceScriptForVm(
      "rooms/game-room/main-functions/backgammon/ui/backgammon-stage-runtime.ts"
    ),
    context
  );

  const registry = windowObject["GameRoomUiFactories"] as Record<string, unknown>;
  const createStageRuntime = registry["createBackgammonStageRuntime"];
  assert.equal(typeof createStageRuntime, "function");
  const game = {
    active: true,
    awaitingMoveFrom: "user",
    blockedReason: "",
    board: Array.from({ length: 24 }, (_value, index) => ({
      point: index + 1,
      owner: index === 0 ? "user" : "",
      count: index === 0 ? 1 : 0,
    })),
    bar: { user: 0, ai: 0 },
    off: { user: 0, ai: 0 },
    dice: [1, 1],
    legalMoves: [],
    turnIndex: 1,
    turnToken: "turn-1",
    boardHash: "board-1",
  };
  const stageRuntime = (
    createStageRuntime as (deps: Record<string, unknown>) => {
      renderBackgammonStage(host: FakeStageHost, options: Record<string, unknown>): void;
    }
  )({
    createElement: (tagName: string, className = "", textContent = "") =>
      new MinimalFakeElement(tagName, className, textContent),
    getState: () => ({ game }),
    stateRuntime: {
      onLegalMove: () => undefined,
    },
    text: (path: string[]) => path.at(-1) ?? "",
  });
  const host = new FakeStageHost();

  stageRuntime.renderBackgammonStage(host, {
    canUserMove: true,
    game,
    players: {
      user: { name: "User", avatar: null, active: true },
      opponent: { name: "AI", avatar: null, active: false },
    },
  });

  const observer = FakeResizeObserver.instances[0];
  const stage = FakeKonvaStage.instances[0];
  const boardLayer = FakeKonvaLayer.instances[0];
  assert.ok(observer);
  assert.ok(stage);
  assert.ok(boardLayer);
  const drawCountAfterInitialRender = stage.drawCount;
  const boardClearsAfterInitialRender = boardLayer.destroyChildrenCount;

  observer.trigger();
  observer.trigger();
  assert.equal(frames.length, 1);
  frames.shift()?.();

  assert.equal(stage.drawCount, drawCountAfterInitialRender);
  assert.equal(boardLayer.destroyChildrenCount, boardClearsAfterInitialRender);

  host.clientWidth = 900;
  observer.trigger();
  observer.trigger();
  assert.equal(frames.length, 1);
  frames.shift()?.();

  assert.equal(stage.drawCount, drawCountAfterInitialRender + 1);
  assert.equal(boardLayer.destroyChildrenCount, boardClearsAfterInitialRender);
  assert.equal(FakeKonvaLayer.instances.length, 4);
});

void test("game-room Tavla UI coalesces Tavla state and command-result renders per frame", () => {
  const harness = createGameRoomUiCoalescingHarness("raf");

  harness.runtime.handleHostMessage({
    type: "backgammon-state",
    payload: {
      state: {
        active: true,
      },
    },
  });
  harness.runtime.handleHostMessage({
    type: "command-result",
    command: "GameRoomBackgammonStart",
    result: {
      success: true,
      message: "Match started.",
    },
  });

  assert.equal(harness.getFrameCount(), 1);
  assert.equal(harness.getRenderAttempts(), 0);
  assert.equal(harness.state.lastCommandMessage, "Match started.");

  harness.flushFrame();

  assert.equal(harness.getFrameCount(), 0);
  assert.equal(harness.getRenderAttempts(), 1);
  assert.equal(harness.state.lastCommandMessage, "Match started.");

  harness.runtime.handleHostMessage({
    type: "backgammon-state",
    payload: {
      state: {
        active: false,
      },
    },
  });
  assert.equal(harness.getFrameCount(), 1);
  harness.flushFrame();
  assert.equal(harness.getRenderAttempts(), 2);
  assert.equal(harness.state.lastCommandMessage, "");
});

void test("game-room Tavla UI keeps current final-state semantics when Tavla command-result is stale", () => {
  const harness = createGameRoomUiCoalescingHarness("raf");

  harness.runtime.handleHostMessage({
    type: "command-result",
    command: "GameRoomBackgammonUserMove",
    result: {
      success: false,
      message: "Stale move.",
    },
  });
  harness.runtime.handleHostMessage({
    type: "backgammon-state",
    payload: {
      state: {
        active: true,
      },
    },
  });

  assert.equal(harness.getFrameCount(), 1);
  harness.flushFrame();
  assert.equal(harness.getRenderAttempts(), 1);
  assert.equal(harness.state.lastCommandMessage, "");
});

void test("game-room Tavla UI schedules a follow-up frame for state received during render", () => {
  const harness = createGameRoomUiCoalescingHarness("raf");
  let injectedStateDuringRender = false;

  harness.setRenderHook(() => {
    if (injectedStateDuringRender) {
      return;
    }
    injectedStateDuringRender = true;
    harness.runtime.handleHostMessage({
      type: "backgammon-state",
      payload: {
        state: {
          active: true,
          dice: [4, 4, 4, 4],
        },
      },
    });
  });

  harness.runtime.handleHostMessage({
    type: "command-result",
    command: "GameRoomBackgammonStart",
    result: {
      success: true,
      message: "Match started.",
    },
  });

  assert.equal(harness.getFrameCount(), 1);
  harness.flushFrame();

  assert.equal(harness.getRenderAttempts(), 1);
  assert.equal(harness.getFrameCount(), 1);
  assert.deepEqual(harness.state.game["dice"], [4, 4, 4, 4]);
  assert.equal(harness.state.lastCommandMessage, "");

  harness.setRenderHook(null);
  harness.flushFrame();
  assert.equal(harness.getRenderAttempts(), 2);
  assert.equal(harness.getFrameCount(), 0);
});

void test("game-room Tavla render scheduler falls back when requestAnimationFrame stalls", () => {
  const harness = createGameRoomUiCoalescingHarness("raf-timeout");

  harness.runtime.handleHostMessage({
    type: "backgammon-state",
    payload: {
      state: {
        active: true,
        dice: [6, 4],
      },
    },
  });

  assert.equal(harness.getFrameCount(), 1);
  assert.equal(harness.getTimerCount(), 1);
  assert.equal(harness.getRenderAttempts(), 0);

  harness.flushTimer();

  assert.equal(harness.getRenderAttempts(), 1);
  assert.equal(harness.getTimerCount(), 0);
  assert.equal(harness.getFrameCount(), 1);

  harness.flushFrame();

  assert.equal(harness.getRenderAttempts(), 1);
  assert.equal(harness.getFrameCount(), 0);
});

void test("game-room command-result render scheduling stays scoped to Tavla commands", () => {
  const harness = createGameRoomUiCoalescingHarness("raf");

  harness.runtime.handleHostMessage({
    type: "command-result",
    command: "GameRoomTeamTetrisStart",
    result: {
      success: false,
      message: "Team Tetris setup is incomplete.",
    },
  });

  assert.equal(harness.getFrameCount(), 0);
  assert.equal(harness.getRenderAttempts(), 1);
  assert.equal(harness.state.lastCommandMessage, "Team Tetris setup is incomplete.");
});

void test("game-room Tavla render scheduler supports timer fallback and clears failures", () => {
  const harness = createGameRoomUiCoalescingHarness("timeout");

  harness.runtime.handleHostMessage({
    type: "backgammon-state",
    payload: {
      state: {
        active: true,
      },
    },
  });
  harness.runtime.handleHostMessage({
    type: "command-result",
    command: "GameRoomBackgammonReset",
    result: {
      success: true,
      message: "Reset.",
    },
  });

  assert.equal(harness.getTimerCount(), 1);
  assert.equal(harness.getRenderAttempts(), 0);
  harness.flushTimer();
  assert.equal(harness.getRenderAttempts(), 1);

  harness.setRenderFailure(true);
  harness.runtime.handleHostMessage({
    type: "backgammon-state",
    payload: {
      state: {
        active: false,
      },
    },
  });
  assert.equal(harness.getTimerCount(), 1);
  assert.throws(() => { harness.flushTimer(); }, /render failed/);
  assert.equal(harness.getRenderAttempts(), 2);

  harness.setRenderFailure(false);
  harness.runtime.handleHostMessage({
    type: "backgammon-state",
    payload: {
      state: {
        active: true,
      },
    },
  });
  assert.equal(harness.getTimerCount(), 1);
  harness.flushTimer();
  assert.equal(harness.getRenderAttempts(), 3);
});

void test("game-room Tavla UI forwards remote identity with invite actions", () => {
  const uiModuleSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/backgammon/ui/module.ts"
  );
  const uiStateRuntimeSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/backgammon/ui/state-runtime.ts"
  );
  const backgammonStageRuntimeSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/backgammon/ui/backgammon-stage-runtime.ts"
  );
  const uiRenderRuntimeSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/backgammon/ui/render-runtime.ts"
  );
  const indexHtmlSource = readFileSync("rooms/game-room/ui/index.html", "utf8");
  const runtimeSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/backgammon/host/runtime.ts"
  );
  const stylesSource = readFileSync("rooms/game-room/main-functions/backgammon/styles.css", "utf8");
  const stateSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/backgammon/host/state.ts"
  );
  const stateCoreSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/backgammon/host/state-core.ts"
  );
  const stateInvitesSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/backgammon/host/state-invites.ts"
  );
  const stateRoomRuntimeSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/backgammon/host/state-room-runtime.ts"
  );
  const runtimeMatchSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/backgammon/host/runtime-match.ts"
  );
  const runtimeSyncSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/backgammon/host/runtime-sync.ts"
  );
  const us1RuntimeSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/backgammon/host/us1-runtime.ts"
  );
  const us1InviteRuntimeSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/backgammon/host/us1-invite-runtime.ts"
  );
  const us1SyncRuntimeSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/backgammon/host/us1-sync-runtime.ts"
  );

  assert.match(indexHtmlSource, /<script src="\.\/context-runtime\.js"><\/script>/);
  assert.match(indexHtmlSource, /shared\/vendor\/konva\.min\.js/);
  assert.match(indexHtmlSource, /main-functions\/backgammon\/ui\/backgammon-stage-runtime\.js/);
  assert.ok(
    indexHtmlSource.indexOf("shared/vendor/konva.min.js") <
      indexHtmlSource.indexOf("main-functions/backgammon/ui/backgammon-stage-runtime.js")
  );
  assert.ok(
    indexHtmlSource.indexOf("main-functions/backgammon/ui/backgammon-stage-runtime.js") <
      indexHtmlSource.indexOf("main-functions/backgammon/ui/render-runtime.js")
  );
  assert.match(indexHtmlSource, /<script src="\.\/game-room-ui-bootstrap\.js"><\/script>/);
  assert.match(
    indexHtmlSource,
    /<script src="\.\/game-room-ui-state-message-runtime\.js"><\/script>/
  );
  assert.match(indexHtmlSource, /main-functions\/backgammon\/ui\/state-runtime\.js/);
  assert.match(indexHtmlSource, /main-functions\/backgammon\/ui\/render-runtime\.js/);
  assert.match(stylesSource, /@import "\.\/styles\/layout\.css"/);
  assert.match(stylesSource, /@import "\.\/styles\/presentation\.css"/);
  assert.match(stylesSource, /@import "\.\/styles\/board\.css"/);
  assert.match(stylesSource, /@import "\.\/styles\/scene-view\.css"/);
  assert.match(uiModuleSource, /createBackgammonUiStateRuntime/);
  assert.match(uiModuleSource, /createBackgammonUiRenderRuntime/);
  assert.match(backgammonStageRuntimeSource, /createBackgammonStageRuntime/);
  assert.match(backgammonStageRuntimeSource, /renderBackgammonStage/);
  assert.match(backgammonStageRuntimeSource, /function flushStageDraw/);
  assert.match(backgammonStageRuntimeSource, /stageInstance\.draw\(\)/);
  assert.match(backgammonStageRuntimeSource, /flushStageDraw\(stage\)/);
  assert.match(
    backgammonStageRuntimeSource,
    /group\.add\(die\);\s*if \(animate\) \{\s*try \{\s*die\.to/
  );
  assert.match(backgammonStageRuntimeSource, /draggable/);
  assert.match(runtimeSource, /from "\.\/runtime-match\.js"/);
  assert.match(runtimeSource, /from "\.\/runtime-sync\.js"/);
  assert.match(stateSource, /from "\.\/state-core\.js"/);
  assert.match(stateSource, /from "\.\/state-invites\.js"/);
  assert.match(stateSource, /from "\.\/state-room-runtime\.js"/);
  assert.match(us1RuntimeSource, /from "\.\/us1-invite-runtime\.js"/);
  assert.match(us1RuntimeSource, /from "\.\/us1-sync-runtime\.js"/);
  assert.match(runtimeMatchSource, /export async function sendAiTurnUpdate/);
  assert.match(runtimeSyncSource, /export function syncFromContext/);
  assert.match(stateCoreSource, /export function createInitialState/);
  assert.match(stateInvitesSource, /export function normalizeInviteEntry/);
  assert.match(stateRoomRuntimeSource, /export function pushRoomState/);
  assert.match(us1InviteRuntimeSource, /export function createGameRoomBackgammonUs1InviteRuntime/);
  assert.match(us1SyncRuntimeSource, /export function createGameRoomBackgammonUs1SyncRuntime/);
  assert.match(
    uiStateRuntimeSource,
    /sendRoomCommand\("GameRoomBackgammonAcceptInvite",\s*\{\s*(inviteId:\s*inviteId|inviteId),\s*(remoteUserId:\s*remoteUserId|remoteUserId)\s*,?\s*\}\s*\)/
  );
  assert.match(
    uiStateRuntimeSource,
    /sendRoomCommand\("GameRoomBackgammonRejectInvite",\s*\{\s*(inviteId:\s*inviteId|inviteId),\s*(remoteUserId:\s*remoteUserId|remoteUserId)\s*,?\s*\}\s*\)/
  );
  assert.match(uiRenderRuntimeSource, /function renderBootstrap\(root\)/);
  assert.match(runtimeSource, /GameRoomBackgammonStart/);
});
