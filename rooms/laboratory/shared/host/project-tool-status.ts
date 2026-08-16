type LaboratoryRecord = Record<string, unknown>;

type LaboratoryToolStateEntry = LaboratoryRecord & {
  details?: unknown;
  installed?: boolean;
  lastCheckedAt?: string | null;
  lastError?: string | null;
  releaseName?: string | null;
  releaseTag?: string | null;
  toolId: string;
  version?: string | null;
};

type LaboratoryRuntimeWithToolState = LaboratoryRecord & {
  toolState: {
    tools: Record<string, LaboratoryToolStateEntry | undefined>;
  };
};

type LaboratoryProjectToolStatusRuntimeDeps = {
  callRoomTools: (payload: LaboratoryRecord) => Promise<LaboratoryRecord>;
  createDefaultToolEntry: (toolId: string) => LaboratoryToolStateEntry;
  getRuntimeToolIds: (runtime: LaboratoryRuntimeWithToolState) => string[];
  persistToolState: (runtime: LaboratoryRuntimeWithToolState) => Promise<unknown>;
  roomId: string;
  toRecord: (value: unknown) => LaboratoryRecord;
};

export function createLaboratoryProjectToolStatusRuntime(
  deps: LaboratoryProjectToolStatusRuntimeDeps
) {
  const {
    callRoomTools,
    createDefaultToolEntry,
    getRuntimeToolIds,
    persistToolState,
    roomId,
    toRecord,
  } = deps;

  async function refreshToolStatus(runtime: LaboratoryRuntimeWithToolState): Promise<void> {
    const toolIds = getRuntimeToolIds(runtime);

    // NOTE: Tool probes stay sequential to avoid overlapping room-tool checks.
    /* eslint-disable no-await-in-loop */
    for (let index = 0; index < toolIds.length; index += 1) {
      const toolId = toolIds[index];
      if (!toolId) {
        continue;
      }
      const currentEntry = runtime.toolState.tools[toolId] || createDefaultToolEntry(toolId);
      try {
        const probeResult = await callRoomTools({
          operation: "tool-probe",
          roomId: roomId,
          toolId: toolId,
        });
        const probeTool = toRecord(probeResult["tool"]);
        runtime.toolState.tools[toolId] = {
          ...currentEntry,
          ...probeTool,
          toolId: toolId,
          busy: false,
          lastError:
            typeof probeTool["lastError"] === "string" && probeTool["lastError"].trim() !== ""
              ? probeTool["lastError"]
              : null,
          lastCheckedAt: new Date().toISOString(),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        runtime.toolState.tools[toolId] = {
          ...currentEntry,
          toolId: toolId,
          installed: false,
          busy: false,
          lastError: message,
          lastCheckedAt: new Date().toISOString(),
          details: {
            ...toRecord(currentEntry["details"]),
            platformSupported: message.indexOf("does not support") === -1 ? true : false,
            supportError: message,
          },
        };
      }
    }
    /* eslint-enable no-await-in-loop */

    await persistToolState(runtime);
  }

  return {
    refreshToolStatus,
  };
}
