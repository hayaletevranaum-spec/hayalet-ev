import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from "child_process";
import { readFileSync } from "fs";
import { createRequire } from "module";
import { dirname, join, resolve } from "path";
import { PROJECT_ROOT } from "../../utils/project-root.js";

interface PackageJsonWithBin {
  bin?: string | Record<string, unknown>;
}

const fallbackRequire = createRequire(import.meta.url);

function createRequireForRoot(projectRoot?: string): ReturnType<typeof createRequire> {
  const root = projectRoot !== undefined && projectRoot.trim() !== "" ? projectRoot : PROJECT_ROOT;
  return createRequire(resolve(root, "package.json"));
}

export function bufferishToString(value: unknown): string {
  if (typeof value === "string") return value;
  if (Buffer.isBuffer(value)) return value.toString("utf-8");
  return "";
}

export function resolveNpmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

export function resolveNodeExecutable(): string {
  const npmNodeExecPath = process.env["npm_node_execpath"]?.trim();
  if (npmNodeExecPath !== undefined && npmNodeExecPath !== "") {
    return npmNodeExecPath;
  }

  const nodeFromEnv = process.env["NODE"]?.trim();
  if (nodeFromEnv !== undefined && nodeFromEnv !== "") {
    return nodeFromEnv;
  }

  return process.execPath;
}

export function firstNonEmptyString(...values: string[]): string {
  for (const value of values) {
    if (value !== "") {
      return value;
    }
  }

  return "";
}

export function resolvePackageSubpath(subpath: string, projectRoot?: string): string {
  try {
    return createRequireForRoot(projectRoot).resolve(subpath);
  } catch {
    return fallbackRequire.resolve(subpath);
  }
}

export function resolvePackageBin(
  packageName: string,
  projectRoot?: string,
  binName = packageName
): string | null {
  try {
    const packageJsonPath = resolvePackageSubpath(`${packageName}/package.json`, projectRoot);
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as PackageJsonWithBin;
    const bin = packageJson.bin;

    const relativeBin =
      typeof bin === "string"
        ? bin
        : typeof bin?.[binName] === "string"
          ? bin[binName]
          : Object.values(bin ?? {}).find((value): value is string => typeof value === "string");

    return typeof relativeBin === "string" ? join(dirname(packageJsonPath), relativeBin) : null;
  } catch {
    return null;
  }
}

export function resolveEslintCli(projectRoot?: string): string {
  const packageJsonPath = resolvePackageSubpath("eslint/package.json", projectRoot);
  return join(dirname(packageJsonPath), "bin", "eslint.js");
}

export function resolveTypescriptCli(projectRoot?: string): string {
  return resolvePackageSubpath("typescript/lib/tsc.js", projectRoot);
}

export function runNodeCli(
  cliPath: string,
  args: string[],
  options: ExecFileSyncOptionsWithStringEncoding
): string {
  return execFileSync(resolveNodeExecutable(), [cliPath, ...args], options);
}

export function runNpm(args: string[], options: ExecFileSyncOptionsWithStringEncoding): string {
  const npmExecPath = process.env["npm_execpath"]?.trim();
  return npmExecPath !== undefined && npmExecPath !== ""
    ? execFileSync(resolveNodeExecutable(), [npmExecPath, ...args], options)
    : execFileSync(resolveNpmCommand(), args, options);
}

export function formatCommandForLog(command: string, args: string[]): string {
  return [command, ...args]
    .map((part) => (/\s/u.test(part) ? JSON.stringify(part) : part))
    .join(" ");
}
