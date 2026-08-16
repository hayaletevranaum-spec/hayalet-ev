import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import {
  PROVIDER_SCENARIO_DELAYS,
  PROVIDER_SCENARIO_TIMEOUTS,
  PROVIDER_TEST_INTERVALS,
  PROVIDER_TEST_TIMEOUTS,
} from "../../shared/timeouts.ts";
import { DEFAULT_APP_LANGUAGE } from "../../src/types/i18n.ts";
import type { TranslationParams } from "../../src/types/i18n.ts";

import type {
  ProviderConfig,
  ProviderScenarioCommandDefinition,
  ProviderScenarioDefinition,
  ProviderScenarioId,
  ProviderSessionPreview,
  ProviderTestProgressEvent,
  ProviderTestResult,
  ProviderTestSuite,
  ProviderTestSlot,
  ProviderWebviewSyncConfig,
  ProviderWebviewSyncMode,
  TestStatus,
} from "../../src/types/provider.ts";

import type {
  ProviderTesterDatabaseManager,
  ProviderTestRunOptions,
  RendererShell,
  TestContext,
  WebviewTag,
} from "./types.ts";
import { PROVIDER_TEST } from "./types.ts";
import {
  createClickElement,
  createExecuteScript,
  createIsElementVisible,
  createSkipResult,
  createTestSelector,
  waitForCondition,
} from "./utils.ts";
import { providerTesterT } from "./i18n.ts";
import {
  runCommandScenario as runConfiguredCommandScenario,
  ScenarioCancelledError,
  type ScenarioCommandContext,
  type ScenarioCommandDefinition as RuntimeScenarioCommandDefinition,
  type ScenarioCommandRun,
  type ScenarioCommandResult,
  type ScenarioCommandSeverity,
} from "./scenario-runner.ts";
import { testExcludedUrl } from "./preflight-tests.ts";
import {
  testAttachButton,
  testCriticalSelectors,
  testFileInput,
  testInputField,
  testUploadTarget,
} from "./dom-tests.ts";
import {
  testAIResponseInspect,
  testFileUpload,
  testInputFieldAccessibility,
  testMicrophoneButton,
  testPrepareInput,
  testSendButtonDisabled,
  testSendButtonEnabled,
  testSendMessage,
  testStopButtonWhileThinking,
  testTextInjection,
  testUserMessageInspect,
} from "./interactive-tests.ts";
import {
  testAssistantMessageScraping,
  testGeneratedImage,
  testMessageContainer,
  testStopButton,
  testVoiceButton,
} from "./scraping-tests.ts";
import { hashString } from "../../src/js/modules/webview/providers/shared/scraper-helpers.ts";
import {
  buildGeneratedImageExtractionScript,
  parseGeneratedImageDataUrl,
} from "../../src/js/modules/webview/providers/shared/generated-image-extractor.ts";

const STATUS_COLOR = {
  busy: "rgb(231, 76, 60)",
  idle: "rgb(46, 204, 113)",
} as const;

function generateRunId(
  slot: ProviderTestSlot,
  providerId: string,
  scenarioId: ProviderScenarioId
): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `provider-scenario-${scenarioId}-${slot}-${providerId}-${Date.now()}-${suffix}`;
}

function resolveDefaultUrl(config: ProviderConfig): string {
  const path = config.defaultPaths?.[0] ?? "";
  if (typeof path === "string" && path !== "") {
    return new URL(path, config.baseUrl).toString();
  }
  return config.baseUrl;
}

function aggregateStatus(results: ProviderTestResult[]): TestStatus {
  if (results.some((result) => result.status === "fail")) return "fail";
  if (results.some((result) => result.status === "warning")) return "warning";
  if (results.every((result) => result.status === "skip")) return "skip";
  return "pass";
}

function aggregateMessage(results: ProviderTestResult[], fallback: string): string {
  const firstFail = results.find((result) => result.status === "fail");
  if (firstFail) return firstFail.message;
  const firstWarning = results.find((result) => result.status === "warning");
  if (firstWarning) return firstWarning.message;
  const firstSkip = results.find((result) => result.status === "skip");
  if (firstSkip) return firstSkip.message;
  return results[results.length - 1]?.message ?? fallback;
}

function createShellResult(
  id: string,
  name: string,
  category: ProviderTestResult["category"],
  status: TestStatus,
  message: string,
  details: ProviderTestResult["details"] = undefined,
  duration = 0
): ProviderTestResult {
  return {
    id,
    name,
    category,
    status,
    message,
    ...(details !== undefined ? { details } : {}),
    duration,
    timestamp: Date.now(),
  };
}

interface SyncSessionPreviewItem {
  title: string;
  url: string;
}

interface SyncSessionOutcome {
  status: TestStatus;
  message: string;
  details?: ProviderTestResult["details"];
  output?: Record<string, unknown>;
}

interface AggregatedCommandStepResult {
  status: TestStatus;
  message: string;
}

interface ScenarioCommandExecutionInput {
  command: ProviderScenarioCommandDefinition;
  session?: SyncSessionPreviewItem;
  index?: number;
  total?: number;
}

interface ConversationMetadataResult {
  success: boolean;
  error?: string;
  data?: {
    conversationId: string;
    created: boolean;
    title: string;
    titleUpdated: boolean;
  };
}

interface ProviderTesterGeneratedImageAsset {
  id?: string;
  stableKey?: string;
  src?: string;
  currentSrc?: string;
  alt?: string;
  mimeType?: string;
  originalName?: string;
  imageIndex?: number;
}

interface ProviderTesterScrapedMessage {
  role: "user" | "assistant";
  text: string;
  index: number;
  domId?: string;
  contentHash?: string;
  generatedImages?: ProviderTesterGeneratedImageAsset[];
}

interface ProviderTesterDbMessageRow {
  id: string;
  role: "user" | "assistant";
  content: string;
  dom_index: number | null;
  dom_id: string | null;
  content_hash: string | null;
}

interface ProviderTesterImageCaptureRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ProviderTesterImageExtractionResult {
  success?: boolean;
  base64?: string;
  mimeType?: string;
  rect?: ProviderTesterImageCaptureRect | null;
  error?: string;
}

interface ProviderTesterGeneratedImagePersistResult {
  savedCount: number;
  pendingCount: number;
}

function readStringField(value: unknown, ...keys: string[]): string {
  if (typeof value !== "object" || value === null) {
    return "";
  }

  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim() !== "") {
      return candidate.trim();
    }
  }

  return "";
}

function readNumberField(value: unknown, ...keys: string[]): number | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function normalizeGeneratedImageAssets(value: unknown): ProviderTesterGeneratedImageAsset[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item, index) => {
    if (typeof item !== "object" || item === null) {
      return [];
    }

    const id = readStringField(item, "id");
    const src = readStringField(item, "src");
    const currentSrc = readStringField(item, "currentSrc", "current_src");
    const stableKey = readStringField(item, "stableKey", "stable_key");
    const alt = readStringField(item, "alt");
    const mimeType = readStringField(item, "mimeType", "mime_type");
    const originalName = readStringField(item, "originalName", "original_name");
    const imageIndex = readNumberField(item, "imageIndex", "image_index") ?? index;

    if (
      id === "" &&
      src === "" &&
      currentSrc === "" &&
      stableKey === "" &&
      alt === "" &&
      mimeType === "" &&
      originalName === ""
    ) {
      return [];
    }

    return [
      {
        ...(id !== "" ? { id } : {}),
        ...(stableKey !== "" ? { stableKey } : {}),
        ...(src !== "" ? { src } : {}),
        ...(currentSrc !== "" ? { currentSrc } : {}),
        ...(alt !== "" ? { alt } : {}),
        ...(mimeType !== "" ? { mimeType } : {}),
        ...(originalName !== "" ? { originalName } : {}),
        imageIndex,
      },
    ];
  });
}

function buildGeneratedImageLookupKey(domIndex: number | undefined, contentHash: string): string {
  return `${domIndex ?? -1}:${contentHash}`;
}

function buildAttachmentDedupeKey(messageId: string, originalName: string): string {
  return `${messageId}::${originalName}`;
}

function extensionFromMimeType(mimeType: string | undefined): string {
  const normalized = mimeType?.trim().toLowerCase() ?? "";
  if (normalized === "image/jpeg" || normalized === "image/jpg") {
    return "jpg";
  }
  if (normalized === "image/webp") {
    return "webp";
  }
  if (normalized === "image/gif") {
    return "gif";
  }
  return "png";
}

function normalizeDbMessages(value: unknown[]): ProviderTesterDbMessageRow[] {
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) {
      return [];
    }

    const record = item as Record<string, unknown>;
    const id = readStringField(record, "id");
    const role =
      record["role"] === "user" ? "user" : record["role"] === "assistant" ? "assistant" : null;
    if (id === "" || role === null) {
      return [];
    }

    const domId = readStringField(record, "dom_id");
    const contentHash = readStringField(record, "content_hash");
    return [
      {
        id,
        role,
        content: readStringField(record, "content"),
        dom_index: readNumberField(record, "dom_index") ?? null,
        dom_id: domId === "" ? null : domId,
        content_hash: contentHash === "" ? null : contentHash,
      },
    ];
  });
}

function normalizeSyncMode(syncMode?: ProviderWebviewSyncMode): ProviderWebviewSyncMode {
  return syncMode ?? "full";
}

async function importModuleByPath(modulePath: string): Promise<unknown> {
  return await import(pathToFileURL(modulePath).href);
}

function resolveProjectRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

async function loadProviderModule(providerId: string): Promise<Record<string, unknown> | null> {
  const providerModuleTs = join(
    resolveProjectRoot(),
    "src",
    "js",
    "modules",
    "webview",
    "providers",
    providerId,
    "index.ts"
  );
  const providerModuleJs = join(
    process.resourcesPath,
    "app.asar",
    "src",
    "js",
    "modules",
    "webview",
    "providers",
    providerId,
    "index.js"
  );
  const providerModulePath = existsSync(providerModuleTs) ? providerModuleTs : providerModuleJs;
  if (!existsSync(providerModulePath)) {
    return null;
  }

  const imported = await importModuleByPath(providerModulePath);
  return typeof imported === "object" && imported !== null
    ? (imported as Record<string, unknown>)
    : null;
}

async function loadDatabaseManager(): Promise<ProviderTesterDatabaseManager> {
  const imported = (await import("../database/index.ts")) as {
    databaseManager: ProviderTesterDatabaseManager;
  };
  return imported.databaseManager;
}

