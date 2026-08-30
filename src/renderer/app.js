let config = null;
let fieldsBound = false;
let lastUpdateDownloadUrl = "";

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => Array.from(parent.querySelectorAll(selector));

function toLogs(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.logs)) return value.logs;
  if (value && value.message) return [{ type: value.ok ? "success" : "error", text: value.message }];
  return [{ type: "info", text: String(value || "完了") }];
}

function renderQuickLogs(logs) {
  const quickLogList = $("#quickLogList");
  if (!quickLogList) return;
  quickLogList.innerHTML = "";
  const visibleLogs = toLogs(logs).slice(0, 6);
  for (const log of visibleLogs) {
    const div = document.createElement("div");
    div.className = `quick-log-item ${log.type || "info"}`;
    div.textContent = log.text;
    quickLogList.appendChild(div);
  }
}

function ensureConfigShape() {
  config = config || {};
  if (!Array.isArray(config.apps)) config.apps = [];
  if (!Array.isArray(config.checks)) config.checks = [];
  config.profileName = config.profileName || "osu用セットアップ";
  config.launchDelayMs = Number(config.launchDelayMs ?? 900);
}

function normalizeCandidates(value) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function ensureAudioSwitch() {
  config.audioSwitch = config.audioSwitch || {};
  config.audioSwitch.mode = config.audioSwitch.mode || (config.audioSwitch.command ? "custom" : "svcl");
  config.audioSwitch.deviceName = config.audioSwitch.deviceName || "スピーカー";
  config.audioSwitch.scriptPath = config.audioSwitch.scriptPath || "tools\\switch_audio_device.ps1";
  config.audioSwitch.customCommand = config.audioSwitch.customCommand || config.audioSwitch.command || "";
  config.audioSwitch.nircmdPath = config.audioSwitch.nircmdPath || "tools\\nircmdc.exe";
  config.audioSwitch.svclPath = config.audioSwitch.svclPath || "tools\\svcl.exe";
  return config.audioSwitch;
}

function ensureUpdateCheck() {
  config.updateCheck = config.updateCheck || {};
  if (typeof config.updateCheck.enabled !== "boolean") config.updateCheck.enabled = true;
  config.updateCheck.versionUrl = config.updateCheck.versionUrl || "";
  config.updateCheck.lastDownloadUrl = config.updateCheck.lastDownloadUrl || "";
  return config.updateCheck;
}

function renderLogs(logs) {
  logs = toLogs(logs);
  renderQuickLogs(logs);
  const logList = $("#logList");
  if (!logList) return;
  logList.innerHTML = "";
  for (const log of logs) {
    const div = document.createElement("div");
    div.className = `log-item ${log.type || "info"}`;
    div.textContent = log.text;
    logList.appendChild(div);
  }
}

function renderChecks() {
  const checksList = $("#checksList");
  checksList.innerHTML = "";
  if (!Array.isArray(config.checks) || config.checks.length === 0) {
    const li = document.createElement("li");
    li.textContent = "チェック項目が空です。初期設定に戻すと復元できます。";
    checksList.appendChild(li);
    return;
  }
  for (const check of config.checks) {
    const li = document.createElement("li");
    li.textContent = check;
    checksList.appendChild(li);
  }
}

