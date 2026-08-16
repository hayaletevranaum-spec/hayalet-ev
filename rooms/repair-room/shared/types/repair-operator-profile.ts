export type RepairToolCategory = "soldering" | "measurement" | "vision" | "power" | "other";

export type RepairSkillLevel = 1 | 2 | 3 | 4 | 5;

export type RepairAiVerbosity = "terse" | "standard" | "detailed";

export type RepairRiskTolerance = "low" | "medium" | "high";

export type RepairMeasurementSystem = "metric" | "imperial";

export interface RepairTool {
  id: string;
  category: RepairToolCategory;
  label: string;
  capabilities: string[];
  available: boolean;
  model: string | null;
  notes: string | null;
}

export interface RepairConsumable {
  id: string;
  label: string;
  available: boolean;
  notes: string | null;
}

export interface RepairSafetyItem {
  id: string;
  label: string;
  available: boolean;
}

export interface RepairSkillRecord {
  id: string;
  label: string;
  proficiency: RepairSkillLevel;
}

export interface RepairOperatorPreferences {
  measurementSystem: RepairMeasurementSystem;
  annotationDefaultColor: string;
  annotationDefaultStrokeWidth: number;
  riskTolerance: RepairRiskTolerance;
  aiVerbosity: RepairAiVerbosity;
}

export interface RepairOperatorProfile {
  schemaVersion: number;
  profileId: string;
  displayName: string;
  bench: {
    tools: RepairTool[];
    consumables: RepairConsumable[];
    safety: RepairSafetyItem[];
  };
  skills: RepairSkillRecord[];
  preferences: RepairOperatorPreferences;
  updatedAt: string;
}

export interface RepairAiAdaptationHints {
  hasOscilloscope: boolean;
  hasBenchPsu: boolean;
  hasThermalCamera: boolean;
  hasHotAirStation: boolean;
  hasMicroscope: boolean;
  preferMultimeterFallbacks: boolean;
}
