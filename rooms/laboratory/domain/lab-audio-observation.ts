export type LabAudioObservationLayout = "balanced" | "expanded";

export const DEFAULT_LAB_AUDIO_OBSERVATION_LAYOUT: LabAudioObservationLayout = "balanced";

export function normalizeLabAudioObservationLayout(value: unknown): LabAudioObservationLayout {
  return value === "expanded" ? "expanded" : DEFAULT_LAB_AUDIO_OBSERVATION_LAYOUT;
}

export function getLabAudioObservationLayout(value: unknown): LabAudioObservationLayout {
  if (!value || typeof value !== "object") {
    return DEFAULT_LAB_AUDIO_OBSERVATION_LAYOUT;
  }
  return normalizeLabAudioObservationLayout(
    (value as Record<string, unknown>)["observationLayout"]
  );
}
