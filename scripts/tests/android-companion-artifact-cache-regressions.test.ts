import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  inspectCompanionArtifactCache,
} from "../lib/android-companion-artifact.mjs";
import { resolveInstallableArtifact } from "../android-companion-utils.mjs";

void test("android companion bootstrap parses command-line tools version from the numeric capture group", async () => {
  const source = await readFile("scripts/android-companion-utils.mjs", "utf8");

  assert.match(source, /full: match\[1\] \?\? null/);
  assert.match(source, /version: Number\.parseInt\(match\[2\] \?\? "", 10\)/);
  assert.doesNotMatch(source, /Number\.parseInt\(match\[1\]/);
});

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), "hev-android-companion-artifact-"));
  const companionRoot = join(root, "android-companion");
  const artifactRoot = join(root, "dist", "android-companion");
  await mkdir(join(companionRoot, "app", "src", "main", "assets"), {
    recursive: true,
  });
  await mkdir(join(artifactRoot), { recursive: true });

  const sourceManifestPath = join(
    companionRoot,
    "app",
    "src",
    "main",
    "assets",
    "companion-manifest.json"
  );
  const artifactManifestPath = join(artifactRoot, "manifest.json");
  const apkPath = join(artifactRoot, "com.hayaletev.androidcompanion-debug.apk");
  const initialBuiltAt = "2026-04-22T19:13:54.038Z";
  const initialBuiltAtMs = Date.parse(initialBuiltAt);

  await writeFile(
    sourceManifestPath,
    `${JSON.stringify(
      {
        applicationId: "com.hayaletev.androidcompanion",
        versionName: "0.1.0-dev",
        versionCode: 1,
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  await writeFile(apkPath, "fake-apk", "utf8");
  await writeFile(
    artifactManifestPath,
    `${JSON.stringify(
      {
        applicationId: "com.hayaletev.androidcompanion",
        versionName: "0.1.0-dev",
        versionCode: 1,
        builtAt: initialBuiltAt,
        apkPath,
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  const beforeBuildMs = initialBuiltAtMs - 1_000;
  const afterBuildMs = initialBuiltAtMs + 60_000;
  await writeFile(join(companionRoot, "build.gradle.kts"), "plugins {}\n", "utf8");
  await writeFile(join(companionRoot, "README.md"), "ignored\n", "utf8");
  await writeFile(join(companionRoot, ".gitignore"), "app/build/\n", "utf8");
  const beforeBuildTime = new Date(beforeBuildMs);
  await Promise.all([
    utimes(join(companionRoot, "build.gradle.kts"), beforeBuildTime, beforeBuildTime),
    utimes(sourceManifestPath, beforeBuildTime, beforeBuildTime),
  ]);

  return {
    companionRoot,
    artifactManifestPath,
    sourceManifestPath,
    apkPath,
    beforeBuildMs,
    afterBuildMs,
  };
}

void test("keeps a cached artifact installable when tracked companion inputs are not newer", async () => {
  const fixture = await createFixture();
  await writeFile(join(fixture.companionRoot, "README.md"), "updated docs\n", "utf8");

  const stableTime = new Date(fixture.beforeBuildMs);
  await Promise.all([
    writeFile(join(fixture.companionRoot, "build.gradle.kts"), "plugins {}\n", "utf8"),
    writeFile(fixture.sourceManifestPath, '{"ok":true}\n', "utf8"),
  ]);
  await Promise.all([
    utimes(join(fixture.companionRoot, "build.gradle.kts"), stableTime, stableTime),
    utimes(fixture.sourceManifestPath, stableTime, stableTime),
  ]);

  const artifactState = await inspectCompanionArtifactCache({
    companionRoot: fixture.companionRoot,
    artifactManifestPath: fixture.artifactManifestPath,
  });
  const artifact = await resolveInstallableArtifact({
    buildIfMissing: false,
    paths: {
      companionRoot: fixture.companionRoot,
      artifactManifestPath: fixture.artifactManifestPath,
    },
  }) as Record<string, unknown> | null;

  assert.equal(artifactState.artifactReady, true);
  assert.equal(artifactState.artifactFresh, true);
  assert.equal(artifactState.stale, false);
  assert.notEqual(artifact, null);
});

void test("invalidates a cached artifact when tracked companion inputs are newer than the build", async () => {
  const fixture = await createFixture();
  const sourceUpdateTime = new Date(fixture.afterBuildMs);
  const sourceManifest = JSON.stringify(
    {
      applicationId: "com.hayaletev.androidcompanion",
      versionName: "0.2.0-dev",
      versionCode: 2,
    },
    null,
    2
  );

  await writeFile(fixture.sourceManifestPath, `${sourceManifest}\n`, "utf8");
  await utimes(fixture.sourceManifestPath, sourceUpdateTime, sourceUpdateTime);

  const artifactState = await inspectCompanionArtifactCache({
    companionRoot: fixture.companionRoot,
    artifactManifestPath: fixture.artifactManifestPath,
  });
  const artifact = await resolveInstallableArtifact({
    buildIfMissing: false,
    paths: {
      companionRoot: fixture.companionRoot,
      artifactManifestPath: fixture.artifactManifestPath,
    },
  }) as Record<string, unknown> | null;

  assert.equal(artifactState.artifactReady, true);
  assert.equal(artifactState.artifactFresh, false);
  assert.equal(artifactState.stale, true);
  assert.equal(artifactState.latestInputPath, "app/src/main/assets/companion-manifest.json");
  assert.equal(artifact, null);
});
