export type ForgeGoalStatus =
  "draft" | "draft-ready" | "approved" | "in-progress" | "synthesis-ready" | "handoff-ready";

export interface ForgeGoal {
  id: string;
  summary: string;
  brief: string;
  constraints: string[];
  acceptanceCriteria: string[];
  status: ForgeGoalStatus;
  targetRoomId: string;
  createdAt: string;
  updatedAt: string;
}
