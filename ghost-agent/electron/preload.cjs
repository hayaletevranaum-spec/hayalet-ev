const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  ghostServerStatus: () => ipcRenderer.invoke("ghost-server-status"),
  ghostServerConnect: (payload) => ipcRenderer.invoke("ghost-server-connect", payload),
  ghostServerStop: () => ipcRenderer.invoke("ghost-server-stop"),
  ghostOpenTarget: (target) => ipcRenderer.invoke("ghost-open-target", target),
  ghostExitAction: (action) => ipcRenderer.invoke("ghost-exit-action", action),
  showOpenDialog: (options) => ipcRenderer.invoke("show-open-dialog", options),
  fmTempPath: (prefix, ext) => ipcRenderer.invoke("fm-temp-path", prefix, ext),
  fmWriteFileAtomic: (payload) => ipcRenderer.invoke("fm-write-file-atomic", payload),
  ghostLog: (payload) => ipcRenderer.invoke("ghost-log", payload),
  sendToHost: () => {},
});
