#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  createBackup,
  getBackupStorageDir,
  inspectBackup,
  listBackups,
  listPresets,
  listScopes,
  loadCliCatalog,
  previewBackupRestore,
  restoreBackup,
} from "./backup-runtime/index.mjs";

function parseArgs(argv) {
  const [command = "", ...rest] = argv;
  const flags = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = rest[index + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }

    flags[key] = next;
    index += 1;
  }

  return { command, flags };
}

function csvToList(value) {
  if (typeof value !== "string") {
    return [];
  }
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

function pickLocaleFromCatalog(catalog, key, fallback) {
  const parts = key.split(".");
  let current = catalog;

  for (const part of parts) {
    if (current == null || typeof current !== "object" || part in current === false) {
      return fallback;
    }
    current = current[part];
  }

  return typeof current === "string" ? current : fallback;
}

function interpolate(template, params = {}) {
  return template.replaceAll(/\{\{(\w+)\}\}/g, (_match, token) => {
    const value = params[token];
    return value == null ? "" : String(value);
  });
}

async function detectLocale() {
  try {
    const settingsPath = join(process.cwd(), "config", "settings.json");
    const raw = await readFile(settingsPath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed?.general?.language === "tr" ? "tr" : "en";
  } catch {
    return "en";
  }
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const locale = await detectLocale();
  const catalog = await loadCliCatalog(locale);
  const t = (key, fallback, params) => interpolate(pickLocaleFromCatalog(catalog, key, fallback), params);
  const jsonOutput = flags["json"] === true;

  try {
    switch (command) {
      case "create": {
        const result = await createBackup({
          scopeIds: csvToList(flags["scope"]),
          presetId: typeof flags["preset"] === "string" ? flags["preset"] : undefined,
          outputPath: typeof flags["output"] === "string" ? flags["output"] : undefined,
          label: typeof flags["label"] === "string" ? flags["label"] : undefined,
          note: typeof flags["note"] === "string" ? flags["note"] : undefined,
          createdBy: "cli",
        });

        if (jsonOutput) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(t("shell.backup.cli.createSuccess", "Backup created: {{path}}", { path: result.bundlePath }));
        console.log(
          t("shell.backup.cli.selectedScopes", "Scopes: {{scopes}}", {
            scopes: result.selectedScopes.join(", "),
          })
        );
        return;
      }

      case "list": {
        const items = await listBackups({
          limit:
            typeof flags["limit"] === "string" && Number.isFinite(Number(flags["limit"]))
              ? Number(flags["limit"])
              : undefined,
        });
        if (jsonOutput) {
          console.log(JSON.stringify(items, null, 2));
          return;
        }

        if (items.length === 0) {
          console.log(t("shell.backup.cli.listEmpty", "No backups were found in {{dir}}", { dir: getBackupStorageDir() }));
          return;
        }

        for (const item of items) {
          console.log(
            `${item.createdAt ?? "-"} | ${item.selectedScopes.join(", ") || "-"} | ${item.filePath}`
          );
        }
        return;
      }

      case "inspect": {
        const file = typeof flags["file"] === "string" ? flags["file"] : "";
        if (file === "") {
          throw new Error("--file is required for inspect");
        }
        const result = await inspectBackup(file);
        console.log(JSON.stringify(result.manifest, null, 2));
        return;
      }

      case "preview": {
        const file = typeof flags["file"] === "string" ? flags["file"] : "";
        if (file === "") {
          throw new Error("--file is required for preview");
        }
        const result = await previewBackupRestore({
          filePath: file,
          scopeIds: csvToList(flags["scope"]),
        });
        if (jsonOutput) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(
          t("shell.backup.cli.previewSummary", "Preview: {{count}} file(s), risk={{risk}}", {
            count: result.fileCount,
            risk: result.riskLevel,
          })
        );
        if (result.warnings.length > 0) {
          for (const warning of result.warnings) {
            console.log(`- ${warning}`);
          }
        }
        return;
      }

      case "restore": {
        const file = typeof flags["file"] === "string" ? flags["file"] : "";
        if (file === "") {
          throw new Error("--file is required for restore");
        }
        const result = await restoreBackup({
          filePath: file,
          scopeIds: csvToList(flags["scope"]),
          createdBy: "cli",
          safetyBackup: flags["no-safety-backup"] !== true,
        });
        if (jsonOutput) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(
          t("shell.backup.cli.restoreSuccess", "Restore completed from {{path}}", {
            path: result.bundlePath,
          })
        );
        return;
      }

      case "scopes": {
        const scopes = await listScopes();
        console.log(JSON.stringify(scopes, null, 2));
        return;
      }

      case "presets": {
        const presets = await listPresets();
        console.log(JSON.stringify(presets, null, 2));
        return;
      }

      default:
        console.log("Usage: node scripts/backup-cli.mjs <create|list|inspect|preview|restore|scopes|presets> [options]");
    }
  } catch (error) {
    if (jsonOutput) {
      console.log(
        JSON.stringify(
          {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
          null,
          2
        )
      );
      process.exitCode = 1;
      return;
    }

    console.error(
      t("shell.backup.cli.commandFailed", "Backup command failed: {{message}}", {
        message: error instanceof Error ? error.message : String(error),
      })
    );
    process.exitCode = 1;
  }
}

await main();
