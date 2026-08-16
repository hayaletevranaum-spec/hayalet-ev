import type {
  LanguageDescriptor,
  LanguageDirection,
  SelectorLanguage,
  TranslationCatalog,
  TranslationParams,
} from "@shared/i18n.js";
import type { InstalledRoomRecord } from "@shared/index.js";
import { getBuiltInLanguageDescriptor } from "../../../../../shared/i18n/built-in-descriptors.js";
import {
  isTranslationCatalog,
  mergeTranslationCatalogs,
} from "../../../../../shared/i18n/catalog.js";
import {
  normalizeAppLanguage,
  resolveSelectorLanguage,
} from "../../../../../shared/i18n/locale.js";
import { decodeBase64 } from "../../../constants/index.js";
import { AppI18n, formatLanguageLabel } from "../../../modules/i18n/index.js";
import { RoomRegistry } from "../../../modules/rooms/room-registry.js";
import { resolveRoomShellName } from "../../../modules/rooms/room-shell-presentation.js";
import { Toast } from "../../../ui/toast-manager.js";
import { shellT } from "../../../app/shell-i18n.js";
import { registerSettingsPanelLifecycle } from "../controller.js";
import { loadBuiltInLanguagePack } from "../../../modules/i18n/built-in-loader.js";

type EditorScope = "app" | "room";
type AppSourceKind = "builtin" | "external";

interface FlatTranslationEntry {
  key: string;
  runtimeKey: string;
  category: string;
  sourceValue: string;
  targetValue: string;
  isExtra: boolean;
  placeholderMismatch: boolean;
  newlineMismatch: boolean;
}

interface AppLocaleDraft {
  locale: string;
  nativeName: string;
  englishName: string;
  direction: LanguageDirection;
  selectorLanguage: SelectorLanguage;
}

type CreateLocaleDraft = AppLocaleDraft;

interface LanguageEditorRefs {
  root: HTMLElement;
  toolbar: HTMLElement;
  summary: HTMLElement;
  filters: HTMLElement;
  categories: HTMLElement;
  mainHead: HTMLElement;
  entryList: HTMLElement;
  meta: HTMLElement;
}

interface LanguageEditorState {
  isOpen: boolean;
  isLoading: boolean;
  isSaving: boolean;
  isLoaded: boolean;
  dirty: boolean;
  scope: EditorScope;
  appLanguageRoot: string;
  appLanguages: LanguageDescriptor[];
  rooms: InstalledRoomRecord[];
  roomLocales: string[];
  selectedRoomId: string | null;
  selectedLocale: string;
  selectedCategory: string | null;
  searchQuery: string;
  onlyMissing: boolean;
  onlyDifferent: boolean;
  sourceCatalog: TranslationCatalog;
  targetCatalog: TranslationCatalog;
  catalogShape: TranslationCatalog;
  entries: FlatTranslationEntry[];
  draftValues: Record<string, string>;
  runtimePrefix: string;
  sourcePath: string;
  savePath: string;
  appLocaleDraft: AppLocaleDraft;
  createDraft: CreateLocaleDraft;
  appSourceKind: AppSourceKind;
  sourceMissing: boolean;
}

const CATEGORY_DEPTH = 2;
const ALL_CATEGORIES_VALUE = "__all__";
const localeCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

let initialized = false;
let loadToken = 0;

function languageEditorT(key: string, params?: TranslationParams): string {
  return shellT(`languagesEditor.${key}`, params);
}

function cloneCatalog(catalog: TranslationCatalog): TranslationCatalog {
  return JSON.parse(JSON.stringify(catalog)) as TranslationCatalog;
}

async function loadBuiltInCatalog(locale: string): Promise<TranslationCatalog> {
  const pack = await loadBuiltInLanguagePack(locale);
  return cloneCatalog(pack?.catalog ?? {});
}

function joinPath(basePath: string, ...segments: string[]): string {
  return segments.reduce((currentPath, segment) => {
    const cleanCurrent = currentPath.replace(/[\\/]+$/, "");
    const cleanSegment = segment.replace(/^[/\\]+/, "");
    return cleanCurrent === "" ? cleanSegment : `${cleanCurrent}/${cleanSegment}`;
  }, basePath);
}

function sortLocales(locales: Iterable<string>): string[] {
  return Array.from(
    new Set(Array.from(locales).map((locale) => normalizeAppLanguage(locale)))
  ).sort((left, right) => {
    if (left === "tr") return -1;
    if (right === "tr") return 1;
    if (left === "en") return -1;
    if (right === "en") return 1;
    return localeCollator.compare(left, right);
  });
}

function sortAppLanguages(languages: LanguageDescriptor[]): LanguageDescriptor[] {
  return [...languages].sort((left, right) => {
    const leftLocale = normalizeAppLanguage(left.locale);
    const rightLocale = normalizeAppLanguage(right.locale);
    if (leftLocale === "tr") return -1;
    if (rightLocale === "tr") return 1;
    if (leftLocale === "en") return -1;
    if (rightLocale === "en") return 1;
    return localeCollator.compare(formatLanguageLabel(left), formatLanguageLabel(right));
  });
}

function getCatalogLeafValue(catalog: TranslationCatalog, key: string): string {
  const segments = key.split(".").filter(Boolean);
  let current: unknown = catalog;
  for (const segment of segments) {
    if (isTranslationCatalog(current) === false) {
      return "";
    }
    current = current[segment];
    if (current === undefined) {
      return "";
    }
  }
  if (typeof current === "string") {
    return current;
  }
  if (typeof current === "number" || typeof current === "boolean") {
    return String(current);
  }
  return "";
}

function hasCatalogLeafValue(catalog: TranslationCatalog, key: string): boolean {
  const segments = key.split(".").filter(Boolean);
  let current: unknown = catalog;
  for (const segment of segments) {
    if (isTranslationCatalog(current) === false) {
      return false;
    }
    current = current[segment];
    if (current === undefined) {
      return false;
    }
  }
  return isTranslationCatalog(current) === false;
}

function resolveCategory(key: string): string {
  const parentSegments = key.split(".").filter(Boolean).slice(0, -1);
  if (parentSegments.length === 0) {
    return key;
  }
  return parentSegments.slice(0, CATEGORY_DEPTH).join(".");
}

function extractPlaceholders(value: string): string[] {
  const placeholders = new Set<string>();
  value.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, token: string) => {
    placeholders.add(token);
    return "";
  });
  return Array.from(placeholders).sort((left, right) => localeCollator.compare(left, right));
}

function hasPlaceholderMismatch(sourceValue: string, targetValue: string): boolean {
  const sourceTokens = extractPlaceholders(sourceValue);
  const targetTokens = extractPlaceholders(targetValue);
  if (sourceTokens.length !== targetTokens.length) {
    return true;
  }
  return sourceTokens.some((token, index) => token !== targetTokens[index]);
}

function hasNewlineMismatch(sourceValue: string, targetValue: string): boolean {
  const sourceCount = sourceValue.split("\n").length;
  const targetCount = targetValue.split("\n").length;
  return sourceValue.includes("\n") !== targetValue.includes("\n") || sourceCount !== targetCount;
}

function buildEntries(
  shape: TranslationCatalog,
  sourceCatalog: TranslationCatalog,
  targetCatalog: TranslationCatalog,
  runtimePrefix: string
): FlatTranslationEntry[] {
  const entries: FlatTranslationEntry[] = [];

  const visitNode = (node: TranslationCatalog | string, keyPath: string[]): void => {
    if (isTranslationCatalog(node)) {
      Object.keys(node)
        .sort((left, right) => localeCollator.compare(left, right))
        .forEach((key) => {
          visitNode(node[key] as TranslationCatalog | string, [...keyPath, key]);
        });
      return;
    }

    const key = keyPath.join(".");
    const sourceValue = getCatalogLeafValue(sourceCatalog, key);
    const targetValue = getCatalogLeafValue(targetCatalog, key);
    const runtimeKey = runtimePrefix === "" ? key : `${runtimePrefix}.${key}`;
    entries.push({
      key,
      runtimeKey,
      category: resolveCategory(key),
      sourceValue,
      targetValue,
      isExtra: hasCatalogLeafValue(sourceCatalog, key) === false,
      placeholderMismatch:
        targetValue.trim() !== "" && hasPlaceholderMismatch(sourceValue, targetValue),
      newlineMismatch: targetValue.trim() !== "" && hasNewlineMismatch(sourceValue, targetValue),
    });
  };

  visitNode(shape, []);
  return entries;
}

