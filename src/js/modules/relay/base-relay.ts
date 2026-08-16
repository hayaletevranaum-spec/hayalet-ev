import { LogCategory, LogLevel } from "@shared/logging-core";
import type { TranslationParams } from "@shared/i18n.js";
import { Logger } from "../logger/index.js";

interface RelaySession {
  id: string;
  startedAt?: number;
  createdAt?: number;
  sourceSlot?: string;
  targetSlot?: string;
  mode?: string;
  type?: string;
  providers?: string[];
  state?: string;
  lastTexts?: Record<string, string>;
  lastMessageTimes?: Record<string, number>;
  forwardCount?: number;
  protocolPayload?: unknown;
  attachments?: Array<{ name: string; path: string; mimeType?: string }>;
  [key: string]: unknown;
}

export interface SyncResult {
  success?: boolean;
  messages?: Array<{ role?: string; text?: string; content?: string; [key: string]: unknown }>;
  count?: number;
  conversationId?: string;
  webUrl?: string;
  added?: number;
  total?: number;
  newEntry?: boolean;
  commands?: Array<{ command: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

export class BaseRelay {
  _active: boolean;
  _session: RelaySession | null;
  _forwardCount: number;

  constructor(_coreEngine: unknown) {
    this._active = false;
    this._session = null;
    this._forwardCount = 0;
  }

  get isActive(): boolean {
    return this._active;
  }

  get session(): RelaySession | null {
    return this._session;
  }

  get forwardCount(): number {
    return this._forwardCount;
  }

  // eslint-disable-next-line @typescript-eslint/promise-function-async
  start(_opts = {}): Promise<void> {
    return Promise.reject(new Error("start() must be implemented by subclass"));
  }

  // eslint-disable-next-line @typescript-eslint/promise-function-async
  stop(): Promise<void> {
    return Promise.reject(new Error("stop() must be implemented by subclass"));
  }

  async stopProtocolSession(): Promise<void> {
    await this.stop();
  }

  // eslint-disable-next-line @typescript-eslint/promise-function-async
  handleThinkingComplete(_provider: string, _syncResult: SyncResult | null): Promise<void> {
    return Promise.reject(new Error("handleThinkingComplete() must be implemented by subclass"));
  }

  handlesProvider(_provider: string): boolean {
    return false;
  }

  _log(level: string, message: string, context: Record<string, unknown> = {}): void {
    const logContext = {
      relayType: this.constructor.name,
      ...context,
      ...(this._session?.id !== undefined ? { sessionId: this._session.id } : {}),
    };

    if (level === "error") {
      Logger.panel(LogCategory.RELAY, LogLevel.ERROR, message, logContext);
    } else if (level === "warning" || level === "warn") {
      Logger.panel(LogCategory.RELAY, LogLevel.WARNING, message, logContext);
    } else if (level === "debug") {
      Logger.debug(LogCategory.RELAY, message, logContext);
    } else {
      Logger.panel(LogCategory.RELAY, LogLevel.INFO, message, logContext);
    }
  }

  _logT(
    level: string,
    key: string,
    params?: TranslationParams,
    context: Record<string, unknown> = {}
  ): void {
    const logContext = {
      relayType: this.constructor.name,
      ...context,
      ...(this._session?.id !== undefined ? { sessionId: this._session.id } : {}),
    };

    if (level === "error") {
      Logger.errorT(LogCategory.RELAY, key, params, logContext);
    } else if (level === "warning" || level === "warn") {
      Logger.warnT(LogCategory.RELAY, key, params, logContext);
    } else if (level === "debug") {
      Logger.debugT(LogCategory.RELAY, key, params, logContext);
    } else {
      Logger.infoT(LogCategory.RELAY, key, params, logContext);
    }
  }

  _dispatchEvent(eventName: string, detail: Record<string, unknown> = {}): void {
    try {
      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail: {
            relayType: this.constructor.name,
            ...detail,
          },
        })
      );
    } catch {
      // NOTE: Ignore dispatch errors.
    }
  }

  _updateIndicatorElement(
    elementId: string,
    text: string,
    addClasses: string[] = [],
    removeClasses: string[] = []
  ): void {
    try {
      const el = document.getElementById(elementId);
      if (el === null) return;

      el.textContent = text;
      addClasses.forEach((cls) => {
        el.classList.add(cls);
      });
      removeClasses.forEach((cls) => {
        el.classList.remove(cls);
      });
    } catch {
      // NOTE: Ignore dispatch errors.
    }
  }

  _resetState(): void {
    this._active = false;
    this._session = null;
    this._forwardCount = 0;
  }

  _generateSessionId(prefix = LogCategory.RELAY): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}
