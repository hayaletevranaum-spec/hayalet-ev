import { FORGE_HANDOFF_SCHEMA_VERSION } from "../shared/forge-constants.js";
import type {
  ForgeExportReadinessSummary,
  ForgeHandoffPackage,
  ForgeSession,
  ForgeSynthesisSnapshot,
  ForgeSynthesisProvenance,
  ForgeSynthesis,
} from "../shared/types/index.js";
import { slugifyFilePart } from "./forge-runtime-support.js";

export function createForgeHandoffExport() {
  function isGenericFallbackOperatorSummary(summary: readonly string[]): boolean {
    return (
      summary.length === 1 &&
      (summary[0] ===
        "No operator context was selected for this run; do not assume skills, equipment, or preferences beyond the goal itself." ||
        summary[0] ===
          "Selected operator context has no persisted records yet; do not assume skills, equipment, or preferences beyond the goal itself.")
    );
  }

  function areStringListsEqual(left: readonly string[], right: readonly string[]): boolean {
    if (left.length !== right.length) {
      return false;
    }

    return left.every((entry, index) => entry === right[index]);
  }

  function shouldPreferCurrentProvenance(
    current: ForgeSynthesisProvenance,
    stored: ForgeSynthesisProvenance
  ): boolean {
    const operatorSummaryChanged =
      areStringListsEqual(current.operatorProfileSummary, stored.operatorProfileSummary) === false;
    const warningsChanged =
      areStringListsEqual(current.preflightWarnings, stored.preflightWarnings) === false;

    return (
      warningsChanged ||
      (operatorSummaryChanged &&
        isGenericFallbackOperatorSummary(current.operatorProfileSummary) === false)
    );
  }

  function requireSelectedSynthesis(session: ForgeSession): ForgeSynthesis {
    const selected = session.syntheses.find(
      (entry) =>
        entry.id === session.selectedSynthesisId &&
        (entry.status === "selected" || entry.status === "exported")
    );
    if (!selected) {
      throw new Error("A selected synthesis is required before exporting a handoff package.");
    }
    return selected;
  }

  function readAcceptanceCriteria(session: ForgeSession, selected: ForgeSynthesis): string[] {
    const criteria =
      selected.acceptanceCriteria.length > 0
        ? selected.acceptanceCriteria
        : (session.goal?.acceptanceCriteria ?? []);
    if (criteria.length === 0) {
      throw new Error(
        "At least one acceptance criterion is required before exporting a handoff package."
      );
    }
    return criteria;
  }

  function resolveExportProvenance(params: {
    fallbackProvenance?: ForgeSynthesisProvenance | null | undefined;
    selected: ForgeSynthesis;
    session: ForgeSession;
  }): ForgeSynthesisProvenance | null {
    const current = params.fallbackProvenance ?? null;
    const stored = params.selected.provenance ?? null;
    if (current === null) {
      return stored;
    }
    if (params.session.preflight.status === "stale") {
      return current;
    }
    if (stored === null) {
      return current;
    }
    if (shouldPreferCurrentProvenance(current, stored)) {
      return current;
    }
    return stored;
  }

  function buildHandoffPackage(
    session: ForgeSession,
    options: {
      fallbackProvenance?: ForgeSynthesisProvenance | null;
    } = {}
  ): ForgeHandoffPackage {
    const exportSummary = buildExportReadySummary(session);
    if (exportSummary.exportReady !== true) {
      throw new Error(exportSummary.reason);
    }
    const goal = session.goal;
    if (goal === null) {
      throw new Error("A goal is required before exporting a handoff package.");
    }
    if (goal.targetRoomId.trim() === "") {
      throw new Error("A target room is required before exporting a handoff package.");
    }

    const selected = requireSelectedSynthesis(session);
    const acceptanceCriteria = readAcceptanceCriteria(session, selected);
    const provenance = resolveExportProvenance({
      fallbackProvenance: options.fallbackProvenance,
      selected,
      session,
    });
    return {
      schemaVersion: FORGE_HANDOFF_SCHEMA_VERSION,
      targetRoomId: goal.targetRoomId,
      ...(provenance?.contextDigest ? { contextDigest: provenance.contextDigest } : {}),
      ...(provenance?.preflightId ? { preflightId: provenance.preflightId } : {}),
      ...(provenance?.runId ? { runId: provenance.runId } : {}),
      ...(provenance?.runSignature
        ? { runSignature: provenance.runSignature }
        : session.runSignature
          ? { runSignature: session.runSignature.value }
          : {}),
      ...(provenance?.sessionRevision !== null && provenance?.sessionRevision !== undefined
        ? { sessionRevision: provenance.sessionRevision }
        : {}),
      goalId: goal.id,
      goalSummary: goal.summary,
      goalBrief: goal.brief,
      constraints: goal.constraints,
      taskGraph: {
        tasks: session.approvedTasks.map((task) => ({
          id: task.id,
          parentTaskId: task.parentTaskId,
          level: task.level,
          title: task.title,
          summary: task.summary,
          executionKind: task.executionKind,
          dependsOnTaskIds: task.dependsOnTaskIds,
          assignedSeatId:
            session.assignments.find((entry) => entry.taskId === task.id)?.seatId ?? null,
          assignedRoleId:
            session.assignments.find((entry) => entry.taskId === task.id)?.roleId ?? null,
        })),
      },
      selectedSynthesis: {
        id: selected.id,
        summary: selected.summary,
        body: selected.body,
        sourceTaskIds: selected.sourceTaskIds,
        selectedResponseIds: selected.selectedResponseIds,
        unresolvedConflictIds: selected.unresolvedConflictIds,
      },
      conflicts: session.conflicts.map((conflict) => ({
        id: conflict.id,
        taskId: conflict.taskId,
        kind: conflict.kind,
        status: conflict.status,
        summary: conflict.summary,
        responseIds: conflict.responseIds,
        ...(conflict.preferredResponseId
          ? { preferredResponseId: conflict.preferredResponseId }
          : {}),
        ...(conflict.resolutionNote ? { resolutionNote: conflict.resolutionNote } : {}),
      })),
      openQuestions: selected.openQuestions.map((question, index) => ({
        id: `forge-open-question-${String(index + 1)}`,
        text: question,
        blocking: true,
      })),
      acceptanceCriteria,
      repoRefs: [],
      contextSummary: {
        decisionTrace: selected.decisionTrace,
        operatorProfileSummary: provenance?.operatorProfileSummary ?? [],
        preflightWarnings: provenance?.preflightWarnings ?? [],
      },
      createdAt: new Date().toISOString(),
      createdBy: {
        actorKind: "coordinator",
        actorId: "coordinator",
        label: "Coordinator",
      },
    };
  }

  function buildHandoffPackageFromSnapshot(snapshot: ForgeSynthesisSnapshot): ForgeHandoffPackage {
    const acceptanceCriteria =
      snapshot.synthesis.acceptanceCriteria.length > 0
        ? snapshot.synthesis.acceptanceCriteria
        : snapshot.goal.acceptanceCriteria;
    if (acceptanceCriteria.length === 0) {
      throw new Error(
        "At least one acceptance criterion is required before exporting a handoff package."
      );
    }
    return {
      schemaVersion: FORGE_HANDOFF_SCHEMA_VERSION,
      targetRoomId: snapshot.goal.targetRoomId,
      contextDigest: snapshot.contextDigest,
      ...(snapshot.preflightId ? { preflightId: snapshot.preflightId } : {}),
      runId: snapshot.runId,
      ...(snapshot.synthesis.provenance?.runSignature
        ? { runSignature: snapshot.synthesis.provenance.runSignature }
        : {}),
      sessionRevision: snapshot.sessionRevision,
      snapshotHash: snapshot.snapshotHash,
      goalId: snapshot.goal.id,
      goalSummary: snapshot.goal.summary,
      goalBrief: snapshot.goal.brief,
      constraints: snapshot.goal.constraints,
      taskGraph: {
        tasks: snapshot.approvedTasks.map((task) => ({
          id: task.id,
          parentTaskId: task.parentTaskId,
          level: task.level,
          title: task.title,
          summary: task.summary,
          executionKind: task.executionKind,
          dependsOnTaskIds: task.dependsOnTaskIds,
          assignedSeatId:
            snapshot.assignments.find((entry) => entry.taskId === task.id)?.seatId ?? null,
          assignedRoleId:
            snapshot.assignments.find((entry) => entry.taskId === task.id)?.roleId ?? null,
        })),
      },
      selectedSynthesis: {
        id: snapshot.synthesis.id,
        summary: snapshot.synthesis.summary,
        body: snapshot.synthesis.body,
        sourceTaskIds: snapshot.synthesis.sourceTaskIds,
        selectedResponseIds: snapshot.synthesis.selectedResponseIds,
        unresolvedConflictIds: snapshot.synthesis.unresolvedConflictIds,
      },
      conflicts: snapshot.conflicts.map((conflict) => ({
        id: conflict.id,
        taskId: conflict.taskId,
        kind: conflict.kind,
        status: conflict.status,
        summary: conflict.summary,
        responseIds: conflict.responseIds,
        ...(conflict.preferredResponseId
          ? { preferredResponseId: conflict.preferredResponseId }
          : {}),
        ...(conflict.resolutionNote ? { resolutionNote: conflict.resolutionNote } : {}),
      })),
      openQuestions: snapshot.synthesis.openQuestions.map((question, index) => ({
        id: `forge-open-question-${String(index + 1)}`,
        text: question,
        blocking: true,
      })),
      acceptanceCriteria,
      repoRefs: [],
      contextSummary: {
        decisionTrace: snapshot.decisionTrace,
        operatorProfileSummary: snapshot.synthesis.provenance?.operatorProfileSummary ?? [],
        preflightWarnings: snapshot.synthesis.provenance?.preflightWarnings ?? [],
      },
      createdAt: snapshot.createdAt,
      createdBy: {
        actorKind: "coordinator",
        actorId: "coordinator",
        label: "Coordinator",
      },
    };
  }

  function buildExportFileName(session: ForgeSession): string {
    const goalSummary = session.goal?.summary ?? "forge-handoff";
    return `${slugifyFilePart(goalSummary) || "forge-handoff"}-${session.id}.json`;
  }

  function buildExportReadySummary(session: ForgeSession): ForgeExportReadinessSummary {
    const selected =
      session.syntheses.find((entry) => entry.id === session.selectedSynthesisId) ?? null;
    const acceptanceCriteriaCount =
      selected?.acceptanceCriteria.length ?? session.goal?.acceptanceCriteria.length ?? 0;
    const openConflictCount = session.conflicts.filter(
      (conflict) => conflict.status === "open"
    ).length;
    const missingRequirements: string[] = [];
    const targetRoomId = session.goal?.targetRoomId ?? null;
    if (session.goal === null) {
      missingRequirements.push("Define a goal");
    }
    if (session.goal !== null && (targetRoomId === null || targetRoomId.trim() === "")) {
      missingRequirements.push("Select a target room");
    }
    if (selected === null) {
      missingRequirements.push("Select a synthesis");
    }
    if (openConflictCount > 0) {
      missingRequirements.push(
        openConflictCount === 1
          ? "Resolve the open conflict"
          : `Resolve ${String(openConflictCount)} open conflicts`
      );
    }
    if (acceptanceCriteriaCount === 0) {
      missingRequirements.push("Add at least one acceptance criterion");
    }
    if (session.preflight.status === "stale") {
      missingRequirements.push("Re-run preflight to refresh provenance");
    }
    const exportReady = missingRequirements.length === 0;
    const status =
      exportReady === true
        ? "ready"
        : acceptanceCriteriaCount === 0
          ? "missing-criteria"
          : "blocked";
    return {
      acceptanceCriteriaCount,
      exportReady,
      missingRequirements,
      openConflictCount,
      reason: exportReady
        ? "Export ready."
        : `Export blocked: ${missingRequirements[0] ?? "requirements missing"}.`,
      selectedSynthesisId: selected?.id ?? null,
      status,
      targetRoomId,
    };
  }

  return {
    buildExportFileName,
    buildHandoffPackage,
    buildHandoffPackageFromSnapshot,
    buildExportReadySummary,
  };
}
