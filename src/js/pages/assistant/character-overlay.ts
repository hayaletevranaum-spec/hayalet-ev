// NOTE: Opened from the assistant page; writes selected features to .rovo/_metadata/CHARACTER.md.
import type { AppLanguage, TranslationCatalog } from "@shared/i18n.js";
import { AppI18n } from "../../modules/i18n/index.js";
import { translateCatalog } from "../../../../shared/i18n/catalog.js";
import type { ManagedOverlayController } from "../../ui/overlay-system.js";
import { createSharedAssistantToolOverlayController } from "../../ui/overlay-presets.js";
import { loadBuiltInLanguagePack } from "../../modules/i18n/built-in-loader.js";
import {
  patchOpencodeUiSharedState,
  readOpencodeUiSharedState,
} from "../../modules/opencode-ui-shared-state.js";
import type {
  OpencodeUiCharacterProfileState,
  OpencodeUiCharacterProfilesState,
} from "../../../../shared/opencode-ui-state.js";

interface CharacterFeature {
  id: string;
  translationKey: string;
  categoryId: string;
}

interface CharacterCategory {
  id: string;
  translationKey: string;
  icon: string;
  features: CharacterFeature[];
}

interface ConflictPair {
  a: string;
  b: string;
}

function characterT(key: string, params?: Record<string, string | number>): string {
  return AppI18n.t(`shell.assistant.characterOverlay.${key}`, params);
}

const PROFILE_LABEL_LOCALES: AppLanguage[] = ["tr", "en"];
const EMPTY_PROFILE_HINT_PATTERN =
  /> \*(Henüz bir profil tanımlanmadı\..*?|No profile has been defined yet\..*?)\*/;
const LAST_UPDATED_PATTERN = /\*\*(Son güncelleme|Last updated):\*\* .*/;

function translateCharacterCatalogKey(key: string): string {
  return characterT(key);
}

function getCategoryLabel(category: CharacterCategory): string {
  return translateCharacterCatalogKey(category.translationKey);
}

function getFeatureLabel(feature: CharacterFeature): string {
  return translateCharacterCatalogKey(feature.translationKey);
}

function normalizeProfileLabel(label: string): string {
  return label.trim().toLocaleLowerCase("tr-TR");
}

