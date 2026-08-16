import { createLabEventId } from "../domain/lab-types.js";
import type { LabEventFeedItem, LabEventScope } from "../domain/lab-types.js";

type ParseProcessOutputContext = {
  action?: string | null;
  moduleId?: string | null;
  scope?: LabEventScope;
  stream?: "stdout" | "stderr";
};

function createSemanticEvent(
  message: string,
  detail: string | null,
  context: ParseProcessOutputContext,
  overrides: Partial<LabEventFeedItem> = {}
): LabEventFeedItem {
  return {
    id: createLabEventId("proc"),
    kind: "activity",
    severity: context.stream === "stderr" ? "warning" : "info",
    message,
    detail,
    timestamp: Date.now(),
    source: "host",
    action: context.action || null,
    stage: context.stream || null,
    scope: context.scope || "run",
    moduleId: context.moduleId || null,
    rawLine: detail,
    ...overrides,
  };
}

export function parseProcessOutput(
  line: string,
  context: ParseProcessOutputContext = {}
): LabEventFeedItem | null {
  const normalizedLine = line.trim();
  if (normalizedLine === "") {
    return null;
  }

  const frameMatch = normalizedLine.match(/\bframe=\s*(\d+)/i);
  if (frameMatch) {
    return createSemanticEvent("Kare analizi aktif", `${frameMatch[1]} kare incelendi`, {
      ...context,
      moduleId: context.moduleId || "motion",
    });
  }

  if (/blackdetect/i.test(normalizedLine)) {
    const message = /black_start|black_end|black_duration/i.test(normalizedLine)
      ? "Siyah sahne segmenti bulundu"
      : "Siyah sahne tespiti calisiyor";
    return createSemanticEvent(message, normalizedLine, {
      ...context,
      moduleId: context.moduleId || "motion",
    });
  }

  if (/freeze/i.test(normalizedLine)) {
    const message = /freeze_start|freeze_end|freeze_duration/i.test(normalizedLine)
      ? "Freeze segmenti bulundu"
      : "Freeze analizi calisiyor";
    return createSemanticEvent(message, normalizedLine, {
      ...context,
      moduleId: context.moduleId || "motion",
    });
  }

  if (/silence_(start|end|duration)/i.test(normalizedLine)) {
    return createSemanticEvent("Sessizlik segmenti bulundu", normalizedLine, {
      ...context,
      moduleId: context.moduleId || "audio",
    });
  }

  const downloadMatch = normalizedLine.match(/\[download\]\s+(\d{1,3}(?:\.\d+)?)%/i);
  if (downloadMatch) {
    return createSemanticEvent("Kaynak indiriliyor", `${downloadMatch[1]}% tamamlandi`, {
      ...context,
      scope: context.scope || "global",
    });
  }

  if (/Destination:/i.test(normalizedLine)) {
    return createSemanticEvent("Kaynak dosyasi yaziliyor", normalizedLine, {
      ...context,
      scope: context.scope || "global",
    });
  }

  if (/Merging formats into/i.test(normalizedLine)) {
    return createSemanticEvent("Kaynak birlestiriliyor", normalizedLine, {
      ...context,
      scope: context.scope || "global",
    });
  }

  if (/Press \[q\] to stop/i.test(normalizedLine)) {
    return createSemanticEvent("Arac cikisi akiyor", normalizedLine, context);
  }

  if (/Opening|Analyzing|Stream mapping/i.test(normalizedLine)) {
    return createSemanticEvent("Arac cikisi isleniyor", normalizedLine, context);
  }

  if (/error|failed|no such file/i.test(normalizedLine)) {
    return createSemanticEvent("Arac cikisi hata bildirdi", normalizedLine, context, {
      severity: "error",
    });
  }

  return null;
}
