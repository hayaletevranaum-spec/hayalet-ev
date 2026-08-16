#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import yauzl from "yauzl";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = "v0.6.1";
const REPO = "DeusData/codebase-memory-mcp";
const RUNTIME_ROOT = process.env.ASSISTANT_INTEL_HOME
  ? path.resolve(process.env.ASSISTANT_INTEL_HOME)
  : path.join(PROJECT_ROOT, "data", "assistant-intel");
const DOWNLOAD_DIR = path.join(RUNTIME_ROOT, "downloads");
const BIN_DIR = path.join(RUNTIME_ROOT, "bin");
const CACHE_DIR = path.join(RUNTIME_ROOT, "cache", "codebase-memory-mcp");
const BIN_NAME = os.platform() === "win32" ? "codebase-memory-mcp.exe" : "codebase-memory-mcp";
const BIN_PATH = path.join(BIN_DIR, BIN_NAME);

function usage() {
  console.log(`Assistant Intel

Usage:
  node scripts/assistant-intel.mjs setup [--force]
  node scripts/assistant-intel.mjs index [path] [--mode full|moderate|fast] [--persistence]
  node scripts/assistant-intel.mjs projects
  node scripts/assistant-intel.mjs schema [path]
  node scripts/assistant-intel.mjs search <query...> [path] [--path path] [--limit N]
  node scripts/assistant-intel.mjs trace <function> [path] [--path path] [--depth N]
  node scripts/assistant-intel.mjs snippet <qualified_name> [path] [--path path]
  node scripts/assistant-intel.mjs changes [path] [--depth N]
  node scripts/assistant-intel.mjs tool <tool_name> <json_args>
`);
}

function parseFlags(argv) {
  const positional = [];
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const withoutPrefix = arg.slice(2);
    const eqIndex = withoutPrefix.indexOf("=");
    if (eqIndex >= 0) {
      flags.set(withoutPrefix.slice(0, eqIndex), withoutPrefix.slice(eqIndex + 1));
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      flags.set(withoutPrefix, next);
      index += 1;
    } else {
      flags.set(withoutPrefix, true);
    }
  }
  return { positional, flags };
}

function flagValue(flags, key, fallback) {
  return flags.has(key) ? flags.get(key) : fallback;
}

function resolveTarget(target = ".") {
  return path.resolve(PROJECT_ROOT, target);
}

function projectNameFor(target = ".") {
  const absolute = resolveTarget(target);
  return absolute
    .replace(/^[A-Za-z]:/, "")
    .replace(/^[/\\]+/, "")
    .replace(/[\\/]+/g, "-");
}

function subjectAndTarget(positional, flags) {
  const explicitTarget = flagValue(flags, "path", flagValue(flags, "target", "."));
  return { subjectParts: positional, target: explicitTarget };
}

function platformAsset() {
  const platform = os.platform();
  const arch = os.arch();
  if (platform === "linux" && arch === "x64") {
    return { name: "codebase-memory-mcp-linux-amd64-portable.tar.gz", type: "tar.gz" };
  }
  if (platform === "linux" && arch === "arm64") {
    return { name: "codebase-memory-mcp-linux-arm64-portable.tar.gz", type: "tar.gz" };
  }
  if (platform === "darwin" && arch === "x64") {
    return { name: "codebase-memory-mcp-darwin-amd64.tar.gz", type: "tar.gz" };
  }
  if (platform === "darwin" && arch === "arm64") {
    return { name: "codebase-memory-mcp-darwin-arm64.tar.gz", type: "tar.gz" };
  }
  if (platform === "win32" && arch === "x64") {
    return { name: "codebase-memory-mcp-windows-amd64.zip", type: "zip" };
  }
  throw new Error(`Unsupported assistant-intel platform: ${platform}/${arch}`);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function download(url, destination) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed ${response.status}: ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(destination, buffer);
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  hash.update(await fs.readFile(filePath));
  return hash.digest("hex");
}

async function extractZip(zipPath, destination) {
  await new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (openError, zipfile) => {
      if (openError || !zipfile) {
        reject(openError ?? new Error("zip open failed"));
        return;
      }

      zipfile.readEntry();
      zipfile.on("entry", (entry) => {
        const targetPath = path.resolve(destination, entry.fileName);
        if (!targetPath.startsWith(path.resolve(destination) + path.sep)) {
          reject(new Error(`Unsafe zip entry: ${entry.fileName}`));
          return;
        }

        if (/\/$/.test(entry.fileName)) {
          fs.mkdir(targetPath, { recursive: true })
            .then(() => zipfile.readEntry())
            .catch(reject);
          return;
        }

        zipfile.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            reject(streamError ?? new Error(`Could not read zip entry: ${entry.fileName}`));
            return;
          }

          fs.mkdir(path.dirname(targetPath), { recursive: true })
            .then(async () => {
              await pipeline(stream, createWriteStream(targetPath));
              zipfile.readEntry();
            })
            .catch(reject);
        });
      });
      zipfile.on("error", reject);
      zipfile.on("end", resolve);
    });
  });
}

async function extractArchive(asset, archive, stage) {
  if (asset.type === "zip") {
    await extractZip(archive, stage);
    return;
  }

  const tar = spawnSync("tar", ["-xzf", archive, "-C", stage], { encoding: "utf8" });
  if (tar.status !== 0) {
    throw new Error(tar.stderr || tar.stdout || "tar extraction failed");
  }
}