const CATEGORIES: CharacterCategory[] = [
  {
    id: "tone",
    translationKey: "categories.tone",
    icon: "🗣️",
    features: [
      { id: "tone-formal", translationKey: "features.toneFormal", categoryId: "tone" },
      { id: "tone-semiformal", translationKey: "features.toneSemiformal", categoryId: "tone" },
      { id: "tone-friendly", translationKey: "features.toneFriendly", categoryId: "tone" },
      { id: "tone-casual", translationKey: "features.toneCasual", categoryId: "tone" },
      { id: "tone-emoji-lots", translationKey: "features.toneEmojiLots", categoryId: "tone" },
      { id: "tone-emoji-few", translationKey: "features.toneEmojiFew", categoryId: "tone" },
      { id: "tone-emoji-none", translationKey: "features.toneEmojiNone", categoryId: "tone" },
      {
        id: "tone-humor-sometimes",
        translationKey: "features.toneHumorSometimes",
        categoryId: "tone",
      },
      { id: "tone-humor-none", translationKey: "features.toneHumorNone", categoryId: "tone" },
    ],
  },
  {
    id: "style",
    translationKey: "categories.style",
    icon: "📝",
    features: [
      { id: "style-direct", translationKey: "features.styleDirect", categoryId: "style" },
      {
        id: "style-stepbystep",
        translationKey: "features.styleStepByStep",
        categoryId: "style",
      },
      { id: "style-code-first", translationKey: "features.styleCodeFirst", categoryId: "style" },
      {
        id: "style-explain-first",
        translationKey: "features.styleExplainFirst",
        categoryId: "style",
      },
      {
        id: "style-alternatives",
        translationKey: "features.styleAlternatives",
        categoryId: "style",
      },
      { id: "style-best-only", translationKey: "features.styleBestOnly", categoryId: "style" },
      {
        id: "style-ask-unclear",
        translationKey: "features.styleAskUnclear",
        categoryId: "style",
      },
      { id: "style-assume", translationKey: "features.styleAssume", categoryId: "style" },
    ],
  },
  {
    id: "proactivity",
    translationKey: "categories.proactivity",
    icon: "⚡",
    features: [
      { id: "pro-minimal", translationKey: "features.proMinimal", categoryId: "proactivity" },
      { id: "pro-risks", translationKey: "features.proRisks", categoryId: "proactivity" },
      { id: "pro-suggest", translationKey: "features.proSuggest", categoryId: "proactivity" },
      {
        id: "pro-fullanalysis",
        translationKey: "features.proFullAnalysis",
        categoryId: "proactivity",
      },
    ],
  },
  {
    id: "detail",
    translationKey: "categories.detail",
    icon: "🔍",
    features: [
      { id: "detail-minimal", translationKey: "features.detailMinimal", categoryId: "detail" },
      { id: "detail-normal", translationKey: "features.detailNormal", categoryId: "detail" },
      { id: "detail-verbose", translationKey: "features.detailVerbose", categoryId: "detail" },
    ],
  },
  {
    id: "language",
    translationKey: "categories.language",
    icon: "🌐",
    features: [
      { id: "lang-turkish", translationKey: "features.langTurkish", categoryId: "language" },
      { id: "lang-mixed", translationKey: "features.langMixed", categoryId: "language" },
      { id: "lang-english", translationKey: "features.langEnglish", categoryId: "language" },
    ],
  },
  {
    id: "focus",
    translationKey: "categories.focus",
    icon: "🎯",
    features: [
      { id: "focus-frontend", translationKey: "features.focusFrontend", categoryId: "focus" },
      { id: "focus-backend", translationKey: "features.focusBackend", categoryId: "focus" },
      { id: "focus-fullstack", translationKey: "features.focusFullstack", categoryId: "focus" },
      {
        id: "focus-typescript",
        translationKey: "features.focusTypescript",
        categoryId: "focus",
      },
      {
        id: "focus-performance",
        translationKey: "features.focusPerformance",
        categoryId: "focus",
      },
      { id: "focus-security", translationKey: "features.focusSecurity", categoryId: "focus" },
      { id: "focus-ux", translationKey: "features.focusUx", categoryId: "focus" },
    ],
  },
  {
    id: "personality",
    translationKey: "categories.personality",
    icon: "🧩",
    features: [
      {
        id: "pers-mentor",
        translationKey: "features.personalityMentor",
        categoryId: "personality",
      },
      {
        id: "pers-partner",
        translationKey: "features.personalityPartner",
        categoryId: "personality",
      },
      {
        id: "pers-critic",
        translationKey: "features.personalityCritic",
        categoryId: "personality",
      },
      {
        id: "pers-pragmatic",
        translationKey: "features.personalityPragmatic",
        categoryId: "personality",
      },
      {
        id: "pers-assistant",
        translationKey: "features.personalityAssistant",
        categoryId: "personality",
      },
    ],
  },
];

const FEATURE_MAP = new Map<string, CharacterFeature>();
const FEATURE_LABEL_INDEX = new Map<string, string>();
let featureLabelIndexPromise: Promise<void> | null = null;

async function ensureFeatureLabelIndex(): Promise<void> {
  if (featureLabelIndexPromise !== null) {
    await featureLabelIndexPromise;
    return;
  }

  featureLabelIndexPromise = (async (): Promise<void> => {
    const fallbackCatalog = (await loadBuiltInLanguagePack("en"))?.catalog;
    const localeCatalogs = new Map<AppLanguage, TranslationCatalog>();

    await Promise.all(
      PROFILE_LABEL_LOCALES.map(async (locale) => {
        const pack = await loadBuiltInLanguagePack(locale);
        if (pack !== null) {
          localeCatalogs.set(locale, pack.catalog);
        }
      })
    );

    for (const category of CATEGORIES) {
      for (const feature of category.features) {
        for (const locale of PROFILE_LABEL_LOCALES) {
          const catalog = localeCatalogs.get(locale);
          if (catalog === undefined) {
            continue;
          }

          FEATURE_LABEL_INDEX.set(
            normalizeProfileLabel(
              translateCatalog(
                catalog,
                `shell.assistant.characterOverlay.${feature.translationKey}`,
                undefined,
                fallbackCatalog
              )
            ),
            feature.id
          );
        }
      }
    }
  })();

  await featureLabelIndexPromise;
}

for (const cat of CATEGORIES) {
  for (const f of cat.features) {
    FEATURE_MAP.set(f.id, f);
    FEATURE_LABEL_INDEX.set(normalizeProfileLabel(f.id), f.id);
  }
}

