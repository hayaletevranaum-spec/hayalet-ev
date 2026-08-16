import { asLabRecord, asNonEmptyString, createLabFeatureMeta } from "../../domain/lab-types.js";
import type { LabFeatureId, LabRecord, LabStoreState } from "../../domain/lab-types.js";

export function getSnapshot(state: LabStoreState): LabRecord {
  return state.snapshot || {};
}

export function getActiveProject(state: LabStoreState): LabRecord | null {
  const snapshotProject = asLabRecord(getSnapshot(state)["activeProject"]);
  if (Object.keys(snapshotProject).length > 0) {
    return snapshotProject;
  }
  if (state.source || state.editConfig || state.profileConfig) {
    return {
      id: state.projectIndex.activeProjectId,
      source: state.source,
      edit: state.editConfig,
      profile: state.profileConfig,
    };
  }
  return null;
}

export function getProjects(state: LabStoreState): LabRecord[] {
  return state.projectIndex.projects;
}

export function getCurrentFeatureId(state: LabStoreState): LabFeatureId {
  const activeModuleId = asNonEmptyString(state.workbench["activeModuleId"]);
  return (activeModuleId as LabFeatureId) || state.featureId;
}

export function getCurrentFeatureMeta(state: LabStoreState) {
  return createLabFeatureMeta(getCurrentFeatureId(state));
}

export function getProjectSource(state: LabStoreState): LabRecord {
  return asLabRecord(state.source);
}

export function getProjectEdit(state: LabStoreState): LabRecord {
  return asLabRecord(state.editConfig);
}

export function getProjectProfile(state: LabStoreState): LabRecord {
  return asLabRecord(state.profileConfig);
}

export function getCurrentFeatureProcessRecord(state: LabStoreState): LabRecord {
  const activeProject = getActiveProject(state);
  if (!activeProject) {
    return {};
  }
  const process = asLabRecord(activeProject["process"]);
  return asLabRecord(asLabRecord(process["records"])[getCurrentFeatureId(state)]);
}

export function getCurrentFeatureReportRecord(state: LabStoreState): LabRecord {
  const activeProject = getActiveProject(state);
  if (!activeProject) {
    return {};
  }
  const report = asLabRecord(activeProject["report"]);
  return asLabRecord(asLabRecord(report["records"])[getCurrentFeatureId(state)]);
}
