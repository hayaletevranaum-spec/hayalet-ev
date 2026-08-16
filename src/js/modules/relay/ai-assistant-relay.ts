import { BaseRelay } from "./base-relay.js";
import { LogCategory } from "@shared/logging-core";
import { AppI18n } from "../i18n/index.js";
import { AppState } from "../app-state.js";
import { dispatchInternalSlotBridge } from "../commands/slot-bridge-runtime.js";
import { START_STOP_PROTOCOL_HEADERS } from "../protocol-default-headers.js";
import { PROTOCOL_KEY } from "@slots";

const AI_ASSISTANT_PROTOCOL_FALLBACK_TITLE = START_STOP_PROTOCOL_HEADERS.ANALYZE_AI_ASSISTANT_START;

interface SyncResult {
  messages?: { role?: string; text?: string; content?: string }[];
}

function relayT(key: string, params?: Record<string, string>): string {
  return AppI18n.t(`app.logs.aiAssistantRelay.${key}`, params);
}

export class AIAssistantRelay extends BaseRelay {
  _sourceSlot: string | null;
  _targetSlot: string;
  _prevThinking: Record<string, string>;
  _lastMessageTimes: Record<string, number>;
  _sessionState: string;

  constructor(coreEngine: unknown) {
    super(coreEngine);
    this._sourceSlot = null;
    this._targetSlot = "ai0";
    this._prevThinking = { ai0: "idle", ai1: "idle", ai2: "idle" };
    this._lastMessageTimes = { ai0: 0, ai1: 0, ai2: 0 };

    this._sessionState = "idle";
  }

  override handlesProvider(provider: string): boolean {
    if (this._active === false) return false;
    return provider === this._sourceSlot || provider === this._targetSlot;
  }

  get sourceSlot(): string | null {
    return this._sourceSlot;
  }

  override async start(opts: { sourceSlot?: string } = {}): Promise<void> {
    const source = opts.sourceSlot;

    if (source === undefined || (source !== "ai1" && source !== "ai2")) {
      throw new Error(relayT("invalidSourceSlot"));
    }

    if (AppState.isAssigned(source) === false) {
      throw new Error(relayT("sourceDisconnected", { source }));
    }

    if (AppState.isAssigned(this._targetSlot) === false) {
      throw new Error(relayT("assistantDisconnected", { target: this._targetSlot }));
    }

    this._sourceSlot = source;
    this._active = true;
    this._forwardCount = 0;
    this._sessionState = "idle";
    this._lastMessageTimes = {
      [source]: 0,
      [this._targetSlot]: 0,
    };

    const sessionId = this._generateSessionId(LogCategory.RELAY);
    this._session = {
      id: sessionId,
      type: "ai-assistant",
      sourceSlot: source,
      targetSlot: this._targetSlot,
      createdAt: Date.now(),
    };

    this._logT("info", "app.logs.aiAssistantRelay.started", {
      source,
      target: this._targetSlot,
    });
    AppState.setAssistantRelay(true, source);
    this._dispatchEvent("relay-changed", {
      active: true,
      type: "ai-assistant",
      sourceSlot: source,
      targetSlot: this._targetSlot,
    });

    await this._sendProtocolToAI(source);
  }

  async _sendProtocolToAI(aiSlot: string): Promise<void> {
    try {
      this._sessionState = "protocol-sent";
      this._logT(
        "info",
        "app.logs.aiAssistantRelay.protocolSending",
        {
          provider: aiSlot,
        },
        {
          sessionId: this._session?.id,
          protocolKey: PROTOCOL_KEY,
        }
      );

      const sendResult = await dispatchInternalSlotBridge(
        {
          action: "message.send",
          fromSlot: "system",
          toSlot: aiSlot,
          payload: {
            protocol: {
              protocolKey: PROTOCOL_KEY,
              fallbackTitle: AI_ASSISTANT_PROTOCOL_FALLBACK_TITLE,
            },
          },
        },
        {
          provider: "system",
          source: "system",
          fromSlot: "system",
        }
      );
      if (sendResult.success !== true) {
        throw new Error(sendResult.message ?? relayT("sendMessageUnavailable"));
      }

      this._logT("info", "app.logs.aiAssistantRelay.protocolSent", {
        provider: aiSlot,
      });
    } catch (e) {
      const err = e as Error;
      this._logT("warning", "app.logs.aiAssistantRelay.protocolSendFailed", {
        message: err.message,
      });
      this._sessionState = "relay-active";
    }
  }

  override async stop(): Promise<void> {
    const sessionId = this._session?.id;
    const source = this._sourceSlot;

    if (sessionId !== undefined && sessionId !== "") {
      this._logT("info", "app.logs.aiAssistantRelay.stoppedWithSession", {
        sessionId,
        source: source ?? "-",
        target: this._targetSlot,
      });
    } else {
      this._logT("info", "app.logs.aiAssistantRelay.stopped");
    }

    this._sourceSlot = null;
    this._sessionState = "idle";
    this._resetState();
    this._prevThinking = { ai0: "idle", ai1: "idle", ai2: "idle" };
    this._lastMessageTimes = { ai0: 0, ai1: 0, ai2: 0 };

    AppState.setAssistantRelay(false, null);
    this._dispatchEvent("relay-changed", { active: false, type: "ai-assistant" });
    await Promise.resolve();
  }