function createAppCard(item, index) {
  const template = $("#appCardTemplate");
  const card = template.content.firstElementChild.cloneNode(true);
  const enabled = $(".app-enabled", card);
  const name = $(".app-name", card);
  const memo = $(".app-memo", card);
  const targetPath = $(".app-path", card);
  const wait = $(".app-wait", card);
  const candidates = $(".app-candidates", card);
  const pickFile = $(".pick-file", card);
  const pickFolder = $(".pick-folder", card);
  const findExe = $(".find-exe", card);

  enabled.checked = !!item.enabled;
  name.value = item.name || "";
  memo.textContent = item.memo || "";
  targetPath.value = item.targetPath || "";
  wait.value = item.waitAfterMs ?? config.launchDelayMs ?? 0;
  candidates.value = (item.candidates || []).join(", ");

  const sync = () => {
    config.apps[index] = {
      ...config.apps[index],
      enabled: enabled.checked,
      name: name.value,
      targetPath: targetPath.value,
      waitAfterMs: Number(wait.value || 0),
      candidates: normalizeCandidates(candidates.value)
    };
  };

  [enabled, name, targetPath, wait, candidates].forEach((el) => {
    el.addEventListener("input", sync);
    el.addEventListener("change", sync);
  });

  pickFile.addEventListener("click", async () => {
    const selected = await window.osuLauncher.pickFile();
    if (selected) { targetPath.value = selected; sync(); }
  });
  pickFolder.addEventListener("click", async () => {
    const selected = await window.osuLauncher.pickFolder();
    if (selected) { targetPath.value = selected; sync(); }
  });
  findExe.addEventListener("click", async () => {
    sync();
    renderLogs([{ type: "info", text: `${name.value || "アプリ"} のexe候補を検索しています。` }]);
    try {
      const result = await window.osuLauncher.findExecutable(config.apps[index]);
      if (result.ok && result.path) {
        targetPath.value = result.path;
        sync();
        await window.osuLauncher.saveConfig(config);
      }
      renderLogs(result.logs || [{ type: result.ok ? "success" : "error", text: result.message }]);
    } catch (error) {
      renderLogs([{ type: "error", text: `exe検索エラー: ${error.message}` }]);
    }
  });
  return card;
}

function renderApps() {
  const appsList = $("#appsList");
  appsList.innerHTML = "";
  if (!Array.isArray(config.apps) || config.apps.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-app-message";
    empty.textContent = "実行内容が空です。下の『初期設定に戻す』を押してください。";
    appsList.appendChild(empty);
    return;
  }
  config.apps.forEach((item, index) => appsList.appendChild(createAppCard(item, index)));
}

function syncAudioModeVisibility() {
  const audioSwitch = ensureAudioSwitch();
  const isCustom = audioSwitch.mode === "custom";
  const isNirCmd = audioSwitch.mode === "nircmd";
  const isSvcl = audioSwitch.mode === "svcl";
  $$(".audio-standard-field").forEach((field) => field.classList.toggle("is-hidden", isCustom));
  $$(".audio-custom-field").forEach((field) => field.classList.toggle("is-hidden", !isCustom));
  $$(".audio-nircmd-field").forEach((field) => field.classList.toggle("is-hidden", !isNirCmd));
  $$(".audio-svcl-field").forEach((field) => field.classList.toggle("is-hidden", !isSvcl));
  $$(".audio-script-field").forEach((field) => field.classList.toggle("is-hidden", audioSwitch.mode !== "powershell"));
}

function setBaseFieldValues() {
  const audioSwitch = ensureAudioSwitch();
  const updateCheck = ensureUpdateCheck();
  $("#profileName").value = config.profileName || "";
  $("#launchDelayMs").value = config.launchDelayMs ?? 900;
  $("#audioEnabled").checked = !!audioSwitch.enabled;
  $("#audioMode").value = audioSwitch.mode || "svcl";
  $("#audioDeviceName").value = audioSwitch.deviceName || "";
  $("#audioScriptPath").value = audioSwitch.scriptPath || "tools\\switch_audio_device.ps1";
  $("#audioCustomCommand").value = audioSwitch.customCommand || audioSwitch.command || "";
  $("#audioNirCmdPath").value = audioSwitch.nircmdPath || "tools\\nircmdc.exe";
  $("#audioSvclPath").value = audioSwitch.svclPath || "tools\\svcl.exe";
  $("#updateEnabled").checked = !!updateCheck.enabled;
  $("#updateVersionUrl").value = updateCheck.versionUrl || "";
  lastUpdateDownloadUrl = updateCheck.lastDownloadUrl || "";
  $("#openUpdateButton").disabled = !lastUpdateDownloadUrl;
  syncAudioModeVisibility();
}

