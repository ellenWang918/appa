import electron = require("electron");
// A read-only environment flag; no Node, file, credential or IPC APIs are exposed.
electron.contextBridge.exposeInMainWorld("goalCalendarDesktop", {
  isDesktop: true,
});
