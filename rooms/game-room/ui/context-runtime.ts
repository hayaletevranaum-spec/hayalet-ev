/* global document, window */

(function (global: GameRoomUiGlobal) {
  type UnknownRecord = Record<string, unknown>;
  type BootstrapCopy = GameRoomBootstrapCopy;
  type FeatureRecord = GameRoomFeatureRecord;
  type SlotState = {
    slotId: string;
    label: string;
    nickname: string;
    avatar: string | null;
    assigned: boolean;
    connected: boolean;
    dispatchable: boolean;
    ready: boolean;
    state: string;
    urlExcluded: boolean;
    providerId: string | null;
    accountId: string | null;
    remoteUserId: string | null;
  };
  type InviteEntry = {
    roomId: string;
    featureId: string;
    inviteId: string;
    remoteUserId: string;
    nickname: string;
    senderEmail: string;
    note: string;
    starter: string;
    localSessionId: string;
    conversationId: string;
    sentAt: number | null;
  };
  type ContextState = {
    room: {
      id: string;
      name: string;
    };
    features: FeatureRecord[];
    activeFeature: FeatureRecord;
    user: {
      nickname: string;
      avatar: string | null;
    };
    slots: {
      ai1: SlotState;
      ai2: SlotState;
      us1: SlotState;
    };
  };
  type ContextRuntimeDeps = {
    roomId?: unknown;
    featureId?: unknown;
    bootstrapCopy?: unknown;
    featureRecords?: unknown;
  };

  function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === "object" && value !== null && Array.isArray(value) === false;
  }

  function readString(value: unknown, fallback: string): string {
    return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
  }

  function createFeatureRecord(candidate: unknown, fallback: FeatureRecord): FeatureRecord {
    const source = isRecord(candidate) ? candidate : {};
    return {
      id: readString(source["id"], fallback.id),
      name: readString(source["name"], fallback.name),
      description: readString(source["description"], fallback.description),
    };
  }

  const registry: GameRoomUiContextRuntimeRegistry =
    global.GameRoomUiContextRuntime || (global.GameRoomUiContextRuntime = {});

  registry.createGameRoomUiContextRuntime = function createGameRoomUiContextRuntime(
    deps: GameRoomUnknownRecord
  ): GameRoomUiContextRuntimeLike {
    const runtimeDeps = isRecord(deps) ? (deps as ContextRuntimeDeps) : {};
    const ROOM_ID = readString(runtimeDeps["roomId"], "game-room");
    const FEATURE_ID = readString(runtimeDeps["featureId"], "backgammon");
    const bootstrapCopy = isRecord(runtimeDeps["bootstrapCopy"])
      ? (runtimeDeps["bootstrapCopy"] as BootstrapCopy)
      : {};
    const defaultFeatureRecord: FeatureRecord = {
      id: FEATURE_ID,
      name: "Tavla",
      description: "",
    };
    const featureRecords: FeatureRecord[] = Array.isArray(runtimeDeps["featureRecords"])
      ? runtimeDeps["featureRecords"].map((entry) =>
          createFeatureRecord(entry, defaultFeatureRecord)
        )
      : [defaultFeatureRecord];
    const fallbackFeatureRecord = featureRecords[0] || {
      id: FEATURE_ID,
      name: "Tavla",
      description: "",
    };
    const featureCatalog = new Map<string, FeatureRecord>(
      featureRecords.map((entry): [string, FeatureRecord] => [entry.id, entry])
    );

    function readBootstrapText(locale: string, key: string, fallback: string): string {
      const localeCopy = isRecord(bootstrapCopy[locale]) ? bootstrapCopy[locale] : {};
      return readString(localeCopy[key], fallback);
    }

    function normalizeFeatureId(value: unknown): string {
      const normalized = readString(value, fallbackFeatureRecord.id);
      return featureCatalog.has(normalized) ? normalized : fallbackFeatureRecord.id;
    }

    function resolveLocale(value: unknown): string {
      return typeof value === "string" && value.toLowerCase().startsWith("tr") ? "tr" : "en";
    }

    function normalizePresentationMode(value: unknown): string {
      return value === "scene-view" ? "scene-view" : "classic";
    }

    function normalizeUiScale(value: unknown): number {
      const numeric =
        typeof value === "number"
          ? value
          : typeof value === "string"
            ? Number.parseInt(value, 10)
            : Number.NaN;
      if (!Number.isFinite(numeric) || numeric <= 0) {
        return 100;
      }
      return Math.max(70, Math.min(130, Math.round(numeric)));
    }

    function createSlot(slotId: string): SlotState {
      return {
        slotId: slotId,
        label: slotId.toUpperCase(),
        nickname: slotId.toUpperCase(),
        avatar: null,
        assigned: false,
        connected: false,
        dispatchable: false,
        ready: false,
        state: "empty",
        urlExcluded: false,
        providerId: null,
        accountId: null,
        remoteUserId: null,
      };
    }

    function createInviteEntry(): InviteEntry {
      return {
        roomId: ROOM_ID,
        featureId: FEATURE_ID,
        inviteId: "",
        remoteUserId: "",
        nickname: "US1",
        senderEmail: "",
        note: "",
        starter: "user",
        localSessionId: "",
        conversationId: "",
        sentAt: null,
      };
    }

    function createContext(): ContextState {
      return {
        room: {
          id: ROOM_ID,
          name: readBootstrapText(
            "en",
            "roomTitle",
            readBootstrapText("tr", "roomTitle", "Game Room")
          ),
        },
        features: featureRecords.slice(),
        activeFeature: { ...fallbackFeatureRecord },
        user: {
          nickname: readBootstrapText(
            "en",
            "userLabel",
            readBootstrapText("tr", "userLabel", "User")
          ),
          avatar: null,
        },
        slots: {
          ai1: createSlot("ai1"),
          ai2: createSlot("ai2"),
          us1: createSlot("us1"),
        },
      };
    }

    function readPath(source: unknown, path: string[]): string | null {
      let current = source;
      for (let index = 0; index < path.length; index += 1) {
        const key = path[index];
        if (key === undefined) {
          return null;
        }
        if (isRecord(current) === false) {
          return null;
        }
        current = current[key];
      }
      return typeof current === "string" ? current : null;
    }

    function createElement(
      tagName: string,
      className?: string | null,
      textContent?: string | null
    ) {
      const element = document.createElement(tagName);
      if (className) {
        element.className = className;
      }
      if (textContent !== undefined) {
        element.textContent = textContent;
      }
      return element;
    }

    function normalizeSlot(candidate: unknown, slotId: string): SlotState {
      const source = isRecord(candidate) ? candidate : {};
      const assigned = source["assigned"] === true;
      const connected = source["connected"] === true;
      const urlExcluded = source["urlExcluded"] === true;
      const ready = source["ready"] === true || (assigned && connected && urlExcluded !== true);
      const dispatchable = source["dispatchable"] === true || ready;
      return {
        slotId: slotId,
        label: readString(source["label"], slotId.toUpperCase()),
        nickname: readString(source["nickname"], slotId.toUpperCase()),
        avatar: readString(source["avatar"], "") || null,
        assigned,
        connected,
        dispatchable,
        ready,
        state: readString(source["state"], "empty"),
        urlExcluded,
        providerId: readString(source["providerId"], "") || null,
        accountId: readString(source["accountId"], "") || null,
        remoteUserId: readString(source["remoteUserId"], "") || null,
      };
    }

    function normalizeContext(payload: unknown): ContextState {
      const source = isRecord(payload) ? payload : {};
      const presenceSource = isRecord(source["presence"]) ? source["presence"] : {};
      const slotsSource = isRecord(presenceSource["slots"])
        ? presenceSource["slots"]
        : isRecord(source["slots"])
          ? source["slots"]
          : {};
      const roomSource = isRecord(source["room"]) ? source["room"] : {};
      const userSource = isRecord(presenceSource["user"])
        ? presenceSource["user"]
        : isRecord(source["user"])
          ? source["user"]
          : {};
      const features: FeatureRecord[] = Array.isArray(source["features"])
        ? source["features"].map(function (feature) {
            const featureSource = isRecord(feature) ? feature : {};
            const id = normalizeFeatureId(featureSource["id"]);
            const fallbackFeature = featureCatalog.get(id) || fallbackFeatureRecord;
            return createFeatureRecord(featureSource, {
              id,
              name: fallbackFeature.name,
              description: fallbackFeature.description,
            });
          })
        : featureRecords.slice();
      const activeFeatureSource = isRecord(source["activeFeature"]) ? source["activeFeature"] : {};
      const activeFeatureId = normalizeFeatureId(activeFeatureSource["id"]);
      const activeFallback = featureCatalog.get(activeFeatureId) || fallbackFeatureRecord;
      const activeFeature = features.find(function (feature) {
        return feature.id === activeFeatureId;
      }) || {
        id: activeFeatureId,
        name: activeFallback.name,
        description: activeFallback.description,
      };

      return {
        room: {
          id: readString(roomSource["id"], ROOM_ID),
          name: readString(
            roomSource["name"],
            readBootstrapText("en", "roomTitle", readBootstrapText("tr", "roomTitle", "Game Room"))
          ),
        },
        features: features,
        activeFeature,
        user: {
          nickname: readString(
            userSource["nickname"],
            readBootstrapText("en", "userLabel", readBootstrapText("tr", "userLabel", "User"))
          ),
          avatar: readString(userSource["avatar"], "") || null,
        },
        slots: {
          ai1: normalizeSlot(slotsSource["ai1"], "ai1"),
          ai2: normalizeSlot(slotsSource["ai2"], "ai2"),
          us1: normalizeSlot(slotsSource["us1"], "us1"),
        },
      };
    }

    return {
      createContext: createContext,
      createElement: createElement,
      createInviteEntry: createInviteEntry,
      createSlot: createSlot,
      normalizeContext: normalizeContext,
      normalizePresentationMode: normalizePresentationMode,
      normalizeUiScale: normalizeUiScale,
      normalizeSlot: normalizeSlot,
      readPath: readPath,
      resolveLocale: resolveLocale,
    };
  };
})(window as unknown as GameRoomUiGlobal);
