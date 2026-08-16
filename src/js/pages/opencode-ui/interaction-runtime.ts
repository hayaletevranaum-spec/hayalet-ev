import { loadRovoInteractionActivationSnapshot } from "../../modules/rovo-interactions/activation.js";
import type { RovoInteractionActivationSnapshot } from "../../modules/rovo-interactions/types.js";

export interface RovoInteractionRuntimeActions {
  draftText: (text: string) => void;
  submitText: (text: string) => Promise<void>;
  showToast: (message: string) => void;
}

const inactiveSnapshot: RovoInteractionActivationSnapshot = {
  active: false,
  providerId: "opencode-ui",
  assistantAccountId: null,
  appMode: null,
  effectiveMode: null,
  assistantRuntimeMode: null,
  assistantRuntimePhase: null,
  opencodeServeRunning: false,
  reason: "Interaction runtime has not been initialized yet.",
};

let activationSnapshot: RovoInteractionActivationSnapshot = inactiveSnapshot;
let runtimeActions: RovoInteractionRuntimeActions | null = null;
let refreshTimerId: number | null = null;
let refreshInFlight: Promise<RovoInteractionActivationSnapshot> | null = null;
let windowFocusListenerBound = false;
let documentVisibilityListenerBound = false;

const ROVO_INTERACTION_REFRESH_INTERVAL_MS = 15000;

async function refreshActivationSnapshot(): Promise<RovoInteractionActivationSnapshot> {
  if (refreshInFlight !== null) {
    return await refreshInFlight;
  }

  refreshInFlight = loadRovoInteractionActivationSnapshot("opencode-ui")
    .then((snapshot) => {
      activationSnapshot = snapshot;
      return snapshot;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return await refreshInFlight;
}

function ensureRefreshLoop(): void {
  if (typeof window === "undefined") {
    return;
  }

  if (refreshTimerId !== null) {
    window.clearInterval(refreshTimerId);
  }

  refreshTimerId = window.setInterval(() => {
    void refreshActivationSnapshot();
  }, ROVO_INTERACTION_REFRESH_INTERVAL_MS);

  if (windowFocusListenerBound === false) {
    window.addEventListener("focus", () => {
      void refreshActivationSnapshot();
    });
    windowFocusListenerBound = true;
  }

  if (documentVisibilityListenerBound === false && typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        void refreshActivationSnapshot();
      }
    });
    documentVisibilityListenerBound = true;
  }
}

export async function initializeRovoInteractionRuntime(
  actions: RovoInteractionRuntimeActions
): Promise<void> {
  runtimeActions = actions;
  await refreshActivationSnapshot();
  ensureRefreshLoop();
}

export function getRovoInteractionActivationSnapshot(): RovoInteractionActivationSnapshot {
  return activationSnapshot;
}

export function getRovoInteractionRuntimeActions(): RovoInteractionRuntimeActions | null {
  return runtimeActions;
}

export async function refreshRovoInteractionRuntime(): Promise<RovoInteractionActivationSnapshot> {
  return await refreshActivationSnapshot();
}
