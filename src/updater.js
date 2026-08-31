const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const { autoUpdater } = require("electron-updater");

const RELEASE_URL = "https://github.com/EliteMay/osu-hub/releases/latest";
const AUTO_CHECK_DELAY_MS = 2500;

let checkPromise = null;
let installInProgress = false;
let promptedVersion = "";
let updateState = {
  state: "idle",
  currentVersion: app.getVersion(),
  latestVersion: "",
  progress: 0,
  message: ""
};

function getMainWindow() {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
}

function getUpdaterLogPath() {
  return path.join(app.getPath("userData"), "logs", "updater.log");
}

function appendUpdaterLog(message) {
  try {
    const logPath = getUpdaterLogPath();
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${new Date().toISOString()} ${String(message || "")}\n`, "utf8");
  } catch {}
}

function setWindowProgress(value) {
  for (const win of BrowserWindow.getAllWindows()) {
    try { win.setProgressBar(value); } catch {}
  }
}

function setState(next) {
  updateState = { ...updateState, ...next };
  appendUpdaterLog(`${updateState.state}: ${updateState.message || ""}`);
  for (const win of BrowserWindow.getAllWindows()) {
    try { win.webContents.send("update:status", updateState); } catch {}
  }
  return updateState;
}

function readAutoCheckEnabled() {
  try {
    const configPath = path.join(app.getPath("userData"), "config.json");
    if (!fs.existsSync(configPath)) return true;
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return config?.updateCheck?.enabled !== false;
  } catch {
    return true;
  }
}

function parseVersion(value) {
  return String(value || "")
    .replace(/^v/i, "")
    .split("-")[0]
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
}

function isNewerVersion(candidate, current) {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  const length = Math.max(a.length, b.length, 3);
  for (let index = 0; index < length; index += 1) {
    if ((a[index] || 0) > (b[index] || 0)) return true;
    if ((a[index] || 0) < (b[index] || 0)) return false;
  }
  return false;
}

async function showUpdateFailure(error) {
  const win = getMainWindow();
  const message = error?.message || String(error || "不明なエラー");
  appendUpdaterLog(`install failed: ${message}`);
  const result = await dialog.showMessageBox(win || undefined, {
    type: "error",
    title: "アップデートに失敗しました",
    message: "自動アップデートを完了できませんでした。",
    detail: `${message}\n\n現在のバージョンはそのまま利用できます。必要ならGitHub Releasesから手動で更新してください。`,
    buttons: ["Releaseページを開く", "閉じる"],
    defaultId: 1,
    cancelId: 1,
    noLink: true
  });
  if (result.response === 0) await shell.openExternal(RELEASE_URL);
}

async function checkForAppUpdate({ prompt = false } = {}) {
  if (!app.isPackaged) {
    return {
      ok: true,
      skipped: true,
      updateAvailable: false,
      latestVersion: app.getVersion(),
      downloadUrl: "",
      logs: [{ type: "info", text: "開発モードでは自動更新を実行しません。配布版Setup.exeで確認してください。" }]
    };
  }

  if (checkPromise) return checkPromise;

  checkPromise = (async () => {
    try {
      setState({ state: "checking", progress: 0, message: "アップデートを確認しています。" });
      const result = await autoUpdater.checkForUpdates();
      const latestVersion = result?.updateInfo?.version || updateState.latestVersion || app.getVersion();
      const updateAvailable = isNewerVersion(latestVersion, app.getVersion());

      if (updateAvailable) {
        setState({ state: "available", latestVersion, progress: 0, message: `v${latestVersion} が利用できます。` });
        if (prompt) await promptForUpdate(latestVersion);
      } else {
        setState({ state: "current", latestVersion: app.getVersion(), progress: 0, message: "最新版です。" });
      }

      return {
        ok: true,
        updateAvailable,
        latestVersion,
        downloadUrl: updateAvailable ? RELEASE_URL : "",
        logs: [
          { type: "info", text: `現在の版: ${app.getVersion()}` },
          { type: "info", text: `公開版: ${latestVersion}` },
          { type: updateAvailable ? "success" : "success", text: updateAvailable ? "新しい版があります。『今すぐ更新』で自動更新できます。" : "最新版です。" }
        ]
      };
    } catch (error) {
      const message = error?.message || String(error);
      setState({ state: "error", progress: 0, message: `更新確認に失敗: ${message}` });
      return {
        ok: false,
        updateAvailable: false,
        latestVersion: "",
        downloadUrl: RELEASE_URL,
        logs: [
          { type: "error", text: `アップデート確認に失敗: ${message}` },
          { type: "info", text: "現在の版はそのまま利用できます。必要ならReleaseページから手動更新できます。" }
        ]
      };
    } finally {
      checkPromise = null;
    }
  })();

  return checkPromise;
}

async function downloadAndInstall() {
  if (installInProgress) {
    return { ok: true, message: "アップデートをダウンロード中です。" };
  }

  if (!app.isPackaged) {
    return { ok: false, message: "開発モードでは自動更新できません。" };
  }

  let latestVersion = updateState.latestVersion;
  if (!latestVersion || !isNewerVersion(latestVersion, app.getVersion())) {
    const checked = await checkForAppUpdate({ prompt: false });
    if (!checked.ok || !checked.updateAvailable) {
      return { ok: checked.ok, message: checked.ok ? "最新版です。" : "更新確認に失敗しました。" };
    }
    latestVersion = checked.latestVersion;
  }

  installInProgress = true;
  try {
    setState({ state: "downloading", latestVersion, progress: 0, message: `v${latestVersion} をダウンロードしています。` });
    await autoUpdater.downloadUpdate();
    setState({ state: "installing", latestVersion, progress: 100, message: "ダウンロード完了。再起動して更新します。" });
    setWindowProgress(-1);
    setTimeout(() => autoUpdater.quitAndInstall(false, true), 500);
    return { ok: true, message: `v${latestVersion} をインストールするため再起動します。` };
  } catch (error) {
    installInProgress = false;
    setWindowProgress(-1);
    setState({ state: "error", progress: 0, message: `更新に失敗: ${error?.message || error}` });
    await showUpdateFailure(error);
    return { ok: false, message: `自動更新に失敗しました: ${error?.message || error}` };
  }
}

async function promptForUpdate(version) {
  if (!version || promptedVersion === version || installInProgress) return;
  promptedVersion = version;
  const win = getMainWindow();
  const result = await dialog.showMessageBox(win || undefined, {
    type: "info",
    title: "osu Setup Launcher アップデート",
    message: `新しいバージョン v${version} があります。`,
    detail: "「今すぐ更新」を押すとダウンロード後にアプリを再起動して更新します。設定はuserData側に保存されているため維持されます。",
    buttons: ["今すぐ更新", "あとで"],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  });
  if (result.response === 0) await downloadAndInstall();
}

function configureAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on("checking-for-update", () => {
    setState({ state: "checking", progress: 0, message: "アップデートを確認しています。" });
  });

  autoUpdater.on("update-available", (info) => {
    const version = info?.version || "";
    setState({ state: "available", latestVersion: version, progress: 0, message: `v${version} が利用できます。` });
  });

  autoUpdater.on("update-not-available", () => {
    setState({ state: "current", latestVersion: app.getVersion(), progress: 0, message: "最新版です。" });
  });

  autoUpdater.on("download-progress", (progress) => {
    const percent = Math.max(0, Math.min(100, Number(progress?.percent) || 0));
    setWindowProgress(percent / 100);
    setState({ state: "downloading", progress: percent, message: `アップデートをダウンロード中: ${percent.toFixed(0)}%` });
  });

  autoUpdater.on("update-downloaded", (info) => {
    setWindowProgress(1);
    setState({ state: "downloaded", latestVersion: info?.version || updateState.latestVersion, progress: 100, message: "アップデートのダウンロードが完了しました。" });
  });

  autoUpdater.on("error", (error) => {
    const message = error?.message || String(error);
    setWindowProgress(-1);
    setState({ state: "error", progress: 0, message: `Updater error: ${message}` });
  });
}

for (const channel of ["update:check", "update:open"]) {
  try { ipcMain.removeHandler(channel); } catch {}
}

ipcMain.handle("update:check", async () => checkForAppUpdate({ prompt: false }));
ipcMain.handle("update:open", async (_event, url) => {
  if (updateState.latestVersion && isNewerVersion(updateState.latestVersion, app.getVersion())) {
    return downloadAndInstall();
  }
  const target = /^https?:\/\//i.test(String(url || "")) ? String(url) : RELEASE_URL;
  await shell.openExternal(target);
  return { ok: true, message: "Releaseページを開きました。" };
});

app.whenReady().then(() => {
  configureAutoUpdater();
  setTimeout(async () => {
    if (!readAutoCheckEnabled()) return;
    const result = await checkForAppUpdate({ prompt: false });
    if (result.ok && result.updateAvailable) await promptForUpdate(result.latestVersion);
  }, AUTO_CHECK_DELAY_MS);
});