function normalizeScrapedMessages(messages: unknown[]): ProviderTesterScrapedMessage[] {
  return messages.flatMap((message, index) => {
    if (typeof message !== "object" || message === null) {
      return [];
    }

    const maybe = message as Record<string, unknown>;
    const role =
      maybe["role"] === "user" ? "user" : maybe["role"] === "assistant" ? "assistant" : null;
    const text =
      typeof maybe["text"] === "string"
        ? maybe["text"]
        : typeof maybe["content"] === "string"
          ? maybe["content"]
          : "";
    const generatedImages = normalizeGeneratedImageAssets(maybe["generatedImages"]);
    const normalizedText =
      text.trim() !== "" ? text.trim() : generatedImages.length > 0 ? "[image]" : "";
    if (role === null || normalizedText === "") {
      return [];
    }

    const contentHash =
      typeof maybe["contentHash"] === "string" && maybe["contentHash"].trim() !== ""
        ? maybe["contentHash"].trim()
        : hashString(normalizedText);

    return [
      {
        role,
        text: normalizedText,
        index,
        ...(typeof maybe["domId"] === "string" && maybe["domId"] !== ""
          ? { domId: maybe["domId"] }
          : {}),
        contentHash,
        ...(generatedImages.length > 0 ? { generatedImages } : {}),
      },
    ];
  });
}

export class ProviderTester {
  private webview: WebviewTag;
  private config: ProviderConfig;
  private slot: ProviderTestSlot;
  private results: ProviderTestResult[] = [];
  private startTime = 0;
  private ctx: TestContext;
  private shell: RendererShell | null;
  private emitProgress: ((event: ProviderTestProgressEvent) => void) | undefined;
  private runId = "";
  private syncSessions: SyncSessionPreviewItem[] = [];
  private syncMode: ProviderWebviewSyncMode;
  private abortSignal: AbortSignal | undefined;
  private commandStartDelayMs: number | undefined;
  private navigationObservationDelayMs: number;
  private databaseManager: ProviderTesterDatabaseManager | null;
  private defaultUrlOverride: string | undefined;
  private lastAssistantCountBeforeFinalBubbles = 0;

  constructor(
    webview: WebviewTag,
    config: ProviderConfig,
    slot: ProviderTestSlot,
    shell?: RendererShell,
    options: ProviderTestRunOptions = { emitProgress: undefined }
  ) {
    this.webview = webview;
    this.config = config;
    this.slot = slot;
    this.shell = shell ?? null;
    this.emitProgress = options.emitProgress;
    this.runId = options.runId ?? "";
    this.syncMode = normalizeSyncMode(options.syncMode);
    this.abortSignal = options.abortSignal;
    this.commandStartDelayMs = options.commandStartDelayMs;
    this.navigationObservationDelayMs =
      options.navigationObservationDelayMs ?? PROVIDER_SCENARIO_TIMEOUTS.NAVIGATION_SETTLE;
    this.databaseManager = options.databaseManager ?? null;
    this.defaultUrlOverride =
      typeof options.defaultUrlOverride === "string" && options.defaultUrlOverride.trim() !== ""
        ? options.defaultUrlOverride.trim()
        : undefined;

    const executeScript = createExecuteScript(webview);
    const appLanguage = options.appLanguage ?? DEFAULT_APP_LANGUAGE;
    const t = async (key: string, params?: TranslationParams): Promise<string> =>
      await providerTesterT(appLanguage, key, params);
    this.ctx = {
      slot,
      webview,
      config,
      appLanguage,
      ...(this.abortSignal !== undefined ? { abortSignal: this.abortSignal } : {}),
      ...(this.shell !== null ? { shell: this.shell } : {}),
      executeScript,
      executeShellScript: async (script: string): Promise<unknown> => {
        if (this.shell === null) return null;
        return await this.shell.executeJavaScript(script);
      },
      clickElement: createClickElement(executeScript),
      isElementVisible: createIsElementVisible(executeScript),
      waitForCondition,
      t,
      createSkipResult,
      testSelector: createTestSelector(executeScript, t),
    };
  }

  private async runtimeT(key: string, params?: TranslationParams): Promise<string> {
    return await providerTesterT(this.ctx.appLanguage, key, params);
  }

  async runTestSuite(): Promise<ProviderTestSuite> {
    return await this.runScenario("webview-test");
  }

  async runScenario(scenarioId: ProviderScenarioId): Promise<ProviderTestSuite> {
    this.startTime = Date.now();
    this.results = [];
    this.syncSessions = [];
    this.runId =
      this.runId !== "" ? this.runId : generateRunId(this.slot, this.config.id, scenarioId);
    await this.assertScenarioReadiness(scenarioId);
    const scenarioDefinition = await this.resolveScenarioDefinition(scenarioId);

    const scenario = await runConfiguredCommandScenario({
      runId: this.runId,
      scenarioId,
      slot: this.slot,
      providerId: this.config.id,
      ...(this.emitProgress !== undefined ? { emitProgress: this.emitProgress } : {}),
      ...(this.commandStartDelayMs !== undefined
        ? { commandStartDelayMs: this.commandStartDelayMs }
        : {}),
      ...(this.abortSignal !== undefined ? { signal: this.abortSignal } : {}),
      commands: scenarioDefinition.commands.map((command) =>
        this.createRuntimeScenarioCommand(command)
      ),
    });
    this.results = scenario.results;

    return this.generateReport(
      scenario.scenarioId,
      scenario.aborted,
      scenario.abortReason,
      scenario.commands
    );
  }

  private pushResult(result: ProviderTestResult): ProviderTestResult {
    this.results.push(result);
    return result;
  }

  private pushResults(results: ProviderTestResult[]): ProviderTestResult[] {
    results.forEach((result) => this.results.push(result));
    return results;
  }

  private summarizeStep(
    results: ProviderTestResult[],
    fallback: string
  ): AggregatedCommandStepResult {
    return {
      status: aggregateStatus(results),
      message: aggregateMessage(results, fallback),
    };
  }

  private async getSelectorCount(selector: string): Promise<number> {
    const count = (await this.ctx.executeScript(`
      (function() {
        try {
          return document.querySelectorAll(${JSON.stringify(selector)}).length;
        } catch (_) {
          return 0;
        }
      })()
    `)) as number;

    return Number.isFinite(count) ? count : 0;
  }

  private async waitForAssistantResponseIncrease(
    previousCount: number,
    timeoutMs: number
  ): Promise<boolean> {
    const selector =
      this.config.scrapeSelectors.assistantWrapper ?? this.config.scrapeSelectors.preferred;

    return await this.ctx.waitForCondition(
      async () => {
        const currentCount = await this.getSelectorCount(selector);
        return currentCount > previousCount;
      },
      timeoutMs,
      this.abortSignal
    );
  }

  private async waitForGeneratedImageIncrease(
    previousCount: number,
    timeoutMs: number
  ): Promise<boolean> {
    const selector = this.config.selectors.generatedImage;
    if (selector === undefined || selector === "") {
      return false;
    }

    return await this.ctx.waitForCondition(
      async () => {
        const currentCount = await this.getSelectorCount(selector);
        return currentCount > previousCount;
      },
      timeoutMs,
      this.abortSignal
    );
  }

  private throwIfCancelled(): void {
    if (this.abortSignal?.aborted === true) {
      throw new ScenarioCancelledError();
    }
  }

  private async waitForDelay(delayMs: number): Promise<void> {
    if (!Number.isFinite(delayMs) || delayMs <= 0) {
      this.throwIfCancelled();
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.abortSignal?.removeEventListener("abort", handleAbort);
        resolve();
      }, delayMs);

      const handleAbort = (): void => {
        clearTimeout(timeoutId);
        this.abortSignal?.removeEventListener("abort", handleAbort);
        reject(new ScenarioCancelledError());
      };

