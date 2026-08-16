import { createLabOutputAsset, upsertLabAsset } from "./lab-assets.js";

type LaboratoryRecord = Record<string, unknown>;

type LaboratoryReportExportEntry = LaboratoryRecord;

type LaboratoryFeatureReportRecord = LaboratoryRecord & {
  aiReport?: LaboratoryRecord | null;
  artifacts?: LaboratoryRecord[] | null;
  error?: string | null;
  exports?: LaboratoryReportExportEntry[];
  status?: string | null;
  userReport?: LaboratoryRecord | null;
};

type LaboratoryReportExportProject = LaboratoryRecord & {
  id: string;
  slug: string;
};

type LaboratoryReportExportFormat = "json" | "pdf";
type LaboratoryReportExportView = "user" | "ai";

type LaboratoryReportExportOptions = LaboratoryRecord & {
  format?: unknown;
  reportView?: unknown;
  targetDirectory?: unknown;
};

type LaboratoryOpenDialogResult = {
  canceled?: unknown;
  filePaths?: unknown;
};

type LaboratoryReportExportElectronApi = {
  showOpenDialog?: (options: LaboratoryRecord) => Promise<LaboratoryOpenDialogResult>;
};

type LaboratoryReportExportResult = {
  cancelled?: true;
};

type LaboratoryReportExportRuntimeDeps = {
  buildReportMarkdown: (
    runtime: unknown,
    project: LaboratoryRecord,
    featureId: string,
    reportRecord: LaboratoryFeatureReportRecord
  ) => string;
  clearJob: (runtime: unknown, jobId: string) => void;
  composeFeatureReport: (
    runtime: unknown,
    project: LaboratoryRecord,
    featureId: string
  ) => LaboratoryFeatureReportRecord;
  ensureProjectDirectories: (
    runtime: unknown,
    project: LaboratoryRecord,
    requestId: string
  ) => Promise<unknown>;
  ensureReportJobSlotAvailable: (runtime: unknown, projectId: string, action: string) => void;
  getActiveProject: (runtime: unknown) => LaboratoryReportExportProject | null;
  getElectronApi?: () => LaboratoryReportExportElectronApi | null;
  getFeatureReportDir: (runtime: unknown, project: LaboratoryRecord, featureId: string) => string;
  getFeatureReportExportAction: (featureId: string) => string;
  getFeatureReportRecord: (
    project: LaboratoryRecord,
    featureId: string
  ) => LaboratoryFeatureReportRecord;
  normalizeReportExport: (value: unknown) => LaboratoryReportExportEntry;
  patchActiveProject: (
    runtime: unknown,
    patcher: (project: LaboratoryReportExportProject) => LaboratoryReportExportProject
  ) => Promise<unknown>;
  pushJobState: (api: unknown, payload: LaboratoryRecord) => void;
  registerJob: (runtime: unknown, options: LaboratoryRecord) => unknown;
  sanitizeFileSegment: (value: unknown, fallback: string) => string;
  setFeatureReportRecord: (
    project: LaboratoryRecord,
    featureId: string,
    record: LaboratoryFeatureReportRecord
  ) => void;
  writeTextFile: (filePath: string, value: string) => Promise<unknown>;
};

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function normalizeExportFormat(value: unknown): LaboratoryReportExportFormat | null {
  return value === "json" || value === "pdf" ? value : null;
}

function normalizeReportView(value: unknown): LaboratoryReportExportView | null {
  return value === "user" || value === "ai" ? value : null;
}

function getTargetDirectory(options: LaboratoryReportExportOptions): string | null {
  return (
    asNonEmptyString(options["targetDirectory"]) ||
    asNonEmptyString(options["outputDirectory"]) ||
    asNonEmptyString(options["directory"])
  );
}

function getRequestedReportView(
  options: LaboratoryReportExportOptions,
  format: LaboratoryReportExportFormat
): LaboratoryReportExportView {
  return (
    normalizeReportView(options["reportView"]) ||
    normalizeReportView(options["view"]) ||
    normalizeReportView(options["reportSource"]) ||
    (format === "json" ? "ai" : "user")
  );
}

function getSelectedReportRecord(
  reportRecord: LaboratoryFeatureReportRecord,
  reportView: LaboratoryReportExportView
): LaboratoryRecord {
  const selectedReport = reportView === "ai" ? reportRecord.aiReport : reportRecord.userReport;
  return selectedReport !== null && typeof selectedReport === "object"
    ? selectedReport
    : reportRecord;
}

