import { asLabRecord, asNonEmptyString, asNumber } from "../../domain/lab-types.js";
import type { LabFocusLayer } from "../../domain/lab-types.js";
import { createLabI18n } from "../lab-context-i18n.js";
import { getPreviewVolume, getWorkspaceLockState } from "../lab-selectors.js";
import type { createLabStore } from "../lab-store.js";
import { getWorkspaceSourceSelectionResetKey } from "../lab-workspace-selection.js";
import { buildUiEvent, toStringValue } from "./lab-controller-helpers.js";
import {
  clampMediaTime,
  formatTimelineTimeMs,
  getTimelinePlayheadShiftMs,
  isMediaLikeElement,
} from "./lab-timeline-controller-helpers.js";
import type { LabTimelineMediaLikeElement } from "./lab-timeline-controller-helpers.js";
import { createLabTimelineRangeDispatcher } from "./lab-timeline-range-dispatcher.js";

type LabTimelinePlaybackControllerDeps = {
  dispatch: (event: Parameters<ReturnType<typeof createLabStore>["dispatch"]>[0]) => void;
  documentRef: Document;
  setLabFocusLayer: (layer: LabFocusLayer) => void;
  store: ReturnType<typeof createLabStore>;
};

export function createLabTimelinePlaybackController(deps: LabTimelinePlaybackControllerDeps) {
  const dispatch = deps.dispatch;
  const setLabFocusLayer = deps.setLabFocusLayer;
  const timelineRangeDispatcher = createLabTimelineRangeDispatcher(function (range) {
    dispatch({
      type: "workspace-timeline-updated",
      startMs: range.startMs,
      endMs: range.endMs,
    });
  }, deps.documentRef.defaultView ?? globalThis);

  type RangeLikeElement = {
    value: string;
    max?: string;
  };

  type TextLikeElement = {
    textContent: string | null;
  };

  type BookmarkNoteInputElement = {
    value: string;
  };

  let boundTimelineSyncMedia: LabTimelineMediaLikeElement | null = null;
  let selectedPlaybackActive = false;

  function getPrimaryWorkspacePreviewMedia() {
    const selectors = [
      'audio[data-lab-preserve-media="workspace-preview"]',
      'video[data-lab-preserve-media="workspace-preview"]',
    ];
    for (const selector of selectors) {
      const candidate = deps.documentRef.querySelector?.(selector);
      if (isMediaLikeElement(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  function isInsideWorkspacePreview(target: Element) {
    return (
      typeof target.closest === "function" && target.closest(".labx-workspace-preview") !== null
    );
  }

  function getTimelineSyncMedia() {
    return getPrimaryWorkspacePreviewMedia();
  }

  function getTimelinePlayhead() {
    const candidate = deps.documentRef.querySelector?.('[data-lab-role="timeline-playhead"]');
    return candidate && typeof candidate === "object"
      ? (candidate as {
          setAttribute?: (name: string, value: string) => void;
          style?: { left?: string; opacity?: string };
        })
      : null;
  }

  function getTimelinePlayheadLabel() {
    const candidate = deps.documentRef.querySelector?.('[data-lab-role="timeline-playhead-label"]');
    return candidate && typeof candidate === "object"
      ? (candidate as { textContent: string | null })
      : null;
  }

  function getTimelineCurrentTimeLabel() {
    return deps.documentRef.querySelector?.(
      '[data-lab-role="timeline-current-time-label"]'
    ) as TextLikeElement | null;
  }

  function getTimelineTotalDurationLabel() {
    return deps.documentRef.querySelector?.(
      '[data-lab-role="timeline-total-duration-label"]'
    ) as TextLikeElement | null;
  }

  function getTimelinePlayToggleLabel() {
    return deps.documentRef.querySelector?.(
      '[data-lab-role="timeline-play-toggle-label"]'
    ) as TextLikeElement | null;
  }

  function getTimelineVolumeInput() {
    return deps.documentRef.querySelector?.(
      '[data-lab-role="timeline-volume"]'
    ) as RangeLikeElement | null;
  }

  function getTimelineBookmarkNoteInput() {
    return deps.documentRef.querySelector?.(
      '[data-lab-role="timeline-bookmark-note"]'
    ) as BookmarkNoteInputElement | null;
  }

  function syncTimelineTransportVolume() {
    const state = deps.store.getState();
    const volume = getPreviewVolume(state);
    const volumeInput = getTimelineVolumeInput();

    if (volumeInput) {
      volumeInput.value = String(volume);
    }

    const media = getPrimaryWorkspacePreviewMedia();
    if (media) {
      media.muted = volume <= 0;
      if (typeof media.volume === "number") {
        media.volume = volume;
      }
    }
  }

  function getTimelineDurationMs(media: LabTimelineMediaLikeElement | null) {
    const timeline = deps.documentRef.querySelector?.(".labx-timeline") as {
      dataset?: Record<string, string | undefined>;
    } | null;
    const timelineDurationMs = Number(timeline?.dataset?.["duration"] || 0);
    if (Number.isFinite(timelineDurationMs) && timelineDurationMs > 0) {
      return timelineDurationMs;
    }
    if (media && typeof media.duration === "number" && Number.isFinite(media.duration)) {
      return Math.max(0, Math.round(media.duration * 1000));
    }
    return 0;
  }

  function updateTimelinePlaybackUi() {
    const media = getTimelineSyncMedia();
    const playhead = getTimelinePlayhead();
    const playheadLabel = getTimelinePlayheadLabel();
    const currentTimeLabel = getTimelineCurrentTimeLabel();
    const totalDurationLabel = getTimelineTotalDurationLabel();
    const playToggleLabel = getTimelinePlayToggleLabel();
    const rawDurationMs = getTimelineDurationMs(media);
    const durationMs = Math.max(1, rawDurationMs);
    const currentMs =
      media && typeof media.currentTime === "number" && Number.isFinite(media.currentTime)
        ? Math.max(0, Math.round(media.currentTime * 1000))
        : 0;
    const clampedCurrentMs = Math.max(0, Math.min(durationMs, currentMs));
    const leftPct = Math.max(0, Math.min(100, (clampedCurrentMs / durationMs) * 100));
    const currentTimeText = formatTimelineTimeMs(clampedCurrentMs);

    if (playhead?.style) {
      playhead.style.left = `${String(leftPct)}%`;
      playhead.style.opacity = media === null ? "0" : "1";
    }
    playhead?.setAttribute?.("data-active", media === null ? "false" : "true");
    if (playheadLabel) {
      playheadLabel.textContent = currentTimeText;
    }
    if (currentTimeLabel) {
      currentTimeLabel.textContent = currentTimeText;
    }
    if (totalDurationLabel) {
      totalDurationLabel.textContent = formatTimelineTimeMs(Math.max(0, rawDurationMs));
    }
    if (playToggleLabel) {
      playToggleLabel.textContent = media && media.paused === false ? "❚❚" : "▶";
    }
    syncTimelineTransportVolume();
  }

  function handleTimelineMediaPlaybackChange() {
    updateTimelinePlaybackUi();
    enforceSelectedPlaybackBoundary();
  }

  function bindTimelinePlaybackListeners() {
    const nextMedia = getTimelineSyncMedia();
    if (boundTimelineSyncMedia === nextMedia) {
      return;
    }
    if (boundTimelineSyncMedia?.removeEventListener) {
      boundTimelineSyncMedia.removeEventListener("timeupdate", handleTimelineMediaPlaybackChange);
      boundTimelineSyncMedia.removeEventListener("play", handleTimelineMediaPlaybackChange);
      boundTimelineSyncMedia.removeEventListener("pause", handleTimelineMediaPlaybackChange);
      boundTimelineSyncMedia.removeEventListener("seeking", handleTimelineMediaPlaybackChange);
      boundTimelineSyncMedia.removeEventListener("seeked", handleTimelineMediaPlaybackChange);
      boundTimelineSyncMedia.removeEventListener(
        "loadedmetadata",
        handleTimelineMediaPlaybackChange
      );
      boundTimelineSyncMedia.removeEventListener(
        "durationchange",
        handleTimelineMediaPlaybackChange
      );
      boundTimelineSyncMedia.removeEventListener("ended", handleTimelineMediaPlaybackChange);
    }
    if (nextMedia?.addEventListener) {
      nextMedia.addEventListener("timeupdate", handleTimelineMediaPlaybackChange);
      nextMedia.addEventListener("play", handleTimelineMediaPlaybackChange);
      nextMedia.addEventListener("pause", handleTimelineMediaPlaybackChange);
      nextMedia.addEventListener("seeking", handleTimelineMediaPlaybackChange);
      nextMedia.addEventListener("seeked", handleTimelineMediaPlaybackChange);
      nextMedia.addEventListener("loadedmetadata", handleTimelineMediaPlaybackChange);
      nextMedia.addEventListener("durationchange", handleTimelineMediaPlaybackChange);
      nextMedia.addEventListener("ended", handleTimelineMediaPlaybackChange);
    }
    boundTimelineSyncMedia = nextMedia;
  }

  function syncTimelinePlaybackUiFromState() {
    bindTimelinePlaybackListeners();
    updateTimelinePlaybackUi();
  }

  function toggleTimelinePlayback() {
    const media = getTimelineSyncMedia();
    if (media === null) {
      return;
    }
    selectedPlaybackActive = false;
    syncTimelineTransportVolume();
    if (media.paused === false) {
      media.pause?.();
    } else {
      safePlay(media);
    }
    updateTimelinePlaybackUi();
  }

  function getValidTimelineSelectionRange() {
    const state = deps.store.getState();
    const startMs = state.ui.workspace.timelineStartMs;
    const endMs = state.ui.workspace.timelineEndMs;
    if (
      typeof startMs !== "number" ||
      typeof endMs !== "number" ||
      Number.isFinite(startMs) !== true ||
      Number.isFinite(endMs) !== true ||
      endMs <= startMs
    ) {
      return null;
    }
    return { startMs, endMs };
  }

  function getCurrentTimelineTimeMs(
    media: LabTimelineMediaLikeElement | null = getTimelineSyncMedia()
  ) {
    if (media === null || typeof media.currentTime !== "number") {
      return null;
    }
    const durationMs = getTimelineDurationMs(media);
    const rawTimeMs = Math.max(0, Math.round(media.currentTime * 1000));
    return durationMs > 0 ? Math.min(durationMs, rawTimeMs) : rawTimeMs;
  }

  function setTimelineSelectionBoundary(boundary: string) {
    const media = getTimelineSyncMedia();
    const timeMs = getCurrentTimelineTimeMs(media);
    if (timeMs === null) {
      dispatch({
        type: "push-event",
        event: buildUiEvent("Önizleme zamanı okunamadı.", "warning"),
      });
      return;
    }

    const state = deps.store.getState();
    if (boundary === "start") {
      const currentEnd = state.ui.workspace.timelineEndMs;
      dispatch({
        type: "workspace-timeline-updated",
        startMs: timeMs,
        endMs: typeof currentEnd === "number" && currentEnd > timeMs ? currentEnd : null,
      });
      return;
    }

    if (boundary === "end") {
      const currentStart = state.ui.workspace.timelineStartMs;
      if (typeof currentStart !== "number") {
        dispatch({
          type: "push-event",
          event: buildUiEvent("Önce seçim başlangıcını işaretleyin.", "warning"),
        });
        return;
      }
      if (timeMs <= currentStart) {
        dispatch({
          type: "push-event",
          event: buildUiEvent("Seçim bitişi başlangıçtan sonra olmalı.", "warning"),
        });
        return;
      }
      dispatch({ type: "workspace-timeline-updated", startMs: currentStart, endMs: timeMs });
    }
  }

  function playSelectedTimelineRange() {
    const media = getTimelineSyncMedia();
    const range = getValidTimelineSelectionRange();
    if (media === null || range === null) {
      selectedPlaybackActive = false;
      dispatch({
        type: "push-event",
        event: buildUiEvent("Oynatılacak geçerli seçim yok.", "warning"),
      });
      return;
    }
    selectedPlaybackActive = true;
    syncTimelineTransportVolume();
    seekTimelineToMs(range.startMs);
    safePlay(media);
    updateTimelinePlaybackUi();
  }

  function enforceSelectedPlaybackBoundary() {
    if (selectedPlaybackActive !== true) {
      return;
    }
    const media = getTimelineSyncMedia();
    const range = getValidTimelineSelectionRange();
    const currentMs = getCurrentTimelineTimeMs(media);
    if (media === null || range === null || currentMs === null) {
      selectedPlaybackActive = false;
      return;
    }
    if (currentMs < range.endMs) {
      return;
    }
    if (deps.store.getState().ui.workspace.selectionLoopEnabled === true) {
      seekTimelineToMs(range.startMs);
      safePlay(media);
      return;
    }
    selectedPlaybackActive = false;
    seekTimelineToMs(range.endMs);
    media.pause?.();
    updateTimelinePlaybackUi();
  }

  function getTimelineBookmarkFrameIndex(timeMs: number) {
    const metadata = asLabRecord(asLabRecord(deps.store.getState().source)["metadata"]);
    const fps = typeof metadata["fps"] === "number" ? metadata["fps"] : null;
    if (fps === null || Number.isFinite(fps) !== true || fps <= 0) {
      return null;
    }
    return Math.max(0, Math.round((timeMs / 1000) * fps));
  }

  function addCurrentTimelineBookmark() {
    const media = getTimelineSyncMedia();
    if (
      media === null ||
      typeof media.currentTime !== "number" ||
      Number.isFinite(media.currentTime) !== true
    ) {
      dispatch({
        type: "push-event",
        event: buildUiEvent("Önizleme zamanı okunamadı.", "warning"),
      });
      return;
    }

    const durationMs = getTimelineDurationMs(media);
    const rawTimeMs = Math.max(0, Math.round(media.currentTime * 1000));
    const timeMs = durationMs > 0 ? Math.min(durationMs, rawTimeMs) : rawTimeMs;
    const noteInput = getTimelineBookmarkNoteInput();
    const state = deps.store.getState();
    const copy = createLabI18n(state.context);
    const timeLabel = formatTimelineTimeMs(timeMs);
    const note =
      asNonEmptyString(noteInput?.value) ||
      copy.t("mediaAnalysis.timeline.bookmarkDefaultNote", "Mark {time}", {
        time: timeLabel,
      });
    const bookmarkId = `bm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    dispatch({
      type: "workspace-bookmark-added",
      bookmark: {
        id: bookmarkId,
        timeMs,
        frameIndex: getTimelineBookmarkFrameIndex(timeMs),
        note,
        createdAt: Date.now(),
        projectId: state.projectIndex.activeProjectId,
        sourceKey: getWorkspaceSourceSelectionResetKey(state.source),
      },
    });
    if (noteInput) {
      noteInput.value = "";
    }
    updateTimelinePlaybackUi();
  }

  function safePlay(media: LabTimelineMediaLikeElement | null) {
    try {
      const result = media?.play?.();
      if (result && typeof (result as PromiseLike<void>).then === "function") {
        void (result as PromiseLike<void>).then(
          function () {},
          function () {}
        );
      }
    } catch {
      // NOTE: Media playback retries are best-effort only.
    }
  }

  function seekSinglePreviewToMs(timeMs: number) {
    const media = getPrimaryWorkspacePreviewMedia();
    if (media !== null) {
      media.currentTime = clampMediaTime(media, timeMs / 1000);
      updateTimelinePlaybackUi();
      return true;
    }
    const mediaEls =
      deps.documentRef.querySelectorAll?.<HTMLMediaElement>(".labx-preview-media") || [];
    mediaEls.forEach(function (el) {
      el.currentTime = timeMs / 1000;
    });
    updateTimelinePlaybackUi();
    return mediaEls.length > 0;
  }

  function seekTimelineToMs(timeMs: number) {
    return seekSinglePreviewToMs(timeMs);
  }

  function shiftTimelinePlayhead(value: string) {
    const media = getTimelineSyncMedia();
    if (media === null || typeof media.currentTime !== "number") {
      return;
    }
    const sourceMetadata = asLabRecord(asLabRecord(deps.store.getState().source)["metadata"]);
    const deltaMs = getTimelinePlayheadShiftMs(value, media, asNumber(sourceMetadata["fps"]));
    if (deltaMs === null) {
      return;
    }
    if ((value === "-frame" || value === "+frame") && media.paused !== true) {
      media.pause?.();
    }
    const durationMs = getTimelineDurationMs(media);
    const currentMs = Math.max(0, Math.round(media.currentTime * 1000));
    const unclampedNextMs = currentMs + deltaMs;
    const nextMs =
      durationMs > 0
        ? Math.max(0, Math.min(durationMs, unclampedNextMs))
        : Math.max(0, unclampedNextMs);
    seekTimelineToMs(nextMs);
  }

  function centerTimelineTarget(target: Element) {
    const track = target.closest<HTMLElement>(".labx-timeline__track");
    if (!track || track.scrollWidth <= track.clientWidth) {
      return;
    }
    const targetRect = (target as HTMLElement).getBoundingClientRect();
    const trackRect = track.getBoundingClientRect();
    const targetCenter = targetRect.left - trackRect.left + targetRect.width / 2;
    track.scrollLeft = Math.max(0, targetCenter - track.clientWidth / 2);
  }

  // --- Timeline drag state ---
  type TimelineDragMode = "none" | "pending-seek" | "rail" | "start" | "end" | "body";
  type TimelineTrackGeometry = {
    left: number;
    width: number;
  };
  let timelineDragMode: TimelineDragMode = "none";
  let timelineDragTrack: HTMLElement | null = null;
  let timelineDragTrackGeometry: TimelineTrackGeometry | null = null;
  let timelineDragDurationMs: number = 0;
  let timelineDragAnchorMs: number = 0;
  let timelineDragFinalMs: number = 0;
  let timelineDragBodyOffsetStart: number = 0;
  let timelineDragBodyOffsetEnd: number = 0;
  let timelineDragBodyPointerOffsetMs: number = 0;
  let timelinePendingClientX: number = 0;
  let timelinePendingShiftKey = false;
  const TIMELINE_DRAG_THRESHOLD_PX = 4;

  function getTimelineTrackGeometry(track: Element): TimelineTrackGeometry | null {
    const rect = (track as HTMLElement).getBoundingClientRect();
    if (rect.width <= 0 || Number.isFinite(rect.width) !== true) {
      return null;
    }
    return {
      left: rect.left,
      width: rect.width,
    };
  }

  function msFromTrackGeometry(
    geometry: TimelineTrackGeometry,
    durationMs: number,
    clientX: number
  ): number {
    const x = Math.max(0, Math.min(clientX - geometry.left, geometry.width));
    const pct = x / geometry.width;
    return Math.max(0, Math.round(durationMs * pct));
  }

  function msFromTrackClientX(track: Element, durationMs: number, clientX: number): number {
    const geometry = getTimelineTrackGeometry(track);
    return geometry === null ? 0 : msFromTrackGeometry(geometry, durationMs, clientX);
  }

  function msFromTrackX(clientX: number): number {
    if (!timelineDragTrack) return 0;
    const geometry = timelineDragTrackGeometry ?? getTimelineTrackGeometry(timelineDragTrack);
    return geometry === null ? 0 : msFromTrackGeometry(geometry, timelineDragDurationMs, clientX);
  }

  function isWorkspaceMutationLocked(lockKey: keyof ReturnType<typeof getWorkspaceLockState>) {
    return getWorkspaceLockState(deps.store.getState())[lockKey] === true;
  }

  function pushLockedWorkspaceEvent(message: string) {
    dispatch({
      type: "push-event",
      event: buildUiEvent(message, "warning"),
    });
  }

  function startTimelineDrag(track: Element, anchorMs: number, durationMs: number) {
    timelineDragMode = "rail";
    timelineDragTrack = track as HTMLElement;
    timelineDragTrackGeometry = timelineDragTrackGeometry ?? getTimelineTrackGeometry(track);
    timelineDragDurationMs = durationMs;
    timelineDragAnchorMs = anchorMs;
    timelineDragFinalMs = anchorMs;
    dispatch({ type: "workspace-timeline-updated", startMs: anchorMs, endMs: anchorMs });
    seekTimelineToMs(anchorMs);
  }

  function startTimelinePendingSeek(
    track: Element,
    anchorMs: number,
    durationMs: number,
    clientX: number,
    shiftKey: boolean,
    event: MouseEvent
  ) {
    event.preventDefault();
    timelineDragMode = "pending-seek";
    timelineDragTrack = track as HTMLElement;
    timelineDragTrackGeometry = getTimelineTrackGeometry(track);
    timelineDragDurationMs = durationMs;
    timelineDragAnchorMs = anchorMs;
    timelinePendingClientX = clientX;
    timelinePendingShiftKey = shiftKey;
  }

  function startTimelineHandleDrag(
    track: Element,
    mode: "start" | "end",
    durationMs: number,
    event: MouseEvent
  ) {
    event.preventDefault();
    event.stopPropagation();
    timelineDragMode = mode;
    timelineDragTrack = track as HTMLElement;
    timelineDragTrackGeometry = getTimelineTrackGeometry(track);
    timelineDragDurationMs = durationMs;
  }

  function startTimelineBodyDrag(track: Element, durationMs: number, event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    const state = deps.store.getState();
    const currentStart = state.ui.workspace.timelineStartMs ?? 0;
    const currentEnd = state.ui.workspace.timelineEndMs ?? durationMs;
    const pointerMs = msFromTrackClientX(track, durationMs, event.clientX);
    timelineDragMode = "body";
    timelineDragTrack = track as HTMLElement;
    timelineDragTrackGeometry = getTimelineTrackGeometry(track);
    timelineDragDurationMs = durationMs;
    timelineDragBodyOffsetStart = currentStart;
    timelineDragBodyOffsetEnd = currentEnd;
    timelineDragBodyPointerOffsetMs = Math.max(
      0,
      Math.min(currentEnd - currentStart, pointerMs - currentStart)
    );
  }

  function extendTimelineSelectionToMs(timeMs: number) {
    const state = deps.store.getState();
    const existingStart = state.ui.workspace.timelineStartMs;
    const existingEnd = state.ui.workspace.timelineEndMs;
    if (existingStart !== null && existingEnd !== null) {
      const distStart = Math.abs(timeMs - existingStart);
      const distEnd = Math.abs(timeMs - existingEnd);
      if (distStart <= distEnd) {
        dispatch({ type: "workspace-timeline-updated", startMs: timeMs, endMs: existingEnd });
      } else {
        dispatch({ type: "workspace-timeline-updated", startMs: existingStart, endMs: timeMs });
      }
      return;
    }
    dispatch({ type: "workspace-timeline-updated", startMs: timeMs, endMs: timeMs });
  }

  function handleMouseDown(event: Event) {
    if (!(event instanceof MouseEvent)) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (isInsideWorkspacePreview(target)) {
      setLabFocusLayer("preview");
    }

    const handleEl = target.closest<HTMLElement>(
      "[data-lab-action='timeline-interact'], [data-lab-action='timeline-drag-start'], [data-lab-action='timeline-drag-end'], [data-lab-action='timeline-drag-body']"
    );
    if (!handleEl) return;
    setLabFocusLayer("timeline");
    if (isWorkspaceMutationLocked("timeline")) {
      return;
    }

    const action = toStringValue(handleEl.dataset["labAction"]);
    const timeline = handleEl.closest<HTMLElement>(".labx-timeline");
    const track = timeline?.querySelector(".labx-timeline__track");
    if (!timeline || !track) return;

    const durationMs = Number(timeline.dataset["duration"] || 0);

    if (action === "timeline-interact") {
      const ms = msFromTrackClientX(track, durationMs, event.clientX);
      startTimelinePendingSeek(track, ms, durationMs, event.clientX, event.shiftKey, event);
    } else if (action === "timeline-drag-start" || action === "timeline-drag-end") {
      startTimelineHandleDrag(
        track,
        action === "timeline-drag-start" ? "start" : "end",
        durationMs,
        event
      );
    } else if (action === "timeline-drag-body") {
      startTimelineBodyDrag(track, durationMs, event);
    }
  }

  function handleTimelineMouseMove(event: MouseEvent) {
    if (timelineDragMode === "none" || !timelineDragTrack) return;
    if (isWorkspaceMutationLocked("timeline")) {
      timelineRangeDispatcher.cancel();
      timelineDragMode = "none";
      timelineDragTrack = null;
      timelineDragTrackGeometry = null;
      return;
    }

    const ms = msFromTrackX(event.clientX);

    if (timelineDragMode === "pending-seek") {
      const shiftPx = Math.abs(event.clientX - timelinePendingClientX);
      if (shiftPx < TIMELINE_DRAG_THRESHOLD_PX) {
        return;
      }
      startTimelineDrag(timelineDragTrack, timelineDragAnchorMs, timelineDragDurationMs);
    }

    const state = deps.store.getState();

    if (timelineDragMode === "rail") {
      const startMs = Math.min(timelineDragAnchorMs, ms);
      const endMs = Math.max(timelineDragAnchorMs, ms);
      timelineDragFinalMs = ms;
      timelineRangeDispatcher.queue(startMs, endMs);
    } else if (timelineDragMode === "start") {
      const currentEnd = state.ui.workspace.timelineEndMs ?? timelineDragDurationMs;
      const nextStart = Math.max(0, Math.min(ms, currentEnd));
      timelineRangeDispatcher.queue(nextStart, currentEnd);
    } else if (timelineDragMode === "end") {
      const currentStart = state.ui.workspace.timelineStartMs ?? 0;
      const nextEnd = Math.max(currentStart, Math.min(ms, timelineDragDurationMs));
      timelineRangeDispatcher.queue(currentStart, nextEnd);
    } else if (timelineDragMode === "body") {
      const rangeWidth = timelineDragBodyOffsetEnd - timelineDragBodyOffsetStart;
      const newStart = Math.max(
        0,
        Math.min(ms - timelineDragBodyPointerOffsetMs, timelineDragDurationMs - rangeWidth)
      );
      const newEnd = newStart + rangeWidth;
      timelineRangeDispatcher.queue(newStart, newEnd);
    }
  }

  function handleTimelineMouseUp() {
    if (timelineDragMode === "none") return;
    if (isWorkspaceMutationLocked("timeline")) {
      timelineRangeDispatcher.cancel();
      timelineDragMode = "none";
      timelineDragTrack = null;
      timelineDragTrackGeometry = null;
      return;
    }
    timelineRangeDispatcher.flush();
    if (timelineDragMode === "pending-seek") {
      if (timelinePendingShiftKey === true) {
        extendTimelineSelectionToMs(timelineDragAnchorMs);
        seekTimelineToMs(timelineDragAnchorMs);
      } else {
        seekTimelineToMs(timelineDragAnchorMs);
      }
    } else if (timelineDragMode === "rail") {
      seekTimelineToMs(timelineDragFinalMs);
    } else {
      const state = deps.store.getState();
      const selectionStart = state.ui.workspace.timelineStartMs;
      const selectionEnd = state.ui.workspace.timelineEndMs;
      if (timelineDragMode === "end" && typeof selectionEnd === "number") {
        seekTimelineToMs(selectionEnd);
      } else if (typeof selectionStart === "number") {
        seekTimelineToMs(selectionStart);
      }
    }
    timelineDragMode = "none";
    timelineDragTrack = null;
    timelineDragTrackGeometry = null;
    timelineDragFinalMs = 0;
    timelineDragBodyPointerOffsetMs = 0;
    timelinePendingClientX = 0;
    timelinePendingShiftKey = false;
  }

  return {
    addCurrentTimelineBookmark,
    centerTimelineTarget,
    getTimelineSyncMedia,
    handleMouseDown,
    handleTimelineMouseMove,
    handleTimelineMouseUp,
    isWorkspaceMutationLocked,
    playSelectedTimelineRange,
    pushLockedWorkspaceEvent,
    seekTimelineToMs,
    setTimelineSelectionBoundary,
    shiftTimelinePlayhead,
    syncTimelinePlaybackUiFromState,
    syncTimelineTransportVolume,
    toggleTimelinePlayback,
    updateTimelinePlaybackUi,
  };
}
