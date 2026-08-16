import { BaseRelay } from "./base-relay.js";
import type { SyncResult } from "./base-relay.js";
import { LogCategory } from "@shared/logging-core";
import { AppState } from "../app-state.js";
import { getErrorMessage } from "@shared/index.js";
import { AppI18n } from "../i18n/index.js";
import { dispatchInternalSlotBridge } from "../commands/slot-bridge-runtime.js";

interface ProtocolPayload {
  room?: string;
  scenario?: string;
  targets?: string[];
  [key: string]: unknown;
}

interface ProtocolAttachment {
  name: string;
  path: string;
  mimeType?: string;
}

interface ProtocolSessionOpts {
  providers?: string[];
  protocolPayload?: ProtocolPayload;
  attachments?: ProtocolAttachment[];
}

type RelayBridgeSource = "ai0" | "ai1" | "ai2" | "us1" | "system";

function relayT(key: string): string {
  return AppI18n.t(`app.logs.aiaiRelay.${key}`);
}

function normalizeRelayBridgeSource(value: string): RelayBridgeSource {
  return value === "ai0" || value === "ai1" || value === "ai2" || value === "us1"
    ? value
    : "system";
}

export class AIAIRelay extends BaseRelay {
  _providers: string[];
  _prevThinking: Record<string, string>;
  _lastMessageTimes: Record<string, number>;

  constructor(coreEngine: unknown) {
    super(coreEngine);
    this._providers = ["ai1", "ai2"];
    this._prevThinking = { ai1: "idle", ai2: "idle" };
    this._lastMessageTimes = { ai1: 0, ai2: 0 };
  }

  override handlesProvider(provider: string): boolean {
    return this._active === true && this._providers.includes(provider);
  }

  override async start(opts: { providers?: string[] } = {}): Promise<void> {
    this._providers =
      Array.isArray(opts.providers) && opts.providers.length > 0 ? opts.providers : ["ai1", "ai2"];

    this._active = true;
    this._forwardCount = 0;
    const provider0 = this._providers[0];
    const provider1 = this._providers[1];
    if (provider0 !== undefined && provider1 !== undefined) {
      this._lastMessageTimes = { [provider0]: 0, [provider1]: 0 };
    }

    this._logT("info", "app.logs.aiaiRelay.started", {
      providers: this._providers.join(","),
    });
    this._dispatchEvent("relay-changed", { active: true, type: "ai-ai" });
    await Promise.resolve();
  }

  async _dispatchRelayMessage(options: {
    from: string;
    targets: string[];
    text: string;
    page: string;
    attachments?: ProtocolAttachment[];
  }): Promise<void> {
    const attachments = Array.isArray(options.attachments) ? options.attachments : [];
    const bridgeSource: RelayBridgeSource =
      attachments.length > 0 ? "system" : normalizeRelayBridgeSource(options.from);
    const sendResult = await dispatchInternalSlotBridge(
      {
        action: "message.send",
        ...(options.targets.length === 1
          ? { toSlot: options.targets[0] }
          : { toSlots: options.targets }),
        payload: {
          text: options.text,
          page: options.page,
        },
        ...(attachments.length > 0
          ? {
              attachments: attachments.map((attachment) => ({
                name: attachment.name,
                path: attachment.path,
                ...(attachment.mimeType !== undefined ? { mimeType: attachment.mimeType } : {}),
              })),
            }
          : {}),
      },
      {
        provider: bridgeSource,
        source: bridgeSource,
        fromSlot: bridgeSource,
      }
    );
    if (sendResult.success !== true) {
      throw new Error(sendResult.message ?? relayT("sendMessageUnavailable"));
    }
  }

