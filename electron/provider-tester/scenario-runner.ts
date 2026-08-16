import type {
  ProviderScenarioCommandReport,
  ProviderScenarioId,
  ProviderScenarioProgressEvent,
  ProviderTestResult,
  ProviderTestSlot,
  TestStatus,
} from "../../src/types/provider.ts";
import { PROVIDER_SCENARIO_DELAYS } from "../../shared/timeouts.ts";

export const PROVIDER_TEST_PROMPT =
  "1'den 20'ye kadar numaralari yaz. Her satirda yalnizca bir sayi olsun. Baska aciklama ekleme.";

export const PROVIDER_TEST_IMAGE_PROMPT =
  "3:2 oranli, beyaz fonda tek bir kirmizi elma gorseli uret. Metin ekleme.";

export type ScenarioCommandSeverity = "core" | "soft" | "provider";
type Awaitable<T> = T | Promise<T>;

export class ScenarioCancelledError extends Error {
  constructor(message = "Scenario stopped by user") {
    super(message);
    this.name = "ScenarioCancelledError";
  }
}

export interface ScenarioCommandContext {
  values: Record<string, unknown>;
}

export interface ScenarioCommandResult {
  status: TestStatus;
  message: string;
  result: ProviderTestResult;
  output?: unknown;
  results?: ProviderTestResult[];
}

export interface ScenarioCommandRun {
  stepId: string;
  stepName: string;
  action: string;
  saveOutputAs?: string;
  input?: Record<string, unknown>;
  run: () => Awaitable<ScenarioCommandResult>;
}

export interface ScenarioCommandDefinition {
  id: string;
  name: string;
  action: string;
  severity: ScenarioCommandSeverity;
  delayAfterMs?: number;
  resolveRuns: (context: ScenarioCommandContext) => Awaitable<ScenarioCommandRun[]>;
}

export interface RunCommandScenarioOptions {
  runId: string;
  scenarioId: ProviderScenarioId;
  slot: ProviderTestSlot;
  providerId: string;
  commands: ScenarioCommandDefinition[];
  commandStartDelayMs?: number;
  emitProgress?: (event: ProviderScenarioProgressEvent) => void;
  signal?: AbortSignal;
}

export interface RunCommandScenarioResult {
  scenarioId: ProviderScenarioId;
  aborted: boolean;
  abortReason?: string;
  failed: number;
  warnings: number;
  commands: ProviderScenarioCommandReport[];
  results: ProviderTestResult[];
  context: ScenarioCommandContext;
}

function emitCommand(
  options: RunCommandScenarioOptions,
  type: ProviderScenarioProgressEvent["type"],
  payload: Partial<ProviderScenarioProgressEvent> = {}
): void {
  options.emitProgress?.({
    runId: options.runId,
    scenarioId: options.scenarioId,
    slot: options.slot,
    providerId: options.providerId,
    scenarioCommandTotal: options.commands.length,
    type,
    timestamp: Date.now(),
    ...payload,
  });
}

function isScenarioCancelledError(error: unknown): error is ScenarioCancelledError {
  return error instanceof ScenarioCancelledError;
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted === true) {
    throw new ScenarioCancelledError();
  }
}

async function wait(delayMs: number | undefined, signal?: AbortSignal): Promise<void> {
  if (typeof delayMs !== "number" || delayMs <= 0) {
    throwIfCancelled(signal);
    return;
  }

  const abortSignal = signal;
  await new Promise<void>((resolve, reject) => {
    let abortHandler: EventListener | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      timeoutId = null;
      if (abortSignal !== undefined && abortHandler !== null) {
        abortSignal.removeEventListener("abort", abortHandler);
      }
      resolve();
    }, delayMs);

    if (abortSignal !== undefined) {
      abortHandler = (): void => {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (abortHandler !== null) {
          abortSignal.removeEventListener("abort", abortHandler);
        }
        reject(new ScenarioCancelledError());
      };
      abortSignal.addEventListener("abort", abortHandler, { once: true });
    }
  });
}

function resolveCommandStartDelay(delayMs: number | undefined): number {
  if (delayMs === undefined) {
    return PROVIDER_SCENARIO_DELAYS.COMMAND_START;
  }

  return Math.max(0, delayMs);
}

function createRunningCommandReport(
  run: ScenarioCommandRun,
  startedAt: number
): ProviderScenarioCommandReport {
  return {
    id: run.stepId,
    name: run.stepName,
    action: run.action,
    status: "running",
    message: run.stepName,
    duration: 0,
    timestamp: startedAt,
    startedAt,
    ...(run.input !== undefined ? { input: run.input } : {}),
  };
}

function createCancelledCommandResult(
  run: ScenarioCommandRun,
  commandReport: ProviderScenarioCommandReport,
  message: string,
  startedAt: number,
  completedAt: number
): { commandReport: ProviderScenarioCommandReport; result: ProviderTestResult } {
  const updatedReport: ProviderScenarioCommandReport = {
    ...commandReport,
    status: "warning",
    message,
    duration: completedAt - startedAt,
    completedAt,
  };

  return {
    commandReport: updatedReport,
    result: {
      id: run.stepId,
      name: run.stepName,
      category: "advanced",
      status: "warning",
      message,
      duration: completedAt - startedAt,
      timestamp: startedAt,
    },
  };
}

