import {
  getAudioAnalysisOpenSmileConfigDir,
  getAudioAnalysisOpenSmileConfigPath,
  getProjectProfileDir,
} from "../../../shared/host/project-paths.js";
import { buildForensicSignatureMapping } from "../../../services/forensic-signature-mapper.js";

interface AnalysisProbesDeps {
  asNonEmptyString: (value: unknown) => string | null;
  asNumber: (value: unknown) => number | null;
  toRecord: (value: unknown) => Record<string, unknown>;
  readTextFile: (path: string) => Promise<string | null>;
  runProfileTool: (
    runtime: Record<string, unknown>,
    options: Record<string, unknown>
  ) => Promise<Record<string, unknown>>;
  buildProsodySummaryFromCsv: (csv: string) => Record<string, unknown>;
  parseBlackDetectLog: (log: string | null) => unknown;
  parseFreezeDetectLog: (log: string | null) => unknown;
  parseSilenceDetectLog: (log: unknown) => unknown;
  parseVolumeDetectLog: (log: unknown) => unknown;
}

type DetectionLogSegmentRecord = Record<string, unknown>;

type ProbeTimeScope = {
  durationSeconds: number;
  endSeconds: number;
  source: "analysis-scope" | "sample-window";
  startSeconds: number;
};

type StructureProbeOptions = {
  analysisScope?: unknown;
  fallbackWindowSeconds?: unknown;
  moduleSettings?: unknown;
  referenceTarget?: unknown;
  sourceKind?: unknown;
};

type FrameHashEntry = {
  durationSeconds: number | null;
  hash: string;
  sizeBytes: number | null;
  timeSeconds: number | null;
};

type FrameMetadataEntry = {
  durationSeconds: number | null;
  keyFrame: boolean;
  packetSizeBytes: number | null;
  pictType: string | null;
  timeSeconds: number | null;
};

type MotionEnergySample = {
  energy: number;
  timeSeconds: number | null;
};

type MotionSampleRegion = {
  height: number;
  source: "analysis-scope" | "default-background" | "default-subject";
  width: number;
  x: number;
  y: number;
};

const DEFAULT_STRUCTURE_PROBE_TIMEOUT_MS = 120_000;
const MAX_STRUCTURE_PROBE_TIMEOUT_MS = 15 * 60_000;
const STRUCTURE_PROBE_TIMEOUT_MS_PER_MEDIA_SECOND = 750;
const MOTION_ENERGY_ACTIVE_THRESHOLD = 0.018;
const MOTION_ENERGY_LOW_THRESHOLD = 0.006;
const VISUAL_FORENSICS_PY_TIMEOUT_MS = 3 * 60_000;
const METADATA_PROVENANCE_TIMEOUT_MS = 60_000;

const VISUAL_FORENSICS_PY_SCRIPT = String.raw`
import json
import math
import sys

import cv2
import numpy as np
from skimage.metrics import structural_similarity


def finite_number(value, fallback=None):
    try:
        numeric = float(value)
    except Exception:
        return fallback
    return numeric if math.isfinite(numeric) else fallback


def clamp(value, lower, upper):
    return max(lower, min(upper, value))


def read_options():
    try:
        return json.loads(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3] else {}
    except Exception:
        return {}


def resize_gray(frame, size=128):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return cv2.resize(gray, (size, size), interpolation=cv2.INTER_AREA)


def crop_roi(frame, roi):
    if not isinstance(roi, dict):
        return frame
    height, width = frame.shape[:2]
    x = finite_number(roi.get("x"), 0)
    y = finite_number(roi.get("y"), 0)
    w = finite_number(roi.get("width"), 1)
    h = finite_number(roi.get("height"), 1)
    if x is None or y is None or w is None or h is None or w <= 0 or h <= 0:
        return frame
    if x + w <= 1.001 and y + h <= 1.001:
        left = int(clamp(x, 0, 1) * width)
        top = int(clamp(y, 0, 1) * height)
        right = int(clamp(x + w, 0, 1) * width)
        bottom = int(clamp(y + h, 0, 1) * height)
    else:
        left = int(clamp(x, 0, width))
        top = int(clamp(y, 0, height))
        right = int(clamp(x + w, 0, width))
        bottom = int(clamp(y + h, 0, height))
    if right <= left or bottom <= top:
        return frame
    return frame[top:bottom, left:right]


def read_video_frames(path, options):
    frame_step = max(1, int(finite_number(options.get("frameStep"), 12) or 12))
    max_frames = max(2, int(finite_number(options.get("maxFrames"), 240) or 240))
    start_seconds = finite_number(options.get("startSeconds"), 0) or 0
    end_seconds = finite_number(options.get("endSeconds"), None)
    roi = options.get("roi")
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise RuntimeError("OpenCV could not open the target media.")
    fps = finite_number(cap.get(cv2.CAP_PROP_FPS), None)
    if start_seconds > 0:
        cap.set(cv2.CAP_PROP_POS_MSEC, start_seconds * 1000)
    frames = []
    frame_index = 0
    while len(frames) < max_frames:
        ok, frame = cap.read()
        if not ok:
            break
        current_msec = finite_number(cap.get(cv2.CAP_PROP_POS_MSEC), None)
        current_seconds = current_msec / 1000 if current_msec is not None else None
        if end_seconds is not None and current_seconds is not None and current_seconds > end_seconds:
            break
        if frame_index % frame_step == 0:
            frames.append({
                "index": int(cap.get(cv2.CAP_PROP_POS_FRAMES)),
                "timeSeconds": current_seconds,
                "frame": crop_roi(frame, roi),
            })
        frame_index += 1
    cap.release()
    return frames, fps


def compute_phash(gray):
    try:
        return cv2.img_hash.PHash_create().compute(gray).flatten()
    except Exception:
        small = cv2.resize(gray, (8, 8), interpolation=cv2.INTER_AREA)
        return (small > small.mean()).astype(np.uint8).flatten()


def hash_similarity(left, right):
    left_bits = np.unpackbits(left.astype(np.uint8))
    right_bits = np.unpackbits(right.astype(np.uint8))
    limit = min(left_bits.size, right_bits.size)
    if limit <= 0:
        return None
    distance = np.count_nonzero(left_bits[:limit] != right_bits[:limit])
    return 1 - (distance / limit)


def run_duplicate(path, options):
    frames, fps = read_video_frames(path, options)
    threshold = clamp(finite_number(options.get("similarityThreshold"), 0.92) or 0.92, 0, 1)
    min_run = max(1, int(finite_number(options.get("minRunFrames"), 2) or 2))
    hash_mode = str(options.get("hashMode") or "hybrid")
    prepared = []
    for entry in frames:
        gray = resize_gray(entry["frame"])
        prepared.append({
            "timeSeconds": entry["timeSeconds"],
            "gray": gray,
            "hash": compute_phash(gray),
        })
    near_count = 0
    exact_count = 0
    longest_run = 0
    segments = []
    similarities = []
    ssim_values = []
    run_start = None
    run_length = 1
    for index in range(1, len(prepared)):
        previous = prepared[index - 1]
        current = prepared[index]
        hsim = hash_similarity(previous["hash"], current["hash"])
        ssim = float(structural_similarity(previous["gray"], current["gray"]))
        similarities.append(hsim)
        ssim_values.append(ssim)
        exact = bool(np.array_equal(previous["gray"], current["gray"]))
        near = exact if hash_mode == "exact" else (hsim is not None and hsim >= threshold) or ssim >= threshold
        if exact:
            exact_count += 1
        if near:
            near_count += 1
            if run_start is None:
                run_start = index - 1
                run_length = 2
            else:
                run_length += 1
            continue
        if run_start is not None and run_length >= min_run:
            longest_run = max(longest_run, run_length)
            segments.append({
                "startSeconds": prepared[run_start]["timeSeconds"],
                "endSeconds": prepared[index - 1]["timeSeconds"],
                "frameCount": run_length,
                "repeatedFrameCount": max(0, run_length - 1),
                "similarity": similarities[index - 2] if index >= 2 else None,
                "ssim": ssim_values[index - 2] if index >= 2 else None,
            })
        run_start = None
        run_length = 1
    if run_start is not None and run_length >= min_run:
        longest_run = max(longest_run, run_length)
        segments.append({
            "startSeconds": prepared[run_start]["timeSeconds"],
            "endSeconds": prepared[-1]["timeSeconds"] if prepared else None,
            "frameCount": run_length,
            "repeatedFrameCount": max(0, run_length - 1),
            "similarity": similarities[-1] if similarities else None,
            "ssim": ssim_values[-1] if ssim_values else None,
        })
    comparisons = max(0, len(prepared) - 1)
    return {
        "hashMode": hash_mode,
        "method": "opencv-phash-ssim",
        "nearDuplicateFrameCount": near_count,
        "nearDuplicateFrameRatio": near_count / comparisons if comparisons else None,
        "opencvExactDuplicateFrameCount": exact_count,
        "sampledFrameCount": len(prepared),
        "averageHashSimilarity": float(np.mean([v for v in similarities if v is not None])) if similarities else None,
        "averageSsim": float(np.mean(ssim_values)) if ssim_values else None,
        "longestNearDuplicateRunFrames": longest_run,
        "similarityThreshold": threshold,
        "segments": segments[:12],
        "status": "measured" if len(prepared) > 1 else "unavailable",
    }


def summarize_region(label, region, samples):
    values = [sample["energy"] for sample in samples]
    return {
        "activeFrameCount": len([value for value in values if value >= 0.018]),
        "averageMotionEnergy": float(np.mean(values)) if values else None,
        "label": label,
        "medianMotionEnergy": float(np.median(values)) if values else None,
        "peakMotionEnergy": float(np.max(values)) if values else None,
        "region": region,
        "sampledFrameCount": len(values),
        "samples": samples[:24],
        "status": "measured" if values else "unavailable",
    }


def crop_norm(gray, region):
    height, width = gray.shape[:2]
    x = int(clamp(finite_number(region.get("x"), 0) or 0, 0, 1) * width)
    y = int(clamp(finite_number(region.get("y"), 0) or 0, 0, 1) * height)
    w = int(clamp(finite_number(region.get("width"), 1) or 1, 0.01, 1) * width)
    h = int(clamp(finite_number(region.get("height"), 1) or 1, 0.01, 1) * height)
    return gray[y:min(height, y + h), x:min(width, x + w)]


def run_flow(path, options):
    frames, fps = read_video_frames(path, {**options, "frameStep": options.get("frameStep", 6), "maxFrames": options.get("maxFrames", 180)})
    subject_region = options.get("subjectRegion") or {"x": 0.25, "y": 0.25, "width": 0.5, "height": 0.5}
    background_region = options.get("backgroundRegion") or {"x": 0, "y": 0, "width": 0.35, "height": 0.35}
    camera_compensation = str(options.get("cameraCompensation") or "light")
    threshold = clamp(finite_number(options.get("motionThreshold"), 0.18) or 0.18, 0, 1)
    subject_samples = []
    background_samples = []
    previous_gray = None
    for entry in frames:
        gray = resize_gray(entry["frame"], 192)
        if previous_gray is None:
            previous_gray = gray
            continue
        flow = cv2.calcOpticalFlowFarneback(previous_gray, gray, None, 0.5, 3, 15, 3, 5, 1.2, 0)
        if camera_compensation != "off":
            median_vector = np.median(flow.reshape(-1, 2), axis=0)
            strength = 1.0 if camera_compensation == "strong" else 0.65
            flow = flow - (median_vector * strength)
        magnitude = np.linalg.norm(flow, axis=2)
        subject_mag = crop_norm(magnitude, subject_region)
        background_mag = crop_norm(magnitude, background_region)
        subject_energy = float(np.mean(subject_mag) / 8) if subject_mag.size else None
        background_energy = float(np.mean(background_mag) / 8) if background_mag.size else None
        if subject_energy is not None:
            subject_samples.append({"energy": min(1, subject_energy), "timeSeconds": entry["timeSeconds"]})
        if background_energy is not None:
            background_samples.append({"energy": min(1, background_energy), "timeSeconds": entry["timeSeconds"]})
        previous_gray = gray
    subject = summarize_region("subject", subject_region, subject_samples)
    background = summarize_region("background", background_region, background_samples)
    subject_energy = subject.get("averageMotionEnergy")
    background_energy = background.get("averageMotionEnergy")
    ratio = None if subject_energy is None or background_energy is None else subject_energy / max(background_energy, 0.0001)
    movement_class = "insufficient_motion_samples"
    confidence = "low"
    reasons = []
    if subject_energy is not None and background_energy is not None and min(len(subject_samples), len(background_samples)) >= 2:
        subject_active = subject_energy >= threshold
        background_active = background_energy >= threshold
        if subject_active and not background_active and (ratio is None or ratio >= 1.6):
            movement_class = "localized_subject_motion"
            confidence = "medium" if len(subject_samples) >= 5 else "low"
            reasons.append("OpenCV Farneback flow separates subject/ROI movement from background.")
        elif subject_active and background_active:
            movement_class = "global_motion_or_camera_shift"
            confidence = "medium" if len(subject_samples) >= 5 else "low"
            reasons.append("OpenCV Farneback flow remains active in subject and background planes.")
        elif not subject_active and background_active:
            movement_class = "background_or_camera_motion"
            confidence = "medium" if len(subject_samples) >= 5 else "low"
            reasons.append("OpenCV Farneback flow is stronger in the background plane.")
        else:
            movement_class = "low_motion_baseline"
            confidence = "medium" if len(subject_samples) >= 5 else "low"
            reasons.append("OpenCV Farneback flow stayed below the configured threshold.")
    return {
        "background": background,
        "backgroundMotionEnergy": background_energy,
        "cameraCompensation": camera_compensation,
        "confidence": confidence,
        "flowEngine": "farneback",
        "method": "opencv-farneback",
        "motionThreshold": threshold,
        "movementClass": movement_class,
        "opticalFlowProxy": False,
        "reasons": reasons,
        "sampledFrameCount": min(len(subject_samples), len(background_samples)),
        "status": "measured" if min(len(subject_samples), len(background_samples)) >= 2 else "unavailable",
        "subject": subject,
        "subjectBackgroundMotionRatio": ratio,
        "subjectMotionEnergy": subject_energy,
    }


def read_single_frame(path):
    image = cv2.imread(path)
    if image is not None:
        return image
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise RuntimeError("OpenCV could not open the reference media.")
    ok, frame = cap.read()
    cap.release()
    if not ok:
        raise RuntimeError("OpenCV could not read a frame from the reference media.")
    return frame


def run_reference(path, options):
    reference_path = options.get("referencePath")
    if not reference_path:
        return {"status": "unavailable", "reason": "Reference/pre-upload source was not provided.", "sampledFrameCount": 0}
    target = read_single_frame(path)
    reference = read_single_frame(reference_path)
    target_gray = resize_gray(target, 256)
    reference_gray = resize_gray(reference, 256)
    ssim = float(structural_similarity(target_gray, reference_gray))
    return {
        "method": "opencv-skimage-ssim",
        "metricSet": str(options.get("metricSet") or "ssim"),
        "minDelta": finite_number(options.get("minDelta"), 0.05),
        "qualityDelta": 1 - ssim,
        "referencePath": reference_path,
        "sampledFrameCount": 1,
        "ssim": ssim,
        "status": "measured",
    }


mode = sys.argv[1]
target_path = sys.argv[2]
options = read_options()
if mode == "duplicate":
    payload = run_duplicate(target_path, options)
elif mode == "flow":
    payload = run_flow(target_path, options)
elif mode == "reference":
    payload = run_reference(target_path, options)
else:
    raise RuntimeError("Unknown visual forensics mode: " + mode)
print(json.dumps(payload, allow_nan=False))
`;

