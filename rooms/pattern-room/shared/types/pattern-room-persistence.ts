import type { PatternRoomSessionSnapshot } from "./pattern-room-snapshot.js";

export const PATTERN_ROOM_SAVE_COMMAND = "pattern:save" as const;
export const PATTERN_ROOM_LOAD_COMMAND = "pattern:load" as const;
export const PATTERN_ROOM_SAVED_EVENT = "pattern:saved" as const;
export const PATTERN_ROOM_LOADED_EVENT = "pattern:loaded" as const;
export const PATTERN_ROOM_SAVE_FAILED_EVENT = "pattern:save-failed" as const;

export type PatternRoomSaveCommand = typeof PATTERN_ROOM_SAVE_COMMAND;
export type PatternRoomLoadCommand = typeof PATTERN_ROOM_LOAD_COMMAND;
export type PatternRoomSavedEvent = typeof PATTERN_ROOM_SAVED_EVENT;
export type PatternRoomLoadedEvent = typeof PATTERN_ROOM_LOADED_EVENT;
export type PatternRoomSaveFailedEvent = typeof PATTERN_ROOM_SAVE_FAILED_EVENT;

export type PatternRoomSaveCommandPayload = {
  flush?: boolean;
  snapshot: PatternRoomSessionSnapshot;
};

export type PatternRoomLoadCommandPayload = {
  topicId: string;
};

export type PatternRoomSavedEventPayload = {
  success: true;
};

export type PatternRoomLoadedEventPayload = {
  snapshot: PatternRoomSessionSnapshot | null;
};

export type PatternRoomSaveFailedEventPayload = {
  error: string;
  success: false;
};

export type PatternRoomPersistenceCommand = PatternRoomSaveCommand | PatternRoomLoadCommand;

export type PatternRoomPersistenceEvent =
  PatternRoomSavedEvent | PatternRoomLoadedEvent | PatternRoomSaveFailedEvent;
