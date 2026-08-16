import type { RepairEvent, RepairReplayMode, RepairSession } from "../shared/types/index.js";
import type { RepairRuntimeStore } from "./state/repair-runtime-store.js";

export interface ReplayRuntimeController {
  play: () => void;
  pause: () => void;
  scrub: (positionMs: number) => void;
  jump: (eventId: string | null) => void;
  seek: (positionMs: number) => void;
  setSpeed: (speed: number) => void;
  followLive: () => void;
}

function getSessionEventOffsetMs(session: RepairSession, event: RepairEvent): number {
  return Math.max(0, Date.parse(event.occurredAt) - Date.parse(session.startedAt));
}

function getSessionLiveEdgeMs(session: RepairSession | null): number {
  if (session === null || session.events.length === 0) return 0;
  return Math.max(...session.events.map((event) => getSessionEventOffsetMs(session, event)));
}

function clampReplaySpeed(speed: number): number {
  if (!Number.isFinite(speed)) return 1;
  return Math.min(4, Math.max(0.25, speed));
}

function clampPosition(positionMs: number, session: RepairSession | null): number {
  const liveEdgeMs = getSessionLiveEdgeMs(session);
  return Math.max(0, Math.min(Math.max(60000, liveEdgeMs), positionMs));
}

export function createReplayRuntimeController(
  store: RepairRuntimeStore,
  getActiveSession: () => RepairSession | null
): ReplayRuntimeController {
  function setTimeline(patch: {
    playheadMs?: number;
    autoFollowLive?: boolean;
    replayMode?: RepairReplayMode;
    replaySpeed?: number;
    isPlaying?: boolean;
    liveEdgeMs?: number;
  }): void {
    const timeline = store.getState().workbench.timeline;
    const session = getActiveSession();
    store.dispatch({
      type: "workbench/set-timeline",
      playheadMs: patch.playheadMs ?? timeline.playheadMs,
      zoom: timeline.zoom,
      rangeStartMs: timeline.rangeStartMs,
      rangeEndMs: timeline.rangeEndMs,
      autoFollowLive: patch.autoFollowLive ?? timeline.autoFollowLive,
      replayMode: patch.replayMode ?? timeline.replayMode,
      replaySpeed: patch.replaySpeed ?? timeline.replaySpeed,
      isPlaying: patch.isPlaying ?? timeline.isPlaying,
      liveEdgeMs: patch.liveEdgeMs ?? getSessionLiveEdgeMs(session),
    });
  }

  return {
    play() {
      setTimeline({
        autoFollowLive: false,
        replayMode: "replay",
        isPlaying: true,
      });
    },
    pause() {
      setTimeline({
        autoFollowLive: false,
        replayMode: "paused",
        isPlaying: false,
      });
    },
    scrub(positionMs) {
      const session = getActiveSession();
      setTimeline({
        playheadMs: clampPosition(positionMs, session),
        autoFollowLive: false,
        replayMode: "replay",
        isPlaying: false,
      });
    },
    jump(eventId) {
      const session = getActiveSession();
      const event =
        eventId === null || session === null
          ? null
          : (session.events.find((candidate) => candidate.id === eventId) ?? null);
      const playheadMs =
        event === null || session === null ? 0 : getSessionEventOffsetMs(session, event);
      store.dispatchMany([
        { type: "workbench/set-investigation-mode", enabled: eventId !== null },
        { type: "workbench/set-focus-event", eventId },
        {
          type: "workbench/set-timeline",
          playheadMs,
          zoom: store.getState().workbench.timeline.zoom,
          rangeStartMs: store.getState().workbench.timeline.rangeStartMs,
          rangeEndMs: store.getState().workbench.timeline.rangeEndMs,
          autoFollowLive: false,
          replayMode: eventId === null ? "live" : "replay",
          isPlaying: false,
          liveEdgeMs: getSessionLiveEdgeMs(session),
        },
      ]);
    },
    seek(positionMs) {
      const session = getActiveSession();
      setTimeline({
        playheadMs: clampPosition(positionMs, session),
        autoFollowLive: false,
        replayMode: "replay",
        isPlaying: false,
      });
    },
    setSpeed(speed) {
      setTimeline({ replaySpeed: clampReplaySpeed(speed) });
    },
    followLive() {
      const session = getActiveSession();
      setTimeline({
        playheadMs: getSessionLiveEdgeMs(session),
        autoFollowLive: true,
        replayMode: "live",
        isPlaying: true,
      });
    },
  };
}