      this.abortSignal?.addEventListener("abort", handleAbort, { once: true });
    });
  }

  private async resolveScenarioDefinition(
    scenarioId: ProviderScenarioId
  ): Promise<ProviderScenarioDefinition> {
    const scenario = Object.values(this.config.scenarios ?? {}).find(
      (candidate) => candidate.id === scenarioId
    );

    if (scenario === undefined) {
      throw new Error(await this.runtimeT("scenario.unsupportedProviderScenario", { scenarioId }));
    }

    return scenario;
  }

  private createRuntimeScenarioCommand(
    command: ProviderScenarioCommandDefinition
  ): RuntimeScenarioCommandDefinition {
    return {
      id: command.id,
      name: command.label,
      action: command.action,
      severity: this.resolveScenarioCommandSeverity(command),
      delayAfterMs: this.resolveScenarioCommandDelay(command.action),
      resolveRuns: (context) => this.resolveScenarioCommandRuns(command, context),
    };
  }

  private resolveScenarioCommandSeverity(
    command: ProviderScenarioCommandDefinition
  ): ScenarioCommandSeverity {
    if (command.onFail === "abort") {
      return "core";
    }

    if (command.action === "check" || command.action === "assert-provider-capabilities") {
      return "provider";
    }

    return "soft";
  }

  private resolveScenarioCommandDelay(action: string): number {
    switch (action) {
      case "click":
      case "wait":
      case "check":
      case "collect-session-urls":
        return action === "click"
          ? PROVIDER_SCENARIO_DELAYS.COMMAND_CLICK
          : action === "wait"
            ? PROVIDER_SCENARIO_DELAYS.COMMAND_WAIT
            : action === "check"
              ? PROVIDER_SCENARIO_DELAYS.COMMAND_CHECK
              : PROVIDER_SCENARIO_DELAYS.COMMAND_COLLECT_SESSION_URLS;
      case "navigate":
        return PROVIDER_SCENARIO_DELAYS.COMMAND_NAVIGATE;
      case "sync-session":
        return PROVIDER_SCENARIO_DELAYS.COMMAND_SYNC_SESSION;
      case "refresh-conversation-list":
        return PROVIDER_SCENARIO_DELAYS.COMMAND_REFRESH_CONVERSATION_LIST;
      case "navigate-default":
        return PROVIDER_SCENARIO_DELAYS.STEP_NAVIGATE_DEFAULT;
      case "assert-sidebar-open":
        return PROVIDER_SCENARIO_DELAYS.STEP_ASSERT_SIDEBAR_OPEN;
      case "assert-session-list":
        return PROVIDER_SCENARIO_DELAYS.STEP_ASSERT_SESSION_LIST;
      case "assert-sidebar-close":
        return PROVIDER_SCENARIO_DELAYS.STEP_ASSERT_SIDEBAR_CLOSE;
      case "prepare-input":
        return PROVIDER_SCENARIO_DELAYS.STEP_PREPARE_INPUT;
      case "assert-disabled-send":
        return PROVIDER_SCENARIO_DELAYS.STEP_ASSERT_DISABLED_SEND;
      case "assert-drag-drop-surface":
        return PROVIDER_SCENARIO_DELAYS.STEP_ASSERT_DRAG_DROP_SURFACE;
      case "inject-prompt":
        return PROVIDER_SCENARIO_DELAYS.STEP_INJECT_PROMPT;
      case "assert-enabled-send":
        return PROVIDER_SCENARIO_DELAYS.STEP_ASSERT_ENABLED_SEND;
      case "assert-attach-flow":
        return PROVIDER_SCENARIO_DELAYS.STEP_ASSERT_ATTACH_FLOW;
      case "send-and-wait-thinking":
        return PROVIDER_SCENARIO_DELAYS.STEP_SEND_AND_WAIT_THINKING;
      case "assert-final-bubbles":
        return PROVIDER_SCENARIO_DELAYS.STEP_ASSERT_FINAL_BUBBLES;
      case "assert-generated-image":
        return PROVIDER_SCENARIO_DELAYS.STEP_ASSERT_GENERATED_IMAGE;
      case "assert-generated-image-archive":
        return PROVIDER_SCENARIO_DELAYS.STEP_ASSERT_GENERATED_IMAGE_ARCHIVE;
      case "assert-scroll-behavior":
        return PROVIDER_SCENARIO_DELAYS.STEP_ASSERT_SCROLL_BEHAVIOR;
      case "assert-provider-capabilities":
        return PROVIDER_SCENARIO_DELAYS.STEP_ASSERT_PROVIDER_CAPABILITIES;
      default:
        return PROVIDER_SCENARIO_DELAYS.COMMAND_DEFAULT;
    }
  }

  private matchesScenarioCommandSyncMode(command: ProviderScenarioCommandDefinition): boolean {
    if ((command.whenSyncModes?.length ?? 0) === 0) {
      return true;
    }

    return command.whenSyncModes?.includes(this.syncMode) ?? false;
  }

  private isSyncSessionPreviewItem(value: unknown): value is SyncSessionPreviewItem {
    if (typeof value !== "object" || value === null) {
      return false;
    }

    const maybe = value as Record<string, unknown>;
    return typeof maybe["title"] === "string" && typeof maybe["url"] === "string";
  }

  private resolveScenarioCommandRuns(
    command: ProviderScenarioCommandDefinition,
    context: ScenarioCommandContext
  ): ScenarioCommandRun[] {
    if (!this.matchesScenarioCommandSyncMode(command)) {
      return [];
    }

    if (command.forEach === undefined) {
      return [
        this.createScenarioCommandRun(command, {
          command,
        }),
      ];
    }

    const sourceItems = context.values[command.forEach];
    const sessions = Array.isArray(sourceItems)
      ? sourceItems.filter((item): item is SyncSessionPreviewItem =>
          this.isSyncSessionPreviewItem(item)
        )
      : [];

    if (sessions.length === 0) {
      return [this.createEmptyScenarioCommandRun(command, command.forEach)];
    }

    return sessions.map((session, index) =>
      this.createScenarioCommandRun(command, {
        command,
        session,
        index,
        total: sessions.length,
      })
    );
  }

  private createEmptyScenarioCommandRun(
    command: ProviderScenarioCommandDefinition,
    sourceKey: string
  ): ScenarioCommandRun {
    return {
      stepId: command.id,
      stepName: command.label,
      action: command.action,
      input: {
        source: sourceKey,
      },
      run: async (): Promise<ScenarioCommandResult> => {
        const start = Date.now();
        const result = createShellResult(
          command.id,
          command.label,
          "advanced",
          "fail",
          await this.runtimeT("scenario.sourceEmpty", { source: sourceKey }),
          undefined,
          Date.now() - start
        );
        return {
          status: "fail",
          message: result.message,
          result,
          output: {
            source: sourceKey,
            empty: true,
          },
        };
      },
    };
  }

  private createScenarioCommandRun(
    command: ProviderScenarioCommandDefinition,
    input: ScenarioCommandExecutionInput
  ): ScenarioCommandRun {
    const stepId =
      input.index === undefined ? command.id : `${command.id}-${(input.index ?? 0) + 1}`;
    const stepName = this.resolveScenarioCommandRunName(command, input);
    const scenarioCommandRun: ScenarioCommandRun = {
      stepId,
      stepName,
      action: command.action,
      run: async (): Promise<ScenarioCommandResult> =>
        await this.executeScenarioCommandRun(
          {
            ...input,
            command,
          },
          stepId,
          stepName
        ),
    };

    if (command.saveAs !== undefined) {
      scenarioCommandRun.saveOutputAs = command.saveAs;
    }

    const commandInput = this.buildScenarioCommandInput(command, input);
    if (commandInput !== undefined) {
      scenarioCommandRun.input = commandInput;
    }

    return scenarioCommandRun;
  }

  private resolveScenarioCommandRunName(
    command: ProviderScenarioCommandDefinition,
    input: ScenarioCommandExecutionInput
  ): string {
    if (input.session === undefined || input.index === undefined || input.total === undefined) {
      return command.label;
    }

    return `${command.label} ${input.index + 1}/${input.total} - ${input.session.title}`;
  }

  private buildScenarioCommandInput(
    command: ProviderScenarioCommandDefinition,
    input: ScenarioCommandExecutionInput
  ): Record<string, unknown> | undefined {
    const baseInput: Record<string, unknown> = {};

    if (command.target !== undefined) {
      baseInput["target"] = command.target;
    }
    if (command.params !== undefined) {
      baseInput["params"] = command.params;
    }
    if (input.session !== undefined) {
      baseInput["session"] = {
        title: input.session.title,
        url: input.session.url,
      };
    }
    if (input.index !== undefined && input.total !== undefined) {
      baseInput["index"] = input.index + 1;
      baseInput["total"] = input.total;
    }

    return Object.keys(baseInput).length > 0 ? baseInput : undefined;
  }

  private async executeScenarioCommandRun(
    input: ScenarioCommandExecutionInput,
    stepId: string,
    stepName: string
  ): Promise<ScenarioCommandResult> {
    this.throwIfCancelled();

    switch (input.command.action) {
      case "navigate-default":
        return await this.executeAggregatedTestScenarioCommand(
          stepId,
          stepName,
          "preflight",
          async () => await this.runResetDefaultPageStep()
        );
      case "assert-sidebar-open":
        return await this.executeAggregatedTestScenarioCommand(
          stepId,
          stepName,
          "preflight",
          async () => await this.runSidebarOpenStep()
        );
      case "assert-session-list":
        return await this.executeAggregatedTestScenarioCommand(
          stepId,
          stepName,
          "scraping",
          async () => await this.runSessionListStep()
        );
      case "assert-sidebar-close":
        return await this.executeAggregatedTestScenarioCommand(
          stepId,
          stepName,
          "preflight",
          async () => await this.runSidebarCloseStep()
        );
      case "prepare-input":
        return await this.executeAggregatedTestScenarioCommand(
          stepId,
          stepName,
          "interactive",
          async () => await this.runPrepareInputStep()
        );
      case "assert-disabled-send":
        return await this.executeAggregatedTestScenarioCommand(
          stepId,
          stepName,
          "interactive",
          async () => await this.runDisabledSendStep()
        );
      case "assert-drag-drop-surface":
        return await this.executeAggregatedTestScenarioCommand(
          stepId,
          stepName,
          "dom",
          async () => await this.runDragDropStep()
        );
      case "inject-prompt":
        return await this.executeAggregatedTestScenarioCommand(
          stepId,
          stepName,
          "interactive",
          async () => await this.runInjectMessageStep(input.command.params)
        );
      case "assert-enabled-send":
        return await this.executeAggregatedTestScenarioCommand(
          stepId,
          stepName,
          "interactive",
          async () => await this.runEnabledSendStep()
        );
      case "assert-attach-flow":
        return await this.executeAggregatedTestScenarioCommand(
          stepId,
          stepName,
          "interactive",
          async () => await this.runAttachFileStep()
        );
      case "send-and-wait-thinking":
        return await this.executeAggregatedTestScenarioCommand(
          stepId,
          stepName,
          "interactive",
          async () => await this.runSendThinkingStep(input.command.params)
        );
      case "assert-final-bubbles":
        return await this.executeAggregatedTestScenarioCommand(
          stepId,
          stepName,
          "scraping",
          async () => await this.runFinalBubblesStep(input.command.params)
        );
      case "assert-generated-image":
        return await this.executeAggregatedTestScenarioCommand(
          stepId,
          stepName,
          "scraping",
          async () => await this.runGeneratedImageStep()
        );
      case "assert-generated-image-archive":
        return await this.executeAggregatedTestScenarioCommand(
          stepId,
          stepName,
          "advanced",
          async () => await this.runGeneratedImageArchiveStep()
        );
      case "assert-scroll-behavior":
        return await this.executeAggregatedTestScenarioCommand(
          stepId,
          stepName,
          "scraping",
          async () => await this.runScrollStep()
        );
      case "assert-provider-capabilities":
        return await this.executeAggregatedTestScenarioCommand(
          stepId,
          stepName,
          "advanced",
          async () => await this.runProviderCapabilitiesStep()
        );
      case "click":
        return await this.executeClickScenarioCommand(input.command, stepId, stepName);
      case "wait":
        return await this.executeWaitScenarioCommand(input.command, stepId, stepName);
      case "check":
        return await this.executeCheckScenarioCommand(input.command, stepId, stepName);
      case "collect-session-urls":
        return await this.executeCollectSessionUrlsScenarioCommand(stepId, stepName);
      case "navigate":
        return await this.executeNavigateScenarioCommand(input.session, stepId, stepName);
      case "sync-session":
        return await this.executeSyncSessionScenarioCommand(
          input.command,
          input.session,
          stepId,
          stepName
        );
      case "refresh-conversation-list":
        return await this.executeRefreshConversationListScenarioCommand(stepId, stepName);
      default:
        return await this.createUnsupportedScenarioCommandResult(
          input.command.action,
          stepId,
          stepName
        );
    }
  }

  private async executeAggregatedTestScenarioCommand(
    stepId: string,
    stepName: string,
    fallbackCategory: ProviderTestResult["category"],
    run: () => Promise<AggregatedCommandStepResult>
  ): Promise<ScenarioCommandResult> {
    const start = Date.now();
    const beforeResults = this.results.length;

    try {
      this.throwIfCancelled();
      const summary = await run();
      this.throwIfCancelled();

      const capturedResults = this.results.slice(beforeResults);
      this.results.length = beforeResults;
      const detailSource = [...capturedResults]
        .reverse()
        .find((result) => result.details !== undefined);
      const category = capturedResults[0]?.category ?? fallbackCategory;
      const result = createShellResult(
        stepId,
        stepName,
        category,
        summary.status,
        summary.message,
        detailSource?.details,
        Date.now() - start
      );

      return {
        status: summary.status,
        message: summary.message,
        result,
        ...(capturedResults.length > 0 ? { results: capturedResults } : {}),
        output: {
          capturedResultCount: capturedResults.length,
        },
      };
    } catch (error) {
      this.results.length = beforeResults;
      if (error instanceof ScenarioCancelledError) {
        throw error;
      }

      const result = createShellResult(
        stepId,
        stepName,
        fallbackCategory,
        "fail",
        error instanceof Error ? error.message : String(error),
        undefined,
        Date.now() - start
      );
      return {
        status: "fail",
        message: result.message,
        result,
      };
    }
  }

  private async createUnsupportedScenarioCommandResult(
    action: string,
    stepId: string,
    stepName: string
  ): Promise<ScenarioCommandResult> {
    const result = createShellResult(
      stepId,
      stepName,
      "advanced",
      "fail",
      await this.runtimeT("scenario.unsupportedScenarioCommandAction", { action })
    );

    return {
      status: "fail",
      message: result.message,
      result,
      output: {
        action,
      },
    };
  }

  private getScenarioCommandTimeoutMs(
    command: ProviderScenarioCommandDefinition,
    fallbackMs: number
  ): number {
    const timeoutMs = command.params?.["timeoutMs"];
    return typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : fallbackMs;
  }

  private resolveScenarioCommandSyncMode(
    command: ProviderScenarioCommandDefinition
  ): ProviderWebviewSyncMode {
    const explicitMode = command.params?.["mode"];
    if (explicitMode === "soft" || explicitMode === "full" || explicitMode === "clean") {
      return explicitMode;
    }

    if (command.params?.["modeSource"] === "syncMode") {
      return this.syncMode;
    }

    return this.syncMode;
  }

  private async executeClickScenarioCommand(
    command: ProviderScenarioCommandDefinition,
    stepId: string,
    stepName: string
  ): Promise<ScenarioCommandResult> {
    const start = Date.now();
    if (command.target !== "sync-sidebar-open-button") {
      return await this.createUnsupportedScenarioCommandResult(
        `click:${command.target ?? "unknown"}`,
        stepId,
        stepName
      );
    }

    const beforeState = await this.probeSyncSidebar("none");
    const alreadyOpen = beforeState.historyVisible || beforeState.closeVisible;
    if (alreadyOpen) {
      const result = createShellResult(
        stepId,
        stepName,
        "preflight",
        "pass",
        await this.runtimeT("scenario.sidebarAlreadyOpen"),
        undefined,
        Date.now() - start
      );
      return {
        status: "pass",
        message: result.message,
        result,
        output: {
          target: command.target,
          clicked: false,
          alreadyOpen: true,
        },
      };
    }

    if (!beforeState.openFound) {
      const result = createShellResult(
        stepId,
        stepName,
        "preflight",
        "fail",
        await this.runtimeT("scenario.sidebarOpenButtonNotFound"),
        undefined,
        Date.now() - start
      );
      return {
        status: "fail",
        message: result.message,
        result,
        output: {
          target: command.target,
          clicked: false,
          alreadyOpen: false,
        },
      };
    }

    const afterClickState = await this.probeSyncSidebar("open");
    const clicked = afterClickState.clickedOpen;
    const becameVisible = afterClickState.historyVisible || afterClickState.closeVisible;
    const status: TestStatus = clicked || becameVisible ? "pass" : "fail";
    const message = clicked
      ? await this.runtimeT("scenario.sidebarOpenButtonClicked")
      : becameVisible
        ? await this.runtimeT("scenario.sidebarBecameVisible")
        : await this.runtimeT("scenario.sidebarOpenButtonClickFailed");
    const result = createShellResult(
      stepId,
      stepName,
      "preflight",
      status,
      message,
      undefined,
      Date.now() - start
    );

    return {
      status,
      message,
      result,
      output: {
        target: command.target,
        clicked,
        alreadyOpen: false,
        historyVisible: afterClickState.historyVisible,
        closeVisible: afterClickState.closeVisible,
      },
    };
  }

  private async executeWaitScenarioCommand(
    command: ProviderScenarioCommandDefinition,
    stepId: string,
    stepName: string
  ): Promise<ScenarioCommandResult> {
    const start = Date.now();
    if (command.target !== "sync-sidebar-ready") {
      return await this.createUnsupportedScenarioCommandResult(
        `wait:${command.target ?? "unknown"}`,
        stepId,
        stepName
      );
    }

    const timeoutMs = this.getScenarioCommandTimeoutMs(
      command,
      PROVIDER_SCENARIO_TIMEOUTS.SIDEBAR_READY
    );
    const ready = await waitForCondition(
      async () => {
        const state = await this.probeSyncSidebar("none");
        return state.historyVisible || state.closeVisible;
      },
      timeoutMs,
      this.abortSignal
    );
    const state = await this.probeSyncSidebar("none");
    const result = createShellResult(
      stepId,
      stepName,
      "preflight",
      ready ? "pass" : "fail",
      ready
        ? await this.runtimeT("scenario.sidebarReady")
        : await this.runtimeT("scenario.sidebarNotReady"),
      undefined,
      Date.now() - start
    );

    return {
      status: result.status,
      message: result.message,
      result,
      output: {
        target: command.target,
        timeoutMs,
        ready,
        historyVisible: state.historyVisible,
        closeVisible: state.closeVisible,
      },
    };
  }

  private async executeCheckScenarioCommand(
    command: ProviderScenarioCommandDefinition,
    stepId: string,
    stepName: string
  ): Promise<ScenarioCommandResult> {
    const start = Date.now();
    if (command.target !== "sync-sidebar-ready") {
      return await this.createUnsupportedScenarioCommandResult(
        `check:${command.target ?? "unknown"}`,
        stepId,
        stepName
      );
    }

    const state = await this.probeSyncSidebar("none");
    const ready = state.historyVisible || state.closeVisible;
    const result = createShellResult(
      stepId,
      stepName,
      "preflight",
      ready ? "pass" : "fail",
      ready
        ? await this.runtimeT("scenario.sidebarVisible")
        : await this.runtimeT("scenario.sidebarNotVisible"),
      undefined,
      Date.now() - start
    );

    return {
      status: result.status,
      message: result.message,
      result,
      output: {
        target: command.target,
        ready,
        historyVisible: state.historyVisible,
        closeVisible: state.closeVisible,
        openFound: state.openFound,
      },
    };
  }

  private async executeCollectSessionUrlsScenarioCommand(
    stepId: string,
    stepName: string
  ): Promise<ScenarioCommandResult> {
    const start = Date.now();
    const sessions = await this.collectVisibleSyncSessions();
    this.syncSessions = sessions;
    const preview = this.buildSyncSessionPreview();
    const status: TestStatus = sessions.length > 0 ? "pass" : "fail";
    const message =
      sessions.length > 0
        ? await this.runtimeT("scenario.collectedVisibleSessions", { count: sessions.length })
        : await this.runtimeT("scenario.noVisibleSessions");
    const result = createShellResult(
      stepId,
      stepName,
      "scraping",
      status,
      message,
      {
        selector: sessions.map((session) => session.url).join(", "),
        ...(preview.total > 0 ? { sessionPreview: preview } : {}),
      },
      Date.now() - start
    );

    return {
      status,
      message,
      result,
      output: sessions.map((session) => ({
        title: session.title,
        url: session.url,
      })),
    };
  }

  private async executeNavigateScenarioCommand(
    session: SyncSessionPreviewItem | undefined,
    stepId: string,
    stepName: string
  ): Promise<ScenarioCommandResult> {
    const start = Date.now();
    if (session === undefined) {
      const result = createShellResult(
        stepId,
        stepName,
        "interactive",
        "fail",
        await this.runtimeT("scenario.navigateMissingSession")
      );
      return {
        status: "fail",
        message: result.message,
        result,
      };
    }

    try {
      await this.webview.loadURL(session.url);
      const loadingState = await this.observeLoadingIndicatorAfterNavigation();
      const finalUrl = this.webview.getURL();
      const result = createShellResult(
        stepId,
        stepName,
        "interactive",
        "pass",
        await this.runtimeT("scenario.openedSession", {
          title: session.title,
          state: loadingState,
        }),
        {
          selector: session.url,
        },
        Date.now() - start
      );

      return {
        status: "pass",
        message: result.message,
        result,
        output: {
          title: session.title,
          url: session.url,
          finalUrl,
          matched: finalUrl === session.url,
          loadingState,
        },
      };
    } catch (error) {
      const result = createShellResult(
        stepId,
        stepName,
        "interactive",
        "fail",
        (error as Error).message,
        {
          selector: session.url,
          error: (error as Error).message,
        },
        Date.now() - start
      );
      return {
        status: "fail",
        message: result.message,
        result,
        output: {
          title: session.title,
          url: session.url,
        },
      };
    }
  }

  private async executeSyncSessionScenarioCommand(
    command: ProviderScenarioCommandDefinition,
    session: SyncSessionPreviewItem | undefined,
    stepId: string,
    stepName: string
  ): Promise<ScenarioCommandResult> {
    const start = Date.now();
    if (session === undefined) {
      const result = createShellResult(
        stepId,
        stepName,
        "interactive",
        "fail",
        await this.runtimeT("scenario.syncMissingSession")
      );
      return {
        status: "fail",
        message: result.message,
        result,
      };
    }

    const syncMode = this.resolveScenarioCommandSyncMode(command);
    const outcome =
      syncMode === "soft"
        ? await this.runSoftSyncForSession(session)
        : syncMode === "clean"
          ? await this.runCleanSyncForSession(session)
          : await this.runFullSyncForSession(session);
    const result = createShellResult(
      stepId,
      stepName,
      "interactive",
      outcome.status,
      outcome.message,
      outcome.details,
      Date.now() - start
    );

    return {
      status: outcome.status,
      message: outcome.message,
      result,
      output: {
        syncMode,
        ...(outcome.output ?? {}),
      },
    };
  }

  private async executeRefreshConversationListScenarioCommand(
    stepId: string,
    stepName: string
  ): Promise<ScenarioCommandResult> {
    const start = Date.now();
    await this.refreshConversationList();
    const result = createShellResult(
      stepId,
      stepName,
      "advanced",
      "pass",
      await this.runtimeT("scenario.conversationListRefreshed"),
      undefined,
      Date.now() - start
    );

    return {
      status: "pass",
      message: result.message,
      result,
      output: {
        refreshed: this.shell !== null,
      },
    };
  }

  private async assertScenarioReadiness(scenarioId: ProviderScenarioId): Promise<void> {
    if (scenarioId !== "webview-sync") {
      return;
    }

    const syncConfig = await this.getWebviewSyncConfig();
    if (syncConfig.readiness !== "verified") {
      throw new Error(
        await this.runtimeT("scenario.webviewSyncNotVerified", { providerId: this.config.id })
      );
    }
  }

  private async getWebviewSyncConfig(): Promise<ProviderWebviewSyncConfig> {
    if (this.config.webviewSync === undefined) {
      throw new Error(
        await this.runtimeT("scenario.webviewSyncConfigMissing", { providerId: this.config.id })
      );
    }

    return this.config.webviewSync;
  }

  private async resolveDatabaseManager(): Promise<ProviderTesterDatabaseManager> {
    if (this.databaseManager !== null) {
      return this.databaseManager;
    }

    this.databaseManager = await loadDatabaseManager();
    return this.databaseManager;
  }

  private async resolveSlotAccountId(): Promise<string> {
    if (this.shell === null) {
      return "";
    }

    const accountId = await this.shell.executeJavaScript(`
      window.AppState?.getAccountForSlot?.(${JSON.stringify(this.slot)})?.id ?? ""
    `);
    return typeof accountId === "string" ? accountId : "";
  }

  private async refreshConversationList(): Promise<void> {
    if (this.shell === null) {
      return;
    }

    await this.shell.executeJavaScript(`
      window.ConversationListManager?.refresh?.({
        silent: true,
        skipNotify: true,
        provider: ${JSON.stringify(this.slot)},
      })
    `);
  }

  private async scrapeActiveConversationMessages(): Promise<ProviderTesterScrapedMessage[]> {
    const providerModule = await loadProviderModule(this.config.id);
    const scrapeMessages = providerModule?.["scrapeMessages"];
    if (typeof scrapeMessages !== "function") {
      throw new Error(
        await this.runtimeT("scenario.providerScraperMissing", { providerId: this.config.id })
      );
    }

    const rawMessages = (await this.webview.executeJavaScript(`
      (${scrapeMessages.toString()})();
    `)) as unknown[] | null;
    return normalizeScrapedMessages(Array.isArray(rawMessages) ? rawMessages : []);
  }

  private resolveGeneratedImageMessageId(
    scrapedMessage: ProviderTesterScrapedMessage,
    finalMessages: ProviderTesterDbMessageRow[]
  ): string | null {
    if (scrapedMessage.role !== "assistant") {
      return null;
    }

    if (typeof scrapedMessage.domId === "string" && scrapedMessage.domId.trim() !== "") {
      const match = finalMessages.find(
        (message) =>
          message.role === "assistant" && (message.dom_id ?? "").trim() === scrapedMessage.domId
      );
      if (match !== undefined) {
        return match.id;
      }
    }

    const contentHash =
      typeof scrapedMessage.contentHash === "string" && scrapedMessage.contentHash.trim() !== ""
        ? scrapedMessage.contentHash.trim()
        : hashString(scrapedMessage.text);
    const lookupKey = buildGeneratedImageLookupKey(scrapedMessage.index, contentHash);
    const match = finalMessages.find((message) => {
      if (message.role !== "assistant") {
        return false;
      }

      const messageHash = (message.content_hash ?? "").trim();
      if (messageHash === "") {
        return false;
      }

      return (
        buildGeneratedImageLookupKey(message.dom_index ?? undefined, messageHash) === lookupKey
      );
    });

    return match?.id ?? null;
  }

  private buildGeneratedImageStableKey(
    message: ProviderTesterScrapedMessage,
    asset: ProviderTesterGeneratedImageAsset
  ): string {
    const assetStableKey = asset.stableKey?.trim() ?? "";
    if (assetStableKey !== "") {
      return assetStableKey;
    }

    const domId = message.domId?.trim() ?? "";
    const contentHash = message.contentHash?.trim() ?? "";
    const messageKey =
      domId !== "" ? domId : contentHash !== "" ? contentHash : `message:${message.index}`;
    return hashString(`${messageKey}|${asset.imageIndex ?? 0}|${asset.alt ?? ""}`);
  }

  private buildGeneratedImageName(
    message: ProviderTesterScrapedMessage,
    asset: ProviderTesterGeneratedImageAsset
  ): string {
    const originalName = asset.originalName?.trim() ?? "";
    if ((asset.stableKey?.trim() ?? "") === "" && originalName !== "") {
      return originalName;
    }

    const imageIndex = Math.max(0, Math.trunc(asset.imageIndex ?? 0));
    const ext = extensionFromMimeType(asset.mimeType);
    const stableKey = this.buildGeneratedImageStableKey(message, asset);
    return `generated-image-${String(imageIndex + 1).padStart(2, "0")}-${stableKey}.${ext}`;
  }

  private async extractGeneratedImageContent(
    asset: ProviderTesterGeneratedImageAsset
  ): Promise<ProviderTesterImageExtractionResult | null> {
    try {
      return (await this.webview.executeJavaScript(
        buildGeneratedImageExtractionScript(asset as Record<string, unknown>)
      )) as ProviderTesterImageExtractionResult | null;
    } catch {
      return null;
    }
  }

  private async captureGeneratedImageFallback(
    rect: ProviderTesterImageCaptureRect | null | undefined
  ): Promise<ProviderTesterImageExtractionResult | null> {
    if (rect === null || rect === undefined) {
      return null;
    }

    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (width < 2 || height < 2) {
      return null;
    }

    try {
      if (typeof this.webview.capturePageRegion === "function") {
        const capture = await this.webview.capturePageRegion({
          x: Math.max(0, Math.round(rect.x)),
          y: Math.max(0, Math.round(rect.y)),
          width,
          height,
        });
        if (capture?.success === true) {
          const parsed = parseGeneratedImageDataUrl(capture.dataUrl ?? "");
          if (parsed !== null && parsed.base64 !== "") {
            return {
              success: true,
              base64: parsed.base64,
              mimeType: parsed.mimeType ?? "image/png",
            };
          }
        }
      }

      const rendererWindow =
        typeof window !== "undefined"
          ? (window as Window &
              typeof globalThis & {
                electronAPI?: {
                  capturePage?: (
                    type?: string,
                    region?: unknown
                  ) => Promise<{ success?: boolean; dataUrl?: string; data?: string } | null>;
                };
              })
          : undefined;
      const electronApi =
        rendererWindow !== undefined && typeof rendererWindow.electronAPI === "object"
          ? rendererWindow.electronAPI
          : undefined;
      if (
        typeof this.webview.getBoundingClientRect !== "function" ||
        electronApi?.capturePage === undefined
      ) {
        return null;
      }

      const hostRect = this.webview.getBoundingClientRect();
      const x = Math.max(0, Math.round(hostRect.x + rect.x));
      const y = Math.max(0, Math.round(hostRect.y + rect.y));
      const region = `${x};${y}:${width};${height}`;
      const capture = await electronApi.capturePage("region", region);
      if (capture?.success !== true) {
        return null;
      }

      const parsed = parseGeneratedImageDataUrl(capture.dataUrl ?? capture.data ?? "");
      if (parsed === null || parsed.base64 === "") {
        return null;
      }

      return {
        success: true,
        base64: parsed.base64,
        mimeType: parsed.mimeType ?? "image/png",
      };
    } catch {
      return null;
    }
  }

  private async persistGeneratedImages(
    accountId: string,
    conversationId: string,
    scrapedMessages: ProviderTesterScrapedMessage[],
    finalMessages: ProviderTesterDbMessageRow[]
  ): Promise<ProviderTesterGeneratedImagePersistResult> {
    const databaseManager = await this.resolveDatabaseManager();
    const rawAttachments = await databaseManager.getAttachments(null, {
      accountId,
      conversationId,
    });
    const existingAttachments = new Map<string, { storedPath: string }>(
      (Array.isArray(rawAttachments.data) ? rawAttachments.data : []).flatMap((attachment) => {
        const messageId = readStringField(attachment, "messageId", "message_id");
        const originalName = readStringField(attachment, "originalName", "original_name");
        if (messageId === "" || originalName === "") {
          return [];
        }

        return [
          [
            buildAttachmentDedupeKey(messageId, originalName),
            {
              storedPath: readStringField(attachment, "storedPath", "stored_path"),
            },
          ] as const,
        ];
      })
    );

    let savedCount = 0;
    let pendingCount = 0;

    for (const message of scrapedMessages) {
      if (message.role !== "assistant") {
        continue;
      }

      const generatedImages = normalizeGeneratedImageAssets(message.generatedImages);
      if (generatedImages.length === 0) {
        continue;
      }

      const messageId = this.resolveGeneratedImageMessageId(message, finalMessages);
      if (messageId === null) {
        pendingCount += generatedImages.length;
        continue;
      }

      for (const asset of generatedImages) {
        const originalName = this.buildGeneratedImageName(message, asset);
        const dedupeKey = buildAttachmentDedupeKey(messageId, originalName);
        // NOTE: Extraction and fallback capture depend on the current DOM state of each image slot.
        // eslint-disable-next-line no-await-in-loop
        const extracted = await this.extractGeneratedImageContent(asset);
        const persisted =
          extracted?.success === true &&
          typeof extracted.base64 === "string" &&
          extracted.base64 !== ""
            ? extracted
            : // NOTE: Fallback capture must run after extraction for the same slot to avoid stale crops.
              // eslint-disable-next-line no-await-in-loop
              await this.captureGeneratedImageFallback(extracted?.rect);
        const existingAttachment = existingAttachments.get(dedupeKey);

        if (
          persisted?.success !== true ||
          typeof persisted.base64 !== "string" ||
          persisted.base64 === ""
        ) {
          if (existingAttachment !== undefined) {
            continue;
          }
          pendingCount += 1;
          continue;
        }

        if (
          existingAttachment !== undefined &&
          existingAttachment.storedPath !== "" &&
          existsSync(existingAttachment.storedPath)
        ) {
          const currentBase64 = readFileSync(existingAttachment.storedPath).toString("base64");
          if (currentBase64 === persisted.base64) {
            continue;
          }
        }

        // NOTE: Saves stay ordered so replacement writes update the in-memory dedupe map deterministically.
        // eslint-disable-next-line no-await-in-loop
        const saveResult = await databaseManager.saveAttachmentContent(null, {
          accountId,
          conversationId,
          messageId,
          base64: persisted.base64,
          originalName,
          mimeType: persisted.mimeType ?? asset.mimeType ?? "image/png",
        });
        if (saveResult.success !== true) {
          pendingCount += 1;
          continue;
        }

        const savedStoredPath = readStringField(saveResult.data, "storedPath", "stored_path");
        existingAttachments.set(dedupeKey, {
          storedPath:
            savedStoredPath !== "" ? savedStoredPath : (existingAttachment?.storedPath ?? ""),
        });
        savedCount += 1;
      }
    }

    return { savedCount, pendingCount };
  }

  private async performFullSyncForSession(
    session: SyncSessionPreviewItem,
    accountId: string
  ): Promise<{
    added: number;
    total: number;
    metadata?: ConversationMetadataResult["data"];
    generatedImageSavedCount: number;
    generatedImagePendingCount: number;
  }> {
    const databaseManager = await this.resolveDatabaseManager();
    const messages = await this.scrapeActiveConversationMessages();
    const syncResult = await databaseManager.syncMessages(null, {
      accountId,
      webUrl: session.url,
      messages,
    });

    if (syncResult.success !== true) {
      throw new Error(
        syncResult.error ??
          (await this.runtimeT("scenario.messageSyncFailed", { url: session.url }))
      );
    }

    const metadataResult = await databaseManager.upsertConversationMetadata(null, {
      accountId,
      webUrl: session.url,
      provider: this.config.id,
      title: session.title,
    });
    if (metadataResult.success !== true) {
      throw new Error(
        metadataResult.error ??
          (await this.runtimeT("scenario.metadataSyncFailed", { url: session.url }))
      );
    }

    const conversationId = metadataResult.data?.conversationId ?? syncResult.conversationId;
    let generatedImageSavedCount = 0;
    let generatedImagePendingCount = 0;

    if (typeof conversationId === "string" && conversationId !== "") {
      const messageResult = await databaseManager.getMessages(null, {
        accountId,
        conversationId,
      });
      const finalMessages = normalizeDbMessages(
        Array.isArray(messageResult.data) ? messageResult.data : []
      );
      const generatedImageResult = await this.persistGeneratedImages(
        accountId,
        conversationId,
        messages,
        finalMessages
      );
      generatedImageSavedCount = generatedImageResult.savedCount;
      generatedImagePendingCount = generatedImageResult.pendingCount;
    }

    return {
      added: syncResult.added ?? 0,
      total: syncResult.total ?? messages.length,
      metadata: metadataResult.data,
      generatedImageSavedCount,
      generatedImagePendingCount,
    };
  }

  protected async runSoftSyncForSession(
    session: SyncSessionPreviewItem
  ): Promise<SyncSessionOutcome> {
    const accountId = await this.resolveSlotAccountId();
    if (accountId === "") {
      return {
        status: "fail",
        message: await this.runtimeT("scenario.noAccountAssigned", { slot: this.slot }),
      };
    }

    const databaseManager = await this.resolveDatabaseManager();
    const result = await databaseManager.upsertConversationMetadata(null, {
      accountId,
      webUrl: session.url,
      provider: this.config.id,
      title: session.title,
    });
    if (result.success !== true) {
      return {
        status: "fail",
        message:
          result.error ?? (await this.runtimeT("scenario.softSyncFailed", { url: session.url })),
      };
    }

    return {
      status: "pass",
      message: await this.runtimeT("scenario.softSyncSaved", { title: session.title }),
      details: {
        selector: session.url,
      },
      output: {
        title: session.title,
        url: session.url,
        conversationId: result.data?.conversationId ?? "",
        created: result.data?.created ?? false,
        titleUpdated: result.data?.titleUpdated ?? false,
      },
    };
  }

  protected async runFullSyncForSession(
    session: SyncSessionPreviewItem
  ): Promise<SyncSessionOutcome> {
    const accountId = await this.resolveSlotAccountId();
    if (accountId === "") {
      return {
        status: "fail",
        message: await this.runtimeT("scenario.noAccountAssigned", { slot: this.slot }),
      };
    }

    try {
      const syncResult = await this.performFullSyncForSession(session, accountId);
      return {
        status: "pass",
        message: await this.runtimeT("scenario.fullSyncAdded", {
          added: syncResult.added,
          title: session.title,
        }),
        details: {
          selector: session.url,
        },
        output: {
          title: session.title,
          url: session.url,
          added: syncResult.added,
          total: syncResult.total,
          generatedImageSavedCount: syncResult.generatedImageSavedCount,
          generatedImagePendingCount: syncResult.generatedImagePendingCount,
          conversationId: syncResult.metadata?.conversationId ?? "",
          created: syncResult.metadata?.created ?? false,
          titleUpdated: syncResult.metadata?.titleUpdated ?? false,
        },
      };
    } catch (error) {
      return { status: "fail", message: (error as Error).message };
    }
  }

  protected async runCleanSyncForSession(
    session: SyncSessionPreviewItem
  ): Promise<SyncSessionOutcome> {
    const accountId = await this.resolveSlotAccountId();
    if (accountId === "") {
      return {
        status: "fail",
        message: await this.runtimeT("scenario.noAccountAssigned", { slot: this.slot }),
      };
    }

    const databaseManager = await this.resolveDatabaseManager();
    const resetResult = await databaseManager.resetConversationMessages(null, {
      accountId,
      webUrl: session.url,
    });
    if (resetResult.success !== true) {
      return {
        status: "fail",
        message:
          resetResult.error ??
          (await this.runtimeT("scenario.cleanResetFailed", { url: session.url })),
      };
    }

    try {
      const syncResult = await this.performFullSyncForSession(session, accountId);
      return {
        status: "pass",
        message: await this.runtimeT("scenario.cleanSyncCompleted", {
          deletedCount: resetResult.data?.deletedCount ?? 0,
          added: syncResult.added,
          title: session.title,
        }),
        details: {
          selector: session.url,
        },
        output: {
          title: session.title,
          url: session.url,
          deletedCount: resetResult.data?.deletedCount ?? 0,
          added: syncResult.added,
          total: syncResult.total,
          generatedImageSavedCount: syncResult.generatedImageSavedCount,
          generatedImagePendingCount: syncResult.generatedImagePendingCount,
          conversationId: syncResult.metadata?.conversationId ?? "",
          created: syncResult.metadata?.created ?? false,
          titleUpdated: syncResult.metadata?.titleUpdated ?? false,
        },
      };
    } catch (error) {
      return { status: "fail", message: (error as Error).message };
    }
  }

  private async probeSyncSidebar(action: "none" | "open" | "close"): Promise<{
    syncSidebarProbe: boolean;
    openFound: boolean;
    openVisible: boolean;
    closeFound: boolean;
    closeVisible: boolean;
    historyVisible: boolean;
    clickedOpen: boolean;
    clickedClose: boolean;
  }> {
    const syncConfig = await this.getWebviewSyncConfig();

    return (await this.ctx.executeScript(`
      (() => {
        const openSelectors = ${JSON.stringify(syncConfig.sidebar.openButtonSelectors)};
        const closeSelectors = ${JSON.stringify(syncConfig.sidebar.closeButtonSelectors)};
        const historySelectors = ${JSON.stringify(syncConfig.history.containerSelectors)};
        const action = ${JSON.stringify(action)};
        const isVisible = (el) => {
          if (!(el instanceof Element)) return false;
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        };
        const findVisible = (selectors) => {
          for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (isVisible(el)) return el;
          }
          return null;
        };
        const openButton = findVisible(openSelectors);
        const beforeClose = findVisible(closeSelectors);
        const beforeHistory = findVisible(historySelectors);
        let clickedOpen = false;
        let clickedClose = false;
        if (!beforeClose && !beforeHistory && action === 'open' && openButton instanceof HTMLElement) {
          openButton.click();
          clickedOpen = true;
        }
        const closeButton = beforeClose ?? findVisible(closeSelectors);
        if ((beforeClose || beforeHistory) && action === 'close' && closeButton instanceof HTMLElement) {
          closeButton.click();
          clickedClose = true;
        }
        const afterOpen = findVisible(openSelectors);
        const afterClose = findVisible(closeSelectors);
        const afterHistory = findVisible(historySelectors);
        return {
          syncSidebarProbe: true,
          openFound: openButton !== null,
          openVisible: afterOpen !== null,
          closeFound: closeButton !== null,
          closeVisible: afterClose !== null,
          historyVisible: afterHistory !== null,
          clickedOpen,
          clickedClose,
        };
      })()
    `)) as {
      syncSidebarProbe: boolean;
      openFound: boolean;
      openVisible: boolean;
      closeFound: boolean;
      closeVisible: boolean;
      historyVisible: boolean;
      clickedOpen: boolean;
      clickedClose: boolean;
    };
  }

  private normalizeSyncSessions(rawSessions: SyncSessionPreviewItem[]): SyncSessionPreviewItem[] {
    const unique = new Map<string, SyncSessionPreviewItem>();

    for (const session of rawSessions) {
      const title = session.title.trim();
      if (title.length === 0) {
        continue;
      }

      try {
        const url = new URL(session.url, this.config.baseUrl).toString();
        if (!unique.has(url)) {
          unique.set(url, { title, url });
        }
      } catch {
        continue;
      }
    }

    return [...unique.values()];
  }

  private buildSyncSessionPreview(): ProviderSessionPreview {
    return {
      total: this.syncSessions.length,
      sessions: this.syncSessions.map((session) => ({
        title: session.title,
        url: session.url,
      })),
    };
  }

  private async collectVisibleSyncSessions(): Promise<SyncSessionPreviewItem[]> {
    const syncConfig = await this.getWebviewSyncConfig();
    const result = (await this.ctx.executeScript(`
      (() => {
        const itemSelectors = ${JSON.stringify(syncConfig.history.itemSelectors)};
        const titleSelectors = ${JSON.stringify(syncConfig.history.titleSelectors)};
        const isVisible = (el) => {
          if (!(el instanceof Element)) return false;
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        };
        const extractTitle = (item) => {
          for (const selector of titleSelectors) {
            const titleEl = item.querySelector(selector);
            const text = titleEl?.textContent?.trim();
            if (text) return text;
          }
          return item.textContent?.trim() ?? '';
        };
        const sessions = [];
        for (const selector of itemSelectors) {
          for (const item of document.querySelectorAll(selector)) {
            if (!(item instanceof HTMLElement) || !isVisible(item)) continue;
            const href = item.getAttribute('href') ?? item.closest('a')?.getAttribute('href') ?? '';
            const title = extractTitle(item);
            if (!href || !title) continue;
            sessions.push({ title, url: href });
          }
        }
        return { syncHistorySessions: true, sessions };
      })()
    `)) as {
      syncHistorySessions: boolean;
      sessions: SyncSessionPreviewItem[];
    };

    return this.normalizeSyncSessions(result.sessions);
  }

  private async runResetDefaultPageStep(): Promise<AggregatedCommandStepResult> {
    const results: ProviderTestResult[] = [];
    const defaultUrl = this.defaultUrlOverride ?? resolveDefaultUrl(this.config);
    const start = Date.now();
    const loadPromise = this.webview.loadURL(defaultUrl);
    await loadPromise;
    const loadingState = await this.observeLoadingIndicatorAfterNavigation();
    const urlCheck = await testExcludedUrl(this.ctx);

    results.push(
      createShellResult(
        "default-page-navigation",
        await this.runtimeT("scenario.defaultPageNavigationName"),
        "preflight",
        "pass",
        await this.runtimeT("scenario.navigatedTo", { url: defaultUrl }),
        { selector: defaultUrl },
        Date.now() - start
      )
    );
    results.push(
      createShellResult(
        "loading-indicator-observation",
        await this.runtimeT("scenario.loadingIndicatorObservationName"),
        "preflight",
        "pass",
        await this.runtimeT("scenario.loadingIndicatorSettled", { state: loadingState })
      )
    );
    results.push(urlCheck);

    this.pushResults(results);
    return this.summarizeStep(results, await this.runtimeT("scenario.defaultPageResetFailed"));
  }

  private async runSidebarOpenStep(): Promise<AggregatedCommandStepResult> {
    const start = Date.now();
    if (this.config.webviewSync === undefined) {
      const result = createShellResult(
        "sidebar-open",
        await this.runtimeT("scenario.sidebarOpenName"),
        "preflight",
        "skip",
        await this.runtimeT("scenario.webviewSyncConfigMissing", { providerId: this.config.id }),
        undefined,
        Date.now() - start
      );
      this.pushResult(result);
      return this.summarizeStep([result], await this.runtimeT("scenario.sidebarOpenSkipped"));
    }

    const beforeState = await this.probeSyncSidebar("none");
    const alreadyOpen = beforeState.historyVisible || beforeState.closeVisible;
    let status: TestStatus = "pass";
    let message = await this.runtimeT("scenario.sidebarAlreadyOpen");

    if (!alreadyOpen && !beforeState.openFound) {
      status = "fail";
      message = await this.runtimeT("scenario.sidebarOpenButtonNotFound");
    } else if (!alreadyOpen) {
      const afterState = await this.probeSyncSidebar("open");
      const becameVisible = afterState.historyVisible || afterState.closeVisible;
      status = afterState.clickedOpen || becameVisible ? "pass" : "fail";
      message = afterState.clickedOpen
        ? await this.runtimeT("scenario.sidebarOpenButtonClicked")
        : becameVisible
          ? await this.runtimeT("scenario.sidebarBecameVisible")
          : await this.runtimeT("scenario.sidebarOpenButtonClickFailed");
    }

    const result = createShellResult(
      "sidebar-open",
      await this.runtimeT("scenario.sidebarOpenName"),
      "preflight",
      status,
      message,
      undefined,
      Date.now() - start
    );
    this.pushResult(result);
    return this.summarizeStep([result], await this.runtimeT("scenario.sidebarOpenFailed"));
  }

  private async runSessionListStep(): Promise<AggregatedCommandStepResult> {
    const start = Date.now();
    if (this.config.webviewSync === undefined) {
      const result = createShellResult(
        "session-list",
        await this.runtimeT("scenario.sessionListName"),
        "scraping",
        "skip",
        await this.runtimeT("scenario.webviewSyncConfigMissing", { providerId: this.config.id }),
        undefined,
        Date.now() - start
      );
      this.pushResult(result);
      return this.summarizeStep([result], await this.runtimeT("scenario.sessionListChecked"));
    }

    const sidebarState = await this.probeSyncSidebar("none");
    if (!sidebarState.historyVisible && !sidebarState.closeVisible) {
      const result = createShellResult(
        "session-list",
        await this.runtimeT("scenario.sessionListName"),
        "scraping",
        "warning",
        await this.runtimeT("scenario.sidebarNotVisible"),
        undefined,
        Date.now() - start
      );
      this.pushResult(result);
      return this.summarizeStep([result], await this.runtimeT("scenario.sessionListChecked"));
    }

    const sessions = await this.collectVisibleSyncSessions();
    this.syncSessions = sessions;
    const preview = this.buildSyncSessionPreview();
    const status: TestStatus = sessions.length > 0 ? "pass" : "warning";
    const message =
      sessions.length > 0
        ? await this.runtimeT("scenario.collectedVisibleSessions", { count: sessions.length })
        : await this.runtimeT("scenario.noVisibleSessions");
    const result = createShellResult(
      "session-list",
      await this.runtimeT("scenario.sessionListName"),
      "scraping",
      status,
      message,
      preview.total > 0 ? { selector: `${preview.total} visible sessions` } : undefined,
      Date.now() - start
    );
    this.pushResult(result);
    return this.summarizeStep([result], await this.runtimeT("scenario.sessionListChecked"));
  }

  private async runSidebarCloseStep(): Promise<AggregatedCommandStepResult> {
    const start = Date.now();
    if (this.config.webviewSync === undefined) {
      const result = createShellResult(
        "sidebar-close",
        await this.runtimeT("scenario.sidebarCloseName"),
        "preflight",
        "skip",
        await this.runtimeT("scenario.webviewSyncConfigMissing", { providerId: this.config.id }),
        undefined,
        Date.now() - start
      );
      this.pushResult(result);
      return this.summarizeStep([result], await this.runtimeT("scenario.sidebarCloseSkipped"));
    }

    const beforeState = await this.probeSyncSidebar("none");
    const alreadyClosed = !beforeState.historyVisible && !beforeState.closeVisible;
    let status: TestStatus = "pass";
    let message = await this.runtimeT("scenario.sidebarAlreadyClosed");

    if (!alreadyClosed && !beforeState.closeFound) {
      status = "fail";
      message = await this.runtimeT("scenario.sidebarCloseButtonNotFound");
    } else if (!alreadyClosed) {
      const afterState = await this.probeSyncSidebar("close");
      const becameHidden = !afterState.historyVisible && !afterState.closeVisible;
      status = afterState.clickedClose || becameHidden ? "pass" : "fail";
      message = afterState.clickedClose
        ? await this.runtimeT("scenario.sidebarCloseButtonClicked")
        : becameHidden
          ? await this.runtimeT("scenario.sidebarBecameHidden")
          : await this.runtimeT("scenario.sidebarCloseButtonClickFailed");
    }

    const result = createShellResult(
      "sidebar-close",
      await this.runtimeT("scenario.sidebarCloseName"),
      "preflight",
      status,
      message,
      undefined,
      Date.now() - start
    );
    this.pushResult(result);
    return this.summarizeStep([result], await this.runtimeT("scenario.sidebarCloseFailed"));
  }

  private async runPrepareInputStep(): Promise<AggregatedCommandStepResult> {
    const results = this.pushResults([
      await testInputField(this.ctx),
      await testInputFieldAccessibility(this.ctx),
      await testPrepareInput(this.ctx),
    ]);

    return this.summarizeStep(results, "Input field preparation failed");
  }

  private async runDisabledSendStep(): Promise<AggregatedCommandStepResult> {
    const results = this.pushResults([
      await testSendButtonDisabled(this.ctx),
      createShellResult(
        "send-indicator-disabled",
        await this.runtimeT("scenario.sendIndicatorDisabledName"),
        "interactive",
        (await this.waitForShellIndicator("send", "busy", PROVIDER_TEST_TIMEOUTS.SEND_INDICATOR))
          ? "pass"
          : "fail",
        (await this.readShellIndicator("send")) === "busy"
          ? await this.runtimeT("scenario.sendIndicatorBusy")
          : await this.runtimeT("scenario.sendIndicatorDisabledMissing")
      ),
    ]);

    return this.summarizeStep(results, await this.runtimeT("scenario.disabledSendStateFailed"));
  }

  private async runDragDropStep(): Promise<AggregatedCommandStepResult> {
    const dragDropCriticalSelectors =
      this.ctx.config.dragDropCriticalSelectors ?? this.ctx.config.criticalSelectors;
    const results = this.pushResults(
      [
        await testUploadTarget(this.ctx),
        await testCriticalSelectors(this.ctx, dragDropCriticalSelectors),
      ].map((result) =>
        result.status === "pass" || result.status === "fail"
          ? result
          : {
              ...result,
              status: "fail" as const,
            }
      )
    );

    return this.summarizeStep(results, await this.runtimeT("scenario.dragDropSurfaceFailed"));
  }

  private resolveScenarioPrompt(params?: Record<string, unknown>): string {
    if (params?.["promptKind"] === "image") {
      return PROVIDER_TEST.IMAGE_MESSAGE;
    }

    return PROVIDER_TEST.TEST_MESSAGE;
  }

  private async runInjectMessageStep(
    params?: Record<string, unknown>
  ): Promise<AggregatedCommandStepResult> {
    const results = this.pushResults([
      await testTextInjection(this.ctx, this.resolveScenarioPrompt(params)),
    ]);
    return this.summarizeStep(results, await this.runtimeT("scenario.messageInjectionFailed"));
  }

  private async runEnabledSendStep(): Promise<AggregatedCommandStepResult> {
    const enabledResult = await testSendButtonEnabled(this.ctx);
    const indicatorStatus = await this.waitForShellIndicator(
      "send",
      "idle",
      PROVIDER_TEST_TIMEOUTS.SEND_INDICATOR
    );
    const indicatorNow = await this.readShellIndicator("send");
    const indicatorResult = createShellResult(
      "send-indicator-enabled",
      await this.runtimeT("scenario.sendIndicatorEnabledName"),
      "interactive",
      indicatorStatus ? "pass" : "fail",
      indicatorNow === "idle"
        ? await this.runtimeT("scenario.sendIndicatorIdle")
        : await this.runtimeT("scenario.sendIndicatorEnabledMissing")
    );
    const results = this.pushResults([enabledResult, indicatorResult]);
    return this.summarizeStep(results, await this.runtimeT("scenario.enabledSendStateFailed"));
  }

  private async runAttachFileStep(): Promise<AggregatedCommandStepResult> {
    const results = this.pushResults([
      await testAttachButton(this.ctx),
      await testFileInput(this.ctx),
      await testFileUpload(this.ctx),
    ]);
    return this.summarizeStep(
      results,
      await this.runtimeT("scenario.attachStepCompletedWithWarnings")
    );
  }

  private async runSendThinkingStep(
    params?: Record<string, unknown>
  ): Promise<AggregatedCommandStepResult> {
    const isImagePrompt = params?.["promptKind"] === "image";
    const assistantSelector =
      this.config.scrapeSelectors.assistantWrapper ?? this.config.scrapeSelectors.preferred;
    const generatedImageSelector = this.config.selectors.generatedImage ?? "";
    const assistantCountBeforeSend = await this.getSelectorCount(assistantSelector);
    this.lastAssistantCountBeforeFinalBubbles = assistantCountBeforeSend;
    const generatedImageCountBeforeSend =
      isImagePrompt && generatedImageSelector !== ""
        ? await this.getSelectorCount(generatedImageSelector)
        : 0;
    const sendResult = await testSendMessage(this.ctx);
    const thinkingBusy = await this.waitForShellIndicator("thinking", "busy", 8000);
    const stopResult = await testStopButtonWhileThinking(this.ctx);
    const stopScrapeResult = await testStopButton(this.ctx);
    const assistantResponseIncreased =
      !thinkingBusy &&
      !isImagePrompt &&
      (await this.waitForAssistantResponseIncrease(
        assistantCountBeforeSend,
        PROVIDER_TEST_TIMEOUTS.RESPONSE_WAIT
      ));
    const generatedImageAppeared =
      isImagePrompt &&
      (await this.waitForGeneratedImageIncrease(
        generatedImageCountBeforeSend,
        PROVIDER_TEST_TIMEOUTS.RESPONSE_WAIT
      ));
    const inferredThinking =
      stopResult.status === "pass" ||
      stopScrapeResult.status === "pass" ||
      assistantResponseIncreased ||
      generatedImageAppeared;
    const thinkingResult = createShellResult(
      "thinking-indicator",
      await this.runtimeT("scenario.thinkingIndicatorName"),
      "interactive",
      thinkingBusy || inferredThinking ? "pass" : "fail",
      thinkingBusy
        ? await this.runtimeT("scenario.thinkingIndicatorBusy")
        : generatedImageAppeared
          ? await this.runtimeT("scenario.generatedImageObserved")
          : inferredThinking
            ? await this.runtimeT("scenario.thinkingTransientObserved")
            : await this.runtimeT("scenario.thinkingIndicatorMissing")
    );
    const results = this.pushResults([sendResult, thinkingResult, stopResult, stopScrapeResult]);
    return this.summarizeStep(results, await this.runtimeT("scenario.sendThinkingFailed"));
  }

  private async runFinalBubblesStep(
    params?: Record<string, unknown>
  ): Promise<AggregatedCommandStepResult> {
    const expectedMessage = this.resolveScenarioPrompt(params);
    const isImagePrompt = params?.["promptKind"] === "image";
    const assistantSelector =
      this.config.scrapeSelectors.assistantWrapper ?? this.config.scrapeSelectors.preferred;
    if (!isImagePrompt && assistantSelector !== "") {
      await this.ctx.waitForCondition(
        async () =>
          (await this.getSelectorCount(assistantSelector)) >
          this.lastAssistantCountBeforeFinalBubbles,
        PROVIDER_TEST_TIMEOUTS.RESPONSE_WAIT,
        this.abortSignal
      );
      await this.waitForDelay(PROVIDER_TEST_INTERVALS.POLL);
    }
    const results = this.pushResults(
      isImagePrompt
        ? [
            await testUserMessageInspect(this.ctx, expectedMessage),
            await testGeneratedImage(this.ctx),
            await testMessageContainer(this.ctx),
          ]
        : [
            await testUserMessageInspect(this.ctx, expectedMessage),
            await testAIResponseInspect(this.ctx),
            await testAssistantMessageScraping(this.ctx),
            await testMessageContainer(this.ctx),
          ]
    );
    return this.summarizeStep(results, await this.runtimeT("scenario.finalBubbleChecksFailed"));
  }

  private async runGeneratedImageStep(): Promise<AggregatedCommandStepResult> {
    const results = this.pushResults([await testGeneratedImage(this.ctx)]);
    return this.summarizeStep(
      results,
      await this.runtimeT("scenario.generatedImageCheckCompleted")
    );
  }

  private async runGeneratedImageArchiveStep(): Promise<AggregatedCommandStepResult> {
    const selector = this.config.selectors.generatedImage?.trim() ?? "";
    if (selector === "") {
      const result = this.pushResult(
        createShellResult(
          "generated-image-archive",
          "Generated Image Archive",
          "advanced",
          "skip",
          "Generated image archive check skipped because the provider has no generated-image selector."
        )
      );
      return this.summarizeStep([result], result.message);
    }

    const accountId = await this.resolveSlotAccountId();
    if (accountId === "") {
      const result = this.pushResult(
        createShellResult(
          "generated-image-archive",
          "Generated Image Archive",
          "advanced",
          "skip",
          "Generated image archive check skipped because no account is assigned to this slot."
        )
      );
      return this.summarizeStep([result], result.message);
    }

    const url = this.webview.getURL();
    if (url.trim() === "") {
      const result = this.pushResult(
        createShellResult(
          "generated-image-archive",
          "Generated Image Archive",
          "advanced",
          "fail",
          "Generated image archive check failed because the current session URL is unavailable."
        )
      );
      return this.summarizeStep([result], result.message);
    }

    try {
      const titleValue = await this.webview.executeJavaScript("document.title || ''");
      const session = {
        title: typeof titleValue === "string" && titleValue.trim() !== "" ? titleValue.trim() : url,
        url,
      };
      const syncResult = await this.performFullSyncForSession(session, accountId);
      const conversationId = syncResult.metadata?.conversationId ?? "";
      const databaseManager = await this.resolveDatabaseManager();
      const attachmentsResult =
        conversationId !== ""
          ? await databaseManager.getAttachments(null, {
              accountId,
              conversationId,
            })
          : { success: true, data: [] as unknown[] };
      const archivedImageCount = (
        Array.isArray(attachmentsResult.data) ? attachmentsResult.data : []
      ).filter((attachment) => {
        const mimeType = readStringField(attachment, "mimeType", "mime_type").toLowerCase();
        if (mimeType.startsWith("image/")) {
          return true;
        }

        const originalName = readStringField(attachment, "originalName", "original_name");
        return /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(originalName);
      }).length;
      const status: TestStatus =
        syncResult.generatedImageSavedCount > 0 || archivedImageCount > 0
          ? "pass"
          : syncResult.generatedImagePendingCount > 0
            ? "fail"
            : "fail";
      const message =
        status === "pass"
          ? `Generated image archive verified (${archivedImageCount} archived image attachment${archivedImageCount === 1 ? "" : "s"}).`
          : syncResult.generatedImagePendingCount > 0
            ? `Generated image archive is still pending for ${syncResult.generatedImagePendingCount} image attachment${syncResult.generatedImagePendingCount === 1 ? "" : "s"}.`
            : "Generated image archive verification failed because no archived image attachment was found.";
      const result = this.pushResult(
        createShellResult(
          "generated-image-archive",
          "Generated Image Archive",
          "advanced",
          status,
          message,
          { selector: url }
        )
      );
      return this.summarizeStep([result], message);
    } catch (error) {
      const result = this.pushResult(
        createShellResult(
          "generated-image-archive",
          "Generated Image Archive",
          "advanced",
          "fail",
          (error as Error).message
        )
      );
      return this.summarizeStep([result], result.message);
    }
  }

  private async runScrollStep(): Promise<AggregatedCommandStepResult> {
    const start = Date.now();
    try {
      const checks = await Promise.all(
        this.config.scrollerSelectors.map(async (selector) => {
          const data = (await this.ctx.executeScript(`
            (function() {
              const el = document.querySelector(${JSON.stringify(selector)});
              if (!el) return { selector: ${JSON.stringify(selector)}, exists: false };
              const before = el.scrollTop;
              el.scrollTop = el.scrollHeight;
              const after = el.scrollTop;
              return {
                selector: ${JSON.stringify(selector)},
                exists: true,
                scrollHeight: el.scrollHeight,
                clientHeight: el.clientHeight,
                before,
                after,
                canScroll: el.scrollHeight > el.clientHeight,
                nearBottom: el.scrollHeight - el.clientHeight - after < 24
              };
            })()
          `)) as {
            selector: string;
            exists: boolean;
            scrollHeight?: number;
            clientHeight?: number;
            before?: number;
            after?: number;
            canScroll?: boolean;
            nearBottom?: boolean;
          };
          return data;
        })
      );

      const found = checks.find(
        (item) => item.exists && item.canScroll === true && item.nearBottom === true
      );
      const result = createShellResult(
        "scroll-behavior",
        await this.runtimeT("scenario.scrollBehaviorName"),
        "scraping",
        found !== undefined ? "pass" : "fail",
        found !== undefined
          ? await this.runtimeT("scenario.scrollReachedFinalResponse")
          : await this.runtimeT("scenario.scrollDidNotReachFinalResponse"),
        {
          selector:
            found?.selector ??
            checks
              .filter((item) => item.exists)
              .map((item) => item.selector)
              .join(", "),
        },
        Date.now() - start
      );
      this.pushResult(result);
      return this.summarizeStep([result], await this.runtimeT("scenario.scrollBehaviorFailed"));
    } catch (error) {
      const result = createShellResult(
        "scroll-behavior",
        await this.runtimeT("scenario.scrollBehaviorName"),
        "scraping",
        "fail",
        await this.runtimeT("scenario.scrollBehaviorTestFailed"),
        { error: (error as Error).message },
        Date.now() - start
      );
      this.pushResult(result);
      return this.summarizeStep([result], await this.runtimeT("scenario.scrollBehaviorFailed"));
    }
  }

  private async runProviderCapabilitiesStep(): Promise<AggregatedCommandStepResult> {
    const results = this.pushResults([
      await testMicrophoneButton(this.ctx),
      await testVoiceButton(this.ctx),
    ]);
    return this.summarizeStep(
      results,
      await this.runtimeT("scenario.providerCapabilityChecksCompleted")
    );
  }

  private async readShellIndicator(
    kind: "loading" | "send" | "thinking"
  ): Promise<"busy" | "idle" | "missing"> {
    if (this.shell === null) return "missing";

    const result = (await this.shell.executeJavaScript(`
      (function() {
        const el = document.getElementById(${JSON.stringify(`${this.slot}-${kind}-indicator`)});
        if (!el) return 'missing';
        if (el.classList.contains('is-busy')) return 'busy';
        if (el.classList.contains('is-idle')) return 'idle';
        const color = window.getComputedStyle(el).backgroundColor;
        if (color === ${JSON.stringify(STATUS_COLOR.busy)}) return 'busy';
        if (color === ${JSON.stringify(STATUS_COLOR.idle)}) return 'idle';
        return 'missing';
      })()
    `)) as "busy" | "idle" | "missing";

    return result;
  }

  private async waitForShellIndicator(
    kind: "loading" | "send" | "thinking",
    expected: "busy" | "idle",
    timeout: number
  ): Promise<boolean> {
    if (this.shell === null) return false;
    return await waitForCondition(
      async () => (await this.readShellIndicator(kind)) === expected,
      timeout,
      this.abortSignal
    );
  }

  protected async observeLoadingIndicatorAfterNavigation(): Promise<"busy" | "idle" | "missing"> {
    if (this.shell === null) {
      return "missing";
    }

    const waitForSettledState = async (): Promise<"idle" | "missing"> => {
      this.throwIfCancelled();
      const state = await this.readShellIndicator("loading");
      if (state === "busy") {
        await this.waitForDelay(PROVIDER_TEST_INTERVALS.POLL);
        return await waitForSettledState();
      }

      if (this.navigationObservationDelayMs > 0) {
        await this.waitForDelay(this.navigationObservationDelayMs);
      }

      return state;
    };

    return await waitForSettledState();
  }

  private generateReport(
    scenarioId: ProviderScenarioId,
    aborted: boolean,
    abortReason?: string,
    commands: ProviderTestSuite["commands"] = []
  ): ProviderTestSuite {
    const totalDuration = Date.now() - this.startTime;
    const passed = this.results.filter((r) => r.status === "pass").length;
    const failed = this.results.filter((r) => r.status === "fail").length;
    const skipped = this.results.filter((r) => r.status === "skip").length;
    const warnings = this.results.filter((r) => r.status === "warning").length;

    return {
      runId: this.runId,
      scenarioId,
      providerId: this.config.id,
      providerName: this.config.name,
      slot: this.slot,
      url: this.webview.getURL(),
      timestamp: this.startTime,
      totalTests: this.results.length,
      passed,
      failed,
      skipped,
      warnings,
      totalDuration,
      results: this.results,
      commands,
      aborted,
      ...(aborted && abortReason !== undefined ? { abortReason } : {}),
    };
  }
}
