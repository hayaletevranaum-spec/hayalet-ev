import { LogCategory } from "@shared/logging-core";
import { Logger } from "../logger/index.js";
import { getErrorMessage } from "@shared/index.js";
import type { AppSettings } from "@shared/settings.js";

interface SettingsPayload {
  settings: AppSettings;
  changedPaths: string[];
}

type ListenerFn = (payload: SettingsPayload) => void;

export class Emitter {
  listeners: Set<ListenerFn>;

  constructor() {
    this.listeners = new Set();
  }
  on(fn: ListenerFn): () => void {
    if (typeof fn === "function") this.listeners.add(fn);
    return () => {
      this.off(fn);
    };
  }
  off(fn: ListenerFn): void {
    this.listeners.delete(fn);
  }
  emit(payload: SettingsPayload): void {
    for (const fn of Array.from(this.listeners)) {
      try {
        fn(payload);
      } catch (err: unknown) {
        Logger.warnT(
          LogCategory.SETTINGS,
          "app.logs.settings.listenerError",
          { message: getErrorMessage(err) },
          { error: getErrorMessage(err) }
        );
      }
    }
  }
}

export function createSettingsBroadcast(channelName = "app-settings"): {
  post: (msg: unknown) => void;
  on: (handler: (data: unknown) => unknown) => () => void;
} {
  try {
    const bc = new BroadcastChannel(channelName);
    const unref = (bc as BroadcastChannel & { unref?: (() => void) | undefined }).unref;
    if (typeof unref === "function") {
      unref.call(bc);
    }
    return {
      post: (msg: unknown): void => {
        bc.postMessage(msg);
      },
      on: (handler: (data: unknown) => unknown): (() => void) => {
        bc.onmessage = (e): void => {
          handler(e.data);
        };
        return () => {
          try {
            bc.onmessage = null;
            bc.close();
          } catch {}
        };
      },
    };
  } catch (err) {
    Logger.warnT(
      LogCategory.SETTINGS,
      "app.logs.settings.broadcastChannelCreateFailed",
      { channelName, message: getErrorMessage(err) },
      {
        channelName,
        error: getErrorMessage(err),
      }
    );
    return {
      post: (): void => {},
      on: () => () => {},
    };
  }
}
