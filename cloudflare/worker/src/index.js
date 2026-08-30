let tokenCache = { accessToken: '', expiresAt: 0 };

const API_VERSION = 1;
const OSU_API_VERSION = '20220705';
const RULESETS = new Set(['osu', 'taiko', 'fruits', 'mania']);
const UPSTREAM_TIMEOUT_MS = 12000;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || 'https://elitemay.github.io,http://localhost:8000,http://127.0.0.1:8000')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return {};
  const allowed = allowedOrigins(env);
  if (!allowed.includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function cleanUser(value) {
  const user = String(value || '').trim();
  if (!user || user.length > 64) throw new Error('osu!ユーザー名またはUser IDを指定してください。');
  if (/[/\\?#]/.test(user)) throw new Error('ユーザー名に使用できない文字が含まれています。');
  return user;
}

function safeText(value, max = 300) {
  return String(value ?? '').slice(0, max);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = UPSTREAM_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('osu! APIへの接続がタイムアウトしました。');
      timeoutError.status = 504;
      throw timeoutError;
    }
    const networkError = new Error('osu! APIへ接続できませんでした。');
    networkError.status = 502;
    throw networkError;
  } finally {
    clearTimeout(timer);
  }
}

async function getAccessToken(env, forceRefresh = false) {
  if (!env.OSU_CLIENT_ID || !env.OSU_CLIENT_SECRET) {
    const error = new Error('Cloudflare WorkerにOSU_CLIENT_ID / OSU_CLIENT_SECRETが設定されていません。');
    error.status = 503;
    throw error;
  }

  const now = Date.now();
  if (!forceRefresh && tokenCache.accessToken && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.accessToken;
  }

  const body = new URLSearchParams({
    client_id: String(env.OSU_CLIENT_ID),
    client_secret: String(env.OSU_CLIENT_SECRET),
    grant_type: 'client_credentials',
    scope: 'public',
  });

  const response = await fetchWithTimeout('https://osu.ppy.sh/oauth/token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    const error = new Error(`osu! OAuth認証に失敗しました (${response.status})`);
    error.status = 502;
    throw error;
  }

  tokenCache = {
    accessToken: payload.access_token,
    expiresAt: now + Math.max(60, Number(payload.expires_in || 3600) - 60) * 1000,
  };
  return tokenCache.accessToken;
}

async function osuFetch(env, path, retry = true) {
  const token = await getAccessToken(env);
  const response = await fetchWithTimeout(`https://osu.ppy.sh${path}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'x-api-version': OSU_API_VERSION,
    },
  });

  if (response.status === 401 && retry) {
    tokenCache = { accessToken: '', expiresAt: 0 };
    await getAccessToken(env, true);
    return osuFetch(env, path, false);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error || payload?.message || `osu! API request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status === 404 ? 404 : 502;
    throw error;
  }
  return payload;
}

function modAcronyms(mods) {
  if (!Array.isArray(mods) || mods.length === 0) return 'NM';
  const values = mods
    .map((mod) => (typeof mod === 'string' ? mod : mod?.acronym))
    .filter(Boolean)
    .map((value) => safeText(value, 8));
  return values.length ? values.join('').slice(0, 64) : 'NM';
}

function missCount(statistics) {
  if (!statistics || typeof statistics !== 'object') return 0;
  return Number(statistics.miss ?? statistics.count_miss ?? 0) || 0;
}

function normalizeScore(score) {
  const beatmap = score?.beatmap || {};
  const set = score?.beatmapset || {};
  const difficulty = safeText(beatmap.version || 'Unknown', 160);
  const artist = safeText(set.artist_unicode || set.artist || 'Unknown Artist', 160);
  const title = safeText(set.title_unicode || set.title || 'Unknown Title', 200);
  const mapName = `${artist} - ${title} [${difficulty}]`.slice(0, 500);
  const endedAt = score?.ended_at || score?.created_at || null;
  const scoreId = String(score?.id ?? '').trim();
  if (!/^\d+$/.test(scoreId)) throw new Error('osu! APIから不正なScore IDが返されました。');

  return {
    id: `osu:${scoreId}`,
    source: 'osu-api',
    osuScoreId: scoreId,
    beatmapId: score.beatmap_id ?? beatmap.id ?? null,
    beatmapsetId: set.id ?? beatmap.beatmapset_id ?? null,
    mapName,
    artist,
    title,
    difficulty,
    mapper: safeText(set.creator || '', 120),
    date: endedAt ? String(endedAt).slice(0, 10) : '',
    playedAt: endedAt ? safeText(endedAt, 64) : null,
    accuracy: Number(((Number(score.accuracy || 0)) * 100).toFixed(4)),
    miss: Math.max(0, missCount(score.statistics)),
    combo: Math.max(0, Number(score.max_combo || 0)),
    pp: score.pp == null ? null : Number(score.pp),
    stars: beatmap.difficulty_rating == null ? null : Number(beatmap.difficulty_rating),
    bpm: beatmap.bpm == null ? null : Number(beatmap.bpm),
    ar: beatmap.ar == null ? null : Number(beatmap.ar),
    od: beatmap.accuracy == null ? null : Number(beatmap.accuracy),
    cs: beatmap.cs == null ? null : Number(beatmap.cs),
    hp: beatmap.drain == null ? null : Number(beatmap.drain),
    mods: modAcronyms(score.mods),
    rank: safeText(score.rank || '', 16),
    passed: Boolean(score.passed),
    hasReplay: Boolean(score.has_replay),
    totalScore: Math.max(0, Number(score.total_score ?? score.score ?? 0)),
    coverUrl: safeText(set.covers?.cover || set.covers?.['cover@2x'] || '', 500),
    beatmapUrl: beatmap.id ? `https://osu.ppy.sh/beatmaps/${beatmap.id}` : '',
  };
}

function normalizeUser(user, ruleset) {
  if (!user || !Number.isFinite(Number(user.id)) || !String(user.username || '').trim()) {
    throw new Error('osu! APIから不正なユーザー情報が返されました。');
  }
  const stats = user.statistics || {};
  return {
    id: Number(user.id),
    username: safeText(user.username, 64),
    avatarUrl: safeText(user.avatar_url || '', 500),
    countryCode: safeText(user.country_code || '', 8),
    ruleset,
    pp: stats.pp == null ? null : Number(stats.pp),
    globalRank: stats.global_rank ?? null,
    countryRank: stats.country_rank ?? null,
    hitAccuracy: stats.hit_accuracy == null ? null : Number(stats.hit_accuracy),
    playCount: stats.play_count ?? null,
    maximumCombo: stats.maximum_combo ?? null,
  };
}

async function handleSync(url, env) {
  const userInput = cleanUser(url.searchParams.get('user'));
  const ruleset = String(url.searchParams.get('mode') || 'osu');
  if (!RULESETS.has(ruleset)) throw new Error('未対応のrulesetです。');

  const limit = clampInt(url.searchParams.get('limit'), 1, 100, 100);
  const includeFails = url.searchParams.get('include_fails') !== '0';
  const key = /^\d+$/.test(userInput) ? 'id' : 'username';
  const user = await osuFetch(env, `/api/v2/users/${encodeURIComponent(userInput)}/${ruleset}?key=${key}`);
  const params = new URLSearchParams({
    legacy_only: '0',
    include_fails: includeFails ? '1' : '0',
    mode: ruleset,
    limit: String(limit),
    offset: '0',
  });
  const scores = await osuFetch(env, `/api/v2/users/${user.id}/scores/recent?${params}`);
  if (!Array.isArray(scores)) {
    const error = new Error('osu! APIのRecent Scores応答形式が正しくありません。');
    error.status = 502;
    throw error;
  }

  return {
    apiVersion: API_VERSION,
    syncedAt: new Date().toISOString(),
    user: normalizeUser(user, ruleset),
    scores: scores.slice(0, limit).map(normalizeScore),
  };
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (cors === null) return json({ ok: false, error: 'Origin is not allowed.' }, 403);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors || {} });
    }
    if (request.method !== 'GET') {
      return json({ ok: false, error: 'Method not allowed.' }, 405, cors || {});
    }

    const url = new URL(request.url);
    try {
      if (url.pathname === '/' || url.pathname === '/health') {
        return json({
          ok: true,
          service: 'osu-hub-api',
          apiVersion: API_VERSION,
          configured: Boolean(env.OSU_CLIENT_ID && env.OSU_CLIENT_SECRET),
        }, 200, cors || {});
      }

      if (url.pathname === '/api/sync') {
        const payload = await handleSync(url, env);
        return json(payload, 200, cors || {});
      }

      return json({ ok: false, error: 'Not found.' }, 404, cors || {});
    } catch (error) {
      return json({
        ok: false,
        error: error?.message || 'Unexpected error.',
      }, Number(error?.status) || 400, cors || {});
    }
  },
};
