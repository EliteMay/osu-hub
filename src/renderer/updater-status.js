(() => {
  const api = window.osuLauncher;
  const button = document.getElementById("openUpdateButton");
  const quickLogList = document.getElementById("quickLogList");
  if (!api?.onUpdateStatus || !button) return;

  let lastMessage = "";

  function addQuickStatus(text, type = "info") {
    const value = String(text || "").trim();
    if (!value || value === lastMessage || !quickLogList) return;
    lastMessage = value;
    const item = document.createElement("div");
    item.className = `quick-log-item ${type}`;
    item.textContent = value;
    quickLogList.prepend(item);
    while (quickLogList.children.length > 8) quickLogList.lastElementChild?.remove();
  }

  function updateButton(status) {
    const state = String(status?.state || "");
    const version = String(status?.latestVersion || "");
    const progress = Number(status?.progress || 0);

    if (state === "available") {
      button.disabled = false;
      button.textContent = version ? `v${version}へ今すぐ更新` : "今すぐ更新";
      addQuickStatus(status.message || "新しいバージョンがあります。", "success");
      return;
    }

    if (state === "downloading") {
      button.disabled = true;
      button.textContent = `更新をダウンロード中 ${Math.round(progress)}%`;
      addQuickStatus(status.message, "info");
      return;
    }

    if (state === "downloaded" || state === "installing") {
      button.disabled = true;
      button.textContent = "再起動して更新中";
      addQuickStatus(status.message || "更新を適用しています。", "success");
      return;
    }

    if (state === "current") {
      button.disabled = true;
      button.textContent = "最新版です";
      addQuickStatus(status.message || "最新版です。", "success");
      return;
    }

    if (state === "checking") {
      button.disabled = true;
      button.textContent = "更新を確認中";
      return;
    }

    if (state === "error") {
      button.disabled = false;
      button.textContent = "Releaseページを開く";
      addQuickStatus(status.message || "更新確認に失敗しました。", "error");
    }
  }

  api.onUpdateStatus(updateButton);
})();
