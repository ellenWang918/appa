import { app, BrowserWindow, Menu, dialog, shell } from "electron";
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { startLocalApp } from "./local-server.mjs";
import { isAllowedExternal } from "./policy.mjs";

app.setName("Appa");
// Retain the original profile and installer identity across the Appa rename.
const dataRoot = path.join(app.getPath("appData"), "AI Goal Calendar");
mkdirSync(dataRoot, { recursive: true });
app.setPath("userData", dataRoot);
app.setPath("sessionData", dataRoot);
app.setAppUserModelId("com.ellenwang918.aigoalcalendar");
app.commandLine.appendSwitch("force-renderer-accessibility");
const hasLock = app.requestSingleInstanceLock();
let mainWindow, runtime;
if (!hasLock) app.quit();
else {
  app.on("second-instance", () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.show();
    mainWindow?.focus();
  });
  app.whenReady().then(async () => {
    try {
      const deviceSecret = randomBytes(32).toString("base64url");
      runtime = await startLocalApp({
        staticRoot: path.join(app.getAppPath(), "dist", "client"),
        dataRoot: app.getPath("userData"),
        deviceSecret,
      });
      mainWindow = new BrowserWindow({
        width: 1440,
        height: 980,
        minWidth: 800,
        minHeight: 640,
        title: "Appa",
        backgroundColor: "#ffffff",
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
          preload: path.join(app.getAppPath(), "desktop", "preload.cjs"),
          partition: "persist:goal-calendar",
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
          webviewTag: false,
        },
      });
      const contents = mainWindow.webContents;
      contents.session.setPermissionRequestHandler(
        (_contents, _permission, callback) => callback(false),
      );
      contents.session.setPermissionCheckHandler(() => false);
      await contents.session.cookies.set({
        url: runtime.origin,
        name: "calendar-device",
        value: deviceSecret,
        httpOnly: true,
        sameSite: "strict",
        path: "/",
      });
      const openExternal = (url) => {
        if (isAllowedExternal(url))
          shell.openExternal(url).catch(() => {
            dialog.showErrorBox(
              "Could not open your browser",
              "Open your default browser and try connecting again.",
            );
          });
      };
      contents.setWindowOpenHandler(({ url }) => {
        openExternal(url);
        return { action: "deny" };
      });
      contents.on("will-navigate", (event, url) => {
        if (new URL(url).origin !== runtime.origin) {
          event.preventDefault();
          openExternal(url);
        }
      });
      contents.on("will-attach-webview", (event) => event.preventDefault());
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          { label: "File", submenu: [{ role: "quit" }] },
          {
            label: "Edit",
            submenu: [
              { role: "undo" },
              { role: "redo" },
              { type: "separator" },
              { role: "cut" },
              { role: "copy" },
              { role: "paste" },
              { role: "selectAll" },
            ],
          },
          {
            label: "View",
            submenu: [
              { role: "reload" },
              { role: "resetZoom" },
              { role: "zoomIn" },
              { role: "zoomOut" },
              { role: "togglefullscreen" },
            ],
          },
          {
            label: "Help",
            submenu: [
              {
                label: "Source code and releases",
                click: () =>
                  openExternal(
                    "https://github.com/ellenWang918/appa",
                  ),
              },
              {
                label: "About Appa",
                click: () =>
                  dialog.showMessageBox(mainWindow, {
                    type: "info",
                    title: "Appa",
                    message: `Appa ${app.getVersion()}`,
                    detail:
                      "A local, open-source personal planner. Connect your own eligible ChatGPT account for AI planning. Manual planning works offline. Calendar data is saved on this computer; use Settings & backup to keep a copy.",
                  }),
              },
            ],
          },
        ]),
      );
      mainWindow.once("ready-to-show", () => mainWindow.show());
      await mainWindow.loadURL(runtime.origin);
    } catch (error) {
      dialog.showErrorBox("Appa could not start", error.message);
      app.quit();
    }
  });
  app.on("window-all-closed", () => app.quit());
  app.on("will-quit", () => runtime?.close());
}
