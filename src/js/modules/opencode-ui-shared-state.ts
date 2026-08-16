import type { OpencodeUiSharedState } from "../../../shared/opencode-ui-state.js";
import {
  DEFAULT_OPENCODE_UI_SHARED_STATE,
  normalizeOpencodeUiSharedState,
} from "../../../shared/opencode-ui-state.js";

interface OpencodeUiSharedStateResult {
  success: boolean;
  state?: unknown;
  error?: string;
}

let sharedStateCache = cloneDefaultState();
let sharedStateCacheHydrated = false;
let sharedStateHydration: Promise<OpencodeUiSharedState> | null = null;
let sharedStateMutationQueue: Promise<OpencodeUiSharedState> = Promise.resolve(
  normalizeOpencodeUiSharedState(sharedStateCache)
);

function cloneDefaultState(): OpencodeUiSharedState {
  return normalizeOpencodeUiSharedState(DEFAULT_OPENCODE_UI_SHARED_STATE);
}

function cloneSharedState(state: OpencodeUiSharedState): OpencodeUiSharedState {
  return normalizeOpencodeUiSharedState(state);
}

async function readSharedStateFromApi(): Promise<OpencodeUiSharedState> {
  const api = window.electronAPI;
  if (api == null || typeof api.opencodeUiSharedStateRead !== "function") {
    return cloneDefaultState();
  }

  try {
    const result = (await api.opencodeUiSharedStateRead()) as OpencodeUiSharedStateResult;
    if (result.success !== true) {
      return cloneDefaultState();
    }

    return normalizeOpencodeUiSharedState(result.state);
  } catch {
    return cloneDefaultState();
  }
}

async function ensureSharedStateCache(): Promise<OpencodeUiSharedState> {
  if (sharedStateCacheHydrated) {
    return cloneSharedState(sharedStateCache);
  }

  if (sharedStateHydration != null) {
    return cloneSharedState(await sharedStateHydration);
  }

  sharedStateHydration = (async (): Promise<OpencodeUiSharedState> => {
    const loaded = await readSharedStateFromApi();
    sharedStateCache = cloneSharedState(loaded);
    sharedStateCacheHydrated = true;
    return cloneSharedState(sharedStateCache);
  })().finally(() => {
    sharedStateHydration = null;
  });

  return cloneSharedState(await sharedStateHydration);
}

async function persistSharedState(state: OpencodeUiSharedState): Promise<OpencodeUiSharedState> {
  const normalized = cloneSharedState(state);
  sharedStateCache = normalized;
  sharedStateCacheHydrated = true;
  const api = window.electronAPI;
  if (api == null || typeof api.opencodeUiSharedStateWrite !== "function") {
    return cloneSharedState(sharedStateCache);
  }

  try {
    const result = (await api.opencodeUiSharedStateWrite(
      normalized as unknown as Record<string, unknown>
    )) as OpencodeUiSharedStateResult;
    if (result.success !== true) {
      return cloneSharedState(sharedStateCache);
    }

    sharedStateCache = normalizeOpencodeUiSharedState(result.state);
    return cloneSharedState(sharedStateCache);
  } catch {
    return cloneSharedState(sharedStateCache);
  }
}

async function enqueueSharedStateMutation(
  mutator: (
    current: OpencodeUiSharedState
  ) => OpencodeUiSharedState | Promise<OpencodeUiSharedState>
): Promise<OpencodeUiSharedState> {
  const run = async (): Promise<OpencodeUiSharedState> => {
    const current = await ensureSharedStateCache();
    const next = await mutator(current);
    return await persistSharedState(next);
  };

  const queued = sharedStateMutationQueue.then(run, run);
  sharedStateMutationQueue = queued.then(cloneSharedState, () =>
    cloneSharedState(sharedStateCache)
  );
  return cloneSharedState(await queued);
}

export async function readOpencodeUiSharedState(): Promise<OpencodeUiSharedState> {
  return cloneSharedState(await ensureSharedStateCache());
}

export async function patchOpencodeUiSharedState(
  updater:
    Partial<OpencodeUiSharedState> | ((current: OpencodeUiSharedState) => OpencodeUiSharedState)
): Promise<OpencodeUiSharedState> {
  return await enqueueSharedStateMutation((current) =>
    typeof updater === "function"
      ? updater(current)
      : normalizeOpencodeUiSharedState({
          ...current,
          ...updater,
        })
  );
}