function getDialogFilePath(selection: LaboratoryOpenDialogResult): string | null {
  const filePaths = Array.isArray(selection.filePaths) ? selection.filePaths : [];
  return asNonEmptyString(filePaths[0]);
}

function joinDirectoryPath(directoryPath: string, fileName: string): string {
  return `${directoryPath.replace(/[\\/]+$/, "")}/${fileName}`;
}

function normalizePdfText(value: string): string {
  const normalized = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  let output = "";
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index] || "";
    const code = character.charCodeAt(0);
    output += code >= 32 && code <= 126 ? character : "?";
  }
  return output;
}

function escapePdfText(value: string): string {
  return normalizePdfText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function normalizeMarkdownLine(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\s*[-*]\s+/, "- ")
    .replace(/\s+/g, " ")
    .trim();
}

function wrapPdfLine(line: string, maxLength: number): string[] {
  if (line.length <= maxLength) {
    return [line];
  }
  const wrapped: string[] = [];
  let remaining = line;
  while (remaining.length > maxLength) {
    const breakIndex = remaining.lastIndexOf(" ", maxLength);
    const nextIndex = breakIndex > 20 ? breakIndex : maxLength;
    wrapped.push(remaining.slice(0, nextIndex).trimEnd());
    remaining = remaining.slice(nextIndex).trimStart();
  }
  if (remaining.trim() !== "") {
    wrapped.push(remaining);
  }
  return wrapped;
}

function buildPdfLines(markdown: string): string[] {
  return markdown.split(/\r?\n/).flatMap(function (line) {
    const normalized = normalizeMarkdownLine(line);
    return normalized === "" ? [""] : wrapPdfLine(normalized, 92);
  });
}

function buildPdfPageContent(lines: string[]): string {
  const escapedLines = lines.map(function (line) {
    return `(${escapePdfText(line)}) Tj`;
  });
  return `BT\n/F1 10 Tf\n50 800 Td\n14 TL\n${escapedLines.join("\nT*\n")}\nET`;
}

