import { openWorkspaceToolPage, type WorkspaceToolName } from "../ui/workspace-tool-overlay.js";

export function navigateToScenePage(page: string): void {
  document.dispatchEvent(
    new CustomEvent<{ page: string }>("navigate-page", {
      detail: { page },
    })
  );
}

export function openSceneSettingsPanel(panel: string | null): void {
  openSceneWorkspaceTool("settings", { panel });
}

export function openSceneWorkspaceTool(
  tool: WorkspaceToolName,
  options: { panel?: string | null } = {}
): void {
  openWorkspaceToolPage(tool, options);
}
