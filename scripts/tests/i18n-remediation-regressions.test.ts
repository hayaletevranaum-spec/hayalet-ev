import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

import { getBuiltInLanguagePack } from "../../shared/i18n/bundled-languages.ts";
import type { TranslationCatalog } from "../../src/types/i18n.ts";
import { loadWorkspaceScriptForVm } from "./helpers/room-workspace-script.ts";

function getCatalogString(
  catalog: TranslationCatalog | null | undefined,
  path: string[]
): string | undefined {
  let current: string | TranslationCatalog | undefined = catalog ?? undefined;

  for (const segment of path) {
    if (current === undefined || typeof current === "string") {
      return undefined;
    }

    current = current[segment];
  }

  return typeof current === "string" ? current : undefined;
}

function listCatalogLeafPaths(
  catalog: TranslationCatalog | null | undefined,
  prefix: string[] = []
): string[] {
  if (catalog === null || catalog === undefined) {
    return [];
  }

  return Object.entries(catalog).flatMap(([key, value]) => {
    const path = [...prefix, key];
    if (typeof value === "string") {
      return [path.join(".")];
    }
    if (typeof value === "object" && Array.isArray(value) === false) {
      return listCatalogLeafPaths(value, path);
    }
    return [];
  });
}

function readRoomCatalog(locale: "en" | "tr"): TranslationCatalog {
  return JSON.parse(
    readFileSync(`rooms/game-room/i18n/${locale}.json`, "utf8")
  ) as TranslationCatalog;
}

void test("whisper shell bindings resolve through the entrance namespace", () => {
  const indexHtml = readFileSync("src/index.html", "utf8");
  const whisperHtml = readFileSync("src/pages/whisper.html", "utf8");

  assert.match(indexHtml, /data-shell-i18n-title="entrance\.panels\.whisper"/);
  assert.match(indexHtml, /data-shell-i18n-aria-label="entrance\.panels\.whisper"/);
  assert.match(whisperHtml, /data-shell-i18n-text="entrance\.panels\.whisper"/);
  assert.doesNotMatch(indexHtml, /data-shell-i18n-(?:title|aria-label)="panels\.whisper"/);
  assert.doesNotMatch(whisperHtml, /data-shell-i18n-text="panels\.whisper"/);
});

void test("catalog cleanup removes stale built-in keys and preserves translated replacements", () => {
  const enPack = getBuiltInLanguagePack("en");
  const trPack = getBuiltInLanguagePack("tr");

  assert.equal(getCatalogString(enPack?.catalog, ["app", "startup", "loadingSettings"]), undefined);
  assert.equal(getCatalogString(trPack?.catalog, ["app", "startup", "loadingSettings"]), undefined);
  assert.equal(
    getCatalogString(enPack?.catalog, ["entrance", "user", "language", "restartHint"]),
    undefined
  );
  assert.equal(
    getCatalogString(trPack?.catalog, ["entrance", "user", "language", "restartHint"]),
    undefined
  );

  const translatedPairs = [
    {
      path: ["shell", "assistant", "memoryOverlay", "title"],
      tr: "Bellek Görüntüleyici",
    },
    {
      path: ["entrance", "user", "googleDrive", "authCodePlaceholder"],
      tr: "Yetki kodu",
    },
    {
      path: ["entrance", "us1", "remote", "sectionTitle"],
      tr: "Uzak kullanıcı el sıkışması",
    },
    {
      path: ["opencodeUi", "chat", "clearLabel"],
      tr: "🗑 Temizle",
    },
    {
      path: ["opencodeUi", "panel", "serverTitle"],
      tr: "OpenCode Sunucusu",
    },
  ];

  for (const entry of translatedPairs) {
    const enValue = getCatalogString(enPack?.catalog, entry.path);
    const trValue = getCatalogString(trPack?.catalog, entry.path);

    assert.ok(enValue != null, `${entry.path.join(".")} should exist in EN catalog`);
    assert.equal(trValue, entry.tr);
    assert.notEqual(enValue, trValue, `${entry.path.join(".")} should differ between EN/TR`);
  }
});

