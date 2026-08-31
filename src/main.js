const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn, exec } = require("child_process");
const https = require("https");
const http = require("http");

const APP_ROOT = path.join(__dirname, "..");
const DEFAULT_CONFIG_PATH = path.join(APP_ROOT, "data", "config.json");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const safeExists = (value) => {
  try { return !!value && fs.existsSync(value); } catch { return false; }
};
const resolveAppPath = (value) => !value ? "" : (path.isAbsolute(value) ? value : path.join(APP_ROOT, value));
const getUserConfigPath = () => path.join(app.getPath("userData"), "config.json");
const getUserToolsPath = () => path.join(app.getPath("userData"), "tools");
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

function mergeDefaults(defaultValue, userValue) {
  if (userValue === undefined || userValue === null) return defaultValue;
  if (Array.isArray(defaultValue)) return Array.isArray(userValue) ? userValue : defaultValue;
  if (defaultValue && userValue && typeof defaultValue === "object" && typeof userValue === "object" && !Array.isArray(userValue)) {
    const out = { ...defaultValue };
    for (const [key, value] of Object.entries(userValue)) {
      out[key] = key in defaultValue ? mergeDefaults(defaultValue[key], value) : value;
    }
    return out;
  }
  return userValue;
}

function normalizeConfig(config, defaults) {
  const merged = mergeDefaults(defaults, config || {});
  merged.profileName = String(merged.profileName || defaults.profileName || "osu用セットアップ");
  merged.launchDelayMs = Number.isFinite(Number(merged.launchDelayMs)) ? Number(merged.launchDelayMs) : 900;
  merged.apps = Array.isArray(merged.apps) && merged.apps.length ? merged.apps : defaults.apps || [];
  merged.checks = Array.isArray(merged.checks) && merged.checks.length ? merged.checks : defaults.checks || [];
  merged.audioSwitch = { ...(defaults.audioSwitch || {}), ...(merged.audioSwitch || {}) };
  merged.audioSwitch.mode = merged.audioSwitch.mode || "svcl";
  merged.audioSwitch.deviceName = merged.audioSwitch.deviceName || "スピーカー";
  merged.audioSwitch.svclPath = merged.audioSwitch.svclPath || "tools\\svcl.exe";
  merged.audioSwitch.nircmdPath = merged.audioSwitch.nircmdPath || "tools\\nircmdc.exe";
  merged.audioSwitch.scriptPath = merged.audioSwitch.scriptPath || "tools\\switch_audio_device.ps1";
  merged.updateCheck = { ...(defaults.updateCheck || {}), ...(merged.updateCheck || {}) };
  if (typeof merged.updateCheck.enabled !== "boolean") merged.updateCheck.enabled = true;
  merged.updateCheck.versionUrl = merged.updateCheck.versionUrl || defaults.updateCheck?.versionUrl || "";
  merged.updateCheck.lastDownloadUrl = merged.updateCheck.lastDownloadUrl || "";
  merged.appVersion = defaults.appVersion || app.getVersion();
  merged.configVersion = defaults.configVersion || 17;
  return merged;
}

function ensureUserConfig() {
  const filePath = getUserConfigPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!safeExists(filePath)) fs.copyFileSync(DEFAULT_CONFIG_PATH, filePath);
  return filePath;
}

function loadConfig() {
  const defaults = readJson(DEFAULT_CONFIG_PATH);
  let user = {};
  try { user = readJson(ensureUserConfig()); } catch { user = {}; }
  const config = normalizeConfig(user, defaults);
  saveConfig(config);
  return config;
}

