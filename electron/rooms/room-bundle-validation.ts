import type { RoomBundle, RoomBundleFile } from "@shared/index.js";
import {
  ROOM_SCHEMA_VERSION,
  collectRoomManifestRequiredFilePaths,
  normalizeRoomRelativePath,
  validateRoomManifest,
} from "@shared/index.js";

export interface RoomBundleValidationResult {
  valid: boolean;
  errors: string[];
  bundle?: RoomBundle;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && Array.isArray(value) === false;
}

export function validateRoomBundle(candidate: unknown): RoomBundleValidationResult {
  const errors: string[] = [];

  if (isRecord(candidate) === false) {
    return {
      valid: false,
      errors: ["bundle must be an object"],
    };
  }

  if (candidate["schemaVersion"] !== ROOM_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${String(ROOM_SCHEMA_VERSION)}`);
  }

  const manifestValidation = validateRoomManifest(candidate["manifest"]);
  if (manifestValidation.valid !== true || manifestValidation.manifest === undefined) {
    errors.push(...manifestValidation.errors.map((error) => `manifest.${error}`));
  }

  const filesRaw = candidate["files"];
  const files: Record<string, RoomBundleFile> = {};

  if (isRecord(filesRaw) === false) {
    errors.push("files must be an object");
  } else {
    for (const [rawPath, rawValue] of Object.entries(filesRaw)) {
      const relativePath = normalizeRoomRelativePath(rawPath);
      if (relativePath === null) {
        errors.push(`files[${rawPath}] has invalid path`);
        continue;
      }

      if (isRecord(rawValue) === false) {
        errors.push(`files[${relativePath}] must be an object`);
        continue;
      }

      if (rawValue["encoding"] !== "base64") {
        errors.push(`files[${relativePath}].encoding must be base64`);
        continue;
      }

      if (typeof rawValue["content"] !== "string") {
        errors.push(`files[${relativePath}].content must be a string`);
        continue;
      }

      files[relativePath] = {
        encoding: "base64",
        content: rawValue["content"],
      };
    }
  }

  const exportedAtRaw = candidate["exportedAt"];
  const exportedAt =
    typeof exportedAtRaw === "string" && exportedAtRaw.trim() !== ""
      ? exportedAtRaw.trim()
      : new Date().toISOString();

  if (
    errors.length > 0 ||
    manifestValidation.valid !== true ||
    manifestValidation.manifest === undefined
  ) {
    return {
      valid: false,
      errors,
    };
  }

  const { manifest } = manifestValidation;
  collectRoomManifestRequiredFilePaths(manifest).forEach((requiredPath) => {
    if (files[requiredPath] === undefined) {
      errors.push(`files missing required asset: ${requiredPath}`);
    }
  });

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
    };
  }

  return {
    valid: true,
    errors: [],
    bundle: {
      schemaVersion: ROOM_SCHEMA_VERSION,
      manifest,
      files,
      exportedAt,
    },
  };
}
