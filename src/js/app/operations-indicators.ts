import { getErrorMessage } from "@shared/index.js";
import type {
  OperationCapability,
  OperationRecord,
  OperationsStatus,
} from "../../types/operations.js";
import { getOperationsStatus, onOperationsStatus } from "../modules/operations/electron-client.js";
import { openCompanionOperationSettings } from "../modules/companion/operation-settings-overlay.js";
import { notifyUser } from "../ui/user-notification.js";

interface OperationsIndicatorSpec {
  id: string;
  label: string;
  capabilities: OperationCapability[];
}

let hasBoundCompanionSettingsButton = false;

const OPERATION_INDICATORS: OperationsIndicatorSpec[] = [
  {
    id: "android",
    label: "Android",
    capabilities: [
      "android-microphone",
      "android-camera",
      "android-tts",
      "android-torch",
      "ambient-listening",
      "live-feed",
    ],
  },
  {
    id: "mic",
    label: "Mic",
    capabilities: ["local-microphone", "android-microphone"],
  },
  {
    id: "camera",
    label: "Camera",
    capabilities: ["android-camera"],
  },
  {
    id: "tts",
    label: "TTS",
    capabilities: ["local-tts", "android-tts"],
  },
  {
    id: "ambient",
    label: "Ambient",
    capabilities: ["ambient-listening"],
  },
  {
    id: "live",
    label: "Live",
    capabilities: ["live-feed"],
  },
  {
    id: "torch",
    label: "Torch",
    capabilities: ["android-torch"],
  },
];

function formatStartedAt(startedAt: number): string {
  const date = new Date(startedAt);
  if (Number.isFinite(date.getTime()) !== true) {
    return "";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function readMatchingRecords(
  records: OperationRecord[],
  capabilities: OperationCapability[]
): OperationRecord[] {
  const capabilitySet = new Set<OperationCapability>(capabilities);
  return records.filter((record) => capabilitySet.has(record.capability));
}

function formatTitle(spec: OperationsIndicatorSpec, records: OperationRecord[]): string {
  if (records.length === 0) {
    return `${spec.label}: idle`;
  }

  return records
    .map((record) => {
      const startedAt = formatStartedAt(record.startedAt);
      const suffix = startedAt !== "" ? ` since ${startedAt}` : "";
      return `${record.capability}: ${record.owner.label}${suffix}`;
    })
    .join("\n");
}

function renderOperationsStatus(status: OperationsStatus): void {
  const strip = document.getElementById("topbar-operations-strip");
  if (!(strip instanceof HTMLElement)) {
    return;
  }

  let activeCount = 0;
  for (const spec of OPERATION_INDICATORS) {
    const item = document.getElementById(`operation-indicator-${spec.id}`);
    const dot = document.getElementById(`operation-indicator-${spec.id}-dot`);
    if (!(item instanceof HTMLElement) || !(dot instanceof HTMLElement)) {
      continue;
    }

    const records = readMatchingRecords(status.records, spec.capabilities);
    const isActive = records.length > 0;
    activeCount += isActive ? 1 : 0;
    item.classList.toggle("is-active", isActive);
    dot.classList.toggle("is-active", isActive);
    item.title = formatTitle(spec, records);
  }

  strip.classList.toggle("is-active", activeCount > 0);
  strip.dataset["activeCount"] = String(activeCount);
}

function setupCompanionSettingsButton(): void {
  if (hasBoundCompanionSettingsButton) {
    return;
  }

  const button = document.getElementById(
    "topbar-companion-settings-btn"
  ) as HTMLButtonElement | null;
  if (button === null) {
    return;
  }

  hasBoundCompanionSettingsButton = true;
  button.addEventListener("click", () => {
    if (button.classList.contains("is-active")) {
      return;
    }

    button.classList.add("is-active");
    button.setAttribute("aria-expanded", "true");
    void openCompanionOperationSettings({
      onClose: () => {
        button.classList.remove("is-active");
        button.setAttribute("aria-expanded", "false");
      },
    }).catch((error: unknown) => {
      button.classList.remove("is-active");
      button.setAttribute("aria-expanded", "false");
      notifyUser({
        kind: "error",
        title: `Companion settings could not be opened: ${getErrorMessage(error)}`,
        dedupeKey: "topbar-companion-settings-open-error",
      });
    });
  });
}

export function setupOperationsIndicators(): void {
  const strip = document.getElementById("topbar-operations-strip");
  setupCompanionSettingsButton();
  if (!(strip instanceof HTMLElement)) {
    return;
  }

  void getOperationsStatus()
    .then(renderOperationsStatus)
    .catch(() => {
      renderOperationsStatus({ records: [], updatedAt: 0 });
    });
  onOperationsStatus(renderOperationsStatus);
}