const CONFLICTS: ConflictPair[] = [
  { a: "style-direct", b: "style-stepbystep" },
  { a: "style-code-first", b: "style-explain-first" },
  { a: "style-alternatives", b: "style-best-only" },
  { a: "style-ask-unclear", b: "style-assume" },
  { a: "detail-minimal", b: "detail-normal" },
  { a: "detail-minimal", b: "detail-verbose" },
  { a: "detail-normal", b: "detail-verbose" },
  { a: "pro-minimal", b: "pro-suggest" },
  { a: "pro-minimal", b: "pro-fullanalysis" },
  { a: "tone-formal", b: "tone-casual" },
  { a: "tone-formal", b: "tone-friendly" },
  { a: "lang-turkish", b: "lang-english" },
  { a: "lang-mixed", b: "lang-english" },
  { a: "tone-emoji-lots", b: "tone-emoji-none" },
  { a: "tone-emoji-few", b: "tone-emoji-lots" },
  { a: "tone-emoji-few", b: "tone-emoji-none" },
];

const CHARACTER_MD_PATH = ".rovo/_metadata/CHARACTER.md";
const utf8Decoder = new TextDecoder();

function decodeBase64Utf8(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return utf8Decoder.decode(bytes);
}

function cloneCharacterProfilesState(
  state: OpencodeUiCharacterProfilesState
): OpencodeUiCharacterProfilesState {
  return {
    activeProfileId: state.activeProfileId,
    profiles: state.profiles.map((profile) => ({
      ...profile,
      selectedFeatureIds: [...profile.selectedFeatureIds],
    })),
  };
}

function createProfileId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `character-profile-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }
}

function normalizeFeatureIds(featureIds: string[]): string[] {
  const unique = new Set<string>();
  featureIds.forEach((featureId) => {
    if (FEATURE_MAP.has(featureId)) {
      unique.add(featureId);
    }
  });
  return Array.from(unique);
}

function buildProfileName(index: number, rawName?: string): string {
  const normalized = rawName?.trim() ?? "";
  if (normalized !== "") {
    return normalized;
  }

  return index === 0
    ? characterT("defaultProfileName")
    : characterT("newProfileName", { index: index + 1 });
}

function createCharacterProfile(
  index: number,
  seed: Partial<OpencodeUiCharacterProfileState> = {}
): OpencodeUiCharacterProfileState {
  const createdAt = typeof seed.createdAt === "number" ? seed.createdAt : Date.now();
  const updatedAt = typeof seed.updatedAt === "number" ? seed.updatedAt : createdAt;
  return {
    id: typeof seed.id === "string" && seed.id.trim() !== "" ? seed.id.trim() : createProfileId(),
    name: typeof seed.name === "string" ? seed.name : buildProfileName(index),
    description: typeof seed.description === "string" ? seed.description : "",
    selectedFeatureIds: normalizeFeatureIds(
      Array.isArray(seed.selectedFeatureIds) ? seed.selectedFeatureIds : []
    ),
    createdAt,
    updatedAt,
  };
}

function createFallbackProfilesState(
  selectedFeatureIds: string[] = []
): OpencodeUiCharacterProfilesState {
  const profile = createCharacterProfile(0, { selectedFeatureIds });
  return {
    activeProfileId: profile.id,
    profiles: [profile],
  };
}

function ensureCharacterProfilesState(
  state: OpencodeUiCharacterProfilesState
): OpencodeUiCharacterProfilesState {
  const profiles = state.profiles.map((profile, index) =>
    createCharacterProfile(index, {
      ...profile,
      name: buildProfileName(index, profile.name),
      description: typeof profile.description === "string" ? profile.description.trim() : "",
    })
  );
  if (profiles.length === 0) {
    return createFallbackProfilesState();
  }

  const activeProfileId =
    state.activeProfileId != null &&
    profiles.some((profile) => profile.id === state.activeProfileId)
      ? state.activeProfileId
      : (profiles[0]?.id ?? null);

  return {
    activeProfileId,
    profiles,
  };
}

function buildCharacterMarkdownFallback(profileBlock: string, timestamp: string): string {
  const emptyHint =
    profileBlock.trim() === ""
      ? "\n> *Henüz bir profil tanımlanmadı. Asistan sayfasındaki 🎭 butonuna tıklayarak karakter özelliklerini seç.*\n"
      : "";

  return [
    "# 🎭 AI Karakter Profili",
    "",
    "> **Yönetim:** Asistan sayfasındaki 🎭 butonu ile overlay üzerinden düzenlenir.",
    "> **Etki:** Yeni sessionlarda otomatik yüklenir. Mevcut session için aşağıdaki hazır mesajı kullan.",
    "",
    "---",
    "",
    "## 📋 Aktif Profil",
    emptyHint,
    "<!--PROFILE_START-->",
    profileBlock,
    "<!--PROFILE_END-->",
    "",
    "---",
    "",
    "## 💬 Mevcut Session İçin Hazır Mesaj",
    "",
    "```",
    characterT("copyPrompt"),
    "```",
    "",
    "---",
    "",
    `**Son güncelleme:** ${timestamp}`,
    "**Versiyon:** 1.1",
    "",
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

