function extractRecordDetail(value: Record<string, unknown>, key: string): string {
  const candidate = value[key];
  return typeof candidate === "string" ? candidate.trim() : "";
}

export function normalizeErrorDetail(detail: unknown): string {
  if (typeof detail === "string") {
    return detail.trim();
  }

  if (detail instanceof Error) {
    return detail.message.trim();
  }

  if (detail != null && typeof detail === "object") {
    const record = detail as Record<string, unknown>;
    const directMessage = extractRecordDetail(record, "message");
    if (directMessage !== "") {
      return directMessage;
    }

    const directError = extractRecordDetail(record, "error");
    if (directError !== "") {
      return directError;
    }
  }

  return "";
}

function trimTrailingPunctuation(value: string): string {
  return value.replace(/[.:!?]\s*$/u, "").trim();
}

export function formatErrorWithDetail(baseMessage: string, detail?: unknown): string {
  const normalizedBase = baseMessage.trim();
  const normalizedDetail = normalizeErrorDetail(detail);

  if (normalizedBase === "") {
    return normalizedDetail;
  }

  if (normalizedDetail === "") {
    return normalizedBase;
  }

  const comparableBase = trimTrailingPunctuation(normalizedBase);
  const comparableDetail = trimTrailingPunctuation(normalizedDetail);

  if (
    comparableBase === comparableDetail ||
    normalizedBase.includes(normalizedDetail) ||
    normalizedDetail.includes(normalizedBase)
  ) {
    return normalizedBase.length >= normalizedDetail.length ? normalizedBase : normalizedDetail;
  }

  return `${normalizedBase}: ${normalizedDetail}`;
}
