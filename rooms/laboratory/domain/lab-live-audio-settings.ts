const LAB_LIVE_PITCH_SHIFT_FIELD = "livePitchSemitones";
const LAB_LIVE_PITCH_SHIFT_MIN = -12;
const LAB_LIVE_PITCH_SHIFT_MAX = 12;
const LAB_LIVE_PITCH_SHIFT_DEFAULT = 0;

function clampLivePitchShiftSemitones(value: number) {
  if (!Number.isFinite(value)) {
    return LAB_LIVE_PITCH_SHIFT_DEFAULT;
  }
  return Math.max(LAB_LIVE_PITCH_SHIFT_MIN, Math.min(LAB_LIVE_PITCH_SHIFT_MAX, value));
}

export function getLivePitchShiftSemitones(audioFocus: unknown) {
  if (audioFocus === null || typeof audioFocus !== "object" || Array.isArray(audioFocus)) {
    return LAB_LIVE_PITCH_SHIFT_DEFAULT;
  }
  const value = (audioFocus as Record<string, unknown>)[LAB_LIVE_PITCH_SHIFT_FIELD];
  return clampLivePitchShiftSemitones(typeof value === "number" ? value : Number(value));
}

export function attachLivePitchShiftSemitones<T extends object>(target: T, source: unknown): T {
  (target as Record<string, unknown>)[LAB_LIVE_PITCH_SHIFT_FIELD] =
    getLivePitchShiftSemitones(source);
  return target;
}

export function getLivePitchShiftRatio(audioFocus: unknown) {
  return Math.pow(2, getLivePitchShiftSemitones(audioFocus) / 12);
}