function saveConfig(config) {
  const defaults = readJson(DEFAULT_CONFIG_PATH);
  const normalized = normalizeConfig(config, defaults);
  fs.writeFileSync(ensureUserConfig(), JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 900,
    minHeight: 640,
    title: "osu Setup Launcher",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  ensureUserConfig();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

function runProcess(command, args = [], options = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(command, args, { windowsHide: true, shell: false, ...options });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (d) => { stdout += d.toString("utf8"); });
    child.stderr?.on("data", (d) => { stderr += d.toString("utf8"); });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, code: -1, stdout: stdout.trim(), stderr: stderr.trim(), message: error.message });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      resolve({ ok: code === 0, code, stdout: stdout.trim(), stderr: stderr.trim(), message: code === 0 ? "OK" : `終了コード ${code}` });
    });
  });
}

function isShellOpenable(filePath) {
  const lower = String(filePath || "").toLowerCase();
  return lower.endsWith(".lnk") || lower.endsWith(".url") || lower.endsWith(".appref-ms");
}
function isOsuItem(item) {
  const text = [item?.name, item?.targetPath, ...(item?.candidates || [])].join(" ").toLowerCase();
  return text.includes("osu") || text.includes("lazer");
}
function shouldSkipDir(name) {
  return ["node_modules", "dist", "$recycle.bin", "system volume information"].includes(String(name || "").toLowerCase());
}

function findExecutables(root, candidates = [], maxDepth = 7) {
  if (!safeExists(root)) return [];
  const wanted = candidates.map((v) => String(v || "").toLowerCase()).filter(Boolean);
  const queue = [{ dir: root, depth: 0 }];
  const found = [];
  while (queue.length && found.length < 80) {
    const { dir, depth } = queue.shift();
    if (depth > maxDepth) continue;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!shouldSkipDir(entry.name)) queue.push({ dir: full, depth: depth + 1 });
        continue;
      }
      const lower = entry.name.toLowerCase();
      if (!lower.endsWith(".exe") && !isShellOpenable(full)) continue;
      let score = 1;
      if (wanted.includes(lower)) score = 100;
      else if ((lower.includes("osu") || lower.includes("lazer")) && !lower.includes("setup") && !lower.includes("update") && !lower.includes("unins")) score = 80;
      found.push({ path: full, score, depth });
    }
  }
  return found.sort((a, b) => b.score - a.score || a.depth - b.depth || a.path.length - b.path.length).map((v) => v.path);
}

function commonOsuTarget(candidates = []) {
  const roots = [
    path.join(process.env.LOCALAPPDATA || "", "osulazer"),
    path.join(process.env.LOCALAPPDATA || "", "Programs"),
    path.join(process.env.LOCALAPPDATA || "", "osu!"),
    path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs"),
    path.join(process.env.USERPROFILE || "", "Desktop")
  ].filter(safeExists);
  for (const root of roots) {
    const match = findExecutables(root, candidates, 7)[0];
    if (match) return match;
  }
  return null;
}

function resolveTarget(item) {
  const target = String(item?.targetPath || "").trim();
  if (!target) {
    if (isOsuItem(item)) {
      const common = commonOsuTarget(item.candidates || []);
      if (common) return { ok: true, target: common, note: `共通保存先から見つけました: ${common}` };
    }
    return { ok: false, reason: "パスが未設定です。" };
  }
  if (!safeExists(target)) {
    if (isOsuItem(item)) {
      const common = commonOsuTarget(item.candidates || []);
      if (common) return { ok: true, target: common, note: `指定パスに見つからないため、共通保存先から見つけました: ${common}` };
    }
    return { ok: false, reason: `パスが見つかりません: ${target}` };
  }
  let stat;
  try { stat = fs.statSync(target); } catch (error) { return { ok: false, reason: error.message }; }
  if (stat.isFile()) return { ok: true, target };
  const match = findExecutables(target, item.candidates || [], 8)[0];
  if (match) return { ok: true, target: match };
  if (isOsuItem(item)) {
    const common = commonOsuTarget(item.candidates || []);
    if (common) return { ok: true, target: common, note: `指定フォルダに見つからないため、共通保存先から見つけました: ${common}` };
  }
  return { ok: false, reason: `フォルダ内に起動候補が見つかりません: ${target}` };
}