void test("game-room room catalogs stay structurally aligned across EN and TR", () => {
  const enCatalog = readRoomCatalog("en");
  const trCatalog = readRoomCatalog("tr");

  assert.deepEqual(listCatalogLeafPaths(trCatalog).sort(), listCatalogLeafPaths(enCatalog).sort());
});

void test("room runtime locale bridge refreshes game-room UI and host copy", () => {
  const roomPageSource = readFileSync("src/js/pages/room-page.ts", "utf8");
  const runtimeContextSource = readFileSync("src/js/pages/room-page/runtime-context.ts", "utf8");
  const runtimeSubscriptionsSource = readFileSync(
    "src/js/pages/room-page/runtime-subscriptions.ts",
    "utf8"
  );
  const roomHostRuntimeSource = readFileSync("src/js/modules/rooms/room-host-runtime.ts", "utf8");
  const gameRoomUiEntrySource = loadWorkspaceScriptForVm("rooms/game-room/ui/index.ts");
  const gameRoomUiRuntimeSource = loadWorkspaceScriptForVm(
    "rooms/game-room/ui/game-room-ui-runtime.ts"
  );
  const gameRoomBackgammonUiModuleSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/backgammon/ui/module.ts"
  );
  const gameRoomBackgammonUiStateRuntimeSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/backgammon/ui/state-runtime.ts"
  );
  const gameRoomBackgammonUiRenderRuntimeSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/backgammon/ui/render-runtime.ts"
  );
  const gameRoomTeamTetrisUiStateRuntimeSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/team-tetris/ui/state-runtime.ts"
  );
  const gameRoomTeamTetrisUiSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/team-tetris/ui/module.ts"
  );
  const gameRoomTeamTetrisUiModuleCardRuntimeSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/team-tetris/ui/module-card-runtime.ts"
  );
  const gameRoomTeamTetrisUiModuleShellRuntimeSource = loadWorkspaceScriptForVm(
    "rooms/game-room/main-functions/team-tetris/ui/module-shell-runtime.ts"
  );
  const gameRoomHostEntrySource = loadWorkspaceScriptForVm("rooms/game-room/host/index.ts");
  const gameRoomHostActivationSource = loadWorkspaceScriptForVm(
    "rooms/game-room/shared/host/activation.ts"
  );
  const gameRoomHostRuntimeSource = loadWorkspaceScriptForVm("rooms/game-room/host/runtime.ts");

  assert.match(roomPageSource, /runtimeContextRuntime\.sync\("locale-change"\)/);
  assert.match(roomPageSource, /\.\/room-page\/runtime-context-runtime\.js/);
  assert.match(runtimeContextSource, /const user = buildRoomUserPresenceSnapshot\(\)/);
  assert.match(runtimeContextSource, /const presence = createRoomPresenceSnapshot\(user, slots/);
  assert.match(runtimeContextSource, /ai1:\s*buildRoomSlotContext\("ai1"\)/);
  assert.match(runtimeSubscriptionsSource, /bindRoomPresenceSubscriptions\(\{/);
  assert.match(runtimeSubscriptionsSource, /onPresenceChange:\s*\(\)\s*=>\s*\{/);
  assert.match(roomHostRuntimeSource, /getLocale:\s*\(\): string => AppI18n\.getLocale\(\)/);
  assert.match(gameRoomUiEntrySource, /createGameRoomUiRuntime\(\)\.start\(\)/);
  assert.match(gameRoomUiRuntimeSource, /(messageType|message\.type) === "host-context"/);
  assert.match(
    gameRoomUiRuntimeSource,
    /state\.translations = (message\.translations|translations)/
  );
  assert.match(gameRoomUiRuntimeSource, /(messageType|message\.type) === "backgammon-state"/);
  assert.match(gameRoomUiRuntimeSource, /(messageType|message\.type) === "team-tetris-state"/);
  assert.match(gameRoomUiRuntimeSource, /backgammonUi\.renderBootstrap\(root\)/);
  assert.match(gameRoomBackgammonUiModuleSource, /createBackgammonUiStateRuntime/);
  assert.match(gameRoomBackgammonUiModuleSource, /createBackgammonUiRenderRuntime/);
  assert.match(gameRoomBackgammonUiRenderRuntimeSource, /function renderBootstrap\(root\)/);
  assert.match(gameRoomBackgammonUiStateRuntimeSource, /GameRoomBackgammonStart/);
  assert.match(gameRoomTeamTetrisUiStateRuntimeSource, /GameRoomTeamTetrisStart/);
  assert.match(gameRoomTeamTetrisUiSource, /createTeamTetrisUiStateRuntime/);
  assert.match(gameRoomTeamTetrisUiSource, /createTeamTetrisUiModuleCardRuntime/);
  assert.match(gameRoomTeamTetrisUiSource, /createTeamTetrisUiModuleShellRuntime/);
  assert.match(gameRoomTeamTetrisUiModuleCardRuntimeSource, /createTeamTetrisUiModuleCardRuntime/);
  assert.match(
    gameRoomTeamTetrisUiModuleShellRuntimeSource,
    /createTeamTetrisUiModuleShellRuntime/
  );
  assert.match(gameRoomHostEntrySource, /createGameRoomHostRuntime\(\)/);
  assert.match(gameRoomHostActivationSource, /onRoomEvent\(payload\)/);
  assert.match(gameRoomHostActivationSource, /\.type === "host-context"/);
  assert.match(gameRoomHostRuntimeSource, /backgammonCommandNames: BACKGAMMON_COMMAND_NAMES/);
  assert.match(gameRoomHostRuntimeSource, /handleTeamTetrisMove/);
});

class FakeElement {
  tagName: string;
  ownerDocument: FakeDocument;
  children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  dataset: Record<string, string> = {};
  className = "";
  textContent = "";
  innerHTML = "";
  type = "";
  id = "";
  style = {};
  eventListeners = new Map<string, Array<(...args: unknown[]) => void>>();

  constructor(tagName: string, ownerDocument: FakeDocument) {
    this.tagName = tagName.toLowerCase();
    this.ownerDocument = ownerDocument;
  }

  append(...children: FakeElement[]): void {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children = [];
    this.append(...children);
  }

  addEventListener(type: string, handler: (...args: unknown[]) => void): void {
    const handlers = this.eventListeners.get(type) ?? [];
    handlers.push(handler);
    this.eventListeners.set(type, handlers);
  }
}

class FakeDocument {
  documentElement = { dataset: {} as Record<string, string>, lang: "und" };
  title = "";
  readonly body: FakeElement;

  constructor() {
    this.body = new FakeElement("body", this);
  }

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName, this);
  }

  getElementById(id: string): FakeElement | null {
    return findFirst(this.body, (element) => element.id === id);
  }
}

