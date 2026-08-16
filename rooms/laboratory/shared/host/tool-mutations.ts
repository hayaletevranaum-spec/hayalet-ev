type LaboratoryRecord = Record<string, unknown>;

type LaboratoryToolEntry = LaboratoryRecord & {
  busy?: boolean;
  installed?: boolean;
  lastError?: string | null;
  latestReleaseName?: string | null;
  latestReleaseTag?: string | null;
  latestVersion?: string | null;
  releaseName?: string | null;
  releaseTag?: string | null;
  toolId: string;
  version?: string | null;
  updateAvailable?: boolean;
};

type LaboratoryRuntimeWithToolState = LaboratoryRecord & {
  toolState: {
    tools: Record<string, LaboratoryToolEntry | undefined>;
  };
};

type LaboratoryToolMutationResult = {
  tool?: LaboratoryRecord & {
    releaseName?: string | null;
    releaseTag?: string | null;
    version?: string | null;
  };
  update?: LaboratoryRecord;
};

type LaboratoryToolMutationRuntimeDeps = {
  callRoomTools: (payload: {
    featureStage?: string | null;
    installedReleaseName?: string | null | undefined;
    installedReleaseTag?: string | null | undefined;
    installedVersion?: string | null | undefined;
    jobId?: string;
    operation: string;
    requestId?: string;
    roomId: string;
    toolId: string;
  }) => Promise<LaboratoryToolMutationResult>;
  clearJob: (runtime: LaboratoryRuntimeWithToolState, jobId: string) => void;
  createDefaultToolEntry: (toolId: string) => LaboratoryToolEntry;
  getRuntimeToolIds: (runtime: LaboratoryRuntimeWithToolState) => string[];
  persistToolState: (runtime: LaboratoryRuntimeWithToolState) => Promise<unknown>;
  pushJobState: (api: unknown, payload: LaboratoryRecord) => void;
  refreshProfileModelState: (runtime: LaboratoryRuntimeWithToolState) => Promise<unknown>;
  registerJob: (runtime: LaboratoryRuntimeWithToolState, options: LaboratoryRecord) => unknown;
  roomId: string;
  toRecord: (value: unknown) => LaboratoryRecord;
};

