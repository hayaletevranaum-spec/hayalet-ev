import { asLabRecord } from "../../domain/lab-types.js";
import type { LabStoreEvent, LabStoreState } from "../../domain/lab-types.js";
import { normalizeLabPreflight } from "../../services/preflight-service.js";
import { createIdlePreflight } from "./lab-store-defaults.js";
import { ensurePendingRun } from "./lab-store-run-sync.js";
import {
  clearAnalysisPreparationSelection,
  updateTrackedProjectImportProbe,
} from "./lab-store-sync.js";

export function reduceLabProcessEvent(state: LabStoreState, event: LabStoreEvent): boolean {
  switch (event.type) {
    case "source-probe-started":
      state.sourceProbeStatus = "running";
      updateTrackedProjectImportProbe(state, event.action, "running");
      return true;
    case "source-probe-progress":
      state.sourceProbeStatus = "running";
      updateTrackedProjectImportProbe(state, event.action, "running");
      return true;
    case "source-probe-completed":
      state.sourceProbeStatus = "completed";
      updateTrackedProjectImportProbe(state, event.action, "completed");
      state.ui.workspace = {
        ...state.ui.workspace,
        sourceIntakeCollapsed: true,
      };
      return true;
    case "source-probe-failed":
      state.sourceProbeStatus = "failed";
      updateTrackedProjectImportProbe(state, event.action, "completed");
      state.ui.workspace = {
        ...state.ui.workspace,
        sourceIntakeCollapsed: false,
      };
      return true;
    case "preview-started":
    case "preview-progress": {
      if (state.editConfig) {
        const preview = asLabRecord(state.editConfig["preview"]);
        preview["status"] = "running";
        if (event.type === "preview-progress" && typeof event.progress === "number") {
          preview["percent"] = event.progress;
        }
        state.editConfig = {
          ...state.editConfig,
          preview,
        };
      }
      return true;
    }
    case "preview-completed":
      if (state.editConfig) {
        const preview = asLabRecord(state.editConfig["preview"]);
        preview["status"] = "ready";
        preview["percent"] = 100;
        state.editConfig = {
          ...state.editConfig,
          preview,
        };
      }
      return true;
    case "preview-failed":
      if (state.editConfig) {
        const preview = asLabRecord(state.editConfig["preview"]);
        preview["status"] = "failed";
        state.editConfig = {
          ...state.editConfig,
          preview,
        };
      }
      return true;
    case "preflight-started":
      state.preflight = {
        ...(state.preflight || createIdlePreflight()),
        status: "idle",
        rawStatus: "running",
        reason: "Ön kontrol çalışıyor.",
      };
      return true;
    case "preflight-completed":
      state.preflight = normalizeLabPreflight(state.profileConfig);
      return true;
    case "preflight-failed":
      state.preflight = {
        ...(state.preflight || createIdlePreflight()),
        status: "blocked",
        rawStatus: "failed",
        stageReady: false,
        reason: event.detail || "Ön kontrol tamamlanamadı.",
      };
      return true;
    case "run-started":
      ensurePendingRun(state, event.action, event).state = "running";
      state.ui.analysisCancelPending = false;
      state.ui.analysisCancelRequestId = null;
      state.ui.workspace = {
        ...state.ui.workspace,
        userExploreToggle: false,
      };
      return true;
    case "run-cancelled":
      state.ui.analysisCancelPending = false;
      state.ui.analysisCancelRequestId = null;
      if (state.run) {
        state.run.state = "cancelled";
        state.run.endedAt = state.run.endedAt || Date.now();
        const activeModuleId = state.run.moduleOrder.find(function (moduleId) {
          const module = state.run?.modules[moduleId];
          return module?.status === "running" || module?.status === "queued";
        });
        if (activeModuleId) {
          const activeModule = state.run.modules[activeModuleId];
          if (activeModule) {
            activeModule.status = "cancelled";
          }
        }
      }
      clearAnalysisPreparationSelection(state);
      return true;
    case "run-failed":
      ensurePendingRun(state, event.action).state = "failed";
      state.ui.analysisCancelPending = false;
      state.ui.analysisCancelRequestId = null;
      if (state.run) {
        state.run.error = event.detail || state.run.error;
      }
      clearAnalysisPreparationSelection(state);
      return true;
    case "module-started":
    case "module-progress":
    case "module-finished":
    case "module-failed":
    case "module-skipped": {
      const run = ensurePendingRun(state, event.action);
      if (!run.modules[event.moduleId]) {
        run.modules[event.moduleId] = {
          id: event.moduleId,
          status: "queued",
          message: null,
          progress: null,
          progressMode: "none",
        };
        run.moduleOrder.push(event.moduleId);
      }
      const module = run.modules[event.moduleId];
      if (!module) {
        return true;
      }
      if (event.type === "module-started") {
        module.status = "running";
      } else if (event.type === "module-progress") {
        module.status = "running";
        if (typeof event.progress === "number") {
          module.progress = event.progress;
          module.progressMode = "measured";
        }
      } else if (event.type === "module-finished") {
        module.status = "completed";
        if (module.progressMode === "measured") {
          module.progress = 100;
        }
      } else if (event.type === "module-failed") {
        module.status = "failed";
      } else if (event.type === "module-skipped") {
        module.status = "skipped";
      }
      module.message = event.detail || module.message || null;
      return true;
    }
    default:
      return false;
  }
}
