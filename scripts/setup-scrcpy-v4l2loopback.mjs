import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { spawn } from "node:child_process";

const label = "Hayalet Ev Camera Feed";
const devicePath = process.env.HAYALET_SCRCPY_V4L2_DEVICE?.trim() || "/dev/video42";
const videoNumber = devicePath.match(/\/dev\/video(\d+)$/)?.[1] ?? "42";
const deviceReadyTimeoutMs = 5_000;
const deviceReadyPollMs = 250;

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.stdio ?? "pipe",
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    if (child.stdout) {
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
      });
    }
    if (child.stderr) {
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString("utf8");
      });
    }
    child.once("error", reject);
    child.once("close", (exitCode) => {
      resolve({ exitCode, stdout, stderr });
    });
  });
}

async function hasReadWriteAccess(targetPath) {
  try {
    await access(targetPath, fsConstants.R_OK | fsConstants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForReadWriteAccess(targetPath, timeoutMs = deviceReadyTimeoutMs) {
  const deadline = Date.now() + timeoutMs;
  do {
    if (await hasReadWriteAccess(targetPath)) {
      return true;
    }
    await delay(deviceReadyPollMs);
  } while (Date.now() < deadline);

  return await hasReadWriteAccess(targetPath);
}

async function main() {
  if (process.platform !== "linux") {
    console.log("v4l2loopback setup is only required on Linux.");
    return;
  }

  const modinfo = await run("modinfo", ["v4l2loopback"]).catch((error) => ({
    exitCode: 1,
    stdout: "",
    stderr: error instanceof Error ? error.message : String(error),
  }));
  if (modinfo.exitCode !== 0) {
    throw new Error(
      [
        "v4l2loopback kernel module was not found.",
        "Install a kernel package that includes it, or install v4l2loopback-dkms for your kernel.",
        modinfo.stderr.trim(),
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  if (await hasReadWriteAccess(devicePath)) {
    console.log(`v4l2loopback device is already ready at ${devicePath}.`);
    return;
  }

  const modprobeArgs = [
    "modprobe",
    "v4l2loopback",
    `video_nr=${videoNumber}`,
    `card_label=${label}`,
    "exclusive_caps=1",
  ];
  const command =
    typeof process.getuid === "function" && process.getuid() === 0 ? "modprobe" : "sudo";
  const args = command === "modprobe" ? modprobeArgs.slice(1) : modprobeArgs;
  console.log(`Preparing ${devicePath} for scrcpy camera feed.`);
  const result = await run(command, args, { stdio: "inherit" });
  if (result.exitCode !== 0) {
    throw new Error(`v4l2loopback setup failed with exit code ${String(result.exitCode)}.`);
  }

  if (!(await waitForReadWriteAccess(devicePath))) {
    throw new Error(
      `${devicePath} was created but is not readable/writable by this user. Check video group or udev permissions.`
    );
  }

  console.log(`v4l2loopback device is ready at ${devicePath}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
