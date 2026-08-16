import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  canUseDirectFileUrls,
  toRoomRuntimeFileUrl,
} from "../../src/js/modules/rooms/room-runtime-url.ts";
import { readCssWithImports } from "./helpers/css-imports.ts";

type LaboratoryManifestFeature = {
  id?: string;
  name?: string;
  scene?: {
    hotspot?: { id?: string };
    view?: {
      id?: string;
      backgroundSrc?: string;
    };
  };
};

void test("toRoomRuntimeFileUrl normalizes linux paths", () => {
  assert.equal(
    toRoomRuntimeFileUrl("/workspace/rooms/.build/game-room/runtime/ui/index.html"),
    "file:///workspace/rooms/.build/game-room/runtime/ui/index.html"
  );
});

void test("toRoomRuntimeFileUrl normalizes windows-style paths", () => {
  assert.equal(
    toRoomRuntimeFileUrl("C:\\rooms\\game-room\\ui\\index.html"),
    "file:///C:/rooms/game-room/ui/index.html"
  );
});

void test("toRoomRuntimeFileUrl encodes reserved url characters", () => {
  assert.equal(toRoomRuntimeFileUrl("/tmp/a b#c/index.html"), "file:///tmp/a%20b%23c/index.html");
});

void test("canUseDirectFileUrls rejects http-backed renderer protocols", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

  try {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { protocol: "http:" } },
    });
    assert.equal(canUseDirectFileUrls(), false);

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { protocol: "https:" } },
    });
    assert.equal(canUseDirectFileUrls(), false);

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { protocol: "file:" } },
    });
    assert.equal(canUseDirectFileUrls(), true);
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      delete (globalThis as typeof globalThis & { window?: unknown }).window;
    }
  }
});

void test("room host runtime skips direct file imports on http-backed renderer protocols", () => {
  const hostRuntimeSource = readFileSync("src/js/modules/rooms/room-host-runtime.ts", "utf8");
  const guardIndex = hostRuntimeSource.indexOf("if (canUseDirectFileUrls())");
  const fileImportIndex = hostRuntimeSource.indexOf(
    "await import(/* @vite-ignore */ moduleUrl.toString())"
  );
  const fallbackIndex = hostRuntimeSource.indexOf("if (exported === null)");

  assert.notEqual(guardIndex, -1);
  assert.notEqual(fileImportIndex, -1);
  assert.notEqual(fallbackIndex, -1);
  assert.ok(guardIndex < fileImportIndex);
  assert.ok(fileImportIndex < fallbackIndex);
});