function buildDraftValues(
  shape: TranslationCatalog,
  targetCatalog: TranslationCatalog
): Record<string, string> {
  const values: Record<string, string> = {};
  const visitNode = (node: TranslationCatalog | string, keyPath: string[]): void => {
    if (isTranslationCatalog(node)) {
      Object.keys(node)
        .sort((left, right) => localeCollator.compare(left, right))
        .forEach((key) => {
          visitNode(node[key] as TranslationCatalog | string, [...keyPath, key]);
        });
      return;
    }

    const key = keyPath.join(".");
    values[key] = getCatalogLeafValue(targetCatalog, key);
  };
  visitNode(shape, []);
  return values;
}

function buildCatalogFromShape(
  shape: TranslationCatalog,
  draftValues: Record<string, string>,
  keyPath: string[] = []
): TranslationCatalog {
  const nextCatalog: TranslationCatalog = {};
  Object.keys(shape)
    .sort((left, right) => localeCollator.compare(left, right))
    .forEach((key) => {
      const nextKeyPath = [...keyPath, key];
      const node = shape[key];
      if (isTranslationCatalog(node)) {
        nextCatalog[key] = buildCatalogFromShape(node, draftValues, nextKeyPath);
        return;
      }
      const entryKey = nextKeyPath.join(".");
      nextCatalog[key] = draftValues[entryKey] ?? "";
    });
  return nextCatalog;
}

function createBlankCatalog(shape: TranslationCatalog): TranslationCatalog {
  return buildCatalogFromShape(shape, {});
}

