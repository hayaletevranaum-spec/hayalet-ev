import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

import type { ToolEntry } from "../core/registry.js";
import { checkSyntax } from "./dev/index.js";

type JsonObject = Record<string, unknown>;
type AssistantResponseFormat = "compact" | "json";
type ToolTextResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

interface CommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface GitStatusEntry {
  status: string;
  file: string;
  raw: string;
  deleted: boolean;
}

interface VerificationGap {
  severity: "blocking" | "warning" | "info";
  message: string;
  file?: string;
}

const CHECKABLE_EXTENSIONS = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx", ".json"]);
const DEFAULT_GIT_FILE_LIMIT = 40;
const DEFAULT_VERIFY_FILE_LIMIT = 12;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

function asResponseFormat(value: unknown): AssistantResponseFormat {
  return value === "json" ? "json" : "compact";
}

function runCommand(
  projectRoot: string,
  command: string,
  args: string[],
  timeout = 8_000
): CommandResult {
  try {
    const stdout = execFileSync(command, args, {
      cwd: projectRoot,
      encoding: "utf-8",
      maxBuffer: 2 * 1024 * 1024,
      timeout,
    });
    return { ok: true, stdout, stderr: "", exitCode: 0 };
  } catch (error) {
    const failure = error as {
      status?: number;
      stdout?: unknown;
      stderr?: unknown;
      message?: string;
    };
    return {
      ok: false,
      stdout: typeof failure.stdout === "string" ? failure.stdout : "",
      stderr:
        typeof failure.stderr === "string"
          ? failure.stderr
          : typeof failure.message === "string"
            ? failure.message
            : String(error),
      exitCode: typeof failure.status === "number" ? failure.status : 1,
    };
  }
}

function runNodeScript(projectRoot: string, scriptPath: string, args: string[] = []): CommandResult {
  return runCommand(projectRoot, process.execPath, [join(projectRoot, scriptPath), ...args]);
}

function parseJsonOutput(command: CommandResult): unknown {
  if (!command.ok) return null;
  try {
    return JSON.parse(command.stdout);
  } catch {
    return null;
  }
}

function readPackageScripts(projectRoot: string): Record<string, string> {
  try {
    const raw = readFileSync(join(projectRoot, "package.json"), "utf-8");
    const parsed = JSON.parse(raw) as { scripts?: unknown };
    return isRecord(parsed.scripts)
      ? Object.fromEntries(
          Object.entries(parsed.scripts).filter((entry): entry is [string, string] => typeof entry[1] === "string")
        )
      : {};
  } catch {
    return {};
  }
}

function parseGitStatus(stdout: string): GitStatusEntry[] {
  return stdout
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter((line) => line !== "")
    .map((line) => {
      const status = line.slice(0, 2);
      const filePart = line.slice(3);
      const renameTarget = filePart.includes(" -> ") ? filePart.split(" -> ").at(-1) : filePart;
      const file = renameTarget ?? filePart;
      return {
        status,
        file,
        raw: line,
        deleted: status.includes("D"),
      };
    });
}

function collectGitStatus(projectRoot: string, maxFiles: number): JsonObject {
  const statusResult = runCommand(projectRoot, "git", ["status", "--porcelain=v1"], 8_000);
  if (!statusResult.ok) {
    return {
      available: false,
      dirty: null,
      error: statusResult.stderr,
      files: [],
    };
  }

  const entries = parseGitStatus(statusResult.stdout);
  return {
    available: true,
    dirty: entries.length > 0,
    changedFileCount: entries.length,
    files: entries.slice(0, maxFiles),
    truncated: entries.length > maxFiles,
  };
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter((value) => value !== "")));
}

function shouldCheckFile(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/");
  if (
    normalized.startsWith("dist/") ||
    normalized.startsWith("node_modules/") ||
    normalized.startsWith(".vite/") ||
    normalized.startsWith("data/")
  ) {
    return false;
  }
  return CHECKABLE_EXTENSIONS.has(extname(normalized));
}

function textResult(payload: JsonObject, isError = false): ToolTextResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

function textOutput(text: string, isError = false): ToolTextResult {
  return {
    content: [{ type: "text", text }],
    ...(isError ? { isError: true } : {}),
  };
}

