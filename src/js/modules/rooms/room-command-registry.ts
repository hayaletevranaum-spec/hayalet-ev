import type { InstalledRoomRecord, RoomCommandExposure, RoomCommandScope } from "@shared/index.js";
import { AppI18n } from "../i18n/index.js";
import { matchVoiceCommand, type VoiceCommandSpec } from "../transcript/voice-command-matcher.js";

export type RoomCommandCategory = "ai1-ai2" | "ai0" | "us1";

export interface RoomCommandMetadata {
  roomId: string;
  name: string;
  description: string;
  scope: RoomCommandScope;
  category: RoomCommandCategory;
  exposure: RoomCommandExposure;
}

export interface RoomCommandHandlerPayload extends Record<string, unknown> {
  roomId: string;
  roomCommand: string;
  roomArgs: unknown;
  rawArgs: string;
  roomPayload?: unknown;
}

export type RoomCommandHandler = (payload: RoomCommandHandlerPayload) => unknown;

interface RoomCommandEntry {
  metadata: RoomCommandMetadata;
  handler?: RoomCommandHandler;
}

export interface RoomVoiceCommandMatch {
  commandName: string;
  matchedPhrase: string;
}

function normalizeCommandName(commandName: string): string {
  return commandName.trim().toLowerCase();
}

function normalizeRoomCommandKey(roomId: string, commandName: string): string {
  return `${roomId.trim().toLowerCase()}:${normalizeCommandName(commandName)}`;
}

function scopeToCategory(scope: RoomCommandScope): RoomCommandCategory {
  if (scope === "assistant") {
    return "ai0";
  }
  if (scope === "us1") {
    return "us1";
  }
  return "ai1-ai2";
}

function normalizeScope(scope: RoomCommandScope | undefined): RoomCommandScope {
  return scope ?? "system";
}

function normalizeDescription(
  description: string | undefined,
  roomId: string,
  name: string
): string {
  const trimmed = description?.trim() ?? "";
  return trimmed !== "" ? trimmed : `${roomId} room command: ${name}`;
}

function normalizeExposure(exposure: RoomCommandExposure | undefined): RoomCommandExposure {
  return exposure === "internal" ? "internal" : "public";
}

function roomCommandT(key: string, params?: Record<string, string | number>): string {
  return AppI18n.t(`app.roomPage.commandErrors.${key}`, params);
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && Array.isArray(value) === false) {
    return value as Record<string, unknown>;
  }
  return {};
}

function parseRoomArgs(args: string): unknown {
  const trimmed = args.trim();
  if (trimmed === "") {
    return null;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed;
  }
}

function isScopeAllowed(scope: RoomCommandScope, provider: string): boolean {
  if (provider === "room-ui") {
    return scope === "room-ui" || scope === "system";
  }

  if (provider === "ai0") {
    return scope === "assistant" || scope === "system";
  }

  if (provider === "ai1" || provider === "ai2") {
    return scope === "ai-slots" || scope === "system";
  }

  if (provider === "us1") {
    return scope === "us1" || scope === "system";
  }

  return false;
}

class RoomCommandRegistryClass {
  private entries = new Map<string, RoomCommandEntry>();
  private voiceCommandSpecs = new Map<string, VoiceCommandSpec[]>();
  private voiceCommandEnabled = new Map<string, boolean>();

  syncInstalledRooms(rooms: InstalledRoomRecord[]): void {
    const nextEntries = new Map<string, RoomCommandEntry>();

    rooms.forEach((room) => {
      (room.commandSpecs ?? []).forEach((spec) => {
        if (normalizeCommandName(spec.name) === "") {
          return;
        }

        const key = normalizeRoomCommandKey(room.id, spec.name);
        const current = nextEntries.get(key) ?? this.entries.get(key);

        const metadata: RoomCommandMetadata = {
          roomId: room.id,
          name: spec.name,
          description: normalizeDescription(spec.description, room.id, spec.name),
          scope: normalizeScope(spec.scope),
          category: scopeToCategory(normalizeScope(spec.scope)),
          exposure: normalizeExposure(spec.exposure),
        };

        nextEntries.set(key, {
          metadata,
          ...(current?.handler !== undefined ? { handler: current.handler } : {}),
        });
      });
    });

    this.entries = nextEntries;
  }