function resizeTextarea(textarea: HTMLTextAreaElement): void {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.max(textarea.scrollHeight, 132)}px`;
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
  textContent?: string
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  if (className !== undefined && className !== "") {
    element.className = className;
  }
  if (textContent !== undefined) {
    element.textContent = textContent;
  }
  return element;
}

function createMetaLabel(label: string, value: string): HTMLElement {
  const row = createElement("div", "language-editor-info-row");
  const labelEl = createElement("span", "language-editor-info-row__label", label);
  const valueEl = createElement("span", "language-editor-info-row__value", value);
  row.append(labelEl, valueEl);
  return row;
}

function createBadge(
  text: string,
  tone: "neutral" | "warning" | "success" | "danger" = "neutral"
): HTMLElement {
  const badge = createElement("span", `language-editor-badge language-editor-badge--${tone}`, text);
  return badge;
}

function createField(
  label: string,
  control: HTMLElement,
  options: { wide?: boolean } = {}
): HTMLElement {
  const field = createElement(
    "label",
    `language-editor-field${options.wide === true ? " language-editor-field--wide" : ""}`
  );
  const labelEl = createElement("span", "language-editor-field__label", label);
  field.append(labelEl, control);
  return field;
}

function createSelect(
  role: string,
  options: Array<{ label: string; value: string }>,
  value: string,
  disabled = false,
  placeholder?: string
): HTMLSelectElement {
  const select = createElement("select", "select select-sm language-editor-select");
  select.dataset["role"] = role;
  select.disabled = disabled;
  if (placeholder !== undefined) {
    select.append(new Option(placeholder, ""));
  }
  options.forEach((option) => {
    select.append(new Option(option.label, option.value));
  });
  select.value = value;
  if (placeholder !== undefined && value.trim() === "") {
    select.value = "";
  }
  return select;
}

function createInput(
  role: string,
  value: string,
  placeholder = "",
  type: "text" | "search" = "text",
  disabled = false
): HTMLInputElement {
  const input = createElement("input", "input input-sm language-editor-input");
  input.dataset["role"] = role;
  input.type = type;
  input.value = value;
  input.placeholder = placeholder;
  input.disabled = disabled;
  return input;
}

function createCheckbox(
  role: string,
  checked: boolean,
  label: string,
  disabled = false
): HTMLElement {
  const wrapper = createElement("label", "ds-choice-chip ds-choice-chip--dense");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.dataset["role"] = role;
  input.disabled = disabled;
  const text = createElement("span", "", label);
  wrapper.append(input, text);
  return wrapper;
}

function buildDefaultAppLocaleDraft(locale: string): AppLocaleDraft {
  const hasLocale = locale.trim() !== "";
  const normalizedLocale = hasLocale ? normalizeAppLanguage(locale) : "";
  const descriptor = hasLocale ? getBuiltInLanguageDescriptor(normalizedLocale) : null;
  return {
    locale: normalizedLocale,
    nativeName: descriptor?.nativeName ?? "",
    englishName: descriptor?.englishName ?? "",
    direction: descriptor?.direction ?? "ltr",
    selectorLanguage:
      descriptor?.selectorLanguage ??
      (hasLocale ? resolveSelectorLanguage(normalizedLocale) : "en"),
  };
}

function hasActivePackageSelection(state: LanguageEditorState): boolean {
  if (state.scope === "app") {
    return state.selectedLocale.trim() !== "";
  }

  return state.selectedRoomId !== null && state.selectedLocale.trim() !== "";
}

function resetLoadedLocaleState(
  state: LanguageEditorState,
  options: { preserveRoomLocales?: boolean } = {}
): void {
  state.entries = [];
  state.draftValues = {};
  state.sourceCatalog = {};
  state.targetCatalog = {};
  state.catalogShape = {};
  state.runtimePrefix = "";
  state.sourcePath = "";
  state.savePath = "";
  state.sourceMissing = false;
  state.dirty = false;
  state.selectedCategory = null;
  state.appLocaleDraft = buildDefaultAppLocaleDraft(state.selectedLocale);

  if (options.preserveRoomLocales !== true) {
    state.roomLocales = [];
  }
}

function getVisibleEntries(state: LanguageEditorState): FlatTranslationEntry[] {
  if (state.selectedCategory === null) {
    return [];
  }

  const query = state.searchQuery.trim().toLocaleLowerCase();
  return state.entries.filter((entry) => {
    if (
      state.selectedCategory !== ALL_CATEGORIES_VALUE &&
      entry.category !== state.selectedCategory
    ) {
      return false;
    }
    const draftValue = state.draftValues[entry.key] ?? entry.targetValue;
    if (state.onlyMissing && draftValue.trim() !== "") {
      return false;
    }
    if (state.onlyDifferent && draftValue === entry.sourceValue) {
      return false;
    }
    if (query === "") {
      return true;
    }
    const haystack = [entry.key, entry.runtimeKey, entry.sourceValue, draftValue, entry.category]
      .join(" ")
      .toLocaleLowerCase();
    return haystack.includes(query);
  });
}

function getCategoryStats(state: LanguageEditorState): Array<{
  name: string;
  total: number;
  missing: number;
}> {
  const categories = new Map<string, { total: number; missing: number }>();
  state.entries.forEach((entry) => {
    const current = categories.get(entry.category) ?? { total: 0, missing: 0 };
    current.total += 1;
    const draftValue = state.draftValues[entry.key] ?? entry.targetValue;
    if (draftValue.trim() === "") {
      current.missing += 1;
    }
    categories.set(entry.category, current);
  });
  return Array.from(categories.entries())
    .sort((left, right) => localeCollator.compare(left[0], right[0]))
    .map(([name, stats]) => ({ name, ...stats }));
}

function createLanguageEditorState(): LanguageEditorState {
  return {
    isOpen: false,
    isLoading: false,
    isSaving: false,
    isLoaded: false,
    dirty: false,
    scope: "app",
    appLanguageRoot: "",
    appLanguages: [],
    rooms: [],
    roomLocales: [],
    selectedRoomId: null,
    selectedLocale: "",
    selectedCategory: null,
    searchQuery: "",
    onlyMissing: false,
    onlyDifferent: false,
    sourceCatalog: {},
    targetCatalog: {},
    catalogShape: {},
    entries: [],
    draftValues: {},
    runtimePrefix: "",
    sourcePath: "",
    savePath: "",
    appLocaleDraft: buildDefaultAppLocaleDraft(""),
    createDraft: buildDefaultAppLocaleDraft(""),
    appSourceKind: "builtin",
    sourceMissing: false,
  };
}

function getRefs(): LanguageEditorRefs | null {
  const root = document.getElementById("settings-panel-languages");
  const toolbar = document.getElementById("language-editor-toolbar");
  const summary = document.getElementById("language-editor-summary");
  const filters = document.getElementById("language-editor-filters");
  const categories = document.getElementById("language-editor-categories");
  const mainHead = document.getElementById("language-editor-main-head");
  const entryList = document.getElementById("language-editor-entry-list");
  const meta = document.getElementById("language-editor-meta");

  if (
    !(root instanceof HTMLElement) ||
    !(toolbar instanceof HTMLElement) ||
    !(summary instanceof HTMLElement) ||
    !(filters instanceof HTMLElement) ||
    !(categories instanceof HTMLElement) ||
    !(mainHead instanceof HTMLElement) ||
    !(entryList instanceof HTMLElement) ||
    !(meta instanceof HTMLElement)
  ) {
    return null;
  }

  return {
    root,
    toolbar,
    summary,
    filters,
    categories,
    mainHead,
    entryList,
    meta,
  };
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  const api = window.electronAPI;
  if (api === undefined || typeof api.readFile !== "function" || filePath.trim() === "") {
    return null;
  }

  try {
    const encoded = await api.readFile(filePath);
    if (typeof encoded !== "string" || encoded.trim() === "") {
      return null;
    }
    const decoded = decodeBase64(encoded);
    if (decoded.trim() === "") {
      return null;
    }
    return JSON.parse(decoded) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(filePath: string, data: unknown): Promise<boolean> {
  const api = window.electronAPI;
  if (api === undefined || typeof api.fmWriteFileAtomic !== "function" || filePath.trim() === "") {
    return false;
  }

  const result = await api.fmWriteFileAtomic({
    path: filePath,
    data: JSON.stringify(data, null, 2),
    encoding: "utf-8",
  });
  return result.success === true;
}

async function resolveAppLanguageRoot(): Promise<string> {
  const api = window.electronAPI;
  if (api === undefined || typeof api.fmEnsureDirs !== "function") {
    return "";
  }

  try {
    const result = await api.fmEnsureDirs("data");
    if (result.success !== true || typeof result.paths["data"] !== "string") {
      return "";
    }
    return joinPath(result.paths["data"], "shared", "languages");
  } catch {
    return "";
  }
}

async function listRoomLocales(baseDir: string): Promise<string[]> {
  const api = window.electronAPI;
  if (api === undefined || typeof api.readDirectoryFiles !== "function" || baseDir.trim() === "") {
    return [];
  }

  try {
    const entries = await api.readDirectoryFiles(baseDir);
    return sortLocales(
      entries
        .filter(
          (entry) => entry.isDirectory === false && entry.name.toLowerCase().endsWith(".json")
        )
        .map((entry) => entry.name.replace(/\.json$/i, ""))
    );
  } catch {
    return [];
  }
}

async function loadLooseCatalog(filePath: string): Promise<TranslationCatalog> {
  const catalog = await readJsonFile<unknown>(filePath);
  return isTranslationCatalog(catalog) ? cloneCatalog(catalog) : {};
}

function buildAppManifest(draft: AppLocaleDraft): Record<string, string | null> {
  return {
    locale: normalizeAppLanguage(draft.locale),
    nativeName:
      draft.nativeName.trim() !== "" ? draft.nativeName.trim() : normalizeAppLanguage(draft.locale),
    englishName: draft.englishName.trim() !== "" ? draft.englishName.trim() : null,
    direction: draft.direction,
    selectorLanguage: draft.selectorLanguage,
    description: null,
  };
}

function createToolbar(refs: LanguageEditorRefs, state: LanguageEditorState): void {
  const toolbar = refs.toolbar;
  toolbar.replaceChildren();

  const surface = createElement(
    "div",
    "glass-panel ds-surface-card ds-surface-card--stack language-editor-toolbar__surface"
  );

  const scopeGroup = createElement(
    "div",
    "language-editor-toolbar__group language-editor-toolbar__group--scope"
  );
  const scopeLabel = createElement(
    "span",
    "language-editor-toolbar__label",
    languageEditorT("toolbar.scopeLabel")
  );
  const scopeButtons = createElement("div", "language-editor-scope-switch");

  (
    [
      { scope: "app" as const, label: languageEditorT("scope.app") },
      { scope: "room" as const, label: languageEditorT("scope.rooms") },
    ] as const
  ).forEach((item) => {
    const button = createElement(
      "button",
      `btn btn-ghost btn-sm language-editor-scope-switch__button${state.scope === item.scope ? " is-active" : ""}`,
      item.label
    );
    button.type = "button";
    button.dataset["action"] = "scope";
    button.dataset["scope"] = item.scope;
    button.disabled = state.isLoading || state.isSaving;
    scopeButtons.append(button);
  });
  scopeGroup.append(scopeLabel, scopeButtons);

  const localeGroup = createElement("div", "language-editor-toolbar__group");
  const localeOptions =
    state.scope === "app"
      ? state.appLanguages.map((language) => ({
          label: formatLanguageLabel(language),
          value: normalizeAppLanguage(language.locale),
        }))
      : state.roomLocales.map((locale) => ({
          label: locale,
          value: locale,
        }));
  localeGroup.append(
    createElement("span", "language-editor-toolbar__label", languageEditorT("toolbar.localeLabel")),
    createSelect(
      "locale",
      localeOptions,
      state.selectedLocale,
      state.isLoading ||
        state.isSaving ||
        (state.scope === "room" && state.selectedRoomId === null),
      languageEditorT("toolbar.localePlaceholder")
    )
  );

  const roomGroup = createElement(
    "div",
    `language-editor-toolbar__group${state.scope === "room" ? "" : " is-hidden"}`
  );
  if (state.scope === "room") {
    roomGroup.append(
      createElement("span", "language-editor-toolbar__label", languageEditorT("toolbar.roomLabel")),
      createSelect(
        "room",
        state.rooms.map((room) => ({
          label: resolveRoomShellName(room.id, room.name),
          value: room.id,
        })),
        state.selectedRoomId ?? "",
        state.isLoading || state.isSaving,
        languageEditorT("toolbar.roomPlaceholder")
      )
    );
  }

  const statusGroup = createElement(
    "div",
    "language-editor-toolbar__group language-editor-toolbar__group--status"
  );
  const statusTone = state.isSaving ? "warning" : state.dirty ? "danger" : "success";
  const statusKey = state.isSaving
    ? "status.saving"
    : state.dirty
      ? "status.dirty"
      : "status.clean";
  statusGroup.append(createBadge(languageEditorT(statusKey), statusTone));

  const actions = createElement("div", "language-editor-toolbar__actions");
  const refreshButton = createElement(
    "button",
    "btn btn-ghost btn-sm",
    languageEditorT("actions.refresh")
  );
  refreshButton.type = "button";
  refreshButton.dataset["action"] = "refresh";
  refreshButton.disabled = state.isLoading || state.isSaving;

  const saveButton = createElement(
    "button",
    "btn btn-primary btn-sm",
    languageEditorT("actions.save")
  );
  saveButton.type = "button";
  saveButton.dataset["action"] = "save";
  saveButton.disabled =
    state.isLoading ||
    state.isSaving ||
    hasActivePackageSelection(state) === false ||
    state.entries.length === 0 ||
    (state.scope === "room" && state.selectedRoomId === null);

  actions.append(refreshButton, saveButton);

  surface.append(scopeGroup, roomGroup, localeGroup, statusGroup, actions);
  toolbar.append(surface);
}

function createSummary(refs: LanguageEditorRefs, state: LanguageEditorState): void {
  const summary = refs.summary;
  summary.replaceChildren();

  const visibleEntries = getVisibleEntries(state);
  const translatedCount = state.entries.filter((entry) => {
    const nextValue = state.draftValues[entry.key] ?? entry.targetValue;
    return nextValue.trim() !== "";
  }).length;
  const warningCount = state.entries.filter((entry) => {
    const nextValue = state.draftValues[entry.key] ?? entry.targetValue;
    if (nextValue.trim() === "") {
      return false;
    }
    return (
      hasPlaceholderMismatch(entry.sourceValue, nextValue) ||
      hasNewlineMismatch(entry.sourceValue, nextValue)
    );
  }).length;

  const cards: Array<{
    label: string;
    value: string;
    tone?: "success" | "warning" | "neutral" | "danger";
  }> = [
    {
      label: languageEditorT("summary.total"),
      value: String(state.entries.length),
    },
    {
      label: languageEditorT("summary.translated"),
      value: String(translatedCount),
      tone: "success",
    },
    {
      label: languageEditorT("summary.missing"),
      value: String(Math.max(state.entries.length - translatedCount, 0)),
      tone: "warning",
    },
    {
      label: languageEditorT("summary.visible"),
      value: String(visibleEntries.length),
      tone: "neutral",
    },
    {
      label: languageEditorT("summary.warnings"),
      value: String(warningCount),
      tone: warningCount > 0 ? "danger" : "neutral",
    },
  ];

  const fragment = document.createDocumentFragment();
  cards.forEach((card) => {
    const item = createElement(
      "article",
      `language-editor-summary-card${card.tone !== undefined ? ` language-editor-summary-card--${card.tone}` : ""}`
    );
    item.append(
      createElement("span", "language-editor-summary-card__label", card.label),
      createElement("strong", "language-editor-summary-card__value", card.value)
    );
    fragment.append(item);
  });
  summary.append(fragment);
}

function createFilters(refs: LanguageEditorRefs, state: LanguageEditorState): void {
  const filters = refs.filters;
  filters.replaceChildren();

  const surface = createElement(
    "section",
    "glass-panel ds-surface-card ds-surface-card--stack language-editor-side-card"
  );
  const header = createElement("div", "language-editor-side-card__head");
  header.append(
    createElement("h4", "language-editor-side-card__title", languageEditorT("filters.title"))
  );

  const filtersDisabled = state.isLoading || hasActivePackageSelection(state) === false;
  const body = createElement("div", "language-editor-side-card__body");
  const searchLabel = createElement("label", "language-editor-field language-editor-field--wide");
  searchLabel.append(
    createElement("span", "language-editor-field__label", languageEditorT("filters.searchLabel")),
    createInput(
      "search",
      state.searchQuery,
      languageEditorT("filters.searchPlaceholder"),
      "search",
      filtersDisabled
    )
  );

  const toggles = createElement("div", "language-editor-filter-toggles");
  toggles.append(
    createCheckbox(
      "only-missing",
      state.onlyMissing,
      languageEditorT("filters.onlyMissing"),
      filtersDisabled
    ),
    createCheckbox(
      "only-different",
      state.onlyDifferent,
      languageEditorT("filters.onlyDifferent"),
      filtersDisabled
    )
  );

  body.append(searchLabel, toggles);
  surface.append(header, body);
  filters.append(surface);
}

function createCategories(refs: LanguageEditorRefs, state: LanguageEditorState): void {
  const categories = refs.categories;
  categories.replaceChildren();

  const surface = createElement(
    "section",
    "glass-panel ds-surface-card ds-surface-card--stack language-editor-side-card"
  );
  const header = createElement("div", "language-editor-side-card__head");
  header.append(
    createElement("h4", "language-editor-side-card__title", languageEditorT("categories.title"))
  );

  if (hasActivePackageSelection(state) === false) {
    surface.append(
      header,
      createElement(
        "p",
        "language-editor-side-card__hint",
        languageEditorT("empty.selectPackageBody")
      )
    );
    categories.append(surface);
    return;
  }

  if (state.isLoading) {
    surface.append(
      header,
      createElement("p", "language-editor-side-card__hint", languageEditorT("empty.loadingBody"))
    );
    categories.append(surface);
    return;
  }

  if (state.sourceMissing) {
    surface.append(
      header,
      createElement(
        "p",
        "language-editor-side-card__hint",
        languageEditorT("empty.sourceMissingBody")
      )
    );
    categories.append(surface);
    return;
  }

  if (state.entries.length === 0) {
    surface.append(
      header,
      createElement("p", "language-editor-side-card__hint", languageEditorT("empty.noneBody"))
    );
    categories.append(surface);
    return;
  }

  const list = createElement("div", "language-editor-category-list");
  const allButton = createElement(
    "button",
    `language-editor-category${state.selectedCategory === ALL_CATEGORIES_VALUE ? " is-active" : ""}`
  );
  allButton.type = "button";
  allButton.dataset["category"] = ALL_CATEGORIES_VALUE;
  allButton.append(
    createElement("span", "language-editor-category__name", languageEditorT("categories.all")),
    createElement("span", "language-editor-category__meta", String(state.entries.length))
  );
  list.append(allButton);

  getCategoryStats(state).forEach((category) => {
    const button = createElement(
      "button",
      `language-editor-category${state.selectedCategory === category.name ? " is-active" : ""}`
    );
    button.type = "button";
    button.dataset["category"] = category.name;
    const meta =
      category.missing > 0
        ? `${category.total} • ${languageEditorT("categories.missingShort", { count: category.missing })}`
        : String(category.total);
    button.append(
      createElement("span", "language-editor-category__name", category.name),
      createElement("span", "language-editor-category__meta", meta)
    );
    list.append(button);
  });

  surface.append(header, list);
  categories.append(surface);
}

function createMainHead(refs: LanguageEditorRefs, state: LanguageEditorState): void {
  const mainHead = refs.mainHead;
  mainHead.replaceChildren();

  const visibleEntries = getVisibleEntries(state);
  const title = createElement("div", "language-editor-main-head__copy");
  const runtimeScope =
    state.scope === "app"
      ? languageEditorT("main.scope.app")
      : languageEditorT("main.scope.room", {
          room: resolveRoomShellName(
            state.selectedRoomId ?? "",
            state.rooms.find((room) => room.id === state.selectedRoomId)?.name ??
              languageEditorT("toolbar.roomPlaceholder")
          ),
        });
  const titleText =
    hasActivePackageSelection(state) === false
      ? languageEditorT("main.idleTitle")
      : state.selectedCategory === null
        ? languageEditorT("main.pendingCategoryTitle", { locale: state.selectedLocale })
        : languageEditorT("main.title", { locale: state.selectedLocale });
  title.append(
    createElement("span", "language-editor-main-head__kicker", runtimeScope),
    createElement("h4", "language-editor-main-head__title", titleText)
  );

  const meta = createElement("div", "language-editor-main-head__meta");
  meta.append(
    createBadge(
      languageEditorT("main.visibleCount", {
        visible: visibleEntries.length,
        total: state.entries.length,
      }),
      "neutral"
    )
  );

  mainHead.append(title, meta);
}

function createEmptyState(messageKey: string, detailKey: string): HTMLElement {
  const empty = createElement("div", "language-editor-empty-state");
  empty.append(
    createElement("strong", "language-editor-empty-state__title", languageEditorT(messageKey)),
    createElement("p", "language-editor-empty-state__detail", languageEditorT(detailKey))
  );
  return empty;
}

function createEntryList(refs: LanguageEditorRefs, state: LanguageEditorState): void {
  const entryList = refs.entryList;
  entryList.replaceChildren();

  if (hasActivePackageSelection(state) === false) {
    entryList.append(createEmptyState("empty.selectPackageTitle", "empty.selectPackageBody"));
    return;
  }

  if (state.isLoading) {
    entryList.append(createEmptyState("empty.loadingTitle", "empty.loadingBody"));
    return;
  }

  if (state.sourceMissing) {
    entryList.append(createEmptyState("empty.sourceMissingTitle", "empty.sourceMissingBody"));
    return;
  }

  if (state.entries.length === 0) {
    entryList.append(createEmptyState("empty.noneTitle", "empty.noneBody"));
    return;
  }

  if (state.selectedCategory === null) {
    entryList.append(createEmptyState("empty.selectCategoryTitle", "empty.selectCategoryBody"));
    return;
  }

  const visibleEntries = getVisibleEntries(state);
  if (visibleEntries.length === 0) {
    entryList.append(createEmptyState("empty.filteredTitle", "empty.filteredBody"));
    return;
  }

  const fragment = document.createDocumentFragment();
  visibleEntries.forEach((entry) => {
    const draftValue = state.draftValues[entry.key] ?? entry.targetValue;
    const placeholderMismatch =
      draftValue.trim() !== "" && hasPlaceholderMismatch(entry.sourceValue, draftValue);
    const newlineMismatch =
      draftValue.trim() !== "" && hasNewlineMismatch(entry.sourceValue, draftValue);

    const card = createElement("article", "language-editor-entry");

    const header = createElement("div", "language-editor-entry__header");
    const copy = createElement("div", "language-editor-entry__copy");
    copy.append(
      createElement("code", "language-editor-entry__key", entry.runtimeKey),
      createElement("span", "language-editor-entry__path", entry.category)
    );
    const badges = createElement("div", "language-editor-entry__badges");
    if (draftValue.trim() === "") {
      badges.append(createBadge(languageEditorT("entry.badges.missing"), "warning"));
    }
    if (entry.isExtra) {
      badges.append(createBadge(languageEditorT("entry.badges.extra"), "neutral"));
    }
    if (placeholderMismatch) {
      badges.append(createBadge(languageEditorT("entry.badges.placeholders"), "danger"));
    }
    if (newlineMismatch) {
      badges.append(createBadge(languageEditorT("entry.badges.newlines"), "danger"));
    }
    header.append(copy, badges);

    const sourceBlock = createElement("div", "language-editor-entry__column");
    sourceBlock.append(
      createElement("span", "language-editor-entry__label", languageEditorT("entry.source"))
    );
    const sourceValue = createElement("pre", "language-editor-entry__source");
    sourceValue.textContent =
      entry.sourceValue.trim() !== "" ? entry.sourceValue : languageEditorT("entry.noSource");
    sourceBlock.append(sourceValue);

    const targetBlock = createElement("div", "language-editor-entry__column");
    targetBlock.append(
      createElement("span", "language-editor-entry__label", languageEditorT("entry.target"))
    );
    const textarea = createElement("textarea", "language-editor-entry__textarea");
    textarea.dataset["translationKey"] = entry.key;
    textarea.value = draftValue;
    textarea.placeholder = entry.sourceValue;
    targetBlock.append(textarea);

    const body = createElement("div", "language-editor-entry__body");
    body.append(sourceBlock, targetBlock);
    card.append(header, body);
    fragment.append(card);
  });

  entryList.append(fragment);
  entryList
    .querySelectorAll<HTMLTextAreaElement>(".language-editor-entry__textarea")
    .forEach((textarea) => {
      resizeTextarea(textarea);
    });
}

function createMeta(refs: LanguageEditorRefs, state: LanguageEditorState): void {
  const meta = refs.meta;
  meta.replaceChildren();

  const currentInfo = createElement(
    "section",
    "glass-panel ds-surface-card ds-surface-card--stack language-editor-side-card"
  );
  currentInfo.append(createElement("div", "language-editor-side-card__head"));
  const infoHeader = currentInfo.querySelector(".language-editor-side-card__head");
  infoHeader?.append(
    createElement("h4", "language-editor-side-card__title", languageEditorT("meta.currentTitle"))
  );
  const infoBody = createElement("div", "language-editor-side-card__body");
  infoBody.append(
    createMetaLabel(
      languageEditorT("meta.localeLabel"),
      state.selectedLocale.trim() !== "" ? state.selectedLocale : "—"
    ),
    createMetaLabel(
      languageEditorT("meta.scopeLabel"),
      state.scope === "app" ? languageEditorT("scope.app") : languageEditorT("scope.rooms")
    ),
    createMetaLabel(
      languageEditorT("meta.runtimeKeyLabel"),
      hasActivePackageSelection(state) === false
        ? "—"
        : state.runtimePrefix === ""
          ? "app.*"
          : `${state.runtimePrefix}.*`
    )
  );

  if (state.scope === "app") {
    infoBody.append(
      createMetaLabel(
        languageEditorT("meta.sourceKindLabel"),
        languageEditorT(`meta.sourceKinds.${state.appSourceKind}`)
      ),
      createMetaLabel(languageEditorT("meta.savePathLabel"), state.savePath)
    );
  } else {
    const roomName = resolveRoomShellName(
      state.selectedRoomId ?? "",
      state.rooms.find((room) => room.id === state.selectedRoomId)?.name ?? "—"
    );
    infoBody.append(
      createMetaLabel(languageEditorT("meta.roomLabel"), roomName),
      createMetaLabel(languageEditorT("meta.sourcePathLabel"), state.sourcePath)
    );
  }
  currentInfo.append(infoBody);

  const targetSettings = createElement(
    "section",
    "glass-panel ds-surface-card ds-surface-card--stack language-editor-side-card"
  );
  const targetHeader = createElement("div", "language-editor-side-card__head");
  targetHeader.append(
    createElement(
      "h4",
      "language-editor-side-card__title",
      state.scope === "app"
        ? languageEditorT("meta.appSettingsTitle")
        : languageEditorT("meta.roomSettingsTitle")
    )
  );
  const targetBody = createElement(
    "div",
    "language-editor-side-card__body language-editor-form-grid"
  );

  if (state.scope === "app") {
    const appMetaDisabled =
      state.isLoading || state.isSaving || hasActivePackageSelection(state) === false;
    targetBody.append(
      createField(
        languageEditorT("meta.nativeNameLabel"),
        createInput("app-native-name", state.appLocaleDraft.nativeName, "", "text", appMetaDisabled)
      ),
      createField(
        languageEditorT("meta.englishNameLabel"),
        createInput(
          "app-english-name",
          state.appLocaleDraft.englishName,
          "",
          "text",
          appMetaDisabled
        )
      ),
      createField(
        languageEditorT("meta.directionLabel"),
        createSelect(
          "app-direction",
          [
            { label: languageEditorT("direction.ltr"), value: "ltr" },
            { label: languageEditorT("direction.rtl"), value: "rtl" },
          ],
          state.appLocaleDraft.direction,
          appMetaDisabled
        )
      ),
      createField(
        languageEditorT("meta.selectorLanguageLabel"),
        createSelect(
          "app-selector-language",
          [
            { label: languageEditorT("selector.tr"), value: "tr" },
            { label: languageEditorT("selector.en"), value: "en" },
          ],
          state.appLocaleDraft.selectorLanguage,
          appMetaDisabled
        )
      )
    );
  } else {
    targetBody.append(
      createElement("p", "language-editor-side-card__hint", languageEditorT("meta.roomHint"))
    );
  }
  targetSettings.append(targetHeader, targetBody);

  const createCard = createElement(
    "section",
    "glass-panel ds-surface-card ds-surface-card--stack language-editor-side-card"
  );
  const createHeader = createElement("div", "language-editor-side-card__head");
  createHeader.append(
    createElement("h4", "language-editor-side-card__title", languageEditorT("create.title")),
    createElement(
      "p",
      "language-editor-side-card__hint",
      state.scope === "app" ? languageEditorT("create.appHint") : languageEditorT("create.roomHint")
    )
  );
  const createBody = createElement(
    "div",
    "language-editor-side-card__body language-editor-form-grid"
  );
  createBody.append(
    createField(
      languageEditorT("create.localeLabel"),
      createInput(
        "create-locale",
        state.createDraft.locale,
        languageEditorT("create.localePlaceholder")
      ),
      { wide: state.scope !== "app" }
    )
  );
  if (state.scope === "app") {
    createBody.append(
      createField(
        languageEditorT("create.nativeNameLabel"),
        createInput("create-native-name", state.createDraft.nativeName)
      ),
      createField(
        languageEditorT("create.englishNameLabel"),
        createInput("create-english-name", state.createDraft.englishName)
      ),
      createField(
        languageEditorT("create.directionLabel"),
        createSelect(
          "create-direction",
          [
            { label: languageEditorT("direction.ltr"), value: "ltr" },
            { label: languageEditorT("direction.rtl"), value: "rtl" },
          ],
          state.createDraft.direction
        )
      ),
      createField(
        languageEditorT("create.selectorLanguageLabel"),
        createSelect(
          "create-selector-language",
          [
            { label: languageEditorT("selector.tr"), value: "tr" },
            { label: languageEditorT("selector.en"), value: "en" },
          ],
          state.createDraft.selectorLanguage
        )
      )
    );
  }
  const createAction = createElement(
    "button",
    "btn btn-secondary btn-sm",
    languageEditorT("create.button")
  );
  createAction.type = "button";
  createAction.dataset["action"] = "create-language";
  createAction.disabled =
    state.isLoading || state.isSaving || (state.scope === "room" && state.selectedRoomId === null);
  createBody.append(createAction);
  createCard.append(createHeader, createBody);

  meta.append(currentInfo, targetSettings, createCard);
}

function renderPanel(refs: LanguageEditorRefs, state: LanguageEditorState): void {
  createToolbar(refs, state);
  createSummary(refs, state);
  createFilters(refs, state);
  createCategories(refs, state);
  createMainHead(refs, state);
  createEntryList(refs, state);
  createMeta(refs, state);
}

function ensureSelectedCategory(state: LanguageEditorState): void {
  if (state.selectedCategory === null) {
    return;
  }
  if (state.selectedCategory === ALL_CATEGORIES_VALUE) {
    if (state.entries.length > 0) {
      return;
    }
    state.selectedCategory = null;
    return;
  }
  const exists = state.entries.some((entry) => entry.category === state.selectedCategory);
  if (exists) {
    return;
  }
  state.selectedCategory = null;
}

async function refreshSources(
  refs: LanguageEditorRefs,
  state: LanguageEditorState,
  options: { forceRoomRefresh?: boolean; reloadData?: boolean } = {}
): Promise<void> {
  state.isLoading = true;
  renderPanel(refs, state);

  try {
    const [appLanguageRoot, appLanguages] = await Promise.all([
      resolveAppLanguageRoot(),
      AppI18n.listLanguages(),
    ]);
    state.appLanguageRoot = appLanguageRoot;
    state.appLanguages = sortAppLanguages(appLanguages);

    if (options.forceRoomRefresh === true) {
      await RoomRegistry.refreshInstalledRooms();
    }
    state.rooms = RoomRegistry.getInstalledRooms().filter(
      (room) => typeof room.i18nBaseDir === "string" && room.i18nBaseDir.trim() !== ""
    );

    if (state.scope === "app") {
      const localeCandidates = sortLocales(
        state.appLanguages.map((language) => normalizeAppLanguage(language.locale))
      );
      const currentLocale =
        state.selectedLocale.trim() === "" ? "" : normalizeAppLanguage(state.selectedLocale);
      state.selectedLocale = localeCandidates.includes(currentLocale) ? currentLocale : "";
      state.appLocaleDraft = buildDefaultAppLocaleDraft(state.selectedLocale);
      state.roomLocales = [];
    } else {
      state.selectedRoomId =
        state.selectedRoomId !== null &&
        state.rooms.some((room) => room.id === state.selectedRoomId)
          ? state.selectedRoomId
          : null;

      if (state.selectedRoomId === null) {
        state.selectedLocale = "";
        state.roomLocales = [];
      } else {
        const selectedRoom = state.rooms.find((room) => room.id === state.selectedRoomId) ?? null;
        state.roomLocales =
          selectedRoom === null || typeof selectedRoom.i18nBaseDir !== "string"
            ? []
            : await listRoomLocales(selectedRoom.i18nBaseDir);
        const currentLocale =
          state.selectedLocale.trim() === "" ? "" : normalizeAppLanguage(state.selectedLocale);
        state.selectedLocale = state.roomLocales.includes(currentLocale) ? currentLocale : "";
      }
    }

    state.isLoaded = true;
    if (options.reloadData !== false && hasActivePackageSelection(state)) {
      await loadActiveScope(refs, state);
      return;
    }

    resetLoadedLocaleState(state, { preserveRoomLocales: state.scope === "room" });
  } finally {
    state.isLoading = false;
    renderPanel(refs, state);
  }
}

async function loadActiveScope(
  refs: LanguageEditorRefs,
  state: LanguageEditorState
): Promise<void> {
  if (hasActivePackageSelection(state) === false) {
    resetLoadedLocaleState(state, { preserveRoomLocales: state.scope === "room" });
    renderPanel(refs, state);
    return;
  }

  const token = ++loadToken;
  state.isLoading = true;
  renderPanel(refs, state);

  try {
    if (state.scope === "app") {
      const locale = normalizeAppLanguage(state.selectedLocale);
      const externalDir =
        state.appLanguageRoot === "" ? "" : joinPath(state.appLanguageRoot, locale);
      const [builtInCatalog, sourceCatalog, externalCatalog] = await Promise.all([
        loadBuiltInCatalog(locale),
        loadBuiltInCatalog("tr"),
        externalDir === ""
          ? Promise.resolve({})
          : loadLooseCatalog(joinPath(externalDir, "index.json")),
      ]);
      const descriptor = state.appLanguages.find(
        (language) => normalizeAppLanguage(language.locale) === locale
      ) ??
        getBuiltInLanguageDescriptor(locale) ?? {
          locale,
          nativeName: locale,
          direction: "ltr" as const,
          selectorLanguage: resolveSelectorLanguage(locale),
          source: "external" as const,
        };

      if (token !== loadToken) {
        return;
      }

      state.selectedLocale = locale;
      state.sourceCatalog = sourceCatalog;
      state.targetCatalog = mergeTranslationCatalogs([builtInCatalog, externalCatalog]);
      state.catalogShape = mergeTranslationCatalogs([state.sourceCatalog, state.targetCatalog]);
      state.entries = buildEntries(
        state.catalogShape,
        state.sourceCatalog,
        state.targetCatalog,
        ""
      );
      state.draftValues = buildDraftValues(state.catalogShape, state.targetCatalog);
      state.runtimePrefix = "";
      state.sourcePath = joinPath("shared/languages", locale, "index.json");
      state.savePath = externalDir;
      state.appSourceKind = descriptor.source === "external" ? "external" : "builtin";
      state.appLocaleDraft = {
        locale,
        nativeName: descriptor.nativeName,
        englishName: descriptor.englishName ?? "",
        direction: descriptor.direction ?? "ltr",
        selectorLanguage: descriptor.selectorLanguage ?? resolveSelectorLanguage(locale),
      };
      state.createDraft = buildDefaultAppLocaleDraft("");
      state.sourceMissing = false;
      ensureSelectedCategory(state);
      state.isLoaded = true;
      state.dirty = false;
      return;
    }

    const selectedRoom = state.rooms.find((room) => room.id === state.selectedRoomId) ?? null;
    if (selectedRoom === null || typeof selectedRoom.i18nBaseDir !== "string") {
      state.selectedLocale = "";
      resetLoadedLocaleState(state);
      state.isLoaded = true;
      return;
    }

    const roomLocales = await listRoomLocales(selectedRoom.i18nBaseDir);
    const selectedLocale = normalizeAppLanguage(state.selectedLocale);

    const sourcePath = joinPath(selectedRoom.i18nBaseDir, "tr.json");
    const savePath = joinPath(selectedRoom.i18nBaseDir, `${selectedLocale}.json`);
    const [sourceCatalog, targetCatalog] = await Promise.all([
      loadLooseCatalog(sourcePath),
      selectedLocale === "tr" ? loadLooseCatalog(sourcePath) : loadLooseCatalog(savePath),
    ]);

    if (token !== loadToken) {
      return;
    }

    state.roomLocales = roomLocales;
    state.selectedLocale = selectedLocale;
    state.sourceCatalog = sourceCatalog;
    state.targetCatalog = targetCatalog;
    state.catalogShape = mergeTranslationCatalogs([sourceCatalog, targetCatalog]);
    state.entries = buildEntries(
      state.catalogShape,
      sourceCatalog,
      targetCatalog,
      `rooms.${selectedRoom.id}`
    );
    state.draftValues = buildDraftValues(state.catalogShape, targetCatalog);
    state.runtimePrefix = `rooms.${selectedRoom.id}`;
    state.sourcePath = sourcePath;
    state.savePath = savePath;
    state.createDraft = buildDefaultAppLocaleDraft("");
    state.sourceMissing = Object.keys(sourceCatalog).length === 0;
    ensureSelectedCategory(state);
    state.isLoaded = true;
    state.dirty = false;
  } catch (error) {
    if (token === loadToken) {
      Toast.error(
        languageEditorT("toasts.loadError"),
        error instanceof Error ? error.message : String(error)
      );
    }
  } finally {
    if (token === loadToken) {
      state.isLoading = false;
      renderPanel(refs, state);
    }
  }
}

function confirmDiscardChanges(state: LanguageEditorState): boolean {
  if (state.dirty === false) {
    return true;
  }
  return window.confirm(languageEditorT("confirm.discard"));
}

async function saveActiveLocale(
  refs: LanguageEditorRefs,
  state: LanguageEditorState
): Promise<void> {
  if (state.isSaving || state.isLoading) {
    return;
  }

  state.isSaving = true;
  renderPanel(refs, state);

  try {
    const nextCatalog = buildCatalogFromShape(state.catalogShape, state.draftValues);
    let saved = false;

    if (state.scope === "app") {
      if (state.savePath.trim() === "") {
        throw new Error(languageEditorT("errors.savePathMissing"));
      }
      const manifest = buildAppManifest(state.appLocaleDraft);
      const [manifestSaved, catalogSaved] = await Promise.all([
        writeJsonFile(joinPath(state.savePath, "manifest.json"), manifest),
        writeJsonFile(joinPath(state.savePath, "index.json"), nextCatalog),
      ]);
      saved = manifestSaved && catalogSaved;
    } else {
      saved = await writeJsonFile(state.savePath, nextCatalog);
    }

    if (saved !== true) {
      throw new Error(languageEditorT("errors.saveFailed"));
    }

    state.targetCatalog = cloneCatalog(nextCatalog);
    state.entries = buildEntries(
      state.catalogShape,
      state.sourceCatalog,
      state.targetCatalog,
      state.runtimePrefix
    );
    state.draftValues = buildDraftValues(state.catalogShape, state.targetCatalog);
    state.dirty = false;

    if (state.scope === "app") {
      state.appLanguages = sortAppLanguages(await AppI18n.listLanguages());
      state.appSourceKind = "external";
    }
    if (state.scope === "room") {
      await AppI18n.reload();
    } else if (state.selectedLocale === normalizeAppLanguage(AppI18n.getLocale())) {
      await AppI18n.reload();
    }

    Toast.success(languageEditorT("toasts.saveSuccess"), state.selectedLocale);
  } catch (error) {
    Toast.error(
      languageEditorT("toasts.saveError"),
      error instanceof Error ? error.message : String(error)
    );
  } finally {
    state.isSaving = false;
    renderPanel(refs, state);
  }
}

async function createLocaleTemplate(
  refs: LanguageEditorRefs,
  state: LanguageEditorState
): Promise<void> {
  const requestedLocale = state.createDraft.locale.trim();
  if (requestedLocale === "") {
    Toast.error(languageEditorT("toasts.createError"), languageEditorT("errors.localeRequired"));
    return;
  }
  if (confirmDiscardChanges(state) === false) {
    return;
  }

  const locale = normalizeAppLanguage(requestedLocale);

  if (state.scope === "app") {
    if (state.appLanguageRoot.trim() === "") {
      Toast.error(languageEditorT("toasts.createError"), languageEditorT("errors.savePathMissing"));
      return;
    }
    const exists = state.appLanguages.some(
      (language) => normalizeAppLanguage(language.locale) === locale
    );
    if (exists) {
      Toast.error(languageEditorT("toasts.createError"), languageEditorT("errors.localeExists"));
      return;
    }
    const languageDir = joinPath(state.appLanguageRoot, locale);
    const blankCatalog = createBlankCatalog(await loadBuiltInCatalog("tr"));
    const manifest = buildAppManifest({
      ...state.createDraft,
      locale,
      nativeName:
        state.createDraft.nativeName.trim() !== "" ? state.createDraft.nativeName : locale,
      selectorLanguage: state.createDraft.selectorLanguage,
      direction: state.createDraft.direction,
    });
    const [manifestSaved, catalogSaved] = await Promise.all([
      writeJsonFile(joinPath(languageDir, "manifest.json"), manifest),
      writeJsonFile(joinPath(languageDir, "index.json"), blankCatalog),
    ]);
    if (manifestSaved !== true || catalogSaved !== true) {
      Toast.error(languageEditorT("toasts.createError"), languageEditorT("errors.createFailed"));
      return;
    }
    await refreshSources(refs, state, { reloadData: false });
    state.selectedLocale = locale;
    state.createDraft = buildDefaultAppLocaleDraft("");
    await loadActiveScope(refs, state);
    Toast.success(languageEditorT("toasts.createSuccess"), locale);
    return;
  }

  const selectedRoom = state.rooms.find((room) => room.id === state.selectedRoomId) ?? null;
  if (selectedRoom === null || typeof selectedRoom.i18nBaseDir !== "string") {
    Toast.error(languageEditorT("toasts.createError"), languageEditorT("errors.roomRequired"));
    return;
  }
  const locales = await listRoomLocales(selectedRoom.i18nBaseDir);
  if (locales.includes(locale)) {
    Toast.error(languageEditorT("toasts.createError"), languageEditorT("errors.localeExists"));
    return;
  }
  const sourceCatalog =
    Object.keys(state.sourceCatalog).length > 0
      ? state.sourceCatalog
      : await loadLooseCatalog(joinPath(selectedRoom.i18nBaseDir, "tr.json"));
  if (Object.keys(sourceCatalog).length === 0) {
    Toast.error(languageEditorT("toasts.createError"), languageEditorT("errors.sourceMissing"));
    return;
  }
  const created = await writeJsonFile(
    joinPath(selectedRoom.i18nBaseDir, `${locale}.json`),
    createBlankCatalog(sourceCatalog)
  );
  if (created !== true) {
    Toast.error(languageEditorT("toasts.createError"), languageEditorT("errors.createFailed"));
    return;
  }
  state.createDraft = buildDefaultAppLocaleDraft("");
  state.selectedLocale = locale;
  await loadActiveScope(refs, state);
  await AppI18n.reload();
  Toast.success(languageEditorT("toasts.createSuccess"), locale);
}

function attachToolbarListeners(refs: LanguageEditorRefs, state: LanguageEditorState): void {
  refs.toolbar.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const button = target.closest<HTMLButtonElement>("[data-action]");
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const action = button.dataset["action"] ?? "";
    if (action === "refresh") {
      if (confirmDiscardChanges(state) === false) {
        return;
      }
      void refreshSources(refs, state, {
        forceRoomRefresh: state.scope === "room",
        reloadData: true,
      });
      return;
    }
    if (action === "save") {
      void saveActiveLocale(refs, state);
      return;
    }
    if (action === "scope") {
      const nextScope = button.dataset["scope"] === "room" ? "room" : "app";
      if (nextScope === state.scope || confirmDiscardChanges(state) === false) {
        renderPanel(refs, state);
        return;
      }
      state.scope = nextScope;
      state.selectedLocale = "";
      state.selectedCategory = null;
      state.searchQuery = "";
      state.onlyMissing = false;
      state.onlyDifferent = false;
      resetLoadedLocaleState(state);
      void refreshSources(refs, state, { reloadData: false });
    }
  });

  refs.toolbar.addEventListener("change", (event) => {
    const target = event.target as HTMLSelectElement | null;
    const role = target?.dataset["role"] ?? "";
    if (target === null) {
      return;
    }

    if (role === "room") {
      if (confirmDiscardChanges(state) === false) {
        renderPanel(refs, state);
        return;
      }
      state.selectedRoomId = target.value.trim() !== "" ? target.value : null;
      state.selectedLocale = "";
      state.selectedCategory = null;
      resetLoadedLocaleState(state);
      void refreshSources(refs, state, { reloadData: false });
      return;
    }

    if (role === "locale") {
      if (confirmDiscardChanges(state) === false) {
        renderPanel(refs, state);
        return;
      }
      const nextLocale = target.value.trim();
      state.selectedLocale = nextLocale === "" ? "" : normalizeAppLanguage(nextLocale);
      state.selectedCategory = null;
      if (state.selectedLocale === "") {
        resetLoadedLocaleState(state, { preserveRoomLocales: state.scope === "room" });
        renderPanel(refs, state);
        return;
      }
      void loadActiveScope(refs, state);
    }
  });
}

function attachFilterListeners(refs: LanguageEditorRefs, state: LanguageEditorState): void {
  refs.filters.addEventListener("input", (event) => {
    const target = event.target as HTMLInputElement | null;
    if (target?.dataset["role"] !== "search") {
      return;
    }
    state.searchQuery = target.value;
    createCategories(refs, state);
    createMainHead(refs, state);
    createEntryList(refs, state);
    createSummary(refs, state);
  });

  refs.filters.addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement | null;
    const role = target?.dataset["role"] ?? "";
    if (role === "only-missing") {
      state.onlyMissing = target?.checked === true;
    } else if (role === "only-different") {
      state.onlyDifferent = target?.checked === true;
    } else {
      return;
    }
    createCategories(refs, state);
    createMainHead(refs, state);
    createEntryList(refs, state);
    createSummary(refs, state);
  });
}

function attachCategoryListeners(refs: LanguageEditorRefs, state: LanguageEditorState): void {
  refs.categories.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const button = target.closest<HTMLButtonElement>("[data-category]");
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    const nextCategory = button.dataset["category"] ?? "";
    state.selectedCategory = nextCategory.trim() === "" ? null : nextCategory;
    createCategories(refs, state);
    createMainHead(refs, state);
    createEntryList(refs, state);
    createSummary(refs, state);
  });
}

function attachEntryListeners(refs: LanguageEditorRefs, state: LanguageEditorState): void {
  refs.entryList.addEventListener("input", (event) => {
    const target = event.target as HTMLTextAreaElement | null;
    const translationKey = target?.dataset["translationKey"];
    if (target === null || translationKey === undefined) {
      return;
    }
    state.draftValues[translationKey] = target.value;
    state.dirty = true;
    resizeTextarea(target);
    createSummary(refs, state);
    if (state.onlyMissing || state.onlyDifferent) {
      createCategories(refs, state);
      createMainHead(refs, state);
      createEntryList(refs, state);
    }
  });
}

function attachMetaListeners(refs: LanguageEditorRefs, state: LanguageEditorState): void {
  refs.meta.addEventListener("input", (event) => {
    const target = event.target as HTMLInputElement | HTMLSelectElement | null;
    const role = target?.dataset["role"] ?? "";
    if (role === "") {
      return;
    }

    if (role === "app-native-name") {
      state.appLocaleDraft.nativeName = (target as HTMLInputElement).value;
      state.dirty = true;
    } else if (role === "app-english-name") {
      state.appLocaleDraft.englishName = (target as HTMLInputElement).value;
      state.dirty = true;
    } else if (role === "create-locale") {
      state.createDraft.locale = (target as HTMLInputElement).value;
    } else if (role === "create-native-name") {
      state.createDraft.nativeName = (target as HTMLInputElement).value;
    } else if (role === "create-english-name") {
      state.createDraft.englishName = (target as HTMLInputElement).value;
    } else {
      return;
    }
    createSummary(refs, state);
  });

  refs.meta.addEventListener("change", (event) => {
    const target = event.target as HTMLSelectElement | null;
    const role = target?.dataset["role"] ?? "";
    if (role === "app-direction") {
      state.appLocaleDraft.direction = target?.value === "rtl" ? "rtl" : "ltr";
      state.dirty = true;
    } else if (role === "app-selector-language") {
      state.appLocaleDraft.selectorLanguage = target?.value === "tr" ? "tr" : "en";
      state.dirty = true;
    } else if (role === "create-direction") {
      state.createDraft.direction = target?.value === "rtl" ? "rtl" : "ltr";
    } else if (role === "create-selector-language") {
      state.createDraft.selectorLanguage = target?.value === "tr" ? "tr" : "en";
    } else {
      return;
    }
    createSummary(refs, state);
  });

  refs.meta.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    const button = target?.closest<HTMLButtonElement>("[data-action='create-language']");
    if (button === null) {
      return;
    }
    void createLocaleTemplate(refs, state);
  });
}

export function setupSettingsLanguagesPanel(): void {
  if (initialized) {
    return;
  }

  const refs = getRefs();
  if (refs === null) {
    return;
  }

  const state = createLanguageEditorState();

  attachToolbarListeners(refs, state);
  attachFilterListeners(refs, state);
  attachCategoryListeners(refs, state);
  attachEntryListeners(refs, state);
  attachMetaListeners(refs, state);

  RoomRegistry.subscribe((rooms) => {
    if (state.isOpen === false || state.dirty) {
      return;
    }
    state.rooms = rooms.filter(
      (room): room is InstalledRoomRecord =>
        typeof room.i18nBaseDir === "string" && room.i18nBaseDir.trim() !== ""
    );
    renderPanel(refs, state);
  });

  AppI18n.subscribe(() => {
    if (state.isOpen) {
      renderPanel(refs, state);
    }
  });

  registerSettingsPanelLifecycle("languages", {
    onActivate: () => {
      state.isOpen = true;
      if (state.isLoaded) {
        renderPanel(refs, state);
        return;
      }
      // NOTE: The panel should open from startup cache; forcing room hydration here can stall the overlay.
      void refreshSources(refs, state, { reloadData: false });
    },
    onDeactivate: () => {
      state.isOpen = false;
    },
  });

  renderPanel(refs, state);
  initialized = true;
}
