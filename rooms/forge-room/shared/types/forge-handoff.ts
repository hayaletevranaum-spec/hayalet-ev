export interface ForgeRepoRef {
  kind: "file" | "dir" | "symbol" | "doc";
  path: string;
  symbol?: string;
  note?: string;
}

export interface ForgeArtifactRef {
  kind: "file" | "json" | "image" | "archive-ref";
  label: string;
  path?: string;
  note?: string;
}

export interface ForgeOpenQuestion {
  id: string;
  text: string;
  blocking: boolean;
}

export interface ForgeHandoffConflictRecord {
  id: string;
  taskId: string;
  kind: "approach" | "scope" | "risk" | "sequence";
  status: "open" | "resolved";
  summary: string;
  responseIds: string[];
  preferredResponseId?: string;
  resolutionNote?: string;
}

export interface ForgeHandoffTaskRecord {
  id: string;
  parentTaskId: string | null;
  level: 1 | 2;
  title: string;
  summary: string;
  executionKind: "task" | "checklist";
  dependsOnTaskIds: string[];
  assignedSeatId: "ai1" | "ai2" | "us1" | null;
  assignedRoleId: string | null;
}

export interface ForgeSelectedSynthesisRecord {
  id: string;
  summary: string;
  body: string;
  sourceTaskIds: string[];
  selectedResponseIds: string[];
  unresolvedConflictIds: string[];
}

export interface ForgeHandoffPackage {
  schemaVersion: number;
  targetRoomId: string;
  contextDigest?: string;
  preflightId?: string;
  runId?: string;
  runSignature?: string;
  sessionRevision?: number;
  snapshotHash?: string;
  goalId: string;
  goalSummary: string;
  goalBrief: string;
  constraints: string[];
  taskGraph: {
    tasks: ForgeHandoffTaskRecord[];
  };
  selectedSynthesis: ForgeSelectedSynthesisRecord;
  conflicts: ForgeHandoffConflictRecord[];
  openQuestions: ForgeOpenQuestion[];
  acceptanceCriteria: string[];
  repoRefs: ForgeRepoRef[];
  artifacts?: ForgeArtifactRef[];
  contextSummary?: {
    decisionTrace: string[];
    operatorProfileSummary: string[];
    preflightWarnings: string[];
  };
  createdAt: string;
  createdBy: {
    actorKind: "user" | "coordinator";
    actorId: string;
    label: string;
  };
}
