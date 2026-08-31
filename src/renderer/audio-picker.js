const audioPicker = (() => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const canonical = (value) => String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[¥￥]/g, "\\")
    .replace(/\//g, "\\")
    .replace(/\\+/g, "\\");

  function providerFromId(value) {
    const normalized = String(value || "").replace(/[¥￥]/g, "\\");
    const match = normalized.match(/^(.*?)\\Device\\/i);
    return match?.[1]?.trim() || "";
  }

  function parseDeviceLogs(logs) {
    return (Array.isArray(logs) ? logs : []).flatMap((log) => {
      const text = String(log?.text || "");
      const match = text.match(/^(.+?) \| ID: (.+?) \| State: (.*)$/);
      if (!match) return [];
      const name = match[1].trim();
      const id = match[2].trim();
      const state = match[3].trim();
      if (!name || !id || id === "(no id)") return [];
      return [{ name, id, state, isDefault: log?.type === "success" }];
    });
  }

  function optionLabel(item) {
    const provider = providerFromId(item.id);
    const base = provider && canonical(provider) !== canonical(item.name)
      ? `${item.name} (${provider})`
      : item.name;
    if (item.isDefault) return `${base} — 現在の既定`;
    if (/^active$/i.test(item.state)) return `${base} — 使用可能`;
    return item.state ? `${base} — ${item.state}` : base;
  }

  function currentAudioSwitch() {
    return {
      enabled: !!document.querySelector("#audioEnabled")?.checked,
      mode: document.querySelector("#audioMode")?.value || "svcl",
      deviceName: document.querySelector("#audioDeviceName")?.value || "",
      svclPath: document.querySelector("#audioSvclPath")?.value || "tools\\svcl.exe",
      nircmdPath: document.querySelector("#audioNirCmdPath")?.value || "tools\\nircmdc.exe",
      scriptPath: document.querySelector("#audioScriptPath")?.value || "tools\\switch_audio_device.ps1"
    };
  }

  function setStatus(text, kind = "info") {
    const status = document.querySelector("#audioDevicePickerStatus");
    if (!status) return;
    status.textContent = text;
    status.dataset.kind = kind;
  }

  function selectCurrentOption(select, items) {
    const manual = document.querySelector("#audioDeviceName");
    const current = manual?.value || "";
    const currentKey = canonical(current);
    let match = items.find((item) => canonical(item.id) === currentKey);
    if (!match && currentKey) {
      const byName = items.filter((item) => canonical(item.name) === currentKey);
      if (byName.length === 1) match = byName[0];
    }
    select.value = match?.id || "";
    return match;
  }

  async function refresh({ announce = false } = {}) {
    const select = document.querySelector("#audioDeviceSelect");
    const refreshButton = document.querySelector("#audioRefreshButton");
    if (!select || !window.osuLauncher?.listAudioDevices) return;

    select.disabled = true;
    if (refreshButton) refreshButton.disabled = true;
    select.innerHTML = '<option value="">再生デバイスを検出中...</option>';
    setStatus("Windowsの再生デバイスを確認しています。", "info");

    try {
      const logs = await window.osuLauncher.listAudioDevices(currentAudioSwitch());
      const items = parseDeviceLogs(logs)
        .filter((item, index, array) => array.findIndex((other) => canonical(other.id) === canonical(item.id)) === index)
        .sort((a, b) => Number(b.isDefault) - Number(a.isDefault)
          || Number(/^active$/i.test(b.state)) - Number(/^active$/i.test(a.state))
          || a.name.localeCompare(b.name, "ja"));

      select.innerHTML = '<option value="">再生デバイスを選択</option>';
      for (const item of items) {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = optionLabel(item);
        select.appendChild(option);
      }

      if (!items.length) {
        select.innerHTML = '<option value="">再生デバイスを検出できませんでした</option>';
        setStatus("SVCLを取得してから再検出してください。", "error");
        return;
      }

      const matched = selectCurrentOption(select, items);
      select.disabled = false;
      if (matched) {
        setStatus(`保存中の切替先: ${optionLabel(matched)}`, "success");
      } else {
        setStatus(`${items.length}件検出しました。一覧から切替先を選んでください。`, "info");
      }

      if (announce && typeof renderLogs === "function") {
        renderLogs([{ type: "success", text: `再生デバイスを${items.length}件検出しました。切替先を一覧から選べます。` }]);
      }
    } catch (error) {
      select.innerHTML = '<option value="">再生デバイスの取得に失敗しました</option>';
      setStatus(`取得失敗: ${error.message}`, "error");
    } finally {
      if (refreshButton) refreshButton.disabled = false;
    }
  }

  function bind() {
    const select = document.querySelector("#audioDeviceSelect");
    const refreshButton = document.querySelector("#audioRefreshButton");
    const manual = document.querySelector("#audioDeviceName");
    const saveButton = document.querySelector("#saveButton");
    if (!select || !manual) return false;

    select.addEventListener("change", () => {
      if (!select.value) return;
      manual.value = select.value;
      manual.dispatchEvent(new Event("input", { bubbles: true }));
      setStatus(`選択中: ${select.options[select.selectedIndex]?.textContent || select.value}`, "success");
      saveButton?.click();
    });

    manual.addEventListener("input", () => {
      const wanted = canonical(manual.value);
      const exact = Array.from(select.options).find((option) => canonical(option.value) === wanted);
      select.value = exact?.value || "";
    });

    refreshButton?.addEventListener("click", () => refresh({ announce: true }));
    return true;
  }

  async function init() {
    for (let i = 0; i < 50; i += 1) {
      const ready = document.querySelector("#audioSvclPath")?.value && document.querySelector("#saveButton");
      if (ready) break;
      await sleep(100);
    }
    if (!bind()) return;
    await refresh();
  }

  return { init, refresh };
})();

audioPicker.init();