function compactText(value: string, maxLength = 120): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, Math.max(0, maxLength - 3))}...` : normalized;
}

function stringField(source: unknown, key: string, fallback: string): string {
  if (!isRecord(source)) return fallback;
  const value = source[key];
  return typeof value === "string" && value !== "" ? value : fallback;
}

function changedFileCountLabel(git: JsonObject): string {
  if (git["skipped"] === true) return "skipped";
  const changedFileCount = git["changedFileCount"];
  if (typeof changedFileCount === "number") return String(changedFileCount);
  if (git["dirty"] === false) return "0";
  return "unknown";
}

function issueLines(label: string, issues: string[], maxItems = 2): string[] {
  const visible = issues.slice(0, maxItems).map((issue) => `${label}: ${compactText(issue)}`);
  const hiddenCount = issues.length - visible.length;
  return hiddenCount > 0 ? [...visible, `${label}_more=${hiddenCount}`] : visible;
}

function formatDoctorCompact(params: {
  status: string;
  modeStatus: unknown;
  whereami: unknown;
  git: JsonObject;
  critical: string[];
  warnings: string[];
}): string {
  const mode = stringField(params.modeStatus, "mode", "skipped");
  const surface = stringField(params.whereami, "effectiveMode", stringField(params.whereami, "mode", "skipped"));
  const next =
    params.critical.length > 0
      ? "fix-critical-before-editing"
      : params.warnings.length > 0
        ? "proceed-with-warnings"
        : "proceed";
  return [
    `doctor: status=${params.status} mode=${mode} surface=${surface} dirty=${changedFileCountLabel(
      params.git
    )} critical=${params.critical.length} warnings=${params.warnings.length} next=${next}`,
    ...issueLines("critical", params.critical),
    ...issueLines("warning", params.warnings),
  ].join("\n");
}

function formatGap(gap: VerificationGap): string {
  return `${gap.severity}${gap.file !== undefined ? ` ${gap.file}` : ""}: ${gap.message}`;
}

function formatVerifyCompact(params: {
  status: string;
  readyToReport: boolean;
  scope: string;
  candidateFiles: string[];
  checks: JsonObject[];
  evidenceCount: number;
  blockingGaps: VerificationGap[];
  warningGaps: VerificationGap[];
  infoGaps: VerificationGap[];
  runSyntax: boolean;
}): string {
  const next =
    params.status === "blocked"
      ? "fix-blocking-gaps"
      : params.status === "needs_evidence"
        ? "add-verification-evidence"
        : params.warningGaps.length > 0
          ? "report-with-warnings"
          : "report";
  const gapLines = [...params.blockingGaps, ...params.warningGaps]
    .slice(0, 3)
    .map((gap) => `gap: ${compactText(formatGap(gap))}`);
  const hiddenGapCount = params.blockingGaps.length + params.warningGaps.length - gapLines.length;
  return [
    `verify: status=${params.status} ready=${String(params.readyToReport)} scope=${params.scope} candidates=${
      params.candidateFiles.length
    } checked=${params.checks.length} evidence=${params.evidenceCount} blocking=${
      params.blockingGaps.length
    } warnings=${params.warningGaps.length} info=${params.infoGaps.length} syntax=${
      params.runSyntax ? "on" : "off"
    } next=${next}`,
    ...gapLines,
    ...(hiddenGapCount > 0 ? [`gap_more=${hiddenGapCount}`] : []),
  ].join("\n");
}

function handleAssistantDoctor(args: Record<string, unknown>, projectRoot: string): unknown {
  const responseFormat = asResponseFormat(args["response_format"]);
  const includeRuntime = asBoolean(args["include_runtime"], true);
  const includeGit = asBoolean(args["include_git"], true);
  const maxGitFiles = Math.max(1, Math.floor(asNumber(args["max_git_files"], DEFAULT_GIT_FILE_LIMIT)));
  const generatedAt = new Date().toISOString();

  const modeStatusCommand = includeRuntime
    ? runNodeScript(projectRoot, "scripts/transition.mjs", ["status"])
    : null;
  const whereamiCommand = includeRuntime ? runNodeScript(projectRoot, "scripts/whereami.mjs") : null;
  const modeStatus = modeStatusCommand !== null ? parseJsonOutput(modeStatusCommand) : null;
  const whereami = whereamiCommand !== null ? parseJsonOutput(whereamiCommand) : null;

  const scripts = readPackageScripts(projectRoot);
  const requiredScripts = ["mode:status", "whereami", "mcp:build", "typecheck", "intel:search"];
  const missingScripts = requiredScripts.filter((scriptName) => scripts[scriptName] === undefined);
  const requiredFiles = [
    "AGENTS.md",
    "mcp-server/start.js",
    "mcp-server/core/handlers/index.ts",
    "scripts/transition.mjs",
    "scripts/whereami.mjs",
  ];
  const missingFiles = requiredFiles.filter((filePath) => !existsSync(join(projectRoot, filePath)));
  const git = includeGit ? collectGitStatus(projectRoot, maxGitFiles) : { skipped: true };

  const warnings: string[] = [];
  const critical: string[] = [];

  if (modeStatusCommand !== null && !modeStatusCommand.ok) {
    critical.push(`mode status failed: ${modeStatusCommand.stderr}`);
  }
  if (whereamiCommand !== null && !whereamiCommand.ok) {
    critical.push(`whereami failed: ${whereamiCommand.stderr}`);
  }
  if (missingScripts.length > 0) {
    warnings.push(`missing package scripts: ${missingScripts.join(", ")}`);
  }
  if (missingFiles.length > 0) {
    critical.push(`missing required files: ${missingFiles.join(", ")}`);
  }
  if (isRecord(modeStatus) && modeStatus["mode"] === "conflict") {
    critical.push("runtime mode is conflict");
  }
  if (isRecord(modeStatus) && modeStatus["mode"] === "transitioning") {
    warnings.push("runtime mode is transitioning");
  }
  if (isRecord(whereami) && whereami["effectiveMode"] === "conflict") {
    critical.push("assistant surface is conflict");
  }

  const status = critical.length > 0 ? "blocked" : warnings.length > 0 ? "attention" : "ok";

  const payload = {
    success: critical.length === 0,
    status,
    generatedAt,
    projectRoot,
    mcp: {
      active: true,
      tool: "hev_assistant_doctor",
    },
    runtime: {
      included: includeRuntime,
      modeStatus,
      whereami,
    },
    project: {
      scripts: {
        required: requiredScripts,
        missing: missingScripts,
      },
      files: {
        required: requiredFiles,
        missing: missingFiles,
      },
    },
    git,
    issues: {
      critical,
      warnings,
    },
    recommendedNextAction:
      critical.length > 0
        ? "Fix critical runtime or project-surface issues before editing."
        : warnings.length > 0
          ? "Proceed carefully and account for warnings in the final verification."
          : "Proceed with the requested task.",
  };

  if (responseFormat === "json") {
    return textResult(payload);
  }

  return textOutput(
    formatDoctorCompact({
      status,
      modeStatus,
      whereami,
      git,
      critical,
      warnings,
    })
  );
}

async function handleAssistantVerifyCompletion(
  args: Record<string, unknown>,
  projectRoot: string
): Promise<unknown> {
  const responseFormat = asResponseFormat(args["response_format"]);
  const generatedAt = new Date().toISOString();
  const task = typeof args["task"] === "string" ? args["task"] : "";
  const hasExplicitFileArgs = Array.isArray(args["changed_files"]) || Array.isArray(args["files"]);
  const explicitFiles = uniqueStrings([
    ...asStringArray(args["changed_files"]),
    ...asStringArray(args["files"]),
  ]);
  const evidence = uniqueStrings(asStringArray(args["evidence"]));
  const runSyntax = asBoolean(args["run_syntax"], true);
  const checkEslint = asBoolean(args["check_eslint"], false);
  const checkTs = asBoolean(args["check_ts"], false);
  const strict = asBoolean(args["strict"], false);
  const maxFiles = Math.max(1, Math.floor(asNumber(args["max_files"], DEFAULT_VERIFY_FILE_LIMIT)));
  const git = collectGitStatus(projectRoot, Math.max(DEFAULT_GIT_FILE_LIMIT, maxFiles));
  const gitFiles = Array.isArray(git["files"])
    ? (git["files"] as GitStatusEntry[]).filter((entry) => !entry.deleted).map((entry) => entry.file)
    : [];
  const candidateFiles = hasExplicitFileArgs ? explicitFiles : uniqueStrings(gitFiles);
  const scope = hasExplicitFileArgs ? "explicit" : candidateFiles.length > 0 ? "git" : "none";
  const checkableFiles = candidateFiles.filter(
    (filePath) => existsSync(join(projectRoot, filePath)) && shouldCheckFile(filePath)
  );
  const skippedFiles = candidateFiles.filter((filePath) => !checkableFiles.includes(filePath));
  const filesToCheck = checkableFiles.slice(0, maxFiles);
  const gaps: VerificationGap[] = [];
  const checks: JsonObject[] = [];

  if (candidateFiles.length === 0 && evidence.length === 0) {
    gaps.push({
      severity: "warning",
      message: "No changed files or external evidence were provided.",
    });
  }

  if (!hasExplicitFileArgs && candidateFiles.length > 0) {
    gaps.push({
      severity: "warning",
      message: "No explicit changed_files were provided; using current git changed files.",
    });
  }

  if (skippedFiles.length > 0) {
    gaps.push({
      severity: "info",
      message: `Skipped non-checkable, generated, missing, or deleted files: ${skippedFiles.join(", ")}`,
    });
  }

  if (checkableFiles.length > filesToCheck.length) {
    gaps.push({
      severity: "warning",
      message: `Only ${filesToCheck.length} of ${checkableFiles.length} checkable files were syntax-checked.`,
    });
  }

  if (runSyntax) {
    for (const filePath of filesToCheck) {
      // NOTE: Keep verification sequential; TypeScript and ESLint checks may spawn project-level processes.
      // eslint-disable-next-line no-await-in-loop
      const result = await checkSyntax(
        filePath,
        {
          checkBrackets: true,
          checkEslint,
          checkTs,
        },
        projectRoot
      );
      checks.push({
        file: filePath,
        success: result.success,
        bracketsBalanced: result.bracketsBalanced,
        errorCount: result.errors.length,
        errors: result.errors,
      });
      if (!result.success || result.errors.length > 0) {
        gaps.push({
          severity: "blocking",
          message: "Syntax verification failed.",
          file: filePath,
        });
      }
    }
  } else if (checkableFiles.length > 0) {
    gaps.push({
      severity: "warning",
      message: "Syntax verification was skipped for checkable files.",
    });
  }

  if (strict && evidence.length === 0) {
    gaps.push({
      severity: "blocking",
      message: "Strict verification requires at least one explicit evidence entry.",
    });
  } else if (evidence.length === 0 && checks.length === 0) {
    gaps.push({
      severity: "warning",
      message: "No verification evidence was recorded.",
    });
  }

  const blockingGaps = gaps.filter((gap) => gap.severity === "blocking");
  const warningGaps = gaps.filter((gap) => gap.severity === "warning");
  const infoGaps = gaps.filter((gap) => gap.severity === "info");
  const automaticEvidence =
    runSyntax && checks.length > 0
      ? [`MCP syntax verification ran for ${checks.length} file(s).`]
      : [];
  const readyToReport = blockingGaps.length === 0 && (checks.length > 0 || evidence.length > 0);
  const status = blockingGaps.length > 0 ? "blocked" : readyToReport ? "verified" : "needs_evidence";
  const evidenceCount = automaticEvidence.length + evidence.length;
  const checkedFiles = runSyntax ? filesToCheck : [];

  const payload = {
    success: blockingGaps.length === 0,
    readyToReport,
    status,
    generatedAt,
    task,
    git,
    verification: {
      options: {
        runSyntax,
        checkEslint,
        checkTs,
        strict,
        maxFiles,
      },
      candidateFiles,
      scope,
      checkableFiles,
      checkedFiles,
      checks,
      evidence: [...automaticEvidence, ...evidence],
      gaps,
    },
    summary: {
      blockingGapCount: blockingGaps.length,
      warningGapCount: warningGaps.length,
      checkedFileCount: checks.length,
      evidenceCount,
    },
    recommendedNextAction:
      status === "blocked"
        ? "Fix blocking verification gaps before reporting completion."
        : status === "needs_evidence"
          ? "Run or provide at least one verification check before reporting completion."
          : warningGaps.length > 0
          ? "Completion can be reported with warnings explicitly mentioned."
          : "Completion can be reported.",
  };

  if (responseFormat === "json") {
    return textResult(payload);
  }

  return textOutput(
    formatVerifyCompact({
      status,
      readyToReport,
      scope,
      candidateFiles,
      checks,
      evidenceCount,
      blockingGaps,
      warningGaps,
      infoGaps,
      runSyntax,
    })
  );
}

export const ASSISTANT_DOCTOR_TOOL = {
  name: "hev_assistant_doctor",
  description:
    "AI-facing Hayalet-ev health check. Returns structured runtime, surface, project script, required file, and git status diagnostics.",
  inputSchema: {
    type: "object",
    properties: {
      include_runtime: {
        type: "boolean",
        default: true,
        description: "Run mode:status and whereami checks.",
      },
      include_git: {
        type: "boolean",
        default: true,
        description: "Include git dirty-state and changed file summary.",
      },
      max_git_files: {
        type: "number",
        default: DEFAULT_GIT_FILE_LIMIT,
        description: "Maximum changed files to include in the report.",
      },
      response_format: {
        type: "string",
        enum: ["compact", "json"],
        default: "compact",
        description: "compact returns a short assistant-actionable summary; json returns full diagnostics.",
      },
    },
  },
  metadata: {
    category: "assistant",
    subcategory: "health",
    priority: "high",
    complexity: "simple",
    requiresConfirmation: false,
    riskLevel: "low",
    tags: ["doctor", "health", "mode", "verification"],
  },
};

export const ASSISTANT_VERIFY_COMPLETION_TOOL = {
  name: "hev_assistant_verify_completion",
  description:
    "AI-facing verified-completion report. Checks changed files or provided files and returns structured evidence, gaps, and report readiness.",
  inputSchema: {
    type: "object",
    properties: {
      task: {
        type: "string",
        description: "Short description of the task being verified.",
      },
      changed_files: {
        type: "array",
        items: { type: "string" },
        description: "Optional explicit files to verify. Uses git changed files when omitted.",
      },
      files: {
        type: "array",
        items: { type: "string" },
        description: "Alias for changed_files.",
      },
      evidence: {
        type: "array",
        items: { type: "string" },
        description: "Commands or checks already run outside this tool.",
      },
      run_syntax: {
        type: "boolean",
        default: true,
        description: "Run MCP syntax verification on checkable files.",
      },
      check_eslint: {
        type: "boolean",
        default: false,
        description: "Also run ESLint in syntax verification.",
      },
      check_ts: {
        type: "boolean",
        default: false,
        description: "Also run TypeScript diagnostics in syntax verification.",
      },
      strict: {
        type: "boolean",
        default: false,
        description: "Require explicit external evidence in addition to automatic checks.",
      },
      max_files: {
        type: "number",
        default: DEFAULT_VERIFY_FILE_LIMIT,
        description: "Maximum checkable files to syntax-check.",
      },
      response_format: {
        type: "string",
        enum: ["compact", "json"],
        default: "compact",
        description: "compact returns a short assistant-actionable summary; json returns full diagnostics.",
      },
    },
  },
  metadata: {
    category: "assistant",
    subcategory: "verification",
    priority: "high",
    complexity: "moderate",
    requiresConfirmation: false,
    riskLevel: "low",
    tags: ["verified-completion", "evidence", "syntax", "doctor"],
  },
};

export function createAssistantTools(projectRoot: string): ToolEntry[] {
  return [
    {
      definition: ASSISTANT_DOCTOR_TOOL,
      handler: async (args): Promise<unknown> =>
        await handleAssistantDoctor(isRecord(args) ? args : {}, projectRoot),
    },
    {
      definition: ASSISTANT_VERIFY_COMPLETION_TOOL,
      handler: async (args): Promise<unknown> =>
        await handleAssistantVerifyCompletion(isRecord(args) ? args : {}, projectRoot),
    },
  ];
}
