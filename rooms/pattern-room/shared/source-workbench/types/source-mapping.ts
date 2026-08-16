import type { PatternSourceType } from "../../types/pattern-room-domain.js";
import type { SourceKind } from "./source-kind.js";

export const SOURCE_KIND_TO_PATTERN_SOURCE_TYPE = {
  user_text: "personal_note",
  book: "book",
  article: "unknown",
  religious_text: "religious_text",
  newspaper: "newspaper",
  archive_text: "unknown",
  youtube_channel_subtitles: "subtitle_archive",
  video_subtitles: "subtitle_archive",
  subtitle_archive: "subtitle_archive",
  web_archive: "web_archive",
  laboratory_result: "laboratory_result",
  number_analysis: "number_analysis",
  personal_note: "personal_note",
} as const satisfies Record<SourceKind, PatternSourceType>;

export function mapSourceKindToPatternSourceType(sourceKind: SourceKind): PatternSourceType {
  return SOURCE_KIND_TO_PATTERN_SOURCE_TYPE[sourceKind];
}
