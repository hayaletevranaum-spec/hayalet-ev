import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { migrateRoomLayouts } from "../rooms/migrate-room-layouts.mjs";

void test("migrateRoomLayouts moves workspace dist bundles and laboratory legacy project directories", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "room-layout-migration-"));
  const workspaceRoot = join(tempRoot, "rooms");
  const storageRoot = join(tempRoot, "data", "room-storage");
  const schemaPath = join(
    tempRoot,
    "rooms",
    "laboratory",
    "tools",
    "project-schema.json"
  );
  const bundleSource = join(workspaceRoot, "game-room", "dist", "game-room.hevroom.json");
  const bundleTarget = join(storageRoot, "game-room", "exports", "game-room.hevroom.json");
  const projectDir = join(storageRoot, "laboratory", "projects", "lab-session");
  const legacyEditDir = join(projectDir, "derived", "edit");
  const legacyProfileDir = join(projectDir, "derived", "profile");
  const nextEditDir = join(projectDir, "artifacts", "media-analysis", "edit");
  const nextProfileDir = join(projectDir, "artifacts", "media-analysis", "profile");

  try {
    await mkdir(join(workspaceRoot, "game-room", "dist"), { recursive: true });
    await writeFile(bundleSource, JSON.stringify({ roomId: "game-room" }), "utf8");

    await mkdir(dirname(schemaPath), { recursive: true });
    await writeFile(
      schemaPath,
      JSON.stringify(
        {
          files: {
            processDir: "artifacts/media-analysis/process",
            reportDir: "reports/media-analysis",
            features: {
              "media-analysis": {
                editDir: "artifacts/media-analysis/edit",
                profileDir: "artifacts/media-analysis/profile",
              },
            },
            legacy: {
              editDir: "derived/edit",
              profileDir: "derived/profile",
              processDir: "derived/process",
              reportDir: "reports",
            },
          },
        },
        null,
        2
      ),
      "utf8"
    );

    await mkdir(legacyEditDir, { recursive: true });
    await mkdir(legacyProfileDir, { recursive: true });
    await writeFile(join(legacyEditDir, "manifest.json"), JSON.stringify({ stage: "edit" }), "utf8");
    await writeFile(join(legacyProfileDir, "manifest.json"), JSON.stringify({ stage: "profile" }), "utf8");

    const dryRunSummary = await migrateRoomLayouts({
      workspaceRoot,
      storageRoot,
      laboratorySchemaPath: schemaPath,
      dryRun: true,
    });

    assert.equal(dryRunSummary.moved.length, 3);
    assert.equal(existsSync(bundleSource), true);
    assert.equal(existsSync(bundleTarget), false);
    assert.equal(existsSync(legacyEditDir), true);
    assert.equal(existsSync(nextEditDir), false);

    const summary = await migrateRoomLayouts({
      workspaceRoot,
      storageRoot,
      laboratorySchemaPath: schemaPath,
    });

    assert.equal(summary.moved.length, 3);
    assert.equal(existsSync(bundleSource), false);
    assert.equal(existsSync(bundleTarget), true);
    assert.equal(existsSync(legacyEditDir), false);
    assert.equal(existsSync(legacyProfileDir), false);
    assert.equal(existsSync(nextEditDir), true);
    assert.equal(existsSync(nextProfileDir), true);

    const movedBundle = JSON.parse(await readFile(bundleTarget, "utf8")) as { roomId: string };
    const movedEditManifest = JSON.parse(await readFile(join(nextEditDir, "manifest.json"), "utf8")) as {
      stage: string;
    };
    const movedProfileManifest = JSON.parse(
      await readFile(join(nextProfileDir, "manifest.json"), "utf8")
    ) as { stage: string };

    assert.equal(movedBundle.roomId, "game-room");
    assert.equal(movedEditManifest.stage, "edit");
    assert.equal(movedProfileManifest.stage, "profile");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