function findFirst(
  root: FakeElement,
  predicate: (element: FakeElement) => boolean
): FakeElement | null {
  if (predicate(root)) {
    return root;
  }

  for (const child of root.children) {
    const match = findFirst(child, predicate);
    if (match !== null) {
      return match;
    }
  }

  return null;
}

function findAll(root: FakeElement, predicate: (element: FakeElement) => boolean): FakeElement[] {
  const matches: FakeElement[] = [];
  if (predicate(root)) {
    matches.push(root);
  }

  for (const child of root.children) {
    matches.push(...findAll(child, predicate));
  }

  return matches;
}

function createGameRoomUiRuntime(initialLanguage = "en-US"): {
  document: FakeDocument;
  emitHostMessage: (message: Record<string, unknown>) => void;
  readyPayload: Record<string, unknown> | null;
} {
  const document = new FakeDocument();
  const app = document.createElement("div");
  app.id = "app";
  document.body.append(app);

  let hostMessageHandler: ((message: Record<string, unknown>) => void) | null = null;
  let readyPayload: Record<string, unknown> | null = null;
  const roomAPI = {
    sendCommand: () => true,
    onHostMessage(handler: (message: Record<string, unknown>) => void): void {
      hostMessageHandler = handler;
    },
    ready(payload: Record<string, unknown>): void {
      readyPayload = payload;
    },
  };

  const context = {
    window: { roomAPI },
    document,
    navigator: { language: initialLanguage },
    console,
  };
  [
    "rooms/game-room/ui/context-runtime.ts",
    "rooms/game-room/shared/ui/feature-contract.ts",
    "rooms/game-room/shared/ui/scroll-runtime.ts",
    "rooms/game-room/main-functions/backgammon/ui/state-runtime.ts",
    "rooms/game-room/main-functions/backgammon/ui/render-runtime.ts",
    "rooms/game-room/main-functions/backgammon/ui/module.ts",
    "rooms/game-room/main-functions/team-tetris/ui/draft-runtime.ts",
    "rooms/game-room/main-functions/team-tetris/ui/state-shape-runtime.ts",
    "rooms/game-room/main-functions/team-tetris/ui/state-view-runtime.ts",
    "rooms/game-room/main-functions/team-tetris/ui/state-runtime.ts",
    "rooms/game-room/main-functions/team-tetris/ui/module-card-runtime.ts",
    "rooms/game-room/main-functions/team-tetris/ui/module-shell-runtime.ts",
    "rooms/game-room/main-functions/team-tetris/ui/module.ts",
    "rooms/game-room/ui/game-room-ui-bootstrap.ts",
    "rooms/game-room/ui/game-room-ui-state-message-runtime.ts",
    "rooms/game-room/ui/game-room-ui-runtime.ts",
    "rooms/game-room/ui/index.ts",
  ].forEach((filePath) => {
    vm.runInNewContext(loadWorkspaceScriptForVm(filePath), context);
  });

  return {
    document,
    emitHostMessage(message: Record<string, unknown>): void {
      hostMessageHandler?.(message);
    },
    readyPayload,
  };
}

