import { getErrorMessage } from "@shared/index.js";
import { LogCategory } from "@shared/logging-core";
import { PROTOCOL_KEY } from "@slots";
import { START_STOP_PROTOCOL_HEADERS } from "../protocol-default-headers.js";
import { dispatchInternalSlotBridge } from "../commands/slot-bridge-runtime.js";
import { AppState } from "../app-state.js";
import { AppI18n } from "../i18n/index.js";
import { TrafficManager } from "../traffic-manager.js";
import { BaseRelay } from "./base-relay.js";

const US1_ASSISTANT_PROTOCOL_FALLBACK_TITLE =
  START_STOP_PROTOCOL_HEADERS.ANALYZE_AI_ASSISTANT_START;
const US1_POLL_INTERVAL_MS = 4000;
const AI0_DUPLICATE_WINDOW_MS = 2000;

interface SyncResult {
  messages?: { role?: string; text?: string; content?: string }[];
}

interface ArchivedMessage {
  id: string;
  role: string;
  text: string;
}

type RelaySessionRef = {
  id?: string;
  conversationId?: string;
};

function relayT(key: string, params?: Record<string, string>): string {
  return AppI18n.t(`app.logs.us1AssistantRelay.${key}`, params);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && Array.isArray(value) === false;
}

function readSessionRef(value: unknown): RelaySessionRef | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = typeof value["id"] === "string" ? value["id"].trim() : "";
  const conversationId =
    typeof value["conversationId"] === "string" ? value["conversationId"].trim() : "";

  if (id === "" && conversationId === "") {
    return null;
  }

  return {
    ...(id !== "" ? { id } : {}),
    ...(conversationId !== "" ? { conversationId } : {}),
  };
}

function readArchivedMessages(value: unknown): ArchivedMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((row) => {
    if (!isRecord(row)) {
      return [];
    }

    const id = typeof row["id"] === "string" ? row["id"].trim() : "";
    const role = typeof row["role"] === "string" ? row["role"].trim() : "";
    const textCandidate =
      typeof row["text"] === "string"
        ? row["text"]
        : typeof row["content"] === "string"
          ? row["content"]
          : "";
    const text = textCandidate.trim();

    if (id === "" || role === "") {
      return [];
    }

    return [{ id, role, text }];
  });
}

export class Us1AssistantRelay extends BaseRelay {
  _sourceSlot: "us1";
  _targetSlot: "ai0";
  _sessionState: string;
  _prevThinking: Record<string, string>;
  _sessionRef: RelaySessionRef | null;
  _pollTimer: number | null;
  _syncInFlight: boolean;
  _lastSeenUs1MessageId: string | null;
  _awaitingUs1Reply: boolean;
  _lastForwardedAi0Text: string;
  _lastForwardedAi0At: number;

  constructor(coreEngine: unknown) {
    super(coreEngine);
    this._sourceSlot = "us1";
    this._targetSlot = "ai0";
    this._sessionState = "idle";
    this._prevThinking = { ai0: "idle" };
    this._sessionRef = null;
    this._pollTimer = null;
    this._syncInFlight = false;
    this._lastSeenUs1MessageId = null;
    this._awaitingUs1Reply = false;
    this._lastForwardedAi0Text = "";
    this._lastForwardedAi0At = 0;
  }

  override handlesProvider(provider: string): boolean {
    return this._active === true && provider === this._targetSlot;
  }

  get sourceSlot(): "us1" {
    return this._sourceSlot;
  }