async function launchTarget(target, args = []) {
  if (isShellOpenable(target)) {
    const message = await shell.openPath(target);
    if (message) throw new Error(message);
    return;
  }
  const child = spawn(target, args, { cwd: path.dirname(target), detached: true, stdio: "ignore", windowsHide: false });
  child.unref();
}

function chooseWritableToolsPath() {
  const bundled = path.join(APP_ROOT, "tools");
  try {
    fs.mkdirSync(bundled, { recursive: true });
    fs.accessSync(bundled, fs.constants.W_OK);
    return bundled;
  } catch {
    const userTools = getUserToolsPath();
    fs.mkdirSync(userTools, { recursive: true });
    return userTools;
  }
}
function displayToolPath(filePath) {
  const bundled = path.join(APP_ROOT, "tools");
  return filePath.toLowerCase().startsWith(bundled.toLowerCase()) ? path.relative(APP_ROOT, filePath) : filePath;
}
function resolveTool(configured, names) {
  const candidates = [];
  if (configured) candidates.push(configured);
  for (const name of names) candidates.push(path.join("tools", name), name, path.join(getUserToolsPath(), name));
  for (const candidate of candidates) {
    const resolved = path.isAbsolute(candidate) ? candidate : resolveAppPath(candidate);
    if (safeExists(resolved)) return resolved;
  }
  return null;
}

async function installTool(scriptName, exeName, label) {
  const scriptPath = path.join(APP_ROOT, "tools", scriptName);
  if (!safeExists(scriptPath)) return { ok: false, message: `${label}自動取得スクリプトが見つかりません。` };
  const toolsDir = chooseWritableToolsPath();
  const result = await runProcess("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath, "-ToolsDir", toolsDir]);
  const exePath = path.join(toolsDir, exeName);
  const logs = [{ type: "info", text: `${label}保存先: ${toolsDir}` }];
  if (result.stdout) result.stdout.split(/\r?\n/).filter(Boolean).forEach((text) => logs.push({ type: "info", text }));
  if (result.stderr) logs.push({ type: "error", text: result.stderr });
  if (!result.ok || !safeExists(exePath)) {
    logs.unshift({ type: "error", text: `${label}自動取得に失敗しました: ${result.message}` });
    return { ok: false, message: `${label}自動取得に失敗しました。`, logs };
  }
  const shown = displayToolPath(exePath);
  logs.unshift({ type: "success", text: `${label}を使える状態にしました: ${shown}` });
  return { ok: true, message: `${label}を使える状態にしました。`, path: shown, logs };
}

function parseCsvLine(line) {
  const out = [];
  let cur = "", quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i += 1; } else quoted = !quoted;
    } else if (ch === "," && !quoted) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}
