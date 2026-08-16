import { readFileSync } from "fs";
import { join } from "path";
import { createMcpTranslatorSync } from "../../utils/i18n/index.js";
import { createProgress } from "../../utils/progress.js";
import { logToolError } from "../../utils/mcp-logger.js";
import { DEV_TIMEOUTS } from "@timeouts";
import {
  bufferishToString,
  firstNonEmptyString,
  formatCommandForLog,
  resolvePackageBin,
  runNodeCli,
  runNpm,
} from "./command-runner.js";

interface PackageJsonLike {
  devDependencies?: Record<string, unknown>;
  dependencies?: Record<string, unknown>;
}

function testRunnerT(key: string, params?: Record<string, string | number | boolean>): string {
  return createMcpTranslatorSync()(`mcpServer.devTools.testRunner.${key}`, params);
}

function testRunnerDefT(key: string, params?: Record<string, string | number | boolean>): string {
  return createMcpTranslatorSync()(`mcpServer.devTools.testRunner.definition.${key}`, params);
}

export function testRun(
  projectRoot: string,
  options: { file?: string; grep?: string; timeout?: number } = {}
): { success: boolean; output: string; passed: number; failed: number } {
  const progress = createProgress({ operation: testRunnerT("progress.operation"), interval: 3000 });

  try {
    let commandLabel = "npm test";
    let runTests: (timeout: number) => string = (timeout: number): string =>
      runNpm(["test"], {
        cwd: projectRoot,
        encoding: "utf-8",
        timeout,
        maxBuffer: 10 * 1024 * 1024,
      });

    const pkgRaw: unknown = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf-8"));
    const pkg: PackageJsonLike = typeof pkgRaw === "object" && pkgRaw !== null ? pkgRaw : {};
    const hasVitest = Boolean(pkg.devDependencies?.["vitest"] ?? pkg.dependencies?.["vitest"]);
    const hasJest = Boolean(pkg.devDependencies?.["jest"] ?? pkg.dependencies?.["jest"]);

    if (hasVitest) {
      const args = [
        "run",
        ...(options.file !== undefined && options.file.length > 0 ? [options.file] : []),
        ...(options.grep !== undefined && options.grep.length > 0 ? ["--grep", options.grep] : []),
      ];
      const vitestCli = resolvePackageBin("vitest", projectRoot, "vitest");
      if (vitestCli !== null) {
        commandLabel = formatCommandForLog(process.execPath, [vitestCli, ...args]);
        runTests = (timeout: number): string =>
          runNodeCli(vitestCli, args, {
            cwd: projectRoot,
            encoding: "utf-8",
            timeout,
            maxBuffer: 10 * 1024 * 1024,
          });
      } else {
        commandLabel = formatCommandForLog("npm exec", ["--", "vitest", ...args]);
        runTests = (timeout: number): string =>
          runNpm(["exec", "--", "vitest", ...args], {
            cwd: projectRoot,
            encoding: "utf-8",
            timeout,
            maxBuffer: 10 * 1024 * 1024,
          });
      }
    } else if (hasJest) {
      const args = [
        ...(options.file !== undefined && options.file.length > 0 ? [options.file] : []),
        ...(options.grep !== undefined && options.grep.length > 0 ? ["-t", options.grep] : []),
      ];
      const jestCli = resolvePackageBin("jest", projectRoot, "jest");
      if (jestCli !== null) {
        commandLabel = formatCommandForLog(process.execPath, [jestCli, ...args]);
        runTests = (timeout: number): string =>
          runNodeCli(jestCli, args, {
            cwd: projectRoot,
            encoding: "utf-8",
            timeout,
            maxBuffer: 10 * 1024 * 1024,
          });
      } else {
        commandLabel = formatCommandForLog("npm exec", ["--", "jest", ...args]);
        runTests = (timeout: number): string =>
          runNpm(["exec", "--", "jest", ...args], {
            cwd: projectRoot,
            encoding: "utf-8",
            timeout,
            maxBuffer: 10 * 1024 * 1024,
          });
      }
    }

    const timeout = options.timeout ?? DEV_TIMEOUTS.TEST;
    progress.update(0, testRunnerT("progress.running", { command: commandLabel }));

    try {
      const output = runTests(timeout);

      const passMatch = output.match(/(\d+)\s+pass/i);
      const failMatch = output.match(/(\d+)\s+fail/i);
      const passed = passMatch ? parseInt(passMatch[1] ?? "0") : 0;
      const failed = failMatch ? parseInt(failMatch[1] ?? "0") : 0;

      progress.done(testRunnerT("progress.completed", { passed, failed }));
      return {
        success: true,
        output,
        passed,
        failed,
      };
    } catch (err) {
      const error = err as { stdout?: unknown; stderr?: unknown };
      const output = firstNonEmptyString(
        bufferishToString(error.stdout),
        bufferishToString(error.stderr),
        String(err)
      );

      const passMatch = output.match(/(\d+)\s+pass/i);
      const failMatch = output.match(/(\d+)\s+fail/i);
      const passed = passMatch ? parseInt(passMatch[1] ?? "0") : 0;
      const failed = failMatch ? parseInt(failMatch[1] ?? "0") : 0;

      progress.fail(testRunnerT("progress.failed", { passed, failed }));
      return {
        success: false,
        output,
        passed,
        failed,
      };
    }
  } catch (error) {
    progress.fail((error as Error).message);
    logToolError("hev_dev_test_run", error as Error, {
      file: options.file,
      grep: options.grep,
      timeout: options.timeout,
    });
    return { success: false, output: (error as Error).message, passed: 0, failed: 0 };
  }
}

export const TEST_RUNNER_TOOL = {
  name: "hev_dev_test_run",
  description: testRunnerDefT("description"),
  inputSchema: {
    type: "object" as const,
    properties: {
      file: {
        type: "string" as const,
        description: testRunnerDefT("file"),
      },
      grep: {
        type: "string" as const,
        description: testRunnerDefT("grep"),
      },
      timeout: {
        type: "integer" as const,
        description: testRunnerDefT("timeout"),
        default: 30000,
      },
    },
  },
  metadata: {
    category: "development",
    subcategory: "testing",
    priority: "high",
    complexity: "medium",
    useCases: [
      testRunnerDefT("useCases.beforeCommit"),
      testRunnerDefT("useCases.specificFiles"),
      testRunnerDefT("useCases.verifyChanges"),
    ],
    relatedTools: ["hev_fs_bash", "hev_dev_check_syntax"],
    agentGuidance: testRunnerDefT("agentGuidance"),
    requiresConfirmation: false,
    riskLevel: "low",
    tags: ["testing", "vitest", "jest", "auto-detect", "verification"],
  },
};
