import type { LabWorkspaceControlTab } from "../../domain/lab-types.js";
import { pad2 } from "./lab-controller-helpers.js";

const FALLBACK_TIMELINE_FRAME_DURATION_SECONDS = 1 / 30;

export type LabTimelineMediaLikeElement = {
  currentTime: number;
  duration?: number;
  readyState?: number;
  muted?: boolean;
  paused?: boolean;
  play?: () => Promise<void> | void;
  pause?: () => void;
  volume?: number;
  getVideoPlaybackQuality?: () => { totalVideoFrames?: number };
  addEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void;
  removeEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void;
};

export function isTimelineAction(action: string) {
  return action.startsWith("timeline-");
}

export function normalizeWorkspaceControlTab(value: string): LabWorkspaceControlTab | null {
  return value === "audio" || value === "visual" || value === "operations" ? value : null;
}

export function isMediaLikeElement(value: unknown): value is LabTimelineMediaLikeElement {
  if (!value || typeof value !== "object") {
    return false;
  }
  return typeof (value as LabTimelineMediaLikeElement).currentTime === "number";
}

export function formatTimelineTimeMs(totalMs: number) {
  const safeMs = Number.isFinite(totalMs) && totalMs > 0 ? Math.round(totalMs) : 0;
  const minutes = Math.floor(safeMs / 60000);
  const seconds = Math.floor((safeMs % 60000) / 1000);
  const millis = safeMs % 1000;
  return `${pad2(minutes)}:${pad2(seconds)}.${String(millis).padStart(3, "0")}`;
}

export function clampMediaTime(media: LabTimelineMediaLikeElement | null, seconds: number) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  if (media && typeof media.duration === "number" && Number.isFinite(media.duration)) {
    return Math.max(0, Math.min(media.duration, safeSeconds));
  }
  return safeSeconds;
}

function getTimelineFrameDurationSeconds(
  media: LabTimelineMediaLikeElement | null,
  metadataFps: number | null
) {
  if (metadataFps !== null && metadataFps >= 12 && metadataFps <= 240) {
    return 1 / metadataFps;
  }

  const totalFrames =
    typeof media?.getVideoPlaybackQuality === "function"
      ? (media.getVideoPlaybackQuality().totalVideoFrames ?? 0)
      : 0;
  if (media !== null && totalFrames > 1 && media.currentTime > 0) {
    const inferredFps = totalFrames / media.currentTime;
    if (Number.isFinite(inferredFps) && inferredFps >= 12 && inferredFps <= 240) {
      return 1 / inferredFps;
    }
  }

  return FALLBACK_TIMELINE_FRAME_DURATION_SECONDS;
}

export function getTimelinePlayheadShiftMs(
  value: string,
  media: LabTimelineMediaLikeElement | null,
  metadataFps: number | null
) {
  if (value === "-frame" || value === "+frame") {
    const frameMs = Math.max(
      1,
      Math.round(getTimelineFrameDurationSeconds(media, metadataFps) * 1000)
    );
    return value === "-frame" ? -frameMs : frameMs;
  }
  const deltaMs = Number(value);
  return Number.isFinite(deltaMs) ? deltaMs : null;
}

export function parseFiniteNumber(value: string | undefined, fallback: number) {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundForStep(value: number, step: number) {
  const [, decimalPart = ""] = String(step).split(".");
  const precision = Math.min(6, decimalPart.length + 2);
  return Number(value.toFixed(precision));
}

export function clampAdjustedValue(value: number, min: number, max: number, step: number) {
  return roundForStep(Math.max(min, Math.min(max, value)), step);
}