export class CharacterOverlay {
  private overlay: HTMLElement | null = null;
  private overlayController: ManagedOverlayController | null = null;
  private profileList: HTMLElement | null = null;
  private activeList: HTMLElement | null = null;
  private poolList: HTMLElement | null = null;
  private activeCount: HTMLElement | null = null;
  private conflictsEl: HTMLElement | null = null;
  private conflictText: HTMLElement | null = null;
  private emptyState: HTMLElement | null = null;
  private saveBtn: HTMLButtonElement | null = null;
  private profileNameInput: HTMLInputElement | null = null;
  private profileDescriptionInput: HTMLTextAreaElement | null = null;
  private addProfileBtn: HTMLButtonElement | null = null;
  private deleteProfileBtn: HTMLButtonElement | null = null;
  private currentProfileLabel: HTMLElement | null = null;
  private unsubscribeI18n: (() => void) | null = null;

  private draftProfilesState: OpencodeUiCharacterProfilesState = createFallbackProfilesState();
  private savedProfilesState: OpencodeUiCharacterProfilesState = createFallbackProfilesState();

  destroy(): void {
    this.unsubscribeI18n?.();
    this.unsubscribeI18n = null;
    this.overlayController?.destroy();
    this.overlayController = null;
    this.overlay = null;
  }

  init(): void {
    this.overlay = document.getElementById("character-overlay");
    if (this.overlay instanceof HTMLElement && this.overlayController === null) {
      this.overlayController = createSharedAssistantToolOverlayController({
        id: "character-overlay",
        element: this.overlay,
        onAfterClose: () => {
          this.draftProfilesState = cloneCharacterProfilesState(this.savedProfilesState);
        },
      });
    }
    this.profileList = document.getElementById("character-profile-list");
    this.profileNameInput = document.getElementById(
      "character-profile-name"
    ) as HTMLInputElement | null;
    this.profileDescriptionInput = document.getElementById(
      "character-profile-description"
    ) as HTMLTextAreaElement | null;
    this.activeList = document.getElementById("character-active-list");
    this.poolList = document.getElementById("character-pool-list");
    this.activeCount = document.getElementById("character-active-count");
    this.conflictsEl = document.getElementById("character-conflicts");
    this.conflictText = document.getElementById("character-conflict-text");
    this.emptyState = document.getElementById("character-empty-state");
    this.saveBtn = document.getElementById("character-save-btn") as HTMLButtonElement | null;
    this.addProfileBtn = document.getElementById(
      "character-profile-add-btn"
    ) as HTMLButtonElement | null;
    this.deleteProfileBtn = document.getElementById(
      "character-profile-delete-btn"
    ) as HTMLButtonElement | null;
    this.currentProfileLabel = document.getElementById("character-current-profile-label");

    document.getElementById("assistant-character-btn")?.addEventListener("click", () => {
      this.open();
    });
    document.getElementById("character-overlay-close")?.addEventListener("click", () => {
      this.close();
    });
    document.getElementById("character-cancel-btn")?.addEventListener("click", () => {
      this.close();
    });
    this.addProfileBtn?.addEventListener("click", () => {
      this._addProfile();
    });
    this.deleteProfileBtn?.addEventListener("click", () => {
      this._deleteActiveProfile();
    });
    this.profileNameInput?.addEventListener("input", () => {
      this._updateActiveProfile((profile) => ({
        ...profile,
        name: this.profileNameInput?.value ?? profile.name,
      }));
    });
    this.profileDescriptionInput?.addEventListener("input", () => {
      this._updateActiveProfile((profile) => ({
        ...profile,
        description: this.profileDescriptionInput?.value ?? profile.description,
      }));
    });

    this.overlay?.addEventListener("click", (event) => {
      if (event.target === this.overlay) {
        this.close();
      }
    });

    this.saveBtn?.addEventListener("click", () => {
      void this.save();
    });

    document.getElementById("character-copy-msg-btn")?.addEventListener("click", () => {
      void navigator.clipboard.writeText(characterT("copyPrompt")).then(() => {
        const btn = document.getElementById("character-copy-msg-btn");
        const labelEl = btn?.querySelector<HTMLElement>("[data-character-copy-label]");
        if (btn == null || labelEl == null) {
          return;
        }

        const originalLabel = characterT("copyMessageButton");
        labelEl.textContent = characterT("copiedButton");
        setTimeout(() => {
          labelEl.textContent = originalLabel;
        }, 2000);
      });
    });

    this.unsubscribeI18n ??= AppI18n.subscribe(() => {
      this._renderPool();
      this._renderProfileList();
      this._renderProfileEditor();
      this._renderActivePanel();
      this._checkConflicts();
    });

    this._renderPool();
    this._renderProfileList();
    this._renderProfileEditor();
    this._renderActivePanel();
    this._checkConflicts();
  }

