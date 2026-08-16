import { asLabRecord } from "../../domain/lab-types.js";
import { toDraftScope } from "./lab-controller-helpers.js";

function readNumeric(value: unknown) {
  if (value === null || value === "") {
    return null;
  }
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

export function applyAnalysisScopeField(
  workbench: Record<string, unknown>,
  field: string,
  value: unknown
) {
  const nextScope = toDraftScope(workbench);
  const nextTimeRange = { ...asLabRecord(nextScope["timeRange"]) };
  const nextFrameRange = { ...asLabRecord(nextScope["frameRange"]) };
  const nextRegion = { ...asLabRecord(nextScope["region"]) };

  switch (field) {
    case "focus":
      if (typeof value === "string" && value.trim() !== "") {
        nextScope["focus"] = value;
      } else {
        delete nextScope["focus"];
      }
      break;
    case "hypothesis":
      if (typeof value === "string" && value.trim() !== "") {
        nextScope["hypothesis"] = value.trim();
      } else {
        delete nextScope["hypothesis"];
      }
      break;
    case "timeStartMs":
    case "timeEndMs": {
      const nextValue = readNumeric(value);
      const targetKey = field === "timeStartMs" ? "startMs" : "endMs";
      if (nextValue === null) {
        delete nextTimeRange[targetKey];
      } else {
        nextTimeRange[targetKey] = Math.max(0, Math.round(nextValue));
      }
      if (
        typeof nextTimeRange["startMs"] === "number" &&
        typeof nextTimeRange["endMs"] === "number" &&
        nextTimeRange["endMs"] > nextTimeRange["startMs"]
      ) {
        nextScope["timeRange"] = nextTimeRange;
      } else {
        delete nextScope["timeRange"];
      }
      break;
    }
    case "frameStart":
    case "frameEnd": {
      const nextValue = readNumeric(value);
      const targetKey = field === "frameStart" ? "startFrame" : "endFrame";
      if (nextValue === null) {
        delete nextFrameRange[targetKey];
      } else {
        nextFrameRange[targetKey] = Math.max(0, Math.round(nextValue));
      }
      if (
        typeof nextFrameRange["startFrame"] === "number" &&
        typeof nextFrameRange["endFrame"] === "number"
      ) {
        nextScope["frameRange"] = nextFrameRange;
      } else {
        delete nextScope["frameRange"];
      }
      break;
    }
    case "regionX":
    case "regionY":
    case "regionWidth":
    case "regionHeight": {
      const nextValue = readNumeric(value);
      const targetKey =
        field === "regionX"
          ? "x"
          : field === "regionY"
            ? "y"
            : field === "regionWidth"
              ? "width"
              : "height";
      if (nextValue === null) {
        delete nextRegion[targetKey];
      } else {
        nextRegion[targetKey] =
          targetKey === "width" || targetKey === "height"
            ? Math.max(1, Math.round(nextValue))
            : Math.max(0, Math.round(nextValue));
      }
      if (
        typeof nextRegion["x"] === "number" &&
        typeof nextRegion["y"] === "number" &&
        typeof nextRegion["width"] === "number" &&
        typeof nextRegion["height"] === "number"
      ) {
        nextScope["region"] = nextRegion;
      } else {
        delete nextScope["region"];
      }
      break;
    }
    default:
      break;
  }

  if (
    nextScope["focus"] === undefined &&
    nextScope["hypothesis"] === undefined &&
    nextScope["timeRange"] === undefined &&
    nextScope["frameRange"] === undefined &&
    nextScope["region"] === undefined &&
    nextScope["comparison"] === undefined
  ) {
    return {
      ...workbench,
      analysisScope: null,
    };
  }

  return {
    ...workbench,
    analysisScope: nextScope,
  };
}
