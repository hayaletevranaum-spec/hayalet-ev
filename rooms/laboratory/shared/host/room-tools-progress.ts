import { parseProcessOutput } from "../../services/process-output-parser.js";

type LaboratoryRecord = Record<string, unknown>;

type LaboratoryJobRecord = LaboratoryRecord & {
  action: string | null;
  bytesReceived: number | null;
  bytesTotal: number | null;
  detailLines?: string[] | null;
  featureStage: string | null;
  lastLine?: string | null;
  message: string | null;
  operation: string | null;
  packageName?: string | null;
  percent: number | null;
  phaseCount?: number | null;
  phaseIndex?: number | null;
  phaseLabel?: string | null;
  phasePercent?: number | null;
  projectId: string | null;
  requestId: string | null;
  stage: string | null;
  streamBuffer?: string | null;
  toolId: string | null;
};

type LaboratoryRuntimeWithJobs = LaboratoryRecord & {
  jobs: Record<string, LaboratoryJobRecord | undefined>;
  roomToolsProgressHandler: ((eventPayload: unknown) => void) | null;
  roomToolsSubscribed: boolean;
};

type LaboratoryRoomToolsEventPayload = LaboratoryRecord & {
  action?: unknown;
  bytesReceived?: unknown;
  bytesTotal?: unknown;
  chunk?: unknown;
  detailLines?: unknown;
  featureStage?: unknown;
  jobId?: unknown;
  message?: unknown;
  operation?: unknown;
  packageName?: unknown;
  percent?: unknown;
  phaseCount?: unknown;
  phaseIndex?: unknown;
  phaseLabel?: unknown;
  phasePercent?: unknown;
  projectId?: unknown;
  requestId?: unknown;
  roomId?: unknown;
  stage?: unknown;
  toolId?: unknown;
};

type LaboratoryRoomToolsProgressPayload = {
  action: string | null;
  bytesReceived: number | null;
  bytesTotal: number | null;
  detailLines?: string[] | null;
  featureStage: string | null;
  jobId: string;
  lastLine?: string | null;
  message: string | null;
  operation: string | null;
  packageName?: string | null;
  percent: number | null;
  phaseCount?: number | null;
  phaseIndex?: number | null;
  phaseLabel?: string | null;
  phasePercent?: number | null;
  projectId: string | null;
  requestId: string | null;
  suppressCanonicalEvent?: boolean;
  stage: string | null;
  toolId: string | null;
};

type LaboratoryElectronApi = {
  offRoomToolsProgress?: ((handler: (eventPayload: unknown) => void) => void) | undefined;
  onRoomToolsProgress?: ((handler: (eventPayload: unknown) => void) => void) | undefined;
};

type LaboratoryRoomToolsProgressRuntimeDeps = {
  asNonEmptyString: (value: unknown) => string | null;
  emitEvent: (api: unknown, payload: LaboratoryRecord) => void;
  getElectronApi: () => LaboratoryElectronApi | null;
  pushJobState: (api: unknown, payload: LaboratoryRoomToolsProgressPayload) => void;
  pushSourceState: (
    api: unknown,
    runtime: LaboratoryRuntimeWithJobs,
    requestId: string | null,
    action: string | null
  ) => void;
  roomId: string;
  toRecord: (value: unknown) => LaboratoryRecord;
};