void test("game-room UI smoke test reflects runtime locale updates", () => {
  const runtime = createGameRoomUiRuntime("en-US");
  const root = runtime.document.body;
  const trCatalog = readRoomCatalog("tr");

  assert.equal(runtime.readyPayload?.["stage"], "ui-ready");
  assert.equal(runtime.readyPayload["room"], "game-room");
  assert.equal(runtime.readyPayload["feature"], "backgammon");
  assert.equal(
    findFirst(root, (element) => element.tagName === "h1")?.textContent,
    "Loading Game Room"
  );
  assert.equal(runtime.document.documentElement.lang, "en");

  runtime.emitHostMessage({
    type: "host-context",
    locale: "tr",
    translations: trCatalog,
    room: {
      id: "game-room",
      name: "Oyun Odasi",
    },
    user: {
      nickname: "Kullanici",
    },
    slots: {
      ai1: {
        slotId: "ai1",
        nickname: "Atlas",
        assigned: true,
        connected: true,
        ready: true,
        state: "connected",
      },
      ai2: {
        slotId: "ai2",
        nickname: "Nova",
        assigned: false,
        connected: false,
        ready: false,
        state: "empty",
      },
    },
  });
  runtime.emitHostMessage({
    type: "backgammon-state",
    payload: {
      state: {
        board: [
          { point: 24, owner: "user", count: 2 },
          { point: 13, owner: "user", count: 5 },
          { point: 8, owner: "user", count: 3 },
          { point: 6, owner: "user", count: 5 },
          { point: 1, owner: "ai", count: 2 },
          { point: 12, owner: "ai", count: 5 },
          { point: 17, owner: "ai", count: 3 },
          { point: 19, owner: "ai", count: 5 },
        ],
        boardAscii: "24:U2 19:A5 17:A3 13:U5\n01:A2 06:U5 08:U3 12:A5",
        active: true,
        awaitingMoveFrom: "ai",
        result: "pending",
        selectedTarget: "ai1",
        starter: "user",
        status: "AI cevabi bekleniyor.",
        blockedReason: "",
        protocolDelivered: true,
        opponentReady: true,
        opponent: {
          slotId: "ai1",
          nickname: "Atlas",
          assigned: true,
          connected: true,
          ready: true,
          state: "connected",
        },
        user: {
          nickname: "Kullanici",
        },
      },
    },
  });

  assert.equal(runtime.document.documentElement.lang, "tr");
  assert.equal(
    findFirst(root, (element) => element.textContent === "Tavla Mac Masasi"),
    null
  );
  assert.equal(runtime.document.title, "Oyun Odasi - Tavla");
  assert.equal(findAll(root, (element) => element.className === "backgammon-point").length, 24);
  assert.ok(findAll(root, (element) => element.textContent === "Atlas").length > 0);
  assert.ok(findAll(root, (element) => element.textContent === "Rakip").length > 0);
  assert.ok(findAll(root, (element) => element.textContent === "Hazir").length > 0);
  assert.ok(findAll(root, (element) => element.textContent === "Maci Sifirla").length > 0);
});