  override async start(): Promise<void> {
    if (AppState.hasUs1Identity() !== true) {
      throw new Error(relayT("sourceDisconnected", { source: this._sourceSlot }));
    }

    if (AppState.isAssigned(this._targetSlot) === false) {
      throw new Error(relayT("assistantDisconnected", { target: this._targetSlot }));
    }

    this._active = true;
    this._forwardCount = 0;
    this._sessionState = "idle";
    this._prevThinking = { ai0: "idle" };
    this._sessionRef = null;
    this._lastSeenUs1MessageId = null;
    this._awaitingUs1Reply = false;
    this._lastForwardedAi0Text = "";
    this._lastForwardedAi0At = 0;

    const sessionId = this._generateSessionId(LogCategory.RELAY);
    this._session = {
      id: sessionId,
      type: "us1-assistant",
      sourceSlot: this._sourceSlot,
      targetSlot: this._targetSlot,
      createdAt: Date.now(),
    };

    AppState.setAssistantRelay(true, this._sourceSlot);
    this._logT("info", "app.logs.us1AssistantRelay.started", {
      source: this._sourceSlot,
      target: this._targetSlot,
    });
    this._dispatchEvent("relay-changed", {
      active: true,
      type: "us1-assistant",
      sourceSlot: this._sourceSlot,
      targetSlot: this._targetSlot,
    });

    try {
      await this._sendProtocolToUs1();
      this._schedulePoll(0);
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  override async stop(): Promise<void> {
    const sessionId = this._session?.id;

    if (sessionId !== undefined && sessionId !== "") {
      this._logT("info", "app.logs.us1AssistantRelay.stoppedWithSession", {
        sessionId,
        source: this._sourceSlot,
        target: this._targetSlot,
      });
    } else {
      this._logT("info", "app.logs.us1AssistantRelay.stopped");
    }

    if (this._pollTimer !== null) {
      window.clearTimeout(this._pollTimer);
      this._pollTimer = null;
    }

    this._syncInFlight = false;
    this._sessionState = "idle";
    this._prevThinking = { ai0: "idle" };
    this._sessionRef = null;
    this._lastSeenUs1MessageId = null;
    this._awaitingUs1Reply = false;
    this._lastForwardedAi0Text = "";
    this._lastForwardedAi0At = 0;
    AppState.setAssistantRelay(false, null);
    this._syncUs1Indicators();
    this._resetState();

    this._dispatchEvent("relay-changed", { active: false, type: "us1-assistant" });
    await Promise.resolve();
  }

  override async handleThinkingComplete(
    provider: string,
    syncResult: SyncResult | null
  ): Promise<void> {
    try {
      if (provider !== this._targetSlot) {
        return;
      }

      if (syncResult === null || !Array.isArray(syncResult.messages)) {
        return;
      }

      const lastAssistant = [...syncResult.messages]
        .reverse()
        .find(
          (message) =>
            message.role === "assistant" && (message.text ?? message.content ?? "").trim() !== ""
        );
      const text = (lastAssistant?.text ?? lastAssistant?.content ?? "").trim();
      if (text === "") {
        return;
      }

      const now = Date.now();
      if (
        this._lastForwardedAi0Text === text &&
        now - this._lastForwardedAi0At < AI0_DUPLICATE_WINDOW_MS
      ) {
        this._logT("debug", "app.logs.us1AssistantRelay.duplicateMessageBlocked", {
          provider,
        });
        return;
      }

      this._lastForwardedAi0Text = text;
      this._lastForwardedAi0At = now;
      await this._sendAssistantTextToUs1(text);
    } catch (error) {
      this._logT("warning", "app.logs.us1AssistantRelay.handleThinkingCompleteError", {
        message: getErrorMessage(error),
      });
    }
  }

  checkThinkingTransition(provider: string, thinkingState: string): boolean {
    const prev = this._prevThinking[provider] ?? "idle";
    const transitionDetected = prev !== "idle" && thinkingState === "idle";

    this._prevThinking[provider] = thinkingState;
    return transitionDetected;
  }

  async _sendProtocolToUs1(): Promise<void> {
    this._sessionState = "protocol-sent";
    this._awaitingUs1Reply = true;
    this._syncUs1Indicators();
    this._logT("info", "app.logs.us1AssistantRelay.protocolSending", {
      provider: this._sourceSlot,
    });

    const sendResult = await dispatchInternalSlotBridge(
      {
        action: "message.send",
        fromSlot: "system",
        toSlot: this._sourceSlot,
        payload: {
          protocol: {
            protocolKey: PROTOCOL_KEY,
            fallbackTitle: US1_ASSISTANT_PROTOCOL_FALLBACK_TITLE,
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
      this._logT("warning", "app.logs.us1AssistantRelay.protocolSendFailed", {
        message: sendResult.message ?? relayT("protocolSendFailed", { message: "unknown" }),
      });
      throw new Error(sendResult.message ?? relayT("transportUnavailable"));
    }

    this._rememberSessionRef(sendResult);
    this._lastSeenUs1MessageId = await this._readLatestUs1AssistantMessageId();
    this._logT("info", "app.logs.us1AssistantRelay.protocolSent", {
      provider: this._sourceSlot,
    });
  }

  async _sendAssistantTextToUs1(text: string): Promise<void> {
    if (this._active !== true) {
      return;
    }

    this._awaitingUs1Reply = true;
    this._syncUs1Indicators();
    this._forwardCount += 1;
    this._logT(
      "info",
      "app.logs.us1AssistantRelay.forwarding",
      {
        count: this._forwardCount,
        from: this._targetSlot,
        to: this._sourceSlot,
      },
      {
        job: { from: this._targetSlot, to: this._sourceSlot },
        excerpt: text.slice(0, 200),
      }
    );

    const sendResult = await dispatchInternalSlotBridge(
      {
        action: "message.send",
        fromSlot: this._targetSlot,
        toSlot: this._sourceSlot,
        ...(this._sessionRef !== null ? { sessionRef: this._sessionRef } : {}),
        payload: {
          text,
        },
      },
      {
        provider: this._targetSlot,
        source: this._targetSlot,
        fromSlot: this._targetSlot,
      }
    );

    if (sendResult.success !== true) {
      this._awaitingUs1Reply = false;
      this._syncUs1Indicators();
      this._logT("warning", "app.logs.us1AssistantRelay.forwardingFailed", {
        message: sendResult.message ?? relayT("transportUnavailable"),
      });
      throw new Error(sendResult.message ?? relayT("transportUnavailable"));
    }

    this._rememberSessionRef(sendResult);
    this._sessionState = "relay-active";
  }

  async _forwardMessage(from: string, to: string, text: string): Promise<boolean> {
    if (AppState.isAssigned(to) === false) {
      this._logT("info", "app.logs.us1AssistantRelay.forwardSkippedTargetNotConnected", {
        target: to,
      });
      return false;
    }

    try {
      const taggedText = `${text}\n<!-- hev-sender:${from} -->`;
      const sendResult = await dispatchInternalSlotBridge(
        {
          action: "message.send",
          toSlot: to,
          payload: {
            text: taggedText,
            page: "us1-assistant-relay",
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

      this._logT(
        "info",
        "app.logs.us1AssistantRelay.forwarding",
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
      return true;
    } catch (error) {
      this._logT("warning", "app.logs.us1AssistantRelay.forwardingFailed", {
        message: getErrorMessage(error),
      });
      return false;
    }
  }

  _schedulePoll(delayMs = US1_POLL_INTERVAL_MS): void {
    if (this._active !== true || this._pollTimer !== null) {
      return;
    }

    this._pollTimer = window.setTimeout(() => {
      this._pollTimer = null;
      void this._pollUs1Messages();
    }, delayMs);
  }

  async _pollUs1Messages(): Promise<void> {
    if (this.isActive === false) {
      return;
    }

    if (this._syncInFlight === true) {
      this._schedulePoll();
      return;
    }

    this._syncInFlight = true;

    try {
      const syncResultRaw = await dispatchInternalSlotBridge(
        {
          action: "session.sync",
          toSlot: "us1",
          ...(typeof this._sessionRef?.id === "string" && this._sessionRef.id.trim() !== ""
            ? {
                sessionRef: {
                  id: this._sessionRef.id.trim(),
                },
              }
            : {}),
          payload: {
            includeMessages: true,
          },
        },
        {
          provider: "system",
          source: "system",
          fromSlot: "system",
        }
      );
      const syncResult: Record<string, unknown> = isRecord(syncResultRaw) ? syncResultRaw : {};

      if (syncResult["success"] !== true) {
        throw new Error(
          typeof syncResult["error"] === "string"
            ? syncResult["error"]
            : relayT("transportUnavailable")
        );
      }

      this._rememberSessionRef(syncResult);
      const syncData = isRecord(syncResult["data"]) ? syncResult["data"] : {};
      const messages = readArchivedMessages(syncData["messages"]);
      const newMessages = this._collectNewUs1Messages(messages);

      await newMessages.reduce<Promise<void>>(async (previous, message) => {
        await previous;
        this._lastSeenUs1MessageId = message.id;

        const text = message.text.trim();
        if (text === "" || this.isActive === false) {
          return;
        }

        this._forwardCount += 1;
        const forwarded = await this._forwardMessage(this._sourceSlot, this._targetSlot, text);
        if (forwarded) {
          this._awaitingUs1Reply = false;
          this._sessionState = "relay-active";
          this._syncUs1Indicators();
        }
      }, Promise.resolve());
    } catch (error) {
      this._logT("warning", "app.logs.us1AssistantRelay.syncFailed", {
        message: getErrorMessage(error),
      });
    } finally {
      this._syncInFlight = false;
      this._schedulePoll();
    }
  }

  async _readLatestUs1AssistantMessageId(): Promise<string | null> {
    const messages = await this._listConversationMessages(this._sessionRef);
    const latest = [...messages].reverse().find((message) => message.role === "assistant");
    return latest?.id ?? null;
  }

  async _listConversationMessages(sessionRef: RelaySessionRef | null): Promise<ArchivedMessage[]> {
    if (sessionRef === null) {
      return [];
    }

    const syncResult = await dispatchInternalSlotBridge(
      {
        action: "session.sync",
        toSlot: "us1",
        sessionRef: {
          ...(typeof sessionRef.id === "string" && sessionRef.id.trim() !== ""
            ? { id: sessionRef.id }
            : {}),
          ...(typeof sessionRef.conversationId === "string" &&
          sessionRef.conversationId.trim() !== ""
            ? { conversationId: sessionRef.conversationId }
            : {}),
        },
        payload: {
          includeMessages: true,
          skipTransportSync: true,
        },
      },
      {
        provider: "system",
        source: "system",
        fromSlot: "system",
      }
    );
    if (syncResult.success !== true) {
      return [];
    }

    this._rememberSessionRef(syncResult);
    const syncData = isRecord(syncResult.data) ? syncResult.data : {};
    return readArchivedMessages(syncData["messages"]);
  }

  _collectNewUs1Messages(messages: ArchivedMessage[]): ArchivedMessage[] {
    const assistantMessages = messages.filter(
      (message) => message.role === "assistant" && message.text !== ""
    );

    if (assistantMessages.length === 0) {
      return [];
    }

    if (this._lastSeenUs1MessageId === null) {
      const latest = assistantMessages[assistantMessages.length - 1];
      return latest !== undefined ? [latest] : [];
    }

    const seenIndex = assistantMessages.findIndex(
      (message) => message.id === this._lastSeenUs1MessageId
    );
    if (seenIndex === -1) {
      const latest = assistantMessages[assistantMessages.length - 1];
      return latest !== undefined ? [latest] : [];
    }

    return assistantMessages.slice(seenIndex + 1);
  }

  _rememberSessionRef(value: unknown): void {
    const directRef = readSessionRef(value);
    const nestedRef =
      directRef === null && isRecord(value) ? readSessionRef(value["session"]) : null;
    const localSessionId =
      directRef?.id ??
      nestedRef?.id ??
      (isRecord(value) && typeof value["localSessionId"] === "string"
        ? value["localSessionId"].trim()
        : "");
    const conversationId =
      directRef?.conversationId ??
      nestedRef?.conversationId ??
      (isRecord(value) && typeof value["conversationId"] === "string"
        ? value["conversationId"].trim()
        : "");

    if (localSessionId === "" && conversationId === "") {
      return;
    }

    this._sessionRef = {
      ...(this._sessionRef ?? {}),
      ...(localSessionId !== "" ? { id: localSessionId } : {}),
      ...(conversationId !== "" ? { conversationId } : {}),
    };
    if (this._session !== null) {
      this._session = {
        ...this._session,
        ...(localSessionId !== "" ? { localSessionId } : {}),
        ...(conversationId !== "" ? { conversationId } : {}),
      };
    }
  }

  _syncUs1Indicators(): void {
    TrafficManager.setIndicator(
      this._sourceSlot,
      "thinking",
      this._active === true && this._awaitingUs1Reply === true ? "busy" : "idle"
    );
  }
}
