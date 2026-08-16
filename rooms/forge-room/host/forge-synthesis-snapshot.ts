import type {
  ForgeConflict,
  ForgeGoal,
  ForgeHandoffPackage,
  ForgeSynthesis,
  ForgeSynthesisSnapshot,
  ForgeTask,
  ForgeTaskAssignment,
} from "../shared/types/index.js";
import {
  createForgeId,
  createImmutableSnapshot,
  hashStableValue,
  nowIso,
} from "./forge-runtime-support.js";

export function computeSnapshotHash(value: unknown): string {
  return hashStableValue(value);
}

export function createSynthesisSnapshot(params: {
  approvedTasks: ForgeTask[];
  assignments: ForgeTaskAssignment[];
  conflicts: ForgeConflict[];
  contextDigest: string;
  decisionTrace: string[];
  goal: ForgeGoal;
  ownerScopeId: string;
  preflightId: string | null;
  runId: string;
  sessionRevision: number;
  synthesis: ForgeSynthesis;
}): ForgeSynthesisSnapshot {
  const baseSnapshot = {
    approvedTasks: params.approvedTasks,
    assignments: params.assignments,
    conflicts: params.conflicts,
    createdAt: nowIso(),
    contextDigest: params.contextDigest,
    decisionTrace: params.decisionTrace,
    goal: params.goal,
    ownerScopeId: params.ownerScopeId,
    preflightId: params.preflightId,
    runId: params.runId,
    sessionRevision: params.sessionRevision,
    snapshotId: createForgeId("forge-snapshot"),
    synthesis: params.synthesis,
    synthesisId: params.synthesis.id,
  };
  return createImmutableSnapshot({
    ...baseSnapshot,
    snapshotHash: computeSnapshotHash(baseSnapshot),
  });
}

export function exportFromSynthesisSnapshot(params: {
  buildPackage: (snapshot: ForgeSynthesisSnapshot) => ForgeHandoffPackage;
  snapshot: ForgeSynthesisSnapshot;
}): ForgeHandoffPackage {
  return createImmutableSnapshot(params.buildPackage(params.snapshot));
}
