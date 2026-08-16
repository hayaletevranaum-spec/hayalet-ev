import type {
  SceneBackAction,
  SceneNodeAction,
  SceneScreenAction,
  SceneSettingsAction,
} from "./schema.js";

export interface SceneActionDispatcherHandlers {
  onNavigate(page: string): void;
  onSettings(action: SceneSettingsAction): void;
  onSettingsSceneClose(): void;
  onScreen(action: SceneScreenAction): void;
  onWhisper(): void;
  onBack(action: SceneBackAction): void;
}

export function dispatchSceneAction(
  action: SceneNodeAction,
  handlers: SceneActionDispatcherHandlers
): void {
  switch (action.type) {
    case "navigate":
      handlers.onNavigate(action.page);
      return;
    case "settings":
      handlers.onSettings(action);
      return;
    case "settings-scene-close":
      handlers.onSettingsSceneClose();
      return;
    case "screen":
      handlers.onScreen(action);
      return;
    case "whisper":
      handlers.onWhisper();
      return;
    case "back":
      handlers.onBack(action);
      return;
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
