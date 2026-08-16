/* global console */
const { contextBridge, ipcRenderer } = require("electron");

const ROOM_HOST_MESSAGE_CHANNEL = "room-host-message";
const hostMessageHandlers = new Set();
const pendingHostEvents = [];
let pendingHostFlushTimer = null;
let pendingAutoRoomReadyTimer = null;
let explicitRoomReadySent = false;

function trySendToHost(channel, payload) {
  ipcRenderer.sendToHost(channel, payload);
}

function schedulePendingHostFlush() {
  if (pendingHostFlushTimer !== null) {
    return;
  }

  pendingHostFlushTimer = globalThis.setTimeout(() => {
    pendingHostFlushTimer = null;
    flushPendingHostEvents();
  }, 50);
}

function flushPendingHostEvents() {
  if (pendingHostEvents.length === 0) {
    return;
  }

  while (pendingHostEvents.length > 0) {
    const next = pendingHostEvents[0];
    try {
      trySendToHost(next.channel, next.payload);
      pendingHostEvents.shift();
    } catch {
      schedulePendingHostFlush();
      return;
    }
  }
}

function emitToHost(channel, payload = {}) {
  try {
    trySendToHost(channel, payload);
    return true;
  } catch {
    pendingHostEvents.push({ channel, payload });
    schedulePendingHostFlush();
    return true;
  }
}

function clearPendingAutoRoomReady() {
  if (pendingAutoRoomReadyTimer === null) {
    return;
  }

  globalThis.clearTimeout(pendingAutoRoomReadyTimer);
  pendingAutoRoomReadyTimer = null;
}

function normalizeName(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function addHostMessageHandler(callback) {
  if (typeof callback !== "function") {
    return () => {};
  }

  hostMessageHandlers.add(callback);
  return () => {
    hostMessageHandlers.delete(callback);
  };
}

ipcRenderer.on(ROOM_HOST_MESSAGE_CHANNEL, (_event, payload) => {
  for (const handler of hostMessageHandlers) {
    try {
      handler(payload);
    } catch (error) {
      console.error("Room host message handler failed.", {
        type: payload && typeof payload.type === "string" ? payload.type : null,
        reason: payload && typeof payload.reason === "string" ? payload.reason : null,
        error: error instanceof Error ? error.stack || error.message : String(error),
      });
      continue;
    }
  }
});

contextBridge.exposeInMainWorld("electronAPI", {
  showOpenDialog: (options) => ipcRenderer.invoke("show-open-dialog", options),
  openPath: (path) => ipcRenderer.invoke("open-path", path),
});

contextBridge.exposeInMainWorld("roomAPI", {
  ready: (payload = {}) => {
    explicitRoomReadySent = true;
    clearPendingAutoRoomReady();
    return emitToHost("room-ready", payload);
  },
  sendCommand: (command, payload = {}) => {
    const normalized = normalizeName(command);
    if (normalized === "") {
      return false;
    }
    return emitToHost("room-command", {
      command: normalized,
      payload,
    });
  },
  sendEvent: (type, payload = {}) => {
    const normalized = normalizeName(type);
    if (normalized === "") {
      return false;
    }
    return emitToHost("room-event", {
      type: normalized,
      payload,
    });
  },
  close: () => emitToHost("room-close", { stage: "ui-request" }),
  onHostMessage: (callback) => addHostMessageHandler(callback),
  offHostMessage: (callback) => {
    if (typeof callback !== "function") {
      return;
    }
    hostMessageHandlers.delete(callback);
  },
});

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("load", () => {
    if (explicitRoomReadySent) {
      return;
    }

    clearPendingAutoRoomReady();
    // Delay the preload fallback so explicit room bootstraps do not hydrate twice.
    pendingAutoRoomReadyTimer = globalThis.setTimeout(() => {
      pendingAutoRoomReadyTimer = null;
      if (explicitRoomReadySent) {
        return;
      }

      emitToHost("room-ready", {
        stage: "load",
        url: globalThis.location?.href ?? "",
      });
    }, 100);
  });
}
