import type { InstalledRoomRecord } from "@shared/index.js";

export type RoomPackageTranslationParams = Record<string, string | number | boolean>;

export type RoomPackageTranslator = (
  key: string,
  params?: RoomPackageTranslationParams
) => Promise<string>;

export type RoomPackageErrorTranslator = (
  key: string,
  detail?: unknown,
  params?: RoomPackageTranslationParams
) => Promise<string>;

export interface RoomOperationResult {
  success: boolean;
  error?: string;
  room?: InstalledRoomRecord;
  path?: string;
  restartRequired?: boolean;
}