  private open(): void {
    void (async (): Promise<void> => {
      await ensureFeatureLabelIndex();
      await this._loadProfiles();
      this._renderPool();
      this._renderProfileList();
      this._renderProfileEditor();
      this._renderActivePanel();
      this._checkConflicts();
      this.overlayController?.open();
    })();
  }

  private close(): void {
    this.overlayController?.close();
  }

  private _getActiveProfile(): OpencodeUiCharacterProfileState | null {
    const activeProfileId = this.draftProfilesState.activeProfileId;
    if (activeProfileId == null) {
      return null;
    }

    return (
      this.draftProfilesState.profiles.find((profile) => profile.id === activeProfileId) ?? null
    );
  }

  private async _loadProfiles(): Promise<void> {
    const sharedState = await readOpencodeUiSharedState();
    let nextState = ensureCharacterProfilesState(sharedState.characterProfiles);

    if (sharedState.characterProfiles.profiles.length === 0) {
      const legacySelected = await this._loadLegacySelectedFeatures();
      nextState = createFallbackProfilesState(legacySelected);
    }

    this.savedProfilesState = cloneCharacterProfilesState(nextState);
    this.draftProfilesState = cloneCharacterProfilesState(nextState);
  }

  private async _readCharacterMarkdown(): Promise<string> {
    const api = window.electronAPI;
    if (api == null || typeof api.readFile !== "function") {
      throw new Error(characterT("errors.electronApiUnavailable"));
    }

    const base64 = await api.readFile(CHARACTER_MD_PATH);
    if (typeof base64 !== "string" || base64.trim() === "") {
      return "";
    }

    return decodeBase64Utf8(base64);
  }

  private async _loadLegacySelectedFeatures(): Promise<string[]> {
    try {
      const content = await this._readCharacterMarkdown();
      return Array.from(this._parseProfile(content));
    } catch {
      return [];
    }
  }

  private _parseProfile(content: string): Set<string> {
    const result = new Set<string>();
    const match = content.match(/<!--PROFILE_START-->([\s\S]*?)<!--PROFILE_END-->/);
    if (!match) {
      return result;
    }

    const block = match[1] ?? "";
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- "));
    lines.forEach((line) => {
      const label = line.slice(2).trim();
      const featureId = FEATURE_LABEL_INDEX.get(normalizeProfileLabel(label));
      if (featureId !== undefined) {
        result.add(featureId);
      }
    });

    return result;
  }

  private _updateActiveProfile(
    updater: (profile: OpencodeUiCharacterProfileState) => OpencodeUiCharacterProfileState
  ): void {
    const activeProfile = this._getActiveProfile();
    if (activeProfile == null) {
      return;
    }

    this.draftProfilesState = {
      ...this.draftProfilesState,
      profiles: this.draftProfilesState.profiles.map((profile, index) => {
        if (profile.id !== activeProfile.id) {
          return profile;
        }

        const nextProfile = updater(profile);
        return createCharacterProfile(index, {
          ...nextProfile,
          updatedAt: Date.now(),
          selectedFeatureIds: normalizeFeatureIds(nextProfile.selectedFeatureIds),
        });
      }),
    };

    this._renderProfileList();
    this._renderProfileEditor();
    this._renderActivePanel();
    this._checkConflicts();
  }