  registerHandler(
    roomId: string,
    commandName: string,
    handler: RoomCommandHandler,
    options: {
      description?: string;
      exposure?: RoomCommandExposure;
      scope?: RoomCommandScope;
    } = {}
  ): void {
    const key = normalizeCommandName(commandName);
    if (key === "") {
      throw new Error(roomCommandT("commandNameRequired"));
    }

    const roomKey = normalizeRoomCommandKey(roomId, commandName);
    const existing = this.entries.get(roomKey);

    const scope = normalizeScope(options.scope ?? existing?.metadata.scope);
    const metadata: RoomCommandMetadata = {
      roomId,
      name: existing?.metadata.name ?? commandName,
      description: normalizeDescription(
        options.description ?? existing?.metadata.description,
        roomId,
        commandName
      ),
      scope,
      category: scopeToCategory(scope),
      exposure: normalizeExposure(options.exposure ?? existing?.metadata.exposure),
    };

    this.entries.set(roomKey, {
      metadata,
      handler,
    });
  }

  unregisterRoom(roomId: string): void {
    Array.from(this.entries.entries()).forEach(([key, entry]) => {
      if (entry.metadata.roomId === roomId) {
        this.entries.delete(key);
      }
    });
    this.voiceCommandSpecs.delete(roomId);
    this.voiceCommandEnabled.delete(roomId);
  }

  private resolveEntry(commandName: string, roomId?: string | null): RoomCommandEntry | undefined {
    const normalizedCommandName = normalizeCommandName(commandName);
    if (normalizedCommandName === "") {
      return undefined;
    }

    const normalizedRoomId = typeof roomId === "string" ? roomId.trim() : "";
    if (normalizedRoomId !== "") {
      return this.entries.get(normalizeRoomCommandKey(normalizedRoomId, commandName));
    }

    const matches = Array.from(this.entries.values()).filter(
      (entry) => normalizeCommandName(entry.metadata.name) === normalizedCommandName
    );
    return matches.length === 1 ? matches[0] : undefined;
  }

  has(commandName: string, roomId?: string | null): boolean {
    return this.resolveEntry(commandName, roomId) !== undefined;
  }

  getMetadata(commandName: string, roomId?: string | null): RoomCommandMetadata | null {
    return this.resolveEntry(commandName, roomId)?.metadata ?? null;
  }

  listCommands(category?: RoomCommandCategory): string[] {
    return Array.from(this.entries.values())
      .filter((entry) => (category !== undefined ? entry.metadata.category === category : true))
      .map((entry) => entry.metadata.name)
      .sort((left, right) => left.localeCompare(right));
  }

  listPublicCommands(category?: RoomCommandCategory): string[] {
    return Array.from(this.entries.values())
      .filter((entry) => entry.metadata.exposure === "public")
      .filter((entry) => (category !== undefined ? entry.metadata.category === category : true))
      .map((entry) => entry.metadata.name)
      .sort((left, right) => left.localeCompare(right));
  }

  listMetadata(
    category?: RoomCommandCategory,
    options: { publicOnly?: boolean } = {}
  ): RoomCommandMetadata[] {
    return Array.from(this.entries.values())
      .filter((entry) =>
        options.publicOnly === true ? entry.metadata.exposure === "public" : true
      )
      .filter((entry) => (category !== undefined ? entry.metadata.category === category : true))
      .map((entry) => entry.metadata)
      .sort((left, right) => {
        const nameOrder = left.name.localeCompare(right.name);
        return nameOrder !== 0 ? nameOrder : left.roomId.localeCompare(right.roomId);
      });
  }

