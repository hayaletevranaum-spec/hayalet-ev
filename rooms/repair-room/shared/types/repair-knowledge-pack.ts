import type { RepairImagePoint, RepairImageRect } from "./repair-event.js";

export type RepairKnowledgeSpatialRefKind = "board-coordinate" | "region" | "component" | "rail";
export type RepairKnowledgePackResourceKind =
  "schematic" | "board-image" | "thread" | "datasheet" | "note";

export interface RepairKnowledgeSpatialRef {
  kind: RepairKnowledgeSpatialRefKind;
  label: string;
  point?: RepairImagePoint | null;
  region?: RepairImageRect | null;
  componentId?: string | null;
  rail?: string | null;
  linkedSnapshotId?: string | null;
}

export interface RepairKnowledgePackResource {
  id: string;
  label: string;
  kind: RepairKnowledgePackResourceKind;
  src: string | null;
  sourceUrl?: string | null;
  downloadUrl?: string | null;
  addedBy?: "ai" | "operator" | "seed";
  source: string;
  pages: number | null;
  confidence: number;
  spatialRefs?: RepairKnowledgeSpatialRef[];
}

export interface RepairCommonFailure {
  id: string;
  label: string;
  rationale: string;
  affectedPart: string | null;
  recommendedAction: string;
  confidence: number;
  spatialRef?: RepairKnowledgeSpatialRef | null;
}

export interface RepairTestPoint {
  id: string;
  label: string;
  rail: string;
  expectedValue: number;
  unit: string;
  tolerance: number | null;
  pinAt: { xPx: number; yPx: number } | null;
  spatialRef?: RepairKnowledgeSpatialRef | null;
}

export interface RepairKnowledgePackStats {
  schematics: number;
  boardImages: number;
  commonFailures: number;
  repairNotes: number;
  testPoints: number;
}

export interface RepairKnowledgePack {
  schemaVersion: number;
  id: string;
  modelNumber: string;
  deviceLabel: string;
  stats: RepairKnowledgePackStats;
  resources: RepairKnowledgePackResource[];
  commonFailures: RepairCommonFailure[];
  testPoints: RepairTestPoint[];
  notes: string[];
  createdAt: string;
}

export interface RepairKnowledgePackProgress {
  step:
    | "searching-device-info"
    | "finding-schematics"
    | "collecting-board-images"
    | "analyzing-common-failures"
    | "preparing-knowledge-pack"
    | "complete";
  label: string;
  completed: boolean;
}
