import { Logger } from "../logger/index.js";
import { LogCategory, LogLevel } from "@shared/index.js";

interface ThinkingConfig {
  thinking: {
    stopButtonDetectionTimeoutMs: number;
  };
}

interface ViewState {
  status?: {
    thinking?: string;
  };
  lastSendSeen?: number;
  stopButtonLastSeen?: number;
  stopButtonDisappearedAt?: number;
  thinkingJustEnded?: boolean;
  thinkingEndedAt?: number;
}

interface ProbeData {
  stopVisible?: boolean;
  sendState?: string;
  voiceMode?: boolean;
  lastSend?: number;
}

type ThinkingEndReason = "stop-hidden" | "timeout";

interface ThinkingEvent {
  type: string;
  messageKey: string;
  messageParams?: Record<string, string>;
  reason?: ThinkingEndReason;
}

interface ProbeResult {
  indicator: string;
  newState: ViewState;
  event: ThinkingEvent | null;
}

interface CheckResult {
  shouldEnd: boolean;
  reason: ThinkingEndReason | null;
  newState: ViewState;
}

export class ThinkingTracker {
  config: ThinkingConfig;
  private probeCount = 0;

  constructor(config: ThinkingConfig) {
    this.config = config;
  }

  handleProbe(provider: string, viewState: ViewState, data: ProbeData, now: number): ProbeResult {
    this.probeCount++;
    const lastSend = data.lastSend ?? 0;
    const stopVisible = data.stopVisible === true;

    let event = null;
    const previousIndicator = viewState.status?.thinking ?? "idle";
    let indicator = stopVisible ? "busy" : "idle";
    let thinkingEndReason: ThinkingEndReason | null = null;

    if (lastSend > (viewState.lastSendSeen ?? 0)) {
      viewState.lastSendSeen = lastSend;
    }

    if (previousIndicator === "busy" && stopVisible !== true) {
      const checkResult = this.checkThinkingEnd(provider, viewState, data, now);
      viewState = checkResult.newState;
      if (checkResult.shouldEnd) {
        indicator = "idle";
        thinkingEndReason = checkResult.reason;
      } else {
        indicator = "busy";
      }
    }

    if (indicator === "busy" && stopVisible) {
      viewState.stopButtonLastSeen = now;
      viewState.stopButtonDisappearedAt = 0;
    }

    if (previousIndicator !== indicator) {
      if (indicator === "busy") {
        event = {
          type: "thinking-started",
          messageKey: "app.logs.traffic.thinkingStartedEvent",
          messageParams: { provider },
        };

        Logger.panelT(
          LogCategory.TRAFFIC,
          LogLevel.INFO,
          "app.logs.traffic.thinkingStartedPanel",
          { provider },
          {
            provider,
            lastSend,
            probeCount: this.probeCount,
            stopVisible,
          }
        );
      } else {
        viewState = this.endThinking(viewState, now);
        event = {
          type: "thinking-ended",
          messageKey: "app.logs.traffic.thinkingEndedEvent",
          messageParams: { provider },
          reason: thinkingEndReason ?? "stop-hidden",
        };

        Logger.panelT(
          LogCategory.TRAFFIC,
          LogLevel.INFO,
          "app.logs.traffic.thinkingEndedPanel",
          { provider },
          {
            provider,
            reason: thinkingEndReason ?? "stop-hidden",
            probeCount: this.probeCount,
            stopVisible,
          }
        );
      }
    }

    return { indicator, newState: viewState, event };
  }

  startThinking(viewState: ViewState, now: number, lastSendTime: number): ViewState {
    viewState.lastSendSeen = lastSendTime;
    viewState.stopButtonLastSeen = now;
    viewState.stopButtonDisappearedAt = 0;
    return viewState;
  }

  checkThinkingEnd(
    _provider: string,
    viewState: ViewState,
    data: ProbeData,
    now: number
  ): CheckResult {
    const sendState = data.sendState ?? "missing";
    const stopVisible = data.stopVisible === true;
    const voiceMode = data.voiceMode === true;

    if (viewState.status?.thinking !== "busy") {
      return { shouldEnd: false, reason: null, newState: viewState };
    }

    if (stopVisible) {
      viewState.stopButtonLastSeen = now;
      viewState.stopButtonDisappearedAt = 0;
      return { shouldEnd: false, reason: null, newState: viewState };
    }

    if (
      typeof viewState.stopButtonDisappearedAt !== "number" ||
      viewState.stopButtonDisappearedAt <= 0
    ) {
      viewState.stopButtonDisappearedAt = now;
    }

    const timeSinceDisappeared = now - (viewState.stopButtonDisappearedAt ?? 0);
    const shouldCheckEndThinking =
      timeSinceDisappeared >= this.config.thinking.stopButtonDetectionTimeoutMs;

    const shouldEndThinking = sendState === "enabled" || sendState === "disabled" || voiceMode;

    if (shouldEndThinking) {
      return {
        shouldEnd: true,
        reason: "stop-hidden",
        newState: viewState,
      };
    }

    if (shouldCheckEndThinking) {
      return {
        shouldEnd: true,
        reason: "timeout",
        newState: viewState,
      };
    }

    return { shouldEnd: false, reason: null, newState: viewState };
  }

  endThinking(viewState: ViewState, now: number): ViewState {
    viewState.thinkingJustEnded = true;
    viewState.thinkingEndedAt = now;
    return viewState;
  }

  clearJustEnded(viewState: ViewState): ViewState {
    viewState.thinkingJustEnded = false;
    return viewState;
  }
}
