import { existsSync, statSync, unlinkSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";
import { createMcpTranslatorSync } from "./i18n/index.js";

interface GitLockCheckResult {
  hasLock: boolean;
  isStale: boolean;
  ageMinutes?: number;
  path?: string;
}

const STALE_LOCK_THRESHOLD_MINUTES = 5;

function gitUtilsT(key: string, params?: Record<string, string | number | boolean>): string {
  return createMcpTranslatorSync()(`mcpServer.gitTools.utils.${key}`, params);
}

export function checkGitLock(workspacePath: string): GitLockCheckResult {
  const lockFile = join(workspacePath, ".git", "index.lock");

  if (!existsSync(lockFile)) {
    return { hasLock: false, isStale: false };
  }

  try {
    const stats = statSync(lockFile);
    const ageMinutes = (Date.now() - stats.mtimeMs) / 1000 / 60;

    return {
      hasLock: true,
      isStale: ageMinutes > STALE_LOCK_THRESHOLD_MINUTES,
      ageMinutes: Math.round(ageMinutes * 10) / 10,
      path: lockFile,
    };
  } catch (error) {
    // NOTE: If we can't stat the file, assume it's not a problem.
    return { hasLock: false, isStale: false };
  }
}

export function removeStaleLock(workspacePath: string): boolean {
  const lockCheck = checkGitLock(workspacePath);

  if (!lockCheck.hasLock) {
    return false;
  }

  if (!lockCheck.isStale) {
    throw new Error(gitUtilsT("activeLock", { ageMinutes: lockCheck.ageMinutes ?? 0 }));
  }

  try {
    unlinkSync(lockCheck.path ?? "");
    process.stderr.write(
      `${gitUtilsT("removedStaleLock", { ageMinutes: lockCheck.ageMinutes ?? 0 })}\n`
    );
    return true;
  } catch (error) {
    throw new Error(gitUtilsT("removeStaleLockFailed", { message: String(error) }), {
      cause: error,
    });
  }
}

export function safeGitCommand(
  command: string,
  workspacePath: string,
  options?: { encoding?: BufferEncoding; maxRetries?: number }
): string {
  const encoding = options?.encoding ?? "utf-8";
  const maxRetries = options?.maxRetries ?? 1;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const lockCheck = checkGitLock(workspacePath);

      if (lockCheck.hasLock && lockCheck.isStale) {
        process.stderr.write(`${gitUtilsT("staleLockDetected", { attempt: attempt + 1 })}\n`);
        removeStaleLock(workspacePath);
      } else if (lockCheck.hasLock && !lockCheck.isStale) {
        throw new Error(
          gitUtilsT("operationInProgress", { ageMinutes: lockCheck.ageMinutes ?? 0 })
        );
      }

      return execSync(command, {
        cwd: workspacePath,
        encoding,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error: unknown) {
      lastError = error as Error;

      const errorMessage = error instanceof Error ? error.message : String(error);
      const isLockError =
        errorMessage.includes("index.lock") || errorMessage.includes("Unable to create");

      if (isLockError && attempt < maxRetries) {
        process.stderr.write(
          `${gitUtilsT("recoveryAttempt", { attempt: attempt + 1, maxRetries })}\n`
        );
        try {
          removeStaleLock(workspacePath);
        } catch (_removeError) {
          throw error;
        }
        continue;
      }

      throw error;
    }
  }

  throw lastError ?? new Error(gitUtilsT("commandFailed"));
}

export function safeGitAdd(files: string | string[], workspacePath: string): string {
  const fileList = Array.isArray(files) ? files.join(" ") : files;
  return safeGitCommand(`git add ${fileList}`, workspacePath);
}

export function safeGitCommit(
  message: string,
  workspacePath: string,
  options?: { allowEmpty?: boolean }
): string {
  const allowEmptyFlag = options?.allowEmpty === true ? "--allow-empty " : "";
  const escapedMessage = message.replace(/"/g, '\\"');
  return safeGitCommand(`git commit ${allowEmptyFlag}-m "${escapedMessage}"`, workspacePath);
}

export function getGitStatus(workspacePath: string): string {
  return execSync("git status --porcelain", {
    cwd: workspacePath,
    encoding: "utf-8",
  });
}
