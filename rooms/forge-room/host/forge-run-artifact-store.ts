import type {
  ForgeContextCapsule,
  ForgeExportSourceSnapshot,
  ForgePreflightState,
  ForgeRunArtifactStore,
  ForgeRunArtifacts,
  ForgeRunSignature,
  ForgeSynthesisSnapshot,
} from "../shared/types/index.js";
import { nowIso } from "./forge-runtime-support.js";

export function createEmptyForgeRunArtifactStore(): ForgeRunArtifactStore {
  return {
    activeRunId: null,
    entries: [],
  };
}

export function createForgeRunArtifacts(params: {
  contextDigest: string;
  ownerScopeId: string;
  runId: string;
  runSignature: ForgeRunSignature | null;
  sessionRevision: number;
}): ForgeRunArtifacts {
  const timestamp = nowIso();
  return {
    ai0PreAnalysis: null,
    contextDigest: params.contextDigest,
    createdAt: timestamp,
    decisionTrace: [],
    draftArtifacts: null,
    exportSnapshots: [],
    ownerScopeId: params.ownerScopeId,
    preflight: null,
    preflightId: null,
    reviewArtifacts: null,
    runId: params.runId,
    runSignature: params.runSignature,
    selectedContextCapsules: {},
    sessionRevision: params.sessionRevision,
    synthesisId: null,
    synthesisSnapshots: [],
    updatedAt: timestamp,
  };
}

export function readForgeRunArtifacts(
  store: ForgeRunArtifactStore,
  runId: string | null,
  ownerScopeId: string | null = null
): ForgeRunArtifacts | null {
  if (runId === null) {
    return null;
  }
  return (
    store.entries.find(
      (entry) =>
        entry.runId === runId && (ownerScopeId === null || entry.ownerScopeId === ownerScopeId)
    ) ?? null
  );
}

export function readForgeSynthesisSnapshot(
  store: ForgeRunArtifactStore,
  synthesisId: string | null,
  ownerScopeId: string | null = null
): ForgeSynthesisSnapshot | null {
  if (synthesisId === null) {
    return null;
  }
  for (const entry of store.entries) {
    if (ownerScopeId !== null && entry.ownerScopeId !== ownerScopeId) {
      continue;
    }
    const snapshot =
      entry.synthesisSnapshots.find((candidate) => candidate.synthesisId === synthesisId) ?? null;
    if (snapshot !== null) {
      return snapshot;
    }
  }
  return null;
}

export function upsertForgeRunArtifacts(
  store: ForgeRunArtifactStore,
  nextEntry: ForgeRunArtifacts
): ForgeRunArtifactStore {
  const existingIndex = store.entries.findIndex(
    (entry) => entry.runId === nextEntry.runId && entry.ownerScopeId === nextEntry.ownerScopeId
  );
  const entries = [...store.entries];
  if (existingIndex >= 0) {
    entries[existingIndex] = {
      ...nextEntry,
      updatedAt: nowIso(),
    };
  } else {
    entries.push(nextEntry);
  }
  return {
    activeRunId: nextEntry.runId,
    entries,
  };
}

export function withForgeRunPreflight(
  entry: ForgeRunArtifacts,
  preflight: ForgePreflightState
): ForgeRunArtifacts {
  return {
    ...entry,
    ai0PreAnalysis: preflight.bundle?.rovoPreAnalysis ?? entry.ai0PreAnalysis,
    preflight,
    preflightId: preflight.preflightId ?? entry.preflightId,
    updatedAt: nowIso(),
  };
}

export function withForgeRunDraftArtifacts(
  entry: ForgeRunArtifacts,
  payload: {
    draftSourceText: string | null;
    taskIds: string[];
    validationMessages: string[];
  }
): ForgeRunArtifacts {
  return {
    ...entry,
    draftArtifacts: payload,
    updatedAt: nowIso(),
  };
}

export function withForgeRunReviewArtifacts(
  entry: ForgeRunArtifacts,
  payload: {
    conflictIds: string[];
    responseIds: string[];
  }
): ForgeRunArtifacts {
  return {
    ...entry,
    reviewArtifacts: payload,
    updatedAt: nowIso(),
  };
}

export function withForgeRunDecisionTrace(
  entry: ForgeRunArtifacts,
  decisionTrace: string[]
): ForgeRunArtifacts {
  return {
    ...entry,
    decisionTrace,
    updatedAt: nowIso(),
  };
}

export function withForgeRunSelectedContextCapsule(
  entry: ForgeRunArtifacts,
  taskId: string,
  capsule: ForgeContextCapsule | null
): ForgeRunArtifacts {
  return {
    ...entry,
    selectedContextCapsules: {
      ...entry.selectedContextCapsules,
      [taskId]: capsule,
    },
    updatedAt: nowIso(),
  };
}

export function withForgeSynthesisSnapshot(
  entry: ForgeRunArtifacts,
  snapshot: ForgeSynthesisSnapshot
): ForgeRunArtifacts {
  return {
    ...entry,
    decisionTrace: snapshot.decisionTrace,
    synthesisId: snapshot.synthesisId,
    synthesisSnapshots: [...entry.synthesisSnapshots, snapshot],
    updatedAt: nowIso(),
  };
}

export function withForgeExportSnapshot(
  entry: ForgeRunArtifacts,
  snapshot: ForgeExportSourceSnapshot
): ForgeRunArtifacts {
  return {
    ...entry,
    exportSnapshots: [...entry.exportSnapshots, snapshot],
    updatedAt: nowIso(),
  };
}
