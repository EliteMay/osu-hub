const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("osuLauncher", {
  loadConfig: () => ipcRenderer.invoke("config:load"),
  saveConfig: (config) => ipcRenderer.invoke("config:save", config),
  resetConfig: () => ipcRenderer.invoke("config:reset"),
  runProfile: (config) => ipcRenderer.invoke("profile:run", config),
  pickFile: () => ipcRenderer.invoke("dialog:pickFile"),
  pickFolder: () => ipcRenderer.invoke("dialog:pickFolder"),
  listAudioDevices: (audioSwitch) => ipcRenderer.invoke("audio:list", audioSwitch),
  testAudioSwitch: (audioSwitch) => ipcRenderer.invoke("audio:test", audioSwitch),
  checkUpdate: (updateCheck) => ipcRenderer.invoke("update:check", updateCheck),
  openUpdateUrl: (url) => ipcRenderer.invoke("update:open", url),
  openToolsFolder: () => ipcRenderer.invoke("tools:openToolsFolder"),
  openNirCmdPage: () => ipcRenderer.invoke("tools:openNirCmdPage"),
  installNirCmd: () => ipcRenderer.invoke("tools:installNirCmd"),
  openSvclPage: () => ipcRenderer.invoke("tools:openSvclPage"),
  installSvcl: () => ipcRenderer.invoke("tools:installSvcl"),
  findExecutable: (item) => ipcRenderer.invoke("app:findExecutable", item)
});
