import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { getBuiltInSceneThemeRegistrations } from "../../src/js/scene-system/scene-theme-builtin-registry.ts";
import { cloneSceneClickableTheme } from "../../src/js/scene-system/scene-clickable-theme-core.ts";
import { SCENE_ROOM_IDS, type SceneRoomId } from "../../src/js/scene/schema.ts";
import { SceneThemePackageManager } from "../../electron/scene-theme-package-manager.ts";

function createInstalledThemeDocument(themeId: string) {
  const baseRegistration = getBuiltInSceneThemeRegistrations()[0];
  assert.ok(baseRegistration);

  const rooms = Object.fromEntries(
    SCENE_ROOM_IDS.map((roomId) => {
      if (roomId === "assistant") {
        return [
          roomId,
          {
            backgroundSrc: `assets/${roomId}/bg.webp`,
            views: {
              primary: {
                panelArtSrc: `assets/${roomId}/panel.webp`,
              },
            },
          },
        ];
      }

      if (roomId === "settings") {
        return [
          roomId,
          {
            backgroundSrc: `assets/${roomId}/bg.webp`,
            panels: {
              theme: `assets/${roomId}/theme.webp`,
            },
          },
        ];
      }

      return [
        roomId,
        {
          backgroundSrc: `assets/${roomId}/bg.webp`,
        },
      ];
    })
  ) as Record<SceneRoomId, { backgroundSrc: string; panels?: Record<string, string>; views?: Record<string, { panelArtSrc?: string; backgroundSrc?: string }> }>;

  return {
    version: 1,
    themeId,
    label: "Midnight",
    source: {
      themeId,
      loading: {
        frameDurationMs: 180,
        frames: ["assets/loading/frame-01.webp", "assets/loading/frame-02.webp"],
      },
      characters: {
        roles: {
          ai: {
            bodySrc: "assets/characters/ai.webp",
            bodyScale: 1,
            headTopPct: 20,
            headLeftPct: 50,
            headSizePct: 40,
            avatarScale: 1,
          },
        },
        fallbackRole: "ai",
      },
      rooms,
      clickableDefaults: cloneSceneClickableTheme(baseRegistration.clickableDefaults),
      maps: structuredClone(baseRegistration.maps),
    },
  };
}

void test("scene theme package manager lists installed themes from the runtime store", async () => {
  const runtimeRoot = await mkdtemp(join(tmpdir(), "scene-theme-store-"));
  const themeRoot = join(runtimeRoot, "midnight");
  await mkdir(themeRoot, { recursive: true });
  await writeFile(
    join(themeRoot, "theme.json"),
    `${JSON.stringify(createInstalledThemeDocument("midnight"), null, 2)}\n`,
    "utf-8"
  );

  const manager = new SceneThemePackageManager({ installedRoot: runtimeRoot });
  const registrations = await manager.listInstalledThemes();

  assert.equal(registrations.length, 1);
  assert.equal(registrations[0]?.themeId, "midnight");
  assert.equal(registrations[0].sourceKind, "installed");
  assert.equal(registrations[0].label, "Midnight");
  assert.match(registrations[0].sourceRoot , /scene-theme-store-.*\/midnight$/);
  assert.match(
    registrations[0].source?.rooms.assistant.views?.["primary"]?.panelArtSrc ?? "",
    /scene-theme-store-.*\/midnight\/assets\/assistant\/panel\.webp$/
  );
  assert.match(
    registrations[0].source?.characters.roles["ai"]?.bodySrc ?? "",
    /scene-theme-store-.*\/midnight\/assets\/characters\/ai\.webp$/
  );
});

void test("scene theme package manager ignores invalid installed themes that escape the runtime store", async () => {
  const runtimeRoot = await mkdtemp(join(tmpdir(), "scene-theme-store-invalid-"));
  const validThemeRoot = join(runtimeRoot, "midnight");
  const invalidThemeRoot = join(runtimeRoot, "broken");
  await mkdir(validThemeRoot, { recursive: true });
  await mkdir(invalidThemeRoot, { recursive: true });

  await writeFile(
    join(validThemeRoot, "theme.json"),
    `${JSON.stringify(createInstalledThemeDocument("midnight"), null, 2)}\n`,
    "utf-8"
  );

  const invalidThemeDocument = createInstalledThemeDocument("broken");
  invalidThemeDocument.source.rooms.entrance.backgroundSrc = "../escape.webp";
  await writeFile(
    join(invalidThemeRoot, "theme.json"),
    `${JSON.stringify(invalidThemeDocument, null, 2)}\n`,
    "utf-8"
  );

  const manager = new SceneThemePackageManager({ installedRoot: runtimeRoot });
  const registrations = await manager.listInstalledThemes();

  assert.deepEqual(
    registrations.map((registration) => registration.themeId),
    ["midnight"]
  );
});