function buildPdfReport(markdown: string): string {
  const lines = buildPdfLines(markdown);
  const pageSize = 54;
  const pages = lines.length > 0 ? lines : ["Report"];
  const pageChunks: string[][] = [];
  for (let index = 0; index < pages.length; index += pageSize) {
    pageChunks.push(pages.slice(index, index + pageSize));
  }

  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  const kids: string[] = [];
  pageChunks.forEach(function (chunk, index) {
    const pageObjectId = 4 + index * 2;
    const contentObjectId = pageObjectId + 1;
    const content = buildPdfPageContent(chunk);
    kids.push(`${pageObjectId} 0 R`);
    objects[pageObjectId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjectId} 0 R >>`;
    objects[contentObjectId] =
      `<< /Length ${String(content.length)} >>\nstream\n${content}\nendstream`;
  });
  objects[2] = `<< /Type /Pages /Count ${String(pageChunks.length)} /Kids [${kids.join(" ")}] >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let objectId = 1; objectId < objects.length; objectId += 1) {
    const objectBody = objects[objectId];
    if (objectBody === undefined) {
      continue;
    }
    offsets[objectId] = pdf.length;
    pdf += `${objectId} 0 obj\n${objectBody}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${String(objects.length)}\n0000000000 65535 f \n`;
  for (let objectId = 1; objectId < objects.length; objectId += 1) {
    pdf += `${String(offsets[objectId] || 0).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${String(objects.length)} /Root 1 0 R >>\nstartxref\n${String(xrefOffset)}\n%%EOF\n`;
  return pdf;
}

function buildAiReportMarkdown(
  project: LaboratoryRecord,
  featureId: string,
  reportRecord: LaboratoryFeatureReportRecord
): string {
  const aiReport = getSelectedReportRecord(reportRecord, "ai");
  return [
    `# ${featureId} Technical Report`,
    "",
    `Project: ${asNonEmptyString(project["name"]) || asNonEmptyString(project["slug"]) || "--"}`,
    `Generated: ${asNonEmptyString(reportRecord["generatedAt"]) || new Date().toISOString()}`,
    "",
    "## Technical Payload",
    "",
    JSON.stringify(aiReport, null, 2),
  ].join("\n");
}

export function createLaboratoryReportExportRuntime(deps: LaboratoryReportExportRuntimeDeps) {
  const {
    getActiveProject,
    ensureProjectDirectories,
    getFeatureReportExportAction,
    ensureReportJobSlotAvailable,
    registerJob,
    pushJobState,
    patchActiveProject,
    setFeatureReportRecord,
    sanitizeFileSegment,
    normalizeReportExport,
    writeTextFile,
    clearJob,
    getFeatureReportDir,
    getFeatureReportRecord,
    composeFeatureReport,
    buildReportMarkdown,
    getElectronApi,
  } = deps;

  async function resolveSelectedExportDirectory(
    format: LaboratoryReportExportFormat,
    options: LaboratoryReportExportOptions
  ): Promise<{ cancelled: true } | { cancelled: false; targetDirectory: string }> {
    const targetDirectory = getTargetDirectory(options);
    if (targetDirectory !== null) {
      return { cancelled: false, targetDirectory };
    }

    const electronApi = typeof getElectronApi === "function" ? getElectronApi() : null;
    if (electronApi === null || typeof electronApi.showOpenDialog !== "function") {
      throw new Error("Report export folder picker is unavailable.");
    }

    const selection = await electronApi.showOpenDialog({
      buttonLabel: format === "json" ? "JSON Disa Aktar" : "PDF Disa Aktar",
      properties: ["openDirectory", "createDirectory"],
      title: format === "json" ? "JSON rapor klasoru sec" : "PDF rapor klasoru sec",
    });
    const selectedDirectory = getDialogFilePath(selection);
    if (selection.canceled === true || selectedDirectory === null) {
      return { cancelled: true };
    }
    return { cancelled: false, targetDirectory: selectedDirectory };
  }

  async function exportFeatureReport(
    api: unknown,
    runtime: unknown,
    requestId: string,
    featureId: string,
    options: LaboratoryReportExportOptions = {}
  ): Promise<LaboratoryReportExportResult> {
    const project = getActiveProject(runtime);
    if (project === null) {
      throw new Error("Active project is missing.");
    }

    await ensureProjectDirectories(runtime, project, requestId);
    const reportRecord = composeFeatureReport(runtime, project, featureId);
    if (reportRecord.status !== "ready") {
      throw new Error("Run the process stage before exporting a report.");
    }

    const action = getFeatureReportExportAction(featureId);
    const requestedFormat =
      normalizeExportFormat(options["format"]) || normalizeExportFormat(options["exportFormat"]);
    const requestedReportView =
      requestedFormat === null ? null : getRequestedReportView(options, requestedFormat);
    const selectedDirectory =
      requestedFormat === null
        ? null
        : await resolveSelectedExportDirectory(requestedFormat, options);
    if (selectedDirectory?.cancelled === true) {
      return { cancelled: true };
    }

    ensureReportJobSlotAvailable(runtime, project.id, action);
    const jobId = `room-report-${featureId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    registerJob(runtime, {
      jobId: jobId,
      requestId: requestId,
      action: action,
      projectId: project.id,
      featureStage: "report",
    });
    pushJobState(api, {
      requestId: requestId,
      jobId: jobId,
      action: action,
      projectId: project.id,
      featureStage: "report",
      stage: "queued",
    });

    try {
      let createdResultAssetIds: string[] = [];
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const baseName = `${sanitizeFileSegment(project.slug, "project")}-${featureId}-${stamp}`;
      if (requestedFormat !== null && requestedReportView !== null && selectedDirectory !== null) {
        const targetDirectory = selectedDirectory.targetDirectory;
        const fileName = `${baseName}-${requestedReportView}.${requestedFormat}`;
        const outputPath = joinDirectoryPath(targetDirectory, fileName);
        const outputContent =
          requestedFormat === "json"
            ? JSON.stringify(getSelectedReportRecord(reportRecord, requestedReportView), null, 2)
            : buildPdfReport(
                requestedReportView === "ai"
                  ? buildAiReportMarkdown(project, featureId, reportRecord)
                  : buildReportMarkdown(runtime, project, featureId, reportRecord)
              );
        await writeTextFile(outputPath, outputContent);
        const exportEntry = normalizeReportExport({
          format: requestedFormat,
          path: outputPath,
          fileName: fileName,
          reportView: requestedReportView,
          status: "ready",
        });
        await patchActiveProject(runtime, function (nextProject) {
          const nextReportRecord = composeFeatureReport(runtime, nextProject, featureId);
          const currentReportRecord = getFeatureReportRecord(nextProject, featureId);
          const currentExports = Array.isArray(currentReportRecord.exports)
            ? currentReportRecord.exports
            : [];
          nextReportRecord.exports = [exportEntry]
            .concat(currentExports)
            .reduce<LaboratoryReportExportEntry[]>(function (accumulator, entry) {
              const candidate = normalizeReportExport(entry);
              const candidatePath =
                typeof candidate["path"] === "string" ? String(candidate["path"]) : "";
              if (
                candidatePath !== "" &&
                accumulator.some(function (existingEntry) {
                  return String(existingEntry["path"] || "") === candidatePath;
                })
              ) {
                return accumulator;
              }
              accumulator.push(candidate);
              return accumulator;
            }, [])
            .slice(0, 8);
          setFeatureReportRecord(nextProject, featureId, nextReportRecord);
          return nextProject;
        });
        pushJobState(api, {
          requestId: requestId,
          jobId: jobId,
          action: action,
          projectId: project.id,
          featureStage: "report",
          outputPath,
          stage: "completed",
        });
        return {};
      }

      const fileName = `${baseName}-user.md`;
      const outputPath = `${getFeatureReportDir(runtime, project, featureId)}/${fileName}`;
      const aiFileName = `${baseName}-ai.json`;
      const aiOutputPath = `${getFeatureReportDir(runtime, project, featureId)}/${aiFileName}`;
      await writeTextFile(
        outputPath,
        buildReportMarkdown(runtime, project, featureId, reportRecord)
      );
      await writeTextFile(aiOutputPath, JSON.stringify(reportRecord.aiReport || null, null, 2));
      const userExportEntry = normalizeReportExport({
        format: "md",
        path: outputPath,
        fileName: fileName,
        status: "ready",
      });
      const aiExportEntry = normalizeReportExport({
        format: "json",
        path: aiOutputPath,
        fileName: aiFileName,
        status: "ready",
      });
      await patchActiveProject(runtime, function (nextProject) {
        const nextReportRecord = composeFeatureReport(runtime, nextProject, featureId);
        const currentReportRecord = getFeatureReportRecord(nextProject, featureId);
        const currentExports = Array.isArray(currentReportRecord.exports)
          ? currentReportRecord.exports
          : [];
        const nextExportEntries = [userExportEntry, aiExportEntry]
          .concat(currentExports)
          .reduce<LaboratoryReportExportEntry[]>(function (accumulator, entry) {
            const candidate = normalizeReportExport(entry);
            const candidatePath =
              typeof candidate["path"] === "string" ? String(candidate["path"]) : "";
            if (
              candidatePath !== "" &&
              accumulator.some(function (existingEntry) {
                return String(existingEntry["path"] || "") === candidatePath;
              })
            ) {
              return accumulator;
            }
            accumulator.push(candidate);
            return accumulator;
          }, []);
        nextReportRecord.exports = nextExportEntries.slice(0, 8);
        setFeatureReportRecord(nextProject, featureId, nextReportRecord);
        const reportRunId =
          typeof nextReportRecord["sourceRunId"] === "string"
            ? nextReportRecord["sourceRunId"]
            : null;
        const userReportAsset = createLabOutputAsset(nextProject, {
          type: "report",
          name: fileName,
          localPath: outputPath,
          runId: reportRunId,
          metadata: {
            action,
            featureId,
            fileName,
            format: "md",
            requestId,
          },
        });
        const aiReportAsset = createLabOutputAsset(nextProject, {
          type: "report",
          name: aiFileName,
          localPath: aiOutputPath,
          runId: reportRunId,
          metadata: {
            action,
            featureId,
            fileName: aiFileName,
            format: "json",
            requestId,
          },
        });
        createdResultAssetIds = [userReportAsset.id, aiReportAsset.id];
        return {
          ...nextProject,
          assets: upsertLabAsset(
            upsertLabAsset(nextProject["assets"], userReportAsset),
            aiReportAsset
          ),
        };
      });
      pushJobState(api, {
        requestId: requestId,
        jobId: jobId,
        action: action,
        projectId: project.id,
        featureStage: "report",
        ...(createdResultAssetIds.length > 0 ? { resultAssetIds: createdResultAssetIds } : {}),
        stage: "completed",
      });
      return {};
    } catch (error) {
      await patchActiveProject(runtime, function (nextProject) {
        setFeatureReportRecord(nextProject, featureId, {
          ...getFeatureReportRecord(nextProject, featureId),
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
        return nextProject;
      });
      pushJobState(api, {
        requestId: requestId,
        jobId: jobId,
        action: action,
        projectId: project.id,
        featureStage: "report",
        stage: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      clearJob(runtime, jobId);
    }
  }

  return {
    exportFeatureReport,
  };
}
