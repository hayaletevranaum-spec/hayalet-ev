import type { LabSourceRetryBlockReason } from "../domain/lab-types.js";
import type { LabI18n } from "./lab-context-i18n.js";

const SOURCE_RETRY_BLOCK_COPY: Record<
  LabSourceRetryBlockReason,
  { key: string; fallback: string }
> = {
  "active-run": {
    key: "mediaAnalysis.source.viewport.retryBlocked.activeRun",
    fallback: "Source retry is locked while an analysis is running.",
  },
  "not-failed": {
    key: "mediaAnalysis.source.viewport.retryBlocked.notFailed",
    fallback: "Retry is available only after source preparation fails.",
  },
  "missing-url": {
    key: "mediaAnalysis.source.viewport.retryBlocked.missingUrl",
    fallback: "A source URL is required.",
  },
  "missing-youtube-url": {
    key: "mediaAnalysis.source.viewport.retryBlocked.missingYoutubeUrl",
    fallback: "A YouTube URL is required.",
  },
  "missing-yt-dlp": {
    key: "mediaAnalysis.source.viewport.retryBlocked.missingYtDlp",
    fallback: "yt-dlp is required for YouTube retry.",
  },
  "local-reselect-required": {
    key: "mediaAnalysis.source.viewport.retryBlocked.localReselectRequired",
    fallback:
      "Local sources cannot be retried automatically. Choose the file again from the source panel.",
  },
};

export function formatSourceRetryBlockReason(reason: LabSourceRetryBlockReason, copy: LabI18n) {
  const entry = SOURCE_RETRY_BLOCK_COPY[reason];
  return copy.t(entry.key, entry.fallback);
}
