import {
  resolveExecutableOnPath,
  resolveInstallableArtifact,
  runCommand,
} from "./android-companion-utils.mjs";

const deviceId = process.argv[2] ?? "";
const normalizedDeviceId = deviceId.trim();

if (normalizedDeviceId === "") {
  throw new Error("Usage: npm run android:install -- <deviceId>");
}

const adbPath = await resolveExecutableOnPath("adb");
if (adbPath === null) {
  throw new Error("ADB is not available on PATH.");
}

const artifact = await resolveInstallableArtifact({ buildIfMissing: true, autoBootstrap: true });
if (artifact === null) {
  throw new Error("android-companion artifact is not available yet.");
}

const result = await runCommand(adbPath, ["-s", normalizedDeviceId, "install", "-r", artifact.apkPath]);
if (result.exitCode !== 0) {
  const message = result.stderr.trim() || result.stdout.trim() || "ADB install failed.";
  throw new Error(message);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      deviceId: normalizedDeviceId,
      apkPath: artifact.apkPath,
      versionName: artifact.versionName,
    },
    null,
    2
  )
);
