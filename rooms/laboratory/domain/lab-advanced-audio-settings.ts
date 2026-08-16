import {
  LAB_ANALYSIS_MODULE_SETTINGS_DEFAULTS,
  LAB_ANALYSIS_MODULE_SETTINGS_FIELDS,
} from "./lab-capabilities.js";
import type { LabSettingsFieldMeta, LabSettingsRecord } from "./lab-capability-definitions.js";

const ADVANCED_AUDIO_DEFAULTS: Record<string, LabSettingsRecord> = {
  "spectral-artifacts": {
    subsonicMap: true,
    inverseSpectrumMap: true,
  },
};

const ADVANCED_AUDIO_FIELDS: Record<string, LabSettingsFieldMeta[]> = {
  "spectral-artifacts": [
    { id: "subsonicMap", label: "Subsonic 0-20 Hz", kind: "toggle" },
    { id: "inverseSpectrumMap", label: "Inverse spectrum", kind: "toggle" },
  ],
};

let registered = false;

function appendUniqueFields(moduleId: string, fields: LabSettingsFieldMeta[]) {
  const currentFields = LAB_ANALYSIS_MODULE_SETTINGS_FIELDS[moduleId] || [];
  const existingIds = new Set(currentFields.map((field) => field.id));
  LAB_ANALYSIS_MODULE_SETTINGS_FIELDS[moduleId] = currentFields.concat(
    fields.filter((field) => !existingIds.has(field.id))
  );
}

/**
 * Adds evidence-producing advanced spectral settings to the shared Laboratory
 * analysis settings maps. Audition-only transforms belong to the live workspace
 * audio focus instead of the report-producing analysis pipeline.
 */
export function ensureAdvancedAudioAnalysisSettingsRegistered() {
  if (registered) {
    return;
  }
  registered = true;

  Object.entries(ADVANCED_AUDIO_DEFAULTS).forEach(function ([moduleId, defaults]) {
    LAB_ANALYSIS_MODULE_SETTINGS_DEFAULTS[moduleId] = {
      ...(LAB_ANALYSIS_MODULE_SETTINGS_DEFAULTS[moduleId] || {}),
      ...defaults,
    };
  });

  Object.entries(ADVANCED_AUDIO_FIELDS).forEach(function ([moduleId, fields]) {
    appendUniqueFields(moduleId, fields);
  });
}