  getCatalog(category?: RoomCommandCategory): Array<{
    name: string;
    category: RoomCommandCategory;
    isCustom: boolean;
    supportsTestMode: boolean;
  }> {
    return Array.from(this.entries.values())
      .filter((entry) => entry.metadata.exposure === "public")
      .filter((entry) => (category !== undefined ? entry.metadata.category === category : true))
      .map((entry) => ({
        name: entry.metadata.name,
        category: entry.metadata.category,
        isCustom: true,
        supportsTestMode: false,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  getDescriptionText(commandName: string): string {
    const metadata = this.getMetadata(commandName);
    if (metadata === null) {
      return "";
    }

    return `${metadata.description}\n\nRoom: ${metadata.roomId}\nScope: ${metadata.scope}`;
  }

  registerVoiceCommands(
    roomId: string,
    commands: Record<string, readonly string[]>,
    options: { enabled?: boolean } = {}
  ): void {
    const specs = Object.entries(commands)
      .map(([commandName, phrases]): VoiceCommandSpec | null => {
        const metadata = this.getMetadata(commandName, roomId);
        if (metadata?.roomId !== roomId || metadata.scope !== "room-ui") {
          return null;
        }
        const normalizedPhrases = phrases
          .map((phrase) => phrase.trim())
          .filter((phrase, index, list) => phrase !== "" && list.indexOf(phrase) === index);
        return normalizedPhrases.length === 0
          ? null
          : { id: metadata.name, phrases: normalizedPhrases };
      })
      .filter((spec): spec is VoiceCommandSpec => spec !== null);

    if (specs.length === 0) {
      this.voiceCommandSpecs.delete(roomId);
      this.voiceCommandEnabled.delete(roomId);
      return;
    }

    this.voiceCommandSpecs.set(roomId, specs);
    this.voiceCommandEnabled.set(roomId, options.enabled === true);
  }

  setVoiceCommandsEnabled(roomId: string, enabled: boolean): void {
    if (this.voiceCommandSpecs.has(roomId) !== true) {
      this.voiceCommandEnabled.delete(roomId);
      return;
    }

    this.voiceCommandEnabled.set(roomId, enabled);
  }

  areVoiceCommandsEnabled(roomId: string): boolean {
    return this.voiceCommandEnabled.get(roomId) === true;
  }

  matchVoiceCommand(roomId: string, text: string): RoomVoiceCommandMatch | null {
    if (this.areVoiceCommandsEnabled(roomId) !== true) {
      return null;
    }

    const match = matchVoiceCommand(text, this.voiceCommandSpecs.get(roomId) ?? []);
    return match === null
      ? null
      : {
          commandName: match.id,
          matchedPhrase: match.matchedPhrase,
        };
  }

  async run(commandName: string, payload: Record<string, unknown> = {}): Promise<unknown> {
    const payloadRoomId = typeof payload["roomId"] === "string" ? payload["roomId"] : null;
    const entry = this.resolveEntry(commandName, payloadRoomId);
    if (entry === undefined) {
      return { success: false, message: roomCommandT("undefinedCommand") };
    }

    if (entry.handler === undefined) {
      return { success: false, message: roomCommandT("hostNotReady") };
    }

    const provider = typeof payload["provider"] === "string" ? payload["provider"] : "";
    if (isScopeAllowed(entry.metadata.scope, provider) !== true) {
      return { success: false, message: roomCommandT("outOfScope") };
    }

    const rawArgs = typeof payload["args"] === "string" ? payload["args"] : "";
    const roomPayload = payload["roomPayload"];
    const roomArgs = roomPayload !== undefined ? roomPayload : parseRoomArgs(rawArgs);
    const normalizedPayload: RoomCommandHandlerPayload = {
      ...toRecord(payload),
      roomId: entry.metadata.roomId,
      roomCommand: entry.metadata.name,
      roomArgs,
      rawArgs,
      ...(roomPayload !== undefined ? { roomPayload } : {}),
    };

    return await entry.handler(normalizedPayload);
  }

  reset(): void {
    this.entries.clear();
    this.voiceCommandSpecs.clear();
    this.voiceCommandEnabled.clear();
  }
}

const roomCommandRegistry = new RoomCommandRegistryClass();

export { roomCommandRegistry as RoomCommandRegistry };
