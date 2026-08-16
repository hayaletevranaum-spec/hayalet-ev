import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function normalizeArgs(args) {
  return String(args ?? "")
    .replace(/\\/g, "/")
    .toLowerCase();
}

export function hasProcessPathFragment(args, fragment) {
  return normalizeArgs(args).includes(fragment.toLowerCase());
}

export function parsePosixProcessLine(line) {
  const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
  if (match === null) return null;

  const pid = Number.parseInt(match[1] ?? "", 10);
  const ppid = Number.parseInt(match[2] ?? "", 10);
  const args = (match[3] ?? "").trim();
  if (!Number.isFinite(pid) || !Number.isFinite(ppid) || args === "") {
    return null;
  }

  return { pid, ppid, args };
}

function normalizeWindowsProcessEntry(raw) {
  if (raw === null || typeof raw !== "object") return null;
  const pid = Number.parseInt(String(raw.ProcessId ?? ""), 10);
  const ppid = Number.parseInt(String(raw.ParentProcessId ?? ""), 10);
  const args =
    typeof raw.CommandLine === "string" && raw.CommandLine.trim() !== ""
      ? raw.CommandLine.trim()
      : typeof raw.Name === "string"
        ? raw.Name.trim()
        : "";

  if (!Number.isFinite(pid) || !Number.isFinite(ppid) || args === "") {
    return null;
  }

  return { pid, ppid, args };
}

async function readPosixProcessEntries() {
  const { stdout } = await execFileAsync("ps", ["-eo", "pid=,ppid=,args="]);
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parsePosixProcessLine(line))
    .filter((entry) => entry !== null);
}

async function readWindowsProcessEntriesWith(shellName) {
  const command = [
    "$ErrorActionPreference = 'Stop';",
    "Get-CimInstance Win32_Process",
    "| Select-Object ProcessId,ParentProcessId,CommandLine,Name",
    "| ConvertTo-Json -Compress",
  ].join(" ");
  const { stdout } = await execFileAsync(
    shellName,
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    { maxBuffer: 20 * 1024 * 1024 }
  );
  const parsed = JSON.parse(stdout.trim() || "[]");
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  return rows.map((entry) => normalizeWindowsProcessEntry(entry)).filter((entry) => entry !== null);
}

async function readWindowsProcessEntries() {
  for (const shellName of ["powershell.exe", "pwsh"]) {
    try {
      return await readWindowsProcessEntriesWith(shellName);
    } catch {
      // Try the next PowerShell host.
    }
  }
  return [];
}

export async function readProcessEntries() {
  try {
    return process.platform === "win32"
      ? await readWindowsProcessEntries()
      : await readPosixProcessEntries();
  } catch {
    return [];
  }
}
