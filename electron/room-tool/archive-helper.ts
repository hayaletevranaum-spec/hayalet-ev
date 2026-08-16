import { spawn } from "child_process";
import { existsSync } from "fs";
import { chmod, copyFile, mkdir, readdir, rename, rm } from "fs/promises";
import { dirname, join } from "path";
import type { ArchiveType, GitHubReleasePayload, GitHubReleaseProvider } from "./types.ts";

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

export async function runCommand(
  command: string,
  args: string[],
  cwd?: string,
  env?: Record<string, string | undefined>,
  timeoutMs = 15_000
): Promise<{ exitCode: number | null; stdout: string; stderr: string; cancelled: boolean }> {
  return await new Promise((resolvePromise, rejectPromise) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;

    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        ...Object.fromEntries(
          Object.entries(env ?? {}).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string"
          )
        ),
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const finish = (payload: {
      exitCode: number | null;
      stdout: string;
      stderr: string;
      cancelled: boolean;
    }): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolvePromise(payload);
    };

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.once("error", rejectPromise);
    child.once("close", (code) => {
      finish({ exitCode: code, stdout, stderr, cancelled: timedOut });
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
  });
}

export async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "hayalet-ev-room-tools",
      Accept: "application/vnd.github+json, application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }
  return await response.json();
}

export async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "hayalet-ev-room-tools",
      Accept: "text/plain, application/octet-stream;q=0.9, */*;q=0.1",
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }
  return await response.text();
}

export async function fetchGitHubRelease(
  provider: GitHubReleaseProvider
): Promise<GitHubReleasePayload> {
  const url = `https://api.github.com/repos/${provider.owner}/${provider.repo}/releases/latest`;
  return (await fetchJson(url)) as GitHubReleasePayload;
}

export function expandReleaseTemplate(template: string, version: string): string {
  return template.replaceAll("${version}", encodeURIComponent(version));
}

export function getFileNameFromUrl(url: string, fallback: string): string {
  const pathPart = url.split(/[?#]/u)[0] ?? "";
  const lastPart = pathPart.split("/").filter(Boolean).pop();
  return decodeURIComponent(lastPart ?? fallback);
}

export async function collectFilesRecursive(baseDir: string): Promise<string[]> {
  const entries = await readdir(baseDir, { withFileTypes: true });
  const results = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      const absolutePath = join(baseDir, entry.name);
      if (entry.isDirectory()) {
        return await collectFilesRecursive(absolutePath);
      }
      return [absolutePath];
    })
  );
  return results.flat();
}

export async function findArchiveContentRoot(extractDir: string): Promise<string> {
  const entries = await readdir(extractDir, { withFileTypes: true });
  const meaningfulEntries = entries.filter(function (entry) {
    return entry.name !== "__MACOSX";
  });
  if (meaningfulEntries.length === 1 && meaningfulEntries[0]?.isDirectory() === true) {
    return join(extractDir, meaningfulEntries[0].name);
  }
  return extractDir;
}

export function resolveUniquePath(targetPath: string): string {
  if (!existsSync(targetPath)) {
    return targetPath;
  }

  const extIndex = targetPath.lastIndexOf(".");
  const hasExtension = extIndex > dirname(targetPath).length;
  const stem = hasExtension ? targetPath.slice(0, extIndex) : targetPath;
  const ext = hasExtension ? targetPath.slice(extIndex) : "";
  let counter = 1;
  while (existsSync(`${stem} (${counter})${ext}`)) {
    counter += 1;
  }
  return `${stem} (${counter})${ext}`;
}

export async function markExecutable(filePath: string): Promise<void> {
  if (process.platform === "win32") {
    return;
  }
  await chmod(filePath, 0o755);
}

export async function extractArchive(
  archivePath: string,
  targetDir: string,
  archiveType: ArchiveType
): Promise<void> {
  await ensureDir(targetDir);

  if (archiveType === "tar.xz" || archiveType === "tar.gz") {
    await runCommand(
      "tar",
      [archiveType === "tar.gz" ? "-xzf" : "-xf", archivePath, "-C", targetDir],
      targetDir,
      undefined,
      60_000
    );
    return;
  }

  if (process.platform === "win32") {
    await runCommand(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${targetDir.replace(/'/g, "''")}' -Force`,
      ],
      targetDir,
      undefined,
      60_000
    );
    return;
  }

  if (process.platform === "darwin") {
    await runCommand("ditto", ["-x", "-k", archivePath, targetDir], targetDir, undefined, 60_000);
    return;
  }

  await runCommand(
    "python3",
    ["-m", "zipfile", "-e", archivePath, targetDir],
    targetDir,
    undefined,
    60_000
  );
}

export function isCrossDeviceRenameError(error: unknown): boolean {
  return (
    error !== null && typeof error === "object" && (error as { code?: unknown }).code === "EXDEV"
  );
}

export async function moveDownloadedFile(sourcePath: string, targetPath: string): Promise<void> {
  try {
    await rename(sourcePath, targetPath);
  } catch (error) {
    if (isCrossDeviceRenameError(error) !== true) {
      throw error;
    }
    await copyFile(sourcePath, targetPath);
    await rm(sourcePath, { force: true });
  }
}
