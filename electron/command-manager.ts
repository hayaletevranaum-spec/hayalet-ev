import { join, basename } from "path";
import { readdir, readFile, writeFile, mkdir, rename, copyFile, unlink, rm } from "fs/promises";
import { existsSync } from "fs";
import type { IpcMainInvokeEvent } from "electron";
import { Paths } from "./paths.ts";

interface CommandDirs {
  root: string;
  doneDir: string;
  failedDir: string;
}

interface CommandItem {
  id: string;
  [key: string]: unknown;
}

interface StagedFile {
  originalName: string;
  renamedName: string;
  name: string;
  commandPath: string;
  tempPath?: string;
  path?: string;
}

async function ensureCommandDirs(): Promise<CommandDirs> {
  const root = Paths.getCommandsDir();
  const doneDir = join(root, "done");
  const failedDir = join(root, "failed");
  if (!existsSync(root)) await mkdir(root, { recursive: true });
  if (!existsSync(doneDir)) await mkdir(doneDir, { recursive: true });
  if (!existsSync(failedDir)) await mkdir(failedDir, { recursive: true });
  return { root, doneDir, failedDir };
}

// NOTE: Queue management lives in src/js/modules/command-manager.js; this module is file I/O only.

export async function commandInit(
  _event: IpcMainInvokeEvent
): Promise<{ success: boolean; root?: string; failedDir?: string; error?: string }> {
  try {
    const { root, failedDir } = await ensureCommandDirs();
    const entries = await readdir(root, { withFileTypes: true });
    await Promise.all(
      entries
        .filter((e) => e.isFile())
        .map(async (e) => {
          await rename(join(root, e.name), join(failedDir, e.name));
        })
    );
    return { success: true, root, failedDir };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function commandWrite(
  _event: IpcMainInvokeEvent,
  item: CommandItem
): Promise<boolean> {
  try {
    const { root } = await ensureCommandDirs();
    const filePath = join(root, `${item.id}.json`);
    await writeFile(filePath, JSON.stringify(item, null, 2), "utf-8");
    return true;
  } catch (_err) {
    return false;
  }
}

export async function commandPaths(_event: IpcMainInvokeEvent): Promise<CommandDirs> {
  return await ensureCommandDirs();
}

export async function commandStageAttachments(
  _event: IpcMainInvokeEvent,
  payload: { jobId?: string; files?: (string | { path?: string })[] } = {}
): Promise<{ success: boolean; message?: string; staged?: StagedFile[] }> {
  const { jobId, files = [] } = payload;
  if (jobId === undefined || jobId.length === 0) return { success: false, message: "jobId eksik" };
  const inputs = Array.isArray(files) ? files.filter(Boolean) : [];
  try {
    const { root } = await ensureCommandDirs();
    const targetDir = join(root, jobId);
    if (!existsSync(targetDir)) await mkdir(targetDir, { recursive: true });
    const staged: StagedFile[] = [];
    await inputs.reduce<Promise<void>>(async (chain, input) => {
      await chain;
      const src = typeof input === "string" ? input : (input.path ?? "");
      if (src.length === 0 || !existsSync(src)) return;
      const base = basename(src);
      const insideTarget = src.startsWith(targetDir);
      if (insideTarget) {
        staged.push({
          originalName: base,
          renamedName: base,
          name: base,
          commandPath: src,
        });
        return;
      }
      let renamed = base;
      let counter = 1;
      while (existsSync(join(targetDir, renamed))) {
        const parts = base.split(".");
        const ext = parts.length > 1 ? `.${parts.pop() ?? ""}` : "";
        const stemRaw = parts.join(".");
        const stem = stemRaw.length > 0 ? stemRaw : "file";
        renamed = `${stem} (${counter})${ext}`;
        counter += 1;
      }
      await copyFile(src, join(targetDir, renamed));
      staged.push({
        originalName: base,
        renamedName: renamed,
        name: renamed,
        commandPath: join(targetDir, renamed),
      });
    }, Promise.resolve());
    return { success: true, staged };
  } catch (err) {
    return { success: false, message: (err as Error).message };
  }
}

export function commandStageTemp(
  _event: IpcMainInvokeEvent,
  payload: { staged?: StagedFile[] } = {}
): { success: boolean; message?: string; temp?: StagedFile[] } {
  const { staged = [] } = payload;
  try {
    const tempList = staged.map((entry) => {
      const preferredName = entry.renamedName;
      return {
        ...entry,
        tempPath: entry.commandPath,
        name: preferredName.length > 0 ? preferredName : basename(entry.commandPath),
      };
    });
    return { success: true, temp: tempList };
  } catch (err) {
    return { success: false, message: (err as Error).message };
  }
}

export async function commandCleanupTemp(
  _event: IpcMainInvokeEvent,
  payload: { tempPaths?: string[] } = {}
): Promise<{ success: boolean; message?: string }> {
  const { tempPaths = [] } = payload;
  try {
    await Promise.all(
      tempPaths
        .filter((p) => p.length > 0 && existsSync(p))
        .map(async (p) => {
          await unlink(p).catch(() => {});
        })
    );
    return { success: true };
  } catch (err) {
    return { success: false, message: (err as Error).message };
  }
}

export async function commandMoveFailed(
  _event: IpcMainInvokeEvent,
  payload: { jobId?: string; tempPaths?: string[] } = {}
): Promise<{ success: boolean; message?: string; destDir?: string }> {
  const { jobId, tempPaths = [] } = payload;
  if (jobId === undefined || jobId.length === 0) return { success: false, message: "jobId eksik" };
  try {
    const { root, failedDir } = await ensureCommandDirs();
    const srcDir = join(root, jobId);
    const destDir = join(failedDir, jobId);
    if (existsSync(srcDir)) {
      if (!existsSync(destDir)) await mkdir(destDir, { recursive: true });
      const entries = await readdir(srcDir, { withFileTypes: true });
      await Promise.all(
        entries.map(async (e) => {
          await rename(join(srcDir, e.name), join(destDir, e.name)).catch(() => {});
        })
      );
    }
    const validTempPaths = tempPaths.filter((p) => p.length > 0 && existsSync(p));
    if (validTempPaths.length > 0 && !existsSync(destDir)) {
      await mkdir(destDir, { recursive: true });
    }
    await Promise.all(
      validTempPaths.map(async (p) => {
        const base = basename(p);
        await rename(p, join(destDir, base)).catch(async () => {
          await copyFile(p, join(destDir, base)).catch(() => {});
          await unlink(p).catch(() => {});
        });
      })
    );
    return { success: true, destDir };
  } catch (err) {
    return { success: false, message: (err as Error).message };
  }
}

export async function commandArchiveCopy(
  _event: IpcMainInvokeEvent,
  payload: { jobId?: string; targetDir?: string } = {}
): Promise<{ success: boolean; message?: string; targetDir?: string }> {
  const { jobId, targetDir } = payload;
  if (
    jobId === undefined ||
    jobId.length === 0 ||
    targetDir === undefined ||
    targetDir.length === 0
  ) {
    return { success: false, message: "Parameters are missing" };
  }
  try {
    const { root } = await ensureCommandDirs();
    const srcDir = join(root, jobId);
    if (!existsSync(srcDir)) return { success: false, message: "Source directory is missing" };
    if (!existsSync(targetDir)) await mkdir(targetDir, { recursive: true });
    const entries = await readdir(srcDir, { withFileTypes: true });
    await Promise.all(
      entries
        .filter((e) => e.isFile())
        .map(async (e) => {
          const src = join(srcDir, e.name);
          const dest = join(targetDir, e.name);
          await copyFile(src, dest);
        })
    );
    return { success: true, targetDir };
  } catch (err) {
    return { success: false, message: (err as Error).message };
  }
}

export async function commandCleanupJob(
  _event: IpcMainInvokeEvent,
  payload: { jobId?: string; tempPaths?: string[] } = {}
): Promise<{ success: boolean; message?: string }> {
  const { jobId, tempPaths: _tempPaths = [] } = payload;
  if (jobId === undefined || jobId.length === 0) return { success: false, message: "jobId eksik" };
  try {
    const { root } = await ensureCommandDirs();
    const jobDir = join(root, jobId);
    if (existsSync(jobDir)) {
      await rm(jobDir, { recursive: true, force: true }).catch(() => {});
    }
    return { success: true };
  } catch (err) {
    return { success: false, message: (err as Error).message };
  }
}

export async function commandMove(
  _event: IpcMainInvokeEvent,
  id: string,
  status: string = "done",
  reason: string = ""
): Promise<boolean> {
  try {
    const { root, doneDir, failedDir } = await ensureCommandDirs();
    const src = join(root, `${id}.json`);
    const destDir = status === "failed" ? failedDir : doneDir;
    const dest = join(destDir, `${id}.json`);
    if (existsSync(src)) {
      if (reason.length > 0) {
        const parsed: unknown = JSON.parse(await readFile(src, "utf-8"));
        const data: Record<string, unknown> =
          typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
        data["status"] = status;
        data["reason"] = reason;
        await writeFile(src, JSON.stringify(data, null, 2), "utf-8");
      }
      await rename(src, dest);
    }
    return true;
  } catch (_err) {
    return false;
  }
}