  async startProtocolSession(opts: ProtocolSessionOpts = {}): Promise<void> {
    try {
      const id = this._generateSessionId(LogCategory.RELAY);

      const providersArray = opts.providers ?? this._providers;
      const provider0 = providersArray[0];
      const provider1 = providersArray[1];
      if (provider0 === undefined || provider1 === undefined) {
        throw new Error(relayT("invalidProvidersInSession"));
      }

      this._session = {
        id,
        type: "protocol",
        providers: [...providersArray],
        protocolPayload: { ...opts.protocolPayload },
        attachments: Array.isArray(opts.attachments) ? [...opts.attachments] : [],
        state: "sent-to-ai1",
        lastMessageTimes: { [provider0]: 0, [provider1]: 0 },
        forwardCount: 0,
        createdAt: Date.now(),
      };

      this._providers = [...providersArray];
      this._active = true;
      this._lastMessageTimes = this._session.lastMessageTimes ?? {
        [provider0]: 0,
        [provider1]: 0,
      };

      const first = providersArray[0];
      if (first === undefined) throw new Error(relayT("firstProviderUndefined"));
      const protocolPayload = this._session.protocolPayload as Record<string, unknown> | undefined;
      const protocolMessage = protocolPayload?.["message"];
      const message = typeof protocolMessage === "string" ? protocolMessage : "";
      const attachments = this._session.attachments ?? [];

      this._logT("info", "app.logs.aiaiRelay.protocolSending", {
        sessionId: id,
        provider: first,
      });

      await this._dispatchRelayMessage({
        from: "system",
        targets: [first],
        text: message,
        page: "protocol-relay",
        attachments,
      });

      this._logT("info", "app.logs.aiaiRelay.protocolSent", {
        sessionId: id,
        provider: first,
      });
      this._dispatchEvent("relay-changed", { active: true, type: "ai-ai-protocol" });
    } catch (err) {
      this._logT("warning", "app.logs.aiaiRelay.protocolStartError", {
        message: getErrorMessage(err),
      });
      throw err;
    }
  }

  override async stop(): Promise<void> {
    const sessionId = this._session?.id;

    if (sessionId !== undefined && sessionId !== "") {
      this._logT("info", "app.logs.aiaiRelay.stoppedWithSession", {
        sessionId,
      });
    } else {
      this._logT("info", "app.logs.aiaiRelay.stopped");
    }

    this._resetState();
    this._prevThinking = { ai1: "idle", ai2: "idle" };
    this._lastMessageTimes = { ai1: 0, ai2: 0 };

    this._dispatchEvent("relay-changed", { active: false, type: "ai-ai" });
    await Promise.resolve();
  }

  override async stopProtocolSession(): Promise<void> {
    await this.stop();
  }

  override async handleThinkingComplete(
    provider: string,
    syncResult: SyncResult | null
  ): Promise<void> {
    try {
      if (syncResult === null || !Array.isArray(syncResult.messages)) return;

      const lastAssistant = [...syncResult.messages]
        .reverse()
        .find(
          (m) =>
            m.role === "assistant" &&
            (m.text !== undefined || m.content !== undefined) &&
            (m.text ?? m.content ?? "").trim() !== ""
        );

      const lastAssistantText = lastAssistant?.text ?? lastAssistant?.content;
      if (lastAssistantText == null) return;

      const text = lastAssistantText.trim();

      if (this._session?.type === "protocol") {
        await this._handleProtocolFlow(provider, text);
        return;
      }

      await this._handleSimpleRelayFlow(provider, text);
    } catch (err) {
      this._logT("warning", "app.logs.aiaiRelay.handleThinkingCompleteError", {
        message: getErrorMessage(err),
      });
    }
  }