const normalizeKey = (v) => String(v || "").toLowerCase().replace(/[\s_\-]/g, "").replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]/g, "");
function columnIndex(header, names) {
  const h = header.map(normalizeKey);
  for (const name of names.map(normalizeKey)) { const i = h.indexOf(name); if (i >= 0) return i; }
  return -1;
}
function parseSvcl(csv) {
  const lines = String(csv || "").split(/\r?\n/).filter((v) => v.trim());
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]);
  const idx = {
    name: columnIndex(header, ["Name"]), id: columnIndex(header, ["Command-Line Friendly ID", "CommandLineFriendlyID"]),
    itemId: columnIndex(header, ["Item ID", "ItemID"]), direction: columnIndex(header, ["Direction"]),
    type: columnIndex(header, ["Type"]), state: columnIndex(header, ["Device State", "DeviceState"]),
    def: columnIndex(header, ["Default"]), multi: columnIndex(header, ["Default Multimedia", "DefaultMultimedia"]),
    comm: columnIndex(header, ["Default Communications", "DefaultCommunications"])
  };
  const get = (cols, i) => i >= 0 ? (cols[i] || "") : "";
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    return { name: get(cols, idx.name), id: get(cols, idx.id), itemId: get(cols, idx.itemId), direction: get(cols, idx.direction), type: get(cols, idx.type), state: get(cols, idx.state), def: get(cols, idx.def), multi: get(cols, idx.multi), comm: get(cols, idx.comm) };
  }).filter((item) => {
    const text = [item.name, item.id, item.itemId, item.direction, item.type].join(" ").toLowerCase();
    const render = /render|speaker|headphone|earphone|スピーカー|ヘッドホン|イヤホン|再生/.test(text);
    const capture = /capture|microphone|マイク|録音/.test(text);
    return render && !capture && (item.name || item.id || item.itemId);
  });
}
function matchText(v) { return String(v || "").toLowerCase().replace(/[（）()\[\]{}\\/]/g, " ").replace(/\s+/g, " ").trim(); }
function scoreItem(item, target) {
  const n = matchText(target), name = matchText(item.name), id = matchText(item.id), itemId = matchText(item.itemId);
  if (!n) return 0;
  if (id === n) return 120; if (itemId === n) return 115; if (name === n) return 110;
  if (id.includes(n) || itemId.includes(n)) return 90; if (name.includes(n)) return 80;
  const tokens = n.split(" ").filter((v) => v.length >= 2 && !["device", "render", "audio", "high", "definition"].includes(v));
  return tokens.length && tokens.every((v) => `${name} ${id} ${itemId}`.includes(v)) ? 60 : 0;
}
function isYes(v) { return /^(yes|true|1|y|はい|default)$/i.test(String(v || "").trim()); }
function cleanSvclValue(v) { return String(v || "").replace(/^\uFEFF/, "").trim(); }
function svclValueMatches(item, value) {
  const actual = matchText(cleanSvclValue(value));
  if (!actual) return false;
  return [item?.name, item?.id, item?.itemId].some((candidate) => {
    const expected = matchText(candidate);
    return expected && (expected === actual || expected.includes(actual) || actual.includes(expected));
  });
}

function logsDir() {
  const local = path.join(APP_ROOT, "logs");
  try { fs.mkdirSync(local, { recursive: true }); fs.accessSync(local, fs.constants.W_OK); return local; }
  catch { const user = path.join(app.getPath("userData"), "logs"); fs.mkdirSync(user, { recursive: true }); return user; }
}

async function svclList(audio) {
  const exe = resolveTool(audio?.svclPath, ["svcl.exe"]);
  if (!exe) return { ok: false, message: "SVCLが見つかりません。", items: [] };
  const args = ["/SaveFileEncoding", "3", "/ShowDisabledDevices", "1", "/ShowUnpluggedDevices", "1", "/scomma", "", "/Columns", "Name,Command-Line Friendly ID,Direction,Type,Device State,Default,Default Multimedia,Default Communications,Item ID"];
  let result = await runProcess(exe, args);
  if (!result.ok || !result.stdout) result = await runProcess(exe, ["/SaveFileEncoding", "3", "/ShowDisabledDevices", "1", "/ShowUnpluggedDevices", "1", "/scomma", ""]);
  if (!result.ok || !result.stdout) return { ...result, ok: false, message: "SVCL音声一覧を取得できませんでした。", items: [] };
  const savedPath = path.join(logsDir(), "audio_devices_svcl_last.csv");
  try { fs.writeFileSync(savedPath, result.stdout, "utf8"); } catch {}
  return { ...result, ok: true, message: "SVCL音声一覧を取得しました。", items: parseSvcl(result.stdout), savedPath, exe };
}

async function svclGetColumn(exe, itemName, columnName) {
  const result = await runProcess(exe, ["/Stdout", "/GetColumnValue", itemName, columnName]);
  const value = cleanSvclValue(result.stdout);
  const noMatch = /no items found/i.test(`${result.stdout}\n${result.stderr}`);
  return { ...result, ok: result.ok && !noMatch && Boolean(value), value };
}

