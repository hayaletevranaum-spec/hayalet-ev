import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  cloneSceneClickableTheme,
  parseSceneClickableThemeDraft,
  resolveSceneBackGlow,
  resolveSceneLabelFontPreset,
  resolveSceneObjectGlow,
  serializeSceneClickableThemeDraft,
  serializeSceneClickableThemeSource,
} from "../../src/js/scene-system/scene-clickable-theme-core.ts";
import { SCENE_CLICKABLE_DEFAULTS } from "../../shared/themes/castle/scene-clickable-defaults.ts";

void test("shared castle theme source centralizes scene assets, theme metadata, and room maps", () => {
  const manifestSource = readFileSync("shared/themes/castle/manifest.ts", "utf8");
  const clickableDefaultsSource = readFileSync(
    "shared/themes/castle/scene-clickable-defaults.ts",
    "utf8"
  );
  const sceneLayoutsSource = readFileSync("shared/themes/castle/scene-layouts.ts", "utf8");
  const assetsSource = readFileSync("src/js/scene-system/scene-theme-assets.ts", "utf8");
  const clickableThemeSource = readFileSync("src/js/scene-system/scene-clickable-theme.ts", "utf8");
  const clickableThemeCoreSource = readFileSync(
    "src/js/scene-system/scene-clickable-theme-core.ts",
    "utf8"
  );
  const loadingSource = readFileSync("src/js/scene-system/scene-loading-theme.ts", "utf8");
  const characterSource = readFileSync("src/js/scene-system/scene-character-theme.ts", "utf8");
  const builtinRegistrySource = readFileSync(
    "src/js/scene-system/scene-theme-builtin-registry.ts",
    "utf8"
  );
  const managerSource = readFileSync("src/js/scene-system/scene-theme-manager.ts", "utf8");
  const registrySource = readFileSync("src/js/scene-system/scene-theme-registry.ts", "utf8");
  const layoutRegistrySource = readFileSync("src/js/scene-system/scene-layout-registry.ts", "utf8");
  const contractSource = readFileSync("src/js/scene-system/theme-source-contract.ts", "utf8");

  assert.match(manifestSource, /themeId:\s*CASTLE_SCENE_THEME_ID/);
  assert.match(
    manifestSource,
    /import settingsTranslatePanel from "\.\/assets\/settings\/settings_translate\.webp";/
  );
  assert.match(manifestSource, /loading:\s*\{[\s\S]*frames:\s*\[/);
  assert.match(manifestSource, /clickableDefaults:\s*SCENE_CLICKABLE_DEFAULTS/);
  assert.match(manifestSource, /rooms:\s*\{[\s\S]*entrance:[\s\S]*settings:/);
  assert.match(manifestSource, /languages:\s*settingsTranslatePanel/);
  assert.match(manifestSource, /maps:\s*CASTLE_SCENE_LAYOUTS/);
  assert.match(clickableDefaultsSource, /export const SCENE_CLICKABLE_DEFAULTS\s*=\s*\{/);
  assert.match(clickableDefaultsSource, /"?fontPresetOverride"?:\s*null/);
  assert.match(sceneLayoutsSource, /export const CASTLE_SCENE_THEME_ID = "castle"/);
  assert.match(
    sceneLayoutsSource,
    /export const CASTLE_SCENE_LAYOUTS = \{[\s\S]*entrance:\s*entranceMap[\s\S]*settings:\s*settingsMap/
  );
  assert.doesNotMatch(manifestSource, /draftStorageKeys/);
  assert.match(contractSource, /clickableDefaults:\s*SceneClickableThemeDefinition/);
  assert.match(contractSource, /maps:\s*Record<SceneRoomId,\s*SceneLayoutConfig>/);
  assert.match(clickableThemeSource, /export function getSceneClickableTheme/);
  assert.match(clickableThemeCoreSource, /export function serializeSceneClickableThemeSource/);
  assert.match(builtinRegistrySource, /sourceKind:\s*"built-in"/);
  assert.match(builtinRegistrySource, /shared\/themes\/\$\{CASTLE_SCENE_THEME_ID\}/);
  assert.match(managerSource, /class SceneThemeManagerClass/);
  assert.match(managerSource, /Built-in themes keep precedence/);
  assert.match(managerSource, /scene\.appearance\.activeThemeId/);
  assert.match(registrySource, /SceneThemeManager\.getThemeRegistration/);
  assert.match(registrySource, /getAvailableSceneThemes/);
  assert.match(layoutRegistrySource, /getSceneClickableDefaultsSourcePath/);
  assert.match(layoutRegistrySource, /getSceneRoomSourcePath/);
  assert.match(layoutRegistrySource, /getSceneThemeSourceRoot/);
  assert.match(layoutRegistrySource, /SceneThemeManager\.getThemeRegistration\(\)\.maps\[roomId\]/);
  assert.match(loadingSource, /export function getSceneLoadingTheme/);
  assert.match(characterSource, /export function getSceneCharacterRoleConfig/);
  assert.match(assetsSource, /export function getSceneRoomBackgroundSrc/);
  assert.match(assetsSource, /export function getSceneRoomViewPanelArtSrc/);
  assert.match(assetsSource, /export function getSceneRoomPanelSrc/);
  assert.equal(existsSync("src/js/scene/theme"), false);
  assert.equal(existsSync("src/assets/themes/castle"), false);
});

void test("scene runtime files resolve theme assets through scene-system and avoid legacy scene theme roots", () => {
  const backLayerSource = readFileSync("src/js/scene/renderers/back-layer.ts", "utf8");
  const objectLayerSource = readFileSync("src/js/scene/renderers/object-layer.ts", "utf8");
  const assistantSource = readFileSync("src/js/pages/assistant/assistant.ts", "utf8");
  const analyzeSource = readFileSync("src/js/pages/analyze.ts", "utf8");
  const serverSource = readFileSync("src/js/pages/server.ts", "utf8");
  const settingsSource = readFileSync("src/js/pages/settings/controller.ts", "utf8");
  const entranceSource = readFileSync("src/js/pages/entrance/scene/scene-controller.ts", "utf8");
  const splashSource = readFileSync("src/js/ui/splash-screen.ts", "utf8");
  const htmlSource = readFileSync("src/index.html", "utf8");
  const layoutStateSource = readFileSync("src/js/scene/layout/scene-layout-model.ts", "utf8");
  const layoutRegistrySource = readFileSync("src/js/scene-system/scene-layout-registry.ts", "utf8");

  assert.match(backLayerSource, /scene-clickable__button--back/);
  assert.match(backLayerSource, /resolveSceneBackGlow/);
  assert.match(objectLayerSource, /resolveSceneObjectGlow/);
  assert.equal(existsSync("src/js/scene/back-zone.ts"), false);
  assert.match(assistantSource, /scene-system\/index\.js/);
  assert.match(analyzeSource, /scene-system\/index\.js/);
  assert.match(serverSource, /scene-system\/index\.js/);
  assert.match(settingsSource, /scene-system\/index\.js/);
  assert.match(entranceSource, /scene-system\/index\.js/);
  assert.match(splashSource, /scene-system\/index\.js/);
  assert.doesNotMatch(layoutStateSource, /scene-layout-registry\.js/);
  assert.match(layoutRegistrySource, /SceneThemeManager/);
  assert.match(layoutRegistrySource, /scene-clickable-defaults\.ts/);
  assert.equal(existsSync("src/js/scene/layout/scene-layout-state.ts"), false);
  assert.doesNotMatch(backLayerSource, /scene-back-zone/);
  assert.doesNotMatch(layoutStateSource, /@theme-source\/castle\/maps\/entrance\.scene\.json/);
  assert.doesNotMatch(assistantSource, /scene\/theme\/scene-theme-assets\.js/);
  assert.doesNotMatch(analyzeSource, /scene\/theme\/scene-theme-assets\.js/);
  assert.doesNotMatch(serverSource, /scene\/theme\/scene-theme-assets\.js/);
  assert.doesNotMatch(settingsSource, /scene\/theme\/scene-theme-assets\.js/);
  assert.doesNotMatch(entranceSource, /scene\/theme\/scene-theme-assets\.js/);
  assert.doesNotMatch(splashSource, /scene\/theme\/scene-loading-theme\.js/);
  assert.doesNotMatch(htmlSource, /loading_door_0[1-4]\.webp/);
});

void test("clickable theme resolvers honor theme precedence and survive draft/source round-trips", async () => {
  const sceneClickableTheme = cloneSceneClickableTheme(SCENE_CLICKABLE_DEFAULTS);
  sceneClickableTheme.object.glowHueShiftDeg = 25.5;
  sceneClickableTheme.object.glowAlphaScale = 1.4;
  sceneClickableTheme.object.label.fontPresetOverride = "mono";
  sceneClickableTheme.object.label.visible = false;
  sceneClickableTheme.back.glowHueShiftDeg = -45;
  sceneClickableTheme.back.glowAlphaScale = 0.5;
  sceneClickableTheme.back.label.padXRem = 1.1;

  assert.deepEqual(resolveSceneObjectGlow({ hueDeg: 350, alpha: 0.8 }, sceneClickableTheme.object), {
    hueDeg: 15.5,
    alpha: 1,
  });
  assert.deepEqual(resolveSceneBackGlow({ hueDeg: 10, alpha: 0.6 }, sceneClickableTheme.back), {
    hueDeg: 325,
    alpha: 0.3,
  });
  assert.equal(resolveSceneLabelFontPreset("display", sceneClickableTheme.object.label), "mono");

  const draftRaw = serializeSceneClickableThemeDraft(sceneClickableTheme);
  assert.deepEqual(parseSceneClickableThemeDraft(draftRaw), sceneClickableTheme);

  const tempDir = mkdtempSync(join(tmpdir(), "scene-clickable-theme-"));
  const themeSourcePath = join(tempDir, "scene-clickable-defaults.ts");

  try {
    writeFileSync(themeSourcePath, serializeSceneClickableThemeSource(sceneClickableTheme), "utf8");
    const importedThemeModule = await import(
      `${pathToFileURL(themeSourcePath).href}?t=${Date.now()}`
    ) as { SCENE_CLICKABLE_DEFAULTS: typeof sceneClickableTheme };

    assert.deepEqual(importedThemeModule.SCENE_CLICKABLE_DEFAULTS, sceneClickableTheme);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
