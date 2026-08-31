function canonicalDeviceId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[¥￥]/g, "\\")
    .replace(/\//g, "\\")
    .replace(/\\+/g, "\\");
}

function matchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[¥￥]/g, "\\")
    .replace(/[（）()\[\]{}\\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isActiveState(value) {
  return /^active$/i.test(String(value || "").trim());
}

function stateBonus(item) {
  const state = String(item?.state || "").trim().toLowerCase();
  if (state === "active") return 12;
  if (state === "disabled") return -4;
  if (state === "unplugged" || state === "notpresent" || state === "not present") return -8;
  return 0;
}

function isSvclEndpointDevice(item) {
  if (!item) return false;
  const name = String(item.name || "");
  const id = String(item.id || "");
  const itemId = String(item.itemId || "");
  const direction = String(item.direction || "");
  const type = String(item.type || "");
  const idText = canonicalDeviceId(`${id} ${itemId}`);
  const allText = `${name} ${id} ${itemId} ${direction} ${type}`.toLowerCase();

  // SVCL mixes actual endpoints with per-application audio sessions. Never allow
  // Application rows to become a Windows default playback target.
  if (/\\application\\/i.test(idText) || /(^|\s)application($|\s)/i.test(type)) return false;

  const render = /render|speaker|headphone|earphone|headset|スピーカー|ヘッドホン|イヤホン|再生/.test(allText);
  const capture = /capture|microphone|mic\b|マイク|録音/.test(allText);
  if (!(name || id || itemId) || !render || capture) return false;

  const endpointPath = /\\device\\/i.test(idText) && /\\render\b/i.test(idText);
  const endpointType = /(^|\s)device($|\s)/i.test(type);
  const renderDirection = /render|再生/i.test(direction);

  // Some SVCL versions/providers leave Type blank or use a nonstandard label.
  // Once Application sessions and Capture rows are excluded, a Render row with
  // an endpoint-like ID is safe to keep as a candidate.
  return Boolean(endpointPath || endpointType || renderDirection);
}

function scoreItem(item, target) {
  if (!isSvclEndpointDevice(item)) return 0;

  const rawTarget = canonicalDeviceId(target);
  const rawId = canonicalDeviceId(item.id);
  const rawItemId = canonicalDeviceId(item.itemId);
  const rawName = canonicalDeviceId(item.name);
  if (!rawTarget) return 0;
  if (rawTarget.includes("\\application\\")) return 0;

  const bonus = stateBonus(item);
  if (rawId && rawId === rawTarget) return 300 + bonus;
  if (rawItemId && rawItemId === rawTarget) return 295 + bonus;
  if (rawName && rawName === rawTarget) return 280 + bonus;

  const targetLooksLikeEndpointId = /\\device\\/i.test(rawTarget) || /\\render$/i.test(rawTarget);
  if (targetLooksLikeEndpointId) {
    if ((rawId && rawId.includes(rawTarget)) || (rawItemId && rawItemId.includes(rawTarget))) return 250 + bonus;
    return 0;
  }

  const normalizedTarget = matchText(target);
  const name = matchText(item.name);
  const id = matchText(item.id);
  const itemId = matchText(item.itemId);
  if (!normalizedTarget) return 0;

  if (id === normalizedTarget) return 260 + bonus;
  if (itemId === normalizedTarget) return 255 + bonus;
  if (name === normalizedTarget) return 245 + bonus;
  if ((id && id.includes(normalizedTarget)) || (itemId && itemId.includes(normalizedTarget))) return 180 + bonus;
  if ((name && name.includes(normalizedTarget)) || (name && normalizedTarget.includes(name))) return 165 + bonus;

  const stopWords = new Set(["device", "render", "audio"]);
  const tokens = normalizedTarget.split(" ").filter((value) => value.length >= 2 && !stopWords.has(value));
  if (tokens.length < 2) return 0;
  const haystack = `${name} ${id} ${itemId}`;
  return tokens.every((value) => haystack.includes(value)) ? 120 + bonus : 0;
}

function candidateKey(item) {
  return canonicalDeviceId(item?.id || item?.itemId || item?.name);
}

function chooseSvclDevice(items, target) {
  const ranked = (Array.isArray(items) ? items : [])
    .filter(isSvclEndpointDevice)
    .map((item) => ({ item, score: scoreItem(item, target) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || Number(isActiveState(b.item.state)) - Number(isActiveState(a.item.state)) || candidateKey(a.item).localeCompare(candidateKey(b.item)));

  if (!ranked.length) return { ok: false, reason: "not-found", ranked: [] };

  const best = ranked[0];
  const second = ranked[1];
  if (second && best.score === second.score && candidateKey(best.item) !== candidateKey(second.item)) {
    return { ok: false, reason: "ambiguous", ranked: ranked.slice(0, 8) };
  }

  return { ok: true, item: best.item, score: best.score, ranked: ranked.slice(0, 8) };
}

module.exports = {
  canonicalDeviceId,
  matchText,
  isSvclEndpointDevice,
  scoreItem,
  chooseSvclDevice
};