async function verifySvclDefaultAliases(exe, item) {
  const aliases = [
    { role: "Console", alias: "DefaultRenderDevice" },
    { role: "Multimedia", alias: "DefaultRenderDeviceMulti" },
    { role: "Communications", alias: "DefaultRenderDeviceComm" }
  ];
  const checks = [];
  for (const entry of aliases) {
    let query = await svclGetColumn(exe, entry.alias, "Command-Line Friendly ID");
    if (!query.ok || !svclValueMatches(item, query.value)) {
      const byName = await svclGetColumn(exe, entry.alias, "Name");
      if (byName.ok) query = byName;
    }
    checks.push({ ...entry, ok: query.ok && svclValueMatches(item, query.value), value: query.value });
  }
  const consoleOk = checks.find((v) => v.role === "Console")?.ok;
  const multimediaOk = checks.find((v) => v.role === "Multimedia")?.ok;
  return {
    ok: Boolean(consoleOk || multimediaOk),
    checks,
    details: checks.map((v) => `${v.role}: ${v.value || "(unavailable)"}${v.ok ? " [match]" : ""}`).join("\n")
  };
}

function switchPowerShell(audio) {
  const script = resolveAppPath(audio?.scriptPath || "tools\\switch_audio_device.ps1");
  if (!safeExists(script)) return Promise.resolve({ ok: false, message: `音声切替スクリプトが見つかりません: ${script}` });
  return runProcess("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-DeviceName", String(audio?.deviceName || "")]).then((r) => ({ ...r, message: r.ok ? "Windows標準Fallbackで既定デバイスまで確認しました。" : `Windows標準Fallback失敗: ${r.message}` }));
}

async function switchSvcl(audio) {
  const target = String(audio?.deviceName || "").trim();
  if (!target) return { ok: false, message: "音声デバイス名が未設定です。" };
  const before = await svclList(audio);
  if (!before.ok) return { ok: false, skipped: !before.exe, message: before.exe ? before.message : "SVCL未設定のため音声切替をスキップしました。『SVCLを自動取得』を押してください。", stdout: before.stdout, stderr: before.stderr };
  const ranked = before.items.map((item) => ({ item, score: scoreItem(item, target) })).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const candidates = before.items.slice(0, 15).map((item, i) => `${i + 1}. Name: ${item.name} | ID: ${item.id || item.itemId}`).join("\n");
  if (!best || best.score <= 0) return { ok: false, message: "入力名に一致する再生デバイスが見つからないため切替を中止しました。音声デバイス一覧のNameまたはIDをコピーしてください。", stdout: candidates };
  const targetValue = best.item.id || best.item.itemId || best.item.name;
  const set = await runProcess(before.exe, ["/Stdout", "/SetDefault", targetValue, "all"]);
  if (!set.ok || /no items found/i.test(`${set.stdout}\n${set.stderr}`)) return { ok: false, message: "SVCLのSetDefaultで対象に反映されませんでした。", stdout: `matched: ${best.item.name} | ${targetValue}\n${set.stdout || ""}`, stderr: set.stderr || "" };

  await sleep(300);
  const directVerify = await verifySvclDefaultAliases(before.exe, best.item);
  if (directVerify.ok) {
    return { ok: true, message: `音声出力を切り替えました: ${best.item.name}`, stdout: `verified by Windows default aliases\n${directVerify.details}\nmatched: ${best.item.name} | ${targetValue}` };
  }

  const after = await svclList(audio);
  const matchedAfter = after.items?.map((item) => ({ item, score: scoreItem(item, targetValue) })).sort((a, b) => b.score - a.score)[0]?.item;
  const csvVerified = matchedAfter && [matchedAfter.def, matchedAfter.multi, matchedAfter.comm].some(isYes);
  if (csvVerified) {
    return { ok: true, message: `音声出力を切り替えました: ${best.item.name}`, stdout: `verified by SVCL CSV fallback\n${directVerify.details}\nmatched: ${best.item.name} | ${targetValue}` };
  }

  const fallback = await switchPowerShell({ ...audio, deviceName: best.item.name || target });
  if (fallback.ok) {
    return { ok: true, message: `音声出力を切り替えました: ${best.item.name}（Windows標準Fallbackで確認）`, stdout: `SVCL command matched: ${best.item.name} | ${targetValue}\n${directVerify.details}\n${fallback.stdout || ""}` };
  }

  return {
    ok: false,
    verifyNeeded: true,
    message: `音声切替コマンドは実行しましたが、Windows側の既定デバイスを確認できませんでした: ${best.item.name}`,
    stdout: `matched: ${best.item.name} | ${targetValue}\n${set.stdout || ""}\n${directVerify.details}\nFallback: ${fallback.message}`,
    stderr: fallback.stderr || ""
  };
}