void test("game-room UI smoke test renders the Team Tetris bootstrap from active feature context", () => {
  const runtime = createGameRoomUiRuntime("en-US");
  const root = runtime.document.body;
  const trCatalog = readRoomCatalog("tr");

  runtime.emitHostMessage({
    type: "host-context",
    locale: "tr",
    translations: trCatalog,
    room: {
      id: "game-room",
      name: "Oyun Odasi",
      defaultFeatureId: "backgammon",
    },
    features: [
      {
        id: "backgammon",
        name: "Tavla",
      },
      {
        id: "team-tetris",
        name: "Takim Tetris",
      },
    ],
    activeFeature: {
      id: "team-tetris",
      name: "Takim Tetris",
    },
    user: {
      nickname: "Kullanici",
    },
    slots: {
      ai1: {
        slotId: "ai1",
        nickname: "Atlas",
        assigned: true,
        connected: true,
        ready: true,
        state: "connected",
      },
      ai2: {
        slotId: "ai2",
        nickname: "Nova",
        assigned: true,
        connected: true,
        ready: true,
        state: "connected",
      },
      us1: {
        slotId: "us1",
        nickname: "Uzak",
        assigned: true,
        connected: false,
        ready: false,
        state: "assigned",
      },
    },
  });
  runtime.emitHostMessage({
    type: "team-tetris-state",
    payload: {
      state: {
        hiddenPairs: true,
        canStart: false,
        requiredSlots: {
          ai1: true,
          ai2: true,
          us1: false,
        },
        board: {
          width: 10,
          height: 20,
          seedLabel: "contract-frozen",
        },
        boards: [
          {
            teamId: "team-a",
            label: "Takim A",
            visibility: "private",
            rows: Array.from({ length: 20 }, () => ".........."),
          },
          {
            teamId: "team-b",
            label: "Takim B",
            visibility: "public",
            rows: Array.from({ length: 20 }, () => ".........."),
          },
        ],
        turnLoop: ["team-a-opener", "team-b-opener", "team-a-followup", "team-b-followup"],
        status: "Takim Tetris baslamadan once AI1, AI2 ve US1 bekleniyor.",
      },
    },
  });

  assert.equal(runtime.document.title, "Oyun Odasi - Takim Tetris");
  assert.ok(findAll(root, (element) => element.textContent === "Takim Tetris Masasi").length > 0);
  assert.ok(findAll(root, (element) => element.textContent === "Atlas").length > 0);
  assert.ok(
    findAll(
      root,
      (element) =>
        element.textContent === "Takim Tetris baslamadan once AI1, AI2 ve US1 bekleniyor."
    ).length > 0
  );
  assert.equal(findAll(root, (element) => element.className === "tt-board__cell").length, 600);
});