async function setup({ force = false } = {}) {
  await ensureDir(DOWNLOAD_DIR);
  await ensureDir(BIN_DIR);
  await ensureDir(CACHE_DIR);

  const asset = platformAsset();
  const baseUrl = `https://github.com/${REPO}/releases/download/${VERSION}`;
  const archive = path.join(DOWNLOAD_DIR, asset.name);
  const checksums = path.join(DOWNLOAD_DIR, "checksums.txt");

  if (force || !(await exists(archive))) {
    await download(`${baseUrl}/${asset.name}`, archive);
  }
  if (force || !(await exists(checksums))) {
    await download(`${baseUrl}/checksums.txt`, checksums);
  }

  const expected = (await fs.readFile(checksums, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .find((parts) => parts[1] === asset.name)?.[0];
  if (!expected) {
    throw new Error(`Checksum missing for ${asset.name}`);
  }
  const actual = await sha256(archive);
  if (actual !== expected) {
    throw new Error(`Checksum mismatch for ${asset}: ${actual} != ${expected}`);
  }

  const stage = path.join(DOWNLOAD_DIR, "extract");
  await fs.rm(stage, { recursive: true, force: true });
  await ensureDir(stage);
  await extractArchive(asset, archive, stage);
  const extracted = await findFile(stage, BIN_NAME);
  if (!extracted) {
    throw new Error(`Extracted binary ${BIN_NAME} not found`);
  }
  await fs.copyFile(extracted, BIN_PATH);
  await fs.chmod(BIN_PATH, 0o755);
  await fs.writeFile(
    path.join(RUNTIME_ROOT, "manifest.json"),
    JSON.stringify(
      { engine: "codebase-memory-mcp", version: VERSION, asset: asset.name, sha256: actual },
      null,
      2
    ) + "\n",
    "utf8"
  );
  console.log(`assistant-intel setup complete: ${BIN_PATH}`);
}

async function findFile(dir, filename) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findFile(entryPath, filename);
      if (found) return found;
    } else if (entry.name === filename) {
      return entryPath;
    }
  }
  return null;
}

async function ensureBinary() {
  if (!(await exists(BIN_PATH))) {
    await setup();
  }
}

function runCbm(toolArgs, { inherit = true } = {}) {
  const result = spawnSync(BIN_PATH, toolArgs, {
    cwd: PROJECT_ROOT,
    env: { ...process.env, CBM_CACHE_DIR: CACHE_DIR },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (inherit) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  if (result.status !== 0) {
    throw new Error(`codebase-memory-mcp failed: ${toolArgs.join(" ")}`);
  }
  return result;
}

async function runTool(tool, args) {
  await ensureBinary();
  runCbm(["cli", tool, JSON.stringify(args)]);
}

async function listIndexedProjectNames() {
  await ensureBinary();
  const result = runCbm(["cli", "list_projects", "{}"], { inherit: false });
  try {
    const parsed = JSON.parse(result.stdout.trim());
    return new Set((parsed.projects ?? []).map((project) => project.name));
  } catch {
    return new Set();
  }
}

async function ensureIndexedProject(target = ".") {
  const project = projectNameFor(target);
  const projects = await listIndexedProjectNames();
  if (projects.has(project)) {
    return project;
  }
  console.error(`assistant-intel: indexing ${target} for project ${project}`);
  runCbm([
    "cli",
    "index_repository",
    JSON.stringify({ repo_path: resolveTarget(target), mode: "full", persistence: false }),
  ]);
  return project;
}

function readJsonArg(value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`Invalid JSON args: ${error.message}`, { cause: error });
  }
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseFlags(rest);

  if (!command || command === "help" || command === "--help") {
    usage();
    return;
  }

  if (command === "setup") {
    await setup({ force: flags.has("force") });
    return;
  }
  if (command === "index") {
    const target = positional[0] ?? ".";
    await runTool("index_repository", {
      repo_path: resolveTarget(target),
      mode: flagValue(flags, "mode", "full"),
      persistence: Boolean(flags.get("persistence")),
    });
    return;
  }
  if (command === "projects") {
    await runTool("list_projects", {});
    return;
  }
  if (command === "schema") {
    await runTool("get_graph_schema", {
      project: await ensureIndexedProject(positional[0] ?? "."),
    });
    return;
  }
  if (command === "search") {
    const { subjectParts, target } = subjectAndTarget(positional, flags);
    const query = subjectParts.join(" ").trim();
    if (!query) throw new Error("search requires a query");
    await runTool("search_graph", {
      project: await ensureIndexedProject(target),
      query,
      limit: Number(flagValue(flags, "limit", 10)),
    });
    return;
  }
  if (command === "trace") {
    const { subjectParts, target } = subjectAndTarget(positional, flags);
    const functionName = subjectParts[0];
    if (!functionName) throw new Error("trace requires a function name");
    await runTool("trace_path", {
      project: await ensureIndexedProject(target),
      function_name: functionName,
      direction: flagValue(flags, "direction", "both"),
      depth: Number(flagValue(flags, "depth", 3)),
      include_tests: Boolean(flags.get("include-tests")),
    });
    return;
  }
  if (command === "snippet") {
    const { subjectParts, target } = subjectAndTarget(positional, flags);
    const qualifiedName = subjectParts[0];
    if (!qualifiedName) throw new Error("snippet requires a qualified name");
    await runTool("get_code_snippet", {
      project: await ensureIndexedProject(target),
      qualified_name: qualifiedName,
      include_neighbors: Boolean(flags.get("neighbors")),
    });
    return;
  }
  if (command === "changes") {
    await runTool("detect_changes", {
      project: await ensureIndexedProject(positional[0] ?? "."),
      depth: Number(flagValue(flags, "depth", 2)),
    });
    return;
  }
  if (command === "tool") {
    const [toolName, jsonArgs = "{}"] = positional;
    if (!toolName) throw new Error("tool requires a tool name");
    await runTool(toolName, readJsonArg(jsonArgs));
    return;
  }

  throw new Error(`Unknown assistant-intel command: ${command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
