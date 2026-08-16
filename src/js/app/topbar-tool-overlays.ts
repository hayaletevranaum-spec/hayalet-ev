import { toggleWorkspaceToolPage, type WorkspaceToolName } from "../ui/workspace-tool-overlay.js";

function bindTopbarToolButton(buttonId: string, toolName: WorkspaceToolName): void {
  const button = document.getElementById(buttonId);
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }

  button.addEventListener("click", () => {
    toggleWorkspaceToolPage(toolName);
  });
}

export function setupTopbarWorkspaceTools(): void {
  bindTopbarToolButton("topbar-whisper-open", "whisper");
  bindTopbarToolButton("archives-page-open-btn", "archives");
  bindTopbarToolButton("topbar-settings-open", "settings");
}