void test("room page syncs slot-aware host context and scene runtime routing", () => {
  const source = readFileSync("src/js/pages/room-page.ts", "utf8");
  const shellLayoutSource = readFileSync("src/js/pages/room-page/shell-layout.ts", "utf8");
  const pageShellRuntimeSource = readFileSync(
    "src/js/pages/room-page/page-shell-runtime.ts",
    "utf8"
  );
  const pageViewRuntimeSource = readFileSync("src/js/pages/room-page/page-view-runtime.ts", "utf8");
  const pageSceneRuntimeSource = readFileSync(
    "src/js/pages/room-page/page-scene-runtime.ts",
    "utf8"
  );
  const sceneAlphaWindowSource = readFileSync(
    "src/js/pages/room-page/scene-alpha-window.ts",
    "utf8"
  );
  const sceneAssetRuntimeSource = readFileSync(
    "src/js/pages/room-page/scene-asset-runtime.ts",
    "utf8"
  );
  const pageDomSource = readFileSync("src/js/pages/room-page/page-dom.ts", "utf8");
  const pageStateSource = readFileSync("src/js/pages/room-page/page-state.ts", "utf8");
  const sceneCharacterRuntimeSource = readFileSync(
    "src/js/pages/room-page/scene-character-runtime.ts",
    "utf8"
  );
  const sceneDebugRuntimeSource = readFileSync(
    "src/js/pages/room-page/scene-debug-runtime.ts",
    "utf8"
  );
  const sceneDebugCompositionSource = readFileSync(
    "src/js/pages/room-page/scene-debug-composition.ts",
    "utf8"
  );
  const sceneSyncRuntimeSource = readFileSync(
    "src/js/pages/room-page/scene-sync-runtime.ts",
    "utf8"
  );
  const sceneAssetsSource = readFileSync("src/js/pages/room-page/scene-assets.ts", "utf8");
  const scenePresentationSource = readFileSync(
    "src/js/pages/room-page/scene-presentation.ts",
    "utf8"
  );
  const sceneRenderRuntimeSource = readFileSync(
    "src/js/pages/room-page/scene-render-runtime.ts",
    "utf8"
  );
  const sceneWindowControlsSource = readFileSync(
    "src/js/pages/room-page/scene-window-controls.ts",
    "utf8"
  );
  const sceneChromeRuntimeSource = readFileSync(
    "src/js/pages/room-page/scene-chrome-runtime.ts",
    "utf8"
  );
  const runtimeHostSource = readFileSync("src/js/pages/room-page/runtime-host.ts", "utf8");
  const runtimeHostRuntimeSource = readFileSync(
    "src/js/pages/room-page/runtime-host-runtime.ts",
    "utf8"
  );
  const runtimeBootstrapSource = readFileSync(
    "src/js/pages/room-page/runtime-bootstrap.ts",
    "utf8"
  );
  const runtimeContextSource = readFileSync("src/js/pages/room-page/runtime-context.ts", "utf8");
  const runtimeContextRuntimeSource = readFileSync(
    "src/js/pages/room-page/runtime-context-runtime.ts",
    "utf8"
  );
  const roomPresenceSource = readFileSync("src/js/modules/rooms/room-presence.ts", "utf8");
  const runtimeEventsSource = readFileSync("src/js/pages/room-page/runtime-events.ts", "utf8");
  const runtimeSubscriptionsSource = readFileSync(
    "src/js/pages/room-page/runtime-subscriptions.ts",
    "utf8"
  );
  const runtimeSyncSource = readFileSync("src/js/pages/room-page/runtime-sync.ts", "utf8");
  const runtimeMessagingSource = readFileSync(
    "src/js/pages/room-page/runtime-messaging.ts",
    "utf8"
  );
  const roomsCssSource = readFileSync("src/styles/rooms.css", "utf8");
  const roomsPageCssSource = readFileSync("src/styles/rooms/page.css", "utf8");
  const roomsShellCssSource = readFileSync("src/styles/rooms/shell.css", "utf8");
  const trLanguageSource = readFileSync("shared/languages/tr/index.json", "utf8");
  const enLanguageSource = readFileSync("shared/languages/en/index.json", "utf8");
  const mainCssSource = readFileSync("src/styles/main.css", "utf8");
  const gameRoomUiCssSource = readFileSync("rooms/game-room/ui/style.css", "utf8");
  const gameRoomBaseCssSource = readFileSync("rooms/game-room/shared/styles/base.css", "utf8");
  const gameRoomBackgammonCssSource = readFileSync(
    "rooms/game-room/main-functions/backgammon/styles.css",
    "utf8"
  );
  const gameRoomBackgammonSceneViewCssSource = readFileSync(
    "rooms/game-room/main-functions/backgammon/styles/scene-view.css",
    "utf8"
  );
  const laboratoryUiCssSource = readFileSync("rooms/laboratory/ui/style.css", "utf8");
  const laboratoryThemeCssSource = readCssWithImports("rooms/laboratory/ui/lab-theme.css");

  assert.match(source, /private sceneFeatureId: string \| null = null;/);
  assert.match(
    source,
    /private usesImmersivePageShell\(\): boolean \{\s*return usesImmersiveRoomPageShell\(this\.room\);\s*\}/
  );
  assert.match(source, /private getSceneFeature\(\): InstalledRoomFeatureRecord \| null/);
  assert.match(source, /private bindRoomContextSubscriptions\(\): void/);
  assert.match(source, /private shouldEnsureRuntimeHost\(page: HTMLElement\): boolean/);
  assert.match(source, /void this\.runtimeContextRuntime\.sync\("slot-state"\)/);
  assert.match(source, /ThemeManager\.onChange\(\(\) => \{/);
  assert.match(source, /SceneUiScaleManager\.onChange\(\(\) => \{/);
  assert.match(source, /private runtimeClosed = false;/);
  assert.match(source, /closeRoom: \(\) => \{\s*this\.closeRoomRuntime\(\);\s*\}/);
  assert.match(source, /private closeRoomRuntime\(\): void/);
  assert.match(source, /this\.runtimeClosed = true;/);
  assert.match(source, /this\.lastRuntimeEvent = roomPageT\("status\.closed"\);/);
  assert.match(source, /void RoomHostRuntime\.disposeRoom\(this\.room\.id\);/);
  assert.match(source, /getRoomPageRuntimeMount\(this\.getPage\(\)\)\?\.replaceChildren\(\);/);
  assert.match(source, /getRoomPageSceneRuntimeSlot\(this\.getPage\(\)\)\?\.replaceChildren\(\);/);
  assert.match(source, /navigateToScenePage\("entrance"\);/);
  assert.doesNotMatch(source, /onHide\(\): void/);
  assert.match(
    source,
    /return this\.runtimeClosed === false && page\.classList\.contains\("is-hidden"\) === false;/
  );
  assert.match(source, /\.\/room-page\/runtime-context-runtime\.js/);
  assert.match(source, /this\.runtimeContextRuntime\.sync\("locale-change"\)/);
  assert.match(source, /this\.runtimeContextRuntime\.sync\("theme-appearance"\)/);
  assert.match(source, /this\.runtimeContextRuntime\.sync\("scene-scale"\)/);
  assert.match(source, /this\.runtimeContextRuntime\.sync\("scene-close"\)/);
  assert.match(source, /this\.runtimeContextRuntime\.sync\(reason\)/);
  assert.match(
    runtimeContextSource,
    /translations:\s*AppI18n\.getNamespaceCatalog\(\["rooms", room\.id\]\)/
  );
  assert.match(runtimeContextSource, /buildRoomAssistantPresenceSnapshot/);
  assert.match(runtimeContextSource, /buildRoomSlotPresenceSnapshot/);
  assert.match(runtimeContextSource, /buildRoomUserPresenceSnapshot/);
  assert.match(runtimeContextSource, /createRoomPresenceSnapshot/);
  assert.match(runtimeContextSource, /function normalizeRoomAvatarSource/);
  assert.match(
    runtimeContextSource,
    /export function buildRoomSlotContext\(slotId: RoomSlotId\): RoomPresenceSlotSnapshot/
  );
  assert.match(runtimeContextSource, /return buildRoomSlotPresenceSnapshot\(slotId\);/);
  assert.match(runtimeContextSource, /const user = buildRoomUserPresenceSnapshot\(\);/);
  assert.match(runtimeContextSource, /const assistant = buildRoomAssistantPresenceSnapshot\(\);/);
  assert.match(runtimeContextSource, /ai1:\s*buildRoomSlotContext\("ai1"\)/);
  assert.match(runtimeContextSource, /ai2:\s*buildRoomSlotContext\("ai2"\)/);
  assert.match(runtimeContextSource, /us1:\s*buildRoomSlotContext\("us1"\)/);
  assert.match(
    runtimeContextSource,
    /const presence = createRoomPresenceSnapshot\(user, slots, \{/
  );
  assert.match(runtimeContextSource, /avatar:\s*normalizeRoomAvatarSource\(assistant\.avatar\),/);
  assert.match(runtimeContextSource, /presence,/);
  assert.match(runtimeContextSource, /mode:\s*sceneFeatureOpen \? "scene-view" : "classic"/);
  assert.match(
    runtimeContextSource,
    /uiScale:\s*sceneFeatureOpen \? getSceneUiScale\(\) : getAppUiScale\(\)/
  );
  assert.match(runtimeContextSource, /sceneViewId:\s*sceneFeature\?\.scene\?\.view\.id \?\? null/);
  assert.match(
    roomPresenceSource,
    /export const ROOM_PRESENCE_SLOT_IDS = \["ai1", "ai2", "us1"\] as const;/
  );
  assert.match(
    roomPresenceSource,
    /export function buildRoomSlotPresenceSnapshot\(\s*slotId: RoomPresenceSlotId\s*\): RoomPresenceSlotSnapshot/
  );
  assert.match(roomPresenceSource, /if \(slotId === "us1"\)/);
  assert.match(roomPresenceSource, /avatar:\s*readAvatar\(AppState\.getAvatar\(slotId\)\)/);
  assert.match(roomPresenceSource, /accountId:\s*AppState\.getUs1ArchiveAccountId\(\)/);
  assert.match(roomPresenceSource, /remoteUserId:\s*identity\?\.remoteUserId \?\? null/);
  assert.match(
    roomPresenceSource,
    /export function buildRoomPresenceSnapshot\(\): RoomPresenceSnapshot/
  );
  assert.match(roomPresenceSource, /schemaVersion:\s*1,/);
  assert.match(roomPresenceSource, /SlotEvent\.DISCONNECT_COMPLETE/);
  assert.match(
    roomPresenceSource,
    /subscriptions\.push\(AppState\.subscribe\(onPresenceChange\)\);/
  );
  assert.match(source, /\.\/room-page\/page-shell-runtime\.js/);
  assert.match(source, /\.\/room-page\/page-dom\.js/);
  assert.match(source, /\.\/room-page\/page-state\.js/);
  assert.match(source, /\.\/room-page\/scene-asset-runtime\.js/);
  assert.match(source, /\.\/room-page\/scene-character-runtime\.js/);
  assert.match(source, /\.\/room-page\/scene-chrome-runtime\.js/);
  assert.match(source, /\.\/room-page\/page-scene-runtime\.js/);
  assert.match(pageSceneRuntimeSource, /export function createRoomPageSceneRuntime\(/);
  assert.match(pageSceneRuntimeSource, /\.\/scene-debug-composition\.js/);
  assert.match(pageSceneRuntimeSource, /\.\/page-view-runtime\.js/);
  assert.match(pageSceneRuntimeSource, /syncRoomPageView\(/);
  assert.match(pageSceneRuntimeSource, /setupRoomPageSceneDebug\(/);
  assert.match(pageViewRuntimeSource, /\.\/scene-sync-runtime\.js/);
  assert.match(pageViewRuntimeSource, /\.\/scene-window-controls\.js/);
  assert.match(source, /\.\/room-page\/runtime-host\.js/);
  assert.match(source, /\.\/room-page\/runtime-host-runtime\.js/);
  assert.match(source, /\.\/room-page\/runtime-subscriptions\.js/);
  assert.match(runtimeContextRuntimeSource, /\.\/runtime-sync\.js/);
  assert.match(runtimeContextRuntimeSource, /RoomHostRuntime/);
  assert.match(source, /\.\/room-page\/runtime-events\.js/);
  assert.match(source, /this\.sceneFeatureId = null;/);
  assert.match(shellLayoutSource, /export function ensureRoomPageShell\(/);
  assert.doesNotMatch(shellLayoutSource, /closeLabel: string;/);
  assert.doesNotMatch(shellLayoutSource, /onCloseRoom: \(\) => void;/);
  assert.doesNotMatch(shellLayoutSource, /data-room-action="close-runtime"/);
  assert.doesNotMatch(shellLayoutSource, /options\.onCloseRoom\(\);/);
  assert.doesNotMatch(shellLayoutSource, /function syncRoomCloseButtonLabel/);
  assert.match(shellLayoutSource, /export function renderRoomFeatureButtons\(/);
  assert.match(pageShellRuntimeSource, /\.\/shell-layout\.js/);
  assert.match(pageShellRuntimeSource, /\.\/runtime-events\.js/);
  assert.doesNotMatch(pageShellRuntimeSource, /closeLabel: string;/);
  assert.doesNotMatch(pageShellRuntimeSource, /onCloseRoom: \(\) => void;/);
  assert.match(pageShellRuntimeSource, /export function shouldShowRoomPageFeatureStripForRoom\(/);
  assert.match(
    pageShellRuntimeSource,
    /if \(room\.workbench\?\.experienceId(?: !== undefined)?\) \{\s*return false;\s*\}/
  );
  assert.match(pageShellRuntimeSource, /export function ensureRoomPageFeatureShell\(/);
  assert.match(pageShellRuntimeSource, /export function renderRoomPageFeatureStrip\(/);
  assert.match(pageShellRuntimeSource, /export function updateRoomPageStatusPanel\(/);
  assert.match(sceneAssetsSource, /export function buildRoomSceneAssetTargets\(/);
  assert.match(sceneAssetsSource, /export function getFeatureIdFromSceneAssetTarget\(/);
  assert.match(sceneAssetsSource, /export function toRoomSceneTransparentWindowConfig\(/);
  assert.match(sceneAssetsSource, /export function updateRoomFeatureTransparentWindow\(/);
  assert.match(sceneAssetRuntimeSource, /\.\/scene-alpha-window\.js/);
  assert.match(sceneAssetRuntimeSource, /\.\/scene-assets\.js/);
  assert.match(sceneAssetRuntimeSource, /export function createRoomPageSceneAssetRuntime\(/);
  assert.match(sceneAssetRuntimeSource, /updateRoomFeatureTransparentWindow\(/);
  assert.match(sceneAssetRuntimeSource, /getFeatureIdFromSceneAssetTarget\(targetId\)/);
  assert.match(sceneDebugCompositionSource, /export function setupRoomPageSceneDebug\(/);
  assert.match(sceneDebugCompositionSource, /\.\/scene-debug-runtime\.js/);
  assert.match(pageDomSource, /export function getRoomPageElement\(/);
  assert.match(pageDomSource, /export function getRoomPageClassicShell\(/);
  assert.match(pageDomSource, /export function getRoomPageSceneRuntimeSlot\(/);
  assert.match(pageStateSource, /export function resolveRoomInitialFeatureId\(/);
  assert.match(pageStateSource, /export function getRoomActiveFeature\(/);
  assert.match(pageStateSource, /export function getRoomSceneFeature\(/);
  assert.match(pageStateSource, /export function isRoomSceneFeatureOpen\(/);
  assert.match(pageStateSource, /export function getRoomSceneReferenceSize\(/);
  assert.match(pageStateSource, /export function getRoomPageShellVariant\(/);
  assert.match(pageStateSource, /export function usesImmersiveRoomPageShell\(/);
  assert.match(
    pageStateSource,
    /return room\.scene\?\.chrome\?\.pageShellVariant \?\? "standard";/
  );
  assert.match(
    sceneCharacterRuntimeSource,
    /export async function renderRoomPageSceneCharacters\(/
  );
  assert.match(sceneCharacterRuntimeSource, /buildSceneCharacterRoster\(/);
  assert.match(sceneCharacterRuntimeSource, /renderSceneCharacterLayer\(/);
  assert.match(
    sceneChromeRuntimeSource,
    /export function resolveRoomSceneWindowControlsVisibility\(/
  );
  assert.match(sceneChromeRuntimeSource, /export function resolveRoomSceneViewBackButtonVariant\(/);
  assert.match(sceneChromeRuntimeSource, /export function syncRoomPageSceneChrome\(/);
  assert.match(sceneDebugRuntimeSource, /export function createRoomSceneEditorCallbacks\(/);
  assert.match(sceneDebugRuntimeSource, /export function setupRoomSceneDebugEditor\(/);
  assert.match(sceneDebugRuntimeSource, /refreshSceneShell\(\);/);
  assert.match(sceneDebugRuntimeSource, /refreshEditor\(\);/);
  assert.match(sceneDebugRuntimeSource, /scene-editor-host/);
  assert.match(sceneSyncRuntimeSource, /export function syncRoomPageScene\(/);
  assert.match(
    sceneSyncRuntimeSource,
    /const viewOpen = sceneEnabled && sceneFeature\?\.scene !== undefined;/
  );
  assert.match(sceneSyncRuntimeSource, /syncSceneViewRuntime\(/);
  assert.match(sceneSyncRuntimeSource, /renderRoomSceneHotspots\(/);
  assert.match(sceneSyncRuntimeSource, /renderRoomSceneBack\(/);
  assert.match(sceneSyncRuntimeSource, /renderRoomSceneView\(/);
  assert.match(sceneSyncRuntimeSource, /applyRoomSceneImageSource\(/);
  assert.match(scenePresentationSource, /export function renderRoomSceneHotspots\(/);
  assert.match(scenePresentationSource, /export function renderRoomSceneBack\(/);
  assert.match(scenePresentationSource, /export function renderRoomSceneView\(/);
  assert.match(
    scenePresentationSource,
    /const feature = room\.features\.find\(\(item\) => item\.scene\?\.hotspot\.id === node\.id\) \?\? null;/
  );
  assert.match(scenePresentationSource, /buildStandardSceneViewBackButton\(closeLabel\)/);
  assert.match(sceneAlphaWindowSource, /export function getRoomSceneViewBackgroundImage\(/);
  assert.match(sceneAlphaWindowSource, /export function getRoomSceneTransparentWindowBounds\(/);
  assert.match(sceneAlphaWindowSource, /export function toRoomPageTransparentWindowConfig\(/);
  assert.match(sceneRenderRuntimeSource, /export function applyRoomSceneRuntimeFrame\(/);
  assert.match(sceneRenderRuntimeSource, /export function applyRoomSceneImageSource\(/);
  assert.match(sceneRenderRuntimeSource, /export function getRoomSceneProjection\(/);
  assert.match(sceneRenderRuntimeSource, /export function getRoomSceneDepthScale\(/);
  assert.match(sceneWindowControlsSource, /export function syncRoomPageSceneWindowControls\(/);
  assert.match(sceneWindowControlsSource, /export function getRoomSceneStandardBackHost\(/);
  assert.match(sceneWindowControlsSource, /export function ensureRoomSceneStandardBackHost\(/);
  assert.doesNotMatch(pageSceneRuntimeSource, /closeRoom: \(\) => void;/);
  assert.doesNotMatch(pageViewRuntimeSource, /onCloseRoom: \(\) => void;/);
  assert.match(pageViewRuntimeSource, /closeLabel: shellT\("settingsHub\.scene\.returnRoom"\)/);
  assert.match(runtimeHostSource, /export async function resolveRoomPreloadUrl\(/);
  assert.match(runtimeHostSource, /export function ensureRoomRuntimeWebview\(/);
  assert.match(runtimeHostSource, /export function syncRoomRuntimeWebviewSource\(/);
  assert.match(runtimeHostRuntimeSource, /export function createRoomPageRuntimeHostRuntime\(/);
  assert.match(
    runtimeHostRuntimeSource,
    /function ensure\(page: HTMLElement \| null = deps\.getPage\(\)\)/
  );
  assert.match(runtimeHostRuntimeSource, /getRoom: deps\.getRoom,/);
  assert.match(
    runtimeContextRuntimeSource,
    /export function createRoomPageRuntimeContextRuntime\(/
  );
  assert.match(
    runtimeContextRuntimeSource,
    /function buildPayload\(reason: string\): RoomHostMessage/
  );
  assert.match(runtimeContextRuntimeSource, /const payload = buildPayload\(reason\);/);
  assert.match(runtimeContextRuntimeSource, /sendRoomHostContext\(\{/);
  assert.match(
    runtimeContextRuntimeSource,
    /RoomHostRuntime\.handleRuntimeMessage\(deps\.getRoom\(\)\.id, "room-event", payload\)/
  );
  assert.match(runtimeContextRuntimeSource, /syncRoomRuntimeContext\(\{/);
  assert.match(runtimeBootstrapSource, /export async function ensureRoomPageRuntimeHost\(/);
  assert.match(runtimeBootstrapSource, /const room = getRoom\(\);/);
  assert.match(runtimeBootstrapSource, /createRoomRuntimeEventBinder\(/);
  assert.match(runtimeBootstrapSource, /ensureRoomRuntimeWebview\(/);
  assert.match(runtimeBootstrapSource, /RoomHostRuntime\.ensureRoomHost\(room/);
  assert.match(
    runtimeBootstrapSource,
    /sendRoomRuntimeMessage\(pendingHostMessages, webview, payload\)/
  );
  assert.match(runtimeBootstrapSource, /sendHostContext\(webview, "render-sync"\)/);
  assert.match(runtimeSubscriptionsSource, /export function bindRoomContextSubscriptions\(/);
  assert.match(runtimeSubscriptionsSource, /export function clearRoomContextSubscriptions\(/);
  assert.match(runtimeSubscriptionsSource, /bindRoomPresenceSubscriptions/);
  assert.match(
    runtimeSubscriptionsSource,
    /const existingSubscriptionCount = slotSubscriptions\.length;/
  );
  assert.match(runtimeSubscriptionsSource, /onPresenceChange: \(\) => \{/);
  assert.match(runtimeSubscriptionsSource, /syncContext\(\);/);
  assert.match(runtimeSubscriptionsSource, /syncSceneCharacters\(\);/);
  assert.match(
    runtimeSubscriptionsSource,
    /if \(existingSubscriptionCount > 0\) \{\s*return;\s*\}/
  );
  assert.match(runtimeSubscriptionsSource, /TrafficManager\.onUpdate/);
  assert.match(runtimeSyncSource, /export function sendRoomHostContext\(/);
  assert.match(runtimeSyncSource, /export async function syncRoomRuntimeContext\(/);
  assert.match(runtimeEventsSource, /export function updateRoomRuntimeStatus\(/);
  assert.match(runtimeEventsSource, /export function bindRoomRuntimeEvents\(/);
  assert.match(runtimeEventsSource, /export function createRoomRuntimeEventBinder\(/);
  assert.match(runtimeEventsSource, /webview\.addEventListener\("did-start-loading"/);
  assert.match(runtimeEventsSource, /__roomRuntimeBinding/);
  assert.match(runtimeEventsSource, /webview\.removeEventListener\("ipc-message", handleIpcMessage\)/);
  assert.doesNotMatch(
    runtimeEventsSource,
    /if \(webview\.dataset\["roomRuntimeBound"\] === "true"\) \{\s*return;\s*\}/
  );
  assert.match(
    runtimeHostSource,
    /bindRuntimeEvents\(webview\);\s*if \(webview\.parentElement !== mount\)/
  );
  assert.match(runtimeEventsSource, /closeRoom: \(\) => void;/);
  assert.match(runtimeEventsSource, /ipcEvent\.channel === "room-close"/);
  assert.match(runtimeEventsSource, /closeRoom\(\);/);
  assert.match(runtimeEventsSource, /ipcEvent\.channel === "room-ready"/);
  assert.match(runtimeEventsSource, /ipcEvent\.channel === "room-command"/);
  assert.match(runtimeEventsSource, /ipcEvent\.channel === "room-event"/);
  assert.match(shellLayoutSource, /room-shell room-shell--immersive/);
  assert.match(
    shellLayoutSource,
    /<div class="room-shell-topline"\$\{options\.showFeatureStrip \? "" : " hidden"\}>/
  );
  assert.match(shellLayoutSource, /room-runtime-mount room-runtime-mount--stage/);
  assert.match(shellLayoutSource, /room-feature-strip room-feature-strip--header/);
  assert.match(
    source,
    /if \(this\.isSceneFeatureOpen\(\)\) \{\s*return this\.getSceneRuntimeSlot\(page\);/
  );
  assert.match(
    runtimeSyncSource,
    /await RoomHostRuntime\.handleRuntimeMessage\(roomId, "room-event", payload\);/
  );
  assert.match(
    runtimeSyncSource,
    /sendRoomRuntimeMessage\(pendingHostMessages, webview, payload\)/
  );
  assert.match(runtimeMessagingSource, /export function sendRoomRuntimeMessage\(/);
  assert.match(runtimeMessagingSource, /export function flushPendingRoomHostMessages\(/);
  assert.match(runtimeMessagingSource, /export function describeRoomCommand\(/);
  assert.match(runtimeMessagingSource, /return `\+\+cmd:\$\{command\.trim\(\)\}`;/);
  const initMethodMatch = source.match(
    /(?:async\s+)?init\(\)(?:: [^{]+)? \{([\s\S]*?)\n {2}}\n\n {2}onShow\(\): void \{/
  );
  const initMethodBody = initMethodMatch?.[1];
  assert.ok(initMethodBody != null);
  assert.doesNotMatch(initMethodBody, /runtimeHostRuntime\.ensure/);
  const renderMethodMatch = source.match(
    /render\(\): void \{([\s\S]*?)\n {2}}\n\n {2}dispose\(\): void \{/
  );
  const renderMethodBody = renderMethodMatch?.[1];
  assert.ok(renderMethodBody != null);
  assert.match(
    renderMethodBody,
    /if \(this\.shouldEnsureRuntimeHost\(page\)\) \{\s*void this\.runtimeHostRuntime\.ensure\(page\);\s*\}/
  );
  assert.doesNotMatch(source, /roomPageT\("page\.badge"\)/);
  assert.doesNotMatch(source, /data-room-role="title"/);
  assert.doesNotMatch(source, /data-room-role="subtitle"/);
  assert.doesNotMatch(source, /roomPageT\("page\.featuresTitle"\)/);
  assert.doesNotMatch(source, /roomPageT\("page\.runtimeTitle"\)/);
  assert.doesNotMatch(source, /data-room-role="runtime-status"/);
  assert.doesNotMatch(source, /data-room-role="runtime-event"/);
  assert.doesNotMatch(source, /room-feature-panel/);
  assert.doesNotMatch(source, /room-feature-chip__summary/);
  assert.match(roomsCssSource, /@import "\.\/rooms\/page\.css";/);
  assert.match(roomsCssSource, /@import "\.\/rooms\/classic\.css";/);
  assert.match(roomsCssSource, /@import "\.\/rooms\/shell\.css";/);
  assert.match(roomsCssSource, /@import "\.\/rooms\/scene\.css";/);
  assert.match(roomsPageCssSource, /\.rooms-page \{\s*position: relative;[\s\S]*height: 100%;/);
  assert.match(
    roomsShellCssSource,
    /\.room-page-shell \{\s*position: relative;[\s\S]*flex: 1 1 auto;[\s\S]*height: 100%;/
  );
  assert.doesNotMatch(roomsShellCssSource, /\.room-close-button/);
  assert.match(gameRoomBaseCssSource, /\.game-room-close-button \{/);
  assert.match(gameRoomBaseCssSource, /\.game-room-close-button:hover \{/);
  assert.match(trLanguageSource, /"closeRoom": "Odayı kapat"/);
  assert.match(trLanguageSource, /"closed": "Oda runtime kapatıldı\."/);
  assert.match(enLanguageSource, /"closeRoom": "Close room"/);
  assert.match(enLanguageSource, /"closed": "Room runtime closed\."/);
  assert.match(
    roomsShellCssSource,
    /\.room-shell-stage--immersive \{\s*display: flex;[\s\S]*flex: 1 1 auto;[\s\S]*padding: 0;/
  );
  assert.match(
    roomsShellCssSource,
    /\.room-shell-panel--runtime \{\s*display: flex;[\s\S]*flex: 1 1 auto;[\s\S]*padding: 0;/
  );
  assert.match(
    roomsShellCssSource,
    /\.room-runtime-mount--stage \{\s*border: 0;[\s\S]*border-radius: inherit;/
  );
  assert.doesNotMatch(roomsCssSource, /\.room-feature-panel/);
  assert.doesNotMatch(roomsCssSource, /\.room-feature-chip__summary/);
  assert.match(
    mainCssSource,
    /\.room-runtime-mount \{\s*flex: 1;[\s\S]*min-height: 0;[\s\S]*height: 100%;/
  );
  assert.match(gameRoomUiCssSource, /@import "\.\.\/shared\/styles\/base\.css";/);
  assert.match(gameRoomUiCssSource, /@import "\.\.\/main-functions\/backgammon\/styles\.css";/);
  assert.match(gameRoomBackgammonCssSource, /@import "\.\/styles\/layout\.css";/);
  assert.match(gameRoomBackgammonCssSource, /@import "\.\/styles\/presentation\.css";/);
  assert.match(gameRoomBackgammonCssSource, /@import "\.\/styles\/board\.css";/);
  assert.match(gameRoomBackgammonCssSource, /@import "\.\/styles\/scene-view\.css";/);
  assert.match(
    gameRoomBackgammonSceneViewCssSource,
    /body\[data-presentation-mode="scene-view"\] \.backgammon-shell \{\s*min-height: 100%;[\s\S]*padding: 0;/
  );
  assert.match(laboratoryUiCssSource, /@import "\.\/lab-theme\.css";/);
  assert.doesNotMatch(laboratoryUiCssSource, /shared\/styles\/shell\.css/);
  assert.doesNotMatch(laboratoryUiCssSource, /main-functions\/media-analysis\/styles\.css/);
  assert.match(laboratoryThemeCssSource, /\.labx-shell\s*\{[\s\S]*min-height:\s*100vh;/);
  assert.match(
    laboratoryThemeCssSource,
    /\.labx-source-intake__frame\s*\{[\s\S]*border: var\(--lab-shell-source-intake-px-1\) solid/
  );
  assert.match(
    laboratoryThemeCssSource,
    /\.labx-overlay-backdrop\s*\{[\s\S]*backdrop-filter: blur/
  );
  assert.match(
    laboratoryThemeCssSource,
    /\.labx-overlay-root\s*\{[\s\S]*--lab-overlay-top-offset: calc\(var\(--lab-topbar-height\) \+ var\(--lab-space-3\)\);[\s\S]*inset: var\(--lab-overlay-top-offset\) 0 0;/
  );
  assert.match(
    laboratoryThemeCssSource,
    /\.labx-module-overlay\s*\{[\s\S]*max-height: var\(--lab-overlay-max-height\);/
  );
  assert.match(
    laboratoryThemeCssSource,
    /\.labx-report-overlay\s*\{[\s\S]*max-height: var\(--lab-overlay-max-height\);/
  );
});

void test("installed laboratory manifest keeps one workbench scene entry for room-page routing", () => {
  const manifestPath = existsSync("rooms/.build/laboratory/runtime/manifest.json")
    ? "rooms/.build/laboratory/runtime/manifest.json"
    : "rooms/laboratory/manifest.json";
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    features?: unknown;
    workbench?: { experienceId?: string };
  };
  const features = Array.isArray(manifest.features)
    ? (manifest.features as LaboratoryManifestFeature[])
    : [];
  const mediaFeature = features.find((feature) => feature.id === "media-analysis");
  const audioFeature = features.find((feature) => feature.id === "audio-analysis");

  assert.equal(manifest.workbench?.experienceId, "analysis-workbench");
  assert.equal(mediaFeature?.name, "Analysis Workbench");
  assert.equal(mediaFeature.scene?.hotspot?.id, "laboratory-media-analysis");
  assert.equal(mediaFeature.scene.view?.id, "media-analysis-console");
  assert.equal(
    mediaFeature.scene.view.backgroundSrc,
    "features/media-analysis/assets/media-analysis-view.webp"
  );
  assert.equal(audioFeature?.scene, undefined);
});
