export type LabTimelineRange = {
  startMs: number;
  endMs: number;
};

type LabTimelineFrameScheduler = {
  requestAnimationFrame?: (callback: (timestamp: number) => void) => number;
};

export function createLabTimelineRangeDispatcher(
  dispatchRange: (range: LabTimelineRange) => void,
  scheduler: LabTimelineFrameScheduler = globalThis
) {
  let pendingRange: LabTimelineRange | null = null;
  let frameScheduled = false;

  function flush() {
    frameScheduled = false;
    const nextRange = pendingRange;
    pendingRange = null;
    if (nextRange !== null) {
      dispatchRange(nextRange);
    }
  }

  function queue(startMs: number, endMs: number) {
    pendingRange = { startMs, endMs };
    if (frameScheduled) {
      return;
    }
    const requestFrame = scheduler.requestAnimationFrame;
    if (typeof requestFrame !== "function") {
      flush();
      return;
    }
    frameScheduled = true;
    requestFrame.call(scheduler, function () {
      flush();
    });
  }

  function cancel() {
    pendingRange = null;
  }

  return {
    cancel,
    flush,
    queue,
  };
}