  private _setActiveProfile(profileId: string): void {
    if (!this.draftProfilesState.profiles.some((profile) => profile.id === profileId)) {
      return;
    }

    this.draftProfilesState = {
      ...this.draftProfilesState,
      activeProfileId: profileId,
    };
    this._renderProfileList();
    this._renderProfileEditor();
    this._renderActivePanel();
    this._updatePool();
    this._checkConflicts();
  }

  private _addProfile(): void {
    const profile = createCharacterProfile(this.draftProfilesState.profiles.length, {
      name: characterT("newProfileName", { index: this.draftProfilesState.profiles.length + 1 }),
    });
    this.draftProfilesState = {
      activeProfileId: profile.id,
      profiles: [profile, ...this.draftProfilesState.profiles],
    };
    this._renderProfileList();
    this._renderProfileEditor();
    this._renderActivePanel();
    this._updatePool();
    this._checkConflicts();
    requestAnimationFrame(() => {
      this.profileNameInput?.focus();
      this.profileNameInput?.select();
    });
  }

  private _deleteActiveProfile(): void {
    const activeProfile = this._getActiveProfile();
    if (activeProfile == null) {
      return;
    }

    const remainingProfiles = this.draftProfilesState.profiles.filter(
      (profile) => profile.id !== activeProfile.id
    );
    const nextState =
      remainingProfiles.length > 0
        ? {
            activeProfileId: remainingProfiles[0]?.id ?? null,
            profiles: remainingProfiles,
          }
        : createFallbackProfilesState();

    this.draftProfilesState = nextState;
    this._renderProfileList();
    this._renderProfileEditor();
    this._renderActivePanel();
    this._updatePool();
    this._checkConflicts();
  }

