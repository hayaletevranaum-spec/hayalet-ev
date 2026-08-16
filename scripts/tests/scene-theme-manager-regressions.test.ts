import assert from "node:assert/strict";
import test from "node:test";

import type { AppSettings } from "../../src/types/settings.ts";
import { cloneSceneClickableTheme } from "../../src/js/scene-system/scene-clickable-theme-core.ts";
import { getBuiltInSceneThemeRegistrations } from "../../src/js/scene-system/scene-theme-builtin-registry.ts";
import { SceneThemeManagerClass } from "../../src/js/scene-system/scene-theme-manager.ts";
import type { SceneThemeRegistration } from "../../src/js/scene-system/scene-theme-registry-contract.ts";

function createSettingsHarness(initialThemeId: string) {
  let snapshot: AppSettings = {
    scene: {
      appearance: {
        activeThemeId: initialThemeId,
      },
    },
  } as unknown as AppSettings;
  const listeners = new Set<(event: { settings: unknown; changedPaths: string[] }) => void>();

  return {
    settingsManager: {
      getSnapshot(): AppSettings {
        return snapshot;
      },
      async set(path: string, value: unknown): Promise<boolean> {
        assert.equal(path, "scene.appearance.activeThemeId");
        const appearance = {
          ...(snapshot.scene?.appearance ?? {}),
        };
        if (typeof value === "string") {
          appearance.activeThemeId = value;
        } else {
          delete appearance.activeThemeId;
        }
        snapshot = {
          ...snapshot,
          scene: {
            ...(snapshot.scene ?? {}),
            appearance: appearance,
          },
        };
        listeners.forEach((listener) => {
          listener({
            settings: snapshot,
            changedPaths: ["scene.appearance.activeThemeId"],
          });
        });
        return true;
      },
      subscribe(listener: (event: { settings: unknown; changedPaths: string[] }) => void): () => void {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
  };
}

function createSceneThemeRegistration(
  themeId: string,
  sourceKind: SceneThemeRegistration["sourceKind"] = "installed"
): SceneThemeRegistration {
  const baseRegistration = getBuiltInSceneThemeRegistrations()[0];
  assert.ok(baseRegistration);

  return {
    ...baseRegistration,
    themeId,
    label: `Theme ${themeId}`,
    sourceKind,
    sourceRoot:
      sourceKind === "built-in"
        ? `shared/themes/${themeId}`
        : `data/scene-themes/${themeId}`,
    maps: structuredClone(baseRegistration.maps),
    clickableDefaults: cloneSceneClickableTheme(baseRegistration.clickableDefaults),
  };
}

void test("scene theme manager falls back to the built-in theme and ignores installed theme shadowing", () => {
  const builtInTheme = createSceneThemeRegistration("castle", "built-in");
  const shadowCastleTheme = createSceneThemeRegistration("castle", "installed");
  const importedTheme = createSceneThemeRegistration("midnight", "installed");
  const { settingsManager } = createSettingsHarness("missing-theme");

  const manager = new SceneThemeManagerClass({
    settingsManager,
    getBuiltInThemes: () => [builtInTheme],
    getInstalledThemes: () => [shadowCastleTheme, importedTheme],
    subscribeInstalledThemes: () => () => void 0,
  });

  assert.equal(manager.getCurrentThemeId(), "castle");
  assert.deepEqual(manager.getAvailableThemes(), [
    {
      themeId: "castle",
      label: "Theme castle",
      sourceKind: "built-in",
      sourceRoot: "shared/themes/castle",
    },
    {
      themeId: "midnight",
      label: "Theme midnight",
      sourceKind: "installed",
      sourceRoot: "data/scene-themes/midnight",
    },
  ]);
});

void test("scene theme manager persists the selected runtime theme through settings", async () => {
  const builtInTheme = createSceneThemeRegistration("castle", "built-in");
  const importedTheme = createSceneThemeRegistration("midnight", "installed");
  const { settingsManager } = createSettingsHarness("castle");
  const observedReasons: string[] = [];

  const manager = new SceneThemeManagerClass({
    settingsManager,
    getBuiltInThemes: () => [builtInTheme],
    getInstalledThemes: () => [importedTheme],
    subscribeInstalledThemes: () => () => void 0,
  });

  manager.onChange((event) => {
    observedReasons.push(`${event.reason}:${event.themeId}`);
  });

  const changed = await manager.setCurrentTheme("midnight");

  assert.equal(changed, true);
  assert.equal(manager.getCurrentThemeId(), "midnight");
  assert.equal(settingsManager.getSnapshot().scene?.appearance?.activeThemeId, "midnight");
  assert.ok(observedReasons.includes("manual:midnight"));
});

void test("scene theme manager falls back to the bundled theme when an installed theme disappears", () => {
  const builtInTheme = createSceneThemeRegistration("castle", "built-in");
  const registryListeners = new Set<() => void>();
  let installedThemes = [createSceneThemeRegistration("midnight", "installed")];
  const { settingsManager } = createSettingsHarness("midnight");
  const observedReasons: string[] = [];

  const manager = new SceneThemeManagerClass({
    settingsManager,
    getBuiltInThemes: () => [builtInTheme],
    getInstalledThemes: () => installedThemes,
    subscribeInstalledThemes: (listener) => {
      registryListeners.add(listener);
      return () => {
        registryListeners.delete(listener);
      };
    },
  });

  assert.equal(manager.getCurrentThemeId(), "midnight");
  manager.onChange((event) => {
    observedReasons.push(`${event.reason}:${event.themeId}`);
  });

  installedThemes = [];
  registryListeners.forEach((listener) => {
    listener();
  });

  assert.equal(manager.getCurrentThemeId(), "castle");
  assert.ok(observedReasons.includes("registry:castle"));
});