  async _handleProtocolFlow(provider: string, text: string): Promise<void> {
    const s = this._session;
    if (s?.providers === undefined || s.lastMessageTimes === undefined) return;

    const [ai1, ai2] = s.providers;
    if (ai1 === undefined || ai2 === undefined) return;

    if (s.state === "sent-to-ai1" && provider === ai1) {
      const now = Date.now();
      if (s.lastMessageTimes[ai1] === now) return;
      s.lastMessageTimes[ai1] = now;

      this._logT(
        "info",
        "app.logs.aiaiRelay.protocolReplyReceived",
        {
          sessionId: s.id,
          provider: ai1,
        },
        {
          excerpt: text.slice(0, 200),
        }
      );

      const protocolPayload = s.protocolPayload as Record<string, unknown> | undefined;
      const protocolMessage = protocolPayload?.["message"];
      const baseMsg = typeof protocolMessage === "string" ? protocolMessage : "";
      const forwardText = `${baseMsg}\n\n[${ai1}]: ${text}`;
      s.state = "sent-to-ai2";

      try {
        await this._dispatchRelayMessage({
          from: ai1,
          targets: [ai2],
          text: forwardText,
          page: "protocol-relay",
          attachments: s.attachments ?? [],
        });
        this._logT("info", "app.logs.aiaiRelay.protocolForwarded", {
          sessionId: s.id,
          from: ai1,
          to: ai2,
        });
      } catch (e) {
        this._logT("warning", "app.logs.aiaiRelay.protocolForwardToFailed", {
          sessionId: s.id,
          to: ai2,
          message: getErrorMessage(e),
        });
      }
      return;
    }

    if ((s.state === "sent-to-ai2" || s.state === "relay-active") && provider === ai2) {
      const now = Date.now();
      if (s.lastMessageTimes[ai2] === now) return;
      s.lastMessageTimes[ai2] = now;

      s.state = "relay-active";
      s.forwardCount = (s.forwardCount ?? 0) + 1;
      this._forwardCount = s.forwardCount;

      this._logT(
        "info",
        "app.logs.aiaiRelay.protocolForwarding",
        {
          sessionId: s.id,
          from: ai2,
          to: ai1,
          count: s.forwardCount ?? 0,
        },
        { excerpt: text.slice(0, 200) }
      );

      try {
        await this._dispatchRelayMessage({
          from: ai2,
          targets: [ai1],
          text,
          page: "relay",
        });
      } catch (e) {
        this._logT("warning", "app.logs.aiaiRelay.protocolForwardFailed", {
          sessionId: s.id,
          from: ai2,
          to: ai1,
          message: getErrorMessage(e),
        });
      }
      return;
    }

    if (s.state === "relay-active" && provider === ai1) {
      const now = Date.now();
      if (s.lastMessageTimes[ai1] === now) return;
      s.lastMessageTimes[ai1] = now;

      s.forwardCount = (s.forwardCount ?? 0) + 1;
      this._forwardCount = s.forwardCount;

      this._logT(
        "info",
        "app.logs.aiaiRelay.protocolForwarding",
        {
          sessionId: s.id,
          from: ai1,
          to: ai2,
          count: s.forwardCount ?? 0,
        },
        { excerpt: text.slice(0, 200) }
      );

      try {
        await this._dispatchRelayMessage({
          from: ai1,
          targets: [ai2],
          text,
          page: "relay",
        });
      } catch (e) {
        this._logT("warning", "app.logs.aiaiRelay.protocolForwardFailed", {
          sessionId: s.id,
          from: ai1,
          to: ai2,
          message: getErrorMessage(e),
        });
      }
    }
  }

  async _handleSimpleRelayFlow(provider: string, text: string): Promise<void> {
    const now = Date.now();
    if (this._lastMessageTimes[provider] === now) return;
    this._lastMessageTimes[provider] = now;

    const target = this._determineTarget(provider);
    if (target === "") {
      this._logT("warning", "app.logs.aiaiRelay.targetUndetermined");
      return;
    }

    if (AppState.isAssigned(target) === false) {
      this._logT("info", "app.logs.aiaiRelay.relaySkippedTargetNotConnected", {
        target,
      });
      return;
    }

    this._forwardCount += 1;
    this._logT(
      "info",
      "app.logs.aiaiRelay.relayForwarding",
      {
        count: this._forwardCount,
        from: provider,
        to: target,
      },
      {
        job: { from: provider, to: target },
        excerpt: text.slice(0, 200),
      }
    );

    try {
      await this._dispatchRelayMessage({
        from: provider,
        targets: [target],
        text,
        page: "relay",
      });
    } catch (err) {
      this._logT(
        "warning",
        "app.logs.aiaiRelay.relayForwardingFailed",
        {
          message: getErrorMessage(err),
        },
        {
          from: provider,
          to: target,
        }
      );
    }
  }

  _determineTarget(source: string): string {
    const idx = this._providers.indexOf(source);
    if (idx === -1) return this._providers[0] ?? "";
    return this._providers[(idx + 1) % this._providers.length] ?? "";
  }

  checkThinkingTransition(provider: string, thinkingState: string): boolean {
    const prev = this._prevThinking[provider] ?? "idle";
    this._prevThinking[provider] = thinkingState;
    return prev !== "idle" && thinkingState === "idle";
  }
}
