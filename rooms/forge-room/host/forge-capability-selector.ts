import {
  FORGE_CAPABILITY_SUMMARY_BUDGET,
  FORGE_MAX_CAPABILITY_ITEMS,
  FORGE_ROOM_ID,
} from "../shared/forge-constants.js";
import type {
  ForgeCapabilityContext,
  ForgeCapabilityDescriptor,
  ForgeCapabilityTag,
  ForgeGoal,
} from "../shared/types/index.js";
import { uniqueStrings } from "./forge-runtime-support.js";

function truncateText(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function inferTags(goal: ForgeGoal): ForgeCapabilityTag[] {
  const haystack = `${goal.summary} ${goal.brief} ${goal.constraints.join(" ")}`.toLowerCase();
  const tags: ForgeCapabilityTag[] = [];

  if (/(camera|photo|image|visual|frame|screenshot)/.test(haystack)) {
    tags.push("camera", "image");
  }
  if (/(archive|export|handoff|package|json|artifact)/.test(haystack)) {
    tags.push("archive");
  }
  if (/(protocol|command|prompt|slot|relay|seat|agent)/.test(haystack)) {
    tags.push("protocol", "relay");
  }
  if (/(ui|panel|workbench|screen|view)/.test(haystack)) {
    tags.push("ui");
  }
  if (/(storage|session|persist|local file|file-backed)/.test(haystack)) {
    tags.push("storage");
  }
  if (
    goal.targetRoomId.trim() !== "" ||
    /(target room|downstream|implementation|handoff target)/.test(haystack)
  ) {
    tags.push("target-room");
  }

  return uniqueStrings(tags) as ForgeCapabilityTag[];
}

function scoreCapability(
  item: ForgeCapabilityDescriptor,
  selectedTags: ForgeCapabilityTag[],
  targetRoomId: string
): number {
  const tagMatches = item.tags.filter((tag) => selectedTags.includes(tag)).length;
  const roomMatch = item.roomIds.includes(targetRoomId) ? 3 : 0;
  const forgeRoomMatch = item.roomIds.includes(FORGE_ROOM_ID) ? 1 : 0;
  return tagMatches * 4 + roomMatch + forgeRoomMatch;
}

function buildSummary(items: ForgeCapabilityDescriptor[], omittedCount: number): string {
  const lines = items.map((item) => `${item.title}: ${item.summary}`);
  if (omittedCount > 0) {
    lines.push(
      `${String(omittedCount)} additional capability item(s) were omitted to keep prompts compact.`
    );
  }
  return truncateText(lines.join(" "), FORGE_CAPABILITY_SUMMARY_BUDGET);
}

export function selectForgeCapabilityContext(params: {
  descriptors: ForgeCapabilityDescriptor[];
  goal: ForgeGoal;
  maxItems?: number;
  sizeBudget?: number;
}): ForgeCapabilityContext | null {
  const { descriptors, goal } = params;
  const maxItems = Math.max(1, params.maxItems ?? FORGE_MAX_CAPABILITY_ITEMS);
  const sizeBudget = Math.max(240, params.sizeBudget ?? FORGE_CAPABILITY_SUMMARY_BUDGET);
  const selectedTags = inferTags(goal);
  const ranked = descriptors
    .map((item) => ({
      item,
      score: scoreCapability(item, selectedTags, goal.targetRoomId),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.item.id.localeCompare(right.item.id));

  if (ranked.length === 0) {
    return null;
  }

  const items = ranked.slice(0, maxItems).map((entry) => entry.item);
  return {
    items,
    omittedCount: Math.max(0, ranked.length - items.length),
    selectedTags,
    sizeBudget,
    summary: truncateText(
      buildSummary(items, Math.max(0, ranked.length - items.length)),
      sizeBudget
    ),
  };
}
