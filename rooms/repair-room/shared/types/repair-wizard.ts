import type {
  RepairCommonFailure,
  RepairKnowledgePackProgress,
  RepairKnowledgePackResource,
  RepairTestPoint,
} from "./repair-knowledge-pack.js";

export type RepairWizardStepId =
  "device-info" | "symptoms" | "ai-research" | "evidence-review" | "ready";

export type RepairWizardResearchStatus = "idle" | "running" | "succeeded" | "failed" | "skipped";

export interface RepairWizardManualNote {
  id: string;
  text: string;
  source: string;
  confidence: number;
}

export interface RepairWizardManualEvidenceDraft {
  resources: RepairKnowledgePackResource[];
  failures: RepairCommonFailure[];
  testPoints: RepairTestPoint[];
  notes: RepairWizardManualNote[];
  removedResourceIds: string[];
  removedFailureIds: string[];
  removedTestPointIds: string[];
  removedNoteIds: string[];
}

export interface RepairWizardDraft {
  deviceType: string;
  manufacturer: string;
  model: string;
  boardCode: string;
  serialNumber: string;
  intakeNotes: string;
  primarySymptoms: string[];
  customSymptoms: string[];
  symptomFreeText: string;
  selectedEvidenceResourceIds: string[];
  selectedFailureIds: string[];
  selectedTestPointIds: string[];
  manualEvidence: RepairWizardManualEvidenceDraft;
  researchSkipped: boolean;
  researchStatus: RepairWizardResearchStatus;
  researchMessage: string | null;
}

export interface RepairWizardState {
  currentStep: RepairWizardStepId;
  draft: RepairWizardDraft;
  researchProgress: RepairKnowledgePackProgress[];
  foundResources: Array<{ id: string; label: string; kind: string }>;
  generatedKnowledgePackId: string | null;
  evidenceReviewed: boolean;
}
