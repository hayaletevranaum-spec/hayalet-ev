import {
  loadSourceManifest,
  resolveExecutableOnPath,
  runCommand,
} from "./android-companion-utils.mjs";

const deviceId = process.argv[2] ?? "";
const normalizedDeviceId = deviceId.trim();

if (normalizedDeviceId === "") {
  throw new Error("Usage: npm run android:open -- <deviceId>");
}

const adbPath = await resolveExecutableOnPath("adb");
if (adbPath === null) {
  throw new Error("ADB is not available on PATH.");
}

const manifest = await loadSourceManifest();
const result = await runCommand(adbPath, [
  "-s",
  normalizedDeviceId,
  "shell",
  "am",
  "start",
  "-n",
  manifest.mainActivity,
]);

if (result.exitCode !== 0) {
  const message = result.stderr.trim() || result.stdout.trim() || "ADB launch failed.";
  throw new Error(message);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      deviceId: normalizedDeviceId,
      activity: manifest.mainActivity,
    },
    null,
    2
  )
);
