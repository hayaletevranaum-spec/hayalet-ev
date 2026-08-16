type LaboratoryJobStateRecord = {
  requestId: string | null;
  action: string;
  projectId: string | null;
  toolId: string | null;
  featureStage: string | null;
  operation: string | null;
  stage: "queued";
  percent: number | null;
  bytesReceived: number | null;
  bytesTotal: number | null;
  message: string | null;
};

type LaboratoryRuntimeWithJobs = {
  jobs: Record<string, LaboratoryJobStateRecord | undefined>;
};

type LaboratoryJobRegistrationOptions = {
  jobId: string;
  requestId?: string | null;
  action: string;
  projectId?: string | null;
  toolId?: string | null;
  featureStage?: string | null;
  operation?: string | null;
  message?: string | null;
};

type LaboratoryJobStateRuntimeDeps = {
  cancelRoomTool: (roomId: string, jobId: string, requestId: string) => Promise<unknown>;
  roomId: string;
};

type LaboratoryProjectCancelOptions = {
  actionIds?: string[];
};

export function createLaboratoryJobStateRuntime(deps: LaboratoryJobStateRuntimeDeps) {
  const { cancelRoomTool, roomId } = deps;

  function createRequestId() {
    return `lab-source-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function registerJob(
    runtime: LaboratoryRuntimeWithJobs,
    options: LaboratoryJobRegistrationOptions
  ): LaboratoryJobStateRecord {
    const nextJob: LaboratoryJobStateRecord = {
      requestId: options.requestId || null,
      action: options.action,
      projectId: options.projectId || null,
      toolId: options.toolId || null,
      featureStage: options.featureStage || null,
      operation: options.operation || null,
      stage: "queued",
      percent: null,
      bytesReceived: null,
      bytesTotal: null,
      message: options.message || null,
    };
    runtime.jobs[options.jobId] = nextJob;
    return nextJob;
  }

  function clearJob(runtime: LaboratoryRuntimeWithJobs, jobId: string): void {
    delete runtime.jobs[jobId];
  }

  async function cancelJobsForProject(
    runtime: LaboratoryRuntimeWithJobs,
    projectId: string,
    requestId: string,
    options: LaboratoryProjectCancelOptions = {}
  ): Promise<void> {
    const actionIds =
      Array.isArray(options.actionIds) && options.actionIds.length > 0
        ? new Set(options.actionIds)
        : null;
    const jobIds = Object.keys(runtime.jobs);
    for (let index = 0; index < jobIds.length; index += 1) {
      const jobId = jobIds[index];
      if (!jobId) {
        continue;
      }
      const job = runtime.jobs[jobId];
      if (job && job.projectId === projectId && (actionIds === null || actionIds.has(job.action))) {
        // eslint-disable-next-line no-await-in-loop -- NOTE: cancel tracked jobs in registration order.
        await cancelRoomTool(roomId, jobId, requestId);
        clearJob(runtime, jobId);
      }
    }
  }

  return {
    cancelJobsForProject,
    clearJob,
    createRequestId,
    registerJob,
  };
}