export function createLaboratoryRoomToolsProgressRuntime(
  deps: LaboratoryRoomToolsProgressRuntimeDeps
) {
  const roomId = deps.roomId;
  const asNonEmptyString = deps.asNonEmptyString;
  const emitEvent = deps.emitEvent;
  const toRecord = deps.toRecord;
  const getElectronApi = deps.getElectronApi;
  const pushJobState = deps.pushJobState;
  const pushSourceState = deps.pushSourceState;

  function resolveEventScope(job: LaboratoryJobRecord) {
    return String(job.action || "").includes("process") ? "run" : "global";
  }

  function trimFeed(entries: LaboratoryRecord[], limit: number) {
    return entries.slice(Math.max(0, entries.length - limit));
  }

  function clampPercent(value: number) {
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  function getLatestLine(chunk: string) {
    const lines = chunk
      .replace(/\r/g, "\n")
      .split("\n")
      .map(function (entry) {
        return entry.trim();
      })
      .filter(Boolean);
    return lines.length > 0 ? lines[lines.length - 1] || null : null;
  }

  function readPercent(line: string) {
    const match = line.match(/(\d{1,3}(?:\.\d+)?)%/);
    if (!match) {
      return null;
    }
    const value = Number(match[1] || "");
    return Number.isFinite(value) ? clampPercent(value) : null;
  }

  function asFiniteNumber(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }

  function toDetailLines(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map(function (entry) {
        return asNonEmptyString(entry);
      })
      .filter((entry): entry is string => entry !== null)
      .slice(-5);
  }

  function appendDetailLine(job: LaboratoryJobRecord, line: string): void {
    const normalized = line.trim().replace(/\s+/g, " ");
    if (normalized === "") {
      return;
    }
    const currentLines = Array.isArray(job.detailLines) ? job.detailLines : [];
    const nextLines = currentLines.filter(function (entry) {
      return entry !== normalized;
    });
    nextLines.push(normalized);
    job.detailLines = nextLines.slice(-5);
    job.lastLine = normalized;
  }

  function parseByteSize(label: string): number | null {
    const match = label.trim().match(/^([0-9.]+)\s*([KMGTPE]?i?B)$/i);
    if (!match) {
      return null;
    }
    const value = Number(match[1]);
    if (Number.isFinite(value) !== true) {
      return null;
    }
    const unit = (match[2] || "B").toLowerCase();
    const factor =
      unit === "kb"
        ? 1_000
        : unit === "mb"
          ? 1_000_000
          : unit === "gb"
            ? 1_000_000_000
            : unit === "tb"
              ? 1_000_000_000_000
              : unit === "kib"
                ? 1024
                : unit === "mib"
                  ? 1024 ** 2
                  : unit === "gib"
                    ? 1024 ** 3
                    : unit === "tib"
                      ? 1024 ** 4
                      : 1;
    return Math.round(value * factor);
  }

  function readPipTransfer(line: string): { received: number | null; total: number | null } {
    const progressMatch = line.match(/([0-9.]+\s*[KMGTPE]?i?B)\s*\/\s*([0-9.]+\s*[KMGTPE]?i?B)/i);
    if (progressMatch) {
      return {
        received: parseByteSize(progressMatch[1] || ""),
        total: parseByteSize(progressMatch[2] || ""),
      };
    }
    const totalMatch = line.match(/\(([0-9.]+\s*[KMGTPE]?i?B)\)/i);
    return {
      received: null,
      total: totalMatch ? parseByteSize(totalMatch[1] || "") : null,
    };
  }

  function updatePythonLifecycleFromLine(job: LaboratoryJobRecord, line: string): void {
    const percent = readPercent(line);
    const transfer = readPipTransfer(line);
    if (transfer.received !== null) {
      job.bytesReceived = transfer.received;
    }
    if (transfer.total !== null) {
      job.bytesTotal = transfer.total;
    }

    const collectingMatch = line.match(/^Collecting\s+(.+)$/i);
    const downloadingMatch = line.match(/^Downloading\s+(.+?)(?:\s+\(|$)/i);
    const satisfiedMatch = line.match(/^Requirement already satisfied:\s+([^ ]+)/i);
    const installingMatch = line.match(/^Installing collected packages:\s+(.+)$/i);

    if (/Create room-local python runtime/i.test(String(job.message || ""))) {
      job.phaseIndex = 1;
      job.phaseCount = 5;
      job.phaseLabel = "Python runtime hazırlanıyor";
      job.percent = Math.max(job.percent ?? 0, 12);
    }
    if (/Bootstrap python tooling/i.test(String(job.message || ""))) {
      job.phaseIndex = 3;
      job.phaseCount = 5;
      job.phaseLabel = "Python kurulum araçları hazırlanıyor";
      job.percent = Math.max(job.percent ?? 0, 38);
    }
    if (/Install python packages/i.test(String(job.message || ""))) {
      job.phaseIndex = 4;
      job.phaseCount = 5;
      job.phaseLabel = "Python paketleri indiriliyor ve kuruluyor";
      job.percent = Math.max(job.percent ?? 0, 52);
    }

    if (collectingMatch) {
      job.packageName = collectingMatch[1]?.trim() || job.packageName || null;
      job.phaseLabel = "Paket bağımlılıkları çözümleniyor";
      job.percent = Math.max(job.percent ?? 0, 55);
      return;
    }
    if (satisfiedMatch) {
      job.packageName = satisfiedMatch[1]?.trim() || job.packageName || null;
      job.phaseLabel = "Mevcut paket doğrulanıyor";
      job.percent = Math.max(job.percent ?? 0, 58);
      return;
    }
    if (downloadingMatch || /^Using cached\s+/i.test(line)) {
      job.packageName = downloadingMatch?.[1]?.trim() || job.packageName || null;
      job.phaseLabel = /^Using cached\s+/i.test(line)
        ? "Paket önbellekten alınıyor"
        : "Paket indiriliyor";
      job.percent = Math.max(job.percent ?? 0, 62);
      return;
    }
    if (percent !== null && /[KMGTPE]?i?B\/s|━|ETA/i.test(line)) {
      job.phaseLabel = "Paket indiriliyor";
      job.phasePercent = percent;
      job.percent = Math.max(job.percent ?? 0, Math.min(82, 62 + Math.round(percent * 0.2)));
      return;
    }
    if (/Preparing metadata|Building wheel|Installing build dependencies/i.test(line)) {
      job.phaseLabel = "Paket hazırlanıyor";
      job.percent = Math.max(job.percent ?? 0, 70);
      return;
    }
    if (installingMatch) {
      job.phaseLabel = "Paketler kuruluyor";
      job.packageName = installingMatch[1]?.split(",")[0]?.trim() || job.packageName || null;
      job.percent = Math.max(job.percent ?? 0, 84);
      return;
    }
    if (/Successfully installed/i.test(line)) {
      job.phaseLabel = "Paketler doğrulanıyor";
      job.percent = Math.max(job.percent ?? 0, 90);
    }
  }

  function resolveYoutubePhase(line: string, previousPercent: number | null) {
    const percent = readPercent(line);
    if (/\[download\]/i.test(line)) {
      return {
        phaseIndex: 1,
        phaseCount: 4,
        phaseLabel: percent === null ? "İndirme hazırlanıyor" : "Medya indiriliyor",
        phasePercent: percent,
        percent: percent ?? previousPercent,
      };
    }
    if (/\[(Merger|Fixup)\]|Merging formats/i.test(line)) {
      return {
        phaseIndex: 2,
        phaseCount: 4,
        phaseLabel: "Akışlar birleştiriliyor",
        phasePercent: null,
        percent: Math.max(previousPercent ?? 0, 90),
      };
    }
    if (/\[(ExtractAudio|VideoConvertor|EmbedSubtitle|SubtitlesConvertor)\]/i.test(line)) {
      return {
        phaseIndex: 2,
        phaseCount: 4,
        phaseLabel: "Çıktı dönüştürülüyor",
        phasePercent: null,
        percent: Math.max(previousPercent ?? 0, 94),
      };
    }
    if (/^\[MoveFiles\]|\[Metadata\]|^\S.*\.(mp4|mkv|webm|mp3|m4a|opus|wav|flac)$/i.test(line)) {
      return {
        phaseIndex: 3,
        phaseCount: 4,
        phaseLabel: "Dosya projeye kaydediliyor",
        phasePercent: null,
        percent: Math.max(previousPercent ?? 0, 97),
      };
    }
    return null;
  }

  function appendProcessFeed(
    job: LaboratoryJobRecord,
    key: "events" | "rawLog",
    entry: LaboratoryRecord
  ) {
    const processRecord = toRecord(job["processRecordRef"]);
    if (Object.keys(processRecord).length === 0) {
      return;
    }
    const entries = Array.isArray(processRecord[key])
      ? (processRecord[key] as unknown[]).map(toRecord)
      : [];
    entries.push(entry);
    processRecord[key] = trimFeed(entries, 260);
  }

  function flushBufferedToolLines(
    api: unknown,
    job: LaboratoryJobRecord,
    stage: "stdout" | "stderr",
    chunk: string
  ) {
    const buffered = `${job.streamBuffer || ""}${chunk}`.replace(/\r\n/g, "\n");
    const parts = buffered.split("\n");
    job.streamBuffer = parts.pop() || "";
    const scope = resolveEventScope(job);
    parts
      .map(function (entry) {
        return entry.trim();
      })
      .filter(Boolean)
      .forEach(function (line) {
        const rawEvent = {
          kind: "raw-log",
          severity: stage === "stderr" ? "warning" : "info",
          message: line,
          detail: null,
          action: job.action,
          stage,
          scope,
          moduleId: asNonEmptyString(job["moduleId"]),
          rawLine: line,
        };
        appendProcessFeed(job, "rawLog", rawEvent);
        emitEvent(api, rawEvent);

        const parsedEvent = parseProcessOutput(line, {
          action: job.action,
          moduleId: asNonEmptyString(job["moduleId"]),
          scope,
          stream: stage,
        });
        if (parsedEvent) {
          appendProcessFeed(job, "events", {
            ...parsedEvent,
          });
          emitEvent(api, {
            ...parsedEvent,
          });
        }
      });
  }

  function updateJobFromProgress(
    runtime: LaboratoryRuntimeWithJobs,
    eventPayload: LaboratoryRoomToolsEventPayload
  ): LaboratoryRoomToolsProgressPayload | null {
    const jobId = asNonEmptyString(eventPayload.jobId);
    if (!jobId || !runtime.jobs[jobId]) {
      return null;
    }

    const job = runtime.jobs[jobId];
    const eventStage = asNonEmptyString(eventPayload.stage);
    const operation = asNonEmptyString(eventPayload.operation) || job.operation;
    const toolLifecycleStream =
      (operation === "tool-install" || operation === "tool-update") &&
      (eventStage === "stdout" || eventStage === "stderr");
    job.stage = toolLifecycleStream ? "running" : eventStage || job.stage;
    job.operation = asNonEmptyString(eventPayload.operation) || job.operation;
    if (typeof eventPayload.bytesReceived === "number") {
      job.bytesReceived = eventPayload.bytesReceived;
    }
    if (typeof eventPayload.bytesTotal === "number") {
      job.bytesTotal = eventPayload.bytesTotal;
    }
    if (typeof eventPayload.percent === "number") {
      job.percent = eventPayload.percent;
    } else if (
      typeof eventPayload.bytesReceived === "number" &&
      typeof eventPayload.bytesTotal === "number" &&
      eventPayload.bytesTotal > 0
    ) {
      job.percent = Math.round((eventPayload.bytesReceived / eventPayload.bytesTotal) * 100);
    }
    const phaseLabel = asNonEmptyString(eventPayload.phaseLabel);
    if (phaseLabel !== null) {
      job.phaseLabel = phaseLabel;
    }
    const phaseIndex = asFiniteNumber(eventPayload.phaseIndex);
    if (phaseIndex !== null) {
      job.phaseIndex = phaseIndex;
    }
    const phaseCount = asFiniteNumber(eventPayload.phaseCount);
    if (phaseCount !== null) {
      job.phaseCount = phaseCount;
    }
    const phasePercent = asFiniteNumber(eventPayload.phasePercent);
    if (phasePercent !== null) {
      job.phasePercent = phasePercent;
    }
    const packageName = asNonEmptyString(eventPayload.packageName);
    if (packageName !== null) {
      job.packageName = packageName;
    }
    const detailLines = toDetailLines(eventPayload.detailLines);
    if (detailLines.length > 0) {
      job.detailLines = detailLines;
    }
    job.message = asNonEmptyString(eventPayload.message) || job.message;

    const toolRunStream =
      asNonEmptyString(eventPayload.operation) === "tool-run" &&
      (eventPayload.stage === "stdout" || eventPayload.stage === "stderr");
    if (toolRunStream || toolLifecycleStream) {
      const chunk = asNonEmptyString(eventPayload.chunk);
      if (chunk) {
        const line = getLatestLine(chunk) || chunk.trim();
        appendDetailLine(job, line);
        const parsedPercent = readPercent(line);
        if (parsedPercent !== null) {
          if (toolLifecycleStream) {
            job.phasePercent = parsedPercent;
          } else {
            job.percent = parsedPercent;
          }
        }
        if (toolLifecycleStream) {
          updatePythonLifecycleFromLine(job, line);
        }
        if (job.action === "source-download-youtube") {
          const youtubePhase = resolveYoutubePhase(line, job.percent);
          if (youtubePhase !== null) {
            job.phaseLabel = youtubePhase.phaseLabel;
            job.phasePercent = youtubePhase.phasePercent;
            job.phaseIndex = youtubePhase.phaseIndex;
            job.phaseCount = youtubePhase.phaseCount;
            if (typeof youtubePhase.percent === "number") {
              job.percent = clampPercent(youtubePhase.percent);
            }
          }
        }
        const totalMatch = line.match(/of\s+~?\s*([0-9.]+\s*[KMGTPE]?i?B)/i);
        const speedMatch = line.match(/at\s+([0-9.]+\s*[KMGTPE]?i?B\/s)/i);
        const etaMatch = line.match(/ETA\s+([0-9:]+)/i);
        const details = [
          job.phaseLabel ? `Aşama: ${job.phaseLabel}` : null,
          typeof job.percent === "number" ? `${Math.round(job.percent)}%` : null,
          totalMatch?.[1] ? `boyut ${totalMatch[1].trim()}` : null,
          speedMatch?.[1] ? `hız ${speedMatch[1].trim()}` : null,
          etaMatch?.[1] ? `ETA ${etaMatch[1]}` : null,
        ].filter((entry): entry is string => typeof entry === "string");
        if (details.length > 0) {
          job.message = details.join(" · ");
        }
      }
    }

    if (toolLifecycleStream) {
      const details = [
        job.phaseLabel ? `Aşama: ${job.phaseLabel}` : null,
        job.packageName ? `paket ${job.packageName}` : null,
        typeof job.phasePercent === "number" ? `${Math.round(job.phasePercent)}%` : null,
        typeof job.bytesReceived === "number" && typeof job.bytesTotal === "number"
          ? `${Math.round(job.bytesReceived / 1_000_000)} / ${Math.round(job.bytesTotal / 1_000_000)} MB`
          : typeof job.bytesTotal === "number"
            ? `boyut ${Math.round(job.bytesTotal / 1_000_000)} MB`
            : null,
      ].filter((entry): entry is string => typeof entry === "string");
      if (details.length > 0) {
        job.message = details.join(" · ");
      }
    }

    return {
      requestId: job.requestId,
      jobId: jobId,
      action: job.action,
      detailLines: job.detailLines ?? null,
      projectId: job.projectId,
      toolId: job.toolId,
      featureStage: job.featureStage || null,
      lastLine: job.lastLine ?? null,
      operation: job.operation || null,
      packageName: job.packageName ?? null,
      stage: toolRunStream && job.action === "source-download-youtube" ? "running" : job.stage,
      percent: job.percent,
      phaseCount: job.phaseCount ?? null,
      phaseIndex: job.phaseIndex ?? null,
      phaseLabel: job.phaseLabel ?? null,
      phasePercent: job.phasePercent ?? null,
      bytesReceived: job.bytesReceived,
      bytesTotal: job.bytesTotal,
      message: job.message,
      suppressCanonicalEvent:
        (toolRunStream && job.action !== "source-download-youtube") || toolLifecycleStream,
    };
  }

  function ensureRoomToolsSubscription(api: unknown, runtime: LaboratoryRuntimeWithJobs): void {
    const electronApi = getElectronApi();
    if (
      runtime.roomToolsSubscribed === true ||
      electronApi === null ||
      typeof electronApi.onRoomToolsProgress !== "function"
    ) {
      return;
    }

    runtime.roomToolsProgressHandler = function (eventPayload: unknown) {
      const payload = toRecord(eventPayload) as LaboratoryRoomToolsEventPayload;
      if (!eventPayload || payload.roomId !== roomId) {
        return;
      }

      const nextJobPayload = updateJobFromProgress(runtime, payload);
      if (!nextJobPayload) {
        return;
      }

      if (
        asNonEmptyString(payload.operation) === "tool-run" &&
        (payload.stage === "stdout" || payload.stage === "stderr")
      ) {
        const streamStage = payload.stage;
        const job = runtime.jobs[nextJobPayload.jobId];
        const chunk = asNonEmptyString(payload.chunk);
        if (job && chunk && job.action !== "source-download-youtube") {
          flushBufferedToolLines(api, job, streamStage, chunk);
        }
      }

      pushJobState(api, nextJobPayload);
      pushSourceState(api, runtime, nextJobPayload.requestId, nextJobPayload.action);
    };

    electronApi.onRoomToolsProgress(runtime.roomToolsProgressHandler);
    runtime.roomToolsSubscribed = true;
  }

  function tearDownRoomToolsSubscription(runtime: LaboratoryRuntimeWithJobs): void {
    const electronApi = getElectronApi();
    if (
      runtime.roomToolsSubscribed !== true ||
      electronApi === null ||
      typeof electronApi.offRoomToolsProgress !== "function" ||
      typeof runtime.roomToolsProgressHandler !== "function"
    ) {
      return;
    }

    electronApi.offRoomToolsProgress(runtime.roomToolsProgressHandler);
    runtime.roomToolsProgressHandler = null;
    runtime.roomToolsSubscribed = false;
  }

  return {
    ensureRoomToolsSubscription: ensureRoomToolsSubscription,
    tearDownRoomToolsSubscription: tearDownRoomToolsSubscription,
    updateJobFromProgress: updateJobFromProgress,
  };
}
