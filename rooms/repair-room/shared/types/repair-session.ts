import type { RepairEvent } from "./repair-event.js";
import type { RepairKnowledgePack } from "./repair-knowledge-pack.js";

export type RepairRiskLevel = "low" | "medium" | "high" | "critical";

export type RepairSessionStatus =
  "draft" | "research" | "ready" | "in-progress" | "paused" | "archived";

export interface RepairDeviceInfo {
  deviceType: string;
  deviceLabel: string;
  manufacturer: string;
  model: string;
  boardCode: string;
  serialNumber: string;
  intakeNotes: string;
}

export interface RepairSymptomReport {
  primarySymptoms: string[];
  freeText: string;
  reportedAt: string;
}

export interface RepairPcbImageRef {
  id: string;
  label: string;
  src: string;
  pixelsPerMm: number;
  widthPx: number;
  heightPx: number;
}

export interface RepairSession {
  schemaVersion: number;
  id: string;
  roomId: string;
  ownerScopeId: string;
  title: string;
  status: RepairSessionStatus;
  riskLevel: RepairRiskLevel;
  deviceInfo: RepairDeviceInfo;
  symptoms: RepairSymptomReport;
  pcbImage: RepairPcbImageRef | null;
  knowledgePackId: string | null;
  knowledgePack: RepairKnowledgePack | null;
  events: RepairEvent[];
  sessionNotes: string;
  startedAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface RepairSessionListItem {
  id: string;
  title: string;
  deviceLabel: string;
  boardCode: string;
  serialNumber: string;
  status: RepairSessionStatus;
  riskLevel: RepairRiskLevel;
  updatedAt: string;
  isArchived: boolean;
}

export interface RepairEvidenceSelection {
  sessionId: string;
  selectedEvidenceResourceIds: string[];
  selectedFailureIds: string[];
  selectedTestPointIds: string[];
  updatedAt: string;
}