async function switchNirCmd(audio) {
  const target = String(audio?.deviceName || "").trim();
  if (!target) return { ok: false, message: "音声デバイス名が未設定です。" };
  const exe = resolveTool(audio?.nircmdPath, ["nircmd.exe", "nircmdc.exe"]);
  if (!exe) return { ok: false, skipped: true, message: "NirCmd未設定のため音声切替をスキップしました。" };
  const result = await runProcess(exe, ["setdefaultsounddevice", target]);
  return { ok: result.ok, message: result.ok ? `NirCmdコマンドを実行しました: ${target}` : `NirCmd失敗: ${result.message}`, stdout: result.stdout, stderr: result.stderr };
}

function switchCustom(audio) {
  return new Promise((resolve) => {
    const command = String(audio?.customCommand || audio?.command || "").trim();
    if (!command) return resolve({ ok: false, message: "カスタムコマンドが未設定です。" });
    exec(command, { windowsHide: true }, (error, stdout, stderr) => resolve({ ok: !error, message: error ? `カスタムコマンド失敗: ${error.message}` : "カスタムコマンドを実行しました。", stdout: String(stdout || "").trim(), stderr: String(stderr || "").trim() }));
  });
}
async function runAudio(audio) {
  if (!audio?.enabled) return { ok: true, skipped: true, message: "音声切替はOFFです。" };
  if (audio.mode === "svcl") return switchSvcl(audio);
  if (audio.mode === "nircmd") return switchNirCmd(audio);
  if (audio.mode === "custom") return switchCustom(audio);
  return switchPowerShell(audio);
}

