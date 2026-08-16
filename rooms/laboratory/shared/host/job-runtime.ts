type LaboratoryRecord = Record<string, unknown>;

type JobRuntimeDeps = {
  roomId: string;
  toRecord: (value: unknown) => LaboratoryRecord;
  cancelRoomTool: (roomId: string, jobId: string, requestId: string) => Promise<unknown>;
  clearJob: (runtime: JobRuntime, jobId: string) => void;
  pushJobState: (api: unknown, payload: LaboratoryRecord) => void;
};

type JobRuntime = {
  jobs: Record<string, unknown>;
};

type JobEntry = {
  jobId: string;
  action: string | null;
  projectId: string | null;
  toolId: string | null;
  featureStage: string | null;
};

export function createLaboratoryJobRuntime(deps: JobRuntimeDeps) {
  const { roomId, toRecord, cancelRoomTool, clearJob, pushJobState } = deps;

  function toJobEntry(jobId: string, value: unknown): JobEntry {
    const record = toRecord(value);
    return {
      jobId,
      action: typeof record["action"] === "string" ? record["action"] : null,
      projectId: typeof record["projectId"] === "string" ? record["projectId"] : null,
      toolId: typeof record["toolId"] === "string" ? record["toolId"] : null,
      featureStage: typeof record["featureStage"] === "string" ? record["featureStage"] : null,
    };
  }

  function collectJobs(runtime: JobRuntime, predicate: (job: JobEntry) => boolean): JobEntry[] {
    return Object.keys(runtime.jobs)
      .map(function (jobId) {
        return toJobEntry(jobId, runtime.jobs[jobId]);
      })
      .filter(predicate);
  }

  async function cancelJobById(
    api: unknown,
    runtime: JobRuntime,
    jobId: string,
    requestId: string
  ) {
    const job = runtime.jobs[jobId];
    if (!job) {
      return null;
    }

    const jobEntry = toJobEntry(jobId, job);
    await cancelRoomTool(roomId, jobEntry.jobId, requestId);
    pushJobState(api, {
      requestId,
      jobId: jobEntry.jobId,
      action: jobEntry.action,
      projectId: jobEntry.projectId,
      toolId: jobEntry.toolId,
      featureStage: jobEntry.featureStage || "source",
      stage: "cancelled",
      message: "Cancelled by operator.",
    });
    clearJob(runtime, jobEntry.jobId);
    return jobEntry;
  }

  function cancelFeatureJobs(
    api: unknown,
    runtime: JobRuntime,
    activeJobs: JobEntry[],
    requestId: string,
    resolveFeatureStage: string | ((job: JobEntry) => string)
  ) {
    return Promise.all(
      activeJobs.map(async function (job) {
        await cancelRoomTool(roomId, job.jobId, requestId);
        pushJobState(api, {
          requestId,
          jobId: job.jobId,
          action: job.action,
          projectId: job.projectId,
          toolId: job.toolId,
          featureStage:
            typeof resolveFeatureStage === "function"
              ? resolveFeatureStage(job)
              : resolveFeatureStage,
          stage: "cancelled",
          message: "Cancelled by operator.",
        });
        clearJob(runtime, job.jobId);
      })
    );
  }

  function getActiveProfileJobs(
    runtime: JobRuntime,
    projectId: string,
    actionId: string | undefined
  ) {
    return collectJobs(runtime, function (job) {
      return (
        job.projectId === projectId &&
        String(job.action ?? "").startsWith("profile-") &&
        (actionId ? job.action === actionId : true)
      );
    });
  }

  function ensureProfileJobSlotAvailable(
    runtime: JobRuntime,
    projectId: string,
    actionId: string | undefined
  ) {
    if (getActiveProfileJobs(runtime, projectId, actionId).length > 0) {
      throw new Error(
        "This profile job is already running. Cancel it before starting another one."
      );
    }
  }

  async function cancelProfileJobsForProject(
    api: unknown,
    runtime: JobRuntime,
    projectId: string,
    requestId: string,
    actionId: string | undefined
  ) {
    const activeJobs = getActiveProfileJobs(runtime, projectId, actionId);
    await cancelFeatureJobs(api, runtime, activeJobs, requestId, "profile");
    return activeJobs;
  }

  function getActiveEditJobs(runtime: JobRuntime, projectId: string, actionId: string | undefined) {
    return collectJobs(runtime, function (job) {
      return (
        job.projectId === projectId &&
        String(job.action ?? "").startsWith("edit-") &&
        (actionId ? job.action === actionId : true)
      );
    });
  }

  function ensureEditJobSlotAvailable(
    runtime: JobRuntime,
    projectId: string,
    actionId: string | undefined
  ) {
    if (getActiveEditJobs(runtime, projectId, actionId).length > 0) {
      throw new Error("This edit job is already running. Cancel it before starting another one.");
    }
  }

  async function cancelEditJobsForProject(
    api: unknown,
    runtime: JobRuntime,
    projectId: string,
    requestId: string,
    actionId: string | undefined
  ) {
    const activeJobs = getActiveEditJobs(runtime, projectId, actionId);
    await cancelFeatureJobs(api, runtime, activeJobs, requestId, "edit");
    return activeJobs;
  }

  function getActiveProcessJobs(
    runtime: JobRuntime,
    projectId: string,
    actionId: string | undefined
  ) {
    return collectJobs(runtime, function (job) {
      return (
        job.projectId === projectId &&
        (String(job.action ?? "").startsWith("process-") ||
          String(job.action ?? "").startsWith("audio-process-")) &&
        (actionId ? job.action === actionId : true)
      );
    });
  }

  function ensureProcessJobSlotAvailable(
    runtime: JobRuntime,
    projectId: string,
    actionId: string | undefined
  ) {
    if (getActiveProcessJobs(runtime, projectId, actionId).length > 0) {
      throw new Error(
        "This process job is already running. Cancel it before starting another one."
      );
    }
  }

  async function cancelProcessJobsForProject(
    api: unknown,
    runtime: JobRuntime,
    projectId: string,
    requestId: string,
    actionId: string | undefined
  ) {
    const activeJobs = getActiveProcessJobs(runtime, projectId, actionId);
    await cancelFeatureJobs(api, runtime, activeJobs, requestId, "process");
    return activeJobs;
  }

  function getActiveReportJobs(
    runtime: JobRuntime,
    projectId: string,
    actionId: string | undefined
  ) {
    return collectJobs(runtime, function (job) {
      return (
        job.projectId === projectId &&
        (String(job.action ?? "").startsWith("report-") ||
          String(job.action ?? "").startsWith("audio-report-")) &&
        (actionId ? job.action === actionId : true)
      );
    });
  }

  function ensureReportJobSlotAvailable(
    runtime: JobRuntime,
    projectId: string,
    actionId: string | undefined
  ) {
    if (getActiveReportJobs(runtime, projectId, actionId).length > 0) {
      throw new Error("This report job is already running. Wait for it or cancel it first.");
    }
  }

  return {
    cancelJobById,
    cancelEditJobsForProject,
    cancelProcessJobsForProject,
    cancelProfileJobsForProject,
    ensureEditJobSlotAvailable,
    ensureProcessJobSlotAvailable,
    ensureProfileJobSlotAvailable,
    ensureReportJobSlotAvailable,
  };
}