  private async save(): Promise<void> {
    const normalizedState = ensureCharacterProfilesState(this.draftProfilesState);
    const activeProfile =
      normalizedState.profiles.find((profile) => profile.id === normalizedState.activeProfileId) ??
      normalizedState.profiles[0] ??
      null;
    const timestamp = new Date().toISOString().split("T")[0] ?? "";
    let sharedStatePatched = false;

    try {
      const currentContent = await this._readCharacterMarkdown().catch(() => "");
      const profileBlock = this._buildProfileBlock(activeProfile);
      const updatedContent =
        currentContent.trim() !== ""
          ? this._mergeCharacterMarkdown(currentContent, profileBlock, timestamp)
          : buildCharacterMarkdownFallback(profileBlock, timestamp);

      const api = window.electronAPI;
      if (api == null || typeof api.fmWriteFileAtomic !== "function") {
        throw new Error(characterT("errors.electronApiUnavailable"));
      }

      const writtenState = await patchOpencodeUiSharedState((current) => ({
        ...current,
        characterProfiles: normalizedState,
      }));
      sharedStatePatched = true;

      await api.fmWriteFileAtomic({
        path: CHARACTER_MD_PATH,
        data: updatedContent,
        encoding: "utf-8",
      });

      this.savedProfilesState = ensureCharacterProfilesState(writtenState.characterProfiles);
      this.draftProfilesState = cloneCharacterProfilesState(this.savedProfilesState);

      if (this.saveBtn != null) {
        const originalText = this.saveBtn.textContent;
        this.saveBtn.classList.add("saved");
        this.saveBtn.textContent = characterT("savedButton");
        setTimeout(() => {
          if (this.saveBtn != null) {
            this.saveBtn.classList.remove("saved");
            this.saveBtn.textContent = originalText;
          }
        }, 2000);
      }
    } catch (error) {
      if (sharedStatePatched) {
        try {
          await patchOpencodeUiSharedState((current) => ({
            ...current,
            characterProfiles: this.savedProfilesState,
          }));
        } catch {
          // NOTE: Keep the original save error; rollback is best-effort.
        }
      }
      if (this.saveBtn != null) {
        const originalText = this.saveBtn.textContent;
        this.saveBtn.classList.remove("saved");
        this.saveBtn.textContent = AppI18n.t("shell.assistant.buttonStates.error");
        setTimeout(() => {
          if (this.saveBtn != null) {
            this.saveBtn.textContent = originalText;
          }
        }, 2000);
      }

      console.error(
        characterT("errors.saveFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
        error
      );
    }
  }

  private _mergeCharacterMarkdown(
    current: string,
    profileBlock: string,
    timestamp: string
  ): string {
    if (!current.includes("<!--PROFILE_START-->") || !current.includes("<!--PROFILE_END-->")) {
      return buildCharacterMarkdownFallback(profileBlock, timestamp);
    }

    const nextProfileBlock =
      profileBlock.trim() === ""
        ? "<!--PROFILE_START-->\n<!--PROFILE_END-->"
        : `<!--PROFILE_START-->\n${profileBlock}<!--PROFILE_END-->`;

    let updated = current.replace(
      /<!--PROFILE_START-->([\s\S]*?)<!--PROFILE_END-->/,
      nextProfileBlock
    );
    if (profileBlock.trim() !== "") {
      updated = updated.replace(EMPTY_PROFILE_HINT_PATTERN, "");
    }
    if (LAST_UPDATED_PATTERN.test(updated)) {
      updated = updated.replace(
        LAST_UPDATED_PATTERN,
        (_match, label: string) => `**${label}:** ${timestamp}`
      );
    } else {
      updated = `${updated.trimEnd()}\n\n**Son güncelleme:** ${timestamp}\n`;
    }
    return updated;
  }

  private _buildProfileBlock(profile: OpencodeUiCharacterProfileState | null): string {
    if (profile == null || profile.selectedFeatureIds.length === 0) {
      return "";
    }

    const selected = new Set(profile.selectedFeatureIds);
    let block = "";
    for (const category of CATEGORIES) {
      const activeInCategory = category.features.filter((feature) => selected.has(feature.id));
      if (activeInCategory.length === 0) {
        continue;
      }

      block += `\n### ${category.icon} ${getCategoryLabel(category)}\n`;
      activeInCategory.forEach((feature) => {
        block += `- ${getFeatureLabel(feature)}\n`;
      });
    }
    return `${block}\n`;
  }

  private _renderProfileList(): void {
    if (this.profileList == null) {
      return;
    }

    this.profileList.innerHTML = "";
    this.draftProfilesState.profiles.forEach((profile, index) => {
      const displayName = buildProfileName(index, profile.name);
      const descriptionText = profile.description.trim();
      const button = document.createElement("button");
      button.type = "button";
      button.className =
        profile.id === this.draftProfilesState.activeProfileId
          ? "character-profile-card is-active"
          : "character-profile-card";
      button.addEventListener("click", () => {
        this._setActiveProfile(profile.id);
      });

      const header = document.createElement("div");
      header.className = "character-profile-card__header";

      const title = document.createElement("div");
      title.className = "character-profile-card__title";
      title.textContent = displayName;

      const badge = document.createElement("span");
      badge.className = "character-profile-card__badge";
      badge.textContent = String(profile.selectedFeatureIds.length);

      header.append(title, badge);
      button.appendChild(header);

      if (descriptionText !== "") {
        const description = document.createElement("div");
        description.className = "character-profile-card__description";
        description.textContent = descriptionText;
        button.appendChild(description);
      }

      this.profileList?.appendChild(button);
    });
  }

  private _renderProfileEditor(): void {
    const activeProfile = this._getActiveProfile();
    const activeIndex =
      activeProfile != null
        ? this.draftProfilesState.profiles.findIndex((profile) => profile.id === activeProfile.id)
        : -1;
    if (this.profileNameInput != null) {
      this.profileNameInput.value = activeProfile?.name ?? "";
    }
    if (this.profileDescriptionInput != null) {
      this.profileDescriptionInput.value = activeProfile?.description ?? "";
    }
    if (this.currentProfileLabel != null) {
      this.currentProfileLabel.textContent =
        activeProfile != null
          ? buildProfileName(activeIndex >= 0 ? activeIndex : 0, activeProfile.name)
          : "";
    }
    if (this.deleteProfileBtn != null) {
      this.deleteProfileBtn.disabled = activeProfile == null;
    }
  }

  private _renderPool(): void {
    if (this.poolList == null) {
      return;
    }

    this.poolList.innerHTML = "";

    CATEGORIES.forEach((category, index) => {
      const accordion = document.createElement("div");
      accordion.className = index === 0 ? "character-accordion is-expanded" : "character-accordion";
      accordion.dataset["categoryId"] = category.id;

      const header = document.createElement("div");
      header.className = "character-accordion-header";
      header.innerHTML = `
        <span class="character-accordion-title">${category.icon} ${getCategoryLabel(category)}</span>
        <span class="character-accordion-meta">
          <span class="character-accordion-badge" data-badge="${category.id}"></span>
          <span class="character-accordion-chevron">▶</span>
        </span>
      `;
      header.addEventListener("click", () => {
        accordion.classList.toggle("is-expanded");
      });

      const body = document.createElement("div");
      body.className = "character-accordion-body";

      category.features.forEach((feature) => {
        const item = document.createElement("div");
        item.className = "character-pool-item";
        item.dataset["featureId"] = feature.id;
        item.innerHTML = `
          <span class="character-pool-item-check"></span>
          <span class="character-pool-item-label">${getFeatureLabel(feature)}</span>
        `;
        item.addEventListener("click", () => {
          this._toggleFeature(feature.id);
        });
        body.appendChild(item);
      });

      accordion.append(header, body);
      this.poolList?.appendChild(accordion);
    });

    this._updatePool();
  }

  private _updatePool(): void {
    if (this.poolList == null) {
      return;
    }

    const activeProfile = this._getActiveProfile();
    const selected = new Set(activeProfile?.selectedFeatureIds ?? []);

    CATEGORIES.forEach((category) => {
      let activeCount = 0;
      category.features.forEach((feature) => {
        const item = this.poolList?.querySelector<HTMLElement>(`[data-feature-id="${feature.id}"]`);
        if (item == null) {
          return;
        }

        const isActive = selected.has(feature.id);
        item.classList.toggle("is-active", isActive);
        const check = item.querySelector<HTMLElement>(".character-pool-item-check");
        if (check != null) {
          check.textContent = isActive ? "✓" : "";
        }
        if (isActive) {
          activeCount += 1;
        }
      });

      const badge = this.poolList?.querySelector<HTMLElement>(`[data-badge="${category.id}"]`);
      if (badge != null) {
        badge.textContent = activeCount > 0 ? String(activeCount) : "";
      }
    });
  }

  private _toggleFeature(featureId: string): void {
    this._updateActiveProfile((profile) => {
      const selected = new Set(profile.selectedFeatureIds);
      if (selected.has(featureId)) {
        selected.delete(featureId);
      } else {
        selected.add(featureId);
      }

      return {
        ...profile,
        selectedFeatureIds: Array.from(selected),
      };
    });
    this._updatePool();
  }

  private _renderActivePanel(): void {
    if (this.activeList == null) {
      return;
    }

    this.activeList.querySelectorAll(".character-group").forEach((group) => {
      group.remove();
    });

    const activeProfile = this._getActiveProfile();
    const selected = new Set(activeProfile?.selectedFeatureIds ?? []);
    const totalActive = selected.size;

    if (this.emptyState != null) {
      this.emptyState.classList.toggle("is-hidden", totalActive !== 0);
    }
    if (this.activeCount != null) {
      this.activeCount.textContent = characterT("activeCount", { count: totalActive });
    }

    CATEGORIES.forEach((category) => {
      const activeInCategory = category.features.filter((feature) => selected.has(feature.id));
      if (activeInCategory.length === 0) {
        return;
      }

      const group = document.createElement("div");
      group.className = "character-group";

      const label = document.createElement("div");
      label.className = "character-group-label";
      label.textContent = `${category.icon} ${getCategoryLabel(category)}`;

      const chips = document.createElement("div");
      chips.className = "character-group-chips";

      activeInCategory.forEach((feature) => {
        const chip = document.createElement("span");
        chip.className = "character-chip";
        chip.title = characterT("removeTitle");
        chip.innerHTML = `${getFeatureLabel(feature)} <span class="character-chip-remove">✕</span>`;
        chip.addEventListener("click", () => {
          this._toggleFeature(feature.id);
        });
        chips.appendChild(chip);
      });

      group.append(label, chips);
      this.activeList?.appendChild(group);
    });
  }

  private _checkConflicts(): void {
    if (this.conflictsEl == null || this.conflictText == null) {
      return;
    }

    const selected = new Set(this._getActiveProfile()?.selectedFeatureIds ?? []);
    const conflictMessages: string[] = [];
    CONFLICTS.forEach((pair) => {
      if (!selected.has(pair.a) || !selected.has(pair.b)) {
        return;
      }

      const featureA = FEATURE_MAP.get(pair.a);
      const featureB = FEATURE_MAP.get(pair.b);
      if (featureA != null && featureB != null) {
        conflictMessages.push(
          characterT("conflictMessage", {
            a: getFeatureLabel(featureA),
            b: getFeatureLabel(featureB),
          })
        );
      }
    });

    if (conflictMessages.length > 0) {
      this.conflictText.textContent = conflictMessages.join(" • ");
      this.conflictsEl.classList.remove("is-hidden");
    } else {
      this.conflictsEl.classList.add("is-hidden");
    }
  }
}
