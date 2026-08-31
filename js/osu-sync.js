(() => {
  const DB = window.OsuDB;
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => Array.from(parent.querySelectorAll(selector));
  const SETTINGS_KEY = 'osuAccount';
  const DEFAULT_TIMEOUT_MS = 15000;

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

  function isLocalHost(hostname) {
    return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(String(hostname || '').toLowerCase());
  }

  function normalizeEndpointUrl(value) {
    const raw = String(value || '').trim().replace(/\/+$/, '');
    if (!raw) throw new Error('Supabase Sync API URLを入力してください。');
    const url = new URL(raw);
    if (url.username || url.password) throw new Error('認証情報を含むAPI URLは使用できません。');
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalHost(url.hostname))) {
      throw new Error('本番Sync API URLはHTTPSを使用してください。');
    }
    url.search = '';
    url.hash = '';
    return url.origin + url.pathname.replace(/\/+$/, '');
  }

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function finiteOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function text(value, max = 500) {
    return String(value ?? '').slice(0, max);
  }

  function safeHttpUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
    } catch {
      return '';
    }
  }

  async function fetchJson(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const retry = payload.retryAfter == null ? '' : ` (${payload.retryAfter}秒後に再試行)`;
        throw new Error(`${payload.error || `Sync API request failed (${response.status})`}${retry}`);
      }
      return payload;
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error(`通信が${Math.round(timeoutMs / 1000)}秒でタイムアウトしました。再試行してください。`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
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
      endpointUrl: saved?.endpointUrl || site?.osuApi?.endpointUrl || '',
      user: saved?.user || '',
      mode: saved?.mode || 'osu',
      limit: number(saved?.limit, site?.osuApi?.syncLimit || 100) || 100,
      includeFails: saved?.includeFails ?? site?.osuApi?.includeFails ?? true,
      requestTimeoutMs: number(site?.osuApi?.requestTimeoutMs, DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
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
      endpointUrl: String($('#endpointUrl').value || '').trim(),
      user: String($('#osuUser').value || '').trim(),
      mode: $('#osuMode').value || 'osu',
      limit: Math.min(100, Math.max(1, number($('#syncLimit').value, 100))),
      includeFails: $('#includeFails').value !== '0',
    };
    if (value.endpointUrl) value.endpointUrl = normalizeEndpointUrl(value.endpointUrl);
    delete value.workerUrl;
    await DB.put('settings', value);
    return value;
  }

  function setStatus(message, type = 'notice') {
    const box = $('#syncStatus');
    box.className = type;
    box.textContent = message;
  }

  async function serviceFetch(settings, body) {
    const endpoint = normalizeEndpointUrl(settings.endpointUrl);
    return fetchJson(endpoint, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(body),
    }, settings.requestTimeoutMs || DEFAULT_TIMEOUT_MS);
  }

  function validateHealth(payload) {
    if (!payload || payload.ok !== true || payload.service !== 'osu-hub-sync' || payload.provider !== 'supabase-edge-function' || typeof payload.configured !== 'boolean') {
      throw new Error('Supabase Sync APIのhealth応答形式が正しくありません。');
    }
    if (payload.configured !== true) {
      throw new Error('osu!同期Tokenが未設定または期限切れです。自動更新Workflowの状態を確認してください。');
    }
    if (payload.browserOAuthRequired !== false) {
      throw new Error('Sync APIがブラウザSecret不要の構成になっていません。');
    }
    return payload;
  }

  function normalizeIncomingScore(score) {
    if (!score || typeof score !== 'object') throw new Error('スコアデータ形式が正しくありません。');
    const osuScoreId = String(score.osuScoreId ?? '').trim();
    if (!/^\d+$/.test(osuScoreId)) throw new Error('osu! Score IDが正しくありません。');
    const accuracy = number(score.accuracy, -1);
    if (accuracy < 0 || accuracy > 100) throw new Error(`Score ${osuScoreId} のAccuracyが不正です。`);
    const miss = number(score.miss, -1);
    if (miss < 0) throw new Error(`Score ${osuScoreId} のMiss数が不正です。`);

    return {
      id: `osu:${osuScoreId}`,
      source: 'osu-api',
      osuScoreId,
      beatmapId: finiteOrNull(score.beatmapId),
      beatmapsetId: finiteOrNull(score.beatmapsetId),
      mapName: text(score.mapName || 'Unknown map', 300),
      artist: text(score.artist, 160),
      title: text(score.title, 200),
      difficulty: text(score.difficulty, 160),
      mapper: text(score.mapper, 120),
      date: text(score.date, 32),
      playedAt: score.playedAt ? text(score.playedAt, 64) : null,
      accuracy,
      miss,
      combo: Math.max(0, number(score.combo)),
      pp: finiteOrNull(score.pp),
      stars: finiteOrNull(score.stars),
      bpm: finiteOrNull(score.bpm),
      ar: finiteOrNull(score.ar),
      od: finiteOrNull(score.od),
      cs: finiteOrNull(score.cs),
      hp: finiteOrNull(score.hp),
      mods: text(score.mods || 'NM', 64),
      rank: text(score.rank, 16),
      passed: Boolean(score.passed),
      hasReplay: Boolean(score.hasReplay),
      totalScore: Math.max(0, number(score.totalScore)),
      coverUrl: safeHttpUrl(score.coverUrl),
      beatmapUrl: safeHttpUrl(score.beatmapUrl),
    };
  }

  function validateSyncPayload(payload) {
    if (!payload || typeof payload !== 'object' || payload.provider !== 'supabase-edge-function' || !Array.isArray(payload.scores) || !payload.user || typeof payload.user !== 'object') {
      throw new Error('Supabase Sync APIの同期応答形式が正しくありません。');
    }
    if (payload.scores.length > 100) throw new Error('Sync APIから上限を超えるスコアが返されました。');
    const userId = Number(payload.user.id);
    if (!Number.isFinite(userId) || userId <= 0 || !String(payload.user.username || '').trim()) {
      throw new Error('Sync APIのユーザー情報が正しくありません。');
    }
    return {
      apiVersion: Number(payload.apiVersion || 0),
      syncedAt: text(payload.syncedAt || new Date().toISOString(), 64),
      user: {
        id: userId,
        username: text(payload.user.username, 64),
        avatarUrl: safeHttpUrl(payload.user.avatarUrl),
        countryCode: text(payload.user.countryCode, 8),
        ruleset: text(payload.user.ruleset, 16),
        pp: finiteOrNull(payload.user.pp),
        globalRank: finiteOrNull(payload.user.globalRank),
        countryRank: finiteOrNull(payload.user.countryRank),
        hitAccuracy: finiteOrNull(payload.user.hitAccuracy),
        playCount: finiteOrNull(payload.user.playCount),
        maximumCombo: finiteOrNull(payload.user.maximumCombo),
      },
      scores: payload.scores.map(normalizeIncomingScore),
    };
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

    for (const score of payload.scores) {
      const previous = byId.get(score.id);
      const row = {
        ...(previous || {}),
        ...score,
        createdAt: previous?.createdAt || score.playedAt || payload.syncedAt || new Date().toISOString(),
        importedAt: new Date().toISOString(),
        note: previous?.note || '',
      };
      await DB.put('results', row);
      if (previous) updated += 1;
      else added += 1;
      byId.set(score.id, row);
    }

    return { added, updated };
  }

  async function testConnection() {
    const button = $('#testService');
    button.disabled = true;
    try {
      const settings = await saveSettings();
      setStatus('Supabase Sync APIへ接続しています…');
      validateHealth(await serviceFetch(settings, { action: 'health' }));
      setStatus('接続OK。osu! API v2の同期Tokenを利用できます。', 'success');
      toast('接続確認に成功しました。');
    } catch (error) {
      setStatus(error.message || '接続確認に失敗しました。', 'notice');
      toast(error.message || '接続確認に失敗しました。', true);
    } finally {
      button.disabled = false;
    }
  }

  async function syncNow() {
    const button = $('#syncNow');
    button.disabled = true;
    try {
      const settings = await saveSettings();
      if (!settings.user) throw new Error('osu! User IDまたはユーザー名を入力してください。');
      setStatus('osu!から最近のプレイを取得しています…');
      const payload = validateSyncPayload(await serviceFetch(settings, {
        action: 'sync',
        user: settings.user,
        mode: settings.mode,
        limit: settings.limit,
        includeFails: settings.includeFails,
      }));
      const counts = await importScores(payload);
      const saved = await saveSettings({
        resolvedUserId: payload.user.id,
        resolvedUsername: payload.user.username,
        lastSyncAt: payload.syncedAt || new Date().toISOString(),
      });

      renderUser(payload.user);
      renderPreview(payload.scores);
      $('#savedAccount').textContent = payload.user.username || settings.user;
      $('#fetchedCount').textContent = payload.scores.length;
      $('#addedCount').textContent = counts.added;
      $('#updatedCount').textContent = counts.updated;
      $('#lastSync').textContent = new Date(saved.lastSyncAt).toLocaleString('ja-JP');
      setStatus(`同期完了: ${payload.scores.length}件取得 / ${counts.added}件追加 / ${counts.updated}件更新`, 'success');
      toast('osu!のリザルトを同期しました。');
    } catch (error) {
      setStatus(error.message || '同期に失敗しました。設定を確認して再試行してください。', 'notice');
      toast(error.message || '同期に失敗しました。', true);
    } finally {
      button.disabled = false;
    }
  }

  async function init() {
    const settings = await getSettings();
    $('#endpointUrl').value = settings.endpointUrl;
    $('#osuUser').value = settings.user;
    $('#osuMode').value = settings.mode;
    $('#syncLimit').value = settings.limit;
    $('#includeFails').value = settings.includeFails ? '1' : '0';
    $('#lastSync').textContent = settings.lastSyncAt ? new Date(settings.lastSyncAt).toLocaleString('ja-JP') : '--';
    $('#savedAccount').textContent = settings.resolvedUsername || settings.user || '--';

    $('#accountForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        await saveSettings();
        toast('Account Sync設定を保存しました。');
      } catch (error) {
        toast(error.message || '設定の保存に失敗しました。', true);
      }
    });
    $('#testService').addEventListener('click', testConnection);
    $('#syncNow').addEventListener('click', syncNow);

    $$('.nav a').forEach((a) => {
      if ((a.getAttribute('href') || '').includes('account.html')) a.classList.add('active');
    });
  }

  init().catch((error) => {
    setStatus(error.message || '初期化に失敗しました。再読み込みしてください。', 'notice');
  });
})();
