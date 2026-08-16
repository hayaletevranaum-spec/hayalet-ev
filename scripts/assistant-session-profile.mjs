#!/usr/bin/env node
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const profilePath = resolve(rootDir, "data/assistant-session-profile.json");
const command = process.argv[2] ?? "status";

async function readProfile() {
  try {
    return JSON.parse(await readFile(profilePath, "utf8"));
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return {
        active: false,
        profile: "normal",
        path: profilePath,
      };
    }
    throw error;
  }
}

async function writeSadeProfile(trigger) {
  const existing = await readProfile();
  const now = new Date().toISOString();
  const profile = {
    active: true,
    profile: "sade",
    workflow: "workflow:terminal-mode",
    trigger,
    createdAt: existing.createdAt ?? now,
    updatedAt: now,
    path: profilePath,
  };

  await mkdir(dirname(profilePath), { recursive: true });
  await writeFile(`${profilePath}.tmp`, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  await rename(`${profilePath}.tmp`, profilePath);
  return profile;
}

async function clearProfile() {
  await rm(profilePath, { force: true });
  return {
    active: false,
    profile: "normal",
    path: profilePath,
  };
}

function print(value) {
  console.log(JSON.stringify(value, null, 2));
}

if (["sade", "lite", "terminal-lite"].includes(command)) {
  print(await writeSadeProfile(command));
} else if (["clear", "normal", "off"].includes(command)) {
  print(await clearProfile());
} else if (command === "status") {
  print(await readProfile());
} else {
  console.error("Usage: npm run assistant:profile -- <sade|status|clear>");
  process.exitCode = 1;
}