function parseVersion(v) { return String(v || "").replace(/^v/i, "").split(".").map((x) => parseInt(x, 10) || 0); }
function compareVersions(a, b) {
  const aa = parseVersion(a), bb = parseVersion(b), n = Math.max(aa.length, bb.length, 3);
  for (let i = 0; i < n; i += 1) { if ((aa[i] || 0) > (bb[i] || 0)) return 1; if ((aa[i] || 0) < (bb[i] || 0)) return -1; }
  return 0;
}
function fetchJson(url) {
  return new Promise((resolve) => {
    let parsed;
    try { parsed = new URL(url); } catch (error) { return resolve({ ok: false, message: error.message }); }
    const client = parsed.protocol === "https:" ? https : http;
    const request = client.get(parsed, { timeout: 10000, headers: { "User-Agent": "osu-setup-launcher" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return fetchJson(new URL(res.headers.location, parsed).toString()).then(resolve); }
      if (res.statusCode < 200 || res.statusCode >= 300) { res.resume(); return resolve({ ok: false, message: `HTTP ${res.statusCode}` }); }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { body += chunk; if (body.length > 512 * 1024) request.destroy(new Error("version.jsonが大きすぎます。")); });
      res.on("end", () => { try { resolve({ ok: true, data: JSON.parse(body) }); } catch (error) { resolve({ ok: false, message: error.message }); } });
    });
    request.on("timeout", () => request.destroy(new Error("タイムアウトしました。")));
    request.on("error", (error) => resolve({ ok: false, message: error.message }));
  });
}
async function checkUpdate(update) {
  if (!update?.enabled) return { ok: true, skipped: true, logs: [{ type: "skip", text: "アップデート確認はOFFです。" }] };
  const url = String(update?.versionUrl || "").trim();
  if (!url) return { ok: false, logs: [{ type: "error", text: "version.json URLが未設定です。" }] };
  const result = /^https?:\/\//i.test(url) ? await fetchJson(url) : (() => { try { return { ok: true, data: readJson(resolveAppPath(url)) }; } catch (error) { return { ok: false, message: error.message }; } })();
  if (!result.ok) return { ok: false, logs: [{ type: "error", text: `アップデート確認に失敗: ${result.message}` }] };
  const latestVersion = result.data.latestVersion || result.data.version || "";
  const downloadUrl = result.data.downloadUrl || result.data.url || "";
  const notes = result.data.releaseNotes || result.data.notes || "";
  const current = app.getVersion();
  const logs = [{ type: "info", text: `現在の版: ${current}` }, { type: "info", text: `公開版: ${latestVersion}` }];
  const newer = compareVersions(latestVersion, current) > 0;
  logs.push({ type: "success", text: newer ? "新しい版があります。" : "最新版です。" });
  if (notes) logs.push({ type: "info", text: `更新内容: ${notes}` });
  return { ok: true, updateAvailable: newer, latestVersion, downloadUrl, logs };
}

