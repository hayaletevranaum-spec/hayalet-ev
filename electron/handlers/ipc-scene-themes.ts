import { registerHandler } from "./ipc-helpers.ts";
import { getSceneThemePackageManager } from "../scene-theme-package-manager.ts";

export function setupSceneThemeHandlers(): void {
  registerHandler("scene-themes-list-installed", async () => {
    const sceneThemePackageManager = getSceneThemePackageManager();
    return {
      success: true,
      themes: await sceneThemePackageManager.listInstalledThemes(),
    };
  });

  registerHandler(
    "scene-themes-package-installed",
    async (_event, payload: { themeId?: string; outputFile?: string } = {}) => {
      const sceneThemePackageManager = getSceneThemePackageManager();
      return await sceneThemePackageManager.packageInstalledTheme(payload.themeId ?? "", {
        ...(typeof payload.outputFile === "string" && payload.outputFile.trim() !== ""
          ? { outputFile: payload.outputFile.trim() }
          : {}),
      });
    }
  );

  registerHandler(
    "scene-themes-import-bundle",
    async (
      _event,
      payload: {
        bundleFile?: string;
        onConflict?: "reject" | "replace" | "rename";
      } = {}
    ) => {
      const sceneThemePackageManager = getSceneThemePackageManager();
      return await sceneThemePackageManager.importBundleFile(payload.bundleFile ?? "", {
        ...(payload.onConflict === "reject" ||
        payload.onConflict === "replace" ||
        payload.onConflict === "rename"
          ? { onConflict: payload.onConflict }
          : {}),
      });
    }
  );
}
