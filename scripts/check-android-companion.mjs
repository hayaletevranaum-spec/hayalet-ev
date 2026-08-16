import { join } from "node:path";
import {
  artifactRoot,
  companionRoot,
  fileExists,
  loadSourceManifest,
  projectRoot,
  resolveCompatibleJavaRuntime,
  resolveExecutableOnPath,
  resolveUsableAndroidSdk,
  sourceManifestPath,
  wrapperPath,
  writeJsonFile,
} from "./android-companion-utils.mjs";

const javaRuntime = await resolveCompatibleJavaRuntime();
const androidSdk = await resolveUsableAndroidSdk();

const summary = {
  checkedAt: new Date().toISOString(),
  projectRoot,
  companionRoot,
  artifactRoot,
  files: {
    settingsGradle: await fileExists(join(companionRoot, "settings.gradle.kts")),
    rootBuild: await fileExists(join(companionRoot, "build.gradle.kts")),
    appBuild: await fileExists(join(companionRoot, "app", "build.gradle.kts")),
    manifest: await fileExists(join(companionRoot, "app", "src", "main", "AndroidManifest.xml")),
    sourceManifest: await fileExists(sourceManifestPath),
    mainActivity: await fileExists(
      join(
        companionRoot,
        "app",
        "src",
        "main",
        "kotlin",
        "com",
        "hayaletev",
        "androidcompanion",
        "MainActivity.kt"
      )
    ),
    gradleWrapper: await fileExists(wrapperPath),
  },
  environment: {
    adbPath: await resolveExecutableOnPath("adb"),
    androidSdkRoot: androidSdk?.rootPath ?? process.env.ANDROID_SDK_ROOT ?? process.env.ANDROID_HOME ?? null,
    javaHome: javaRuntime?.javaHome ?? process.env.JAVA_HOME ?? null,
  },
  contract: {
    sourceManifest: await loadSourceManifest().catch(() => null),
    scaffoldReady: false,
    buildReady: false,
  },
};

summary.contract.scaffoldReady = Object.values(summary.files).every((value) => value === true);
summary.contract.buildReady =
  summary.contract.scaffoldReady &&
  summary.environment.androidSdkRoot !== null &&
  summary.environment.javaHome !== null;

await writeJsonFile(join(artifactRoot, "check.json"), summary);

console.log("android-companion check summary");
console.log(JSON.stringify(summary, null, 2));

if (summary.contract.scaffoldReady !== true) {
  process.exitCode = 1;
}