function bindBaseFields() {
  if (fieldsBound) return;
  fieldsBound = true;
  $("#profileName").addEventListener("input", (e) => { config.profileName = e.target.value; });
  $("#launchDelayMs").addEventListener("input", (e) => { config.launchDelayMs = Number(e.target.value || 0); });
  $("#audioEnabled").addEventListener("change", (e) => { ensureAudioSwitch().enabled = e.target.checked; });
  $("#audioMode").addEventListener("change", (e) => { ensureAudioSwitch().mode = e.target.value; syncAudioModeVisibility(); });
  $("#audioDeviceName").addEventListener("input", (e) => { ensureAudioSwitch().deviceName = e.target.value; });
  $("#audioScriptPath").addEventListener("input", (e) => { ensureAudioSwitch().scriptPath = e.target.value; });
  $("#audioCustomCommand").addEventListener("input", (e) => { const a = ensureAudioSwitch(); a.customCommand = e.target.value; a.command = e.target.value; });
  $("#audioNirCmdPath").addEventListener("input", (e) => { ensureAudioSwitch().nircmdPath = e.target.value; });
  $("#audioSvclPath").addEventListener("input", (e) => { ensureAudioSwitch().svclPath = e.target.value; });
  $("#updateEnabled").addEventListener("change", (e) => { ensureUpdateCheck().enabled = e.target.checked; });
  $("#updateVersionUrl").addEventListener("input", (e) => { ensureUpdateCheck().versionUrl = e.target.value; });

  $("#checkUpdateButton").addEventListener("click", async () => {
    renderLogs([{ type: "info", text: "アップデートを確認しています。" }]);
    try {
      await window.osuLauncher.saveConfig(config);
      const result = await window.osuLauncher.checkUpdate(ensureUpdateCheck());
      renderLogs(result.logs || [{ type: result.ok ? "success" : "error", text: result.message || "完了" }]);
      lastUpdateDownloadUrl = result.downloadUrl || "";
      config.updateCheck.lastDownloadUrl = lastUpdateDownloadUrl;
      $("#openUpdateButton").disabled = !lastUpdateDownloadUrl;
      if (lastUpdateDownloadUrl) await window.osuLauncher.saveConfig(config);
    } catch (error) { renderLogs([{ type: "error", text: `アップデート確認エラー: ${error.message}` }]); }
  });
  $("#openUpdateButton").addEventListener("click", async () => {
    if (!lastUpdateDownloadUrl) return renderLogs([{ type: "skip", text: "開ける配布URLがありません。" }]);
    const result = await window.osuLauncher.openUpdateUrl(lastUpdateDownloadUrl);
    renderLogs([{ type: result.ok ? "success" : "error", text: result.message }]);
  });
  $("#audioListButton").addEventListener("click", async () => {
    renderLogs([{ type: "info", text: "音声デバイス一覧を取得しています。" }]);
    try { await window.osuLauncher.saveConfig(config); renderLogs(await window.osuLauncher.listAudioDevices(ensureAudioSwitch())); }
    catch (error) { renderLogs([{ type: "error", text: `音声デバイス取得エラー: ${error.message}` }]); }
  });
  $("#audioTestButton").addEventListener("click", async () => {
    renderLogs([{ type: "info", text: "音声切替だけテストしています。" }]);
    try { await window.osuLauncher.saveConfig(config); renderLogs(await window.osuLauncher.testAudioSwitch(ensureAudioSwitch())); }
    catch (error) { renderLogs([{ type: "error", text: `音声切替テストエラー: ${error.message}` }]); }
  });
  $("#openToolsButton").addEventListener("click", async () => {
    const result = await window.osuLauncher.openToolsFolder();
    renderLogs([{ type: result.ok ? "success" : "error", text: result.message }]);
  });
  $("#installSvclButton").addEventListener("click", async () => {
    renderLogs([{ type: "info", text: "SoundVolumeCommandLineを公式サイトから取得しています。" }]);
    try {
      const result = await window.osuLauncher.installSvcl();
      if (result.ok && result.path) {
        const a = ensureAudioSwitch(); a.mode = "svcl"; a.svclPath = result.path;
        $("#audioMode").value = "svcl"; $("#audioSvclPath").value = result.path; syncAudioModeVisibility();
        await window.osuLauncher.saveConfig(config);
      }
      renderLogs(result.logs || [{ type: result.ok ? "success" : "error", text: result.message }]);
    } catch (error) { renderLogs([{ type: "error", text: `SVCL自動取得エラー: ${error.message}` }]); }
  });
  $("#openSvclButton").addEventListener("click", async () => {
    const result = await window.osuLauncher.openSvclPage();
    renderLogs([{ type: result.ok ? "success" : "error", text: result.message }, { type: "info", text: "自動取得が失敗する場合はsvcl.exeをtoolsフォルダへ入れてください。" }]);
  });
  $("#installNirCmdButton").addEventListener("click", async () => {
    renderLogs([{ type: "info", text: "NirCmdを公式サイトから取得しています。" }]);
    try {
      const result = await window.osuLauncher.installNirCmd();
      if (result.ok && result.path) {
        const a = ensureAudioSwitch(); a.mode = "nircmd"; a.nircmdPath = result.path;
        $("#audioMode").value = "nircmd"; $("#audioNirCmdPath").value = result.path; syncAudioModeVisibility();
        await window.osuLauncher.saveConfig(config);
      }
      renderLogs(result.logs || [{ type: result.ok ? "success" : "error", text: result.message }]);
    } catch (error) { renderLogs([{ type: "error", text: `NirCmd自動取得エラー: ${error.message}` }]); }
  });
  $("#openNirCmdButton").addEventListener("click", async () => {
    const result = await window.osuLauncher.openNirCmdPage();
    renderLogs([{ type: result.ok ? "success" : "error", text: result.message }, { type: "info", text: "自動取得が失敗する場合はnircmdc.exeをtoolsフォルダへ入れてください。" }]);
  });
}