void test("scene theme package manager exports an installed theme bundle with runtime files", async () => {
  const runtimeRoot = await mkdtemp(join(tmpdir(), "scene-theme-package-"));
  const themeRoot = join(runtimeRoot, "midnight");
  const bundlePath = join(runtimeRoot, "exports", "midnight.hevtheme.json");
  await mkdir(join(themeRoot, "assets", "assistant"), { recursive: true });
  await writeFile(
    join(themeRoot, "theme.json"),
    `${JSON.stringify(createInstalledThemeDocument("midnight"), null, 2)}\n`,
    "utf-8"
  );
  await writeFile(join(themeRoot, "assets", "assistant", "panel.webp"), "panel", "utf-8");
  await writeFile(join(themeRoot, "scene-editor-assets.json"), "{\"version\":1}\n", "utf-8");

  const manager = new SceneThemePackageManager({ installedRoot: runtimeRoot });
  const result = await manager.packageInstalledTheme("midnight", { outputFile: bundlePath });

  assert.equal(result.success, true, result.error);
  assert.equal(result.path, bundlePath);

  const bundle = JSON.parse(await readFile(bundlePath, "utf8")) as {
    schemaVersion: number;
    manifest: { themeId: string; entryFile: string };
    files: Record<string, { encoding: string; content: string }>;
  };

  assert.equal(bundle.schemaVersion, 1);
  assert.equal(bundle.manifest.themeId, "midnight");
  assert.equal(bundle.manifest.entryFile, "theme.json");
  assert.ok(bundle.files["theme.json"]);
  assert.ok(bundle.files["scene-editor-assets.json"]);
  assert.ok(bundle.files["assets/assistant/panel.webp"]);
});

void test("scene theme package manager imports a bundle and renames conflicting theme ids", async () => {
  const runtimeRoot = await mkdtemp(join(tmpdir(), "scene-theme-import-"));
  const bundlePath = join(runtimeRoot, "midnight.hevtheme.json");
  const existingThemeRoot = join(runtimeRoot, "midnight");
  await mkdir(existingThemeRoot, { recursive: true });
  await writeFile(
    join(existingThemeRoot, "theme.json"),
    `${JSON.stringify(createInstalledThemeDocument("midnight"), null, 2)}\n`,
    "utf-8"
  );

  const bundle = {
    schemaVersion: 1,
    manifest: {
      themeId: "midnight",
      label: "Midnight",
      entryFile: "theme.json",
    },
    files: {
      "theme.json": {
        encoding: "base64",
        content: Buffer.from(
          `${JSON.stringify(createInstalledThemeDocument("midnight"), null, 2)}\n`,
          "utf8"
        ).toString("base64"),
      },
      "assets/assistant/panel.webp": {
        encoding: "base64",
        content: Buffer.from("panel", "utf8").toString("base64"),
      },
    },
    exportedAt: "2026-03-20T00:00:00.000Z",
  };
  await writeFile(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");

  const manager = new SceneThemePackageManager({ installedRoot: runtimeRoot });
  const result = await manager.importBundleFile(bundlePath, { onConflict: "rename" });

  assert.equal(result.success, true, result.error);
  assert.equal(result.themeId, "midnight-2");
  assert.equal(existsSync(join(runtimeRoot, "midnight-2", "theme.json")), true);
  assert.equal(existsSync(join(runtimeRoot, "midnight-2", "assets", "assistant", "panel.webp")), true);

  const importedThemeDocument = JSON.parse(
    await readFile(join(runtimeRoot, "midnight-2", "theme.json"), "utf8")
  ) as { themeId: string; source: { themeId: string } };
  assert.equal(importedThemeDocument.themeId, "midnight-2");
  assert.equal(importedThemeDocument.source.themeId, "midnight-2");
});

void test("scene runtime store wiring is exposed through preload and bootstrap", async () => {
  const preloadSource = await readFile("electron/preload.cjs", "utf8");
  const appIndexSource = await readFile("src/js/app/index.ts", "utf8");
  const registrySource = await readFile("src/js/scene-system/scene-theme-installed-registry.ts", "utf8");
  const handlerSource = await readFile("electron/handlers/ipc-scene-themes.ts", "utf8");
  const packageManagerSource = await readFile("electron/scene-theme-package-manager.ts", "utf8");

  assert.match(preloadSource, /sceneThemesListInstalled:\s*\(\)\s*=>\s*ipcRenderer\.invoke\("scene-themes-list-installed"\)/);
  assert.match(preloadSource, /sceneThemesPackageInstalled:\s*\(payload\)\s*=>\s*ipcRenderer\.invoke\("scene-themes-package-installed", payload\)/);
  assert.match(preloadSource, /sceneThemesImportBundle:\s*\(payload\)\s*=>\s*ipcRenderer\.invoke\("scene-themes-import-bundle", payload\)/);
  assert.match(appIndexSource, /await syncInstalledSceneThemeRegistrationsFromElectron\(\)/);
  assert.match(registrySource, /export async function syncInstalledSceneThemeRegistrationsFromElectron/);
  assert.match(handlerSource, /registerHandler\("scene-themes-list-installed"/);
  assert.match(handlerSource, /registerHandler\(\s*"scene-themes-package-installed"/);
  assert.match(handlerSource, /registerHandler\(\s*"scene-themes-import-bundle"/);
  assert.match(packageManagerSource, /async packageInstalledTheme\(/);
  assert.match(packageManagerSource, /async importBundleFile\(/);
});