export async function runCommandScenario(
  options: RunCommandScenarioOptions
): Promise<RunCommandScenarioResult> {
  const context: ScenarioCommandContext = {
    values: {},
  };
  const commands: ProviderScenarioCommandReport[] = [];
  const results: ProviderTestResult[] = [];
  let aborted = false;
  let abortReason: string | undefined;

  emitCommand(options, "started");

  // NOTE: Scenario commands are intentionally serialized because later steps depend on earlier output.
  /* eslint-disable no-await-in-loop */
  outer: for (let commandIndex = 0; commandIndex < options.commands.length; commandIndex += 1) {
    throwIfCancelled(options.signal);

    const command = options.commands[commandIndex];
    if (command === undefined) {
      continue;
    }

    const runs = await command.resolveRuns(context);
    for (let runIndex = 0; runIndex < runs.length; runIndex += 1) {
      throwIfCancelled(options.signal);

      const run = runs[runIndex];
      if (run === undefined) {
        continue;
      }

      const startedAt = Date.now();
      const runningReport = createRunningCommandReport(run, startedAt);
      commands.push(runningReport);

      emitCommand(options, "command-start", {
        commandId: run.stepId,
        commandName: run.stepName,
        status: "running",
        message: run.stepName,
        commandReport: runningReport,
      });

      try {
        await wait(resolveCommandStartDelay(options.commandStartDelayMs), options.signal);
        throwIfCancelled(options.signal);

        const result = await run.run();
        throwIfCancelled(options.signal);

        const completedAt = Date.now();
        if (run.saveOutputAs !== undefined && result.output !== undefined) {
          context.values[run.saveOutputAs] = result.output;
        }

        const commandResult = {
          ...result.result,
          status: result.status,
          message: result.message,
          duration: completedAt - startedAt,
          timestamp: result.result.timestamp,
        } satisfies ProviderTestResult;
        const suiteResults = result.results ?? [commandResult];
        results.push(...suiteResults);

        Object.assign(runningReport, {
          status: result.status,
          message: result.message,
          duration: completedAt - startedAt,
          completedAt,
          ...(result.output !== undefined ? { output: result.output } : {}),
          ...(commandResult.details !== undefined ? { details: commandResult.details } : {}),
        });

        emitCommand(options, "command-complete", {
          commandId: run.stepId,
          commandName: run.stepName,
          status: runningReport.status,
          message: runningReport.message,
          commandReport: runningReport,
        });

        if (command.severity === "core" && result.status === "fail") {
          aborted = true;
          abortReason = result.message;
          break outer;
        }

        const hasMoreRuns = runIndex < runs.length - 1;
        const hasMoreCommands = commandIndex < options.commands.length - 1;
        if (hasMoreRuns || hasMoreCommands) {
          await wait(command.delayAfterMs, options.signal);
        }
      } catch (error) {
        if (isScenarioCancelledError(error)) {
          const completedAt = Date.now();
          const message = error.message;
          const cancelled = createCancelledCommandResult(
            run,
            runningReport,
            message,
            startedAt,
            completedAt
          );
          Object.assign(runningReport, cancelled.commandReport);
          results.push(cancelled.result);
          aborted = true;
          abortReason = message;

          emitCommand(options, "command-complete", {
            commandId: run.stepId,
            commandName: run.stepName,
            status: runningReport.status,
            message: runningReport.message,
            commandReport: runningReport,
          });
          break outer;
        }

        const message = error instanceof Error ? error.message : String(error);
        const completedAt = Date.now();
        const failedResult = {
          id: run.stepId,
          name: run.stepName,
          category: "advanced",
          status: "fail",
          message,
          duration: completedAt - startedAt,
          timestamp: startedAt,
        } satisfies ProviderTestResult;
        results.push(failedResult);

        Object.assign(runningReport, {
          status: "fail" as const,
          message,
          duration: completedAt - startedAt,
          completedAt,
        });

        emitCommand(options, "command-complete", {
          commandId: run.stepId,
          commandName: run.stepName,
          status: runningReport.status,
          message: runningReport.message,
          commandReport: runningReport,
        });

        if (command.severity === "core") {
          aborted = true;
          abortReason = message;
          break outer;
        }
      }
    }
  }
  /* eslint-enable no-await-in-loop */

  emitCommand(options, "completed", {
    message: abortReason ?? "completed",
  });

  return {
    scenarioId: options.scenarioId,
    aborted,
    ...(abortReason !== undefined ? { abortReason } : {}),
    failed: commands.filter((command) => command.status === "fail").length,
    warnings: commands.filter((command) => command.status === "warning").length,
    commands,
    results,
    context,
  };
}
