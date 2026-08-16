import { join } from "node:path";
import {
  artifactRoot,
  buildCompanionArtifact,
  planCompanionBuildEnvironment,
  prepareCompanionBuildEnvironment,
  writeJsonFile,
} from "./android-companion-utils.mjs";

const args = new Set(process.argv.slice(2));
const jsonProgress = args.has("--json-progress");
const planOnly = args.has("--plan-only");
const bootstrap = args.has("--bootstrap");

const detailLog = [];

function recordDetail(detail) {
  if (typeof detail !== "string" || detail.trim() === "") {
    return;
  }

  const normalized = detail.trim();
  if (detailLog.at(-1) === normalized) {
    return;
  }
  detailLog.push(normalized);
  if (detailLog.length > 18) {
    detailLog.splice(0, detailLog.length - 18);
  }
}

function emit(event) {
  if (jsonProgress) {
    console.log(JSON.stringify(event));
    return;
  }

  if (typeof event.message === "string" && event.message.trim() !== "") {
    console.log(event.message.trim());
  }
}

function emitProgress(message, progress, detail = message) {
  recordDetail(detail);
  emit({
    type: "progress",
    message,
    progress,
    details: [...detailLog],
  });
}

try {
  const plan = await planCompanionBuildEnvironment();
  if (planOnly === true) {
    emit({
      type: "plan",
      needsConfirmation: plan.needsConfirmation,
      message:
        plan.needsConfirmation === true
          ? "Android companion build needs prerequisite setup."
          : "Android companion build prerequisites are already ready.",
      details: [...plan.details],
    });
    process.exit(0);
  }

  const prepared = await prepareCompanionBuildEnvironment({
    autoInstall: bootstrap,
    emitProgress,
  });
  if (prepared.needsConfirmation === true) {
    emit({
      type: "plan",
      needsConfirmation: true,
      message: "Android companion build needs prerequisite setup.",
      details: [...prepared.details],
    });
    process.exit(0);
  }

  const artifact = await buildCompanionArtifact({
    env: prepared.env,
    emitProgress,
    stdio: jsonProgress ? "pipe" : "inherit",
  });
  await writeJsonFile(join(artifactRoot, "build-status.json"), {
    status: "ready",
    builtAt: artifact.builtAt,
    apkPath: artifact.apkPath,
  });
  emit({
    type: "result",
    ok: true,
    message: `android-companion artifact published to ${artifact.apkPath}`,
    artifact,
    details: [...detailLog],
  });
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  await writeJsonFile(join(artifactRoot, "build-status.json"), {
    status: "blocked",
    reason,
  });
  emit({
    type: "error",
    ok: false,
    message: reason,
    details: [...detailLog],
  });
  throw error;
}
