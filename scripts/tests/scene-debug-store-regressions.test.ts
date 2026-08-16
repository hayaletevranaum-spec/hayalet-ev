import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { createSceneDebugRuntimeSession } from "../../src/js/scene-editor/scene-debug-runtime-session.ts";
import {
  createSceneDebugStore,
  createSceneDebugThemeStore,
} from "../../src/js/scene-editor/scene-editor-store.ts";
import { cloneSceneClickableTheme } from "../../src/js/scene-system/scene-clickable-theme-core.ts";
import { getSceneRoomLayout } from "../../src/js/scene-system/scene-layout-registry.ts";
import { SCENE_CLICKABLE_DEFAULTS } from "../../shared/themes/castle/scene-clickable-defaults.ts";

function createSceneDebugTestHarness() {
  const storage = new Map<string, string>();
  const clipboardWrites: string[] = [];
  const writeCalls: Array<{ path: string; data: string; encoding: string }> = [];
  const tempDir = mkdtempSync(join(tmpdir(), "scene-debug-store-"));
  const themeId = "castle-test";

  const localStorage = {
    getItem(key: string): string | null {
      return storage.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      storage.set(key, value);
    },
    removeItem(key: string): void {
      storage.delete(key);
    },
  };

  const clipboard = {
    async writeText(text: string): Promise<void> {
      clipboardWrites.push(text);
    },
  };

  const writeFileAtomic = async (path: string, data: string, encoding = "utf-8"): Promise<string> => {
    writeCalls.push({ path, data, encoding });
    writeFileSync(path, data, { encoding: encoding as BufferEncoding });
    return path;
  };

  return {
    storage,
    clipboardWrites,
    writeCalls,
    tempDir,
    cleanup(): void {
      rmSync(tempDir, { recursive: true, force: true });
    },
    createThemeStore() {
      return createSceneDebugThemeStore({
        localStorage,
        clipboard,
        writeFileAtomic,
        getThemeId: () => themeId,
        getClickableDefaultsSourcePath: () => join(tempDir, "scene-clickable-defaults.ts"),
        cloneDefaultTheme: () => cloneSceneClickableTheme(SCENE_CLICKABLE_DEFAULTS),
      });
    },
    createLayoutStore(roomId: "rooms" = "rooms") {
      return createSceneDebugStore(roomId, {
        localStorage,
        clipboard,
        writeFileAtomic,
        getThemeId: () => themeId,
        getRoomSourcePath: (nextRoomId) => join(tempDir, `${nextRoomId}.scene.json`),
        getRoomLayout: (nextRoomId) => getSceneRoomLayout(nextRoomId as "settings" | "assistant" | "entrance" | "analyze" | "server" | "rooms"),
      });
    },
  };
}

void test("scene editor store keys drafts by active theme and writes back to canonical theme map sources", () => {
  const debugStoreSource = readFileSync("src/js/scene-editor/scene-editor-store.ts", "utf8");
  const runtimeSessionSource = readFileSync(
    "src/js/scene-editor/scene-debug-runtime-session.ts",
    "utf8"
  );
  const assetStateSource = readFileSync("src/js/scene-editor/scene-theme-asset-state.ts", "utf8");
  const layoutRegistrySource = readFileSync("src/js/scene-system/scene-layout-registry.ts", "utf8");
  const serializationSource = readFileSync("src/js/scene/layout/scene-layout-serialization.ts", "utf8");
  const clickableThemeSource = readFileSync(
    "src/js/scene-system/scene-clickable-theme-core.ts",
    "utf8"
  );

  assert.match(debugStoreSource, /scene-editor:\$\{resolveThemeId\(\)\}:\$\{roomId\}:draft:/);
  assert.match(debugStoreSource, /clickable-defaults:draft/);
  assert.match(debugStoreSource, /getSourcePath\(\): string/);
  assert.match(debugStoreSource, /cloneDefault\(\): SceneLayoutConfig/);
  assert.match(debugStoreSource, /cloneDefault\(\): SceneClickableThemeDefinition/);
  assert.match(debugStoreSource, /serialize\(sceneLayout: SceneLayoutConfig\): string/);
  assert.match(debugStoreSource, /saveSource\(sceneLayout: SceneLayoutConfig\): Promise<boolean>/);
  assert.match(debugStoreSource, /createSceneDebugThemeStore/);
  assert.match(debugStoreSource, /serializeSceneClickableThemeSource/);
  assert.match(debugStoreSource, /getSceneDefaultClickableTheme/);
  assert.match(debugStoreSource, /FileManager\.writeFileAtomic/);
  assert.match(debugStoreSource, /const getConfig = \(\): SceneDebugStoreConfig =>/);
  assert.match(debugStoreSource, /const getConfig = \(\): SceneDebugThemeStoreConfig =>/);
  assert.match(debugStoreSource, /from "\.\.\/scene\/layout\/index\.js"/);
  assert.match(debugStoreSource, /from "\.\.\/scene-system\/scene-layout-registry\.js"/);
  assert.match(layoutRegistrySource, /SceneThemeManager\.getThemeRegistration/);
  assert.match(layoutRegistrySource, /getSceneThemeSourceRoot/);
  assert.match(layoutRegistrySource, /return `\$\{getSceneThemeSourceRoot\(\)\}\/maps\/\$\{roomId\}\.scene\.json`;/);
  assert.match(layoutRegistrySource, /return `\$\{getSceneThemeSourceRoot\(\)\}\/scene-clickable-defaults\.ts`;/);
  assert.match(serializationSource, /export function parseSceneLayoutDraft/);
  assert.match(clickableThemeSource, /export function parseSceneClickableThemeDraft/);
  assert.match(runtimeSessionSource, /export function createSceneDebugRuntimeSession/);
  assert.match(runtimeSessionSource, /export function createSceneEditorRuntimeSession/);
  assert.match(runtimeSessionSource, /updateSceneClickableTheme/);
  assert.match(runtimeSessionSource, /resetSceneLayoutDraft/);
  assert.match(assetStateSource, /invalidateSceneAlphaWindowBoundsCache/);
  assert.doesNotMatch(debugStoreSource, /draftStorageKeys/);
  assert.equal(existsSync("src/js/scene/debug-store.ts"), false);
  assert.equal(existsSync("src/js/scene/debug"), false);
});

