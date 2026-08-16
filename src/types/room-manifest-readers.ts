import {
  hasDuplicateValues,
  isRecord,
  isValidRoomCommandName,
  normalizeRoomRelativePath,
  readOptionalString,
  readRequiredString,
} from "./room-validation-primitives.js";
import type {
  RoomCommandExposure,
  RoomCommandScope,
  RoomCommandSpec,
  RoomI18nConfig,
  RoomMenuConfig,
  RoomProtocolSpec,
  RoomRuntimeConfig,
} from "./rooms.js";

const LEGACY_ASSISTANT_SCOPE = "ai0";
const ROOM_COMMAND_SCOPES = ["room-ui", "ai-slots", "assistant", "us1", "system"] as const;
const ROOM_COMMAND_EXPOSURES = ["public", "internal"] as const;

function isRoomCommandScope(value: string): value is RoomCommandScope {
  return ROOM_COMMAND_SCOPES.includes(value as RoomCommandScope);
}

function isRoomCommandExposure(value: string): value is RoomCommandExposure {
  return ROOM_COMMAND_EXPOSURES.includes(value as RoomCommandExposure);
}

export function readMenuConfig(
  record: Record<string, unknown>,
  errors: string[]
): RoomMenuConfig | undefined {
  const menuRaw = record["menu"];
  if (!isRecord(menuRaw)) {
    errors.push("menu is required");
    return undefined;
  }

  const label = readRequiredString(menuRaw, "label", errors);
  const icon = readOptionalString(menuRaw, "icon", errors);
  const iconSrcRaw = readOptionalString(menuRaw, "iconSrc", errors);
  const iconSrc = iconSrcRaw !== undefined ? normalizeRoomRelativePath(iconSrcRaw) : undefined;
  if (iconSrcRaw !== undefined && iconSrc === null) {
    errors.push("menu.iconSrc must be a safe relative path");
  }
  const orderRaw = menuRaw["order"];
  let order: number | undefined;
  if (orderRaw !== undefined) {
    if (typeof orderRaw !== "number" || Number.isFinite(orderRaw) === false) {
      errors.push("menu.order must be a number");
    } else {
      order = orderRaw;
    }
  }

  if (label === undefined) {
    return undefined;
  }

  return {
    label,
    ...(icon !== undefined ? { icon } : {}),
    ...(iconSrc !== undefined && iconSrc !== null ? { iconSrc } : {}),
    ...(order !== undefined ? { order } : {}),
  };
}

export function readRuntimeConfig(
  record: Record<string, unknown>,
  errors: string[]
): RoomRuntimeConfig | undefined {
  const runtimeRaw = record["runtime"];
  if (!isRecord(runtimeRaw)) {
    errors.push("runtime is required");
    return undefined;
  }

  const uiEntryRaw = readRequiredString(runtimeRaw, "uiEntry", errors);
  const hostEntryRaw = readRequiredString(runtimeRaw, "hostEntry", errors);
  const uiEntry = uiEntryRaw !== undefined ? normalizeRoomRelativePath(uiEntryRaw) : null;
  const hostEntry = hostEntryRaw !== undefined ? normalizeRoomRelativePath(hostEntryRaw) : null;
  if (uiEntryRaw !== undefined && uiEntry === null) {
    errors.push("runtime.uiEntry must be a safe relative path");
  }
  if (hostEntryRaw !== undefined && hostEntry === null) {
    errors.push("runtime.hostEntry must be a safe relative path");
  }

  if (uiEntry === null || hostEntry === null) {
    return undefined;
  }

  return {
    uiEntry,
    hostEntry,
  };
}

