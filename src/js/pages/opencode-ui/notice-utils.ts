import { t } from "./i18n.js";
import type { OpencodeUiMessageNotice } from "./types.js";

function normalizeErrorDetail(error: unknown): string {
  if (typeof error === "string") {
    return error.trim();
  }

  if (error instanceof Error) {
    return error.message.trim();
  }

  if (error == null) {
    return "";
  }

  return "";
}

function isLimitDetail(detail: string): boolean {
  return /((usage|rate) limit|quota|too many requests|limit has been reached|kullanım sınır|limit[ea] ulaşıldı)/iu.test(
    detail
  );
}

function isRetryingDetail(detail: string): boolean {
  return /(\bretry(?:ing)?\b|yeniden dene|yeniden deneniyor|tekrar dene)/iu.test(detail);
}

function isInterruptedDetail(detail: string): boolean {
  return /\b(interrupted|cancelled|canceled|aborted|stopped|kesildi|iptal edildi|durduruldu)\b/iu.test(
    detail
  );
}

export function buildRuntimeErrorNotice(
  error: unknown,
  options: {
    defaultTitleKey: string;
    defaultTone?: OpencodeUiMessageNotice["tone"];
  }
): OpencodeUiMessageNotice {
  const detail = normalizeErrorDetail(error);

  if (detail !== "" && isLimitDetail(detail)) {
    return {
      tone: "warning",
      title: t("message.runtimeNotice.limitTitle"),
      detail,
      ...(isRetryingDetail(detail) ? { meta: t("message.toolStateRetryMeta") } : {}),
    };
  }

  if (detail !== "" && isRetryingDetail(detail)) {
    return {
      tone: "warning",
      title: t("message.runtimeNotice.retryingTitle"),
      detail,
      meta: t("message.toolStateRetryMeta"),
    };
  }

  if (detail !== "" && isInterruptedDetail(detail)) {
    return {
      tone: "warning",
      title: t("message.runtimeNotice.interruptedTitle"),
      detail,
    };
  }

  return {
    tone: options.defaultTone ?? "error",
    title: t(options.defaultTitleKey),
    ...(detail !== "" ? { detail } : {}),
  };
}
