import { Logger } from "../logger/index.js";
import { LogCategory, LogLevel } from "@shared/index.js";

interface TrackerConfig {
  pollIntervalMs?: number;
  loading?: unknown;
  thinking?: unknown;
}

export class SendTracker {
  config: TrackerConfig;
  private probeCount = 0;

  constructor(config: TrackerConfig) {
    this.config = config;
  }

  handleProbe(
    provider: string,
    viewState: Record<string, unknown>,
    data: { sendState?: string },
    _now: number
  ): { indicator: string; newState: Record<string, unknown> } {
    this.probeCount++;
    const sendState = data.sendState ?? "missing";
    const prevIndicator = (viewState["status"] as { send?: string }).send ?? "busy";
    const indicator = this.getSendStatus(sendState);

    if (indicator !== prevIndicator) {
      Logger.panelT(
        LogCategory.TRAFFIC,
        LogLevel.INFO,
        "app.logs.traffic.sendStateChanged",
        { provider, sendState, indicator, previousIndicator: prevIndicator },
        {
          provider,
          sendState,
          indicator,
          previousIndicator: prevIndicator,
          probeCount: this.probeCount,
        }
      );
    }

    return { indicator, newState: viewState };
  }

  getSendStatus(sendState: string): string {
    if (sendState === "enabled") {
      return "idle";
    } else {
      return "busy";
    }
  }

  isSendTriggered(viewState: { lastSendSeen?: number }, lastSendTime: number): boolean {
    return lastSendTime > (viewState.lastSendSeen ?? 0);
  }

  async waitForSendEnabled(
    getState: () => { status: { send: string } },
    timeout = 4000,
    interval = 100
  ): Promise<boolean> {
    return await new Promise((resolve) => {
      const start = Date.now();
      const check = (): void => {
        const state = getState();
        if (state.status.send === "idle") {
          resolve(true);
          return;
        }
        if (Date.now() - start >= timeout) {
          resolve(false);
          return;
        }
        setTimeout(check, interval);
      };
      check();
    });
  }
}
