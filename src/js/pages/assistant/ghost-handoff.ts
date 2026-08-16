export interface GhostHandoffRuntimePatch {
  workflowSessionId: string;
  desiredMode: "ghost-agent";
  phase: "preparing-handoff";
  [key: string]: unknown;
}

export function shouldAutoEnableKeepServersOnClose(isChecked: boolean): boolean {
  return isChecked !== true;
}

export function createGhostHandoffRuntimePatch(
  workflowSessionId: string
): GhostHandoffRuntimePatch {
  return {
    workflowSessionId,
    desiredMode: "ghost-agent",
    phase: "preparing-handoff",
  };
}
