import type {
  ForgeGoal,
  ForgeRunArtifactStore,
  ForgeTask,
  ForgeTaskAssignment,
  ForgeAgentResponse,
  ForgeConflict,
  ForgeOperatorProfile,
  ForgePreflightState,
  ForgeRunOverride,
  ForgeRunSignature,
  ForgeSessionContextSelection,
  ForgeSynthesis,
} from "../../shared/types/index.js";
import type { ForgeRuntimeState } from "./forge-runtime-state.js";

export type ForgeRuntimeAction =
  | {
      type: "runtime/hydrate";
      state: ForgeRuntimeState;
    }
  | {
      type: "session/activate";
      sessionId: string | null;
    }
  | {
      type: "goal/set";
      goal: ForgeGoal | null;
    }
  | {
      type: "draft/set";
      draftTasks: ForgeTask[];
      draftSourceText: string | null;
      validationMessages: string[];
    }
  | {
      type: "decision-trace/set";
      decisionTrace: string[];
    }
  | {
      type: "approved/set";
      approvedTasks: ForgeTask[];
    }
  | {
      type: "assignments/set";
      assignments: ForgeTaskAssignment[];
    }
  | {
      type: "artifact-store/set";
      artifactStore: ForgeRunArtifactStore;
    }
  | {
      type: "responses/set";
      responses: ForgeAgentResponse[];
    }
  | {
      type: "exports/set";
      exports: ForgeRuntimeState["exports"];
    }
  | {
      type: "conflicts/set";
      conflicts: ForgeConflict[];
    }
  | {
      type: "syntheses/set";
      syntheses: ForgeSynthesis[];
      selectedSynthesisId: string | null;
    }
  | {
      type: "coordinator/set";
      coordinatorState: ForgeRuntimeState["coordinatorState"];
    }
  | {
      type: "operator-profile/set";
      operatorProfile: ForgeOperatorProfile;
    }
  | {
      type: "preflight/set";
      preflight: ForgePreflightState;
    }
  | {
      type: "session-context/set";
      sessionContextSelection: ForgeSessionContextSelection;
    }
  | {
      type: "run-context/set";
      contextDigest: string | null;
      runId: string | null;
      runOverride: ForgeRunOverride | null;
      runSignature: ForgeRunSignature | null;
      sessionRevision: number;
    };
