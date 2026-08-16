import { createLaboratoryActionRouter } from "./action-router.js";

type LaboratoryRecord = Record<string, unknown>;
type LaboratoryActionRouterDeps = Parameters<typeof createLaboratoryActionRouter>[0];

type LaboratoryActionRouter = {
  dispatch: (api: unknown, runtime: unknown, payload: unknown) => Promise<unknown>;
};

type LaboratoryActionRuntimeDeps = {
  asNonEmptyString: (value: unknown) => string | null;
  createRequestId: () => string;
  ensureHydrated: (api: unknown, runtime: unknown) => Promise<unknown>;
  getFeatureIdFromContext: (payload: unknown) => string | null;
  loadContext: (payload: unknown) => LaboratoryRecord;
  mediaActionRuntime: LaboratoryActionRouterDeps["mediaActionRuntime"];
  persistProfileModelState: (runtime: unknown) => Promise<unknown> | unknown;
  persistToolState: (runtime: unknown) => Promise<unknown> | unknown;
  pushActionResult: (api: unknown, payload: unknown) => void;
  pushMediaState: (
    api: unknown,
    runtime: unknown,
    requestId: string | null,
    action: string | null
  ) => void;
  toRecord: (value: unknown) => LaboratoryRecord;
  toolMutationRuntime: {
    handleToolMutation: (
      api: unknown,
      runtime: unknown,
      requestId: string,
      action: string,
      toolId: string,
      featureStage: string | null
    ) => Promise<unknown>;
  };
};

export function createLaboratoryHostActionRuntime(deps: LaboratoryActionRuntimeDeps) {
  let actionRouter: LaboratoryActionRouter | null = null;
  const toolMutationRuntime = deps.toolMutationRuntime;

  function getActionRouter(): LaboratoryActionRouter {
    if (actionRouter === null) {
      actionRouter = createLaboratoryActionRouter({
        asNonEmptyString: deps.asNonEmptyString,
        createRequestId: deps.createRequestId,
        ensureHydrated: deps.ensureHydrated,
        getFeatureIdFromContext: deps.getFeatureIdFromContext,
        loadContext: deps.loadContext,
        mediaActionRuntime: deps.mediaActionRuntime,
        persistProfileModelState: deps.persistProfileModelState,
        persistToolState: deps.persistToolState,
        pushActionResult: deps.pushActionResult,
        pushMediaState: deps.pushMediaState,
        toRecord: deps.toRecord,
      }) as LaboratoryActionRouter;
    }

    return actionRouter;
  }

  async function handleToolMutation(
    api: unknown,
    runtime: unknown,
    requestId: string,
    action: string,
    toolId: string,
    featureStage: string | null
  ) {
    return toolMutationRuntime.handleToolMutation(
      api,
      runtime,
      requestId,
      action,
      toolId,
      featureStage
    );
  }

  async function handleMediaAction(api: unknown, runtime: unknown, payload: unknown) {
    return getActionRouter().dispatch(api, runtime, payload);
  }

  return {
    handleMediaAction: handleMediaAction,
    handleToolMutation: handleToolMutation,
  };
}
