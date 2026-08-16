import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const postinstallPath = join(projectRoot, "node_modules", "vosk-koffi", "scripts", "postinstall.js");

if (!existsSync(postinstallPath)) {
  console.warn("[prepare-vosk-koffi-runtime] vosk-koffi is not installed; skipping.");
  process.exit(0);
}

const child = spawn(process.execPath, [postinstallPath], {
  cwd: projectRoot,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal !== null) {
    console.error(`[prepare-vosk-koffi-runtime] interrupted by ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 0);
});