ipcMain.handle("config:load", () => loadConfig());
ipcMain.handle("config:save", (_e, config) => saveConfig(config));
ipcMain.handle("config:reset", () => saveConfig(readJson(DEFAULT_CONFIG_PATH)));
ipcMain.handle("dialog:pickFile", async () => {
  const r = await dialog.showOpenDialog({ title: "起動するexeを選択", properties: ["openFile"], filters: [{ name: "実行ファイル", extensions: ["exe"] }] });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle("dialog:pickFolder", async () => {
  const r = await dialog.showOpenDialog({ title: "アプリのフォルダを選択", properties: ["openDirectory"] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle("app:findExecutable", (_e, item) => {
  const target = String(item?.targetPath || "").trim();
  if (target && safeExists(target) && fs.statSync(target).isFile()) return { ok: true, path: target, message: `既にファイル指定です: ${target}` };
  let matches = target && safeExists(target) ? findExecutables(target, item?.candidates || [], 8) : [];
  if (!matches.length && isOsuItem(item)) {
    const common = commonOsuTarget(item?.candidates || []);
    if (common) matches = [common];
  }
  if (!matches.length) return { ok: false, message: "exe候補が見つかりませんでした。", logs: [{ type: "error", text: "exe候補が見つかりませんでした。" }, { type: "info", text: "osu!lazerの例: %LOCALAPPDATA%\\osulazer\\current\\osu!.exe" }] };
  return { ok: true, path: matches[0], message: `候補を見つけました: ${matches[0]}`, logs: [{ type: "success", text: `候補を見つけました: ${matches[0]}` }, ...matches.slice(1, 5).map((v) => ({ type: "info", text: `他の候補: ${v}` }))] };
});

ipcMain.handle("audio:list", async (_e, audio) => {
  const svcl = await svclList(audio || {});
  const logs = [];
  if (svcl.ok) {
    logs.push({ type: "success", text: "SVCL側の再生デバイス一覧:" });
    if (svcl.savedPath) logs.push({ type: "info", text: `一覧CSV保存先: ${svcl.savedPath}` });
    svcl.items.forEach((item) => logs.push({ type: [item.def, item.multi, item.comm].some(isYes) ? "success" : "info", text: `${item.name || "(no name)"} | ID: ${item.id || item.itemId || "(no id)"} | State: ${item.state || ""}` }));
    if (!svcl.items.length) logs.push({ type: "error", text: "再生デバイスを抽出できませんでした。CSVログを確認してください。" });
  } else logs.push({ type: "error", text: svcl.message });
  const nir = resolveTool(audio?.nircmdPath, ["nircmdc.exe", "nircmd.exe"]);
  if (nir) {
    const r = await runProcess(nir, ["showsounddevices"]);
    if (r.stdout) { logs.push({ type: "info", text: "NirCmd側の一覧（参考）:" }); r.stdout.split(/\r?\n/).filter(Boolean).slice(0, 40).forEach((text) => logs.push({ type: "info", text })); }
  }
  return logs;
});
ipcMain.handle("audio:test", async (_e, audio) => {
  const r = await runAudio(audio || {});
  return [{ type: r.ok ? (r.skipped ? "skip" : "success") : "error", text: r.message }, ...(r.stdout ? [{ type: "info", text: r.stdout }] : []), ...(r.stderr ? [{ type: "error", text: r.stderr }] : [])];
});

ipcMain.handle("profile:run", async (_e, runtime) => {
  const config = runtime || loadConfig();
  const logs = [{ type: "info", text: `開始: ${config.profileName || "osu用セットアップ"}` }];
  const audio = await runAudio(config.audioSwitch || {});
  logs.push({ type: audio.ok ? (audio.skipped ? "skip" : "success") : "error", text: audio.message });
  if (audio.stdout) logs.push({ type: "info", text: audio.stdout });
  if (audio.stderr) logs.push({ type: "error", text: audio.stderr });
  for (const item of config.apps || []) {
    if (!item.enabled) { logs.push({ type: "skip", text: `スキップ: ${item.name}` }); continue; }
    const resolved = resolveTarget(item);
    if (!resolved.ok) { logs.push({ type: "error", text: `${item.name}: ${resolved.reason}` }); continue; }
    try {
      if (resolved.note) logs.push({ type: "info", text: resolved.note });
      await launchTarget(resolved.target, item.args || []);
      logs.push({ type: "success", text: `${item.name} を起動: ${resolved.target}` });
    } catch (error) { logs.push({ type: "error", text: `${item.name} の起動に失敗: ${error.message}` }); continue; }
    const wait = Number(item.waitAfterMs ?? config.launchDelayMs ?? 0);
    if (wait > 0) { logs.push({ type: "info", text: `${Math.round(wait / 100) / 10}秒待機` }); await sleep(wait); }
  }
  logs.push({ type: "info", text: "実行完了" });
  return logs;
});

ipcMain.handle("tools:openToolsFolder", async () => { const dir = chooseWritableToolsPath(); await shell.openPath(dir); return { ok: true, message: `toolsフォルダを開きました: ${dir}` }; });
ipcMain.handle("tools:installSvcl", () => installTool("install_svcl.ps1", "svcl.exe", "SVCL"));
ipcMain.handle("tools:installNirCmd", () => installTool("install_nircmd.ps1", "nircmdc.exe", "NirCmd"));
ipcMain.handle("tools:openSvclPage", async () => { await shell.openExternal("https://www.nirsoft.net/utils/sound_volume_command_line.html"); return { ok: true, message: "SVCL公式ページを開きました。" }; });
ipcMain.handle("tools:openNirCmdPage", async () => { await shell.openExternal("https://www.nirsoft.net/utils/nircmd.html"); return { ok: true, message: "NirCmd公式ページを開きました。" }; });
ipcMain.handle("update:check", (_e, update) => checkUpdate(update || {}));
ipcMain.handle("update:open", async (_e, url) => { const target = String(url || "").trim(); if (!/^https?:\/\//i.test(target)) return { ok: false, message: "開けるURLがありません。" }; await shell.openExternal(target); return { ok: true, message: "配布URLを開きました。" }; });