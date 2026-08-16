import { existsSync } from "fs";
import { readFile, stat, writeFile } from "fs/promises";
import { dirname, extname, join } from "path";
import { pathToFileURL } from "url";
import type { Format, Loader } from "esbuild";
import type * as EsbuildModule from "esbuild";
import { collectFilesRecursive, copyDirectoryContents, ensureDir } from "./room-install-files.ts";

const ROOM_TYPESCRIPT_SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
type EsbuildTransformModule = Pick<typeof EsbuildModule, "transform">;

export interface WorkspaceRoomSourceBuildState {
  latestSourceMtimeMs: number;
  outputRelativePaths: string[];
}

let cachedEsbuildModulePromise: Promise<EsbuildTransformModule> | null = null;
let cachedEsbuildModuleSpecifier: string | null = null;

function resolvePackagedEsbuildModuleSpecifier(): string | null {
  const resourcesPath =
    typeof process.resourcesPath === "string" ? process.resourcesPath.trim() : "";
  if (resourcesPath === "") {
    return null;
  }

  // NOTE: Packaged workspace room builds must execute the unpacked esbuild entry so its helper
  // binary stays spawnable outside app.asar.
  const unpackedMainPath = join(
    resourcesPath,
    "app.asar.unpacked",
    "node_modules",
    "esbuild",
    "lib",
    "main.js"
  );
  return existsSync(unpackedMainPath) ? pathToFileURL(unpackedMainPath).href : null;
}

async function loadEsbuildModule(): Promise<EsbuildTransformModule> {
  const specifier = resolvePackagedEsbuildModuleSpecifier() ?? "esbuild";
  if (cachedEsbuildModulePromise !== null && cachedEsbuildModuleSpecifier === specifier) {
    return await cachedEsbuildModulePromise;
  }

  cachedEsbuildModuleSpecifier = specifier;
  cachedEsbuildModulePromise = import(specifier) as Promise<EsbuildTransformModule>;
  return await cachedEsbuildModulePromise;
}

function isTypeDeclarationPath(relativePath: string): boolean {
  return (
    relativePath.endsWith(".d.ts") ||
    relativePath.endsWith(".d.mts") ||
    relativePath.endsWith(".d.cts")
  );
}

export function isWorkspaceTypeScriptSourcePath(relativePath: string): boolean {
  return (
    isTypeDeclarationPath(relativePath) === false &&
    ROOM_TYPESCRIPT_SOURCE_EXTENSIONS.has(extname(relativePath))
  );
}

function resolveRuntimeSourceCandidatePaths(relativePath: string): string[] {
  if (relativePath.endsWith(".js")) {
    const stem = relativePath.slice(0, -".js".length);
    return [`${stem}.ts`, `${stem}.tsx`];
  }

  if (relativePath.endsWith(".mjs")) {
    const stem = relativePath.slice(0, -".mjs".length);
    return [`${stem}.mts`];
  }

  if (relativePath.endsWith(".cjs")) {
    const stem = relativePath.slice(0, -".cjs".length);
    return [`${stem}.cts`];
  }

  return [];
}

export function roomSourceSatisfiesRuntimePath(roomDir: string, relativePath: string): boolean {
  if (existsSync(join(roomDir, relativePath))) {
    return true;
  }

  return resolveRuntimeSourceCandidatePaths(relativePath).some((candidatePath) =>
    existsSync(join(roomDir, candidatePath))
  );
}

function resolveCompiledOutputRelativePath(relativePath: string): string {
  if (relativePath.endsWith(".tsx")) {
    return `${relativePath.slice(0, -".tsx".length)}.js`;
  }

  if (relativePath.endsWith(".ts")) {
    return `${relativePath.slice(0, -".ts".length)}.js`;
  }

  if (relativePath.endsWith(".mts")) {
    return `${relativePath.slice(0, -".mts".length)}.mjs`;
  }

  if (relativePath.endsWith(".cts")) {
    return `${relativePath.slice(0, -".cts".length)}.cjs`;
  }

  return relativePath;
}

export async function collectWorkspaceRoomSourceBuildState(
  sourceDir: string
): Promise<WorkspaceRoomSourceBuildState> {
  const sourceFiles = await collectFilesRecursive(sourceDir);
  const latestSourceMtimeMs =
    sourceFiles.length === 0
      ? 0
      : Math.max(
          ...(await Promise.all(
            sourceFiles.map(async (file) => {
              const fileStat = await stat(file.absolutePath).catch(() => null);
              return fileStat?.mtimeMs ?? 0;
            })
          ))
        );

  const outputRelativePaths = Array.from(
    new Set(
      sourceFiles
        .filter((file) => isTypeDeclarationPath(file.relativePath) === false)
        .map((file) =>
          isWorkspaceTypeScriptSourcePath(file.relativePath)
            ? resolveCompiledOutputRelativePath(file.relativePath)
            : file.relativePath
        )
    )
  ).sort((left, right) => left.localeCompare(right));

  return {
    latestSourceMtimeMs,
    outputRelativePaths,
  };
}

function resolveEsbuildLoader(relativePath: string): Loader {
  if (relativePath.endsWith(".tsx")) {
    return "tsx";
  }

  if (relativePath.endsWith(".mts")) {
    return "ts";
  }

  if (relativePath.endsWith(".cts")) {
    return "ts";
  }

  return "ts";
}

function resolveEsbuildFormat(relativePath: string): Format | undefined {
  if (relativePath.endsWith(".cts")) {
    return "cjs";
  }

  if (relativePath.endsWith(".mts")) {
    return "esm";
  }

  return undefined;
}

export async function buildWorkspaceRoomOutput(sourceDir: string, buildDir: string): Promise<void> {
  await copyDirectoryContents(sourceDir, buildDir, {
    includeRelativePath: (relativePath) =>
      relativePath.startsWith("scripts/") === false &&
      isWorkspaceTypeScriptSourcePath(relativePath) === false &&
      isTypeDeclarationPath(relativePath) === false,
  });

  const sourceFiles = (await collectFilesRecursive(sourceDir)).filter(
    (file) =>
      file.relativePath.startsWith("scripts/") === false &&
      isWorkspaceTypeScriptSourcePath(file.relativePath)
  );

  await Promise.all(
    sourceFiles.map(async (file): Promise<void> => {
      const sourceCode = await readFile(file.absolutePath, "utf8");
      const format = resolveEsbuildFormat(file.relativePath);
      const { transform } = await loadEsbuildModule();
      const transformed = await transform(sourceCode, {
        charset: "utf8",
        loader: resolveEsbuildLoader(file.relativePath),
        sourcefile: file.relativePath,
        target: "es2022",
        ...(format !== undefined ? { format } : {}),
      });

      const outputPath = join(buildDir, resolveCompiledOutputRelativePath(file.relativePath));
      await ensureDir(dirname(outputPath));
      await writeFile(outputPath, transformed.code, "utf8");
    })
  );
}