export function createAudioAnalysisProbeRuntime(deps: AnalysisProbesDeps) {
  const asNonEmptyString = deps.asNonEmptyString;
  const asNumber = deps.asNumber;
  const toRecord = deps.toRecord;
  const readTextFile = deps.readTextFile;
  const runProfileTool = deps.runProfileTool;
  const buildProsodySummaryFromCsv = deps.buildProsodySummaryFromCsv;
  const parseBlackDetectLog = deps.parseBlackDetectLog;
  const parseFreezeDetectLog = deps.parseFreezeDetectLog;
  const parseSilenceDetectLog = deps.parseSilenceDetectLog;
  const parseVolumeDetectLog = deps.parseVolumeDetectLog;

  function toPackageToolsRuntime(runtime: Record<string, unknown>) {
    return { packageToolsDir: runtime["packageToolsDir"] };
  }

  function toProjectPathRuntime(runtime: Record<string, unknown>) {
    const pathsRecord = toRecord(runtime["paths"]);
    const projectsDir = asNonEmptyString(pathsRecord["projectsDir"]);
    if (projectsDir === null) {
      throw new Error("Audio analysis runtime is missing a projects directory.");
    }
    return {
      paths: {
        projectsDir: projectsDir,
      },
    };
  }

  function toProjectSlugRecord(project: Record<string, unknown>) {
    const slug = asNonEmptyString(project["slug"]);
    if (slug === null) {
      throw new Error("Audio analysis project is missing a slug.");
    }
    return { slug: slug };
  }

  function readTargetPath(target: Record<string, unknown>) {
    const path = asNonEmptyString(target["path"]);
    if (path === null) {
      throw new Error("Audio analysis target is missing a file path.");
    }
    return path;
  }

  function readProfileToolStderr(result: Record<string, unknown>) {
    return asNonEmptyString(result["stderr"]);
  }

  function readProfileToolStdout(result: Record<string, unknown>) {
    return asNonEmptyString(result["stdout"]);
  }

  function asFiniteNumber(value: unknown) {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    const numericValue = asNumber(value) ?? Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  function readTargetDurationSeconds(target: Record<string, unknown>) {
    const metadata = toRecord(target["metadata"]);
    const durationSeconds =
      asFiniteNumber(metadata["durationSeconds"]) ?? asFiniteNumber(target["durationSeconds"]);
    return durationSeconds !== null && durationSeconds > 0 ? durationSeconds : null;
  }

  function formatFfmpegSeconds(value: number) {
    return (
      Math.max(0, value)
        .toFixed(3)
        .replace(/\.?0+$/, "") || "0"
    );
  }

  function resolveAnalysisScopeTimeScope(
    target: Record<string, unknown>,
    options: StructureProbeOptions
  ): ProbeTimeScope | null {
    const analysisScope = toRecord(options.analysisScope);
    const timeRange = toRecord(analysisScope["timeRange"]);
    const startMs = asFiniteNumber(timeRange["startMs"]);
    const endMs = asFiniteNumber(timeRange["endMs"]);
    if (startMs === null || endMs === null || endMs <= startMs) {
      return null;
    }

    const targetDurationSeconds = readTargetDurationSeconds(target);
    const unclampedStartSeconds = Math.max(0, startMs / 1000);
    const unclampedEndSeconds = Math.max(unclampedStartSeconds, endMs / 1000);
    const startSeconds =
      targetDurationSeconds === null
        ? unclampedStartSeconds
        : Math.min(unclampedStartSeconds, targetDurationSeconds);
    const endSeconds =
      targetDurationSeconds === null
        ? unclampedEndSeconds
        : Math.min(unclampedEndSeconds, targetDurationSeconds);
    if (endSeconds <= startSeconds) {
      return null;
    }
    return {
      durationSeconds: endSeconds - startSeconds,
      endSeconds,
      source: "analysis-scope",
      startSeconds,
    };
  }

  function resolveFallbackTimeScope(
    target: Record<string, unknown>,
    options: StructureProbeOptions
  ): ProbeTimeScope | null {
    const fallbackWindowSeconds = asFiniteNumber(options.fallbackWindowSeconds);
    if (fallbackWindowSeconds === null || fallbackWindowSeconds <= 0) {
      return null;
    }

    const targetDurationSeconds = readTargetDurationSeconds(target);
    const durationSeconds =
      targetDurationSeconds === null
        ? fallbackWindowSeconds
        : Math.min(fallbackWindowSeconds, targetDurationSeconds);
    if (durationSeconds <= 0) {
      return null;
    }
    return {
      durationSeconds,
      endSeconds: durationSeconds,
      source: "sample-window",
      startSeconds: 0,
    };
  }

  function resolveProbeTimeScope(
    target: Record<string, unknown>,
    options: StructureProbeOptions = {}
  ) {
    return (
      resolveAnalysisScopeTimeScope(target, options) || resolveFallbackTimeScope(target, options)
    );
  }

  function buildScopedInputArgs(targetPath: string, timeScope: ProbeTimeScope | null) {
    return [
      "-hide_banner",
      ...(timeScope === null
        ? []
        : [
            "-ss",
            formatFfmpegSeconds(timeScope.startSeconds),
            "-t",
            formatFfmpegSeconds(timeScope.durationSeconds),
          ]),
      "-i",
      targetPath,
    ];
  }

  function resolveStructureProbeTimeoutMs(
    target: Record<string, unknown>,
    timeScope: ProbeTimeScope | null
  ) {
    const durationSeconds = timeScope?.durationSeconds ?? readTargetDurationSeconds(target);
    if (durationSeconds === null) {
      return DEFAULT_STRUCTURE_PROBE_TIMEOUT_MS;
    }
    return Math.min(
      MAX_STRUCTURE_PROBE_TIMEOUT_MS,
      Math.max(
        DEFAULT_STRUCTURE_PROBE_TIMEOUT_MS,
        Math.ceil(durationSeconds * STRUCTURE_PROBE_TIMEOUT_MS_PER_MEDIA_SECOND)
      )
    );
  }

  function offsetOptionalSeconds(value: unknown, offsetSeconds: number) {
    const numericValue = asFiniteNumber(value);
    return numericValue === null ? value : numericValue + offsetSeconds;
  }

  function offsetDetectionLogSummary(summary: unknown, timeScope: ProbeTimeScope | null) {
    if (timeScope === null || timeScope.startSeconds <= 0) {
      return summary;
    }
    const source = toRecord(summary);
    const segments = Array.isArray(source["segments"]) ? source["segments"] : null;
    if (segments === null) {
      return summary;
    }
    return {
      ...source,
      segments: segments.map(function (segment) {
        const segmentRecord = toRecord(segment) as DetectionLogSegmentRecord;
        return {
          ...segmentRecord,
          endSeconds: offsetOptionalSeconds(segmentRecord["endSeconds"], timeScope.startSeconds),
          startSeconds: offsetOptionalSeconds(
            segmentRecord["startSeconds"],
            timeScope.startSeconds
          ),
        };
      }),
    };
  }

  function serializeProbeTimeScope(timeScope: ProbeTimeScope | null) {
    return timeScope === null
      ? null
      : {
          durationSeconds: timeScope.durationSeconds,
          endSeconds: timeScope.endSeconds,
          source: timeScope.source,
          startSeconds: timeScope.startSeconds,
        };
  }

  function roundMetric(value: number | null, digits = 4) {
    return value === null ? null : Number(value.toFixed(digits));
  }

  function safeRatio(numerator: number, denominator: number) {
    return denominator <= 0 ? null : numerator / denominator;
  }

  function toStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value
          .map(function (entry) {
            return asNonEmptyString(entry);
          })
          .filter((entry): entry is string => entry !== null)
      : [];
  }

  function getFfprobeExecutableCandidates(runtime: Record<string, unknown>) {
    const ffmpegTool = toRecord(toRecord(toRecord(runtime["toolState"])["tools"])["ffmpeg"]);
    const companionExecutables = toStringArray(ffmpegTool["companionExecutables"]);
    const detected = companionExecutables.find(function (entry) {
      return /(^|[\\/])ffprobe(?:\.exe)?$/i.test(entry);
    });
    return Array.from(new Set([detected, "ffprobe", "ffprobe.exe"].filter(Boolean) as string[]));
  }

  async function runFfprobeTool(
    runtime: Record<string, unknown>,
    options: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const candidates = getFfprobeExecutableCandidates(runtime);
    async function tryCandidate(
      index: number,
      lastError: unknown
    ): Promise<Record<string, unknown>> {
      const executableName = candidates[index];
      if (executableName === undefined) {
        throw lastError instanceof Error ? lastError : new Error(String(lastError));
      }
      try {
        return await runProfileTool(runtime, {
          ...options,
          executableName,
          toolId: "ffmpeg",
        });
      } catch (error) {
        return tryCandidate(index + 1, error);
      }
    }
    return tryCandidate(0, null);
  }

  function parseJsonRecord(value: string | null) {
    if (value === null) {
      return {};
    }
    try {
      return toRecord(JSON.parse(value) as unknown);
    } catch (_error) {
      return {};
    }
  }

  function parseJsonArray(value: string | null): unknown[] {
    if (value === null) {
      return [];
    }
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }

  function readSettingNumber(
    settings: Record<string, unknown>,
    key: string,
    fallback: number
  ): number {
    const numericValue = asFiniteNumber(settings[key]);
    return numericValue === null ? fallback : numericValue;
  }

  function readSettingBoolean(
    settings: Record<string, unknown>,
    key: string,
    fallback: boolean
  ): boolean {
    return typeof settings[key] === "boolean" ? settings[key] : fallback;
  }

  function readSettingString(
    settings: Record<string, unknown>,
    key: string,
    fallback: string
  ): string {
    return asNonEmptyString(settings[key]) || fallback;
  }

  function getModuleProbeSettings(options: StructureProbeOptions, moduleId: string) {
    return toRecord(toRecord(options.moduleSettings)[moduleId]);
  }

  function readSourceKind(options: StructureProbeOptions) {
    const sourceKind = asNonEmptyString(options.sourceKind);
    return sourceKind === "image" || sourceKind === "video" ? sourceKind : "video";
  }

  function buildAnalysisScopeRoiOptions(options: StructureProbeOptions) {
    const region = toRecord(toRecord(options.analysisScope)["region"]);
    const x = asFiniteNumber(region["x"]);
    const y = asFiniteNumber(region["y"]);
    const width = asFiniteNumber(region["width"]);
    const height = asFiniteNumber(region["height"]);
    return x === null ||
      y === null ||
      width === null ||
      height === null ||
      width <= 0 ||
      height <= 0
      ? {}
      : {
          roi: {
            height,
            width,
            x,
            y,
          },
        };
  }

  function buildVisualProbeTimeOptions(timeScope: ProbeTimeScope | null) {
    return timeScope === null
      ? {}
      : {
          endSeconds: timeScope.endSeconds,
          startSeconds: timeScope.startSeconds,
        };
  }

  async function runVisualForensicsPyProbe(
    runtime: Record<string, unknown>,
    requestId: string,
    jobId: string,
    mode: "duplicate" | "flow" | "reference",
    targetPath: string,
    options: Record<string, unknown>,
    timeoutMs = VISUAL_FORENSICS_PY_TIMEOUT_MS
  ) {
    const stdout = readProfileToolStdout(
      await runProfileTool(runtime, {
        requestId,
        jobId,
        toolId: "visual-forensics-py",
        args: ["-c", VISUAL_FORENSICS_PY_SCRIPT, mode, targetPath, JSON.stringify(options)],
        timeoutMs,
      })
    );
    return parseJsonRecord(stdout);
  }

  function parseFrameHashTimeBase(stdout: string | null) {
    const match = (stdout || "").match(/^#tb\s+0:\s*(\d+)\/(\d+)/m);
    if (!match) {
      return 1;
    }
    const numerator = asFiniteNumber(match[1]);
    const denominator = asFiniteNumber(match[2]);
    return numerator !== null && denominator !== null && denominator > 0
      ? numerator / denominator
      : 1;
  }

  function shouldOffsetScopedTimes(
    firstTimeSeconds: number | null,
    timeScope: ProbeTimeScope | null
  ) {
    return (
      firstTimeSeconds !== null &&
      timeScope !== null &&
      timeScope.startSeconds > 0 &&
      firstTimeSeconds + 0.5 < timeScope.startSeconds
    );
  }

  function parseFrameHashEntries(stdout: string | null, timeScope: ProbeTimeScope | null) {
    const timeBase = parseFrameHashTimeBase(stdout);
    const parsedEntries = (stdout || "")
      .split(/\r?\n/)
      .map(function (line): FrameHashEntry | null {
        const trimmedLine = line.trim();
        if (trimmedLine === "" || trimmedLine.startsWith("#")) {
          return null;
        }
        const parts = trimmedLine.split(",").map(function (part) {
          return part.trim();
        });
        if (parts.length < 6) {
          return null;
        }
        const pts = asFiniteNumber(parts[2]);
        const durationTicks = asFiniteNumber(parts[3]);
        const sizeBytes = asFiniteNumber(parts[4]);
        const hash = asNonEmptyString(parts.slice(5).join(","));
        if (hash === null) {
          return null;
        }
        return {
          durationSeconds: durationTicks === null ? null : durationTicks * timeBase,
          hash,
          sizeBytes,
          timeSeconds: pts === null ? null : pts * timeBase,
        };
      })
      .filter((entry): entry is FrameHashEntry => entry !== null);
    const firstTimeSeconds =
      parsedEntries.find(function (entry) {
        return entry.timeSeconds !== null;
      })?.timeSeconds ?? null;
    const offsetSeconds = shouldOffsetScopedTimes(firstTimeSeconds, timeScope)
      ? timeScope?.startSeconds || 0
      : 0;
    return parsedEntries.map(function (entry) {
      return {
        ...entry,
        timeSeconds: entry.timeSeconds === null ? null : entry.timeSeconds + offsetSeconds,
      };
    });
  }

  function getFrameEndSeconds(entries: FrameHashEntry[], index: number) {
    const entry = entries[index];
    if (!entry || entry.timeSeconds === null) {
      return null;
    }
    if (entry.durationSeconds !== null && entry.durationSeconds > 0) {
      return entry.timeSeconds + entry.durationSeconds;
    }
    const nextTimeSeconds = entries[index + 1]?.timeSeconds;
    if (typeof nextTimeSeconds === "number" && nextTimeSeconds > entry.timeSeconds) {
      return nextTimeSeconds;
    }
    const previousTimeSeconds = entries[index - 1]?.timeSeconds;
    if (typeof previousTimeSeconds === "number" && entry.timeSeconds > previousTimeSeconds) {
      return entry.timeSeconds + (entry.timeSeconds - previousTimeSeconds);
    }
    return entry.timeSeconds;
  }

  function summarizeDuplicateFrameHashes(stdout: string | null, timeScope: ProbeTimeScope | null) {
    const entries = parseFrameHashEntries(stdout, timeScope);
    const segments: Record<string, unknown>[] = [];
    let exactDuplicateFrameCount = 0;
    let longestDuplicateRunFrames = 0;
    let runStartIndex = 0;

    function finalizeRun(endExclusiveIndex: number) {
      const runLength = endExclusiveIndex - runStartIndex;
      if (runLength <= 1) {
        return;
      }
      const firstEntry = entries[runStartIndex];
      const lastIndex = endExclusiveIndex - 1;
      const endSeconds = getFrameEndSeconds(entries, lastIndex);
      const startSeconds = firstEntry?.timeSeconds ?? null;
      exactDuplicateFrameCount += runLength - 1;
      longestDuplicateRunFrames = Math.max(longestDuplicateRunFrames, runLength);
      segments.push({
        durationSeconds:
          startSeconds !== null && endSeconds !== null
            ? Math.max(0, endSeconds - startSeconds)
            : null,
        endSeconds,
        frameCount: runLength,
        hashPrefix: firstEntry?.hash.slice(0, 12) || null,
        repeatedFrameCount: runLength - 1,
        startSeconds,
      });
    }

    for (let index = 1; index <= entries.length; index += 1) {
      if (index < entries.length && entries[index]?.hash === entries[index - 1]?.hash) {
        continue;
      }
      finalizeRun(index);
      runStartIndex = index;
    }

    const transitionCount = Math.max(0, entries.length - 1);
    return {
      exactDuplicateFrameCount,
      exactDuplicateFrameRatio: roundMetric(safeRatio(exactDuplicateFrameCount, transitionCount)),
      longestDuplicateRunFrames,
      sampledFrameCount: entries.length,
      segments: segments.slice(0, 12),
      status: "measured",
    };
  }

  function mergePerceptualDuplicateFrameProbe(
    exactProbe: Record<string, unknown>,
    perceptualProbe: Record<string, unknown>,
    settings: Record<string, unknown>
  ) {
    if (asNonEmptyString(perceptualProbe["status"]) !== "measured") {
      return {
        ...exactProbe,
        hashMode: readSettingString(settings, "hashMode", "hybrid"),
        perceptualStatus: "unavailable",
        perceptualUnavailableReason:
          asNonEmptyString(perceptualProbe["reason"]) ||
          asNonEmptyString(perceptualProbe["error"]) ||
          "OpenCV/scikit-image perceptual duplicate pass was not available.",
        similarityThreshold: readSettingNumber(settings, "similarityThreshold", 0.92),
      };
    }

    const exactSampledFrameCount = asFiniteNumber(exactProbe["sampledFrameCount"]) || 0;
    const perceptualSampledFrameCount = asFiniteNumber(perceptualProbe["sampledFrameCount"]) || 0;
    return {
      ...exactProbe,
      ...perceptualProbe,
      exactDuplicateFrameCount: asFiniteNumber(exactProbe["exactDuplicateFrameCount"]) || 0,
      exactDuplicateFrameRatio: asFiniteNumber(exactProbe["exactDuplicateFrameRatio"]),
      exactFrameHashMethod: "ffmpeg-framehash",
      method: "ffmpeg-framehash+opencv-phash-ssim",
      sampledFrameCount: Math.max(exactSampledFrameCount, perceptualSampledFrameCount),
      status: "measured",
    };
  }

  async function runPerceptualDuplicateFrameProbe(
    runtime: Record<string, unknown>,
    requestId: string,
    jobId: string,
    targetPath: string,
    options: StructureProbeOptions,
    timeScope: ProbeTimeScope | null,
    settings: Record<string, unknown>
  ) {
    try {
      return await runVisualForensicsPyProbe(runtime, requestId, jobId, "duplicate", targetPath, {
        ...buildVisualProbeTimeOptions(timeScope),
        ...(readSettingBoolean(settings, "roiOnly", false)
          ? buildAnalysisScopeRoiOptions(options)
          : {}),
        frameStep: readSettingNumber(settings, "frameStep", 12),
        hashMode: readSettingString(settings, "hashMode", "hybrid"),
        minRunFrames: readSettingNumber(settings, "minRunFrames", 2),
        similarityThreshold: readSettingNumber(settings, "similarityThreshold", 0.92),
      });
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        reason: "OpenCV/scikit-image perceptual duplicate pass was not available.",
        sampledFrameCount: 0,
        status: "unavailable",
      };
    }
  }

  async function runDuplicateFrameProbe(
    runtime: Record<string, unknown>,
    project: Record<string, unknown>,
    requestId: string,
    jobId: string,
    targetPath: string,
    timeScope: ProbeTimeScope | null,
    timeoutMs: number,
    options: StructureProbeOptions,
    settings: Record<string, unknown>
  ) {
    const projectPathRuntime = toProjectPathRuntime(runtime);
    const projectSlugRecord = toProjectSlugRecord(project);
    let exactProbe: Record<string, unknown>;
    try {
      const stdout = readProfileToolStdout(
        await runProfileTool(runtime, {
          requestId,
          jobId,
          toolId: "ffmpeg",
          cwd: getProjectProfileDir(projectPathRuntime, projectSlugRecord),
          args: [
            ...buildScopedInputArgs(targetPath, timeScope),
            "-map",
            "0:v:0",
            "-an",
            "-f",
            "framehash",
            "-",
          ],
          timeoutMs,
        })
      );
      exactProbe = summarizeDuplicateFrameHashes(stdout, timeScope);
    } catch (error) {
      exactProbe = {
        error: error instanceof Error ? error.message : String(error),
        exactDuplicateFrameCount: 0,
        exactDuplicateFrameRatio: null,
        longestDuplicateRunFrames: 0,
        sampledFrameCount: 0,
        segments: [],
        status: "unavailable",
      };
    }
    const perceptualProbe = await runPerceptualDuplicateFrameProbe(
      runtime,
      requestId,
      jobId,
      targetPath,
      options,
      timeScope,
      settings
    );
    return mergePerceptualDuplicateFrameProbe(exactProbe, perceptualProbe, settings);
  }

  function buildFfprobeScopedArgs(timeScope: ProbeTimeScope | null) {
    return timeScope === null
      ? []
      : [
          "-read_intervals",
          `${formatFfmpegSeconds(timeScope.startSeconds)}%+${formatFfmpegSeconds(
            timeScope.durationSeconds
          )}`,
        ];
  }

  function parseFrameMetadataEntries(stdout: string | null, timeScope: ProbeTimeScope | null) {
    const payload = parseJsonRecord(stdout);
    const frames = Array.isArray(payload["frames"]) ? payload["frames"].map(toRecord) : [];
    const parsedEntries = frames
      .map(function (frame): FrameMetadataEntry | null {
        const timeSeconds =
          asFiniteNumber(frame["best_effort_timestamp_time"]) ??
          asFiniteNumber(frame["pkt_pts_time"]) ??
          asFiniteNumber(frame["pts_time"]);
        const pictType = asNonEmptyString(frame["pict_type"]);
        return {
          durationSeconds: asFiniteNumber(frame["pkt_duration_time"]),
          keyFrame: frame["key_frame"] === 1 || frame["key_frame"] === "1",
          packetSizeBytes: asFiniteNumber(frame["pkt_size"]),
          pictType,
          timeSeconds,
        };
      })
      .filter((entry): entry is FrameMetadataEntry => entry !== null);
    const firstTimeSeconds =
      parsedEntries.find(function (entry) {
        return entry.timeSeconds !== null;
      })?.timeSeconds ?? null;
    const offsetSeconds = shouldOffsetScopedTimes(firstTimeSeconds, timeScope)
      ? timeScope?.startSeconds || 0
      : 0;
    return parsedEntries.map(function (entry) {
      return {
        ...entry,
        timeSeconds: entry.timeSeconds === null ? null : entry.timeSeconds + offsetSeconds,
      };
    });
  }

  function average(values: number[]) {
    return values.length === 0
      ? null
      : values.reduce<number>(function (sum, value) {
          return sum + value;
        }, 0) / values.length;
  }

  function median(values: number[]) {
    const sorted = values
      .filter(function (value) {
        return Number.isFinite(value);
      })
      .sort(function (left, right) {
        return left - right;
      });
    if (sorted.length === 0) {
      return null;
    }
    const midpoint = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? ((sorted[midpoint - 1] || 0) + (sorted[midpoint] || 0)) / 2
      : sorted[midpoint] || null;
  }

  function buildFrameIntervals(entries: FrameMetadataEntry[]) {
    const intervals: number[] = [];
    let previousTimeSeconds: number | null = null;
    entries.forEach(function (entry) {
      if (entry.timeSeconds === null) {
        return;
      }
      if (previousTimeSeconds !== null) {
        const interval = entry.timeSeconds - previousTimeSeconds;
        if (interval > 0 && interval < 10) {
          intervals.push(interval);
        }
      }
      previousTimeSeconds = entry.timeSeconds;
    });
    return intervals;
  }

  function summarizeFrameCadence(entries: FrameMetadataEntry[]) {
    const intervals = buildFrameIntervals(entries);
    const medianInterval = median(intervals);
    const driftThreshold =
      medianInterval === null ? null : Math.max(0.006, Math.min(0.25, medianInterval * 0.35));
    const cadenceDriftFrameCount =
      medianInterval === null || driftThreshold === null
        ? 0
        : intervals.filter(function (interval) {
            return Math.abs(interval - medianInterval) > driftThreshold;
          }).length;
    let timestampRegressionCount = 0;
    let previousTimeSeconds: number | null = null;
    entries.forEach(function (entry) {
      if (entry.timeSeconds === null) {
        return;
      }
      if (previousTimeSeconds !== null && entry.timeSeconds + 0.001 < previousTimeSeconds) {
        timestampRegressionCount += 1;
      }
      previousTimeSeconds = entry.timeSeconds;
    });
    return {
      averageFrameIntervalSeconds: roundMetric(average(intervals)),
      cadenceDriftFrameCount,
      cadenceDriftRatio: roundMetric(safeRatio(cadenceDriftFrameCount, intervals.length)),
      maxFrameIntervalSeconds: roundMetric(intervals.length > 0 ? Math.max(...intervals) : null),
      medianFrameIntervalSeconds: roundMetric(medianInterval),
      minFrameIntervalSeconds: roundMetric(intervals.length > 0 ? Math.min(...intervals) : null),
      sampledFrameCount: entries.length,
      status: "measured",
      timestampRegressionCount,
    };
  }

  function countByPictType(entries: FrameMetadataEntry[]) {
    return entries.reduce<Record<string, number>>(function (counts, entry) {
      const key = entry.pictType || "unknown";
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});
  }

  function getMetadataNumber(target: Record<string, unknown>, key: string) {
    return asFiniteNumber(toRecord(target["metadata"])[key]);
  }

  function getMetadataString(target: Record<string, unknown>, key: string) {
    return asNonEmptyString(toRecord(target["metadata"])[key]);
  }

  function estimateBitsPerPixelFrame(
    target: Record<string, unknown>,
    medianFrameIntervalSeconds: number | null
  ) {
    const bitRate = getMetadataNumber(target, "bitRate");
    const width = getMetadataNumber(target, "width");
    const height = getMetadataNumber(target, "height");
    const fps =
      medianFrameIntervalSeconds !== null && medianFrameIntervalSeconds > 0
        ? 1 / medianFrameIntervalSeconds
        : getMetadataNumber(target, "fps");
    if (
      bitRate === null ||
      width === null ||
      height === null ||
      fps === null ||
      width <= 0 ||
      height <= 0 ||
      fps <= 0
    ) {
      return null;
    }
    return bitRate / (width * height * fps);
  }

  function summarizeCompressionSignature(
    target: Record<string, unknown>,
    entries: FrameMetadataEntry[],
    cadence: Record<string, unknown>,
    settings: Record<string, unknown>
  ) {
    const packetSizes = entries
      .map(function (entry) {
        return entry.packetSizeBytes;
      })
      .filter((entry): entry is number => typeof entry === "number" && entry > 0);
    const medianPacketSizeBytes = median(packetSizes);
    const averagePacketSizeBytes = average(packetSizes);
    const lowPacketFrameCount =
      medianPacketSizeBytes === null
        ? 0
        : packetSizes.filter(function (size) {
            return size < medianPacketSizeBytes * 0.45;
          }).length;
    const packetSpikeFrameCount =
      medianPacketSizeBytes === null
        ? 0
        : packetSizes.filter(function (size) {
            return size > medianPacketSizeBytes * 2.5;
          }).length;
    const pictTypeCounts = countByPictType(entries);
    const bFrameCount = pictTypeCounts["B"] || 0;
    const estimatedBitsPerPixelFrame = estimateBitsPerPixelFrame(
      target,
      asFiniteNumber(cadence["medianFrameIntervalSeconds"])
    );
    const riskFactors: string[] = [];
    let riskScore = 0;
    const artifactProfile = readSettingString(settings, "artifactProfile", "balanced");
    const bppThreshold = Math.max(0.01, readSettingNumber(settings, "bppThreshold", 0.08));
    const edgeSensitivity = Math.max(
      0,
      Math.min(1, readSettingNumber(settings, "edgeSensitivity", 0.55))
    );
    const lowPacketFrameRatio = safeRatio(lowPacketFrameCount, packetSizes.length);
    const packetSpikeRatio = safeRatio(packetSpikeFrameCount, packetSizes.length);
    const bFrameRatio = safeRatio(bFrameCount, entries.length);
    if (estimatedBitsPerPixelFrame !== null && estimatedBitsPerPixelFrame < bppThreshold * 0.75) {
      riskScore += 0.4;
      riskFactors.push("low bits-per-pixel-frame");
    } else if (
      estimatedBitsPerPixelFrame !== null &&
      estimatedBitsPerPixelFrame < bppThreshold * 1.25
    ) {
      riskScore += 0.2;
      riskFactors.push("moderate bits-per-pixel-frame");
    }
    if (lowPacketFrameRatio !== null && lowPacketFrameRatio > 0.2) {
      riskScore += 0.25;
      riskFactors.push("many low-packet frames");
    }
    if (
      packetSpikeRatio !== null &&
      packetSpikeRatio > Math.max(0.04, 0.16 - edgeSensitivity * 0.08)
    ) {
      riskScore += artifactProfile === "edge" ? 0.26 : 0.2;
      riskFactors.push("packet-size spikes");
    }
    if (bFrameRatio !== null && bFrameRatio > 0.35) {
      riskScore += artifactProfile === "fast-motion" ? 0.22 : 0.15;
      riskFactors.push("high B-frame share");
    }
    if (readSettingBoolean(settings, "lowLightBias", false) || artifactProfile === "low-light") {
      riskScore += 0.08;
      riskFactors.push("low-light compression bias enabled");
    }
    return {
      artifactProfile,
      averagePacketSizeBytes: roundMetric(averagePacketSizeBytes, 1),
      bppThreshold: roundMetric(bppThreshold, 5),
      codec: getMetadataString(target, "videoCodec") || getMetadataString(target, "codec"),
      edgeSensitivity: roundMetric(edgeSensitivity),
      estimatedBitsPerPixelFrame: roundMetric(estimatedBitsPerPixelFrame, 5),
      lowPacketFrameCount,
      lowPacketFrameRatio: roundMetric(lowPacketFrameRatio),
      maxPacketSizeBytes: packetSizes.length > 0 ? Math.max(...packetSizes) : null,
      medianPacketSizeBytes: roundMetric(medianPacketSizeBytes, 1),
      minPacketSizeBytes: packetSizes.length > 0 ? Math.min(...packetSizes) : null,
      packetSpikeFrameCount,
      packetSpikeRatio: roundMetric(packetSpikeRatio),
      pictTypeCounts,
      riskFactors,
      riskLevel: riskScore >= 0.66 ? "high" : riskScore >= 0.33 ? "medium" : "low",
      riskScore: roundMetric(Math.min(1, riskScore)),
      sampledFrameCount: entries.length,
      status: "measured",
    };
  }

  function summarizeGopStructure(entries: FrameMetadataEntry[]) {
    const keyFrameTimes = entries
      .filter(function (entry) {
        return entry.keyFrame && entry.timeSeconds !== null;
      })
      .map(function (entry) {
        return entry.timeSeconds as number;
      });
    const gopDurations = keyFrameTimes
      .slice(1)
      .map(function (timeSeconds, index) {
        return timeSeconds - (keyFrameTimes[index] || 0);
      })
      .filter(function (durationSeconds) {
        return durationSeconds > 0;
      });
    return {
      averageGopSeconds: roundMetric(average(gopDurations)),
      keyFrameCount: keyFrameTimes.length,
      keyFrameRatio: roundMetric(safeRatio(keyFrameTimes.length, entries.length)),
      keyFrameTimes: keyFrameTimes.slice(0, 24).map(function (timeSeconds) {
        return roundMetric(timeSeconds, 3);
      }),
      maxGopSeconds: roundMetric(gopDurations.length > 0 ? Math.max(...gopDurations) : null),
      sampledFrameCount: entries.length,
      status: "measured",
    };
  }

  function clampMotionRegionValue(value: number) {
    return Math.max(0, Math.min(1, value));
  }

  function normalizeMotionRegion(region: Record<string, unknown>, target: Record<string, unknown>) {
    const x = asFiniteNumber(region["x"]);
    const y = asFiniteNumber(region["y"]);
    const width = asFiniteNumber(region["width"]);
    const height = asFiniteNumber(region["height"]);
    if (
      x === null ||
      y === null ||
      width === null ||
      height === null ||
      width <= 0 ||
      height <= 0
    ) {
      return null;
    }

    if (x + width <= 1.001 && y + height <= 1.001) {
      return {
        height: clampMotionRegionValue(height),
        width: clampMotionRegionValue(width),
        x: clampMotionRegionValue(x),
        y: clampMotionRegionValue(y),
      };
    }

    const sourceWidth = getMetadataNumber(target, "width");
    const sourceHeight = getMetadataNumber(target, "height");
    if (sourceWidth === null || sourceHeight === null || sourceWidth <= 0 || sourceHeight <= 0) {
      return null;
    }
    return {
      height: clampMotionRegionValue(height / sourceHeight),
      width: clampMotionRegionValue(width / sourceWidth),
      x: clampMotionRegionValue(x / sourceWidth),
      y: clampMotionRegionValue(y / sourceHeight),
    };
  }

  function resolveSubjectMotionRegion(
    target: Record<string, unknown>,
    options: StructureProbeOptions,
    settings: Record<string, unknown>
  ): MotionSampleRegion {
    const planeSplit = readSettingString(settings, "planeSplit", "auto");
    if (planeSplit === "full-frame") {
      return {
        height: 1,
        source: "default-subject",
        width: 1,
        x: 0,
        y: 0,
      };
    }
    const analysisScope = toRecord(options.analysisScope);
    const normalizedRegion = normalizeMotionRegion(toRecord(analysisScope["region"]), target);
    if (
      normalizedRegion !== null &&
      (planeSplit === "roi" || readSettingBoolean(settings, "roiOnly", false) === true)
    ) {
      const width = Math.max(0.04, Math.min(normalizedRegion.width, 1 - normalizedRegion.x));
      const height = Math.max(0.04, Math.min(normalizedRegion.height, 1 - normalizedRegion.y));
      return {
        height,
        source: "analysis-scope",
        width,
        x: Math.min(normalizedRegion.x, 1 - width),
        y: Math.min(normalizedRegion.y, 1 - height),
      };
    }
    return {
      height: 0.5,
      source: "default-subject",
      width: 0.5,
      x: 0.25,
      y: 0.25,
    };
  }

  function resolveBackgroundMotionRegion(subjectRegion: MotionSampleRegion): MotionSampleRegion {
    const width = Math.min(0.4, Math.max(0.18, subjectRegion.width));
    const height = Math.min(0.4, Math.max(0.18, subjectRegion.height));
    const subjectCenterX = subjectRegion.x + subjectRegion.width / 2;
    const subjectCenterY = subjectRegion.y + subjectRegion.height / 2;
    return {
      height,
      source: "default-background",
      width,
      x: subjectCenterX < 0.5 ? 1 - width : 0,
      y: subjectCenterY < 0.5 ? 1 - height : 0,
    };
  }

  function serializeMotionRegion(region: MotionSampleRegion) {
    return {
      height: roundMetric(region.height),
      source: region.source,
      width: roundMetric(region.width),
      x: roundMetric(region.x),
      y: roundMetric(region.y),
    };
  }

  function buildMotionEnergyFilter(region: MotionSampleRegion) {
    const crop = [
      `iw*${roundMetric(region.width, 5)}`,
      `ih*${roundMetric(region.height, 5)}`,
      `iw*${roundMetric(region.x, 5)}`,
      `ih*${roundMetric(region.y, 5)}`,
    ].join(":");
    return [
      "fps=6",
      `crop=${crop}`,
      "scale=160:-2:flags=fast_bilinear",
      "format=gray",
      "tblend=all_mode=difference",
      "signalstats",
      "metadata=print:key=lavfi.signalstats.YAVG",
    ].join(",");
  }

  function parseMotionEnergySamples(stderr: string | null, timeScope: ProbeTimeScope | null) {
    const samples: MotionEnergySample[] = [];
    let pendingTimeSeconds: number | null = null;
    (stderr || "").split(/\r?\n/).forEach(function (line) {
      const timeMatch = line.match(/pts_time:([0-9.]+)/);
      if (timeMatch) {
        pendingTimeSeconds = asFiniteNumber(timeMatch[1]);
        return;
      }
      const energyMatch = line.match(/lavfi\.signalstats\.YAVG=([0-9.]+)/);
      if (!energyMatch) {
        return;
      }
      const rawEnergy = asFiniteNumber(energyMatch[1]);
      if (rawEnergy === null) {
        return;
      }
      samples.push({
        energy: rawEnergy / 255,
        timeSeconds: pendingTimeSeconds,
      });
    });

    const firstTimeSeconds =
      samples.find(function (entry) {
        return entry.timeSeconds !== null;
      })?.timeSeconds ?? null;
    const offsetSeconds = shouldOffsetScopedTimes(firstTimeSeconds, timeScope)
      ? timeScope?.startSeconds || 0
      : 0;
    return samples.map(function (sample) {
      return {
        ...sample,
        timeSeconds: sample.timeSeconds === null ? null : sample.timeSeconds + offsetSeconds,
      };
    });
  }

  function summarizeMotionEnergyRegion(
    label: "background" | "subject",
    region: MotionSampleRegion,
    samples: MotionEnergySample[]
  ) {
    const energies = samples.map(function (entry) {
      return entry.energy;
    });
    const activeFrameCount = energies.filter(function (value) {
      return value >= MOTION_ENERGY_ACTIVE_THRESHOLD;
    }).length;
    const lowMotionFrameCount = energies.filter(function (value) {
      return value <= MOTION_ENERGY_LOW_THRESHOLD;
    }).length;
    return {
      activeFrameCount,
      activeFrameRatio: roundMetric(safeRatio(activeFrameCount, energies.length)),
      averageMotionEnergy: roundMetric(average(energies), 5),
      label,
      lowMotionFrameCount,
      lowMotionFrameRatio: roundMetric(safeRatio(lowMotionFrameCount, energies.length)),
      medianMotionEnergy: roundMetric(median(energies), 5),
      peakMotionEnergy: roundMetric(energies.length > 0 ? Math.max(...energies) : null, 5),
      region: serializeMotionRegion(region),
      sampledFrameCount: samples.length,
      samples: samples.slice(0, 24).map(function (sample) {
        return {
          energy: roundMetric(sample.energy, 5),
          timeSeconds: roundMetric(sample.timeSeconds, 3),
        };
      }),
      status: "measured",
    };
  }

  function readMotionEnergy(summary: Record<string, unknown>, key: string) {
    return asFiniteNumber(toRecord(summary[key])["averageMotionEnergy"]);
  }

  function classifyOpticalFlowMotion(
    subjectSummary: Record<string, unknown>,
    backgroundSummary: Record<string, unknown>,
    activeThreshold = MOTION_ENERGY_ACTIVE_THRESHOLD,
    lowThreshold = MOTION_ENERGY_LOW_THRESHOLD
  ) {
    const subjectMotionEnergy = readMotionEnergy({ subject: subjectSummary }, "subject");
    const backgroundMotionEnergy = readMotionEnergy(
      { background: backgroundSummary },
      "background"
    );
    const sampledFrameCount = Math.min(
      asFiniteNumber(subjectSummary["sampledFrameCount"]) || 0,
      asFiniteNumber(backgroundSummary["sampledFrameCount"]) || 0
    );
    const ratio =
      subjectMotionEnergy === null || backgroundMotionEnergy === null
        ? null
        : subjectMotionEnergy / Math.max(backgroundMotionEnergy, 0.0001);
    const subjectActive = subjectMotionEnergy !== null && subjectMotionEnergy >= activeThreshold;
    const backgroundActive =
      backgroundMotionEnergy !== null && backgroundMotionEnergy >= activeThreshold;
    const backgroundQuiet =
      backgroundMotionEnergy !== null && backgroundMotionEnergy <= lowThreshold * 1.8;
    let movementClass = "insufficient_motion_samples";
    let confidence = "low";
    const reasons: string[] = [];

    if (sampledFrameCount >= 2 && subjectMotionEnergy !== null && backgroundMotionEnergy !== null) {
      if (subjectActive && backgroundQuiet && (ratio === null || ratio >= 1.8)) {
        movementClass = "localized_subject_motion";
        confidence = sampledFrameCount >= 5 && ratio !== null && ratio >= 2.5 ? "medium" : "low";
        reasons.push("subject/ROI motion energy exceeds the background sample");
      } else if (subjectActive && backgroundActive) {
        movementClass = "global_motion_or_camera_shift";
        confidence = sampledFrameCount >= 5 ? "medium" : "low";
        reasons.push("subject and background samples both carry motion energy");
      } else if (!subjectActive && backgroundActive) {
        movementClass = "background_or_camera_motion";
        confidence = sampledFrameCount >= 5 ? "medium" : "low";
        reasons.push("background sample carries more motion than the subject/ROI sample");
      } else if (!subjectActive && !backgroundActive) {
        movementClass = "low_motion_baseline";
        confidence = sampledFrameCount >= 5 ? "medium" : "low";
        reasons.push("subject and background motion energy remain low");
      } else {
        movementClass = "mixed_motion_energy";
        reasons.push("motion energy is present without a strong spatial split");
      }
    }

    return {
      backgroundMotionEnergy: roundMetric(backgroundMotionEnergy, 5),
      confidence,
      movementClass,
      reasons,
      sampledFrameCount,
      status: sampledFrameCount >= 2 ? "measured" : "unavailable",
      subjectBackgroundMotionRatio: roundMetric(ratio, 3),
      subjectMotionEnergy: roundMetric(subjectMotionEnergy, 5),
    };
  }

  async function runMotionEnergyRegionProbe(
    runtime: Record<string, unknown>,
    project: Record<string, unknown>,
    requestId: string,
    jobId: string,
    targetPath: string,
    timeScope: ProbeTimeScope | null,
    timeoutMs: number,
    region: MotionSampleRegion
  ) {
    const projectPathRuntime = toProjectPathRuntime(runtime);
    const projectSlugRecord = toProjectSlugRecord(project);
    const stderr = readProfileToolStderr(
      await runProfileTool(runtime, {
        requestId,
        jobId,
        toolId: "ffmpeg",
        cwd: getProjectProfileDir(projectPathRuntime, projectSlugRecord),
        args: [
          ...buildScopedInputArgs(targetPath, timeScope),
          "-vf",
          buildMotionEnergyFilter(region),
          "-an",
          "-f",
          "null",
          "-",
        ],
        timeoutMs,
      })
    );
    return parseMotionEnergySamples(stderr, timeScope);
  }

  async function runOpenCvOpticalFlowProbe(
    runtime: Record<string, unknown>,
    requestId: string,
    jobId: string,
    targetPath: string,
    subjectRegion: MotionSampleRegion,
    backgroundRegion: MotionSampleRegion,
    options: StructureProbeOptions,
    timeScope: ProbeTimeScope | null,
    settings: Record<string, unknown>
  ) {
    try {
      const result = await runVisualForensicsPyProbe(
        runtime,
        requestId,
        jobId,
        "flow",
        targetPath,
        {
          ...buildVisualProbeTimeOptions(timeScope),
          ...(readSettingBoolean(settings, "roiOnly", false)
            ? buildAnalysisScopeRoiOptions(options)
            : {}),
          backgroundRegion: serializeMotionRegion(backgroundRegion),
          cameraCompensation: readSettingString(settings, "cameraCompensation", "light"),
          flowEngine: readSettingString(settings, "flowEngine", "farneback"),
          frameStep:
            readSettingString(settings, "flowEngine", "farneback") === "raft-planned" ? 8 : 6,
          motionThreshold: readSettingNumber(settings, "motionThreshold", 0.18),
          planeSplit: readSettingString(settings, "planeSplit", "auto"),
          subjectRegion: serializeMotionRegion(subjectRegion),
        },
        VISUAL_FORENSICS_PY_TIMEOUT_MS
      );
      return asNonEmptyString(result["status"]) === "measured"
        ? {
            ...result,
            engineRequested: readSettingString(settings, "flowEngine", "farneback"),
          }
        : result;
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        reason:
          "OpenCV Farneback optical flow was not available; FFmpeg motion-energy fallback may run.",
        sampledFrameCount: 0,
        status: "unavailable",
      };
    }
  }

  async function runOpticalFlowProbe(
    runtime: Record<string, unknown>,
    project: Record<string, unknown>,
    requestId: string,
    jobId: string,
    targetPath: string,
    target: Record<string, unknown>,
    options: StructureProbeOptions,
    timeScope: ProbeTimeScope | null,
    timeoutMs: number,
    settings: Record<string, unknown>
  ) {
    const subjectRegion = resolveSubjectMotionRegion(target, options, settings);
    const backgroundRegion = resolveBackgroundMotionRegion(subjectRegion);
    const flowEngine = readSettingString(settings, "flowEngine", "farneback");
    if (flowEngine === "farneback" || flowEngine === "raft-planned") {
      const openCvProbe = await runOpenCvOpticalFlowProbe(
        runtime,
        requestId,
        jobId,
        targetPath,
        subjectRegion,
        backgroundRegion,
        options,
        timeScope,
        settings
      );
      if (asNonEmptyString(openCvProbe["status"]) === "measured") {
        return openCvProbe;
      }
    }

    try {
      const subjectSamples = await runMotionEnergyRegionProbe(
        runtime,
        project,
        requestId,
        jobId,
        targetPath,
        timeScope,
        timeoutMs,
        subjectRegion
      );
      const backgroundSamples = await runMotionEnergyRegionProbe(
        runtime,
        project,
        requestId,
        jobId,
        targetPath,
        timeScope,
        timeoutMs,
        backgroundRegion
      );
      const subject = summarizeMotionEnergyRegion("subject", subjectRegion, subjectSamples);
      const background = summarizeMotionEnergyRegion(
        "background",
        backgroundRegion,
        backgroundSamples
      );
      const fallbackThreshold = Math.max(
        MOTION_ENERGY_ACTIVE_THRESHOLD,
        readSettingNumber(settings, "motionThreshold", 0.18) / 10
      );
      return {
        ...classifyOpticalFlowMotion(
          subject,
          background,
          fallbackThreshold,
          Math.max(MOTION_ENERGY_LOW_THRESHOLD, fallbackThreshold / 3)
        ),
        background,
        engineRequested: flowEngine,
        method: "ffmpeg-frame-difference-motion-energy",
        motionThreshold: fallbackThreshold,
        opticalFlowProxy: true,
        plannedEngine: flowEngine === "raft-planned" ? "raft-optical-flow" : null,
        subject,
      };
    } catch (error) {
      return {
        background: {
          region: serializeMotionRegion(backgroundRegion),
          sampledFrameCount: 0,
          status: "unavailable",
        },
        error: error instanceof Error ? error.message : String(error),
        method: "ffmpeg-frame-difference-motion-energy",
        opticalFlowProxy: true,
        sampledFrameCount: 0,
        status: "unavailable",
        subject: {
          region: serializeMotionRegion(subjectRegion),
          sampledFrameCount: 0,
          status: "unavailable",
        },
      };
    }
  }

  async function runFrameMetadataProbe(
    runtime: Record<string, unknown>,
    project: Record<string, unknown>,
    requestId: string,
    jobId: string,
    targetPath: string,
    target: Record<string, unknown>,
    timeScope: ProbeTimeScope | null,
    timeoutMs: number,
    settings: Record<string, unknown>
  ) {
    const projectPathRuntime = toProjectPathRuntime(runtime);
    const projectSlugRecord = toProjectSlugRecord(project);
    try {
      const stdout = readProfileToolStdout(
        await runFfprobeTool(runtime, {
          requestId,
          jobId,
          cwd: getProjectProfileDir(projectPathRuntime, projectSlugRecord),
          args: [
            "-v",
            "error",
            ...buildFfprobeScopedArgs(timeScope),
            "-select_streams",
            "v:0",
            "-show_entries",
            "frame=best_effort_timestamp_time,pkt_pts_time,pts_time,pkt_duration_time,pkt_size,key_frame,pict_type",
            "-of",
            "json",
            targetPath,
          ],
          timeoutMs,
        })
      );
      const entries = parseFrameMetadataEntries(stdout, timeScope);
      const cadence = summarizeFrameCadence(entries);
      return {
        compressionSignature: summarizeCompressionSignature(target, entries, cadence, settings),
        frameCadence: cadence,
        gopStructure: summarizeGopStructure(entries),
      };
    } catch (error) {
      const unavailable = {
        error: error instanceof Error ? error.message : String(error),
        sampledFrameCount: 0,
        status: "unavailable",
      };
      return {
        compressionSignature: unavailable,
        frameCadence: unavailable,
        gopStructure: unavailable,
      };
    }
  }

  function readSegments(summary: unknown) {
    return Array.isArray(toRecord(summary)["segments"])
      ? (toRecord(summary)["segments"] as unknown[]).map(toRecord)
      : [];
  }

  function segmentsOverlap(left: Record<string, unknown>, right: Record<string, unknown>) {
    const leftStart = asFiniteNumber(left["startSeconds"]);
    const leftEnd = asFiniteNumber(left["endSeconds"]);
    const rightStart = asFiniteNumber(right["startSeconds"]);
    const rightEnd = asFiniteNumber(right["endSeconds"]);
    if (leftStart === null || leftEnd === null || rightStart === null || rightEnd === null) {
      return false;
    }
    return leftStart <= rightEnd && rightStart <= leftEnd;
  }

  function countFreezeDuplicateOverlaps(freezeSummary: unknown, duplicateFrame: unknown) {
    const freezeSegments = readSegments(freezeSummary);
    const duplicateSegments = readSegments(duplicateFrame);
    return freezeSegments.filter(function (freezeSegment) {
      return duplicateSegments.some(function (duplicateSegment) {
        return segmentsOverlap(freezeSegment, duplicateSegment);
      });
    }).length;
  }

  function countFreezeGopBoundaryOverlaps(freezeSummary: unknown, gopStructure: unknown) {
    const freezeSegments = readSegments(freezeSummary);
    const keyFrameTimes = Array.isArray(toRecord(gopStructure)["keyFrameTimes"])
      ? (toRecord(gopStructure)["keyFrameTimes"] as unknown[])
          .map(asFiniteNumber)
          .filter((entry): entry is number => entry !== null)
      : [];
    return freezeSegments.filter(function (freezeSegment) {
      const startSeconds = asFiniteNumber(freezeSegment["startSeconds"]);
      const endSeconds = asFiniteNumber(freezeSegment["endSeconds"]);
      if (startSeconds === null && endSeconds === null) {
        return false;
      }
      return keyFrameTimes.some(function (keyFrameTime) {
        return (
          (startSeconds !== null && Math.abs(keyFrameTime - startSeconds) <= 0.35) ||
          (endSeconds !== null && Math.abs(keyFrameTime - endSeconds) <= 0.35)
        );
      });
    }).length;
  }

  function buildFreezeAttribution(
    freezeSummary: unknown,
    duplicateFrame: unknown,
    frameCadence: unknown,
    compressionSignature: unknown,
    gopStructure: unknown,
    opticalFlow: unknown
  ) {
    const freezeCount = asFiniteNumber(toRecord(freezeSummary)["count"]) || 0;
    const duplicateFrameRecord = toRecord(duplicateFrame);
    const frameCadenceRecord = toRecord(frameCadence);
    const compressionRecord = toRecord(compressionSignature);
    const duplicateCount = asFiniteNumber(duplicateFrameRecord["exactDuplicateFrameCount"]) || 0;
    const duplicateRatio = asFiniteNumber(duplicateFrameRecord["exactDuplicateFrameRatio"]) || 0;
    const cadenceDriftRatio = asFiniteNumber(frameCadenceRecord["cadenceDriftRatio"]) || 0;
    const compressionRiskLevel = asNonEmptyString(compressionRecord["riskLevel"]) || "low";
    const opticalFlowRecord = toRecord(opticalFlow);
    const opticalFlowClass = asNonEmptyString(opticalFlowRecord["movementClass"]);
    const duplicateOverlapCount = countFreezeDuplicateOverlaps(freezeSummary, duplicateFrame);
    const gopBoundaryOverlapCount = countFreezeGopBoundaryOverlaps(freezeSummary, gopStructure);
    const reasons: string[] = [];
    let classification = "baseline";
    let confidence = "low";

    if (freezeCount > 0 && (duplicateOverlapCount > 0 || duplicateRatio >= 0.35)) {
      classification = "transport_duplicate";
      confidence =
        duplicateOverlapCount >= Math.max(1, Math.ceil(freezeCount / 2)) ? "high" : "medium";
      reasons.push("freeze interval overlaps repeated decoded-frame hashes");
    } else if (freezeCount > 0 && opticalFlowClass === "localized_subject_motion") {
      classification = "localized_motion_during_background_freeze";
      confidence = asNonEmptyString(opticalFlowRecord["confidence"]) || "low";
      reasons.push("subject/ROI motion separates from a quieter background sample");
    } else if (freezeCount > 0 && opticalFlowClass === "background_or_camera_motion") {
      classification = "background_motion_with_subject_stall";
      confidence = asNonEmptyString(opticalFlowRecord["confidence"]) || "low";
      reasons.push("background motion energy exceeds the subject/ROI sample");
    } else if (freezeCount > 0 && cadenceDriftRatio >= 0.18) {
      classification = "cadence_drift";
      confidence = "medium";
      reasons.push("frame interval cadence drift is elevated");
    } else if (
      freezeCount > 0 &&
      (compressionRiskLevel === "high" || compressionRiskLevel === "medium")
    ) {
      classification = "compression_artifact_possible";
      confidence = compressionRiskLevel === "high" ? "medium" : "low";
      reasons.push("compression signature is elevated around the sampled window");
    } else if (freezeCount > 0) {
      classification = "content_or_stream_freeze_uncertain";
      confidence = "low";
      reasons.push("freezedetect reported intervals without a measured duplicate-frame cause");
    } else if (duplicateCount > 0) {
      classification = "duplicate_without_freezedetect";
      confidence = duplicateRatio >= 0.15 ? "medium" : "low";
      reasons.push("decoded duplicate frames were measured below the freeze-duration threshold");
    } else if (compressionRiskLevel === "high") {
      classification = "compression_risk_baseline";
      confidence = "low";
      reasons.push("compression signature is elevated without a freeze interval");
    }

    if (gopBoundaryOverlapCount > 0) {
      reasons.push("freeze boundary is near a keyframe/GOP boundary");
    }
    if (opticalFlowClass !== null && opticalFlowClass !== "insufficient_motion_samples") {
      reasons.push(`motion energy split: ${opticalFlowClass}`);
    }

    return {
      cadenceDriftRatio: roundMetric(cadenceDriftRatio),
      classification,
      compressionRiskLevel,
      confidence,
      duplicateFrameRatio: roundMetric(duplicateRatio),
      duplicateOverlapCount,
      freezeCount,
      gopBoundaryOverlapCount,
      opticalFlowClass,
      opticalFlowConfidence: asNonEmptyString(opticalFlowRecord["confidence"]),
      subjectBackgroundMotionRatio: roundMetric(
        asFiniteNumber(opticalFlowRecord["subjectBackgroundMotionRatio"]),
        3
      ),
      reasons,
    };
  }

  function resolveOpenSmileProsodyRuntime(runtime: Record<string, unknown>) {
    const packageToolsRuntime = toPackageToolsRuntime(runtime);
    const configDir = getAudioAnalysisOpenSmileConfigDir(packageToolsRuntime);
    const configPath = getAudioAnalysisOpenSmileConfigPath(packageToolsRuntime, "prosodyAcf.conf");
    if (configDir === null || configPath === null) {
      return null;
    }
    return {
      configDir: configDir,
      configPath: configPath,
    };
  }

  function buildUnavailableVideoForensicsProbe(
    reason: string,
    requiredToolIds: string[] = []
  ): Record<string, unknown> {
    return {
      reason,
      requiredToolIds,
      sampledFrameCount: 0,
      status: "unavailable",
    };
  }

  function normalizeMetadataNumber(value: unknown) {
    const numericValue = asFiniteNumber(value);
    return numericValue === null ? null : Number(numericValue.toFixed(3));
  }

  function readFfprobeRational(value: unknown) {
    const text = asNonEmptyString(value);
    if (text === null) {
      return null;
    }
    const parts = text.split("/").map(asFiniteNumber);
    const numerator = parts[0] ?? null;
    const denominator = parts[1] ?? null;
    return numerator !== null && denominator !== null && denominator > 0
      ? Number((numerator / denominator).toFixed(3))
      : null;
  }

  function extractFfprobeMetadata(payload: Record<string, unknown>) {
    const format = toRecord(payload["format"]);
    const streams = Array.isArray(payload["streams"]) ? payload["streams"].map(toRecord) : [];
    const videoStream =
      streams.find(function (stream) {
        return asNonEmptyString(stream["codec_type"]) === "video";
      }) || {};
    return {
      codec: asNonEmptyString(videoStream["codec_name"]),
      container: asNonEmptyString(format["format_name"]),
      creationTime:
        asNonEmptyString(toRecord(format["tags"])["creation_time"]) ||
        asNonEmptyString(toRecord(videoStream["tags"])["creation_time"]),
      durationSeconds:
        normalizeMetadataNumber(format["duration"]) ||
        normalizeMetadataNumber(videoStream["duration"]),
      fps: readFfprobeRational(videoStream["avg_frame_rate"]),
      height: normalizeMetadataNumber(videoStream["height"]),
      width: normalizeMetadataNumber(videoStream["width"]),
    };
  }

  function extractExifToolMetadata(payload: unknown[]) {
    const firstRecord = toRecord(payload[0]);
    return {
      codec:
        asNonEmptyString(firstRecord["CompressorName"]) || asNonEmptyString(firstRecord["CodecID"]),
      container:
        asNonEmptyString(firstRecord["FileType"]) || asNonEmptyString(firstRecord["MIMEType"]),
      creationTime:
        asNonEmptyString(firstRecord["CreateDate"]) ||
        asNonEmptyString(firstRecord["MediaCreateDate"]) ||
        asNonEmptyString(firstRecord["TrackCreateDate"]),
      durationSeconds: normalizeMetadataNumber(firstRecord["Duration"]),
      fps: normalizeMetadataNumber(firstRecord["VideoFrameRate"]),
      height:
        normalizeMetadataNumber(firstRecord["ImageHeight"]) ||
        normalizeMetadataNumber(firstRecord["SourceImageHeight"]),
      width:
        normalizeMetadataNumber(firstRecord["ImageWidth"]) ||
        normalizeMetadataNumber(firstRecord["SourceImageWidth"]),
    };
  }

  function getMediaInfoTrack(payload: Record<string, unknown>, kind: string) {
    const media = toRecord(payload["media"]);
    const tracks = Array.isArray(media["track"]) ? media["track"].map(toRecord) : [];
    return (
      tracks.find(function (track) {
        return asNonEmptyString(track["@type"]) === kind;
      }) || {}
    );
  }

  function extractMediaInfoMetadata(payload: Record<string, unknown>) {
    const general = getMediaInfoTrack(payload, "General");
    const video = getMediaInfoTrack(payload, "Video");
    const durationValue =
      normalizeMetadataNumber(video["Duration"]) || normalizeMetadataNumber(general["Duration"]);
    return {
      codec: asNonEmptyString(video["Format"]) || asNonEmptyString(video["CodecID"]),
      container: asNonEmptyString(general["Format"]),
      creationTime:
        asNonEmptyString(general["Encoded_Date"]) || asNonEmptyString(video["Encoded_Date"]),
      durationSeconds:
        durationValue !== null && durationValue > 1000
          ? Number((durationValue / 1000).toFixed(3))
          : durationValue,
      fps: normalizeMetadataNumber(video["FrameRate"]),
      height: normalizeMetadataNumber(video["Height"]),
      width: normalizeMetadataNumber(video["Width"]),
    };
  }

  function buildMetadataMismatches(sources: Record<string, Record<string, unknown>>) {
    const measuredSources = Object.entries(sources).filter(function ([, source]) {
      return asNonEmptyString(source["status"]) === "measured";
    });
    const baseline = toRecord(measuredSources[0]?.[1]["normalized"]);
    if (measuredSources.length <= 1 || Object.keys(baseline).length === 0) {
      return [];
    }
    const mismatches: Record<string, unknown>[] = [];
    ["width", "height", "durationSeconds", "codec", "container"].forEach(function (field) {
      const baselineValue = baseline[field];
      measuredSources.slice(1).forEach(function ([sourceId, source]) {
        const nextValue = toRecord(source["normalized"])[field];
        if (
          baselineValue === null ||
          baselineValue === undefined ||
          nextValue === null ||
          nextValue === undefined
        ) {
          return;
        }
        const bothNumeric = typeof baselineValue === "number" && typeof nextValue === "number";
        const mismatch = bothNumeric
          ? Math.abs(baselineValue - nextValue) > (field === "durationSeconds" ? 1 : 0.5)
          : String(baselineValue).toLowerCase() !== String(nextValue).toLowerCase();
        if (mismatch) {
          mismatches.push({
            baseline: baselineValue,
            field,
            source: sourceId,
            value: nextValue,
          });
        }
      });
    });
    return mismatches.slice(0, 12);
  }

  async function runMetadataProvenanceProbe(
    runtime: Record<string, unknown>,
    project: Record<string, unknown>,
    requestId: string,
    jobId: string,
    targetPath: string,
    settings: Record<string, unknown>
  ) {
    const projectPathRuntime = toProjectPathRuntime(runtime);
    const projectSlugRecord = toProjectSlugRecord(project);
    const cwd = getProjectProfileDir(projectPathRuntime, projectSlugRecord);
    const sources: Record<string, Record<string, unknown>> = {};

    try {
      const ffprobeStdout = readProfileToolStdout(
        await runFfprobeTool(runtime, {
          requestId,
          jobId,
          cwd,
          args: [
            "-v",
            "error",
            "-show_format",
            "-show_streams",
            "-show_chapters",
            "-of",
            "json",
            targetPath,
          ],
          timeoutMs: METADATA_PROVENANCE_TIMEOUT_MS,
        })
      );
      const payload = parseJsonRecord(ffprobeStdout);
      const normalized = extractFfprobeMetadata(payload);
      sources["ffprobe"] = {
        normalized,
        status: Object.values(normalized).some((entry) => entry !== null)
          ? "measured"
          : "unavailable",
      };
    } catch (error) {
      sources["ffprobe"] = {
        error: error instanceof Error ? error.message : String(error),
        status: "unavailable",
      };
    }

    try {
      const exifStdout = readProfileToolStdout(
        await runProfileTool(runtime, {
          requestId,
          jobId,
          toolId: "exiftool",
          cwd,
          args: ["-json", "-n", targetPath],
          timeoutMs: METADATA_PROVENANCE_TIMEOUT_MS,
        })
      );
      const payload = parseJsonArray(exifStdout);
      const normalized = extractExifToolMetadata(payload);
      sources["exiftool"] = {
        normalized,
        status: Object.values(normalized).some((entry) => entry !== null)
          ? "measured"
          : "unavailable",
      };
    } catch (error) {
      sources["exiftool"] = {
        error: error instanceof Error ? error.message : String(error),
        status: "unavailable",
      };
    }

    try {
      const mediaInfoStdout = readProfileToolStdout(
        await runProfileTool(runtime, {
          requestId,
          jobId,
          toolId: "mediainfo",
          cwd,
          args: ["--Output=JSON", targetPath],
          timeoutMs: METADATA_PROVENANCE_TIMEOUT_MS,
        })
      );
      const payload = parseJsonRecord(mediaInfoStdout);
      const normalized = extractMediaInfoMetadata(payload);
      sources["mediainfo"] = {
        normalized,
        status: Object.values(normalized).some((entry) => entry !== null)
          ? "measured"
          : "unavailable",
      };
    } catch (error) {
      sources["mediainfo"] = {
        error: error instanceof Error ? error.message : String(error),
        status: "unavailable",
      };
    }

    const measuredSourceIds = Object.entries(sources)
      .filter(function ([, source]) {
        return asNonEmptyString(source["status"]) === "measured";
      })
      .map(function ([sourceId]) {
        return sourceId;
      });
    const missingToolIds = [
      asNonEmptyString(sources["exiftool"]["status"]) === "measured" ? null : "exiftool",
      asNonEmptyString(sources["mediainfo"]["status"]) === "measured" ? null : "mediainfo",
    ].filter((entry): entry is string => entry !== null);
    const mismatches = buildMetadataMismatches(sources);
    return measuredSourceIds.length === 0
      ? buildUnavailableVideoForensicsProbe(
          "ffprobe, ExifTool, and MediaInfo metadata sources were not available.",
          ["ffmpeg", "exiftool", "mediainfo"]
        )
      : {
          coverage:
            measuredSourceIds.length >= 2
              ? "cross-checked"
              : measuredSourceIds[0] === "ffprobe"
                ? "ffprobe-only"
                : "external-tool-only",
          measuredSourceCount: measuredSourceIds.length,
          measuredSourceIds,
          metadataDepth: readSettingString(settings, "metadataDepth", "overview"),
          mismatchCount: mismatches.length,
          mismatches,
          missingToolIds,
          platformFingerprint: readSettingString(settings, "platformFingerprint", "light"),
          sampledFrameCount: 1,
          sources,
          status: "measured",
          timelineCrosscheck: readSettingBoolean(settings, "timelineCrosscheck", true),
        };
  }

  function getReferenceTargetPath(options: StructureProbeOptions) {
    const referenceTarget = toRecord(options.referenceTarget);
    return (
      asNonEmptyString(referenceTarget["localPath"]) || asNonEmptyString(referenceTarget["path"])
    );
  }

  async function runVisualReferenceQualityProbe(
    runtime: Record<string, unknown>,
    requestId: string,
    jobId: string,
    targetPath: string,
    referencePath: string,
    settings: Record<string, unknown>
  ) {
    try {
      return await runVisualForensicsPyProbe(runtime, requestId, jobId, "reference", targetPath, {
        metricSet: readSettingString(settings, "metricSet", "ssim-vmaf"),
        minDelta: readSettingNumber(settings, "minDelta", 0.05),
        referencePath,
        referenceSource: readSettingString(settings, "referenceSource", "pre-upload"),
        scale: readSettingString(settings, "scale", "source"),
      });
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        reason: "OpenCV/scikit-image reference quality pass was not available.",
        sampledFrameCount: 0,
        status: "unavailable",
      };
    }
  }

  function parseVmafScore(output: string | null) {
    const match = (output || "").match(/VMAF score:\s*([0-9.]+)/i);
    const score = asFiniteNumber(match?.[1]);
    return score === null ? null : score;
  }

  async function runVmafReferenceQualityProbe(
    runtime: Record<string, unknown>,
    project: Record<string, unknown>,
    requestId: string,
    jobId: string,
    targetPath: string,
    referencePath: string,
    timeScope: ProbeTimeScope | null
  ) {
    const projectPathRuntime = toProjectPathRuntime(runtime);
    const projectSlugRecord = toProjectSlugRecord(project);
    try {
      const result = await runProfileTool(runtime, {
        requestId,
        jobId,
        toolId: "ffmpeg-libvmaf",
        cwd: getProjectProfileDir(projectPathRuntime, projectSlugRecord),
        args: [
          "-hide_banner",
          ...(timeScope === null
            ? []
            : [
                "-ss",
                formatFfmpegSeconds(timeScope.startSeconds),
                "-t",
                formatFfmpegSeconds(timeScope.durationSeconds),
              ]),
          "-i",
          targetPath,
          ...(timeScope === null
            ? []
            : [
                "-ss",
                formatFfmpegSeconds(timeScope.startSeconds),
                "-t",
                formatFfmpegSeconds(timeScope.durationSeconds),
              ]),
          "-i",
          referencePath,
          "-lavfi",
          "libvmaf",
          "-f",
          "null",
          "-",
        ],
        timeoutMs: VISUAL_FORENSICS_PY_TIMEOUT_MS,
      });
      const score = parseVmafScore(
        [readProfileToolStdout(result), readProfileToolStderr(result)].filter(Boolean).join("\n")
      );
      return score === null
        ? {
            reason: "FFmpeg libvmaf ran but did not emit a parseable VMAF score.",
            sampledFrameCount: 0,
            status: "unavailable",
          }
        : {
            method: "ffmpeg-libvmaf",
            sampledFrameCount: 1,
            status: "measured",
            vmafScore: score,
          };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
        reason: "FFmpeg libvmaf filter was not available for the active reference comparison.",
        sampledFrameCount: 0,
        status: "unavailable",
      };
    }
  }

  async function runReferenceQualityProbe(
    runtime: Record<string, unknown>,
    project: Record<string, unknown>,
    requestId: string,
    jobId: string,
    targetPath: string,
    options: StructureProbeOptions,
    timeScope: ProbeTimeScope | null,
    settings: Record<string, unknown>
  ) {
    const referencePath = getReferenceTargetPath(options);
    if (referencePath === null) {
      return buildUnavailableVideoForensicsProbe(
        "Reference/pre-upload source was not provided for SSIM/VMAF quality comparison.",
        ["visual-forensics-py", "ffmpeg-libvmaf"]
      );
    }
    const metricSet = readSettingString(settings, "metricSet", "ssim-vmaf");
    const visualProbe =
      metricSet === "vmaf"
        ? buildUnavailableVideoForensicsProbe(
            "SSIM was skipped because the selected metric set is VMAF-only.",
            ["visual-forensics-py"]
          )
        : await runVisualReferenceQualityProbe(
            runtime,
            requestId,
            jobId,
            targetPath,
            referencePath,
            settings
          );
    const vmafProbe =
      metricSet === "ssim"
        ? buildUnavailableVideoForensicsProbe(
            "VMAF was skipped because the selected metric set is SSIM-only.",
            ["ffmpeg-libvmaf"]
          )
        : await runVmafReferenceQualityProbe(
            runtime,
            project,
            requestId,
            jobId,
            targetPath,
            referencePath,
            timeScope
          );
    const measured = [
      asNonEmptyString(visualProbe["status"]) === "measured" ? "ssim" : null,
      asNonEmptyString(vmafProbe["status"]) === "measured" ? "vmaf" : null,
    ].filter((entry): entry is string => entry !== null);
    if (measured.length === 0) {
      return {
        metricSet,
        reason:
          asNonEmptyString(visualProbe["reason"]) ||
          asNonEmptyString(vmafProbe["reason"]) ||
          "Reference quality comparison could not be measured.",
        referencePath,
        requiredToolIds: ["visual-forensics-py", "ffmpeg-libvmaf"],
        sampledFrameCount: 0,
        ssim: asFiniteNumber(visualProbe["ssim"]),
        status: "unavailable",
        toolResults: {
          ssim: visualProbe,
          vmaf: vmafProbe,
        },
        vmafScore: asFiniteNumber(vmafProbe["vmafScore"]),
      };
    }
    const ssim = asFiniteNumber(visualProbe["ssim"]);
    const qualityDelta = asFiniteNumber(visualProbe["qualityDelta"]);
    const vmafScore = asFiniteNumber(vmafProbe["vmafScore"]);
    return {
      measuredMetrics: measured,
      metricSet,
      minDelta: readSettingNumber(settings, "minDelta", 0.05),
      qualityDelta,
      referencePath,
      sampledFrameCount: Math.max(
        asFiniteNumber(visualProbe["sampledFrameCount"]) || 0,
        asFiniteNumber(vmafProbe["sampledFrameCount"]) || 0
      ),
      ssim,
      status: "measured",
      toolResults: {
        ssim: visualProbe,
        vmaf: vmafProbe,
      },
      vmafScore,
    };
  }

  async function runOpenSmileProsodyExtraction(
    runtime: Record<string, unknown>,
    _project: Record<string, unknown>,
    requestId: string,
    jobId: string,
    target: Record<string, unknown>,
    artifactBase: string,
    moduleOutputDir: string,
    outputLabel: string
  ) {
    const openSmileRuntime = resolveOpenSmileProsodyRuntime(runtime);
    if (openSmileRuntime === null) {
      throw new Error("Room-local openSMILE config package is unavailable on this runtime.");
    }

    const contourPath = `${moduleOutputDir}/${artifactBase}-${outputLabel}.csv`;
    await runProfileTool(runtime, {
      requestId: requestId,
      jobId: jobId,
      toolId: "opensmile",
      cwd: openSmileRuntime.configDir,
      args: [
        "-C",
        openSmileRuntime.configPath,
        "-I",
        readTargetPath(target),
        "-csvoutput",
        contourPath,
        "-appendcsv",
        "0",
        "-nologfile",
        "1",
      ],
      timeoutMs: 3 * 60 * 1000,
    });

    const contourCsv = await readTextFile(contourPath);
    const contourCsvText = asNonEmptyString(contourCsv);
    if (contourCsvText === null) {
      throw new Error("openSMILE did not produce a prosody contour CSV.");
    }

    return {
      contourCsv: contourCsvText,
      contourPath: contourPath,
      prosodySummary: buildProsodySummaryFromCsv(contourCsvText),
    };
  }

  async function runVideoStructureProbe(
    runtime: Record<string, unknown>,
    project: Record<string, unknown>,
    requestId: string,
    jobId: string,
    target: Record<string, unknown>,
    options: StructureProbeOptions = {}
  ) {
    const projectPathRuntime = toProjectPathRuntime(runtime);
    const projectSlugRecord = toProjectSlugRecord(project);
    const targetPath = readTargetPath(target);
    const timeScope = resolveProbeTimeScope(target, options);
    const timeoutMs = resolveStructureProbeTimeoutMs(target, timeScope);
    const sourceKind = readSourceKind(options);
    const duplicateSettings = getModuleProbeSettings(options, "perceptual-duplicate-frame");
    const opticalFlowSettings = getModuleProbeSettings(options, "optical-flow-tracking");
    const compressionSettings = getModuleProbeSettings(options, "compression-signature-mapping");
    const metadataSettings = getModuleProbeSettings(options, "metadata-provenance-audit");
    const referenceQualitySettings = getModuleProbeSettings(options, "reference-quality-check");
    const structureDetectionStderr =
      sourceKind === "video"
        ? readProfileToolStderr(
            await runProfileTool(runtime, {
              requestId: requestId,
              jobId: jobId,
              toolId: "ffmpeg",
              cwd: getProjectProfileDir(projectPathRuntime, projectSlugRecord),
              args: [
                ...buildScopedInputArgs(targetPath, timeScope),
                "-vf",
                "blackdetect=d=0.25:pix_th=0.10,freezedetect=n=-40dB:d=0.4",
                "-an",
                "-f",
                "null",
                "-",
              ],
              timeoutMs,
            })
          )
        : null;
    const black =
      sourceKind === "video"
        ? offsetDetectionLogSummary(parseBlackDetectLog(structureDetectionStderr), timeScope)
        : {
            count: 0,
            reason: "Black-frame interval detection applies only to video sources.",
            segments: [],
            status: "unavailable",
          };
    const freeze =
      sourceKind === "video"
        ? offsetDetectionLogSummary(parseFreezeDetectLog(structureDetectionStderr), timeScope)
        : {
            count: 0,
            reason: "Freeze interval detection applies only to video sources.",
            segments: [],
            status: "unavailable",
          };
    const duplicateFrame =
      sourceKind === "video"
        ? await runDuplicateFrameProbe(
            runtime,
            project,
            requestId,
            jobId,
            targetPath,
            timeScope,
            timeoutMs,
            options,
            duplicateSettings
          )
        : buildUnavailableVideoForensicsProbe(
            "Perceptual duplicate-frame analysis applies only to video frame sequences.",
            ["ffmpeg", "visual-forensics-py"]
          );
    const frameMetadata =
      sourceKind === "video"
        ? await runFrameMetadataProbe(
            runtime,
            project,
            requestId,
            jobId,
            targetPath,
            target,
            timeScope,
            timeoutMs,
            compressionSettings
          )
        : {
            compressionSignature: buildUnavailableVideoForensicsProbe(
              "Compression signature mapping applies only to video frame/packet sequences.",
              ["ffmpeg"]
            ),
            frameCadence: buildUnavailableVideoForensicsProbe(
              "Frame cadence analysis applies only to video frame sequences.",
              ["ffmpeg"]
            ),
            gopStructure: buildUnavailableVideoForensicsProbe(
              "GOP structure analysis applies only to video sources.",
              ["ffmpeg"]
            ),
          };
    const opticalFlow =
      sourceKind === "video"
        ? await runOpticalFlowProbe(
            runtime,
            project,
            requestId,
            jobId,
            targetPath,
            target,
            options,
            timeScope,
            timeoutMs,
            opticalFlowSettings
          )
        : buildUnavailableVideoForensicsProbe(
            "Subject/background optical-flow tracking applies only to video sources.",
            ["visual-forensics-py", "ffmpeg"]
          );
    const metadataProvenance = await runMetadataProvenanceProbe(
      runtime,
      project,
      requestId,
      jobId,
      targetPath,
      metadataSettings
    );
    const referenceQuality = await runReferenceQualityProbe(
      runtime,
      project,
      requestId,
      jobId,
      targetPath,
      options,
      timeScope,
      referenceQualitySettings
    );
    const freezeAttribution = buildFreezeAttribution(
      freeze,
      duplicateFrame,
      frameMetadata.frameCadence,
      frameMetadata.compressionSignature,
      frameMetadata.gopStructure,
      opticalFlow
    );
    const forensicSignature = buildForensicSignatureMapping({
      black,
      compressionSignature: frameMetadata.compressionSignature,
      duplicateFrame,
      frameCadence: frameMetadata.frameCadence,
      freeze,
      freezeAttribution,
      gopStructure: frameMetadata.gopStructure,
      metadataProvenance,
      nearDuplicateFrame: duplicateFrame,
      opticalFlow,
      opticalFlowTracking: opticalFlow,
      referenceQuality,
    });
    return {
      black,
      compressionSignature: frameMetadata.compressionSignature,
      compressionSignatureMapping: forensicSignature,
      duplicateFrame,
      frameCadence: frameMetadata.frameCadence,
      freeze,
      forensicSignature,
      freezeAttribution,
      gopStructure: frameMetadata.gopStructure,
      metadataProvenance,
      nearDuplicateFrame: duplicateFrame,
      opticalFlow,
      opticalFlowTracking: opticalFlow,
      referenceQuality,
      scopeWindow: serializeProbeTimeScope(timeScope),
    };
  }

  async function runAudioStructureProbe(
    runtime: Record<string, unknown>,
    project: Record<string, unknown>,
    requestId: string,
    jobId: string,
    target: Record<string, unknown>,
    options: StructureProbeOptions = {}
  ) {
    const projectPathRuntime = toProjectPathRuntime(runtime);
    const projectSlugRecord = toProjectSlugRecord(project);
    const targetPath = readTargetPath(target);
    const timeScope = resolveProbeTimeScope(target, options);
    const timeoutMs = resolveStructureProbeTimeoutMs(target, timeScope);
    const silencePayload = await runProfileTool(runtime, {
      requestId: requestId,
      jobId: jobId,
      toolId: "ffmpeg",
      cwd: getProjectProfileDir(projectPathRuntime, projectSlugRecord),
      args: [
        ...buildScopedInputArgs(targetPath, timeScope),
        "-af",
        "silencedetect=n=-38dB:d=0.35",
        "-f",
        "null",
        "-",
      ],
      timeoutMs,
    });
    const volumePayload = await runProfileTool(runtime, {
      requestId: requestId,
      jobId: jobId,
      toolId: "ffmpeg",
      cwd: getProjectProfileDir(projectPathRuntime, projectSlugRecord),
      args: [
        ...buildScopedInputArgs(targetPath, timeScope),
        "-af",
        "volumedetect",
        "-f",
        "null",
        "-",
      ],
      timeoutMs,
    });

    return {
      scopeWindow: serializeProbeTimeScope(timeScope),
      silence: offsetDetectionLogSummary(
        parseSilenceDetectLog(silencePayload["stderr"]),
        timeScope
      ),
      volume: parseVolumeDetectLog(volumePayload["stderr"]),
    };
  }

  return {
    resolveOpenSmileProsodyRuntime,
    runAudioStructureProbe,
    runOpenSmileProsodyExtraction,
    runVideoStructureProbe,
  };
}