void test("scene layout defaults now resolve from shared theme json maps instead of inlined room builders", () => {
  const layoutStateSource = readFileSync("src/js/scene/layout/scene-layout-model.ts", "utf8");
  const layoutSource = readFileSync("src/js/scene/layout/index.ts", "utf8");
  const layoutRegistrySource = readFileSync("src/js/scene-system/scene-layout-registry.ts", "utf8");

  assert.doesNotMatch(layoutStateSource, /getSceneRoomLayout/);
  assert.doesNotMatch(layoutStateSource, /getSceneLayoutForRoom/);
  assert.doesNotMatch(layoutStateSource, /@theme-source\/castle\/maps\/analyze\.scene\.json/);
  assert.doesNotMatch(layoutStateSource, /DEFAULT_SCENE_LAYOUTS/);
  assert.doesNotMatch(layoutStateSource, /draftStorageKeys/);
  assert.match(layoutSource, /scene-layout-model\.js/);
  assert.match(layoutSource, /scene-layout-serialization\.js/);
  assert.match(layoutRegistrySource, /SceneThemeManager\.getThemeRegistration\(\)\.maps\[roomId\]/);
  assert.equal(existsSync("src/js/pages/entrance/scene/scene-map.ts"), false);
  assert.equal(existsSync("src/js/scene/layout/scene-layout-state.ts"), false);
  assert.equal(existsSync("src/assets/themes/castle/scene/debug.ts"), false);
});

void test("scene debug theme store supports draft and source round-trips with injected dependencies", async () => {
  const harness = createSceneDebugTestHarness();

  try {
    const themeStore = harness.createThemeStore();
    const nextTheme = themeStore.cloneDefault();
    nextTheme.object.label.visible = false;
    nextTheme.object.glowHueShiftDeg = 18;
    nextTheme.back.arrowShiftRem = 1.1;

    assert.equal(themeStore.loadDraft(), null);

    themeStore.saveDraft(nextTheme);
    assert.deepEqual(themeStore.loadDraft(), nextTheme);

    await themeStore.copyToClipboard(nextTheme);
    assert.equal(harness.clipboardWrites.at(-1), themeStore.serialize(nextTheme));

    const saved = await themeStore.saveSource(nextTheme);
    assert.equal(saved, true);
    assert.equal(harness.writeCalls.at(-1)?.path, themeStore.getSourcePath());

    const importedThemeModule = await import(
      `${pathToFileURL(themeStore.getSourcePath()).href}?t=${Date.now()}`
    ) as { SCENE_CLICKABLE_DEFAULTS: typeof nextTheme };
    assert.deepEqual(importedThemeModule.SCENE_CLICKABLE_DEFAULTS, nextTheme);

    themeStore.clearDraft();
    assert.equal(themeStore.loadDraft(), null);
  } finally {
    harness.cleanup();
  }
});

void test("scene debug runtime session reloads saved theme drafts and resets to defaults", () => {
  const harness = createSceneDebugTestHarness();

  try {
    const runtimeDependencies = {
      createLayoutStore: () => harness.createLayoutStore("rooms"),
      createThemeStore: () => harness.createThemeStore(),
    };
    const defaultTheme = cloneSceneClickableTheme(SCENE_CLICKABLE_DEFAULTS);
    const initialSession = createSceneDebugRuntimeSession("rooms", runtimeDependencies);

    initialSession.load(false);
    assert.deepEqual(initialSession.getSceneClickableTheme(), defaultTheme);
    assert.equal(initialSession.getSceneLayout().objects[0]?.id, "door-entrance");

    const updatedTheme = cloneSceneClickableTheme(defaultTheme);
    updatedTheme.object.label.visible = false;
    updatedTheme.back.label.padXRem = 1.35;

    initialSession.setSceneClickableTheme(updatedTheme);
    initialSession.saveSceneClickableThemeDraft();

    const reloadedSession = createSceneDebugRuntimeSession("rooms", runtimeDependencies);
    reloadedSession.load(true);
    assert.deepEqual(reloadedSession.getSceneClickableTheme(), updatedTheme);

    reloadedSession.updateSceneClickableTheme((theme) => ({
      ...theme,
      object: {
        ...theme.object,
        glowHueShiftDeg: 27,
      },
    }));

    const updatedSession = createSceneDebugRuntimeSession("rooms", runtimeDependencies);
    updatedSession.load(true);
    assert.equal(updatedSession.getSceneClickableTheme().object.glowHueShiftDeg, 27);
    assert.ok([...harness.storage.keys()].some((key) => key.includes("clickable-defaults:draft")));

    updatedSession.resetSceneClickableThemeDraft();

    const resetSession = createSceneDebugRuntimeSession("rooms", runtimeDependencies);
    resetSession.load(true);
    assert.deepEqual(resetSession.getSceneClickableTheme(), defaultTheme);
  } finally {
    harness.cleanup();
  }
});
