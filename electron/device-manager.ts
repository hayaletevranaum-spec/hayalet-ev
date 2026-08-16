import { spawnSync } from "child_process";
import type { IpcMainInvokeEvent } from "electron";

interface RunResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  code?: number | null;
  message?: string;
}

function run(cmd: string, cmdArgs: string[]): RunResult {
  try {
    const res = spawnSync(cmd, cmdArgs, { encoding: "utf8" });
    const ok = res.status === 0 || res.status === null;
    return { success: ok, stdout: res.stdout, stderr: res.stderr, code: res.status };
  } catch (err) {
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function deviceActionHandler(
  _event: IpcMainInvokeEvent | null,
  action: string,
  payload: string | string[]
): Promise<RunResult> {
  try {
    const act = String(action).toLowerCase();
    const args = Array.isArray(payload) ? payload : typeof payload === "string" ? [payload] : [];

    if (process.platform !== "linux") {
      return await Promise.resolve({
        success: false,
        message: "Device actions supported on Linux only",
      });
    }

    if (act === "movemouse" || act === "move_mouse" || act === "mouse_move") {
      const x = Number(args[0]);
      const y = Number(args[1]);
      return await Promise.resolve(run("xdotool", ["mousemove", String(x), String(y)]));
    }

    if (act === "click" || act === "leftclick") {
      const button = args[0] !== undefined && args[0].length > 0 ? String(args[0]) : "1";
      return await Promise.resolve(run("xdotool", ["click", button]));
    }

    if (act === "clickdown" || act === "mousedown") {
      const button = args[0] !== undefined && args[0].length > 0 ? String(args[0]) : "1";
      return await Promise.resolve(run("xdotool", ["mousedown", button]));
    }

    if (act === "clickup" || act === "mouseup") {
      const button = args[0] !== undefined && args[0].length > 0 ? String(args[0]) : "1";
      return await Promise.resolve(run("xdotool", ["mouseup", String(button)]));
    }

    if (act === "rclick" || act === "rightclick") {
      return await Promise.resolve(run("xdotool", ["click", "3"]));
    }

    if (act === "key") {
      const key = args[0] ?? "";
      if (key.length === 0)
        return await Promise.resolve({ success: false, message: "key missing" });
      return await Promise.resolve(run("xdotool", ["key", key]));
    }

    if (act === "type" || act === "write") {
      const text = args[0] ?? "";
      if (text.length === 0)
        return await Promise.resolve({ success: false, message: "text missing" });
      return await Promise.resolve(run("xdotool", ["type", "--delay", "0", text]));
    }

    if (act === "copy") {
      const text = args[0] ?? "";
      if (text.length === 0)
        return await Promise.resolve({ success: false, message: "text missing" });
      const which = spawnSync("which", ["xclip"], { encoding: "utf8" });
      if (which.status !== 0)
        return await Promise.resolve({ success: false, message: "xclip not installed" });
      const proc = spawnSync(
        "bash",
        ["-c", `printf %s "${text.replace(/"/g, '\\"')}" | xclip -selection clipboard`],
        { encoding: "utf8" }
      );
      return await Promise.resolve({
        success: proc.status === 0,
        stdout: proc.stdout,
        stderr: proc.stderr,
      });
    }

    if (act === "paste") {
      return await Promise.resolve(run("xdotool", ["key", "ctrl+v"]));
    }

    return await Promise.resolve({ success: false, message: "unknown action" });
  } catch (err) {
    return await Promise.resolve({
      success: false,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
