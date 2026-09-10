const { contextBridge, ipcRenderer } = require("electron");

let svclInstallPromise = null;

function needsSvclInstall(logs) {
  return Array.isArray(logs) && logs.some((log) => String(log?.text || "").includes("SVCLが見つかりません"));
}

async function listAudioDevicesWithAutoSvcl(audioSwitch) {
  const firstLogs = await ipcRenderer.invoke("audio:list", audioSwitch);
  if (!needsSvclInstall(firstLogs)) return firstLogs;

  if (!svclInstallPromise) {
    svclInstallPromise = ipcRenderer.invoke("tools:installSvcl")
      .finally(() => { svclInstallPromise = null; });
  }

  const install = await svclInstallPromise;
  if (!install?.ok) {
    const installLogs = Array.isArray(install?.logs) && install.logs.length
      ? install.logs
      : [{ type: "error", text: install?.message || "SVCL自動取得に失敗しました。" }];
    return [...firstLogs, ...installLogs];
  }

  return ipcRenderer.invoke("audio:list", audioSwitch);
}

contextBridge.exposeInMainWorld("osuLauncher", {
  loadConfig: () => ipcRenderer.invoke("config:load"),
  saveConfig: (config) => ipcRenderer.invoke("config:save", config),
  resetConfig: () => ipcRenderer.invoke("config:reset"),
  runProfile: (config) => ipcRenderer.invoke("profile:run", config),
  pickFile: () => ipcRenderer.invoke("dialog:pickFile"),
  pickFolder: () => ipcRenderer.invoke("dialog:pickFolder"),
  listAudioDevices: (audioSwitch) => listAudioDevicesWithAutoSvcl(audioSwitch),
  testAudioSwitch: (audioSwitch) => ipcRenderer.invoke("audio:test", audioSwitch),
  checkUpdate: (updateCheck) => ipcRenderer.invoke("update:check", updateCheck),
  openUpdateUrl: () => ipcRenderer.invoke("update:open"),
  onUpdateStatus: (callback) => {
    if (typeof callback !== "function") return () => {};
    const handler = (_event, status) => callback(status);
    ipcRenderer.on("update:status", handler);
    return () => ipcRenderer.removeListener("update:status", handler);
  },
  openToolsFolder: () => ipcRenderer.invoke("tools:openToolsFolder"),
  openNirCmdPage: () => ipcRenderer.invoke("tools:openNirCmdPage"),
  installNirCmd: () => ipcRenderer.invoke("tools:installNirCmd"),
  openSvclPage: () => ipcRenderer.invoke("tools:openSvclPage"),
  installSvcl: () => ipcRenderer.invoke("tools:installSvcl"),
  findExecutable: (item) => ipcRenderer.invoke("app:findExecutable", item)
});
