interface MemoryItem {
  id: string;
  content: string;
}

interface MemorySearchResult {
  success: boolean;
  data?: {
    items: MemoryItem[];
  };
  error?: string;
}

interface MemoryMutationResult {
  success: boolean;
  error?: string;
}

interface MemoryDraftApi {
  memoryDelete?: (params: unknown) => Promise<MemoryMutationResult>;
  memorySearch?: (params: unknown) => Promise<MemorySearchResult>;
  memoryUpdate?: (params: unknown) => Promise<MemoryMutationResult>;
  memoryWrite?: (params: unknown) => Promise<MemoryMutationResult>;
}

const MEMORY_NAMESPACE = "rovo-interactions";
const memoryIdsByCardId = new Map<string, string>();

function getMemoryApi(): MemoryDraftApi | null {
  return typeof window !== "undefined" ? (window.electronAPI as unknown as MemoryDraftApi) : null;
}

function buildDraftTags(cardId: string): string[] {
  return ["interaction-draft", "plan-harder-local", `card:${cardId}`];
}

function safeParseDraft(content: string): Record<string, string> | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const answers = (parsed as Record<string, unknown>)["answers"];
    if (answers === null || typeof answers !== "object" || Array.isArray(answers)) {
      return null;
    }

    const normalizedAnswers: Record<string, string> = {};
    for (const [key, value] of Object.entries(answers as Record<string, unknown>)) {
      const normalizedKey = key.trim();
      if (normalizedKey === "") {
        continue;
      }

      normalizedAnswers[normalizedKey] = typeof value === "string" ? value : "";
    }

    return normalizedAnswers;
  } catch {
    return null;
  }
}

async function findExistingDraft(
  cardId: string
): Promise<{ id: string; answers: Record<string, string> } | null> {
  try {
    const api = getMemoryApi();
    if (api === null || typeof api.memorySearch !== "function") {
      return null;
    }

    const result = await api.memorySearch({
      namespace: MEMORY_NAMESPACE,
      tags: buildDraftTags(cardId),
      limit: 1,
    });

    if (result.success !== true || result.data === undefined) {
      return null;
    }

    const item = result.data.items[0];
    if (item == null || typeof item.id !== "string" || typeof item.content !== "string") {
      return null;
    }

    const answers = safeParseDraft(item.content);
    if (answers === null) {
      return null;
    }

    memoryIdsByCardId.set(cardId, item.id);
    return { id: item.id, answers };
  } catch {
    return null;
  }
}

export async function loadPlanHarderLocalDraft(
  cardId: string
): Promise<Record<string, string> | null> {
  const existing = await findExistingDraft(cardId);
  return existing?.answers ?? null;
}

export async function savePlanHarderLocalDraft(
  cardId: string,
  answers: Record<string, string>
): Promise<void> {
  try {
    const api = getMemoryApi();
    if (api === null) {
      return;
    }

    const content = JSON.stringify({
      cardId,
      answers,
      updatedAt: Date.now(),
    });

    const existingId = memoryIdsByCardId.get(cardId);
    if (existingId != null && typeof api.memoryUpdate === "function") {
      await api.memoryUpdate({
        id: existingId,
        content,
        summary: `Plan harder local draft ${cardId}`,
        tags: buildDraftTags(cardId),
      });
      return;
    }

    const existing = await findExistingDraft(cardId);
    if (existing !== null && typeof api.memoryUpdate === "function") {
      await api.memoryUpdate({
        id: existing.id,
        content,
        summary: `Plan harder local draft ${cardId}`,
        tags: buildDraftTags(cardId),
      });
      return;
    }

    if (typeof api.memoryWrite === "function") {
      const result = await api.memoryWrite({
        namespace: MEMORY_NAMESPACE,
        content,
        summary: `Plan harder local draft ${cardId}`,
        sourceProvider: "opencode-ui",
        memoryType: "note",
        importance: 2,
        tags: buildDraftTags(cardId),
      });

      if (result.success === true) {
        const refreshed = await findExistingDraft(cardId);
        if (refreshed !== null) {
          memoryIdsByCardId.set(cardId, refreshed.id);
        }
      }
    }
  } catch {}
}

export async function deletePlanHarderLocalDraft(cardId: string): Promise<void> {
  try {
    const api = getMemoryApi();
    if (api === null || typeof api.memoryDelete !== "function") {
      return;
    }

    const existingId = memoryIdsByCardId.get(cardId);
    if (existingId != null) {
      await api.memoryDelete({ id: existingId });
      memoryIdsByCardId.delete(cardId);
      return;
    }

    const existing = await findExistingDraft(cardId);
    if (existing !== null) {
      await api.memoryDelete({ id: existing.id });
      memoryIdsByCardId.delete(cardId);
    }
  } catch {
    memoryIdsByCardId.delete(cardId);
  }
}
