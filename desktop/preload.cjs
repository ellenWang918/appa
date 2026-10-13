const { contextBridge } = require("electron");
// A read-only environment flag; no Node, file, credential or IPC APIs are exposed.
contextBridge.exposeInMainWorld("goalCalendarDesktop", { isDesktop: true });