export function createLaboratoryToolMutationRuntime(deps: LaboratoryToolMutationRuntimeDeps) {
  const {
    callRoomTools,
    clearJob,
    createDefaultToolEntry,
    getRuntimeToolIds,
    persistToolState,
    pushJobState,
    refreshProfileModelState,
    registerJob,
    roomId,
    toRecord,
  } = deps;

  function updateToolBusy(
    runtime: LaboratoryRuntimeWithToolState,
    toolId: string,
    busy: boolean,
    lastError: string | null
  ): void {
    runtime.toolState.tools[toolId] = {
      ...createDefaultToolEntry(toolId),
      ...toRecord(runtime.toolState.tools[toolId]),
      toolId: toolId,
      busy: busy === true,
      lastError: lastError || null,
    };
  }

  function createJobId(prefix: string, toolId: string): string {
    return `${prefix}-${toolId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function getToolEntry(
    runtime: LaboratoryRuntimeWithToolState,
    toolId: string
  ): LaboratoryToolEntry {
    return {
      ...createDefaultToolEntry(toolId),
      ...toRecord(runtime.toolState.tools[toolId]),
      toolId,
    };
  }

  function assertRoomManagedTool(toolId: string): void {
    if (toolId === "transcript-runtime") {
      throw new Error("Speech Runtime lifecycle moved to Settings > User > Speech Runtime.");
    }
  }

  async function checkToolUpdates(
    api: unknown,
    runtime: LaboratoryRuntimeWithToolState,
    requestId: string,
    toolId: string,
    featureStage: string | null
  ) {
    if (getRuntimeToolIds(runtime).includes(toolId) === false) {
      throw new Error(`Unsupported tool: ${toolId}`);
    }
    assertRoomManagedTool(toolId);

    const currentEntry = getToolEntry(runtime, toolId);
    if (currentEntry.busy === true) {
      throw new Error(`Tool operation already running: ${toolId}`);
    }
    if (currentEntry.installed !== true) {
      throw new Error(`Tool is not installed: ${toolId}`);
    }

    updateToolBusy(runtime, toolId, true, null);
    await persistToolState(runtime);

    const jobId = createJobId("room-tool-check", toolId);
    registerJob(runtime, {
      jobId,
      requestId,
      action: "tool-check-updates",
      toolId,
      featureStage: featureStage || "source",
      operation: "tool-check-for-updates",
    });

    pushJobState(api, {
      requestId,
      jobId,
      action: "tool-check-updates",
      toolId,
      featureStage: featureStage || "source",
      operation: "tool-check-for-updates",
      stage: "running",
    });

    try {
      const result = await callRoomTools({
        operation: "tool-check-for-updates",
        roomId,
        toolId,
        requestId,
        installedVersion: typeof currentEntry.version === "string" ? currentEntry.version : null,
        installedReleaseTag:
          typeof currentEntry.releaseTag === "string" ? currentEntry.releaseTag : null,
        installedReleaseName:
          typeof currentEntry.releaseName === "string" ? currentEntry.releaseName : null,
      });
      const update = toRecord(result["update"]);
      const nextEntry = getToolEntry(runtime, toolId);

      runtime.toolState.tools[toolId] = {
        ...nextEntry,
        busy: false,
        latestVersion: typeof update["latestVersion"] === "string" ? update["latestVersion"] : null,
        latestReleaseTag:
          typeof update["latestReleaseTag"] === "string" ? update["latestReleaseTag"] : null,
        latestReleaseName:
          typeof update["latestReleaseName"] === "string" ? update["latestReleaseName"] : null,
        releaseUrl: typeof update["releaseUrl"] === "string" ? update["releaseUrl"] : null,
        updateAvailable: update["updateAvailable"] === true,
        lastError: null,
        lastCheckedAt: new Date().toISOString(),
      };

      await persistToolState(runtime);
      pushJobState(api, {
        requestId,
        jobId,
        action: "tool-check-updates",
        toolId,
        featureStage: featureStage || "source",
        operation: "tool-check-for-updates",
        stage: "completed",
      });
      return update;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const nextEntry = getToolEntry(runtime, toolId);
      runtime.toolState.tools[toolId] = {
        ...nextEntry,
        busy: false,
        lastError: message,
      };
      await persistToolState(runtime);
      pushJobState(api, {
        requestId,
        jobId,
        action: "tool-check-updates",
        toolId,
        featureStage: featureStage || "source",
        operation: "tool-check-for-updates",
        stage: "failed",
        message,
      });
      throw error;
    } finally {
      clearJob(runtime, jobId);
    }
  }

  async function handleToolMutation(
    api: unknown,
    runtime: LaboratoryRuntimeWithToolState,
    requestId: string,
    action: string,
    toolId: string,
    featureStage: string | null
  ) {
    if (getRuntimeToolIds(runtime).includes(toolId) === false) {
      throw new Error(`Unsupported tool: ${toolId}`);
    }
    assertRoomManagedTool(toolId);
    if (getToolEntry(runtime, toolId).busy === true) {
      throw new Error(`Tool operation already running: ${toolId}`);
    }

    const operation = action === "tool-update" ? "tool-update" : "tool-install";
    const jobId = `room-tool-${toolId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    updateToolBusy(runtime, toolId, true, null);
    await persistToolState(runtime);
    registerJob(runtime, {
      jobId: jobId,
      requestId: requestId,
      action: action,
      toolId: toolId,
      featureStage: featureStage || "source",
    });

    pushJobState(api, {
      requestId: requestId,
      jobId: jobId,
      action: action,
      toolId: toolId,
      featureStage: featureStage || "source",
      stage: "queued",
    });

    try {
      const result = await callRoomTools({
        operation: operation,
        roomId: roomId,
        requestId: requestId,
        jobId: jobId,
        toolId: toolId,
      });
      const tool = toRecord(result["tool"]);

      runtime.toolState.tools[toolId] = {
        ...createDefaultToolEntry(toolId),
        ...toRecord(runtime.toolState.tools[toolId]),
        ...tool,
        toolId: toolId,
        busy: false,
        lastError: null,
        updateAvailable: false,
        latestVersion: typeof tool["version"] === "string" ? tool["version"] : null,
        latestReleaseTag: typeof tool["releaseTag"] === "string" ? tool["releaseTag"] : null,
        latestReleaseName: typeof tool["releaseName"] === "string" ? tool["releaseName"] : null,
        lastCheckedAt: new Date().toISOString(),
      };

      await persistToolState(runtime);
      if (toolId === "transcript-runtime") {
        await refreshProfileModelState(runtime);
      }
      pushJobState(api, {
        requestId: requestId,
        jobId: jobId,
        action: action,
        toolId: toolId,
        featureStage: featureStage || "source",
        stage: "completed",
      });
      return result["tool"];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const cancelled = /cancelled|canceled|iptal/i.test(message);
      updateToolBusy(runtime, toolId, false, cancelled === true ? null : message);
      await persistToolState(runtime);
      if (toolId === "transcript-runtime") {
        await refreshProfileModelState(runtime);
      }
      pushJobState(api, {
        requestId: requestId,
        jobId: jobId,
        action: action,
        toolId: toolId,
        featureStage: featureStage || "source",
        stage: cancelled === true ? "cancelled" : "failed",
        message,
      });
      throw error;
    } finally {
      clearJob(runtime, jobId);
    }
  }

  async function updateAllTools(
    api: unknown,
    runtime: LaboratoryRuntimeWithToolState,
    requestId: string,
    featureStage: string | null
  ) {
    if (
      getRuntimeToolIds(runtime).some(function (toolId) {
        return getToolEntry(runtime, toolId).busy === true;
      })
    ) {
      throw new Error("A tool operation is already running.");
    }

    const installedToolIds = getRuntimeToolIds(runtime).filter(function (toolId) {
      return toolId !== "transcript-runtime" && getToolEntry(runtime, toolId).installed === true;
    });
    const failedToolIds: string[] = [];

    /* eslint-disable no-await-in-loop */
    for (let index = 0; index < installedToolIds.length; index += 1) {
      const toolId = installedToolIds[index];
      if (!toolId) {
        continue;
      }
      try {
        await checkToolUpdates(api, runtime, requestId, toolId, featureStage);
        if (getToolEntry(runtime, toolId).updateAvailable === true) {
          await handleToolMutation(api, runtime, requestId, "tool-update", toolId, featureStage);
        }
      } catch {
        failedToolIds.push(toolId);
      }
    }
    /* eslint-enable no-await-in-loop */

    if (failedToolIds.length > 0) {
      throw new Error(`Some tools could not be updated: ${failedToolIds.join(", ")}`);
    }
  }

  async function checkAllToolUpdates(
    api: unknown,
    runtime: LaboratoryRuntimeWithToolState,
    requestId: string,
    featureStage: string | null
  ) {
    if (
      getRuntimeToolIds(runtime).some(function (toolId) {
        return getToolEntry(runtime, toolId).busy === true;
      })
    ) {
      throw new Error("A tool operation is already running.");
    }

    const installedToolIds = getRuntimeToolIds(runtime).filter(function (toolId) {
      return toolId !== "transcript-runtime" && getToolEntry(runtime, toolId).installed === true;
    });
    const failedToolIds: string[] = [];

    /* eslint-disable no-await-in-loop */
    for (let index = 0; index < installedToolIds.length; index += 1) {
      const toolId = installedToolIds[index];
      if (!toolId) {
        continue;
      }
      try {
        await checkToolUpdates(api, runtime, requestId, toolId, featureStage);
      } catch {
        failedToolIds.push(toolId);
      }
    }
    /* eslint-enable no-await-in-loop */

    if (failedToolIds.length > 0) {
      throw new Error(`Some tools could not be checked: ${failedToolIds.join(", ")}`);
    }
  }

  async function updateSelectedTools(
    api: unknown,
    runtime: LaboratoryRuntimeWithToolState,
    requestId: string,
    toolIds: string[],
    featureStage: string | null
  ) {
    if (
      getRuntimeToolIds(runtime).some(function (toolId) {
        return getToolEntry(runtime, toolId).busy === true;
      })
    ) {
      throw new Error("A tool operation is already running.");
    }

    const runtimeToolIds = new Set(getRuntimeToolIds(runtime));
    const selectedToolIds = Array.from(
      new Set(
        toolIds.filter(function (toolId) {
          return toolId !== "transcript-runtime" && runtimeToolIds.has(toolId);
        })
      )
    ).filter(function (toolId) {
      const entry = getToolEntry(runtime, toolId);
      return entry.installed === true && entry.updateAvailable === true;
    });
    const failedToolIds: string[] = [];

    /* eslint-disable no-await-in-loop */
    for (let index = 0; index < selectedToolIds.length; index += 1) {
      const toolId = selectedToolIds[index];
      if (!toolId) {
        continue;
      }
      try {
        await handleToolMutation(api, runtime, requestId, "tool-update", toolId, featureStage);
      } catch {
        failedToolIds.push(toolId);
      }
    }
    /* eslint-enable no-await-in-loop */

    if (failedToolIds.length > 0) {
      throw new Error(`Some tools could not be updated: ${failedToolIds.join(", ")}`);
    }
  }

  return {
    checkAllToolUpdates,
    checkToolUpdates,
    handleToolMutation,
    updateToolBusy,
    updateSelectedTools,
    updateAllTools,
  };
}
