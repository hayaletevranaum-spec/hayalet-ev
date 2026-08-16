import { asLabRecord } from "../../domain/lab-types.js";
import type { LabAsset, LabStoreState, LabUserActionEvent } from "../../domain/lab-types.js";
import { normalizeAnalysisScope } from "../../shared/types/analysis-scope.js";
import { LAB_USER_ACTION_HISTORY_LIMIT } from "../lab-user-actions.js";
import { getAssetById, getCurrentRun } from "./lab-source-selectors.js";

export function getVisibleEvents(state: LabStoreState) {
  const feed = Array.isArray(state.run?.events)
    ? state.run.events.slice().sort(function (left, right) {
        return right.timestamp - left.timestamp;
      })
    : [];
  const windowSize = state.ui.eventFeedExpanded ? 40 : 18;
  const windowStart = state.ui.eventFeedExpanded ? state.ui.eventFeedCursor : 0;
  return Array.isArray(feed) ? feed.slice(windowStart, windowStart + windowSize) : [];
}

export function hasMoreVisibleEvents(state: LabStoreState) {
  const totalCount = Array.isArray(state.run?.events) ? state.run.events.length : 0;
  const windowSize = state.ui.eventFeedExpanded ? 40 : 18;
  const windowStart = state.ui.eventFeedExpanded ? state.ui.eventFeedCursor : 0;
  return totalCount > windowStart + windowSize;
}

export function getVisibleEventOffset(state: LabStoreState) {
  return state.ui.eventFeedExpanded ? state.ui.eventFeedCursor : 0;
}

export function getVisibleRawLogs(state: LabStoreState) {
  const rawLog = Array.isArray(state.run?.rawLog) ? state.run.rawLog : [];
  return Array.isArray(rawLog) ? rawLog.slice(0, state.ui.eventFeedExpanded ? 40 : 12) : [];
}

export function getGlobalActivityFeed(state: LabStoreState) {
  return Array.isArray(state.activityFeed) ? state.activityFeed.slice() : [];
}

export function getUserActions(state: LabStoreState): LabUserActionEvent[] {
  const activeProjectId = state.projectIndex.activeProjectId;
  const userActions = Array.isArray(state.userActions) ? state.userActions : [];
  if (activeProjectId === null) {
    return userActions.slice();
  }
  return userActions.filter(function (entry) {
    return entry.projectId === null || entry.projectId === activeProjectId;
  });
}

export function getRecentUserActions(state: LabStoreState, limit = 6): LabUserActionEvent[] {
  return getUserActions(state).slice(0, Math.min(limit, LAB_USER_ACTION_HISTORY_LIMIT));
}

export function getHubUserActions(state: LabStoreState, limit = 4): LabUserActionEvent[] {
  return getUserActions(state)
    .filter(function (entry) {
      return (
        entry.status === "running" || entry.status === "error" || entry.dismissedFromHubAt == null
      );
    })
    .slice(0, limit);
}

export function getActionOutputs(state: LabStoreState, actionId: string): LabAsset[] {
  const action = getUserActions(state).find(function (entry) {
    return entry.id === actionId;
  });
  if (
    !action ||
    Array.isArray(action.resultAssetIds) !== true ||
    action.resultAssetIds.length === 0
  ) {
    return [];
  }
  return action.resultAssetIds
    .map(function (assetId) {
      return getAssetById(state, assetId);
    })
    .filter((asset): asset is LabAsset => asset !== null);
}

export function getVisibleArtifacts(state: LabStoreState) {
  const run = getCurrentRun(state);
  const artifacts = Array.isArray(run?.artifacts) ? run.artifacts : [];
  if (!state.ui.artifactListExpanded) {
    return Array.isArray(artifacts) ? artifacts.slice(0, 12) : [];
  }
  return Array.isArray(artifacts) ? artifacts.slice(0, state.ui.artifactRenderCount) : [];
}

export function hasMoreVisibleArtifacts(state: LabStoreState) {
  const run = getCurrentRun(state);
  const artifacts = Array.isArray(run?.artifacts) ? run.artifacts : [];
  return artifacts.length > getVisibleArtifacts(state).length;
}

export function getProcessAnalysisScope(state: LabStoreState) {
  const run = getCurrentRun(state);
  return (
    run?.analysisScope || normalizeAnalysisScope(asLabRecord(state.workbench)["analysisScope"])
  );
}

export function getVisibleLiveFindings(state: LabStoreState) {
  const run = getCurrentRun(state);
  const findings = Array.isArray(run?.liveFindings) ? run.liveFindings : [];
  return Array.isArray(findings) ? findings.slice(0, state.ui.liveFindingsExpanded ? 18 : 6) : [];
}

export function hasMoreVisibleLiveFindings(state: LabStoreState) {
  const run = getCurrentRun(state);
  const findings = Array.isArray(run?.liveFindings) ? run.liveFindings : [];
  return findings.length > getVisibleLiveFindings(state).length;
}
