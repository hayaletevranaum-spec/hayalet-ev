import { LogCategory } from "@shared/logging-core";
import type { AppSettings } from "@shared/settings.js";
import { defaultSettings, normalizeSettings, getChangedPaths } from "./settings/settings-schema.js";
import { Emitter, createSettingsBroadcast } from "./settings/settings-events.js";
import { ipcLoadSettings, ipcSaveSettings } from "./settings/settings-ipc.js";
import { Logger } from "./logger/index.js";

function deepClone<T>(obj: T): T {
  return obj !== null && obj !== undefined ? (JSON.parse(JSON.stringify(obj)) as T) : obj;
}

function setByPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown
): Record<string, unknown> {
  const parts = String(path).split(".").filter(Boolean);
  if (parts.length === 0) return obj;
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (p === undefined || p === "") continue;
    if (cur[p] === undefined || cur[p] === null || typeof cur[p] !== "object") cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  const lastPart = parts[parts.length - 1];
  if (lastPart !== undefined && lastPart !== "") {
    cur[lastPart] = value;
  }
  return obj;
}

interface SettingsBroadcast {
  on: (callback: (msg: unknown) => void) => () => void;
  post: (msg: unknown) => void;
}

class SettingsManagerClass {
  _settings: AppSettings;
  _loaded: boolean;
  _emitter: Emitter;
  _lastSaved: AppSettings;
  _broadcast: SettingsBroadcast;
  _stopBroadcast: () => void;

  constructor() {
    this._settings = defaultSettings();
    this._loaded = false;
    this._emitter = new Emitter();
    this._lastSaved = defaultSettings();
    this._broadcast = createSettingsBroadcast("app-settings");
    this._stopBroadcast = this._broadcast.on((data) => {
      const msg = data as { type?: string; payload?: unknown };
      if (msg.type !== "settings-changed") {
        return;
      }

      if (msg.payload !== null && msg.payload !== undefined && typeof msg.payload === "object") {
        const next = normalizeSettings(msg.payload);
        const changedPaths = getChangedPaths(this._settings, next);
        const hasNoChanges = changedPaths.length === 1 && changedPaths[0] === "*";

        this._settings = next;
        this._lastSaved = next;
        this._loaded = true;

        if (hasNoChanges) {
          return;
        }

        this._emitter.emit({ settings: this._settings, changedPaths });
      }
    });
  }

  getSnapshot(): AppSettings {
    return this._settings;
  }

  get settings(): AppSettings {
    return this._settings;
  }

  async load(options: { force?: boolean } = {}): Promise<AppSettings> {
    const force = options.force === true;

    if (this._loaded === true && force === false) {
      return this._settings;
    }

    const loaded = await ipcLoadSettings();
    this._settings = normalizeSettings(loaded);

    this._lastSaved = this._settings;
    this._loaded = true;

    this._emitter.emit({ settings: this._settings, changedPaths: ["*"] });

    return this._settings;
  }

  async reload(): Promise<AppSettings> {
    return await this.load({ force: true });
  }

  get(path?: string): unknown {
    if (path === undefined || path === "") return this._settings;
    const parts = String(path).split(".");
    let cur: unknown = this._settings;
    for (const p of parts) {
      cur =
        cur !== null && typeof cur === "object" && p in cur
          ? (cur as Record<string, unknown>)[p]
          : {};
    }
    return cur;
  }

  subscribe(listener: (event: { settings: unknown; changedPaths: string[] }) => void): () => void {
    return this._emitter.on(listener);
  }

  async save(nextSettings: Record<string, unknown>): Promise<boolean> {
    const next = normalizeSettings(nextSettings);
    const changedPaths = getChangedPaths(this._lastSaved, next);
    const hasNoChanges = changedPaths.length === 1 && changedPaths[0] === "*";

    this._settings = next;
    this._loaded = true;

    if (hasNoChanges) {
      this._lastSaved = next;
      return true;
    }

    await ipcSaveSettings(next);

    this._lastSaved = next;

    this._emitter.emit({ settings: this._settings, changedPaths });
    this._broadcast.post({ type: "settings-changed", payload: this._settings });

    return true;
  }

  async set(path: string, value: unknown): Promise<boolean> {
    const next = deepClone(this._settings) as Record<string, unknown>;
    setByPath(next, path, value);
    return await this.save(next);
  }

  async patch(
    fnOrPartial: ((settings: Record<string, unknown>) => void) | Record<string, unknown>
  ): Promise<boolean> {
    const next = deepClone(this._settings);
    if (typeof fnOrPartial === "function") {
      fnOrPartial(next);
    } else if (typeof fnOrPartial === "object") {
      Object.assign(next, fnOrPartial);
    }
    return await this.save(next);
  }

  async resetToDefaults(): Promise<boolean> {
    Logger.warnT(LogCategory.SETTINGS, "app.logs.settings.resetToDefaults");
    const defaults = defaultSettings();
    return await this.save(defaults);
  }
}

const settingsManager = new SettingsManagerClass();

export { settingsManager, settingsManager as SettingsManager };