async function init() {
  try {
    config = await window.osuLauncher.loadConfig();
    ensureConfigShape();
    bindBaseFields();
    setBaseFieldValues();
    renderApps();
    renderChecks();
    renderLogs([{ type: "success", text: "設定を読み込みました。" }, { type: "info", text: `実行内容: ${config.apps.length}件` }]);
  } catch (error) {
    renderLogs([{ type: "error", text: `初期化エラー: ${error.message}` }]);
    return;
  }

  $("#saveButton").addEventListener("click", async () => {
    await window.osuLauncher.saveConfig(config);
    renderLogs([{ type: "success", text: "設定を保存しました。" }]);
  });
  $("#resetButton").addEventListener("click", async () => {
    if (!confirm("初期設定に戻しますか？ 今の設定は上書きされます。")) return;
    config = await window.osuLauncher.resetConfig();
    setBaseFieldValues(); renderApps(); renderChecks();
    renderLogs([{ type: "success", text: "初期設定に戻しました。" }]);
  });
  $("#runButton").addEventListener("click", async () => {
    const button = $("#runButton");
    button.disabled = true; button.textContent = "実行中...";
    renderLogs([{ type: "info", text: "起動処理を開始しました。" }]);
    try { await window.osuLauncher.saveConfig(config); renderLogs(await window.osuLauncher.runProfile(config)); }
    catch (error) { renderLogs([{ type: "error", text: `実行エラー: ${error.message}` }]); }
    finally { button.disabled = false; button.textContent = "osu準備を開始"; }
  });
}

init();
