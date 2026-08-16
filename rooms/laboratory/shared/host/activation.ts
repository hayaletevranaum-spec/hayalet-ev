type LaboratoryRecord = Record<string, unknown>;

type LaboratoryHostApi = {
  log: (level: string, message: string) => void;
};

type LaboratoryRuntimeRecord = LaboratoryRecord;

type LaboratoryHostActivationDeps = {
  createRuntimeState: () => LaboratoryRuntimeRecord;
  emitEvent: (api: LaboratoryHostApi, payload: LaboratoryRecord) => void;
  ensureHydrated: (api: LaboratoryHostApi, runtime: LaboratoryRuntimeRecord) => Promise<unknown>;
  ensureRoomToolsSubscription: (api: LaboratoryHostApi, runtime: LaboratoryRuntimeRecord) => void;
  handleMediaAction: (
    api: LaboratoryHostApi,
    runtime: LaboratoryRuntimeRecord,
    payload: LaboratoryRecord
  ) => Promise<unknown>;
  loadContext: (api: LaboratoryHostApi) => unknown;
  pushMediaState: (
    api: LaboratoryHostApi,
    runtime: LaboratoryRuntimeRecord,
    requestId: string | null
  ) => void;
  queueInteractiveReprocess?: (
    api: LaboratoryHostApi,
    runtime: LaboratoryRuntimeRecord,
    context: LaboratoryRecord
  ) => Promise<unknown>;
  saveContext: (api: LaboratoryHostApi, payload: LaboratoryRecord) => unknown;
  tearDownRoomToolsSubscription: (runtime: LaboratoryRuntimeRecord) => void;
  toRecord: (value: unknown) => LaboratoryRecord;
};

type LaboratoryHostEventPayload = LaboratoryRecord & {
  payload?: unknown;
  type?: unknown;
};

export function createLaboratoryHostActivation(deps: LaboratoryHostActivationDeps) {
  const {
    createRuntimeState,
    emitEvent,
    ensureHydrated,
    ensureRoomToolsSubscription,
    handleMediaAction,
    loadContext,
    pushMediaState,
    queueInteractiveReprocess,
    saveContext,
    tearDownRoomToolsSubscription,
    toRecord,
  } = deps;

  function getWorkbenchAdjustmentState(previousContext: unknown, nextContext: unknown) {
    const previousWorkbench = toRecord(toRecord(previousContext)["workbench"]);
    const nextWorkbench = toRecord(toRecord(nextContext)["workbench"]);
    const previousProcessShape = {
      analysisScope: previousWorkbench["analysisScope"],
      moduleToggles: previousWorkbench["moduleToggles"],
    };
    const nextProcessShape = {
      analysisScope: nextWorkbench["analysisScope"],
      moduleToggles: nextWorkbench["moduleToggles"],
    };
    const previousViewShape = {
      activePreviewArtifactId: previousWorkbench["activePreviewArtifactId"],
      activeLiveFindingsStreamId: previousWorkbench["activeLiveFindingsStreamId"],
      controlsCollapsed: previousWorkbench["controlsCollapsed"],
    };
    const nextViewShape = {
      activePreviewArtifactId: nextWorkbench["activePreviewArtifactId"],
      activeLiveFindingsStreamId: nextWorkbench["activeLiveFindingsStreamId"],
      controlsCollapsed: nextWorkbench["controlsCollapsed"],
    };
    return {
      changed:
        JSON.stringify(previousProcessShape) !== JSON.stringify(nextProcessShape) ||
        JSON.stringify(previousViewShape) !== JSON.stringify(nextViewShape),
      processChanged: JSON.stringify(previousProcessShape) !== JSON.stringify(nextProcessShape),
    };
  }

  return {
    activate(api: LaboratoryHostApi) {
      const runtime = createRuntimeState();
      api.log("info", "Laboratory media analysis host activated.");
      saveContext(api, {});
      ensureRoomToolsSubscription(api, runtime);

      return {
        onRoomReady(payload: unknown) {
          saveContext(api, toRecord(payload));
          void ensureHydrated(api, runtime)
            .then(function () {
              pushMediaState(api, runtime, null);
            })
            .catch(function (error) {
              api.log(
                "warn",
                `Laboratory media host bootstrap failed: ${
                  error instanceof Error ? error.message : String(error)
                }`
              );
            });
        },
        onRoomEvent(payload: unknown) {
          if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
            return;
          }

          const eventPayload = toRecord(payload) as LaboratoryHostEventPayload;
          if (eventPayload.type === "host-context") {
            const previousContext = loadContext(api);
            const nextContext = saveContext(
              api,
              eventPayload.payload !== undefined ? toRecord(eventPayload.payload) : eventPayload
            );
            const workbenchAdjustment = getWorkbenchAdjustmentState(previousContext, nextContext);
            if (workbenchAdjustment.changed) {
              const workbench = toRecord(toRecord(nextContext)["workbench"]);
              const scope = toRecord(workbench["analysisScope"]);
              if (
                workbenchAdjustment.processChanged &&
                typeof queueInteractiveReprocess === "function"
              ) {
                void queueInteractiveReprocess(api, runtime, toRecord(nextContext)).catch(
                  function (error) {
                    api.log(
                      "warn",
                      `Laboratory queued reprocess sync failed: ${
                        error instanceof Error ? error.message : String(error)
                      }`
                    );
                  }
                );
              }
              emitEvent(api, {
                kind: "interactive-adjustment-applied",
                action: "host-context",
                stage: "updated",
                scope: "global",
                message: "Analysis controls updated",
                detail:
                  (typeof scope["hypothesis"] === "string" && scope["hypothesis"].trim() !== ""
                    ? scope["hypothesis"].trim()
                    : "Workbench scope and module controls were updated.") || null,
                analysisScope: workbench["analysisScope"],
              });
            }
            pushMediaState(api, runtime, null);
            return;
          }

          if (eventPayload.type === "source-action" || eventPayload.type === "media-action") {
            void handleMediaAction(api, runtime, toRecord(eventPayload.payload));
          }
        },
        dispose() {
          tearDownRoomToolsSubscription(runtime);
          api.log("info", "Laboratory media analysis host disposed.");
        },
      };
    },
  };
}
