const SCENE_EDITOR_QUERY_KEYS = ["sceneEditor", "sceneDebug"];
const SCENE_EDITOR_ATTRIBUTE = "data-scene-editor";
const LEGACY_SCENE_DEBUG_ATTRIBUTE = "data-scene-debug";

function readSceneEditorStartupFlag(): boolean {
  try {
    const getStartupFlags = window.electronAPI?.["getStartupFlags"] as
      | (() => {
          sceneEditor?: boolean;
          sceneDebug?: boolean;
        })
      | undefined;
    const startupFlags = typeof getStartupFlags === "function" ? getStartupFlags() : undefined;
    return startupFlags?.sceneEditor === true || startupFlags?.sceneDebug === true;
  } catch {
    return false;
  }
}

export function isSceneEditorEnabled(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    for (const queryKey of SCENE_EDITOR_QUERY_KEYS) {
      const value = (params.get(queryKey) ?? "").trim().toLowerCase();
      if (value === "1" || value === "true" || value === "yes" || value === "debug") {
        return true;
      }
    }
  } catch {
    // Ignore URL parsing failures and fall back to startup flags.
  }

  return readSceneEditorStartupFlag();
}

export function applySceneEditorFlag(): boolean {
  const enabled = isSceneEditorEnabled();
  document.documentElement.setAttribute(SCENE_EDITOR_ATTRIBUTE, enabled ? "true" : "false");
  document.documentElement.setAttribute(LEGACY_SCENE_DEBUG_ATTRIBUTE, enabled ? "true" : "false");
  return enabled;
}

export function isSceneDebugEnabled(): boolean {
  return isSceneEditorEnabled();
}

export function applySceneDebugFlag(): boolean {
  return applySceneEditorFlag();
}
