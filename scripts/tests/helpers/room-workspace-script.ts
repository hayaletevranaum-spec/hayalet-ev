import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { transformSync, type Format, type Loader } from "esbuild";

function resolveLoader(filePath: string): Loader | null {
  switch (extname(filePath)) {
    case ".ts":
    case ".mts":
    case ".cts":
      return "ts";
    case ".tsx":
      return "tsx";
    default:
      return null;
  }
}

function resolveFormat(filePath: string): Format | undefined {
  switch (extname(filePath)) {
    case ".mts":
      return "esm";
    case ".cts":
      return "cjs";
    default:
      return undefined;
  }
}

export function loadWorkspaceScriptForVm(filePath: string): string {
  const source = readFileSync(filePath, "utf8");
  const loader = resolveLoader(filePath);
  if (loader === null) {
    return source;
  }

  const format = resolveFormat(filePath);
  return transformSync(source, {
    charset: "utf8",
    loader,
    sourcefile: filePath,
    target: "es2022",
    ...(format === undefined ? {} : { format }),
  }).code;
}
