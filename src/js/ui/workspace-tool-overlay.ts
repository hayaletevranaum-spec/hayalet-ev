export const WORKSPACE_TOOL_OPEN_EVENT = "workspace-tool:open";
export const WORKSPACE_TOOL_CLOSE_EVENT = "workspace-tool:close";
export const WORKSPACE_TOOL_STATE_EVENT = "workspace-tool:state-change";

export const WORKSPACE_TOOL_NAMES = ["settings", "archives", "whisper"] as const;

export type WorkspaceToolName = (typeof WORKSPACE_TOOL_NAMES)[number];

export interface WorkspaceToolOpenDetail {
  tool: WorkspaceToolName;
  panel?: string | null;
}

export interface WorkspaceToolCloseDetail {
  tool: WorkspaceToolName;
}

export interface WorkspaceToolStateDetail {
  tool: WorkspaceToolName;
  open: boolean;
  panel?: string | null;
}

let activeWorkspaceTool: WorkspaceToolName | null = null;

function syncWorkspaceToolDocumentState(): void {
  if (typeof document === "undefined") {
    return;
  }

  if (activeWorkspaceTool === null) {
    delete document.documentElement.dataset["activeWorkspaceTool"];
    return;
  }

  document.documentElement.dataset["activeWorkspaceTool"] = activeWorkspaceTool;
}

export function getActiveWorkspaceTool(): WorkspaceToolName | null {
  return activeWorkspaceTool;
}

export function openWorkspaceToolPage(
  tool: WorkspaceToolName,
  options: { panel?: string | null } = {}
): void {
  document.dispatchEvent(
    new CustomEvent<WorkspaceToolOpenDetail>(WORKSPACE_TOOL_OPEN_EVENT, {
      detail: {
        tool,
        panel: options.panel ?? null,
      },
    })
  );
}

export function closeWorkspaceToolPage(tool?: WorkspaceToolName | null): void {
  const resolvedTool = tool ?? activeWorkspaceTool;
  if (resolvedTool === null) {
    return;
  }

  document.dispatchEvent(
    new CustomEvent<WorkspaceToolCloseDetail>(WORKSPACE_TOOL_CLOSE_EVENT, {
      detail: {
        tool: resolvedTool,
      },
    })
  );
}

export function toggleWorkspaceToolPage(
  tool: WorkspaceToolName,
  options: { panel?: string | null } = {}
): void {
  if (activeWorkspaceTool === tool) {
    closeWorkspaceToolPage(tool);
    return;
  }

  openWorkspaceToolPage(tool, options);
}

export function syncWorkspaceToolState(detail: WorkspaceToolStateDetail): void {
  activeWorkspaceTool = detail.open
    ? detail.tool
    : activeWorkspaceTool === detail.tool
      ? null
      : activeWorkspaceTool;
  syncWorkspaceToolDocumentState();

  document.dispatchEvent(
    new CustomEvent<WorkspaceToolStateDetail>(WORKSPACE_TOOL_STATE_EVENT, {
      detail,
    })
  );
}