  override async handleThinkingComplete(
    provider: string,
    syncResult: SyncResult | null
  ): Promise<void> {
    try {
      if (syncResult === null || !Array.isArray(syncResult.messages)) {
        return;
      }

      const lastAssistant = [...syncResult.messages]
        .reverse()
        .find(
          (m) =>
            m.role === "assistant" &&
            ((m.text !== undefined && m.text !== "") ||
              (m.content !== undefined && m.content !== ""))
        );

      const lastAssistantText = lastAssistant?.text ?? lastAssistant?.content;

      if (lastAssistantText === undefined || lastAssistantText === "") {
        return;
      }

      const text = lastAssistantText.trim();

      await this._handleStateMachine(provider, text);
    } catch (e) {
      const err = e as Error;
      this._logT("warning", "app.logs.aiAssistantRelay.handleThinkingCompleteError", {
        message: err.message,
      });
    }
  }

  async _handleStateMachine(provider: string, text: string): Promise<void> {
    // NOTE: Timestamp-based duplicate protection.
    const now = Date.now();

    if (this._lastMessageTimes[provider] === now) {
      this._logT("warning", "app.logs.aiAssistantRelay.duplicateMessageBlocked", {
        provider,
      });
      return;
    }
    this._lastMessageTimes[provider] = now;

    const sessionId = this._session?.id ?? "unknown";

    if (this._sessionState === "protocol-sent" && provider === this._sourceSlot) {
      this._logT(
        "info",
        "app.logs.aiAssistantRelay.protocolReplyReceived",
        {
          sessionId,
          provider,
        },
        {
          excerpt: text.slice(0, 200),
        }
      );

      await this._forwardMessage(provider, this._targetSlot, text);

      this._sessionState = "relay-active";
      return;
    }

    if (this._sessionState === "relay-active" || this._sessionState === "ai-replied") {
      await this._handleRelayFlow(provider, text);
      return;
    }

    this._logT("debug", "app.logs.aiAssistantRelay.ignoringMessageInState", {
      state: this._sessionState,
      provider,
    });
  }

  async _forwardMessage(from: string, to: string | null, text: string): Promise<boolean> {
    if (to === null || AppState.isAssigned(to) === false) {
      this._logT("info", "app.logs.aiAssistantRelay.forwardSkippedTargetNotConnected", {
        target: to ?? "-",
      });
      return false;
    }

    this._forwardCount += 1;
    this._logT(
      "info",
      "app.logs.aiAssistantRelay.forwarding",
      {
        count: this._forwardCount,
        from,
        to,
      },
      {
        job: { from, to },
        excerpt: text.slice(0, 200),
      }
    );

    try {
      const sendResult = await dispatchInternalSlotBridge(
        {
          action: "message.send",
          toSlot: to,
          payload: {
            text,
            page: "ai-assistant-relay",
          },
        },
        {
          provider: from === "ai1" || from === "ai2" || from === "ai0" ? from : "system",
          source: from === "ai1" || from === "ai2" || from === "ai0" ? from : "system",
          fromSlot: from === "ai1" || from === "ai2" || from === "ai0" ? from : "system",
        }
      );
      if (sendResult.success !== true) {
        throw new Error(sendResult.message ?? relayT("sendMessageUnavailable"));
      }
      return true;
    } catch (e) {
      const err = e as Error;
      this._logT(
        "warning",
        "app.logs.aiAssistantRelay.forwardingFailed",
        { message: err.message },
        {
          from,
          to,
        }
      );
      return false;
    }
  }

  async _handleRelayFlow(provider: string, text: string): Promise<void> {
    let target: string | null;

    if (provider === this._sourceSlot) {
      target = this._targetSlot;
    } else if (provider === this._targetSlot) {
      target = this._sourceSlot;
    } else {
      this._logT("warning", "app.logs.aiAssistantRelay.providerNotRecognized", {
        provider,
      });
      return;
    }

    if (target === null) {
      this._logT("warning", "app.logs.aiAssistantRelay.targetNull", {
        provider,
      });
      return;
    }

    await this._forwardMessage(provider, target, text);
  }

  checkThinkingTransition(provider: string, thinkingState: string): boolean {
    const prev = this._prevThinking[provider] ?? "idle";
    const transitionDetected = prev !== "idle" && thinkingState === "idle";

    if (prev !== thinkingState) {
      this._logT("debug", "app.logs.aiAssistantRelay.thinkingTransition", {
        provider,
        previousState: prev,
        thinkingState,
      });
    }

    this._prevThinking[provider] = thinkingState;
    return transitionDetected;
  }
}