export function readCommandSpecs(
  rawValue: unknown,
  path: string,
  errors: string[]
): RoomCommandSpec[] | undefined {
  if (rawValue === undefined) {
    return undefined;
  }

  if (!Array.isArray(rawValue)) {
    errors.push(`${path} must be an array`);
    return undefined;
  }

  const parsed: RoomCommandSpec[] = [];
  rawValue.forEach((item, index) => {
    if (!isRecord(item)) {
      errors.push(`${path}[${String(index)}] must be an object`);
      return;
    }
    const commandName = readRequiredString(item, "name", errors);
    if (commandName !== undefined && isValidRoomCommandName(commandName) === false) {
      errors.push(`${path}[${String(index)}].name must match /^[A-Za-z0-9_]+$/`);
    }
    const descriptionValue = readOptionalString(item, "description", errors);
    const scopeRaw = item["scope"];
    const exposureRaw = item["exposure"];
    let scope: RoomCommandScope | undefined;
    let exposure: RoomCommandExposure | undefined;
    if (scopeRaw !== undefined) {
      if (typeof scopeRaw !== "string") {
        errors.push(`${path}[${String(index)}].scope is invalid`);
      } else if (scopeRaw !== LEGACY_ASSISTANT_SCOPE && isRoomCommandScope(scopeRaw) === false) {
        errors.push(`${path}[${String(index)}].scope is invalid`);
      } else {
        scope = scopeRaw === LEGACY_ASSISTANT_SCOPE ? "assistant" : scopeRaw;
      }
    }
    if (exposureRaw !== undefined) {
      if (typeof exposureRaw !== "string" || isRoomCommandExposure(exposureRaw) === false) {
        errors.push(`${path}[${String(index)}].exposure is invalid`);
      } else {
        exposure = exposureRaw;
      }
    }
    if (commandName !== undefined) {
      parsed.push({
        name: commandName,
        ...(descriptionValue !== undefined ? { description: descriptionValue } : {}),
        ...(scope !== undefined ? { scope } : {}),
        ...(exposure !== undefined ? { exposure } : {}),
      });
    }
  });

  if (hasDuplicateValues(parsed.map((item) => item.name))) {
    errors.push(`${path} names must be unique`);
  }

  return parsed;
}

export function readProtocolSpecs(
  rawValue: unknown,
  path: string,
  errors: string[]
): RoomProtocolSpec[] | undefined {
  if (rawValue === undefined) {
    return undefined;
  }

  if (!Array.isArray(rawValue)) {
    errors.push(`${path} must be an array`);
    return undefined;
  }

  const parsed: RoomProtocolSpec[] = [];
  rawValue.forEach((item, index) => {
    if (!isRecord(item)) {
      errors.push(`${path}[${String(index)}] must be an object`);
      return;
    }
    const key = readRequiredString(item, "key", errors);
    const room = readRequiredString(item, "room", errors);
    const scenario = readRequiredString(item, "scenario", errors);
    const title = readRequiredString(item, "title", errors);
    const protocolPathRaw = readOptionalString(item, "path", errors);
    const protocolPath =
      protocolPathRaw !== undefined ? normalizeRoomRelativePath(protocolPathRaw) : null;
    if (protocolPathRaw !== undefined && protocolPath === null) {
      errors.push(`${path}[${String(index)}].path must be a safe relative path`);
    }
    const editableRaw = item["editable"];
    let editable: boolean | undefined;
    if (editableRaw !== undefined) {
      if (typeof editableRaw !== "boolean") {
        errors.push(`${path}[${String(index)}].editable must be boolean`);
      } else {
        editable = editableRaw;
      }
    }
    if (key !== undefined && room !== undefined && scenario !== undefined && title !== undefined) {
      parsed.push({
        key,
        room,
        scenario,
        title,
        ...(editable !== undefined ? { editable } : {}),
        ...(protocolPath !== null ? { path: protocolPath } : {}),
      });
    }
  });

  if (hasDuplicateValues(parsed.map((item) => item.key))) {
    errors.push(`${path} keys must be unique`);
  }

  return parsed;
}

export function readI18nConfig(rawValue: unknown, errors: string[]): RoomI18nConfig | undefined {
  if (rawValue === undefined) {
    return undefined;
  }

  if (!isRecord(rawValue)) {
    errors.push("i18n must be an object");
    return undefined;
  }

  const baseDirRaw = readRequiredString(rawValue, "baseDir", errors);
  const baseDir = baseDirRaw !== undefined ? normalizeRoomRelativePath(baseDirRaw) : null;
  if (baseDirRaw !== undefined && baseDir === null) {
    errors.push("i18n.baseDir must be a safe relative path");
  }

  if (baseDir === null) {
    return undefined;
  }

  return { baseDir };
}
