(() => {
  const DB = window.OsuDB;
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => Array.from(parent.querySelectorAll(selector));
  const SETTINGS_KEY = 'osuAccount';

  const esc = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));

  function toast(message, error = false) {
    const el = document.createElement('div');
    el.className = `toast${error ? ' error' : ''}`;
    el.textContent = message;
    document.body.append(el);
    setTimeout(() => el.remove(), 3000);
  }

  function normalizeWorkerUrl(value) {
    const raw = String(value || '').trim().replace(/\/+$/, '');
    if (!raw) throw new Error('Cloudflare Worker URLを入力してください。');
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Worker URLが正しくありません。');
    return url.origin + url.pathname.replace(/\/+$/, '');
  }

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  async function loadSiteDefaults() {
    try {
      const response = await fetch('../data/site.json', { cache: 'no-store' });
      if (!response.ok) return {};
      return await response.json();
    } catch {
      return {};
    }
  }

  async function getSettings() {
    const [saved, site] = await Promise.all([
      DB.get('settings', SETTINGS_KEY),
      loadSiteDefaults(),
    ]);
    return {
      key: SETTINGS_KEY,
      workerUrl: saved?.workerUrl || site?.osuApi?.workerUrl || '',
      user: saved?.user || '',
      mode: saved?.mode || 'osu',
      limit: number(saved?.limit, 100) || 100,
      includeFails: saved?.includeFails !== false,
      resolvedUserId: saved?.resolvedUserId || '',
      resolvedUsername: saved?.resolvedUsername || '',
      lastSyncAt: saved?.lastSyncAt || '',
    };
  }

  async function saveSettings(extra = {}) {
    const current = await getSettings();
    const value = {
      ...current,
      ...extra,
      key: SETTINGS_KEY,
      workerUrl: String($('#workerUrl').value || '').trim(),
      user: String($('#osuUser').value || '').trim(),
      mode: $('#osuMode').value || 'osu',
      limit: Math.min(100, Math.max(1, number($('#syncLimit').value, 100))),
      includeFails: $('#includeFails').value !== '0',
    };
    await DB.put('settings', value);
    return value;
  }

  function setStatus(message, type = 'notice') {
    const box = $('#syncStatus');
    box.className = type;
    box.textContent = message;
  }

  async function workerFetch(settings, path) {
    const base = normalizeWorkerUrl(settings.workerUrl);
    const response = await fetch(`${base}${path}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Worker request failed (${response.status})`);
    return payload;
  }

  function renderUser(user) {
    $('#accountName').textContent = user?.username || '--';
    $('#accountPp').textContent = user?.pp == null ? '--' : `${number(user.pp).toFixed(1)}pp`;
    $('#accountRank').textContent = user?.globalRank ? `#${Number(user.globalRank).toLocaleString()}` : '--';
    $('#accountAcc').textContent = user?.hitAccuracy == null ? '--' : `${number(user.hitAccuracy).toFixed(2)}%`;
    const avatar = $('#accountAvatar');
    if (user?.avatarUrl) {
      avatar.src = user.avatarUrl;
      avatar.classList.remove('hidden');
    } else {
      avatar.removeAttribute('src');
      avatar.classList.add('hidden');
    }
  }

  function renderPreview(scores) {
    const host = $('#syncPreview');
    if (!scores.length) {
      host.className = 'list-empty';
      host.textContent = '取得したリザルトはありません。';
      return;
    }
    host.className = 'data-list';
    host.innerHTML = scores.slice(0, 20).map((score) => `
      <div class="data-row">
        <div>
          <div class="primary-text">${esc(score.mapName || 'Unknown map')}</div>
          <small>${esc(score.mods || 'NM')} · ${number(score.bpm) || '--'} BPM · ${score.passed ? 'PASS' : 'FAIL'}</small>
        </div>
        <div class="stat">${number(score.accuracy).toFixed(2)}%</div>
        <div class="stat">${number(score.miss)} miss</div>
        <div class="stat">${score.pp == null ? '--' : `${number(score.pp).toFixed(1)}pp`}</div>
        <div class="stat">${score.stars == null ? '--' : `${number(score.stars).toFixed(2)}★`}</div>
        <span>${esc(score.rank || '')}</span>
      </div>
    `).join('');
  }

  async function importScores(payload) {
    const current = await DB.getAll('results');
    const byId = new Map(current.map((row) => [String(row.id), row]));
    let added = 0;
    let updated = 0;

    for (const score of payload.scores || []) {
      const id = String(score.id || `osu:${score.osuScoreId}`);
      const previous = byId.get(id);
      const row = {
        ...(previous || {}),
        ...score,
        id,
        createdAt: previous?.createdAt || score.playedAt || payload.syncedAt || new Date().toISOString(),
        importedAt: new Date().toISOString(),
        note: previous?.note || '',
      };
      await DB.put('results', row);
      if (previous) updated += 1;
      else added += 1;
      byId.set(id, row);
    }

    return { added, updated };
  }

  async function testConnection() {
    try {
      const settings = await saveSettings();
      setStatus('Cloudflare Workerへ接続しています…');
      const health = await workerFetch(settings, '/health');
      if (!health.configured) throw new Error('Workerは動いていますが、osu! Client ID / Secretが未設定です。');
      setStatus('Worker接続OK。osu! API用Secretも設定されています。', 'success');
      toast('接続確認に成功しました。');
    } catch (error) {
      setStatus(error.message || '接続確認に失敗しました。', 'notice');
      toast(error.message || '接続確認に失敗しました。', true);
    }
  }

  async function syncNow() {
    const button = $('#syncNow');
    button.disabled = true;
    try {
      const settings = await saveSettings();
      if (!settings.user) throw new Error('osu! User IDまたはユーザー名を入力してください。');
      setStatus('osu! APIから最近のプレイを取得しています…');
      const params = new URLSearchParams({
        user: settings.user,
        mode: settings.mode,
        limit: String(settings.limit),
        include_fails: settings.includeFails ? '1' : '0',
      });
      const payload = await workerFetch(settings, `/api/sync?${params}`);
      if (!Array.isArray(payload.scores)) throw new Error('Workerの返却形式が正しくありません。');

      const counts = await importScores(payload);
      const saved = await saveSettings({
        resolvedUserId: payload.user?.id || '',
        resolvedUsername: payload.user?.username || '',
        lastSyncAt: payload.syncedAt || new Date().toISOString(),
      });

      renderUser(payload.user);
      renderPreview(payload.scores);
      $('#savedAccount').textContent = payload.user?.username || settings.user;
      $('#fetchedCount').textContent = payload.scores.length;
      $('#addedCount').textContent = counts.added;
      $('#updatedCount').textContent = counts.updated;
      $('#lastSync').textContent = new Date(saved.lastSyncAt).toLocaleString('ja-JP');
      setStatus(`同期完了: ${payload.scores.length}件取得 / ${counts.added}件追加 / ${counts.updated}件更新`, 'success');
      toast('osu!のリザルトを同期しました。');
    } catch (error) {
      setStatus(error.message || '同期に失敗しました。', 'notice');
      toast(error.message || '同期に失敗しました。', true);
    } finally {
      button.disabled = false;
    }
  }

  async function init() {
    const settings = await getSettings();
    $('#workerUrl').value = settings.workerUrl;
    $('#osuUser').value = settings.user;
    $('#osuMode').value = settings.mode;
    $('#syncLimit').value = settings.limit;
    $('#includeFails').value = settings.includeFails ? '1' : '0';
    $('#lastSync').textContent = settings.lastSyncAt ? new Date(settings.lastSyncAt).toLocaleString('ja-JP') : '--';
    $('#savedAccount').textContent = settings.resolvedUsername || settings.user || '--';

    $('#accountForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      await saveSettings();
      toast('Account Sync設定を保存しました。');
    });
    $('#testWorker').addEventListener('click', testConnection);
    $('#syncNow').addEventListener('click', syncNow);

    $$('.nav a').forEach((a) => {
      if ((a.getAttribute('href') || '').includes('account.html')) a.classList.add('active');
    });
  }

  init().catch((error) => {
    setStatus(error.message || '初期化に失敗しました。', 'notice');
  });
})();
